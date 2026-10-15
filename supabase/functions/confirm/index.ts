// POST /functions/v1/confirm  { token }
// Called by the /confirm page via JavaScript, so link-scanners that only GET the URL can't auto-confirm.
import { adminClient, corsHeaders, json, sha256Hex } from "../_shared/util.ts";
import { syncContact } from "../_shared/email.ts";

const TOKEN_TTL_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  let token = "";
  try { token = String((await req.json()).token ?? ""); } catch { /* fallthrough */ }
  if (!/^[a-f0-9]{64}$/.test(token)) return json(req, { status: "invalid" }, 400);

  const db = adminClient();
  const { data: sub } = await db.from("subscribers")
    .select("id, email, first_name, country, marketing_consent, confirm_sent_at, utm_source, giveaway_id")
    .eq("confirm_token_hash", await sha256Hex(token)).maybeSingle();
  if (!sub) return json(req, { status: "invalid" }, 404);

  if (!sub.confirm_sent_at || Date.now() - new Date(sub.confirm_sent_at).getTime() > TOKEN_TTL_DAYS * 86_400_000) {
    return json(req, { status: "expired" }, 410);
  }

  const { error } = await db.from("subscribers")
    .update({ confirmed_at: new Date().toISOString(), confirm_token_hash: null })
    .eq("id", sub.id);
  if (error) return json(req, { status: "error" }, 500);

  const r = await syncContact({ email: sub.email, firstName: sub.first_name, country: sub.country, marketingConsent: sub.marketing_consent, source: sub.utm_source });
  await db.from("email_events").insert({ subscriber_id: sub.id, kind: "contact_sync", provider: r.provider, mode: r.mode, status: r.status, error: r.error ?? null });
  if (r.status === "sent") await db.from("subscribers").update({ esp_synced_at: new Date().toISOString() }).eq("id", sub.id);

  // Was the entry confirmed in time to count for the giveaway?
  let giveawayEntered = false;
  if (sub.giveaway_id) {
    const { data: g } = await db.from("giveaways").select("status, ends_at, excluded_countries").eq("id", sub.giveaway_id).maybeSingle();
    giveawayEntered = !!g && g.status === "active" && new Date() < new Date(g.ends_at) && !g.excluded_countries.includes(sub.country);
  }
  return json(req, { status: "confirmed", giveawayEntered });
});
