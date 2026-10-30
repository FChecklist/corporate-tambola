// Every game of the campaign can be found and cleaned: game id TR-<run>-<case>, game name and organizer label TEST-RUN-<id>, contact test+<id>@example.invalid (never a real address),
// and a registry line (id, run, case, organizer key) kept OUTSIDE the repository, because the key is a secret.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { DATA } from "./lib.mjs";
export const tagOf = (runId, caseId) => {
  const id = `TR-${String(runId).replace(/[^A-Za-z0-9]/g, "").slice(0, 10)}-${String(caseId).replace(/[^A-Za-z0-9]/g, "").slice(0, 10)}`.slice(0, 40);
  return { id, name: `TEST-RUN-${id}`, email: `test+${id.toLowerCase()}@example.invalid`, phone: "9000000001" };
};
export const isTagged = (idOrName) => /^TR-[A-Za-z0-9]+-[A-Za-z0-9]+$/.test(idOrName) || /^TEST-RUN-TR-/.test(idOrName);
const REG = `${DATA}/registry.jsonl`;
export const register = (rec) => appendFileSync(REG, JSON.stringify({ ...rec, at: new Date().toISOString() }) + "\n");
export const registry = () => (existsSync(REG) ? readFileSync(REG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
