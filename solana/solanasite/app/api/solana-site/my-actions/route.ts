import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

import { fetchSolanaWorker } from '@/lib/solanaSiteApi';

const MAX_MSG = 4096;
const MAX_SIG_B64 = 200;

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const b = raw as {
    wallet?: string;
    message?: string;
    signature?: string;
    limit?: number;
  };

  const wallet = String(b.wallet || '').trim();
  const message = String(b.message || '');
  const signature = String(b.signature || '').trim();
  const limit = b.limit != null ? Number(b.limit) : undefined;

  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_wallet' }, { status: 400 });
  }

  if (!message || message.length > MAX_MSG) {
    return NextResponse.json({ ok: false, error: 'invalid_message' }, { status: 400 });
  }
  if (!signature || signature.length > MAX_SIG_B64) {
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 400 });
  }

  const upstream = await fetchSolanaWorker('/api/solana-site/my-actions', {
    wallet,
    message,
    signature,
    ...(Number.isFinite(limit) ? { limit } : {}),
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
  });
}
