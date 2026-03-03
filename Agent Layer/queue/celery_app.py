"""
Aether Agent Layer — Celery Application
Configures the Celery app with Redis broker, priority queues,
task routing, and retry policies.

Usage:
    # Start worker:
    celery -A queue.celery_app worker -l info -Q discovery,enrichment,default

    # Start beat scheduler:
    celery -A queue.celery_app beat -l info
"""

from __future__ import annotations

import os
import logging

logger = logging.getLogger("aether.queue")

# Broker / backend URLs (default to local Redis)
BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")

# ---------------------------------------------------------------------------
# Celery app factory (lazy — only imports Celery if available)
# ---------------------------------------------------------------------------

_celery_app = None
_CELERY_AVAILABLE = False

try:
    from celery import Celery

    _celery_app = Celery(
        "aether_agent",
        broker=BROKER_URL,
        backend=RESULT_BACKEND,
    )

    _celery_app.conf.update(
        # Serialization
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",

        # Timezone
        timezone="UTC",
        enable_utc=True,

        # Priority queues (0 = highest)
        task_queue_max_priority=10,
        task_default_priority=5,

        # Routing: discovery and enrichment get dedicated queues
        task_routes={
            "queue.tasks.execute_discovery_task": {"queue": "discovery"},
            "queue.tasks.execute_enrichment_task": {"queue": "enrichment"},
            "queue.tasks.execute_task": {"queue": "default"},
        },

        # Default queue
        task_default_queue="default",

        # Retry defaults
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        worker_prefetch_multiplier=4,

        # Result expiry (24 hours)
        result_expires=86400,

        # Concurrency
        worker_concurrency=int(os.getenv("CELERY_CONCURRENCY", "8")),
    )

    _CELERY_AVAILABLE = True
    logger.info("Celery configured (broker=%s)", BROKER_URL)

except ImportError:
    logger.info(
        "Celery not installed — falling back to in-memory queue. "
        "Install with: pip install celery[redis]"
    )


def get_celery_app() -> "Celery | None":
    """Return the Celery app instance, or None if Celery is not installed."""
    return _celery_app


def is_celery_available() -> bool:
    return _CELERY_AVAILABLE
