// Every game of the campaign can be found and cleaned: game id TR-<run>-<case>, game name and organizer label TEST-RUN-<id>, contact demoN@demo-test.invalid (N = 1, 2, 3 ...; the reserved .invalid ending can never deliver, never a real address),
// and a registry line (id, run, case, organizer key) kept OUTSIDE the repository, because the key is a secret.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { DATA } from "./lib.mjs";
const SEQ = `${DATA}/demo-email-seq.txt`; // the number continues across runs and processes: an address that already has an organizer account is never used again
/** The owner's rule for every test: fake numbered e-mails demo1@demo-test.invalid, demo2@... (never a real person's address). */
export const demoEmail = () => { let n = 0; try { n = Number(readFileSync(SEQ, "utf8")) || 0; } catch { /* first one */ } n++; writeFileSync(SEQ, String(n)); return `demo${n}@demo-test.invalid`; };
export const tagOf = (runId, caseId) => {
  const id = `TR-${String(runId).replace(/[^A-Za-z0-9]/g, "").slice(0, 10)}-${String(caseId).replace(/[^A-Za-z0-9]/g, "").slice(0, 10)}`.slice(0, 40);
  return { id, name: `TEST-RUN-${id}`, email: demoEmail(), phone: "9000000001" };
};
export const isTagged = (idOrName) => /^TR-[A-Za-z0-9]+-[A-Za-z0-9]+$/.test(idOrName) || /^TEST-RUN-TR-/.test(idOrName);
const REG = `${DATA}/registry.jsonl`;
export const register = (rec) => appendFileSync(REG, JSON.stringify({ ...rec, at: new Date().toISOString() }) + "\n");
export const registry = () => (existsSync(REG) ? readFileSync(REG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
