// =============================================================================
// AETHER SDK — BASE VM TRACKER
// Shared abstract base for all VM trackers
// =============================================================================

import type { GasAnalytics, WhaleAlert } from '../../types';
import type { VMType } from '../providers/base-provider';

export interface TrackerCallbacks {
  onTokenBalance?: (balance: any) => void;
  onNFTDetected?: (nft: any) => void;
  onGasAnalytics?: (gas: GasAnalytics) => void;
  onWhaleAlert?: (alert: WhaleAlert) => void;
  onDeFiInteraction?: (data: Record<string, unknown>) => void;
}

export abstract class BaseVMTracker {
  protected callbacks: TrackerCallbacks;
  abstract readonly vm: VMType;

  constructor(callbacks: TrackerCallbacks) {
    this.callbacks = callbacks;
  }

  protected emitGasAnalytics(data: Omit<GasAnalytics, 'vm'>): void {
    this.callbacks.onGasAnalytics?.({ ...data, vm: this.vm });
  }

  protected emitWhaleAlert(data: Omit<WhaleAlert, 'vm'>): void {
    this.callbacks.onWhaleAlert?.({ ...data, vm: this.vm });
  }

  protected emitDeFiInteraction(data: Record<string, unknown>): void {
    this.callbacks.onDeFiInteraction?.({ ...data, vm: this.vm });
  }

  protected checkWhaleAlert(params: {
    txHash: string; value: number; threshold: number;
    from: string; to: string; chainId: string | number;
  }): void {
    if (params.value >= params.threshold) {
      this.emitWhaleAlert({
        txHash: params.txHash, value: String(params.value),
        from: params.from, to: params.to,
        chainId: params.chainId, threshold: String(params.threshold),
      });
    }
  }

  destroy(): void { /* base cleanup — override if needed */ }
}
