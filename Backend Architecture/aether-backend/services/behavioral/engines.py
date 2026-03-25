"""
Behavioral Signal Engines — compute derived signals from existing data.

Each engine reads from existing repositories/services and produces
signal observations with provenance, confidence, and explanations.
"""

from __future__ import annotations

import hashlib
import uuid
from typing import Any, Optional

from repositories.repos import BaseRepository, AnalyticsRepository
from repositories.lake import silver_identity, silver_onchain, silver_social, gold_identity
from shared.graph.graph import GraphClient, VertexType
from shared.cache.cache import CacheClient, TTL
from shared.common.common import utc_now
from shared.logger.logger import get_logger, metrics
from services.behavioral.signals import SignalFamily

logger = get_logger("aether.behavioral.engines")


class SignalObservationRepository(BaseRepository):
    """Stores derived behavioral signal observations."""

    def __init__(self) -> None:
        super().__init__("behavioral_signals")

    async def get_signals_for_entity(
        self, entity_id: str, family: Optional[str] = None, limit: int = 50,
    ) -> list[dict]:
        filters: dict = {"entity_id": entity_id}
        if family:
            filters["signal_family"] = family
        return await self.find_many(filters=filters, limit=limit, sort_by="created_at", sort_order="desc")


signal_repo = SignalObservationRepository()


def _make_signal(
    entity_id: str,
    family: SignalFamily,
    outputs: dict,
    explanation: str,
    confidence: float = 0.5,
    source_events: Optional[list[str]] = None,
    session_id: str = "",
    tenant_id: str = "",
    source_tag: str = "",
) -> dict:
    """Create a canonical signal observation record."""
    now = utc_now().isoformat()
    return {
        "id": str(uuid.uuid4()),
        "entity_id": entity_id,
        "signal_family": family.value,
        "outputs": outputs,
        "explanation": explanation,
        "confidence": confidence,
        "source_events": source_events or [],
        "session_id": session_id,
        "tenant_id": tenant_id,
        "source_tag": source_tag or "behavioral_engine",
        "created_at": now,
        "updated_at": now,
    }


# ═══════════════════════════════════════════════════════════════════
# PHASE 1 ENGINES
# ═══════════════════════════════════════════════════════════════════

async def compute_intent_residue(
    entity_id: str,
    analytics: AnalyticsRepository,
    tenant_id: str = "",
) -> Optional[dict]:
    """Detect unfinished high-intent flows across sessions."""
    events = await analytics.query_events(tenant_id, {"user_id": entity_id}, limit=200)
    if not events:
        return None

    # Find high-intent events (page views of pricing, checkout, wallet-connect pages)
    high_intent_keywords = {"checkout", "pricing", "swap", "stake", "bridge", "claim", "connect", "mint", "buy"}
    high_intent_events = [e for e in events if any(k in str(e.get("properties", {})).lower() for k in high_intent_keywords)]

    conversions = [e for e in events if e.get("event_type") == "conversion"]
    wallet_connects = [e for e in events if e.get("event_type") == "wallet"]

    if not high_intent_events:
        return None

    # Score: high intent without conversion = residue
    intent_count = len(high_intent_events)
    conversion_count = len(conversions)
    residue_score = min(1.0, max(0.0, (intent_count - conversion_count * 3) / max(intent_count, 1)))

    if residue_score < 0.1:
        return None

    last_intent = high_intent_events[0]
    signal = _make_signal(
        entity_id=entity_id,
        family=SignalFamily.INTENT_RESIDUE,
        outputs={
            "intent_residue_score": round(residue_score, 4),
            "unfinished_flow_type": "high_intent_no_conversion",
            "last_high_intent_step": str(last_intent.get("properties", {}).get("url", ""))[:100],
            "return_to_intent_probability": round(min(0.9, residue_score * 0.8), 4),
            "high_intent_events": intent_count,
            "conversions": conversion_count,
        },
        explanation=f"Entity showed {intent_count} high-intent events but only {conversion_count} conversions. Residue score: {residue_score:.2f}",
        confidence=min(0.9, 0.3 + residue_score * 0.5),
        tenant_id=tenant_id,
    )
    await signal_repo.insert(signal["id"], signal)
    metrics.increment("behavioral_signal_computed", labels={"family": "intent_residue"})
    return signal


