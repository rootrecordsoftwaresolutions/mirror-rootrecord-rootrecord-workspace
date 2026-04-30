"""Minimal Solana JSON-RPC for balances + mint metadata."""

from __future__ import annotations

from typing import Any

import httpx


class SolanaRpc:
    def __init__(self, url: str, timeout: float = 60.0) -> None:
        self._url = url
        self._client = httpx.Client(timeout=timeout)

    def close(self) -> None:
        self._client.close()

    def request(self, method: str, params: list[Any] | dict[str, Any]) -> Any:
        body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        r = self._client.post(self._url, json=body)
        r.raise_for_status()
        j = r.json()
        if "error" in j:
            raise RuntimeError(str(j["error"]))
        return j["result"]

    def send_raw_transaction(self, tx_b64: str) -> str:
        opts = {
            "encoding": "base64",
            "skipPreflight": False,
            "maxRetries": 3,
        }
        return self.request("sendTransaction", [tx_b64, opts])

    def get_token_balance_raw(self, owner: str, mint: str) -> int:
        res = self.request(
            "getTokenAccountsByOwner",
            [
                owner,
                {"mint": mint},
                {"encoding": "jsonParsed", "commitment": "confirmed"},
            ],
        )
        total = 0
        for row in res or []:
            try:
                info = row["account"]["data"]["parsed"]["info"]
                total += int(info["tokenAmount"]["amount"])
            except (KeyError, TypeError, ValueError):
                continue
        return total

    def get_mint_decimals(self, mint: str) -> int:
        out = self.request(
            "getAccountInfo",
            [mint, {"encoding": "jsonParsed", "commitment": "confirmed"}],
        )
        v = out and out.get("value")
        if not v:
            raise RuntimeError(f"No mint account for {mint}")
        parsed = v.get("data", {}).get("parsed", {})
        info = parsed.get("info", {})
        d = info.get("decimals")
        if d is None:
            raise RuntimeError(f"Could not read decimals for {mint}")
        return int(d)
