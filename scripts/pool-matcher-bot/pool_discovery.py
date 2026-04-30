"""
Discover and cache the Raydium CPMM pool id for TARGET_MINT <-> USDC.

Raydium CPMM pool layout offsets (see cpmm_layout.py):
  vault_a [72:104]
  vault_b [104:136]
  mint_a  [168:200]
  mint_b  [200:232]
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from solders.pubkey import Pubkey

from cpmm_layout import CPMM_PROGRAM_MAINNET, parse_cpmm_pool_account
from rpc import SolanaRpc


USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
WSOL_MINT_MAINNET = "So11111111111111111111111111111111111111112"


@dataclass(frozen=True)
class DiscoveredPool:
    pool_id: str
    mint_a: str
    mint_b: str
    vault_a: str
    vault_b: str


def _mint_bytes_b58(mint: str) -> str:
    # RPC "memcmp" filter expects base58-encoded bytes.
    # Pubkey.from_string validates base58 and length.
    return str(Pubkey.from_string(mint))


def _program_accounts_for_mints(
    rpc: SolanaRpc,
    *,
    mint_a: str | None,
    mint_b: str | None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    # Important: do NOT use a dataSize filter here.
    # Many Raydium CPMM accounts are larger than 232 bytes; `dataSize` is an exact match filter.
    filters: list[dict[str, Any]] = []
    if mint_a:
        filters.append({"memcmp": {"offset": 168, "bytes": _mint_bytes_b58(mint_a)}})
    if mint_b:
        filters.append({"memcmp": {"offset": 200, "bytes": _mint_bytes_b58(mint_b)}})

    cfg: dict[str, Any] = {"encoding": "base64", "commitment": "confirmed", "filters": filters}
    # Some RPCs support "withContext" config, but standard getProgramAccounts takes (programId, config)
    res = rpc.request("getProgramAccounts", [str(CPMM_PROGRAM_MAINNET), cfg])
    rows = res if isinstance(res, list) else []
    return rows[: max(1, int(limit))]


def _decode_row(row: dict[str, Any]) -> tuple[str, bytes] | None:
    try:
        pubkey = str(row["pubkey"])
        v = row["account"]
        data = v["data"]
        b64 = data[0]
    except (KeyError, TypeError, IndexError):
        return None
    try:
        import base64

        return pubkey, base64.b64decode(b64)
    except Exception:
        return None


def _candidate_pools(
    rpc: SolanaRpc,
    *,
    target_mint: str,
    quote_mint: str,
) -> list[DiscoveredPool]:
    # Raydium stores mints in fixed fields mintA/mintB. Query both orientations.
    rows = []
    rows.extend(_program_accounts_for_mints(rpc, mint_a=target_mint, mint_b=quote_mint))
    rows.extend(_program_accounts_for_mints(rpc, mint_a=quote_mint, mint_b=target_mint))

    out: list[DiscoveredPool] = []
    seen = set()
    for r in rows:
        dec = _decode_row(r)
        if not dec:
            continue
        pid, raw = dec
        if pid in seen:
            continue
        seen.add(pid)
        try:
            pool = parse_cpmm_pool_account(raw)
        except Exception:
            continue
        ma = str(pool.mint_a)
        mb = str(pool.mint_b)
        if {ma, mb} != {str(Pubkey.from_string(target_mint)), str(Pubkey.from_string(quote_mint))}:
            continue
        out.append(
            DiscoveredPool(
                pool_id=pid,
                mint_a=ma,
                mint_b=mb,
                vault_a=str(pool.vault_a),
                vault_b=str(pool.vault_b),
            )
        )
    return out


def _pool_usdc_reserve_raw(rpc: SolanaRpc, pool: DiscoveredPool, *, quote_mint: str) -> int:
    # If USDC is mint_a, reserve is vault_a, else vault_b.
    if pool.mint_a == str(Pubkey.from_string(quote_mint)):
        vault = pool.vault_a
    else:
        vault = pool.vault_b
    try:
        return rpc.get_token_account_balance_raw(vault)
    except Exception:
        return 0


def discover_cpmm_pool_id(
    rpc: SolanaRpc,
    *,
    target_mint: str,
    quote_mint: str = USDC_MINT_MAINNET,
) -> DiscoveredPool:
    cands = _candidate_pools(rpc, target_mint=target_mint, quote_mint=quote_mint)
    if not cands:
        raise RuntimeError(f"No Raydium CPMM pool found for {target_mint} <-> {quote_mint}")

    # Choose the candidate with the largest quote-side reserve (most likely the real USDC market).
    best = max(cands, key=lambda p: _pool_usdc_reserve_raw(rpc, p, quote_mint=quote_mint))
    return best


def load_cached_pool_id(cache_path: Path, *, target_mint: str, quote_mint: str) -> str | None:
    try:
        data = json.loads(cache_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    key = f"{target_mint}:{quote_mint}"
    v = data.get(key)
    if isinstance(v, str) and v.strip():
        return v.strip()
    return None


def write_cached_pool_id(cache_path: Path, *, target_mint: str, quote_mint: str, pool_id: str) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    data: dict[str, Any] = {}
    try:
        if cache_path.exists():
            data = json.loads(cache_path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                data = {}
    except Exception:
        data = {}
    key = f"{target_mint}:{quote_mint}"
    data[key] = pool_id
    cache_path.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def get_or_discover_pool_id(
    rpc: SolanaRpc,
    *,
    target_mint: str,
    quote_mint: str = USDC_MINT_MAINNET,
    cache_path: Path,
) -> tuple[str, bool]:
    cached = load_cached_pool_id(cache_path, target_mint=target_mint, quote_mint=quote_mint)
    if cached:
        return cached, True
    found = discover_cpmm_pool_id(rpc, target_mint=target_mint, quote_mint=quote_mint)
    write_cached_pool_id(cache_path, target_mint=target_mint, quote_mint=quote_mint, pool_id=found.pool_id)
    return found.pool_id, False


def parse_quote_mints(raw: str | None) -> list[str]:
    """
    Comma-separated list of quote mints to watch/discover.
    Example: "USDC,WSOL" or "<usdc_mint>,<wsol_mint>".
    """
    if not raw:
        return []
    out: list[str] = []
    for part in raw.split(","):
        p = part.strip()
        if not p:
            continue
        up = p.upper()
        if up in ("USDC",):
            out.append(USDC_MINT_MAINNET)
        elif up in ("SOL", "WSOL", "W_SOL", "WRAPPED_SOL"):
            out.append(WSOL_MINT_MAINNET)
        else:
            # Validate it at least parses as a pubkey
            out.append(str(Pubkey.from_string(p)))
    # preserve order, unique
    seen: set[str] = set()
    uniq: list[str] = []
    for m in out:
        if m in seen:
            continue
        seen.add(m)
        uniq.append(m)
    return uniq

