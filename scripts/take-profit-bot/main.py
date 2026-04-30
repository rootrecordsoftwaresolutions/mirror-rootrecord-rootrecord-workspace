"""
Jupiter-based TP / SL watcher: arms an "entry" quote-out for a fixed probe size of TOKEN→QUOTE,
then sells a configurable fraction when implied output rises (TP) or falls (SL).

Run from this directory:  python main.py
"""

from __future__ import annotations

import json
import os
import sys
import time
from decimal import Decimal
from pathlib import Path
from typing import Any

import base58
from dotenv import load_dotenv
from solders.keypair import Keypair

from jupiter_client import JupiterClient, sign_and_send_jupiter_swap
from rpc import SolanaRpc

STATE_PATH = Path(__file__).resolve().parent / "tp_state.json"
# Tight slippage for probe quotes only (wide slippage still used for real sells).
PROBE_SLIPPAGE_BPS = 50


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


def _env_decimal(name: str, default: str) -> Decimal:
    v = os.environ.get(name, "").strip()
    if not v:
        return Decimal(default)
    return Decimal(v)


def _quote_out_amount(quote: dict[str, Any]) -> int:
    for key in ("outAmount", "otherAmountThreshold"):
        if key in quote and quote[key] is not None:
            return int(quote[key])
    raise KeyError(f"No out amount in quote keys: {list(quote.keys())[:20]}")


def _load_state() -> dict[str, Any] | None:
    if not STATE_PATH.is_file():
        return None
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _save_state(data: dict[str, Any]) -> None:
    STATE_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _clear_state() -> None:
    try:
        STATE_PATH.unlink()
    except OSError:
        pass


def _probe_cap_raw(token_decimals: int) -> int:
    """~0.01 whole tokens in raw units (floor at 1)."""
    exp = max(0, token_decimals - 2)
    return max(1, 10**exp)


