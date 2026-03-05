// =============================================================================
// AETHER SDK — EVM CHAIN REGISTRY
// 13+ EVM-compatible chains with full metadata
// =============================================================================

import evmData from '../../../../../data-modules/evm-chains.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EVMChainInfo {
  chainId: number;
  name: string;
  shortName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrl: string;
  explorerUrl: string;
  isTestnet: boolean;
  isL2: boolean;
  logoSlug: string;
}

// ---------------------------------------------------------------------------
// Bundled data (loaded from JSON data module)
// ---------------------------------------------------------------------------

export const EVM_CHAINS: Record<number, EVMChainInfo> =
  evmData.chains as unknown as Record<number, EVMChainInfo>;

// ---------------------------------------------------------------------------
// Lookup functions
// ---------------------------------------------------------------------------

/** Get chain info by chainId */
export function getEVMChainInfo(chainId: number): EVMChainInfo | undefined {
  return EVM_CHAINS[chainId];
}

/** Check if a chain is supported */
export function isEVMChainSupported(chainId: number): boolean {
  return chainId in EVM_CHAINS;
}

/** Get block explorer transaction URL */
export function getEVMExplorerTxUrl(chainId: number, txHash: string): string | undefined {
  const chain = EVM_CHAINS[chainId];
  return chain ? `${chain.explorerUrl}/tx/${txHash}` : undefined;
}

/** Get block explorer address URL */
export function getEVMExplorerAddressUrl(chainId: number, address: string): string | undefined {
  const chain = EVM_CHAINS[chainId];
  return chain ? `${chain.explorerUrl}/address/${address}` : undefined;
}

/** Get all mainnet chains */
export function getEVMMainnets(): EVMChainInfo[] {
  return Object.values(EVM_CHAINS).filter((c) => !c.isTestnet);
}

/** Get all L2 chains */
export function getEVML2Chains(): EVMChainInfo[] {
  return Object.values(EVM_CHAINS).filter((c) => c.isL2 && !c.isTestnet);
}
