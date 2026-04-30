# Emergent: white-label single-token launchpad

Use this document when pointing Emergent at the RootRecord monorepo. It contains (1) **where to read** in this repo, (2) **v1 scope** decisions, and (3) the **master prompt** to paste into Emergent so it can generate a new repository.

---

## 1. Repository map (read these paths)

All paths are relative to the **repository root** (parent of `solana/solanasite`).

| Purpose | Path |
|--------|------|
| **Primary reference app** (Next.js Solana site) | `solana/solanasite/` |
| Product copy / original build brief | `solana/solanasite/Starting AI Prompt`, `solana/solanasite/memory/PRD.md` |
| **Cloudflare Worker** (solana-site log + related routes) — use **one** tree | Prefer `solana/solanasite/cloudflare/rootrecord-primary/` |
| Duplicate Worker copy (avoid double-editing) | `cloudflare/rootrecord-primary/` (same project, second copy) |
| Ecosystem OTC (optional fork only) | `solana/solanasite/app/ecosystem/`, `solana/solanasite/app/api/ecosystem/`, `solana/solanasite/lib/ecosystemOtc*.ts` |

**Instruction for Emergent:** Clone or open the repo and treat **`solana/solanasite`** as the canonical reference implementation. If you need Worker behavior for logging, read **`solana/solanasite/cloudflare/rootrecord-primary/src/`** (e.g. `solana-site-log.ts`, `router.ts`) — do not assume both `cloudflare/` trees differ; keep changes in one place unless the maintainer syncs them.

---

## 2. v1 scope (what to ship vs omit)

Decisions for the **minimal white-label single-token launchpad** unless the operator explicitly expands scope:

| Area | v1 decision |
|------|-------------|
| **Theme / layout / wallet** | **Include** — match `app/globals.css`, `tailwind.config.ts`, `app/layout.tsx`, `components/providers/SolanaProviders.tsx`, wallet styling (`.rr-wallet-btn`). |
| **Single configured mint** | **Include** — env-driven (`NEXT_PUBLIC_LAUNCH_MINT` or equivalent); dashboard and CTAs target this mint only. |
| **Token creation (SPL + Token-2022)** | **Optional** — include if launchpad allows *deploying* a new token; omit if the product is *only* discovery + liquidity + stats for an existing mint. When included, port patterns from `lib/solana.ts`, `lib/token2022.ts`, `app/create/`. |
| **Pinata / metadata upload** | **Include** when create or metadata update is in scope — `lib/pinata.ts`, `app/api/pin/*`. |
| **Raydium CPMM** (pool create / add / remove) | **Include** for a typical launchpad — `lib/raydiumCpmmLaunch.ts`, `app/liquidity/page.tsx`. |
| **Referral memo (`?ref=`)** | **Include** — `lib/referral.ts`, `lib/referralMemo.ts`; use a **namespaced** `localStorage` key for white-label. |
| **Fees** | **Include** — same env pattern as `lib/solana.ts` (`NEXT_PUBLIC_FEE_WALLET`, fee SOL envs). |
| **Token stats dashboard** | **Include** — collapse `lib/tokenDashboard.ts` + `app/ref/[mint]/page.tsx` to the configured mint route (e.g. `/` or `/stats`). |
| **Action logging (`logSolanaSiteAction`)** | **Optional** — stub or no-op client if no backend; if Worker is deployed, preserve POST shape from `lib/actionLog.ts` → `app/api/solana-site/log/route.ts`. |
| **My Actions / challenge / account APIs** | **Omit for v1** unless logging is fully wired — see `app/api/solana-site/my-actions`, `challenge`. |
| **Bulk SOL / bulk token** | **Omit for v1** — `lib/bulkSol.ts`, `app/bulk/` (large surface; add only if product requires airdrops). |
| **Ecosystem OTC** | **Omit for v1** — `app/ecosystem/`, `app/api/ecosystem/`, `lib/ecosystemOtc*.ts`; optional later fork. |

---

## 3. Paste this prompt to Emergent

**You are building a white-label Solana launch site for exactly one token** (mint fixed via config/env). It must match the visual and UX quality of the reference implementation in this repository under `solana/solanasite` (“RootRecord Solana Tools”). You are **not** cloning every page—only the flows and patterns needed for a focused launchpad—but **theme, typography, spacing, wallet UX, transaction rigor, and fee/referral patterns must feel identical**.

