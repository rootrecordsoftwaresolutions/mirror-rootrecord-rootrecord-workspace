import type { D1Database } from "@cloudflare/workers-types";

import { json } from "./cors";

import {

  b64url,

  b64urlEncodeUtf8,

  b64urlToBytes,

  hashNewAccountCredentials,

  verifyLicenseAccountPassword,

} from "../../shared/password-verify";

import { billingCheckoutAvailable } from "./billing-stripe";

import { fetchBillingSnapshot } from "../../shared/billing-state";
import { readUserAccountAccessFlags } from "./accounts";

import { getAppAssociationsForEmail } from "../../shared/app-associations";
import { grantSignupBonusOnRegistration } from "./earn-signup-bonus";



export interface AuthEnv {

  DB: D1Database;

  JWT_SECRET: string;

  /** Public site origin for Stripe redirects (wrangler [vars] SITE_URL). */

  SITE_URL?: string;

  /** Stripe secret key (wrangler secret put STRIPE_SECRET_KEY). */

  STRIPE_SECRET_KEY?: string;

  /** Recurring Price id for web checkout (wrangler [vars] STRIPE_PRICE_ID). */

  STRIPE_PRICE_ID?: string;

}



/**

 * D1 tables (same `root-record` DB):

 * - `license_accounts`: email + password_hash + salt — sole source for web/app login and signup.

 * - `user_accounts`: subscription flags and account_id mirror only; no passwords (see accounts.ts).

 * Password verification is shared with rootrecord-license (`../../shared/password-verify.ts`): multiple

 * legacy PBKDF2 shapes (SHA-256 / SHA-1, iteration counts, hex vs base64url encodings) then upgrade to canonical.

 */

const JWT_TTL_SEC = 30 * 24 * 60 * 60;



async function jwtSign(payload: Record<string, unknown>, secret: string): Promise<string> {

  const header = { alg: "HS256", typ: "JWT" };

  const h = b64urlEncodeUtf8(JSON.stringify(header));

  const p = b64urlEncodeUtf8(JSON.stringify(payload));

  const data = `${h}.${p}`;

  const enc = new TextEncoder();

  const key = await crypto.subtle.importKey(

    "raw",

    enc.encode(secret),

    { name: "HMAC", hash: "SHA-256" },

    false,

    ["sign"]

  );

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));

  return `${data}.${b64url(sig)}`;

}



export async function jwtVerifyClaims(

  token: string,

  secret: string

): Promise<{ sub: string; aid: string } | null> {

  const parts = token.split(".");

  if (parts.length !== 3) return null;

  const data = `${parts[0]}.${parts[1]}`;

  const enc = new TextEncoder();

  let sig: Uint8Array;

  try {

    sig = b64urlToBytes(parts[2]!);

  } catch {

    return null;

  }

  const key = await crypto.subtle.importKey(

    "raw",

    enc.encode(secret),

    { name: "HMAC", hash: "SHA-256" },

    false,

    ["verify"]

  );

  const ok = await crypto.subtle.verify("HMAC", key, sig, enc.encode(data));

  if (!ok) return null;

  let payload: Record<string, unknown>;

  try {

    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]!)));

  } catch {

    return null;

  }

  const exp = Number(payload.exp);

  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;

  const sub = String(payload.sub || "").trim().toLowerCase();

  const aid = String(payload.aid || "").trim();

  if (!sub || !aid) return null;

  return { sub, aid };

}



async function issueToken(secret: string, email: string, accountId: string): Promise<string> {

  const now = Math.floor(Date.now() / 1000);

  return jwtSign({ sub: email.toLowerCase(), aid: accountId, iat: now, exp: now + JWT_TTL_SEC }, secret);

}



function authSuccessJson(row: { id: string; email: string }, token: string): Record<string, unknown> {

  return {

    access_token: token,

    token,

    account_id: row.id,

    email: row.email,

    access: "full",

    reason: "none",

    valid_until: null,

    subscription_status: "none",

    proUnlocked: false,

    pro_unlocked: false,

    message: "ok",

  };

}



export function authMisconfigured(): Response {

  return json(

    {

      detail:

        "Set Worker secret JWT_SECRET (deploy.ps1 uses ROOTRECORD_PRIMARY_JWT_SECRET or .deploy-jwt).",

    },

    503

  );

}



export async function sessionFromBearer(

  env: AuthEnv,

  token: string

): Promise<{ email: string; accountId: string; account_created_at: string | null } | null> {

  if (!env.JWT_SECRET || env.JWT_SECRET.length < 16) return null;

  const claims = await jwtVerifyClaims(token, env.JWT_SECRET);

  if (!claims) return null;

  const row = await env.DB.prepare(
    "SELECT id, email, created_at FROM license_accounts WHERE id = ? AND email = ?"
  )

    .bind(claims.aid, claims.sub)

    .first<{ id: string; email: string; created_at: string | null }>();

  if (!row) return null;

  const account_created_at =
    typeof row.created_at === "string" && row.created_at.trim() ? row.created_at.trim() : null;

  return { email: row.email, accountId: row.id, account_created_at };

}



