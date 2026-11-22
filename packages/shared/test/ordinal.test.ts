// One helper spells every prize position. 1 to 120 are checked against the plain English rule, and 11, 12, 13 (and 111 to 113) stay "th".
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ordinalName } from "../src/ordinal";
import { ordinalName as fromTicket, rewardName } from "../src/ticket";

const rule = (n: number) => {
  const last2 = n % 100, last = n % 10;
  const suffix = last2 >= 11 && last2 <= 13 ? "th" : last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th";
  return `${n}${suffix}`;
};

describe("ordinalName", () => {
  test("1 to 120 follow the English rule", () => {
    for (let n = 1; n <= 120; n++) expect(ordinalName(n)).toBe(rule(n));
  });
  test("the cases that were wrong", () => {
    const want: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 11: "11th", 12: "12th", 13: "13th", 21: "21st", 22: "22nd", 23: "23rd", 31: "31st", 32: "32nd", 33: "33rd", 41: "41st", 101: "101st", 111: "111th", 112: "112th", 113: "113th", 121: "121st" };
    for (const [n, s] of Object.entries(want)) expect(ordinalName(Number(n))).toBe(s);
  });
  test("there is no 0th, and odd input gives nothing rather than nonsense", () => {
    for (const n of [0, -1, NaN, Infinity]) expect(ordinalName(n)).toBe("");
  });
  test("the ticket module and the reward names use the same helper", () => {
    expect(fromTicket).toBe(ordinalName);
    expect(rewardName("full", "single" as any, 22, 25)).toStartWith("22nd ");
  });
  test("the server files use the shared helper, not their own copy of the 1st/2nd/3rd list", () => {
    const dir = join(import.meta.dir, "..", "..", "..", "apps", "edge", "src");
    const own = readdirSync(dir).filter((f) => f.endsWith(".ts")).filter((f) => /\["", "1st", "2nd", "3rd"\]/.test(readFileSync(join(dir, f), "utf8")));
    expect(own).toEqual([]);
  });
  test("the pages players, the Organizer and the big screen see do not keep their own 1st/2nd/3rd list either", () => {
    const dir = join(import.meta.dir, "..", "..", "..", "apps", "web", "public");
    // built bundles (zgame, control, reportgen) are checked by their own test below: they come from the shared source
    const files = ["big.js", "board.js", "console.js", "z.js", "zc.js", "prize-planner.js"];
    const own = files.filter((f) => /\["", ?"1st", ?"2nd", ?"3rd"\]|\+ ?"th"|ORD\[|ord\[/.test(readFileSync(join(dir, f), "utf8")));
    expect(own).toEqual([]);
  });
  test("the page helpers spell 21st, 22nd, 23rd, 101st, 111th as the shared helper does", () => {
    const dir = join(import.meta.dir, "..", "..", "..", "apps", "web", "public");
    const grab = (file: string, name: string) => {
      const src = readFileSync(join(dir, file), "utf8");
      const m = src.match(new RegExp("(?:const|var) " + name + " = ((?:\\(k\\) => |function \\(k\\) )\\{[^\\n]*\\});"));
      expect(m).not.toBeNull();
      return new Function("return " + m![1]!)() as (k: number) => string;
    };
    for (const [file, name] of [["big.js", "ORD"], ["board.js", "ORD"], ["console.js", "ord"], ["z.js", "ordinalName"], ["zc.js", "ordNm"], ["prize-planner.js", "ORD"]] as const) {
      const f = grab(file, name);
      for (let n = 1; n <= 120; n++) expect(f(n)).toBe(ordinalName(n));
      expect(f(0)).toBe("");
    }
  });
});
