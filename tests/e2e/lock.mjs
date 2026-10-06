// The shared RAM lock (C:/ct/heavy.lock): take it before any heavy step, release only a lock you hold.
//   node lock.mjs acquire <name>   (waits up to 20 minutes; also requires > 1.2 GB free RAM)
//   node lock.mjs release <name>
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { freemem } from "node:os";
const LOCK = "C:/ct/heavy.lock", me = process.argv[3] ?? "tambola-e2e";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (process.argv[2] === "acquire") {
  const until = Date.now() + 20 * 60_000;
  for (;;) {
    try { mkdirSync(LOCK); writeFileSync(LOCK + "/owner.txt", me + " " + new Date().toISOString()); break; }
    catch { if (Date.now() > until) { console.error("lock busy: " + (existsSync(LOCK + "/owner.txt") ? readFileSync(LOCK + "/owner.txt", "utf8") : "?")); process.exit(2); } await sleep(10_000); }
  }
  for (let i = 0; i < 60 && freemem() < 1.2 * 1024 ** 3; i++) await sleep(5000);
  console.log("lock held by " + me + "; free RAM " + (freemem() / 1024 ** 3).toFixed(2) + " GB");
} else if (process.argv[2] === "release") {
  try { const o = readFileSync(LOCK + "/owner.txt", "utf8"); if (!o.startsWith(me)) { console.error("not my lock: " + o); process.exit(3); } rmSync(LOCK + "/owner.txt"); rmSync(LOCK, { recursive: false }); console.log("lock released"); } catch (e) { console.error("release: " + e.message); }
}
