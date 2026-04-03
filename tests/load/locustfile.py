"""
Aether Backend — Load & Soak Testing (Locust)

Simulates realistic traffic patterns for:
  - GraphQL queries (high QPS, complexity rejection)
  - Analytics exports (idempotent burst + polling)
  - Agent tasks (burst creation + status polling)
  - Campaign touchpoints (write/read-after-write consistency)

Usage:
    pip install locust
    locust -f tests/load/locustfile.py --host http://localhost:8000

Headless mode with thresholds:
    locust -f tests/load/locustfile.py --host http://localhost:8000 \
           --headless -u 50 -r 10 --run-time 5m \
           --csv results/load-test

Staging signoff thresholds:
    p95 < 200ms for GraphQL
    p95 < 500ms for exports
    p99 < 1000ms for agent tasks
    Error rate < 1%
    Zero data loss on concurrent touchpoint writes
"""

from __future__ import annotations

import random
import string
import uuid

from locust import HttpUser, TaskSet, between, task

# =========================================================================
# Test Data Generators
# =========================================================================

def _random_string(n: int = 8) -> str:
    return "".join(random.choices(string.ascii_lowercase, k=n))


def _api_headers(tenant_id: str = "load-test-tenant") -> dict:
    return {
        "X-API-Key": f"test-key-{tenant_id}",
        "Content-Type": "application/json",
        "X-Request-ID": str(uuid.uuid4()),
    }


# =========================================================================
# GraphQL Load Tests
# =========================================================================

