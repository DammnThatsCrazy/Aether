"""
Aether Backend — Base Proof Signer

Shared cryptographic signing infrastructure used by both the EVM-only
``OracleSigner`` and the ``MultiChainSigner``.

Extracts the common HMAC-SHA256 simulation, input validation, nonce
generation, and hex formatting helpers so subclasses only need to
provide chain-specific message hashing and address derivation.

Demo implementation:
    Uses ``hashlib`` (SHA-256 + HMAC) to simulate the signing flow.
    In production, replace with chain-specific crypto libraries.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from dataclasses import dataclass

from shared.common.common import BadRequestError


# ======================================================================
# DATA MODELS
# ======================================================================

@dataclass(frozen=True)
class BaseProofConfig:
    """
    Shared configuration fields for all oracle signers.

    Attributes:
        signer_private_key:   Hex-encoded private key (from env).
        contract_address:     Reward-distribution contract on the target chain.
        chain_id:             Chain identifier (EVM chain ID, Cosmos numeric, etc.).
        proof_expiry_seconds: Seconds until a generated proof expires.
    """

    signer_private_key: str
    contract_address: str
    chain_id: int = 1
    proof_expiry_seconds: int = 3_600  # 1 h


@dataclass
class BaseRewardProof:
    """
    Minimal set of fields shared by all reward proofs regardless of chain.

    Attributes:
        user:              Address/account identifier of the claimant.
        action_type:       The qualifying event type (e.g. ``conversion``).
        amount_wei:        Reward amount (wei, lamports, satoshis, etc.).
        nonce:             Random 32-byte hex nonce (replay protection).
        expiry:            Unix timestamp after which the proof is invalid.
        chain_id:          Target chain identifier.
        contract_address:  The reward contract/program this proof targets.
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


# ======================================================================
# BASE PROOF SIGNER
# ======================================================================

class BaseProofSigner:
    """
    Shared signing infrastructure for all oracle signers.

    Provides:
        - HMAC-SHA256 simulated signing and recovery (domain-separated).
        - Input validation for proof generation requests.
        - Nonce and expiry generation.
        - Generic hex formatting / stripping helpers.

    Subclasses must implement chain-specific message hashing, address
    derivation, and null-address formatting.
    """

    def __init__(self, private_key: str) -> None:
        self._private_key = private_key.removeprefix("0x")

    # -- simulated crypto primitives ------------------------------------

    def _simulate_sign(self, message_hash: str, domain: str = "") -> str:
        """
        Produce a deterministic HMAC-SHA256 "signature" using the private key.

        The optional *domain* string is appended to the HMAC key material
        so that signatures are domain-separated (e.g. per VM type).

        Production replacement:
            Use chain-specific signing (``Account.signHash``, Ed25519, etc.).
        """
        key_material = self._private_key + (":" + domain if domain else "")
        return hmac.new(
            key=key_material.encode("utf-8"),
            msg=bytes.fromhex(message_hash),
            digestmod=hashlib.sha256,
        ).hexdigest()

    def _simulate_recover(
        self,
        message_hash: str,
        signature: str,
        domain: str = "",
        expected_address: str = "",
    ) -> str:
        """
        "Recover" the signer by recomputing the HMAC and comparing.

        Returns *expected_address* on match, or a null address on failure.

        Production replacement:
            Use chain-specific recovery (``Account.recoverHash``, Ed25519
            verify, etc.).
        """
        expected_sig = self._simulate_sign(message_hash, domain)
        if hmac.compare_digest(expected_sig, signature):
            return expected_address
        return self._null_address()

    # -- input validation -----------------------------------------------

    @staticmethod
    def _validate_proof_inputs(user: str, amount: int) -> None:
        """Raise ``BadRequestError`` if proof inputs are invalid."""
        if not user:
            raise BadRequestError("user address is required for proof generation")
        if amount <= 0:
            raise BadRequestError("amount must be positive")

    # -- nonce / expiry generation --------------------------------------

    @staticmethod
    def _generate_nonce_and_expiry(
        expiry_seconds: int = 3_600,
    ) -> tuple[str, int]:
        """
        Generate a cryptographically random 32-byte nonce and compute an
        expiry timestamp.

        Returns:
            A ``(nonce_hex, expiry_unix)`` tuple.
        """
        nonce = os.urandom(32).hex()
        expiry = int(time.time()) + expiry_seconds
        return nonce, expiry

    # -- hex formatting helpers -----------------------------------------

    @staticmethod
    def _format_hex_value(hex_str: str, prefix: str = "0x") -> str:
        """Apply a prefix to a raw hex string."""
        return f"{prefix}{hex_str}"

    @staticmethod
    def _strip_hex_prefix(formatted: str, prefix: str = "0x") -> str:
        """Remove a known prefix from a formatted hex string."""
        if formatted.startswith(prefix):
            return formatted[len(prefix):]
        return formatted

    # -- null address ---------------------------------------------------

    @staticmethod
    def _null_address() -> str:
        """Return a null/zero address (EVM default)."""
        return "0x" + "0" * 40
