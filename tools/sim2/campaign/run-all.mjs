// Runs the 20 games (or a subset) with a chosen crowd size, a few at a time, and prints one table + writes sim/campaign/summary-<seed>.json
//   bun tools/sim2/campaign/run-all.mjs [--games G01,G02 | --from 1 --to 20] [--phones 1000] [--full 220] [--seed 1] [--parallel 1]
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GAMES } from "./matrix.mjs";

const ROOT = join(import.meta.dir, "../../..");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : process.argv[i + 1]; };
const phones = arg("phones", "1000"), full = arg("full", "220"), seed = arg("seed", "1"), par = Number(arg("parallel", "1"));
const list = arg("games") ? arg("games").split(",") : GAMES.filter((g) => g.no >= Number(arg("from", "1")) && g.no <= Number(arg("to", "20"))).map((g) => g.id);
mkdirSync(join(ROOT, "sim/campaign"), { recursive: true });
const freeMB = () => { try { const r = Bun.spawnSync(["powershell", "-NoProfile", "-Command", "(Get-Counter '\\Memory\\Available MBytes').CounterSamples.CookedValue"]); return Math.round(Number(r.stdout.toString().trim())); } catch { return -1; } };
const runOne = (id) => new Promise((resolve) => {
  const t0 = Date.now(); const log = join(ROOT, `sim/campaign/${id}-${seed}.log`);
  const p = spawn(process.execPath, [join(ROOT, "tools/sim2/campaign/game.mjs"), id, "--phones", phones, "--full", full, "--seed", seed], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  p.on("close", (code) => { writeFileSync(log, out); const f = join(ROOT, `sim/campaign/${id}-${seed}.json`); let j = null; try { j = JSON.parse(readFileSync(f, "utf8")); } catch { /* no result file */ } resolve({ id, code, seconds: Math.round((Date.now() - t0) / 1000), summary: j?.summary ?? null, failed: j?.failed ?? [{ name: "no result (crashed?)", detail: out.slice(-600) }] }); });
});
const done = []; const queue = [...list];
console.log(`campaign seed ${seed}: ${list.length} games, ${phones} people each (${full} run the full phone program), ${par} at a time. Free memory ${freeMB()} MB`);
const worker = async () => { while (queue.length) { const id = queue.shift(); const g = GAMES.find((x) => x.id === id); console.log(`  start ${id} (tickets ${g.tickets}, ${g.p}, ${g.c}, ${g.b}, ${g.h}, ${g.r}r, ${g.j}) free ${freeMB()} MB`); const r = await runOne(id); done.push(r); console.log(`  done  ${id}: ${r.summary ? `${r.summary.checks} checks, ${r.summary.failed} failed` : "NO RESULT"} in ${r.seconds}s`); } };
await Promise.all(Array.from({ length: par }, worker));
done.sort((a, b) => a.id.localeCompare(b.id));
const failedGames = done.filter((d) => !d.summary || d.summary.failed > 0);
console.log("\n=== SUMMARY ===");
for (const d of done) console.log(`${d.id}  ${d.summary ? String(d.summary.checks).padStart(4) + " checks " + String(d.summary.failed).padStart(3) + " failed" : "     NO RESULT"}  ${d.seconds}s`);
for (const d of failedGames) for (const f of d.failed) console.log(`FAIL ${d.id}: ${f.name}${f.detail ? " -> " + f.detail.slice(0, 220) : ""}`);
writeFileSync(join(ROOT, `sim/campaign/summary-${seed}.json`), JSON.stringify({ seed, phones, full, games: done.map((d) => ({ id: d.id, seconds: d.seconds, ...d.summary, failed: d.failed })) }, null, 1));
console.log(`\n${done.length - failedGames.length}/${done.length} games clean`);
process.exit(failedGames.length ? 1 : 0);
