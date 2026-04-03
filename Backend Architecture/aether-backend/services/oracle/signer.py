"""
Aether Backend — Oracle Proof Signer (EVM)

Generates cryptographic proofs for reward eligibility that are verifiable
on-chain via keccak256 message signing with secp256k1 ECDSA.

Uses eth_account for real cryptographic operations:
- keccak256 hashing (matching Solidity's abi.encodePacked)
- secp256k1 ECDSA signing via Account.signHash
- ecrecover-compatible signature verification
- Real Ethereum address derivation from private key

Requires: eth-account>=0.11.0 (included in backend extras)
"""

from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass

from shared.logger.logger import get_logger, metrics

logger = get_logger("aether.service.oracle.signer")

# eth_account for real secp256k1 ECDSA
try:
    from eth_account import Account
    from eth_account.messages import encode_defunct
    from eth_hash.auto import keccak
    ETH_ACCOUNT_AVAILABLE = True
except ImportError:
    ETH_ACCOUNT_AVAILABLE = False
    Account = None  # type: ignore[misc, assignment]
    keccak = None  # type: ignore[assignment]


def _is_local_env() -> bool:
    return os.getenv("AETHER_ENV", "local").lower() == "local"


# ======================================================================
# DATA MODELS
# ======================================================================

@dataclass(frozen=True)
class ProofConfig:
    """Configuration for the oracle signer."""
    signer_private_key: str
    contract_address: str
    chain_id: int = 1
    proof_expiry_seconds: int = 3600


@dataclass(frozen=True)
class RewardProof:
    """A cryptographic proof verifiable on-chain."""
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
            "amount_wei": str(self.amount_wei),
            "nonce": self.nonce,
            "expiry": self.expiry,
            "chain_id": self.chain_id,
            "contract_address": self.contract_address,
            "signature": self.signature,
            "message_hash": self.message_hash,
        }


# ======================================================================
# ORACLE PROOF SIGNER
# ======================================================================

class OracleProofSigner:
    """
    Generates and verifies cryptographic proofs for on-chain reward claims.

    Production: uses eth_account for real secp256k1 ECDSA signing.
    Local fallback: uses SHA-256 + HMAC simulation (NOT valid on-chain).
    """

    def __init__(self, config: ProofConfig) -> None:
        self._config = config
        self._use_real_crypto = ETH_ACCOUNT_AVAILABLE

        if not _is_local_env() and not ETH_ACCOUNT_AVAILABLE:
            raise RuntimeError(
                "eth-account required for production oracle signing. "
                "Install with: pip install eth-account>=0.11.0"
            )

        if self._use_real_crypto:
            acct = Account.from_key(config.signer_private_key)
            self._signer_address = acct.address
            logger.info(f"Oracle signer initialized (secp256k1, address={self._signer_address})")
        else:
            # Local-only fallback
            key_bytes = bytes.fromhex(config.signer_private_key.removeprefix("0x"))
            self._signer_address = f"0x{hashlib.sha256(key_bytes).hexdigest()[:40]}"
            logger.warning("Oracle signer using SHA-256 simulation (LOCAL mode only)")

    @property
    def signer_address(self) -> str:
        return self._signer_address

    # -- proof generation ------------------------------------------------

    async def generate_proof(
        self,
        user: str,
        action_type: str,
        amount_wei: int,
    ) -> RewardProof:
        """Generate a cryptographic proof for a reward claim."""
        nonce = os.urandom(32).hex()
        expiry = int(time.time()) + self._config.proof_expiry_seconds

        message_hash = self._build_message_hash(
            user, action_type, amount_wei, nonce, expiry,
        )
        signature = self._sign(message_hash)

        proof = RewardProof(
            user=user,
            action_type=action_type,
            amount_wei=amount_wei,
            nonce=nonce,
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
        """Verify a proof by recovering the signer from the signature."""
        if int(time.time()) > proof.expiry:
            logger.warning(f"Proof expired: user={proof.user} expiry={proof.expiry}")
            return False

        msg_hash = proof.message_hash.removeprefix("0x")
        sig = proof.signature.removeprefix("0x")

        recovered = self._recover_signer(msg_hash, sig)
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

    # -- crypto primitives -----------------------------------------------

    def _build_message_hash(
        self,
        user: str,
        action_type: str,
        amount_wei: int,
        nonce: str,
        expiry: int,
    ) -> str:
        """Compute keccak256(abi.encodePacked(...)) matching Solidity."""
        packed = b"".join([
            bytes.fromhex(user.removeprefix("0x").lower()),
            action_type.encode("utf-8"),
            amount_wei.to_bytes(32, "big"),
            bytes.fromhex(nonce),
            expiry.to_bytes(32, "big"),
            self._config.chain_id.to_bytes(32, "big"),
            bytes.fromhex(self._config.contract_address.removeprefix("0x").lower()),
        ])

        if self._use_real_crypto:
            return keccak(packed).hex()

        # Local fallback
        return hashlib.sha256(packed).hexdigest()

    def _sign(self, message_hash: str) -> str:
        """Sign a message hash with secp256k1 ECDSA."""
        if self._use_real_crypto:
            msg_bytes = bytes.fromhex(message_hash)
            signed = Account.signHash(msg_bytes, self._config.signer_private_key)
            return signed.signature.hex()

        # Local fallback: HMAC-SHA256 (NOT valid on-chain)
        import hmac as _hmac
        return _hmac.new(
            key=self._config.signer_private_key.encode(),
            msg=bytes.fromhex(message_hash),
            digestmod=hashlib.sha256,
        ).hexdigest()

    def _recover_signer(self, message_hash: str, signature: str) -> str:
        """Recover the signer address from a signature (ecrecover)."""
        if self._use_real_crypto:
            msg_bytes = bytes.fromhex(message_hash)
            sig_bytes = bytes.fromhex(signature)
            recovered = Account.recoverHash(msg_bytes, signature=sig_bytes)
            return recovered

        # Local fallback: re-sign and compare
        import hmac as _hmac
        expected = _hmac.new(
            key=self._config.signer_private_key.encode(),
            msg=bytes.fromhex(message_hash),
            digestmod=hashlib.sha256,
        ).hexdigest()
        if _hmac.compare_digest(expected, signature):
            return self._signer_address
        return "0x0000000000000000000000000000000000000000"


# Backward compatibility alias
OracleSigner = OracleProofSigner
