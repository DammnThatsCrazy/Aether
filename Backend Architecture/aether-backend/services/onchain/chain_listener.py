"""
Aether Service — Chain Listener
Listens to on-chain events via QuickNode Streams and routes to ActionRecorder.
Stub implementation — in production connects to QuickNode WebSocket streams.
"""

from __future__ import annotations

from typing import Optional

from shared.logger.logger import get_logger, metrics

from .models import ChainListenerConfig

logger = get_logger("aether.service.onchain.listener")


class ChainListener:
    """
    Listens to blockchain events via configurable streams.
    Stub — in production uses QuickNode Streams (WebSocket) or Alchemy webhooks.
    """

    def __init__(self) -> None:
        self._configs: dict[str, ChainListenerConfig] = {}
        self._running = False

    async def configure(self, config: ChainListenerConfig) -> ChainListenerConfig:
        """Add or update a chain listener configuration."""
        if not config.config_id:
            config.config_id = f"{config.chain_id}_{config.vm_type}"

        self._configs[config.config_id] = config
        metrics.increment("chain_listener_configured", labels={"chain_id": config.chain_id})
        logger.info(
            f"Chain listener configured: {config.config_id} "
            f"(chain={config.chain_id}, filters={len(config.filter_addresses)} addresses)"
        )
        return config

    async def start(self) -> None:
        """Start all configured listeners."""
        self._running = True
        for config_id, config in self._configs.items():
            if config.enabled:
                logger.info(f"Chain listener started: {config_id}")
        logger.info(f"Chain listener running with {len(self._configs)} streams")

    async def stop(self) -> None:
        """Stop all listeners."""
        self._running = False
        logger.info("Chain listener stopped")

    def get_configs(self) -> list[ChainListenerConfig]:
        """Return all listener configurations."""
        return list(self._configs.values())

    @property
    def is_running(self) -> bool:
        return self._running
