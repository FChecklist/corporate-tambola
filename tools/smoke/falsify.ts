// SMOKE 20 NOV: "a test that cannot fail proves nothing". For each fix of the smoke test, this script BREAKS the product line (one exact text replacement), runs the named tests, and requires them to FAIL;
// then it puts the file back byte for byte. Exit code 0 only when every break was caught and every file is restored.   Run:  bun run tools/smoke/falsify.ts   (about 5 minutes; changes nothing permanently)
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
interface Break { id: string; file: string; from: string; to: string; tests: string[]; pattern?: string }
const BREAKS: Break[] = [
  { id: "F-01 server accepts a press whose clock is far off", file: "apps/edge/src/worker.ts", from: "if (signed && !dup && (sg > nowR + CONTROL_SKEW_ROUNDS ||", to: "if (false && (sg > nowR + CONTROL_SKEW_ROUNDS ||", tests: ["apps/edge/test/smoke/s15-start.test.ts"], pattern: "console clock" },
  { id: "F-02 a pause over before number 1 moves number 1 (auto start)", file: "packages/beacon/src/control.ts", from: "const go = s.manualStart ? s.goRound : firstCallRound ?? null;", to: "const go = s.manualStart ? s.goRound : null;", tests: ["apps/edge/test/smoke/s16b-pause.test.ts"], pattern: "pause before the start" },
  { id: "F-03 ordinal names above 20 (console, phone page, big screen, certificate)", file: "apps/web/public/console.js", from: 'const ord = (n) => { const m = Math.floor(n); if (!(m >= 1)) return ""; const t = m % 100, r = m % 10; return m + (t >= 11 && t <= 13 ? "th" : r === 1 ? "st" : r === 2 ? "nd" : r === 3 ? "rd" : "th"); };', to: 'const ord = (n) => ["", "1st", "2nd", "3rd"][n] || n + "th";', tests: ["apps/edge/test/smoke/s16e-ordinals.test.ts"] },
  { id: "F-04a no 'game created' mail", file: "apps/edge/src/worker.ts", from: "if (a.org) { try { await mailCreated(", to: "if (false) { try { await mailCreated(", tests: ["apps/edge/test/smoke/s18-mails.test.ts"], pattern: "S18-1" },
  { id: "F-04b no 'game started' mail", file: "apps/edge/src/lifecycle.ts", from: "try { (out as any).startedMails = await startedPass(env, now); }", to: "try { (out as any).startedMails = 0; }", tests: ["apps/edge/test/smoke/s18-mails.test.ts"], pattern: "S18-4" },
  { id: "F-04c no 'game completed' mail", file: "apps/edge/src/lifecycle.ts", from: "try { await maybeMailCompleted(env, e, life.end_ms, delEnd, now); }", to: "try { /* broken on purpose */ }", tests: ["apps/edge/test/smoke/s18-mails.test.ts", "apps/edge/test/smoke/s17-complete.test.ts"], pattern: "S1" },
  { id: "F-04d a step mail sent twice when two runs overlap (the once-only claim is ignored)", file: "apps/edge/src/steps-mail.ts", from: "if ((claim.meta?.changes ?? 0) < 1) return false;", to: "", tests: ["apps/edge/test/smoke/s18-mails.test.ts"], pattern: "S18-10" },
  { id: "F-05 organizer is not told when the report could not be sent", file: "apps/edge/src/lifecycle.ts", from: "if (missed) { try { await maybeMailReportMissed(", to: "if (false) { try { await maybeMailReportMissed(", tests: ["apps/edge/test/smoke/s18b-mail-resilience.test.ts"], pattern: "S18-R4" },
  { id: "F-06 a Host is given the report address", file: "apps/edge/src/worker.ts", from: 'if (!a.plat && a.kind !== "master") return json({ ready, sent', to: 'if (false) return json({ ready, sent', tests: ["apps/edge/test/smoke/s19-export.test.ts"], pattern: "S19-2" },
  { id: "F-07 winners' IDs are cleaned after the erasure is marked done (no retry)", file: "apps/edge/src/lifecycle.ts", from: "  await stripIdsFromPrizes(env, eid); // SMOKE-20NOV F-07", to: "  /* broken */ void stripIdsFromPrizes; // SMOKE-20NOV F-07", tests: ["apps/edge/test/smoke/s20-delete.test.ts", "apps/edge/test/lifecycle/erasure.test.ts"], pattern: "prize hand-over" },
  { id: "F-08 no 'deleted' mail after the organizer's own Delete", file: "apps/edge/src/worker.ts", from: "if ((n?.c ?? 0) > 0) await mailDataDeleted(env as PayEnv, e, now);", to: "", tests: ["apps/edge/test/smoke/s20-delete.test.ts"], pattern: "S20-G" },
  { id: "E-1 engine: Early Five counted at the 6th number", file: "packages/beacon/src/house-rules.ts", from: 'case "early5": return any(all, 5);', to: 'case "early5": return any(all, 6);', tests: ["apps/edge/test/smoke/s16-engine.test.ts"], pattern: "early5" },
  { id: "E-2 engine: Frame forgets the last number of the middle line", file: "packages/beacon/src/house-rules.ts", from: 'case "frame": return set([...a, ...c, b[0]!, b[4]!]);', to: 'case "frame": return set([...a, ...c, b[0]!]);', tests: ["apps/edge/test/smoke/s16-engine.test.ts"], pattern: "frame" },
  { id: "D-1 deletion clock 30 h instead of 20 h", file: "apps/edge/src/lifecycle.ts", from: "export const PURGE_AFTER_MS = 20 * 3_600_000;", to: "export const PURGE_AFTER_MS = 30 * 3_600_000;", tests: ["apps/edge/test/smoke/s20-delete.test.ts"], pattern: "wakes every 60 min" },
  { id: "D-2 deletion job does not clear the waiting room", file: "apps/edge/src/lifecycle.ts", from: 'env.DB.prepare("DELETE FROM waiting WHERE eid=?").bind(eid), env.DB.prepare("DELETE FROM overvote WHERE eid=?")', to: 'env.DB.prepare("DELETE FROM overvote WHERE eid=?")', tests: ["apps/edge/test/smoke/s20-delete.test.ts"], pattern: "nothing personal" },
];
let bad = 0;
const only = process.argv[2]; // optional: run only the breaks whose id starts with this text, e.g.  bun run tools/smoke/falsify.ts F-01
for (const b of BREAKS) {
  if (only && !b.id.startsWith(only)) continue;
  const src = readFileSync(b.file, "utf8");
  if (!src.includes(b.from)) { console.log(`?? ${b.id}: the text to break is not in ${b.file}`); bad++; continue; }
  writeFileSync(b.file, src.replace(b.from, b.to));
  let caught = true;
  try { for (const t of b.tests) { const r = spawnSync("bun", ["test", t, ...(b.pattern ? ["-t", b.pattern] : [])], { encoding: "utf8" }); if (r.status === 0) { caught = false; console.log(`   not caught by ${t}`); } } }
  finally { writeFileSync(b.file, src); }
  console.log(`${caught ? "OK  " : "FAIL"} ${b.id}: ${caught ? "broken -> tests went red -> restored" : "BROKEN CODE STILL PASSED"}`); if (!caught) bad++;
}
console.log(bad ? `${bad} problem(s)` : "all breaks caught, all files restored"); process.exit(bad ? 1 : 0);
