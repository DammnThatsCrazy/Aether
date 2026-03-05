"""
Aether Backend — Multi-Chain Oracle Signer

Generates cryptographic proofs for reward eligibility across all supported
blockchain virtual machines: EVM, SVM (Solana), Bitcoin, MoveVM (SUI),
NEAR, TVM (TRON), and Cosmos.

Each VM family uses its own message format and signing scheme:
    - EVM:     keccak256 + secp256k1 ECDSA (EIP-191 / EIP-712)
    - SVM:     SHA-256 + Ed25519 (Solana native)
    - Bitcoin: SHA-256d (double-hash) + secp256k1 ECDSA
    - MoveVM:  SHA3-256 + Ed25519 (SUI native)
    - NEAR:    SHA-256 + Ed25519 (NEAR native)
    - TVM:     keccak256 + secp256k1 ECDSA (TRON, EVM-compatible)
    - Cosmos:  SHA-256 + secp256k1 ECDSA (Amino signing)

Demo implementation uses hashlib + HMAC to simulate signing.
Production: replace with chain-specific crypto libraries.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import struct
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from services.oracle.signer import RewardProof
from shared.common.common import BadRequestError
from shared.logger.logger import get_logger, metrics

logger = get_logger("aether.service.oracle.multichain_signer")


# ═══════════════════════════════════════════════════════════════════════════
# VM TYPE ENUM
# ═══════════════════════════════════════════════════════════════════════════

class VMType(str, Enum):
    """Supported blockchain virtual machine families."""

    EVM = "evm"
    SVM = "svm"
    BITCOIN = "bitcoin"
    MOVEVM = "movevm"
    NEAR = "near"
    TVM = "tvm"
    COSMOS = "cosmos"

    @classmethod
    def from_string(cls, value: str) -> VMType:
        """Parse a VM type from a case-insensitive string."""
        normalised = value.strip().lower()
        for member in cls:
            if member.value == normalised:
                return member
        raise BadRequestError(
            f"Unsupported VM type: '{value}'. "
            f"Supported: {', '.join(m.value for m in cls)}"
        )


# ═══════════════════════════════════════════════════════════════════════════
# CHAIN CONFIG
# ═══════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class ChainConfig:
    """
    Per-chain configuration for the multi-chain signer.

    Attributes:
        chain_id:              Numeric chain identifier (EVM chain ID, Cosmos
                               chain numeric, Solana cluster enum, etc.).
        contract_address:      Primary contract/program address on this chain.
        proof_expiry_seconds:  Seconds until a generated proof expires.
    """

    chain_id: int
    contract_address: str
    proof_expiry_seconds: int = 3_600  # 1 h


@dataclass(frozen=True)
class MultiChainProofConfig:
    """
    Global configuration for the multi-chain oracle signer.

    Attributes:
        signer_private_key:  Hex-encoded private key shared across all chains.
        chain_configs:       Per-VM chain configurations.
    """

    signer_private_key: str
    chain_configs: dict[VMType, ChainConfig] = field(default_factory=dict)

    def get_chain_config(self, vm_type: VMType) -> ChainConfig:
        """Return the config for a VM type, or raise if unconfigured."""
        config = self.chain_configs.get(vm_type)
        if config is None:
            raise BadRequestError(
                f"No chain configuration registered for VM type: {vm_type.value}"
            )
        return config


# ═══════════════════════════════════════════════════════════════════════════
# MULTI-CHAIN REWARD PROOF
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class MultiChainRewardProof:
    """
    A signed proof that a user is entitled to claim a specific reward
    on any supported chain.

    Extends the base ``RewardProof`` concept with VM-specific addressing
    fields so the consumer knows which on-chain entry-point to target.

    Attributes:
        user:              Address/account identifier of the claimant.
        action_type:       The qualifying event type (e.g. ``conversion``).
        amount_wei:        Reward amount (wei for EVM, lamports for SVM, etc.).
        nonce:             Random 32-byte hex nonce (replay protection).
        expiry:            Unix timestamp after which the proof is invalid.
        chain_id:          Target chain identifier.
        contract_address:  The reward contract/program this proof targets.
        signature:         Hex-encoded signature over the message hash.
        message_hash:      Hex-encoded hash of the canonical message.
        vm_type:           The VM family this proof was generated for.
        program_id:        Solana program ID (SVM only).
        module_address:    SUI Move module address (MoveVM only).
        account_id:        NEAR account ID (NEAR only).
        base_denom:        Cosmos base denomination (Cosmos only).
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
    vm_type: VMType
    program_id: Optional[str] = None
    module_address: Optional[str] = None
    account_id: Optional[str] = None
    base_denom: Optional[str] = None

    def to_dict(self) -> dict:
        result = {
            "user": self.user,
            "action_type": self.action_type,
            "amount_wei": self.amount_wei,
            "nonce": self.nonce,
            "expiry": self.expiry,
            "chain_id": self.chain_id,
            "contract_address": self.contract_address,
            "signature": self.signature,
            "message_hash": self.message_hash,
            "vm_type": self.vm_type.value,
        }
        if self.program_id is not None:
            result["program_id"] = self.program_id
        if self.module_address is not None:
            result["module_address"] = self.module_address
        if self.account_id is not None:
            result["account_id"] = self.account_id
        if self.base_denom is not None:
            result["base_denom"] = self.base_denom
        return result

    @classmethod
    def from_dict(cls, data: dict) -> MultiChainRewardProof:
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
            vm_type=VMType.from_string(data["vm_type"]),
            program_id=data.get("program_id"),
            module_address=data.get("module_address"),
            account_id=data.get("account_id"),
            base_denom=data.get("base_denom"),
        )

    def to_reward_proof(self) -> RewardProof:
        """Downcast to a base ``RewardProof`` for backward compatibility."""
        return RewardProof(
            user=self.user,
            action_type=self.action_type,
            amount_wei=self.amount_wei,
            nonce=self.nonce,
            expiry=self.expiry,
            chain_id=self.chain_id,
            contract_address=self.contract_address,
            signature=self.signature,
            message_hash=self.message_hash,
        )


