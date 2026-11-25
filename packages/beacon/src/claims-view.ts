/**
 * The organizer's claims queue and wrong-claim view (owner gap list 2026-11-24, item d). Pure: it only reads what the console already holds (the claims list with Bogeys flagged, as
 * GET /api/z/{id}/claims gives it, and the published results with their winning ticket numbers). Ticket numbers only, never names. The software still decides the winners; this is a read-only view.
 */
export interface ClaimIn { pid: string; pattern: string; round?: number; idx: number; atMs?: number; bogey?: boolean }
export interface ResultIn { pattern: string; round?: number; ordinal?: number; count?: number; tickets?: number[] }
export interface QueueRow { ticket: number; pattern: string; round: number; atMs: number; call: number; status: "won" | "being-checked" | "not-a-winner" }
export interface WrongRow { ticket: number; pattern: string; round: number; atMs: number; times: number; out: boolean }
const seat = (pid: string): number => { const m = /^(\d{1,7})x/.exec(String(pid)); return m ? Number(m[1]) : 0; };

/** Oldest first. A claim is "won" when a published result for the same prize and round lists its ticket; "not-a-winner" when such a result exists, lists every winner (up to 5) and not this ticket; otherwise "being-checked". */
export function claimsQueue(claims: readonly ClaimIn[], results: readonly ResultIn[], bogeysOut = 2): { queue: QueueRow[]; wrong: WrongRow[]; waiting: number } {
  const rs = results.filter((r) => r.pattern !== "lucky" && r.pattern !== "unlucky");
  const queue: QueueRow[] = claims.filter((c) => !c.bogey).map((c) => {
    const t = seat(c.pid), round = c.round ?? 1, hit = rs.filter((r) => r.pattern === c.pattern && (r.round ?? 1) === round);
    const won = hit.some((r) => (r.tickets ?? []).includes(t));
    const complete = hit.length > 0 && hit.every((r) => (r.tickets ?? []).length >= (r.count ?? 0));
    return { ticket: t, pattern: c.pattern, round, atMs: c.atMs ?? 0, call: c.idx + 1, status: won ? "won" as const : complete ? "not-a-winner" as const : "being-checked" as const };
  }).sort((a, b) => a.atMs - b.atMs || a.ticket - b.ticket);
  const by = new Map<string, WrongRow>();
  for (const c of claims.filter((x) => x.bogey)) {
    const t = seat(c.pid), round = c.round ?? 1, k = `${round}|${c.pattern}|${t}`, w = by.get(k);
    if (w) { w.times++; w.out = w.times >= bogeysOut; w.atMs = Math.max(w.atMs, c.atMs ?? 0); } else by.set(k, { ticket: t, pattern: c.pattern, round, atMs: c.atMs ?? 0, times: 1, out: 1 >= bogeysOut });
  }
  return { queue, wrong: [...by.values()].sort((a, b) => b.atMs - a.atMs || a.ticket - b.ticket), waiting: queue.filter((q) => q.status === "being-checked").length };
}
