// Game alerts: the server half of the "Yes, notify me when this game begins" button (the button is apps/web/public/push-boot.js; the notification service is corporate-push,
// a separate private repository, spec pinned at f1e93f59f45444711edbb66e632fe1333bf8f9cb). DARK: with PUSH_URL (an https address) or PUSH_ADMIN_KEY (a secret) missing, every
// function here returns at once and NO request is made. Nothing here reads or stores a browser address: the service keeps those, 24 hours at most, and we only tell it two things:
//   1. POST /send  { scope: "game:<id>", kind: "game_begins", title, body, url }  ONCE per game, when the game really starts (the service has no one-send-per-game guard, so the flag
//      `engagement.push_sent_ms` is ours: it is claimed with one conditional UPDATE BEFORE the first send, so two ticks at the same moment cannot both send);
//   2. POST /purge { scope: "game:<id>" }  whenever the game's participant data is deleted (erasePersonal in lifecycle.ts: the 20-hour job, a manual delete by the organizer, a cancelled
//      or unplayed game, the 365-day clean-up). A purge that fails is written down (kv `pushpurge/<id>`) and tried again by every tick for 3 days; the service's own 24-hour limit is the backstop.
// The admin key goes only in the Authorization header of these calls. It is never logged, never put in an answer, never written to the database.
import type { D1 } from "./worker";

export interface PushEnv { DB: D1; PUSH_URL?: string; PUSH_ADMIN_KEY?: string; PUBLIC_ORIGIN?: string }

/** The flag on the game row: null = no alert yet; a time (ms) = the alert was sent (or is being sent) at that time; -1 = no alert will be sent (the game started too long ago, or the service never answered in time). */
export const PUSH_SCHEMA: string[] = [
  `ALTER TABLE engagement ADD COLUMN push_sent_ms INTEGER`,
];

const HOST = /^https:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]*[a-z0-9])?(:[0-9]{1,5})?$/i;
const GAME_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const ALERT_TITLE = "The game is starting";
export const ALERT_BODY = "Tap to join now.";
/** An alert for a game that began more than this long ago is no longer true ("begins"): it is not sent. */
export const STALE_MS = 30 * 60_000;
/** A failed first send is tried again at the next tick for this long after the start, then given up. */
export const RETRY_MS = 10 * 60_000;
/** A failed purge is tried again for this long, then left to the service's own 24-hour limit. */
export const PURGE_RETRY_MS = 3 * 86_400_000;
const LOOKBACK_MS = 24 * 3_600_000;
const MAX_PAGES = 20;   // the service sends to 40 browsers per call: 800 per game in one tick
const BUDGET = 30;      // outside calls per tick (a free Worker allows 50 per request, and the rest of the tick needs some)
const GENESIS = 1692803367;
const roundAtMs = (ms: number) => Math.floor((ms / 1000 - GENESIS) / 3) + 1;

/** The service address and key, or null unless BOTH are set and the address is a real https one. This is the one switch: null means dark. */
export function pushService(env: { PUSH_URL?: string; PUSH_ADMIN_KEY?: string }): { base: string; key: string } | null {
  const base = String(env.PUSH_URL ?? "").trim().replace(/\/+$/, "");
  const key = String(env.PUSH_ADMIN_KEY ?? "");
  if (!key.trim() || !HOST.test(base)) return null;
  return { base, key };
}

async function post(svc: { base: string; key: string }, path: string, body: unknown): Promise<{ ok: boolean; json: any }> {
  try {
    const r = await fetch(svc.base + path, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + svc.key }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    let json: any = null;
    try { json = await r.json(); } catch { /* an answer with no body */ }
    return { ok: r.ok, json };
  } catch { return { ok: false, json: null }; } // never throws, never logs: the caller decides what a failure means
}

/**
 * The game's data was deleted: ask the service to delete every saved browser address of that game. Returns true when the service said yes, or when there is nothing to do (dark).
 * A refusal or a lost connection is written down so the tick tries again.
 */
export async function purgeGameAlerts(env: PushEnv, eid: string, now = Date.now()): Promise<boolean> {
  const svc = pushService(env);
  if (!svc || !GAME_ID.test(eid)) return true;
  const r = await post(svc, "/purge", { scope: "game:" + eid });
  if (r.ok) return true;
  try { await env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind("pushpurge/" + eid, String(now)).run(); } catch { /* the service's own 24-hour limit still ends it */ }
  return false;
}