### Product goal

- **Single-tenant launchpad**: one configured mint address (and optionally fixed pool / stats deep links). Branding (name, logo URL, accent tweaks within the same palette) comes from config—not hardcoded “RootRecord”.
- **Audience**: teams selling a launch experience to token creators; the site promotes **their** token, not a generic multi-tool suite.

### Design system (must match reference)

Source: `app/globals.css`, `tailwind.config.ts`, `app/layout.tsx` (under `solana/solanasite`).

- **Default dark**: page background `#06090F`, text `#E6EAF2`, `color-scheme: dark`.
- **Solana accents**: green `#14F195` (`sol.green`, primary), purple `#9945FF` (`sol.purple`, secondary). Selection highlight uses translucent green.
- **Surfaces**: ink scale (`ink.900` etc.), cards `#0A0F1A`, borders `rgba(255,255,255,0.08)`.
- **Typography**: **Inter** as sans (`--font-inter`), **Instrument Serif** as display (`--font-display`) for hero emphasis and italic highlights—same pairing as `app/layout.tsx`.
- **Hero / section atmosphere**: `.bg-aurora` triple radial gradients (green/purple/teal glows); `.grid-faint-bg` masked grid; optional `fade-in-up` animation (defined in Tailwind extend).
- **Wallet button**: pill, **green fill**, dark text—global overrides in `globals.css` under `.rr-wallet-btn` targeting `.wallet-adapter-button`; modal styled dark with rounded corners (same file).
- **Components**: shadcn-style primitives (Button, Card, Badge, Dialog, Input, Label, Tabs)—mirror spacing and radius (`borderRadius.lg` ≈ 14px).

### Tech stack (align with reference)

From `solana/solanasite/package.json`:

- Next.js 14 App Router, TypeScript, Tailwind, React Hook Form + Zod, Sonner toasts.
- `@solana/web3.js`, `@solana/spl-token`, `@metaplex-foundation/mpl-token-metadata` (v2.x in repo), `@solana/spl-token-metadata` for Token-2022 metadata extension path.
- `@solana/wallet-adapter-react` + `@solana/wallet-adapter-react-ui`; wallets: include **Jupiter** (custom adapter), **Phantom**, **Solflare**—see `components/providers/SolanaProviders.tsx` and `lib/jupiterWalletAdapter.ts` (legacy injected Jupiter extension adapter).
- Raydium CPMM: `@raydium-io/raydium-sdk-v2` for pool create / add / remove liquidity—`lib/raydiumCpmmLaunch.ts`.

### Environment and fee model (reference behavior)

Central module: `lib/solana.ts`.

- **`NEXT_PUBLIC_SOLANA_NETWORK`**: cluster (`mainnet-beta` default).
- **`NEXT_PUBLIC_RPC_URL`**: validated URL resolution (scheme optional in env; invalid falls back to public mainnet RPC)—same defensive parsing pattern.
- **Fee wallet**: `NEXT_PUBLIC_FEE_WALLET`; placeholder strings treated as unset; `feeTransferIx(payer, amountSol)` returns null if unset.
- **Configurable SOL fees** (defaults in code): `CREATE_FEE_SOL` (0.025), `ACTION_FEE_SOL` (0.01), `LAUNCH_FEE_SOL` (0.05 Raydium launch), `ADD_LIQUIDITY_FEE_SOL` / `REMOVE_LIQUIDITY_FEE_SOL` (0.005 each); bulk fee env in `lib/bulkSol.ts` (only if bulk is in scope).
- **`explorerUrl`**: Solscan links with optional cluster query.

### On-chain library: functions and responsibilities

**`lib/solana.ts`** (core SPL + Metaplex legacy):

- `getConnection()`, `RPC_URL`, network constants.
- `metadataPda(mint)` — Metaplex PDA derivation.
- **`createSplToken(wallet, input, opts?)`**: single legacy `Transaction`—create mint account, `createInitializeMint2Instruction`, create payer ATA, `mintTo` full supply, `createCreateMetadataAccountV3Instruction`, optional platform fee transfer, **referral memo** (see below), partial-sign generated mint keypair, preflight **min lamports** check (mint rent + metadata rent + ATA rent + fee + headroom) with user-facing error message.
- **`resolveMintAndProgram` / `detectMintProgram`**: distinguishes SPL vs Token-2022 by account owner; validates real mint (avoids wrong program id errors).
- **`sendSimpleTx`**, **`confirmSignatureSucceeded`**, **`assertSignatureNoProgramError`** — robust confirmation (poll signature status, surface on-chain errors)—critical for Raydium multi-tx flows.
- **Authority / supply / metadata**: `revokeMintAuthority`, `revokeFreezeAuthority`, `mintMore`, `burnTokens` (no platform fee), `updateTokenMetadata` (rejects Token-2022—directs to Token-2022 metadata path).
- **`feeTransferIx`**, `isFeeWalletConfigured`, `explorerUrl`.

