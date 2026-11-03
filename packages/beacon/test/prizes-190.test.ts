// Tambola 1.9.0 prizes, engine side (R1 shape, R3 config, R4 sharing / dense ranking / claim timing / Bogeys, per-ticket prizes).
// Every expectation is written from the frozen rules in the task, not copied from the product. FALSIFIED BY: tools/matrix/breaks/table.ts (EN01..EN12)
import { describe, expect, test } from "bun:test";
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { baseKey, defaultCfg, houseLabel, keyOfLine, keysInPlay, maxWinnersFor, ticketOfKey, validateCfg, type EngagementCfg, type RewardLine } from "../src/config";
import { completionIndexKey, settleAll, stillToWin, ticketsFor, winnersOfHouse, claimCounts, claimsByHouse, type PublicClaim } from "../src/game";
import { PrizeEngine } from "../src/prize-engine";
import { roundTimeMs, seededRand } from "../src";
import { createRequire } from "node:module";
import { ticketNumbers } from "../../shared/src/ticket";
import { ruleOf } from "../src/house-rules";
import { SPEC, type Row } from "../../../apps/web/test/prizes-190/spec";

const shuffle = (seed: string): number[] => { const r = seededRand(seed); const a = Array.from({ length: 90 }, (_, i) => i + 1); for (let i = 89; i > 0; i--) { const j = r(i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; };
const mkPids = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}x00000000${(i + 1).toString(16).padStart(4, "0")}`);
const rnd = (r: number) => bytesToHex(sha256(new TextEncoder().encode("p190" + r)));
/** The reward lines the console writes for a plan row: Super Bumper = Full House with scope two_ticket; per-ticket prizes in a 2-ticket game = ticket_1 / ticket_2; a 1-ticket game = plain ticket. */
const lineOf = (r: Row, tickets: number): RewardLine => {
  const [t, pattern, ordinal] = r;
  if (pattern === "full2") return { pattern: "full", scope: "two_ticket", ordinal, text: "" };
  return { pattern: pattern as any, scope: tickets === 2 && t ? (t === 2 ? "ticket_2" : "ticket_1") : "ticket", ordinal, text: "" };
};
const planCfg = (key: string, ties: "share" | "next" = "share"): EngagementCfg => {
  const tickets = Number(key[0]) as 1 | 2;
  const v: any = validateCfg({ tickets, ties, rewards: SPEC[key]!.map((r) => lineOf(r, tickets)) }); expect(v.ok).toBe(true); return v.cfg;
};
const norm = (xs: { pattern: string; ordinal: number; idx: number; pids: string[] }[]) => xs.map((x) => `${x.pattern}:${x.ordinal}:${x.idx}:${[...x.pids].sort().join(",")}`).sort();

describe("config: keys, labels, validation of per-ticket prizes", () => {
  test("keys: ticket_1 / ticket_2 lines are 'house@1' / 'house@2'; two_ticket is full2; plain stays plain", () => {
    expect(keyOfLine({ pattern: "top", scope: "ticket_1" })).toBe("top@1"); expect(keyOfLine({ pattern: "early5", scope: "ticket_1" })).toBe("early5@1");
    expect(keyOfLine({ pattern: "full", scope: "ticket_2" })).toBe("full@2"); expect(keyOfLine({ pattern: "full", scope: "two_ticket" })).toBe("full2"); expect(keyOfLine({ pattern: "top", scope: "ticket" })).toBe("top");
    expect(baseKey("top@2")).toBe("top"); expect(baseKey("full2")).toBe("full2"); expect(ticketOfKey("top@1")).toBe(1); expect(ticketOfKey("top@2")).toBe(2); expect(ticketOfKey("top")).toBe(0); expect(ticketOfKey("top@3")).toBe(0);
  });
  test("labels: 'Ticket 1: Top Line'; Ticket 1 and Ticket 2 Line 1 are different prizes", () => {
    expect(houseLabel("top@1")).toBe("Ticket 1: Top Line"); expect(houseLabel("top@2")).toBe("Ticket 2: Top Line"); expect(houseLabel("top")).toBe("Top Line");
    expect(houseLabel("top@1")).not.toBe(houseLabel("top@2"));
  });
  test("the number of winner positions of a per-ticket house is the same as the plain house", () => { expect(maxWinnersFor("full@2")).toBe(maxWinnersFor("full")); expect(maxWinnersFor("top@1")).toBe(maxWinnersFor("top")); });
  test("per-ticket lines are accepted only with 2 tickets, with the plain sentence otherwise", () => {
    const L = [{ pattern: "top", scope: "ticket_1", ordinal: 1, text: "" }];
    const one: any = validateCfg({ tickets: 1, rewards: L }); expect(one.ok).toBe(false); expect(one.error).toBe("A prize for one ticket needs two tickets per participant.");
    const two: any = validateCfg({ tickets: 2, rewards: L }); expect(two.ok).toBe(true); expect(two.cfg.rewards[0].scope).toBe("ticket_1");
    const t2: any = validateCfg({ tickets: 2, rewards: [{ pattern: "mid", scope: "ticket_2", ordinal: 1, text: "" }] }); expect(t2.ok).toBe(true);
    expect(validateCfg({ tickets: 2, rewards: [{ pattern: "unlucky", scope: "ticket_1", ordinal: 1, text: "" }] }).ok).toBe(false);
  });
  test("when the tickets become 1 the per-ticket lines (and Super Bumper) are dropped, plain lines stay", () => {
    const base: any = (validateCfg({ tickets: 2, rewards: [{ pattern: "top", scope: "ticket_1", ordinal: 1, text: "" }, { pattern: "mid", scope: "ticket_2", ordinal: 1, text: "" }, { pattern: "full", scope: "two_ticket", ordinal: 1, text: "" }] }) as any).cfg;
    expect(base.rewards.length).toBe(3);
    const back: any = validateCfg({ tickets: 1 }, base); expect(back.ok).toBe(true); expect(back.cfg.rewards.every((l: any) => l.scope === "ticket")).toBe(true); // nothing per-ticket is left (an empty list falls back to the default plain prizes)
    const mixed: any = (validateCfg({ tickets: 2, rewards: [{ pattern: "top", scope: "ticket", ordinal: 1, text: "" }, { pattern: "mid", scope: "ticket_2", ordinal: 1, text: "" }] }) as any).cfg;
    expect((validateCfg({ tickets: 1 }, mixed) as any).cfg.rewards.map((l: any) => l.pattern)).toEqual(["top"]);
  });
  test("keysInPlay: Ticket 1 prizes first, then Ticket 2, then the plain ones; no key twice", () => {
    const c = planCfg("2:20"); const ks = keysInPlay(c.rewards);
    expect(new Set(ks).size).toBe(ks.length);
    expect(ks.filter((k) => ticketOfKey(k) === 1).length).toBe(6); expect(ks.filter((k) => ticketOfKey(k) === 2).length).toBe(5); expect(ks).toContain("full2"); expect(ks).not.toContain("early5@2");
    const first2 = ks.findIndex((k) => ticketOfKey(k) === 2), last1 = ks.map((k) => ticketOfKey(k)).lastIndexOf(1); expect(last1).toBeLessThan(first2);
  });
});

describe("config: prizePlan (organizer only)", () => {
  const plan = (o: object = {}) => ({ mode: "auto", currency: "INR", budget: 1000, count: 2, prizes: [{ id: "0:top:1", amount: 400 }, { id: "0:full:1", amount: 600 }], ...o });
  const check = (p: unknown) => validateCfg({ tickets: 1, prizePlan: p } as any) as any;
  test("a good plan is kept; a later save that does not mention it keeps it; null removes it", () => {
    const a = check(plan()); expect(a.ok).toBe(true); expect(a.cfg.prizePlan.budget).toBe(1000);
    const b: any = validateCfg({ ties: "share" }, a.cfg); expect(b.cfg.prizePlan).toEqual(a.cfg.prizePlan);
    const c: any = validateCfg({ prizePlan: null }, a.cfg); expect(c.ok).toBe(true); expect(c.cfg.prizePlan).toBeUndefined();
  });
  test("bad plans are refused with the one plain sentence", () => {
    const bad = ["x", [], { ...plan(), mode: "other" }, plan({ budget: -1 }), plan({ budget: 1.5 }), plan({ budget: 1e11 }), plan({ count: 0 }), plan({ count: 31 }), plan({ prizes: [] }),
      plan({ prizes: [{ id: "0:top:1", amount: 0 }] }), plan({ prizes: [{ id: "0:top:1", amount: 1.5 }] }), plan({ prizes: [{ id: "0:top:1", amount: -4 }] }), plan({ prizes: [{ id: "0:top:1", amount: "9" }] }),
      plan({ prizes: [{ id: "0:top:1", amount: 5 }, { id: "0:top:1", amount: 6 }] }), plan({ prizes: [{ id: "bad", amount: 5 }] }), plan({ prizes: [{ id: "3:top:1", amount: 5 }] }), plan({ prizes: [{ id: "0:top:0", amount: 5 }] })];
    for (const p of bad.filter(Boolean)) { const r = check(p); expect([JSON.stringify(p).slice(0, 80), r.ok]).toEqual([JSON.stringify(p).slice(0, 80), false]); expect(r.error).toBe("The prize plan needs a budget, a prize count and, for each prize, a whole amount above 0 (at most 30 prizes)."); }
  });
  test("30 prizes are kept, 31 are refused; a currency that is not 3 capitals becomes INR; the gift is cleaned and cut to 60", () => {
    const n = (k: number) => Array.from({ length: k }, (_, i) => ({ id: `1:full:${i % 9 + 1}`.replace(/^1/, String(i % 3)), amount: 10 })).map((p, i) => ({ ...p, id: `${i % 3}:p${i}:${i % 9 + 1}`.replace(/p(\d)/, "pat$1") }));
    expect(check(plan({ count: 30, prizes: n(30) })).ok).toBe(true); expect(check(plan({ count: 30, prizes: n(31) })).ok).toBe(false);
    expect(check(plan({ currency: "rupee" })).cfg.prizePlan.currency).toBe("INR"); expect(check(plan({ currency: "USD" })).cfg.prizePlan.currency).toBe("USD");
    const g = check(plan({ prizes: [{ id: "0:top:1", amount: 5, gift: "  A <b>big</b>   `hamper` " + "x".repeat(80) }] })).cfg.prizePlan.prizes[0].gift;
    expect(g.length).toBeLessThanOrEqual(60); expect(g).not.toMatch(/[<>`]/); expect(g).toMatch(/^A bbig\/b hamper/);
  });
});

