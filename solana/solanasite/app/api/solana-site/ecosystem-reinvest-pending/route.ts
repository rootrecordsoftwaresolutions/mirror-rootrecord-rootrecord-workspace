import { NextResponse } from 'next/server';

import { fetchSolanaWorkerGet } from '@/lib/solanaSiteApi';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const limit = u.searchParams.get('limit') || '40';
  const upstream = await fetchSolanaWorkerGet(
    `/api/solana-site/ecosystem-reinvest-pending?limit=${encodeURIComponent(limit)}`,
  );
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
  });
}
