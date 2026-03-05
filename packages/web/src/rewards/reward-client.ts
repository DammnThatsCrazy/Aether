// =============================================================================
// AETHER SDK — REWARD CLIENT
// Client-side reward tracking, eligibility checking, and on-chain claiming.
// Integrates with the Aether backend reward pipeline and smart contracts.
//
// Features:
// - Automatic reward eligibility polling
// - Proof retrieval from backend oracle
// - Multi-chain on-chain reward claiming (EVM, SVM, MoveVM, NEAR, TVM, Cosmos, Bitcoin)
// - Reward history tracking
// - Campaign discovery
// =============================================================================

import { generateId, now, storage } from '../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported VM / chain types for multi-chain reward claiming. */
export type VMType = 'evm' | 'svm' | 'bitcoin' | 'movevm' | 'near' | 'tvm' | 'cosmos';

export interface RewardConfig {
  /** Backend API endpoint (e.g. "https://api.aether.io") */
  endpoint: string;
  /** Project API key */
  apiKey: string;
  /** Automatically check eligibility when events fire (default: true) */
  autoCheck?: boolean;
  /** Polling interval in milliseconds (default: 30000) */
  checkIntervalMs?: number;
  /** Chain-specific reward contract addresses: chainId -> address (legacy EVM shorthand) */
  contractAddresses?: Record<number, string>;
  /** Chain-specific contract configs: vmType -> { chainId -> address } */
  chainContracts?: Partial<Record<VMType, Record<number | string, string>>>;
}

export interface RewardProof {
  /** Wallet address of the reward recipient */
  user: string;
  /** Event type that triggered the reward */
  actionType: string;
  /** Reward amount in wei / lamports / smallest unit (string for BigInt compatibility) */
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
  /** VM type this proof targets (default: 'evm') */
  vmType?: VMType;
  /** Solana program ID (SVM) */
  programId?: string;
  /** SUI module address (MoveVM) */
  moduleAddress?: string;
  /** NEAR account ID */
  accountId?: string;
  /** Cosmos base denomination */
  baseDenom?: string;
}

export interface RewardCampaign {
  id: string;
  name: string;
  description: string;
  /** Reward amount per qualifying action (in wei / smallest unit) */
  rewardAmount: string;
  /** Token symbol (e.g. "AETH", "USDC") */
  tokenSymbol: string;
  /** Whether the campaign is currently active */
  active: boolean;
  /** Chain on which rewards are claimable */
  chainId: number;
  /** VM type for this campaign (default: 'evm') */
  vmType?: VMType;
}

export interface UserReward {
  id: string;
  actionType: string;
  /** Reward amount in wei / lamports / smallest unit */
  amount: string;
  status: 'pending' | 'proved' | 'claimed' | 'failed';
  proof?: RewardProof;
  /** Transaction hash if already claimed on-chain */
  claimedTxHash?: string;
  createdAt: string;
}

export type RewardCallback = (reward: UserReward) => void;

// ---------------------------------------------------------------------------
// Chain-specific payload types
// ---------------------------------------------------------------------------

/** Solana claim instruction payload. */
export interface SolanaClaimPayload {
  programId: string;
  instructionData: string;
  accounts: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
}

/** SUI Move call payload. */
export interface SUIClaimPayload {
  packageObjectId: string;
  module: string;
  function: string;
  typeArguments: string[];
  arguments: string[];
  gasBudget: number;
}

/** NEAR function call payload. */
export interface NEARClaimPayload {
  contractId: string;
  methodName: string;
  args: Record<string, unknown>;
  deposit: string;
  gas: string;
}

/** CosmWasm execute message payload. */
export interface CosmosClaimPayload {
  contractAddress: string;
  msg: {
    claim_reward: {
      user: string;
      action_type: string;
      amount: string;
      nonce: string;
      expiry: number;
      chain_id: number | string;
      signature: string;
      message_hash: string;
      base_denom?: string;
    };
  };
  funds: Array<{ denom: string; amount: string }>;
}

/** TRON (TVM) claim payload — EVM-compatible with TRON address formatting. */
export interface TRONClaimPayload {
  contractAddress: string;
  functionSelector: string;
  parameters: Array<{ type: string; value: string | number }>;
  feeLimit: number;
  callValue: number;
}