# ═══════════════════════════════════════════════════════════════════════════
# BASE58 ENCODING UTILITY
# ═══════════════════════════════════════════════════════════════════════════

_BASE58_ALPHABET = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _base58_encode(data: bytes) -> str:
    """Encode raw bytes into a Base58 string (Bitcoin/Solana style)."""
    # Count leading zero bytes
    num_leading_zeros = 0
    for byte in data:
        if byte == 0:
            num_leading_zeros += 1
        else:
            break

    # Convert bytes to a big integer
    num = int.from_bytes(data, "big")

    # Encode the integer as base58
    result = bytearray()
    while num > 0:
        num, remainder = divmod(num, 58)
        result.append(_BASE58_ALPHABET[remainder])

    # Reverse to get most-significant digit first
    result.reverse()

    # Prepend '1' characters for each leading zero byte
    return ("1" * num_leading_zeros) + result.decode("ascii")


# ═══════════════════════════════════════════════════════════════════════════
# MULTI-CHAIN SIGNER
# ═══════════════════════════════════════════════════════════════════════════

class MultiChainSigner:
    """
    Generates and verifies reward proofs across all supported VM families.

    Extends the EVM-only ``OracleSigner`` pattern to handle chain-specific
    message formats and address derivation.

    Production notes:
        - EVM/TVM: replace hashing with ``Web3.keccak``, signing with
          ``Account.sign_message``.
        - SVM: replace with ``nacl.signing.SigningKey`` (Ed25519).
        - Bitcoin: replace with ``ecdsa`` or ``bitcoinlib`` for secp256k1.
        - MoveVM: replace with ``pynacl`` Ed25519 + SHA3-256.
        - NEAR: replace with ``pynacl`` Ed25519.
        - Cosmos: replace with ``ecdsa`` secp256k1 + Amino encoding.
    """

    def __init__(self, config: MultiChainProofConfig) -> None:
        self._config = config
        self._signer_addresses: dict[VMType, str] = {}

        # Derive a pseudo-address for every configured VM type
        for vm_type in VMType:
            self._signer_addresses[vm_type] = self._derive_address(
                config.signer_private_key, vm_type
            )

        # Log initialization summary
        configured_chains = [
            vm.value for vm in config.chain_configs.keys()
        ]
        logger.info(
            f"MultiChainSigner initialised: configured_chains={configured_chains} "
            f"total_vm_types={len(VMType)}"
        )
        for vm_type, address in self._signer_addresses.items():
            logger.debug(f"  {vm_type.value}: signer={address}")

    # -- public API --------------------------------------------------------

    def get_signer_address(self, vm_type: VMType) -> str:
        """Return the oracle signer address for a given VM type."""
        return self._signer_addresses[vm_type]

    def get_signer_info(self) -> dict[str, dict]:
        """
        Return all VM addresses and their chain configs.

        Example return value::

            {
                "evm": {
                    "signer_address": "0xabc...",
                    "chain_id": 1,
                    "contract_address": "0x..."
                },
                "svm": {
                    "signer_address": "7abc...",
                    "chain_id": 101,
                    "contract_address": "Prog..."
                },
                ...
            }
        """
        info: dict[str, dict] = {}
        for vm_type in VMType:
            entry: dict = {
                "signer_address": self._signer_addresses[vm_type],
            }
            chain_cfg = self._config.chain_configs.get(vm_type)
            if chain_cfg is not None:
                entry["chain_id"] = chain_cfg.chain_id
                entry["contract_address"] = chain_cfg.contract_address
                entry["proof_expiry_seconds"] = chain_cfg.proof_expiry_seconds
            info[vm_type.value] = entry
        return info

    async def generate_proof(
        self,
        user: str,
        action_type: str,
        amount: int,
        vm_type: VMType,
        chain_id: Optional[int] = None,
    ) -> MultiChainRewardProof:
        """
        Build a signed proof authorising ``user`` to claim ``amount`` on the
        specified VM chain.

        Steps:
            1. Resolve the chain configuration for the VM type.
            2. Generate a cryptographically random 32-byte nonce.
            3. Compute the expiry timestamp.
            4. Dispatch to the VM-specific message builder.
            5. Sign the resulting hash.
            6. Package into a ``MultiChainRewardProof``.

        Args:
            user:        Address/account of the reward recipient.
            action_type: The qualifying event type.
            amount:      Reward amount (wei, lamports, satoshis, etc.).
            vm_type:     Target VM family.
            chain_id:    Override the configured chain ID (optional).

        Returns:
            A fully signed ``MultiChainRewardProof``.
        """
        if not user:
            raise BadRequestError("user address is required for proof generation")
        if amount <= 0:
            raise BadRequestError("amount must be positive")

        chain_cfg = self._config.get_chain_config(vm_type)
        resolved_chain_id = chain_id if chain_id is not None else chain_cfg.chain_id

        nonce = os.urandom(32).hex()
        expiry = int(time.time()) + chain_cfg.proof_expiry_seconds

        # Dispatch to VM-specific message builder
        message_hash = self._build_message_hash(
            vm_type=vm_type,
            user=user,
            action_type=action_type,
            amount=amount,
            nonce=nonce,
            expiry=expiry,
            chain_id=resolved_chain_id,
            contract_address=chain_cfg.contract_address,
        )

        # Sign the hash
        signature = self._simulate_sign(message_hash, vm_type)

        # Determine VM-specific optional fields
        program_id: Optional[str] = None
        module_address: Optional[str] = None
        account_id: Optional[str] = None
        base_denom: Optional[str] = None

        if vm_type == VMType.SVM:
            program_id = chain_cfg.contract_address
        elif vm_type == VMType.MOVEVM:
            module_address = chain_cfg.contract_address
        elif vm_type == VMType.NEAR:
            account_id = chain_cfg.contract_address
        elif vm_type == VMType.COSMOS:
            base_denom = "uatom"

        # Format nonce/signature prefixes per VM convention
        nonce_formatted = self._format_nonce(nonce, vm_type)
        signature_formatted = self._format_signature(signature, vm_type)
        hash_formatted = self._format_hash(message_hash, vm_type)

        proof = MultiChainRewardProof(
            user=user,
            action_type=action_type,
            amount_wei=amount,
            nonce=nonce_formatted,
            expiry=expiry,
            chain_id=resolved_chain_id,
            contract_address=chain_cfg.contract_address,
            signature=signature_formatted,
            message_hash=hash_formatted,
            vm_type=vm_type,
            program_id=program_id,
            module_address=module_address,
            account_id=account_id,
            base_denom=base_denom,
        )

        logger.info(
            f"Multi-chain proof generated: vm={vm_type.value} user={user} "
            f"action={action_type} amount={amount} chain_id={resolved_chain_id} "
            f"expiry={expiry}"
        )
        metrics.increment(
            "oracle_multichain_proofs_generated",
            labels={"vm_type": vm_type.value, "chain_id": str(resolved_chain_id)},
        )
        return proof

    async def verify_proof(self, proof: MultiChainRewardProof) -> bool:
        """
        Verify a multi-chain proof by:
            1. Checking the expiry timestamp.
            2. Recomputing the message hash from proof fields.
            3. Recovering the signer and comparing to the expected address.

        Args:
            proof: The proof to verify.

        Returns:
            ``True`` when all checks pass.
        """
        # Check expiry
        if int(time.time()) > proof.expiry:
            logger.warning(
                f"Multi-chain proof expired: vm={proof.vm_type.value} "
                f"user={proof.user} expiry={proof.expiry}"
            )
            return False

        # Strip formatting prefixes for internal operations
        msg_hash = self._strip_hash_prefix(proof.message_hash, proof.vm_type)
        sig = self._strip_signature_prefix(proof.signature, proof.vm_type)

        # Verify via HMAC recovery
        recovered = self._simulate_recover(msg_hash, sig, proof.vm_type)
        expected = self._signer_addresses[proof.vm_type]
        valid = recovered.lower() == expected.lower()

        if not valid:
            logger.warning(
                f"Multi-chain proof verification failed: vm={proof.vm_type.value} "
                f"recovered={recovered} expected={expected}"
            )

        metrics.increment(
            "oracle_multichain_proofs_verified",
            labels={
                "valid": str(valid),
                "vm_type": proof.vm_type.value,
                "chain_id": str(proof.chain_id),
            },
        )
        return valid

    # -- message construction dispatching ----------------------------------

    def _build_message_hash(
        self,
        vm_type: VMType,
        user: str,
        action_type: str,
        amount: int,
        nonce: str,
        expiry: int,
        chain_id: int,
        contract_address: str,
    ) -> str:
        """Dispatch to the correct VM-specific message hash builder."""
        builders = {
            VMType.EVM: self._build_evm_message_hash,
            VMType.SVM: self._build_svm_message_hash,
            VMType.BITCOIN: self._build_bitcoin_message_hash,
            VMType.MOVEVM: self._build_movevm_message_hash,
            VMType.NEAR: self._build_near_message_hash,
            VMType.TVM: self._build_tvm_message_hash,
            VMType.COSMOS: self._build_cosmos_message_hash,
        }
        builder = builders[vm_type]
        return builder(
            user=user,
            action_type=action_type,
            amount=amount,
            nonce=nonce,
            expiry=expiry,
            chain_id=chain_id,
            contract_address=contract_address,
        )

    # -- EVM message hash --------------------------------------------------

    def _build_evm_message_hash(
        self,
        user: str,
        action_type: str,
        amount: int,
        nonce: str,
        expiry: int,
        chain_id: int,
        contract_address: str,
    ) -> str:
        """
        Simulate ``keccak256(abi.encodePacked(...))`` for EVM chains.

        Production: use ``Web3.keccak`` with ABI-encoded packed data.

        Packing:
            address(20B) | actionType(utf8) | uint256(amount,8B) |
            bytes32(nonce,32B) | uint256(expiry,8B) | uint256(chainId,8B) |
            address(contract,20B)
        """
        packed = b"".join([
            bytes.fromhex(user.removeprefix("0x").lower().zfill(40)),
            action_type.encode("utf-8"),
            struct.pack(">Q", amount),
            bytes.fromhex(nonce),
            struct.pack(">Q", expiry),
            struct.pack(">Q", chain_id),
            bytes.fromhex(contract_address.removeprefix("0x").lower().zfill(40)),
        ])
        # Production: return Web3.keccak(packed).hex()
        return hashlib.sha256(packed).hexdigest()

    # -- SVM (Solana) message hash -----------------------------------------

    def _build_svm_message_hash(
        self,
        user: str,
        action_type: str,
        amount: int,
        nonce: str,
        expiry: int,
        chain_id: int,
        contract_address: str,
    ) -> str:
        """
        Simulate Borsh-serialized message hashing for Solana (SHA-256).

        Borsh format (simplified):
            discriminator(8B, sha256("aether:claim_reward")[:8]) |
            pubkey(32B) | action_type_len(4B) | action_type(utf8) |
            amount(8B LE) | nonce(32B) | expiry(8B LE) |
            program_id(32B)

        Production: use ``borsh`` serialization library with proper schema.
        """
        # Compute an 8-byte instruction discriminator
        discriminator = hashlib.sha256(b"aether:claim_reward").digest()[:8]

        # Solana public keys are 32 bytes; pad/truncate the user identifier
        user_bytes = self._normalize_solana_pubkey(user)

        action_bytes = action_type.encode("utf-8")
        action_len = struct.pack("<I", len(action_bytes))  # Borsh uses LE u32 for string length

        program_bytes = self._normalize_solana_pubkey(contract_address)

        packed = b"".join([
            discriminator,
            user_bytes,
            action_len,
            action_bytes,
            struct.pack("<Q", amount),       # u64 LE (Borsh)
            bytes.fromhex(nonce),            # 32 bytes
            struct.pack("<Q", expiry),       # u64 LE (Borsh)
            program_bytes,
        ])
        return hashlib.sha256(packed).hexdigest()

    # -- Bitcoin message hash ----------------------------------------------

    def _build_bitcoin_message_hash(
        self,
        user: str,
        action_type: str,
        amount: int,
        nonce: str,
        expiry: int,
        chain_id: int,
        contract_address: str,
    ) -> str:
        """
        Simulate Bitcoin signed message format (SHA-256d = double SHA-256).

        Bitcoin message signing convention:
            SHA256(SHA256(
                "\\x18Bitcoin Signed Message:\\n" + varint(len(msg)) + msg
            ))

        The payload ``msg`` is a deterministic string encoding of the proof fields.

        Production: use ``bitcoinlib`` or ``python-bitcoinlib`` for proper
        message signing with secp256k1.
        """
        payload = (
            f"aether:claim|{user}|{action_type}|{amount}|{nonce}|"
            f"{expiry}|{chain_id}|{contract_address}"
        )
        payload_bytes = payload.encode("utf-8")

        # Bitcoin message prefix
        prefix = b"\x18Bitcoin Signed Message:\n"
        # Variable-length integer encoding of message length (simplified)
        msg_len = self._bitcoin_varint(len(payload_bytes))

        full_message = prefix + msg_len + payload_bytes

        # SHA-256d: double hash
        first_hash = hashlib.sha256(full_message).digest()
        return hashlib.sha256(first_hash).hexdigest()

    # -- MoveVM (SUI) message hash -----------------------------------------

    def _build_movevm_message_hash(
        self,
        user: str,
        action_type: str,
        amount: int,
        nonce: str,
        expiry: int,
        chain_id: int,
        contract_address: str,
    ) -> str:
        """
        Simulate BCS-serialized message hashing for SUI (SHA3-256).

        BCS (Binary Canonical Serialization) format:
            module_prefix(utf8,"aether::rewards::ClaimProof") |
            address(32B) | action_type_len(uleb128) | action_type(utf8) |
            amount(8B LE) | nonce(32B) | expiry(8B LE) |
            module_address(32B)

        Production: use ``pysui`` or custom BCS serializer with SHA3-256.
        """
        # BCS struct tag / type prefix
        type_tag = b"aether::rewards::ClaimProof"
        type_tag_len = self._uleb128_encode(len(type_tag))

        # SUI addresses are 32 bytes (64 hex chars)
        user_bytes = bytes.fromhex(user.removeprefix("0x").lower().zfill(64))

        action_bytes = action_type.encode("utf-8")
        action_len = self._uleb128_encode(len(action_bytes))

        module_bytes = bytes.fromhex(
            contract_address.removeprefix("0x").lower().zfill(64)
        )

        packed = b"".join([
            type_tag_len,
            type_tag,
            user_bytes,
            action_len,
            action_bytes,
            struct.pack("<Q", amount),       # u64 LE (BCS)
            bytes.fromhex(nonce),            # 32 bytes
            struct.pack("<Q", expiry),       # u64 LE (BCS)
            module_bytes,
        ])
        # SUI uses SHA3-256
        return hashlib.sha3_256(packed).hexdigest()

    # -- NEAR message hash -------------------------------------------------

    def _build_near_message_hash(
        self,
        user: str,
        action_type: str,
        amount: int,
        nonce: str,
        expiry: int,
        chain_id: int,
        contract_address: str,
    ) -> str:
        """
        Simulate Borsh-serialized message hashing for NEAR (SHA-256).

        NEAR uses Borsh serialization for all on-chain data:
            method_name_len(4B LE) | method_name(utf8) |
            account_id_len(4B LE) | account_id(utf8) |
            action_type_len(4B LE) | action_type(utf8) |
            amount(16B LE, u128) | nonce(32B) |
            expiry(8B LE) |
            contract_id_len(4B LE) | contract_id(utf8)

        Production: use ``borsh-python`` or ``near-api-py`` for proper
        serialization.
        """
        method_name = b"claim_reward"
        account_id = user.encode("utf-8")
        action_bytes = action_type.encode("utf-8")
        contract_id = contract_address.encode("utf-8")

        packed = b"".join([
            struct.pack("<I", len(method_name)),
            method_name,
            struct.pack("<I", len(account_id)),
            account_id,
            struct.pack("<I", len(action_bytes)),
            action_bytes,
            struct.pack("<QQ", amount, 0),    # u128 as two u64s (LE)
            bytes.fromhex(nonce),              # 32 bytes
            struct.pack("<Q", expiry),         # u64 LE
            struct.pack("<I", len(contract_id)),
            contract_id,
        ])
        return hashlib.sha256(packed).hexdigest()

    # -- TVM (TRON) message hash -------------------------------------------

    def _build_tvm_message_hash(
        self,
        user: str,
        action_type: str,
        amount: int,
        nonce: str,
        expiry: int,
        chain_id: int,
        contract_address: str,
    ) -> str:
        """
        TRON uses keccak256 + secp256k1 ECDSA, same as EVM.

        The message format is identical to EVM ``abi.encodePacked``, but
        TRON addresses use a Base58Check-encoded T-prefix format on the
        wire. Internally they are 20-byte hashes like EVM.

        Production: use ``tronpy`` for proper keccak256 hashing and signing.
        """
        # Normalize TRON address: strip 'T' prefix or '41' hex prefix if present
        user_hex = self._normalize_tron_address(user)
        contract_hex = self._normalize_tron_address(contract_address)

        packed = b"".join([
            bytes.fromhex(user_hex.zfill(40)),
            action_type.encode("utf-8"),
            struct.pack(">Q", amount),
            bytes.fromhex(nonce),
            struct.pack(">Q", expiry),
            struct.pack(">Q", chain_id),
            bytes.fromhex(contract_hex.zfill(40)),
        ])
        # Production: return keccak256(packed).hex()
        return hashlib.sha256(packed).hexdigest()

    # -- Cosmos message hash -----------------------------------------------

    def _build_cosmos_message_hash(
        self,
        user: str,
        action_type: str,
        amount: int,
        nonce: str,
        expiry: int,
        chain_id: int,
        contract_address: str,
    ) -> str:
        """
        Simulate Amino JSON canonical message hashing for Cosmos (SHA-256).

        Cosmos SDK uses a canonical JSON representation of the sign doc,
        sorted by key, then SHA-256 hashed. This mirrors the ``StdSignDoc``
        used in Amino signing.

        Production: use ``cosmpy`` or ``cosmos-sdk-python`` for proper
        Amino/Protobuf serialization.
        """
        # Amino-style canonical JSON (keys sorted, no whitespace)
        sign_doc = {
            "account_number": "0",
            "chain_id": str(chain_id),
            "fee": {
                "amount": [{"amount": "0", "denom": "uatom"}],
                "gas": "200000",
            },
            "memo": "",
            "msgs": [
                {
                    "type": "aether/ClaimReward",
                    "value": {
                        "action_type": action_type,
                        "amount": str(amount),
                        "claimant": user,
                        "contract": contract_address,
                        "expiry": str(expiry),
                        "nonce": nonce,
                    },
                }
            ],
            "sequence": "0",
        }
        # Canonical JSON: sorted keys, no whitespace, ensure_ascii
        canonical = json.dumps(sign_doc, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    # -- simulated crypto primitives ---------------------------------------

    def _simulate_sign(self, message_hash: str, vm_type: VMType) -> str:
        """
        Produce a deterministic HMAC-SHA256 "signature" using the private key.

        The VM type is mixed into the HMAC key to ensure signatures are
        domain-separated (a proof for EVM cannot be replayed on SVM).

        Production replacement per VM:
            - EVM/TVM:   ``Account.signHash(...)``
            - SVM:       ``nacl.signing.SigningKey.sign(...)``
            - Bitcoin:   ``ecdsa.sign(...)``
            - MoveVM:    ``nacl.signing.SigningKey.sign(...)``
            - NEAR:      ``nacl.signing.SigningKey.sign(...)``
            - Cosmos:    ``ecdsa.sign(...)``
        """
        key_material = (
            self._config.signer_private_key.removeprefix("0x") + ":" + vm_type.value
        )
        sig = hmac.new(
            key=key_material.encode("utf-8"),
            msg=bytes.fromhex(message_hash),
            digestmod=hashlib.sha256,
        ).hexdigest()
        return sig

    def _simulate_recover(
        self, message_hash: str, signature: str, vm_type: VMType
    ) -> str:
        """
        "Recover" the signer by recomputing the HMAC and comparing.

        Production replacement per VM:
            - EVM/TVM:   ``Account.recoverHash(...)``
            - SVM:       ``nacl.signing.VerifyKey.verify(...)``
            - Bitcoin:   ``ecdsa.recover(...)``
            - MoveVM:    ``nacl.signing.VerifyKey.verify(...)``
            - NEAR:      ``nacl.signing.VerifyKey.verify(...)``
            - Cosmos:    ``ecdsa.recover(...)``
        """
        expected_sig = self._simulate_sign(message_hash, vm_type)
        if hmac.compare_digest(expected_sig, signature):
            return self._signer_addresses[vm_type]
        # Return a null address in the format expected by the VM
        return self._null_address(vm_type)

    # -- address derivation ------------------------------------------------

    @staticmethod
    def _derive_address(private_key_hex: str, vm_type: VMType) -> str:
        """
        Derive a pseudo-address from the private key for each VM type.

        Each VM family has a distinct address format:
            - EVM:     0x + 40 hex chars (20 bytes)
            - TVM:     0x + 40 hex chars (TRON uses 20-byte addresses internally)
            - SVM:     Base58-encoded 32 bytes (Solana public key)
            - Bitcoin: 1 + 33 hex chars (P2PKH-style)
            - MoveVM:  0x + 64 hex chars (SUI uses 32-byte addresses)
            - NEAR:    20 hex chars + ".near"
            - Cosmos:  cosmos1 + 38 hex chars

        Production: derive the actual public key using the chain's curve
        (secp256k1 for EVM/BTC/TRON/Cosmos, Ed25519 for SVM/MoveVM/NEAR).
        """
        key_bytes = bytes.fromhex(private_key_hex.removeprefix("0x"))
        # Mix in the VM type for domain separation
        domain = f"{private_key_hex}:{vm_type.value}".encode("utf-8")
        addr_hash = hashlib.sha256(domain).hexdigest()

        if vm_type == VMType.EVM:
            return f"0x{addr_hash[:40]}"

        elif vm_type == VMType.TVM:
            return f"0x{addr_hash[:40]}"

        elif vm_type == VMType.SVM:
            # Solana: base58-encoded 32 bytes
            raw_bytes = bytes.fromhex(addr_hash[:64])  # 32 bytes
            return _base58_encode(raw_bytes)

        elif vm_type == VMType.BITCOIN:
            # P2PKH-like: 1 + 33 hex chars
            return f"1{addr_hash[:33]}"

        elif vm_type == VMType.MOVEVM:
            # SUI: 0x + 64 hex chars (32-byte address)
            return f"0x{addr_hash[:64]}"

        elif vm_type == VMType.NEAR:
            # NEAR: hex prefix + ".near" implicit account
            return f"{addr_hash[:20]}.near"

        elif vm_type == VMType.COSMOS:
            # Cosmos: cosmos1 + 38 hex chars (Bech32-like simulation)
            return f"cosmos1{addr_hash[:38]}"

        else:
            # Fallback — should never happen with exhaustive enum
            return f"0x{addr_hash[:40]}"

    @staticmethod
    def _null_address(vm_type: VMType) -> str:
        """Return a null/zero address in the format expected by the VM."""
        if vm_type == VMType.EVM:
            return "0x" + "0" * 40
        elif vm_type == VMType.TVM:
            return "0x" + "0" * 40
        elif vm_type == VMType.SVM:
            return "1" * 32  # base58 all-ones approximation of zero
        elif vm_type == VMType.BITCOIN:
            return "1" + "0" * 33
        elif vm_type == VMType.MOVEVM:
            return "0x" + "0" * 64
        elif vm_type == VMType.NEAR:
            return "0" * 20 + ".near"
        elif vm_type == VMType.COSMOS:
            return "cosmos1" + "0" * 38
        else:
            return "0x" + "0" * 40

    # -- formatting helpers ------------------------------------------------

    @staticmethod
    def _format_nonce(nonce_hex: str, vm_type: VMType) -> str:
        """Apply VM-specific nonce formatting."""
        if vm_type in (VMType.EVM, VMType.TVM, VMType.MOVEVM):
            return f"0x{nonce_hex}"
        elif vm_type == VMType.SVM:
            # Solana: base58-encoded nonce
            return _base58_encode(bytes.fromhex(nonce_hex))
        elif vm_type == VMType.BITCOIN:
            return nonce_hex  # raw hex for Bitcoin
        elif vm_type == VMType.NEAR:
            # NEAR: base64-encoded nonce
            return base64.b64encode(bytes.fromhex(nonce_hex)).decode("ascii")
        elif vm_type == VMType.COSMOS:
            return nonce_hex  # raw hex for Cosmos
        else:
            return f"0x{nonce_hex}"

    @staticmethod
    def _format_signature(sig_hex: str, vm_type: VMType) -> str:
        """Apply VM-specific signature formatting."""
        if vm_type in (VMType.EVM, VMType.TVM, VMType.MOVEVM):
            return f"0x{sig_hex}"
        elif vm_type == VMType.SVM:
            return _base58_encode(bytes.fromhex(sig_hex))
        elif vm_type == VMType.BITCOIN:
            return sig_hex
        elif vm_type == VMType.NEAR:
            return base64.b64encode(bytes.fromhex(sig_hex)).decode("ascii")
        elif vm_type == VMType.COSMOS:
            return base64.b64encode(bytes.fromhex(sig_hex)).decode("ascii")
        else:
            return f"0x{sig_hex}"

    @staticmethod
    def _format_hash(hash_hex: str, vm_type: VMType) -> str:
        """Apply VM-specific hash formatting."""
        if vm_type in (VMType.EVM, VMType.TVM, VMType.MOVEVM):
            return f"0x{hash_hex}"
        elif vm_type == VMType.SVM:
            return _base58_encode(bytes.fromhex(hash_hex))
        elif vm_type == VMType.BITCOIN:
            return hash_hex
        elif vm_type == VMType.NEAR:
            return base64.b64encode(bytes.fromhex(hash_hex)).decode("ascii")
        elif vm_type == VMType.COSMOS:
            return hash_hex
        else:
            return f"0x{hash_hex}"

    @staticmethod
    def _strip_hash_prefix(formatted_hash: str, vm_type: VMType) -> str:
        """Strip VM-specific formatting from a hash to get raw hex."""
        if vm_type in (VMType.EVM, VMType.TVM, VMType.MOVEVM):
            return formatted_hash.removeprefix("0x")
        elif vm_type == VMType.SVM:
            # Decode base58 back to hex
            return formatted_hash  # simplified; in production decode base58
        elif vm_type == VMType.BITCOIN:
            return formatted_hash
        elif vm_type == VMType.NEAR:
            return base64.b64decode(formatted_hash).hex()
        elif vm_type == VMType.COSMOS:
            return formatted_hash
        else:
            return formatted_hash.removeprefix("0x")

    @staticmethod
    def _strip_signature_prefix(formatted_sig: str, vm_type: VMType) -> str:
        """Strip VM-specific formatting from a signature to get raw hex."""
        if vm_type in (VMType.EVM, VMType.TVM, VMType.MOVEVM):
            return formatted_sig.removeprefix("0x")
        elif vm_type == VMType.SVM:
            return formatted_sig  # simplified; in production decode base58
        elif vm_type == VMType.BITCOIN:
            return formatted_sig
        elif vm_type == VMType.NEAR:
            return base64.b64decode(formatted_sig).hex()
        elif vm_type == VMType.COSMOS:
            return base64.b64decode(formatted_sig).hex()
        else:
            return formatted_sig.removeprefix("0x")

    # -- chain-specific normalization helpers -------------------------------

    @staticmethod
    def _normalize_solana_pubkey(address: str) -> bytes:
        """
        Normalize a Solana public key to 32 bytes.

        Accepts hex-encoded (with or without 0x prefix) or base58-encoded
        public keys. For the demo, we hash the input to get a deterministic
        32-byte value.
        """
        # If it looks like hex, decode directly
        clean = address.removeprefix("0x")
        try:
            raw = bytes.fromhex(clean)
            if len(raw) == 32:
                return raw
            # Pad or truncate to 32 bytes
            return hashlib.sha256(raw).digest()
        except ValueError:
            # Assume base58 or other format; hash it for deterministic 32 bytes
            return hashlib.sha256(address.encode("utf-8")).digest()

    @staticmethod
    def _normalize_tron_address(address: str) -> str:
        """
        Normalize a TRON address to a 40-char hex string.

        TRON addresses can be:
            - 0x-prefixed hex (internal)
            - 41-prefixed hex (TRON convention: 41 + 20-byte address)
            - T-prefixed Base58Check (wire format)

        For the demo, we strip known prefixes and ensure 40 hex chars.
        """
        clean = address.strip()

        # Handle 0x prefix
        if clean.startswith("0x") or clean.startswith("0X"):
            return clean[2:].lower()

        # Handle 41-prefix (TRON hex format)
        if clean.startswith("41") and len(clean) == 42:
            return clean[2:].lower()

        # Handle T-prefix (Base58Check); hash for demo
        if clean.startswith("T"):
            return hashlib.sha256(clean.encode("utf-8")).hexdigest()[:40]

        # Fallback: treat as raw hex
        return clean.lower()

    @staticmethod
    def _bitcoin_varint(n: int) -> bytes:
        """Encode an integer as a Bitcoin variable-length integer."""
        if n < 0xFD:
            return struct.pack("<B", n)
        elif n <= 0xFFFF:
            return b"\xfd" + struct.pack("<H", n)
        elif n <= 0xFFFFFFFF:
            return b"\xfe" + struct.pack("<I", n)
        else:
            return b"\xff" + struct.pack("<Q", n)

    @staticmethod
    def _uleb128_encode(value: int) -> bytes:
        """Encode an unsigned integer as ULEB128 (used in BCS serialization)."""
        result = bytearray()
        while value >= 0x80:
            result.append((value & 0x7F) | 0x80)
            value >>= 7
        result.append(value & 0x7F)
        return bytes(result)
