// A second local copy of the service for a hand-driven dry run (an AI acting as the organizer's assistant), on its own port and its own database,
// so it never collides with the Chrome sims on 8804. Run: bun tools/sim2/scenarios/ui/server-dryrun.ts   (env DRYRUN_PORT=8805)
import { join } from "node:path";
import { startSim } from "../../server";

const ROOT = join(import.meta.dir, "../../../..");
const s = await startSim({ port: Number(process.env.DRYRUN_PORT ?? 8805), runFile: join(ROOT, "sim/run-dryrun.sqlite"), build: false });
console.log(`SIM-DRYRUN READY ${s.url} (db ${s.raw.filename})`);
