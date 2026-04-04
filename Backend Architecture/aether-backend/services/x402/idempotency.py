"""
Aether Service — Payment-Identifier Idempotency Store
Dedupe keyed by (tenant_id, payment_identifier). In local mode uses an
in-memory dict with TTL; in production uses Redis via shared/cache.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Optional


DEFAULT_TTL_SECONDS = 86400  # 24h


@dataclass
class IdempotencyEntry:
    payment_identifier: str
    tenant_id: str
    result: dict[str, Any]
    expires_at: float


class IdempotencyStore:
    """TTL-backed idempotency store for Payment-Identifier headers."""

    def __init__(self, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> None:
        self._ttl = ttl_seconds
        self._entries: dict[str, IdempotencyEntry] = {}

    def _key(self, tenant_id: str, payment_identifier: str) -> str:
        return f"{tenant_id}:{payment_identifier}"

    def _purge_expired(self) -> None:
        now = time.time()
        expired = [k for k, e in self._entries.items() if e.expires_at <= now]
        for k in expired:
            del self._entries[k]

    def record(self, tenant_id: str, payment_identifier: str, result: dict[str, Any]) -> None:
        self._purge_expired()
        self._entries[self._key(tenant_id, payment_identifier)] = IdempotencyEntry(
            payment_identifier=payment_identifier,
            tenant_id=tenant_id,
            result=result,
            expires_at=time.time() + self._ttl,
        )

    def lookup(self, tenant_id: str, payment_identifier: str) -> Optional[dict[str, Any]]:
        self._purge_expired()
        entry = self._entries.get(self._key(tenant_id, payment_identifier))
        return entry.result if entry else None

    def size(self) -> int:
        self._purge_expired()
        return len(self._entries)


_store: Optional[IdempotencyStore] = None


def get_idempotency_store() -> IdempotencyStore:
    global _store
    if _store is None:
        _store = IdempotencyStore()
    return _store


def reset_idempotency_store() -> None:
    global _store
    _store = IdempotencyStore()
