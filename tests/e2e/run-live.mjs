// Runs the Playwright suite against the REAL site, safely:
//   1. takes the shared RAM lock (C:/ct/heavy.lock) and waits for > 1.2 GB free
//   2. switches the site to TEST mode (POST /api/owner/mode, platform key) - only for the duration of this run
//   3. runs the specs (Chrome, at most 2 workers)
//   4. ALWAYS (finally): purges every test record, switches back to LIVE, checks GET /api/mode says LIVE and that test payments are refused, releases the lock
// Usage: node tests/e2e/run-live.mjs [--match=<regex of spec file names>] [--workers=1|2] [--restore-only]
// The platform key is read from config/live-secrets.txt (or E2E_PLATFORM_KEY) and is never printed.
import { readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url)), here = fileURLToPath(new URL("./", import.meta.url));
const BASE = process.env.E2E_BASE ?? "https://corporate-tambola.pages.dev";
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? "").slice(n.length + 3) || d;
const key = process.env.E2E_PLATFORM_KEY ?? (/^ORGANIZER_SECRET=(.+)$/m.exec(readFileSync(root + "config/live-secrets.txt", "utf8"))?.[1] ?? "").trim();
if (!key) { console.error("no platform key"); process.exit(1); }
const api = async (method, path, body) => { const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", "x-organizer": key }, body: body ? JSON.stringify(body) : undefined }); let j = {}; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const NAME = "tambola-e2e-claude";
let held = false, switched = false, code = 0;

async function restore() {
  log("restore: purging test data and switching back to LIVE");
  const p = await api("POST", "/api/owner/purge-test-data", { confirm: "purge test data" }); log("purge ->", p.status, JSON.stringify(p.body).slice(0, 200));
  const m = await api("POST", "/api/owner/mode", { mode: "LIVE", reason: "end of end-to-end run" }); log("mode LIVE ->", m.status);
  const g = await (await fetch(BASE + "/api/mode")).json(); log("GET /api/mode ->", JSON.stringify(g));
  if (g.mode !== "LIVE") { log("!!! SITE IS NOT IN LIVE MODE. Run: node tests/e2e/run-live.mjs --restore-only"); code = 9; }
  const t = await fetch(BASE + "/api/payments/test", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); log("test payment in LIVE ->", t.status, t.status === 403 ? "(refused, as it must)" : "(UNEXPECTED)");
  if (t.status !== 403) code = code || 8;
  const lg = await fetch(BASE + "/api/payments/status").then((r) => r.json()); log("payments status:", JSON.stringify({ mode: lg.mode, siteMode: lg.siteMode }));
  mkdirSync(here + "results", { recursive: true });
  appendFileSync(here + "results/live.jsonl", JSON.stringify({ id: "MODE-01", role: "owner", title: "after the run the site is back in LIVE mode and test payments are refused", steps: "run-live.mjs finally block: purge, switch to LIVE, GET /api/mode, POST /api/payments/test", expected: "mode LIVE; payments/test 403", target: "live", base: "live", result: g.mode === "LIVE" && t.status === 403 ? "pass" : "fail", evidence: `mode ${g.mode}; test payment ${t.status}; purge ${p.status}`, ms: 0, at: new Date().toISOString() }) + "\n");
  appendFileSync(here + "results/live.jsonl", JSON.stringify({ id: "MODE-02", role: "owner", title: "purge-test-data deletes the test records created by the run", steps: "POST /api/owner/purge-test-data {confirm}", expected: "200 and a deleted count", target: "live", base: "live", result: p.status === 200 ? "pass" : "fail", evidence: JSON.stringify(p.body).slice(0, 300), ms: 0, at: new Date().toISOString() }) + "\n");
}
try {
  if (process.argv.includes("--restore-only")) { await restore(); process.exit(code); }
  const before = await (await fetch(BASE + "/api/mode")).json(); log("site mode before:", before.mode);
  const l = spawnSync(process.execPath, [here + "lock.mjs", "acquire", NAME], { stdio: "inherit" }); if (l.status !== 0) { console.error("could not take the RAM lock"); process.exit(2); } held = true;
  const s = await api("POST", "/api/owner/mode", { mode: "TEST", reason: "end-to-end test run (restored in a finally block)" }); if (s.status !== 200) { console.error("could not switch to TEST", s.status); process.exit(3); } switched = true;
  const now = await (await fetch(BASE + "/api/mode")).json(); log("site mode now:", now.mode);
  const args = [root + "node_modules/@playwright/test/cli.js", "test", "-c", here + "playwright.config.ts", `--workers=${arg("workers", "2")}`];
  const env = { ...process.env, E2E_TARGET: "live", E2E_BASE: BASE, E2E_PLATFORM_KEY: key, ...(arg("match", "") ? { E2E_MATCH: arg("match", "") } : {}) };
  const r = spawnSync(process.execPath, args, { cwd: here, env, stdio: "inherit" }); code = r.status ?? 1;
} catch (e) { console.error("run failed:", e?.message ?? e); code = code || 1; }
finally {
  if (switched) { try { await restore(); } catch (e) { console.error("RESTORE FAILED - run with --restore-only:", e?.message ?? e); code = 9; } }
  if (held) spawnSync(process.execPath, [here + "lock.mjs", "release", NAME], { stdio: "inherit" });
}
process.exit(code);
