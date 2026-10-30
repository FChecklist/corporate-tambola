// Runs ONE group of the 100 use cases on ONE layer and writes the evidence, so a cloud session can run a group and push the results.
//   node tools/livetest/campaign/run-group.mjs G2 B --base http://localhost:8821 [--run r1] [--out <dir>] [--numbers 5]
// Writes <out>/results-<group>-<layer>.json (case id, pass/fail, evidence = every check with its detail, duration) and <out>/results-<group>-<layer>.md (the summary table).
// <out> defaults to C:\ct\test-sites\data\campaign; in a cloud session pass --out results/ and commit that folder to a results branch.
// The real site (layer C) is refused unless CAMPAIGN_REAL=yes; every request is metered (25,000 a day). Tagged games of the run are cleaned afterwards with cleanup.mjs.
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { ROOT, DATA, makeApi, isReal } from "./lib.mjs";
import { RequestMeter, MeterStop, DAILY_LIMIT } from "./meter.mjs";
import { launch, runCase } from "./driver.mjs";
import { readClock, speed } from "./core.mjs";

const args = process.argv.slice(2); const GROUP = args[0], LAYER = args[1];
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
if (!/^G[1-8]$/.test(GROUP || "") || !/^[ABC]$/.test(LAYER || "")) { console.error("usage: run-group.mjs <G1..G8> <A|B|C> --base <url> [--run id] [--out dir]"); process.exit(2); }
const BASE = opt("base", "http://localhost:8821").replace(/\/$/, ""), RUN = opt("run", "r" + Date.now().toString(36).slice(-5)), OUT = opt("out", DATA);
if (LAYER === "C" && !isReal(BASE)) { console.error("layer C is the real site: --base must be the real address"); process.exit(2); }
if (LAYER !== "C" && isReal(BASE)) { console.error(`layer ${LAYER} runs on a LOCAL server; ${BASE} is the real site`); process.exit(2); }
if (isReal(BASE) && process.env.CAMPAIGN_REAL !== "yes") { console.error(`REFUSED: ${BASE} is the real site. Layer C needs the boss's go: set CAMPAIGN_REAL=yes.`); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const cases = JSON.parse(readFileSync(`${ROOT}/tools/livetest/usecases-100.json`, "utf8")).cases.filter((c) => c.group === GROUP && c.layers.includes(LAYER));
const clock = isReal(BASE) ? null : await readClock(BASE); if (clock) console.log(`compressed clock x${clock.speed} with the stand-in beacon`);
const meter = new RequestMeter(BASE), api = makeApi(BASE, meter), browser = await launch(), results = []; const t0 = Date.now();
console.log(`${GROUP} layer ${LAYER} run ${RUN}: ${cases.length} cases on ${BASE}; meter ${meter.total}/${DAILY_LIMIT}`);
try {
  for (const c of cases) {
    if (meter.stopped) { results.push({ id: c.id, title: c.title, status: "stopped-by-meter" }); continue; }
    const r = await runCase(c, { api, browser, base: BASE, meter, runId: RUN, numbers: Number(opt("numbers", 5)) }); results.push(r);
    console.log(`${r.status.toUpperCase().padEnd(16)} ${c.id} ${c.title} (${Math.round((r.ms || 0) / 1000)} s)`);
    for (const x of (r.checks || []).filter((x) => !x.ok)) console.log(`   FAIL ${x.n} | ${x.d}`);
    if (r.error) console.log("   ERROR " + r.error);
  }
} catch (e) { if (!(e instanceof MeterStop)) throw e; console.error(String(e.message)); }
finally { await browser.close(); meter.save(); }
const n = (s) => results.filter((r) => r.status === s).length;
const out = { group: GROUP, layer: LAYER, run: RUN, base: BASE, at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), requests: meter.session, summary: { cases: results.length, pass: n("pass"), fail: n("fail"), error: n("error"), notImplemented: n("not-implemented"), stopped: n("stopped-by-meter") }, results: results.map((r) => ({ id: r.id, title: r.title, status: r.status, seconds: Math.round((r.ms || 0) / 1000), game: r.game, note: r.note, error: r.error, evidence: (r.checks || []).map((x) => ({ check: x.n, ok: x.ok, detail: x.ok ? undefined : x.d })) })) };
writeFileSync(`${OUT}/results-${GROUP}-${LAYER}.json`, JSON.stringify(out, null, 1));
let md = `# ${GROUP} on layer ${LAYER} (run ${RUN})\n\n${out.at}, ${out.seconds} s, ${out.requests} requests to ${new URL(BASE).host}.\n\npass ${n("pass")}, fail ${n("fail")}, error ${n("error")}, not implemented ${n("not-implemented")}, stopped by the meter ${n("stopped-by-meter")}.\n\n| Case | Title | Result | Checks | Seconds |\n|---|---|---|---|---|\n`;
for (const r of out.results) md += `| ${r.id} | ${r.title} | ${r.status} | ${r.evidence.filter((e) => e.ok).length}/${r.evidence.length}${r.note ? " " + r.note : ""}${r.error ? " " + r.error : ""} | ${r.seconds} |\n`;
const failed = out.results.filter((r) => r.evidence.some((e) => !e.ok));
if (failed.length) { md += "\n## Failed checks\n"; for (const r of failed) for (const e of r.evidence.filter((e) => !e.ok)) md += `- ${r.id}: ${e.check} | ${e.detail || ""}\n`; }
writeFileSync(`${OUT}/results-${GROUP}-${LAYER}.md`, md);
console.log(`done: pass ${n("pass")}, fail ${n("fail")}, error ${n("error")}, not-implemented ${n("not-implemented")}; ${OUT}/results-${GROUP}-${LAYER}.json`);
process.exit(n("fail") + n("error") ? 1 : 0);
