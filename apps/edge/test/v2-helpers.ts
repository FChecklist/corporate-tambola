// Small helpers shared by the V2 test files (kept apart from param-harness.ts, which is not changed).
import { W, T, call, j, join, keyH } from "./param-harness";

/** The game really ended at `at` (what the phones' confirmed "over" reports write). */
export const endGame = (id: string, at: number) =>
  W.raw.prepare("INSERT INTO life(eid,end_ms,end_src) VALUES(?,?,'phones') ON CONFLICT(eid) DO UPDATE SET end_ms=excluded.end_ms, end_src='phones'").run(id, at);
/** A game key (ctg_) made by the organizer. */
export async function gameKey(g: { key: string; id: string }, over: Record<string, unknown> = {}): Promise<string> {
  const r = await call("POST", `/api/z/${g.id}/v2/keys`, over, keyH(g.key)); const b = await j(r);
  if (r.status !== 200) throw new Error("gameKey: " + JSON.stringify(b)); return b.key as string;
}
/** A Host key made without personal data. */
export async function labelHost(g: { key: string; id: string }, label = "Priya"): Promise<string> {
  const r = await call("POST", `/api/z/${g.id}/v2/host`, { label }, keyH(g.key)); const b = await j(r);
  if (r.status !== 200) throw new Error("labelHost: " + JSON.stringify(b)); return b.hostKey as string;
}
/** `n` guests join (names "Guest 1" ... and mobiles from the harness). Returns their ticket numbers in order. */
export async function guests(id: string, n: number): Promise<number[]> {
  for (let i = 1; i <= n; i++) { const r = await join(id, i); if (r.status !== 200) throw new Error("join " + i + ": " + JSON.stringify(await j(r))); }
  return (W.raw.prepare("SELECT seq FROM seat WHERE eid=? ORDER BY seq").all(id) as { seq: number }[]).map((r) => r.seq);
}
/** The phones' agreed winners, as the game records them (no names in this table). */
export const winner = (id: string, pattern: string, ordinal: number, seat: number, round = 1) =>
  W.raw.prepare("INSERT OR IGNORE INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES(?,?,?,?,?,?,?,'test')").run(id, round, pattern, ordinal, seat, 10 + seat, T);
export { T };
