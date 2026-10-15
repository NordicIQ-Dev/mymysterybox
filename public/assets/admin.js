// Admin panel. Every action is checked server-side: RLS policies + the draw-winner function both require the admin role.
// Protect /admin with Cloudflare Access as an extra layer (see OPPSETT.md).
(function () {
  const C = window.MMB_CONFIG, API = window.MMB_API;
  const $ = (s) => document.querySelector(s);
  let jwt = sessionStorage.getItem("mmb_admin_jwt") || "";

  // Build DOM safely: subscriber data is user input, never insert it as HTML.
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (k === "onclick") e.addEventListener("click", v); else e.setAttribute(k, v); });
    kids.flat().forEach((k) => e.append(k instanceof Node ? k : document.createTextNode(k == null ? "" : String(k))));
    return e;
  }
  const fmt = (iso) => iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "–";

  async function rest(path, opts) {
    const r = await fetch(C.supabaseUrl + "/rest/v1/" + path, {
      ...(opts || {}),
      headers: { ...API.headers(jwt), ...((opts && opts.headers) || {}) },
    });
    if (r.status === 401) { logout(); throw new Error("Session expired, sign in again."); }
    return r;
  }
  async function count(query) {
    const r = await rest("subscribers?select=id" + query, { headers: { Prefer: "count=exact", Range: "0-0" } });
    const cr = r.headers.get("content-range") || "*/0";
    return Number(cr.split("/")[1] || 0);
  }

  async function login(e) {
    e.preventDefault();
    const err = $("#login-err"); err.hidden = true;
    const r = await fetch(C.supabaseUrl + "/auth/v1/token?grant_type=password", {
      method: "POST", headers: API.headers(),
      body: JSON.stringify({ email: $("#l-email").value, password: $("#l-pass").value }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { err.textContent = "Wrong email or password."; err.hidden = false; return; }
    jwt = d.access_token;
    sessionStorage.setItem("mmb_admin_jwt", jwt);
    start();
  }
  function logout() {
    jwt = ""; sessionStorage.removeItem("mmb_admin_jwt");
    $("#app-view").hidden = true; $("#logout").hidden = true; $("#login-view").hidden = false;
  }

  async function start() {
    const r = await rest("user_roles?select=role");
    const roles = r.ok ? await r.json() : [];
    if (!roles.some((x) => x.role === "admin")) {
      const err = $("#login-err"); err.textContent = "This account is not an admin."; err.hidden = false; logout(); return;
    }
    $("#login-view").hidden = true; $("#app-view").hidden = false; $("#logout").hidden = false;
    loadStats(); loadGiveaways(); loadFailures();
  }

  async function loadStats() {
    const [total, confirmed, marketing, unsub] = await Promise.all([
      count(""), count("&confirmed_at=not.is.null&unsubscribed_at=is.null"),
      count("&confirmed_at=not.is.null&unsubscribed_at=is.null&marketing_consent=is.true"), count("&unsubscribed_at=not.is.null"),
    ]);
    const box = $("#stats"); box.innerHTML = "";
    [[total, "Sign-ups"], [confirmed, "Confirmed"], [total ? Math.round((confirmed / total) * 100) + "%" : "–", "Confirmation rate"], [marketing, "Marketing consent"], [unsub, "Unsubscribed"]]
      .forEach(([v, l]) => box.append(el("div", { class: "stat" }, el("b", {}, v), el("span", {}, l))));
  }

  async function act(body) {
    const res = await API.fn("draw-winner", body, jwt);
    if (!res.ok) alert("Error: " + (res.data.error || res.status));
    return res;
  }

  async function loadGiveaways() {
    const r = await rest("giveaways?select=*&order=created_at.desc");
    const rows = r.ok ? await r.json() : [];
    const wrap = $("#giveaways"); wrap.innerHTML = "";
    if (!rows.length) { wrap.append(el("p", { class: "hint" }, "No giveaways yet. Create one below.")); return; }
    const tbody = el("tbody");
    for (const g of rows) {
      const actions = el("div", { class: "row-actions" });
      if (g.status === "draft") actions.append(el("button", { class: "ghost", onclick: async () => {
        const x = await rest("giveaways?id=eq." + g.id, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
        if (!x.ok) alert("Could not activate. Only one giveaway can be active: close the other one first."); loadGiveaways();
      } }, "Activate"));
      if (g.status === "active") actions.append(el("button", { class: "ghost", onclick: async () => {
        if (new Date(g.ends_at) > new Date() && !confirm("Entries are still open. Lock anyway? (The server will refuse until the end date.)")) return;
        const res = await act({ action: "lock", giveawayId: g.id });
        if (res.ok) alert("Locked " + res.data.eligibleCount + " entries.\nFingerprint: " + res.data.entriesHash); loadGiveaways();
      } }, "Lock entries"));
      if (g.status === "closed") actions.append(el("button", { class: "ghost", onclick: async () => {
        if (!confirm("Draw a winner now? This is logged permanently.")) return;
        const res = await act({ action: "draw", giveawayId: g.id });
        if (res.ok) alert("Winner: " + res.data.winner.email + " (" + res.data.winner.country + ")\nDrawn from " + res.data.poolSize + " entries."); loadGiveaways();
      } }, "Draw winner"));
      const drawsBox = el("div", { class: "draws" });
      const dr = await rest("giveaway_draws?select=id,drawn_at,status,eligible_count,winner:subscribers(email,country)&giveaway_id=eq." + g.id + "&order=drawn_at");
      const draws = dr.ok ? await dr.json() : [];
      draws.forEach((d) => {
        const line = el("div", {}, fmt(d.drawn_at) + "  ", el("strong", {}, d.winner ? d.winner.email : "?"), "  ", el("span", { class: "pill" }, d.status), "  ");
        if (d.status === "pending") {
          line.append(el("button", { class: "ghost", onclick: async () => { await act({ action: "accept", drawId: d.id }); loadGiveaways(); } }, "Mark accepted"), " ",
            el("button", { class: "ghost", onclick: async () => { if (confirm("Mark as forfeited? You can then draw again.")) { await act({ action: "forfeit", drawId: d.id }); loadGiveaways(); } } }, "Forfeit"));
        }
        drawsBox.append(line);
      });
      tbody.append(el("tr", {},
        el("td", {}, el("strong", {}, g.title), el("br"), "/giveaway/" + g.slug),
        el("td", {}, el("span", { class: "pill" }, g.status)),
        el("td", {}, g.prize_name, el("br"), g.prize_value || ""),
        el("td", {}, fmt(g.starts_at) + " → " + fmt(g.ends_at), el("br"), "Draw: " + fmt(g.draw_date)),
        el("td", {}, actions, g.entries_hash ? el("div", { class: "draws" }, "Fingerprint: " + g.entries_hash.slice(0, 16) + "…") : "", drawsBox)));
    }
    wrap.append(el("div", { class: "tblwrap" }, el("table", { class: "tbl" },
      el("thead", {}, el("tr", {}, ["Giveaway", "Status", "Prize", "Dates", "Actions"].map((h) => el("th", {}, h)))), tbody)));
  }

  async function createGiveaway(e) {
    e.preventDefault();
    const f = new FormData(e.target), err = $("#new-err"); err.hidden = true;
    const iso = (v) => new Date(v).toISOString();
    const body = {
      slug: f.get("slug"), title: f.get("title"), prize_name: f.get("prize_name"),
      prize_value: f.get("prize_value") || null, prize_description: f.get("prize_description") || null,
      winners_count: Number(f.get("winners_count")),
      excluded_countries: String(f.get("excluded_countries") || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
      starts_at: iso(f.get("starts_at")), ends_at: iso(f.get("ends_at")), draw_date: iso(f.get("draw_date")), status: "draft",
    };
    const r = await rest("giveaways", { method: "POST", body: JSON.stringify(body) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); err.textContent = "Could not create: " + (d.message || r.status); err.hidden = false; return; }
    e.target.reset(); loadGiveaways();
  }

  async function loadFailures() {
    const r = await rest("email_events?select=created_at,kind,provider,mode,error&status=eq.failed&order=created_at.desc&limit=20");
    const rows = r.ok ? await r.json() : [];
    const wrap = $("#failures"); wrap.innerHTML = "";
    if (!rows.length) { wrap.append(el("p", { class: "hint" }, "No failed sends.")); return; }
    wrap.append(el("div", { class: "tblwrap" }, el("table", { class: "tbl" },
      el("thead", {}, el("tr", {}, ["Time", "Kind", "Provider", "Mode", "Error"].map((h) => el("th", {}, h)))),
      el("tbody", {}, rows.map((x) => el("tr", {}, [fmt(x.created_at), x.kind, x.provider, x.mode, x.error].map((v) => el("td", {}, v))))))));
  }

  async function exportCsv() {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const r = await rest("subscribers?select=email,first_name,country,marketing_consent,confirmed_at,created_at,utm_source,utm_campaign&confirmed_at=not.is.null&unsubscribed_at=is.null&order=created_at", { headers: { Range: from + "-" + (from + 999) } });
      const rows = r.ok ? await r.json() : [];
      all.push(...rows);
      if (rows.length < 1000) break;
    }
    const cols = ["email", "first_name", "country", "marketing_consent", "confirmed_at", "created_at", "utm_source", "utm_campaign"];
    // Prefix cells starting with = + - @ so spreadsheet apps don't run them as formulas.
    const cell = (v) => { let s = v == null ? "" : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const csv = [cols.join(",")].concat(all.map((r) => cols.map((c) => cell(r[c])).join(","))).join("\n");
    const a = el("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "mymysterybox-confirmed-" + new Date().toISOString().slice(0, 10) + ".csv" });
    document.body.append(a); a.click(); a.remove();
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("#login").addEventListener("submit", login);
    $("#logout").addEventListener("click", logout);
    $("#new-g").addEventListener("submit", createGiveaway);
    $("#export").addEventListener("click", exportCsv);
    if (jwt) start().catch(logout);
  });
})();
