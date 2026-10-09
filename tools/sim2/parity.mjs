// node tools/sim2/parity.mjs   ->  docs/SIM_PARITY_REPORT.md
// Proves (or disproves) that what the simulation runs is what is live. It FIXES NOTHING; it lists differences.
//   (a) schema: raw live export vs Worker SCHEMA vs apps/edge/migrations (tools/sim2/parity-schema.ts)
//   (b) code: pages/build.mjs output, every file SHA-256 vs the same file fetched read-only (GET, one per file, spaced out) from https://corporate-tambola.pages.dev with clean-URL mapping,
//       plus the response headers the _headers rules promise (CSP etc.)
//   (c) worker: git commit + dirty files + a hash of apps/edge/src, pages/functions, packages/*/src
// This is the ONLY place the simulation talks to the live site, and only with plain GETs of public files.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { BUN, ROOT, sleep } from "./lib/env.mjs";

const LIVE = "https://corporate-tambola.pages.dev";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });

// ---- (a) schema ----
const sr = run(BUN, [join(ROOT, "tools/sim2/parity-schema.ts")]);
if (sr.status !== 0) throw new Error("parity-schema failed: " + sr.stderr);
const schema = JSON.parse(sr.stdout);

// ---- (b) code ----
const br = run(BUN, [join(ROOT, "pages/build.mjs")]); if (br.status !== 0) throw new Error("pages/build.mjs failed: " + br.stderr);
const PUB = join(ROOT, "pages/public");
const files = walk(PUB).map((f) => relative(PUB, f).split(sep).join("/")).filter((f) => f !== "_headers" && f !== "_routes.json").sort();
const rules = []; { let cur = null; for (const line of readFileSync(join(PUB, "_headers"), "utf8").split(/\r?\n/)) { if (!line.trim()) continue; if (!/^\s/.test(line)) { cur = { raw: line.trim(), headers: [] }; rules.push(cur); } else { const i = line.indexOf(":"); cur.headers.push([line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim()]); } } }
const re = (g) => new RegExp("^" + g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
const expectHeaders = (p) => { const h = {}; for (const r of rules) if (re(r.raw).test(p)) for (const [k, v] of r.headers) h[k] = h[k] ? h[k] + ", " + v : v; return h; };
const urlOf = (f) => (f === "index.html" ? "/" : f.endsWith(".html") ? "/" + f.slice(0, -5) : "/" + f);
const CFBEACON = /<script defer src=['"]https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js[^>]*><\/script>/g; // injected by Cloudflare Web Analytics, not in our build

const rows = [];
for (const f of files) {
  const local = readFileSync(join(PUB, f)); const u = urlOf(f);
  let live = null, status = 0, hdr = {}, err = "";
  try { const r = await fetch(LIVE + u, { headers: { "user-agent": "ct-sim-parity (read-only GET)", "cache-control": "no-cache" } }); status = r.status; hdr = Object.fromEntries(r.headers.entries()); live = Buffer.from(await r.arrayBuffer()); } catch (e) { err = String(e.message ?? e); }
  const row = { file: f, url: u, status, localSha: sha(local), liveSha: live ? sha(live) : null, same: false, note: err };
  if (live && status === 200) {
    row.same = row.localSha === row.liveSha;
    if (!row.same && f.endsWith(".html")) { const stripped = Buffer.from(live.toString("utf8").replace(CFBEACON, "")); if (sha(stripped) === row.localSha) { row.same = true; row.note = "identical after removing Cloudflare's injected analytics beacon"; } }
    if (!row.same) { row.note = `local ${local.length} bytes, live ${live.length} bytes`; }
    const want = expectHeaders(u), bad = [];
    for (const k of ["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "x-robots-tag", "cache-control"]) if (want[k] && (hdr[k] ?? "").replace(/\s+/g, " ") !== want[k].replace(/\s+/g, " ")) bad.push(k);
    row.headerDiff = bad;
  }
  rows.push(row); await sleep(120);
}
for (const r of rows.filter((x) => !x.same && x.liveSha)) { // is the live file equal to the last COMMITTED version? (other agents' uncommitted edits explain most differences)
  const g = spawnSync("git", ["show", "HEAD:apps/web/public/" + r.file], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  if (g.status === 0) { const hs = sha(g.stdout); r.note += hs === r.liveSha ? "; live == last commit (HEAD), so the difference is an uncommitted working-tree change" : "; live != HEAD either (HEAD sha " + hs.slice(0, 10) + ")"; }
}
const differ = rows.filter((r) => !r.same), headerDiffs = rows.filter((r) => r.headerDiff?.length);
const fp = (list) => sha(list.map((r) => r.file + ":" + r.sha).sort().join("\n"));
const localFingerprint = fp(rows.map((r) => ({ file: r.file, sha: r.localSha })));

// ---- (c) worker / repo ----
const git = (a) => run("git", a).stdout.trim();
const head = git(["rev-parse", "HEAD"]), branch = git(["rev-parse", "--abbrev-ref", "HEAD"]), when = git(["log", "-1", "--format=%cI %s"]);
const dirty = git(["status", "--porcelain", "--", "apps", "packages", "pages", "tools/sim2"]).split("\n").filter(Boolean);
const hashDir = (rel) => { const d = join(ROOT, rel); return existsSync(d) ? sha(walk(d).filter((f) => !/node_modules|[\\/]public[\\/]/.test(f)).sort().map((f) => relative(d, f) + ":" + sha(readFileSync(f))).join("\n")) : "(missing)"; };
const hashes = { "apps/edge/src": hashDir("apps/edge/src"), "pages/functions": hashDir("pages/functions"), "packages/beacon/src": hashDir("packages/beacon/src"), "packages/shared/src": hashDir("packages/shared/src"), "apps/edge/migrations": hashDir("apps/edge/migrations") };

// ---- report ----
const sec = (t, a) => `\n### ${t}\n\n${a.length ? a.map((x) => "- " + x).join("\n") : "none"}\n`;
const liveDiffs = [...schema.liveVsSchema, ...schema.liveVsMigrations].filter((d) => !/table telemetry/.test(d));
const liveBehind = [...new Set(liveDiffs.filter((d) => /only in (SCHEMA|migrations)/.test(d)))], liveAhead = [...new Set(liveDiffs.filter((d) => !/only in (SCHEMA|migrations)/.test(d)))];
const consistent = !schema.schemaVsMigrations.length && !schema.schemaErrors.length && !schema.migErrors.length; // the code's SCHEMA and its migration files agree
const verdictSchema = consistent && !liveBehind.length && !liveAhead.length; // ... and live equals both
const schemaWord = verdictSchema ? "EQUAL" : consistent && !liveAhead.length ? `CONSISTENT, LIVE BEHIND (${liveBehind.length} pending: ${liveBehind.slice(0, 4).join("; ")})` : "DIFFERENT";
const md = `# Simulation parity report

Generated by \`node tools/sim2/parity.mjs\` on ${new Date().toISOString()}. It lists differences; it fixes nothing. The only contact with the live site is ${rows.length} plain GETs of public files (one each, 120 ms apart).

## Verdict

| Check | Result |
|---|---|
| Schema: live export vs Worker SCHEMA vs migrations ${schema.migrationFiles[0]} .. ${schema.migrationFiles.at(-1)} | ${schemaWord} (\`telemetry\` aside, see below) |
| Pages: every built file equals the live file | ${differ.length ? `${differ.length} of ${rows.length} DIFFER (section 2)` : `all ${rows.length} files identical`} |
| Pages: response headers promised by \`_headers\` match live | ${headerDiffs.length ? `${headerDiffs.length} files differ (section 2)` : "all match"} |
| Worker code | commit \`${head.slice(0, 10)}\` on \`${branch}\`, ${dirty.length} uncommitted file(s) under apps/packages/pages/tools/sim2 (section 3) |

## 1. Schema

- Live export has no \`d1_migrations\` table: ${schema.liveHasD1MigrationsTable ? "it has one" : "so the list of applied migrations cannot be read from the export; compare by shape instead (below). The lead can run \`wrangler d1 migrations list corporate-tambola --remote\` (read-only) to confirm 0001..0017 are applied."}
- Tables: live ${schema.tables.live}, SCHEMA ${schema.tables.schema}, migrations ${schema.tables.migrations}. SCHEMA errors: ${schema.schemaErrors.length}. Migration errors: ${schema.migErrors.length}.
- Live row counts: ${Object.entries(schema.liveRowCounts).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ")}.
${sec("live vs Worker SCHEMA constant", schema.liveVsSchema)}${sec("live vs migration files", schema.liveVsMigrations)}${sec("SCHEMA vs migration files", schema.schemaVsMigrations)}${sec("migration errors", schema.migErrors)}
\`telemetry\` exists only in live (and the sim) because the Pages Function \`pages/functions/api/telemetry.ts\` creates it on first use, "kept out of the product migration on purpose" (its own header comment).
The sim runner (\`tools/sim2/db.ts\`) applies the current SCHEMA on top of the copy and records what it had to ADD: see \`bun tools/sim2/import-live.ts\` output ("statements the current code's SCHEMA had to ADD").

## 2. Pages (what would be deployed vs what is live)

Local fingerprint of the ${rows.length} built files: \`${localFingerprint.slice(0, 16)}\`. Live GET base: ${LIVE}.
${sec("files that differ from live", differ.map((r) => `\`${r.file}\` (GET ${r.url} -> ${r.status || "no answer"}) ${r.note}`))}${sec("files whose headers differ from the \`_headers\` promise", headerDiffs.map((r) => `\`${r.file}\`: ${r.headerDiff.join(", ")}`))}
Files identical only after removing Cloudflare's injected analytics script: ${rows.filter((r) => /injected/.test(r.note)).length}.

## 3. Worker and repository

- Git: \`${head}\` (${branch}) ${when}
- Uncommitted files under apps, packages, pages, tools/sim2: ${dirty.length}${dirty.length ? "\n" + dirty.slice(0, 40).map((x) => "  - `" + x + "`").join("\n") : ""}
- Source hashes (sha256 of the sorted per-file hashes):

| Directory | Hash |
|---|---|
${Object.entries(hashes).map(([k, v]) => `| ${k} | \`${v.slice(0, 16)}\` |`).join("\n")}

