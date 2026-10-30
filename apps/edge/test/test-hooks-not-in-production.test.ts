// The campaign's compressed clock and stand-in beacon exist ONLY in apps/edge/src/local.ts (the local test server). They must never be reachable from what Cloudflare runs.
// This test walks every import from the production entry points (the Pages functions and the worker) and builds the worker bundle: none of them may contain the hook.
// FALSIFIED BY: a CLOCK_SPEED / FAKE_BEACON / campaignClockNow marker added to worker.ts, or an import of local.ts from anything the worker imports.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(import.meta.dir, "../../..");
const MARKERS = ["CLOCK_SPEED", "CLOCK_BASE_MS", "__test/clock", "FAKE_BEACON", "campaignClockNow"];
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === "node_modules" ? [] : walk(p)) : /\.(ts|js|mjs)$/.test(n) ? [p] : []; });
const resolveImport = (from: string, spec: string): string | null => {
  const base = resolve(dirname(from), spec);
  for (const c of [base, base + ".ts", base + ".js", base + ".mjs", join(base, "index.ts"), join(base, "index.js")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
};
/** Every source file reachable from the entries through relative imports (static and dynamic). */
const reachable = (entries: string[]) => {
  const seen = new Set<string>(), todo = [...entries];
  while (todo.length) {
    const f = todo.pop()!; if (seen.has(f)) continue; seen.add(f);
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) { const r = resolveImport(f, m[1]!); if (r) todo.push(r); }
  }
  return [...seen];
};

describe("test hooks are not in the production worker", () => {
  const entries = [join(ROOT, "apps/edge/src/worker.ts"), ...walk(join(ROOT, "pages/functions"))];
  test("the entries exist and reach the worker's own files", () => { expect(entries.length).toBeGreaterThan(3); expect(reachable(entries).length).toBeGreaterThan(20); });
  test("local.ts is not imported by anything the production code reaches", () => {
    const files = reachable(entries); expect(files.some((f) => /apps[\\/]edge[\\/]src[\\/]local\.ts$/.test(f))).toBe(false);
  });
  test("no reachable source file mentions the clock hook, the stand-in beacon or the test clock endpoint", () => {
    const bad: string[] = [];
    for (const f of reachable(entries)) { const s = readFileSync(f, "utf8"); for (const m of MARKERS) if (s.includes(m)) bad.push(`${f.replace(ROOT, "")}: ${m}`); }
    expect(bad).toEqual([]);
  });
  test("the built worker bundle carries none of them, and the same build of local.ts DOES (so the check can fail)", () => {
    const dir = mkdtempSync(join(tmpdir(), "bundle-"));
    try {
      const build = (entry: string, out: string) => Bun.spawnSync([process.execPath, "build", entry, "--target=bun", "--outfile", join(dir, out)], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
      const w = build(join(ROOT, "apps/edge/src/worker.ts"), "worker.js"); expect(w.exitCode).toBe(0);
      const l = build(join(ROOT, "apps/edge/src/local.ts"), "local.js"); expect(l.exitCode).toBe(0);
      const wb = readFileSync(join(dir, "worker.js"), "utf8"), lb = readFileSync(join(dir, "local.js"), "utf8");
      for (const m of MARKERS) expect([m, wb.includes(m)]).toEqual([m, false]);
      expect(lb.includes("__test/clock") && lb.includes("FAKE_BEACON")).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
