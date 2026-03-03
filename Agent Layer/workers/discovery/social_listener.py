"""
Aether Agent Layer — Social Listener Discovery Worker
Monitors social platforms for mentions of tracked entities.

Capabilities:
  - Twitter/X keyword and handle monitoring
  - Reddit subreddit + keyword scans
  - Discord channel monitoring (via bot token)
  - Sentiment extraction per mention
  - Spike detection (abnormal mention volume)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from config.settings import WorkerType
from models.core import AgentTask, TaskResult
from workers.base import BaseWorker

logger = logging.getLogger("aether.worker.social_listener")

# Lightweight sentiment labels (production: use an LLM or VADER/TextBlob)
_SENTIMENT_LABELS = ("positive", "neutral", "negative", "mixed")


class SocialListenerWorker(BaseWorker):
    """
    Discovery worker that collects social media mentions.

    Payload contract:
        entity_id    : str        — graph entity being tracked
        keywords     : list[str]  — search terms / hashtags
        platforms    : list[str]  — subset of ["twitter", "reddit", "discord"]
        since        : str | None — ISO-8601 cutoff (default: last 24 h)
        max_results  : int        — cap per platform (default 100)
    """

    worker_type = WorkerType.SOCIAL_LISTENER
    data_source = "twitter_x"  # primary rate-limit bucket

    def _execute(self, task: AgentTask) -> TaskResult:
        entity_id = task.payload.get("entity_id", "")
        keywords = task.payload.get("keywords", [])
        platforms = task.payload.get("platforms", ["twitter", "reddit"])
        max_results = task.payload.get("max_results", 100)

        logger.info(
            f"Listening for {keywords} across {platforms} "
            f"(entity={entity_id}, max={max_results})"
        )

        # ── Production: replace with real API calls ───────────────────
        # twitter_client = tweepy.Client(bearer_token=...)
        # reddit_client  = asyncpraw.Reddit(...)
        mentions: list[dict[str, Any]] = []
        for platform in platforms:
            for kw in keywords:
                mentions.append({
                    "platform": platform,
                    "keyword": kw,
                    "author": f"@stub_user_{platform}",
                    "text": f"[stub] Mention of '{kw}' on {platform}",
                    "url": f"https://{platform}.com/post/stub",
                    "sentiment": "neutral",
                    "engagement": {"likes": 0, "reposts": 0, "replies": 0},
                    "posted_at": datetime.now(timezone.utc).isoformat(),
                })

        volume = len(mentions)
        spike_detected = volume > max_results * 0.8

        data = {
            "entity_id": entity_id,
            "mentions": mentions,
            "total_volume": volume,
            "spike_detected": spike_detected,
            "sentiment_breakdown": {s: 0 for s in _SENTIMENT_LABELS},
        }
        # Count sentiments
        for m in mentions:
            label = m.get("sentiment", "neutral")
            if label in data["sentiment_breakdown"]:
                data["sentiment_breakdown"][label] += 1

        confidence = 0.75
        # ──────────────────────────────────────────────────────────────

        return TaskResult(
            task_id=task.task_id,
            worker_type=self.worker_type,
            success=True,
            data=data,
            confidence=confidence,
            source_attribution=", ".join(platforms),
        )
