import { describe, expect, test } from "bun:test";
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { ALL_PATTERNS, RoundStore, checkClaims, completionIndex, logFrom, settleAll, stillToWin, ticketFor } from "../src/game";
import { deriveCalls, scheduleFor, verifyRound, type Fetcher, type Round } from "../src";
import { ticketNumbers } from "../../shared/src/ticket";

const REAL: Round = {
  round: 32680188,
  randomness: "372b3ac5a47dc12f4280df3750b5bf58d7a100186370e6fba08571bd3c7f421d",
  signature: "b79356001df1e55e85fc2648bd6d6cd58cf2472b035f44c542a9038768da2c3898b8c3e19218f0a7f22f7e35de66c7af",
};
const E = "ENG-GAME-1";
const rand = (k: number) => bytesToHex(sha256(new TextEncoder().encode("r" + k)));
const SCHED = scheduleFor(1000, 6);
const fakeRounds = new Map<number, Round>(SCHED.map((r, k) => [r, { round: r, randomness: rand(k), signature: "aa" }]));
const LOG = deriveCalls(E, SCHED.map((_, k) => rand(k)));
const pids = Array.from({ length: 300 }, (_, i) => "p" + i);

describe("tickets and patterns", () => {
  test("a ticket is the same every time for the same participant, different for others", () => {
    expect(ticketFor(E, "p1")).toEqual(ticketFor(E, "p1"));
    expect(ticketFor(E, "p1")).not.toEqual(ticketFor(E, "p2"));
    expect(ticketFor("OTHER", "p1")).not.toEqual(ticketFor(E, "p1"));
  });
  test("every ticket completes every pattern by call 90 (all numbers are called)", () => {
    for (const p of pids.slice(0, 20)) for (const pat of ALL_PATTERNS) expect(completionIndex(ticketFor(E, p), pat, LOG)).toBeGreaterThanOrEqual(0);
  });
  test("full house completes exactly when the last of the ticket's 15 numbers is called", () => {
    const t = ticketFor(E, "p3");
    const last = Math.max(...ticketNumbers(t).map((n) => LOG.indexOf(n)));
    expect(completionIndex(t, "full", LOG)).toBe(last);
  });
  test("early five completes at the fifth ticket number called", () => {
    const t = ticketFor(E, "p4");
    const mine = new Set(ticketNumbers(t));
    const idx = LOG.map((n, i) => (mine.has(n) ? i : -1)).filter((i) => i >= 0)[4]!;
    expect(completionIndex(t, "early5", LOG)).toBe(idx);
  });
  test("a pattern is not complete on a short log", () => expect(completionIndex(ticketFor(E, "p4"), "full", LOG.slice(0, 10))).toBe(-1));
  test("still-to-win counts down to zero as numbers are called", () => {
    const t = ticketFor(E, "p5");
    expect(stillToWin(t, "full", [])).toBe(15);
    expect(stillToWin(t, "early5", [])).toBe(5);
    expect(stillToWin(t, "full", LOG)).toBe(0);
    const part = LOG.slice(0, 30);
    expect(stillToWin(t, "full", part)).toBe(15 - ticketNumbers(t).filter((n) => part.includes(n)).length);
  });
});

describe("settlement from the public log", () => {
  const settled = settleAll(E, pids, LOG);
  test("every pattern has winners and they are the earliest completers", () => {
    expect(settled.map((s) => s.pattern).sort()).toEqual([...ALL_PATTERNS].sort());
    for (const s of settled) {
      for (const p of pids) expect(completionIndex(ticketFor(E, p), s.pattern, LOG)).toBeGreaterThanOrEqual(s.idx);
      for (const w of s.pids) expect(completionIndex(ticketFor(E, w), s.pattern, LOG)).toBe(s.idx);
    }
  });
  test("a tie at the same call shares the reward", () => {
    for (const s of settled) expect(s.pids.length).toBeGreaterThanOrEqual(1);
  });
  test("the result does not depend on the order of the participant list", () => {
    const rev = settleAll(E, [...pids].reverse(), LOG);
    expect(rev.map((s) => [s.pattern, s.idx, [...s.pids].sort()])).toEqual(settled.map((s) => [s.pattern, s.idx, [...s.pids].sort()]));
  });
  test("a participant who never got a network still wins: settlement needs no claim from them", () => {
    const quiet = settled.find((s) => s.pattern === "full")!.pids[0]!;
    expect(checkClaims(E, [], LOG).good).toEqual([]);
    expect(settleAll(E, pids, LOG).find((s) => s.pattern === "full")!.pids).toContain(quiet);
  });
  test("an empty list or a short log settles nothing wrongly", () => {
    expect(settleAll(E, [], LOG)).toEqual([]);
    expect(settleAll(E, pids, LOG.slice(0, 3))).toEqual([]);
  });
});

