import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

const MAX_ACTION_LEN = 96;
const MAX_ROUTE_LEN = 256;
const MAX_SIG_LEN = 128;
const MAX_META_JSON = 14_000;

function validAction(s: string): boolean {
  if (s.length < 2 || s.length > MAX_ACTION_LEN) return false;
  return /^[a-z][a-z0-9_.:-]*$/i.test(s);
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const b = raw as Record<string, unknown>;
  const wallet = String(b.wallet || '').trim();
  const action = String(b.action || '').trim().slice(0, MAX_ACTION_LEN);
  const network =
    b.network != null ? String(b.network).trim().slice(0, 32) || undefined : undefined;
  const route =
    b.route != null ? String(b.route).trim().slice(0, MAX_ROUTE_LEN) || undefined : undefined;
  const signature =
    b.signature != null
      ? String(b.signature).trim().slice(0, MAX_SIG_LEN) || undefined
      : undefined;
  let metadata: Record<string, unknown> | undefined;
  if (b.metadata != null && typeof b.metadata === 'object' && !Array.isArray(b.metadata)) {
    metadata = b.metadata as Record<string, unknown>;
  }

  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_wallet' }, { status: 400 });
  }

  if (!validAction(action)) {
    return NextResponse.json({ ok: false, error: 'invalid_action' }, { status: 400 });
  }

  if (metadata) {
    try {
      const s = JSON.stringify(metadata);
      if (s.length > MAX_META_JSON) {
        return NextResponse.json({ ok: false, error: 'metadata_too_large' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_metadata' }, { status: 400 });
    }
  }

  const upstream = process.env.SOLANA_SITE_LOG_URL?.trim();
  const secret = process.env.SOLANA_SITE_LOG_SECRET?.trim();
  if (!upstream || !secret) {
    return NextResponse.json({ ok: true, skipped: true }, { status: 202 });
  }

  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        wallet,
        action,
        network,
        route,
        signature,
        metadata,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { ok: false, error: 'upstream', status: res.status, detail: text.slice(0, 200) },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'upstream_unreachable' }, { status: 502 });
  }
}
