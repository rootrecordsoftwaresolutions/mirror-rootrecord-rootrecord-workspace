import type { D1Database } from "@cloudflare/workers-types";

import { cors, json } from "./cors";

import { resolveUserId } from "./auth";

import { authLogin, authMe, authSignup, sessionFromBearer } from "./primary-auth";

import { createStripeSubscriptionCheckout } from "./billing-stripe";

import { handleLocations } from "./locations";

import { handlePushRoutes } from "./push";

import {

  canadaAlerts,

  dashboardBundle,

  eonetCyclones,

  eonetWildfires,

  tsunamiBulletins,

  usgsEarthquakes,

  weatherAlerts,

  weatherCurrent,

  weatherForecast,

} from "./weather";

import { lifeMemberFromLicenseData, upsertUserAccountFromLicense } from "./accounts";

import { handleSolanaSiteLog } from "./solana-site-log";

import { handleRecentTokens } from "./solana-site-recent-tokens";

import { handleSolanaSiteChallenge, handleSolanaSiteMyActions } from "./solana-site-read";

import {

  handleEcosystemBotEvent,

  handleEcosystemBotEvents,

  handleEcosystemOtcComplete,

  handleEcosystemOtcHistory,

  handleEcosystemOtcLiquidityMeta,

  handleEcosystemOtcRelease,

  handleEcosystemOtcReserve,

  handleEcosystemReinvest,

  handleEcosystemReinvestPending,

} from "./solana-site-ecosystem";



export interface Env {

  DB: D1Database;

  SITE_URL: string;

  JWT_SECRET: string;

  /** Plaintext ops secret for POST /api/internal/push-broadcast (X-RR-Push-Admin-Key). */

  RR_PUSH_ADMIN_SECRET?: string;

  /** Full Firebase service account JSON (FCM server credentials). */

  FCM_SERVICE_ACCOUNT_JSON?: string;

  FCM_PROJECT_ID?: string;

  FCM_CLIENT_EMAIL?: string;

  FCM_PRIVATE_KEY?: string;

  /** Seconds: reuse latest D1 `weather_data` row for same user + grid (default 600). */

  WEATHER_DATA_TTL_SEC?: string;

  /** Stripe restricted key or secret (`wrangler secret put STRIPE_SECRET_KEY`). */

  STRIPE_SECRET_KEY?: string;

  /** Recurring Price id for Checkout (`wrangler.toml` [vars] or dashboard). */

  STRIPE_PRICE_ID?: string;

  /** Ingest logs from solana.rootrecord.info Next.js (`wrangler secret put SOLANA_SITE_LOG_SECRET`). */

  SOLANA_SITE_LOG_SECRET?: string;

  /**
   * When set, forward GET/POST/HEAD `/api/ecosystem/*` to this Next.js origin (no trailing slash),
   * e.g. `https://solana-rootrecord-site.vercel.app`. Use if `solana.rootrecord.info` routes `/api/*`
   * through this Worker (otherwise treasury transfer prepare/finalize return 404 here).
   */
  SOLANA_TOOLS_API_FORWARD_URL?: string;

}



function apiSubpath(pathname: string): string {

  if (!pathname.startsWith("/api")) return pathname;

  const rest = pathname.slice(4);

  return rest === "" ? "/" : rest;

}



function num(q: URLSearchParams, k: string): number | null {

  const v = q.get(k);

  if (v === null || v === "") return null;

  const n = Number(v);

  return Number.isFinite(n) ? n : null;

}



/** device_id in body or X-Guest-Id (mobile). */

function licenseDeviceId(creds: { device_id?: string }, request: Request): string | null {

  const fromBody = String(creds.device_id || "").trim();

  if (fromBody) return fromBody.slice(0, 128);

  const guest = (request.headers.get("X-Guest-Id") || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);

  return guest || null;

}



