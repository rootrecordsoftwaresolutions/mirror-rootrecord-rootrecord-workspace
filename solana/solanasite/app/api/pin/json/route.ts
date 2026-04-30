import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PINATA_JWT = process.env.PINATA_JWT;

export async function POST(req: Request) {
  if (!PINATA_JWT) {
    return NextResponse.json(
      { error: 'Listing file hosting is not configured on this server' },
      { status: 503 },
    );
  }

  const body = (await req.json()) as {
    name?: string;
    content?: Record<string, unknown>;
  };
  if (!body?.content || typeof body.content !== 'object') {
    return NextResponse.json({ error: 'Missing content' }, { status: 400 });
  }

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pinataMetadata: {
        name: `rootrecord-${Date.now()}-${body.name || 'metadata.json'}`,
      },
      pinataContent: body.content,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Pinata upload failed: ${res.status} ${text}` },
      { status: 502 },
    );
  }

  const data = (await res.json()) as { IpfsHash: string };
  return NextResponse.json({ cid: data.IpfsHash });
}
