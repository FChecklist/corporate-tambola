// PRESENCE (1.6.3): "about how many phones are listening right now". A phone that is in front (a hidden page is silent) tells the server once in a while; the server
// only counts. To keep the writes small, a phone reports only in the minutes where (ticket number mod K) = (minute mod K), K = ceil(cap / 5), and each report counts K
// phones: so about 5 reports a minute for the whole game (about 300 small writes an hour) however big it is, and the estimate is the average of the last 5 complete minutes. No names, numbers or tickets are stored: one
// counter per game and minute, erased after a day. A silent hidden tab is not "offline": the console says "listening" (in front), never "missing".
import type { D1 } from "./worker";
import { PRESENCE_PER_MIN, presenceK } from "../../../packages/beacon/src/beat";

export { PRESENCE_PER_MIN, presenceK };
const ready = new WeakSet<object>();
async function init(db: D1) {
  if (ready.has(db)) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS presence (eid TEXT NOT NULL, minute INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (eid, minute))").run();
  ready.add(db);
}
/** One report from a phone: counts `k` phones in this minute. `k` is clamped to what the game's size allows, so nobody can inflate the number by much. */
export async function reportPresence(db: D1, eid: string, cap: number, k: unknown, now: number): Promise<void> {
  await init(db);
  const kk = Math.min(presenceK(cap), Math.max(1, Math.floor(Number(k)) || 1));
  await db.prepare("INSERT INTO presence(eid,minute,n) VALUES(?,?,?) ON CONFLICT(eid,minute) DO UPDATE SET n=n+excluded.n").bind(eid, Math.floor(now / 60_000), kk).run();
}
/** The console's number: the average of the last 5 COMPLETE minutes (the running one is still filling; a single minute holds only a handful of samples), plus the 10 minutes for a small graph. */
export async function readPresence(db: D1, eid: string, now: number): Promise<{ listening: number | null; minute: number; recent: number[] }> {
  await init(db);
  const cur = Math.floor(now / 60_000);
  const rows = (await db.prepare("SELECT minute, n FROM presence WHERE eid=? AND minute>=? AND minute<? ORDER BY minute").bind(eid, cur - 10, cur).all<{ minute: number; n: number }>()).results ?? [];
  const by = new Map(rows.map((r) => [r.minute, r.n]));
  const recent = Array.from({ length: 10 }, (_, i) => by.get(cur - 10 + i) ?? 0);
  if (rows.length) db.prepare("DELETE FROM presence WHERE minute<?").bind(cur - 24 * 60).run().catch(() => {}); // a day is plenty
  const last5 = recent.slice(5), seen = rows.some((r) => r.minute >= cur - 5);
  return { listening: seen ? Math.round(last5.reduce((a, b) => a + b, 0) / 5) : null, minute: cur - 1, recent };
}
