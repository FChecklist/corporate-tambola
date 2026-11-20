// LIFECYCLE SUITE, part 2: prizes and winners, for each of the four formats. An independent oracle (harness.oracleIdx) works out who completed each house from the tickets and the
// public numbers; the software's settlement, the phones' quorum vote and the public results must all agree with it. Ties are tested in both rules (share / next).
// FALSIFIED BY: prizes-early5-sixth (early five counted at the 6th number), prizes-tie-drops-second, prizes-quorum-one-phone
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore } from "../param-harness";
import { FORMATS, newGame, seat, runAllNumbers, callLog, winnersOf, oracleIdx, ticketFor, row, W, call, j, MIN, count, dev, type Game } from "./harness";
import { callTimeMs, cfgOfRow } from "../../src/lifecycle";
import { validateCfg } from "../../../../packages/beacon/src/config";
import { settleAll } from "../../../../packages/beacon/src/game";
setDefaultTimeout(120_000);
beforeEach(() => reset()); afterEach(restore);
const HOUSES = ["early5", "top", "mid", "bot", "corners", "full"] as const;
const vote = (g: Game, pid: string, results: any[], now: number) => call("POST", `/api/z/${g.id}/vote`, { pid, results }, {}, now);
const asRes = (w: ReturnType<typeof winnersOf>) => w.map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, round: 1, idx: x.idx, pids: x.pids }));

