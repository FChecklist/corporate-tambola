// bun tools/sim2/scenarios/matrix/run-organizer.ts --seed 1 [--only <regexp on scenario name>] [--list [--names]] [--skip-time | --only-time] [--verbose]
// The runner of ONE family, "organizer" (gen-organizer.mjs: organizer game creation, steps 1 to 10). It is run.ts's own loading and checking code with the family list cut down to that one file,
// so run.ts and lib.mjs are untouched. Own sim server (default port 8803, env MATRIX_PORT), own database file sim/organizer-seed<N>.sqlite, never 8801/8802/8799/8821/8890.
// Writes sim/organizer-result-seed<N>.json (every scenario) and sim/organizer-findings-seed<N>.json (failed checks grouped by check name, with the first examples).
// Summary line: ORGANIZER seed=N scenarios=X passed=Y failed=Z checks=C.   Nothing leaves the machine: tools/sim2/server.ts blocks every non-localhost fetch.
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = args.indexOf("--" + k); return i >= 0 ? (args[i + 1] !== undefined && !args[i + 1]!.startsWith("--") ? args[i + 1] : "1") : d; };
const seed = Number(arg("seed", "1")); const only = arg("only"); const listOnly = args.includes("--list");
const PORT = Number(process.env.MATRIX_PORT ?? 8803);
process.env.SIM_PORT = String(PORT); // the shared harness library reads this when it is imported
const ROOT = join(import.meta.dir, "../../../..");

const { startSim } = await import("../../server");
const L = await import("./lib.mjs");
const { A, clock } = L;
const families = ["organizer"];
let scenarios: any[] = [];
for (const f of families) { const m: any = await import(`./gen-${f}.mjs`); scenarios.push(...(await m.default({ seed, R: L.rng(seed * 7919 + f.length), L })).map((s: any) => ({ ...s, family: f }))); }
const dup = scenarios.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i);
if (dup.length) { console.error("duplicate scenario names:", [...new Set(dup)].slice(0, 10)); process.exit(2); }
if (only) { const re = new RegExp(only, "i"); scenarios = scenarios.filter((s) => re.test(s.name) || re.test(s.family)); }
if (args.includes("--skip-time")) scenarios = scenarios.filter((s) => !s.time);
if (args.includes("--only-time")) scenarios = scenarios.filter((s) => s.time);
scenarios.sort((a, b) => Number(!!a.time) - Number(!!b.time)); // moving the simulated clock changes everything for everyone: those go last
if (listOnly) {
  const by: Record<string, number> = {}; for (const s of scenarios) { const k = String(s.name).split("|")[1] ?? "?"; by[k] = (by[k] ?? 0) + 1; }
  console.log(JSON.stringify({ seed, total: scenarios.length, timeMoving: scenarios.filter((s) => s.time).length, byStep: by }));
  if (args.includes("--names")) console.log(scenarios.map((s) => s.name).join("\n"));
  process.exit(0);
}

mkdirSync(join(ROOT, "sim"), { recursive: true });
const sim = await startSim({ port: PORT, runFile: join(ROOT, `sim/organizer-seed${seed}.sqlite`), build: false });

// record every response the harness sees: 5xx and unfriendly refusals are defects in every scenario
let CUR: any = null;
const inner = globalThis.fetch.bind(globalThis);
(globalThis as any).fetch = async (input: any, init?: any) => {
  const r = await inner(input, init);
  if (CUR) {
    try {
      const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); const m = (init?.method ?? "GET").toUpperCase();
      if (/^\/(api|ai|j)\//.test(u.pathname)) {
        CUR.calls++;
        if (r.status >= 500) CUR.fivexx.push(`${m} ${u.pathname} -> ${r.status}`);
        else if (r.status >= 400 && !/\.(csv|pdf)$/.test(u.pathname) && !u.pathname.startsWith("/j/")) {
          const txt = await r.clone().text(); let j: any = null; try { j = JSON.parse(txt); } catch { /* not json */ }
          const why = L.friendly(j); if (why) CUR.unfriendly.push(`${m} ${u.pathname} -> ${r.status}: ${why}${j ? "" : " [" + txt.slice(0, 60).replace(/\s+/g, " ") + "]"}`);
        }
      }
    } catch { /* never let bookkeeping break a scenario */ }
  }
  return r;
};

