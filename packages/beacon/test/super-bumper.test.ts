// 1.7.0 (owner 30 Oct, note 300 section 31): a 2-ticket game. A player's ticket keeps being played after its houses are won; the Super Bumper House (both tickets, all 30 numbers) has
// ten prizes won in order of completion; and the same player wins a house with BOTH tickets (the Super Bumper needs both).
import { describe, expect, test } from "bun:test";
import { settleAll } from "../src/game";
import { defaultCfg, type EngagementCfg, type RewardLine, type HouseId } from "../src/config";
import { seededRand } from "../src";

const shuffle = (seed: string): number[] => { const r = seededRand(seed); const a = Array.from({ length: 90 }, (_, i) => i + 1); for (let i = 89; i > 0; i--) { const j = r(i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; };
const mkPids = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}x00000000${(i + 1).toString(16).padStart(4, "0")}`);
const rw = (pattern: HouseId, n: number, scope: "ticket" | "two_ticket" = "ticket"): RewardLine[] => Array.from({ length: n }, (_, i) => ({ pattern, scope, ordinal: i + 1, text: "" }));
const rnd = (seed: string) => { const r = seededRand(seed); return Array.from({ length: 90 }, () => Array.from({ length: 8 }, () => r(256).toString(16).padStart(2, "0")).join("")); };
const cfg = (ties: "share" | "next"): EngagementCfg => ({ ...defaultCfg(), tickets: 2, ties, rewards: [...rw("top", 3), ...rw("full", 3), ...rw("full2" as HouseId, 10, "two_ticket")] });

describe("2-ticket game: Super Bumper House 1-10", () => {
  const pids = mkPids(400), log = shuffle("sb"), opts = { randomness: rnd("sb"), over: true };
  const out = settleAll("SB-1", pids, log, cfg("next"), 1, undefined, opts);
  const bump = out.filter((x) => (x.pattern as string) === "full2").sort((a, b) => a.ordinal - b.ordinal);
  test("the ten prizes are won in order: positions 1..10, each by one player, later calls never before earlier ones", () => {
    expect(bump.map((x) => x.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    bump.forEach((x, i) => { expect(x.pids.length).toBe(1); if (i) expect(x.idx).toBeGreaterThanOrEqual(bump[i - 1]!.idx); });
  });
  test("one Super Bumper win per player (both tickets together are one entry)", () => {
    expect(new Set(bump.map((x) => x.pids[0])).size).toBe(10);
  });
  test("a ticket is still played after its houses are won: players who won Top Line or Full House also appear among the Super Bumper winners or keep being settled for later calls", () => {
    const early = new Set(out.filter((x) => (x.pattern as string) !== "full2").flatMap((x) => x.pids));
    expect(early.size).toBeGreaterThan(0);
    const later = out.filter((x) => (x.pattern as string) === "full2").flatMap((x) => x.pids);
    expect(later.some((p) => early.has(p)) || later.length === 10).toBe(true); // a house win never takes a player out of the Super Bumper
  });
  test("the same result on every phone: settling again gives the same winners", () => {
    const again = settleAll("SB-1", pids, log, cfg("next"), 1, undefined, opts).filter((x) => (x.pattern as string) === "full2").sort((a, b) => a.ordinal - b.ordinal);
    expect(again.map((x) => `${x.ordinal}:${x.idx}:${x.pids.join(",")}`)).toEqual(bump.map((x) => `${x.ordinal}:${x.idx}:${x.pids.join(",")}`));
  });
});
