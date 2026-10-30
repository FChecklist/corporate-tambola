// Cancels and erases the tagged test games of the campaign (game id TR-<run>-<case>, from the registry kept outside the repository).
//   node tools/livetest/campaign/cleanup.mjs --base http://localhost:8821 [--run r1] [--dry]
// For each registered game: cancel (three confirmations, the engine's own rule), then erase every participant's data. A game that is running is cancelled first (which ends it), a refusal is reported, never hidden.
// It only ever touches ids that match the tag pattern AND are in the registry. The real site needs CAMPAIGN_REAL=yes; its requests are metered too.
import { makeApi, isReal } from "./lib.mjs";
import { RequestMeter } from "./meter.mjs";
import { registry, isTagged } from "./tags.mjs";

const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const BASE = opt("base", "http://localhost:8821").replace(/\/$/, ""), RUN = opt("run", ""), DRY = args.includes("--dry");
if (isReal(BASE) && process.env.CAMPAIGN_REAL !== "yes") { console.error(`REFUSED: ${BASE} is the real site. Set CAMPAIGN_REAL=yes (the boss's go).`); process.exit(2); }
const api = makeApi(BASE, new RequestMeter(BASE));
const seen = new Set(); const recs = registry().filter((r) => isTagged(r.id) && (!RUN || r.run === RUN) && !seen.has(r.id) && seen.add(r.id));
console.log(`${recs.length} tagged game(s) to clean on ${BASE}${DRY ? " (dry run: nothing is sent)" : ""}`);
let bad = 0;
for (const r of recs) {
  if (DRY) { console.log("would clean", r.id); continue; }
  const info = await api("GET", `/api/z/${r.id}/info`);
  if (info.status === 404) { console.log("gone    ", r.id); continue; }
  const c = await api("POST", `/api/z/${r.id}/cancel`, { confirmations: 3 }, r.key);
  const e = await api("POST", `/api/z/${r.id}/erase`, {}, r.key);
  const ok = (c.ok || c.status === 409) && (e.ok || e.status === 409);
  if (!ok) bad++;
  console.log(`${ok ? "cleaned " : "PROBLEM "} ${r.id}  cancel ${c.status}${c.body && c.body.code ? " " + c.body.code : ""}  erase ${e.status}${e.body && e.body.code ? " " + e.body.code : ""}`);
}
process.exit(bad ? 1 : 0);
