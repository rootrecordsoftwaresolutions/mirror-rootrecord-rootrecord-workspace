"""Decode Raydium CPMM pool on-chain account (layout matches @raydium-io/raydium-sdk-v2 CpmmPoolInfoLayout)."""

from __future__ import annotations

from dataclasses import dataclass

from solders.pubkey import Pubkey

# Mainnet Raydium CPMM create program
CPMM_PROGRAM_MAINNET = Pubkey.from_string("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C")


@dataclass(frozen=True)
class CpmmPoolOnChain:
    vault_a: Pubkey
    vault_b: Pubkey
    mint_a: Pubkey
    mint_b: Pubkey


def parse_cpmm_pool_account(data: bytes) -> CpmmPoolOnChain:
    if len(data) < 232:
        raise ValueError(f"pool account data too short: {len(data)} bytes")
    vault_a = Pubkey.from_bytes(data[72:104])
    vault_b = Pubkey.from_bytes(data[104:136])
    mint_a = Pubkey.from_bytes(data[168:200])
    mint_b = Pubkey.from_bytes(data[200:232])
    return CpmmPoolOnChain(
        vault_a=vault_a,
        vault_b=vault_b,
        mint_a=mint_a,
        mint_b=mint_b,
    )
