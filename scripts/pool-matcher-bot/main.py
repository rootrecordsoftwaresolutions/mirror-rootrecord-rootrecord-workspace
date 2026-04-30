"""
Raydium CPMM pool mirror bot: when the pool prints a swap on TARGET mint,
execute the opposite side on Jupiter (sell when others buy from pool, buy when others sell).

Requires: POOL_ID (CPMM), TARGET_MINT in that pool, RPC_URL, WALLET_PRIVATE_KEY (base58).

Sizing:
  SIZING_MODE=auto (default) uses mint total supply + your wallet balance to scale buybacks,
  and caps mirror sells vs the pool's on-chain TARGET vault balance (liquidity-aware).
  SIZING_MODE=manual uses MIRROR_BUY_BPS only and does not cap sells vs pool.

MAX_MIRROR_SELL_RAW: unset = cap each mirror sell at 0.1 whole tokens (from mint decimals); 0 = no absolute cap.

This is inventory / liquidity heuristics, not a profit or "pump" guarantee.

Run from this directory:  python main.py
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
from sizing import cap_sell_vs_pool
from tx_parse import detect_target_swap
from pool_discovery import (
    USDC_MINT_MAINNET,
    WSOL_MINT_MAINNET,
    get_or_discover_pool_id,
    parse_quote_mints,
)


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


def _env_bool(name: str, default: bool = False) -> bool:
    v = os.environ.get(name, "").strip().lower()
    if not v:
        return default
    if v in ("1", "true", "yes", "y", "on"):
        return True
    if v in ("0", "false", "no", "n", "off"):
        return False
    return default


def _env_bps(name: str, default: int) -> int:
    return max(0, min(10_000, _env_int(name, default)))


def _maybe_price_usdc_per_token(
    jupiter: JupiterClient,
    *,
    target_mint: str,
    quote_mint: str,
    token_decimals: int,
    slippage_bps: int,
) -> float | None:
    """
    Best-effort token price in quote (USDC) per 1 whole token, via Jupiter quote.
    Returns None if it can't be fetched (illiquid, API down, route missing, etc.).
    """
    if token_decimals < 0 or token_decimals > 18:
        return None
    amt_in = 10**token_decimals
    try:
        q = jupiter.quote_exact_in(
            input_mint=target_mint,
            output_mint=quote_mint,
            amount_raw=amt_in,
            slippage_bps=slippage_bps,
        )
        out_raw = int(str(q.get("outAmount", "0")))
        # Assume USDC-style 6 decimals for price conversion; if quote is not USDC this is only a heuristic.
        if out_raw <= 0:
            return None
        return out_raw / 1e6
    except Exception:
        return None


def _new_sigs_since(
    rpc: SolanaRpc,
    address: str,
    *,
    last_seen: str | None,
    page_limit: int,
    max_pages: int,
) -> list[str]:
    """
    Return signatures (oldest->newest) that are newer than `last_seen`.
    Uses pagination so we don't miss bursts where >page_limit signatures arrive between polls.
    """
    out: list[str] = []
    before: str | None = None
    for _ in range(max(1, max_pages)):
        rows = rpc.get_signatures_for_address(address, limit=page_limit, before=before)
        if not rows:
            break
        sigs = [r.get("signature") for r in rows if isinstance(r.get("signature"), str)]
        if not sigs:
            break
        if last_seen and last_seen in sigs:
            idx = sigs.index(last_seen)
            newer = sigs[:idx]  # newest-first
            out.extend(reversed(newer))
            break
        # last_seen not found in this page: all are new (but older pages may exist)
        out.extend(reversed(sigs))
        before = sigs[-1]
        # If we got fewer than page_limit, we hit the end.
        if len(sigs) < page_limit:
            break
    return out


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


def main() -> None:
    load_dotenv()
    rpc_url = os.environ.get("RPC_URL", "").strip()
    target_mint = os.environ.get("TARGET_MINT", "").strip()
    pool_id_usdc = os.environ.get("POOL_ID_USDC", "").strip()
    pool_id_wsol = os.environ.get("POOL_ID_WSOL", "").strip()
    pool_ids_raw = os.environ.get("POOL_IDS", "").strip()
    pool_id = os.environ.get("POOL_ID", "").strip()
    quote_mint = os.environ.get("QUOTE_MINT", "").strip() or USDC_MINT_MAINNET
    quote_mints = parse_quote_mints(os.environ.get("QUOTE_MINTS"))
    cache_path = Path(os.environ.get("POOL_CACHE_PATH", "").strip() or "pool_cache.json")
    wait_for_pools = _env_bool("WAIT_FOR_POOLS", False)
    discovery_poll_sec = max(1, _env_int("DISCOVERY_POLL_SEC", 2))
    heartbeat_sec = max(0, _env_int("HEARTBEAT_SEC", 30))
    sig_page_limit = max(10, min(1000, _env_int("SIG_PAGE_LIMIT", 100)))
    sig_max_pages = max(1, min(50, _env_int("SIG_MAX_PAGES", 5)))
    if not rpc_url or not target_mint:
        raise SystemExit("Set RPC_URL and TARGET_MINT (see .env.example)")

    poll_sec = max(1, _env_int("POLL_INTERVAL_SEC", 5))
    slippage_bps = max(1, min(5000, _env_int("SLIPPAGE_BPS", 120)))
    min_raw = max(0, _env_int("MIN_MATCH_RAW", 1))
    min_price_usd = _env_float("MIN_PRICE_USD", 0.00001)
    # Mirror sizing: sell this fraction of each detected pool buy-leg (bps). 10_000 = 100%.
    mirror_sell_bps = _env_bps("MIRROR_SELL_BPS", 10_000)
    # Safety rails (optional):
    # - cap each sell to a % of current wallet balance
    max_per_trade_wallet_bps = _env_bps("MAX_SELL_PER_TRADE_WALLET_BPS", 0)  # 0 = off
    # - cap total sold for the process lifetime
    max_session_sell_raw = max(0, _env_int("MAX_SESSION_SELL_RAW", 0))  # 0 = off
    _mode = os.environ.get("SIZING_MODE", "auto").strip().lower()
    sizing_auto = _mode not in ("manual", "off", "false", "no", "0")
    auto_sell_max_pool_bps = max(1, min(10_000, _env_int("AUTO_SELL_MAX_POOL_BPS", 50)))

    invert_match = os.environ.get("POOL_MATCH_INVERT", "0").strip().lower() in (
        "1",
        "true",
        "yes",
    )

    kp = _load_keypair()
    me = str(kp.pubkey())
    bot_id = os.environ.get("ECOSYSTEM_BOT_ID", "pool_matcher").strip() or "pool_matcher"
    reinvest_track = UsdcMirrorReinvestAccumulator()
    target_pk = Pubkey.from_string(target_mint)

    rpc = SolanaRpc(rpc_url)
    jupiter = JupiterClient(os.environ.get("JUPITER_API_KEY"))

    try:
        # Multi-pool mode:
        # - If POOL_ID_USDC and/or POOL_ID_WSOL are set, watch those pools (explicit mapping).
        # - If POOL_IDS is set, watch those pools (fastest for launch).
        # - Else if POOL_ID is set, watch just that pool.
        # - Otherwise, discover pools for QUOTE_MINTS (default: USDC + WSOL).
        pools_to_watch: list[tuple[str, str]] = []  # (pool_id, intended_quote_mint)
        missing_quote_mints: list[str] = []
        if pool_id_usdc or pool_id_wsol:
            if pool_id_usdc:
                pools_to_watch.append((pool_id_usdc, USDC_MINT_MAINNET))
            else:
                print(
                    "USDC pool not set (POOL_ID_USDC is empty). "
                    + ("Will keep trying discovery…" if wait_for_pools else "Will not trade USDC pair."),
                    file=sys.stderr,
                )
                if wait_for_pools:
                    missing_quote_mints.append(USDC_MINT_MAINNET)
            if pool_id_wsol:
                pools_to_watch.append((pool_id_wsol, WSOL_MINT_MAINNET))
            else:
                print(
                    "WSOL pool not set (POOL_ID_WSOL is empty). "
                    + ("Will keep trying discovery…" if wait_for_pools else "Will not trade SOL pair."),
                    file=sys.stderr,
                )
                if wait_for_pools:
                    missing_quote_mints.append(WSOL_MINT_MAINNET)
        elif pool_ids_raw:
            parts = [p.strip() for p in pool_ids_raw.split(",") if p.strip()]
            if not parts:
                raise SystemExit("POOL_IDS is set but empty. Provide comma-separated pool ids.")
            pools_to_watch = [(p, "") for p in parts]
        elif pool_id:
            pools_to_watch = [(pool_id, quote_mint)]
        else:
            if not quote_mints:
                quote_mints = [USDC_MINT_MAINNET, WSOL_MINT_MAINNET]
            for qm in quote_mints:
                while True:
                    try:
                        pid, from_cache = get_or_discover_pool_id(
                            rpc,
                            target_mint=target_mint,
                            quote_mint=qm,
                            cache_path=cache_path,
                        )
                        print(
                            f"Discovered POOL_ID for {target_mint} <-> {qm}: {pid} "
                            f"({'cache' if from_cache else 'fresh'})",
                        )
                        pools_to_watch.append((pid, qm))
                        break
                    except Exception as e:
                        if not wait_for_pools:
                            raise
                        print(
                            f"WARN: pool not found yet for {target_mint} <-> {qm} ({e!r}); retrying in {discovery_poll_sec}s...",
                            file=sys.stderr,
                        )
                        time.sleep(discovery_poll_sec)

        # Load all pool states up front (for whatever pools are known right now).
        pool_states: dict[str, dict[str, Any]] = {}
        for pid, intended_qm in pools_to_watch:
            info = rpc.request(
                "getAccountInfo",
                [pid, {"encoding": "base64", "commitment": "confirmed"}],
            )
            val = info and info.get("value")
            if not val:
                raise SystemExit(f"No account at POOL_ID {pid}")
            owner = val.get("owner")
            if owner != str(CPMM_PROGRAM_MAINNET):
                raise SystemExit(
                    f"Pool {pid} owner is {owner}, expected Raydium CPMM {CPMM_PROGRAM_MAINNET} "
                    "(mainnet only for this script).",
                )
            raw = val["data"][0]
            pool = parse_cpmm_pool_account(base64.b64decode(raw))
            if target_pk not in (pool.mint_a, pool.mint_b):
                raise SystemExit(f"TARGET_MINT is not mintA or mintB of pool {pid}.")
            other_mint = str(pool.mint_b) if pool.mint_a == target_pk else str(pool.mint_a)
            if intended_qm and other_mint != intended_qm:
                print(
                    f"WARN: pool {pid} quote mint is {other_mint}, but intended quote mint was {intended_qm}. "
                    "Continuing with on-chain pool quote mint.",
                    file=sys.stderr,
                )
            quote_mint_for_pool = other_mint
            target_vault = str(pool.vault_a) if str(pool.mint_a) == target_mint else str(pool.vault_b)
            pool_states[pid] = {
                "pool": pool,
                "quote_mint": quote_mint_for_pool,
                "target_vault": target_vault,
            }

        supply_raw = 0
        # Sell-only bot: mint supply isn't needed (only sell caps vs wallet + pool liquidity).

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

        if missing_quote_mints:
            print(
                f"Waiting for {len(missing_quote_mints)} pool(s) to appear: {', '.join(missing_quote_mints)}",
                file=sys.stderr,
            )

        print(f"Watching {len(pool_states)} pool(s) for TARGET={target_mint}")
        for pid, st in pool_states.items():
            pool = st["pool"]
            qm = st["quote_mint"]
            tv = st["target_vault"]
            print(f"Pool {pid}")
            print(f"  mintA {pool.mint_a} vault {pool.vault_a}")
            print(f"  mintB {pool.mint_b} vault {pool.vault_b}")
            print(f"  quote/other {qm}  target_vault {tv}")
        print(
            f"  wallet {me}  decimals={token_dec}  max_mirror_sell_raw={max_mirror_sell_raw or 'off'}",
        )
        w0 = rpc.get_token_balance_raw(me, target_mint)
        try:
            # show reserve for first pool (if any) for a quick sanity check
            first_tv = next(iter(pool_states.values()))["target_vault"]
            pool_r0 = rpc.get_token_account_balance_raw(first_tv)
        except Exception:
            pool_r0 = -1
        print(
            f"  poll {poll_sec}s  slippage {slippage_bps} bps  min_raw {min_raw}  "
            f"POOL_MATCH_INVERT={'on' if invert_match else 'off'}",
        )
        print(
            f"MIN_PRICE_USD={min_price_usd} (best-effort; if price unavailable, continues trading)",
        )
        print(
            f"  MIRROR_SELL_BPS={mirror_sell_bps} (of each detected buy leg)",
        )
        print(
            f"  MAX_SELL_PER_TRADE_WALLET_BPS={max_per_trade_wallet_bps or 'off'}  "
            f"MAX_SESSION_SELL_RAW={max_session_sell_raw or 'off'}",
        )
        print(
            f"  SIZING_MODE={'auto' if sizing_auto else 'manual'}  "
            f"wallet_token_raw={w0}  pool_TARGET_vault_raw={pool_r0}",
        )
        print(
            f"  AUTO_SELL_MAX_POOL_BPS={auto_sell_max_pool_bps}  "
            f"MAX_MIRROR_SELL_RAW={max_mirror_sell_raw or 'off'}",
        )
        print("Priming seen signatures (no trades for history on this pass)...")

        last_seen_by_pool: dict[str, str | None] = {}
        for pid in pool_states.keys():
            rows = rpc.get_signatures_for_address(pid, limit=1)
            newest = rows[0].get("signature") if rows else None
            last_seen_by_pool[pid] = newest if isinstance(newest, str) else None
        print(
            f"Primed last seen signatures for {len(last_seen_by_pool)} pool(s). Matching new swaps.",
        )

        session_sold_raw = 0
        last_heartbeat = 0.0
        last_discovery_try = 0.0

        try:
            while True:
                # If configured, keep trying to discover missing pools without blocking the active ones.
                if wait_for_pools and missing_quote_mints:
                    now = time.time()
                    if now - last_discovery_try >= discovery_poll_sec:
                        last_discovery_try = now
                        still_missing: list[str] = []
                        for qm in missing_quote_mints:
                            try:
                                pid, from_cache = get_or_discover_pool_id(
                                    rpc,
                                    target_mint=target_mint,
                                    quote_mint=qm,
                                    cache_path=cache_path,
                                )
                                if pid in pool_states:
                                    continue
                                print(
                                    f"Discovered POOL_ID for {target_mint} <-> {qm}: {pid} "
                                    f"({'cache' if from_cache else 'fresh'})",
                                )
                                # load pool account
                                info = rpc.request(
                                    "getAccountInfo",
                                    [pid, {"encoding": "base64", "commitment": "confirmed"}],
                                )
                                val = info and info.get("value")
                                if not val:
                                    raise RuntimeError(f"No account at POOL_ID {pid}")
                                owner = val.get("owner")
                                if owner != str(CPMM_PROGRAM_MAINNET):
                                    raise RuntimeError(f"Pool {pid} owner {owner} != CPMM program")
                                raw = val["data"][0]
                                pool = parse_cpmm_pool_account(base64.b64decode(raw))
                                if target_pk not in (pool.mint_a, pool.mint_b):
                                    raise RuntimeError("TARGET_MINT not in discovered pool")
                                other_mint = (
                                    str(pool.mint_b) if pool.mint_a == target_pk else str(pool.mint_a)
                                )
                                target_vault = (
                                    str(pool.vault_a)
                                    if str(pool.mint_a) == target_mint
                                    else str(pool.vault_b)
                                )
                                pool_states[pid] = {
                                    "pool": pool,
                                    "quote_mint": other_mint,
                                    "target_vault": target_vault,
                                }
                                # prime last seen for this new pool
                                rows = rpc.get_signatures_for_address(pid, limit=1)
                                newest = rows[0].get("signature") if rows else None
                                last_seen_by_pool[pid] = newest if isinstance(newest, str) else None
                                print(f"Now watching pool {pid} (quote {other_mint}).")
                            except Exception as e:
                                print(
                                    f"WARN: pool not found yet for {target_mint} <-> {qm} ({e!r}); still waiting...",
                                    file=sys.stderr,
                                )
                                still_missing.append(qm)
                        missing_quote_mints = still_missing

            # Best-effort USD price check always probes token->USDC; failure must not stop trading.
            px_usd = None
            if min_price_usd > 0:
                px_usd = _maybe_price_usdc_per_token(
                    jupiter,
                    target_mint=target_mint,
                    quote_mint=USDC_MINT_MAINNET,
                    token_decimals=token_dec,
                    slippage_bps=slippage_bps,
                )

            for pid, st in pool_states.items():
                pool = st["pool"]
                pool_quote = st["quote_mint"]
                target_vault = st["target_vault"]

                new_sigs = _new_sigs_since(
                    rpc,
                    pid,
                    last_seen=last_seen_by_pool.get(pid),
                    page_limit=sig_page_limit,
                    max_pages=sig_max_pages,
                )
                for sig in new_sigs:
                    last_seen_by_pool[pid] = sig
                    tx = rpc.get_transaction(sig)
                    if not tx or not tx.get("transaction"):
                        continue
                    if _tx_signers_include_wallet(tx, me):
                        continue
                    leg = detect_target_swap(tx, pool, target_pk, invert_mapping=invert_match)
                    if not leg:
                        continue
                    if leg.sell_target_raw < min_raw and leg.buy_target_raw < min_raw:
                        continue

                    if leg.sell_target_raw > 0:
                        if px_usd is not None and px_usd < min_price_usd:
                            print(
                                f"{sig[:12]}…  pool {pid[:8]}… skip mirror SELL "
                                f"(price ${px_usd:.10f} < ${min_price_usd:.10f})",
                            )
                            continue
                        bal = rpc.get_token_balance_raw(me, target_mint)
                        if bal <= 0:
                            print("Wallet TOKEN balance is 0 — stopping (out of tokens to mirror sells).")
                            return
                        if sizing_auto:
                            try:
                                pool_r = rpc.get_token_account_balance_raw(target_vault)
                            except Exception:
                                pool_r = 0
                            amt = cap_sell_vs_pool(
                                leg.sell_target_raw,
                                bal,
                                pool_r,
                                auto_sell_max_pool_bps,
                            )
                        else:
                            amt = min(leg.sell_target_raw, bal)
                        if mirror_sell_bps < 10_000:
                            amt = amt * mirror_sell_bps // 10_000
                        if max_mirror_sell_raw > 0:
                            amt = min(amt, max_mirror_sell_raw)
                        if max_per_trade_wallet_bps > 0:
                            wallet_cap = max(1, bal * max_per_trade_wallet_bps // 10_000)
                            amt = min(amt, wallet_cap)
                        if max_session_sell_raw > 0:
                            remaining = max_session_sell_raw - session_sold_raw
                            if remaining <= 0:
                                print(
                                    f"Reached MAX_SESSION_SELL_RAW={max_session_sell_raw}; stopping to avoid dumping inventory.",
                                )
                                return
                            amt = min(amt, remaining)
                        if amt < min_raw:
                            continue
                        print(
                            f"{sig[:12]}…  pool {pid[:8]}… mirror SELL {amt} raw of {target_mint} "
                            f"-> {pool_quote} (leg={leg.sell_target_raw} wallet={bal})",
                        )
                        try:
                            q = jupiter.quote_exact_in(
                                input_mint=target_mint,
                                output_mint=pool_quote,
                                amount_raw=amt,
                                slippage_bps=slippage_bps,
                            )
                            out_sig = sign_and_send_jupiter_swap(rpc, jupiter, kp, q)
                            print(f"  sent https://solscan.io/tx/{out_sig}")
                            session_sold_raw += amt
                            usd_est = usdc_from_quote_out(pool_quote, q)
                            meta: dict[str, Any] = {
                                "pool_trigger_sig": sig,
                                "pool_id": pid,
                                "pool_quote_mint": pool_quote,
                            }
                            if usd_est is not None:
                                meta["usd_from_quote"] = round(usd_est, 8)
                            if px_usd is not None:
                                meta["token_price_usd_probe"] = round(px_usd, 12)
                            post_ecosystem_bot_event(
                                bot_id=bot_id,
                                event_type="mirror_sell",
                                pool_id=pid,
                                mint=target_mint,
                                tx_signature=out_sig,
                                amount_token_raw=amt,
                                metadata=meta,
                            )
                            if usd_est is not None:
                                reinvest_track.on_usdc_sell(
                                    usd=usd_est,
                                    bot_id=bot_id,
                                    pool_id=pid,
                                    tx_signature=out_sig,
                                )
                        except Exception as e:
                            print(f"  ERROR {e!r}", file=sys.stderr)

                    elif leg.buy_target_raw > 0:
                        # Sell-only bot: ignore pool legs that imply "buy TARGET" mirroring.
                        continue

            if heartbeat_sec > 0:
                now = time.time()
                if now - last_heartbeat >= heartbeat_sec:
                    last_heartbeat = now
                    print(
                        f"[heartbeat] watching {len(pool_states)} pool(s); session_sold_raw={session_sold_raw}",
                    )

            time.sleep(poll_sec)
        except KeyboardInterrupt:
            print("\n[pool-matcher] stopped (KeyboardInterrupt).")
    finally:
        jupiter.close()
        rpc.close()


if __name__ == "__main__":
    main()