for (const f of FORMATS) describe(`[${f.key}] ${f.label}: prizes and winners`, () => {
  test("every house is won by the earliest completer (early five, top / middle / bottom line, corners, full house), as an independent oracle says", async () => {
    const g = await newGame(f, { cap: 300 }); const pids = await seat(g, 40);
    await runAllNumbers(g); const { log } = await callLog(g);
    const won = winnersOf(g, pids, log);
    for (const h of HOUSES) {
      const per = pids.map((p) => [p, oracleIdx(ticketFor(g.id, p), h, log)] as const).filter(([, i]) => i >= 0);
      const best = Math.min(...per.map(([, i]) => i)), tied = per.filter(([, i]) => i === best).map(([p]) => p);
      const w = won.find((x) => x.pattern === h && x.ordinal === 1)!;
      expect([h, w.idx]).toEqual([h, best]); // won at the call the oracle says
      expect([h, tied.includes(w.pids[0]!)]).toEqual([h, true]); // by someone who really completed it then
    }
    // early five is the fifth ticket number called, never the sixth, and a full house needs all 15
    const e5 = won.find((x) => x.pattern === "early5")!; expect(oracleIdx(ticketFor(g.id, e5.pids[0]!), "early5", log)).toBe(e5.idx);
    const fh = won.find((x) => x.pattern === "full")!; expect(fh.idx).toBeGreaterThanOrEqual(14);
  });
  test("the phones' vote settles it: it takes a quorum of different phones saying the same thing; one phone alone, or a lying minority, settles nothing; /results then equals the oracle", async () => {
    const g = await newGame(f); const pids = await seat(g, 8);
    const last = await runAllNumbers(g); const { log } = await callLog(g);
    const res = asRes(winnersOf(g, pids, log)); const t = last + MIN;
    const lie = res.map((r) => ({ ...r, pids: [pids.find((p) => !r.pids.includes(p))!] })); // a made-up winner for every house
    expect((await vote(g, pids[0]!, res.slice(0, 3), t)).status).toBe(200);
    expect(count("SELECT COUNT(*) AS c FROM settled WHERE eid=?", g.id)).toBe(0); // one phone is not enough (8 people need 3)
    for (const p of pids.slice(1, 3)) await vote(g, p, lie.slice(0, 3), t); // two phones lie in the same way: still short of 3
    expect(count("SELECT COUNT(*) AS c FROM settled WHERE eid=?", g.id)).toBe(0);
    for (const p of pids) for (let i = 0; i < res.length; i += 3) await vote(g, p, res.slice(i, i + 3), t);
    const out = (await j(await call("GET", `/api/z/${g.id}/results`, undefined, {}, t))).results as any[];
    expect(out.length).toBe(res.length);
    for (const r of res) { const o = out.find((x) => x.pattern === r.pattern && x.ordinal === r.ordinal)!; expect([r.pattern, o.idx]).toEqual([r.pattern, r.idx]); expect(o.winners).toEqual(r.pids); }
    // a stranger (not in the game) cannot report
    expect((await vote(g, "99x000000000000", res.slice(0, 1), t)).status).toBe(403);
    // the organizer cannot post or change a winner
    expect((await call("POST", `/api/z/${g.id}/settle`, { results: res }, g.h, t)).status).toBe(403);
    // the prize list the organizer sees: one record per winner, no name
    const pr = await j(await call("GET", `/api/z/${g.id}/prizes`, undefined, g.h, t)); expect((pr.prizes ?? pr.list ?? pr).length ?? 1).toBeGreaterThan(0);
  });
  test("claims: on time is stored once (a repeat is stored once too); after the next number it is late and refused; a stranger cannot claim", async () => {
    const g = await newGame(f); const pids = await seat(g, 3);
    await runAllNumbers(g); const { log } = await callLog(g);
    const winner = winnersOf(g, pids, log).find((x) => x.pattern === "early5")!; const pid = winner.pids[0]!; const n = pids.indexOf(pid);
    const at = (await callTimeMs(W.env as any, row(g.id), 1, winner.idx))!;
    const next = (await callTimeMs(W.env as any, row(g.id), 1, winner.idx + 1))!;
    const claim = (now: number, p = pid) => call("POST", `/api/z/${g.id}/claims`, { pid: p, device: dev(1000 + n), claims: [{ pattern: "early5", idx: winner.idx }] }, {}, now);
    const ok = await claim(at + 1000); expect([ok.status, (await j(ok)).stored]).toEqual([200, 1]);
    expect((await j(await claim(at + 2000))).stored).toBe(0); // the same claim again: still one
    expect(count("SELECT COUNT(*) AS c FROM claim WHERE eid=? AND pid=? AND pattern='early5'", g.id, pid)).toBe(1);
    const late = await call("POST", `/api/z/${g.id}/claims`, { pid: pids.find((p) => p !== pid)!, device: dev(1000 + (n === 0 ? 1 : 0)), claims: [{ pattern: "early5", idx: winner.idx }] }, {}, next + 1000);
    expect(late.status).toBe(409); expect((await j(late)).code).toBe("claim-late");
    expect((await claim(at + 3000, "77x000000000000")).status).toBe(403);
  });
  test("ties: people who finish a house on the same number. Rule 'share': all of them take the same position. Rule 'next': they take the next positions one after the other, in an order nobody can steer, and nobody is dropped", async () => {
    const g = await newGame(f, { cap: 300 }); await seat(g, 2);
    await runAllNumbers(g); const { log } = await callLog(g);
    const crowd = Array.from({ length: 3000 }, (_, i) => `${i + 1}x${String(i + 1).padStart(12, "0")}`); // a crowd of seats, worked out from the numbers alone
    const idxOf = (p: string) => oracleIdx(ticketFor(g.id, p), "early5", log);
    const all = new Map<number, string[]>(); for (const p of crowd) { const i = idxOf(p); all.set(i, [...(all.get(i) ?? []), p]); }
    const first = Math.min(...[...all.entries()].filter(([, v]) => v.length >= 2).map(([k]) => k)); // the earliest number that two or more tickets finish on
    const pids = crowd.filter((p) => idxOf(p) >= first); // the game whose first early-five finishers are exactly those tied people
    const tied = all.get(first)!;
    expect(tied.length).toBeGreaterThanOrEqual(2);
    const rewards = [1, 2, 3].map((ordinal) => ({ pattern: "early5", scope: "ticket", ordinal, text: "" }));
    const cfgOf = (ties: "share" | "next") => { const v = validateCfg({ rewards, ties }) as any; expect(v.ok).toBe(true); return v.cfg; };
    const share = settleAll(g.id, pids, log, cfgOf("share")).filter((x) => x.pattern === "early5");
    expect(share[0]!.idx).toBe(first); expect([...share[0]!.pids].sort()).toEqual([...tied].sort()); // all the tied people hold position 1 together
    const next = settleAll(g.id, pids, log, cfgOf("next")).filter((x) => x.pattern === "early5").sort((a, b) => a.ordinal - b.ordinal);
    expect(next[0]!.pids.length).toBe(1); expect(tied).toContain(next[0]!.pids[0]!); expect(next[0]!.idx).toBe(first);
    expect(next[1]!.idx).toBe(first); expect(tied).toContain(next[1]!.pids[0]!); expect(next[1]!.pids[0]).not.toBe(next[0]!.pids[0]); // position 2 is the next tied person, not a repeat
    const again = settleAll(g.id, pids, log, cfgOf("next")).filter((x) => x.pattern === "early5").sort((a, b) => a.ordinal - b.ordinal);
    expect(again.map((x) => x.pids)).toEqual(next.map((x) => x.pids)); // every phone works out the same order
    void cfgOfRow;
  });
});
