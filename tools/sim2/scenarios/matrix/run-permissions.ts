// bun tools/sim2/scenarios/matrix/run-permissions.ts --seed 1 [--only <regexp on scenario name>] [--list [--names]] [--limit N] [--verbose]
// The runner of the PERMISSION AND STATE MATRIX (gen-permissions.mjs only). A copy of run.ts's loading code with three differences:
//   - its own port (MATRIX_PORT, default 8804) and its own database file sim/perm-seed<N>.sqlite, result file sim/perm-result-seed<N>.json (it never touches 8801/8802/8799/8890 or the other matrix run's files);
//   - scenarios belong to GROUPS (one world per game state): the group's world is built once (enter), its cells run one after the other, then the clock is put back (leave);
//   - the 5xx rule is global as in run.ts; the "plain words" rule is applied by the generator itself (it names the cell), so the global unfriendly rule is off.
// Nothing leaves the machine: tools/sim2/server.ts blocks every non-localhost fetch.
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = args.indexOf("--" + k); return i >= 0 ? (args[i + 1] !== undefined && !args[i + 1]!.startsWith("--") ? args[i + 1] : "1") : d; };
const seed = Number(arg("seed", "1")); const only = arg("only"); const listOnly = args.includes("--list"); const limit = Number(arg("limit", "0"));
const PORT = Number(process.env.MATRIX_PORT ?? 8804);
process.env.SIM_PORT = String(PORT); // the shared harness library reads this when it is imported
const ROOT = join(import.meta.dir, "../../../..");

const { startSim } = await import("../../server");
const L = await import("./lib.mjs");
const { A, clock } = L;
const m = await import("./gen-permissions.mjs");
let scenarios: any[] = (await m.default({ seed, R: L.rng(seed * 7919 + 13), L })).map((s: any) => ({ ...s, family: "permissions" }));
const dup = scenarios.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i);
if (dup.length) { console.error("duplicate scenario names:", [...new Set(dup)].slice(0, 10)); process.exit(2); }
if (only) { const re = new RegExp(only, "i"); scenarios = scenarios.filter((s) => re.test(s.name)); }
// private-world scenarios first (no group), then group after group in generation order, inside a group the safe cells before the destructive ones
const gOrder = new Map<any, number>(); for (const s of scenarios) if (s.group && !gOrder.has(s.group)) gOrder.set(s.group, gOrder.size + 1);
scenarios = scenarios.map((s, i) => ({ s, i })).sort((a, b) => ((a.s.group ? gOrder.get(a.s.group)! : 0) - (b.s.group ? gOrder.get(b.s.group)! : 0)) || ((a.s.order ?? 0) - (b.s.order ?? 0)) || a.i - b.i).map((x) => x.s);
if (limit) scenarios = scenarios.slice(0, limit);
if (listOnly) {
  const by: Record<string, number> = {}; for (const s of scenarios) { const k = s.group?.key ?? "private-world"; by[k] = (by[k] ?? 0) + 1; }
  console.log(JSON.stringify({ seed, total: scenarios.length, by }));
  if (args.includes("--names")) console.log(scenarios.map((s) => s.name).join("\n"));
  process.exit(0);
}

mkdirSync(join(ROOT, "sim"), { recursive: true });
const sim = await startSim({ port: PORT, runFile: join(ROOT, `sim/perm-seed${seed}.sqlite`), build: false });

let CUR: any = null;
const inner = globalThis.fetch.bind(globalThis);
(globalThis as any).fetch = async (input: any, init?: any) => {
  const r = await inner(input, init);
  if (CUR) {
    try {
      const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); const mm = (init?.method ?? "GET").toUpperCase();
      if (/^\/(api|ai|j)\//.test(u.pathname)) { CUR.calls++; if (r.status >= 500) CUR.fivexx.push(`${mm} ${u.pathname} -> ${r.status}`); }
    } catch { /* never let bookkeeping break a scenario */ }
  }
  return r;
};