def main() -> None:
    load_dotenv()
    rpc_url = os.environ.get("RPC_URL", "").strip()
    token_mint = os.environ.get("TOKEN_MINT", "").strip()
    quote_mint = os.environ.get(
        "QUOTE_MINT", "So11111111111111111111111111111111111111112"
    ).strip()
    if not rpc_url or not token_mint:
        raise SystemExit("Set RPC_URL and TOKEN_MINT (see .env.example)")

    tp_pct = _env_decimal("TP_PCT", "25")
    sl_pct = _env_decimal("SL_PCT", "0")
    sell_pct = max(1, min(100, _env_int("SELL_PCT_OF_BALANCE", 100)))
    interval = max(5, _env_int("CHECK_INTERVAL_SEC", 15))
    cooldown = max(0, _env_int("COOLDOWN_AFTER_SELL_SEC", 30))
    slip = max(1, min(5000, _env_int("SLIPPAGE_BPS", 150)))
    min_bal = max(0, _env_int("MIN_BALANCE_RAW", 1))

    kp = _load_keypair()
    me = str(kp.pubkey())

    rpc = SolanaRpc(rpc_url)
    jupiter = JupiterClient(os.environ.get("JUPITER_API_KEY"))

    try:
        token_dec = rpc.get_mint_decimals(token_mint)
        rpc.get_mint_decimals(quote_mint)  # validate quote mint exists

        print(f"Wallet {me}")
        print(f"TOKEN {token_mint} decimals={token_dec}")
        print(f"QUOTE {quote_mint}")
        print(f"TP +{tp_pct}%  SL {sl_pct if sl_pct > 0 else 'off'}  sell {sell_pct}%  every {interval}s")
        print(f"State file {STATE_PATH}")

        while True:
            bal = rpc.get_token_balance_raw(me, token_mint)
            if bal < min_bal:
                if _load_state():
                    print("Balance below MIN_BALANCE_RAW — clearing state.")
                    _clear_state()
                time.sleep(interval)
                continue

            state = _load_state()
            if state and (
                state.get("token_mint") != token_mint
                or state.get("quote_mint") != quote_mint
            ):
                print("Mint config changed — resetting state.")
                _clear_state()
                state = None

            cap = _probe_cap_raw(token_dec)
            probe = min(bal, cap)
            if probe < 1:
                time.sleep(interval)
                continue

            if not state:
                q0 = jupiter.quote_exact_in(
                    input_mint=token_mint,
                    output_mint=quote_mint,
                    amount_raw=probe,
                    slippage_bps=PROBE_SLIPPAGE_BPS,
                )
                entry_out = _quote_out_amount(q0)
                state = {
                    "token_mint": token_mint,
                    "quote_mint": quote_mint,
                    "probe_raw": str(probe),
                    "entry_out_raw": str(entry_out),
                }
                _save_state(state)
                print(
                    f"Armed entry: probe_raw={probe} entry_out_raw={entry_out} (QUOTE out for probe sell)",
                )

            probe_stored = int(state["probe_raw"])
            probe_use = min(bal, probe_stored, cap)
            if probe_use < 1:
                time.sleep(interval)
                continue

            try:
                q = jupiter.quote_exact_in(
                    input_mint=token_mint,
                    output_mint=quote_mint,
                    amount_raw=probe_use,
                    slippage_bps=PROBE_SLIPPAGE_BPS,
                )
                cur_out = _quote_out_amount(q)
            except Exception as e:
                print(f"Quote error: {e!r}", file=sys.stderr)
                time.sleep(interval)
                continue

            entry_out = Decimal(state["entry_out_raw"])
            # Scale entry if probe_use smaller than at arm-time (same price approx).
            ref_entry = entry_out * Decimal(probe_use) / Decimal(probe_stored)

            tp_mult = Decimal(1) + tp_pct / Decimal(100)
            hit_tp = Decimal(cur_out) >= ref_entry * tp_mult
            hit_sl = sl_pct > 0 and Decimal(cur_out) <= ref_entry * (
                Decimal(1) - sl_pct / Decimal(100)
            )

            if not hit_tp and not hit_sl:
                time.sleep(interval)
                continue

            reason = "TP" if hit_tp else "SL"
            sell_raw = max(1, bal * sell_pct // 100)
            sell_raw = min(sell_raw, bal)
            print(
                f"{reason} cur_out={cur_out} ref_entry~={ref_entry.quantize(Decimal('1.000000'))} — selling {sell_raw} raw",
            )

            try:
                q_sell = jupiter.quote_exact_in(
                    input_mint=token_mint,
                    output_mint=quote_mint,
                    amount_raw=sell_raw,
                    slippage_bps=slip,
                )
                sig = sign_and_send_jupiter_swap(rpc, jupiter, kp, q_sell)
                print(f"  https://solscan.io/tx/{sig}")
            except Exception as e:
                print(f"  Sell failed: {e!r}", file=sys.stderr)
                time.sleep(interval)
                continue

            if cooldown:
                time.sleep(cooldown)

            new_bal = rpc.get_token_balance_raw(me, token_mint)
            if new_bal < min_bal:
                _clear_state()
                print("Position flat (dust) — state cleared; will re-arm on next balance.")
            else:
                # Re-arm from current market so next TP/SL is relative to here.
                cap2 = _probe_cap_raw(token_dec)
                pr2 = min(new_bal, cap2)
                qn = jupiter.quote_exact_in(
                    input_mint=token_mint,
                    output_mint=quote_mint,
                    amount_raw=pr2,
                    slippage_bps=PROBE_SLIPPAGE_BPS,
                )
                out2 = _quote_out_amount(qn)
                _save_state(
                    {
                        "token_mint": token_mint,
                        "quote_mint": quote_mint,
                        "probe_raw": str(pr2),
                        "entry_out_raw": str(out2),
                    },
                )
                print(f"Re-armed: probe_raw={pr2} entry_out_raw={out2}")

            time.sleep(interval)
    finally:
        jupiter.close()
        rpc.close()


if __name__ == "__main__":
    main()