export async function authSignup(env: AuthEnv, body: Record<string, unknown>): Promise<Response> {

  if (!env.JWT_SECRET || env.JWT_SECRET.length < 16) return authMisconfigured();

  const email = String(body.email || "")

    .trim()

    .toLowerCase();

  const password = String(body.password || "");

  if (!email.includes("@") || password.length < 6) {

    return json({ detail: "Valid email and password (6+ characters) required." }, 400);

  }

  const id = crypto.randomUUID();

  let salt: string;

  let password_hash: string;

  try {

    const creds = await hashNewAccountCredentials(password);

    salt = creds.salt;

    password_hash = creds.password_hash;

  } catch (e) {

    const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);

    console.error("authSignup hash error", msg);

    return json({ detail: "Could not prepare password hash. Please try again." }, 500);

  }

  const now = new Date().toISOString();

  try {

    await env.DB.prepare(

      "INSERT INTO license_accounts (id, email, password_hash, salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"

    )

      .bind(id, email, password_hash, salt, now, now)

      .run();

  } catch (e) {

    const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);

    if (/UNIQUE constraint failed|unique constraint/i.test(msg)) {

      return json({ detail: "That email is already registered. Try signing in instead." }, 409);

    }

    console.error("authSignup insert error", msg);

    return json({ detail: "Could not save account. Please try again." }, 500);

  }

  try {
    await grantSignupBonusOnRegistration(env.DB, "user:" + email, now);
  } catch (e) {
    const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
    console.error("grantSignupBonusOnRegistration", msg);
  }

  try {

    const token = await issueToken(env.JWT_SECRET, email, id);

    return json(authSuccessJson({ id, email }, token), 200);

  } catch (e) {

    const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);

    return json({ detail: msg || "Could not issue session." }, 500);

  }

}



export async function authLogin(env: AuthEnv, body: Record<string, unknown>): Promise<Response> {

  if (!env.JWT_SECRET || env.JWT_SECRET.length < 16) return authMisconfigured();

  const email = String(body.email || "")

    .trim()

    .toLowerCase();

  const password = String(body.password || "");

  if (!email || !password) {

    return json({ detail: "Email and password required." }, 400);

  }

  const row = await env.DB.prepare(

    "SELECT id, email, password_hash, salt FROM license_accounts WHERE email = ?"

  )

    .bind(email)

    .first<{ id: string; email: string; password_hash: string; salt: string }>();

  if (!row) {

    return json({ detail: "Incorrect email or password." }, 401);

  }

  if (typeof row.password_hash !== "string" || !row.password_hash || typeof row.salt !== "string" || !row.salt) {

    return json({ detail: "Incorrect email or password." }, 401);

  }

  try {

    const v = await verifyLicenseAccountPassword(password, row.salt, row.password_hash);

    if (!v.ok) {

      return json({ detail: "Incorrect email or password." }, 401);

    }

    const now = new Date().toISOString();

    if (v.needsUpgrade) {

      await env.DB.prepare(

        "UPDATE license_accounts SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?"

      )

        .bind(v.password_hash, v.salt, now, row.id)

        .run();

    } else {

      await env.DB.prepare("UPDATE license_accounts SET updated_at = ? WHERE id = ?").bind(now, row.id).run();

    }

    const token = await issueToken(env.JWT_SECRET, row.email, row.id);

    return json(authSuccessJson(row, token), 200);

  } catch {

    return json({ detail: "Sign-in failed. Please try again." }, 500);

  }

}



export async function authMe(env: AuthEnv, token: string): Promise<Response> {

  if (!env.JWT_SECRET || env.JWT_SECRET.length < 16) return authMisconfigured();

  const sess = await sessionFromBearer(env, token);

  if (!sess) {

    return json({ detail: "Unauthorized", authenticated: false }, 401);

  }

  const billing_checkout_available = billingCheckoutAvailable(env);

  const billing = await fetchBillingSnapshot(env.DB, sess.email);
  const acct = await readUserAccountAccessFlags(env.DB, sess.email);
  const pro = Boolean(billing?.pro_unlocked) || Boolean(acct?.pro_unlocked);
  const subStatus = billing ? billing.subscription_status : "none";
  const life = Boolean(billing?.life_member) || Boolean(acct?.life_member);

  let apps: Awaited<ReturnType<typeof getAppAssociationsForEmail>>;
  try {
    apps = await getAppAssociationsForEmail(env.DB, sess.email);
  } catch {
    apps = {
      rootrecord_business_manager_windows: {
        associated: null,
        note: "Association status is temporarily unavailable.",
      },
      rootrecord_weather_manager_windows: { associated: false },
      rootrecord_weather_manager_android: { associated: false },
      signals: { mobile_push: false, saved_locations: false, weather_cache: false },
    };
  }

  return json(

    {

      authenticated: true,

      email: sess.email,

      account_id: sess.accountId,

      has_password: true,

      proUnlocked: pro,

      pro_unlocked: pro,

      life_member: life,

      lifeMember: life,

      access: { tier: pro ? "pro" : "none", reason: pro ? "paid" : "none" },

      subscription_status: subStatus,

      billing_checkout_available,

      account_created_at: sess.account_created_at,

      apps,

    },

    200

  );

}


