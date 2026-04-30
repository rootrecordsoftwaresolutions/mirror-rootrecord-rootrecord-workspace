import { NextResponse } from 'next/server';
import { z } from 'zod';

import { prepareOtcAtomicCheckout } from '@/lib/ecosystemOtcAtomicCheckout';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  buyer_wallet: z.string().min(32).max(48),
  pay_with: z.enum(['SOL', 'USDC']),
  tokens_whole: z.number().finite().positive(),
  quoted_at_ms: z.number().finite(),
  quoted_sol_usd: z.number().finite().positive(),
  memo_utf8: z.string().max(566).optional(),
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

  const result = await prepareOtcAtomicCheckout(parsed.data);
  if (result.ok) {
    return NextResponse.json({ ok: true, checkout_tx_b64: result.checkout_tx_b64 }, { status: 200 });
  }
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
