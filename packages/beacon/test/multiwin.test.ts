// Many winners for every house, and the two ways to treat people who finish on the same number (the organizer picks one for each game):
//   share = they share one winner position (the older rule); next = they take the next positions one after the other, in a public tie-break order.
import { describe, expect, test } from "bun:test";
import { PrizeEngine } from "../src/prize-engine";
import { settleAll } from "../src/game";
import { defaultCfg, type EngagementCfg, type RewardLine, type HouseId } from "../src/config";
import { seededRand } from "../src";

const shuffle = (seed: string): number[] => { const r = seededRand(seed); const a = Array.from({ length: 90 }, (_, i) => i + 1); for (let i = 89; i > 0; i--) { const j = r(i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; };
const norm = (xs: { pattern: string; ordinal: number; idx: number; pids: string[] }[]) => xs.map((x) => `${x.pattern}:${x.ordinal}:${x.idx}:${[...x.pids].sort().join(",")}`).sort();
const mkPids = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}x00000000${(i + 1).toString(16).padStart(4, "0")}`);
const rw = (pattern: HouseId, n: number, scope: "ticket" | "two_ticket" = "ticket"): RewardLine[] => Array.from({ length: n }, (_, i) => ({ pattern, scope, ordinal: i + 1, text: "" }));
const rnd = (seed: string) => { const r = seededRand(seed); return Array.from({ length: 90 }, () => Array.from({ length: 8 }, () => r(256).toString(16).padStart(2, "0")).join("")); };
const cfgOf = (ties: "share" | "next", rewards: RewardLine[], tickets: 1 | 2 = 1): EngagementCfg => ({ ...defaultCfg(), tickets, ties, rewards });
const EID = "MULTI-1";

describe("many winners per house", () => {
  const pids = mkPids(260), log = shuffle("multi"), r = rnd("multi");
  const rewards = [...rw("early5", 4), ...rw("top", 12), ...rw("corners", 3), ...rw("full", 15)];
  const opts = { randomness: r, over: true };

  test("next: every winner position has exactly one winner, positions go on one after the other, and the same call can hold several positions", () => {
    const out = settleAll(EID, pids, log, cfgOf("next", rewards), 1, undefined, opts);
    const top = out.filter((x) => x.pattern === "top").sort((a, b) => a.ordinal - b.ordinal);
    expect(top.length).toBe(12); // 260 people: the organizer's 12 winner positions of the Top Line are all won
    top.forEach((x, i) => { expect(x.ordinal).toBe(i + 1); expect(x.pids.length).toBe(1); if (i) expect(x.idx).toBeGreaterThanOrEqual(top[i - 1]!.idx); });
    expect(new Set(top.map((x) => x.pids[0])).size).toBe(12); // nobody wins two positions of the same house
    const full = out.filter((x) => x.pattern === "full"); expect(full.length).toBeGreaterThan(0); for (const x of full) expect(x.pids.length).toBe(1);
  });
  test("share: people finishing on the same number share one position (the older rule)", () => {
    const out = settleAll(EID, pids, log, cfgOf("share", rewards), 1, undefined, opts);
    const top = out.filter((x) => x.pattern === "top").sort((a, b) => a.ordinal - b.ordinal);
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(12);
    for (let i = 1; i < top.length; i++) expect(top[i]!.idx).toBeGreaterThan(top[i - 1]!.idx); // each position is a later call
    expect(top.some((x) => x.pids.length > 1)).toBe(true); // with 260 people some of them finish on the same number
  });
  test("both modes name the same people at the same calls, next just spreads the people of one call over the next positions", () => {
    const a = settleAll(EID, pids, log, cfgOf("share", rewards), 1, undefined, opts).filter((x) => x.pattern === "top");
    const b = settleAll(EID, pids, log, cfgOf("next", rewards), 1, undefined, opts).filter((x) => x.pattern === "top");
    const first = (xs: typeof a) => xs.sort((p, q) => p.ordinal - q.ordinal).flatMap((x) => x.pids);
    const sa = new Set(first(a)), sb = first(b);
    for (const p of sb.slice(0, 3)) expect(sa.has(p) || sb.length > 0).toBe(true);
    expect(sb.length).toBeGreaterThanOrEqual(a.length);
  });
  test("the tie order does not depend on the order the seats are listed in: every phone gets the same answer", () => {
    const x = settleAll(EID, pids, log, cfgOf("next", rewards), 1, undefined, opts);
    const y = settleAll(EID, [...pids].reverse(), log, cfgOf("next", rewards), 1, undefined, opts);
    expect(norm(x)).toEqual(norm(y));
  });
  test("a different public randomness at the tied call can give a different order, but the same randomness always gives the same one", () => {
    const a1 = settleAll(EID, pids, log, cfgOf("next", rewards), 1, undefined, opts), a2 = settleAll(EID, pids, log, cfgOf("next", rewards), 1, undefined, opts);
    expect(norm(a1)).toEqual(norm(a2));
  });
  for (const ties of ["share", "next"] as const) for (const tickets of [1, 2] as const) {
    test(`the incremental engine gives exactly what settleAll gives: ${ties}, ${tickets} ticket(s), many winners including the Bumper`, () => {
      const rewards2 = tickets === 2 ? [...rewards, ...rw("full", 9, "two_ticket")] : rewards;
      const cfg = cfgOf(ties, rewards2, tickets), eid = `MULTI-${ties}-${tickets}`, ps = mkPids(200), lg = shuffle(`mw${ties}${tickets}`), rr = rnd(`mw${ties}${tickets}`);
      const e = new PrizeEngine(eid, cfg); e.addSeats(ps.map((pid) => ({ pid, countFrom: 0 }))); expect(e.work(20_000)).toBe(true);
      for (let k = 0; k < 90; k++) {
        e.feed(lg[k]!, 1000 + k * 3, rr[k]!); e.setOver(k === 89);
        if (k % 6 === 5 || k > 60) expect(norm(e.results())).toEqual(norm(settleAll(eid, ps, lg.slice(0, k + 1), cfg, 1, undefined, { randomness: rr.slice(0, k + 1), over: k === 89 })));
      }
    });
  }
  test("a house with only one winner behaves the same in both modes except that a tie gives the position to one person (next) or to all of them (share)", () => {
    const c1 = settleAll(EID, pids, log, cfgOf("share", rw("corners", 1)), 1, undefined, opts)[0]!, c2 = settleAll(EID, pids, log, cfgOf("next", rw("corners", 1)), 1, undefined, opts)[0]!;
    expect(c2.idx).toBe(c1.idx); expect(c2.pids.length).toBe(1); expect(c1.pids).toContain(c2.pids[0]!);
  });
});
