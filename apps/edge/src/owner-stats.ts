// The owner's console numbers (owner order 2026-10-27): one read-only call for the private console on the IT Services site.
//   GET /api/owner/stats    header x-owner-stats-key: <OWNER_STATS_KEY>   (its own key, NOT the platform key, so the console can read and can do nothing else)
// Answers counts and the e-mail addresses of organizers who PAID (the invoice address). A mobile number is never shown: Corporate Tambola keeps phones only as one-way hashes.
// Any other caller gets the same 404 as an unknown address, and every call is written to the owner's access log. No player data of any kind is returned.
import { logAccess } from "./audit";
import type { D1, Env } from "./worker";
import RELEASES from "./releases.json";

export interface StatsEnv extends Env { OWNER_STATS_KEY?: string }

const same = (a: string, b: string): boolean => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const one = async <T>(db: D1, sql: string, ...b: unknown[]): Promise<T | null> => { try { return await (db.prepare(sql).bind(...b) as any).first() as T | null; } catch { return null; } };
const all = async <T>(db: D1, sql: string, ...b: unknown[]): Promise<T[]> => { try { return ((await (db.prepare(sql).bind(...b) as any).all()).results ?? []) as T[]; } catch { return []; } };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Counts for the console. A game is MADE when it has a permanent record, STARTED when its start time has passed, COMPLETED when it reached its end (a life row), CANCELLED when the organizer cancelled it. */
export async function ownerStats(env: StatsEnv, now: number): Promise<Record<string, unknown>> {
  const db = env.DB;
  const GEN = 1692803367; // the same round clock the rest of the Worker uses (3-second rounds)
  const nowRound = Math.floor((now / 1000 - GEN) / 3) + 1;
  const made = (await one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM game_record"))?.n ?? 0;
  const live = (await one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM engagement WHERE rehearsal_of IS NULL"))?.n ?? 0; // (a rehearsal is not a game of its own in the numbers)
  const started = (await one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM game_record WHERE start_round<=?", nowRound))?.n ?? 0;
  const completed = (await one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM game_record WHERE outcome IS NOT NULL"))?.n ?? 0;
  const cancelled = (await one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM engagement WHERE cancelled_ms IS NOT NULL AND rehearsal_of IS NULL"))?.n ?? 0;
  const outcomes = await all<{ outcome: string }>(db, "SELECT outcome FROM game_record WHERE outcome IS NOT NULL");
  let players = 0, winners = 0, biggest = 0;
  for (const r of outcomes) { try { const o = JSON.parse(r.outcome); const j = Number(o.joined) || 0; players += j; winners += Number(o.winnerPositions) || 0; if (j > biggest) biggest = j; } catch { /* a damaged row counts for nothing */ } }
  const playersNow = (await one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM participant WHERE eid NOT IN (SELECT id FROM engagement WHERE rehearsal_of IS NOT NULL)"))?.n ?? 0;
  const organizers = (await one<{ n: number }>(db, "SELECT COUNT(DISTINCT org) AS n FROM game_record WHERE org IS NOT NULL"))?.n ?? 0;
  const pays = await all<{ email: string; n: number; paid: number; last: number }>(db,
    "SELECT email, COUNT(*) AS n, COALESCE(SUM(amount),0) AS paid, MAX(paid_ms) AS last FROM payment WHERE status='paid' GROUP BY email ORDER BY last DESC LIMIT 500");
  const upcoming = await all<{ id: string; cap: number; pack: number | null; start_round: number }>(db, "SELECT id, cap, pack, start_round FROM engagement WHERE start_round>? AND cancelled_ms IS NULL AND rehearsal_of IS NULL ORDER BY start_round ASC LIMIT 20", nowRound);
  return {
    site: "corporate-tambola", asOf: new Date(now).toISOString(),
    release: { version: (RELEASES as any[])[0]?.version ?? null, date: (RELEASES as any[])[0]?.date ?? null, title: (RELEASES as any[])[0]?.title ?? null, releases: (RELEASES as any[]).length },
    games: { made, kept: live, started, completed, cancelled, upcoming: upcoming.length },
    players: { everJoined: players, joinedNow: playersNow, biggestGame: biggest, winnerPositions: winners },
    organizers: { distinct: organizers, paying: pays.length },
    organizerContacts: pays.map((p) => ({ email: p.email, paidOrders: p.n, paidAmount: p.paid, lastPaid: p.last ? new Date(p.last).toISOString() : null, mobile: null })),
    mobileNote: "Mobile numbers of organizers and hosts are kept only as one-way hashes and cannot be shown.",
    upcoming: upcoming.map((u) => ({ id: u.id, cap: u.cap, pack: u.pack, starts: new Date((GEN + (u.start_round - 1) * 3) * 1000).toISOString() })),
  };
}

export async function ownerStatsRoute(req: Request, env: StatsEnv, now: number): Promise<Response | null> {
  if (new URL(req.url).pathname !== "/api/owner/stats") return null;
  const ok = req.method === "GET" && !!env.OWNER_STATS_KEY && same(req.headers.get("x-owner-stats-key") ?? "", env.OWNER_STATS_KEY);
  if (!ok) { await logAccess(env.DB, now, "denied:stats", null, null, 0, false, null); return json({ error: "Not found" }, 404); }
  const out = await ownerStats(env, now);
  await logAccess(env.DB, now, "owner-stats", null, null, 0, true, null);
  return json(out);
}
