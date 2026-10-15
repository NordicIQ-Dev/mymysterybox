// Provider adapter. Switch provider with EMAIL_PROVIDER, never by changing call sites.
// EMAIL_MODE controls what actually leaves the building:
//   sandbox   -> provider validates the request but delivers nothing (default, safe)
//   allowlist -> only addresses in EMAIL_ALLOWLIST receive mail; everyone else is logged as skipped
//   live      -> everyone receives mail
import { env } from "./util.ts";

export type Mode = "sandbox" | "allowlist" | "live";
export interface SendResult {
  status: "sent" | "skipped" | "failed";
  provider: string;
  mode: Mode;
  providerMessageId?: string;
  error?: string;
}
export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  tag: string;
  unsubscribeUrl?: string;
}

export function emailMode(): Mode {
  const m = Deno.env.get("EMAIL_MODE") ?? "sandbox";
  return (["sandbox", "allowlist", "live"].includes(m) ? m : "sandbox") as Mode;
}
export const emailProvider = () => Deno.env.get("EMAIL_PROVIDER") ?? "brevo";

function isAllowlisted(to: string): boolean {
  const list = (Deno.env.get("EMAIL_ALLOWLIST") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.some((entry) => (entry.startsWith("@") ? to.endsWith(entry) : to === entry));
}

export async function sendEmail(msg: OutgoingEmail): Promise<SendResult> {
  const provider = emailProvider();
  const mode = emailMode();
  if (mode === "allowlist" && !isAllowlisted(msg.to)) {
    return { status: "skipped", provider, mode, error: "recipient not on EMAIL_ALLOWLIST" };
  }
  try {
    if (provider === "brevo") return await sendBrevo(msg, mode);
    if (provider === "resend") return await sendResend(msg, mode);
    if (provider === "console") {
      console.log("[email:console]", msg.to, msg.subject, msg.text);
      return { status: "sent", provider, mode, providerMessageId: "console" };
    }
    throw new Error(`Unknown EMAIL_PROVIDER "${provider}"`);
  } catch (e) {
    return { status: "failed", provider, mode, error: e instanceof Error ? e.message : String(e) };
  }
}

function listUnsubHeaders(url?: string): Record<string, string> {
  return url ? { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {};
}

async function sendBrevo(msg: OutgoingEmail, mode: Mode): Promise<SendResult> {
  const headers: Record<string, string> = { ...listUnsubHeaders(msg.unsubscribeUrl) };
  if (mode === "sandbox") headers["X-Sib-Sandbox"] = "drop"; // must sit in the JSON body, not the HTTP headers
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env("BREVO_API_KEY"), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: env("EMAIL_FROM"), name: env("EMAIL_FROM_NAME", "MyMysteryBox") },
      replyTo: Deno.env.get("EMAIL_REPLY_TO") ? { email: Deno.env.get("EMAIL_REPLY_TO") } : undefined,
      to: [{ email: msg.to }],
      subject: msg.subject,
      htmlContent: msg.html,
      textContent: msg.text,
      tags: [msg.tag],
      headers,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { status: "failed", provider: "brevo", mode, error: `${r.status} ${d.code ?? ""} ${d.message ?? ""}`.trim() };
  return { status: "sent", provider: "brevo", mode, providerMessageId: d.messageId };
}

async function sendResend(msg: OutgoingEmail, mode: Mode): Promise<SendResult> {
  // Resend has no sandbox header; its test inbox accepts and discards mail.
  const to = mode === "sandbox" ? "delivered@resend.dev" : msg.to;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: `${env("EMAIL_FROM_NAME", "MyMysteryBox")} <${env("EMAIL_FROM")}>`,
      to: [to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      tags: [{ name: "kind", value: msg.tag }],
      headers: listUnsubHeaders(msg.unsubscribeUrl),
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { status: "failed", provider: "resend", mode, error: `${r.status} ${d.message ?? ""}`.trim() };
  return { status: "sent", provider: "resend", mode, providerMessageId: d.id };
}

/** Copy a confirmed subscriber into the marketing tool. Supabase stays the source of truth. */
export async function syncContact(c: {
  email: string; firstName?: string | null; country: string; marketingConsent: boolean; source?: string | null;
}): Promise<SendResult> {
  const provider = emailProvider();
  const mode = emailMode();
  if (provider !== "brevo") return { status: "skipped", provider, mode, error: "contact sync only implemented for brevo" };
  if (mode === "sandbox") return { status: "skipped", provider, mode, error: "no contact sync in sandbox mode" };
  const listIds = [Number(env("BREVO_LIST_ID_WAITLIST"))];
  if (c.marketingConsent && Deno.env.get("BREVO_LIST_ID_MARKETING")) listIds.push(Number(Deno.env.get("BREVO_LIST_ID_MARKETING")));
  try {
    const r = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": env("BREVO_API_KEY"), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        email: c.email,
        updateEnabled: true,
        listIds,
        // Create these attributes in Brevo first: COUNTRY_CODE (text), MARKETING_CONSENT (boolean), SIGNUP_SOURCE (text)
        attributes: {
          FIRSTNAME: c.firstName ?? "",
          COUNTRY_CODE: c.country,
          MARKETING_CONSENT: c.marketingConsent,
          SIGNUP_SOURCE: c.source ?? "",
        },
      }),
    });
    if (!r.ok && r.status !== 204) {
      const d = await r.json().catch(() => ({}));
      return { status: "failed", provider, mode, error: `${r.status} ${d.message ?? ""}`.trim() };
    }
    return { status: "sent", provider, mode };
  } catch (e) {
    return { status: "failed", provider, mode, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Block the address in the marketing tool after an unsubscribe. */
export async function blockContact(email: string): Promise<SendResult> {
  const provider = emailProvider();
  const mode = emailMode();
  if (provider !== "brevo" || mode === "sandbox") return { status: "skipped", provider, mode };
  try {
    const r = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
      method: "PUT",
      headers: { "api-key": env("BREVO_API_KEY"), "content-type": "application/json" },
      body: JSON.stringify({ emailBlacklisted: true }),
    });
    // 404 = contact never synced (e.g. unconfirmed). That's fine.
    if (!r.ok && r.status !== 404) return { status: "failed", provider, mode, error: String(r.status) };
    return { status: "sent", provider, mode };
  } catch (e) {
    return { status: "failed", provider, mode, error: e instanceof Error ? e.message : String(e) };
  }
}
