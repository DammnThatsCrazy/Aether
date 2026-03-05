// =============================================================================
// AETHER SDK — DEFI PROTOCOL REGISTRY
// Master database of known DeFi protocol contract addresses per chain
// =============================================================================

import type { DeFiCategory, ProtocolInfo } from '../../types';
import registryData from '../../../../../data-modules/protocol-registry.json';

// ---------------------------------------------------------------------------
// Bundled data (loaded from JSON data module)
// ---------------------------------------------------------------------------

const PROTOCOL_REGISTRY: Record<string, ProtocolInfo> =
  registryData.protocols as unknown as Record<string, ProtocolInfo>;

// ---------------------------------------------------------------------------
// OTA Remote Data Support
// ---------------------------------------------------------------------------

/** Remote protocol data injected via OTA updates (overlays bundled defaults) */
let remoteProtocolData: Record<string, ProtocolInfo> | null = null;

/**
 * Inject remote protocol data from OTA update.
 * When set, protocol lookups use the remote data instead of bundled defaults.
 * Pass null to revert to bundled defaults.
 */
export function setRemoteData(remote: Record<string, ProtocolInfo> | null): void {
  remoteProtocolData = remote;
}

/** Get the active protocol registry (remote if available, otherwise bundled) */
function getActiveRegistry(): Record<string, ProtocolInfo> {
  return remoteProtocolData ?? PROTOCOL_REGISTRY;
}

/** Identify a protocol by contract address */
export function identifyProtocol(chainId: number | string, contractAddress: string): ProtocolInfo | null {
  const addr = contractAddress.toLowerCase();
  const chainStr = String(chainId);
  for (const protocol of Object.values(getActiveRegistry())) {
    const chainAddresses = protocol.chains[chainStr];
    if (chainAddresses) {
      for (const a of chainAddresses) {
        if (a.toLowerCase() === addr) return protocol;
      }
    }
  }
  return null;
}

/** Get all protocols by category */
export function getProtocolsByCategory(category: DeFiCategory): ProtocolInfo[] {
  return Object.values(getActiveRegistry()).filter((p) => p.category === category);
}

/** Get all protocols on a specific chain */
export function getProtocolsOnChain(chainId: number | string): ProtocolInfo[] {
  return Object.values(getActiveRegistry()).filter((p) => String(chainId) in p.chains);
}

/** Check if an address is a known protocol contract */
export function isProtocolContract(chainId: number | string, address: string): boolean {
  return identifyProtocol(chainId, address) !== null;
}
