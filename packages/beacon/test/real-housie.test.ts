// Real housie (the owner's rule, 2026-10-22): the ticket never marks itself. The player taps each number as it is called and presses Claim; a prize is won ONLY by a claim that
// stands up against the public numbers and arrives before the next number is called. A wrong claim is a Bogey; two Bogeys on the same house put the ticket out of that house.
// Part 1: the pure engines (settleAll and PrizeEngine) decide from claims and agree with each other. Part 2: real phones against the real Worker code.
import { beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(60_000);
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { type Env } from "../../../apps/edge/src/worker";
import { handle } from "../../../apps/edge/test/with-terms";
import { makeD1 } from "../../../apps/edge/test/d1-sqlite";
import { PhoneRuntime, type PhoneDeps } from "../src/phone-runtime";
import { BOGEYS_OUT, claimInTime, completionIndexKey, settleAll, ticketsFor, type PublicClaim } from "../src/game";
import { PrizeEngine } from "../src/prize-engine";
import { CLAIM_WINDOW_CALLS, GRACE_ROUNDS, defaultCfg, type EngagementCfg, type PatternKey } from "../src/config";
import { deriveCalls, roundAt, roundTimeMs, type Fetcher, type Round } from "../src";

const rnd = (r: number) => bytesToHex(sha256(new TextEncoder().encode("fake" + r)));
const norm = (xs: { pattern: string; ordinal: number; idx: number; pids: string[] }[]) => xs.map((x) => `${x.pattern}#${x.ordinal}@${x.idx}:${[...x.pids].sort().join("+")}`).sort();

// ------------------------------------------------------------------------------------------------------------------ part 1: the engines
describe("the engines decide from claims", () => {
  const eid = "RH-ENGINE";
  const pids = Array.from({ length: 12 }, (_, i) => `${i + 1}x${(i + 1).toString(16).padStart(12, "0")}`);
  const callRounds = Array.from({ length: 90 }, (_, k) => 1000 + k * 2); // a call every 6 s
  const log = deriveCalls(eid, callRounds.map((r) => rnd(r)));
  const cfg: EngagementCfg = { ...defaultCfg(), ties: "next", rewards: [{ pattern: "top", scope: "ticket", ordinal: 1, text: "" }, { pattern: "top", scope: "ticket", ordinal: 2, text: "" }, { pattern: "early5", scope: "ticket", ordinal: 1, text: "" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "" }] };
  const doneAt = (pid: string, key: PatternKey) => completionIndexKey(ticketsFor(eid, pid, 1), key, log);
  /** everyone claims every house the moment it is complete (1 s after the call) */
  const promptClaims = (): PublicClaim[] => pids.flatMap((pid) => (["top", "early5", "full"] as PatternKey[]).map((k) => ({ pid, pattern: k, round: 1, idx: doneAt(pid, k), atMs: roundTimeMs(callRounds[Math.max(0, doneAt(pid, k))]!) + 1000 })).filter((c) => c.idx >= 0));
  const engineWith = (claims: PublicClaim[], upto = 90) => { const e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); e.work(10_000); e.setClaims(claims); for (let k = 0; k < upto; k++) e.feed(log[k]!, callRounds[k]!, rnd(callRounds[k]!)); return e; };
  const rand = { randomness: callRounds.map((r) => rnd(r)) };

  test("with nobody claiming, nobody wins; with everyone claiming at once, the claim-based winners are the completion-based winners, in both engines", () => {
    expect(settleAll(eid, pids, log, cfg, 1, undefined, rand, { claims: [], callRounds })).toEqual([]);
    expect(engineWith([]).results()).toEqual([]);
    const all = promptClaims();
    const plain = settleAll(eid, pids, log, cfg, 1, undefined, rand);
    expect(plain.length).toBe(4);
    expect(norm(settleAll(eid, pids, log, cfg, 1, undefined, rand, { claims: all, callRounds }))).toEqual(norm(plain));
    expect(norm(engineWith(all).results())).toEqual(norm(plain));
  });
  test("a player who never claims never wins, even with the first complete ticket: the next claimant takes the position; a claim at a wrong call does not count", () => {
    const plain = settleAll(eid, pids, log, cfg, 1, undefined, rand);
    const first = plain.find((x) => x.pattern === "top" && x.ordinal === 1)!, second = plain.find((x) => x.pattern === "top" && x.ordinal === 2)!;
    const quiet = first.pids[0]!;
    const claims = promptClaims().filter((c) => !(c.pid === quiet && c.pattern === "top"));
    const got = settleAll(eid, pids, log, cfg, 1, undefined, rand, { claims, callRounds });
    expect(got.find((x) => x.pattern === "top" && x.ordinal === 1)!.pids).toEqual(second.pids); // the 2nd becomes the 1st
    expect(got.find((x) => x.pattern === "top")!.pids).not.toContain(quiet);
    expect(norm(engineWith(claims).results())).toEqual(norm(got));
    const wrong = promptClaims().map((c) => (c.pid === quiet && c.pattern === "top" ? { ...c, idx: c.idx + 1 } : c)); // "I completed it a call later": not the truth
    expect(settleAll(eid, pids, log, cfg, 1, undefined, rand, { claims: wrong, callRounds }).find((x) => x.pattern === "top" && x.ordinal === 1)!.pids).toEqual(second.pids);
  });
  test(`a claim counts only before the next number is called (${CLAIM_WINDOW_CALLS} call): one made after it does not, in both engines; while the next call has not come the window is open`, () => {
    const plain = settleAll(eid, pids, log, cfg, 1, undefined, rand);
    const first = plain.find((x) => x.pattern === "top" && x.ordinal === 1)!, slow = first.pids[0]!;
    const nextCallMs = roundTimeMs(callRounds[first.idx + CLAIM_WINDOW_CALLS]!);
    expect(claimInTime(nextCallMs - 1, callRounds[first.idx + CLAIM_WINDOW_CALLS])).toBe(true);
    expect(claimInTime(nextCallMs, callRounds[first.idx + CLAIM_WINDOW_CALLS])).toBe(false);
    expect(claimInTime(nextCallMs + 60_000, undefined)).toBe(true); // nothing called after it yet
    const late = promptClaims().map((c) => (c.pid === slow && c.pattern === "top" ? { ...c, atMs: nextCallMs } : c));
    const got = settleAll(eid, pids, log, cfg, 1, undefined, rand, { claims: late, callRounds });
    expect(got.find((x) => x.pattern === "top")!.pids).not.toContain(slow);
    expect(norm(engineWith(late).results())).toEqual(norm(got));
    // the whole log up to the completion only: the next call is not in yet, so the late claim still holds the position for now (it falls when the next number comes)
    const upto = first.idx + 1;
    const open = settleAll(eid, pids, log.slice(0, upto), cfg, 1, undefined, { randomness: rand.randomness.slice(0, upto) }, { claims: late, callRounds: callRounds.slice(0, upto) });
    expect(open.find((x) => x.pattern === "top" && x.ordinal === 1)!.pids).toContain(slow);
    expect(norm(engineWith(late, upto).results())).toEqual(norm(open));
  });
  test(`${BOGEYS_OUT} Bogeys on the same house (before the claim) put the ticket out of that house only; one Bogey, or Bogeys on another house, do not; both engines agree`, () => {
    const plain = settleAll(eid, pids, log, cfg, 1, undefined, rand);
    const first = plain.find((x) => x.pattern === "top" && x.ordinal === 1)!, second = plain.find((x) => x.pattern === "top" && x.ordinal === 2)!, who = first.pids[0]!;
    const at = roundTimeMs(callRounds[first.idx]!) + 1000;
    const bogey = (pattern: string, atMs: number): PublicClaim => ({ pid: who, pattern, round: 1, idx: -1, atMs, bogey: true });
    const base = promptClaims();
    const one = [...base, bogey("top", at - 50_000)];
    expect(settleAll(eid, pids, log, cfg, 1, undefined, rand, { claims: one, callRounds }).find((x) => x.pattern === "top" && x.ordinal === 1)!.pids).toEqual(first.pids);
    const two = [...base, bogey("top", at - 50_000), bogey("top", at - 40_000)];
    const out = settleAll(eid, pids, log, cfg, 1, undefined, rand, { claims: two, callRounds });
    expect(out.find((x) => x.pattern === "top" && x.ordinal === 1)!.pids).toEqual(second.pids); // out of Top Line
    expect(out.find((x) => x.pattern === "top")!.pids).not.toContain(who);
    const fullPlain = plain.find((x) => x.pattern === "full"), fullOut = out.find((x) => x.pattern === "full");
    expect(fullOut?.pids).toEqual(fullPlain?.pids); // every other house is untouched
    expect(norm(engineWith(two).results())).toEqual(norm(out));
    const elsewhere = [...base, bogey("early5", at - 50_000), bogey("early5", at - 40_000)];
    expect(settleAll(eid, pids, log, cfg, 1, undefined, rand, { claims: elsewhere, callRounds }).find((x) => x.pattern === "top" && x.ordinal === 1)!.pids).toEqual(first.pids);
    const after = [...base, bogey("top", at + 1000), bogey("top", at + 2000)]; // Bogeys AFTER a good claim do not undo it
    expect(settleAll(eid, pids, log, cfg, 1, undefined, rand, { claims: after, callRounds }).find((x) => x.pattern === "top" && x.ordinal === 1)!.pids).toEqual(first.pids);
  });
});

