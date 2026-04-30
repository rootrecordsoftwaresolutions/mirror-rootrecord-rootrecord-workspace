import type { D1Database } from "@cloudflare/workers-types";

import { json } from "./cors";

export interface SolanaSiteEcosystemEnv {
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

function assertBearer(request: Request, env: SolanaSiteEcosystemEnv): Response | null {
  const secret = (env.SOLANA_SITE_LOG_SECRET || "").trim();
  if (!secret) {
    return json({ ok: false, detail: "SOLANA_SITE_LOG_SECRET is not set on this Worker." }, 503);
  }
  const auth = request.headers.get("Authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token || !timingSafeEqualStr(token, secret)) {
    return json({ ok: false, detail: "Unauthorized" }, 401);
  }
  return null;
}

function isSlug(s: string, max: number): boolean {
  if (s.length < 1 || s.length > max) return false;
  return /^[a-z0-9][a-z0-9_.:-]*$/i.test(s);
}

export async function handleEcosystemBotEvent(
  request: Request,
  env: SolanaSiteEcosystemEnv,
): Promise<Response> {
  const deny = assertBearer(request, env);
  if (deny) return deny;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, detail: "Invalid JSON" }, 400);
  }

  const botId = String(body.bot_id || "").trim().slice(0, 64);
  const eventType = String(body.event_type || "").trim().slice(0, 96);
  if (!isSlug(botId, 64) || !isSlug(eventType, 96)) {
    return json({ ok: false, detail: "Invalid bot_id or event_type" }, 400);
  }

  const poolId = body.pool_id != null ? String(body.pool_id).trim().slice(0, 64) : null;
  const mint = body.mint != null ? String(body.mint).trim().slice(0, 64) : null;
  const txSignature = body.tx_signature != null ? String(body.tx_signature).trim().slice(0, 128) : null;
  const amountTokenRaw = body.amount_token_raw != null ? String(body.amount_token_raw).trim().slice(0, 64) : null;
  const amountQuoteRaw = body.amount_quote_raw != null ? String(body.amount_quote_raw).trim().slice(0, 64) : null;
  const quoteCurrency = body.quote_currency != null ? String(body.quote_currency).trim().slice(0, 16) : null;
  const usdEstimate = body.usd_estimate != null ? String(body.usd_estimate).trim().slice(0, 32) : null;

  let metadataJson: string | null = null;
  if (body.metadata !== undefined && body.metadata !== null) {
    try {
      const s = JSON.stringify(body.metadata);
      if (s.length > 16_384) return json({ ok: false, detail: "metadata too large" }, 400);
      metadataJson = s;
    } catch {
      return json({ ok: false, detail: "metadata must be JSON-serializable" }, 400);
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO ecosystem_bot_events
       (bot_id, event_type, pool_id, mint, tx_signature, amount_token_raw, amount_quote_raw, quote_currency, usd_estimate, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        botId,
        eventType,
        poolId,
        mint,
        txSignature,
        amountTokenRaw,
        amountQuoteRaw,
        quoteCurrency,
        usdEstimate,
        metadataJson,
      )
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "insert failed";
    return json({ ok: false, detail: msg }, 500);
  }

  return json({ ok: true }, 201);
}

export async function handleEcosystemBotEvents(request: Request, env: SolanaSiteEcosystemEnv): Promise<Response> {
  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") || "80");
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 80));

  try {
    const rows = await env.DB.prepare(
      `SELECT id, created_at, bot_id, event_type, pool_id, mint, tx_signature,
              amount_token_raw, amount_quote_raw, quote_currency, usd_estimate, metadata
       FROM ecosystem_bot_events
       ORDER BY id DESC
       LIMIT ?`,
    )
      .bind(limit)
      .all<Record<string, unknown>>();
    return json({ ok: true, events: rows.results ?? [] }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "query failed";
    return json({ ok: false, detail: msg }, 500);
  }
}

