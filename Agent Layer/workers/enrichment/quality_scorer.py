"""
Aether Agent Layer — Quality Scorer Enrichment Worker
Evaluates data quality of entity records and assigns composite scores.

Capabilities:
  - Completeness: what % of expected fields are populated?
  - Freshness: how recently was each field updated?
  - Consistency: do cross-referenced fields agree?
  - Source reliability: weight by source trust score
  - Composite DQ score (0-1) written back to entity metadata
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any

from config.settings import WorkerType
from models.core import AgentTask, TaskResult
from workers.base import BaseWorker

logger = logging.getLogger("aether.worker.quality_scorer")

# Source trust scores (higher = more reliable)
_SOURCE_TRUST: dict[str, float] = {
    "etherscan": 0.95,
    "dune_analytics": 0.90,
    "sec_edgar": 0.92,
    "crunchbase": 0.85,
    "clearbit": 0.80,
    "twitter_x": 0.60,
    "reddit": 0.50,
    "web_crawl": 0.55,
    "llm_inference": 0.45,
    "user_submitted": 0.70,
}

# Field freshness decay (days → penalty multiplier)
_FRESHNESS_DECAY_DAYS = 90  # fields older than this get penalized


class QualityScorerWorker(BaseWorker):
    """
    Enrichment worker that scores entity data quality.

    Payload contract:
        entity_id      : str           — graph entity to score
        entity_data    : dict          — current entity fields + values
        field_metadata : dict          — {field: {"source": str, "updated_at": str}}
        required_fields: list[str]     — fields expected for this entity type
    """

    worker_type = WorkerType.QUALITY_SCORER
    data_source = "general_web"  # no external calls, but keep for consistency

    def _execute(self, task: AgentTask) -> TaskResult:
        entity_id = task.payload.get("entity_id", "")
        entity_data: dict[str, Any] = task.payload.get("entity_data", {})
        field_meta: dict[str, dict] = task.payload.get("field_metadata", {})
        required = task.payload.get("required_fields", list(entity_data.keys()))

        logger.info(
            f"Scoring quality for entity {entity_id}: "
            f"{len(entity_data)} fields, {len(required)} required"
        )

        # ── Completeness ──────────────────────────────────────────────
        populated = [
            f for f in required
            if f in entity_data and entity_data[f] is not None
        ]
        completeness = len(populated) / max(len(required), 1)

        # ── Freshness ─────────────────────────────────────────────────
        now = datetime.now(timezone.utc)
        freshness_scores: list[float] = []
        stale_fields: list[str] = []

        for field_name in populated:
            meta = field_meta.get(field_name, {})
            updated_str = meta.get("updated_at")
            if updated_str:
                try:
                    updated = datetime.fromisoformat(updated_str)
                    age_days = (now - updated).days
                    score = max(1.0 - (age_days / _FRESHNESS_DECAY_DAYS), 0.0)
                    freshness_scores.append(score)
                    if age_days > _FRESHNESS_DECAY_DAYS:
                        stale_fields.append(field_name)
                except ValueError:
                    freshness_scores.append(0.5)
            else:
                freshness_scores.append(0.5)  # unknown age → middle score

        freshness = (
            sum(freshness_scores) / max(len(freshness_scores), 1)
        )

        # ── Source reliability ────────────────────────────────────────
        source_scores: list[float] = []
        for field_name in populated:
            meta = field_meta.get(field_name, {})
            src = meta.get("source", "web_crawl")
            source_scores.append(_SOURCE_TRUST.get(src, 0.5))

        source_reliability = (
            sum(source_scores) / max(len(source_scores), 1)
        )

        # ── Consistency (cross-field agreement) ───────────────────────
        consistency = _check_consistency(entity_data)

        # ── Composite score (weighted) ────────────────────────────────
        composite = round(
            completeness * 0.30
            + freshness * 0.25
            + source_reliability * 0.25
            + consistency * 0.20,
            4,
        )

        data = {
            "entity_id": entity_id,
            "scores": {
                "completeness": round(completeness, 4),
                "freshness": round(freshness, 4),
                "source_reliability": round(source_reliability, 4),
                "consistency": round(consistency, 4),
                "composite": composite,
            },
            "populated_fields": len(populated),
            "required_fields": len(required),
            "stale_fields": stale_fields,
            "field_scores": {
                f: {
                    "fresh": round(freshness_scores[i], 3) if i < len(freshness_scores) else 0,
                    "source_trust": round(source_scores[i], 3) if i < len(source_scores) else 0,
                }
                for i, f in enumerate(populated)
            },
        }
        confidence = composite  # quality score IS the confidence
        # ──────────────────────────────────────────────────────────────

        return TaskResult(
            task_id=task.task_id,
            worker_type=self.worker_type,
            success=True,
            data=data,
            confidence=round(confidence, 3),
            source_attribution="quality_scorer:internal",
        )


# ── Helpers ───────────────────────────────────────────────────────────

def _check_consistency(entity_data: dict[str, Any]) -> float:
    """
    Simple cross-field consistency checks.
    Returns 0.0-1.0 (1.0 = fully consistent).
    """
    checks: list[bool] = []

    # Example: if website and domain both exist, they should agree
    website = str(entity_data.get("website", ""))
    domain = str(entity_data.get("domain", ""))
    if website and domain:
        checks.append(domain in website)

    # Example: employee_count should be positive if present
    emp = entity_data.get("employee_count")
    if emp is not None:
        checks.append(isinstance(emp, (int, float)) and emp >= 0)

    # Example: founded_year should be reasonable
    year = entity_data.get("founded_year")
    if year is not None:
        checks.append(
            isinstance(year, int) and 1900 <= year <= datetime.now().year
        )

    if not checks:
        return 0.8  # no checks applicable → assume decent

    return sum(checks) / len(checks)
