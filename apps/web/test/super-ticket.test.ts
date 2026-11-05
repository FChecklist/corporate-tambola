// 1.7.0 (owner 30 Oct): during the Super Bumper the player's two tickets show as ONE Super Ticket of 6 lines, with the agreed wording and "X of 30 crossed".
// The two helpers are cut out of z.js and run with the real prizeStatus, so the test follows the shipped code.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prizeStatus } from "../../../packages/beacon/src/prize-status";

const src = readFileSync(join(import.meta.dir, "../public/z.js"), "utf8");
const a = src.indexOf("// ---------- Super Bumper"), b = src.indexOf("  const TIP = ZG.PLAYER_TIP");
const { superOn, superWrap } = new Function("ZG", `${src.slice(a, b)}; return { superOn, superWrap };`)({ prizeStatus }) as { superOn: (v: any) => boolean; superWrap: (c: Set<number>, inner: string, t: number[][][]) => string };

const T = (base: number) => [0, 1, 2].map((r) => Array.from({ length: 9 }, (_, c) => (c % 2 === r % 2 ? base + r * 9 + c : null)));
const rewards = [{ pattern: "top", scope: "ticket", ordinal: 1, text: "" }, { pattern: "full2", scope: "two_ticket", ordinal: 1, text: "" }];
const game = (results: any[], tickets = [T(1), T(40)]) => ({ tickets, cfg: { tickets: 2, rewards }, results, round: 1 });

describe("Super Ticket", () => {
  test("it shows only in a 2-ticket game, once every other prize is won and a Super Bumper prize is still open", () => {
    expect(superOn(game([]))).toBe(false); // Top Line still open
    expect(superOn(game([{ pattern: "top", ordinal: 1, round: 1, tickets: [1] }]))).toBe(true);
    expect(superOn(game([{ pattern: "top", ordinal: 1, round: 1, tickets: [1] }, { pattern: "full2", ordinal: 1, round: 1, tickets: [1] }]))).toBe(false); // all won: back to normal
    expect(superOn(game([{ pattern: "top", ordinal: 1, round: 1, tickets: [1] }], [T(1)]))).toBe(false); // one ticket: no Super Bumper
  });
  test("the counter counts crossed numbers of both tickets out of the numbers on them, the agreed words and the short line are there", () => {
    const t = [T(1), T(40)];
    const crossed = new Set<number>([t[0]![0]!.find((x) => x !== null)!, t[1]![2]!.find((x) => x !== null)!]);
    const html = superWrap(crossed, "<div>tickets</div>", t);
    expect(html).toContain("2 of 30 crossed");
    expect(html).toContain("Cross all 6 lines first to win.");
    expect(html).toContain("Your two tickets are now joined into one Super Ticket. Numbers you have already crossed stay crossed. New numbers are called in a fresh random order, and none repeats. The first player to cross all 6 lines wins.");
    expect(html).toContain("<div>tickets</div>");
  });
});
