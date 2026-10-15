// POST /functions/v1/brevo-webhook?secret=...
// In Brevo: Transactional > Settings > Webhooks, events: hard bounce, spam, unsubscribed, blocked.
import { adminClient, env, normalizeEmail } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (new URL(req.url).searchParams.get("secret") !== env("BREVO_WEBHOOK_SECRET")) return new Response("forbidden", { status: 403 });

  const payload = await req.json().catch(() => null);
  const events = Array.isArray(payload) ? payload : payload ? [payload] : [];
  const db = adminClient();
  const now = new Date().toISOString();

  for (const ev of events) {
    const email = normalizeEmail(ev.email);
    const kind = String(ev.event ?? "");
    if (!email) continue;
    const patch: Record<string, string> =
      kind === "hard_bounce" || kind === "blocked" || kind === "invalid_email" ? { bounced_at: now }
      : kind === "spam" ? { complained_at: now, unsubscribed_at: now }
      : kind === "unsubscribed" ? { unsubscribed_at: now }
      : {};
    const { data: sub } = await db.from("subscribers").select("id").eq("email", email).maybeSingle();
    if (sub && Object.keys(patch).length) await db.from("subscribers").update(patch).eq("id", sub.id);
    await db.from("email_events").insert({ subscriber_id: sub?.id ?? null, kind: `webhook:${kind}`, provider: "brevo", mode: "live", status: "received", provider_message_id: ev["message-id"] ?? null });
  }
  return new Response("ok");
});
