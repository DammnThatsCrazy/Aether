// =============================================================================
// AETHER SDK — WALLET LABELS DATABASE
// Known addresses: CEX hot/cold wallets, protocol treasuries, whales
// =============================================================================

import type { AddressLabel, VMType } from '../../types';
import labelData from '../../../../../data-modules/wallet-labels.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LabelEntry {
  name: string;
  category: AddressLabel['category'];
  subcategory?: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Bundled data (loaded from JSON data module)
// ---------------------------------------------------------------------------

const ETH_LABELS: Record<string, LabelEntry> =
  labelData.labels as unknown as Record<string, LabelEntry>;

// ---------------------------------------------------------------------------
// OTA Remote Data Support
// ---------------------------------------------------------------------------

/** Remote label data injected via OTA updates */
let remoteLabelData: Record<string, LabelEntry> | null = null;

/**
 * Inject remote wallet label data from OTA update.
 * When set, lookups use remote data instead of bundled defaults.
 * Pass null to revert to bundled defaults.
 */
export function setRemoteData(remote: Record<string, LabelEntry> | null): void {
  remoteLabelData = remote;
}

/** Get the active labels database (remote if available, otherwise bundled) */
function getActiveLabels(): Record<string, LabelEntry> {
  return remoteLabelData ?? ETH_LABELS;
}

// ---------------------------------------------------------------------------
// Lookup functions
// ---------------------------------------------------------------------------

/** Get label for an address on a specific chain */
export function getAddressLabel(chainId: number | string, address: string, _vm?: VMType): AddressLabel | null {
  const addr = address.toLowerCase();
  const chainStr = String(chainId);
  const labels = getActiveLabels();

  // Currently we have labels for Ethereum mainnet
  if (chainStr === '1' || chainStr === '56') {
    const label = labels[addr];
    if (label) {
      return {
        address: addr, name: label.name, category: label.category,
        subcategory: label.subcategory, confidence: label.confidence,
        chainId, vm: 'evm',
      };
    }
  }

  return null;
}

/** Check if an address is a known exchange wallet */
export function isExchangeAddress(chainId: number | string, address: string): boolean {
  const label = getAddressLabel(chainId, address);
  return label?.category === 'cex';
}

/** Check if an address is a known protocol/contract */
export function isProtocolAddress(chainId: number | string, address: string): boolean {
  const label = getAddressLabel(chainId, address);
  return label?.category === 'protocol' || label?.category === 'bridge' || label?.category === 'dao';
}

/** Get exchange name for a known exchange address */
export function getExchangeName(chainId: number | string, address: string): string | null {
  const label = getAddressLabel(chainId, address);
  if (label?.category === 'cex') return label.subcategory ?? label.name;
  return null;
}

/** Get all known labels for a chain */
export function getAllLabelsForChain(_chainId: number | string): AddressLabel[] {
  const labels = getActiveLabels();
  return Object.entries(labels).map(([addr, label]) => ({
    address: addr, name: label.name, category: label.category,
    subcategory: label.subcategory, confidence: label.confidence,
    chainId: 1, vm: 'evm' as VMType,
  }));
}
