# RootRecord Solana Tools — PRD

## Original problem statement
Build a complete, production-ready Next.js 14+ App Router web app called **RootRecord
Solana Tools** that will live at `solana.rootrecord.info`. A fast, cheap, user-first
Solana SPL token creator and management suite that undercuts every competitor by ~50%
while delivering a cleaner, more trustworthy experience. Must replicate the
rootrecord.info aesthetic 1:1, dark mode by default, with Solana brand accents
(#14F195 green, #9945FF purple). All Solana interactions client-side.

## Architecture
- **Stack:** Next.js 14 App Router · TypeScript · Tailwind · shadcn-style UI · sonner
- **Solana:** `@solana/web3.js`, `@solana/spl-token`, `@metaplex-foundation/mpl-token-metadata`
  v2.13 (legacy createCreate/Update instruction creators), `@solana/wallet-adapter-*`
- **Wallets:** Phantom, Solflare adapters + Wallet Standard auto-detect (Backpack, Glow…)
- **IPFS:** Pinata (frontend SDK calls — JWT in env)
- **Forms:** React Hook Form + Zod
- **No backend:** fully client-side; deploy via Vercel.

## Personas
1. Memecoin launcher — wants a fast, cheap, trustworthy mint flow and instant
   "revoke authority" buttons.
2. Indie founder — wants to mint a real utility token, update metadata later,
   pay per action, no subscriptions.
3. Crypto-curious user — drawn in by the calm, transparent UI; values seeing
   real on-chain costs vs platform fees.

## Static core requirements
- Charge ~half what competitors charge, transparently. Default fees:
  `CREATE_FEE_SOL = 0.025`, `ACTION_FEE_SOL = 0.01`.
- Every fee-bearing action includes a `SystemProgram.transfer` inside the same
  signed transaction (no "trust us, we'll bill you" patterns).
- 1:1 aesthetic match with rootrecord.info: numbered sections, italic emphasis on
  key words, ample whitespace, soft accents.
- Wallet-first: wallet adapter button always visible; create form gates submit
  on connection.
- IPFS metadata via Pinata (logo + JSON).
- Referral capture: `?ref=WALLET` saved to localStorage on every page load and
  shown as a header pill.

## What's been implemented (Jan 26, 2026)
- ✅ Project scaffolding: Next.js 14 + TS + Tailwind + shadcn primitives
- ✅ Dark theme matching rootrecord.info, custom color palette (`ink`, `sol`)
- ✅ Inter (sans) + Instrument Serif (display italic) fonts
- ✅ Header with brand mark, navigation, ReferralPill, wallet adapter button
- ✅ Footer with Privacy, Terms, GitHub, brand statement
- ✅ Landing page (`/`), Pricing (`/pricing`), Docs (`/docs`), Privacy, Terms
- ✅ Token Creator page (`/create`) — full form, fee sidebar, fee-wallet warning
- ✅ Single-tx **legacy SPL** token creation flow with Metaplex v3 metadata
- ✅ Success dialog: copy mint, Solscan link, one-click revoke mint
  authority, revoke freeze authority, mint more, share-on-X
- ✅ **Token-2022 mode** with 7 extensions on /create:
  - Transfer fee (bps + max fee)
  - Transfer hook (custom program ID)
  - Non-transferable (soulbound)
  - Mint close authority
  - Permanent delegate (compliance)
  - Interest-bearing (display APY)
  - Default-frozen account state
  - Plus in-mint TokenMetadata extension (no Metaplex needed for 2022)
- ✅ Token-2022 creation flow uses 2 sequential transactions (account + extensions
  + InitializeMint + InitializeMetadata, then ATA + MintTo + fee).
- ✅ **Tools page** (`/tools`) with 7 cards:
  - Revoke mint authority (auto-detects program ID, works for both)
  - Revoke freeze authority (auto-detects)
  - Mint more (auto-detects)
  - Update metadata (legacy Metaplex)
  - Withdraw transfer fees (Token-2022)
  - Harvest fees → mint (Token-2022)
  - Update transfer fee config (Token-2022)
- ✅ Referral system stub
- ✅ **Pinata IPFS uploader is server-only**: 3 Route Handlers under
  `/api/pin/{file,json,status}` proxy uploads. JWT lives in `PINATA_JWT` (no
  `NEXT_PUBLIC_` prefix) — never lands in the browser bundle.
- ✅ Production build passes — 10 static + 3 dynamic API routes.
- ✅ TypeScript strict, ESLint clean.

## Live env (set Jan 26, 2026)
- Network: `mainnet-beta`
- RPC: Helius mainnet (key in `.env.local`)
- Fee wallet: `HCeCfMAAZeFUaBQrzC2t84myrBnvnb3h8M26k4urv2X1`
- Pinata: configured (JWT server-side only); smoke-tested via JSON pin.

## NOT IMPLEMENTED / placeholders
- `NEXT_PUBLIC_FEE_WALLET` is a placeholder — the app shows a yellow "set this
  to enable monetization" banner until the user fills it.
- `NEXT_PUBLIC_PINATA_JWT` is a placeholder — IPFS uploads are skipped (token
  still creates without an image) until the user provides a JWT. **MOCKED-FREE**:
  no fake APIs; the code talks to Pinata and Solana RPC directly when configured.
- Referral payouts (the 30% split) — only the capture/display is live; the
  actual payout from the platform fee wallet is a backend job for later.

## Prioritized backlog
- **P0:** Server-side Pinata proxy (so JWT isn't exposed in the bundle).
- **P0:** Real e2e test on devnet with a funded wallet.
- **P1:** Real "recently launched" feed (read mint creations from RPC).
- **P1:** Token-2022 extension support (transfer fees, hooks).
- **P1:** Liquidity helpers (Raydium / Meteora pool creation).
- **P2:** Backend referral payout cron (read fee-wallet incomings, attribute to
  referrer, distribute 30% weekly).
- **P2:** Authority status badges (read mint to show "mint revoked", "freeze
  revoked", "metadata immutable" state on the tools page).

## Run / deploy
- Local: `cp .env.example .env.local`, fill values, `npm install --legacy-peer-deps`,
  `npm run dev` → http://localhost:3000
- Vercel: connect repo, set env vars, deploy. `vercel.json` already configured.
