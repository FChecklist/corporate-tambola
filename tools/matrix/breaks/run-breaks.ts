// rc/tambola-1.8.5: deliberate-break runner.
//   bun tools/matrix/breaks/run-breaks.ts --list
//   bun tools/matrix/breaks/run-breaks.ts [--only B01,W05] [--edge | --web] [--no-matrix]
// For each break: copy of the product in a TEMP folder -> baseline test GREEN -> ONE change -> the test must go RED -> change undone and checked byte for byte.
// The repository is never written to. Exit code 1 if any break stayed green (the test does not guard the rule), or any restore differs.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { BREAKS, type Brk } from "./table";

const REPO = resolve(join(import.meta.dir, "../../.."));
const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
if (process.argv.includes("--list")) { for (const b of BREAKS) console.log(`${b.id.padEnd(34)} ${b.rule}`); process.exit(0); }
const only = arg("--only")?.split(",").map((x) => x.trim()).filter(Boolean);
let list = BREAKS.filter((b) => !only || only.some((o) => b.id.startsWith(o)));
if (process.argv.includes("--edge")) list = list.filter((b) => !b.slow); if (process.argv.includes("--web")) list = list.filter((b) => b.slow);
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

const before = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: REPO }).stdout.toString();
const TMP = mkdtempSync(join(process.env.BREAK_TMP ?? tmpdir(), "tambola-breaks-"));
for (const d of ["apps/edge", "apps/web", "packages", "tools/matrix"]) cpSync(join(REPO, d), join(TMP, d), { recursive: true, filter: (p) => !/node_modules/.test(p) });
for (const f of ["package.json", "tsconfig.json", "bun.lock"]) if (existsSync(join(REPO, f))) cpSync(join(REPO, f), join(TMP, f));
symlinkSync(join(REPO, "node_modules"), join(TMP, "node_modules"));
for (const d of ["apps/edge", "apps/web", "packages/beacon"]) if (existsSync(join(REPO, d, "node_modules"))) symlinkSync(join(REPO, d, "node_modules"), join(TMP, d, "node_modules")); // the workspaces' own dependencies
console.log(`temp copy: ${TMP}\n`);

const run = (cmd: string[]) => { const p = Bun.spawnSync(cmd, { timeout: 300_000, cwd: TMP, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } }); const out = p.stdout.toString() + p.stderr.toString(); return { code: p.exitCode, out, fail: Number(/\n\s*(\d+) fail/.exec(out)?.[1] ?? 0), pass: Number(/\n\s*(\d+) pass/.exec(out)?.[1] ?? 0) }; };
const matrixCmd = ["bun", "tools/matrix/run.ts", "--small", "--worker", "0", "--root", TMP];
const baselines = new Map<string, { code: number | null; pass: number }>();
const rows: string[] = []; let bad = 0;
for (const b of list) {
  const path = join(TMP, b.file), orig = readFileSync(path, "utf8"), n = orig.split(b.find).length - 1;
  if (n !== 1) { rows.push(`${b.id.padEnd(34)} BAD BREAK: the text to change occurs ${n} times in ${b.file}`); console.log(rows[rows.length - 1]); bad++; continue; }
  const key = b.run.join(" "); if (!baselines.has(key)) { const g = run(b.run); baselines.set(key, { code: g.code, pass: g.pass }); }
  const g = baselines.get(key)!;
  writeFileSync(path, orig.replace(b.find, () => b.replace));
  const red = run(b.run); const mred = b.matrix && !process.argv.includes("--no-matrix") ? run(matrixCmd) : null;
  writeFileSync(path, orig); const restored = readFileSync(path, "utf8") === orig;
  const isRed = red.code !== 0 && red.fail > 0, isGreen = g.code === 0;
  const ok = isRed && isGreen && restored; if (!ok) bad++;
  rows.push(`${b.id.padEnd(34)} baseline ${isGreen ? "GREEN" : "NOT GREEN"} (${g.pass} pass) -> broken ${isRed ? "RED" : "STAYED GREEN"} (${red.fail} fail)${mred ? ` | matrix ${mred.code !== 0 ? "RED" : "STAYED GREEN"}` : ""} -> restored ${restored ? "yes " + sha(orig) : "NO"}${ok ? "" : "   <== PROBLEM"}`);
  console.log(rows[rows.length - 1]);
}
const after = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: REPO }).stdout.toString();
rmSync(TMP, { recursive: true, force: true });
console.log(`\n${list.length} breaks, ${list.length - bad} proven (green -> red -> restored), ${bad} problem(s). Repo status unchanged: ${before === after ? "yes" : "NO !!"}`);
process.exit(bad || before !== after ? 1 : 0);
