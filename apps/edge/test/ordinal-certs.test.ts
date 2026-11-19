// The winner certificate names its prize with the shared ordinal helper: the 21st, 22nd and 23rd winners are not "21th", "22th", "23th".
import { describe, expect, test } from "bun:test";
import { prizeName } from "../src/v2-certs";

describe("certificate prize names", () => {
  test("21st, 22nd, 23rd, 101st and 111th", () => {
    const want: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 11: "11th", 12: "12th", 13: "13th", 21: "21st", 22: "22nd", 23: "23rd", 24: "24th", 101: "101st", 111: "111th" };
    for (const [n, s] of Object.entries(want)) expect(prizeName("full", Number(n), true)).toStartWith(s + " ");
  });
  test("a single prize keeps its plain name", () => {
    expect(prizeName("full", 1, false)).not.toMatch(/^1st /);
  });
});
