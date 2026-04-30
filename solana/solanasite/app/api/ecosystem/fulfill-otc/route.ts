import { NextResponse } from 'next/server';
import { z } from 'zod';

import { fulfillOtcFromTreasury } from '@/lib/ecosystemOtcFulfill';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  buyer_wallet: z.string().min(32).max(48),
  pay_with: z.enum(['SOL', 'USDC']),
  tokens_whole: z.number().finite().positive(),
  quoted_at_ms: z.number().finite(),
  quoted_sol_usd: z.number().finite().positive(),
  payment_tx_signature: z.string().min(80).max(128),
});

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, detail: 'invalid_json' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, detail: 'invalid_body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await fulfillOtcFromTreasury(parsed.data);
  if (!result.ok) {
    if ('code' in result && result.code === 'needs_ata') {
      return NextResponse.json(
        {
          ok: false,
          code: 'needs_ata',
          unsigned_tx_b64: result.unsigned_tx_b64,
          detail: result.detail,
        },
        { status: 428 },
      );
    }
    return NextResponse.json({ ok: false, detail: result.detail }, { status: result.status });
  }
  return NextResponse.json(
    {
      ok: true,
      signature: result.out_signature,
      liquidity_tx: result.liquidity_tx ?? null,
      liquidity_error: result.liquidity_error ?? null,
      liquidity_notice: result.liquidity_notice ?? null,
    },
    { status: 200 },
  );
}
