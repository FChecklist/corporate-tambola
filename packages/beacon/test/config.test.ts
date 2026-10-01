import { describe, expect, test } from "bun:test";
import { activeBreak, callRoundFull, checkClaims, completionIndexKey, scheduleFull, settleAll, stillToWin, ticketFor, ticketsFor } from "../src/game";
import { breakShift, defaultCfg, keysInPlay, roundEid, validateCfg, type BreakCfg, type EngagementCfg } from "../src/config";
import { deriveCalls } from "../src";
import { createHash } from "node:crypto";
import { ticketNumbers } from "../../shared/src/ticket";

const rnd = (k: number) => createHash("sha256").update("cfg" + k).digest("hex");
const E = "ENG-CFG";
const LOG = deriveCalls(E, Array.from({ length: 90 }, (_, k) => rnd(k)));
const pids = Array.from({ length: 400 }, (_, i) => "q" + i);
const ok = (i: any, base?: EngagementCfg) => { const v = validateCfg(i, base); if (!v.ok) throw new Error(v.error); return v.cfg; };
const bad = (i: any, base?: EngagementCfg) => { const v = validateCfg(i, base); expect(v.ok).toBe(false); return (v as any).error as string; };

describe("engagement settings", () => {
  test("nothing set gives one ticket, the seven houses with no text, and no breaks", () => {
    const c = ok({});
    expect(c.tickets).toBe(1);
    expect(c.rewards.map((r) => r.pattern)).toEqual(["early5", "top", "mid", "bot", "corners", "star", "full"]);
    expect(c.rewards.every((r) => r.ordinal === 1 && r.scope === "ticket" && r.text === "")).toBe(true);
    expect(c.breaks).toEqual([]);
  });
  test("rewards: only houses that exist, up to five per house, in sequence, text cleaned and cut", () => {
    const c = ok({ rewards: [{ pattern: "full", ordinal: 1, text: "Gift <b>hamper</b>" }, { pattern: "full", ordinal: 2, text: "x".repeat(200) }, { pattern: "top", text: "Coffee voucher" }] });
    expect(c.rewards[0]!.text).toBe("Gift bhamper/b");
    expect(c.rewards[1]!.text.length).toBe(80);
    expect(keysInPlay(c.rewards)).toEqual(["top", "full"]);
    bad({ rewards: [{ pattern: "bingo" }] });
    bad({ rewards: [] });
    bad({ rewards: [{ pattern: "full", ordinal: 2 }] }); // a 2nd needs a 1st
    bad({ rewards: [{ pattern: "full", ordinal: 1 }, { pattern: "full", ordinal: 1 }] });
    bad({ rewards: [{ pattern: "full", ordinal: 6 }] });
    bad({ rewards: Array.from({ length: 31 }, (_, i) => ({ pattern: "full", ordinal: 1 + (i % 5), scope: i % 2 ? "ticket" : "two_ticket" })) });
    bad({ rewards: "nope" });
  });
  test("the two-ticket house needs two tickets and can only be the Full House; dropping to one ticket removes it", () => {
    bad({ tickets: 1, rewards: [{ pattern: "full", scope: "two_ticket" }] });
    bad({ tickets: 2, rewards: [{ pattern: "top", scope: "two_ticket" }] });
    const two = ok({ tickets: 2, rewards: [{ pattern: "full", scope: "two_ticket", text: "Grand prize hamper" }, { pattern: "full", text: "Hamper" }] });
    expect(keysInPlay(two.rewards)).toEqual(["full", "full2"]);
    const back = ok({ tickets: 1 }, two);
    expect(keysInPlay(back.rewards)).toEqual(["full"]);
    bad({ tickets: 3 });
  });
  test("brand breaks: at most 3, 15 to 600 seconds in steps of 3, a kind, a title, a safe https link", () => {
    const b = (o: any = {}) => ({ after: 30, seconds: 30, kind: "speech", title: "CEO message", ...o });
    expect(ok({ breaks: [b(), b({ after: 60, kind: "youtube", mediaUrl: "https://youtu.be/abc" }), b({ after: 10, kind: "file", mediaUrl: "https://cdn.acme.com/v.mp4" })] }).breaks.map((x) => x.after)).toEqual([10, 30, 60]);
    bad({ breaks: [b(), b({ after: 31 }), b({ after: 32 }), b({ after: 33 })] });
    for (const o of [{ after: 0 }, { after: 90 }, { after: 1.5 }, { seconds: 12 }, { seconds: 31 }, { seconds: 601 }, { kind: "hologram" }, { title: "x" }, { title: "" }])
      bad({ breaks: [b(o)] });
    bad({ breaks: [b({ kind: "file" })] }); // needs a link
    bad({ breaks: [b({ kind: "youtube", mediaUrl: "https://evil.example/watch" })] });
    for (const u of ["http://acme.com/v.mp4", "javascript:alert(1)", "https://a b.com", "https://x.com/<script>", "ftp://x.com/a"]) bad({ breaks: [b({ kind: "file", mediaUrl: u })] });
    bad({ breaks: [b(), b()] }); // same position twice
    expect(ok({ breaks: [] }).breaks).toEqual([]);
  });
  test("partial updates keep everything else", () => {
    const base = ok({ tickets: 2, rewards: [{ pattern: "full", text: "Hamper" }], breaks: [{ after: 20, seconds: 30, kind: "speech", title: "Welcome" }] });
    const next = ok({ breaks: [] }, base);
    expect(next.tickets).toBe(2);
    expect(next.rewards).toEqual(base.rewards);
  });
});