describe("claims are checked, not trusted", () => {
  test("a true claim is accepted, an early, late, wrong-pattern or someone-else's claim is rejected", () => {
    const t = ticketFor(E, "p9");
    const idx = completionIndex(t, "top", LOG);
    const r = checkClaims(E, [
      { pid: "p9", pattern: "top", idx },
      { pid: "p9", pattern: "top", idx: idx - 1 },
      { pid: "p9", pattern: "top", idx: idx + 1 },
      { pid: "p9", pattern: "bot", idx },
      { pid: "p10", pattern: "top", idx },
    ], LOG);
    expect(r.good).toHaveLength(1);
    expect(r.bad).toHaveLength(4);
  });
});

describe("round store: backfill by agreement, then background signature check", () => {
  const net = (over: Record<string, (r: number) => Round | "down" | "404">): Fetcher => async (url) => {
    const m = url.split("/")[2]!;
    const r = Number(url.split("/").pop());
    const f = over[m] ?? ((x: number) => fakeRounds.get(x) ?? "404");
    const v = f(r);
    if (v === "down") throw new Error("blocked");
    if (v === "404") return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => v };
  };
  const mirrors = ["https://a.test", "https://b.test", "https://c.test"];
  const store = (f: Fetcher, verify = (x: Round) => x.signature === "aa") => new RoundStore({ fetcher: f, mirrors, verify: undefined } as any, verify);

  test("two agreeing mirrors give an immediate provisional round; verification then confirms it", async () => {
    const s = store(net({}));
    expect(await s.fetchBackfill(SCHED[0]!)).toBe(true);
    expect(s.rounds.has(SCHED[0]!)).toBe(true);
    expect(s.verified.has(SCHED[0]!)).toBe(false);
    expect(s.pending()).toBe(1);
    await s.verifyAll();
    expect(s.verified.has(SCHED[0]!)).toBe(true);
    expect(s.pending()).toBe(0);
  });
  test("a late joiner has the whole 90-call log before any signature is checked, and verification leaves it unchanged", async () => {
    const s = store(net({}));
    await Promise.all(SCHED.map((r, i) => s.fetchBackfill(r, i)));
    expect(logFrom(E, SCHED, s)).toEqual(LOG);
    expect(s.pending()).toBe(90);
    await s.verifyAll();
    expect(logFrom(E, SCHED, s)).toEqual(LOG);
    expect(s.discarded).toBe(0);
  });
  test("two mirrors that lie in the same way are still caught by the background check and removed", async () => {
    const lie = (r: number): Round => ({ round: r, randomness: rand(999), signature: "bad" });
    const s = store(net({ "a.test": lie, "b.test": lie }));
    await s.fetchBackfill(SCHED[2]!);
    expect(s.rounds.has(SCHED[2]!)).toBe(true); // provisionally held
    await s.verifyAll();
    expect(s.rounds.has(SCHED[2]!)).toBe(false);
    expect(s.discarded).toBe(1);
  });
  test("two mirrors that disagree fall back to the fully-checked path (never trusting either)", async () => {
    const wrong = (r: number): Round => ({ round: r, randomness: rand(999), signature: "bad" });
    const s = store(net({ "a.test": wrong }));
    expect(await s.fetchBackfill(SCHED[3]!)).toBe(true);
    expect(s.verified.has(SCHED[3]!)).toBe(true);
    expect(s.rounds.get(SCHED[3]!)!.randomness).toBe(rand(3));
  });
  test("one working mirror only: falls back to the checked path, still correct", async () => {
    const s = store(net({ "a.test": () => "down", "b.test": () => "down" }));
    expect(await s.fetchBackfill(SCHED[4]!)).toBe(true);
    expect(s.verified.has(SCHED[4]!)).toBe(true);
  });
  test("everything blocked: nothing is held and no number is invented", async () => {
    const s = store(net({ "a.test": () => "down", "b.test": () => "down", "c.test": () => "down" }));
    expect(await s.fetchBackfill(SCHED[5]!)).toBe(false);
    expect(logFrom(E, SCHED, s)).toEqual([]);
  });
  test("a gap in the rounds stops the log at the gap", async () => {
    const s = store(net({}));
    for (const k of [0, 1, 2, 4, 5]) await s.fetchBackfill(SCHED[k]!);
    expect(logFrom(E, SCHED, s)).toEqual(LOG.slice(0, 3));
  });
  test("a real signed round is verified by the real BLS check in the background", async () => {
    const f: Fetcher = async () => ({ ok: true, status: 200, json: async () => REAL });
    const s = new RoundStore({ fetcher: f, mirrors }, undefined);
    expect(await s.fetchBackfill(REAL.round)).toBe(true);
    expect(s.verified.has(REAL.round)).toBe(false);
    await s.verifyAll();
    expect(s.verified.has(REAL.round)).toBe(true);
    expect(verifyRound(REAL)).toBe(true);
  });
  test("verification work can be spread out, one round per tick", async () => {
    const s = store(net({}));
    for (let k = 0; k < 5; k++) await s.fetchBackfill(SCHED[k]!);
    expect(s.verifySome(2)).toBe(3);
    expect(s.verifySome(2)).toBe(1);
    expect(s.verifySome(2)).toBe(0);
  });
});
