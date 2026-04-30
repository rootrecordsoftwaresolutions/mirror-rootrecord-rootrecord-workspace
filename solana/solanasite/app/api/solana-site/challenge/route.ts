import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

import { fetchSolanaWorker } from '@/lib/solanaSiteApi';

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const wallet = String((raw as { wallet?: string }).wallet || '').trim();
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_wallet' }, { status: 400 });
  }

  const upstream = await fetchSolanaWorker('/api/solana-site/challenge', { wallet });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
  });
}
