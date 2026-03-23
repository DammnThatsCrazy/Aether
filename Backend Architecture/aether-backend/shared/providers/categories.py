"""
Aether Shared -- Provider Categories & Concrete Adapters

Defines four provider categories and their concrete implementations.
Each adapter makes real HTTP calls via httpx and normalises responses
into ProviderResult.

Requires: httpx >= 0.27 (included in backend extras)
"""

from __future__ import annotations

import time
from enum import Enum
from typing import Any, Optional

from shared.logger.logger import get_logger, metrics
from shared.providers.base import (
    Provider,
    ProviderConfig,
    ProviderResult,
    ProviderStatus,
)

logger = get_logger("aether.providers.categories")

# httpx is in the backend extras — fail loud if missing
try:
    import httpx
except ImportError:
    httpx = None  # type: ignore[assignment]


class ProviderCategory(str, Enum):
    """Categories of external providers requiring abstraction."""

    BLOCKCHAIN_RPC = "blockchain_rpc"
    BLOCK_EXPLORER = "block_explorer"
    SOCIAL_API = "social_api"
    ANALYTICS_DATA = "analytics_data"


def _require_httpx() -> None:
    if httpx is None:
        raise RuntimeError("httpx is required for provider adapters: pip install httpx>=0.27")


# ======================================================================
# SHARED HTTP HELPER
# ======================================================================

async def _http_post_json(
    url: str,
    json_body: dict,
    headers: Optional[dict] = None,
    timeout: float = 30.0,
) -> dict:
    """POST JSON and return parsed response. Raises on HTTP errors."""
    _require_httpx()
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=json_body, headers=headers or {})
        resp.raise_for_status()
        return resp.json()


async def _http_get_json(
    url: str,
    params: Optional[dict] = None,
    headers: Optional[dict] = None,
    timeout: float = 30.0,
) -> dict:
    """GET with query params and return parsed response."""
    _require_httpx()
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(url, params=params or {}, headers=headers or {})
        resp.raise_for_status()
        return resp.json()


# ======================================================================
# Category 1: Blockchain RPC Providers
# ======================================================================


class _BaseRPCProvider(Provider):
    """Shared logic for JSON-RPC providers (QuickNode, Alchemy, Infura, Generic)."""

    def _build_endpoint(self) -> str:
        """Build the RPC endpoint URL. Override in subclasses if needed."""
        return self.config.endpoint

    def _build_headers(self) -> dict:
        """Build request headers. Override for API-key-in-header patterns."""
        return {"Content-Type": "application/json"}

    async def execute(self, method: str, params: dict[str, Any]) -> ProviderResult:
        start = time.perf_counter()
        endpoint = self._build_endpoint()
        if not endpoint:
            return ProviderResult(
                success=False,
                error=f"{self.name}: endpoint not configured",
                provider_name=self.name,
                latency_ms=0.0,
            )

        rpc_method = params.get("method", method)
        rpc_params = params.get("params", [])
        self._request_count += 1

        payload = {
            "jsonrpc": "2.0",
            "id": self._request_count,
            "method": rpc_method,
            "params": rpc_params,
        }

        try:
            result = await _http_post_json(
                endpoint, payload, headers=self._build_headers()
            )
            elapsed = (time.perf_counter() - start) * 1000
            metrics.increment("provider_request", labels={
                "provider": self.name, "method": rpc_method, "status": "success",
            })
            return ProviderResult(
                success=True, data=result, provider_name=self.name,
                latency_ms=elapsed,
            )
        except Exception as e:
            elapsed = (time.perf_counter() - start) * 1000
            logger.error(f"{self.name} RPC error: {e}")
            metrics.increment("provider_request", labels={
                "provider": self.name, "method": rpc_method, "status": "error",
            })
            return ProviderResult(
                success=False, error=str(e), provider_name=self.name,
                latency_ms=elapsed,
            )

    async def health_check(self) -> ProviderStatus:
        if not self._build_endpoint():
            return ProviderStatus.UNAVAILABLE
        try:
            result = await self.execute("net_version", {"method": "net_version", "params": []})
            return ProviderStatus.HEALTHY if result.success else ProviderStatus.DEGRADED
        except Exception:
            return ProviderStatus.UNAVAILABLE


class QuickNodeProvider(_BaseRPCProvider):
    """QuickNode RPC adapter."""

    def _build_endpoint(self) -> str:
        if self.config.endpoint:
            return self.config.endpoint
        # QuickNode endpoints are custom per-account
        return ""

    def _build_headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["x-api-key"] = self.config.api_key
        return headers


class AlchemyProvider(_BaseRPCProvider):
    """Alchemy RPC adapter. API key is appended to endpoint URL."""

    def _build_endpoint(self) -> str:
        if self.config.endpoint:
            return self.config.endpoint
        if self.config.api_key:
            chain = self.config.extra.get("chain", "eth-mainnet")
            return f"https://{chain}.g.alchemy.com/v2/{self.config.api_key}"
        return ""


