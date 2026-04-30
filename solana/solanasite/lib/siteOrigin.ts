import { headers } from 'next/headers';

const SITE_URL_FALLBACK = 'https://solana.rootrecord.info';

/** Origin only (scheme + host), for share links and canonical URLs on the server. */
export function getPublicSiteOrigin(): string {
  const trimmed = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (trimmed) {
    try {
      const withProto = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
      const u = new URL(withProto);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return u.origin;
      }
    } catch {
      /* fall through */
    }
  }
  try {
    const h = headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const proto = (h.get('x-forwarded-proto') ?? 'https').split(',')[0]?.trim();
    if (host) {
      return new URL(`${proto || 'https'}://${host}`).origin;
    }
  } catch {
    /* e.g. static analysis */
  }
  return new URL(SITE_URL_FALLBACK).origin;
}

export function buildTokenDashboardShareUrl(origin: string, mint: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/ref/${mint.trim()}`;
}
