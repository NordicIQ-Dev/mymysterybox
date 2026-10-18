// MyMysteryBox landing page. Plain JavaScript, no build step.
(function () {
  const C = window.MMB_CONFIG;
  const API = window.MMB_API;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const fmtDate = (iso) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
  const fmtShort = (iso) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(iso));

  const slugMatch = location.pathname.match(/^\/giveaway\/([a-z0-9-]{2,60})\/?$/);
  const giveawaySlug = slugMatch ? slugMatch[1] : null;
  let giveaway = null;

  // ---------- Giveaway data ----------
  function setGiveawayVisible(on) {
    $$("[data-needs-giveaway]").forEach((el) => { el.hidden = !on; });
  }

  function fill(g) {
    const map = {
      prize_name: g.prize_name,
      prize_description: g.prize_description || "",
      prize_value: g.prize_value || "\u2013",
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
      const sub = $("#sbar-sub");
      if (sub) sub.textContent = "Entries are closed";
      return;
    }
    const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60;
    $('[data-cd="d"]').textContent = String(d);
    $('[data-cd="h"]').textContent = String(h).padStart(2, "0");
    $('[data-cd="m"]').textContent = String(m).padStart(2, "0");
    const sub = $("#sbar-sub");
    if (sub) sub.textContent = d > 0 ? "Entries close in " + d + (d === 1 ? " day" : " days") : "Entries close today";
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

  // ---------- Mobile menu ----------
  function initMenu() {
    const dlg = $("#menu");
    $("#menu-open").addEventListener("click", () => { dlg.showModal(); document.documentElement.classList.add("lock"); updateBar(); });
    $("#menu-close").addEventListener("click", () => dlg.close());
    dlg.addEventListener("close", () => { document.documentElement.classList.remove("lock"); updateBar(); });
    $$("a", dlg).forEach((a) => a.addEventListener("click", () => dlg.close()));
  }

  // ---------- Sticky bottom bar ----------
  const vis = { entry: true, final: false };
  function updateBar() {
    const on = !vis.entry && !vis.final && !$("#menu").open;
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
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initMenu();
    initBar();
    loadGiveaway();
    loadCount();
  });
})();
