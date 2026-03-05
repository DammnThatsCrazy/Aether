// =============================================================================
// AETHER SDK — NEAR PROTOCOL TRACKER
// Action tracking, FT/NFT transfers, gas analytics
// =============================================================================

import type { TokenBalance, DeFiCategory } from '../../types';
import type { VMType } from '../providers/base-provider';
import { BaseVMTracker, type TrackerCallbacks } from './base-tracker';

export interface NEARTrackerCallbacks extends TrackerCallbacks {
  onActionDetected?: (data: Record<string, unknown>) => void;
}

const KNOWN_NEAR_CONTRACTS: Record<string, { name: string; category?: DeFiCategory }> = {
  'v2.ref-finance.near': { name: 'Ref Finance', category: 'dex' },
  'v1.orderbook.near': { name: 'Orderly Network', category: 'dex' },
  'linear-protocol.near': { name: 'LiNEAR', category: 'staking' },
  'meta-pool.near': { name: 'Meta Pool', category: 'staking' },
  'contract.burrow.near': { name: 'Burrow', category: 'lending' },
  'aurora': { name: 'Aurora', category: 'bridge' },
  'wrap.near': { name: 'wNEAR', category: 'dex' },
  'factory.bridge.near': { name: 'Rainbow Bridge', category: 'bridge' },
};

type NEARActionKind = 'CreateAccount' | 'Transfer' | 'FunctionCall' | 'Stake' | 'AddKey' | 'DeleteKey' | 'DeleteAccount' | 'DeployContract';

export class NEARTracker extends BaseVMTracker {
  readonly vm: VMType = 'near';

  private network: string = 'near:mainnet';
  private extCallbacks: NEARTrackerCallbacks;

  constructor(callbacks: NEARTrackerCallbacks, network?: string) {
    super(callbacks);
    this.extCallbacks = callbacks;
    if (network) this.network = network;
  }

  /** Process a NEAR transaction */
  processTransaction(tx: {
    hash: string;
    receiverId: string;
    actions: { kind: NEARActionKind; args?: Record<string, unknown> }[];
    outcome?: { gasBurnt?: number; tokensBurnt?: string };
  }): void {
    // Gas analytics
    if (tx.outcome) {
      this.emitGasAnalytics({
        gasCostNative: ((Number(tx.outcome.tokensBurnt ?? 0)) / 1e24).toFixed(12),
        chainId: this.network,
        gasUsed: String(tx.outcome.gasBurnt ?? 0),
      });
    }

    // Action detection
    for (const action of tx.actions) {
      this.extCallbacks.onActionDetected?.({
        txHash: tx.hash, actionKind: action.kind,
        receiverId: tx.receiverId, vm: 'near', chainId: this.network,
        ...(action.args ?? {}),
      });

      // DeFi protocol detection
      if (action.kind === 'FunctionCall') {
        const protocol = KNOWN_NEAR_CONTRACTS[tx.receiverId];
        if (protocol?.category) {
          this.emitDeFiInteraction({
            txHash: tx.hash, protocol: protocol.name,
            category: protocol.category,
            action: (action.args?.methodName as string) ?? 'unknown',
            chainId: this.network,
          });
        }
      }
    }
  }

  /** Get NEAR balance */
  async getNEARBalance(accountId: string): Promise<TokenBalance | null> {
    try {
      const response = await fetch(this.getRpcUrl(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'query',
          params: { request_type: 'view_account', finality: 'final', account_id: accountId },
        }),
      });
      const result = await response.json();
      const balance: TokenBalance = {
        symbol: 'NEAR', name: 'NEAR Protocol', contractAddress: 'native',
        balance: result?.result?.amount ?? '0', decimals: 24,
        vm: 'near', chainId: this.network, standard: 'native',
      };
      this.callbacks.onTokenBalance?.(balance);
      return balance;
    } catch { return null; }
  }

  /** Get FT balance (NEP-141) */
  async getFTBalance(accountId: string, contractId: string): Promise<TokenBalance | null> {
    try {
      const response = await fetch(this.getRpcUrl(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'query',
          params: {
            request_type: 'call_function', finality: 'final',
            account_id: contractId, method_name: 'ft_balance_of',
            args_base64: btoa(JSON.stringify({ account_id: accountId })),
          },
        }),
      });
      const result = await response.json();
      const rawResult = result?.result?.result;
      if (rawResult) {
        const balanceStr = JSON.parse(String.fromCharCode(...rawResult));
        const balance: TokenBalance = {
          symbol: '', name: contractId, contractAddress: contractId,
          balance: balanceStr, decimals: 24, vm: 'near', chainId: this.network,
          standard: 'nep141',
        };
        this.callbacks.onTokenBalance?.(balance);
        return balance;
      }
      return null;
    } catch { return null; }
  }

  private getRpcUrl(): string {
    return this.network.includes('testnet')
      ? 'https://rpc.testnet.near.org'
      : 'https://rpc.mainnet.near.org';
  }
}
