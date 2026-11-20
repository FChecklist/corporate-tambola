// SMOKE 20 NOV, owner step 16 + the engine rule checks (4 Nov simulation, "Tambola 0.01% failure"): ticket rules, number rules, and EVERY prize house against an oracle written from the house's plain description.
// No server and no clock: pure rule checks at scale, so a one-in-ten-thousand failure has a real chance to show.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { ticketFor, ticketsFor, settleAll, completionIndexKey } from "../../../../packages/beacon/src/game";
import { deriveCalls } from "../../../../packages/beacon/src";
import { isValidTicket, ticketNumbers, type Ticket } from "../../../../packages/shared/src/ticket";
import { defaultCfg, PRIZE_HOUSES, quorumFor, votersFor, type EngagementCfg, type RewardLine, type PatternKey, type HouseId } from "../../../../packages/beacon/src/config";
setDefaultTimeout(300_000);

const pidOfSeat = (s: number) => `${s}x${"0".repeat(11)}${(s % 16).toString(16)}`;
const rand = (round: number) => createHash("sha256").update("smoke|" + round).digest("hex");
const logOf = (eid: string) => deriveCalls(eid, Array.from({ length: 90 }, (_, k) => rand(k + 1)));

describe("E1 tickets: every ticket obeys the housie rules (3 x 9, 5 per row, 15 numbers, every column used, column ranges, sorted down the column), no two tickets of a game are equal", () => {
  for (const [n, eid] of [[1, "SMK-A"], [2, "SMK-B"], [9, "SMK-C"], [50, "SMK-D"], [250, "SMK-E"], [500, "SMK-F"], [1000, "SMK-G"], [1001, "SMK-H"], [20000, "SMK-I"], [60000, "SMK-J"]] as const) test(`${n} tickets of one game: all valid, all different`, () => {
    const seen = new Set<string>();
    for (let s = 1; s <= n; s++) { const t = ticketFor(eid, pidOfSeat(s)); if (!isValidTicket(t)) throw new Error(`invalid ticket at seat ${s}: ${JSON.stringify(t)}`); seen.add(JSON.stringify(t)); }
    expect(seen.size).toBe(n);
  });
  test("old-style participants (no seat number in the id) also get valid tickets, 30000 of them, and the same ticket every time", () => {
    for (let i = 0; i < 30000; i++) { const pid = "legacy" + i; const t = ticketFor("SMK-L", pid); if (!isValidTicket(t)) throw new Error("invalid " + i); }
    expect(JSON.stringify(ticketFor("SMK-L", "legacy7"))).toBe(JSON.stringify(ticketFor("SMK-L", "legacy7")));
  });
  test("two-ticket games: the second ticket is valid, different from the first and from every other ticket (5000 players)", () => {
    const all = new Set<string>();
    for (let s = 1; s <= 5000; s++) { const [a, b] = ticketsFor("SMK-T", pidOfSeat(s), 2) as [Ticket, Ticket]; expect(isValidTicket(b)).toBe(true); all.add(JSON.stringify(a)); all.add(JSON.stringify(b)); }
    expect(all.size).toBe(10000);
  });
});
describe("E2 numbers: 90 numbers, each once, 1 to 90, the same every time, different in every game, no number position favoured", () => {
  test("3000 games: every call log is a permutation of 1..90, repeatable, and the first number is spread over all 90 (no number more than 3x its share over 9000 games)", () => {
    const firsts = new Array(91).fill(0); const logs = new Set<string>();
    for (let g = 0; g < 9000; g++) {
      const eid = "SMK-N" + g, a = deriveCalls(eid, Array.from({ length: 90 }, (_, k) => rand(k + 1 + g * 7)));
      if (g < 3000) { expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1)); expect(deriveCalls(eid, Array.from({ length: 90 }, (_, k) => rand(k + 1 + g * 7)))).toEqual(a); }
      firsts[a[0]!]++; logs.add(a.join(","));
    }
    expect(logs.size).toBe(9000);
    for (let n = 1; n <= 90; n++) expect(firsts[n]).toBeLessThan(300); // expected 100 each
    for (let n = 1; n <= 90; n++) expect(firsts[n]).toBeGreaterThan(30);
  });
  test("the same randomness in a different game gives a different order (a number cannot be guessed from another game's numbers)", () => {
    expect(logOf("SMK-X1")).not.toEqual(logOf("SMK-X2"));
  });
});

