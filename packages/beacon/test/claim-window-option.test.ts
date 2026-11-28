// 1.13.0 - the organizer's "claim time" option (claimWindow). Default (absent) = today's rule: a claim must arrive before the next number is called.
// With claimWindow N a claim counts when it arrives before call idx+N starts. Pure engines (settleAll, PrizeEngine) must agree; config validation; wording.
import { describe, expect, test } from "bun:test";
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { completionIndexKey, settleAll, ticketsFor, type PublicClaim } from "../src/game";
import { PrizeEngine } from "../src/prize-engine";
import { CLAIM_LATE_TEXT, CLAIM_WINDOW_CALLS, MAX_CLAIM_WINDOW, claimLateText, claimRuleText, claimWindowOf, defaultCfg, validateCfg, type EngagementCfg } from "../src/config";
import { deriveCalls, roundTimeMs } from "../src";

const rnd = (r: number) => bytesToHex(sha256(new TextEncoder().encode("fake" + r)));
const norm = (xs: { pattern: string; ordinal: number; idx: number; pids: string[] }[]) => xs.map((x) => `${x.pattern}#${x.ordinal}@${x.idx}:${[...x.pids].sort().join("+")}`).sort();

describe("claimWindow in the config", () => {
  test("absent or 1 means today's rule and leaves no trace in the stored config", () => {
    expect(claimWindowOf(undefined)).toBe(CLAIM_WINDOW_CALLS);
    expect(claimWindowOf(defaultCfg())).toBe(1);
    const a = validateCfg({}); const b = validateCfg({ claimWindow: 1 });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) { expect(a.cfg.claimWindow).toBeUndefined(); expect(b.cfg.claimWindow).toBeUndefined(); expect(JSON.stringify(b.cfg)).toBe(JSON.stringify(a.cfg)); }
  });
  test("2..10 are accepted and kept by a later save that does not mention it; anything else is refused in plain words", () => {
    for (const w of [2, 3, 10]) { const v = validateCfg({ claimWindow: w }); expect(v.ok && v.cfg.claimWindow).toBe(w); }
    const base = validateCfg({ claimWindow: 5 }); expect(base.ok).toBe(true);
    if (base.ok) { const again = validateCfg({ name: "x" }, base.cfg); expect(again.ok && again.cfg.claimWindow).toBe(5); const back = validateCfg({ claimWindow: 1 }, base.cfg); expect(back.ok && back.cfg.claimWindow).toBeUndefined(); }
    for (const bad of [0, -1, 11, 2.5, "3", null, NaN]) { const v = validateCfg({ claimWindow: bad as any }); expect([bad, v.ok]).toEqual([bad, false]); if (!v.ok) expect(v.error).toContain(`1 to ${MAX_CLAIM_WINDOW}`); }
  });
  test("claimWindowOf ignores a broken stored value and falls back to 1", () => { for (const w of [0, 11, 1.5, NaN, -3]) expect(claimWindowOf({ claimWindow: w })).toBe(1); });
});

describe("the engines honour the claim time, and agree with each other", () => {
  const eid = "CW-ENGINE";
  const pids = Array.from({ length: 12 }, (_, i) => `${i + 1}x${(i + 1).toString(16).padStart(12, "0")}`);
  const callRounds = Array.from({ length: 90 }, (_, k) => 1000 + k * 2);
  const log = deriveCalls(eid, callRounds.map((r) => rnd(r)));
  const base: EngagementCfg = { ...defaultCfg(), ties: "next", rewards: [{ pattern: "top", scope: "ticket", ordinal: 1, text: "" }] };
  const withW = (w?: number): EngagementCfg => (w && w > 1 ? { ...base, claimWindow: w } : base);
  const doneAt = (pid: string) => completionIndexKey(ticketsFor(eid, pid, 1), "top", log);
  const rand = { randomness: callRounds.map((r) => rnd(r)) };
  const first = settleAll(eid, pids, log, base, 1, undefined, rand).find((x) => x.pattern === "top" && x.ordinal === 1)!;
  const slow = first.pids[0]!;
  /** everyone claims promptly except `slow`, who claims `calls` calls after the winning call (a moment before that call starts) */
  const claimsWith = (calls: number, edge = -1): PublicClaim[] => pids.map((pid) => ({ pid, pattern: "top", round: 1, idx: doneAt(pid), atMs: pid === slow ? roundTimeMs(callRounds[first.idx + calls]!) + edge : roundTimeMs(callRounds[doneAt(pid)]!) + 1000 }));
  const engine = (cfg: EngagementCfg, claims: PublicClaim[]) => { const e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); e.work(10_000); e.setClaims(claims); for (let k = 0; k < 90; k++) e.feed(log[k]!, callRounds[k]!, rnd(callRounds[k]!)); return e; };
  const winners = (cfg: EngagementCfg, claims: PublicClaim[]) => settleAll(eid, pids, log, cfg, 1, undefined, rand, { claims, callRounds }).find((x) => x.pattern === "top")?.pids ?? [];

  test("default (window 1): a claim two calls after the winning call does NOT count (today's behaviour, unchanged)", () => {
    const c = claimsWith(2);
    expect(winners(withW(), c)).not.toContain(slow);
    expect(norm(engine(withW(), c).results())).toEqual(norm(settleAll(eid, pids, log, withW(), 1, undefined, rand, { claims: c, callRounds })));
  });
  test("window 3: the same claim two calls after counts, in both engines; one call before the 3rd call starts is the last moment, the instant it starts is late", () => {
    const cfg = withW(3);
    const ok = claimsWith(3, -1);
    expect(winners(cfg, ok)).toContain(slow);
    expect(norm(engine(cfg, ok).results())).toEqual(norm(settleAll(eid, pids, log, cfg, 1, undefined, rand, { claims: ok, callRounds })));
    const late = claimsWith(3, 0); // exactly when call idx+3 starts: late (same edge rule as today's window 1)
    expect(winners(cfg, late)).not.toContain(slow);
    expect(norm(engine(cfg, late).results())).toEqual(norm(settleAll(eid, pids, log, cfg, 1, undefined, rand, { claims: late, callRounds })));
  });
  test("a longer window never changes WHO completed a prize: a claim at a wrong call still does not count", () => {
    const wrong = claimsWith(2).map((c) => (c.pid === slow ? { ...c, idx: c.idx + 1 } : c));
    expect(winners(withW(5), wrong)).not.toContain(slow);
  });
});

describe("the words follow the setting", () => {
  test("window 1 words are exactly today's words", () => {
    expect(claimLateText(1)).toBe(CLAIM_LATE_TEXT);
    for (const t of ["next", "share", undefined, null] as const) expect(claimRuleText(t, 1)).toBe(claimRuleText(t));
    expect(claimRuleText("next")).toContain("before the next number is called");
  });
  test("a longer window says so, and never claims 'before the next number'", () => {
    expect(claimLateText(3)).toContain("3 more numbers"); expect(claimLateText(3)).not.toBe(CLAIM_LATE_TEXT);
    for (const t of ["next", "share", undefined] as const) { const s = claimRuleText(t, 4); expect(s).toContain("within 4 numbers of the winning number"); expect(s).not.toContain("before the next number"); }
  });
});
