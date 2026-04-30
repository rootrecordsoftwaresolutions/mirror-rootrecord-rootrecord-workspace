/** Treasury Transfer Tool output mint (same default as ecosystem page). */
export const ECOSYSTEM_OTC_TOKEN_MINT =
  process.env.NEXT_PUBLIC_ECOSYSTEM_TOKEN_MINT?.trim() ||
  '6KfGKe13ASrV5WHvChbapQXxxEFRNqwpwrdEVsX6RQMT';

/** Metaplex listing symbol for the ecosystem mint — keep in sync with on-chain metadata. */
export const ECOSYSTEM_LISTING_SYMBOL = 'RRTT';

/** Metaplex listing name for the ecosystem mint — keep in sync with on-chain metadata. */
export const ECOSYSTEM_LISTING_NAME = 'Root Record Treasury Token';

/** Raydium CPMM pool state (Solscan account). */
export const ECOSYSTEM_SOLSCAN_CPMM_POOL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_CPMM_POOL_ID?.trim() ||
  'CJPypGffPA7xf9rPy7HhuLQSx7FZUpYgrSXYMuiTHuJr';

/** Treasury wallet shown on ecosystem / tokenomics (Solscan). */
export const ECOSYSTEM_SOLSCAN_TREASURY =
  process.env.NEXT_PUBLIC_ECOSYSTEM_SOLSCAN_TREASURY?.trim() ||
  '3QG6gVk3fdimzQaKX9zf7J6kCs5DRLKg1RNea3VBosDJ';

/** Developer / operations wallet (Solscan). */
export const ECOSYSTEM_SOLSCAN_DEVELOPER =
  process.env.NEXT_PUBLIC_ECOSYSTEM_SOLSCAN_DEVELOPER?.trim() ||
  'HCeCfMAAZeFUaBQrzC2t84myrBnvnb3h8M26k4urv2X1';

export const solscanAccount = (pubkey: string) =>
  `https://solscan.io/account/${pubkey.trim()}`;

export const solscanToken = (mint: string) => `https://solscan.io/token/${mint.trim()}`;

export const OTC_USD_PER_TOKEN = 0.00001;

const QUOTE_RETAIN_BPS_MAX = 9_999;

/**
 * Basis points of received SOL/USDC kept in treasury (not sent to CPMM add-liquidity).
 * Default 100 = 1% for transfer fees and later LP adds. Override with ECOSYSTEM_OTC_QUOTE_RETAIN_BPS.
 */
export function ecosystemOtcQuoteRetainBps(): number {
  const raw =
    process.env.ECOSYSTEM_OTC_QUOTE_RETAIN_BPS?.trim() ||
    process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_QUOTE_RETAIN_BPS?.trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > QUOTE_RETAIN_BPS_MAX) return 100;
  return Math.trunc(n);
}

/** e.g. "1%" or "0.75%" for UI copy. */
export function ecosystemOtcQuoteRetainPercentLabel(): string {
  const b = ecosystemOtcQuoteRetainBps();
  if (b % 100 === 0) return `${b / 100}%`;
  return `${(b / 100).toFixed(2)}%`;
}

/** Lamports or micro-USDC to deposit into CPMM after applying ecosystemOtcQuoteRetainBps. */
export function ecosystemOtcQuoteAmountForLpDeposit(raw: bigint): bigint {
  if (raw <= 0n) return 0n;
  const retain = BigInt(ecosystemOtcQuoteRetainBps());
  const depositBps = 10_000n - retain;
  return (raw * depositBps) / 10_000n;
}

export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const DEVNET_USDC_DEFAULT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEGERXfW9vpM8Xo';

/** USDC mint for treasury transfer payment verification and pool matching (aligns with launch tool env). */
export function ecosystemOtcUsdcMint(): string {
  const trimmed = process.env.NEXT_PUBLIC_LAUNCH_USDC_MINT?.trim();
  if (trimmed) return trimmed;
  const net = process.env.NEXT_PUBLIC_SOLANA_NETWORK?.trim() || 'mainnet-beta';
  return net === 'devnet' ? DEVNET_USDC_DEFAULT : USDC_MINT;
}

/** End of pause window (ms): after this instant, USDC treasury transfer payments auto-deposit into CPMM. Default end of April 30, 2026 UTC. */
function ecosystemOtcUsdcLpResumeAtMs(): number {
  const iso =
    process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_USDC_LP_RESUME_ISO?.trim() ||
    process.env.ECOSYSTEM_OTC_USDC_LP_RESUME_ISO?.trim();
  if (iso) {
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) return t;
  }
  return Date.UTC(2026, 3, 30, 23, 59, 59, 999);
}

/** When false, USDC received from treasury transfers stays in treasury for initial seed; SOL auto-LP unchanged. */
export function ecosystemOtcUsdcAutoLpEnabled(): boolean {
  return Date.now() > ecosystemOtcUsdcLpResumeAtMs();
}

/** Human-readable resume target for UI copy. */
export function ecosystemOtcUsdcLpResumeLabel(): string {
  const custom = process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_USDC_LP_RESUME_LABEL?.trim();
  if (custom) return custom;
  const iso =
    process.env.NEXT_PUBLIC_ECOSYSTEM_OTC_USDC_LP_RESUME_ISO?.trim() ||
    process.env.ECOSYSTEM_OTC_USDC_LP_RESUME_ISO?.trim();
  if (iso) {
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) {
      return new Date(t).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
    }
  }
  return 'April 30, 2026 (UTC)';
}
