"""
Aether Service — x402 Economic Graph
In-memory economic subgraph built from x402 payments.
Snapshots to Neptune (GraphClient) periodically.
"""

from __future__ import annotations

import asyncio
from typing import Optional

from shared.graph.graph import Edge, EdgeType, GraphClient, Vertex, VertexType
from shared.logger.logger import get_logger, metrics

from .models import CapturedX402Transaction, SpendingSummary, X402Node

logger = get_logger("aether.service.x402.economic_graph")

SNAPSHOT_INTERVAL_S = 30


class X402EconomicGraph:
    """
    Builds an in-memory economic subgraph from x402 payments.
    Snapshots to Neptune via GraphClient every 30 seconds.
    """

    def __init__(self, graph_client: Optional[GraphClient] = None):
        self._graph = graph_client or GraphClient()
        self._nodes: dict[str, X402Node] = {}
        self._payments: list[CapturedX402Transaction] = []
        self._snapshot_task: Optional[asyncio.Task] = None

    def add_payment(self, tx: CapturedX402Transaction) -> None:
        """Add a captured x402 payment to the economic graph."""
        # Update payer node
        payer = self._nodes.setdefault(
            tx.payer_agent_id,
            X402Node(node_id=tx.payer_agent_id, node_type="agent"),
        )
        payer.total_paid_usd += tx.amount_usd
        payer.transaction_count += 1

        # Update payee node
        payee = self._nodes.setdefault(
            tx.payee_service_id,
            X402Node(node_id=tx.payee_service_id, node_type="service"),
        )
        payee.total_received_usd += tx.amount_usd
        payee.transaction_count += 1

        self._payments.append(tx)
        metrics.increment("x402_graph_payments_added")

    async def snapshot_to_graph(self) -> int:
        """Flush in-memory economic graph to the persistent graph database."""
        edges_created = 0

        for tx in self._payments:
            # Ensure payer (Agent) vertex exists
            await self._graph.upsert_vertex(Vertex(
                vertex_type=VertexType.AGENT,
                vertex_id=tx.payer_agent_id,
                properties={"node_role": "x402_payer"},
            ))

            # Ensure payee (Service) vertex exists
            await self._graph.upsert_vertex(Vertex(
                vertex_type=VertexType.SERVICE,
                vertex_id=tx.payee_service_id,
                properties={"node_role": "x402_payee"},
            ))

            # Create PAYS edge
            await self._graph.add_edge(Edge(
                edge_type=EdgeType.PAYS,
                from_vertex_id=tx.payer_agent_id,
                to_vertex_id=tx.payee_service_id,
                properties={
                    "amount": str(tx.amount_usd),
                    "token": tx.terms.token,
                    "chain": tx.terms.chain,
                    "capture_id": tx.capture_id,
                    "method": "x402",
                },
            ))

            # Create CONSUMES edge (agent → service)
            await self._graph.add_edge(Edge(
                edge_type=EdgeType.CONSUMES,
                from_vertex_id=tx.payer_agent_id,
                to_vertex_id=tx.payee_service_id,
                properties={
                    "api_call_url": tx.request_url,
                    "method": tx.request_method,
                },
            ))

            edges_created += 2

        snapshot_count = len(self._payments)
        self._payments.clear()

        logger.info(f"Economic graph snapshot: {snapshot_count} payments → {edges_created} edges")
        metrics.increment("x402_graph_snapshots", labels={"edges": str(edges_created)})
        return edges_created

    def get_spending_patterns(self, agent_id: str) -> SpendingSummary:
        """Get spending patterns for an agent."""
        agent_payments = [
            p for p in self._payments
            if p.payer_agent_id == agent_id
        ]

        node = self._nodes.get(agent_id)
        unique_services = len({p.payee_service_id for p in agent_payments})
        total_spent = node.total_paid_usd if node else 0.0
        total_tx = node.transaction_count if node else 0

        return SpendingSummary(
            agent_id=agent_id,
            total_spent_usd=round(total_spent, 4),
            total_transactions=total_tx,
            unique_services=unique_services,
            avg_payment_usd=round(total_spent / total_tx, 4) if total_tx > 0 else 0.0,
            fee_eliminated_usd=round(sum(p.fee_eliminated_usd for p in agent_payments), 4),
            payments=[p.model_dump() for p in agent_payments[-20:]],  # Last 20
        )

    def get_graph_snapshot(self) -> dict:
        """Get current state of the economic graph."""
        return {
            "nodes": {nid: n.model_dump() for nid, n in self._nodes.items()},
            "node_count": len(self._nodes),
            "pending_payments": len(self._payments),
            "total_volume_usd": round(
                sum(n.total_paid_usd for n in self._nodes.values() if n.node_type == "agent"),
                2,
            ),
        }