- Pages deploy id: not obtainable with public GETs (needs the Cloudflare API / dashboard). The lead can record it from \`wrangler pages deployment list --project-name corporate-tambola\` (read-only) next to the commit above. The Worker itself is bundled into the Pages deployment (\`pages/functions/**\` imports \`apps/edge/src/worker.ts\`), so the file-level equality in section 2 plus the commit above is the strongest proof possible without touching the API routes of the live site.
- The sim runs the Worker with the same SCHEMA/handle code (\`tools/sim2/server.ts\`), STRICT_KEYS=1 and all five secrets set (values differ from live; sealed live personal data cannot be opened, by design).

## 4. Known, intended differences between the sim and live

- Secrets are sim values; live sealed rows (names, numbers, e-mails) are unreadable in the copy.
- \`TEST_MODE=1\`, no RESEND/RAZORPAY keys, \`OWNER_EMAIL=sim@example.com\`, site mode TEST (live is LIVE): needed so payments, codes and mail are testable.
- \`PUBLIC_ORIGIN\` is http://localhost:8801; Google sign-in uses a fake key set (\`GOOGLE_CLIENT_ID\` is set in the sim; check live with \`GET /api/auth/config\` by the lead).
- Static serving is a re-implementation of Cloudflare Pages rules (\`tools/sim2/pages.ts\`); Cloudflare-side behaviour (HTTP/2, caching, injected analytics) is not simulated.
`;
writeFileSync(join(ROOT, "docs/SIM_PARITY_REPORT.md"), md);
console.log(`parity: schema ${schemaWord}; pages ${rows.length - differ.length}/${rows.length} identical, ${headerDiffs.length} header diffs; commit ${head.slice(0, 10)}, ${dirty.length} dirty. Report: docs/SIM_PARITY_REPORT.md`);
