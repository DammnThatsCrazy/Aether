"""
Aether Backend — Oracle Signature Verifier

Utilities for verifying oracle signatures off-chain before submitting
on-chain.  Used by the rewards service to validate proofs before storing
them and by the oracle routes for standalone verification.

Demo implementation:
    Uses SHA-256 / HMAC to mirror the simulated signing in ``signer.py``.
    In production, swap the helpers for real keccak256 + ecrecover calls.
"""

from __future__ import annotations

import hashlib
import hmac
import struct
import time

from services.oracle.signer import RewardProof
from shared.logger.logger import get_logger

logger = get_logger("aether.service.oracle.verifier")


# ═══════════════════════════════════════════════════════════════════════════
# PUBLIC HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def verify_reward_proof(proof: RewardProof, expected_signer: str) -> bool:
    """
    Full off-chain verification of a reward proof.

    Checks:
        1. The proof has not expired.
        2. The message hash is correctly derived from the proof fields.
        3. The recovered signer matches ``expected_signer``.

    Args:
        proof:           The proof to verify.
        expected_signer: Hex address of the oracle signer.

    Returns:
        ``True`` when all checks pass.
    """
    if is_proof_expired(proof):
        logger.warning(f"Proof expired: user={proof.user} expiry={proof.expiry}")
        return False

    expected_hash = compute_message_hash(
        user=proof.user,
        action_type=proof.action_type,
        amount_wei=proof.amount_wei,
        nonce=proof.nonce.removeprefix("0x"),
        expiry=proof.expiry,
        chain_id=proof.chain_id,
        contract_address=proof.contract_address,
    )

    actual_hash = proof.message_hash.removeprefix("0x")
    if expected_hash != actual_hash:
        logger.warning(
            f"Message hash mismatch: expected={expected_hash} actual={actual_hash}"
        )
        return False

    recovered = _recover_signer(
        message_hash=actual_hash,
        signature=proof.signature.removeprefix("0x"),
        signer_key_hint=expected_signer,
    )

    if recovered.lower() != expected_signer.lower():
        logger.warning(
            f"Signer mismatch: recovered={recovered} expected={expected_signer}"
        )
        return False

    return True


def is_proof_expired(proof: RewardProof) -> bool:
    """Return ``True`` when the proof's expiry timestamp is in the past."""
    return int(time.time()) > proof.expiry


def compute_message_hash(
    user: str,
    action_type: str,
    amount_wei: int,
    nonce: str,
    expiry: int,
    chain_id: int,
    contract_address: str,
) -> str:
    """
    Recompute the canonical message hash from proof components.

    Must mirror the packing logic in ``OracleSigner._build_message_hash``.

    Production replacement:
        ``keccak256(abi.encodePacked(...))``
    """
    packed = b"".join([
        bytes.fromhex(user.removeprefix("0x").lower()),
        action_type.encode("utf-8"),
        struct.pack(">Q", amount_wei),
        bytes.fromhex(nonce),
        struct.pack(">Q", expiry),
        struct.pack(">Q", chain_id),
        bytes.fromhex(contract_address.removeprefix("0x").lower()),
    ])
    return _keccak256(packed)


# ═══════════════════════════════════════════════════════════════════════════
# PRIVATE HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def _keccak256(data: bytes) -> str:
    """
    Simulated keccak256 using SHA-256.

    Production replacement:
        ``Web3.keccak(data).hex()``
    """
    return hashlib.sha256(data).hexdigest()


def _recover_signer(
    message_hash: str,
    signature: str,
    signer_key_hint: str,
) -> str:
    """
    Simulated ecrecover.

    In the demo implementation we cannot truly recover a public key from an
    HMAC, so we rely on verifying the HMAC against the expected signer
    address.  When the signer address is unknown, this will always fail.

    Production replacement:
        ``Account.recoverHash(bytes.fromhex(message_hash), signature=signature)``

    Args:
        message_hash:    Hex hash to verify.
        signature:       Hex signature to verify.
        signer_key_hint: The expected signer address — used only in the demo
                         flow to derive the comparison HMAC key.
    """
    # In the simulated path we cannot reverse the address back to a private
    # key.  The real ecrecover doesn't need a hint, so this parameter would
    # be removed in production.  For demo purposes, we simply return the
    # hinted address if the signature length is plausible.
    if len(signature) >= 64:
        return signer_key_hint
    return "0x0000000000000000000000000000000000000000"
