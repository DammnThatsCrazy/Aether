"""
Aether Backend — Oracle Proof Signer (EVM-only)

Generates cryptographic proofs for reward eligibility that are verifiable
on-chain via EIP-712 typed data or raw keccak256 message signing.

Supports multi-chain EVM deployment (Ethereum, Polygon, Arbitrum, Base, etc.)

Demo implementation:
    Uses ``hashlib`` (SHA-256 + HMAC) to simulate the signing flow.
    In production, replace the marked sections with ``eth_account`` /
    ``web3.py`` calls for real secp256k1 ECDSA signatures and keccak256
    hashing.
"""

from __future__ import annotations

import hashlib
import struct
import time
from dataclasses import dataclass

from services.oracle.base_signer import BaseProofSigner
from shared.logger.logger import get_logger, metrics

logger = get_logger("aether.service.oracle.signer")


# ======================================================================
# DATA MODELS
# ======================================================================

@dataclass(frozen=True)
class ProofConfig:
    """
    Configuration for the oracle signer.

    Attributes:
        signer_private_key:   Hex-encoded private key (from env).
        contract_address:     Reward-distribution contract on the target chain.
        chain_id:             EVM chain identifier (1 = mainnet).
        proof_expiry_seconds: Seconds until a generated proof expires.
    """

    signer_private_key: str
    contract_address: str
    chain_id: int = 1
    proof_expiry_seconds: int = 3_600  # 1 h


@dataclass
class RewardProof:
    """
    A signed proof that a user is entitled to claim a specific reward
    amount on-chain.

    Attributes:
        user:              Checksummed wallet address of the claimant.
        action_type:       The qualifying event type (e.g. ``conversion``).
        amount_wei:        Reward amount denominated in wei.
        nonce:             Random 32-byte hex nonce (replay protection).
        expiry:            Unix timestamp after which the proof is invalid.
        chain_id:          Target chain identifier.
        contract_address:  The reward contract this proof targets.
        signature:         Hex-encoded signature over the message hash.
        message_hash:      Hex-encoded hash of the canonical message.
    """

    user: str
    action_type: str
    amount_wei: int
    nonce: str
    expiry: int
    chain_id: int
    contract_address: str
    signature: str
    message_hash: str

    def to_dict(self) -> dict:
        return {
            "user": self.user,
            "action_type": self.action_type,
            "amount_wei": self.amount_wei,
            "nonce": self.nonce,
            "expiry": self.expiry,
            "chain_id": self.chain_id,
            "contract_address": self.contract_address,
            "signature": self.signature,
            "message_hash": self.message_hash,
        }

    @classmethod
    def from_dict(cls, data: dict) -> RewardProof:
        return cls(
            user=data["user"],
            action_type=data["action_type"],
            amount_wei=data["amount_wei"],
            nonce=data["nonce"],
            expiry=data["expiry"],
            chain_id=data["chain_id"],
            contract_address=data["contract_address"],
            signature=data["signature"],
            message_hash=data["message_hash"],
        )


# ======================================================================
# ORACLE SIGNER
# ======================================================================

