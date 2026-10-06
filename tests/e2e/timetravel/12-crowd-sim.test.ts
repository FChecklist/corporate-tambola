// CRD-10..: the repository's own virtual-time crowd simulation (real PhoneRuntime code on every phone, real Worker, awkward public beacon), run for 100 and 250 phones.
import { expect } from "bun:test";
import { tt } from "./lib";

async function run(n: number, extra: string[] = []) {
  const p = Bun.spawn([process.execPath, "run", "tools/sim/crowd.ts", String(n), ...extra], { cwd: new URL("../../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), stdout: "pipe", stderr: "pipe", env: { ...process.env } });
  const out = await new Response(p.stdout).text(); await p.exited;
  const fails = out.split("\n").filter((l) => /FAIL/.test(l));
  return { code: p.exitCode, out, fails, ok: out.split("\n").filter((l) => /^\s*ok:/.test(l)).length };
}
tt({ id: "CRD-10", role: "100 phones (virtual time)", title: "100-phone crowd: every phone works out the same winners, results settle, nobody is double-counted", steps: "bun run tools/sim/crowd.ts 100", expected: "exit 0, no FAIL line" }, async () => {
  const r = await run(100); expect(r.fails, r.out.slice(-600)).toEqual([]); expect(r.code).toBe(0); return `${r.ok} checks ok`;
}, 240_000);
tt({ id: "CRD-11", role: "250 phones (virtual time)", title: "250-phone crowd with two tickets, several prizes and brand breaks ('rich' mode)", steps: "bun run tools/sim/crowd.ts 250 rich", expected: "exit 0, no FAIL line" }, async () => {
  const r = await run(250, ["rich"]); expect(r.fails, r.out.slice(-600)).toEqual([]); expect(r.code).toBe(0); return `${r.ok} checks ok`;
}, 480_000);
