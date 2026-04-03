"""
Aether Backend — Repository Pattern
Each service accesses data stores through repository classes that abstract
query logic from business logic. Includes connection pooling, prepared
statements, and write-ahead logging hooks.
"""

from __future__ import annotations

from abc import ABC
from typing import Any, Optional, TypeVar

from shared.cache.cache import TTL, CacheClient, CacheKey
from shared.common.common import NotFoundError, utc_now
from shared.graph.graph import Edge, EdgeType, GraphClient, Vertex, VertexType
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

    def __init__(self, table_name: str):
        self.table_name = table_name
        self._store: dict[str, dict] = {}
        # --- PRODUCTION ---
        # self._pool = asyncpg.create_pool(dsn=settings.timescaledb.dsn, ...)

    async def find_by_id(self, record_id: str) -> Optional[dict]:
        return self._store.get(record_id)

    async def find_by_id_or_fail(self, record_id: str) -> dict:
        record = await self.find_by_id(record_id)
        if record is None:
            raise NotFoundError(self.table_name)
        return record

    async def find_many(
        self,
        filters: dict[str, Any] | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        results = list(self._store.values())
        if filters:
            results = [
                r for r in results
                if all(r.get(k) == v for k, v in filters.items())
            ]
        return results[offset : offset + limit]

    async def count(self, filters: dict[str, Any] | None = None) -> int:
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

    def __init__(self, graph: GraphClient, cache: CacheClient):
        self.graph = graph
        self.cache = cache
        self._profiles = BaseRepository("profiles")

    async def get_profile(self, tenant_id: str, user_id: str) -> Optional[dict]:
        # Check cache first
        key = CacheKey.profile(tenant_id, user_id)
        cached = await self.cache.get_json(key)
        if cached:
            return cached

        # Fall back to DB
        profile = await self._profiles.find_by_id(user_id)
        if profile:
            await self.cache.set_json(key, profile, TTL.PROFILE)
        return profile

    async def upsert_profile(self, tenant_id: str, user_id: str, data: dict) -> dict:
        # Write to relational
        existing = await self._profiles.find_by_id(user_id)
        if existing:
            profile = await self._profiles.update(user_id, data)
        else:
            profile = await self._profiles.insert(user_id, {**data, "tenant_id": tenant_id})

        # Write to graph
        vertex = Vertex(
            vertex_type=VertexType.USER,
            vertex_id=user_id,
            properties={"tenant_id": tenant_id, **data},
        )
        await self.graph.upsert_vertex(vertex)

        # Invalidate cache
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

        # Merge fields (primary wins on conflicts)
        for key, value in secondary.items():
            if key not in primary or primary[key] is None:
                primary[key] = value

        await self._profiles.update(primary_id, primary)
        await self._profiles.delete(secondary_id)

        # Create RESOLVED_AS edge in graph
        edge = Edge(
            edge_type=EdgeType.RESOLVED_AS,
            from_vertex_id=secondary_id,
            to_vertex_id=primary_id,
            properties={"merged_at": utc_now().isoformat()},
        )
        await self.graph.add_edge(edge)

        # Invalidate caches
        await self.cache.delete(CacheKey.profile(tenant_id, primary_id))
        await self.cache.delete(CacheKey.profile(tenant_id, secondary_id))

        return primary


# ═══════════════════════════════════════════════════════════════════════════
# ANALYTICS REPOSITORY (TimescaleDB + Redis caching)
# ═══════════════════════════════════════════════════════════════════════════

class AnalyticsRepository:
    """Query engine for dashboards — uses TimescaleDB with Redis query caching."""

    def __init__(self, cache: CacheClient):
        self.cache = cache
        self._events = BaseRepository("events")
        self._sessions = BaseRepository("sessions")

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


# ═══════════════════════════════════════════════════════════════════════════
# CAMPAIGN REPOSITORY
# ═══════════════════════════════════════════════════════════════════════════

class CampaignRepository(BaseRepository):
    def __init__(self):
        super().__init__("campaigns")


# ═══════════════════════════════════════════════════════════════════════════
# CONSENT REPOSITORY (DynamoDB-backed)
# ═══════════════════════════════════════════════════════════════════════════

class ConsentRepository(BaseRepository):
    """
    Consent records and data subject requests.
    In production backed by DynamoDB for single-digit-ms reads.
    """
    def __init__(self):
        super().__init__("consent_records")

    async def get_consent(self, tenant_id: str, user_id: str) -> Optional[dict]:
        records = await self.find_many(
            filters={"tenant_id": tenant_id, "user_id": user_id}, limit=1
        )
        return records[0] if records else None


# ═══════════════════════════════════════════════════════════════════════════
# ADMIN REPOSITORY (DynamoDB-backed)
# ═══════════════════════════════════════════════════════════════════════════

class AdminRepository(BaseRepository):
    """Tenant management, billing, API key records."""
    def __init__(self):
        super().__init__("tenants")
