// WP-01 (gap plan 2026-10-29): quick correctness and wording fixes in plain English. One guard file for the small items.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GAME_FULL_MSG } from "../../edge/src/worker";

const pub = (f: string) => readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8");

describe("TA07: a full game says 'game' and who to tell", () => {
  test("the message a player sees names the game and the organizer, never 'engagement'", () => {
    expect(GAME_FULL_MSG).toMatch(/^This game is full\./); expect(GAME_FULL_MSG).toMatch(/organizer/); expect(GAME_FULL_MSG).not.toMatch(/engagement/i);
  });
  test("the organizer is warned at 90 percent of the places (89 of 100 no, 90 of 100 yes)", () => {
    const src = pub("zc.js"); const m = src.match(/const nearFull = \(joined\) => \{[^\n]*\};/); expect(m).toBeTruthy();
    const make = (cap: number) => new Function("S", `${m![0]}; return nearFull;`)({ info: { cap } }) as (n: number) => boolean;
    expect(make(100)(89)).toBe(false); expect(make(100)(90)).toBe(true); expect(make(10)(9)).toBe(true); expect(make(10)(8)).toBe(false);
    expect(make(0)(5)).toBe(false); // size unknown: no warning
  });
});

describe("TA10: the lost-claim lines reach the phone", () => {
  test("z.js shows the two-line explanation from ZG.lostClaimLines (built into zgame.js), not the old merged guess", () => {
    const z = pub("z.js"), bundle = pub("zgame.js");
    expect(z).toContain("ZG.lostClaimLines("); expect(bundle).toContain("lostClaimLines"); // the shipped bundle has it (rebuild with bun run build:zgame)
    expect(z).not.toContain("another ticket was ahead or the claim came after the next number");
  });
});

describe("TA19: no screen or report prints a fixed prize-tie rule", () => {
  test("the game log page asks the shared rule text for the game's real setting; the shipped bundles carry it", () => {
    const g = pub("gamelog.js"); expect(g).toContain("ZG.claimRuleText(log.ties)"); expect(g).not.toContain("wins that prize together");
    expect(pub("zgame.js")).toContain("they take the next prizes one after the other"); expect(pub("reportgen.js")).toContain("they take the next prizes one after the other"); // rebuilt with bun run build:zgame / build:report
  });
});
