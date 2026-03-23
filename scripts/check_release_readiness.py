#!/usr/bin/env python3
"""Validate repo-side release readiness requirements for a target environment."""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class Requirement:
    env_var: str
    description: str


COMMON_REQUIREMENTS = [
    Requirement("AETHER_AUTH_DB_PATH", "durable API-key validation store"),
    Requirement("AETHER_EVENT_BUS_DB_PATH", "durable event bus store"),
    Requirement("AETHER_GRAPH_DB_PATH", "durable graph store"),
    Requirement("AETHER_GUARDRAILS_DB_PATH", "durable guardrails store"),
    Requirement("AETHER_FEEDBACK_DB_PATH", "durable feedback store"),
    Requirement("AETHER_REPOSITORY_DB_PATH", "durable service repository store"),
    Requirement("ORACLE_SIGNER_KEY", "oracle signing key"),
    Requirement("ORACLE_INTERNAL_KEY", "oracle internal key"),
    Requirement("REWARD_CONTRACT_ADDRESS", "reward contract identifier"),
]

ML_REQUIREMENTS = [
    Requirement("AETHER_ML_MODEL_DIR", "directory containing non-local ML artifacts"),
]

QUEUE_REQUIREMENTS = [
    Requirement("CELERY_BROKER_URL", "Celery broker URL for non-local agent execution"),
    Requirement("CELERY_RESULT_BACKEND", "Celery result backend for non-local agent execution"),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target-env",
        default=os.getenv("AETHER_ENV", "local"),
        help="Environment to validate (default: AETHER_ENV or local).",
    )
    return parser.parse_args()


def _has_redis() -> bool:
    return bool(os.getenv("REDIS_URL") or os.getenv("REDIS_HOST"))


def _check_requirements(requirements: list[Requirement]) -> list[str]:
    missing: list[str] = []
    for requirement in requirements:
        if not os.getenv(requirement.env_var):
            missing.append(f"{requirement.env_var}: {requirement.description}")
    return missing


def main() -> int:
    args = parse_args()
    target_env = args.target_env.lower()

    print(f"Checking release readiness for target environment: {target_env}")

    if target_env == "local":
        print("Local mode selected: non-local release gate checks are not required.")
        return 0

    missing = _check_requirements(COMMON_REQUIREMENTS)
    missing.extend(_check_requirements(ML_REQUIREMENTS))
    missing.extend(_check_requirements(QUEUE_REQUIREMENTS))

    if not _has_redis():
        missing.append("REDIS_URL or REDIS_HOST: Redis is required for non-local cache traffic")

    if missing:
        print("Missing required non-local release configuration:")
        for item in missing:
            print(f" - {item}")
        return 1

    print("All required non-local release configuration is present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
