// =============================================================================
// AETHER SDK — REWARD CLIENT
// Client-side reward tracking, eligibility checking, and on-chain claiming.
// Integrates with the Aether backend reward pipeline and smart contracts.
//
// Features:
// - Automatic reward eligibility polling
// - Proof retrieval from backend oracle
// - On-chain reward claiming via connected wallet
// - Reward history tracking
// - Campaign discovery
// =============================================================================

import { generateId, now, storage } from '../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RewardConfig {
  /** Backend API endpoint (e.g. "https://api.aether.io") */
  endpoint: string;
  /** Project API key */
  apiKey: string;
  /** Automatically check eligibility when events fire (default: true) */
  autoCheck?: boolean;
  /** Polling interval in milliseconds (default: 30000) */
  checkIntervalMs?: number;
  /** Chain-specific reward contract addresses: chainId -> address */
  contractAddresses?: Record<number, string>;
}

export interface RewardProof {
  /** Wallet address of the reward recipient */
  user: string;
  /** Event type that triggered the reward */
  actionType: string;
  /** Reward amount in wei (string for BigInt compatibility) */
  amountWei: string;
  /** Unique nonce (bytes32 hex) */
  nonce: string;
  /** Proof expiry as Unix timestamp */
  expiry: number;
  /** Target chain ID */
  chainId: number;
  /** Reward contract address on the target chain */
  contractAddress: string;
  /** Oracle ECDSA signature (hex) */
  signature: string;
  /** EIP-712 / raw message hash (hex) */
  messageHash: string;
}

export interface RewardCampaign {
  id: string;
  name: string;
  description: string;
  /** Reward amount per qualifying action (in wei) */
  rewardAmount: string;
  /** Token symbol (e.g. "AETH", "USDC") */
  tokenSymbol: string;
  /** Whether the campaign is currently active */
  active: boolean;
  /** Chain on which rewards are claimable */
  chainId: number;
}

export interface UserReward {
  id: string;
  actionType: string;
  /** Reward amount in wei */
  amount: string;
  status: 'pending' | 'proved' | 'claimed' | 'failed';
  proof?: RewardProof;
  /** Transaction hash if already claimed on-chain */
  claimedTxHash?: string;
  createdAt: string;
}

export type RewardCallback = (reward: UserReward) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CHECK_INTERVAL_MS = 30_000;
const STORAGE_KEY_REWARDS = 'rewards_cache';

/**
 * claimReward(address user, string actionType, uint256 amount, bytes32 nonce, uint256 expiry, bytes signature)
 * Keccak-256 of the canonical function signature.
 */
const CLAIM_REWARD_SELECTOR = '0x4e71d92d';

// ---------------------------------------------------------------------------
// RewardClient
// ---------------------------------------------------------------------------

export class RewardClient {
  private config: Required<
    Pick<RewardConfig, 'endpoint' | 'apiKey' | 'autoCheck' | 'checkIntervalMs'>
  > & { contractAddresses: Record<number, string> };

