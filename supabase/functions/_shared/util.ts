import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export function env(key: string, fallback?: string): string {
  const v = Deno.env.get(key) ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing env var ${key}`);
  return v;
}

export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function corsHeaders(req: Request): Record<string, string> {
  // Exact origins, or "*.example.pages.dev" to allow every Cloudflare preview deployment of the project.
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  const ok = allowed.some((a) => a === origin || (a.startsWith("*.") && origin.startsWith("https://") && origin.endsWith(a.slice(1))));
  return {
    "Access-Control-Allow-Origin": ok ? origin : (allowed.find((a) => !a.startsWith("*.")) ?? ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

const hex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(input: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

export function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return hex(a);
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

/** Stateless unsubscribe signature: works for every email we ever send, nothing to store. */
export async function unsubscribeSig(subscriberId: string): Promise<string> {
  const key = await hmacKey(env("UNSUBSCRIBE_SECRET"));
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(subscriberId)));
}

export async function verifyUnsubscribeSig(subscriberId: string, sig: string): Promise<boolean> {
  const expected = await unsubscribeSig(subscriberId);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** Uniform random integer in [0, max) without modulo bias. */
export function secureRandomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) throw new Error("invalid range");
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? "";
}

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret || !token) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const d = await r.json();
    return d.success === true;
  } catch {
    return false;
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normalizeEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
export const clip = (v: unknown, max: number) => (v == null ? null : String(v).slice(0, max));