class InfuraProvider(_BaseRPCProvider):
    """Infura RPC adapter. API key is part of the endpoint path."""

    def _build_endpoint(self) -> str:
        if self.config.endpoint:
            return self.config.endpoint
        if self.config.api_key:
            network = self.config.extra.get("network", "mainnet")
            return f"https://{network}.infura.io/v3/{self.config.api_key}"
        return ""


class GenericRPCProvider(_BaseRPCProvider):
    """Custom RPC endpoint for BYOK with arbitrary endpoints."""

    def _build_headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers


# ======================================================================
# Category 2: Block Explorer Providers
# ======================================================================


class EtherscanProvider(Provider):
    """Etherscan / PolygonScan / ArbScan block explorer adapter."""

    def _base_url(self) -> str:
        return self.config.endpoint or "https://api.etherscan.io/api"

    async def execute(self, method: str, params: dict[str, Any]) -> ProviderResult:
        start = time.perf_counter()
        if not self.config.api_key:
            return ProviderResult(
                success=False, error="Etherscan API key not configured",
                provider_name=self.name, latency_ms=0.0,
            )

        query_params = {
            "module": params.get("module", "account"),
            "action": params.get("action", method),
            "apikey": self.config.api_key,
            **{k: v for k, v in params.items() if k not in ("module", "action")},
        }
        self._request_count += 1

        try:
            result = await _http_get_json(self._base_url(), params=query_params)
            elapsed = (time.perf_counter() - start) * 1000
            metrics.increment("provider_request", labels={
                "provider": self.name, "method": method, "status": "success",
            })
            return ProviderResult(
                success=True, data=result, provider_name=self.name,
                latency_ms=elapsed,
            )
        except Exception as e:
            elapsed = (time.perf_counter() - start) * 1000
            logger.error(f"Etherscan error: {e}")
            metrics.increment("provider_request", labels={
                "provider": self.name, "method": method, "status": "error",
            })
            return ProviderResult(
                success=False, error=str(e), provider_name=self.name,
                latency_ms=elapsed,
            )

    async def health_check(self) -> ProviderStatus:
        if not self.config.api_key:
            return ProviderStatus.UNAVAILABLE
        try:
            result = await self.execute("ethprice", {"module": "stats", "action": "ethprice"})
            return ProviderStatus.HEALTHY if result.success else ProviderStatus.DEGRADED
        except Exception:
            return ProviderStatus.UNAVAILABLE


class MoralisProvider(Provider):
    """Moralis Web3 data API adapter."""

    def _base_url(self) -> str:
        return self.config.endpoint or "https://deep-index.moralis.io/api/v2.2"

    async def execute(self, method: str, params: dict[str, Any]) -> ProviderResult:
        start = time.perf_counter()
        if not self.config.api_key:
            return ProviderResult(
                success=False, error="Moralis API key not configured",
                provider_name=self.name, latency_ms=0.0,
            )

        path = params.get("path", "")
        url = f"{self._base_url()}/{path}" if path else self._base_url()
        headers = {"X-API-Key": self.config.api_key, "Accept": "application/json"}
        self._request_count += 1

        try:
            result = await _http_get_json(url, params=params.get("query", {}), headers=headers)
            elapsed = (time.perf_counter() - start) * 1000
            metrics.increment("provider_request", labels={
                "provider": self.name, "method": method, "status": "success",
            })
            return ProviderResult(
                success=True, data=result, provider_name=self.name,
                latency_ms=elapsed,
            )
        except Exception as e:
            elapsed = (time.perf_counter() - start) * 1000
            logger.error(f"Moralis error: {e}")
            return ProviderResult(
                success=False, error=str(e), provider_name=self.name,
                latency_ms=elapsed,
            )

    async def health_check(self) -> ProviderStatus:
        if not self.config.api_key:
            return ProviderStatus.UNAVAILABLE
        return ProviderStatus.HEALTHY


# ======================================================================
# Category 3: Social API Providers
# ======================================================================


class TwitterProvider(Provider):
    """Twitter / X API v2 adapter using bearer token auth."""

    def _base_url(self) -> str:
        return self.config.endpoint or "https://api.twitter.com/2"

    async def execute(self, method: str, params: dict[str, Any]) -> ProviderResult:
        start = time.perf_counter()
        if not self.config.api_key:
            return ProviderResult(
                success=False, error="Twitter bearer token not configured",
                provider_name=self.name, latency_ms=0.0,
            )

        path = params.get("path", "tweets/search/recent")
        url = f"{self._base_url()}/{path}"
        headers = {"Authorization": f"Bearer {self.config.api_key}"}
        query = params.get("query", {})
        self._request_count += 1

        try:
            result = await _http_get_json(url, params=query, headers=headers)
            elapsed = (time.perf_counter() - start) * 1000
            metrics.increment("provider_request", labels={
                "provider": self.name, "method": method, "status": "success",
            })
            return ProviderResult(
                success=True, data=result, provider_name=self.name,
                latency_ms=elapsed,
            )
        except Exception as e:
            elapsed = (time.perf_counter() - start) * 1000
            logger.error(f"Twitter API error: {e}")
            return ProviderResult(
                success=False, error=str(e), provider_name=self.name,
                latency_ms=elapsed,
            )

    async def health_check(self) -> ProviderStatus:
        return ProviderStatus.HEALTHY if self.config.api_key else ProviderStatus.UNAVAILABLE


