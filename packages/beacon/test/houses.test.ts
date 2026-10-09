// The houses added after the first seven (Early Seven/Ten, Two Lines, Plus, Frame, Top and Bottom, Middle and Corners, Odd/Even/Low/High Five) and Unlucky.
// Every house is decided by the same deterministic code on every phone: these tests pin the rules, that the incremental engine and the whole-log settlement agree, Unlucky's tie-break and
// exclusions, and the per-house maximum number of winners (and that games saved before the limits existed stay valid).
import { describe, expect, test } from "bun:test";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { ticketNumbers, type Ticket } from "../../shared/src/ticket";
import { HOUSE_ORDER, HOUSES_LINE, LEGACY_MAX_ORDINAL, MAX_REWARD_LINES, PATTERN_ORDER, PRIZE_HOUSES, defaultCfg, houseLabel, keysInPlay, maxWinnersFor, validateCfg, type EngagementCfg, type RewardLine, type HouseId } from "../src/config";
import { ruleOf, ticketCompletion, ticketStillNeeds, winningNumbers } from "../src/house-rules";
import { completionIndexKey, settleAll, stillToWin, ticketsFor, unluckyAt, unluckyPick } from "../src/game";
import { PrizeEngine, countFromOf } from "../src/prize-engine";
import { seededRand } from "../src";

// ---- a hand-made ticket: rows of five (the column positions do not matter to any rule)
const A = [4, 23, 45, 61, 82], B = [11, 28, 37, 66, 89], C = [9, 30, 55, 70, 90];
const mk = (row: number[]): (number | null)[] => { const out: (number | null)[] = Array(9).fill(null); [0, 2, 4, 6, 8].forEach((c, i) => (out[c] = row[i]!)); return out; };
const T: Ticket = [mk(A), mk(B), mk(C)];
const idxAfter = (key: HouseId | "full2", calls: number[]) => ticketCompletion(T, key, calls);
/** Calls in the given order, then everything else, so "the first call that completes it" is exactly the last listed number. */
const callsOf = (...nums: number[]) => nums;