describe("per-ticket prizes in the engine", () => {
  const cfg2 = (rows: Row[]): EngagementCfg => { const v: any = validateCfg({ tickets: 2, ties: "share", rewards: rows.map((r) => lineOf(r, 2)) }); expect(v.ok).toBe(true); return v.cfg; };
  const topRow = (pid: string, which: 0 | 1, eid: string, line: "top" | "mid" | "bot" = "top") => (ruleOf(ticketsFor(eid, pid, 2)[which]!, line) as { pool: number[] }).pool;
  test("a log that completes Ticket 2's top line first: top@2 has a winner, top@1 has none", () => {
    const eid = "PT-1", pid = mkPids(1)[0]!, cfg = cfg2([[1, "top", 1, 0], [2, "top", 1, 0]]);
    const t2top = topRow(pid, 1, eid), t1top = topRow(pid, 0, eid);
    expect(t2top.some((n) => t1top.includes(n))).toBe(false);
    const log = [...t2top, ...shuffle("rest").filter((n) => !t2top.includes(n) && !t1top.includes(n))];
    const out = settleAll(eid, [pid], log, cfg);
    expect(out.find((x) => x.pattern === "top@2")).toMatchObject({ ordinal: 1, idx: 4, pids: [pid] });
    expect(out.find((x) => x.pattern === "top@1")).toBeUndefined();
    const out2 = settleAll(eid, [pid], [...log, ...t1top], cfg); expect(out2.find((x) => x.pattern === "top@1")!.idx).toBeGreaterThan(4);
    const out3 = settleAll(eid, [pid], [...t1top, ...log], cfg); expect(out3.find((x) => x.pattern === "top@1")!.idx).toBe(4); expect(out3.find((x) => x.pattern === "top@2")!.idx).toBeGreaterThan(4);
  });
  test("the plain top line of a 2-ticket game still counts the better of the two tickets (old behaviour unchanged)", () => {
    const eid = "PT-2", pid = mkPids(1)[0]!; const v: any = validateCfg({ tickets: 2, ties: "share", rewards: [{ pattern: "top", scope: "ticket", ordinal: 1, text: "" }] });
    const log = [...topRow(pid, 1, eid), ...shuffle("z")]; expect(settleAll(eid, [pid], log, v.cfg).find((x) => x.pattern === "top")!.idx).toBe(4);
  });
  test("Early 5 of Ticket 1: only Ticket 1's numbers count; five numbers of Ticket 2 do not win it", () => {
    const eid = "PT-3", pid = mkPids(1)[0]!, cfg = cfg2([[1, "early5", 1, 0]]); const [A, B] = ticketsFor(eid, pid, 2);
    const a = ticketNumbers(A!), b = ticketNumbers(B!).filter((n) => !a.includes(n));
    expect(settleAll(eid, [pid], [...b.slice(0, 5), ...a], cfg).find((x) => x.pattern === "early5@1")!.idx).toBe(9);
    expect(settleAll(eid, [pid], [...a.slice(0, 5), ...b], cfg).find((x) => x.pattern === "early5@1")!.idx).toBe(4);
    expect(settleAll(eid, [pid], b, cfg).find((x) => x.pattern === "early5@1")).toBeUndefined();
  });
  test("Full House per ticket: ordinals 1 to 4 for each ticket on their own; Ticket 2's Full House is not won by Ticket 1's numbers", () => {
    const cfg = cfg2([1, 2].flatMap((t) => [1, 2, 3, 4].map((o) => [t, "full", o, 0] as Row)));
    const pids = mkPids(80), eid = "PT-4";
    const out = settleAll(eid, pids, shuffle("fh"), cfg);
    for (const t of [1, 2]) {
      const mine = out.filter((x) => x.pattern === `full@${t}`).sort((x, y) => x.ordinal - y.ordinal);
      expect(mine.length).toBe(4); mine.forEach((x, i) => { expect(x.ordinal).toBe(i + 1); if (i) expect(x.idx).toBeGreaterThan(mine[i - 1]!.idx); });
      for (const x of mine) for (const p of x.pids) expect(completionIndexKey(ticketsFor(eid, p, 2), `full@${t}` as any, shuffle("fh").slice(0, x.idx + 1))).toBe(x.idx);
    }
    const f1 = out.filter((x) => x.pattern === "full@1").map((x) => x.pids.join()).join("|"), f2 = out.filter((x) => x.pattern === "full@2").map((x) => x.pids.join()).join("|");
    expect(f1).not.toBe(f2);
    expect(settleAll(eid, pids, shuffle("fh"), cfg).filter((x) => x.ordinal > 4).length).toBe(0);
  });
  test("Super Bumper: ordinals 1 to 4 over both tickets (30 numbers), alongside the per-ticket prizes", () => {
    const cfg = planCfg("2:20"), pids = mkPids(120), eid = "PT-5", log = shuffle("sb");
    const out = settleAll(eid, pids, log, cfg), sb = out.filter((x) => x.pattern === "full2").sort((a, b) => a.ordinal - b.ordinal);
    expect(sb.length).toBe(4); expect(sb.map((x) => x.ordinal)).toEqual([1, 2, 3, 4]);
    for (const x of sb) for (const p of x.pids) expect(completionIndexKey(ticketsFor(eid, p, 2), "full2", log.slice(0, x.idx + 1))).toBe(x.idx);
    expect(out.filter((x) => x.pattern === "early5@2").length).toBe(0); expect(out.filter((x) => x.pattern === "early5@1").length).toBeGreaterThan(0);
  });
  test("stillToWin counts only the named ticket", () => {
    const eid = "PT-6", pid = mkPids(1)[0]!, tk = ticketsFor(eid, pid, 2), t2 = topRow(pid, 1, eid);
    const called = [...t2]; expect(stillToWin(tk, "top@2", called)).toBe(0); expect(stillToWin(tk, "top@1", called)).toBeGreaterThan(0);
  });
  test("all 8 plans: the whole-log answer and the incremental engine agree number by number (6 logs each)", () => {
    for (const key of Object.keys(SPEC)) {
      const cfg = planCfg(key), pids = mkPids(50);
      for (let s = 0; s < 6; s++) {
        const log = shuffle(`eq${key}${s}`), eid = `EQ-${key}-${s}`, e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); expect(e.work(30_000)).toBe(true);
        for (let k = 0; k < 90; k++) { e.feed(log[k]!, 1000 + k * 3); if (k % 11 === 10 || k === 89) expect([key, s, k, norm(e.results())]).toEqual([key, s, k, norm(settleAll(eid, pids, log.slice(0, k + 1), cfg))]); }
      }
    }
  });
});

