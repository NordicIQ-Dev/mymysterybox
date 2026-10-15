// POST /functions/v1/subscribe
import { adminClient, clientIp, clip, corsHeaders, EMAIL_RE, env, json, normalizeEmail, randomToken, sha256Hex, unsubscribeSig, verifyTurnstile } from "../_shared/util.ts";
import { emailMode, sendEmail } from "../_shared/email.ts";
import { alreadyInEmail, confirmationEmail } from "../_shared/templates.ts";

const RATE_LIMIT = 5;            // sign-ups per IP
const RATE_WINDOW_MIN = 10;      // per this many minutes
const RESEND_COOLDOWN_SEC = 120; // min gap between confirmation emails to the same address

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(req, { error: "invalid_json" }, 400); }

  // Honeypot: bots fill hidden fields. Pretend success, store nothing.
  if (b.website) return json(req, { ok: true });

  const email = normalizeEmail(b.email);
  const country = String(b.country ?? "").toUpperCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return json(req, { error: "invalid_email" }, 422);
  if (!/^[A-Z]{2}$/.test(country)) return json(req, { error: "invalid_country" }, 422);
  if (b.ageConfirmed !== true || b.termsAccepted !== true) return json(req, { error: "consent_required" }, 422);
  const marketingConsent = b.marketingConsent === true;

  const ip = clientIp(req);
  if (!(await verifyTurnstile(String(b.turnstileToken ?? ""), ip))) return json(req, { error: "bot_check_failed" }, 403);
  const ipHash = ip ? await sha256Hex(env("IP_HASH_SALT") + ip) : null;

  const db = adminClient();

  if (ipHash) {
    const since = new Date(Date.now() - RATE_WINDOW_MIN * 60_000).toISOString();
    const { count } = await db.from("subscribers").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
    if ((count ?? 0) >= RATE_LIMIT) return json(req, { error: "rate_limited" }, 429);
  }

  // Which giveaway does this sign-up belong to?
  const slug = typeof b.giveawaySlug === "string" ? b.giveawaySlug : null;
  let gq = db.from("giveaways").select("id, prize_name, status, starts_at, ends_at, excluded_countries");
  gq = slug ? gq.eq("slug", slug) : gq.eq("status", "active");
  const { data: giveaway } = await gq.maybeSingle();
  const now = new Date();
  const giveawayOpen = !!giveaway && giveaway.status === "active" && new Date(giveaway.starts_at) <= now && now < new Date(giveaway.ends_at);
  const giveawayEntered = giveawayOpen && !giveaway!.excluded_countries.includes(country);

  const site = env("SITE_URL").replace(/\/$/, "");
  const fnBase = `${env("SUPABASE_URL")}/functions/v1`;
  const nowIso = now.toISOString();

  const { data: existing } = await db.from("subscribers")
    .select("id, first_name, confirmed_at, unsubscribed_at, confirm_sent_at")
    .eq("email", email).maybeSingle();

  // page = link in the email body (opens our /unsubscribe page); oneClick = List-Unsubscribe header target
  const unsubLinks = async (id: string) => {
    const sig = await unsubscribeSig(id);
    return { page: `${site}/unsubscribe?id=${id}&sig=${sig}`, oneClick: `${fnBase}/unsubscribe?id=${id}&sig=${sig}` };
  };
  const log = (subscriber_id: string, kind: string, r: Awaited<ReturnType<typeof sendEmail>>) =>
    db.from("email_events").insert({ subscriber_id, kind, provider: r.provider, mode: r.mode, status: r.status, provider_message_id: r.providerMessageId ?? null, error: r.error ?? null });

  // Already confirmed and still subscribed: same response as a new sign-up (no account enumeration),
  // but send a friendly "you're already in" email instead of a confirmation.
  if (existing?.confirmed_at && !existing.unsubscribed_at) {
    const u = await unsubLinks(existing.id);
    const r = await sendEmail({ to: email, tag: "already_in", unsubscribeUrl: u.oneClick, ...alreadyInEmail({ unsubscribeUrl: u.page }) });
    await log(existing.id, "already_in", r);
    return json(req, { ok: true, giveawayEntered });
  }

  // Pending sign-up asking again within the cooldown: don't spam their inbox.
  if (existing && !existing.confirmed_at && existing.confirm_sent_at &&
      Date.now() - new Date(existing.confirm_sent_at).getTime() < RESEND_COOLDOWN_SEC * 1000) {
    return json(req, { ok: true, giveawayEntered });
  }

  const token = randomToken();
  const row = {
    email,
    first_name: clip(b.firstName, 80),
    country,
    age_confirmed: true,
    terms_accepted_at: nowIso,
    marketing_consent: marketingConsent,
    marketing_consent_at: marketingConsent ? nowIso : null,
    consent_text_version: env("CONSENT_TEXT_VERSION", "v1"),
    confirm_token_hash: await sha256Hex(token),
    confirm_sent_at: nowIso,
    confirmed_at: null,
    unsubscribed_at: null,
    giveaway_id: giveaway?.id ?? null,
    utm_source: clip((b.utm as Record<string, unknown>)?.source, 120),
    utm_medium: clip((b.utm as Record<string, unknown>)?.medium, 120),
    utm_campaign: clip((b.utm as Record<string, unknown>)?.campaign, 120),
    referrer: clip(b.referrer, 500),
    landing_url: clip(b.landingUrl, 500),
    ip_hash: ipHash,
    user_agent: clip(req.headers.get("user-agent"), 300),
  };

  const { data: saved, error } = existing
    ? await db.from("subscribers").update(row).eq("id", existing.id).select("id").single()
    : await db.from("subscribers").insert(row).select("id").single();
  if (error || !saved) {
    console.error("subscribe: db error", error);
    return json(req, { error: "save_failed" }, 500);
  }

  const confirmUrl = `${site}/confirm?token=${token}`;
  const u = await unsubLinks(saved.id);
  const r = await sendEmail({
    to: email, tag: "confirmation", unsubscribeUrl: u.oneClick,
    ...confirmationEmail({ firstName: row.first_name, prizeName: giveaway?.prize_name, confirmUrl, unsubscribeUrl: u.page, giveawayEntered }),
  });
  await log(saved.id, "confirmation", r);

  if (r.status === "failed") {
    // Never fail silently: the person sees an error and can try again; the attempt is in email_events.
    console.error("subscribe: email failed", r.error);
    return json(req, { error: "email_failed" }, 502);
  }

  const body: Record<string, unknown> = { ok: true, giveawayEntered };
  // In sandbox mode nothing is delivered, so hand the link back for testing. Never in allowlist/live.
  if (emailMode() === "sandbox") body.debugConfirmUrl = confirmUrl;
  return json(req, body);
});
