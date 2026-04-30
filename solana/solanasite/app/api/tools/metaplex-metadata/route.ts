import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { Metadata as MetaplexMetadata } from '@metaplex-foundation/mpl-token-metadata';

import { getConnection, metadataPda } from '@/lib/solana';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const mint = new URL(req.url).searchParams.get('mint')?.trim();
  if (!mint) {
    return NextResponse.json({ ok: false, error: 'Missing mint' }, { status: 400 });
  }
  let pk: PublicKey;
  try {
    pk = new PublicKey(mint);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid mint' }, { status: 400 });
  }
  try {
    const connection = getConnection();
    const meta = await MetaplexMetadata.fromAccountAddress(
      connection,
      metadataPda(pk),
      'confirmed',
    );
    const { name, symbol, uri } = meta.data;
    return NextResponse.json({
      ok: true,
      name: name.replace(/\0/g, '').trim(),
      symbol: symbol.replace(/\0/g, '').trim(),
      uri: uri.replace(/\0/g, '').trim(),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'No listing metadata found for this mint on this network' },
      { status: 404 },
    );
  }
}
