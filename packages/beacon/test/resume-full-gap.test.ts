// WP-02 (owner ruling Q2, 2026-10-29): after Pause then Resume the next number comes a FULL gap after the Resume, never the part of a gap that was left
// when the pause began (finding S06 / A09 / TA09: "after Resume the first number was early", 36 came about 6 s after Resume at 12 s speed).
// Same rounds on every phone, the organizer's console and the Worker: they all call callRoundR / callRound.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { callRound, publicKeyFromSecret, resolveControl, signControlWithSecret, type ControlConfig, type ControlMsg, type UnsignedControl } from "../src";
import { callRoundR } from "../src/game";

const ID = "FULLGAP1";
const secretHex = Array.from(Uint8Array.from({ length: 32 }, (_, i) => i + 1), (b) => b.toString(16).padStart(2, "0")).join("");
const cfg: ControlConfig = { pubKey: publicKeyFromSecret(secretHex), maxPauseRounds: 2000, leadRounds: 12 };
const mk = (seq: number, action: UnsignedControl["action"], at: number, signedAt: number, until?: number): ControlMsg =>
  signControlWithSecret(secretHex, { engagementId: ID, seq, action, atBeaconRound: at, signedAtRound: signedAt, untilRound: until });
const START = 1000, STRIDE = 4; // 12 seconds a number (4 beacon rounds of 3 s)
const pauseResume = (pauseAt: number, resumeAt: number) => resolveControl(cfg, [mk(1, "pause", pauseAt, pauseAt - 14), mk(2, "resume", resumeAt, resumeAt - 2)]);
/** the first call (any call index) due at or after `round`, and the call before it */
const firstFrom = (st: ReturnType<typeof resolveControl>, round: number, rounds = 1) => {
  const all: number[] = []; for (let r = 1; r <= rounds; r++) for (let k = 0; k < 90; k++) all.push(callRoundR(st, START, STRIDE, [], r, k) as number);
  const i = all.findIndex((x) => x >= round); return { all, i, at: all[i]! };
};

describe("after Resume the next number comes a full gap later (12 s at the normal speed)", () => {
  test("wherever in the gap the pause began, the first number after Resume is a whole gap (4 rounds) after the Resume", () => {
    for (let off = 0; off < STRIDE; off++) { // the pause begins `off` rounds after a number was called (off 0 = on the very round a number was due)
      const pauseAt = START + 5 * STRIDE + off, resumeAt = pauseAt + 40; // 2 minutes paused
      const st = pauseResume(pauseAt, resumeAt);
      const f = firstFrom(st, resumeAt);
      expect([off, f.at - resumeAt]).toEqual([off, STRIDE]); // exactly one gap after the Resume
      expect(f.all.filter((x) => x >= pauseAt && x < resumeAt)).toEqual([]); // no number inside the pause
    }
  });
  test("the exact S06 case: a pause began 1 round after a number, so only 3 rounds of the gap were left: the old rule gave 3 rounds (9 s) after Resume, now 4 (12 s)", () => {
    const st = pauseResume(START + 5 * STRIDE + 1, START + 5 * STRIDE + 61);
    expect(callRoundR(st, START, STRIDE, [], 1, 5)).toBe(START + 5 * STRIDE); // number 6 (index 5) was called before the pause
    expect(callRoundR(st, START, STRIDE, [], 1, 6)).toBe(START + 5 * STRIDE + 61 + STRIDE);
  });
  test("every number after that keeps the normal gap, and numbers before the pause do not move", () => {
    const st = pauseResume(START + 5 * STRIDE + 2, START + 5 * STRIDE + 62);
    const r = Array.from({ length: 20 }, (_, k) => callRoundR(st, START, STRIDE, [], 1, k) as number);
    expect(r.slice(0, 6)).toEqual([1000, 1004, 1008, 1012, 1016, 1020]);
    for (let k = 1; k < 20; k++) if (k !== 6) expect(r[k]! - r[k - 1]!).toBe(STRIDE);
  });
  test("two pauses in a row: the second one starts before the first Resume's gap is over, and the full gap is kept after the second Resume", () => {
    const st = resolveControl(cfg, [mk(1, "pause", 1021, 1007), mk(2, "resume", 1061, 1055), mk(3, "pause", 1063, 1049), mk(4, "resume", 1103, 1097)]);
    expect(st.intervals.length).toBe(2);
    const f = firstFrom(st, 1103);
    expect(f.at - 1103).toBe(STRIDE);
    const all = f.all.slice(0, 40); expect(all.filter((x) => st.intervals.some((i) => x >= i.start && x < i.end))).toEqual([]);
  });
  test("a pause that began long before the next number was due (the break between rounds) does not add a second gap: the number was already more than a gap away", () => {
    // the break between round 1 and round 2 is 30 rounds; pause 2 rounds into it, resume 8 rounds later: the first number of round 2 is still 20 rounds after the Resume
    const last = callRoundR(null, START, STRIDE, [], 1, 89) as number, plainFirst2 = callRoundR(null, START, STRIDE, [], 2, 0) as number;
    const st = pauseResume(last + 2, last + 10);
    expect(callRoundR(st, START, STRIDE, [], 2, 0)).toBe(plainFirst2 + 8);
  });
  test("the same rule in the older control schedule (callRound) and with a stop after it", () => {
    const st = pauseResume(START + 3 * STRIDE + 1, START + 3 * STRIDE + 41);
    expect(callRound(st, START, STRIDE, 3)).toBe(1012);
    expect(callRound(st, START, STRIDE, 4)).toBe(START + 3 * STRIDE + 41 + STRIDE);
    expect(callRound(st, START, STRIDE, 5)! - callRound(st, START, STRIDE, 4)!).toBe(STRIDE);
  });
  test("no pause: the plain schedule is untouched", () => {
    const st = resolveControl(cfg, []);
    expect(Array.from({ length: 4 }, (_, k) => callRoundR(st, START, STRIDE, [], 1, k))).toEqual([1000, 1004, 1008, 1012]);
  });
});

describe("the phone page says it in plain words", () => {
  test("the PAUSED banner counts 'Restarts in N seconds' in the last 5 seconds and says the first number follows a full gap later (not in a Host-called game)", () => {
    const z = readFileSync(new URL("../../../apps/web/public/z.js", import.meta.url), "utf8");
    expect(z).toContain('p && p.restartsInSec ? "Restarts in " + p.restartsInSec');
    expect(z).toContain('v.callMode === "host" ? "" : " The first number comes " + (v.callSeconds || 12) + " seconds after that."');
    const rt = readFileSync(new URL("../src/phone-runtime.ts", import.meta.url), "utf8");
    expect(rt).toContain("export const RESTART_COUNT_SECS = 5;");
  });
});