describe("R4: claims, sharing, dense ranking, timing, Bogeys (real engine)", () => {
  const pids = mkPids(300), eid = "R4-1", callRounds = Array.from({ length: 90 }, (_, k) => 5000 + k * 3), log = shuffle("r4");
  const cfg = (ties: "share" | "next", n = 4, key = "top"): EngagementCfg => ({ ...defaultCfg(), tickets: 1, ties, rewards: Array.from({ length: n }, (_, i) => ({ pattern: key as any, scope: "ticket" as const, ordinal: i + 1, text: "" })) });
  const done = (pid: string, key: string) => completionIndexKey(ticketsFor(eid, pid, 1), key as any, log);
  const groups = (key: string) => { const m = new Map<number, string[]>(); for (const p of pids) { const i = done(p, key); if (i >= 0) (m.get(i) ?? m.set(i, []).get(i)!).push(p); } return [...m.entries()].sort((a, b) => a[0] - b[0]); };
  const inTime = (pid: string, idx: number, key = "top"): PublicClaim => ({ pid, pattern: key, round: 1, idx, atMs: roundTimeMs(callRounds[idx + 1]!) - 500 });
  const lateC = (pid: string, idx: number, key = "top"): PublicClaim => ({ pid, pattern: key, round: 1, idx, atMs: roundTimeMs(callRounds[idx + 1]!) });
  const bogey = (pid: string, atMs: number, key = "top"): PublicClaim => ({ pid, pattern: key, round: 1, idx: -1, atMs, bogey: true });
  const settle = (c: EngagementCfg, claims: PublicClaim[], upto = 90) => settleAll(eid, pids, log.slice(0, upto), c, 1, undefined, undefined, { claims, callRounds: callRounds.slice(0, upto) }).filter((x) => x.pattern === "top");
  const G = groups("top"), multi = G.find(([, p]) => p.length >= 2)!;

  test("the data has a call where several tickets finish together (so the sharing tests are real)", () => { expect(multi).toBeTruthy(); expect(G.length).toBeGreaterThanOrEqual(4); expect(G.reduce((s, g) => s + g[1].length, 0)).toBeGreaterThan(G.length); });
  test("share: everyone who claims the same prize on the same call shares ONE position; the next call's group takes the next ordinal (dense)", () => {
    const claims = G.slice(0, 4).flatMap(([i, ps]) => ps.map((p) => inTime(p, i)));
    const out = settle(cfg("share"), claims).sort((a, b) => a.ordinal - b.ordinal);
    expect(out.map((x) => x.ordinal)).toEqual([1, 2, 3, 4]);
    out.forEach((x, k) => { expect(x.idx).toBe(G[k]![0]); expect([...x.pids].sort()).toEqual([...G[k]![1]].sort()); });
  });
  test("dense ranking: a group that nobody claimed in time is skipped, the next claiming group takes that ordinal (no gap)", () => {
    const claims = [...G[0]![1].map((p) => inTime(p, G[0]![0])), ...G[1]![1].map((p) => lateC(p, G[1]![0])), ...G[2]![1].map((p) => inTime(p, G[2]![0]))];
    const out = settle(cfg("share"), claims).sort((a, b) => a.ordinal - b.ordinal);
    expect(out.map((x) => [x.ordinal, x.idx])).toEqual([[1, G[0]![0]], [2, G[2]![0]]]);
  });
  test("only the players who claim in time share: a late claimer of the same call gets nothing; the others still share", () => {
    const [i, ps] = multi, claims = ps.map((p, k) => (k === 0 ? lateC(p, i) : inTime(p, i)));
    const out = settle(cfg("share"), claims); expect(out.length).toBe(1); expect([...out[0]!.pids].sort()).toEqual(ps.slice(1).sort());
  });
  test("a claim at the instant the next number is announced is late; one millisecond before is in time", () => {
    const [i, ps] = [G[0]![0], G[0]![1]], p = ps[0]!, t = roundTimeMs(callRounds[i + 1]!);
    expect(settle(cfg("share"), [{ pid: p, pattern: "top", round: 1, idx: i, atMs: t }]).length).toBe(0);
    expect(settle(cfg("share"), [{ pid: p, pattern: "top", round: 1, idx: i, atMs: t - 1 }]).length).toBe(1);
  });
  test("a claim must be for the real completion call: a claim for another call counts for nothing", () => {
    const [i, ps] = [G[0]![0], G[0]![1]], p = ps[0]!; const wrong: PublicClaim = { pid: p, pattern: "top", round: 1, idx: i + 1, atMs: roundTimeMs(callRounds[i + 1]!) - 500 };
    expect(settle(cfg("share"), [wrong]).length).toBe(0);
  });
  test("two Not valid claims (Bogeys) block the ticket for that prize; one Bogey does not", () => {
    const [i, ps] = [G[0]![0], G[0]![1]], p = ps[0]!, c = inTime(p, i);
    expect(settle(cfg("share"), [bogey(p, c.atMs - 2000), bogey(p, c.atMs - 1000), c]).length).toBe(0);
    expect(settle(cfg("share"), [bogey(p, c.atMs - 1000), c]).length).toBe(1);
    expect(settle(cfg("share"), [c, bogey(p, c.atMs + 10), bogey(p, c.atMs + 20)]).length).toBe(1); // wrong claims AFTER a good claim do not undo it
  });
  test("Bogeys on one prize do not block another prize of the same ticket", () => {
    const i = done(G[0]![1][0]!, "top"); expect(i).toBeGreaterThanOrEqual(0);
    const p = G[0]![1][0]!, c = inTime(p, G[0]![0]);
    const out = settleAll(eid, pids, log, { ...cfg("share"), rewards: [{ pattern: "top", scope: "ticket", ordinal: 1, text: "" }, { pattern: "mid", scope: "ticket", ordinal: 1, text: "" }] }, 1, undefined, undefined, { claims: [bogey(p, c.atMs - 2000, "mid"), bogey(p, c.atMs - 1000, "mid"), c], callRounds });
    expect(out.some((x) => x.pattern === "top")).toBe(true);
  });
  test("nobody who does not claim wins, however early they completed", () => { expect(settle(cfg("share"), []).length).toBe(0); });
  test("the incremental engine agrees with settleAll on every claim mix (50 random mixes), in share mode and in next mode", () => {
    const r = seededRand("mix");
    for (let m = 0; m < 50; m++) {
      const claims: PublicClaim[] = [];
      for (const [i, ps] of G.slice(0, 6)) for (const p of ps) { const d = r(6); if (d === 0) claims.push(inTime(p, i)); else if (d === 1) claims.push(lateC(p, i)); else if (d === 2) { /* never claims */ } else if (d === 3) claims.push(inTime(p, i), bogey(p, roundTimeMs(callRounds[i]!) - 100), bogey(p, roundTimeMs(callRounds[i]!) - 50)); else claims.push(inTime(p, i)); }
      for (const ties of ["share", "next"] as const) {
        const c = cfg(ties, 5), e = new PrizeEngine(eid, c); e.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); e.work(30_000); e.setClaims(claims); e.setCallRound((k) => callRounds[k] ?? null);
        for (let k = 0; k < 90; k++) e.feed(log[k]!, callRounds[k]!, rnd(callRounds[k]!));
        const want = settleAll(eid, pids, log, c, 1, undefined, { randomness: callRounds.map(rnd) }, { claims, callRounds }).filter((x) => x.pattern === "top");
        expect([m, ties, norm(e.results().filter((x) => x.pattern === "top"))]).toEqual([m, ties, norm(want)]);
      }
    }
  });
  test("dense ordinals in general: 400 random group/claim patterns through the real winnersOfHouse + claimCounts", () => {
    const r = seededRand("dense");
    for (let n = 0; n < 400; n++) {
      const calls = Array.from({ length: 12 }, (_, i) => i * 3 + 2), rounds = Array.from({ length: 40 }, (_, k) => 100 + k * 3);
      const gs: [number, string[]][] = calls.filter(() => r(3) > 0).map((i) => [i, Array.from({ length: 1 + r(6) }, (_, k) => `${i}x${k}`)]);
      const claims: PublicClaim[] = []; const expectG: [number, string[]][] = [];
      for (const [i, ps] of gs) { const ok = ps.filter(() => r(3) > 0); ok.forEach((p) => claims.push({ pid: p, pattern: "k", round: 1, idx: i, atMs: roundTimeMs(rounds[i + 1]!) - 1 })); ps.filter((p) => !ok.includes(p)).forEach((p) => claims.push({ pid: p, pattern: "k", round: 1, idx: i, atMs: roundTimeMs(rounds[i + 1]!) })); if (ok.length) expectG.push([i, ok]); }
      const h = claimsByHouse(claims, 1), kept = gs.map(([i, ps]) => [i, ps.filter((p) => claimCounts(h, "k", p, i, rounds[i + 1]))] as [number, string[]]).filter((g) => g[1].length);
      const out = winnersOfHouse("E", "k", kept, "share", () => "");
      expect(out.length).toBe(expectG.length); out.forEach((o, k) => { expect(o.idx).toBe(expectG[k]![0]); expect([...o.pids].sort()).toEqual([...expectG[k]![1]].sort()); });
    }
  });
  test("per-ticket prizes are separate for claims too: a claim of 'top@1' does not win 'top@2', and the two keep their own ordinals", () => {
    const pid = pids[0]!, c2 = (ties: "share") => { const v: any = validateCfg({ tickets: 2, ties, rewards: [{ pattern: "top", scope: "ticket_1", ordinal: 1, text: "" }, { pattern: "top", scope: "ticket_2", ordinal: 1, text: "" }] }); return v.cfg as EngagementCfg; };
    const E = "R4-2", tk = ticketsFor(E, pid, 2), l = [...(ruleOf(tk[1]!, "top") as any).pool, ...shuffle("q")], cr = l.map((_: number, k: number) => 100 + k * 3);
    const claim: PublicClaim = { pid, pattern: "top@1", round: 1, idx: 4, atMs: roundTimeMs(cr[5]!) - 5 };
    expect(settleAll(E, [pid], l, c2("share"), 1, undefined, undefined, { claims: [claim], callRounds: cr }).length).toBe(0); // claimed the wrong ticket's prize
    const good: PublicClaim = { ...claim, pattern: "top@2" };
    const out = settleAll(E, [pid], l, c2("share"), 1, undefined, undefined, { claims: [good], callRounds: cr }); expect(out.map((x) => `${x.pattern}:${x.ordinal}`)).toEqual(["top@2:1"]);
  });
  test("the default tie rule of a new game is 'next', not 'share' (P-4 was fixed in the console, which now sends ties 'share'; the server default itself did not change: a client that sends no `ties` still gets 'next')", () => {
    expect(defaultCfg().ties).toBe("next"); const v: any = validateCfg({ tickets: 1 }); expect(v.cfg.ties).toBe("next");
  });
});

