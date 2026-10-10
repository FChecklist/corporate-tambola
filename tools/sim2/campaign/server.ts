// One rehearsal server: the exact Worker (handle) on its OWN empty database (no live data at all: everything in it is made up), its OWN port and its OWN clock, with the site
// in LIVE mode and the Worker pointed at the FAKE Razorpay of the scenario process (env CAMP_RZP_BASE / CAMP_RZP_KEY / CAMP_RZP_SECRET / CAMP_RZP_HOOK).
// Several of these run side by side (3 games at once), so nothing is shared. Pages are NOT rebuilt here (the orchestrator builds once).
// Run: SIM_PORT=8811 CAMP_RZP_BASE=http://127.0.0.1:8911/v1 CAMP_RZP_KEY=... CAMP_RZP_SECRET=... CAMP_RZP_HOOK=... bun tools/sim2/campaign/server.ts
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { startSim } from "../server";
import { applySchemaIdempotent } from "../db";

const ROOT = join(import.meta.dir, "../../..");
const port = Number(process.env.SIM_PORT ?? 8811);
mkdirSync(join(ROOT, "sim"), { recursive: true });
const pristine = join(ROOT, "sim/campaign-empty.sqlite");
if (!existsSync(pristine)) { const d = new Database(pristine, { create: true }); applySchemaIdempotent(d); d.run("PRAGMA wal_checkpoint(TRUNCATE)"); d.close(); }

const s = await startSim({ port, pristine, runFile: join(ROOT, `sim/campaign-${port}.sqlite`), build: false });
const env = s.env as any;
env.RAZORPAY_KEY_ID = process.env.CAMP_RZP_KEY; env.RAZORPAY_KEY_SECRET = process.env.CAMP_RZP_SECRET; env.RAZORPAY_WEBHOOK_SECRET = process.env.CAMP_RZP_HOOK;
env.RAZORPAY_BASE_URL = process.env.CAMP_RZP_BASE; env.RAZORPAY_INTERNATIONAL = "1";
s.raw.run("UPDATE mode SET mode='LIVE', changed_ms=?, reason='campaign' WHERE id=1", [Date.now()]);
console.log(`CAMPAIGN SERVER READY http://localhost:${port} (fake Razorpay at ${env.RAZORPAY_BASE_URL})`);
