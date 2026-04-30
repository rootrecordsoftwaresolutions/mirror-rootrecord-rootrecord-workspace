import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PINATA_JWT = process.env.PINATA_JWT;

export async function POST(req: Request) {
  if (!PINATA_JWT) {
    return NextResponse.json(
      { error: 'File hosting is not configured on this server' },
      { status: 503 },
    );
  }

  const incoming = await req.formData();
  const file = incoming.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  // Hard cap at 5 MB to mirror the client-side dropzone limit.
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }

  const fd = new FormData();
  fd.append('file', file, file.name);
  fd.append(
    'pinataMetadata',
    JSON.stringify({ name: `rootrecord-${Date.now()}-${file.name}` }),
  );

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: fd,
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