const shuffle = (seed: string): number[] => { const r = seededRand(seed); const a = Array.from({ length: 90 }, (_, i) => i + 1); for (let i = 89; i > 0; i--) { const j = r(i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; };
const mkPids = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}x00000000${(i + 1).toString(16).padStart(4, "0")}`);
const norm = (xs: { pattern: string; ordinal: number; idx: number; pids: string[] }[]) => xs.map((x) => `${x.pattern}:${x.ordinal}:${x.idx}:${[...x.pids].sort().join(",")}`).sort();
const lines = (...ids: (HouseId | "full2")[]): RewardLine[] => ids.map((id) => id === "full2" ? { pattern: "full", scope: "two_ticket", ordinal: 1, text: "" } : { pattern: id, scope: "ticket", ordinal: 1, text: "" });
const NEW_IDS: HouseId[] = ["early7", "early10", "twolines", "plus", "frame", "topbottom", "midcorners", "odd5", "even5", "low5", "high5"];
const ALL_IDS: HouseId[] = ["early5", ...NEW_IDS, "top", "mid", "bot", "corners", "star", "full", "unlucky"];
const cfgWith = (tickets: 1 | 2, ids: (HouseId | "full2")[]): EngagementCfg => ({ ...defaultCfg(), tickets, rewards: lines(...ids) });
const rands = (seed: string) => Array.from({ length: 90 }, (_, k) => bytesToHex(sha256(utf8ToBytes(`${seed}|${k}`))));

describe("the house table", () => {
  test("ids are unique, labels are the owner's, and the maximum winners per house are exactly the agreed ones", () => {
    expect(new Set(PRIZE_HOUSES.map((h) => h.id)).size).toBe(PRIZE_HOUSES.length);
    const max: Record<string, number> = { unlucky: 1, early5: 1, early7: 1, early10: 1, top: 2, mid: 2, bot: 2, corners: 1, star: 1, full: 10, full2: 10, twolines: 1, plus: 1, frame: 1, topbottom: 1, midcorners: 1, odd5: 1, even5: 1, low5: 1, high5: 1 };
    expect(Object.fromEntries(PRIZE_HOUSES.map((h) => [h.id, h.max]))).toEqual(max);
    expect(houseLabel("early7")).toBe("Early Seven"); expect(houseLabel("early10")).toBe("Early Ten"); expect(houseLabel("twolines")).toBe("Two Lines"); expect(houseLabel("plus")).toBe("Plus");
    expect(houseLabel("frame")).toBe("Frame"); expect(houseLabel("topbottom")).toBe("Top and Bottom"); expect(houseLabel("midcorners")).toBe("Middle and Corners"); expect(houseLabel("odd5")).toBe("Odd Five");
    expect(houseLabel("even5")).toBe("Even Five"); expect(houseLabel("low5")).toBe("Low Five"); expect(houseLabel("high5")).toBe("High Five"); expect(houseLabel("unlucky")).toBe("Unlucky");
    for (const h of PRIZE_HOUSES) { expect(h.how.length).toBeGreaterThan(10); expect(maxWinnersFor(h.id)).toBe(h.max); }
    expect(HOUSES_LINE).toContain("unlucky = Unlucky (1 winner)"); expect(HOUSES_LINE).toContain("full = Full House (up to 10 winners)");
  });
  test("the game still starts with the original seven houses only, and the new ones follow the same display order", () => {
    expect(PATTERN_ORDER).toEqual(["early5", "top", "mid", "bot", "corners", "star", "full"]);
    expect(keysInPlay(defaultCfg().rewards)).toEqual([...PATTERN_ORDER]);
    expect(HOUSE_ORDER.filter((k) => (PATTERN_ORDER as readonly string[]).includes(k))).toEqual([...PATTERN_ORDER]);
    expect(MAX_REWARD_LINES).toBeGreaterThanOrEqual(PRIZE_HOUSES.reduce((n, h) => n + h.max, 0));
  });
  test("Five Corners would have been Star: four corners plus the centre of the middle line, so Plus replaces it", () => {
    const star = ruleOf(T, "star") as { pool: number[] };
    expect([...star.pool].sort((a, b) => a - b)).toEqual([4, 9, 37, 82, 90]);
    expect(ruleOf(T, "plus")).not.toEqual(ruleOf(T, "star"));
  });
});

describe("what each new house asks of one ticket", () => {
  test("Early Seven / Early Ten: the first 7 / 10 of the ticket's numbers called, whichever they are", () => {
    const log = callsOf(4, 11, 9, 23, 28, 30, 45, 66, 55, 70, 82);
    expect(idxAfter("early7", log)).toBe(6); // the 7th ticket number (45) is the 7th call
    expect(idxAfter("early10", log)).toBe(9);
    expect(idxAfter("early7", [1, 2, 3, 4, 11, 9, 23, 28, 30, 45])).toBe(9); // numbers not on the ticket never count
    expect(idxAfter("early7", [4, 11, 9, 23, 28, 30])).toBe(-1);
  });
  test("Two Lines: the second of the three lines to complete, in any order", () => {
    expect(idxAfter("twolines", [...A, ...C])).toBe(9);          // top, then bottom
    expect(idxAfter("twolines", [...B, ...A])).toBe(9);
    expect(idxAfter("twolines", [...A, 1, 2, ...B.slice(0, 4)])).toBe(-1);
    expect(idxAfter("twolines", [4, 11, 9, 23, 28, 30, 45, 37, 55, 61, 66, 70, 82, 89, 90])).toBe(13); // top at 82 (12), middle at 89 (13), bottom at 90 (14): the second to finish is the middle line
  });
  test("Plus: the whole middle line and the middle number of the top and bottom lines", () => {
    const need = (ruleOf(T, "plus") as { pool: number[] }).pool;
    expect([...need].sort((a, b) => a - b)).toEqual([11, 28, 37, 45, 55, 66, 89]);
    expect(idxAfter("plus", [...B, 45, 55])).toBe(6);
    expect(idxAfter("plus", [...B, 45])).toBe(-1);
  });
  test("Frame: top line, bottom line and the first and last number of the middle line", () => {
    expect([...(ruleOf(T, "frame") as { pool: number[] }).pool].sort((a, b) => a - b)).toEqual([4, 9, 11, 23, 30, 45, 55, 61, 70, 82, 89, 90]);
    expect(idxAfter("frame", [...A, ...C, 11, 89])).toBe(11);
    expect(idxAfter("frame", [...A, ...C, 11])).toBe(-1);
  });
  test("Top and Bottom: both lines. Middle and Corners: the middle line plus the four corners", () => {
    expect(idxAfter("topbottom", [...A, ...C])).toBe(9); expect(idxAfter("topbottom", [...A, ...B])).toBe(-1);
    expect([...(ruleOf(T, "midcorners") as { pool: number[] }).pool].sort((a, b) => a - b)).toEqual([4, 9, 11, 28, 37, 66, 82, 89, 90]);
    expect(idxAfter("midcorners", [...B, 4, 82, 9, 90])).toBe(8); expect(idxAfter("midcorners", [...B, 4, 82, 9])).toBe(-1);
  });
  test("Odd Five, Even Five, Low Five, High Five: five numbers of that kind on the ticket", () => {
    expect(idxAfter("odd5", [4, 23, 45, 61, 11, 37])).toBe(5); // 23, 45, 61, 11, 37 are odd: the fifth is the sixth call (4 is even and does not count)
    expect(idxAfter("odd5", [23, 45, 61, 11])).toBe(-1);
    expect(idxAfter("even5", [4, 82, 28, 66, 30])).toBe(4); expect(idxAfter("even5", [23, 45, 4, 82, 28, 66, 30])).toBe(6);
    expect(idxAfter("low5", [4, 23, 11, 28, 9])).toBe(4); expect(idxAfter("low5", [4, 23, 11, 28, 61])).toBe(-1);
    expect(idxAfter("high5", [61, 82, 66, 89, 70])).toBe(4); expect(idxAfter("high5", [61, 82, 66, 89, 30])).toBe(-1);
  });
  test("a ticket that has fewer than five numbers of a kind can never win that house, and says so", () => {
    const poor: Ticket = [mk([2, 4, 6, 8, 10]), mk([12, 14, 16, 18, 20]), mk([22, 24, 26, 28, 31])]; // one odd number
    expect(ticketCompletion(poor, "odd5", Array.from({ length: 90 }, (_, i) => i + 1))).toBe(-1);
    expect(ticketStillNeeds(poor, "odd5", new Set())).toBe(99);
    expect(stillToWin(poor, "odd5", [])).toBe(99);
  });
  test("still to win counts the numbers each house still needs (Two Lines: the two cheapest lines)", () => {
    expect(stillToWin(T, "early7", [4, 11])).toBe(5);
    expect(stillToWin(T, "twolines", [...A.slice(0, 4), ...B.slice(0, 2)])).toBe(1 + 3);
    expect(stillToWin(T, "plus", [11, 45])).toBe(5);
    expect(stillToWin(T, "unlucky", [])).toBe(99); // not decided on a ticket
  });
  test("winning numbers to light up: a fixed shape lights all of it, 'any N' the first N hits, Two Lines the two lines that finished", () => {
    expect(winningNumbers(T, "plus", [], 0).sort((a, b) => a - b)).toEqual([11, 28, 37, 45, 55, 66, 89]);
    const log = [1, 4, 2, 11, 9, 23, 28, 30, 45, 66, 55];
    expect(winningNumbers(T, "early7", log, ticketCompletion(T, "early7", log))).toEqual([4, 11, 9, 23, 28, 30, 45]);
    const l2 = [...A, 3, ...C];
    expect(winningNumbers(T, "twolines", l2, ticketCompletion(T, "twolines", l2)).sort((a, b) => a - b)).toEqual([...A, ...C].sort((a, b) => a - b));
    expect(winningNumbers(T, "unlucky", log, 3)).toEqual([]);
  });
  test("a tidy ticket never completes Unlucky or the two-ticket house on its own", () => {
    expect(ticketCompletion(T, "unlucky", Array.from({ length: 90 }, (_, i) => i + 1))).toBe(-1);
    expect(completionIndexKey([T], "unlucky", Array.from({ length: 90 }, (_, i) => i + 1))).toBe(-1);
  });
});

describe("the incremental engine gives exactly what settleAll gives, for every house", () => {
  for (const tickets of [1, 2] as const) {
    test(`${tickets} ticket(s), 90 participants, all houses: same winners at every few calls (Unlucky included, flagged and removed seats out)`, () => {
      const ids: (HouseId | "full2")[] = tickets === 2 ? [...ALL_IDS, "full2"] : ALL_IDS;
      const cfg = cfgWith(tickets, ids), eid = "HOUSES-" + tickets, pids = mkPids(90), log = shuffle("houses" + tickets), rnd = rands("par" + tickets);
      const out = new Set([pids[0]!, pids[1]!, pids[2]!, pids[3]!]);
      const start = 500, br = (k: number) => start + k * 3;
      const e = new PrizeEngine(eid, cfg);
      e.addSeats(pids.map((pid, i) => ({ pid, countFrom: 0, ...(i < 2 ? { ex: true } : i < 4 ? { blk: true } : {}) }))); expect(e.work(10_000)).toBe(true);
      for (let k = 0; k < 90; k++) {
        e.feed(log[k]!, br(k), rnd[k]!); e.setOver(k === 89);
        if (k % 7 === 6 || k > 55 || k === 0) expect(norm(e.results())).toEqual(norm(settleAll(eid, pids, log.slice(0, k + 1), cfg, 1, undefined, { out, randomness: rnd.slice(0, k + 1), over: k === 89 })));
      }
      const final = e.results();
      for (const id of ALL_IDS.filter((x) => x !== "unlucky")) expect(final.some((x) => x.pattern === id)).toBe(true); // with 90 people every house has a winner
      expect(final.find((x) => x.pattern === "unlucky")?.pids.length).toBe(1);
    });
  }
  test("late joiners: only numbers from their count-from round count, the engine and the whole-log settlement still agree", () => {
    const cfg = cfgWith(1, ALL_IDS), eid = "HOUSES-LATE", pids = mkPids(80), log = shuffle("hlate"), rnd = rands("late"), start = 2000, callRounds = log.map((_, k) => start + k * 3);
    const cf = new Map<string, number>(); pids.forEach((p, i) => { if (i >= 40) cf.set(p, countFromOf(start + 3 * (5 + (i % 40)))); });
    const e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: cf.get(pid) ?? 0 }))); e.work(10_000);
    for (let k = 0; k < 90; k++) {
      e.feed(log[k]!, callRounds[k]!, rnd[k]!); e.setOver(k === 89);
      if (k % 6 === 5 || k === 89) expect(norm(e.results())).toEqual(norm(settleAll(eid, pids, log.slice(0, k + 1), cfg, 1, { countFrom: cf, callRounds: callRounds.slice(0, k + 1) }, { randomness: rnd.slice(0, k + 1), over: k === 89 })));
    }
  });
  test("seats that arrive after numbers were called are caught up and give the same answer", () => {
    const cfg = cfgWith(1, ALL_IDS), eid = "HOUSES-CATCH", pids = mkPids(60), log = shuffle("hcatch"), rnd = rands("catch"), br = (k: number) => 3000 + k * 3;
    const e = new PrizeEngine(eid, cfg); e.addSeats(pids.slice(0, 30).map((pid) => ({ pid, countFrom: 0 }))); e.work(10_000);
    for (let k = 0; k < 50; k++) e.feed(log[k]!, br(k), rnd[k]!);
    e.addSeats(pids.slice(30).map((pid) => ({ pid, countFrom: 0 }))); e.work(10_000);
    for (let k = 50; k < 90; k++) e.feed(log[k]!, br(k), rnd[k]!);
    e.setOver(true);
    expect(norm(e.results())).toEqual(norm(settleAll(eid, pids, log, cfg, 1, undefined, { randomness: rnd, over: true })));
  });
  test("resetCalls plus the same feed gives the same answer again", () => {
    const cfg = cfgWith(2, [...ALL_IDS, "full2"]), eid = "HOUSES-RESET", pids = mkPids(50), log = shuffle("hreset"), rnd = rands("reset");
    const e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); e.work(10_000);
    for (let k = 0; k < 90; k++) e.feed(log[k]!, 100 + k, rnd[k]!); e.setOver(true);
    const first = norm(e.results()); e.resetCalls();
    for (let k = 0; k < 90; k++) e.feed(log[k]!, 100 + k, rnd[k]!); e.setOver(true);
    expect(norm(e.results())).toEqual(first);
  });
  test("ordinals: the 2nd Top Line goes to the next distinct call, exactly as for the original houses", () => {
    const cfg: EngagementCfg = { ...defaultCfg(), rewards: [{ pattern: "top", scope: "ticket", ordinal: 1, text: "" }, { pattern: "top", scope: "ticket", ordinal: 2, text: "" }, { pattern: "plus", scope: "ticket", ordinal: 1, text: "" }] };
    const eid = "HOUSES-ORD", pids = mkPids(40), log = shuffle("hord");
    const e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); e.work(10_000);
    log.forEach((n, k) => e.feed(n, 10 + k));
    const r = norm(e.results()); expect(r).toEqual(norm(settleAll(eid, pids, log, cfg)));
    expect(e.results().filter((x) => x.pattern === "top").length).toBe(2);
  });
  test("completion index of the whole-log helper and of the engine agree house by house for a single person", () => {
    const eid = "HOUSES-ONE", pid = mkPids(1)[0]!, tk = ticketsFor(eid, pid, 1), log = shuffle("hone");
    for (const id of [...NEW_IDS, "early5", "full"] as HouseId[]) {
      const cfg = cfgWith(1, [id]), e = new PrizeEngine(eid, cfg); e.addSeats([{ pid, countFrom: 0 }]); e.work(1000); log.forEach((n, k) => e.feed(n, k));
      const idx = completionIndexKey(tk, id, log), got = e.results()[0];
      expect(got?.idx ?? -1).toBe(idx);
    }
  });
});

// ---- Unlucky, against an oracle written separately from the implementation
function oracle(eid: string, pids: string[], log: number[], tickets: 1 | 2, out: Set<string>, rnd: string[], over: boolean): { at: number; pid: string | null } {
  const tk = (pid: string) => ticketsFor(eid, pid, tickets);
  const done = (n: number[], upto: number) => n.every((x) => log.slice(0, upto + 1).includes(x));
  let at = -1;
  for (let k = 0; k < log.length && at < 0; k++) if (pids.some((p) => tk(p).some((t) => done(ticketNumbers(t), k)))) at = k;
  if (at < 0) { if (!over || !log.length) return { at: -1, pid: null }; at = log.length - 1; }
  const rank = (pid: string) => bytesToHex(sha256(utf8ToBytes(`CT1-UNLUCKY|${eid}|${rnd[at] ?? ""}|${pid}`)));
  const cands = pids.filter((p) => !out.has(p)).map((p) => ({ p, m: Math.min(...tk(p).map((t) => ticketNumbers(t).filter((x) => log.slice(0, at + 1).includes(x)).length)) }));
  cands.sort((a, b) => a.m - b.m || (rank(a.p) < rank(b.p) ? -1 : 1));
  return { at, pid: cands[0]?.p ?? null };
}
const unluckyOf = (cfg: EngagementCfg, eid: string, pids: string[], log: number[], rnd: string[], over: boolean, out = new Set<string>()) =>
  settleAll(eid, pids, log, cfg, 1, undefined, { out, randomness: rnd, over }).find((x) => x.pattern === "unlucky");

describe("Unlucky", () => {
  test("it goes to the ticket with the fewest numbers marked when the first Full House is completed, even when Full House is not one of the prizes", () => {
    const eid = "UNL-1", pids = mkPids(30), log = shuffle("unl1"), rnd = rands("u1"), cfg = cfgWith(1, ["unlucky"]);
    const want = oracle(eid, pids, log, 1, new Set(), rnd, false);
    expect(want.at).toBeGreaterThan(20);
    const got = unluckyOf(cfg, eid, pids, log, rnd, false)!;
    expect(got.idx).toBe(want.at); expect(got.pids).toEqual([want.pid!]);
    // before anybody completes a Full House (and the game is not over), nothing is decided yet
    expect(unluckyOf(cfg, eid, pids, log.slice(0, want.at), rnd, false)).toBeUndefined();
    // and the winner really has the fewest: nobody else had fewer marked at that call
    const marked = (p: string) => ticketNumbers(ticketsFor(eid, p, 1)[0]!).filter((n) => log.slice(0, want.at + 1).includes(n)).length;
    expect(Math.min(...pids.map(marked))).toBe(marked(got.pids[0]!));
  });
  test("when Full House IS a prize, Unlucky is decided at the very call that awards the first Full House", () => {
    const eid = "UNL-2", pids = mkPids(40), log = shuffle("unl2"), rnd = rands("u2"), cfg = cfgWith(1, ["full", "unlucky"]);
    const r = settleAll(eid, pids, log, cfg, 1, undefined, { randomness: rnd });
    expect(r.find((x) => x.pattern === "unlucky")!.idx).toBe(r.find((x) => x.pattern === "full")!.idx);
  });
  test("with no Full House at all, it is decided at the end of the game (the last number, or the stop), and not before", () => {
    const eid = "UNL-3", pids = mkPids(5), rnd = rands("u3"), cfg = cfgWith(1, ["unlucky", "mid"]);
    const log = shuffle("unl3").slice(0, 30); // 30 numbers: with five players nobody has all fifteen
    expect(oracle(eid, pids, log, 1, new Set(), rnd, false).at).toBe(-1);
    expect(unluckyOf(cfg, eid, pids, log, rnd, false)).toBeUndefined();
    const ended = unluckyOf(cfg, eid, pids, log, rnd, true)!, want = oracle(eid, pids, log, 1, new Set(), rnd, true);
    expect(ended.idx).toBe(29); expect(ended.pids).toEqual([want.pid!]);
    // and a game that has not started has no winner even when "over"
    expect(unluckyOf(cfg, eid, pids, [], rnd, true)).toBeUndefined();
  });
  test("it never delays the end: once every other prize is awarded, Unlucky is decided at that call, long before any Full House", () => {
    const eid = "UNL-4", pids = mkPids(60), log = shuffle("unl4"), rnd = rands("u4"), cfg = cfgWith(1, ["early5", "unlucky"]);
    const r = settleAll(eid, pids, log, cfg, 1, undefined, { randomness: rnd });
    const e5 = r.find((x) => x.pattern === "early5")!, un = r.find((x) => x.pattern === "unlucky")!;
    expect(un.idx).toBe(e5.idx); expect(un.idx).toBeLessThan(oracle(eid, pids, log, 1, new Set(), rnd, false).at);
    const e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); e.work(10_000);
    log.forEach((n, k) => e.feed(n, k + 1, rnd[k]!));
    expect(norm(e.results())).toEqual(norm(r));
  });
  test("a tie is settled fairly by the public randomness of that round: the same on every phone, different randomness can pick another ticket", () => {
    const eid = "UNL-5", pids = mkPids(50), cfg = cfgWith(1, ["unlucky"]);
    const log = shuffle("unl5").slice(0, 3); // after 3 numbers almost everybody has 0 marked: a big tie
    const pick = (seed: string) => unluckyOf(cfg, eid, pids, log, rands(seed), true)!.pids[0]!;
    expect(pick("same")).toBe(pick("same"));
    const picks = new Set(Array.from({ length: 12 }, (_, i) => pick("tie" + i)));
    expect(picks.size).toBeGreaterThan(2); // the randomness really decides among the tied tickets
    // it is the lowest hash among those tied on the fewest marked
    const rnd = rands("tieX"), w = unluckyOf(cfg, eid, pids, log, rnd, true)!, want = oracle(eid, pids, log, 1, new Set(), rnd, true);
    expect(w.pids[0]).toBe(want.pid!);
    // unluckyPick itself: fewest first, then lowest hash, never a duplicate seat
    expect(unluckyPick("e", "r", [{ pid: "a", marked: 3 }, { pid: "b", marked: 2 }, { pid: "c", marked: 2 }]) === "a").toBe(false);
    expect(unluckyPick("e", "r", [])).toBeNull();
  });
  test("flagged (Organizer/Host/Co-host) and removed/blocked seats can never win it, even with the fewest marked", () => {
    const eid = "UNL-6", pids = mkPids(40), log = shuffle("unl6").slice(0, 25), rnd = rands("u6"), cfg = cfgWith(1, ["unlucky"]);
    const base = unluckyOf(cfg, eid, pids, log, rnd, true)!.pids[0]!;
    const next = unluckyOf(cfg, eid, pids, log, rnd, true, new Set([base]))!.pids[0]!;
    expect(next).not.toBe(base);
    expect(next).toBe(oracle(eid, pids, log, 1, new Set([base]), rnd, true).pid!);
    const e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); e.work(10_000); log.forEach((n, k) => e.feed(n, k + 1, rnd[k]!)); e.setOver(true);
    expect(e.results()[0]!.pids).toEqual([base]);
    e.setOut(base, true); expect(e.results()[0]!.pids).toEqual([next]); // a seat removed later takes effect on the next look
    e.setOut(base, false); expect(e.results()[0]!.pids).toEqual([base]);
    const e2 = new PrizeEngine(eid, cfg); e2.addSeats(pids.map((pid) => ({ pid, countFrom: 0, ...(pid === base ? { ex: true } : {}) }))); e2.work(10_000); log.forEach((n, k) => e2.feed(n, k + 1, rnd[k]!)); e2.setOver(true);
    expect(e2.results()[0]!.pids).toEqual([next]);
  });
  test("a late joiner counts only the numbers since they joined, and a seat that joined after that moment is not a candidate", () => {
    const eid = "UNL-7", pids = mkPids(20), log = shuffle("unl7").slice(0, 30), rnd = rands("u7"), start = 900, callRounds = log.map((_, k) => start + k * 3), cfg = cfgWith(1, ["unlucky"]);
    const lateIn = pids[19]!, tooLate = pids[18]!;
    const cf = new Map<string, number>([[lateIn, countFromOf(start + 3 * 10)], [tooLate, countFromOf(start + 3 * 60)]]); // tooLate's numbers would start after call 29
    const late = { countFrom: cf, callRounds };
    const r = settleAll(eid, pids, log, cfg, 1, late, { randomness: rnd, over: true }).find((x) => x.pattern === "unlucky")!;
    expect(r.pids[0]).not.toBe(tooLate);
    const e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: cf.get(pid) ?? 0 }))); e.work(10_000); log.forEach((n, k) => e.feed(n, callRounds[k]!, rnd[k]!)); e.setOver(true);
    expect(norm(e.results())).toEqual(norm([r]));
    // joined in time, a seat that has lost numbers to the lag has fewer marked and so is the unluckiest
    const lateOnly = new Map<string, number>([[lateIn, countFromOf(start + 3 * 15)]]);
    const r2 = settleAll(eid, pids, log, cfg, 1, { countFrom: lateOnly, callRounds }, { randomness: rnd, over: true }).find((x) => x.pattern === "unlucky")!;
    expect(r2.pids[0]).toBe(lateIn);
  });
  test("two tickets: a person counts with the ticket that has fewer marked", () => {
    const eid = "UNL-8", pids = mkPids(25), log = shuffle("unl8").slice(0, 40), rnd = rands("u8"), cfg = cfgWith(2, ["unlucky"]);
    const w = unluckyOf(cfg, eid, pids, log, rnd, true)!, want = oracle(eid, pids, log, 2, new Set(), rnd, true);
    expect(w.pids[0]).toBe(want.pid!); expect(w.idx).toBe(want.at);
  });
  test("unluckyAt: the earliest of the first Full House, the call every other prize was awarded, and the end", () => {
    expect(unluckyAt(50, -1, 60, false)).toBe(50); expect(unluckyAt(50, 30, 60, false)).toBe(30); expect(unluckyAt(-1, -1, 60, false)).toBe(-1);
    expect(unluckyAt(-1, -1, 60, true)).toBe(59); expect(unluckyAt(70, -1, 90, true)).toBe(70); expect(unluckyAt(-1, -1, 0, true)).toBe(-1);
  });
});

describe("the most winners per house", () => {
  const rw = (pattern: string, n: number, scope = "ticket") => Array.from({ length: n }, (_, i) => ({ pattern, scope, ordinal: i + 1, text: "" }));
  test("every house accepts exactly its maximum and refuses one more with a calm message", () => {
    for (const h of PRIZE_HOUSES) {
      const scope = h.id === "full2" ? "two_ticket" : "ticket", pattern = h.id === "full2" ? "full" : h.id, tickets = h.id === "full2" ? 2 : 1;
      expect(validateCfg({ tickets, rewards: rw(pattern, h.max, scope) }).ok).toBe(true);
      const over = validateCfg({ tickets, rewards: rw(pattern, h.max + 1, scope) });
      expect(over.ok).toBe(false);
      if (!over.ok) { expect(over.error).toContain(h.label); expect(over.error).toMatch(h.max === 1 ? /only 1 winner/ : new RegExp(`at most ${h.max} winners`)); expect(over.error).not.toMatch(/undefined|NaN|\[object/); }
    }
  });
  test("the agreed numbers: Unlucky 1, Early Five 1, Early Seven 1, Top/Middle/Bottom 2, Four Corners 1, Star 1, Full House 10, and 1 for each of the ten others", () => {
    const m = (id: string) => maxWinnersFor(id);
    expect([m("unlucky"), m("early5"), m("early7"), m("top"), m("mid"), m("bot"), m("corners"), m("star"), m("full")]).toEqual([1, 1, 1, 2, 2, 2, 1, 1, 10]);
    for (const id of ["early10", "twolines", "plus", "frame", "topbottom", "midcorners", "odd5", "even5", "low5", "high5"]) expect(m(id)).toBe(1);
    expect(validateCfg({ rewards: rw("full", 10) }).ok).toBe(true); expect(validateCfg({ rewards: rw("full", 11) }).ok).toBe(false);
    expect(validateCfg({ rewards: rw("top", 3) }).ok).toBe(false); expect(validateCfg({ rewards: rw("unlucky", 2) }).ok).toBe(false);
  });
  test("every house together at its maximum fits in the reward limit; unknown houses and a repeated line are still refused", () => {
    const all = PRIZE_HOUSES.flatMap((h) => h.id === "full2" ? rw("full", h.max, "two_ticket") : rw(h.id, h.max));
    expect(all.length).toBeLessThanOrEqual(MAX_REWARD_LINES);
    expect(validateCfg({ tickets: 2, rewards: all }).ok).toBe(true);
    expect(validateCfg({ rewards: [{ pattern: "fivecorners", ordinal: 1 }] }).ok).toBe(false);
    expect(validateCfg({ rewards: [{ pattern: "full2", ordinal: 1 }] }).ok).toBe(false);
    expect(validateCfg({ rewards: [{ pattern: "plus", ordinal: 1 }, { pattern: "plus", ordinal: 1 }] }).ok).toBe(false);
    expect(validateCfg({ rewards: [{ pattern: "plus", ordinal: 2 }] }).ok).toBe(false);
  });
  test("games saved before the limits keep working: up to 5 winners of any house load from storage, and an unchanged saved line is accepted when it is sent again", () => {
    const old = [...rw("top", 4), ...rw("corners", 3), ...rw("full", 5)];
    expect(validateCfg({ rewards: old }).ok).toBe(false); // new input follows today's limits
    const stored = validateCfg({ rewards: old }, undefined, { stored: true });
    expect(stored.ok).toBe(true);
    expect(validateCfg({ rewards: rw("top", 6) }, undefined, { stored: true }).ok).toBe(false); // but not beyond what any game ever had
    if (stored.ok) {
      expect(validateCfg({ rewards: old }, stored.cfg).ok).toBe(true); // the console sends the saved list back: still fine
      expect(validateCfg({ rewards: [...old, { pattern: "top", ordinal: 5, text: "" }] }, stored.cfg).ok).toBe(false); // adding a new over-limit line is not
    }
    expect(LEGACY_MAX_ORDINAL).toBe(5);
  });
});
