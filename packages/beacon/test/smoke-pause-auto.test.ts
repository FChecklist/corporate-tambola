// SMOKE 20 NOV, F-02: a game that starts BY ITSELF. A pause that was over before number 1 was due moves nothing (PR 24 did this for a game started with the Start button only).
// FALSIFIED BY: schedulePauses ignoring `firstCallRound` (tools/smoke/falsify.ts, F-02).
import { describe, expect, test } from "bun:test";
import { ed25519 } from "@noble/curves/ed25519";
import { callRound, resolveControl, signControlWithSecret, type ControlConfig, type ControlMsg, type UnsignedControl } from "../src/control";
import { callRoundR } from "../src/game";

const ID = "AUTO123", secretHex = Array.from(Uint8Array.from({ length: 32 }, (_, i) => i + 9), (b) => b.toString(16).padStart(2, "0")).join(""), STRIDE = 4;
const pub = Array.from(ed25519.getPublicKey(Uint8Array.from({ length: 32 }, (_, i) => i + 9)), (b) => b.toString(16).padStart(2, "0")).join("");
const cfg: ControlConfig = { pubKey: pub, maxPauseRounds: 600, leadRounds: 13 };
const FIRST = 10_000; // the round number 1 is due
const mk = (seq: number, action: UnsignedControl["action"], at: number, signedAt: number, until?: number): ControlMsg => signControlWithSecret(secretHex, { engagementId: ID, seq, action, atBeaconRound: at, signedAtRound: signedAt, untilRound: until });
for (const fullGap of [false, true]) describe(`auto start, fullGap=${fullGap}`, () => {
  const c = { ...cfg, fullGap };
  test("a pause that ends before the first number is due does not move any number", () => {
    const st = resolveControl(c, [mk(1, "pause", FIRST - 500, FIRST - 600, FIRST - 300)]);
    for (const k of [0, 1, 7, 89]) { expect(callRound(st, FIRST, STRIDE, k)).toBe(FIRST + k * STRIDE); expect(callRoundR(st, FIRST, STRIDE, [], 1, k)).toBe(FIRST + k * STRIDE); }
  });
  test("an open pause that is resumed before the first number is due moves nothing either", () => {
    const st = resolveControl(c, [mk(1, "pause", FIRST - 500, FIRST - 600), mk(2, "resume", FIRST - 200, FIRST - 250)]);
    expect(callRound(st, FIRST, STRIDE, 0)).toBe(FIRST);
  });
  test("a pause still in force when number 1 is due, or begun after it, still pushes the numbers", () => {
    const straddle = resolveControl(c, [mk(1, "pause", FIRST - 5, FIRST - 20, FIRST + 40)]);
    expect(callRound(straddle, FIRST, STRIDE, 0)).toBeGreaterThanOrEqual(FIRST + 40);
    const later = resolveControl(c, [mk(1, "pause", FIRST + 100, FIRST + 80, FIRST + 130)]);
    expect(callRound(later, FIRST, STRIDE, 0)).toBe(FIRST); expect(callRound(later, FIRST, STRIDE, 40)).toBeGreaterThanOrEqual(FIRST + 40 * STRIDE + 30);
  });
});
