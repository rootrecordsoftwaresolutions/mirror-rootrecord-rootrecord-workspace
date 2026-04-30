"""
Pool mirror bot with time buckets: accumulates mirror SELL / BUY raw amounts from
each observed CPMM swap during a wall-clock bucket (default 60s), then executes
at most one Jupiter sell and one Jupiter buy per bucket with the same caps as
pool-matcher-bot.

Env matches pool-matcher-bot plus BUCKET_SEC (default 60).

Run: python main.py
"""

from __future__ import annotations

import base64
import os
import sys
import time
from pathlib import Path
from typing import Any

import base58
from dotenv import load_dotenv
from solders.keypair import Keypair
from solders.pubkey import Pubkey

_SCRIPTS_ROOT = Path(__file__).resolve().parent.parent
if str(_SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_ROOT))

from ecosystem_worker import (
    UsdcMirrorReinvestAccumulator,
    post_ecosystem_bot_event,
    usdc_from_quote_out,
)

from cpmm_layout import CPMM_PROGRAM_MAINNET, parse_cpmm_pool_account
from jupiter_client import JupiterClient, sign_and_send_jupiter_swap
from rpc import SolanaRpc
from sizing import auto_buy_bps, cap_sell_vs_pool, held_fraction
from tx_parse import detect_target_swap


def _load_keypair() -> Keypair:
    raw = os.environ.get("WALLET_PRIVATE_KEY", "").strip()
    if not raw:
        raise SystemExit("Set WALLET_PRIVATE_KEY (base58 secret key)")
    data = base58.b58decode(raw)
    if len(data) == 64:
        return Keypair.from_bytes(data)
    if len(data) == 32:
        return Keypair.from_seed(data)
    raise SystemExit("WALLET_PRIVATE_KEY must decode to 32 or 64 bytes")


def _env_int(name: str, default: int) -> int:
    v = os.environ.get(name, "").strip()
    if not v:
        return default
    try:
        return int(v)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    v = os.environ.get(name, "").strip()
    if not v:
        return default
    try:
        return float(v)
    except ValueError:
        return default


def _tx_signers_include_wallet(tx: dict[str, Any], wallet: str) -> bool:
    msg = tx.get("transaction", {}).get("message", {})
    keys = msg.get("accountKeys", [])
    pubkeys: list[str] = []
    for k in keys:
        if isinstance(k, str):
            pubkeys.append(k)
        elif isinstance(k, dict) and "pubkey" in k:
            pubkeys.append(k["pubkey"])
    try:
        n = int(msg["header"]["numRequiredSignatures"])
    except (KeyError, TypeError, ValueError):
        n = 0
    return wallet in pubkeys[:n]


def _bucket_id(now: float, bucket_sec: int) -> int:
    return int(now) // max(1, bucket_sec)


