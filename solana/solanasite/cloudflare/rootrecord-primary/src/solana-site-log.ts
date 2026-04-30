import type { D1Database } from "@cloudflare/workers-types";

import { json } from "./cors";

export interface SolanaSiteLogEnv {
  DB: D1Database;
  /** Shared secret with Next.js (`Authorization: Bearer …`). Set via `wrangler secret put SOLANA_SITE_LOG_SECRET`. */
  SOLANA_SITE_LOG_SECRET?: string;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i]! ^ bb[i]!;
  return diff === 0;
}

function isBase58Wallet(s: string): boolean {
  if (s.length < 32 || s.length > 48) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

function isActionSlug(s: string): boolean {
  if (s.length < 2 || s.length > 96) return false;
  return /^[a-z][a-z0-9_.:-]*$/i.test(s);
}

/** POST /api/solana-site/log — ingest one user action row (Next.js server proxies with Bearer secret). */
export async function handleSolanaSiteLog(request: Request, env: SolanaSiteLogEnv): Promise<Response> {
  const secret = (env.SOLANA_SITE_LOG_SECRET || "").trim();
  if (!secret) {
    return json({ ok: false, detail: "SOLANA_SITE_LOG_SECRET is not set on this Worker." }, 503);
  }

  const auth = request.headers.get("Authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token || !timingSafeEqualStr(token, secret)) {
    return json({ ok: false, detail: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, detail: "Invalid JSON" }, 400);
  }

  const wallet = String(body.wallet || "").trim();
  const action = String(body.action || "").trim().slice(0, 96);
  const network = body.network != null ? String(body.network).trim().slice(0, 32) : null;
  const route = body.route != null ? String(body.route).trim().slice(0, 256) : null;
  const signature = body.signature != null ? String(body.signature).trim().slice(0, 128) : null;

  if (!isBase58Wallet(wallet)) {
    return json({ ok: false, detail: "Invalid wallet" }, 400);
  }
  if (!isActionSlug(action)) {
    return json({ ok: false, detail: "Invalid action" }, 400);
  }

  let metadataJson: string | null = null;
  if (body.metadata !== undefined && body.metadata !== null) {
    try {
      const s = JSON.stringify(body.metadata);
      if (s.length > 16_384) {
        return json({ ok: false, detail: "metadata too large" }, 400);
      }
      metadataJson = s;
    } catch {
      return json({ ok: false, detail: "metadata must be JSON-serializable" }, 400);
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO solana_site (wallet, action, network, route, signature, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(wallet, action, network, route, signature, metadataJson)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "insert failed";
    return json({ ok: false, detail: msg }, 500);
  }

  return json({ ok: true }, 201);
}
