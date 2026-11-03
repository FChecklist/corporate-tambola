// rc/tambola-1.8.5: the scenario matrix in small mode (10,000 scenarios spread over the whole 6.4 million), run as a test, plus checks on the matrix itself.
// Full run (about 90 seconds):  bun tools/matrix/run.ts        Small run:  bun tools/matrix/run.ts --small
// Run as tests: bun test --isolate tools/matrix
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { TOTAL, RADIX, scenarioAt, scenarios } from "./scenarios";
import { oracleEmpNew, oracleEmpOld, oracleEmail, oracleEmailId } from "./oracle";
import { dedupeCheck } from "./spellings";

describe("the matrix itself", () => {
  test("the whole space is at least 1,000,000 scenarios (6,422,528)", () => { expect(TOTAL).toBe(RADIX.reduce((a, b) => a * b, 1)); expect(TOTAL).toBe(6_422_528); expect(TOTAL).toBeGreaterThanOrEqual(1_000_000); });
  test("the spelling tables have no duplicates and 28 formats each", () => { expect(() => dedupeCheck()).not.toThrow(); });
  test("scenarios are streamed by a generator, in strictly rising order, and the first and last are the two ends of the space", () => {
    const g = scenarios(); expect(typeof (g as any).next).toBe("function"); let prev = -1, n = 0; for (const s of g) { expect(s.n).toBeGreaterThan(prev); prev = s.n; if (++n >= 5000) break; }
    expect(scenarioAt(0).n).toBe(0); expect(scenarioAt(TOTAL - 1).n).toBe(TOTAL - 1); expect(scenarioAt(0).listText).not.toBe(scenarioAt(1).typedText + "x");
  });
  test("small mode yields exactly 10,000 different scenarios", () => { let n = 0, prev = -1; for (const s of scenarios(10_000)) { expect(s.n).toBeGreaterThan(prev); prev = s.n; n++; } expect(n).toBe(10_000); });
  test("the oracle is the rule of the handoff (independent of the product)", () => {
    for (const x of ["1B-678", "1b-678", "1B/678", "1B 678", "1b.678", "１Ｂ－６７８"]) expect(oracleEmpNew(x)).toBe("1B678");
    expect(oracleEmpNew("ß1")).toBe("1"); expect(oracleEmpNew("---")).toBe(null); expect(oracleEmpNew("  ")).toBe(""); expect(oracleEmpNew("A".repeat(31))).toBe(null); expect(oracleEmpNew("demo1@demo-test.invalid")).toBe(null);
    expect(oracleEmpOld("1B-678")).toBe("1B-678"); expect(oracleEmpOld("1b 678")).toBe("1B678"); expect(oracleEmpOld("1B🙂678")).toBe(null);
    expect(oracleEmail(" DEMO1 @Demo-Test.invalid ")).toBe("demo1@demo-test.invalid"); expect(oracleEmailId("demo1@demo")).toBe(null); expect(oracleEmailId("demo1@demo-test.invalid")).toBe("demo1@demo-test.invalid");
  });
});

describe("small mode against the product", () => {
  test("10,000 scenarios: count, distinct, failures 0 (and the real-Worker sample)", async () => {
    const p = Bun.spawn(["bun", join(import.meta.dir, "run.ts"), "--small"], { stdout: "pipe", stderr: "pipe", cwd: join(import.meta.dir, "../..") });
    const out = await new Response(p.stdout).text(); const code = await p.exited; console.log(out);
    expect(out).toContain("scenarios run:   10,000"); expect(out).toContain("distinct:        10,000 (every one different)"); expect(out).toMatch(/failures:\s+0\n/); expect(code).toBe(0);
  }, 120_000);
});