// ------------------------------------------------------------------------------------------------------------------ part 2: real phones, real Worker
const SECRET = "org";
const EID = "RH-PHONES";
const START = 50_000;
let env: Env; let t = 0; let T0 = 0;
const utc = () => T0 + t;
const headCall = (method: string, path: string, body?: unknown, h: Record<string, string> = {}) => handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...h }, body: body === undefined ? undefined : JSON.stringify(body) }), env, utc());
const api: PhoneDeps["api"] = async (method, path, body) => { const r = await headCall(method, path, body); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error((j as any).error ?? "http " + r.status), { status: r.status }); return j; };
const fetcher: Fetcher = async (url) => { const last = url.split("/").pop()!, nowR = roundAt(utc()), r = last === "latest" ? nowR : Number(last); if (r > nowR) return { ok: false, status: 404, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" } as Round) }; };
const mkPhone = (n: number, mem = new Map<string, string>()) => {
  const rt = new PhoneRuntime(EID, { noEarlyEnd: true, api, mono: () => t, store: { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) }, beacon: { fetcher, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x) => x.signature === "aa" && x.randomness === rnd(x.round) });
  return { rt, mem, phone: "9" + String(100000000 + n) };
};
type P = ReturnType<typeof mkPhone>;
/** one 3 s step: every phone ticks, then the ones in `along` play like an attentive person (tap every called number, press Claim) */
const step = async (ps: P[], along: P[] = ps, ms = 3000, claim?: (p: P) => Parameters<PhoneRuntime["playAlong"]>[0]) => { t += ms; for (const p of ps) await p.rt.tick(); for (const p of along) await p.rt.playAlong(claim ? claim(p) : {}); };
const reference = () => deriveCalls(EID, Array.from({ length: 90 }, (_, k) => rnd(START + k * 2)));
const ticketNums = (p: P) => new Set(p.rt.tickets.flatMap((tk) => tk.flat().filter((x): x is number => x !== null)));

beforeEach(async () => {
  const d = makeD1();
  env = { DB: d.db, ORGANIZER_SECRET: SECRET, DAILY_WRITE_BUDGET: "1000000" };
  T0 = roundTimeMs(START - 3); t = 0;
  expect((await headCall("POST", "/api/z", { id: EID, startRound: START - GRACE_ROUNDS, callSeconds: 6, cap: 200, rewards: [{ pattern: "top", ordinal: 1 }, { pattern: "top", ordinal: 2 }, { pattern: "early5", ordinal: 1 }, { pattern: "full", ordinal: 1 }] }, { "x-organizer": SECRET })).status).toBe(200);
});
const joined = async (ps: P[]) => { for (const p of ps) { await p.rt.boot(); expect(await p.rt.join(p.phone)).toBe(true); } };

describe("real phones: the ticket never marks itself", () => {
  test("nothing is marked or claimed by itself; a tap on a number not called yet is refused kindly; a called number is marked, tapped again unmarked; marks survive a reload", async () => {
    const a = mkPhone(1); await joined([a]);
    for (let i = 0; i < 60; i++) await step([a], []); // 20 or so numbers, nobody taps
    let v = a.rt.view();
    expect(v.log.length).toBeGreaterThan(15); expect(v.marks).toEqual([]); expect(v.claimed).toEqual([]); expect(v.claimable).toEqual([]); expect(v.pressed).toEqual([]);
    expect((await headCall("GET", `/api/z/${EID}/claims`, undefined, { "x-organizer": SECRET }).then((r) => r.json()) as any).claims).toEqual([]);
    const mine = ticketNums(a), called = new Set(v.log);
    const notYet = [...mine].find((n) => !called.has(n))!, yes = [...mine].find((n) => called.has(n))!;
    const r1 = a.rt.mark(notYet); expect(r1.ok).toBe(false); expect((r1 as any).error).toBe(`${notYet} has not been called yet. Keep listening.`);
    expect(a.rt.view().marks).toEqual([]);
    expect(a.rt.mark(yes)).toEqual({ ok: true, marked: true }); expect(a.rt.view().marks).toEqual([yes]);
    expect(a.rt.mark(yes)).toEqual({ ok: true, marked: false }); expect(a.rt.view().marks).toEqual([]);
    a.rt.mark(yes);
    expect(a.mem.get(`ctz:${EID}:marks`)).toContain(String(yes));
    const again = mkPhone(1, a.mem); await again.rt.boot(); // the same phone opens the page again
    expect(again.rt.phase).toBe("play"); await again.rt.tick();
    expect(again.rt.view().marks).toEqual([yes]);
  });
  test("a Claim button appears when the player's own marks complete a prize; pressing it sends the claim; a prize is won only by claiming: a phone that never claims does not win, the next claimant does; the two engines (phone and whole log) agree", async () => {
    const ps = [mkPhone(11), mkPhone(12), mkPhone(13), mkPhone(14)]; await joined(ps);
    const plain0 = settleAll(EID, ps.map((p) => p.rt.pid!), reference(), ps[0]!.rt.cfg, 1, undefined, { randomness: reference().map((_, k) => rnd(START + k * 2)) });
    const quiet = ps.find((p) => plain0.some((x) => x.ordinal === 1 && x.pids.includes(p.rt.pid!)))!; // a phone whose ticket is first somewhere: taps along but never presses Claim
    for (let i = 0; i < 215; i++) await step(ps, ps, 3000, (p) => (p === quiet ? { claim: false } : {}));
    for (let i = 0; i < 10; i++) await step(ps, ps, 5000, (p) => (p === quiet ? { claim: false } : {}));
    const claims = (await headCall("GET", `/api/z/${EID}/claims`, undefined, { "x-organizer": SECRET }).then((r) => r.json()) as any).claims as { pid: string }[];
    expect(claims.some((c) => c.pid === quiet.rt.pid)).toBe(false);
    expect(claims.length).toBeGreaterThan(0);
    const v0 = quiet.rt.view();
    expect(v0.log.length).toBe(90); expect(v0.marks.length).toBe(15); // every number of the ticket tapped
    expect(v0.claimable.length).toBeGreaterThan(0); // the buttons are there, nobody pressed them
    expect(v0.won).toEqual([]); expect(v0.results.every((x) => !(x.winners ?? []).includes(quiet.rt.pid!))).toBe(true);
    const pids = ps.map((p) => p.rt.pid!), ref = reference();
    const plain = settleAll(EID, pids, ref, ps[0]!.rt.cfg, 1, undefined, { randomness: ref.map((_, k) => rnd(START + k * 2)) });
    const quietWouldHave = plain.filter((x) => x.pids.includes(quiet.rt.pid!));
    expect(quietWouldHave.length).toBeGreaterThan(0); // the quiet phone's ticket did complete something first
    const pub = (await headCall("GET", `/api/z/${EID}/claims`, undefined, { "x-organizer": SECRET }).then((r) => r.json()) as any).claims;
    const seats = await headCall("GET", `/api/z/${EID}/seats?after=0&cafter=0`).then((r) => r.json()) as any;
    expect(seats.claims.length).toBe(pub.length); expect(seats.claims.every((c: any) => /^\d+x[0-9a-f]{12}$/.test(c.pid) && Number.isInteger(c.idx) && c.atMs > 0)).toBe(true); // public: opaque ids only
    const want = settleAll(EID, pids, ref, ps[0]!.rt.cfg, 1, undefined, { randomness: ref.map((_, k) => rnd(START + k * 2)) }, { claims: seats.claims, callRounds: ref.map((_, k) => START + k * 2) });
    for (const p of ps) expect(norm(p.rt.view().results.map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, idx: x.idx, pids: x.winners ?? [] })))).toEqual(norm(want));
    expect(want.every((x) => !x.pids.includes(quiet.rt.pid!))).toBe(true);
    for (const p of ps.filter((x) => x !== quiet)) { const v = p.rt.view(); const mine = want.filter((x) => x.pids.includes(p.rt.pid!)).map((x) => `${x.pattern}:${x.ordinal}`).sort(); expect(v.won.map((w) => `${w.pattern}:${w.ordinal}`).sort()).toEqual(mine); expect(v.pressed.length).toBeGreaterThan(0); }
    const stored = (await headCall("GET", `/api/z/${EID}/results`).then((r) => r.json()) as any).results;
    expect(norm(stored.map((x: any) => ({ pattern: x.pattern, ordinal: x.ordinal, idx: x.idx, pids: x.winners ?? [] })))).toEqual(norm(want)); // and the store holds the same, agreed by the phones
  });
  test("a claim pressed after the next number was called does not count: the next claimant takes the position", async () => {
    const ps = [mkPhone(21), mkPhone(22), mkPhone(23)]; await joined(ps);
    const plain0 = settleAll(EID, ps.map((p) => p.rt.pid!), reference(), ps[0]!.rt.cfg, 1, undefined, { randomness: reference().map((_, k) => rnd(START + k * 2)) });
    const slow = ps.find((p) => plain0.some((x) => x.ordinal === 1 && x.pids.includes(p.rt.pid!)))!; // a phone whose ticket is first somewhere
    // slow taps along but presses Claim one step late (its claimable prizes are pressed on the NEXT step, 3 s later: the next number comes 6 s after, so that is still in time... so make it two steps late)
    const seen = new Map<PatternKey, number>(); let i = 0; // when each prize first became claimable for slow
    const run = async (ms = 3000) => {
      t += ms; i++; for (const p of ps) await p.rt.tick();
      for (const p of ps) if (p !== slow) await p.rt.playAlong();
      await slow.rt.playAlong({ claim: false });
      for (const k of slow.rt.view().claimable) if (!seen.has(k)) seen.set(k, i);
      for (const [k, at] of seen) if (i - at >= 3 && slow.rt.view().claimable.includes(k)) await slow.rt.claim(k); // pressed 9 s after it became claimable: the next number (6 s) has been called since
    };
    for (let i = 0; i < 215; i++) await run();
    for (let i = 0; i < 10; i++) await run(5000);
    const pids = ps.map((p) => p.rt.pid!), ref = reference();
    const plain = settleAll(EID, pids, ref, ps[0]!.rt.cfg, 1, undefined, { randomness: ref.map((_, k) => rnd(START + k * 2)) });
    expect(plain.some((x) => x.pids.includes(slow.rt.pid!))).toBe(true); // its ticket did complete something first
    expect(slow.rt.view().pressed.length).toBeGreaterThan(0); // it did press, late
    for (const p of ps) { const v = p.rt.view(); expect(v.results.length).toBeGreaterThan(0); expect(v.results.every((x) => !(x.winners ?? []).includes(slow.rt.pid!))).toBe(true); }
    expect(slow.rt.view().won).toEqual([]);
  });
  test("a Bogey: a stale mark (the number was never called) makes the claim fail with Bogey!, nothing is sent, the Bogey is counted and recorded; the second on the same house puts the ticket out of it (the button goes), another house stays open; every phone agrees", async () => {
    const a = mkPhone(31), b = mkPhone(32); await joined([a, b]);
    for (let i = 0; i < 40; i++) await step([a, b], []);
    const v = a.rt.view(), called = new Set(v.log), top = a.rt.tickets[0]![0]!.filter((x): x is number => x !== null);
    const stales = top.filter((n) => !called.has(n)), stale = stales[0];
    if (stale === undefined) return; // (the top line was called entirely in the first dozen numbers: not this ticket's day; the engine test above covers the rule)
    // the phone kept a mark from before (it was on the page when a late pause message moved the numbers): the stale number sits in its marks
    a.mem.set(`ctz:${EID}:marks`, JSON.stringify({ marks: { 1: stales }, pressed: [], bogeys: {} }));
    const a2 = mkPhone(31, a.mem); await a2.rt.boot(); for (let i = 0; i < 12; i++) await a2.rt.tick(); // (a reopened page reads the earlier numbers a few at a time)
    for (const n of top) if (called.has(n)) a2.rt.mark(n);
    expect(a2.rt.view().claimable).toContain("top"); // the marks complete the Top Line
    const r1 = await a2.rt.claim("top");
    expect(r1.ok).toBe(false); expect((r1 as any).bogey).toBe(true); expect((r1 as any).error).toBe(`Bogey! ${stale} has not been called. Unmark it and keep playing.`);
    expect(a2.rt.view().bogeys).toEqual([{ pattern: "top", n: 1 }]); expect(a2.rt.view().outOf).toEqual([]); expect(a2.rt.view().pressed).toEqual([]);
    { const list = (await headCall("GET", `/api/z/${EID}/claims`, undefined, { "x-organizer": SECRET }).then((r) => r.json()) as any).claims; expect(list.filter((c: any) => !c.bogey)).toEqual([]); expect(list.filter((c: any) => c.bogey).length).toBe(1); } // nothing was sent as a claim; the Bogey is on record (the organizer's list carries it flagged)
    const r2 = await a2.rt.claim("top");
    expect(r2.ok).toBe(false); expect((r2 as any).out).toBe(true); expect((r2 as any).error).toContain("Two Bogeys on Top Line: this ticket is out of the Top Line prize. Other prizes are still open to you.");
    expect(a2.rt.view().outOf).toEqual(["top"]); expect(a2.rt.view().claimable).not.toContain("top");
    const r3 = await a2.rt.claim("top"); expect(r3.ok).toBe(false); expect((r3 as any).out).toBe(true);
    const seats = await headCall("GET", `/api/z/${EID}/seats?after=0&cafter=0`).then((r) => r.json()) as any;
    expect(seats.claims.filter((c: any) => c.bogey && c.pattern === "top" && c.pid === a2.rt.pid).length).toBe(2); // every phone can see the two Bogeys
    // now play on: a2 fixes its marks (unmarks the stale number) and taps along; it can never win the Top Line, b can; the other houses are open to a2
    for (const n of stales) a2.rt.mark(n); // unmark them
    expect(a2.rt.view().marks).not.toContain(stale);
    for (let i = 0; i < 180; i++) await step([a2, b]);
    for (let i = 0; i < 10; i++) await step([a2, b], [a2, b], 5000);
    const vv = a2.rt.view();
    expect(vv.results.filter((x) => x.pattern === "top").every((x) => !(x.winners ?? []).includes(a2.rt.pid!))).toBe(true);
    expect(vv.pressed).not.toContain("top");
    expect(b.rt.view().results.map((x) => `${x.pattern}#${x.ordinal}`).sort()).toEqual(vv.results.map((x) => `${x.pattern}#${x.ordinal}`).sort());
    const ref = reference(), pids = [a2.rt.pid!, b.rt.pid!];
    const want = settleAll(EID, pids, ref, b.rt.cfg, 1, undefined, { randomness: ref.map((_, k) => rnd(START + k * 2)) }, { claims: (await headCall("GET", `/api/z/${EID}/seats?after=0&cafter=0`).then((r) => r.json()) as any).claims, callRounds: ref.map((_, k) => START + k * 2) });
    expect(norm(b.rt.view().results.map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, idx: x.idx, pids: x.winners ?? [] })))).toEqual(norm(want));
  });
});
