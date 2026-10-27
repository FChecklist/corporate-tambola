// The average gap between two numbers, from the real call times, separately for the numbers the game called and the ones a person called.
import { describe, expect, test } from "bun:test";
import { MIN_FOR_AVERAGE, averageGapSeconds, gapsByMode } from "../src/gaps";

describe("average gap", () => {
  test("'not yet' until there are at least 3 numbers in that mode; then the real average, one decimal", () => {
    expect(MIN_FOR_AVERAGE).toBe(3);
    expect(averageGapSeconds([])).toBeNull(); expect(averageGapSeconds([1000])).toBeNull(); expect(averageGapSeconds([1000, 13000])).toBeNull();
    expect(averageGapSeconds([0, 12_000, 24_000])).toBe(12);
    expect(averageGapSeconds([0, 7_000, 19_500, 30_000])).toBe(10); // (30 000 - 0) / 3 = 10 s
    expect(averageGapSeconds([0, 5_000, 12_500])).toBe(6.3); // 12.5 / 2 = 6.25 -> 6.3
  });
  test("a pause is part of real time: it shows in the average", () => {
    expect(averageGapSeconds([0, 12_000, 24_000, 24_000 + 600_000 + 12_000])).toBe(212); // 636 s / 3
  });
  test("automatic and by-hand numbers are averaged separately; a game that has both shows both; a mode with fewer than 3 shows not yet", () => {
    const calls = [
      ...[0, 12_000, 24_000, 36_000].map((ms) => ({ ms, manual: false })), // 4 numbers called by the game, 12 s apart
      ...[100_000, 108_000, 120_000].map((ms) => ({ ms, manual: true })), // 3 by hand: 8 s and 12 s -> 10 s
    ];
    expect(gapsByMode(calls)).toEqual({ auto: 12, manual: 10, nAuto: 4, nManual: 3 });
    expect(gapsByMode(calls.slice(0, 5))).toEqual({ auto: 12, manual: null, nAuto: 4, nManual: 1 });
    expect(gapsByMode([])).toEqual({ auto: null, manual: null, nAuto: 0, nManual: 0 });
  });
});
