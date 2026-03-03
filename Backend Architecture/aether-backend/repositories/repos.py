"""
Aether Backend — Repository Pattern
Each service accesses data stores through repository classes that abstract
query logic from business logic. Includes connection pooling, prepared
statements, and write-ahead logging hooks.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Generic, Optional, TypeVar

from shared.common.common import NotFoundError, utc_now
from shared.cache.cache import CacheClient, CacheKey, TTL
from shared.graph.graph import GraphClient, Vertex, Edge, VertexType, EdgeType
from shared.events.events import Event, EventProducer, Topic
from shared.logger.logger import get_logger

logger = get_logger("aether.repository")

T = TypeVar("T", bound=dict)


# ═══════════════════════════════════════════════════════════════════════════
# BASE REPOSITORY (TimescaleDB / relational)
# ═══════════════════════════════════════════════════════════════════════════

class BaseRepository(ABC):
    """
    Abstract base for relational repositories.
    Stub uses in-memory dicts. Replace with asyncpg + PgBouncer pool.
    """

    def __init__(self, table_name: str) -> None:
        self.table_name = table_name
        self._store: dict[str, dict] = {}

    async def find_by_id(self, record_id: str) -> Optional[dict]:
        return self._store.get(record_id)

    async def find_by_id_or_fail(self, record_id: str) -> dict:
        record = await self.find_by_id(record_id)
        if record is None:
            raise NotFoundError(self.table_name)
        return record

    async def find_many(
        self,
        filters: Optional[dict[str, Any]] = None,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> list[dict]:
        results = list(self._store.values())
        if filters:
            results = [
                r for r in results
                if all(r.get(k) == v for k, v in filters.items())
            ]
        # Sort by field if it exists
        reverse = sort_order == "desc"
        results.sort(key=lambda r: r.get(sort_by, ""), reverse=reverse)
        return results[offset : offset + limit]

    async def count(self, filters: Optional[dict[str, Any]] = None) -> int:
        if not filters:
            return len(self._store)
        return len([
            r for r in self._store.values()
            if all(r.get(k) == v for k, v in filters.items())
        ])

    async def insert(self, record_id: str, data: dict) -> dict:
        data["id"] = record_id
        data["created_at"] = utc_now().isoformat()
        data["updated_at"] = utc_now().isoformat()
        self._store[record_id] = data
        logger.info(f"INSERT {self.table_name} id={record_id}")
        return data

    async def update(self, record_id: str, data: dict) -> dict:
        existing = await self.find_by_id_or_fail(record_id)
        existing.update(data)
        existing["updated_at"] = utc_now().isoformat()
        logger.info(f"UPDATE {self.table_name} id={record_id}")
        return existing

    async def delete(self, record_id: str) -> bool:
        if record_id in self._store:
            del self._store[record_id]
            logger.info(f"DELETE {self.table_name} id={record_id}")
            return True
        return False


# ═══════════════════════════════════════════════════════════════════════════
# IDENTITY REPOSITORY (Neptune graph + TimescaleDB)
# ═══════════════════════════════════════════════════════════════════════════

class IdentityRepository:
    """Manages user profiles in both the graph and relational store."""

    def __init__(self, graph: GraphClient, cache: CacheClient) -> None:
        self.graph = graph
        self.cache = cache
        self._profiles = _ProfileStore()

    async def get_profile(self, tenant_id: str, user_id: str) -> Optional[dict]:
        key = CacheKey.profile(tenant_id, user_id)
        cached = await self.cache.get_json(key)
        if cached:
            return cached

        profile = await self._profiles.find_by_id(user_id)
        if profile:
            await self.cache.set_json(key, profile, TTL.PROFILE)
        return profile

    async def upsert_profile(self, tenant_id: str, user_id: str, data: dict) -> dict:
        existing = await self._profiles.find_by_id(user_id)
        if existing:
            profile = await self._profiles.update(user_id, data)
        else:
            profile = await self._profiles.insert(
                user_id, {**data, "tenant_id": tenant_id}
            )

        vertex = Vertex(
            vertex_type=VertexType.USER,
            vertex_id=user_id,
            properties={"tenant_id": tenant_id, **data},
        )
        await self.graph.upsert_vertex(vertex)
        await self.cache.delete(CacheKey.profile(tenant_id, user_id))
        return profile

    async def merge_identities(
        self,
        tenant_id: str,
        primary_id: str,
        secondary_id: str,
    ) -> dict:
        """Merge two user profiles into one (identity resolution)."""
        primary = await self._profiles.find_by_id_or_fail(primary_id)
        secondary = await self._profiles.find_by_id_or_fail(secondary_id)

        for key, value in secondary.items():
            if key not in primary or primary[key] is None:
                primary[key] = value

        await self._profiles.update(primary_id, primary)
        await self._profiles.delete(secondary_id)

        edge = Edge(
            edge_type=EdgeType.RESOLVED_AS,
            from_vertex_id=secondary_id,
            to_vertex_id=primary_id,
            properties={"merged_at": utc_now().isoformat()},
        )
        await self.graph.add_edge(edge)

        await self.cache.delete(CacheKey.profile(tenant_id, primary_id))
        await self.cache.delete(CacheKey.profile(tenant_id, secondary_id))
        return primary

    async def get_graph_neighbors(self, user_id: str) -> list[dict]:
        neighbors = await self.graph.get_neighbors(user_id, direction="out")
        return [
            {"id": v.vertex_id, "type": v.vertex_type, "properties": v.properties}
            for v in neighbors
        ]


# ═══════════════════════════════════════════════════════════════════════════
# ANALYTICS REPOSITORY (TimescaleDB + Redis caching)
# ═══════════════════════════════════════════════════════════════════════════

class AnalyticsRepository:
    """Query engine for dashboards — uses TimescaleDB with Redis query caching."""

    def __init__(self, cache: CacheClient) -> None:
        self.cache = cache
        self._events = _EventStore()
        self._sessions = _SessionStore()

    async def query_events(
        self,
        tenant_id: str,
        query_params: dict,
        limit: int = 100,
    ) -> list[dict]:
        cache_key = CacheKey.analytics_query(
            tenant_id, CacheKey.hash_query(str(query_params))
        )
        cached = await self.cache.get_json(cache_key)
        if cached:
            return cached

        results = await self._events.find_many(
            filters={"tenant_id": tenant_id, **query_params},
            limit=limit,
        )
        await self.cache.set_json(cache_key, results, TTL.MEDIUM)
        return results

    async def record_event(self, event_id: str, data: dict) -> dict:
        return await self._events.insert(event_id, data)

    async def get_event(self, event_id: str) -> dict:
        return await self._events.find_by_id_or_fail(event_id)

    async def dashboard_summary(self, tenant_id: str) -> dict:
        events = await self._events.count(filters={"tenant_id": tenant_id})
        sessions = await self._sessions.count(filters={"tenant_id": tenant_id})
        return {
            "period": "24h",
            "total_events": events,
            "total_sessions": sessions,
            "unique_users": 0,
            "top_event_types": [],
        }


# ═══════════════════════════════════════════════════════════════════════════
# CAMPAIGN REPOSITORY
# ═══════════════════════════════════════════════════════════════════════════

class CampaignRepository(BaseRepository):
    def __init__(self) -> None:
        super().__init__("campaigns")


# ═══════════════════════════════════════════════════════════════════════════
# CONSENT REPOSITORY (DynamoDB-backed)
# ═══════════════════════════════════════════════════════════════════════════

class ConsentRepository(BaseRepository):
    """
    Consent records and data subject requests.
    In production backed by DynamoDB for single-digit-ms reads.
    """
    def __init__(self) -> None:
        super().__init__("consent_records")

    async def get_consent(self, tenant_id: str, user_id: str) -> Optional[dict]:
        records = await self.find_many(
            filters={"tenant_id": tenant_id, "user_id": user_id}, limit=1
        )
        return records[0] if records else None


# ═══════════════════════════════════════════════════════════════════════════
# NOTIFICATION REPOSITORY
# ═══════════════════════════════════════════════════════════════════════════

class WebhookRepository(BaseRepository):
    def __init__(self) -> None:
        super().__init__("webhooks")


class AlertRepository(BaseRepository):
    def __init__(self) -> None:
        super().__init__("alerts")


# ═══════════════════════════════════════════════════════════════════════════
# ADMIN REPOSITORY (DynamoDB-backed)
# ═══════════════════════════════════════════════════════════════════════════

class AdminRepository(BaseRepository):
    """Tenant management, billing, API key records."""
    def __init__(self) -> None:
        super().__init__("tenants")


class APIKeyRepository(BaseRepository):
    """API key storage (hashed keys in production)."""
    def __init__(self) -> None:
        super().__init__("api_keys")


# ═══════════════════════════════════════════════════════════════════════════
# PRIVATE CONCRETE STORES (used by composite repos above)
# ═══════════════════════════════════════════════════════════════════════════

class _ProfileStore(BaseRepository):
    def __init__(self) -> None:
        super().__init__("profiles")


class _EventStore(BaseRepository):
    def __init__(self) -> None:
        super().__init__("events")


class _SessionStore(BaseRepository):
    def __init__(self) -> None:
        super().__init__("sessions")
