"""
Aether Service — Analytics
Query engine for dashboards, reports, and exports.
Includes the GraphQL endpoint for flexible dashboard queries.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from shared.common.common import (
    APIResponse, CursorPagination, PaginatedResponse, PaginationMeta,
    UnauthorizedError,
)
from shared.cache.cache import CacheClient
from shared.auth.auth import JWTHandler, APIKeyValidator
from shared.logger.logger import get_logger
from dependencies.providers import get_cache, get_registry
from repositories.repos import AnalyticsRepository

logger = get_logger("aether.service.analytics")
router = APIRouter(prefix="/v1/analytics", tags=["Analytics"])


_repo: Optional[AnalyticsRepository] = None


def _get_repo(cache: CacheClient = Depends(get_cache)) -> AnalyticsRepository:
    global _repo
    if _repo is None:
        _repo = AnalyticsRepository(cache)
    return _repo


# ── Models ────────────────────────────────────────────────────────────

class EventQuery(BaseModel):
    event_type: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    limit: int = Field(default=50, ge=1, le=200)


class GraphQLRequest(BaseModel):
    query: str
    variables: dict[str, Any] = Field(default_factory=dict)


class ExportRequest(BaseModel):
    format: str = Field(default="csv", pattern="^(csv|json|parquet)$")
    query: EventQuery = Field(default_factory=EventQuery)


# ── REST Routes ───────────────────────────────────────────────────────

@router.post("/events/query")
async def query_events(
    query: EventQuery,
    request: Request,
    repo: AnalyticsRepository = Depends(_get_repo),
):
    """Query events with filters. Cached in Redis for 5 minutes."""
    tenant = request.state.tenant
    results = await repo.query_events(
        tenant.tenant_id,
        query.model_dump(exclude_none=True),
        limit=query.limit,
    )
    return PaginatedResponse(
        data=results,
        pagination=PaginationMeta(
            total=len(results),
            limit=query.limit,
            has_more=len(results) == query.limit,
        ),
    ).to_dict()


@router.get("/events/{event_id}")
async def get_event(
    event_id: str,
    request: Request,
    repo: AnalyticsRepository = Depends(_get_repo),
):
    """Get a single event by ID."""
    event = await repo.get_event(event_id)
    return APIResponse(data=event).to_dict()


@router.get("/dashboard/summary")
async def dashboard_summary(
    request: Request,
    repo: AnalyticsRepository = Depends(_get_repo),
):
    """Aggregated dashboard summary — sessions, events, users (last 24h)."""
    tenant = request.state.tenant
    summary = await repo.dashboard_summary(tenant.tenant_id)
    return APIResponse(data=summary).to_dict()


@router.post("/export")
async def export_data(body: ExportRequest, request: Request):
    """Request an async data export (CSV, JSON, Parquet)."""
    return APIResponse(data={
        "export_id": "export_stub_001",
        "format": body.format,
        "status": "queued",
    }).to_dict()


# ── GraphQL Endpoint ──────────────────────────────────────────────────

@router.post("/graphql")
async def graphql_endpoint(body: GraphQLRequest, request: Request):
    """GraphQL endpoint for flexible dashboard queries with field-level auth."""
    tenant = request.state.tenant
    logger.info(f"GraphQL query from tenant {tenant.tenant_id}")
    return APIResponse(data={
        "message": "GraphQL resolver not yet implemented",
        "query_received": body.query[:200],
    }).to_dict()


# ── WebSocket for Real-Time Streaming ─────────────────────────────────

@router.websocket("/ws/events")
async def websocket_event_stream(websocket: WebSocket):
    """
    Real-time event stream with WebSocket authentication.
    Clients must send an auth message first: {"token": "..."} or {"api_key": "..."}
    """
    await websocket.accept()
    logger.info("WebSocket client connected, awaiting auth...")

    # --- Authenticate first message ---
    try:
        auth_msg = await websocket.receive_json()
        registry = get_registry()

        if "api_key" in auth_msg:
            tenant = registry.api_key_validator.validate(auth_msg["api_key"])
        elif "token" in auth_msg:
            payload = registry.jwt_handler.decode(auth_msg["token"])
            tenant = registry.jwt_handler.extract_context(payload)
        else:
            await websocket.send_json({"error": "Send {token} or {api_key} to authenticate"})
            await websocket.close(code=4001)
            return

        await websocket.send_json({"authenticated": True, "tenant_id": tenant.tenant_id})
        logger.info(f"WebSocket authenticated for tenant {tenant.tenant_id}")

    except Exception as e:
        await websocket.send_json({"error": f"Authentication failed: {str(e)}"})
        await websocket.close(code=4001)
        return

    # --- Stream events ---
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_json({"type": "event", "data": {"received": data}})
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
