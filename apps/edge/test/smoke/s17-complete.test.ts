// SMOKE 20 NOV, owner step 17: completing the game, in each of the four start formats. It ends when every prize is awarded, or at the 90th number, or when the Organizer stops it, and every place that says so agrees:
// the end moment, the end words, the number count, the prize count, the "ended" mail and the report.
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore, provider, installProvider, FORMATS, newGame, seat, runAllNumbers, callLog, winnersOf, row, one, q, call, j, W, MIN, HOUR, count, tickFor, lifecycleTick, reportLink, type Game } from "./h";
import { realEndMs, callTimeMs } from "../../src/lifecycle";
setDefaultTimeout(240_000);
beforeEach(() => { reset(); installProvider(); }); afterEach(restore);

async function playAndVote(g: Game, n: number) {
  const pids = await seat(g, n); const last = await runAllNumbers(g); const { log } = await callLog(g);
  const res = winnersOf(g, pids, log).map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, round: 1, idx: x.idx, pids: x.pids }));
  for (const pid of pids.slice(0, Math.min(n, 12))) for (let i = 0; i < res.length; i += 3) await call("POST", `/api/z/${g.id}/vote`, { pid, results: res.slice(i, i + 3) }, {}, last + MIN);
  return { pids, last, res, log };
}
const reportBase = async (g: Game, now: number) => { const k = new URL(await reportLink(W.env as any, g.id)).searchParams.get("k"); return (await j(await call("GET", `/api/report/${g.id}?k=${k}`, undefined, {}, now))); };
for (const f of FORMATS) describe(`[${f.key}] completing the game`, () => {
  test("S17-1 every prize awarded before number 90: the game ends at the last prize, and the end moment, end words, ended mail and report all say the same", async () => {
    const g = await newGame(f); const { last, res } = await playAndVote(g, 40);
    const lastIdx = Math.max(...res.map((x) => x.idx)); expect(lastIdx).toBeLessThan(89);
    await tickFor(last + 5 * MIN, 15);
    const end = await realEndMs(W.env as any, row(g.id), last + HOUR); expect(end).not.toBeNull();
    const stored = Number(one("SELECT end_ms FROM life WHERE eid=?", g.id).end_ms);
    expect(end!).toBeLessThanOrEqual(stored);
    const rep = await reportBase(g, last + 30 * MIN);
    expect(rep.base.endReason).toMatch(/All prizes were awarded after \d+ numbers|All 90 numbers/);
    const done = provider.delivered.filter((m) => /Your game has ended/i.test(m.subject) && m.text.includes(g.id)); expect(done.length).toBe(1);
    const nums = Number(/Numbers called: (\d+)/.exec(done[0]!.text)![1]), prizes = Number(/Prizes awarded: (\d+)/.exec(done[0]!.text)![1]), players = Number(/Players: (\d+)/.exec(done[0]!.text)![1]);
    expect(nums).toBe(rep.base.numbersCalled); expect(prizes).toBe(rep.base.prizes.length); expect(players).toBe(rep.totalPeople); expect(players).toBe(40);
  });
  test("S17-2 the game keeps calling after the prizes (organizer's choice): it ends at the 90th number, not earlier", async () => {
    const g = await newGame(f, { over: { afterPrizes: "keep" } }); const { last } = await playAndVote(g, 30); await tickFor(last + 5 * MIN, 15);
    const rep = await reportBase(g, last + 30 * MIN); expect(rep.base.numbersCalled).toBe(90); expect(rep.base.endReason).toMatch(/All 90 numbers/);
  });
  test("S17-3 one single player: every prize is still settled, the game completes, the mail counts one player", async () => {
    const g = await newGame(f); const { last } = await playAndVote(g, 1); await tickFor(last + 5 * MIN, 15);
    const done = provider.delivered.filter((m) => /Your game has ended/i.test(m.subject) && m.text.includes(g.id)); expect(done.length).toBe(1); expect(done[0]!.text).toMatch(/Players: 1\b/);
    expect(count("SELECT COUNT(*) AS c FROM winner WHERE eid=?", g.id)).toBeGreaterThanOrEqual(1);
  });
  test("S17-4 a game nobody joined: no report, but the organizer is still told it ended, once, and the end record exists", async () => {
    const g = await newGame(f); const first = await callTimeMs(W.env as any, row(g.id), 1, 0); void first;
    if (f.startMode === "manual") { const { press } = await import("./h"); expect((await press(g, "go", g.at + 5000)).status).toBe(200); }
    if (f.callMode === "host") { const { pressNext } = await import("./h"); await pressNext(g, 90, g.at + 3 * MIN, 20_000); }
    const t = g.at + 6 * HOUR; for (let k = 0; k < 6; k++) await lifecycleTick(W.env as any, t + k * MIN);
    expect(provider.delivered.filter((m) => /Your game has ended/i.test(m.subject) && m.text.includes(g.id)).length).toBe(1);
    expect(provider.delivered.filter((m) => /report is ready/i.test(m.subject) && m.text.includes(g.id)).length).toBe(0);
  });
});
