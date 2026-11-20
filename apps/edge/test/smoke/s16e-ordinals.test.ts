// SMOKE 20 NOV, owner step 16: prize names (1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 22nd, 23rd ... 101st) must read right EVERYWHERE a prize position is spelled: shared helper, report and game log,
// the player's phone page (z.js), the console (console.js), the big screen (big.js), the winners certificate (v2-certs.ts). A house can have up to 100 winners, so positions above 20 are real.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ordinalName, rewardName } from "../../../../packages/shared/src/ticket";
import { ordinalName as shared } from "../../../../packages/shared/src/ordinal";
import { prizeName } from "../../src/v2-certs";

const right = (n: number) => { const t = n % 100, r = n % 10; return n + (t >= 11 && t <= 13 ? "th" : r === 1 ? "st" : r === 2 ? "nd" : r === 3 ? "rd" : "th"); };
const ROOT = new URL("../../../../", import.meta.url).pathname;
/** pull ONE helper's source out of a file by a pattern that matches its definition line, and build it */
function lift(file: string, defn: RegExp): (n: number) => string {
  const line = readFileSync(ROOT + file, "utf8").split("\n").find((l) => defn.test(l));
  if (!line) throw new Error(`${file}: no line matches ${defn}`);
  const src = line.trim().replace(/^const\s+\w+\s*=\s*/, "").replace(/;\s*(\/\/.*)?$/, "").replace(/:\s*number\)\s*=>/, ") =>").replace(/\(n: number\)/, "(n)").replace(/\)\s*:\s*string/, ")");
  return new Function(`return (${src.replace(/\s*\/\/.*$/, "")})`)() as (n: number) => string;
}
const PRODUCERS: [string, (n: number) => string][] = [
  ["packages/shared ordinal.ts", shared], ["packages/shared ticket.ts ordinalName", ordinalName],
  ["rewardName (report, game log, phone)", (n) => rewardName("full", "ticket", n, 200).replace(/ Full House$/, "")],
  ["apps/web/public/z.js (the player's phone page)", lift("apps/web/public/z.js", /^\s*const ordinalName = /)],
  ["apps/web/public/console.js", lift("apps/web/public/console.js", /^\s*const ord = /)],
  ["apps/web/public/big.js (big screen)", lift("apps/web/public/big.js", /^\s*const ORD = /)],
  ["apps/edge/src/v2-certs.ts prizeName (winners certificate)", (n) => prizeName("full", n, true).replace(/ Full House$/, "")],
];
describe("S16-O every place that spells a prize position gives 1st 2nd 3rd 4th ... 11th 12th 13th ... 21st 22nd 23rd ... 101st ... 111th", () => {
  for (const [name, f] of PRODUCERS) test(`${name}: positions 1 to 130`, () => {
    const wrong: string[] = []; for (let n = 1; n <= 130; n++) if (f(n) !== right(n) && f(n) !== right(n).replace(/^\d+/, "")) wrong.push(`${n}: ${f(n)} (should be ${right(n)})`);
    expect(wrong).toEqual([]);
  });
});
