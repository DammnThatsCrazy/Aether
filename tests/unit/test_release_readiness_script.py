from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "check_release_readiness.py"


def test_release_readiness_script_passes_for_local():
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--target-env", "local"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "Local mode selected" in result.stdout


def test_release_readiness_script_fails_for_production_when_config_missing():
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--target-env", "production"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 1
    assert "Missing required non-local release configuration" in result.stdout
    assert "AETHER_AUTH_DB_PATH" in result.stdout
    assert "REDIS_URL or REDIS_HOST" in result.stdout


def test_release_readiness_script_passes_with_required_nonlocal_env(monkeypatch):
    env = {
        "AETHER_AUTH_DB_PATH": "/tmp/auth.sqlite3",
        "AETHER_EVENT_BUS_DB_PATH": "/tmp/events.sqlite3",
        "AETHER_GRAPH_DB_PATH": "/tmp/graph.sqlite3",
        "AETHER_GUARDRAILS_DB_PATH": "/tmp/guardrails.sqlite3",
        "AETHER_FEEDBACK_DB_PATH": "/tmp/feedback.sqlite3",
        "AETHER_REPOSITORY_DB_PATH": "/tmp/repos.sqlite3",
        "ORACLE_SIGNER_KEY": "1" * 64,
        "ORACLE_INTERNAL_KEY": "internal",
        "REWARD_CONTRACT_ADDRESS": "0x" + "2" * 40,
        "AETHER_ML_MODEL_DIR": "/tmp/models",
        "CELERY_BROKER_URL": "redis://localhost:6379/0",
        "CELERY_RESULT_BACKEND": "redis://localhost:6379/1",
        "REDIS_URL": "redis://localhost:6379/2",
    }
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--target-env", "production"],
        cwd=ROOT,
        env={**os.environ, **env},
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "All required non-local release configuration is present." in result.stdout