async def compute_wallet_friction(
    entity_id: str,
    analytics: AnalyticsRepository,
    tenant_id: str = "",
) -> Optional[dict]:
    """Detect wallet-connect friction patterns."""
    events = await analytics.query_events(tenant_id, {"user_id": entity_id}, limit=200)
    if not events:
        return None

    wallet_events = [e for e in events if e.get("event_type") in ("wallet", "error")]
    if not wallet_events:
        return None

    connect_attempts = len([e for e in wallet_events if "connect" in str(e.get("properties", {})).lower()])
    errors = len([e for e in wallet_events if e.get("event_type") == "error"])
    successful_connects = len([e for e in wallet_events if e.get("event_type") == "wallet" and "connect" in str(e.get("properties", {})).lower()])

    if connect_attempts < 2:
        return None

    friction_score = min(1.0, errors / max(connect_attempts, 1))

    signal = _make_signal(
        entity_id=entity_id,
        family=SignalFamily.WALLET_FRICTION,
        outputs={
            "wallet_connect_attempt_count": connect_attempts,
            "wallet_connect_failure_loop": errors > 2,
            "wallet_switch_before_connect": connect_attempts > successful_connects + 1,
            "connect_friction_score": round(friction_score, 4),
        },
        explanation=f"{connect_attempts} connect attempts, {errors} errors, {successful_connects} successes. Friction: {friction_score:.2f}",
        confidence=min(0.9, 0.4 + friction_score * 0.4),
        tenant_id=tenant_id,
    )
    await signal_repo.insert(signal["id"], signal)
    metrics.increment("behavioral_signal_computed", labels={"family": "wallet_friction"})
    return signal


async def compute_identity_delta(
    entity_id: str,
    graph: GraphClient,
    tenant_id: str = "",
) -> Optional[dict]:
    """Detect identity confidence changes based on evidence."""
    identity_records = await silver_identity.get_entity(entity_id, "wallet")
    if not identity_records:
        return None

    sources = list({r.get("source", "") for r in identity_records if r.get("source")})
    if len(sources) < 2:
        return None

    # Check for contradictions between sources
    contradictions = []
    for i, r1 in enumerate(identity_records):
        for r2 in identity_records[i + 1:]:
            if r1.get("source") != r2.get("source"):
                for key in set(r1.keys()) & set(r2.keys()) - {"id", "source", "source_tag", "created_at", "updated_at", "tenant_id", "bronze_id"}:
                    if r1.get(key) and r2.get(key) and r1[key] != r2[key]:
                        contradictions.append(key)

    delta = len(contradictions) / max(len(sources) * 3, 1)

    signal = _make_signal(
        entity_id=entity_id,
        family=SignalFamily.IDENTITY_DELTA,
        outputs={
            "identity_confidence_delta": round(-delta if contradictions else 0.1, 4),
            "new_evidence_type": sources[-1] if sources else "",
            "contradictory_evidence_type": contradictions[0] if contradictions else "",
            "merge_stability_score": round(1.0 - delta, 4),
            "source_count": len(sources),
            "contradiction_count": len(contradictions),
        },
        explanation=f"{len(sources)} identity sources, {len(contradictions)} contradictions. Stability: {1.0 - delta:.2f}",
        confidence=min(0.9, 0.5 + len(sources) * 0.1),
        tenant_id=tenant_id,
    )
    await signal_repo.insert(signal["id"], signal)
    metrics.increment("behavioral_signal_computed", labels={"family": "identity_delta"})
    return signal


async def compute_pre_post_continuity(
    entity_id: str,
    analytics: AnalyticsRepository,
    tenant_id: str = "",
) -> Optional[dict]:
    """Measure pre-connect to post-connect behavioral continuity."""
    events = await analytics.query_events(tenant_id, {"user_id": entity_id}, limit=200)
    if len(events) < 5:
        return None

    # Find the identity/wallet connect moment
    connect_events = [e for e in events if e.get("event_type") in ("identify", "wallet")]
    if not connect_events:
        return None

    connect_time = connect_events[0].get("created_at", "")
    pre_events = [e for e in events if e.get("created_at", "") < connect_time]
    post_events = [e for e in events if e.get("created_at", "") >= connect_time]

    if not pre_events or not post_events:
        return None

    # Simple continuity: do pre and post share event types?
    pre_types = {e.get("event_type") for e in pre_events}
    post_types = {e.get("event_type") for e in post_events}
    overlap = pre_types & post_types
    continuity = len(overlap) / max(len(pre_types | post_types), 1)

    signal = _make_signal(
        entity_id=entity_id,
        family=SignalFamily.PRE_POST_CONTINUITY,
        outputs={
            "pre_post_identity_continuity": round(continuity, 4),
            "pre_connect_intent_strength": round(len(pre_events) / max(len(events), 1), 4),
            "connect_consistency_score": round(continuity, 4),
            "pre_event_count": len(pre_events),
            "post_event_count": len(post_events),
        },
        explanation=f"{len(pre_events)} pre-connect events, {len(post_events)} post-connect. Continuity: {continuity:.2f}",
        confidence=min(0.9, 0.3 + continuity * 0.5),
        tenant_id=tenant_id,
    )
    await signal_repo.insert(signal["id"], signal)
    metrics.increment("behavioral_signal_computed", labels={"family": "pre_post_continuity"})
    return signal


