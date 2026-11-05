// bun tools/sim2/scenarios/matrix/run-modes.ts --seed 1 [--only <regexp on scenario name>] [--list [--names]] [--limit N] [--verbose]
// The runner of the FOUR GAME MODES family (gen-modes.mjs): role x mode x time window. Its own port (MODES_PORT, default 8806) and database file sim/modes-seed<N>.sqlite, result file
// sim/modes-result-seed<N>.json. Every scenario builds its own organizer and game (no shared world), and puts the sim clock back afterwards. Nothing leaves the machine.
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = args.indexOf("--" + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "1") : d; };
const seed = Number(arg("seed", "1")); const only = arg("only"); const listOnly = args.includes("--list"); const limit = Number(arg("limit", "0"));
const PORT = Number(process.env.MODES_PORT ?? 8806);
process.env.SIM_PORT = String(PORT);
const ROOT = join(import.meta.dir, "../../../..");

const { startSim } = await import("../../server");
const L: any = await import("./lib.mjs");
const { A, clock } = L;
const m: any = await import("./gen-modes.mjs");
let scenarios: any[] = await m.default({ seed, R: L.rng(seed * 7919 + 17), L });
const dup = scenarios.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i);
if (dup.length) { console.error("duplicate scenario names:", [...new Set(dup)].slice(0, 10)); process.exit(2); }
if (only) { const re = new RegExp(only, "i"); scenarios = scenarios.filter((s) => re.test(s.name)); }
if (limit) scenarios = scenarios.slice(0, limit);
if (listOnly) { console.log(JSON.stringify({ seed, total: scenarios.length })); if (args.includes("--names")) console.log(scenarios.map((s) => s.name).join("\n")); process.exit(0); }

mkdirSync(join(ROOT, "sim"), { recursive: true });
const sim = await startSim({ port: PORT, runFile: join(ROOT, `sim/modes-seed${seed}.sqlite`), build: false });
let CUR: any = null;
const inner = globalThis.fetch.bind(globalThis);
(globalThis as any).fetch = async (input: any, init?: any) => {
  const r = await inner(input, init);
  if (CUR) { try { const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); if (/^\/(api|ai|j)\//.test(u.pathname)) { CUR.calls++; if (r.status >= 500) CUR.fivexx.push(`${(init?.method ?? "GET").toUpperCase()} ${u.pathname} -> ${r.status}`); } } catch { /* bookkeeping only */ } }
  return r;
};
const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("scenario timeout " + ms + " ms")), ms))]);
const results: any[] = []; const t0 = Date.now(); let nChecks = 0, i = 0;
for (const sc of scenarios) {
  i++;
  try { await clock.reset(); } catch { /* ignore */ }
  const t = new L.T(sc, seed); t.calls = 0; t.fivexx = []; CUR = t; const s0 = Date.now();
  try { await A.mailbox.clear(); await withTimeout(sc.run(t), sc.timeoutMs ?? 90_000); } catch (e: any) { t.check("no exception", false, (e?.message ?? String(e)).slice(0, 300)); }
  t.check("no server error (5xx) on any call", t.fivexx.length === 0, t.fivexx.slice(0, 3).join(" | "));
  CUR = null;
  const failed = t.checks.filter((c: any) => !c.ok); nChecks += t.checks.length;
  results.push({ name: sc.name, ok: failed.length === 0, ms: Date.now() - s0, calls: t.calls, checks: t.checks.length, failed });
  if (failed.length) console.log(`FAIL ${sc.name}\n` + failed.slice(0, 6).map((c: any) => `     - ${c.name} | ${c.detail}`).join("\n"));
  else if (args.includes("--verbose")) console.log(`ok   ${sc.name} (${t.checks.length} checks)`);
}
try { await clock.reset(); } catch { /* ignore */ }
const passed = results.filter((r) => r.ok).length;
const health = await (await inner(`http://localhost:${PORT}/__sim/health`)).json() as any;
writeFileSync(join(ROOT, `sim/modes-result-seed${seed}.json`), JSON.stringify({ seed, total: results.length, passed, checks: nChecks, results }, null, 1));
console.log(`MODES seed=${seed} scenarios=${results.length} passed=${passed} failed=${results.length - passed} checks=${nChecks} seconds=${Math.round((Date.now() - t0) / 1000)} blockedFetches=${health.blockedFetches.length}`);
sim.stop(); process.exit(0);
