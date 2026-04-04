"""
Integration tests for the Agentic Commerce control plane.
Covers the full lifecycle and the critical failure/edge paths.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import pytest

logging.disable(logging.CRITICAL)


@pytest.fixture(autouse=True)
def _reset():
    """Reset all in-memory stores and service singletons between tests."""
    from services.x402 import (
        commerce_store as cs,
        idempotency as idem,
        control_plane as cp,
        resources as res,
        facilitators as fac,
        approvals as apv,
        verification as ver,
        settlement as stl,
        entitlements as ent,
        policies as pol,
    )
    cs.reset_commerce_store()
    idem.reset_idempotency_store()
    cp.reset_control_plane()
    # Reset service singletons so they pick up the new store
    res._registry = None
    fac._facilitator_registry = None
    fac._asset_registry = None
    apv._service = None
    ver._engine = None
    stl._tracker = None
    ent._service = None
    pol._engine = None
    yield


async def _seed(tenant: str = "tenant_test"):
    from services.x402.resources import seed_aether_native_resources
    from services.x402.facilitators import seed_facilitators_and_assets

    resources = await seed_aether_native_resources(tenant)
    await seed_facilitators_and_assets(tenant)
    return resources


@pytest.mark.asyncio
async def test_full_lifecycle_happy_path():
    from services.x402.control_plane import get_control_plane

    tenant = "t_happy"
    resources = await _seed(tenant)
    plane = get_control_plane()
    r = resources[0]

    challenge = await plane.issue_challenge(
        tenant_id=tenant,
        resource_id=r.resource_id,
        requester_id="agent_1",
        chain="eip155:8453",
        asset_symbol="USDC",
    )
    assert challenge.amount_usd == r.price_usd
    assert challenge.protocol_version == "v2"

    approval, decision = await plane.request_approval(
        tenant_id=tenant, challenge_id=challenge.challenge_id, reason="e2e test"
    )
    assert decision.requires_approval is True  # Day-1 GA

    decided = await plane.apply_decision(
        tenant_id=tenant,
        approval_id=approval.approval_id,
        action="approve",
        decided_by="ops_alice",
        reason="ok",
    )
    assert decided.status.value == "approved"

    auth = await plane.authorize_payment(tenant, approval.approval_id, "0xpayer")
    assert auth.facilitator_id

    result = await plane.verify_and_settle(tenant, auth.authorization_id, "0x" + "a" * 64)
    assert result["verified"] is True
    assert result["entitlement_id"]

    grant = await plane.grant_access(tenant, result["entitlement_id"])
    assert grant["status"] == "granted"

    trace = await plane.explain(tenant, challenge.challenge_id)
    assert trace.requirement and trace.policy_decision and trace.approval
    assert trace.receipt and trace.settlement and trace.entitlement
    assert trace.grant and trace.fulfillment
    assert len(trace.graph_writes) >= 8


@pytest.mark.asyncio
async def test_mandatory_approval_for_every_spend_class():
    """Day-1 GA: every resource class requires approval, no exceptions."""
    from services.x402.control_plane import get_control_plane

    tenant = "t_mand"
    resources = await _seed(tenant)
    plane = get_control_plane()

    seen_classes = set()
    for r in resources:
        challenge = await plane.issue_challenge(
            tenant_id=tenant, resource_id=r.resource_id, requester_id="agent_1"
        )
        _, decision = await plane.request_approval(tenant, challenge.challenge_id)
        assert decision.requires_approval is True, f"Approval not required for {r.resource_class}"
        seen_classes.add(r.resource_class.value)

    assert "api" in seen_classes
    assert "agent_tool" in seen_classes
    assert "priced_endpoint" in seen_classes
    assert "service_plan" in seen_classes
    assert "internal_capability" in seen_classes


@pytest.mark.asyncio
async def test_approval_reject_blocks_authorization():
    from services.x402.control_plane import ControlPlaneError, get_control_plane

    tenant = "t_reject"
    resources = await _seed(tenant)
    plane = get_control_plane()

    challenge = await plane.issue_challenge(tenant, resources[0].resource_id, "agent_1")
    approval, _ = await plane.request_approval(tenant, challenge.challenge_id)
    await plane.apply_decision(
        tenant, approval.approval_id, "reject", "ops_bob", "too risky"
    )

    with pytest.raises(ControlPlaneError) as exc:
        await plane.authorize_payment(tenant, approval.approval_id, "0xpayer")
    assert exc.value.code == "APPROVAL_NOT_APPROVED"


@pytest.mark.asyncio
async def test_unsupported_asset_denied_at_challenge():
    from services.x402.control_plane import ControlPlaneError, get_control_plane

    tenant = "t_unsupp"
    resources = await _seed(tenant)
    plane = get_control_plane()

    with pytest.raises(ControlPlaneError) as exc:
        await plane.issue_challenge(
            tenant, resources[0].resource_id, "agent_1", asset_symbol="DOGE"
        )
    assert exc.value.code == "UNSUPPORTED_ASSET"


@pytest.mark.asyncio
async def test_idempotency_on_payment_identifier():
    from services.x402.control_plane import get_control_plane

    tenant = "t_idem"
    resources = await _seed(tenant)
    plane = get_control_plane()

    challenge = await plane.issue_challenge(tenant, resources[0].resource_id, "agent_1")
    approval, _ = await plane.request_approval(tenant, challenge.challenge_id)
    await plane.apply_decision(tenant, approval.approval_id, "approve", "ops", "ok")
    auth = await plane.authorize_payment(tenant, approval.approval_id, "0xpayer")

    r1 = await plane.verify_and_settle(tenant, auth.authorization_id, "0x" + "a" * 64)
    r2 = await plane.verify_and_settle(tenant, auth.authorization_id, "0x" + "a" * 64)
    assert r1["entitlement_id"] == r2["entitlement_id"]


@pytest.mark.asyncio
async def test_cross_tenant_isolation():
    from services.x402.control_plane import get_control_plane

    resources_a = await _seed("tenant_a")
    resources_b = await _seed("tenant_b")
    plane = get_control_plane()

    challenge_a = await plane.issue_challenge(
        "tenant_a", resources_a[0].resource_id, "agent_a"
    )
    # tenant_b cannot see tenant_a's challenge
    trace = await plane.explain("tenant_b", challenge_a.challenge_id)
    assert trace.requirement is None


@pytest.mark.asyncio
async def test_entitlement_reuse_via_preflight():
    from services.x402.control_plane import get_control_plane

    tenant = "t_reuse"
    resources = await _seed(tenant)
    plane = get_control_plane()
    r = resources[0]

    # No entitlement yet
    pre = await plane.preflight(tenant, "agent_1", r.resource_id)
    assert pre.can_access is False
    assert pre.reason == "payment_required"

    # Full flow
    challenge = await plane.issue_challenge(tenant, r.resource_id, "agent_1")
    approval, _ = await plane.request_approval(tenant, challenge.challenge_id)
    await plane.apply_decision(tenant, approval.approval_id, "approve", "ops", "ok")
    auth = await plane.authorize_payment(tenant, approval.approval_id, "0xpayer")
    result = await plane.verify_and_settle(tenant, auth.authorization_id, "0x" + "b" * 64)

    # Now entitlement exists
    pre2 = await plane.preflight(tenant, "agent_1", r.resource_id)
    assert pre2.can_access is True
    assert pre2.reason == "active_entitlement"
    assert pre2.existing_entitlement_id == result["entitlement_id"]


@pytest.mark.asyncio
async def test_malformed_tx_hash_fails_verification():
    from services.x402.control_plane import get_control_plane

    tenant = "t_bad_tx"
    resources = await _seed(tenant)
    plane = get_control_plane()

    challenge = await plane.issue_challenge(tenant, resources[0].resource_id, "agent_1")
    approval, _ = await plane.request_approval(tenant, challenge.challenge_id)
    await plane.apply_decision(tenant, approval.approval_id, "approve", "ops", "ok")
    auth = await plane.authorize_payment(tenant, approval.approval_id, "0xpayer")

    result = await plane.verify_and_settle(tenant, auth.authorization_id, "not-a-hash")
    assert result["verified"] is False
    assert "tx_hash" in result.get("error", "").lower()


@pytest.mark.asyncio
async def test_approval_revoke_after_approval():
    from services.x402.approvals import get_approval_service
    from services.x402.control_plane import get_control_plane

    tenant = "t_revoke"
    resources = await _seed(tenant)
    plane = get_control_plane()

    challenge = await plane.issue_challenge(tenant, resources[0].resource_id, "agent_1")
    approval, _ = await plane.request_approval(tenant, challenge.challenge_id)
    await plane.apply_decision(tenant, approval.approval_id, "approve", "ops", "ok")

    svc = get_approval_service()
    revoked = await svc.revoke(tenant, approval.approval_id, "admin", "rollback")
    assert revoked.status.value == "revoked"


@pytest.mark.asyncio
async def test_resource_seed_idempotent():
    from services.x402.resources import seed_aether_native_resources

    r1 = await seed_aether_native_resources("tenant_seed")
    r2 = await seed_aether_native_resources("tenant_seed")
    assert len(r1) == 7
    assert len(r2) == 0  # already seeded


@pytest.mark.asyncio
async def test_policy_denial_on_unsupported_chain():
    """Policy engine denies challenge for chain the resource doesn't accept."""
    from services.x402.control_plane import get_control_plane
    from services.x402.resources import ProtectedResource, ResourceClass, get_resource_registry

    tenant = "t_chain"
    await _seed(tenant)
    plane = get_control_plane()
    registry = get_resource_registry()

    # Register a resource that only accepts Base
    only_base = ProtectedResource(
        tenant_id=tenant,
        name="Base-only resource",
        resource_class=ResourceClass.API,
        path_pattern="/v1/base-only",
        owner_service="test",
        description="",
        price_usd=0.10,
        accepted_assets=["USDC"],
        accepted_chains=["eip155:8453"],
        approval_required=True,
        entitlement_ttl_seconds=300,
    )
    await registry.register(only_base)

    # Challenge on Solana should fail
    from services.x402.control_plane import ControlPlaneError

    with pytest.raises(ControlPlaneError) as exc:
        await plane.issue_challenge(
            tenant, only_base.resource_id, "agent_1", chain="solana:mainnet"
        )
    assert exc.value.code == "UNSUPPORTED_NETWORK"