describe("two tickets", () => {
  test("a second ticket is always different from the first and stable; the first never changes", () => {
    for (const p of pids.slice(0, 60)) {
      const [a, b] = ticketsFor(E, p, 2);
      expect(a).toEqual(ticketFor(E, p));
      expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
      expect(ticketsFor(E, p, 2)[1]).toEqual(b);
    }
    expect(ticketsFor(E, "q1", 1)).toHaveLength(1);
  });
  test("a house is completed by the better of the two tickets; the two-ticket house needs all 30 numbers", () => {
    const tk = ticketsFor(E, "q5", 2);
    const single = tk.map((t) => completionIndexKey([t], "full", LOG));
    expect(completionIndexKey(tk, "full", LOG)).toBe(Math.min(...single));
    const last = Math.max(...tk.flatMap(ticketNumbers).map((n) => LOG.indexOf(n)));
    expect(completionIndexKey(tk, "full2", LOG)).toBe(last);
    expect(completionIndexKey([tk[0]!], "full2", LOG)).toBe(-1);
  });
  test("still to win counts the nearer ticket, and the two-ticket house counts both", () => {
    const tk = ticketsFor(E, "q6", 2); const part = LOG.slice(0, 25);
    const left = (t: any) => ticketNumbers(t).filter((n) => !part.includes(n)).length;
    expect(stillToWin(tk, "full", part)).toBe(Math.min(left(tk[0]), left(tk[1])));
    expect(stillToWin(tk, "full2", part)).toBe(left(tk[0]) + left(tk[1]));
    expect(stillToWin(tk, "full2", LOG)).toBe(0);
  });
});

describe("reward lines settle by order", () => {
  const cfg: EngagementCfg = ok({ tickets: 2, rewards: [
    { pattern: "full", ordinal: 1, text: "1st" }, { pattern: "full", ordinal: 2, text: "2nd" }, { pattern: "full", ordinal: 3, text: "3rd" },
    { pattern: "full", scope: "two_ticket", text: "Grand" }, { pattern: "top", text: "Voucher" },
  ] });
  const res = settleAll(E, pids, LOG, cfg);
  test("each reward line gets the next distinct completion call, earliest first, and only houses in play are settled", () => {
    const full = res.filter((r) => r.pattern === "full").sort((a, b) => a.ordinal - b.ordinal);
    expect(full.map((r) => r.ordinal)).toEqual([1, 2, 3]);
    expect(full[0]!.idx).toBeLessThan(full[1]!.idx);
    expect(full[1]!.idx).toBeLessThan(full[2]!.idx);
    expect(res.some((r) => r.pattern === "mid")).toBe(false);
    expect(res.filter((r) => r.pattern === "full2")).toHaveLength(1);
    expect(res.filter((r) => r.pattern === "top")).toHaveLength(1);
  });
  test("a 1st-reward winner really is the earliest completer and nobody earlier was missed; the 2nd group completes later", () => {
    const first = res.find((r) => r.pattern === "full" && r.ordinal === 1)!;
    const all = pids.map((p) => completionIndexKey(ticketsFor(E, p, 2), "full", LOG)).filter((i) => i >= 0);
    expect(first.idx).toBe(Math.min(...all));
    expect(first.pids.length).toBe(all.filter((i) => i === first.idx).length);
    const second = res.find((r) => r.pattern === "full" && r.ordinal === 2)!;
    expect(second.pids.every((p) => !first.pids.includes(p))).toBe(true);
  });
  test("a house with fewer distinct completions than reward lines leaves the later lines unawarded (no invented winners)", () => {
    const few = settleAll(E, ["q1"], LOG, cfg);
    expect(few.filter((r) => r.pattern === "full")).toHaveLength(1);
  });
  test("claims for the two-ticket house are checked against both tickets", () => {
    const p = "q7"; const idx = completionIndexKey(ticketsFor(E, p, 2), "full2", LOG);
    expect(checkClaims(E, [{ pid: p, pattern: "full2", idx }], LOG, cfg).good).toHaveLength(1);
    expect(checkClaims(E, [{ pid: p, pattern: "full2", idx: idx - 1 }], LOG, cfg).bad).toHaveLength(1);
  });
});

