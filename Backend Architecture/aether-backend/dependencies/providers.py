"""
Aether Backend — Dependency Injection
Centralized resource providers using FastAPI Depends.
Eliminates module-level singletons — each resource has a single lifecycle.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Optional

from shared.cache.cache import CacheClient
from shared.events.events import EventProducer, EventConsumer
from shared.graph.graph import GraphClient
from shared.rate_limit.limiter import TokenBucketLimiter
from shared.auth.auth import JWTHandler, APIKeyValidator
from shared.logger.logger import get_logger

logger = get_logger("aether.dependencies")


class ResourceRegistry:
    """
    Singleton registry that owns the lifecycle of all shared resources.
    Created at app startup, torn down at shutdown.
    """

    def __init__(self) -> None:
        self.cache = CacheClient()
        self.graph = GraphClient()
        self.producer = EventProducer()
        self.consumer = EventConsumer()
        self.rate_limiter = TokenBucketLimiter()
        self.jwt_handler = JWTHandler()
        self.api_key_validator = APIKeyValidator()
        self._started = False

    async def startup(self) -> None:
        """Initialize all connections. Called from FastAPI lifespan."""
        logger.info("Initializing shared resources...")
        await self.cache.connect()
        await self.graph.connect()
        await self.producer.connect()
        self._started = True
        logger.info("All shared resources initialized")

    async def shutdown(self) -> None:
        """Gracefully close all connections."""
        logger.info("Shutting down shared resources...")
        await self.producer.close()
        await self.graph.close()
        await self.cache.close()
        self._started = False
        logger.info("All shared resources closed")

    async def health_check(self) -> dict[str, Any]:
        """Probe all dependencies and return status map."""
        checks: dict[str, Any] = {}
        for name, check_fn in [
            ("cache", self.cache.health_check),
            ("graph", self.graph.health_check),
            ("event_bus", self.producer.health_check),
        ]:
            try:
                healthy = await check_fn()
                checks[name] = {"status": "ok" if healthy else "degraded"}
            except Exception as e:
                checks[name] = {"status": "error", "error": str(e)}
        return checks


# Module-level singleton — initialized once, used everywhere via FastAPI Depends
_registry: Optional[ResourceRegistry] = None


def get_registry() -> ResourceRegistry:
    """Get or create the global resource registry."""
    global _registry
    if _registry is None:
        _registry = ResourceRegistry()
    return _registry


# ── FastAPI dependency functions ────────────────────────────────────────

def get_cache() -> CacheClient:
    return get_registry().cache


def get_graph() -> GraphClient:
    return get_registry().graph


def get_producer() -> EventProducer:
    return get_registry().producer


def get_consumer() -> EventConsumer:
    return get_registry().consumer


def get_rate_limiter() -> TokenBucketLimiter:
    return get_registry().rate_limiter


def get_jwt_handler() -> JWTHandler:
    return get_registry().jwt_handler


def get_api_key_validator() -> APIKeyValidator:
    return get_registry().api_key_validator
