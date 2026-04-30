"""
Post mirror-bot telemetry and optional reinvest queue rows to rootrecord-primary Worker.

Uses the same auth as site action logging:
  SOLANA_SITE_LOG_URL   — full URL to .../api/solana-site/log
  SOLANA_SITE_LOG_SECRET — Bearer token

Derived endpoints:
  .../ecosystem-bot-event
  .../ecosystem-reinvest

Optional reinvest (cumulative USDC proceeds from mirror *sells* into USDC):
  ECOSYSTEM_REINVEST_USD_THRESHOLD — e.g. 20 (omit or 0 to disable)
  ECOSYSTEM_REINVEST_SOURCE        — slug for queue source (default: mirror_bot)
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any, Mapping

import httpx

USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"


def _urls() -> tuple[str | None, str | None, str | None]:
    log_url = os.environ.get("SOLANA_SITE_LOG_URL", "").strip()
    secret = os.environ.get("SOLANA_SITE_LOG_SECRET", "").strip()
    if not log_url or not secret:
        return None, None, None
    base = log_url.rstrip("/")
    if not base.endswith("/log"):
        return None, None, None
    stem = base[:-4]
    return (
        f"{stem}/ecosystem-bot-event",
        f"{stem}/ecosystem-reinvest",
        secret,
    )


def post_ecosystem_bot_event(
    *,
    bot_id: str,
    event_type: str,
    pool_id: str,
    mint: str,
    tx_signature: str,
    amount_token_raw: int | None = None,
    amount_quote_raw: int | None = None,
    quote_currency: str | None = None,
    usd_estimate: str | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> bool:
    event_url, _, secret = _urls()
    if not event_url or not secret:
        return False
    body: dict[str, Any] = {
        "bot_id": bot_id,
        "event_type": event_type,
        "pool_id": pool_id,
        "mint": mint,
        "tx_signature": tx_signature,
    }
    if amount_token_raw is not None:
        body["amount_token_raw"] = str(amount_token_raw)
    if amount_quote_raw is not None:
        body["amount_quote_raw"] = str(amount_quote_raw)
    if quote_currency:
        body["quote_currency"] = quote_currency
    if usd_estimate:
        body["usd_estimate"] = usd_estimate
    if metadata is not None:
        body["metadata"] = dict(metadata)
    try:
        r = httpx.post(
            event_url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {secret}",
            },
            content=json.dumps(body),
            timeout=15.0,
        )
        if not r.is_success:
            print(
                f"ecosystem_worker: bot-event HTTP {r.status_code} {r.text[:200]!r}",
                file=sys.stderr,
            )
            return False
        return True
    except Exception as e:
        print(f"ecosystem_worker: bot-event failed {e!r}", file=sys.stderr)
        return False


def post_ecosystem_reinvest(*, source: str, amount_usd: str, metadata: Mapping[str, Any] | None = None) -> bool:
    _, reinvest_url, secret = _urls()
    if not reinvest_url or not secret:
        return False
    body: dict[str, Any] = {"source": source, "amount_usd": amount_usd}
    if metadata is not None:
        body["metadata"] = dict(metadata)
    try:
        r = httpx.post(
            reinvest_url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {secret}",
            },
            content=json.dumps(body),
            timeout=15.0,
        )
        if not r.is_success:
            print(
                f"ecosystem_worker: reinvest HTTP {r.status_code} {r.text[:200]!r}",
                file=sys.stderr,
            )
            return False
        return True
    except Exception as e:
        print(f"ecosystem_worker: reinvest failed {e!r}", file=sys.stderr)
        return False


class UsdcMirrorReinvestAccumulator:
    """Cumulative USDC out from mirror sells; queues one reinvest row when threshold reached."""

    def __init__(self) -> None:
        raw = os.environ.get("ECOSYSTEM_REINVEST_USD_THRESHOLD", "").strip()
        try:
            t = float(raw) if raw else 0.0
        except ValueError:
            t = 0.0
        self.threshold: float | None = t if t > 0 else None
        self.source = (
            os.environ.get("ECOSYSTEM_REINVEST_SOURCE", "mirror_bot").strip() or "mirror_bot"
        )
        self._acc = 0.0

    def on_usdc_sell(self, *, usd: float, bot_id: str, pool_id: str, tx_signature: str) -> None:
        if self.threshold is None or usd <= 0:
            return
        self._acc += usd
        if self._acc < self.threshold:
            return
        amt = f"{self._acc:.2f}"
        ok = post_ecosystem_reinvest(
            source=self.source,
            amount_usd=amt,
            metadata={
                "bot_id": bot_id,
                "pool_id": pool_id,
                "trigger_tx": tx_signature,
            },
        )
        if ok:
            self._acc = 0.0


def usdc_from_quote_out(other_mint: str, quote: Mapping[str, Any]) -> float | None:
    if other_mint != USDC_MINT:
        return None
    raw = quote.get("outAmount")
    if raw is None:
        return None
    try:
        out = int(str(raw))
    except (TypeError, ValueError):
        return None
    return out / 1e6
