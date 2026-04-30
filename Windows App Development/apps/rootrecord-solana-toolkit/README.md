# RootRecord Solana Toolkit (Windows / Electron)

Desktop port of [solana.rootrecord.info](https://solana.rootrecord.info): SPL + Token-2022 create, tools, Raydium CPMM liquidity, bulk sends, Streamflow vesting, paper wallet generator, referrals, and Worker-backed features when you set API env vars.

## Run

```bash
cd "Windows App Development/apps/rootrecord-solana-toolkit"
cp .env.example .env.local
# edit .env.local — at minimum set VITE_RPC_URL and VITE_FEE_WALLET for fee-bearing flows
npm install
npm run dev
```

In Electron, browser extension wallets may not inject. Use **Local key** in the header: paste a JSON / base58 / hex secret; it signs in-process (memory only).

## Build

```bash
npm run build
```

Packaged Windows installers: `npm run dist:win` (requires a successful `npm run build` first).

## Notes

- **Vite env** uses the `VITE_` prefix (see `.env.example`).
- **IPFS**: set `VITE_PINATA_JWT` for direct Pinata uploads (same outcome as the site’s server proxy).
- **npm**: the repo includes `.npmrc` with `legacy-peer-deps=true` to accommodate wallet-adapter peer ranges. If `npm install` fails on a package with a broken `postinstall`, run `npm install --ignore-scripts` once, then `npm install @esbuild/win32-x64` on Windows if esbuild is missing.
- **Parity**: core transaction code is copied from `solana/solanasite` (`lib/solana.ts`, `token2022`, `raydiumCpmmLaunch`, `bulkSol`, tools, create, liquidity, etc.). Ecosystem / Purpose checkout UIs that depend on many server routes are stubbed with links; you can point `VITE_WORKER_API_ORIGIN` at the same API as production for read-only routes.
