# Load & Soak Testing

## Quick Start

```bash
pip install locust
locust -f tests/load/locustfile.py --host http://localhost:8000
```

Open http://localhost:8089 to control the test.

## Headless Mode (CI)

```bash
# Steady-state: 50 users, 10/s ramp, 5 minutes
locust -f tests/load/locustfile.py --host http://localhost:8000 \
       --headless -u 50 -r 10 --run-time 5m \
       --csv results/steady-state

# Burst: 200 users, 50/s ramp, 2 minutes
locust -f tests/load/locustfile.py --host http://localhost:8000 \
       --headless -u 200 -r 50 --run-time 2m \
       --csv results/burst \
       --class-picker BurstUser

# Soak: 20 users, slow ramp, 30 minutes
locust -f tests/load/locustfile.py --host http://localhost:8000 \
       --headless -u 20 -r 2 --run-time 30m \
       --csv results/soak
```

## Pass/Fail Thresholds (Staging Signoff)

| Metric | Threshold | Action on Failure |
|--------|-----------|-------------------|
| GraphQL p95 | < 200ms | Profile resolver, add query cache |
| Export p95 | < 500ms | Offload to worker, increase query timeout |
| Agent tasks p99 | < 1000ms | Check Kafka latency, lock contention |
| Error rate | < 1% | Investigate 4xx/5xx patterns |
| Touchpoint write loss | 0% | Verify lock correctness |
| Memory growth (30m soak) | < 20% | Check for store leaks, add TTL eviction |

## User Profiles

| Profile | Use Case | Users | Wait |
|---------|----------|-------|------|
| `SteadyStateUser` | Normal production mix | 50 | 0.5-2.0s |
| `BurstUser` | Spike traffic (GraphQL + tasks) | 200 | 0.1-0.5s |
| `ExportHeavyUser` | Export idempotency stress | 20 | 0.2-1.0s |

## What Each Task Tests

| Task | Validates |
|------|-----------|
| GraphQL events query | Resolver performance, field projection |
| GraphQL introspection | Security rejection at scale |
| GraphQL depth limit | Depth check performance |
| Export create + poll | Job creation, idempotency, status retrieval |
| Export idempotent pair | Duplicate detection under concurrency |
| Agent task create | UUID generation, lock contention, audit append |
| Agent task poll | Read-after-write consistency |
| Campaign touchpoint write | Concurrent list append safety |
| Campaign attribution read | Read-after-write consistency, model computation |
