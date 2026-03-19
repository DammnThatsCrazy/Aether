"""
Aether Service — Campaign
Campaign management, attribution calculation, and reporting.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from shared.common.common import APIResponse, NotFoundError, PaginatedResponse, PaginationMeta
from shared.events.events import Event, EventProducer, Topic
from shared.logger.logger import get_logger, metrics
from dependencies.providers import get_producer
from repositories.repos import CampaignRepository

logger = get_logger("aether.service.campaign")
router = APIRouter(prefix="/v1/campaigns", tags=["Campaigns"])

_repo = CampaignRepository()


class CampaignCreate(BaseModel):
    name: str
    channel: str = Field(..., description="e.g. email, social, paid_search, organic")
    start_date: str
    end_date: Optional[str] = None
    budget_usd: Optional[float] = None
    utm_params: dict[str, str] = Field(default_factory=dict)
    properties: dict[str, Any] = Field(default_factory=dict)


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    end_date: Optional[str] = None
    budget_usd: Optional[float] = None
    status: Optional[str] = None


@router.get("")
async def list_campaigns(request: Request, limit: int = 50, offset: int = 0):
    tenant = request.state.tenant
    campaigns = await _repo.find_many(
        filters={"tenant_id": tenant.tenant_id}, limit=limit, offset=offset
    )
    total = await _repo.count(filters={"tenant_id": tenant.tenant_id})
    return PaginatedResponse(
        data=campaigns,
        pagination=PaginationMeta(
            total=total, limit=limit, offset=offset,
            has_more=offset + limit < total,
        ),
    ).to_dict()


@router.post("")
async def create_campaign(
    body: CampaignCreate,
    request: Request,
    producer: EventProducer = Depends(get_producer),
):
    tenant = request.state.tenant
    tenant.require_permission("campaign:manage")
    campaign_id = str(uuid.uuid4())
    campaign = await _repo.insert(campaign_id, {
        "tenant_id": tenant.tenant_id,
        **body.model_dump(),
        "status": "active",
    })
    return APIResponse(data=campaign).to_dict()


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, request: Request):
    campaign = await _repo.find_by_id_or_fail(campaign_id)
    return APIResponse(data=campaign).to_dict()


@router.patch("/{campaign_id}")
async def update_campaign(
    campaign_id: str, body: CampaignUpdate, request: Request
):
    request.state.tenant.require_permission("campaign:manage")
    campaign = await _repo.update(campaign_id, body.model_dump(exclude_none=True))
    return APIResponse(data=campaign).to_dict()


@router.delete("/{campaign_id}")
async def delete_campaign(campaign_id: str, request: Request):
    request.state.tenant.require_permission("campaign:manage")
    await _repo.delete(campaign_id)
    return APIResponse(data={"deleted": True}).to_dict()


class AttributionQuery(BaseModel):
    model: str = Field(
        default="multi_touch",
        pattern="^(multi_touch|first_touch|last_touch|linear|time_decay)$",
    )
    start_date: Optional[str] = None
    end_date: Optional[str] = None


# In-memory touchpoint store (production: TimescaleDB)
_touchpoint_store: dict[str, list[dict]] = {}


@router.get("/{campaign_id}/attribution")
async def get_attribution(
    campaign_id: str,
    request: Request,
    model: str = "multi_touch",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Compute attribution results for a campaign.

    Retrieves all touchpoints for the campaign and applies the selected
    attribution model to distribute conversion credit.
    """
    tenant = request.state.tenant
    # Verify campaign exists and belongs to tenant
    campaign = await _repo.find_by_id(campaign_id)
    if campaign is None:
        raise NotFoundError("Campaign")
    if campaign.get("tenant_id") != tenant.tenant_id:
        raise NotFoundError("Campaign")

    # Fetch touchpoints for this campaign
    touchpoints = _touchpoint_store.get(campaign_id, [])

    # Filter by date range if provided
    if start_date or end_date:
        filtered = []
        for tp in touchpoints:
            ts = tp.get("timestamp", "")
            if start_date and ts < start_date:
                continue
            if end_date and ts > end_date:
                continue
            filtered.append(tp)
        touchpoints = filtered

    # Apply attribution model
    conversions = [tp for tp in touchpoints if tp.get("is_conversion")]
    total_revenue = sum(tp.get("revenue_usd", 0.0) for tp in conversions)

    attributed = _compute_attribution(touchpoints, conversions, model)

    metrics.increment("campaign_attribution_computed", labels={"model": model})
    logger.info(
        "Attribution computed for campaign %s: model=%s conversions=%d revenue=%.2f",
        campaign_id, model, len(conversions), total_revenue,
    )

    return APIResponse(data={
        "campaign_id": campaign_id,
        "campaign_name": campaign.get("name", ""),
        "model": model,
        "conversions": len(conversions),
        "revenue_attributed_usd": round(total_revenue, 2),
        "touchpoints": attributed,
        "period": {"start": start_date, "end": end_date},
    }).to_dict()


