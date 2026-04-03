"""
Aether Backend — Main Application
Mounts all 10 services, applies middleware, and serves the unified API.

Run:
    uvicorn main:app --reload --port 8000

Routes:
    GET  /                              Root
    GET  /v1/health                     Health check
    POST /v1/ingest/events              Single SDK event
    POST /v1/ingest/events/batch        Batch SDK events
    POST /v1/ingest/feed                External API feed
    GET  /v1/identity/profiles/{id}     Get profile
    PUT  /v1/identity/profiles/{id}     Upsert profile
    POST /v1/identity/merge             Merge identities
    GET  /v1/identity/profiles/{id}/graph  Profile graph
    POST /v1/analytics/events/query     Query events
    GET  /v1/analytics/events/{id}      Get event
    GET  /v1/analytics/dashboard/summary  Dashboard
    POST /v1/analytics/export           Data export
    POST /v1/analytics/graphql          GraphQL endpoint
    WS   /v1/analytics/ws/events        Real-time stream
    GET  /v1/ml/models                  List ML models
    POST /v1/ml/predict                 Single prediction
    POST /v1/ml/predict/batch           Batch prediction
    GET  /v1/ml/features/{id}           Feature serving
    GET  /v1/agent/status               Agent status
    POST /v1/agent/tasks                Submit task
    GET  /v1/agent/tasks/{id}           Task status
    GET  /v1/agent/audit                Audit trail
    POST /v1/agent/kill-switch          Kill switch
    GET  /v1/campaigns                  List campaigns
    POST /v1/campaigns                  Create campaign
    GET  /v1/campaigns/{id}             Get campaign
    PATCH /v1/campaigns/{id}            Update campaign
    DELETE /v1/campaigns/{id}           Delete campaign
    GET  /v1/campaigns/{id}/attribution Attribution
    POST /v1/consent/records            Record consent
    GET  /v1/consent/records/{user_id}  Get consent
    POST /v1/consent/dsr                Submit DSR
    GET  /v1/consent/dsr                List DSRs
    POST /v1/notifications/webhooks     Create webhook
    GET  /v1/notifications/webhooks     List webhooks
    DELETE /v1/notifications/webhooks/{id}  Delete webhook
    POST /v1/notifications/alerts       Create alert
    GET  /v1/notifications/alerts       List alerts
    POST /v1/admin/tenants              Create tenant
    GET  /v1/admin/tenants/{id}         Get tenant
    PATCH /v1/admin/tenants/{id}        Update tenant
    POST /v1/admin/tenants/{id}/api-keys  Create API key
    GET  /v1/admin/tenants/{id}/api-keys  List API keys
    DELETE /v1/admin/api-keys/{id}      Revoke API key
    GET  /v1/admin/tenants/{id}/billing Billing
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from config.settings import settings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from middleware.middleware import register_middleware
from services.admin.routes import router as admin_router
from services.agent.routes import router as agent_router
from services.analytics.routes import router as analytics_router
from services.campaign.routes import router as campaign_router
from services.consent.routes import router as consent_router

# Import all service routers
from services.gateway.routes import router as gateway_router
from services.identity.routes import router as identity_router
from services.ingestion.routes import router as ingestion_router
from services.ml_serving.routes import router as ml_router
from services.notification.routes import router as notification_router

# ═══════════════════════════════════════════════════════════════════════
# APP FACTORY
# ═══════════════════════════════════════════════════════════════════════

def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.api.title,
        description=settings.api.description,
        version=settings.api.version,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── CORS ──────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.api.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[
            "X-Request-ID",
            "X-Response-Time",
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
        ],
    )

    # ── Auth / Logging / Rate Limit / Error Handling Middleware ────
    register_middleware(app)

    # ── Mount all 10 service routers ──────────────────────────────
    app.include_router(gateway_router)
    app.include_router(ingestion_router)
    app.include_router(identity_router)
    app.include_router(analytics_router)
    app.include_router(ml_router)
    app.include_router(agent_router)
    app.include_router(campaign_router)
    app.include_router(consent_router)
    app.include_router(notification_router)
    app.include_router(admin_router)

    return app


app = create_app()


# ═══════════════════════════════════════════════════════════════════════
# ENTRYPOINT
# ═══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=settings.debug)
