"""
Aether Agent Layer — Temporal Filler Enrichment Worker
Fills gaps in entity timelines by interpolating or back-filling
historical data points.

Capabilities:
  - Detect temporal gaps in entity event streams
  - Query historical APIs (Wayback Machine, SEC EDGAR, archive.org)
  - Interpolate missing metric data points (linear / carry-forward)
  - Back-fill funding rounds, hiring events, product launches
  - Assign confidence based on source recency and type
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any

from config.settings import WorkerType
from models.core import AgentTask, TaskResult
from workers.base import BaseWorker

logger = logging.getLogger("aether.worker.temporal_filler")


class TemporalFillerWorker(BaseWorker):
    """
    Enrichment worker that fills temporal gaps in entity timelines.

    Payload contract:
        entity_id       : str           — graph entity
        timeline_events : list[dict]    — existing dated events (sorted)
        gap_threshold   : str           — e.g. "30d" — interval that counts as a gap
        fill_strategy   : str           — "interpolate" | "backfill_api" | "hybrid"
        metric_fields   : list[str]     — numeric fields to interpolate
    """

    worker_type = WorkerType.TEMPORAL_FILLER
    data_source = "general_web"

    def _execute(self, task: AgentTask) -> TaskResult:
        entity_id = task.payload.get("entity_id", "")
        events = task.payload.get("timeline_events", [])
        gap_threshold = task.payload.get("gap_threshold", "30d")
        strategy = task.payload.get("fill_strategy", "hybrid")
        metric_fields = task.payload.get("metric_fields", [])

        threshold_days = _parse_duration(gap_threshold)

        logger.info(
            f"Filling timeline for {entity_id}: "
            f"{len(events)} events, gap_threshold={gap_threshold}, "
            f"strategy={strategy}"
        )

        # ── Step 1: Detect gaps ───────────────────────────────────────
        gaps = _detect_gaps(events, threshold_days)
        logger.info(f"Detected {len(gaps)} gap(s) in timeline")

        # ── Step 2: Fill gaps ─────────────────────────────────────────
        # Production: query Wayback Machine, SEC EDGAR, CrunchBase, etc.
        filled_events: list[dict[str, Any]] = []
        for gap in gaps:
            filled_events.append({
                "date": gap["midpoint"],
                "source": "interpolation" if strategy != "backfill_api" else "archive",
                "type": "inferred_event",
                "data": {f: "[stub] interpolated" for f in metric_fields},
                "gap_start": gap["start"],
                "gap_end": gap["end"],
                "confidence": 0.5 if strategy == "interpolate" else 0.65,
            })

        data = {
            "entity_id": entity_id,
            "gaps_detected": len(gaps),
            "gaps": gaps,
            "events_filled": len(filled_events),
            "filled_events": filled_events,
            "strategy_used": strategy,
            "original_event_count": len(events),
        }
        avg_conf = (
            sum(e["confidence"] for e in filled_events) / max(len(filled_events), 1)
        )
        confidence = round(avg_conf, 3) if filled_events else 0.5
        # ──────────────────────────────────────────────────────────────

        return TaskResult(
            task_id=task.task_id,
            worker_type=self.worker_type,
            success=True,
            data=data,
            confidence=confidence,
            source_attribution=f"temporal_{strategy}",
        )


# ── Helpers ───────────────────────────────────────────────────────────

def _parse_duration(s: str) -> int:
    """Convert '30d', '7d', '1d' → integer days."""
    s = s.strip().lower()
    if s.endswith("d"):
        return int(s[:-1])
    if s.endswith("h"):
        return max(int(s[:-1]) // 24, 1)
    return 30  # default


def _detect_gaps(
    events: list[dict[str, Any]],
    threshold_days: int,
) -> list[dict[str, str]]:
    """Find gaps larger than threshold between consecutive events."""
    gaps: list[dict[str, str]] = []
    if len(events) < 2:
        return gaps

    sorted_events = sorted(events, key=lambda e: e.get("date", ""))
    for i in range(len(sorted_events) - 1):
        try:
            d1 = datetime.fromisoformat(sorted_events[i]["date"])
            d2 = datetime.fromisoformat(sorted_events[i + 1]["date"])
        except (KeyError, ValueError):
            continue

        delta = (d2 - d1).days
        if delta > threshold_days:
            midpoint = d1 + timedelta(days=delta // 2)
            gaps.append({
                "start": d1.isoformat(),
                "end": d2.isoformat(),
                "gap_days": str(delta),
                "midpoint": midpoint.isoformat(),
            })

    return gaps