export async function handleEcosystemReinvest(request: Request, env: SolanaSiteEcosystemEnv): Promise<Response> {
  const deny = assertBearer(request, env);
  if (deny) return deny;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, detail: "Invalid JSON" }, 400);
  }

  const source = String(body.source || "").trim().slice(0, 64);
  const amountUsd = String(body.amount_usd || "").trim().slice(0, 32);
  if (!isSlug(source, 64) || !amountUsd) {
    return json({ ok: false, detail: "Invalid source or amount_usd" }, 400);
  }

  let metadataJson: string | null = null;
  if (body.metadata !== undefined && body.metadata !== null) {
    try {
      metadataJson = JSON.stringify(body.metadata);
      if (metadataJson.length > 8192) return json({ ok: false, detail: "metadata too large" }, 400);
    } catch {
      return json({ ok: false, detail: "metadata must be JSON-serializable" }, 400);
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO ecosystem_reinvest_queue (source, amount_usd, status, metadata)
       VALUES (?, ?, 'pending', ?)`,
    )
      .bind(source, amountUsd, metadataJson)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "insert failed";
    return json({ ok: false, detail: msg }, 500);
  }

  return json({ ok: true }, 201);
}

/** GET /api/solana-site/ecosystem-reinvest-pending — public queue snapshot. */
export async function handleEcosystemReinvestPending(
  request: Request,
  env: SolanaSiteEcosystemEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") || "40");
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 40));

  try {
    const rows = await env.DB.prepare(
      `SELECT id, created_at, source, amount_usd, status, metadata
       FROM ecosystem_reinvest_queue
       WHERE status = 'pending'
       ORDER BY id DESC
       LIMIT ?`,
    )
      .bind(limit)
      .all<Record<string, unknown>>();
    return json({ ok: true, rows: rows.results ?? [] }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "query failed";
    return json({ ok: false, detail: msg }, 500);
  }
}

/** POST /api/solana-site/ecosystem-otc-reserve — Bearer; insert lock before treasury transfer. */
export async function handleEcosystemOtcReserve(
  request: Request,
  env: SolanaSiteEcosystemEnv,
): Promise<Response> {
  const deny = assertBearer(request, env);
  if (deny) return deny;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, detail: "Invalid JSON" }, 400);
  }

  const payment_tx_signature = String(body.payment_tx_signature || "").trim().slice(0, 128);
  const buyer = String(body.buyer || "").trim().slice(0, 64);
  const token_mint = String(body.token_mint || "").trim().slice(0, 64);
  const amount_raw = String(body.amount_raw || "").trim().slice(0, 80);
  const pay_with = String(body.pay_with || "").trim().toUpperCase().slice(0, 8);
  const tokens_whole =
    body.tokens_whole != null ? String(body.tokens_whole).trim().slice(0, 24) : null;
  const token_decimals =
    body.token_decimals != null ? String(body.token_decimals).trim().slice(0, 3) : null;
  if (!payment_tx_signature || !buyer || !token_mint || !amount_raw) {
    return json({ ok: false, detail: "Missing required fields" }, 400);
  }
  if (pay_with !== "SOL" && pay_with !== "USDC") {
    return json({ ok: false, detail: "pay_with must be SOL or USDC" }, 400);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO ecosystem_otc_fulfillments (payment_tx_signature, buyer, token_mint, amount_raw, pay_with, out_tx, tokens_whole, token_decimals)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
      .bind(payment_tx_signature, buyer, token_mint, amount_raw, pay_with, tokens_whole, token_decimals)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "insert failed";
    if (/unique|UNIQUE|constraint/i.test(msg)) {
      return json({ ok: false, detail: "payment_tx_already_used" }, 409);
    }
    return json({ ok: false, detail: msg }, 500);
  }

  return json({ ok: true }, 201);
}

/** POST /api/solana-site/ecosystem-otc-release — Bearer; delete pending lock after failed transfer. */
export async function handleEcosystemOtcRelease(
  request: Request,
  env: SolanaSiteEcosystemEnv,
): Promise<Response> {
  const deny = assertBearer(request, env);
  if (deny) return deny;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, detail: "Invalid JSON" }, 400);
  }

  const payment_tx_signature = String(body.payment_tx_signature || "").trim().slice(0, 128);
  if (!payment_tx_signature) {
    return json({ ok: false, detail: "Missing payment_tx_signature" }, 400);
  }

  try {
    await env.DB.prepare(
      `DELETE FROM ecosystem_otc_fulfillments WHERE payment_tx_signature = ? AND out_tx IS NULL`,
    )
      .bind(payment_tx_signature)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "delete failed";
    return json({ ok: false, detail: msg }, 500);
  }

  return json({ ok: true }, 200);
}

/** POST /api/solana-site/ecosystem-otc-complete — Bearer; record outbound token transfer signature. */
export async function handleEcosystemOtcComplete(
  request: Request,
  env: SolanaSiteEcosystemEnv,
): Promise<Response> {
  const deny = assertBearer(request, env);
  if (deny) return deny;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, detail: "Invalid JSON" }, 400);
  }

  const payment_tx_signature = String(body.payment_tx_signature || "").trim().slice(0, 128);
  const out_tx = String(body.out_tx || "").trim().slice(0, 128);
  if (!payment_tx_signature || !out_tx) {
    return json({ ok: false, detail: "Missing payment_tx_signature or out_tx" }, 400);
  }

  try {
    const pending = await env.DB.prepare(
      `SELECT payment_tx_signature FROM ecosystem_otc_fulfillments WHERE payment_tx_signature = ? AND out_tx IS NULL`,
    )
      .bind(payment_tx_signature)
      .first<{ payment_tx_signature: string }>();
    if (!pending) {
      return json({ ok: false, detail: "No matching pending row" }, 409);
    }
    await env.DB.prepare(
      `UPDATE ecosystem_otc_fulfillments SET out_tx = ? WHERE payment_tx_signature = ? AND out_tx IS NULL`,
    )
      .bind(out_tx, payment_tx_signature)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "update failed";
    return json({ ok: false, detail: msg }, 500);
  }

  return json({ ok: true }, 200);
}

/** POST /api/solana-site/ecosystem-otc-liquidity-meta — Bearer; attach LP tx + quote received after finalize. */
export async function handleEcosystemOtcLiquidityMeta(
  request: Request,
  env: SolanaSiteEcosystemEnv,
): Promise<Response> {
  const deny = assertBearer(request, env);
  if (deny) return deny;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, detail: "Invalid JSON" }, 400);
  }

  const payment_tx_signature = String(body.payment_tx_signature || "").trim().slice(0, 128);
  const liquidity_tx =
    body.liquidity_tx != null && String(body.liquidity_tx).trim()
      ? String(body.liquidity_tx).trim().slice(0, 128)
      : null;
  const quote_received_raw =
    body.quote_received_raw != null ? String(body.quote_received_raw).trim().slice(0, 80) : null;
  if (!payment_tx_signature) {
    return json({ ok: false, detail: "Missing payment_tx_signature" }, 400);
  }

  try {
    await env.DB.prepare(
      `UPDATE ecosystem_otc_fulfillments SET liquidity_tx = ?, quote_received_raw = ? WHERE payment_tx_signature = ?`,
    )
      .bind(liquidity_tx, quote_received_raw, payment_tx_signature)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "update failed";
    return json({ ok: false, detail: msg }, 500);
  }

  return json({ ok: true }, 200);
}

/** GET /api/solana-site/ecosystem-otc-history — public; treasury transfer rows for site transaction list. */
export async function handleEcosystemOtcHistory(
  request: Request,
  env: SolanaSiteEcosystemEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") || "60");
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 60));

  try {
    const rows = await env.DB.prepare(
      `SELECT payment_tx_signature, buyer, token_mint, amount_raw, pay_with, out_tx, liquidity_tx, quote_received_raw, tokens_whole, token_decimals, created_at
       FROM ecosystem_otc_fulfillments
       ORDER BY datetime(created_at) DESC
       LIMIT ?`,
    )
      .bind(limit)
      .all<Record<string, unknown>>();
    return json({ ok: true, rows: rows.results ?? [] }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "query failed";
    return json({ ok: false, detail: msg }, 500);
  }
}