  private userAddress: string | null = null;
  private rewards: Map<string, UserReward> = new Map();
  private listeners: RewardCallback[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(config: RewardConfig) {
    this.config = {
      endpoint: config.endpoint.replace(/\/+$/, ''),
      apiKey: config.apiKey,
      autoCheck: config.autoCheck ?? true,
      checkIntervalMs: config.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS,
      contractAddresses: config.contractAddresses ?? {},
    };

    // Restore cached rewards from localStorage
    this._restoreCache();
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  /** Set the connected wallet address. Required before any reward operations. */
  setUserAddress(address: string): void {
    this.userAddress = address.toLowerCase();
    // Clear cached rewards when the user changes
    this.rewards.clear();
    this._restoreCache();

    if (this.config.autoCheck) {
      this.startAutoCheck();
    }
  }

  /** Start automatic polling for new eligible rewards. */
  startAutoCheck(): void {
    if (this.pollTimer || this.destroyed) return;
    this.pollTimer = setInterval(() => {
      this._pollRewards();
    }, this.config.checkIntervalMs);
    // Immediate first check
    this._pollRewards();
  }

  /** Stop automatic polling. */
  stopAutoCheck(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Tear down the client: stop polling, clear listeners, flush cache. */
  destroy(): void {
    this.destroyed = true;
    this.stopAutoCheck();
    this.listeners = [];
    this._persistCache();
  }

  // =========================================================================
  // ELIGIBILITY
  // =========================================================================

  /**
   * Check whether the current user is eligible for a reward based on an event.
   *
   * Sends event data to the backend eligibility engine. If eligible, a new
   * `UserReward` in `pending` status is returned and stored locally.
   *
   * @param eventType  The event action type (e.g. "swap", "bridge", "referral")
   * @param properties Optional key-value properties for the event
   * @returns The created reward if eligible, or `null`
   */
  async checkEligibility(
    eventType: string,
    properties?: Record<string, unknown>,
  ): Promise<UserReward | null> {
    if (!this.userAddress) {
      throw new Error('RewardClient: userAddress must be set before checking eligibility');
    }

    const body = {
      user: this.userAddress,
      eventType,
      properties: properties ?? {},
      timestamp: now(),
      requestId: generateId(),
    };

    try {
      const result = await this._fetch('/v1/rewards/evaluate', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!result.eligible) {
        return null;
      }

      const reward: UserReward = {
        id: result.rewardId ?? generateId(),
        actionType: eventType,
        amount: result.amountWei ?? '0',
        status: 'pending',
        createdAt: now(),
      };

      this.rewards.set(reward.id, reward);
      this._persistCache();
      this._notify(reward);

      return reward;
    } catch (err) {
      // Network / server errors should not crash the host app
      if (typeof console !== 'undefined') {
        console.warn('[Aether RewardClient] eligibility check failed:', err);
      }
      return null;
    }
  }

  // =========================================================================
  // PROOF MANAGEMENT
  // =========================================================================

  /**
   * Retrieve the oracle-signed proof for a reward.
   *
   * The proof contains all parameters needed for the on-chain `claimReward`
   * transaction, including the oracle's ECDSA signature.
   *
   * @param rewardId  The ID of the reward to fetch a proof for
   * @returns Signed proof, or `null` if not yet available
   */
  async getProof(rewardId: string): Promise<RewardProof | null> {
    if (!this.userAddress) {
      throw new Error('RewardClient: userAddress must be set before retrieving proofs');
    }

    try {
      const result = await this._fetch(`/v1/rewards/proof/${rewardId}`, {
        method: 'GET',
      });

      if (!result.proof) {
        return null;
      }

      const proof: RewardProof = {
        user: result.proof.user,
        actionType: result.proof.actionType,
        amountWei: result.proof.amountWei,
        nonce: result.proof.nonce,
        expiry: result.proof.expiry,
        chainId: result.proof.chainId,
        contractAddress: result.proof.contractAddress,
        signature: result.proof.signature,
        messageHash: result.proof.messageHash,
      };

      // Update local reward state
      const local = this.rewards.get(rewardId);
      if (local) {
        local.status = 'proved';
        local.proof = proof;
        this._persistCache();
        this._notify(local);
      }

      return proof;
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.warn('[Aether RewardClient] proof retrieval failed:', err);
      }
      return null;
    }
  }

  // =========================================================================
  // ON-CHAIN CLAIMING
  // =========================================================================

  /**
   * Claim a reward on-chain.
   *
   * 1. Retrieves the oracle proof (if not already cached).
   * 2. Builds ABI-encoded calldata for `claimReward(...)`.
   * 3. If an ethers.js `Signer` is provided, sends the transaction directly.
   * 4. Otherwise, returns the encoded calldata for manual submission.
   *
   * @param rewardId  The reward to claim
   * @param signer    Optional ethers.js Signer for direct submission
   * @returns Transaction hash (if signer provided) or hex calldata
   */
  async claimOnChain(rewardId: string, signer?: any): Promise<string> {
    if (!this.userAddress) {
      throw new Error('RewardClient: userAddress must be set before claiming');
    }

    // 1. Ensure we have a proof
    let local = this.rewards.get(rewardId);
    let proof = local?.proof ?? null;

    if (!proof) {
      proof = await this.getProof(rewardId);
      if (!proof) {
        throw new Error(`RewardClient: no proof available for reward ${rewardId}`);
      }
    }

    // 2. Validate proof is not expired
    const nowSec = Math.floor(Date.now() / 1000);
    if (proof.expiry > 0 && proof.expiry < nowSec) {
      throw new Error(`RewardClient: proof for reward ${rewardId} has expired`);
    }

    // 3. Build calldata
    const calldata = this._buildClaimCalldata(proof);

    // 4. Resolve the contract address
    const contractAddress =
      proof.contractAddress ||
      this.config.contractAddresses[proof.chainId];

    if (!contractAddress) {
      throw new Error(
        `RewardClient: no contract address configured for chainId ${proof.chainId}`,
      );
    }

    // 5. If signer is available, send the transaction
    if (signer) {
      try {
        const tx = await signer.sendTransaction({
          to: contractAddress,
          data: calldata,
          value: '0x0',
        });

        const receipt = typeof tx.wait === 'function' ? await tx.wait() : tx;
        const txHash: string = receipt.hash ?? receipt.transactionHash ?? tx.hash;

        // Update local state
        local = this.rewards.get(rewardId);
        if (local) {
          local.status = 'claimed';
          local.claimedTxHash = txHash;
          this._persistCache();
          this._notify(local);
        }

        // Report claim to backend
        this._reportClaim(rewardId, txHash).catch(() => {});

        return txHash;
      } catch (err: any) {
        // Mark as failed locally
        local = this.rewards.get(rewardId);
        if (local) {
          local.status = 'failed';
          this._persistCache();
          this._notify(local);
        }
        throw new Error(`RewardClient: on-chain claim failed — ${err.message ?? err}`);
      }
    }

    // 6. No signer — return raw calldata for manual submission
    return calldata;
  }

  // =========================================================================
  // QUERY
  // =========================================================================

  /** Fetch all rewards for the current user from the backend. */
  async getRewards(): Promise<UserReward[]> {
    if (!this.userAddress) {
      return [];
    }

    try {
      const result = await this._fetch(
        `/v1/rewards/user/${this.userAddress}`,
        { method: 'GET' },
      );

      const rewards: UserReward[] = (result.rewards ?? []).map((r: any) => ({
        id: r.id,
        actionType: r.actionType,
        amount: r.amountWei ?? r.amount ?? '0',
        status: r.status ?? 'pending',
        proof: r.proof ?? undefined,
        claimedTxHash: r.claimedTxHash ?? undefined,
        createdAt: r.createdAt ?? now(),
      }));

      // Merge with local cache (backend is source of truth for status)
      for (const reward of rewards) {
        this.rewards.set(reward.id, reward);
      }
      this._persistCache();

      return rewards;
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.warn('[Aether RewardClient] getRewards failed:', err);
      }
      return this.getLocalRewards();
    }
  }

  /** Fetch active reward campaigns. */
  async getCampaigns(): Promise<RewardCampaign[]> {
    try {
      const result = await this._fetch('/v1/rewards/campaigns', {
        method: 'GET',
      });

      return (result.campaigns ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? '',
        rewardAmount: c.rewardAmount ?? '0',
        tokenSymbol: c.tokenSymbol ?? 'AETH',
        active: c.active ?? true,
        chainId: c.chainId ?? 1,
      }));
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.warn('[Aether RewardClient] getCampaigns failed:', err);
      }
      return [];
    }
  }

  /** Return locally cached rewards without making a network call. */
  getLocalRewards(): UserReward[] {
    return Array.from(this.rewards.values());
  }

  // =========================================================================
  // EVENTS
  // =========================================================================

  /**
   * Subscribe to new/updated reward notifications.
   *
   * @param callback  Invoked whenever a reward is created or its status changes
   * @returns Unsubscribe function
   */
  onReward(callback: RewardCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  // =========================================================================
  // INTERNAL — NETWORKING
  // =========================================================================

  /**
   * Generic fetch wrapper with API key header, JSON parsing, and error handling.
   */
  private async _fetch(path: string, options?: RequestInit): Promise<any> {
    const url = `${this.config.endpoint}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.config.apiKey,
      ...(options?.headers as Record<string, string> ?? {}),
    };

    if (this.userAddress) {
      headers['X-User-Address'] = this.userAddress;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `RewardClient API error: ${response.status} ${response.statusText} — ${errorBody}`,
      );
    }

    return response.json();
  }

  /**
   * Report a successful on-chain claim to the backend so it can update the
   * reward status and verify the transaction.
   */
  private async _reportClaim(rewardId: string, txHash: string): Promise<void> {
    await this._fetch('/v1/rewards/claim', {
      method: 'POST',
      body: JSON.stringify({
        rewardId,
        txHash,
        user: this.userAddress,
        claimedAt: now(),
      }),
    });
  }

  // =========================================================================
  // INTERNAL — NOTIFICATION
  // =========================================================================

  /** Invoke all registered listeners for a reward event. */
  private _notify(reward: UserReward): void {
    for (const listener of this.listeners) {
      try {
        listener(reward);
      } catch {
        // Listener errors must not propagate to the caller
      }
    }
  }

  // =========================================================================
  // INTERNAL — POLLING
  // =========================================================================

  /** Poll the backend for any new rewards since the last check. */
  private async _pollRewards(): Promise<void> {
    if (this.destroyed || !this.userAddress) return;

    try {
      const result = await this._fetch(
        `/v1/rewards/user/${this.userAddress}/pending`,
        { method: 'GET' },
      );

      const rewards: UserReward[] = result.rewards ?? [];
      for (const remote of rewards) {
        const existing = this.rewards.get(remote.id);
        // Only notify for genuinely new rewards
        if (!existing) {
          const reward: UserReward = {
            id: remote.id,
            actionType: remote.actionType,
            amount: remote.amountWei ?? remote.amount ?? '0',
            status: remote.status ?? 'pending',
            proof: remote.proof ?? undefined,
            claimedTxHash: remote.claimedTxHash ?? undefined,
            createdAt: remote.createdAt ?? now(),
          };
          this.rewards.set(reward.id, reward);
          this._notify(reward);
        } else if (existing.status !== remote.status) {
          // Status changed on the backend
          existing.status = remote.status;
          existing.proof = remote.proof ?? existing.proof;
          existing.claimedTxHash = remote.claimedTxHash ?? existing.claimedTxHash;
          this._notify(existing);
        }
      }

      this._persistCache();
    } catch {
      // Polling failures are silent — they will retry on next interval
    }
  }

  // =========================================================================
  // INTERNAL — ABI ENCODING
  // =========================================================================

  /**
   * Build ABI-encoded calldata for the `claimReward` smart contract function.
   *
   * Signature:
   *   claimReward(address user, string actionType, uint256 amount,
   *               bytes32 nonce, uint256 expiry, bytes signature)
   *
   * Uses manual ABI encoding (function selector + packed params) to avoid
   * depending on ethers.js ABI coder at the SDK level.
   */
  private _buildClaimCalldata(proof: RewardProof): string {
    const selector = CLAIM_REWARD_SELECTOR;

    // Encode each parameter as a 32-byte word (left-padded for values, right-padded for bytes)
    const userWord = padLeft(proof.user.replace('0x', ''), 64);
    const amountWord = padLeft(BigInt(proof.amountWei).toString(16), 64);
    const nonceWord = padLeft(proof.nonce.replace('0x', ''), 64);
    const expiryWord = padLeft(proof.expiry.toString(16), 64);

    // Dynamic types: string actionType, bytes signature
    // Head: 6 params x 32 bytes = 192 bytes. Offsets for dynamic types:
    // Param layout (by position):
    //   0: user       (static)
    //   1: actionType (dynamic -> offset)
    //   2: amount     (static)
    //   3: nonce      (static)
    //   4: expiry     (static)
    //   5: signature  (dynamic -> offset)

    // Offsets are from the start of the params area (after selector)
    // 6 words = 6 * 32 = 192 = 0xC0
    const headSize = 6 * 32;

    // Encode actionType string
    const actionBytes = utf8ToHex(proof.actionType);
    const actionLenWord = padLeft((actionBytes.length / 2).toString(16), 64);
    const actionDataPadded = padRight(actionBytes, Math.ceil(actionBytes.length / 64) * 64);

    // actionType data starts at headSize
    const actionTypeOffset = padLeft(headSize.toString(16), 64);

    // Signature data starts after actionType data
    const actionDataSize = 32 + actionDataPadded.length / 2; // length word + data
    const sigOffset = padLeft((headSize + actionDataSize).toString(16), 64);

    // Encode signature bytes
    const sigBytes = proof.signature.replace('0x', '');
    const sigLenWord = padLeft((sigBytes.length / 2).toString(16), 64);
    const sigDataPadded = padRight(sigBytes, Math.ceil(sigBytes.length / 64) * 64);

    // Assemble
    const encoded =
      selector +
      userWord +
      actionTypeOffset +
      amountWord +
      nonceWord +
      expiryWord +
      sigOffset +
      actionLenWord +
      actionDataPadded +
      sigLenWord +
      sigDataPadded;

    return '0x' + encoded.replace(/^0x/, '');
  }

  // =========================================================================
  // INTERNAL — PERSISTENCE
  // =========================================================================

  /** Persist the rewards map to localStorage. */
  private _persistCache(): void {
    if (!this.userAddress) return;
    const key = `${STORAGE_KEY_REWARDS}_${this.userAddress}`;
    const data = Array.from(this.rewards.entries());
    storage.set(key, data);
  }

  /** Restore cached rewards from localStorage. */
  private _restoreCache(): void {
    if (!this.userAddress) return;
    const key = `${STORAGE_KEY_REWARDS}_${this.userAddress}`;
    const data = storage.get<[string, UserReward][]>(key);
    if (data && Array.isArray(data)) {
      for (const [id, reward] of data) {
        this.rewards.set(id, reward);
      }
    }
  }
}

// =============================================================================
// ENCODING HELPERS
// =============================================================================

/** Left-pad a hex string to `len` characters. */
function padLeft(hex: string, len: number): string {
  const clean = hex.replace(/^0x/, '');
  return clean.length >= len ? clean : '0'.repeat(len - clean.length) + clean;
}

/** Right-pad a hex string to `len` characters. */
function padRight(hex: string, len: number): string {
  const clean = hex.replace(/^0x/, '');
  return clean.length >= len ? clean : clean + '0'.repeat(len - clean.length);
}

/** Convert a UTF-8 string to hex. */
function utf8ToHex(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a RewardClient instance.
 *
 * @example
 * ```ts
 * import { createRewardClient } from '@aether/web/rewards';
 *
 * const rewards = createRewardClient({
 *   endpoint: 'https://api.aether.io',
 *   apiKey: 'ak_live_...',
 *   contractAddresses: { 1: '0x...', 137: '0x...' },
 * });
 *
 * rewards.setUserAddress('0xabc...');
 * rewards.onReward((r) => console.log('New reward!', r));
 *
 * const reward = await rewards.checkEligibility('swap', { protocol: 'uniswap' });
 * if (reward) {
 *   const txHash = await rewards.claimOnChain(reward.id, signer);
 * }
 * ```
 */
export function createRewardClient(config: RewardConfig): RewardClient {
  return new RewardClient(config);
}
