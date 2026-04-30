import { WSOL_MINT } from '@/lib/ecosystemOtcConstants';

export type JupiterUsdMark = {
  /** SOL / USD from Jupiter (only external mark we need). */
  solUsd: number;
  /**
   * Fixed at 1 for treasury transfer math: notion is locked in USD per token; USDC leg uses $1 = 1 USDC.
   * Not fetched from Jupiter.
   */
  usdcUsd: number;
  fetchedAt: number;
};

/** Jupiter Price API v3 — SOL USD only (WSOL). USDC is assumed $1 for locked USD/token pricing. */
export async function fetchJupiterSolUsdcUsd(): Promise<JupiterUsdMark> {
  const url = `https://lite-api.jup.ag/price/v3?ids=${WSOL_MINT}`;
  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`Jupiter price HTTP ${r.status}`);
  }
  const j = (await r.json()) as Record<string, { usdPrice?: number } | undefined>;
  const sol = j[WSOL_MINT]?.usdPrice;
  if (!Number.isFinite(sol) || sol == null || sol <= 0) {
    throw new Error('Invalid SOL USD mark');
  }
  return {
    solUsd: sol,
    usdcUsd: 1,
    fetchedAt: Date.now(),
  };
}
