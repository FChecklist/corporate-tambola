// The campaign runner for layers B (local) and C (the real site).
//   node tools/livetest/campaign/run.mjs --base http://localhost:8821 --cases UC-G1-01,UC-G2-07,UC-G2-08 [--run r1] [--layer B]
// The real site is refused unless CAMPAIGN_REAL=yes is set (the boss gives that go; in S0 no game is created on the real site) and then every request is metered (25,000 a day).
import { writeFileSync, readFileSync } from "node:fs";
import { ROOT, DATA, makeApi, isReal } from "./lib.mjs";
import { RequestMeter, MeterStop, DAILY_LIMIT } from "./meter.mjs";
import { launch, runCase } from "./driver.mjs";
import { readClock, speed } from "./core.mjs";

const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const BASE = (opt("base", "http://localhost:8821")).replace(/\/$/, ""), RUN = opt("run", "r" + Date.now().toString(36).slice(-5)), LAYER = opt("layer", isReal(BASE) ? "C" : "B");
const cat = JSON.parse(readFileSync(`${ROOT}/tools/livetest/usecases-100.json`, "utf8")).cases;
const want = opt("cases", "").split(",").filter(Boolean);
const cases = (want.length ? cat.filter((c) => want.includes(c.id)) : cat).filter((c) => c.layers.includes(LAYER));
if (isReal(BASE) && process.env.CAMPAIGN_REAL !== "yes") { console.error(`REFUSED: ${BASE} is the real site. Layer C needs the boss's go: set CAMPAIGN_REAL=yes.`); process.exit(2); }
if (!cases.length) { console.error("no case selected for layer " + LAYER); process.exit(2); }
const clock = isReal(BASE) ? null : await readClock(BASE); if (clock) console.log(`compressed clock x${clock.speed} with the stand-in beacon`);
const meter = new RequestMeter(BASE, isReal(BASE) ? {} : { limit: Infinity });
console.log(`run ${RUN}: ${cases.length} case(s) on ${BASE} (layer ${LAYER}); meter today ${meter.total}/${DAILY_LIMIT}`);
const api = makeApi(BASE, meter), browser = await launch(), results = [];
try {
  for (const c of cases) {
    if (meter.stopped) { results.push({ id: c.id, title: c.title, status: "stopped-by-meter" }); continue; }
    const r = await runCase(c, { api, browser, base: BASE, meter, runId: RUN, numbers: Number(opt("numbers", 5)) });
    results.push(r); console.log(`${r.status.toUpperCase().padEnd(16)} ${c.id} ${c.title} (${Math.round((r.ms || 0) / 1000)} s)` + (r.checks ? "" : " " + (r.note || r.error || "")));
    for (const x of r.checks || []) console.log(`   ${x.ok ? "ok  " : "FAIL"} ${x.n}${x.ok ? "" : " | " + x.d}`);
    if (r.status === "stopped-by-meter") break;
  }
} catch (e) { if (!(e instanceof MeterStop)) throw e; console.error(String(e.message)); }
finally { await browser.close(); meter.save(); }
const out = { run: RUN, base: BASE, layer: LAYER, requests: meter.session, requestsToday: meter.total, results };
writeFileSync(`${DATA}/results-${RUN}.json`, JSON.stringify(out, null, 1));
const n = (s) => results.filter((r) => r.status === s).length;
console.log(`done: pass ${n("pass")}, fail ${n("fail")}, error ${n("error")}, not-implemented ${n("not-implemented")}, stopped ${n("stopped-by-meter")}; requests this run ${meter.session} (today ${meter.total} of ${DAILY_LIMIT}); results ${DATA}/results-${RUN}.json`);
process.exit(n("fail") + n("error") ? 1 : 0);
