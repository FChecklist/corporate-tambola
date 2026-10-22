import { describe, expect, test } from "bun:test";
import { prizeStatus } from "../src/prize-status";
import { defaultCfg, type RewardLine } from "../src/config";

const rw = (pattern: any, n: number, text = ""): RewardLine[] => Array.from({ length: n }, (_, i) => ({ pattern, scope: "ticket" as const, ordinal: i + 1, text: text ? `${text} ${i + 1}` : "" }));
describe("the live list of prizes", () => {
  const cfg = { ...defaultCfg(), rewards: [...rw("top", 3, "Voucher"), ...rw("full", 2)] };
  test("nothing claimed: everything is pending, in house order, with 1st, 2nd, 3rd", () => {
    const p = prizeStatus(cfg, []);
    expect(p.map((x) => x.name)).toEqual(["1st Top Line", "2nd Top Line", "3rd Top Line", "1st Full House", "2nd Full House"]);
    expect(p.every((x) => !x.claimed)).toBe(true); expect(p[0]!.text).toBe("Voucher 1");
  });
  test("claimed prizes move to the bottom, pending ones stay on top in their own order", () => {
    const p = prizeStatus(cfg, [{ pattern: "top", ordinal: 1, round: 1 }, { pattern: "full", ordinal: 1, round: 1 }]);
    expect(p.map((x) => `${x.name}:${x.claimed ? "c" : "p"}`)).toEqual(["2nd Top Line:p", "3rd Top Line:p", "2nd Full House:p", "1st Top Line:c", "1st Full House:c"]);
  });
  test("each round awards its own prizes, and a house with one winner is just its name", () => {
    const one = { ...defaultCfg(), rewards: rw("corners", 1), rounds: 2 };
    expect(prizeStatus(one, [{ pattern: "corners", ordinal: 1, round: 1 }], 2)[0]!.claimed).toBe(false);
    expect(prizeStatus(one, [{ pattern: "corners", ordinal: 1, round: 1 }], 1)[0]!.claimed).toBe(true);
    expect(prizeStatus(one, [], 1)[0]!.name).toBe("Four Corners");
  });
  test("the ordinal words are right: 11th, 12th, 13th, 21st, 22nd, 23rd", () => {
    const many = { ...defaultCfg(), rewards: rw("early5", 23) };
    const n = prizeStatus(many, []).map((x) => x.name.split(" ")[0]);
    expect([n[10], n[11], n[12], n[20], n[21], n[22]]).toEqual(["11th", "12th", "13th", "21st", "22nd", "23rd"]);
  });
});
