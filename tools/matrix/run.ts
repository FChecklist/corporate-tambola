// rc/tambola-1.8.5 matrix runner.   bun tools/matrix/run.ts            full: 6,422,528 scenarios
//                                    bun tools/matrix/run.ts --small     small mode: 10,000 scenarios spread evenly over the whole space
//   --root <dir>     run against another copy of the repo (the deliberate-break scripts use this)
//   --worker <n>     also run n scenarios against the REAL Worker with an in-memory database (default 200 full, 24 small)
// Prints: scenario count, distinct count, failures. Exit code 1 when anything failed, or fewer than 1,000,000 scenarios ran in full mode.
import { join, resolve } from "node:path";
import { scenarios, scenarioAt, TOTAL, RADIX, type Scenario } from "./scenarios";
import { oracleId, oracleEmail } from "./oracle";
import { dedupeCheck, EMP_FORMATS, EMAIL_FORMATS, EMP_BASES, EMAIL_BASES } from "./spellings";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const small = process.argv.includes("--small"), ROOT = resolve(arg("--root") ?? join(import.meta.dir, "../.."));
const SMALL_N = 10_000;
const WORKER_N = Number(arg("--worker") ?? (small ? 24 : 200));
const NEW_T = Date.UTC(2026, 10, 5, 10, 0, 0);

const E = await import(join(ROOT, "apps/edge/src/empid.ts"));
const A = await import(join(ROOT, "apps/edge/src/approvals.ts"));
type Impl = { id: (raw: unknown, kind: "emp" | "email", era: "new" | "old") => string | null; email: (raw: unknown) => string };
const product: Impl = { id: (raw, kind, era) => E.normIdFor(raw, kind, { created_ms: era === "new" ? NEW_T : E.EMP_CLEAN_FROM_MS - 86_400_000 }), email: (raw) => E.normEmail(raw) };
const spec: Impl = { id: oracleId, email: oracleEmail };

/** What the door does for one scenario, using ONE implementation of the cleaners. The same code runs with the product and with the oracle; they must agree. */
function door(s: Scenario, m: Impl): string {
  const L = m.id(s.listText, s.kind, s.era), R = m.id(s.typedText, s.kind, s.era), out: string[] = [];
  out.push("L=" + JSON.stringify(L), "R=" + JSON.stringify(R));
  const same = L !== null && L !== "" && R !== null && R !== "" && L === R;
  if (L === null || L === "") out.push("list-row-refused"); // an unusable row goes to invalid, never to the list
  if (R === null) out.push("bad-id"); else if (R === "") out.push("need-id");
  else if (s.join === "list") out.push(same ? "in" : "wait"); else out.push(same ? "id-used" : "in");
  const pair = s.order === "list-first" ? [[s.listText, L], [s.typedText, R]] : [[s.typedText, R], [s.listText, L]]; // the upload keeps the first row and flags a later row that only repeats it after cleaning
  const seen = new Map<string, string>(); const rows: string[] = [];
  for (const [raw, c] of pair as [string, string | null][]) { if (c === null || c === "") { rows.push("invalid"); continue; } const prev = seen.get(c); if (prev === undefined) { seen.set(c, String(raw).trim()); rows.push("added"); } else rows.push(prev === String(raw).trim() ? "duplicate" : "same-after-cleaning"); }
  out.push(rows.join(","));
  if (s.kind === "email" && s.role !== "participant") out.push("signin=" + (m.email(s.listText) === m.email(s.typedText))); // a Host / Co-host / organizer address is compared in the same form
  if (s.kind === "email" && s.family) out.push("family-email-shared=" + (m.email(s.listText) === m.email(s.typedText) && m.email(s.listText) !== ""));
  return out.join(" ");
}
/** The rule by construction (not by the oracle): what must be true given how the texts were made. */
function byConstruction(s: Scenario, got: string): string | null {
  const oldEmp = s.kind === "emp" && s.era === "old"; if (oldEmp) return null; // the old rule keeps dashes: spellings are genuinely different IDs there
  const tooLong = s.kind === "emp" && s.base === 15;
  if (s.rel === "same" && !tooLong) return s.join === "list" ? (/ in /.test(" " + got + " ") ? null : "same person was not recognised") : got.includes("id-used") ? null : "same person was not recognised";
  if (s.rel === "other") return got.includes("id-used") || (s.join === "list" && / in /.test(" " + got + " ")) ? "another person was treated as the listed person" : null;
  if (s.rel === "wrong-kind" && !got.includes("bad-id")) return "a value of the other kind was accepted";
  if (s.rel === "junk" && !(got.includes("bad-id") || got.includes("need-id"))) return "junk was accepted";
  return null;
}

// ---------- 1. the inputs are distinct ----------
dedupeCheck();
{ // every (base x spelling) string is different from every other, per kind: 16 x 28 = 448 listed inputs, so "distinct scenario" really means distinct text
  for (const [bases, fmts] of [[EMP_BASES, EMP_FORMATS], [EMAIL_BASES, EMAIL_FORMATS]] as const) { const seen = new Set<string>(); for (const b of bases) for (const [, f] of fmts) seen.add(f(b)); if (seen.size !== bases.length * fmts.length) throw new Error(`spellings are not all distinct: ${seen.size} of ${bases.length * fmts.length}`); }
}

