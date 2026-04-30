## Pool matcher bot (Raydium CPMM -> Jupiter)

Watches a **Raydium CPMM** pool and reacts to swaps that move your `TARGET_MINT`.

### What it does (configured for your request)

- **Finds the USDC pool once**:
  - If `POOL_ID` is empty, it will auto-discover the Raydium CPMM pool for `TARGET_MINT`↔USDC and save it in `pool_cache.json`.
  - Next runs will reuse the cached pool id and won’t scan again.
- **Multi-pool support (recommended)**:
  - If `POOL_ID` is empty and you set `QUOTE_MINTS=USDC,WSOL`, it will discover **both** pools and watch them in parallel.
  - When either pool shows a buy of your token (pool vault loses `TARGET_MINT`), it will send a **sell** to that pool’s quote mint via Jupiter.
- **Fastest launch mode (paste pool ids)**:
  - Preferred: set `POOL_ID_USDC=...` and `POOL_ID_WSOL=...` to watch both immediately.
  - Fallback: set `POOL_IDS=poolId1,poolId2` to watch multiple pools immediately.
  - `POOL_ID_USDC` / `POOL_ID_WSOL` take precedence over `POOL_IDS`, `POOL_ID`, and auto-discovery.
- **Sell-only mirroring**:
  - When someone buys your token from the pool (pool vault **loses** `TARGET_MINT`), the bot **sells the same raw amount** of `TARGET_MINT` via Jupiter.
  - It **does not** mirror other peoples’ sells (and it never sends buys).
- **Partial mirroring (optional)**:
  - Set `MIRROR_SELL_BPS=5000` to mirror **50%** of each detected buy leg (instead of 100%).
- **High-volume detection**:
  - If launch traffic is extremely high, increase `SIG_PAGE_LIMIT` and/or `SIG_MAX_PAGES` so the bot pages through signatures and doesn’t miss swaps between polls.
- **Price threshold**:
  - It will only mirror when price is \(\ge\) `MIN_PRICE_USD` (default `0.00001`) **if** it can fetch a price.
  - If price fetch fails, it **continues trading** (treats it as “over threshold”).
- **Optional “don’t dump everything” rails** (off by default):
  - `MAX_SELL_PER_TRADE_WALLET_BPS`: caps each sell to a % of your current wallet balance (e.g. 2500 = 25%).
  - `MAX_SESSION_SELL_RAW`: caps how many raw tokens the bot will sell total during this run.

### Setup

1) Copy env file:

```bash
copy .env.example .env
```

2) Edit `.env`:
- `RPC_URL`: your mainnet RPC
- `WALLET_PRIVATE_KEY`: base58 secret key (32 or 64 bytes). To switch wallets, just update this value.
- `TARGET_MINT`: your token mint (you provided: `6KfGKe13ASrV5WHvChbapQXxxEFRNqwpwrdEVsX6RQMT`)
- Leave `POOL_ID` blank to auto-discover and cache
- For 2-pool mode, set `QUOTE_MINTS=USDC,WSOL`
- For fastest launch with known ids, set `POOL_IDS=...,...`

3) Run on Windows:
- Double click `run-pool-matcher.bat`

### Notes

- The bot triggers off **on-chain vault deltas** in transactions that touch the pool account (so it reacts to real swaps).
- It will stop if your wallet runs out of `TARGET_MINT` (because it can’t mirror sells without inventory).

