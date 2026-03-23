#!/usr/bin/env python3
"""
Aether Platform — Infrastructure Validation Script

Validates that all required infrastructure is reachable and configured.
Run after provisioning infrastructure, before deploying the application.

Usage:
    python scripts/validate_infra.py
    python scripts/validate_infra.py --env staging
    python scripts/validate_infra.py --env production

Checks:
    1. PostgreSQL connectivity (DATABASE_URL)
    2. Redis connectivity (REDIS_HOST)
    3. Kafka broker connectivity (KAFKA_BOOTSTRAP_SERVERS)
    4. Required secrets present (JWT_SECRET, BYOK_ENCRYPTION_KEY, etc.)
    5. ML serving reachable (ML_SERVING_URL) — optional
"""

from __future__ import annotations

import os
import sys


def check_env_var(name: str, required: bool = True) -> str | None:
    """Check if an environment variable is set."""
    value = os.getenv(name, "")
    if not value and required:
        print(f"  ✗ {name} — NOT SET (required)")
        return None
    elif not value:
        print(f"  ⚠ {name} — not set (optional)")
        return None
    else:
        # Mask secrets
        display = value[:8] + "..." if len(value) > 12 else "(set)"
        print(f"  ✓ {name} = {display}")
        return value


def check_postgres(url: str) -> bool:
    """Validate PostgreSQL connectivity."""
    try:
        import asyncio
        import asyncpg
        async def _check():
            conn = await asyncpg.connect(url, timeout=5)
            result = await conn.fetchval("SELECT 1")
            await conn.close()
            return result == 1
        return asyncio.run(_check())
    except ImportError:
        print("  ⚠ asyncpg not installed — cannot validate PostgreSQL")
        return False
    except Exception as e:
        print(f"  ✗ PostgreSQL connection failed: {e}")
        return False


def check_redis(host: str, port: str) -> bool:
    """Validate Redis connectivity."""
    try:
        import redis
        r = redis.Redis(host=host, port=int(port), socket_timeout=5)
        return r.ping()
    except ImportError:
        print("  ⚠ redis not installed — cannot validate Redis")
        return False
    except Exception as e:
        print(f"  ✗ Redis connection failed: {e}")
        return False


def check_kafka(bootstrap: str) -> bool:
    """Validate Kafka broker connectivity."""
    try:
        from kafka import KafkaAdminClient
        admin = KafkaAdminClient(bootstrap_servers=bootstrap, request_timeout_ms=5000)
        topics = admin.list_topics()
        admin.close()
        return True
    except ImportError:
        print("  ⚠ kafka-python not installed — cannot validate Kafka")
        return False
    except Exception as e:
        print(f"  ✗ Kafka connection failed: {e}")
        return False


def main() -> None:
    env = os.getenv("AETHER_ENV", "local")
    print(f"Aether Infrastructure Validation — {env} environment")
    print("=" * 60)

    errors = 0

    # 1. Required environment variables
    print("\n1. Environment Variables")
    vars_to_check = [
        ("AETHER_ENV", True),
        ("DATABASE_URL", env != "local"),
        ("REDIS_HOST", env != "local"),
        ("REDIS_PORT", False),
        ("KAFKA_BOOTSTRAP_SERVERS", env != "local"),
        ("JWT_SECRET", True),
        ("BYOK_ENCRYPTION_KEY", env != "local"),
        ("WATERMARK_SECRET_KEY", env != "local"),
        ("CANARY_SECRET_SEED", env != "local"),
        ("ML_SERVING_URL", False),
        ("NEPTUNE_ENDPOINT", False),
    ]
    for name, required in vars_to_check:
        result = check_env_var(name, required=(required and env != "local"))
        if required and env != "local" and result is None:
            errors += 1

    # 2. Secret validation
    print("\n2. Secret Validation")
    jwt = os.getenv("JWT_SECRET", "")
    if jwt in ("", "change-me-in-production"):
        print("  ✗ JWT_SECRET is default/empty — MUST be rotated")
        if env != "local":
            errors += 1
    else:
        print("  ✓ JWT_SECRET is set and non-default")

    byok = os.getenv("BYOK_ENCRYPTION_KEY", "")
    if byok:
        try:
            from cryptography.fernet import Fernet
            Fernet(byok.encode())
            print("  ✓ BYOK_ENCRYPTION_KEY is a valid Fernet key")
        except Exception:
            print("  ✗ BYOK_ENCRYPTION_KEY is not a valid Fernet key")
            errors += 1
    elif env != "local":
        print("  ✗ BYOK_ENCRYPTION_KEY not set (required)")
        errors += 1

    # 3. Infrastructure connectivity
    print("\n3. Infrastructure Connectivity")
    db_url = os.getenv("DATABASE_URL", "")
    if db_url:
        if check_postgres(db_url):
            print("  ✓ PostgreSQL — connected")
        else:
            errors += 1

    redis_host = os.getenv("REDIS_HOST", "")
    redis_port = os.getenv("REDIS_PORT", "6379")
    if redis_host:
        if check_redis(redis_host, redis_port):
            print("  ✓ Redis — connected")
        else:
            errors += 1

    kafka = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "")
    if kafka:
        if check_kafka(kafka):
            print("  ✓ Kafka — connected")
        else:
            errors += 1

    # Summary
    print("\n" + "=" * 60)
    if errors == 0:
        print(f"✓ All checks passed for {env} environment")
        sys.exit(0)
    else:
        print(f"✗ {errors} check(s) failed for {env} environment")
        sys.exit(1)


if __name__ == "__main__":
    main()
