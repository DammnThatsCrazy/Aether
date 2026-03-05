// =============================================================================
// AETHER SDK — UNIFIED CROSS-VM CHAIN REGISTRY
// Merges EVM, Solana, Bitcoin, SUI, NEAR, TRON, Cosmos into a single registry
// =============================================================================

import type { VMType, ChainInfo } from '../../types';
import chainData from '../../../../../data-modules/chain-registry.json';

// ---------------------------------------------------------------------------
// Bundled data (loaded from JSON data module)
// ---------------------------------------------------------------------------

const BUNDLED_CHAINS: ChainInfo[] = chainData.chains as unknown as ChainInfo[];

// ---------------------------------------------------------------------------
// OTA Remote Data Support
// ---------------------------------------------------------------------------

/** Remote chain data injected via OTA updates (overlays bundled defaults) */
let remoteChainData: ChainInfo[] | null = null;

/**
 * Inject remote chain data from OTA update.
 * When set, getAllChains() returns the remote data instead of bundled defaults.
 * Pass null to revert to bundled defaults.
 */
export function setRemoteData(remote: ChainInfo[] | null): void {
  remoteChainData = remote;
}

/** Get the current data module version info for cache comparison */
export function getDataVersion(): string | null {
  return remoteChainData ? 'remote' : null;
}

// ---------------------------------------------------------------------------
// Unified registry
// ---------------------------------------------------------------------------

/** Get all chains across all VMs */
export function getAllChains(): ChainInfo[] {
  // If remote data is available (from OTA update), use it
  if (remoteChainData) return remoteChainData;

  // Otherwise, use bundled defaults from JSON data module
  return BUNDLED_CHAINS;
}

/** Get chains filtered by VM type */
export function getChainsByVM(vm: VMType): ChainInfo[] {
  return getAllChains().filter((c) => c.vm === vm);
}

/** Get a specific chain by VM and chainId */
export function getChain(vm: VMType, chainId: number | string): ChainInfo | undefined {
  return getAllChains().find((c) => c.vm === vm && String(c.chainId) === String(chainId));
}

/** Get mainnet chains only */
export function getMainnetChains(): ChainInfo[] {
  return getAllChains().filter((c) => !c.isTestnet);
}

/** Get explorer transaction URL for any chain */
export function getExplorerTxUrl(vm: VMType, chainId: number | string, txHash: string): string | undefined {
  const chain = getChain(vm, chainId);
  if (!chain?.explorerUrl) return undefined;

  switch (vm) {
    case 'evm': return `${chain.explorerUrl}/tx/${txHash}`;
    case 'svm': return `${chain.explorerUrl}/tx/${txHash}`;
    case 'bitcoin': return `${chain.explorerUrl}/tx/${txHash}`;
    case 'movevm': return `${chain.explorerUrl}/txblock/${txHash}`;
    case 'near': return `${chain.explorerUrl}/txns/${txHash}`;
    case 'tvm': return `${chain.explorerUrl}/#/transaction/${txHash}`;
    case 'cosmos': return `${chain.explorerUrl}/tx/${txHash}`;
    default: return undefined;
  }
}

/** Get explorer address URL for any chain */
export function getExplorerAddressUrl(vm: VMType, chainId: number | string, address: string): string | undefined {
  const chain = getChain(vm, chainId);
  if (!chain?.explorerUrl) return undefined;

  switch (vm) {
    case 'evm': return `${chain.explorerUrl}/address/${address}`;
    case 'svm': return `${chain.explorerUrl}/account/${address}`;
    case 'bitcoin': return `${chain.explorerUrl}/address/${address}`;
    case 'movevm': return `${chain.explorerUrl}/account/${address}`;
    case 'near': return `${chain.explorerUrl}/address/${address}`;
    case 'tvm': return `${chain.explorerUrl}/#/address/${address}`;
    case 'cosmos': return `${chain.explorerUrl}/account/${address}`;
    default: return undefined;
  }
}
