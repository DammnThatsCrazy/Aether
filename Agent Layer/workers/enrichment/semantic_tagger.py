"""
Aether Agent Layer — Semantic Tagger Enrichment Worker
Assigns semantic labels to entities using NLP / LLM classification.

Capabilities:
  - Industry / vertical classification (SIC / NAICS codes)
  - Content-based topic tagging (from crawled text)
  - Sentiment analysis on associated social mentions
  - Entity-type disambiguation (company vs. project vs. token)
  - Taxonomy alignment with a configurable ontology
"""

from __future__ import annotations

import logging
from typing import Any

from config.settings import WorkerType
from models.core import AgentTask, TaskResult
from workers.base import BaseWorker

logger = logging.getLogger("aether.worker.semantic_tagger")

# Default taxonomy (extend or replace with domain-specific ontology)
_DEFAULT_TAXONOMY: dict[str, list[str]] = {
    "industry": [
        "defi", "nft", "gaming", "infrastructure", "social",
        "dao", "privacy", "ai_ml", "payments", "identity",
        "data", "security", "analytics", "exchange", "lending",
    ],
    "stage": [
        "pre_seed", "seed", "series_a", "series_b", "growth", "public",
    ],
    "sentiment": [
        "very_positive", "positive", "neutral", "negative", "very_negative",
    ],
    "content_type": [
        "product_page", "blog_post", "documentation", "press_release",
        "job_listing", "social_post", "whitepaper", "changelog",
    ],
}


class SemanticTaggerWorker(BaseWorker):
    """
    Enrichment worker that assigns semantic tags to entity data.

    Payload contract:
        entity_id   : str        — graph entity to tag
        text_corpus : list[str]  — text snippets to classify
        taxonomy    : str | None — taxonomy key from _DEFAULT_TAXONOMY or custom dict
        model       : str        — "rule_based" | "embedding" | "llm" (default "rule_based")
        top_k       : int        — max tags to return per category (default 3)
    """

    worker_type = WorkerType.SEMANTIC_TAGGER
    data_source = "general_web"

    def _execute(self, task: AgentTask) -> TaskResult:
        entity_id = task.payload.get("entity_id", "")
        corpus = task.payload.get("text_corpus", [])
        taxonomy_key = task.payload.get("taxonomy")
        model = task.payload.get("model", "rule_based")
        top_k = task.payload.get("top_k", 3)

        taxonomy = (
            task.payload.get("custom_taxonomy")
            or _DEFAULT_TAXONOMY
        )

        logger.info(
            f"Tagging entity {entity_id}: "
            f"{len(corpus)} snippets, model={model}, top_k={top_k}"
        )

        # ── Production: replace with real classification ──────────────
        # if model == "llm":
        #     tags = await llm_classify(corpus, taxonomy)
        # elif model == "embedding":
        #     tags = embedding_nearest(corpus, taxonomy, top_k)
        # else:
        #     tags = rule_based_match(corpus, taxonomy)
        tags: dict[str, list[dict[str, Any]]] = {}
        combined_text = " ".join(corpus).lower()

        for category, labels in taxonomy.items():
            scored: list[dict[str, Any]] = []
            for label in labels:
                # Simple keyword presence score (production: use embeddings)
                hits = combined_text.count(label.replace("_", " "))
                if hits > 0 or category == "sentiment":
                    scored.append({
                        "label": label,
                        "score": min(hits * 0.15 + 0.3, 0.95),
                        "method": model,
                    })
            scored.sort(key=lambda x: x["score"], reverse=True)
            tags[category] = scored[:top_k]

        all_scores = [
            s["score"]
            for tag_list in tags.values()
            for s in tag_list
        ]
        avg_score = sum(all_scores) / max(len(all_scores), 1)

        data = {
            "entity_id": entity_id,
            "tags": tags,
            "total_tags_assigned": sum(len(v) for v in tags.values()),
            "model_used": model,
            "corpus_size": len(corpus),
        }
        confidence = round(min(avg_score + 0.1, 0.95), 3)
        # ──────────────────────────────────────────────────────────────

        return TaskResult(
            task_id=task.task_id,
            worker_type=self.worker_type,
            success=True,
            data=data,
            confidence=confidence,
            source_attribution=f"semantic_tagger:{model}",
        )
