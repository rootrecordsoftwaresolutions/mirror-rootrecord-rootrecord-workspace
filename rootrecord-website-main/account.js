(function () {
  const TOKEN_KEY = "rootrecord_portal_token";
  const DEVICE_KEY = "rootrecord_portal_device_id";
  /** Matches Weather Manager Android earn attribution (summary balance is account-wide). */
  const BETA_EARN_APP_ID = "rootrecord_weather_manager_android";
  /** When "1", header nav hides Billing (lifetime members). Cleared on logout / 401. */
  const LIFETIME_NAV_KEY = "rootrecord_portal_lifetime_nav";
  /** Lifetime license checkout (payment link from dashboard). */
  const STRIPE_LIFETIME_CHECKOUT_URL = "https://buy.stripe.com/bJe3cvgZv5xj8ZecJ15gc05";

  function notifyPortalAuthChange() {
    try {
      window.dispatchEvent(new CustomEvent("rootrecord-portal-auth-change"));
    } catch {
      /* ignore */
    }
  }

  function notifyLifetimeNavChange() {
    try {
      window.dispatchEvent(new CustomEvent("rootrecord-portal-lifetime-nav-change"));
    } catch {
      /* ignore */
    }
  }

  function syncPortalLifetimeNav(data) {
    if (!data || typeof data !== "object") {
      localStorage.removeItem(LIFETIME_NAV_KEY);
    } else if (data.life_member || data.lifeMember) {
      localStorage.setItem(LIFETIME_NAV_KEY, "1");
    } else {
      localStorage.removeItem(LIFETIME_NAV_KEY);
    }
    notifyLifetimeNavChange();
  }

  function el(id) {
    return document.getElementById(id);
  }

  function pageMode() {
    return (document.body && document.body.getAttribute("data-account-page")) || "login";
  }

  function hexDeviceId() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function getOrCreateDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (id && id.length >= 8 && id.length <= 128) return id;
    id = hexDeviceId();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  }

  function setStatus(msg, kind) {
    const s = el("status");
    if (!s) return;
    s.textContent = msg || "";
    s.className = "status" + (kind ? " status-" + kind : "");
  }

  let apiBase = "";
  let stripePricingTableId = "";
  let stripePublishableKey = "";
  let stripeCustomerPortalUrl = "";

  function looksTechnicalMessage(s) {
    return /[`{}[\]]|STRIPE_|WORKER|LICENSE_|\/v1\/|INTERNAL|D1\b|Cloudflare|ROOTRECORD_|Bearer |webhook|price_id|secret_key|operator\b|site-config/i.test(
      s
    );
  }

  function friendlyFromApiError(j) {
    if (!j || typeof j !== "object") return "";
    const detail = typeof j.detail === "string" ? j.detail.trim() : "";
    if (detail && detail.length < 400 && !looksTechnicalMessage(detail)) return detail;
    const topMsg = typeof j.message === "string" ? j.message.trim() : "";
    if (topMsg && topMsg.length < 400 && !looksTechnicalMessage(topMsg)) return topMsg;
    const msg =
      j.error && typeof j.error.message === "string"
        ? j.error.message.trim()
        : typeof j.error === "string"
          ? j.error.trim()
          : "";
    if (msg && msg.length < 400 && !looksTechnicalMessage(msg)) return msg;
    return "";
  }

  async function loadConfig() {
    const res = await fetch("/api/site-config", { cache: "no-store" });
    if (!res.ok) throw new Error("config");
    const j = await res.json();
    apiBase = typeof j.apiBase === "string" ? j.apiBase.replace(/\/+$/, "") : "";
    stripePricingTableId = typeof j.stripePricingTableId === "string" ? j.stripePricingTableId.trim() : "";
    stripePublishableKey = typeof j.stripePublishableKey === "string" ? j.stripePublishableKey.trim() : "";
    stripeCustomerPortalUrl =
      typeof j.stripeCustomerPortalUrl === "string" ? j.stripeCustomerPortalUrl.trim() : "";
    if (!apiBase) {
      setStatus("Account sign-in is not available on this copy of the site yet. Please try again later.", "warn");
    }
  }

  function apiUrl(path) {
    return apiBase + path;
  }

  async function apiFetch(path, opts) {
    if (!apiBase) {
      return new Response(JSON.stringify({ error: { message: "Service unavailable." } }), {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    const headers = new Headers(opts?.headers);
    if (!headers.has("Content-Type") && opts?.body) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(apiUrl(path), { ...opts, headers });
  }

  function showPanel(name) {
    ["panel-loading", "panel-forms", "panel-account"].forEach((id) => {
      const n = el(id);
      if (n) n.hidden = id !== name;
    });
  }

  function showBillingPanel(name) {
    const map = { loading: "panel-billing-loading", guest: "panel-billing-guest", main: "panel-billing-main" };
    const target = map[name];
    ["panel-billing-loading", "panel-billing-guest", "panel-billing-main"].forEach((id) => {
      const n = el(id);
      if (n) n.hidden = id !== target;
    });
  }

  function showMyAppsPanel(name) {
    const map = { loading: "panel-myapps-loading", guest: "panel-myapps-guest", main: "panel-myapps-main" };
    const target = map[name];
    ["panel-myapps-loading", "panel-myapps-guest", "panel-myapps-main"].forEach((id) => {
      const n = el(id);
      if (n) n.hidden = id !== target;
    });
  }

  function showDevNoticePanel(name) {
    const map = { loading: "panel-devnotice-loading", guest: "panel-devnotice-guest", main: "panel-devnotice-main" };
    const target = map[name];
    ["panel-devnotice-loading", "panel-devnotice-guest", "panel-devnotice-main"].forEach((id) => {
      const n = el(id);
      if (n) n.hidden = id !== target;
    });
  }

  function planLabelFromMe(data) {
    if (data.life_member || data.lifeMember) return "Lifetime";
    const v = String(data.subscription_status || "").toLowerCase();
    if (v === "active") return "Active";
    if (v === "past_due") return "Past due";
    if (v === "canceled") return "Canceled";
    if (v === "trialing" || v === "trial") return "Trial";
    if (v === "none" || !v) {
      if (data.pro_unlocked || data.proUnlocked) return "Pro";
      return "Free";
    }
    return String(data.subscription_status || "—");
  }

  function subscriptionAccountValueHtml(data) {
    if (data.life_member || data.lifeMember) return escapeHtml(planLabelFromMe(data));
    const v = String(data.subscription_status || "").toLowerCase();
    if (v === "none" || !v) {
      if (data.pro_unlocked || data.proUnlocked) return escapeHtml(planLabelFromMe(data));
      return (
        escapeHtml("Free") +
        ' — <a href="/billing.html" style="color:var(--moss);text-decoration:underline;text-underline-offset:3px">Become a Member</a>'
      );
    }
    return escapeHtml(planLabelFromMe(data));
  }

  function mountBillingPricingTable(data) {
    const wrap = el("billing-pricing-table-wrap");
    if (!wrap) return;
    // Only lifetime members skip the table (no paid upgrade path). Everyone else
    // sees the Stripe embed for compare / change / add products your Dashboard allows.
    if (data.life_member || data.lifeMember) {
      wrap.hidden = true;
      wrap.innerHTML = "";
      return;
    }
    if (!stripePricingTableId || !stripePublishableKey) {
      wrap.hidden = true;
      wrap.innerHTML = "";
      return;
    }
    const email = String(data.email || "").trim();
    const ref = String(data.account_id || "").trim();
    wrap.hidden = false;
    wrap.innerHTML = "";
    function insert() {
      const pt = document.createElement("stripe-pricing-table");
      pt.setAttribute("pricing-table-id", stripePricingTableId);
      pt.setAttribute("publishable-key", stripePublishableKey);
      if (email) pt.setAttribute("customer-email", email);
      if (ref) pt.setAttribute("client-reference-id", ref);
      wrap.appendChild(pt);
    }
    if (window.customElements && customElements.get("stripe-pricing-table")) {
      insert();
    } else if (window.customElements) {
      customElements.whenDefined("stripe-pricing-table").then(insert).catch(function () {
        wrap.innerHTML =
          "<p class=note>Plan checkout could not load. Refresh the page and try again.</p>";
      });
    } else {
      insert();
    }
  }

  function formatAccountCreatedAt(data) {
    const raw = String(data.account_created_at || data.accountCreatedAt || "").trim();
    if (!raw) return "—";
    const t = Date.parse(raw);
    if (Number.isNaN(t)) return raw;
    try {
      return new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return raw;
    }
  }

  async function fetchBetaTesterRewardsSummary(token) {
    try {
      const res = await apiFetch(
        "/api/earn/summary?app_id=" + encodeURIComponent(BETA_EARN_APP_ID),
        { headers: { Authorization: "Bearer " + token } }
      );
      if (!res.ok) return null;
      const j = await res.json();
      if (j && typeof j === "object") {
        const n = Number(j.balance);
        if (Number.isFinite(n)) {
          return { ...j, balance: n };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  function betaTesterRewardsValueHtml(earn) {
    const a =
      ' <a href="/beta-tester-rewards.html" style="color:var(--moss);text-decoration:underline;text-underline-offset:3px">Learn more</a>';
    if (!earn) {
      return escapeHtml("—") + a;
    }
    const n = Number(earn.balance);
    const b = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    return (
      '<strong class="rewards-balance" data-testid="account-rewards-balance">' +
      escapeHtml(String(b.toLocaleString())) +
      "</strong>" +
      a
    );
  }

  function renderAccount(data, earn) {
    const box = el("account-details");
    if (!box) return;
    const rows = [
      ["Email", escapeHtml(String(data.email || "—"))],
      ["Your RootRecord ID", escapeHtml(String(data.account_id || "—"))],
      ["Account created", escapeHtml(formatAccountCreatedAt(data))],
      ["Subscription", subscriptionAccountValueHtml(data)],
      ["Password on file", escapeHtml(data.has_password ? "Yes" : "No")],
      ["Beta tester rewards", betaTesterRewardsValueHtml(earn)],
    ];
    box.innerHTML = rows
      .map(
        ([k, v]) =>
          "<div class=account-row><span class=account-k>" +
          escapeHtml(k) +
          "</span><span class=account-v>" +
          v +
          "</span></div>"
      )
      .join("");
  }

  function renderMyApps(data) {
    const box = el("my-apps-list");
    if (!box) return;
    const apps = data.apps || {};
    const bmw = apps.rootrecord_business_manager_windows || {};
    const wwx = apps.rootrecord_weather_manager_windows || {};
    const wma = apps.rootrecord_weather_manager_android || {};
    const sig = apps.signals || {};
    const rows = [
      {
        title: "RootRecord Business Manager",
        platform: "Windows",
        href: "/rootrecord-business-manager.html",
        statusLabel: bmw.associated === null ? "Not detected online" : bmw.associated ? "Linked" : "Not linked",
        statusKind: bmw.associated === null ? "muted" : bmw.associated ? "ok" : "no",
        note:
          typeof bmw.note === "string" && bmw.note.trim()
            ? bmw.note.trim()
            : "We do not receive install reports from this app. Your subscription still applies when you sign in there with this account.",
      },
      {
        title: "Root Record Weather Manager",
        platform: "Windows",
        href: "/rootrecord-weather-manager.html",
        statusLabel: wwx.associated ? "Linked" : "Not linked",
        statusKind: wwx.associated ? "ok" : "no",
        note: wwx.associated
          ? "Saved locations or synced weather history found for this account."
          : "No saved locations or synced weather history found for this account yet.",
      },
      {
        title: "Root Record Weather Manager",
        platform: "Android",
        href: "/rootrecord-weather-manager.html",
        statusLabel: wma.associated ? "Linked" : "Not linked",
        statusKind: wma.associated ? "ok" : "no",
        note: wma.associated
          ? "A mobile notification registration exists for this account."
          : "No mobile notification registration found for this account yet.",
      },
    ];
    const detailParts = [];
    if (sig.mobile_push) detailParts.push("mobile notifications");
    if (sig.saved_locations) detailParts.push("saved locations");
    if (sig.weather_cache) detailParts.push("weather cache rows");
    const detail =
      detailParts.length > 0
        ? "Server signals: " + detailParts.join(", ") + "."
        : "No Weather Manager server signals yet for this account.";
    box.innerHTML =
      rows
        .map(
          (r) =>
            '<article class="my-apps-card" data-testid="my-app-card">' +
            '<div class="my-apps-card-head">' +
            '<h3 class="my-apps-card-title">' +
            escapeHtml(r.title) +
            '</h3><span class="my-apps-platform">' +
            escapeHtml(r.platform) +
            '</span></div><p class="my-apps-status my-apps-status-' +
            escapeHtml(r.statusKind) +
            '"><strong>' +
            escapeHtml(r.statusLabel) +
            "</strong></p><p class=\"note my-apps-note\">" +
            escapeHtml(r.note) +
            '</p><p class="my-apps-card-actions"><a class="btn btn-secondary" href="' +
            escapeHtml(r.href) +
            '">Product page</a></p></article>'
        )
        .join("") +
      '<p class="note" style="margin-top:1.25rem">' +
      escapeHtml(detail) +
      "</p>";
  }

  async function refreshMyApps() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      syncPortalLifetimeNav(null);
      showMyAppsPanel("guest");
      return;
    }
    if (!apiBase) {
      showMyAppsPanel("guest");
      return;
    }
    showMyAppsPanel("loading");
    setStatus("");
    const res = await apiFetch("/v1/me", {
      headers: { Authorization: "Bearer " + token },
    });
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      syncPortalLifetimeNav(null);
      notifyPortalAuthChange();
      showMyAppsPanel("guest");
      setStatus("Your session ended. Please sign in again.", "warn");
      return;
    }
    if (!res.ok) {
      showMyAppsPanel("guest");
      setStatus("We could not load your apps. Please try again in a moment.", "err");
      return;
    }
    const data = await res.json();
    renderMyApps(data);
    syncPortalLifetimeNav(data);
    showMyAppsPanel("main");
  }

  function renderDevNoticeSignedIn(data) {
    const p = el("dev-notice-signed-in");
    if (!p) return;
    const em = String(data.email || "").trim();
    if (em) {
      p.hidden = false;
      p.textContent = "Signed in as " + em + ".";
    } else {
      p.hidden = true;
      p.textContent = "";
    }
  }

  async function refreshDevNotice() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      syncPortalLifetimeNav(null);
      showDevNoticePanel("guest");
      return;
    }
    if (!apiBase) {
      showDevNoticePanel("guest");
      return;
    }
    showDevNoticePanel("loading");
    setStatus("");
    const res = await apiFetch("/v1/me", {
      headers: { Authorization: "Bearer " + token },
    });
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      syncPortalLifetimeNav(null);
      notifyPortalAuthChange();
      showDevNoticePanel("guest");
      setStatus("Your session ended. Please sign in again.", "warn");
      return;
    }
    if (!res.ok) {
      showDevNoticePanel("guest");
      setStatus("We could not verify your session. Please try again in a moment.", "err");
      return;
    }
    const data = await res.json();
    renderDevNoticeSignedIn(data);
    syncPortalLifetimeNav(data);
    showDevNoticePanel("main");
  }

  function renderBillingSummary(data) {
    const box = el("billing-summary");
    if (!box) return;
    const plan = escapeHtml(planLabelFromMe(data));
    let html = '<p class="note" style="margin-top:0">Current plan: <strong>' + plan + "</strong></p>";
    if (data.life_member || data.lifeMember) {
      html +=
        '<p class="note" style="margin-top:0.75rem">Lifetime access is on this account. Nothing renews; keep using the apps you’ve installed.</p>';
    }
    box.innerHTML = html;

    const portalWrap = el("billing-portal-wrap");
    const portalLink = el("billing-portal-link");
    if (portalWrap && portalLink) {
      portalWrap.hidden = true;
      const isFree = planLabelFromMe(data) === "Free";
      const raw = String(stripeCustomerPortalUrl || "").trim();
      if (!isFree && raw) {
        try {
          const u = new URL(raw);
          if (u.protocol === "https:" && /\.stripe\.com$/i.test(u.hostname)) {
            portalLink.href = u.toString();
            portalWrap.hidden = false;
          }
        } catch {
          /* keep hidden */
        }
      }
    }
    syncBillingLifetimeUpsell(data);
    mountBillingPricingTable(data);
  }

  function syncBillingLifetimeUpsell(data) {
    const wrap = el("billing-lifetime-wrap");
    const link = el("billing-lifetime-link");
    if (!wrap || !link) return;
    wrap.hidden = true;
    if (data.life_member || data.lifeMember) return;
    const sub = String(data.subscription_status || "").toLowerCase();
    const monthlyLike = sub === "active" || sub === "past_due" || sub === "trialing" || sub === "trial";
    if (!monthlyLike) return;
    try {
      const u = new URL(STRIPE_LIFETIME_CHECKOUT_URL);
      if (u.protocol === "https:" && u.hostname === "buy.stripe.com") {
        link.href = u.toString();
        wrap.hidden = false;
      }
    } catch {
      /* keep hidden */
    }
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function parseJsonRes(res) {
    const text = await res.text();
    let j = {};
    try {
      j = text ? JSON.parse(text) : {};
    } catch {
      j = {};
    }
    return { j, text };
  }

  async function refreshMe() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      syncPortalLifetimeNav(null);
      showPanel("panel-forms");
      return;
    }
    if (!apiBase) {
      showPanel("panel-forms");
      return;
    }
    showPanel("panel-loading");
    setStatus("");
    const res = await apiFetch("/v1/me", {
      headers: { Authorization: "Bearer " + token },
    });
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      syncPortalLifetimeNav(null);
      notifyPortalAuthChange();
      showPanel("panel-forms");
      setStatus("Your session ended. Please sign in again.", "warn");
      return;
    }
    if (!res.ok) {
      showPanel("panel-account");
      setStatus("We could not load your account. Please try again in a moment.", "err");
      return;
    }
    const data = await res.json();
    const earn = await fetchBetaTesterRewardsSummary(token);
    showPanel("panel-account");
    renderAccount(data, earn);
    syncPortalLifetimeNav(data);
  }

  async function refreshBilling() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      syncPortalLifetimeNav(null);
      showBillingPanel("guest");
      return;
    }
    if (!apiBase) {
      showBillingPanel("guest");
      return;
    }
    showBillingPanel("loading");
    setStatus("");
    const res = await apiFetch("/v1/me", {
      headers: { Authorization: "Bearer " + token },
    });
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      syncPortalLifetimeNav(null);
      notifyPortalAuthChange();
      showBillingPanel("guest");
      setStatus("Your session ended. Sign in from Account, then open Billing again.", "warn");
      return;
    }
    if (!res.ok) {
      showBillingPanel("guest");
      setStatus("We could not load billing. Please try again in a moment.", "err");
      return;
    }
    const data = await res.json();
    renderBillingSummary(data);
    syncPortalLifetimeNav(data);
    showBillingPanel("main");
  }

  async function onLogin(ev) {
    ev.preventDefault();
    setStatus("");
    if (!apiBase) {
      setStatus("Sign-in is not available here yet. Please try again later.", "warn");
      return;
    }
    const email = el("login-email").value.trim().toLowerCase();
    const password = el("login-password").value;
    const device_id = getOrCreateDeviceId();
    try {
      const res = await apiFetch("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, device_id }),
      });
      const { j, text } = await parseJsonRes(res);
      if (!res.ok) {
        let human = friendlyFromApiError(j);
        if (!human && text && text.length < 400 && !/<!DOCTYPE/i.test(text) && !looksTechnicalMessage(text)) {
          human = text.trim();
        }
        if (!human && res.status === 401) human = "Incorrect email or password.";
        setStatus(human || "Sign-in did not work. Check your email and password.", "err");
        return;
      }
      if (j.access_token) {
        localStorage.setItem(TOKEN_KEY, j.access_token);
        notifyPortalAuthChange();
      }
      await refreshMe();
    } catch (e) {
      const net = e && typeof e.message === "string" ? e.message : "";
      setStatus(
        net && /network|fetch|failed|load/i.test(net)
          ? "Could not reach the sign-in service. Check your connection or try again in a moment."
          : "Something went wrong. Please try again.",
        "err"
      );
    }
  }

  async function onSignup(ev) {
    ev.preventDefault();
    setStatus("");
    if (!apiBase) {
      setStatus("Creating an account is not available here yet. Please try again later.", "warn");
      return;
    }
    const email = el("signup-email").value.trim().toLowerCase();
    const password = el("signup-password").value;
    const device_id = getOrCreateDeviceId();
    try {
      const res = await apiFetch("/v1/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, device_id }),
      });
      const { j, text } = await parseJsonRes(res);
      if (!res.ok) {
        let human = friendlyFromApiError(j);
        if (!human && text && text.length < 400 && !/<!DOCTYPE/i.test(text) && !looksTechnicalMessage(text)) {
          human = text.trim();
        }
        setStatus(human || "We could not create an account. Check your details and try again.", "err");
        return;
      }
      if (j.access_token) {
        localStorage.setItem(TOKEN_KEY, j.access_token);
        notifyPortalAuthChange();
      }
      if (document.body && document.body.getAttribute("data-account-page") === "signup") {
        window.location.href = "/account.html";
        return;
      }
      await refreshMe();
    } catch (e) {
      const net = e && typeof e.message === "string" ? e.message : "";
      setStatus(
        net && /network|fetch|failed|load/i.test(net)
          ? "Could not reach the account service. Check your connection or try again in a moment."
          : "Something went wrong. Please try again.",
        "err"
      );
    }
  }

  async function onLogout() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && apiBase) {
      try {
        await apiFetch("/v1/auth/logout", {
          method: "POST",
          headers: { Authorization: "Bearer " + token },
        });
      } catch {
        /* ignore */
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    syncPortalLifetimeNav(null);
    notifyPortalAuthChange();
    if (pageMode() === "billing") {
      showBillingPanel("guest");
    } else if (pageMode() === "my-apps") {
      showMyAppsPanel("guest");
    } else if (pageMode() === "development-notice") {
      showDevNoticePanel("guest");
    } else {
      showPanel("panel-forms");
    }
    setStatus("You are signed out.", "ok");
  }

  async function onDeleteAccount() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setStatus("You are not signed in.", "warn");
      showPanel("panel-forms");
      return;
    }
    if (!apiBase) {
      setStatus("Account service is unavailable here. Please try again later.", "warn");
      return;
    }

    const ok1 = window.confirm(
      "Delete your RootRecord account?\n\nThis permanently deletes your portal account and any server-stored data tied to it. This cannot be undone."
    );
    if (!ok1) return;

    const typed = window.prompt('Type DELETE to confirm account deletion.');
    if (String(typed || "").trim().toUpperCase() !== "DELETE") {
      setStatus("Account deletion canceled.", "warn");
      return;
    }

    setStatus("Deleting your account…", "");
    const btn = el("btn-delete-account");
    if (btn) btn.disabled = true;
    try {
      const res = await apiFetch("/v1/me", {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
      });
      const { j } = await parseJsonRes(res);
      if (!res.ok) {
        const human = friendlyFromApiError(j) || "Could not delete your account.";
        setStatus(human, "err");
        if (btn) btn.disabled = false;
        return;
      }
      localStorage.removeItem(TOKEN_KEY);
      syncPortalLifetimeNav(null);
      notifyPortalAuthChange();
      showPanel("panel-forms");
      setStatus("Your account was deleted.", "ok");
    } catch {
      setStatus("Network error while deleting your account.", "err");
      if (btn) btn.disabled = false;
    }
  }

  window.addEventListener("DOMContentLoaded", async () => {
    const page = pageMode();
    if (page === "billing") {
      showBillingPanel("loading");
    } else if (page === "my-apps") {
      showMyAppsPanel("loading");
    } else if (page === "development-notice") {
      showDevNoticePanel("loading");
    } else {
      showPanel("panel-loading");
    }
    try {
      await loadConfig();
    } catch {
      setStatus("We could not load this page. Please refresh and try again.", "err");
      if (page === "signup") {
        const pf = el("panel-signup");
        if (pf) pf.hidden = false;
        const pl = el("panel-loading");
        if (pl) pl.hidden = true;
      } else if (page === "billing") {
        showBillingPanel("guest");
      } else if (page === "my-apps") {
        showMyAppsPanel("guest");
      } else if (page === "development-notice") {
        showDevNoticePanel("guest");
      } else {
        showPanel("panel-forms");
      }
      return;
    }

    if (page === "billing") {
      const qs = new URLSearchParams(window.location.search);
      if (qs.get("checkout") === "success") {
        setStatus("Checkout completed. Your plan may take a minute to update everywhere.", "ok");
      } else if (qs.get("checkout") === "cancel") {
        setStatus("Checkout was canceled.", "warn");
      }
      el("btn-billing-logout")?.addEventListener("click", onLogout);
      if (localStorage.getItem(TOKEN_KEY)) {
        await refreshBilling();
      } else {
        showBillingPanel("guest");
      }
      return;
    }

    if (page === "my-apps") {
      el("btn-myapps-logout")?.addEventListener("click", onLogout);
      if (localStorage.getItem(TOKEN_KEY)) {
        await refreshMyApps();
      } else {
        showMyAppsPanel("guest");
      }
      return;
    }

    if (page === "development-notice") {
      el("btn-devnotice-logout")?.addEventListener("click", onLogout);
      if (localStorage.getItem(TOKEN_KEY)) {
        await refreshDevNotice();
      } else {
        showDevNoticePanel("guest");
      }
      return;
    }

    if (page === "signup") {
      el("form-signup")?.addEventListener("submit", onSignup);
      const ps = el("panel-signup");
      if (ps) ps.hidden = false;
      const pl = el("panel-loading");
      if (pl) pl.hidden = true;
      return;
    }

    el("form-login")?.addEventListener("submit", onLogin);
    el("btn-logout")?.addEventListener("click", onLogout);
    el("btn-delete-account")?.addEventListener("click", onDeleteAccount);

    if (localStorage.getItem(TOKEN_KEY)) {
      await refreshMe();
    } else {
      showPanel("panel-forms");
    }
  });
})();
