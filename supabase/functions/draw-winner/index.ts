// POST /functions/v1/draw-winner   (admin only, requires a logged-in admin's JWT)
// { action: "lock",   giveawayId }            -> freezes eligible entries, stores + returns the fingerprint
// { action: "draw",   giveawayId }            -> picks one winner from the frozen snapshot
// { action: "accept" | "forfeit", drawId, notes? }
import { adminClient, corsHeaders, json, secureRandomInt, sha256Hex } from "../_shared/util.ts";

const PAGE = 1000;

// deno-lint-ignore no-explicit-any
async function fetchAll(q: (from: number, to: number) => any): Promise<any[]> {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

const fingerprint = (ids: string[]) => sha256Hex([...ids].sort().join("\n"));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const db = adminClient();
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: userData } = await db.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json(req, { error: "unauthorized" }, 401);
  const { data: role } = await db.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (!role) return json(req, { error: "forbidden" }, 403);

  const b = await req.json().catch(() => ({}));

  try {
    if (b.action === "lock") {
      const { data: g } = await db.from("giveaways").select("*").eq("id", b.giveawayId).single();
      if (!g) return json(req, { error: "not_found" }, 404);
      if (g.entries_locked_at) return json(req, { error: "already_locked", entriesHash: g.entries_hash }, 409);
      if (new Date() < new Date(g.ends_at)) return json(req, { error: "entries_still_open" }, 409);

      const rows = await fetchAll((from, to) => db.from("subscribers").select("id, country")
        .eq("giveaway_id", g.id)
        .not("confirmed_at", "is", null)
        .lt("confirmed_at", g.ends_at)
        .gte("created_at", g.starts_at)
        .is("unsubscribed_at", null)
        .is("bounced_at", null)
        .order("id").range(from, to));
      const ids = rows.filter((r) => !g.excluded_countries.includes(r.country)).map((r) => r.id as string);
      if (ids.length === 0) return json(req, { error: "no_eligible_entries" }, 409);

      for (let i = 0; i < ids.length; i += PAGE) {
        const { error } = await db.from("giveaway_entries").insert(ids.slice(i, i + PAGE).map((subscriber_id) => ({ giveaway_id: g.id, subscriber_id })));
        if (error) throw error;
      }
      const entriesHash = await fingerprint(ids);
      await db.from("giveaways").update({ entries_hash: entriesHash, entries_locked_at: new Date().toISOString(), status: "closed" }).eq("id", g.id);
      return json(req, { ok: true, eligibleCount: ids.length, entriesHash });
    }

    if (b.action === "draw") {
      const { data: g } = await db.from("giveaways").select("*").eq("id", b.giveawayId).single();
      if (!g?.entries_locked_at) return json(req, { error: "lock_entries_first" }, 409);

      const entries = (await fetchAll((from, to) => db.from("giveaway_entries").select("subscriber_id").eq("giveaway_id", g.id).order("subscriber_id").range(from, to)))
        .map((e) => e.subscriber_id as string);
      if (await fingerprint(entries) !== g.entries_hash) return json(req, { error: "snapshot_integrity_failed" }, 500);

      const { data: prior } = await db.from("giveaway_draws").select("winner_subscriber_id, status").eq("giveaway_id", g.id);
      const activeWinners = (prior ?? []).filter((d) => d.status !== "forfeited").length;
      if (activeWinners >= g.winners_count) return json(req, { error: "all_winners_drawn" }, 409);

      const alreadyDrawn = new Set((prior ?? []).map((d) => d.winner_subscriber_id));
      const pool = entries.filter((id) => !alreadyDrawn.has(id));
      if (pool.length === 0) return json(req, { error: "pool_empty" }, 409);

      const winnerId = pool[secureRandomInt(pool.length)];
      const { data: draw, error } = await db.from("giveaway_draws").insert({
        giveaway_id: g.id, drawn_by: user.id, eligible_count: entries.length, entries_hash: g.entries_hash, winner_subscriber_id: winnerId,
      }).select("id, drawn_at").single();
      if (error) throw error;
      const { data: winner } = await db.from("subscribers").select("email, first_name, country").eq("id", winnerId).single();
      return json(req, { ok: true, drawId: draw.id, drawnAt: draw.drawn_at, poolSize: pool.length, eligibleCount: entries.length, winner });
    }

    if (b.action === "accept" || b.action === "forfeit") {
      const status = b.action === "accept" ? "accepted" : "forfeited";
      const { data: d, error } = await db.from("giveaway_draws").update({ status, notes: b.notes ?? null }).eq("id", b.drawId).select("giveaway_id").single();
      if (error) throw error;
      const { data: g } = await db.from("giveaways").select("winners_count").eq("id", d.giveaway_id).single();
      const { count } = await db.from("giveaway_draws").select("id", { count: "exact", head: true }).eq("giveaway_id", d.giveaway_id).eq("status", "accepted");
      if (g && (count ?? 0) >= g.winners_count) await db.from("giveaways").update({ status: "drawn" }).eq("id", d.giveaway_id);
      return json(req, { ok: true, status });
    }

    return json(req, { error: "unknown_action" }, 400);
  } catch (e) {
    console.error("draw-winner", e);
    return json(req, { error: "server_error" }, 500);
  }
});
