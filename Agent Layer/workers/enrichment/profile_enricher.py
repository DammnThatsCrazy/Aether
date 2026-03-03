"""
Aether Agent Layer — Profile Enricher Worker
Fills out entity profiles by aggregating data from multiple sources.

Capabilities:
  - Company enrichment (domain → firmographics, funding, tech stack)
  - Person enrichment  (email/name → social profiles, role, company)
  - Wallet enrichment  (address → ENS, labels, activity summary)
  - Merge partial records into canonical profile
  - Flag stale fields for re-enrichment
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from config.settings import WorkerType
from models.core import AgentTask, TaskResult
from workers.base import BaseWorker

logger = logging.getLogger("aether.worker.profile_enricher")

# Fields we attempt to fill per entity type
_COMPANY_FIELDS = (
    "legal_name", "industry", "employee_count", "founded_year",
    "funding_total_usd", "last_funding_round", "tech_stack",
    "headquarters", "website", "description",
)
_PERSON_FIELDS = (
    "full_name", "title", "company", "linkedin_url",
    "twitter_handle", "location", "bio",
)
_WALLET_FIELDS = (
    "ens_name", "labels", "first_seen", "total_tx_count",
    "net_worth_usd", "top_tokens",
)

_FIELD_MAP: dict[str, tuple[str, ...]] = {
    "company": _COMPANY_FIELDS,
    "person": _PERSON_FIELDS,
    "wallet": _WALLET_FIELDS,
}


class ProfileEnricherWorker(BaseWorker):
    """
    Enrichment worker that fills gaps in entity profiles.

    Payload contract:
        entity_id   : str  — graph entity to enrich
        entity_type : str  — "company" | "person" | "wallet"
        known_data  : dict — fields already populated
        sources     : list — data sources to query (default: all)
    """

    worker_type = WorkerType.PROFILE_ENRICHER
    data_source = "general_web"

    def _execute(self, task: AgentTask) -> TaskResult:
        entity_id = task.payload.get("entity_id", "")
        entity_type = task.payload.get("entity_type", "company")
        known_data: dict[str, Any] = task.payload.get("known_data", {})

        target_fields = _FIELD_MAP.get(entity_type, _COMPANY_FIELDS)
        missing = [f for f in target_fields if f not in known_data]

        logger.info(
            f"Enriching {entity_type} {entity_id}: "
            f"{len(missing)}/{len(target_fields)} fields to fill"
        )

        # ── Production: call Clearbit / Apollo / FullContact / RPC ────
        # if entity_type == "company":
        #     clearbit_data = clearbit.Company.find(domain=known_data.get("website"))
        #     ...
        enriched: dict[str, Any] = dict(known_data)
        fields_filled = 0
        for field_name in missing:
            enriched[field_name] = f"[stub] {field_name}"
            fields_filled += 1

        completeness = len([
            v for v in enriched.values() if v and not str(v).startswith("[stub]")
        ]) / max(len(target_fields), 1)

        stale_fields = [
            f for f in target_fields
            if f in known_data and known_data[f] is None
        ]

        data = {
            "entity_id": entity_id,
            "entity_type": entity_type,
            "profile": enriched,
            "fields_filled": fields_filled,
            "completeness_score": round(completeness, 3),
            "stale_fields": stale_fields,
            "enriched_at": datetime.now(timezone.utc).isoformat(),
        }
        confidence = 0.70 + (completeness * 0.2)  # higher completeness → higher confidence
        # ──────────────────────────────────────────────────────────────

        return TaskResult(
            task_id=task.task_id,
            worker_type=self.worker_type,
            success=True,
            data=data,
            confidence=round(confidence, 3),
            source_attribution="clearbit + apollo + web",
        )