export async function handleRequest(request: Request, env: Env): Promise<Response> {

  const url = new URL(request.url);

  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  const method = request.method;

  const h = cors();



  if (method === "OPTIONS") {

    return new Response(null, { status: 204, headers: h });

  }



  if (!pathname.startsWith("/api")) {

    if (method === "GET" && (pathname === "/" || pathname === "/health")) {

      let d1Ok = false;

      try {

        const r = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();

        d1Ok = r?.ok === 1;

      } catch {

        d1Ok = false;

      }

      if (pathname === "/health") {

        return json({ status: d1Ok ? "ok" : "degraded", db: d1Ok ? "ok" : "unavailable" }, 200);

      }

      return json(

        {

          ok: true,

          service: "rootrecord-primary",

          site_url: env.SITE_URL,

          d1: d1Ok ? "ok" : "unavailable",

          api: "/api",

        },

        200

      );

    }

    // /v1/* — same auth as /api/auth/* (website + desktop); no second Worker.

    if (method === "POST" && pathname === "/v1/auth/login") {

      let creds: { email?: string; password?: string; device_id?: string };

      try {

        creds = (await request.json()) as typeof creds;

      } catch {

        return json({ detail: "Invalid JSON" }, 400);

      }

      if (!licenseDeviceId(creds, request)) {

        return json({ detail: "device_id is required (or send X-Guest-Id)." }, 400);

      }

      const res = await authLogin(env, { email: creds.email || "", password: creds.password || "" });

      if (!res.ok) return res;

      const data = (await res.json()) as Record<string, unknown>;

      try {

        await upsertUserAccountFromLicense(env.DB, {

          email: String(data.email || creds.email || "").trim(),

          account_id: String(data.account_id || ""),

          pro_unlocked: Boolean(data.proUnlocked || data.pro_unlocked),

          life_member: lifeMemberFromLicenseData(data),

          extra: { source: "login", path: "/v1/auth/login" },

        });

      } catch {

        /* optional */

      }

      return json(data, 200);

    }

    if (method === "POST" && pathname === "/v1/auth/signup") {

      let creds: { email?: string; password?: string; device_id?: string };

      try {

        creds = (await request.json()) as typeof creds;

      } catch {

        return json({ detail: "Invalid JSON" }, 400);

      }

      if (!licenseDeviceId(creds, request)) {

        return json({ detail: "device_id is required (or send X-Guest-Id)." }, 400);

      }

      const res = await authSignup(env, { email: creds.email || "", password: creds.password || "" });

      if (!res.ok) return res;

      const data = (await res.json()) as Record<string, unknown>;

      try {

        await upsertUserAccountFromLicense(env.DB, {

          email: String(data.email || creds.email || "").trim(),

          account_id: String(data.account_id || ""),

          pro_unlocked: Boolean(data.proUnlocked || data.pro_unlocked),

          life_member: lifeMemberFromLicenseData(data),

          extra: { source: "signup", path: "/v1/auth/signup" },

        });

      } catch {

        /* optional */

      }

      return json(data, 200);

    }

    if (method === "GET" && pathname === "/v1/me") {

      const auth = request.headers.get("Authorization") || "";

      if (!auth.toLowerCase().startsWith("bearer ")) {

        return json({ detail: "Missing token" }, 401);

      }

      const tok = auth.slice(7).trim();

      return authMe(env, tok);

    }

    if (method === "POST" && pathname === "/v1/auth/logout") {

      return json({ ok: true }, 200);

    }

    if (method === "POST" && pathname === "/v1/billing/checkout") {

      const auth = request.headers.get("Authorization") || "";

      if (!auth.toLowerCase().startsWith("bearer ")) {

        return json({ detail: "Missing token" }, 401);

      }

      const tok = auth.slice(7).trim();

      const sess = await sessionFromBearer(env, tok);

      if (!sess) {

        return json({ detail: "Unauthorized" }, 401);

      }

      const secret = (env.STRIPE_SECRET_KEY || "").trim();

      const priceId = (env.STRIPE_PRICE_ID || "").trim();

      const siteUrl = (env.SITE_URL || "https://rootrecord.info").trim();

      if (!secret.startsWith("sk_") || !priceId.startsWith("price_")) {

        return json({ detail: "Web checkout is not configured yet." }, 503);

      }

      const checkout = await createStripeSubscriptionCheckout({

        secretKey: secret,

        priceId,

        customerEmail: sess.email,

        accountId: sess.accountId,

        siteUrl,

      });

      if (!checkout.ok) {

        return json({ detail: checkout.message }, 502);

      }

      return json({ url: checkout.url }, 200);

    }

    return json({ ok: false, error: "not_found" }, 404);

  }



  const sub = apiSubpath(pathname);

  const q = url.searchParams;



  if (method === "GET" && (pathname === "/api" || pathname === "/api/")) {

    return json({ name: "Root Record Weather Manager API", version: "1.0.0" }, 200);

  }



  if (method === "GET" && sub === "/health") {

    let d1Ok = false;

    try {

      const r = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();

      d1Ok = r?.ok === 1;

    } catch {

      d1Ok = false;

    }

    return json({ status: d1Ok ? "ok" : "degraded", db: d1Ok ? "ok" : "unavailable" }, 200);

  }

  if (method === "POST" && sub === "/solana-site/log") {

    return handleSolanaSiteLog(request, env);

  }

  if (method === "POST" && sub === "/solana-site/challenge") {

    return handleSolanaSiteChallenge(request, env);

  }

  if (method === "POST" && sub === "/solana-site/my-actions") {

    return handleSolanaSiteMyActions(request, env);

  }

  if (method === "POST" && sub === "/solana-site/ecosystem-bot-event") {

    return handleEcosystemBotEvent(request, env);

  }

  if (method === "GET" && sub === "/solana-site/ecosystem-bot-events") {

    return handleEcosystemBotEvents(request, env);

  }

  if (method === "GET" && sub === "/solana-site/recent-tokens") {

    return handleRecentTokens(request, env);

  }

  if (method === "POST" && sub === "/solana-site/ecosystem-reinvest") {

    return handleEcosystemReinvest(request, env);

  }

  if (method === "GET" && sub === "/solana-site/ecosystem-reinvest-pending") {

    return handleEcosystemReinvestPending(request, env);

  }

  if (method === "POST" && sub === "/solana-site/ecosystem-otc-reserve") {

    return handleEcosystemOtcReserve(request, env);

  }

  if (method === "POST" && sub === "/solana-site/ecosystem-otc-release") {

    return handleEcosystemOtcRelease(request, env);

  }

  if (method === "POST" && sub === "/solana-site/ecosystem-otc-complete") {

    return handleEcosystemOtcComplete(request, env);

  }

  if (method === "POST" && sub === "/solana-site/ecosystem-otc-liquidity-meta") {

    return handleEcosystemOtcLiquidityMeta(request, env);

  }

  if (method === "GET" && sub === "/solana-site/ecosystem-otc-history") {

    return handleEcosystemOtcHistory(request, env);

  }

  if (method === "POST" && sub === "/auth/login") {

    let creds: { email?: string; password?: string; device_id?: string };

    try {

      creds = (await request.json()) as typeof creds;

    } catch {

      return json({ detail: "Invalid JSON" }, 400);

    }

    const deviceId = licenseDeviceId(creds, request);

    if (!deviceId) {

      return json({ detail: "device_id is required (or send X-Guest-Id)." }, 400);

    }

    const res = await authLogin(env, { email: creds.email || "", password: creds.password || "" });

    if (!res.ok) return res;

    const data = (await res.json()) as Record<string, unknown>;

    const token = (data.access_token || data.token) as string | undefined;

    const emailOut = String(data.email || creds.email || "").trim();

    const pro = Boolean(data.proUnlocked || data.pro_unlocked);

    try {

      await upsertUserAccountFromLicense(env.DB, {

        email: emailOut,

        account_id: String(data.account_id || ""),

        pro_unlocked: pro,

        life_member: lifeMemberFromLicenseData(data),

        extra: { source: "login" },

      });

    } catch {

      /* D1 optional */

    }

    return json(

      {

        ok: true,

        token,

        email: emailOut,

        account_id: String(data.account_id || ""),

        message: (data.message as string) || "Signed in.",

        pro_unlocked: pro,

      },

      200

    );

  }



  if (method === "POST" && sub === "/auth/signup") {

    let creds: { email?: string; password?: string; device_id?: string };

    try {

      creds = (await request.json()) as typeof creds;

    } catch {

      return json({ detail: "Invalid JSON" }, 400);

    }

    const deviceId = licenseDeviceId(creds, request);

    if (!deviceId) {

      return json({ detail: "device_id is required (or send X-Guest-Id)." }, 400);

    }

    const res = await authSignup(env, { email: creds.email || "", password: creds.password || "" });

    if (!res.ok) return res;

    const data = (await res.json()) as Record<string, unknown>;

    const token = (data.access_token || data.token) as string | undefined;

    const emailOut = String(data.email || creds.email || "").trim();

    const pro = Boolean(data.proUnlocked || data.pro_unlocked);

    try {

      await upsertUserAccountFromLicense(env.DB, {

        email: emailOut,

        account_id: String(data.account_id || ""),

        pro_unlocked: pro,

        life_member: lifeMemberFromLicenseData(data),

        extra: { source: "signup" },

      });

    } catch {

      /* D1 optional */

    }

    return json(

      {

        ok: true,

        token,

        email: emailOut,

        account_id: String(data.account_id || ""),

        message: (data.message as string) || "Account created.",

        pro_unlocked: pro,

      },

      200

    );

  }



  if (method === "POST" && sub === "/auth/me") {

    const auth = request.headers.get("Authorization") || "";

    if (!auth.toLowerCase().startsWith("bearer ")) {

      return json({ detail: "Missing token" }, 401);

    }

    const token = auth.slice(7).trim();

    const res = await authMe(env, token);

    if (!res.ok) return res;

    const data = (await res.json()) as Record<string, unknown>;

    const emailMe = String(data.email || "").trim();

    const proMe = Boolean(data.proUnlocked || data.pro_unlocked);

    const sessionOk = data.authenticated === true || data.authenticated === undefined;

    if (emailMe && sessionOk) {

      try {

        await upsertUserAccountFromLicense(env.DB, {

          email: emailMe,

          account_id: String(data.account_id || ""),

          pro_unlocked: proMe,

          life_member: lifeMemberFromLicenseData(data),

          extra: {

            source: "me",

            access: data.access,

          },

        });

      } catch {

        /* D1 optional */

      }

    }

    return json(

      {

        authenticated: Boolean(data.authenticated),

        email: emailMe,

        pro_unlocked: proMe,

        access: data.access,

        raw: data,

      },

      200

    );

  }



  const pushRes = await handlePushRoutes(request, env, sub, method);

  if (pushRes) return pushRes;



  const locRes = await handleLocations(request, env, sub, method);

  if (locRes) return locRes;



  const lat = num(q, "lat");

  const lon = num(q, "lon");



  if (method === "GET" && sub === "/weather/current" && lat != null && lon != null) {

    return json(await weatherCurrent(lat, lon), 200);

  }

  if (method === "GET" && sub === "/weather/forecast" && lat != null && lon != null) {

    return json(await weatherForecast(lat, lon), 200);

  }

  if (method === "GET" && sub === "/weather/alerts" && lat != null && lon != null) {

    return json(await weatherAlerts(lat, lon), 200);

  }

  if (method === "GET" && sub === "/canada/alerts" && lat != null && lon != null) {

    const radius = num(q, "radius_km") ?? 150;

    return json(await canadaAlerts(lat, lon, radius), 200);

  }

  if (method === "GET" && sub === "/usgs/earthquakes") {

    const period = (q.get("period") || "day") as "hour" | "day" | "week" | "month";

    const minMag = num(q, "min_magnitude") ?? 0;

    const radius = num(q, "radius_miles") ?? 2000;

    return json(await usgsEarthquakes(lat, lon, radius, period, minMag), 200);

  }

  if (method === "GET" && sub === "/usgs/tsunamis") {

    return json(await tsunamiBulletins(), 200);

  }

  if (method === "GET" && sub === "/eonet/cyclones") {

    return json(await eonetCyclones(), 200);

  }

  if (method === "GET" && sub === "/eonet/wildfires") {

    return json(await eonetWildfires(), 200);

  }

  if (method === "GET" && sub === "/dashboard" && lat != null && lon != null) {

    const uidRes = await resolveUserId(request, env);

    if (uidRes instanceof Response) return uidRes;

    const refresh = ["1", "true", "yes"].includes((q.get("refresh") || "").toLowerCase());

    const rawLocId = (q.get("location_id") || "").trim();

    const locationId = rawLocId ? rawLocId.slice(0, 64) : null;

    return json(

      await dashboardBundle(env.DB, env, uidRes, lat, lon, { refresh, locationId }),

      200

    );

  }

  const ecosystemForward = (env.SOLANA_TOOLS_API_FORWARD_URL || "").trim();

  if (
    ecosystemForward &&
    sub.startsWith("/ecosystem/") &&
    (method === "GET" || method === "POST" || method === "HEAD")
  ) {
    const upstream = `${ecosystemForward.replace(/\/$/, "")}/api${sub}${url.search}`;
    const hdrs = new Headers();
    const ct = request.headers.get("Content-Type");
    if (ct) hdrs.set("Content-Type", ct);
    const auth = request.headers.get("Authorization");
    if (auth) hdrs.set("Authorization", auth);
    const init: RequestInit = {
      method,
      headers: hdrs,
      redirect: "manual",
    };
    if (method !== "GET" && method !== "HEAD") {
      init.body = await request.arrayBuffer();
    }
    try {
      const fr = await fetch(upstream, init);
      const out = new Headers(fr.headers);
      for (const [k, v] of Object.entries(cors())) {
        out.set(k, v);
      }
      return new Response(fr.body, { status: fr.status, statusText: fr.statusText, headers: out });
    } catch {
      return json({ detail: "Solana tools API forward failed (upstream unreachable)." }, 502);
    }
  }

  return json({ detail: "Not Found" }, 404);

}