**`lib/referralMemo.ts`** + **`lib/referral.ts`**:

- Referrer from `?ref=` → validated pubkey → `localStorage` (`rootrecord_referrer` key in reference; white-label should use a **namespaced** key).
- Memo program: `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`; payload prefix `RR_REF:v1:` + referrer base58; max UTF-8 length enforced; **no self-referral**.
- `appendReferralMemoIfEligible` / `appendReferralMemoToTransaction` append after fee instructions where applicable.

**`lib/token2022.ts`**:

- **`createToken2022`**: Token-2022 mint with optional extensions (transfer fee, transfer hook, non-transferable, close authority, permanent delegate, interest bearing, default frozen, metadata pointer + **on-mint TokenMetadata** via `spl-token-metadata` `createInitializeInstruction` / `pack`).
- Additional ops: withdraw/harvest withheld, update transfer fee, `readMintInfo`, program detection—for a single-token site, most post-launch tooling can be omitted unless required.

**`lib/raydiumCpmmLaunch.ts`**:

- Cluster mapping to Raydium `mainnet` / `devnet`.
- **`isCpmmPoolItem`** — type guard for CPMM pools from Raydium API.
- **`createCpmmPoolWithQuote`** — wallet-driven pool creation with quote side WSOL / USDC / custom mint; uses **`LAUNCH_FEE_SOL`** first transaction pattern; `signAllTransactions` fallback loop for wallets without batch sign; confirms and asserts success.
- **`addCpmmLiquidity`**, **`removeCpmmLiquidity`** — with **`ADD_LIQUIDITY_FEE_SOL`** / **`REMOVE_LIQUIDITY_FEE_SOL`** on first tx; referral memo hooks.
- **`fetchCpmmPoolById`**, **`mintToCpmmPick`** resolution.
- Constants: WSOL mint, USDC mint from `NEXT_PUBLIC_LAUNCH_USDC_MINT` or defaults; informational `RAYDIUM_MAINNET_CPMM_POOL_CREATE_FEE_SOL`.

**`lib/bulkSol.ts`** (only if airdrop feature explicitly required):

- Chunked legacy transactions, per-100 platform fee, referral memo on first chunk, `decimalStringToRawAmount`, caps and estimates—**large surface**; omit for minimal single-token site unless explicitly requested.

**`lib/pinata.ts`** + **API routes** `app/api/pin/status`, `file`, `json`:

- Client never holds JWT; server proxies to Pinata; `NEXT_PUBLIC_PINATA_GATEWAY` for display URLs; `isPinataConfigured()` caches status.

**`lib/schema.ts`**:

- Zod `tokenSchema` for create form; `ExtensionState` / `defaultExtensions` for Token-2022 UI—reuse validation patterns.

**`lib/utils.ts`**:

- `cn` (clsx + tailwind-merge), `shortAddr`, `formatNumber`, `parseSupply`.

**`lib/tokenDashboard.ts`**:

- Server-side `loadTokenDashboard` (React `cache`): RPC mint info, Metaplex vs Token-2022 metadata, Jupiter price API (lite + fallback), DexScreener pairs, largest holders (RPC), recent signatures—powers **token stats** experience. For a single mint, collapse to **one mint’s dashboard** page.

**`lib/siteOrigin.ts`** — canonical URLs for OG/share links.

**`lib/actionLog.ts`**:

- `logSolanaSiteAction` — fire-and-forget POST to `/api/solana-site/log` with `SiteAction` enum strings (`token_create`, liquidity events, bulk, etc.).

**Ecosystem OTC (advanced)** — `lib/ecosystemOtc*.ts`, `app/ecosystem`, `app/api/ecosystem`: treasury prep/fulfill, Jupiter USD helpers, atomic checkout—**out of scope for v1** unless the product spec demands OTC; optional fork later.

### Server / edge integration

