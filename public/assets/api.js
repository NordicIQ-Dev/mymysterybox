// Tiny Supabase client: no dependencies, used by every page.
(function () {
  const C = window.MMB_CONFIG;
  const headers = (token) => ({
    apikey: C.supabaseAnonKey,
    Authorization: "Bearer " + (token || C.supabaseAnonKey),
    "Content-Type": "application/json",
  });
  async function parse(r) { try { return await r.json(); } catch (_) { return {}; } }
  window.MMB_API = {
    async rpc(fn, args, token) {
      const r = await fetch(C.supabaseUrl + "/rest/v1/rpc/" + fn, { method: "POST", headers: headers(token), body: JSON.stringify(args || {}) });
      if (!r.ok) throw new Error("rpc " + fn + " " + r.status);
      return parse(r);
    },
    async fn(name, body, token) {
      try {
        const r = await fetch(C.supabaseUrl + "/functions/v1/" + name, { method: "POST", headers: headers(token), body: JSON.stringify(body || {}) });
        return { ok: r.ok, status: r.status, data: await parse(r) };
      } catch (_) {
        return { ok: false, status: 0, data: { error: "network" } };
      }
    },
    headers,
  };
})();