const results: any[] = []; const t0 = Date.now(); let nChecks = 0; const ever = new Set<string>(["sim@example.com"]); // every address that was ever an Organizer, Host or payer of any scenario (the clock-moving scenarios make the lifecycle tick mail older games too)
const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("scenario timeout " + ms + " ms")), ms))]);
let i = 0;
for (const sc of scenarios) {
  i++;
  const t = new L.T(sc, seed); t.calls = 0; t.fivexx = []; t.unfriendly = []; CUR = t;
  const s0 = Date.now();
  try { await A.mailbox.clear(); await withTimeout(sc.run(t), sc.timeoutMs ?? 90_000); }
  catch (e: any) { t.check("no exception", false, (e?.message ?? String(e)).slice(0, 300)); }
  // global invariants
  try {
    t.check("no server error (5xx) on any call", t.fivexx.length === 0, t.fivexx.slice(0, 3).join(" | "));
    if (!sc.allowUnfriendly) t.check("every refusal is a short plain sentence", t.unfriendly.length === 0, t.unfriendly.slice(0, 3).join(" | "));
    if (!sc.noMailCheck) {
      for (const e of t.team) ever.add(e); const mails = await A.mailbox.list(); const ok = ever;
      const bad = mails.filter((m: any) => !ok.has(m.to.toLowerCase())).map((m: any) => `${m.to}: ${m.subject}`);
      t.check("e-mail only to Organizer, Hosts and the payer", bad.length === 0, bad.slice(0, 3).join(" | ") || `${mails.length} mails`);
    }
    const dbl = await A.sql("SELECT eid, COUNT(*) c FROM payment WHERE status='paid' AND eid IS NOT NULL GROUP BY eid HAVING c>1");
    t.check("nobody paid twice for one game", dbl.length === 0, JSON.stringify(dbl).slice(0, 200));
  } catch (e: any) { t.check("global invariants ran", false, e?.message); }
  CUR = null;
  if (sc.time) { try { await clock.reset(); } catch { /* ignore */ } }
  const failed = t.checks.filter((c: any) => !c.ok); nChecks += t.checks.length;
  results.push({ name: sc.name, family: sc.family, ok: failed.length === 0, ms: Date.now() - s0, calls: t.calls, checks: t.checks.length, failed });
  if (failed.length) console.log(`FAIL [${sc.family}] ${sc.name}\n` + failed.slice(0, 5).map((c: any) => `     - ${c.name} | ${c.detail}`).join("\n"));
  else if (args.includes("--verbose")) console.log(`ok   [${sc.family}] ${sc.name}`);
  if (i % 100 === 0) console.log(`... ${i}/${scenarios.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
}
const passed = results.filter((r) => r.ok).length; const by: Record<string, { total: number; failed: number }> = {};
for (const r of results) { const k = String(r.name).split("|")[1] ?? "?"; by[k] ??= { total: 0, failed: 0 }; by[k].total++; if (!r.ok) by[k].failed++; }
const usage = await A.sql("SELECT day, writes FROM usage WHERE day NOT LIKE '%~%' ORDER BY writes DESC LIMIT 1");
const health = await (await inner(`http://localhost:${PORT}/__sim/health`)).json() as any;
const summary = { seed, total: results.length, passed, failed: results.length - passed, checks: nChecks, byStep: by, seconds: Math.round((Date.now() - t0) / 1000), peakWrites: usage[0] ?? null, blockedFetches: health.blockedFetches };
writeFileSync(join(ROOT, `sim/organizer-result-seed${seed}.json`), JSON.stringify({ summary, results }, null, 1));
// findings: the failed checks grouped by their label (digits in the label are folded so "limit 12" and "limit 15" fall together), with how many scenarios and the first examples
const groups = new Map<string, { check: string; scenarios: number; examples: { scenario: string; detail: string }[] }>();
for (const r of results) for (const c of r.failed) { const key = String(c.name).replace(/\d+/g, "#"); const g: { check: string; scenarios: number; examples: { scenario: string; detail: string }[] } = groups.get(key) ?? { check: c.name, scenarios: 0, examples: [] }; g.scenarios++; if (g.examples.length < 4) g.examples.push({ scenario: r.name, detail: c.detail }); groups.set(key, g); }
writeFileSync(join(ROOT, `sim/organizer-findings-seed${seed}.json`), JSON.stringify([...groups.values()].sort((a, b) => b.scenarios - a.scenarios), null, 1));
console.log(`ORGANIZER seed=${seed} scenarios=${results.length} passed=${passed} failed=${results.length - passed} checks=${nChecks} seconds=${summary.seconds} peakWrites=${usage[0]?.writes ?? 0} blockedFetches=${health.blockedFetches.length} failureGroups=${groups.size}`);
console.log(JSON.stringify(by));
sim.stop(); process.exit(0);
