"""
Aether Service — Pricing Engine
Resolves price for a protected resource given tenant, subject, and plan context.
Uses base price + tenant multiplier + plan discounts.
"""

from __future__ import annotations

from typing import Optional

from shared.logger.logger import get_logger

from .commerce_models import ProtectedResource
from .resources import get_resource_registry

logger = get_logger("aether.service.x402.pricing")


class PricingEngine:
    """Resolves the USD price for access to a protected resource."""

    def __init__(self) -> None:
        self._registry = get_resource_registry()

    async def resolve_price(
        self,
        tenant_id: str,
        resource_id: str,
        plan_code: Optional[str] = None,
        quantity: int = 1,
    ) -> dict:
        """Return {'resource_id', 'unit_price_usd', 'total_usd', 'currency'}."""
        resource = await self._registry.get(tenant_id, resource_id)
        if not resource:
            raise ValueError(f"Unknown resource: {resource_id}")

        unit = resource.price_usd
        # Plan discounts (simple): "pro" -> 20%, "enterprise" -> 40%
        if plan_code == "pro":
            unit *= 0.80
        elif plan_code == "enterprise":
            unit *= 0.60

        total = round(unit * quantity, 6)
        return {
            "resource_id": resource_id,
            "unit_price_usd": round(unit, 6),
            "total_usd": total,
            "currency": "USD",
            "asset_symbol": "USDC",
        }

    async def quote_for(
        self, tenant_id: str, resource: ProtectedResource
    ) -> float:
        return resource.price_usd
