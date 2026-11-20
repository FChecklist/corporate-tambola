// Ten complete 250-player Tambola games in the local test environment. Usage: bun run tools/game250/run.ts <1..10|all> [--people=250]
// Nothing here touches production or takes a payment (see tools/game250/lib.ts).
import { World, ownerTestOrganizer, createGame, registerKey, addHost, press, HOST_SECRET, ORG_SECRET, MIN, T0, DEFAULT_REWARDS, ordinals, type Org, type GameSpec, type PhoneOpts } from "./lib";
import { newRec, check, phoneList, runLoop, outcome, fairnessProbes, enableLeakWatch, writeRec, type Ctx } from "./engine";
import { cfgOfRow } from "../../apps/edge/src/lifecycle";
import { roundTimeMs } from "../../packages/beacon/src";
import { GRACE_ROUNDS } from "../../packages/beacon/src/config";
import { publicKeyFromSecret } from "../../packages/beacon/src/control";
import { GAMES } from "./all";

const arg = process.argv[2] ?? "all";
const N = Number((process.argv.find((a) => a.startsWith("--people=")) ?? "--people=250").split("=")[1]);
export { N };
const which = arg === "all" ? GAMES.map((_, i) => i + 1) : arg.split(",").map(Number);
let failed = 0;
for (const n of which) {
  const g = GAMES[n - 1]; if (!g) { console.log("no game " + n); continue; }
  console.log(`\n=== GAME ${n}: ${g.title} ===`);
  const t0 = performance.now();
  try { await g.run(n, N); } catch (e: any) { failed++; console.log("GAME CRASHED:", e?.stack ?? e); }
  console.log(`=== game ${n} done in ${((performance.now() - t0) / 1000).toFixed(0)} s ===`);
}
process.exit(failed ? 1 : 0);
void World; void ownerTestOrganizer; void createGame; void registerKey; void addHost; void press; void HOST_SECRET; void ORG_SECRET; void MIN; void T0; void DEFAULT_REWARDS; void ordinals; void newRec; void check; void phoneList; void runLoop; void outcome; void fairnessProbes; void enableLeakWatch; void writeRec; void cfgOfRow; void roundTimeMs; void GRACE_ROUNDS; void publicKeyFromSecret;
export type { Org, GameSpec, PhoneOpts, Ctx };
