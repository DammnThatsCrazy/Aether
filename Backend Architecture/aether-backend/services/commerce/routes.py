"""
Aether Service — Commerce Routes (L3a)
Payment recording, agent hiring, fee elimination reporting.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from shared.common.common import APIResponse
from shared.logger.logger import get_logger

from .models import AgentHireRecord, PaymentRecord
from .service import CommerceService

logger = get_logger("aether.service.commerce.routes")
router = APIRouter(prefix="/v1/commerce", tags=["Commerce"])

_service = CommerceService()


@router.post("/payments")
async def record_payment(body: PaymentRecord, request: Request):
    """Record a payment and create PAYS edge in the intelligence graph."""
    request.state.tenant.require_permission("commerce:write")
    result = await _service.record_payment(body)
    return APIResponse(data=result.model_dump()).to_dict()


@router.post("/hires")
async def record_hire(body: AgentHireRecord, request: Request):
    """Record an agent hiring another agent and create HIRED edge."""
    request.state.tenant.require_permission("commerce:write")
    result = await _service.record_hire(body)
    return APIResponse(data=result.model_dump()).to_dict()


@router.get("/fees/report")
async def fee_elimination_report(request: Request, period: str = "all"):
    """Get fee elimination report showing savings from crypto payments vs cards."""
    request.state.tenant.require_permission("commerce:read")
    report = await _service.get_fee_elimination_report(period)
    return APIResponse(data=report.model_dump()).to_dict()


@router.get("/agent/{agent_id}/spend")
async def agent_spend_history(agent_id: str, request: Request):
    """Get spending history for a specific agent."""
    request.state.tenant.require_permission("commerce:read")
    result = await _service.get_agent_spend(agent_id)
    return APIResponse(data=result).to_dict()
