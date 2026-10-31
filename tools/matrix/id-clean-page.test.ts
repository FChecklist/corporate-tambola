// rc/tambola-1.8.5 final7: the join-page part of the ID / e-mail cleaning matrix (the hint under the ID box, the P1 / P2 checks), as a test: 400 of the matrix inputs typed into the REAL join page
// of an employee-ID game and of an Email ID game. R-email-hint: in an Email ID game the 'The system will read this as ...' hint appears ONLY when the value looks like an address.
// Run: bun test --isolate tools/matrix/id-clean-page.test.ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

describe("ID / e-mail cleaning matrix, join page part", () => {
  test("400 inputs typed into the real join page: the hint follows the rules in both games, failures 0", async () => {
    const p = Bun.spawn(["bun", join(import.meta.dir, "id-clean.ts"), "--small", "--worker", "0", "--page", "400"], { stdout: "pipe", stderr: "pipe", cwd: join(import.meta.dir, "../..") });
    const out = await new Response(p.stdout).text(); const err = await new Response(p.stderr).text(); const code = await p.exited; console.log(out + err);
    const n = /real-page inputs \(typed into the join page, two games\): ([\d,]+)/.exec(out); expect(n).toBeTruthy(); expect(Number(n![1]!.replace(/,/g, ""))).toBeGreaterThanOrEqual(700); // about 400 per game (repeats are skipped)
    expect(out).toMatch(/failures:\s+0\n/); expect(code).toBe(0);
  }, 180_000);
});