// P-4 (fixed in fix round 1): the new console sends ties "share" with the plan. Here the game is configured exactly as the console's PATCH body is (validateCfg of { tickets, ties: "share", rewards: lines with empty text }) and the REAL engine deals the positions; the money is worked out with integer arithmetic of my own and compared with the planner's shareOut.
describe("P-4: two players who complete the same prize on the same number share it (a game saved by the new console)", () => {
  const ZP = createRequire(import.meta.url)("../../../apps/web/public/prize-planner.js");
  const pids = mkPids(300), eid = "P4-1", callRounds = Array.from({ length: 90 }, (_, k) => 5000 + k * 3), log = shuffle("r4");
  const consoleBody = (ties: "share" | "next" | undefined) => ({ tickets: 1, ...(ties ? { ties } : {}), rewards: [1, 2, 3, 4].map((o) => ({ pattern: "top", scope: "ticket", ordinal: o, text: "" })) });
  const cfgOfBody = (b: any): EngagementCfg => { const v: any = validateCfg(b); expect(v.ok).toBe(true); return v.cfg; };
  const done = (pid: string) => completionIndexKey(ticketsFor(eid, pid, 1), "top" as any, log);
  const G = (() => { const m = new Map<number, string[]>(); for (const p of pids) { const i = done(p); if (i >= 0) (m.get(i) ?? m.set(i, []).get(i)!).push(p); } return [...m.entries()].sort((a, b) => a[0] - b[0]); })();
  const claimIn = (pid: string, idx: number): PublicClaim => ({ pid, pattern: "top", round: 1, idx, atMs: roundTimeMs(callRounds[idx + 1]!) - 500 });
  const deal = (cfg: EngagementCfg, claims: PublicClaim[]) => settleAll(eid, pids, log, cfg, 1, undefined, undefined, { claims, callRounds }).filter((x) => x.pattern === "top").sort((a, b) => a.ordinal - b.ordinal);
  const AMOUNTS = [1001, 503, 100, 7]; // a Manual-style plan for the four Line 1 positions
  const multi = G.filter(([, p]) => p.length >= 2);

  test("the data has at least one call where 2 or more tickets finish together", () => { expect(multi.length).toBeGreaterThan(0); });
  test("the console body (ties share) is valid and the stored game says share; a body without ties (the pre-fix console) says next", () => {
    expect(cfgOfBody(consoleBody("share")).ties).toBe("share"); expect(cfgOfBody(consoleBody(undefined)).ties).toBe("next");
  });
  test("two claims on one number: ONE position, both players win it, each gets floor(amount / 2), the leftover stays with the organizer", () => {
    const [i, ps] = multi[0]!, two = ps.slice(0, 2); const out = deal(cfgOfBody(consoleBody("share")), two.map((p) => claimIn(p, i)));
    expect(out.length).toBe(1); expect(out[0]!.ordinal).toBe(1); expect([...out[0]!.pids].sort()).toEqual([...two].sort());
    for (const a of [1001, 1000, 7, 1, 0]) { const sh = ZP.shareOut(a, 2); expect([a, sh.share, sh.leftover]).toEqual([a, Math.floor(a / 2), a - 2 * Math.floor(a / 2)]); }
    expect(ZP.shareOut(1001, 2)).toEqual({ share: 500, leftover: 1, winners: 2 });
  });
  test("the money of every position: share x winners + leftover = amount, leftover < winners, for every group size the data has (2, 3, ...)", () => {
    const body = cfgOfBody(consoleBody("share")), take = multi.slice(0, 4); const claims = take.flatMap(([i, ps]) => ps.map((p) => claimIn(p, i)));
    const out = deal(body, claims); expect(out.length).toBe(take.length);
    out.forEach((x, k) => {
      const n = x.pids.length, a = AMOUNTS[k]!, floor = Math.floor(a / n), sh = ZP.shareOut(a, n); expect(n).toBe(take[k]![1].length);
      expect(sh).toEqual({ share: floor, leftover: a - floor * n, winners: n }); expect(sh.share * n + sh.leftover).toBe(a); expect(sh.leftover).toBeLessThan(n);
    });
  });
  test("dense ranking: the group of the next number takes the next ordinal (2nd), then the 3rd; no ordinal is skipped or reused, and a group's players are only in their own position", () => {
    const take = multi.slice(0, 3), out = deal(cfgOfBody(consoleBody("share")), take.flatMap(([i, ps]) => ps.map((p) => claimIn(p, i))));
    expect(out.map((x) => x.ordinal)).toEqual([1, 2, 3]); out.forEach((x, k) => expect([...x.pids].sort()).toEqual([...take[k]![1]].sort()));
    expect(new Set(out.flatMap((x) => x.pids)).size).toBe(out.reduce((s, x) => s + x.pids.length, 0)); // nobody twice
  });
  test("single winners in between do not break the order: a lone winner of an earlier number takes the 1st, the sharing group the 2nd", () => {
    const lone = G.find(([i, p]) => p.length === 1 && i < multi[0]![0]), grp = multi[0]!;
    if (!lone) return; // the data decides; the case is covered by the dense-ranking test above when it exists
    const out = deal(cfgOfBody(consoleBody("share")), [claimIn(lone[1][0]!, lone[0]), ...grp[1].map((p) => claimIn(p, grp[0]))]);
    expect(out.map((x) => [x.ordinal, x.pids.length])).toEqual([[1, 1], [2, grp[1].length]]);
  });
  test("the same two claims in a game saved WITHOUT ties (the old console, mode next) do NOT share: they take the 1st and the 2nd position one after the other", () => {
    const [i, ps] = multi[0]!, two = ps.slice(0, 2); const out = deal(cfgOfBody(consoleBody(undefined)), two.map((p) => claimIn(p, i)));
    expect(out.map((x) => [x.ordinal, x.pids.length])).toEqual([[1, 1], [2, 1]]);
  });
  test("a late claim of the same number does not join the share; the on-time players still share", () => {
    const [i, ps] = multi.find(([, p]) => p.length >= 3) ?? multi[0]!, late: PublicClaim = { ...claimIn(ps[0]!, i), atMs: roundTimeMs(callRounds[i + 1]!) };
    const out = deal(cfgOfBody(consoleBody("share")), [late, ...ps.slice(1).map((p) => claimIn(p, i))]); expect(out.length).toBe(1); expect([...out[0]!.pids].sort()).toEqual(ps.slice(1).sort());
  });
});
