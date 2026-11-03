// rc/tambola-1.8.5 final: the ID / e-mail cleaning matrix in small mode (20,000 inputs spread over the whole space), run as a test. The full run (1,000,000+ distinct inputs): bun tools/matrix/id-clean.ts
// Run: bun test --isolate tools/matrix/id-clean.test.ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

describe("ID / e-mail cleaning matrix, small mode", () => {
  test("20,000 inputs: nearly all distinct, every rule R1 to R6 holds, failures 0", async () => {
    const p = Bun.spawn(["bun", join(import.meta.dir, "id-clean.ts"), "--small"], { stdout: "pipe", stderr: "pipe", cwd: join(import.meta.dir, "../..") });
    const out = await new Response(p.stdout).text(); const err = await new Response(p.stderr).text(); const code = await p.exited; console.log(out + err);
    const d = /distinct inputs run: ([\d,]+)/.exec(out); expect(d).toBeTruthy(); expect(Number(d![1]!.replace(/,/g, ""))).toBeGreaterThanOrEqual(18_000);
    expect(out).toMatch(/failures:\s+0\n/); expect(code).toBe(0);
  }, 120_000);
});
