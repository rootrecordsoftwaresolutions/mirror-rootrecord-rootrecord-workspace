(function () {
  const TOKEN_KEY = "rootrecord_portal_token";
  const LIFETIME_NAV_KEY = "rootrecord_portal_lifetime_nav";

  function syncNavSignedIn() {
    document.documentElement.classList.toggle("nav-signed-in", !!localStorage.getItem(TOKEN_KEY));
  }

  function syncLifetimeNav() {
    const signedIn = !!localStorage.getItem(TOKEN_KEY);
    const lifetime = signedIn && localStorage.getItem(LIFETIME_NAV_KEY) === "1";
    document.documentElement.classList.toggle("nav-lifetime", lifetime);
  }

  function closeAccountPanel() {
    const btn = document.querySelector(".nav-account-trigger");
    const panel = document.getElementById("nav-account-panel");
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (panel) panel.hidden = true;
  }

  function openAccountPanel() {
    const btn = document.querySelector(".nav-account-trigger");
    const panel = document.getElementById("nav-account-panel");
    if (btn) btn.setAttribute("aria-expanded", "true");
    if (panel) panel.hidden = false;
  }

  function toggleAccountPanel() {
    const panel = document.getElementById("nav-account-panel");
    if (!panel) return;
    if (panel.hidden === false) closeAccountPanel();
    else openAccountPanel();
  }

  window.addEventListener("DOMContentLoaded", () => {
    syncNavSignedIn();
    syncLifetimeNav();

    window.addEventListener("storage", (e) => {
      if (e.key === TOKEN_KEY) {
        syncNavSignedIn();
        syncLifetimeNav();
      }
      if (e.key === LIFETIME_NAV_KEY) syncLifetimeNav();
    });
    window.addEventListener("rootrecord-portal-auth-change", () => {
      syncNavSignedIn();
      syncLifetimeNav();
    });
    window.addEventListener("rootrecord-portal-lifetime-nav-change", syncLifetimeNav);

    const trigger = document.querySelector(".nav-account-trigger");
    const panel = document.getElementById("nav-account-panel");
    if (!trigger || !panel) return;

    trigger.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      toggleAccountPanel();
    });
    panel.querySelectorAll('a[role="menuitem"]').forEach((a) => {
      a.addEventListener("click", () => closeAccountPanel());
    });
    document.addEventListener("click", (ev) => {
      if (!trigger.contains(ev.target) && !panel.contains(ev.target)) closeAccountPanel();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closeAccountPanel();
    });
  });
})();