/** What one tick did (numbers only). */
export interface PushTickResult { sent: number; games: number; skipped: number; purgeRetried: number }

/**
 * Once per tick (cron every minute, plus the lazy tick): (1) tries failed purges again; (2) sends the "game begins" alert for every game that has really started and has none yet.
 * `startOf(e)` is the time of the game's first call (callTimeMs in lifecycle.ts: null until a manual-start game is started by its Host or Organizer).
 */
export async function pushTick(env: PushEnv, now: number, startOf: (e: any) => Promise<number | null>): Promise<PushTickResult> {
  const out: PushTickResult = { sent: 0, games: 0, skipped: 0, purgeRetried: 0 };
  const svc = pushService(env);
  if (!svc) return out; // dark: no database read, no request
  let budget = BUDGET;

  // 1. purges that failed
  const waiting = (await env.DB.prepare("SELECT k, v FROM kv WHERE k >= 'pushpurge/' AND k < 'pushpurge0' ORDER BY k LIMIT 10").all<{ k: string; v: string }>()).results ?? [];
  for (const w of waiting) {
    const eid = w.k.slice("pushpurge/".length);
    if (now - Number(w.v) > PURGE_RETRY_MS || !GAME_ID.test(eid)) { await env.DB.prepare("DELETE FROM kv WHERE k=?").bind(w.k).run(); continue; }
    if (budget <= 0) break;
    budget--;
    if ((await post(svc, "/purge", { scope: "game:" + eid })).ok) { await env.DB.prepare("DELETE FROM kv WHERE k=?").bind(w.k).run(); out.purgeRetried++; }
  }

  // 2. the alert for a game that has begun. The link must be on our own site: with no PUBLIC_ORIGIN nothing is sent (a host is never guessed).
  const origin = String(env.PUBLIC_ORIGIN ?? "").trim().replace(/\/+$/, "");
  if (!HOST.test(origin)) return out;
  const rows = (await env.DB.prepare("SELECT e.* FROM engagement e LEFT JOIN life l ON l.eid=e.id WHERE e.push_sent_ms IS NULL AND e.cancelled_ms IS NULL AND e.pack IS NOT 0 AND l.purged_ms IS NULL AND e.start_round <= ? AND e.start_round >= ? ORDER BY e.start_round LIMIT 25").bind(roundAtMs(now), roundAtMs(now - LOOKBACK_MS)).all<any>()).results ?? [];
  for (const e of rows) {
    if (budget <= 0) break; // the rest wait for the next tick
    if (!GAME_ID.test(String(e.id))) continue;
    const at = await startOf(e);
    if (at === null || !Number.isFinite(at) || now < at) continue; // not started yet (a manual-start game waits for its Start)
    if (now - at > STALE_MS) { await env.DB.prepare("UPDATE engagement SET push_sent_ms=-1 WHERE id=? AND push_sent_ms IS NULL").bind(e.id).run(); out.skipped++; continue; }
    // claim the game BEFORE sending: only the tick whose UPDATE changes the row sends
    const claimed = await env.DB.prepare("UPDATE engagement SET push_sent_ms=? WHERE id=? AND push_sent_ms IS NULL").bind(now, e.id).run();
    if ((claimed.meta?.changes ?? 0) < 1) continue;
    out.games++;
    const message = { scope: "game:" + e.id, kind: "game_begins", title: ALERT_TITLE, body: ALERT_BODY, url: `${origin}/z.html?e=${encodeURIComponent(e.id)}` };
    let after: unknown = undefined, pages = 0, delivered = false;
    while (pages < MAX_PAGES && budget > 0) {
      budget--; pages++;
      const r = await post(svc, "/send", after === undefined ? message : { ...message, after_id: after });
      if (!r.ok) break;
      delivered = true;
      out.sent += Number(r.json?.sent) || 0;
      const next = r.json?.next_after_id;
      if (next === undefined || next === null) break;
      after = next;
    }
    if (!delivered) { // the service did not take even the first page: try again at the next tick for a while, then give up (never a late "begins")
      if (now - at <= RETRY_MS) await env.DB.prepare("UPDATE engagement SET push_sent_ms=NULL WHERE id=? AND push_sent_ms=?").bind(e.id, now).run();
      else await env.DB.prepare("UPDATE engagement SET push_sent_ms=-1 WHERE id=? AND push_sent_ms=?").bind(e.id, now).run();
    }
  }
  return out;
}