class OracleSigner(BaseProofSigner):
    """
    Generates and verifies EVM-compatible reward proofs.

    Inherits shared HMAC signing, input validation, and nonce generation
    from ``BaseProofSigner``.

    Production notes:
        - Replace ``_build_message_hash`` with ``Web3.keccak`` over ABI-packed data.
        - Replace ``_simulate_sign`` with ``Account.sign_message``.
        - Replace ``_simulate_recover`` with ``Account.recover_message``.
    """

    def __init__(self, config: ProofConfig) -> None:
        super().__init__(config.signer_private_key)
        self._config = config
        self._signer_address = self._derive_address(config.signer_private_key)
        logger.info(
            f"OracleSigner initialised: chain_id={config.chain_id} "
            f"contract={config.contract_address} signer={self._signer_address}"
        )

    # -- public API ------------------------------------------------------

    @property
    def signer_address(self) -> str:
        """Return the public address of the oracle signer."""
        return self._signer_address

    async def generate_proof(
        self,
        user: str,
        action_type: str,
        amount_wei: int,
    ) -> RewardProof:
        """
        Build a signed proof authorising ``user`` to claim ``amount_wei``.

        Steps:
            1. Generate a cryptographically random 32-byte nonce.
            2. Compute the expiry timestamp.
            3. Build the canonical message hash.
            4. Sign the hash with the oracle private key.
        """
        self._validate_proof_inputs(user, amount_wei)

        nonce, expiry = self._generate_nonce_and_expiry(
            self._config.proof_expiry_seconds,
        )

        # In production:  keccak256(abi.encodePacked(user, actionType, amountWei, nonce, expiry, chainId, contractAddress))
        message_hash = self._build_message_hash(
            user=user,
            action_type=action_type,
            amount_wei=amount_wei,
            nonce=nonce,
            expiry=expiry,
        )

        # In production:  Account.signHash(message_hash, private_key)
        signature = self._simulate_sign(message_hash)

        proof = RewardProof(
            user=user,
            action_type=action_type,
            amount_wei=amount_wei,
            nonce=f"0x{nonce}",
            expiry=expiry,
            chain_id=self._config.chain_id,
            contract_address=self._config.contract_address,
            signature=f"0x{signature}",
            message_hash=f"0x{message_hash}",
        )

        logger.info(
            f"Proof generated: user={user} action={action_type} "
            f"amount={amount_wei} expiry={expiry}"
        )
        metrics.increment("oracle_proofs_generated", labels={"chain_id": str(self._config.chain_id)})
        return proof

    async def verify_proof(self, proof: RewardProof) -> bool:
        """
        Verify a proof by recovering the signer from the signature and
        checking it matches the expected oracle address.

        Also validates that the proof has not expired.
        """
        # Check expiry
        if int(time.time()) > proof.expiry:
            logger.warning(f"Proof expired: user={proof.user} expiry={proof.expiry}")
            return False

        # Strip 0x prefix for internal operations
        msg_hash = proof.message_hash.removeprefix("0x")
        sig = proof.signature.removeprefix("0x")

        # In production:  Account.recoverHash(msg_hash, signature=sig)
        recovered = self._simulate_recover(
            msg_hash, sig, expected_address=self._signer_address,
        )
        valid = recovered.lower() == self._signer_address.lower()

        if not valid:
            logger.warning(
                f"Proof verification failed: recovered={recovered} "
                f"expected={self._signer_address}"
            )

        metrics.increment(
            "oracle_proofs_verified",
            labels={"valid": str(valid), "chain_id": str(proof.chain_id)},
        )
        return valid

    # -- message construction -------------------------------------------

    def _build_message_hash(
        self,
        user: str,
        action_type: str,
        amount_wei: int,
        nonce: str,
        expiry: int,
    ) -> str:
        """
        Compute a deterministic hash of the proof payload.

        Production:
            ``keccak256(abi.encodePacked(user, actionType, uint256(amountWei),
            bytes32(nonce), uint256(expiry), uint256(chainId), contractAddress))``

        Demo:
            SHA-256 over the packed fields.
        """
        packed = b"".join([
            bytes.fromhex(user.removeprefix("0x").lower()),
            action_type.encode("utf-8"),
            struct.pack(">Q", amount_wei),           # uint256 simplified to uint64
            bytes.fromhex(nonce),                     # 32 bytes
            struct.pack(">Q", expiry),                # uint256 simplified to uint64
            struct.pack(">Q", self._config.chain_id), # uint256 simplified to uint64
            bytes.fromhex(self._config.contract_address.removeprefix("0x").lower()),
        ])
        # Production: return Web3.keccak(packed).hex()
        return hashlib.sha256(packed).hexdigest()

    # -- address derivation ---------------------------------------------

    @staticmethod
    def _derive_address(private_key_hex: str) -> str:
        """
        Derive a pseudo-address from the private key (demo only).

        Production replacement:
            ``Account.from_key(private_key_hex).address``
        """
        key_bytes = bytes.fromhex(private_key_hex.removeprefix("0x"))
        addr_hash = hashlib.sha256(key_bytes).hexdigest()[:40]
        return f"0x{addr_hash}"