@router.post("/{campaign_id}/touchpoints")
async def record_touchpoint(
    campaign_id: str,
    request: Request,
    producer: EventProducer = Depends(get_producer),
):
    """Record a campaign touchpoint (page view, click, conversion)."""
    tenant = request.state.tenant
    body = await request.json()

    campaign = await _repo.find_by_id(campaign_id)
    if campaign is None or campaign.get("tenant_id") != tenant.tenant_id:
        raise NotFoundError("Campaign")

    touchpoint = {
        "touchpoint_id": str(uuid.uuid4()),
        "campaign_id": campaign_id,
        "channel": body.get("channel", campaign.get("channel", "unknown")),
        "source": body.get("source", ""),
        "user_id": body.get("user_id", ""),
        "session_id": body.get("session_id", ""),
        "event_type": body.get("event_type", "pageview"),
        "is_conversion": body.get("is_conversion", False),
        "revenue_usd": float(body.get("revenue_usd", 0.0)),
        "timestamp": body.get("timestamp", datetime.now(timezone.utc).isoformat()),
        "properties": body.get("properties", {}),
    }

    _touchpoint_store.setdefault(campaign_id, []).append(touchpoint)

    await producer.publish(Event(
        topic=Topic.TOUCHPOINT_RECORDED,
        tenant_id=tenant.tenant_id,
        source_service="campaign",
        payload=touchpoint,
    ))

    metrics.increment("campaign_touchpoints_recorded")
    return APIResponse(data=touchpoint).to_dict()


def _compute_attribution(
    touchpoints: list[dict],
    conversions: list[dict],
    model: str,
) -> list[dict]:
    """Apply attribution model to distribute conversion credit across touchpoints."""
    if not touchpoints:
        return []

    non_conversion = [tp for tp in touchpoints if not tp.get("is_conversion")]
    if not non_conversion:
        return touchpoints

    total_revenue = sum(c.get("revenue_usd", 0.0) for c in conversions)
    n = len(non_conversion)

    for tp in non_conversion:
        tp["attributed_revenue"] = 0.0
        tp["attribution_weight"] = 0.0

    if model == "first_touch" and non_conversion:
        non_conversion[0]["attribution_weight"] = 1.0
        non_conversion[0]["attributed_revenue"] = total_revenue

    elif model == "last_touch" and non_conversion:
        non_conversion[-1]["attribution_weight"] = 1.0
        non_conversion[-1]["attributed_revenue"] = total_revenue

    elif model == "linear" and non_conversion:
        weight = 1.0 / n
        for tp in non_conversion:
            tp["attribution_weight"] = round(weight, 4)
            tp["attributed_revenue"] = round(total_revenue * weight, 2)

    elif model == "time_decay" and non_conversion:
        # More recent touchpoints get higher weight (exponential decay)
        weights = [2 ** i for i in range(n)]
        total_weight = sum(weights)
        for i, tp in enumerate(non_conversion):
            w = weights[i] / total_weight
            tp["attribution_weight"] = round(w, 4)
            tp["attributed_revenue"] = round(total_revenue * w, 2)

    else:  # multi_touch (default): position-based 40/20/40
        if n == 1:
            non_conversion[0]["attribution_weight"] = 1.0
            non_conversion[0]["attributed_revenue"] = total_revenue
        elif n == 2:
            for tp in non_conversion:
                tp["attribution_weight"] = 0.5
                tp["attributed_revenue"] = round(total_revenue * 0.5, 2)
        else:
            first_weight = 0.4
            last_weight = 0.4
            middle_weight = 0.2 / (n - 2) if n > 2 else 0
            non_conversion[0]["attribution_weight"] = first_weight
            non_conversion[0]["attributed_revenue"] = round(total_revenue * first_weight, 2)
            non_conversion[-1]["attribution_weight"] = last_weight
            non_conversion[-1]["attributed_revenue"] = round(total_revenue * last_weight, 2)
            for tp in non_conversion[1:-1]:
                tp["attribution_weight"] = round(middle_weight, 4)
                tp["attributed_revenue"] = round(total_revenue * middle_weight, 2)

    return touchpoints