// ---------- 2. stream ----------
const t0 = Date.now(); let count = 0, failures = 0, prev = -1, distinct = 0; const first: string[] = []; const byRule: Record<string, number> = {};
const fail = (rule: string, s: Scenario, msg: string) => { failures++; byRule[rule] = (byRule[rule] ?? 0) + 1; if (first.length < 8) first.push(`[${rule}] #${s.n} ${s.kind}/${s.era}/${s.role}/${s.join}/fam=${s.family}/${s.order}/${s.rel} list=${JSON.stringify(s.listText)} typed=${JSON.stringify(s.typedText)} :: ${msg}`); };
for (const s of scenarios(small ? SMALL_N : 0)) {
  count++; if (s.n > prev) distinct++; prev = s.n; // the stream is strictly increasing in the mixed-radix index, so each scenario is a different point; the texts were proven different above
  const a = door(s, product), b = door(s, spec);
  if (a !== b) fail("product-vs-oracle", s, `product: ${a} | oracle: ${b}`);
  const c = byConstruction(s, b); if (c) fail("by-construction", s, c + " | " + b);
  if (s.kind === "email" && s.rel === "same" && E.looksLikeEmail && !(E.normEmail(s.listText) === E.normEmail(s.typedText))) fail("email-case-space", s, "two spellings of one address differ");
  if (s.kind === "email" && s.rel === "same") { const cl = A.cleanEmail(s.listText), ct = A.cleanEmail(s.typedText); if (cl !== ct) fail("cleanEmail", s, `${cl} vs ${ct}`); }
  if (s.kind === "email" && s.rel === "wrong-kind" && E.normIdFor(s.typedText, "email", { created_ms: NEW_T }) !== null) fail("emp-id-in-email-game", s, "an employee ID was accepted as an Email ID");
  if (s.kind === "emp" && s.rel === "wrong-kind" && s.era === "new" && /@|＠/.test(s.typedText.normalize("NFKC")) && E.normEmpFor(s.typedText, { created_ms: NEW_T }) !== null) fail("email-in-emp-game", s, "an email was turned into an employee ID");
  if (count % 500_000 === 0) console.log(`  ... ${count.toLocaleString("en-US")} scenarios, ${failures} failures, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ---------- 3. a sample against the REAL Worker ----------
let workerRan = 0;
if (WORKER_N > 0) {
  const { World } = await import(join(ROOT, "apps/edge/test/rc185/helpers.ts"));
  const step = Math.max(1, Math.floor(TOTAL / WORKER_N));
  for (let n = 0, k = 0; k < WORKER_N; k++, n += step) {
    const s = scenarioAt(n + (k * 7919) % step); // spread over every dimension, never the same corner
    const w = new World(); const at = s.era === "new" ? NEW_T : E.EMP_CLEAN_FROM_MS - 5000;
    try {
      const m = await w.game(at, "EMP-1", s.kind === "email" ? { idKind: "email" } : {}, false);
      const L = oracleId(s.listText, s.kind, s.era), Ro = oracleId(s.typedText, s.kind, s.era);
      let listed = false;
      if (L !== null && L !== "") { const r = await w.add(at, m, [{ name: "A", empId: s.listText }]); const b = await r.json() as any; listed = r.status === 200 && b.added === 1; if (!listed) fail("worker-list-add", s, JSON.stringify(b).slice(0, 200)); }
      const j = await w.join(at, s.typedText, 1); const code = j.status;
      const want = Ro === null ? 400 : Ro === "" ? 400 : listed && L === Ro ? 200 : 403;
      if (code !== want) fail("worker-join", s, `status ${code}, wanted ${want} (listed=${listed}, L=${L}, R=${Ro})`);
      workerRan++;
    } catch (e: any) { fail("worker-error", s, String(e?.message ?? e).slice(0, 200)); } finally { w.restore(); }
  }
}

const secs = (Date.now() - t0) / 1000;
console.log(`MATRIX ${small ? "SMALL" : "FULL"} (${ROOT === resolve(join(import.meta.dir, "../..")) ? "this repo" : ROOT})`);
console.log(`  dimensions: ${RADIX.join(" x ")} = ${TOTAL.toLocaleString("en-US")} scenarios in the whole space`);
console.log(`  scenarios run:   ${count.toLocaleString("en-US")}`);
console.log(`  distinct:        ${distinct.toLocaleString("en-US")}${distinct === count ? " (every one different)" : "  <-- DUPLICATES"}`);
console.log(`  real-Worker checks: ${workerRan}`);
console.log(`  failures:        ${failures}${failures ? " " + JSON.stringify(byRule) : ""}`);
for (const f of first) console.log("    " + f);
console.log(`  time: ${secs.toFixed(1)}s`);
const enough = small ? count === SMALL_N : count >= 1_000_000;
if (!enough) console.log("  NOT ENOUGH SCENARIOS");
process.exit(failures || distinct !== count || !enough ? 1 : 0);