def main() -> None:
    load_dotenv()
    rpc_url = os.environ.get("RPC_URL", "").strip()
    pool_id = os.environ.get("POOL_ID", "").strip()
    target_mint = os.environ.get("TARGET_MINT", "").strip()
    if not rpc_url or not pool_id or not target_mint:
        raise SystemExit("Set RPC_URL, POOL_ID, and TARGET_MINT (see .env.example)")

    bucket_sec = max(10, _env_int("BUCKET_SEC", 60))
    poll_sec = max(1, _env_int("POLL_INTERVAL_SEC", 5))
    slippage_bps = max(1, min(5000, _env_int("SLIPPAGE_BPS", 120)))
    min_raw = max(0, _env_int("MIN_MATCH_RAW", 1))

    _mode = os.environ.get("SIZING_MODE", "auto").strip().lower()
    sizing_auto = _mode not in ("manual", "off", "false", "no", "0")
    buy_match_bps = max(1, min(10_000, _env_int("MIRROR_BUY_BPS", 8500)))
    auto_buy_bps_min = max(100, min(10_000, _env_int("AUTO_BUY_BPS_MIN", 1200)))
    auto_buy_bps_max = max(auto_buy_bps_min, min(10_000, _env_int("AUTO_BUY_BPS_MAX", 10_000)))
    auto_buy_curve = max(0.05, _env_float("AUTO_BUY_CURVE", 1.25))
    auto_sell_max_pool_bps = max(1, min(10_000, _env_int("AUTO_SELL_MAX_POOL_BPS", 50)))

    invert_match = os.environ.get("POOL_MATCH_INVERT", "0").strip().lower() in (
        "1",
        "true",
        "yes",
    )

    bucket_max_sell = _env_int("BUCKET_MAX_SELL_RAW", 0)
    bucket_max_buy = _env_int("BUCKET_MAX_BUY_RAW", 0)

    kp = _load_keypair()
    me = str(kp.pubkey())
    bot_id = os.environ.get("ECOSYSTEM_BOT_ID", "pool_bucket").strip() or "pool_bucket"
    reinvest_track = UsdcMirrorReinvestAccumulator()
    target_pk = Pubkey.from_string(target_mint)

    rpc = SolanaRpc(rpc_url)
    jupiter = JupiterClient(os.environ.get("JUPITER_API_KEY"))

    try:
        info = rpc.request(
            "getAccountInfo",
            [pool_id, {"encoding": "base64", "commitment": "confirmed"}],
        )
        val = info and info.get("value")
        if not val:
            raise SystemExit(f"No account at POOL_ID {pool_id}")
        owner = val.get("owner")
        if owner != str(CPMM_PROGRAM_MAINNET):
            raise SystemExit(
                f"Pool owner is {owner}, expected Raydium CPMM {CPMM_PROGRAM_MAINNET}.",
            )
        raw = val["data"][0]
        pool = parse_cpmm_pool_account(base64.b64decode(raw))
        if target_pk not in (pool.mint_a, pool.mint_b):
            raise SystemExit("TARGET_MINT is not mintA or mintB of this pool.")
        other_mint = (
            str(pool.mint_b) if pool.mint_a == target_pk else str(pool.mint_a)
        )
        target_vault = (
            str(pool.vault_a)
            if str(pool.mint_a) == target_mint
            else str(pool.vault_b)
        )

        supply_raw = 0
        if sizing_auto:
            try:
                supply_raw = rpc.get_mint_supply_raw(target_mint)
            except Exception as e:
                print(
                    f"WARN: could not read mint supply ({e!r}); SIZING_MODE=manual.",
                    file=sys.stderr,
                )
                sizing_auto = False

        token_dec = rpc.get_mint_decimals(target_mint)
        _mx_raw = os.environ.get("MAX_MIRROR_SELL_RAW", "").strip()
        _default_micro = 10 ** max(0, token_dec - 1)
        if _mx_raw == "":
            max_mirror_sell_raw = _default_micro
        else:
            try:
                max_mirror_sell_raw = max(0, int(_mx_raw))
            except ValueError:
                max_mirror_sell_raw = _default_micro

        print(f"Pool-bucket bot  bucket_sec={bucket_sec}s  poll={poll_sec}s")
        print(f"Pool {pool_id}  target {target_mint}  wallet {me}")
        print(
            f"SIZING_MODE={'auto' if sizing_auto else 'manual'}  "
            f"max_mirror_sell_raw={max_mirror_sell_raw or 'off'}  "
            f"BUCKET_MAX_SELL_RAW={bucket_max_sell or 'off'}  "
            f"BUCKET_MAX_BUY_RAW={bucket_max_buy or 'off'}",
        )

        seen: set[str] = set()
        for row in rpc.get_signatures_for_address(pool_id, limit=100):
            s = row.get("signature")
            if isinstance(s, str):
                seen.add(s)
        print(f"Primed {len(seen)} signatures.")

        acc_sell = 0
        acc_buy = 0
        current_bucket = _bucket_id(time.time(), bucket_sec)

        def flush_bucket(bid: int, sell_acc: int, buy_acc: int) -> bool:
            """Returns False if wallet empty and cannot continue sells."""
            nonlocal supply_raw, sizing_auto
            if sell_acc <= 0 and buy_acc <= 0:
                return True
            print(
                f"--- flush bucket_id={bid}  agg_sell_raw={sell_acc}  agg_buy_raw={buy_acc} ---",
            )

            if sell_acc > 0:
                bal = rpc.get_token_balance_raw(me, target_mint)
                if bal <= 0:
                    print("Wallet TOKEN balance is 0 — stopping.")
                    return False
                sell_acc_capped = sell_acc
                if bucket_max_sell > 0:
                    sell_acc_capped = min(sell_acc_capped, bucket_max_sell)
                elif max_mirror_sell_raw > 0:
                    sell_acc_capped = min(sell_acc_capped, 10 * max_mirror_sell_raw)

                if sizing_auto and supply_raw > 0:
                    try:
                        pool_r = rpc.get_token_account_balance_raw(target_vault)
                    except Exception:
                        pool_r = 0
                    amt = cap_sell_vs_pool(
                        sell_acc_capped,
                        bal,
                        pool_r,
                        auto_sell_max_pool_bps,
                    )
                else:
                    amt = min(sell_acc_capped, bal)
                if max_mirror_sell_raw > 0:
                    amt = min(amt, max_mirror_sell_raw)
                if amt >= min_raw:
                    print(f"  bucket SELL {amt} raw")
                    try:
                        q = jupiter.quote_exact_in(
                            input_mint=target_mint,
                            output_mint=other_mint,
                            amount_raw=amt,
                            slippage_bps=slippage_bps,
                        )
                        sig = sign_and_send_jupiter_swap(rpc, jupiter, kp, q)
                        print(f"  https://solscan.io/tx/{sig}")
                        usd_est = usdc_from_quote_out(other_mint, q)
                        meta: dict[str, Any] = {
                            "bucket_id": bid,
                            "other_mint": other_mint,
                        }
                        if usd_est is not None:
                            meta["usd_from_quote"] = round(usd_est, 8)
                        post_ecosystem_bot_event(
                            bot_id=bot_id,
                            event_type="bucket_sell",
                            pool_id=pool_id,
                            mint=target_mint,
                            tx_signature=sig,
                            amount_token_raw=amt,
                            metadata=meta,
                        )
                        if usd_est is not None:
                            reinvest_track.on_usdc_sell(
                                usd=usd_est,
                                bot_id=bot_id,
                                pool_id=pool_id,
                                tx_signature=sig,
                            )
                    except Exception as e:
                        print(f"  SELL ERROR {e!r}", file=sys.stderr)

            if buy_acc > 0:
                if sizing_auto and supply_raw > 0:
                    bal_t = rpc.get_token_balance_raw(me, target_mint)
                    held = held_fraction(bal_t, supply_raw)
                    bps = auto_buy_bps(
                        held,
                        bps_min=auto_buy_bps_min,
                        bps_max=auto_buy_bps_max,
                        curve=auto_buy_curve,
                    )
                else:
                    bps = buy_match_bps
                buy_scaled = buy_acc * bps // 10_000
                if bucket_max_buy > 0:
                    buy_scaled = min(buy_scaled, bucket_max_buy)
                elif max_mirror_sell_raw > 0:
                    buy_scaled = min(buy_scaled, 10 * max_mirror_sell_raw)
                if buy_scaled >= min_raw:
                    print(f"  bucket BUY {buy_scaled} raw (buy_bps={bps} on agg {buy_acc})")
                    try:
                        q = jupiter.quote_exact_out(
                            input_mint=other_mint,
                            output_mint=target_mint,
                            amount_out_raw=buy_scaled,
                            slippage_bps=slippage_bps,
                        )
                        sig = sign_and_send_jupiter_swap(rpc, jupiter, kp, q)
                        print(f"  https://solscan.io/tx/{sig}")
                        post_ecosystem_bot_event(
                            bot_id=bot_id,
                            event_type="bucket_buy",
                            pool_id=pool_id,
                            mint=target_mint,
                            tx_signature=sig,
                            amount_token_raw=buy_scaled,
                            metadata={"bucket_id": bid, "other_mint": other_mint},
                        )
                    except Exception as e:
                        print(f"  BUY ERROR {e!r}", file=sys.stderr)
            return True

        while True:
            now = time.time()
            b = _bucket_id(now, bucket_sec)
            if b != current_bucket:
                if not flush_bucket(current_bucket, acc_sell, acc_buy):
                    return
                acc_sell = 0
                acc_buy = 0
                current_bucket = b

            rows = rpc.get_signatures_for_address(pool_id, limit=25)
            new_sigs = [r["signature"] for r in reversed(rows) if r.get("signature") not in seen]
            for sig in new_sigs:
                seen.add(sig)
                tx = rpc.get_transaction(sig)
                if not tx or not tx.get("transaction"):
                    continue
                if _tx_signers_include_wallet(tx, me):
                    continue
                leg = detect_target_swap(
                    tx, pool, target_pk, invert_mapping=invert_match
                )
                if not leg:
                    continue
                if leg.sell_target_raw >= min_raw:
                    acc_sell += leg.sell_target_raw
                if leg.buy_target_raw >= min_raw:
                    acc_buy += leg.buy_target_raw

            time.sleep(poll_sec)
    finally:
        jupiter.close()
        rpc.close()


if __name__ == "__main__":
    main()
