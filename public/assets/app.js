// MyMysteryBox landing page. Plain JavaScript, no build step.
(function () {
  const C = window.MMB_CONFIG;
  const API = window.MMB_API;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const ERRORS = {
    invalid_email: "That email address doesn't look right. Check it and try again.",
    invalid_country: "Choose your country to continue.",
    consent_required: "Tick the box to confirm you're 18+ and accept the Giveaway Terms.",
    bot_check_failed: "We couldn't verify you're human. Reload the page and try again.",
    rate_limited: "Too many sign-ups from this connection. Wait ten minutes and try again.",
    email_failed: "We saved your sign-up but couldn't send the confirmation email. Try again in a minute.",
    network: "You seem to be offline. Check your connection and try again.",
  };
  const fmtDate = (iso) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
  const fmtShort = (iso) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(iso));

  const slugMatch = location.pathname.match(/^\/giveaway\/([a-z0-9-]{2,60})\/?$/);
  const giveawaySlug = slugMatch ? slugMatch[1] : null;
  let giveaway = null;
  let widgetId = null;
  let token = "";
  let submitted = false;

  // ---------- Giveaway data ----------
  function setGiveawayVisible(on) {
    $$("[data-needs-giveaway]").forEach((el) => { el.hidden = !on; });
    const btn = $("#submit-btn");
    btn.textContent = on ? btn.dataset.labelGiveaway : btn.dataset.labelPlain;
    $("#sbar-btn").textContent = on ? "Enter the draw" : "Join the waitlist";
  }

  function fill(g) {
    const map = {
      prize_name: g.prize_name,
      prize_description: g.prize_description || "",
      prize_value: g.prize_value || "–",
      winners_count: String(g.winners_count),
      ends_at: fmtDate(g.ends_at),
      draw_date: fmtDate(g.draw_date),
      draw_date_short: fmtShort(g.draw_date),
    };
    $$("[data-g]").forEach((el) => { const v = map[el.dataset.g]; if (v !== undefined) el.textContent = v; });
    if (g.entries_hash) $("#entries-hash").textContent = g.entries_hash;
  }

  function tick() {
    if (!giveaway) return;
    const ms = new Date(giveaway.ends_at).getTime() - Date.now();
    if (ms <= 0) {
      $("#countdown").closest("[data-needs-giveaway]").querySelector(".lbl").textContent = "Entries are closed";
      ["d", "h", "m"].forEach((k) => { $('[data-cd="' + k + '"]').textContent = "00"; });
      $("#sbar-sub").textContent = "Entries are closed";
      return;
    }
    const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60;
    $('[data-cd="d"]').textContent = String(d);
    $('[data-cd="h"]').textContent = String(h).padStart(2, "0");
    $('[data-cd="m"]').textContent = String(m).padStart(2, "0");
    $("#sbar-sub").textContent = d > 0 ? "Entries close in " + d + (d === 1 ? " day" : " days") : "Entries close today";
  }

  async function loadGiveaway() {
    setGiveawayVisible(false);
    try {
      const rows = await API.rpc("public_giveaway", giveawaySlug ? { _slug: giveawaySlug } : {});
      giveaway = Array.isArray(rows) && rows[0] ? rows[0] : null;
    } catch (_) { giveaway = null; }
    if (!giveaway) return;
    fill(giveaway);
    setGiveawayVisible(true);
    tick();
    setInterval(tick, 30000);
  }

  async function loadCount() {
    $$("[data-needs-count]").forEach((el) => { el.hidden = true; });
    try {
      const n = Number(await API.rpc("waitlist_count"));
      if (n >= (C.minCountToShow || 0)) {
        $("#waitlist-count").textContent = n.toLocaleString("en-GB");
        $$("[data-needs-count]").forEach((el) => { el.hidden = false; });
      }
    } catch (_) { /* counter is optional */ }
  }

  // ---------- Form ----------
  function fillCountries() {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    const sel = $("#country");
    C.countries.map((c) => ({ c, n: names.of(c) || c }))
      .sort((a, b) => a.n.localeCompare(b.n))
      .forEach(({ c, n }) => { const o = document.createElement("option"); o.value = c; o.textContent = n; sel.appendChild(o); });
    try {
      const region = new Intl.Locale(navigator.language).maximize().region;
      if (region && C.countries.includes(region)) sel.value = region;
    } catch (_) { /* older browsers */ }
  }

  function initTurnstile(tries) {
    // Note: never give an element id="turnstile"; browsers expose ids as window properties.
    if (window.turnstile && typeof window.turnstile.render === "function") {
      widgetId = window.turnstile.render("#ts-widget", {
        sitekey: C.turnstileSiteKey,
        appearance: "interaction-only",
        theme: "dark",
        callback: (t) => { token = t; },
        "expired-callback": () => { token = ""; },
        "error-callback": () => { token = ""; },
      });
    } else if ((tries || 0) < 50) {
      setTimeout(() => initTurnstile((tries || 0) + 1), 200);
    }
  }

  function showError(msg) {
    const el = $("#form-error");
    el.textContent = msg;
    el.hidden = !msg;
  }

  async function onSubmit(e) {
    e.preventDefault();
    showError("");
    const email = $("#email").value.trim();
    const country = $("#country").value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { showError(ERRORS.invalid_email); $("#email").focus(); return; }
    if (!country) { showError(ERRORS.invalid_country); $("#country").focus(); return; }
    if (!$("#terms").checked) { showError(ERRORS.consent_required); $("#terms").focus(); return; }
    if (!token) { showError("One moment while we check you're human, then try again."); return; }

    const btn = $("#submit-btn");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Sending…";
    const p = new URLSearchParams(location.search);
    const res = await API.fn("subscribe", {
      email, country,
      website: $("#website").value,
      giveawaySlug,
      ageConfirmed: true, termsAccepted: true,
      marketingConsent: $("#marketing").checked,
      turnstileToken: token,
      utm: { source: p.get("utm_source"), medium: p.get("utm_medium"), campaign: p.get("utm_campaign") },
      referrer: document.referrer || null,
      landingUrl: location.href,
    });
    btn.disabled = false;
    btn.textContent = label;

    if (!res.ok || !res.data.ok) {
      showError(ERRORS[res.data.error] || "Something went wrong on our side. Try again in a minute.");
      if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
      token = "";
      return;
    }
    submitted = true;
    $("#done-email").textContent = email;
    const dbg = $("#debug-link");
    if (res.data.debugConfirmUrl) {
      dbg.innerHTML = "";
      const a = document.createElement("a");
      a.href = res.data.debugConfirmUrl;
      a.textContent = "Test mode: open the confirmation link";
      a.style.color = "inherit";
      dbg.appendChild(a);
      dbg.hidden = false;
    } else { dbg.hidden = true; }
    $("#signup").hidden = true;
    $("#done").hidden = false;
    $("#done").focus();
    updateBar();
  }

  function onReset() {
    submitted = false;
    $("#signup").reset();
    $("#done").hidden = true;
    $("#signup").hidden = false;
    fillCountryDefault();
    if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
    token = "";
    $("#email").focus();
  }
  function fillCountryDefault() {
    try {
      const region = new Intl.Locale(navigator.language).maximize().region;
      if (region && C.countries.includes(region)) $("#country").value = region;
    } catch (_) { /* ignore */ }
  }

  // ---------- Mobile menu ----------
  function initMenu() {
    const dlg = $("#menu");
    $("#menu-open").addEventListener("click", () => { dlg.showModal(); document.documentElement.classList.add("lock"); updateBar(); });
    $("#menu-close").addEventListener("click", () => dlg.close());
    dlg.addEventListener("close", () => { document.documentElement.classList.remove("lock"); updateBar(); });
    $$("a", dlg).forEach((a) => a.addEventListener("click", () => dlg.close()));
  }

  // ---------- Sticky bottom bar (mobile only, hidden by CSS on wider screens) ----------
  const vis = { entry: true, final: false };
  function updateBar() {
    const on = !submitted && !vis.entry && !vis.final && !$("#menu").open;
    const bar = $("#sbar");
    bar.classList.toggle("on", on);
    bar.inert = !on;
  }
  function initBar() {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { vis[e.target.id === "entry" ? "entry" : "final"] = e.isIntersecting; });
      updateBar();
    });
    io.observe($("#entry"));
    io.observe($("#final"));
    $("#sbar-btn").addEventListener("click", () => {
      $("#entry").scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => { const i = $("#email"); if (i && !submitted) i.focus({ preventScroll: true }); }, 450);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    fillCountries();
    initTurnstile(0);
    initMenu();
    initBar();
    $("#signup").addEventListener("submit", onSubmit);
    $("#reset-btn").addEventListener("click", onReset);
    loadGiveaway();
    loadCount();
  });
})();