// ---------- independent oracle: each house from its plain description (config.ts PRIZE_HOUSES.how), not from the engine's code
const R = (t: Ticket, r: number) => t[r]!.filter((v): v is number => v !== null);
const lastIdx = (nums: number[], log: readonly number[]) => { let m = -1; for (const n of nums) { const i = log.indexOf(n); if (i < 0) return -1; m = Math.max(m, i); } return m; };
const nthHit = (hits: number[], need: number, log: readonly number[]) => { const idx = hits.map((n) => log.indexOf(n)).filter((i) => i >= 0).sort((a, b) => a - b); return idx.length >= need ? idx[need - 1]! : -1; };
const ORACLE: Record<string, (t: Ticket, log: readonly number[]) => number> = {
  early5: (t, l) => nthHit(ticketNumbers(t), 5, l), early7: (t, l) => nthHit(ticketNumbers(t), 7, l), early10: (t, l) => nthHit(ticketNumbers(t), 10, l),
  top: (t, l) => lastIdx(R(t, 0), l), mid: (t, l) => lastIdx(R(t, 1), l), bot: (t, l) => lastIdx(R(t, 2), l),
  twolines: (t, l) => { const ix = [0, 1, 2].map((r) => lastIdx(R(t, r), l)).filter((i) => i >= 0).sort((a, b) => a - b); return ix.length >= 2 ? ix[1]! : -1; },
  corners: (t, l) => lastIdx([R(t, 0)[0]!, R(t, 0)[4]!, R(t, 2)[0]!, R(t, 2)[4]!], l),
  star: (t, l) => lastIdx([R(t, 0)[0]!, R(t, 0)[4]!, R(t, 2)[0]!, R(t, 2)[4]!, R(t, 1)[2]!], l),
  plus: (t, l) => lastIdx([...R(t, 1), R(t, 0)[2]!, R(t, 2)[2]!], l),
  frame: (t, l) => lastIdx([...R(t, 0), ...R(t, 2), R(t, 1)[0]!, R(t, 1)[4]!], l),
  topbottom: (t, l) => lastIdx([...R(t, 0), ...R(t, 2)], l),
  midcorners: (t, l) => lastIdx([...R(t, 1), R(t, 0)[0]!, R(t, 0)[4]!, R(t, 2)[0]!, R(t, 2)[4]!], l),
  odd5: (t, l) => nthHit(ticketNumbers(t).filter((n) => n % 2 === 1), 5, l), even5: (t, l) => nthHit(ticketNumbers(t).filter((n) => n % 2 === 0), 5, l),
  low5: (t, l) => nthHit(ticketNumbers(t).filter((n) => n >= 1 && n <= 30), 5, l), high5: (t, l) => nthHit(ticketNumbers(t).filter((n) => n >= 61 && n <= 90), 5, l),
  full: (t, l) => lastIdx(ticketNumbers(t), l),
};
const SINGLE: HouseId[] = ["early5", "early7", "early10", "top", "mid", "bot", "twolines", "corners", "star", "plus", "frame", "topbottom", "midcorners", "odd5", "even5", "low5", "high5", "full"] as HouseId[];
const lines = (pattern: string, n: number): RewardLine[] => Array.from({ length: n }, (_, i) => ({ pattern: pattern as any, scope: "ticket" as const, ordinal: i + 1, text: "" }));
const cfgFor = (pattern: string, n: number, ties: "share" | "next"): EngagementCfg => ({ ...defaultCfg(), ties, rewards: lines(pattern, n) });
/** independent expected winners: groups of people by the call they completed at, earliest first; share = one position per group, next = people of a group take positions one by one (we only check the SET and COUNT, the order inside a group is the public tie-break) */
function expectedGroups(eid: string, pids: string[], log: readonly number[], house: string) {
  const g = new Map<number, string[]>();
  for (const p of pids) { const i = ORACLE[house]!(ticketFor(eid, p), log); if (i >= 0) (g.get(i) ?? g.set(i, []).get(i)!).push(p); }
  return [...g.entries()].sort((a, b) => a[0] - b[0]);
}
describe("E3 every prize house equals the oracle, for 3 winner positions, in both tie rules, over many games and crowds (ties included)", () => {
  let tiesSeen = 0;
  for (const house of SINGLE) for (const ties of ["share", "next"] as const) test(`${house} / ties=${ties}: positions 1 to 3 equal the oracle in 24 games of 300 to 1000 players`, () => {
    let tied = 0;
    for (let g = 0; g < 24; g++) {
      const eid = `SMK-H-${house}-${g}`, n = [300, 500, 1000][g % 3]!, log = logOf(eid + ties), pids = Array.from({ length: n }, (_, i) => pidOfSeat(i + 1));
      const got = settleAll(eid, pids, log, cfgFor(house, 3, ties));
      const exp = expectedGroups(eid, pids, log, house);
      if (ties === "share") {
        for (let k = 0; k < 3; k++) { const e = exp[k], r = got.find((x) => x.ordinal === k + 1);
          if (!e) { expect(r).toBeUndefined(); continue; }
          expect(r).toBeDefined(); expect([house, g, k, r!.idx]).toEqual([house, g, k, e[0]]); expect([...r!.pids].sort()).toEqual([...e[1]].sort()); if (e[1].length > 1) tied++;
        }
      } else {
        const flat: { idx: number; set: string[] }[] = []; for (const [idx, ps] of exp) flat.push({ idx, set: ps });
        let seq: { idx: number; pid: string }[] = []; for (const f of flat) { if (f.set.length > 1) tied++; const here = got.filter((x) => x.idx === f.idx); seq = seq.concat(here.sort((a, b) => a.ordinal - b.ordinal).map((x) => ({ idx: f.idx, pid: x.pids[0]! }))); }
        // positions are given one person at a time, in call order; people of the same call are all given a position before the next call is considered
        const win = got.sort((a, b) => a.ordinal - b.ordinal);
        const expectLen = Math.min(3, exp.reduce((s, [, ps]) => s + ps.length, 0));
        expect(win.length).toBe(expectLen);
        let cursor = 0; for (const w of win) { expect(w.pids.length).toBe(1); while (exp[cursor] && !exp[cursor]![1].includes(w.pids[0]!)) { cursor++; } expect(exp[cursor]?.[0]).toBe(w.idx); }
        for (const w of win) expect(exp.some(([i, ps]) => i === w.idx && ps.includes(w.pids[0]!))).toBe(true);
        expect(new Set(win.map((w) => w.pids[0]!)).size).toBe(win.length); // nobody wins two positions of one house
        // order inside a tie is the same on every run and does not depend on the order the players are listed in
        const again = settleAll(eid, [...pids].reverse(), log, cfgFor(house, 3, ties)).sort((a, b) => a.ordinal - b.ordinal);
        expect(again.map((x) => x.pids[0])).toEqual(win.map((x) => x.pids[0]));
      }
    }
    tiesSeen += tied; expect(tied).toBeGreaterThanOrEqual(0);
  });
  test("ties really were exercised (some house in some game had 2 or more people finish on the same number)", () => { expect(tiesSeen).toBeGreaterThan(10); });
});
describe("E3b two-ticket houses and Unlucky", () => {
  for (const ties of ["share", "next"] as const) test(`Super Bumper (full2) and a house of ticket 1 / ticket 2 only, ties=${ties}`, () => {
    for (let g = 0; g < 10; g++) {
      const eid = `SMK-2T-${g}`, log = logOf(eid), pids = Array.from({ length: 800 }, (_, i) => pidOfSeat(i + 1));
      const cfg: EngagementCfg = { ...defaultCfg(), tickets: 2, ties, rewards: [{ pattern: "full" as any, scope: "two_ticket", ordinal: 1, text: "" }, { pattern: "top" as any, scope: "ticket_1", ordinal: 1, text: "" }, { pattern: "top" as any, scope: "ticket_2", ordinal: 1, text: "" }] };
      const got = settleAll(eid, pids, log, cfg);
      // oracle
      const best = (f: (ts: Ticket[]) => number) => { const grp = new Map<number, string[]>(); for (const p of pids) { const i = f(ticketsFor(eid, p, 2)); if (i >= 0) (grp.get(i) ?? grp.set(i, []).get(i)!).push(p); } return [...grp.entries()].sort((a, b) => a[0] - b[0])[0]; };
      const full2 = best((ts) => lastIdx(ts.flatMap(ticketNumbers), log)), t1 = best((ts) => ORACLE.top!(ts[0]!, log)), t2 = best((ts) => ORACLE.top!(ts[1]!, log));
      for (const [key, e] of [["full2", full2], ["top@1", t1], ["top@2", t2]] as const) {
        const r = got.filter((x) => x.pattern === key); if (!e) { expect(r.length).toBe(0); continue; }
        expect(r.length).toBeGreaterThanOrEqual(1); expect(r[0]!.idx).toBe(e[0]);
        if (ties === "share") expect([...r[0]!.pids].sort()).toEqual([...e[1]].sort()); else expect(e[1]).toContain(r[0]!.pids[0]!);
      }
    }
  });
  test("Unlucky: exactly one winner, and that ticket has the fewest numbers marked at that moment (80 games)", () => {
    for (let g = 0; g < 80; g++) {
      const eid = `SMK-U-${g}`, log = logOf(eid), pids = Array.from({ length: 150 }, (_, i) => pidOfSeat(i + 1));
      const cfg: EngagementCfg = { ...defaultCfg(), ties: "next", rewards: [...lines("full", 1), ...lines("unlucky", 1)] };
      const got = settleAll(eid, pids, log, cfg), u = got.filter((x) => x.pattern === "unlucky");
      expect(u.length).toBe(1); expect(u[0]!.pids.length).toBe(1);
      const upto = new Set(log.slice(0, u[0]!.idx + 1)), marked = (p: string) => ticketNumbers(ticketFor(eid, p)).filter((n) => upto.has(n)).length;
      expect(marked(u[0]!.pids[0]!)).toBe(Math.min(...pids.map(marked)));
    }
  });
});
describe("E4 phones' quorum and voters at every crowd size", () => {
  for (const n of [1, 2, 3, 6, 9, 12, 13, 50, 100, 250, 500, 1000, 1001, 2000]) test(`${n} players: quorum is at least 1, never above the voters, never above 25, and a lone liar cannot settle a prize when there are 3 or more voters`, () => {
    const q = quorumFor(n), v = votersFor(n);
    expect(q).toBeGreaterThanOrEqual(1); expect(q).toBeLessThanOrEqual(Math.max(1, Math.min(n, v))); expect(q).toBeLessThanOrEqual(25);
    if (n >= 3) expect(q).toBeGreaterThanOrEqual(Math.min(2, n));
  });
});