describe("brand breaks move the schedule for everyone alike", () => {
  const breaks: BreakCfg[] = [{ after: 3, seconds: 30, kind: "speech", title: "A" }, { after: 10, seconds: 60, kind: "speech", title: "B" }];
  test("calls before a break are untouched, calls after are pushed by its length, in 3 s rounds", () => {
    expect(breakShift(breaks, 2)).toBe(0);
    expect(breakShift(breaks, 3)).toBe(10);
    expect(breakShift(breaks, 10)).toBe(30);
    const s = scheduleFull(null, 1000, 2, breaks, 12);
    expect(s[0]).toBe(1000); expect(s[2]).toBe(1004); expect(s[3]).toBe(1000 + 6 + 10); expect(s[10]).toBe(1000 + 20 + 30);
  });
  test("the gap between calls is the normal stride everywhere except across a break", () => {
    const s = scheduleFull(null, 1000, 2, breaks, 20) as number[];
    const gaps = s.slice(1).map((r, i) => r - s[i]!);
    expect(gaps.filter((g) => g === 2)).toHaveLength(17);
    expect(gaps[2]).toBe(2 + 10); expect(gaps[9]).toBe(2 + 20);
  });
  test("the break is showing exactly for its length, starting right after the call it follows, and never before or after", () => {
    const prev = callRoundFull(null, 1000, 2, breaks, 2)!; // the 3rd call
    expect(activeBreak(null, 1000, 2, breaks, prev)).toBeNull();
    expect(activeBreak(null, 1000, 2, breaks, prev + 1)?.brk.title).toBe("A");
    expect(activeBreak(null, 1000, 2, breaks, prev + 10)?.brk.title).toBe("A");
    expect(activeBreak(null, 1000, 2, breaks, prev + 11)).toBeNull();
    expect(callRoundFull(null, 1000, 2, breaks, 3)! > prev + 10).toBe(true);
  });
  test("breaks are part of the public settings, so they decide which rounds feed the numbers, identically for everyone", () => {
    const withB = scheduleFull(null, 1000, 2, breaks, 90) as number[]; const plain = scheduleFull(null, 1000, 2, [], 90) as number[];
    const rr = (r: number) => createHash("sha256").update("r" + r).digest("hex");
    expect(withB.map(rr)).not.toEqual(plain.map(rr)); // different rounds feed the numbers (as designed: the schedule is part of the engagement)
    expect(deriveCalls("X", withB.map(rr))).toEqual(deriveCalls("X", withB.map(rr)));
  });
});

describe("lucky draw", () => {
  const lucky = (o: any = {}) => ({ after: 30, seconds: 30, kind: "lucky", title: "Lucky draw", winners: 3, ...o });
  test("is a break that picks 1, 3, 5 or 10 people and has no link; 3 is the default", () => {
    expect(ok({ breaks: [lucky()] }).breaks[0]!.winners).toBe(3);
    expect(ok({ breaks: [{ after: 30, seconds: 30, kind: "lucky", title: "Draw" }] }).breaks[0]!.winners).toBe(3);
    for (const w of [1, 5, 10]) expect(ok({ breaks: [lucky({ winners: w })] }).breaks[0]!.winners).toBe(w as 1 | 5 | 10);
    for (const w of [0, 2, 11, "3", null]) bad({ breaks: [lucky({ winners: w })] });
    bad({ breaks: [lucky({ mediaUrl: "https://x.com/a" })] });
  });
  test("winners are not accepted on other kinds of break", () => {
    expect(ok({ breaks: [{ after: 30, seconds: 30, kind: "speech", title: "Hi", winners: 5 }] }).breaks[0]!.winners).toBeUndefined();
  });
});

describe("rounds", () => {
  test("1 to 5, whole numbers only, one by default, kept when other settings change", () => {
    expect(ok({}).rounds).toBe(1);
    for (const r of [1, 2, 5]) expect(ok({ rounds: r }).rounds).toBe(r);
    for (const r of [0, 6, 1.5, "2", null, -1]) bad({ rounds: r });
    expect(ok({ tickets: 2 }, ok({ rounds: 3 })).rounds).toBe(3);
  });
  test("each round has its own id, so its own numbers and tickets; round 1 keeps the engagement's id", () => {
    expect(roundEid("E1", 1)).toBe("E1");
    expect(roundEid("E1", 2)).toBe("E1~r2");
    expect(new Set([1, 2, 3, 4, 5].map((r) => roundEid("E1", r))).size).toBe(5);
  });
});