async def compute_sequence_scars(
    entity_id: str,
    analytics: AnalyticsRepository,
    tenant_id: str = "",
) -> Optional[dict]:
    """Detect repeated failure patterns across sessions."""
    events = await analytics.query_events(tenant_id, {"user_id": entity_id}, limit=300)
    if len(events) < 10:
        return None

    # Find error→retry→error patterns
    error_events = [e for e in events if e.get("event_type") == "error"]
    if len(error_events) < 2:
        return None

    # Count error clusters (errors within same session)
    sessions_with_errors = len({e.get("session_id") for e in error_events if e.get("session_id")})
    recurrence = sessions_with_errors

    if recurrence < 2:
        return None

    signal = _make_signal(
        entity_id=entity_id,
        family=SignalFamily.SEQUENCE_SCAR,
        outputs={
            "sequence_scar_type": "error_retry_loop",
            "scar_recurrence_count": recurrence,
            "scar_resolution_rate": round(1.0 - recurrence / max(len({e.get("session_id") for e in events}), 1), 4),
            "total_errors": len(error_events),
            "sessions_affected": sessions_with_errors,
        },
        explanation=f"Error patterns recurred across {recurrence} sessions ({len(error_events)} total errors)",
        confidence=min(0.9, 0.3 + recurrence * 0.15),
        tenant_id=tenant_id,
    )
    await signal_repo.insert(signal["id"], signal)
    metrics.increment("behavioral_signal_computed", labels={"family": "sequence_scar"})
    return signal


async def compute_source_shadow(
    entity_id: str,
    tenant_id: str = "",
) -> Optional[dict]:
    """Distinguish behavior absence from source/observation silence."""
    domain_recency: dict[str, str] = {}
    for domain_name, repo in [("identity", silver_identity), ("onchain", silver_onchain), ("social", silver_social)]:
        records = await repo.get_entity(entity_id, "wallet")
        if records:
            latest = max(records, key=lambda r: r.get("updated_at", ""))
            domain_recency[domain_name] = latest.get("updated_at", "")

    if not domain_recency:
        return None

    # Check for domains with stale data
    stale_domains = []
    active_domains = []
    for domain, last_update in domain_recency.items():
        if last_update < "2026-03-01":
            stale_domains.append(domain)
        else:
            active_domains.append(domain)

    if not stale_domains:
        return None

    source_shadow = len(stale_domains) > 0
    coverage_confidence = len(active_domains) / max(len(domain_recency), 1)

    signal = _make_signal(
        entity_id=entity_id,
        family=SignalFamily.SOURCE_SHADOW,
        outputs={
            "source_coverage_confidence": round(coverage_confidence, 4),
            "behavior_absence_confidence": round(1.0 - coverage_confidence, 4) if source_shadow else 0.0,
            "source_shadow_flag": source_shadow,
            "stale_domains": stale_domains,
            "active_domains": active_domains,
            "observation_gap_vs_behavior_gap": "source_gap" if source_shadow else "behavior_gap",
        },
        explanation=f"Stale data from {stale_domains}; active from {active_domains}. Source shadow: {source_shadow}",
        confidence=0.6 if source_shadow else 0.8,
        tenant_id=tenant_id,
    )
    await signal_repo.insert(signal["id"], signal)
    metrics.increment("behavioral_signal_computed", labels={"family": "source_shadow"})
    return signal


# ═══════════════════════════════════════════════════════════════════
# FULL SCAN
# ═══════════════════════════════════════════════════════════════════

async def run_full_behavioral_scan(
    entity_id: str,
    analytics: AnalyticsRepository,
    graph: GraphClient,
    tenant_id: str = "",
) -> dict:
    """Run all behavioral engines for an entity."""
    results = {}
    for name, fn in [
        ("intent_residue", lambda: compute_intent_residue(entity_id, analytics, tenant_id)),
        ("wallet_friction", lambda: compute_wallet_friction(entity_id, analytics, tenant_id)),
        ("identity_delta", lambda: compute_identity_delta(entity_id, graph, tenant_id)),
        ("pre_post_continuity", lambda: compute_pre_post_continuity(entity_id, analytics, tenant_id)),
        ("sequence_scars", lambda: compute_sequence_scars(entity_id, analytics, tenant_id)),
        ("source_shadow", lambda: compute_source_shadow(entity_id, tenant_id)),
    ]:
        try:
            signal = await fn()
            results[name] = signal
        except Exception as e:
            logger.error(f"Behavioral engine {name} failed for {entity_id}: {e}")
            results[name] = None

    computed = sum(1 for v in results.values() if v is not None)
    metrics.increment("behavioral_full_scan", labels={"signals_computed": str(computed)})
    return {
        "entity_id": entity_id,
        "signals_computed": computed,
        "signals": {k: v for k, v in results.items() if v is not None},
        "scanned_at": utc_now().isoformat(),
    }
