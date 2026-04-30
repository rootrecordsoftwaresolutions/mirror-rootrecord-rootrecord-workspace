"""
Heuristic sizing for pool-mirror bot (not a profit model).

- When you hold most of supply, mirror *buys* are scaled down (little need to re-accumulate).
- Mirror *sells* are capped vs pool-side liquidity so one match does not strip the CPMM vault.
"""

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
    """
    held = wallet_token / mint_supply.

    High held -> small buy_bps (light buybacks when you already own the float).
    Low held -> up to bps_max (more willing to buy the pool leg back).
    """
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
    """Cap mirror sell so it does not exceed max_pool_bps of pool's TARGET-side reserve."""
    if pool_token_reserve_raw <= 0:
        return min(leg_sell_raw, wallet_raw)
    cap = max(1, pool_token_reserve_raw * max(0, max_pool_bps) // 10_000)
    return min(leg_sell_raw, wallet_raw, cap)
