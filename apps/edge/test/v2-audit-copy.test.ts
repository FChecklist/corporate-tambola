// V2 audit round 4: free text a person types into a V2 call (a Host's reason, a support text, a hand-over note) must never reach the internal audit log, which lives 365 days.
// The log records that the call happened, not the words.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { T, W, call, keyH, paidGame, reset, restore } from "./param-harness";
import { guests, labelHost } from "./v2-helpers";
import { loadRows } from "../src/audit";

beforeEach(() => reset());
afterEach(restore);

async function everything(): Promise<string> {
  const chains = (W.raw.prepare("SELECT DISTINCT chain FROM audit_log").all() as { chain: string }[]).map((r) => r.chain);
  const out: unknown[] = []; for (const c of chains) out.push(...(await loadRows(W.env as any, c)));
  return JSON.stringify(out);
}
describe("the audit log never copies V2 free text", () => {
  test("a Host's claim reason, a support text and a hand-over note are not in any audit row", async () => {
    const g = await paidGame(); const seats = await guests(g.id, 2); const host = await labelHost(g);
    W.raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES(?,?,?,?,?,?)").run(g.id, `${seats[0]}x${"ab".repeat(6)}`, "top", 1, 11, T);
    expect((await call("POST", `/api/z/${g.id}/v2/claimreview/mode`, { on: true }, keyH(g.key))).status).toBe(200);
    const d = await call("POST", `/api/z/${g.id}/v2/claimreview`, { round: 1, pattern: "top", ticket: seats[0], decision: "reject", reason: "Ramesh Kumar line not full" }, keyH(host));
    expect(d.status).toBe(200);
    expect((await call("POST", "/api/v2/support", { subject: "Zebra subject", body: "Quokka body text", game: g.id }, keyH(g.key))).status).toBeLessThan(300);
    await call("POST", `/api/z/${g.id}/v2/host/handover`, { note: "Narwhal note" }, keyH(host));
    const all = await everything();
    for (const w of ["Ramesh", "Zebra", "Quokka", "Narwhal"]) expect(all).not.toContain(w);
    expect(all).toContain("/v2/claimreview"); // the call itself is recorded
  });
});