- **`lib/solanaSiteApi.ts`**: `fetchSolanaWorker` / `fetchSolanaWorkerGet` — Bearer auth to Cloudflare Worker origin from `SOLANA_SITE_LOG_URL` + `SOLANA_SITE_LOG_SECRET`.
- **`app/api/solana-site/log/route.ts`**: validates wallet pubkey, action string, metadata size; proxies to Worker.
- Other `app/api/solana-site/*`: challenge, my-actions, ecosystem history/bot events—paired with Worker under `solana/solanasite/cloudflare/rootrecord-primary` (duplicate also at repo root `cloudflare/rootrecord-primary`).

White-label note: either **reuse the same Worker contract** (env-driven) or replace logging with a simpler backend—**preserve the client API shape** if you keep `logSolanaSiteAction`.

### Routing / UX patterns from reference

- **`middleware.ts`**: `/launch` → `/liquidity` 308 redirect (preserve query).
- **`components/Header.tsx`**: sticky blurred header, nav links, `ReferralPill`, wallet—**single-token site** should simplify nav (Home, Launch/Liquidity, Stats, Docs optional).
- **`components/ReferralCapture.tsx`**: runs on layout mount to capture `?ref=`.
- **Key pages to study for copy/structure**: `app/page.tsx` (hero, trust bar, numbered sections), `app/create/page.tsx`, `app/liquidity/page.tsx`, `app/pricing/page.tsx`, `app/ref/[mint]/page.tsx` (stats).

### Quality bar (“great processing” to preserve)

1. **Single-tx create**: rent + fee preflight with clear SOL estimate in error text.
2. **Post-send**: confirm + **`assertSignatureNoProgramError`** (or equivalent) for Raydium and tooling—not only `confirmTransaction`.
3. **Mint resolution**: never assume `TOKEN_PROGRAM_ID`; always detect SPL vs Token-2022.
4. **Memo + fee ordering**: fee ix before memo; referral memo only when referrer valid and not self.
5. **IPFS**: server-side Pinata proxy so secrets stay server-only.
6. **Accessibility of errors**: user-facing strings that distinguish “wrong address type” vs “insufficient SOL”.

### Explicit non-goals for v1 (unless product requires)

- Full **ecosystem OTC** stack.
- **Bulk SOL / bulk token** airdrop suite.
- Multi-tenant “create any token” marketplace UX—replace with **one configured mint** and flows that **buy**, **swap**, **add liquidity**, or **view stats** for that mint only.

### Configuration contract for white-label (implement as typed config / env)

- `SITE_NAME`, `PRIMARY_LOGO_URL`, `NEXT_PUBLIC_SITE_URL` (metadataBase), optional accent staying within green/purple system.
- **`NEXT_PUBLIC_LAUNCH_MINT`** (or similar)—locks dashboard/stats and hides generic mint entry where inappropriate.
- Fee wallet + fee SOL envs as in reference.
- Optional: disable Token-2022 create path if product is legacy-SPL-only.

### Files to prioritize when reading the repo

| Area | Paths (under `solana/solanasite/`) |
|------|--------|
| Theme & shell | `app/layout.tsx`, `app/globals.css`, `tailwind.config.ts`, `components/Header.tsx`, `components/Footer.tsx` |
| Wallet | `components/providers/SolanaProviders.tsx`, `components/wallet/WalletButton.tsx`, `lib/jupiterWalletAdapter.ts` |
| SPL + fees + referral | `lib/solana.ts`, `lib/referralMemo.ts`, `lib/referral.ts` |
| Token-2022 | `lib/token2022.ts`, `components/create/Token2022Section.tsx` |
| Liquidity | `lib/raydiumCpmmLaunch.ts`, `app/liquidity/page.tsx` |
| Metadata upload | `lib/pinata.ts`, `app/api/pin/*` |
| Stats | `lib/tokenDashboard.ts`, `app/ref/[mint]/page.tsx`, `components/token/*` |
| Logging | `lib/actionLog.ts`, `app/api/solana-site/log/route.ts` |

Deliver a **new repository** with README setup (env template), **no secrets committed**, and a short **operator guide** for re-branding and deploying.

---

## 4. Maintainer cross-references

- Original build brief: `Starting AI Prompt`, `memory/PRD.md` in this folder.
- Prefer a single Worker tree for edits: `solana/solanasite/cloudflare/rootrecord-primary/`.
