"""
Aether Agent Layer — API Scanner Discovery Worker
Discovers and probes public API endpoints for tracked entities.

Capabilities:
  - Detect REST / GraphQL / WebSocket endpoints from docs pages
  - Extract OpenAPI/Swagger schemas when available
  - Monitor for schema changes between scans
  - Catalogue rate-limit headers and authentication requirements
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

from config.settings import WorkerType
from models.core import AgentTask, TaskResult
from workers.base import BaseWorker

logger = logging.getLogger("aether.worker.api_scanner")

# Common paths to probe for API docs
_WELL_KNOWN_PATHS = (
    "/openapi.json", "/swagger.json", "/api-docs",
    "/graphql", "/.well-known/openapi", "/docs",
    "/api/v1", "/api/v2", "/api/health",
)


class ApiScannerWorker(BaseWorker):
    """
    Discovery worker that scans a target domain for public API surface.

    Payload contract:
        target_domain : str   — e.g. "api.example.com"
        entity_id     : str   — graph entity this relates to
        probe_paths   : list  — (optional) extra paths to check
        deep_scan     : bool  — (optional) follow links in docs pages
    """

    worker_type = WorkerType.API_SCANNER
    data_source = "general_web"

    def _execute(self, task: AgentTask) -> TaskResult:
        domain = task.payload.get("target_domain", "")
        entity_id = task.payload.get("entity_id", "")
        extra_paths = task.payload.get("probe_paths", [])
        deep_scan = task.payload.get("deep_scan", False)

        paths_to_check = list(_WELL_KNOWN_PATHS) + extra_paths
        logger.info(
            f"Scanning API surface for {domain} "
            f"({len(paths_to_check)} paths, deep={deep_scan})"
        )

        # ── Production: replace with real HTTP probing ────────────────
        # async with httpx.AsyncClient(base_url=f"https://{domain}") as client:
        #     for path in paths_to_check:
        #         resp = await client.get(path, timeout=10)
        #         ...
        endpoints: list[dict[str, Any]] = []
        for path in paths_to_check:
            endpoints.append({
                "path": path,
                "status": 200,           # placeholder
                "content_type": "application/json",
                "schema_hash": hashlib.sha256(path.encode()).hexdigest()[:12],
                "rate_limit_header": None,
                "auth_required": path not in ("/api/health", "/docs"),
            })

        schema_snapshot = {
            "domain": domain,
            "endpoints_discovered": len(endpoints),
            "endpoints": endpoints,
            "has_openapi": any(
                e["path"] in ("/openapi.json", "/swagger.json")
                for e in endpoints
            ),
        }
        confidence = 0.80
        # ──────────────────────────────────────────────────────────────

        return TaskResult(
            task_id=task.task_id,
            worker_type=self.worker_type,
            success=True,
            data=schema_snapshot,
            confidence=confidence,
            source_attribution=f"https://{domain}",
        )