class GraphQLTasks(TaskSet):
    """High-QPS GraphQL query workload."""

    headers = _api_headers()

    @task(10)
    def valid_events_query(self):
        """Standard events query — should always succeed."""
        self.client.post(
            "/v1/analytics/graphql",
            json={
                "query": "{ events { event_id event_type timestamp } }",
                "variables": {},
            },
            headers=self.headers,
            name="/v1/analytics/graphql [events]",
        )

    @task(5)
    def valid_campaigns_query(self):
        """Campaign query — exercises different resolver path."""
        self.client.post(
            "/v1/analytics/graphql",
            json={
                "query": "{ campaigns { campaign_id name channel } }",
                "variables": {"status": "active"},
            },
            headers=self.headers,
            name="/v1/analytics/graphql [campaigns]",
        )

    @task(2)
    def filtered_events_query(self):
        """Events with variable filters."""
        self.client.post(
            "/v1/analytics/graphql",
            json={
                "query": "{ events { event_id event_type user_id } }",
                "variables": {"event_type": "page_view"},
            },
            headers=self.headers,
            name="/v1/analytics/graphql [filtered]",
        )

    @task(1)
    def introspection_attempt(self):
        """Should be rejected — tests security enforcement at scale."""
        with self.client.post(
            "/v1/analytics/graphql",
            json={"query": "{ __schema { types { name } } }"},
            headers=self.headers,
            name="/v1/analytics/graphql [introspection-rejected]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 400:
                resp.success()  # Expected rejection

    @task(1)
    def deep_query_attempt(self):
        """Should be rejected — depth limit enforcement."""
        deep = "{ events { event_id { a { b { c { d { e } } } } } } }"
        with self.client.post(
            "/v1/analytics/graphql",
            json={"query": deep},
            headers=self.headers,
            name="/v1/analytics/graphql [depth-rejected]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 400:
                resp.success()


# =========================================================================
# Analytics Export Load Tests
# =========================================================================

class ExportTasks(TaskSet):
    """Idempotent export requests + polling."""

    headers = _api_headers()

    @task(5)
    def create_export(self):
        """Create a new export job."""
        resp = self.client.post(
            "/v1/analytics/export",
            json={"format": random.choice(["csv", "json", "parquet"])},
            headers=self.headers,
            name="/v1/analytics/export [create]",
        )
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            export_id = data.get("export_id")
            if export_id:
                # Immediately poll the status
                self.client.get(
                    f"/v1/analytics/export/{export_id}",
                    headers=self.headers,
                    name="/v1/analytics/export/{id} [poll]",
                )

    @task(3)
    def idempotent_export(self):
        """Submit the same export twice — should return same job."""
        payload = {"format": "csv", "query": {"event_type": "page_view"}}
        self.client.post(
            "/v1/analytics/export",
            json=payload,
            headers=self.headers,
            name="/v1/analytics/export [idempotent-1]",
        )
        self.client.post(
            "/v1/analytics/export",
            json=payload,
            headers=self.headers,
            name="/v1/analytics/export [idempotent-2]",
        )

    @task(1)
    def poll_nonexistent(self):
        """Poll a non-existent export — should 404."""
        with self.client.get(
            f"/v1/analytics/export/nonexistent-{uuid.uuid4()}",
            headers=self.headers,
            name="/v1/analytics/export/{id} [404]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 404:
                resp.success()


# =========================================================================
# Agent Task Load Tests
# =========================================================================

class AgentTaskTasks(TaskSet):
    """Burst task creation + status polling."""

    headers = _api_headers()
    worker_types = [
        "web_crawler", "api_scanner", "social_listener",
        "entity_resolver", "profile_enricher", "quality_scorer",
    ]
    created_task_ids: list[str] = []

    @task(8)
    def create_task(self):
        """Create a new agent task."""
        resp = self.client.post(
            "/v1/agent/tasks",
            json={
                "worker_type": random.choice(self.worker_types),
                "priority": random.choice(["high", "medium", "low"]),
                "payload": {"target": f"entity-{_random_string()}"},
            },
            headers=self.headers,
            name="/v1/agent/tasks [create]",
        )
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            task_id = data.get("task_id")
            if task_id:
                self.created_task_ids.append(task_id)

    @task(5)
    def poll_task(self):
        """Poll a recently created task."""
        if self.created_task_ids:
            task_id = random.choice(self.created_task_ids[-20:])
            self.client.get(
                f"/v1/agent/tasks/{task_id}",
                headers=self.headers,
                name="/v1/agent/tasks/{id} [poll]",
            )

    @task(2)
    def get_audit(self):
        """Fetch audit trail."""
        self.client.get(
            "/v1/agent/audit?limit=20",
            headers=self.headers,
            name="/v1/agent/audit [list]",
        )

    @task(1)
    def invalid_worker_type(self):
        """Should be rejected — validation enforcement."""
        with self.client.post(
            "/v1/agent/tasks",
            json={"worker_type": "nonexistent_worker", "payload": {}},
            headers=self.headers,
            name="/v1/agent/tasks [invalid-rejected]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 400:
                resp.success()


# =========================================================================
# Campaign Touchpoint Load Tests
# =========================================================================

class CampaignTasks(TaskSet):
    """Write/read-after-write consistency for campaign touchpoints."""

    headers = _api_headers()

    def on_start(self):
        """Create a test campaign to write touchpoints to."""
        self.campaign_id = None
        resp = self.client.post(
            "/v1/campaigns",
            json={
                "name": f"Load Test Campaign {_random_string()}",
                "channel": "email",
                "start_date": "2025-01-01",
            },
            headers=self.headers,
            name="/v1/campaigns [create-setup]",
        )
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            self.campaign_id = data.get("id")

    @task(8)
    def write_touchpoint(self):
        """Record a touchpoint."""
        if not self.campaign_id:
            return
        self.client.post(
            f"/v1/campaigns/{self.campaign_id}/touchpoints",
            json={
                "channel": random.choice(["email", "social", "direct"]),
                "event_type": random.choice(["view", "click", "purchase"]),
                "is_conversion": random.random() < 0.1,
                "revenue_usd": round(random.uniform(0, 100), 2) if random.random() < 0.1 else 0,
                "user_id": f"user-{random.randint(1, 100)}",
            },
            headers=self.headers,
            name="/v1/campaigns/{id}/touchpoints [write]",
        )

    @task(3)
    def read_attribution(self):
        """Read attribution after writes — consistency check."""
        if not self.campaign_id:
            return
        self.client.get(
            f"/v1/campaigns/{self.campaign_id}/attribution?model=linear",
            headers=self.headers,
            name="/v1/campaigns/{id}/attribution [read]",
        )


# =========================================================================
# User Profiles
# =========================================================================

class SteadyStateUser(HttpUser):
    """Normal production traffic — mixed workload."""
    tasks = {
        GraphQLTasks: 4,
        ExportTasks: 2,
        AgentTaskTasks: 2,
        CampaignTasks: 2,
    }
    wait_time = between(0.5, 2.0)


class BurstUser(HttpUser):
    """Burst traffic — hammers agent tasks and GraphQL."""
    tasks = {
        GraphQLTasks: 6,
        AgentTaskTasks: 4,
    }
    wait_time = between(0.1, 0.5)


class ExportHeavyUser(HttpUser):
    """Export-heavy workload — tests idempotency under load."""
    tasks = {ExportTasks: 1}
    wait_time = between(0.2, 1.0)