class RedditProvider(Provider):
    """Reddit API adapter using OAuth2 application-only auth."""

    def _base_url(self) -> str:
        return self.config.endpoint or "https://oauth.reddit.com"

    async def execute(self, method: str, params: dict[str, Any]) -> ProviderResult:
        start = time.perf_counter()
        if not self.config.api_key:
            return ProviderResult(
                success=False, error="Reddit API credentials not configured",
                provider_name=self.name, latency_ms=0.0,
            )

        path = params.get("path", "r/all/new.json")
        url = f"{self._base_url()}/{path}"
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "User-Agent": "aether-platform/1.0",
        }
        self._request_count += 1

        try:
            result = await _http_get_json(url, params=params.get("query", {}), headers=headers)
            elapsed = (time.perf_counter() - start) * 1000
            metrics.increment("provider_request", labels={
                "provider": self.name, "method": method, "status": "success",
            })
            return ProviderResult(
                success=True, data=result, provider_name=self.name,
                latency_ms=elapsed,
            )
        except Exception as e:
            elapsed = (time.perf_counter() - start) * 1000
            logger.error(f"Reddit API error: {e}")
            return ProviderResult(
                success=False, error=str(e), provider_name=self.name,
                latency_ms=elapsed,
            )

    async def health_check(self) -> ProviderStatus:
        return ProviderStatus.HEALTHY if self.config.api_key else ProviderStatus.UNAVAILABLE


# ======================================================================
# Category 4: Analytics Data Providers
# ======================================================================


class DuneAnalyticsProvider(Provider):
    """Dune Analytics query execution and result retrieval."""

    def _base_url(self) -> str:
        return self.config.endpoint or "https://api.dune.com/api/v1"

    async def execute(self, method: str, params: dict[str, Any]) -> ProviderResult:
        start = time.perf_counter()
        if not self.config.api_key:
            return ProviderResult(
                success=False, error="Dune API key not configured",
                provider_name=self.name, latency_ms=0.0,
            )

        query_id = params.get("query_id", "")
        action = params.get("action", "execute")
        headers = {"X-Dune-Api-Key": self.config.api_key}
        self._request_count += 1

        try:
            if action == "execute":
                url = f"{self._base_url()}/query/{query_id}/execute"
                result = await _http_post_json(url, json_body=params.get("parameters", {}), headers=headers)
            elif action == "results":
                execution_id = params.get("execution_id", "")
                url = f"{self._base_url()}/execution/{execution_id}/results"
                result = await _http_get_json(url, headers=headers)
            else:
                url = f"{self._base_url()}/query/{query_id}/results"
                result = await _http_get_json(url, headers=headers)

            elapsed = (time.perf_counter() - start) * 1000
            metrics.increment("provider_request", labels={
                "provider": self.name, "method": method, "status": "success",
            })
            return ProviderResult(
                success=True, data=result, provider_name=self.name,
                latency_ms=elapsed,
            )
        except Exception as e:
            elapsed = (time.perf_counter() - start) * 1000
            logger.error(f"Dune Analytics error: {e}")
            return ProviderResult(
                success=False, error=str(e), provider_name=self.name,
                latency_ms=elapsed,
            )

    async def health_check(self) -> ProviderStatus:
        return ProviderStatus.HEALTHY if self.config.api_key else ProviderStatus.UNAVAILABLE


# ======================================================================
# FACTORY: name -> Provider class mapping
# ======================================================================

PROVIDER_FACTORY: dict[str, type[Provider]] = {
    # RPC
    "quicknode": QuickNodeProvider,
    "alchemy": AlchemyProvider,
    "infura": InfuraProvider,
    "custom_rpc": GenericRPCProvider,
    # Explorer
    "etherscan": EtherscanProvider,
    "moralis": MoralisProvider,
    # Social
    "twitter": TwitterProvider,
    "reddit": RedditProvider,
    # Analytics
    "dune": DuneAnalyticsProvider,
}

CATEGORY_PROVIDERS: dict[ProviderCategory, list[str]] = {
    ProviderCategory.BLOCKCHAIN_RPC: ["quicknode", "alchemy", "infura", "custom_rpc"],
    ProviderCategory.BLOCK_EXPLORER: ["etherscan", "moralis"],
    ProviderCategory.SOCIAL_API: ["twitter", "reddit"],
    ProviderCategory.ANALYTICS_DATA: ["dune"],
}
