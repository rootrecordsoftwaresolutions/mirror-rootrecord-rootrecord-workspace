"""Heuristic sizing for pool mirror (same as pool-matcher-bot)."""

from __future__ import annotations

import math


def held_fraction(wallet_raw: int, supply_raw: int) -> float:
    if supply_raw <= 0:
        return 0.0
    return min(1.0, max(0.0, wallet_raw / float(supply_raw)))


def auto_buy_bps(
    held: float,
    *,
    bps_min: int,
    bps_max: int,
    curve: float,
) -> int:
    free = max(0.0, 1.0 - held)
    w = math.pow(free, max(0.05, float(curve)))
    span = max(0, bps_max - bps_min)
    return max(bps_min, min(bps_max, bps_min + int(span * w)))


def cap_sell_vs_pool(
    leg_sell_raw: int,
    wallet_raw: int,
    pool_token_reserve_raw: int,
    max_pool_bps: int,
) -> int:
    if pool_token_reserve_raw <= 0:
        return min(leg_sell_raw, wallet_raw)
    cap = max(1, pool_token_reserve_raw * max(0, max_pool_bps) // 10_000)
    return min(leg_sell_raw, wallet_raw, cap)
