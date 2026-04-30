import type { D1Database } from "@cloudflare/workers-types";
import nacl from "tweetnacl";
import bs58 from "bs58";

import { json } from "./cors";

export interface SolanaSiteReadEnv {
  DB: D1Database;
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

function verifyInternalBearer(request: Request, env: SolanaSiteReadEnv): boolean {
  const secret = (env.SOLANA_SITE_LOG_SECRET || "").trim();
  if (!secret) return false;
  const auth = request.headers.get("Authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return Boolean(token && timingSafeEqualStr(token, secret));
}

function isBase58Wallet(s: string): boolean {
  if (s.length < 32 || s.length > 48) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

export function buildAuthMessage(wallet: string, nonce: string, expiresIso: string): string {
  return [
    "RootRecord Solana Tools — wallet proof for “My Actions”",
    "",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Expires (UTC): ${expiresIso}`,
    "",
    "Signing proves you control this wallet. This does not spend SOL or move funds.",
  ].join("\n");
}

function parseAuthMessage(message: string): { wallet: string; nonce: string; expiresIso: string } | null {
  const lines = message.replace(/\r\n/g, "\n").split("\n");
  let wallet: string | null = null;
  let nonce: string | null = null;
  let expiresIso: string | null = null;
  for (const line of lines) {
    if (line.startsWith("Wallet: ")) wallet = line.slice("Wallet: ".length).trim();
    else if (line.startsWith("Nonce: ")) nonce = line.slice("Nonce: ".length).trim();
    else if (line.startsWith("Expires (UTC): ")) expiresIso = line.slice("Expires (UTC): ".length).trim();
  }
  if (!wallet || !nonce || !expiresIso) return null;
  if (!/^[a-f0-9]{64}$/i.test(nonce)) return null;
  if (!isBase58Wallet(wallet)) return null;
  return { wallet, nonce, expiresIso };
}

function base64ToUint8Array(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function verifyWalletSignature(walletBase58: string, messageUtf8: string, signatureBase64: string): boolean {
  try {
    const pk = bs58.decode(walletBase58);
    if (pk.length !== 32) return false;
    const sig = base64ToUint8Array(signatureBase64);
    if (!sig || sig.length !== 64) return false;
    const msg = new TextEncoder().encode(messageUtf8);
    return nacl.sign.detached.verify(msg, sig, pk);
  } catch {
    return false;
  }
}

function randomNonceHex(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** POST /api/solana-site/challenge — issue a one-time message to sign (Next.js only; Bearer required). */
export async function handleSolanaSiteChallenge(request: Request, env: SolanaSiteReadEnv): Promise<Response> {
  if (!verifyInternalBearer(request, env)) {
    return json({ ok: false, detail: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, detail: "Invalid JSON" }, 400);
  }

  const wallet = String(body.wallet || "").trim();
  if (!isBase58Wallet(wallet)) {
    return json({ ok: false, detail: "Invalid wallet" }, 400);
  }

  const nonce = randomNonceHex();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const message = buildAuthMessage(wallet, nonce, expiresAt);

  try {
    await env.DB.prepare(
      `INSERT INTO solana_site_challenges (nonce, wallet, expires_at, consumed) VALUES (?, ?, ?, 0)`,
    )
      .bind(nonce, wallet, expiresAt)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "challenge insert failed";
    return json({ ok: false, detail: msg }, 500);
  }

  return json({ ok: true, message, expires_at: expiresAt }, 200);
}

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 100;

/** POST /api/solana-site/my-actions — list rows for wallet after signature + nonce check (Next.js only; Bearer required). */
export async function handleSolanaSiteMyActions(request: Request, env: SolanaSiteReadEnv): Promise<Response> {
  if (!verifyInternalBearer(request, env)) {
    return json({ ok: false, detail: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, detail: "Invalid JSON" }, 400);
  }

  const wallet = String(body.wallet || "").trim();
  const message = String(body.message || "");
  const signatureB64 = String(body.signature || "").trim();
  const limitRaw = body.limit != null ? Number(body.limit) : DEFAULT_LIMIT;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limitRaw)))
    : DEFAULT_LIMIT;

  if (!isBase58Wallet(wallet)) {
    return json({ ok: false, detail: "Invalid wallet" }, 400);
  }
  if (!message || message.length > 4096) {
    return json({ ok: false, detail: "Invalid message" }, 400);
  }
  if (!signatureB64 || signatureB64.length > 128) {
    return json({ ok: false, detail: "Invalid signature" }, 400);
  }

  const parsed = parseAuthMessage(message);
  if (!parsed) {
    return json({ ok: false, detail: "Message format not recognized" }, 400);
  }
  if (parsed.wallet !== wallet) {
    return json({ ok: false, detail: "Wallet mismatch" }, 400);
  }

  const expMs = Date.parse(parsed.expiresIso);
  if (!Number.isFinite(expMs) || Date.now() > expMs) {
    return json({ ok: false, detail: "Challenge expired" }, 401);
  }

  if (!verifyWalletSignature(wallet, message, signatureB64)) {
    return json({ ok: false, detail: "Invalid signature" }, 401);
  }

  try {
    const up = await env.DB.prepare(
      `UPDATE solana_site_challenges SET consumed = 1
       WHERE nonce = ? AND wallet = ? AND consumed = 0
       AND datetime(expires_at) > datetime('now')`,
    )
      .bind(parsed.nonce, wallet)
      .run();

    const changed = Number(up.meta?.changes ?? 0);
    if (!up.success || changed < 1) {
      return json({ ok: false, detail: "Challenge missing, expired, or already used" }, 401);
    }

    const siteQ = await env.DB.prepare(
      `SELECT id, created_at, wallet, action, network, route, signature, metadata
       FROM solana_site
       WHERE wallet = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
      .bind(wallet, limit)
      .all<{
        id: number;
        created_at: string;
        wallet: string;
        action: string;
        network: string | null;
        route: string | null;
        signature: string | null;
        metadata: string | null;
      }>();

    const otcQ = await env.DB.prepare(
      `SELECT payment_tx_signature, buyer, token_mint, amount_raw, pay_with, out_tx, created_at,
              liquidity_tx, quote_received_raw, tokens_whole, token_decimals
       FROM ecosystem_otc_fulfillments
       WHERE buyer = ?
       ORDER BY datetime(created_at) DESC
       LIMIT ?`,
    )
      .bind(wallet, limit)
      .all<{
        payment_tx_signature: string;
        buyer: string;
        token_mint: string;
        amount_raw: string;
        pay_with: string;
        out_tx: string | null;
        created_at: string;
        liquidity_tx: string | null;
        quote_received_raw: string | null;
        tokens_whole: string | null;
        token_decimals: string | null;
      }>();

    type MyActionRow = {
      source: "site" | "otc_purchase";
      id: number | string;
      created_at: string;
      wallet: string;
      action: string;
      network: string | null;
      route: string | null;
      signature: string | null;
      metadata: unknown;
    };

    const siteRows: MyActionRow[] = (siteQ.results || []).map((r) => ({
      source: "site",
      id: r.id,
      created_at: r.created_at,
      wallet: r.wallet,
      action: r.action,
      network: r.network,
      route: r.route,
      signature: r.signature,
      metadata: r.metadata ? safeJsonParse(r.metadata) : null,
    }));

    const otcRows: MyActionRow[] = (otcQ.results || []).map((r) => ({
      source: "otc_purchase",
      id: `otc:${r.payment_tx_signature}`,
      created_at: r.created_at,
      wallet: r.buyer,
      action: "otc_checkout",
      network: null,
      route: "/ecosystem",
      signature: r.payment_tx_signature,
      metadata: {
        kind: "otc_purchase",
        token_mint: r.token_mint,
        amount_raw: r.amount_raw,
        pay_with: r.pay_with,
        out_tx: r.out_tx,
        liquidity_tx: r.liquidity_tx,
        quote_received_raw: r.quote_received_raw,
        tokens_whole: r.tokens_whole,
        token_decimals: r.token_decimals,
      },
    }));

    const rowTimeMs = (created: string): number => {
      const s = created.trim();
      const isoLike = s.includes("T") ? s : s.replace(" ", "T");
      const withZ = isoLike.endsWith("Z") ? isoLike : `${isoLike}Z`;
      let ms = Date.parse(withZ);
      if (!Number.isFinite(ms)) ms = Date.parse(s);
      return Number.isFinite(ms) ? ms : 0;
    };

    const actions = [...siteRows, ...otcRows]
      .sort((a, b) => rowTimeMs(b.created_at) - rowTimeMs(a.created_at))
      .slice(0, limit);

    return json({ ok: true, actions }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "query failed";
    return json({ ok: false, detail: msg }, 500);
  }
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return s;
  }
}
