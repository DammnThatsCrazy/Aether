"""
Aether Service — Oracle Bridge
Cryptographic proof generation and verification for on-chain reward claims.
"""

from services.oracle.signer import OracleSigner, ProofConfig, RewardProof
from services.oracle.verifier import (
    compute_message_hash,
    is_proof_expired,
    verify_reward_proof,
)

__all__ = [
    "OracleSigner",
    "ProofConfig",
    "RewardProof",
    "compute_message_hash",
    "is_proof_expired",
    "verify_reward_proof",
]