const results: any[] = []; const t0 = Date.now(); let nChecks = 0;
const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("scenario timeout " + ms + " ms")), ms))]);
let cur: any = null; let i = 0; const worldErr: Record<string, string> = {}; const groupNotes: Record<string, string[]> = {};
const leaveCurrent = async () => { if (cur) { try { await cur.leave(); } catch { /* ignore */ } cur = null; } };
for (const sc of scenarios) {
  i++;
  if (sc.group !== cur) {
    await leaveCurrent();
    if (sc.group) {
      cur = sc.group; const st = new L.T({ name: "setup:" + sc.group.key }, seed); st.calls = 0; st.fivexx = []; CUR = st;
      try { await A.mailbox.clear(); await withTimeout(sc.group.enter(st), 240_000); groupNotes[sc.group.key] = sc.group.world?.notes ?? []; console.log(`# world ${sc.group.key}: built${(groupNotes[sc.group.key] ?? []).length ? " (" + (groupNotes[sc.group.key] ?? []).join(" ; ").slice(0, 300) + ")" : ""}`); }
      catch (e: any) { worldErr[sc.group.key] = (e?.message ?? String(e)).slice(0, 400); sc.group.error = worldErr[sc.group.key]; console.log(`# world ${sc.group.key}: BUILD FAILED ${worldErr[sc.group.key]}`); }
      CUR = null;
    } else { try { await clock.reset(); } catch { /* ignore */ } }
  }
  const t = new L.T(sc, seed); t.calls = 0; t.fivexx = []; CUR = t;
  const s0 = Date.now();
  try { if (sc.group && worldErr[sc.group.key]) throw new Error("harness: the world of this state did not build: " + worldErr[sc.group.key]); await withTimeout(sc.run(t), sc.timeoutMs ?? 90_000); }
  catch (e: any) { t.check("no exception", false, (e?.message ?? String(e)).slice(0, 300)); }
  try { t.check("no server error (5xx) on any call", t.fivexx.length === 0, t.fivexx.slice(0, 3).join(" | ")); const dbl = await A.sql("SELECT eid, COUNT(*) c FROM payment WHERE status='paid' AND eid IS NOT NULL GROUP BY eid HAVING c>1"); t.check("nobody paid twice for one game", dbl.length === 0, JSON.stringify(dbl).slice(0, 200)); } catch (e: any) { t.check("global invariants ran", false, e?.message); }
  CUR = null;
  const failed = t.checks.filter((c: any) => !c.ok); nChecks += t.checks.length;
  results.push({ name: sc.name, group: sc.group?.key ?? "private-world", ok: failed.length === 0, ms: Date.now() - s0, calls: t.calls, checks: t.checks.length, failed });
  if (failed.length) console.log(`FAIL [${sc.group?.key ?? "private"}] ${sc.name}\n` + failed.slice(0, 5).map((c: any) => `     - ${c.name} | ${c.detail}`).join("\n"));
  else if (args.includes("--verbose")) console.log(`ok   [${sc.group?.key ?? "private"}] ${sc.name}` + (args.includes("--trace") ? "\n" + t.checks.map((c: any) => `        . ${c.name} | ${c.detail}`).join("\n") : ""));
  if (i % 100 === 0) console.log(`... ${i}/${scenarios.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
}
await leaveCurrent();
const passed = results.filter((r) => r.ok).length; const by: Record<string, { total: number; failed: number }> = {};
for (const r of results) { const g = (by[r.group] ??= { total: 0, failed: 0 }); g.total++; if (!r.ok) g.failed++; }
const health = await (await inner(`http://localhost:${PORT}/__sim/health`)).json() as any;
const summary = { seed, total: results.length, passed, failed: results.length - passed, checks: nChecks, byGroup: by, worldErrors: worldErr, groupNotes, seconds: Math.round((Date.now() - t0) / 1000), blockedFetches: health.blockedFetches };
writeFileSync(join(ROOT, `sim/perm-result-seed${seed}.json`), JSON.stringify({ summary, results }, null, 1));
console.log(`PERMISSIONS seed=${seed} scenarios=${results.length} passed=${passed} failed=${results.length - passed} checks=${nChecks} seconds=${summary.seconds} blockedFetches=${health.blockedFetches.length}`);
console.log(JSON.stringify(by));
sim.stop(); process.exit(0);
