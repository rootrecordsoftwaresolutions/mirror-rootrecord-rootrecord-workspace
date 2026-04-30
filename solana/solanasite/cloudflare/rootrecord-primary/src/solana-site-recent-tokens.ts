import type { D1Database } from "@cloudflare/workers-types";

import { json } from "./cors";

export interface RecentTokensEnv {
  DB: D1Database;
}

function isValidMint(s: string): boolean {
  if (s.length < 32 || s.length > 48) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

export type RecentTokenRow = {
  mint: string;
  name: string | null;
  symbol: string | null;
  token2022: boolean;
  created_at: string;
  wallet: string;
};

/**
 * GET /api/solana-site/recent-tokens?limit=60
 * Public: rows from `solana_site` where action = token_create, deduped by mint (newest first).
 */
export async function handleRecentTokens(request: Request, env: RecentTokensEnv): Promise<Response> {
  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") || "60");
  const outLimit = Math.min(100, Math.max(1, Math.floor(Number.isFinite(limitRaw) ? limitRaw : 60)));
  const scan = Math.min(800, outLimit * 8);

  try {
    const rows = await env.DB.prepare(
      `SELECT id, created_at, wallet, metadata
       FROM solana_site
       WHERE action = 'token_create' AND metadata IS NOT NULL AND metadata != ''
       ORDER BY id DESC
       LIMIT ?`,
    )
      .bind(scan)
      .all<{ id: number; created_at: string; wallet: string; metadata: string }>();

    const seen = new Set<string>();
    const tokens: RecentTokenRow[] = [];

    for (const row of rows.results ?? []) {
      let meta: Record<string, unknown>;
      try {
        meta = JSON.parse(row.metadata) as Record<string, unknown>;
      } catch {
        continue;
      }
      const mint = String(meta.mint ?? "").trim();
      if (!isValidMint(mint)) continue;
      if (seen.has(mint)) continue;
      seen.add(mint);

      const name = meta.name != null ? String(meta.name).slice(0, 128) : null;
      const symbol = meta.symbol != null ? String(meta.symbol).slice(0, 32) : null;

      tokens.push({
        mint,
        name: name || null,
        symbol: symbol || null,
        token2022: Boolean(meta.token2022),
        created_at: row.created_at,
        wallet: row.wallet,
      });
      if (tokens.length >= outLimit) break;
    }

    return json({ ok: true, tokens }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "query failed";
    return json({ ok: false, detail: msg }, 500);
  }
}
