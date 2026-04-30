import { NextResponse } from 'next/server';

import {
  isAllowedPublicMetadataUrl,
  METADATA_JSON_FETCH_MAX_BYTES,
  resolveMetadataJsonHttpUrl,
} from '@/lib/metadataOffchainSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('url')?.trim();
  if (!raw) {
    return NextResponse.json({ ok: false, error: 'Missing url' }, { status: 400 });
  }
  const httpUrl = resolveMetadataJsonHttpUrl(raw);
  if (!httpUrl || !isAllowedPublicMetadataUrl(httpUrl)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'That link type is not supported here. Use a standard https link to your listing file (for example a public IPFS gateway or arweave.net).',
      },
      { status: 400 },
    );
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  let res: Response;
  try {
    res = await fetch(httpUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { Accept: 'application/json, text/plain, */*' },
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : 'fetch failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: `Upstream returned ${res.status}` },
      { status: 502 },
    );
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > METADATA_JSON_FETCH_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'Metadata JSON response too large' }, { status: 413 });
  }

  const text = new TextDecoder().decode(buf);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: 'Response is not valid JSON' }, { status: 502 });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return NextResponse.json({ ok: false, error: 'Metadata JSON must be an object' }, { status: 502 });
  }

  return NextResponse.json(parsed);
}
