"""Quote + swap via Jupiter swap API (lite or api.jup.ag)."""

from __future__ import annotations

import base64
from typing import Any

import httpx
from solders.keypair import Keypair
from solders.message import to_bytes_versioned
from solders.transaction import VersionedTransaction

from rpc import SolanaRpc


class JupiterClient:
    def __init__(self, api_key: str | None = None, timeout: float = 45.0) -> None:
        if api_key and api_key.strip():
            self._base = "https://api.jup.ag"
            self._headers = {"x-api-key": api_key.strip()}
        else:
            self._base = "https://lite-api.jup.ag"
            self._headers = {}
        self._client = httpx.Client(timeout=timeout)

    def close(self) -> None:
        self._client.close()

    def quote_exact_in(
        self,
        *,
        input_mint: str,
        output_mint: str,
        amount_raw: int,
        slippage_bps: int,
    ) -> dict[str, Any]:
        params = {
            "inputMint": input_mint,
            "outputMint": output_mint,
            "amount": str(amount_raw),
            "slippageBps": str(slippage_bps),
        }
        r = self._client.get(
            f"{self._base}/swap/v1/quote",
            params=params,
            headers=self._headers,
        )
        r.raise_for_status()
        return r.json()

    def swap_transaction_b64(self, user_public_key: str, quote: dict[str, Any]) -> str:
        body = {
            "userPublicKey": user_public_key,
            "quoteResponse": quote,
            "dynamicComputeUnitLimit": True,
            "dynamicSlippage": True,
        }
        r = self._client.post(
            f"{self._base}/swap/v1/swap",
            json=body,
            headers=self._headers,
        )
        r.raise_for_status()
        data = r.json()
        return str(data["swapTransaction"])


def sign_and_send_jupiter_swap(
    rpc: SolanaRpc,
    jupiter: JupiterClient,
    keypair: Keypair,
    quote: dict[str, Any],
) -> str:
    b64_tx = jupiter.swap_transaction_b64(str(keypair.pubkey()), quote)
    raw = base64.b64decode(b64_tx)
    vt = VersionedTransaction.from_bytes(raw)
    keys = list(vt.message.account_keys)
    wallet_idx = keys.index(keypair.pubkey())
    sigs = list(vt.signatures)
    sigs[wallet_idx] = keypair.sign_message(to_bytes_versioned(vt.message))
    signed = VersionedTransaction.populate(vt.message, sigs)
    wire = base64.b64encode(bytes(signed)).decode("ascii")
    return rpc.send_raw_transaction(wire)
