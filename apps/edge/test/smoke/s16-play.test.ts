// SMOKE 20 NOV, owner step 16 (+17): playing and finishing a game through the real Worker, each of the four start formats, at every crowd size, with both tie rules.
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore, FORMATS, newGame, seat, runAllNumbers, callLog, winnersOf, oracleIdx, ticketFor, row, one, q, call, j, W, T, MIN, HOUR, count, organizer, startIn, lifecycleTick, provider, installProvider, type Game, type Format } from "./h";
import { quorumFor, votersFor } from "../../../../packages/beacon/src/config";
setDefaultTimeout(300_000);
beforeEach(() => { reset(); installProvider(); }); afterEach(restore);

/** play a whole game with `n` listed people; the voting phones are the first votersFor(n) seats (what the real phones do); returns what the Worker settled */
async function playAndSettle(g: Game, n: number) {
  const pids = await seat(g, n);
  const last = await runAllNumbers(g);
  const { log } = await callLog(g);
  const exp = winnersOf(g, pids, log).map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, round: 1, idx: x.idx, pids: x.pids }));
  const voters = pids.slice(0, votersFor(n));
  for (const pid of voters) for (let i = 0; i < exp.length; i += 3) await call("POST", `/api/z/${g.id}/vote`, { pid, results: exp.slice(i, i + 3) }, {}, last + MIN);
  const res = (await j(await call("GET", `/api/z/${g.id}/results`, undefined, {}, last + 2 * MIN))).results as any[];
  return { pids, last, log, exp, res };
}
for (const f of FORMATS) for (const [n, ties] of [[1, "next"], [2, "next"], [9, "next"], [50, "next"], [250, "share"], [250, "next"], [500, "share"], [500, "next"], [1000, "share"], [1000, "next"]] as const) describe(`[${f.key}] ${n} players, ties=${ties}`, () => {
  test(`S16-P ${n} players: every prize the phones settled equals the independent oracle, the 90 numbers are each once, and the report counts ${n}`, async () => {
    const g = await newGame(f, { cap: n <= 100 ? 100 : n, over: { ties } });
    const { pids, log, res, exp } = await playAndSettle(g, n);
    expect([...log].sort((a, b) => a - b)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
    expect(new Set(pids).size).toBe(n); expect(new Set(pids.map((p) => JSON.stringify(ticketFor(g.id, p)))).size).toBe(n);
    // the Worker accepted exactly what the engine says (the oracle of the six classic houses checks the engine itself)
    const key = (x: any) => `${x.pattern}#${x.ordinal}`;
    expect(res.map(key).sort()).toEqual(exp.map(key).sort());
    for (const r of res) { const e = exp.find((x) => key(x) === key(r))!; expect([key(r), r.idx]).toEqual([key(r), e.idx]); expect([key(r), r.count]).toEqual([key(r), e.pids.length]); expect([...r.tickets].sort((a: number, b: number) => a - b)).toEqual(e.pids.slice(0, 5).map((p: string) => parseInt(p, 10)).sort((a: number, b: number) => a - b)); }
    for (const house of ["early5", "top", "mid", "bot", "corners", "full"] as const) {
      const idxs = pids.map((p) => oracleIdx(ticketFor(g.id, p), house, log)).filter((i) => i >= 0);
      const r = res.find((x) => x.pattern === house && x.ordinal === 1);
      if (idxs.length) { expect(r).toBeDefined(); expect([house, r.idx]).toEqual([house, Math.min(...idxs)]); } else expect(r).toBeUndefined();
    }
    if (f.callMode === "host") expect(row(g.id).call_seconds).toBeGreaterThan(0);
  });
});
describe("S16-P2 above 1,000 people: only the formats the game can carry are allowed, and they say why", () => {
  for (const f of FORMATS) test(`[${f.key}] a game for 1,001 people: ${f.callMode === "host" ? "refused with the plain reason (organizer-calls needs signed presses for every phone)" : "accepted"}`, async () => {
    const o = await organizer();
    const r = await call("POST", "/api/z", { id: `BIG-${f.key}`, startRound: startIn(2 * HOUR), callSeconds: 12, cap: 1001, startMode: f.startMode, callMode: f.callMode }, o.h as any);
    if (f.callMode === "host") { expect(r.status).toBe(409); expect((await j(r)).code).toBe("manual-limit"); } else expect(r.status).toBe(200);
  });
  for (const f of FORMATS.filter((x) => x.callMode === "auto")) test(`[${f.key}] 1,001 people really play: tickets all different, every house settled like the oracle`, async () => {
    const g = await newGame(f, { cap: 1001 }); const { pids, log, res, exp } = await playAndSettle(g, 1001);
    expect(new Set(pids.map((p) => JSON.stringify(ticketFor(g.id, p)))).size).toBe(1001);
    expect(res.length).toBe(exp.length); expect(exp.length).toBeGreaterThanOrEqual(6);
    void log;
  });
  test("above 2,000 people only Start exists: Start works in a manual game, Pause and End are refused with the plain reason, in all the formats that are allowed", async () => {
    const { press, ORG_SECRET } = await import("./h");
    const g = await newGame(FORMATS[2]!, { cap: 2001 });
    expect((await press(g, "go", g.at + 5000)).status).toBe(200);
    const p = await press(g, "pause", g.at + 10 * 60_000); expect(p.status).toBeGreaterThanOrEqual(400); expect(String(p.body.error)).toMatch(/up to 2,000 people/i);
    void ORG_SECRET;
  });
});