/** Bitcoin proof payload for manual inscription / verification. */
export interface BitcoinClaimPayload {
  proofData: {
    user: string;
    actionType: string;
    amountWei: string;
    nonce: string;
    expiry: number;
    chainId: number;
    signature: string;
    messageHash: string;
  };
  /** Hex-encoded proof data for embedding in an OP_RETURN or inscription */
  encodedProof: string;
  verificationEndpoint: string;
}

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

/** Default gas for NEAR function calls (300 TGas). */
const NEAR_DEFAULT_GAS = '300000000000000';

/** Default gas budget for SUI Move calls. */
const SUI_DEFAULT_GAS_BUDGET = 10_000_000;

/** Default fee limit for TRON transactions (100 TRX in sun). */
const TRON_DEFAULT_FEE_LIMIT = 100_000_000;

/** Anchor discriminator for a "claim_reward" instruction (first 8 bytes of SHA-256 hash). */
const SOLANA_CLAIM_DISCRIMINATOR = 'a44db0b3cfc75eab';

// ---------------------------------------------------------------------------
// RewardClient
// ---------------------------------------------------------------------------

export class RewardClient {
  private config: Required<
    Pick<RewardConfig, 'endpoint' | 'apiKey' | 'autoCheck' | 'checkIntervalMs'>
  > & {
    contractAddresses: Record<number, string>;
    chainContracts: Partial<Record<VMType, Record<number | string, string>>>;
  };

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
      chainContracts: config.chainContracts ?? {},
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
        vmType: result.proof.vmType ?? 'evm',
        programId: result.proof.programId,
        moduleAddress: result.proof.moduleAddress,
        accountId: result.proof.accountId,
        baseDenom: result.proof.baseDenom,
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
  // ON-CHAIN CLAIMING — MULTI-CHAIN ROUTER
  // =========================================================================

  /**
   * Claim a reward on-chain across any supported VM type.
   *
   * Routes to the appropriate chain-specific claim method based on `proof.vmType`.
   * If a compatible signer/wallet adapter is provided, the transaction is executed
   * directly. Otherwise, the serialized transaction payload is returned as JSON.
   *
   * @param rewardId  The reward to claim
   * @param signer    Optional chain-compatible signer/wallet adapter
   * @returns Transaction hash (if signer provided) or serialized payload JSON
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

    // 3. Route to chain-specific claim method
    const vmType: VMType = proof.vmType ?? 'evm';

    switch (vmType) {
      case 'evm':
      case 'tvm':
        return this._claimEVM(rewardId, proof, signer);
      case 'svm':
        return this._claimSolana(rewardId, proof, signer);
      case 'movevm':
        return this._claimSUI(rewardId, proof, signer);
      case 'near':
        return this._claimNEAR(rewardId, proof, signer);
      case 'cosmos':
        return this._claimCosmos(rewardId, proof, signer);
      case 'bitcoin':
        return this._claimBitcoin(rewardId, proof);
      default:
        throw new Error(`Unsupported VM type: ${vmType}`);
    }
  }

  // =========================================================================
  // CHAIN-SPECIFIC CLAIM METHODS
  // =========================================================================

  /**
   * Claim on EVM or TVM chains using ABI-encoded calldata.
   *
   * For TVM (TRON), the calldata is identical to EVM; TRON's TriggerSmartContract
   * API accepts the same ABI encoding. If the signer is a TronWeb instance
   * (detected via `signer.trx`), the TRON-specific API is used instead.
   */
  private async _claimEVM(
    rewardId: string,
    proof: RewardProof,
    signer?: any,
  ): Promise<string> {
    // Build calldata
    const calldata = this._buildClaimCalldata(proof);

    // Resolve the contract address
    const contractAddress = this._resolveContractAddress(proof);

    if (!contractAddress) {
      throw new Error(
        `RewardClient: no contract address configured for chainId ${proof.chainId} (vmType: ${proof.vmType ?? 'evm'})`,
      );
    }

    // If signer is available, send the transaction
    if (signer) {
      try {
        let txHash: string;

        // Detect TronWeb signer (has `signer.trx` namespace)
        if (proof.vmType === 'tvm' && signer.trx && typeof signer.trx.sendRawTransaction === 'function') {
          txHash = await this._executeTRONTransaction(signer, proof, contractAddress);
        } else {
          // Standard EVM signer (ethers.js / viem / web3.js compatible)
          const tx = await signer.sendTransaction({
            to: contractAddress,
            data: calldata,
            value: '0x0',
          });

          const receipt = typeof tx.wait === 'function' ? await tx.wait() : tx;
          txHash = receipt.hash ?? receipt.transactionHash ?? tx.hash;
        }

        // Update local state
        this._markClaimed(rewardId, txHash);

        // Report claim to backend
        this._reportClaim(rewardId, txHash).catch(() => {});

        return txHash;
      } catch (err: any) {
        this._markFailed(rewardId);
        throw new Error(`RewardClient: EVM/TVM claim failed — ${err.message ?? err}`);
      }
    }

    // No signer — return raw calldata for manual submission
    // For TVM, also include TRON-formatted payload
    if (proof.vmType === 'tvm') {
      const tronPayload = this._buildTRONClaimPayload(proof);
      return JSON.stringify({ calldata, tronPayload });
    }

    return calldata;
  }

