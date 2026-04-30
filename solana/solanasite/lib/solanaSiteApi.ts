/**
 * Proxy to rootrecord-primary Worker for solana-site routes.
 * Uses the same origin as `SOLANA_SITE_LOG_URL` and `SOLANA_SITE_LOG_SECRET`.
 */

export function solanaWorkerOrigin(): string | null {
  const log = process.env.SOLANA_SITE_LOG_URL?.trim();
  if (!log) return null;
  try {
    return new URL(log).origin;
  } catch {
    return null;
  }
}

export function solanaWorkerSecret(): string | undefined {
  const s = process.env.SOLANA_SITE_LOG_SECRET?.trim();
  return s || undefined;
}

/** POST JSON to Worker path (e.g. `/api/solana-site/challenge`) with Bearer secret. */
export async function fetchSolanaWorker(
  path: string,
  jsonBody: unknown,
): Promise<Response> {
  const origin = solanaWorkerOrigin();
  const secret = solanaWorkerSecret();
  if (!origin || !secret) {
    const missing: string[] = [];
    if (!origin) missing.push('SOLANA_SITE_LOG_URL');
    if (!secret) missing.push('SOLANA_SITE_LOG_SECRET');
    return new Response(
      JSON.stringify({
        ok: false,
        skipped: true,
        detail: `Server env not set: ${missing.join(', ')}. Use the Worker log URL origin and the same Bearer secret as on the Worker (see .env.example).`,
      }),
      {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }
  const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(jsonBody),
  });
}

/** GET from Worker (public solana-site reads; no Bearer). */
export async function fetchSolanaWorkerGet(path: string): Promise<Response> {
  const origin = solanaWorkerOrigin();
  if (!origin) {
    return new Response(
      JSON.stringify({
        ok: false,
        skipped: true,
        detail: 'SOLANA_SITE_LOG_URL is not set (needed for Worker origin).',
      }),
      {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }
  const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
}
