// =============================================================================
// AETHER SDK — GENERIC DEFI CATEGORY TRACKER
// Replaces 14 identical per-category trackers with a single parameterised class.
// Categories: lending, staking, bridge, perpetuals, governance, yield,
//   nft_marketplace, payments, cex, restaking, router, launchpad, insurance, options
// =============================================================================

import type { VMType, DeFiCategory } from '../../types';
import { identifyProtocol } from './protocol-registry';

// ---------------------------------------------------------------------------
// All DeFi categories handled by GenericDeFiTracker (excludes 'dex' which has
// unique swap/liquidity methods and is kept in dex-tracker.ts).
// ---------------------------------------------------------------------------

export const DEFI_CATEGORIES: DeFiCategory[] = [
  'lending',
  'staking',
  'bridge',
  'perpetuals',
  'governance',
  'yield',
  'nft_marketplace',
  'payments',
  'cex',
  'restaking',
  'router',
  'launchpad',
  'insurance',
  'options',
] as const;

// ---------------------------------------------------------------------------
// Callbacks — identical interface used by every category tracker
// ---------------------------------------------------------------------------

export interface DeFiTrackerCallbacks {
  onInteraction: (data: Record<string, unknown>) => void;
  onPositionChange: (data: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// GenericDeFiTracker
// ---------------------------------------------------------------------------

export class GenericDeFiTracker {
  private callbacks: DeFiTrackerCallbacks;
  private readonly category: DeFiCategory;

  constructor(category: DeFiCategory, callbacks: DeFiTrackerCallbacks) {
    this.category = category;
    this.callbacks = callbacks;
  }

  /** Detect if a transaction interacts with a tracked protocol */
  detect(tx: {
    hash: string; to: string; chainId: number | string;
    vm: VMType; input?: string; value?: string; from?: string;
  }): boolean {
    const protocol = identifyProtocol(tx.chainId, tx.to);
    if (!protocol || protocol.category !== this.category) return false;

    this.callbacks.onInteraction({
      txHash: tx.hash, protocol: protocol.name, category: this.category,
      vm: tx.vm, chainId: tx.chainId, contractAddress: tx.to,
      from: tx.from, value: tx.value,
    });
    return true;
  }

  /** Process a specific protocol event */
  processEvent(data: {
    txHash: string; protocol: string; action: string;
    vm: VMType; chainId: number | string;
    [key: string]: unknown;
  }): void {
    this.callbacks.onInteraction({
      ...data, category: this.category,
    });
  }

  /** Record a position change */
  recordPositionChange(data: {
    protocol: string; positionType: string; action: string;
    assets: { symbol: string; amount: string; side?: string }[];
    valueUSD?: number; vm: VMType; chainId: number | string;
    [key: string]: unknown;
  }): void {
    this.callbacks.onPositionChange({
      ...data, category: this.category,
    });
  }

  /** Get the category this tracker handles */
  getCategory(): DeFiCategory {
    return this.category;
  }

  destroy(): void { /* no resources */ }
}

// ---------------------------------------------------------------------------
// Factory — creates a tracker for every generic DeFi category
// ---------------------------------------------------------------------------

export function createDeFiTrackers(
  callbacks: DeFiTrackerCallbacks,
): Map<DeFiCategory, GenericDeFiTracker> {
  const map = new Map<DeFiCategory, GenericDeFiTracker>();
  for (const category of DEFI_CATEGORIES) {
    map.set(category, new GenericDeFiTracker(category, callbacks));
  }
  return map;
}
