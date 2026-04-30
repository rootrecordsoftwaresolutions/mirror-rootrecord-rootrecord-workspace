"""Infer CPMM swap size on TARGET mint from vault token balance deltas."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from solders.pubkey import Pubkey

from cpmm_layout import CpmmPoolOnChain


def _account_keys(tx: dict[str, Any]) -> list[str]:
    msg = tx.get("transaction", {}).get("message", {})
    keys: list[str] = []
    for k in msg.get("accountKeys", []):
        if isinstance(k, str):
            keys.append(k)
        elif isinstance(k, dict) and "pubkey" in k:
            keys.append(k["pubkey"])
    meta = tx.get("meta") or {}
    loaded = meta.get("loadedAddresses") or {}
    seen = set(keys)
    for x in loaded.get("writable", []) or []:
        s = str(x)
        if s not in seen:
            keys.append(s)
            seen.add(s)
    for x in loaded.get("readonly", []) or []:
        s = str(x)
        if s not in seen:
            keys.append(s)
            seen.add(s)
    return keys


def _balance_map(
    balances: list[dict[str, Any]] | None,
    account_keys: list[str],
) -> dict[tuple[int, str], int]:
    out: dict[tuple[int, str], int] = {}
    if not balances:
        return out
    for b in balances:
        try:
            idx = int(b["accountIndex"])
            mint = str(b["mint"])
            amt = int(b["uiTokenAmount"]["amount"])
            out[(idx, mint)] = amt
        except (KeyError, TypeError, ValueError):
            continue
    return out


@dataclass(frozen=True)
class SwapLeg:
    sell_target_raw: int
    buy_target_raw: int


def detect_target_swap(
    tx: dict[str, Any],
    pool: CpmmPoolOnChain,
    target_mint: Pubkey,
    *,
    invert_mapping: bool = False,
) -> SwapLeg | None:
    meta = tx.get("meta")
    if not meta or meta.get("err"):
        return None

    keys = _account_keys(tx)
    if not keys:
        return None

    def idx(pk: Pubkey) -> int | None:
        s = str(pk)
        try:
            return keys.index(s)
        except ValueError:
            return None

    ia = idx(pool.vault_a)
    ib = idx(pool.vault_b)
    if ia is None or ib is None:
        return None

    ma = str(pool.mint_a)
    mb = str(pool.mint_b)

    pre = _balance_map(meta.get("preTokenBalances"), keys)
    post = _balance_map(meta.get("postTokenBalances"), keys)

    def vault_delta(account_index: int, mint: str) -> int:
        pre_amt = pre.get((account_index, mint), 0)
        post_amt = post.get((account_index, mint), 0)
        return post_amt - pre_amt

    d_a = vault_delta(ia, ma)
    d_b = vault_delta(ib, mb)

    if d_a == 0 and d_b == 0:
        return None
    if d_a * d_b >= 0:
        return None

    tm = str(target_mint)
    if tm == ma:
        d_t = d_a
    elif tm == mb:
        d_t = d_b
    else:
        return None

    sell_on_negative = not invert_mapping
    if d_t < 0:
        if sell_on_negative:
            return SwapLeg(sell_target_raw=abs(d_t), buy_target_raw=0)
        return SwapLeg(sell_target_raw=0, buy_target_raw=abs(d_t))
    if d_t > 0:
        if sell_on_negative:
            return SwapLeg(sell_target_raw=0, buy_target_raw=d_t)
        return SwapLeg(sell_target_raw=d_t, buy_target_raw=0)
    return None
