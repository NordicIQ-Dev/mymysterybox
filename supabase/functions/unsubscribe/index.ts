// POST /functions/v1/unsubscribe?id=...&sig=...
// Handles both the /unsubscribe page (JSON body or query) and RFC 8058 one-click (List-Unsubscribe-Post).
import { adminClient, corsHeaders, json, verifyUnsubscribeSig } from "../_shared/util.ts";
import { blockContact } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  let id = url.searchParams.get("id") ?? "";
  let sig = url.searchParams.get("sig") ?? "";
  if ((!id || !sig) && req.headers.get("content-type")?.includes("application/json")) {
    const b = await req.json().catch(() => ({}));
    id = String(b.id ?? ""); sig = String(b.sig ?? "");
  }
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await verifyUnsubscribeSig(id, sig))) return json(req, { status: "invalid" }, 400);

  const db = adminClient();
  const { data: sub } = await db.from("subscribers").select("id, email, unsubscribed_at").eq("id", id).maybeSingle();
  if (!sub) return json(req, { status: "invalid" }, 404);
  if (!sub.unsubscribed_at) {
    await db.from("subscribers").update({ unsubscribed_at: new Date().toISOString(), marketing_consent: false }).eq("id", id);
    const r = await blockContact(sub.email);
    await db.from("email_events").insert({ subscriber_id: id, kind: "unsubscribe_sync", provider: r.provider, mode: r.mode, status: r.status, error: r.error ?? null });
  }
  return json(req, { status: "unsubscribed" });
});
