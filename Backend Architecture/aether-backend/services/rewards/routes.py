"""
Aether Backend — Reward Automation Service Routes

Exposes the reward eligibility engine, queue processor, and campaign
management via a REST API.  The ``/evaluate`` endpoint is the primary
integration point — it orchestrates fraud scoring, attribution resolution,
eligibility evaluation, and (when eligible) proof generation in a single
call.

Routes:
    POST /v1/rewards/evaluate             Evaluate event for reward eligibility
    POST /v1/rewards/campaigns            Create a reward campaign
    GET  /v1/rewards/campaigns            List reward campaigns
    GET  /v1/rewards/campaigns/{id}       Get campaign details
    GET  /v1/rewards/queue/stats          Reward queue statistics
    GET  /v1/rewards/user/{address}       Get user reward history
    POST /v1/rewards/process              Trigger queue processing
    GET  /v1/rewards/proof/{reward_id}    Get reward proof for claiming
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.oracle.signer import OracleSigner, ProofConfig
from services.rewards.eligibility import (
    Campaign,
    EligibilityEngine,
    EligibilityResult,
    RewardRule,
    RewardTier,
)
from services.rewards.queue import RewardQueue
from shared.common.common import APIResponse, NotFoundError
from shared.logger.logger import get_logger, metrics

logger = get_logger("aether.service.rewards")

router = APIRouter(prefix="/v1/rewards", tags=["Rewards"])


# ═══════════════════════════════════════════════════════════════════════════
# SINGLETONS (initialised at import time)
# ═══════════════════════════════════════════════════════════════════════════

_oracle_config = ProofConfig(
    signer_private_key=os.environ.get(
        "ORACLE_SIGNER_KEY",
        "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    ),
    contract_address=os.environ.get(
        "REWARD_CONTRACT_ADDRESS",
        "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    ),
    chain_id=int(os.environ.get("CHAIN_ID", "1")),
    proof_expiry_seconds=int(os.environ.get("PROOF_EXPIRY_SECONDS", "3600")),
)

_oracle = OracleSigner(_oracle_config)
_engine = EligibilityEngine()
_queue = RewardQueue(_oracle)


# ═══════════════════════════════════════════════════════════════════════════
# REQUEST / RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════════════════

# -- evaluate -----------------------------------------------------------

class EvaluateRequest(BaseModel):
    """Payload for the ``/evaluate`` endpoint."""
    event_type: str = Field(..., description="e.g. conversion, signup, referral")
    user_address: Optional[str] = Field(None, description="Wallet address (0x...)")
    channel: Optional[str] = Field(None, description="Attribution channel")
    session_id: Optional[str] = None
    properties: dict[str, Any] = Field(default_factory=dict)


class EvaluateResponse(BaseModel):
    eligible: bool
    campaign_id: Optional[str] = None
    reward_tier: Optional[dict] = None
    reward_id: Optional[str] = None
    denial_reason: Optional[str] = None
    fraud_score: float = 0.0
    attribution_weight: float = 0.0


# -- campaigns ----------------------------------------------------------

class RewardTierCreate(BaseModel):
    name: str
    amount_wei: int
    token_symbol: str = "ETH"
    description: str = ""


class RewardRuleCreate(BaseModel):
    event_types: list[str]
    reward_tier: RewardTierCreate
    required_channel: Optional[str] = None
    min_attribution_weight: float = 0.0
    max_fraud_score: float = 40.0
    cooldown_seconds: int = 86_400
    max_per_user: int = 1
    requires_wallet: bool = True


class CampaignCreate(BaseModel):
    name: str
    description: str = ""
    rules: list[RewardRuleCreate] = Field(..., min_length=1)
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    total_budget_wei: int = Field(..., gt=0)
    chain_id: int = 1
    contract_address: Optional[str] = None


class CampaignResponse(BaseModel):
    id: str
    name: str
    description: str
    rules: list[dict]
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    total_budget_wei: int
    spent_wei: int
    budget_remaining_wei: int
    active: bool
    chain_id: int
    contract_address: Optional[str] = None


# -- queue --------------------------------------------------------------

class ProcessResponse(BaseModel):
    processed: int
    results: list[dict]


# ═══════════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/evaluate", response_model=None)
async def evaluate_event(body: EvaluateRequest):
    """
    Full reward-evaluation pipeline:

    1. Compute a simulated fraud score.
    2. Compute a simulated attribution weight.
    3. Run the eligibility engine.
    4. If eligible, enqueue the reward for proof generation.
    """
    # Step 1 — Fraud scoring (simulated; production: call fraud engine)
    fraud_score = _simulate_fraud_score(body.properties)

    # Step 2 — Attribution resolution (simulated; production: call attribution service)
    attribution_weight = _simulate_attribution_weight(body.channel, body.properties)

    # Step 3 — Eligibility
    event_dict = {
        "event_type": body.event_type,
        "channel": body.channel,
        "session_id": body.session_id,
        "properties": body.properties,
    }

    result: EligibilityResult = await _engine.evaluate(
        event=event_dict,
        fraud_score=fraud_score,
        attribution_weight=attribution_weight,
        user_address=body.user_address,
    )

    response = EvaluateResponse(
        eligible=result.eligible,
        campaign_id=result.campaign_id or None,
        reward_tier=result.reward_tier.to_dict() if result.reward_tier else None,
        denial_reason=result.denial_reason,
        fraud_score=result.fraud_score,
        attribution_weight=result.attribution_weight,
    )

    # Step 4 — Enqueue if eligible
    if result.eligible and body.user_address and result.reward_tier:
        campaign = _engine.get_campaign(result.campaign_id)
        reward_id = await _queue.enqueue(
            user_address=body.user_address,
            action_type=body.event_type,
            campaign_id=result.campaign_id,
            reward_amount_wei=result.reward_tier.amount_wei,
            chain_id=campaign.chain_id,
        )
        _engine.record_claim(body.user_address, result.campaign_id)
        response.reward_id = reward_id

    metrics.increment("rewards_evaluate_requests")
    return APIResponse(data=response.model_dump()).to_dict()


# -- campaign management ------------------------------------------------

@router.post("/campaigns", response_model=None)
async def create_campaign(body: CampaignCreate):
    """Register a new reward campaign."""
    campaign_id = str(uuid.uuid4())

    rules = [
        RewardRule(
            event_types=r.event_types,
            reward_tier=RewardTier(
                name=r.reward_tier.name,
                amount_wei=r.reward_tier.amount_wei,
                token_symbol=r.reward_tier.token_symbol,
                description=r.reward_tier.description,
            ),
            required_channel=r.required_channel,
            min_attribution_weight=r.min_attribution_weight,
            max_fraud_score=r.max_fraud_score,
            cooldown_seconds=r.cooldown_seconds,
            max_per_user=r.max_per_user,
            requires_wallet=r.requires_wallet,
        )
        for r in body.rules
    ]

    campaign = Campaign(
        id=campaign_id,
        name=body.name,
        description=body.description,
        rules=rules,
        start_time=_parse_optional_datetime(body.start_time),
        end_time=_parse_optional_datetime(body.end_time),
        total_budget_wei=body.total_budget_wei,
        chain_id=body.chain_id,
        contract_address=body.contract_address or _oracle_config.contract_address,
    )

    _engine.register_campaign(campaign)
    return APIResponse(data=campaign.to_dict()).to_dict()


@router.get("/campaigns", response_model=None)
async def list_campaigns():
    """List all registered reward campaigns."""
    campaigns = _engine.list_campaigns()
    return APIResponse(data=[c.to_dict() for c in campaigns]).to_dict()


@router.get("/campaigns/{campaign_id}", response_model=None)
async def get_campaign(campaign_id: str):
    """Get a single campaign by ID."""
    try:
        campaign = _engine.get_campaign(campaign_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return APIResponse(data=campaign.to_dict()).to_dict()


# -- queue management ---------------------------------------------------

@router.get("/queue/stats", response_model=None)
async def queue_stats():
    """Return current reward queue statistics."""
    return APIResponse(data=_queue.get_stats()).to_dict()


@router.get("/user/{address}", response_model=None)
async def get_user_rewards(address: str):
    """Return all rewards for a given wallet address."""
    rewards = _queue.get_user_rewards(address)
    return APIResponse(data=[r.to_dict() for r in rewards]).to_dict()


@router.post("/process", response_model=None)
async def process_queue():
    """Trigger processing of all pending rewards in the queue."""
    results = await _queue.process_all()
    return APIResponse(data={
        "processed": len(results),
        "results": [r.to_dict() for r in results],
    }).to_dict()


@router.get("/proof/{reward_id}", response_model=None)
async def get_reward_proof(reward_id: str):
    """
    Retrieve the proof for a specific reward.

    Returns 404 if the reward doesn't exist, or 409 if the proof has not
    been generated yet.
    """
    try:
        reward = _queue.get_reward(reward_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Reward not found")

    if reward.proof is None:
        raise HTTPException(
            status_code=409,
            detail=f"Proof not yet available; reward status={reward.status}",
        )

    return APIResponse(data={
        "reward_id": reward.id,
        "status": reward.status,
        "proof": reward.proof,
    }).to_dict()


# ═══════════════════════════════════════════════════════════════════════════
# INTERNAL HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def _simulate_fraud_score(properties: dict) -> float:
    """
    Placeholder fraud scoring.

    Production: call ``services.fraud.FraudEngine.score()`` or an ML
    inference endpoint.
    """
    # Heuristic: presence of suspicious keys bumps the score
    score = 0.0
    if properties.get("vpn_detected"):
        score += 25.0
    if properties.get("bot_probability", 0) > 0.7:
        score += 35.0
    if properties.get("device_count", 1) > 5:
        score += 15.0
    return min(score, 100.0)


def _simulate_attribution_weight(
    channel: Optional[str],
    properties: dict,
) -> float:
    """
    Placeholder attribution resolution.

    Production: call ``services.attribution.AttributionResolver.resolve()``.
    """
    base_weights: dict[str, float] = {
        "organic": 0.9,
        "social": 0.7,
        "referral": 0.8,
        "paid_search": 0.6,
        "email": 0.5,
        "direct": 1.0,
    }
    weight = base_weights.get(channel or "", 0.5)
    # Boost by explicit override if present
    weight = properties.get("attribution_weight_override", weight)
    return min(max(float(weight), 0.0), 1.0)


def _parse_optional_datetime(value: Optional[str]) -> Optional[datetime]:
    """Parse an ISO datetime string or return ``None``."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
