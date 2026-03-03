"""
Aether Service — Consent
GDPR consent records, data subject requests (DSR), and audit logs.
"""

from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from shared.common.common import APIResponse, BadRequestError, utc_now
from shared.events.events import Event, EventProducer, Topic
from shared.logger.logger import get_logger
from dependencies.providers import get_producer
from repositories.repos import ConsentRepository

logger = get_logger("aether.service.consent")
router = APIRouter(prefix="/v1/consent", tags=["Consent"])

_repo = ConsentRepository()
DSR_TYPES = ["access", "rectification", "erasure", "portability", "restriction", "objection"]


class ConsentRecord(BaseModel):
    user_id: str
    purposes: list[str] = Field(..., description="e.g. analytics, marketing, personalization")
    granted: bool = True
    source: str = Field(default="sdk", description="How consent was collected")


class DataSubjectRequest(BaseModel):
    user_id: str
    request_type: str = Field(..., description="access, rectification, erasure, portability, restriction, objection")
    details: str = ""


@router.post("/records")
async def record_consent(
    body: ConsentRecord,
    request: Request,
    producer: EventProducer = Depends(get_producer),
):
    """Record a user's consent preferences."""
    tenant = request.state.tenant
    record = await _repo.insert(str(uuid.uuid4()), {
        "tenant_id": tenant.tenant_id,
        "user_id": body.user_id,
        "purposes": body.purposes,
        "granted": body.granted,
        "source": body.source,
        "recorded_at": utc_now().isoformat(),
    })

    await producer.publish(Event(
        topic=Topic.CONSENT_UPDATED,
        tenant_id=tenant.tenant_id,
        source_service="consent",
        payload={"user_id": body.user_id, "granted": body.granted, "purposes": body.purposes},
    ))

    return APIResponse(data=record).to_dict()


@router.get("/records/{user_id}")
async def get_consent(user_id: str, request: Request):
    """Get current consent status for a user."""
    tenant = request.state.tenant
    record = await _repo.get_consent(tenant.tenant_id, user_id)
    return APIResponse(data=record or {"user_id": user_id, "consent": None}).to_dict()


@router.post("/dsr")
async def submit_dsr(
    body: DataSubjectRequest,
    request: Request,
    producer: EventProducer = Depends(get_producer),
):
    """Submit a GDPR data subject request."""
    tenant = request.state.tenant
    tenant.require_permission("consent:manage")

    if body.request_type not in DSR_TYPES:
        raise BadRequestError(f"Invalid DSR type. Allowed: {DSR_TYPES}")

    dsr_id = str(uuid.uuid4())
    dsr = await _repo.insert(f"dsr_{dsr_id}", {
        "tenant_id": tenant.tenant_id,
        "dsr_id": dsr_id,
        "user_id": body.user_id,
        "request_type": body.request_type,
        "details": body.details,
        "status": "pending",
        "submitted_at": utc_now().isoformat(),
        "deadline": None,
    })

    await producer.publish(Event(
        topic=Topic.DATA_SUBJECT_REQUEST,
        tenant_id=tenant.tenant_id,
        source_service="consent",
        payload={"dsr_id": dsr_id, "type": body.request_type, "user_id": body.user_id},
    ))

    return APIResponse(data=dsr).to_dict()


@router.get("/dsr")
async def list_dsrs(request: Request, status: Optional[str] = None):
    """List all data subject requests for the tenant."""
    tenant = request.state.tenant
    tenant.require_permission("consent:manage")
    filters: dict = {"tenant_id": tenant.tenant_id}
    if status:
        filters["status"] = status
    dsrs = await _repo.find_many(filters=filters)
    return APIResponse(data=dsrs).to_dict()
