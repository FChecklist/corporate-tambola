// rc/tambola-1.8.5 final: FIX PROOFS for the tests that are RED on purpose because they found a product defect. For each defect: a copy of the product in a TEMP folder gets the smallest possible
// fix, the red test must turn GREEN, and the repository is never written to. This shows the test is right (it passes when the product is right), not that the fix is the final one.
//   bun tools/matrix/breaks/fix-proofs.ts
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(join(import.meta.dir, "../../.."));
interface Fix { id: string; defect: string; file: string; find: string; replace: string; run: string[] }
const FIXES: Fix[] = [
  { id: "D1", defect: "a person who is only LISTED does not lock idKind", file: "apps/edge/src/worker.ts",
    find: 'const have = await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>();\n    if ((vc.cfg.idKind',
    replace: 'const have0 = await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>(); const listed0 = await env.DB.prepare("SELECT COUNT(*) AS c FROM person WHERE eid=? AND status<>\'removed\'").bind(eid).first<{ c: number }>(); const have = { c: (have0?.c ?? 0) + (listed0?.c ?? 0) };\n    if ((vc.cfg.idKind',
    run: ["bun", "test", "--isolate", "apps/edge/test/rc185/audit-fixes.test.ts", "-t", "PRODUCT BUG D1"] },
  { id: "G1", defect: "endedAtMs appears from the first lifecycle tick (the scheduled end, which moves when a break is added)", file: "apps/edge/src/worker.ts",
    find: 'return l && l.end_src !== "cancel" && Number.isFinite', replace: 'return l && l.end_src !== "cancel" && l.end_src !== "schedule" && Number.isFinite',
    run: ["bun", "test", "--isolate", "apps/edge/test/rc185/audit-fixes.test.ts", "-t", "PRODUCT BUG G1"] },
  { id: "D2", defect: "the new refusal 'You already have people listed. Start a new game ...' (409 idkind-locked) has no guide entry", file: "apps/web/public/guide.js",
    find: '    { m: ["This looks like an Email ID. This game asks for an employee ID"], k: "field"',
    replace: '    { m: ["You already have people listed. Start a new game to use a different kind of ID"], k: "blocked", t: "The kind of ID cannot change now", w: "People are already listed or have joined, so the kind of ID is fixed for this game.", d: ["Start a new game to use a different kind of ID."], g: { none: true } },\n    { m: ["This looks like an Email ID. This game asks for an employee ID"], k: "field"',
    run: ["bun", "test", "--isolate", "apps/web/test/guide.test.ts"] },
];
const TMP = mkdtempSync(join(process.env.BREAK_TMP ?? tmpdir(), "tambola-fixes-"));
for (const d of ["apps/edge", "apps/web", "packages", "tools/matrix"]) cpSync(join(REPO, d), join(TMP, d), { recursive: true, filter: (p) => !/node_modules/.test(p) });
for (const f of ["package.json", "tsconfig.json", "bun.lock"]) if (existsSync(join(REPO, f))) cpSync(join(REPO, f), join(TMP, f));
symlinkSync(join(REPO, "node_modules"), join(TMP, "node_modules"));
for (const d of ["apps/edge", "apps/web", "packages/beacon"]) if (existsSync(join(REPO, d, "node_modules"))) symlinkSync(join(REPO, d, "node_modules"), join(TMP, d, "node_modules"));
const run = (cmd: string[]) => { const p = Bun.spawnSync(cmd, { timeout: 300_000, cwd: TMP, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } }); const out = p.stdout.toString() + p.stderr.toString(); return { code: p.exitCode, pass: Number(/\n\s*(\d+) pass/.exec(out)?.[1] ?? 0), fail: Number(/\n\s*(\d+) fail/.exec(out)?.[1] ?? 0) }; };
let bad = 0;
for (const f of FIXES) {
  const path = join(TMP, f.file), orig = readFileSync(path, "utf8"), n = orig.split(f.find).length - 1;
  if (n !== 1) { console.log(`${f.id} BAD FIX: the text occurs ${n} times`); bad++; continue; }
  const before = run(f.run); writeFileSync(path, orig.replace(f.find, () => f.replace)); const after = run(f.run); writeFileSync(path, orig);
  const ok = before.code !== 0 && before.fail > 0 && after.code === 0 && after.pass > 0 && readFileSync(path, "utf8") === orig; if (!ok) bad++;
  console.log(`${f.id.padEnd(4)} ${f.defect}\n     product as it is: ${before.code === 0 ? "GREEN" : "RED"} (${before.fail} fail) -> with the smallest fix in a temp copy: ${after.code === 0 ? "GREEN" : "STILL RED"} (${after.pass} pass, ${after.fail} fail)${ok ? "" : "   <== PROBLEM"}`);
}
rmSync(TMP, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
