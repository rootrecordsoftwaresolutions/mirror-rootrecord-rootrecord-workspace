import { NextResponse } from 'next/server';

import { fetchJupiterSolUsdcUsd } from '@/lib/ecosystemJupUsd';

/**
 * SOL/USD for Treasury Transfer Tool calculator (Jupiter price v3, WSOL only). USDC leg uses fixed $1 = 1 USDC.
 */
export async function GET() {
  try {
    const { solUsd, usdcUsd, fetchedAt } = await fetchJupiterSolUsdcUsd();
    return NextResponse.json({
      ok: true,
      sol_usd: solUsd,
      /** Always 1 — locked USD/token notional; no Jupiter USDC fetch. */
      usdc_usd: usdcUsd,
      fetched_at: fetchedAt,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, detail: e instanceof Error ? e.message : 'price error' },
      { status: 502 },
    );
  }
}