  /**
   * Execute a TRON transaction via TronWeb signer.
   */
  private async _executeTRONTransaction(
    tronWeb: any,
    proof: RewardProof,
    contractAddress: string,
  ): Promise<string> {
    const functionSelector = 'claimReward(address,string,uint256,bytes32,uint256,bytes)';
    const parameters = [
      { type: 'address', value: proof.user },
      { type: 'string', value: proof.actionType },
      { type: 'uint256', value: proof.amountWei },
      { type: 'bytes32', value: proof.nonce },
      { type: 'uint256', value: proof.expiry.toString() },
      { type: 'bytes', value: proof.signature },
    ];

    const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
      contractAddress,
      functionSelector,
      { feeLimit: TRON_DEFAULT_FEE_LIMIT, callValue: 0 },
      parameters,
      proof.user,
    );

    const signedTx = await tronWeb.trx.sign(transaction.transaction);
    const result = await tronWeb.trx.sendRawTransaction(signedTx);

    return result.txid ?? result.transaction?.txID ?? '';
  }

  /**
   * Claim on Solana (SVM) by building an Anchor-compatible instruction.
   *
   * If a Solana wallet adapter signer is provided (has `signTransaction` or
   * `sendTransaction`), the transaction is sent directly. Otherwise, the
   * serialized instruction payload is returned.
   */
  private async _claimSolana(
    rewardId: string,
    proof: RewardProof,
    signer?: any,
  ): Promise<string> {
    const payload = this._buildSolanaClaimPayload(proof);

    if (signer) {
      try {
        let txHash: string;

        if (typeof signer.sendTransaction === 'function') {
          // Wallet adapter with sendTransaction (e.g. @solana/wallet-adapter)
          // Build a minimal transaction object that the adapter can sign and send
          const txPayload = {
            instructions: [{
              programId: payload.programId,
              data: payload.instructionData,
              keys: payload.accounts,
            }],
          };

          const result = await signer.sendTransaction(txPayload);
          txHash = typeof result === 'string' ? result : result.signature ?? result.toString();
        } else if (typeof signer.signTransaction === 'function') {
          // Signer that only signs — caller must submit separately
          const txPayload = {
            instructions: [{
              programId: payload.programId,
              data: payload.instructionData,
              keys: payload.accounts,
            }],
          };

          const signedTx = await signer.signTransaction(txPayload);
          txHash = typeof signedTx === 'string'
            ? signedTx
            : signedTx.signature ?? signedTx.toString();
        } else {
          throw new Error('Solana signer must implement sendTransaction or signTransaction');
        }

        this._markClaimed(rewardId, txHash);
        this._reportClaim(rewardId, txHash).catch(() => {});

        return txHash;
      } catch (err: any) {
        this._markFailed(rewardId);
        throw new Error(`RewardClient: Solana claim failed — ${err.message ?? err}`);
      }
    }

    // No signer — return serialized payload
    return JSON.stringify(payload);
  }

  /**
   * Claim on SUI (MoveVM) by building a Move call payload.
   *
   * If a SUI wallet adapter signer is provided (has `signAndExecuteTransactionBlock`),
   * the transaction is executed directly. Otherwise, the serialized Move call is returned.
   */
  private async _claimSUI(
    rewardId: string,
    proof: RewardProof,
    signer?: any,
  ): Promise<string> {
    const payload = this._buildSUIClaimPayload(proof);

    if (signer) {
      try {
        let txHash: string;

        if (typeof signer.signAndExecuteTransactionBlock === 'function') {
          // @mysten/wallet-standard compatible signer
          const result = await signer.signAndExecuteTransactionBlock({
            transactionBlock: {
              kind: 'moveCall',
              data: {
                packageObjectId: payload.packageObjectId,
                module: payload.module,
                function: payload.function,
                typeArguments: payload.typeArguments,
                arguments: payload.arguments,
              },
            },
            options: { showEffects: true },
          });

          txHash = result.digest ?? result.hash ?? '';
        } else if (typeof signer.executeMoveCall === 'function') {
          // Legacy SUI signer
          const result = await signer.executeMoveCall({
            packageObjectId: payload.packageObjectId,
            module: payload.module,
            function: payload.function,
            typeArguments: payload.typeArguments,
            arguments: payload.arguments,
            gasBudget: payload.gasBudget,
          });

          txHash = result.digest ?? result.certificate?.transactionDigest ?? '';
        } else {
          throw new Error(
            'SUI signer must implement signAndExecuteTransactionBlock or executeMoveCall',
          );
        }

        this._markClaimed(rewardId, txHash);
        this._reportClaim(rewardId, txHash).catch(() => {});

        return txHash;
      } catch (err: any) {
        this._markFailed(rewardId);
        throw new Error(`RewardClient: SUI claim failed — ${err.message ?? err}`);
      }
    }

    // No signer — return serialized payload
    return JSON.stringify(payload);
  }

  /**
   * Claim on NEAR by building a function call action.
   *
   * If a NEAR wallet selector signer is provided (has `signAndSendTransaction`),
   * the transaction is executed directly. Otherwise, the serialized payload is returned.
   */
  private async _claimNEAR(
    rewardId: string,
    proof: RewardProof,
    signer?: any,
  ): Promise<string> {
    const payload = this._buildNEARClaimPayload(proof);

    if (signer) {
      try {
        let txHash: string;

        if (typeof signer.signAndSendTransaction === 'function') {
          // NEAR wallet-selector compatible signer
          const result = await signer.signAndSendTransaction({
            receiverId: payload.contractId,
            actions: [
              {
                type: 'FunctionCall',
                params: {
                  methodName: payload.methodName,
                  args: payload.args,
                  gas: payload.gas,
                  deposit: payload.deposit,
                },
              },
            ],
          });

          txHash = result?.transaction?.hash
            ?? result?.transaction_outcome?.id
            ?? (typeof result === 'string' ? result : '');
        } else if (typeof signer.functionCall === 'function') {
          // near-api-js Account compatible signer
          const result = await signer.functionCall({
            contractId: payload.contractId,
            methodName: payload.methodName,
            args: payload.args,
            gas: payload.gas,
            attachedDeposit: payload.deposit,
          });

          txHash = result?.transaction?.hash
            ?? result?.transaction_outcome?.id
            ?? '';
        } else {
          throw new Error(
            'NEAR signer must implement signAndSendTransaction or functionCall',
          );
        }

        this._markClaimed(rewardId, txHash);
        this._reportClaim(rewardId, txHash).catch(() => {});

        return txHash;
      } catch (err: any) {
        this._markFailed(rewardId);
        throw new Error(`RewardClient: NEAR claim failed — ${err.message ?? err}`);
      }
    }

    // No signer — return serialized payload
    return JSON.stringify(payload);
  }

  /**
   * Claim on Cosmos chains by building a CosmWasm execute message.
   *
   * If a Cosmos signer is provided (e.g. CosmJS SigningCosmWasmClient with `execute`),
   * the transaction is executed directly. Otherwise, the serialized message is returned.
   */
  private async _claimCosmos(
    rewardId: string,
    proof: RewardProof,
    signer?: any,
  ): Promise<string> {
    const payload = this._buildCosmosClaimPayload(proof);

    if (signer) {
      try {
        let txHash: string;

        if (typeof signer.execute === 'function') {
          // CosmJS SigningCosmWasmClient compatible signer
          const result = await signer.execute(
            proof.user,
            payload.contractAddress,
            payload.msg,
            'auto',
            'Aether reward claim',
            payload.funds,
          );

          txHash = result.transactionHash ?? result.txHash ?? '';
        } else if (typeof signer.signAndBroadcast === 'function') {
          // Generic Cosmos signing client
          const executeMsg = {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: {
              sender: proof.user,
              contract: payload.contractAddress,
              msg: new TextEncoder().encode(JSON.stringify(payload.msg)),
              funds: payload.funds,
            },
          };

          const result = await signer.signAndBroadcast(
            proof.user,
            [executeMsg],
            'auto',
            'Aether reward claim',
          );

          txHash = result.transactionHash ?? '';
        } else {
          throw new Error(
            'Cosmos signer must implement execute or signAndBroadcast',
          );
        }

        this._markClaimed(rewardId, txHash);
        this._reportClaim(rewardId, txHash).catch(() => {});

        return txHash;
      } catch (err: any) {
        this._markFailed(rewardId);
        throw new Error(`RewardClient: Cosmos claim failed — ${err.message ?? err}`);
      }
    }

    // No signer — return serialized payload
    return JSON.stringify(payload);
  }

  /**
   * Handle Bitcoin reward claims.
   *
   * Bitcoin does not support smart contracts natively, so this method returns
   * the proof data formatted for manual inscription or off-chain verification.
   * The proof can be embedded in an OP_RETURN output or Ordinals inscription
   * for on-chain attestation.
   *
   * @returns Serialized Bitcoin claim payload JSON
   */
  private async _claimBitcoin(
    rewardId: string,
    proof: RewardProof,
  ): Promise<string> {
    const proofData = {
      user: proof.user,
      actionType: proof.actionType,
      amountWei: proof.amountWei,
      nonce: proof.nonce,
      expiry: proof.expiry,
      chainId: proof.chainId,
      signature: proof.signature,
      messageHash: proof.messageHash,
    };

    // Build hex-encoded proof for OP_RETURN / inscription embedding
    const proofJson = JSON.stringify(proofData);
    const encodedProof = utf8ToHex(proofJson);

    const payload: BitcoinClaimPayload = {
      proofData,
      encodedProof,
      verificationEndpoint: `${this.config.endpoint}/v1/rewards/bitcoin/verify`,
    };

    // Report the claim attempt to the backend for tracking
    // (actual verification happens when the Bitcoin transaction is confirmed)
    this._reportClaim(rewardId, `bitcoin:pending:${proof.nonce}`).catch(() => {});

    // Update local state to reflect that the proof has been retrieved
    const local = this.rewards.get(rewardId);
    if (local) {
      local.status = 'proved';
      this._persistCache();
      this._notify(local);
    }

    return JSON.stringify(payload);
  }

  // =========================================================================
  // CHAIN-SPECIFIC PAYLOAD BUILDERS
  // =========================================================================

  /**
   * Build a Solana claim instruction payload for the Anchor reward program.
   *
   * Returns a serializable object containing the program ID, serialized
   * instruction data (Anchor discriminator + borsh-encoded args), and the
   * required account metas.
   */
  _buildSolanaClaimPayload(proof: RewardProof): SolanaClaimPayload {
    const programId = proof.programId
      ?? this._resolveChainContract('svm', proof.chainId)
      ?? proof.contractAddress;

    if (!programId) {
      throw new Error('RewardClient: no Solana program ID configured');
    }

    // Serialize instruction data: discriminator (8 bytes) + arguments
    // Arguments are serialized in Borsh-like format:
    //   action_type: string (4-byte length prefix + utf8 bytes)
    //   amount: u64 (8 bytes, little-endian)
    //   nonce: [u8; 32]
    //   expiry: i64 (8 bytes, little-endian)
    //   signature: Vec<u8> (4-byte length prefix + bytes)
    const actionTypeBytes = new TextEncoder().encode(proof.actionType);
    const nonceBytes = hexToBytes(proof.nonce);
    const signatureBytes = hexToBytes(proof.signature);
    const amount = BigInt(proof.amountWei);

    // Calculate total buffer size
    const bufferSize =
      8 +                                  // discriminator
      4 + actionTypeBytes.length +         // action_type string
      8 +                                  // amount u64
      32 +                                 // nonce [u8; 32]
      8 +                                  // expiry i64
      4 + signatureBytes.length;           // signature Vec<u8>

    const buffer = new Uint8Array(bufferSize);
    const view = new DataView(buffer.buffer);
    let offset = 0;

    // Discriminator (8 bytes)
    const discBytes = hexToBytes(SOLANA_CLAIM_DISCRIMINATOR);
    buffer.set(discBytes, offset);
    offset += 8;

    // action_type: string (length-prefixed)
    view.setUint32(offset, actionTypeBytes.length, true);
    offset += 4;
    buffer.set(actionTypeBytes, offset);
    offset += actionTypeBytes.length;

    // amount: u64 little-endian
    view.setBigUint64(offset, amount, true);
    offset += 8;

    // nonce: [u8; 32]
    buffer.set(nonceBytes.slice(0, 32), offset);
    offset += 32;

    // expiry: i64 little-endian
    view.setBigInt64(offset, BigInt(proof.expiry), true);
    offset += 8;

    // signature: Vec<u8> (length-prefixed)
    view.setUint32(offset, signatureBytes.length, true);
    offset += 4;
    buffer.set(signatureBytes, offset);

    const instructionData = bytesToHex(buffer);

    // Define required accounts for the claim instruction
    // These follow the standard Anchor reward program account layout
    const accounts = [
      { pubkey: proof.user, isSigner: true, isWritable: true },           // claimer
      { pubkey: proof.contractAddress || programId, isSigner: false, isWritable: true },  // reward vault / state PDA
      { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },  // system program
    ];

    return {
      programId,
      instructionData,
      accounts,
    };
  }

  /**
   * Build a SUI Move call payload for the reward module.
   *
   * Returns a MoveCall transaction data object compatible with the SUI SDK
   * `signAndExecuteTransactionBlock` or `executeMoveCall` APIs.
   */
  _buildSUIClaimPayload(proof: RewardProof): SUIClaimPayload {
    const moduleAddress = proof.moduleAddress
      ?? this._resolveChainContract('movevm', proof.chainId)
      ?? proof.contractAddress;

    if (!moduleAddress) {
      throw new Error('RewardClient: no SUI module address configured');
    }

    return {
      packageObjectId: moduleAddress,
      module: 'rewards',
      function: 'claim_reward',
      typeArguments: [],
      arguments: [
        proof.user,
        proof.actionType,
        proof.amountWei,
        proof.nonce,
        proof.expiry.toString(),
        proof.chainId.toString(),
        proof.signature,
        proof.messageHash,
      ],
      gasBudget: SUI_DEFAULT_GAS_BUDGET,
    };
  }

  /**
   * Build a NEAR function call payload for the reward contract.
   *
   * Returns a payload compatible with NEAR wallet-selector's
   * `signAndSendTransaction` or near-api-js `Account.functionCall`.
   */
  _buildNEARClaimPayload(proof: RewardProof): NEARClaimPayload {
    const contractId = proof.accountId
      ?? this._resolveChainContract('near', proof.chainId)
      ?? proof.contractAddress;

    if (!contractId) {
      throw new Error('RewardClient: no NEAR contract account ID configured');
    }

    return {
      contractId,
      methodName: 'claim_reward',
      args: {
        user: proof.user,
        action_type: proof.actionType,
        amount: proof.amountWei,
        nonce: proof.nonce,
        expiry: proof.expiry,
        chain_id: proof.chainId,
        signature: proof.signature,
        message_hash: proof.messageHash,
      },
      deposit: '0',
      gas: NEAR_DEFAULT_GAS,
    };
  }

  /**
   * Build a CosmWasm execute message for the reward contract.
   *
   * Returns a payload compatible with CosmJS `SigningCosmWasmClient.execute`
   * or generic `signAndBroadcast`.
   */
  _buildCosmosClaimPayload(proof: RewardProof): CosmosClaimPayload {
    const contractAddress = this._resolveChainContract('cosmos', proof.chainId)
      ?? proof.contractAddress;

    if (!contractAddress) {
      throw new Error('RewardClient: no Cosmos contract address configured');
    }

    return {
      contractAddress,
      msg: {
        claim_reward: {
          user: proof.user,
          action_type: proof.actionType,
          amount: proof.amountWei,
          nonce: proof.nonce,
          expiry: proof.expiry,
          chain_id: proof.chainId,
          signature: proof.signature,
          message_hash: proof.messageHash,
          base_denom: proof.baseDenom,
        },
      },
      funds: [],
    };
  }

  /**
   * Build a TRON (TVM) claim payload.
   *
   * TRON uses the same ABI encoding as EVM but with TRON-specific address formatting
   * (Base58Check with `T` prefix). This payload is compatible with TronWeb's
   * `transactionBuilder.triggerSmartContract` API.
   */
  _buildTRONClaimPayload(proof: RewardProof): TRONClaimPayload {
    const contractAddress = this._resolveChainContract('tvm', proof.chainId)
      ?? proof.contractAddress;

    if (!contractAddress) {
      throw new Error('RewardClient: no TRON contract address configured');
    }

    return {
      contractAddress,
      functionSelector: 'claimReward(address,string,uint256,bytes32,uint256,bytes)',
      parameters: [
        { type: 'address', value: proof.user },
        { type: 'string', value: proof.actionType },
        { type: 'uint256', value: proof.amountWei },
        { type: 'bytes32', value: proof.nonce },
        { type: 'uint256', value: proof.expiry.toString() },
        { type: 'bytes', value: proof.signature },
      ],
      feeLimit: TRON_DEFAULT_FEE_LIMIT,
      callValue: 0,
    };
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
        vmType: c.vmType ?? 'evm',
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
  // INTERNAL — CONTRACT ADDRESS RESOLUTION
  // =========================================================================

  /**
   * Resolve the contract address for a proof, checking in order:
   * 1. The proof's own `contractAddress`
   * 2. Chain-specific contracts from `chainContracts[vmType][chainId]`
   * 3. Legacy `contractAddresses[chainId]` (EVM only)
   */
  private _resolveContractAddress(proof: RewardProof): string | undefined {
    if (proof.contractAddress) return proof.contractAddress;

    const vmType = proof.vmType ?? 'evm';
    const chainContract = this._resolveChainContract(vmType, proof.chainId);
    if (chainContract) return chainContract;

    // Legacy EVM fallback
    if (vmType === 'evm' || vmType === 'tvm') {
      return this.config.contractAddresses[proof.chainId];
    }

    return undefined;
  }

  /**
   * Look up a contract address from the `chainContracts` config for a given
   * VM type and chain ID.
   */
  private _resolveChainContract(vmType: VMType, chainId: number | string): string | undefined {
    const vmContracts = this.config.chainContracts[vmType];
    if (!vmContracts) return undefined;
    return vmContracts[chainId] ?? vmContracts[String(chainId)];
  }

  // =========================================================================
  // INTERNAL — STATE HELPERS
  // =========================================================================

  /** Mark a reward as claimed locally and notify listeners. */
  private _markClaimed(rewardId: string, txHash: string): void {
    const local = this.rewards.get(rewardId);
    if (local) {
      local.status = 'claimed';
      local.claimedTxHash = txHash;
      this._persistCache();
      this._notify(local);
    }
  }

  /** Mark a reward as failed locally and notify listeners. */
  private _markFailed(rewardId: string): void {
    const local = this.rewards.get(rewardId);
    if (local) {
      local.status = 'failed';
      this._persistCache();
      this._notify(local);
    }
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

      const rewards: any[] = result.rewards ?? [];
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

/** Convert a hex string to a Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Convert a Uint8Array to a hex string (no 0x prefix). */
function bytesToHex(bytes: Uint8Array): string {
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
 *   chainContracts: {
 *     svm: { 'mainnet-beta': 'ProgramId...' },
 *     movevm: { 1: '0xModuleAddress...' },
 *     near: { 'mainnet': 'rewards.aether.near' },
 *     cosmos: { 'osmosis-1': 'osmo1contract...' },
 *   },
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
