// 250x10 game 8 (docs/250x10/RESULTS.md): a game with 25 Early Five winners printed "21th Early Five", "22th" and "23th" in the Organizer's game log and report.
// Root cause: the same one-line ordinal (`["", "1st", "2nd", "3rd"][n] ?? n + "th"`) was copied into nine files and is wrong for 21, 22, 23, 31, 32, 33 ... 91, 92, 93.
// There is now ONE function (packages/shared/src/ticket.ts `ordinalName`), the web pages carry the same rule, and no file may carry its own copy.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ordinalName } from "../../../packages/shared/src/ticket";
import { prizeStatus } from "../../../packages/beacon/src/prize-status";
import { defaultCfg } from "../../../packages/beacon/src/config";

const ROOT = join(import.meta.dir, "../../..");
const expected = (n: number) => { const m = n % 100; const suffix = m >= 11 && m <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"; return n + suffix; };

describe("ordinal names: 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 22nd, 23rd ... 101st", () => {
  test("the shared function is right for 1 to 200", () => {
    for (let n = 1; n <= 200; n++) expect(ordinalName(n)).toBe(expected(n));
    expect([21, 22, 23, 31, 32, 33, 91, 92, 93, 101, 111, 112, 113, 121].map(ordinalName)).toEqual(["21st", "22nd", "23rd", "31st", "32nd", "33rd", "91st", "92nd", "93rd", "101st", "111th", "112th", "113th", "121st"]);
  });
  test("the live prize list (phones) names every place of a 25-winner house right", () => {
    const cfg = { ...defaultCfg(), rewards: Array.from({ length: 25 }, (_, k) => ({ pattern: "early5" as const, scope: "ticket" as const, ordinal: k + 1, text: "x" })) };
    expect(prizeStatus(cfg, []).map((p) => p.name)).toEqual(Array.from({ length: 25 }, (_, k) => `${expected(k + 1)} Early Five`));
  });
  const files = (dir: string, out: string[] = []): string[] => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (f === "node_modules" || f === "test") continue; if (statSync(p).isDirectory()) files(p, out); else if (/\.(ts|js)$/.test(f) && !/\.test\./.test(f)) out.push(p); } return out; };
  test("no source file carries its own copy of the broken one-line ordinal", () => {
    const bad = [...files(join(ROOT, "apps")), ...files(join(ROOT, "packages"))].filter((p) => /\[\s*""\s*,\s*"1st"\s*,\s*"2nd"\s*,\s*"3rd"\s*\]\s*\[/.test(readFileSync(p, "utf8")));
    expect(bad.map((p) => p.slice(ROOT.length + 1))).toEqual([]);
  });
  test("every page that spells a place out uses the same rule: it names the 21st, 22nd and 23rd", () => {
    for (const f of ["z.js", "console.js", "big.js", "board.js", "zc.js"]) {
      const src = readFileSync(join(ROOT, "apps/web/public", f), "utf8");
      const m = src.match(/const (ordinalName|ord|ORD|ordName) = (\(\w+\)) => (\{[^\n]*\});/);
      expect(m).not.toBeNull();
      const fn = new Function(`return ${m![2]} => ${m![3]}`)() as (n: number) => string;
      for (let n = 1; n <= 130; n++) expect([f, fn(n)]).toEqual([f, expected(n)]);
    }
  });
});
