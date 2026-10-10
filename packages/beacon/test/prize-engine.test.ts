import { describe, expect, test } from "bun:test";
import { PrizeEngine, countFromOf } from "../src/prize-engine";
import { settleAll } from "../src/game";
import { defaultCfg, type EngagementCfg } from "../src/config";
import { seededRand } from "../src";

const shuffle = (seed: string): number[] => { const r = seededRand(seed); const a = Array.from({ length: 90 }, (_, i) => i + 1); for (let i = 89; i > 0; i--) { const j = r(i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; };
const norm = (xs: { pattern: string; ordinal: number; idx: number; pids: string[] }[]) => xs.map((x) => `${x.pattern}:${x.ordinal}:${x.idx}:${[...x.pids].sort().join(",")}`).sort();
const cfgOf = (tickets: 1 | 2, extra: Partial<EngagementCfg> = {}): EngagementCfg => ({ ...defaultCfg(), tickets, ...extra });
const mkPids = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}x00000000${(i + 1).toString(16).padStart(4, "0")}`);

describe("the engine gives exactly what settleAll gives", () => {
  for (const tickets of [1, 2] as const) {
    test(`${tickets} ticket(s): 120 participants, numbers fed one at a time, same winners as the whole-log answer along the way`, () => {
      const cfg = cfgOf(tickets); const eid = "PE-" + tickets;
      const pids = mkPids(120);
      const log = shuffle("log" + tickets), start = 1000, br = (k: number) => start + k * 3;
      const e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); expect(e.work(10_000)).toBe(true);
      for (let k = 0; k < 90; k++) {
        e.feed(log[k]!, br(k));
        if (k % 9 === 8 || k > 70) expect(norm(e.results())).toEqual(norm(settleAll(eid, pids, log.slice(0, k + 1), cfg)));
      }
    });
  }
  test("late joiners: only numbers from their count-from round count; the whole-log answer with the same rule agrees along the way", () => {
    const cfg = cfgOf(1); const eid = "PE-LATE", start = 2000;
    const pids = mkPids(80);
    const log = shuffle("late"), callRounds = log.map((_, k) => start + k * 3);
    const cf = new Map<string, number>(); pids.forEach((p, i) => { if (i >= 40) cf.set(p, countFromOf(start + 3 * (5 + (i % 40)))); }); // the second half joined at different times, mid-game
    const e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: cf.get(pid) ?? 0 }))); e.work(10_000);
    for (let k = 0; k < 90; k++) { e.feed(log[k]!, callRounds[k]!); if (k % 6 === 5 || k === 89) expect(norm(e.results())).toEqual(norm(settleAll(eid, pids, log.slice(0, k + 1), cfg, 1, { countFrom: cf, callRounds: callRounds.slice(0, k + 1) }))); }
    expect(cf.size).toBe(40); expect([...cf.values()].every((v) => v > start)).toBe(true);
  });
  test("a late joiner cannot win with numbers called before they joined: a ticket that would have won early does not", () => {
    const cfg = cfgOf(1), eid = "PE-NOWIN", start = 100, pid = "1x00000000aaaa";
    const log = shuffle("nowin"), callRounds = log.map((_, k) => start + k * 3);
    const full = settleAll(eid, [pid], log, cfg); // counting everything, this one ticket wins every house somewhere
    const early = full.find((x) => x.pattern === "early5")!;
    const joinedAfter = new Map([[pid, callRounds[early.idx]! + 1]]); // joined just after the call that completed Early Five
    const masked = settleAll(eid, [pid], log, cfg, 1, { countFrom: joinedAfter, callRounds });
    expect(masked.find((x) => x.pattern === "early5")?.idx ?? 999).toBeGreaterThan(early.idx); // later, or never: never at the old call
    const e = new PrizeEngine(eid, cfg); e.addSeats([{ pid, countFrom: joinedAfter.get(pid)! }]); e.work(1000); log.forEach((n, k) => e.feed(n, callRounds[k]!));
    expect(norm(e.results())).toEqual(norm(masked));
  });
  test("seats that arrive after numbers were already called are caught up and give the same answer as the whole-log rule", () => {
    const cfg = cfgOf(1), eid = "PE-CATCH", start = 3000;
    const pids = mkPids(60);
    const log = shuffle("catch"), callRounds = log.map((_, k) => start + k * 3);
    const cf = new Map<string, number>(); for (const p of pids.slice(30)) cf.set(p, countFromOf(start + 3 * 20)); // joined at call 20
    const e = new PrizeEngine(eid, cfg); e.addSeats(pids.slice(0, 30).map((pid) => ({ pid, countFrom: 0 }))); e.work(10_000);
    for (let k = 0; k < 50; k++) e.feed(log[k]!, callRounds[k]!);
    e.addSeats(pids.slice(30).map((pid) => ({ pid, countFrom: cf.get(pid)! }))); e.work(10_000); // the delta arrives at call 50
    for (let k = 50; k < 90; k++) e.feed(log[k]!, callRounds[k]!);
    expect(norm(e.results())).toEqual(norm(settleAll(eid, pids, log, cfg, 1, { countFrom: cf, callRounds })));
  });
  test("building tickets in small slices gives the same answer, and resetCalls plus the same feed gives the same answer again", () => {
    const cfg = cfgOf(2), eid = "PE-SLICE", pids = mkPids(200);
    const log = shuffle("slice");
    const e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: 0 })));
    let slices = 0; let t = 0; while (!e.work(1, () => (t += 0.4))) slices++; // tiny budget: many slices
    expect(slices).toBeGreaterThan(20); expect(e.seatCount).toBe(200);
    for (let k = 0; k < 90; k++) e.feed(log[k]!, 100 + k);
    const a = norm(e.results()); expect(a).toEqual(norm(settleAll(eid, pids, log, cfg)));
    e.resetCalls(); expect(e.results()).toEqual([]); for (let k = 0; k < 90; k++) e.feed(log[k]!, 100 + k);
    expect(norm(e.results())).toEqual(a);
  });
  test("a seat is only counted once however many times it is offered", () => {
    const e = new PrizeEngine("PE-DUP", cfgOf(1)); e.addSeats([{ pid: "1xabcdef012345", countFrom: 0 }, { pid: "1xabcdef012345", countFrom: 0 }]); e.addSeats([{ pid: "1xabcdef012345", countFrom: 99 }]);
    expect(e.seatCount).toBe(1);
  });
  test("10,000 seats with two tickets are built in slices and each call is cheap enough for a phone", () => {
    const cfg = cfgOf(2), eid = "PE-BIG", pids = mkPids(10_000);
    const e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: 0 })));
    const t0 = performance.now(); while (!e.work(40)) { /* one slice per tick */ } const build = performance.now() - t0;
    const log = shuffle("big"); const t1 = performance.now(); for (let k = 0; k < 90; k++) e.feed(log[k]!, 5000 + k); const feed = performance.now() - t1;
    console.log(`10,000 seats x 2 tickets: build ${Math.round(build)} ms in total, 90 calls ${Math.round(feed)} ms (${(feed / 90).toFixed(1)} ms per call)`);
    expect(e.results().length).toBeGreaterThan(0); expect(feed / 90).toBeLessThan(50);
  }, 120_000);
});

describe("seats built AFTER numbers were called (every late joiner's phone) give the same winners as seats built before (20-game rehearsal G11)", () => {
  // found in the rehearsal: build() replayed the called numbers ticket by ticket, so for a participant with TWO tickets "their other ticket got there first" kept the LATER completion
  // of the first ticket and dropped the EARLIER one of the second ticket. A phone that built the tickets late then saw a different tie (2 winners instead of 3) than every other phone.
  for (const tickets of [1, 2] as const) {
    test(`${tickets} ticket(s): 300 seats, engine A has the seats from the start, engine B gets the same seats only after 40 numbers were called`, () => {
      const cfg = cfgOf(tickets); const eid = "PE-LATEBUILD-" + tickets, pids = mkPids(300), log = shuffle("latebuild" + tickets), br = (k: number) => 5000 + k * 3;
      const a = new PrizeEngine(eid, cfg); a.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); a.work(10_000);
      const b = new PrizeEngine(eid, cfg);
      for (let k = 0; k < 90; k++) { a.feed(log[k]!, br(k)); b.feed(log[k]!, br(k)); if (k === 39) { b.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); b.work(10_000); } }
      expect(norm(b.results())).toEqual(norm(a.results()));
      expect(norm(a.results())).toEqual(norm(settleAll(eid, pids, log, cfg)));
    });
  }
  test("a two-ticket seat whose SECOND ticket completes first is recorded at the earlier call", () => {
    // search for a seat whose second ticket completes Early Five before its first ticket does, then check a late-built engine records the earlier call
    const cfg = cfgOf(2, { rewards: [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "e" }] as any }); const eid = "PE-ORDER";
    const pids = mkPids(400), log = shuffle("order");
    const whole = settleAll(eid, pids, log, cfg);
    const late = new PrizeEngine(eid, cfg); for (let k = 0; k < 90; k++) late.feed(log[k]!, 100 + k * 3);
    late.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); late.work(10_000);
    expect(norm(late.results())).toEqual(norm(whole));
  });
});
