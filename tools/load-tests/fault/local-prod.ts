// A local server that MIMICS THE DEPLOYED ONE: the same code (TREE = a checkout, default: this one) and the same [vars] as that checkout's pages/wrangler.toml
// (JOIN_PER_IP_MINUTE / JOIN_PER_IP_DAY / DAILY_WRITE_BUDGET ...). The code alone uses other defaults (200 a minute, 80,000 writes), which is NOT what the site runs.
// Left out on purpose: PAY_HOP_URL (a live address) and COMPANY_JSON. The database is local SQLite, so speed is not the speed of Cloudflare D1.
// run: PORT=8871 CT_MODE=TEST TEST_MODE=1 PUBLIC_ORIGIN=http://localhost:8871 DB_FILE=./data/x.sqlite [TREE=/path/to/checkout] bun run tools/load-tests/fault/local-prod.ts
import { readFileSync } from "node:fs";
const tree = (process.env.TREE ?? new URL("../../../", import.meta.url).pathname).replace(/\/$/, "");
const { startLocal } = await import(tree + "/apps/edge/src/local.ts");
const s = startLocal({ dbFile: process.env.DB_FILE ?? "tambola-local.sqlite" });
const toml = readFileSync(tree + "/pages/wrangler.toml", "utf8"), vars = toml.slice(toml.indexOf("[vars]") + 6).split(/\n\[/)[0] ?? "", applied: Record<string, string> = {};
for (const line of vars.split("\n")) { const m = /^([A-Z0-9_]+)\s*=\s*"([^"]*)"/.exec(line.trim()); if (m && !["PAY_HOP_URL"].includes(m[1]!)) { (s.env as any)[m[1]!] = m[2]!; applied[m[1]!] = m[2]!; } }
console.log("deployed-style settings applied from " + tree + "/pages/wrangler.toml:", JSON.stringify(applied));
console.log(`Corporate Tambola (deployed-style, local) on ${s.url}`);
