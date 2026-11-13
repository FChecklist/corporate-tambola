// V2 audit round 5: no capability ids for Hosts or AI, AI never reads the organizer's tickets, a call that declares itself AI cannot decide claims or make keys, notes keep no mobile numbers, the audit copy of V2 calls keeps the plain choices only.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PLAT, T, W, call, j, keyH, paidGame, q, reset, restore } from "./param-harness";
import { gameKey, guests, labelHost } from "./v2-helpers";
import { loadRows } from "../src/audit";

beforeEach(() => reset());
afterEach(restore);

describe("no payment id for a Host or an AI", () => {
  test("receipts and the export carry no pay_ id for a Host, an AI key or an AI game key; the organizer still gets it", async () => {
    const g = await paidGame(); const host = await labelHost(g); const aik = await gameKey(g, { ai: true, label: "ChatGPT" });
    const get = async (p: string, key: string, extra: Record<string, string> = {}) => (await call("GET", `/api/z/${g.id}/${p}`, undefined, { ...keyH(key), ...extra })).text();
    for (const [p, k] of [["v2/receipts", host], ["v2/receipts", g.ai], ["v2/receipts", aik], ["v2/export?part=payments", aik]] as const) {
      const t = await get(p, k); expect(t).not.toMatch(/pay_[0-9a-f]{8}/); expect(t).toContain("invoiceNumber");
    }
    expect(await get("v2/receipts", g.key)).toMatch(/pay_[0-9a-f]{8}/);
  });
});
describe("an AI never reads the organizer's support tickets", () => {
  test("the organizer's ticket is hidden from the AI key and an AI game key; the AI's own is seen", async () => {
    const g = await paidGame(); const aik = await gameKey(g, { ai: true, label: "ChatGPT" });
    const id = (await j(await call("POST", "/api/v2/support", { subject: "Billing question", body: "GST details please", game: g.id }, keyH(g.key)))).id;
    for (const k of [g.ai, aik]) {
      expect(((await j(await call("GET", "/api/v2/support", undefined, keyH(k)))).tickets as any[]).length).toBe(0);
      expect((await call("GET", `/api/v2/support/${id}`, undefined, keyH(k))).status).toBe(404);
    }
    const mine = (await j(await call("POST", "/api/v2/support", { subject: "AI question", body: "How do I add a prize", game: g.id }, keyH(aik)))).id;
    expect(((await j(await call("GET", "/api/v2/support", undefined, keyH(aik)))).tickets as any[]).map((t) => t.id)).toEqual([mine]);
  });
});
describe("a call that says it is an AI", () => {
  const ai = (key: string) => ({ ...keyH(key), "x-ai-model": "AI: ChatGPT" });
  test("cannot switch review, decide a claim, make a key or a Host; the organizer's own call still can", async () => {
    const g = await paidGame(); const seats = await guests(g.id, 1);
    expect((await call("POST", `/api/z/${g.id}/v2/claimreview/mode`, { on: true }, ai(g.key))).status).toBe(403);
    expect((await call("POST", `/api/z/${g.id}/v2/keys`, {}, ai(g.key))).status).toBe(403);
    expect((await call("POST", `/api/z/${g.id}/v2/host`, {}, ai(g.key))).status).toBe(403);
    expect((await call("POST", `/api/z/${g.id}/v2/claimreview/mode`, { on: true }, keyH(g.key))).status).toBe(200);
    expect((await call("POST", `/api/z/${g.id}/v2/keys`, {}, keyH(g.key))).status).toBe(200);
    void seats;
  });
  test("the all-games receipts hide the secrets from it", async () => {
    const g = await paidGame();
    const own = JSON.stringify(await j(await call("GET", "/api/org/v2/receipts", undefined, keyH(g.key))));
    const declared = JSON.stringify(await j(await call("GET", "/api/org/v2/receipts", undefined, ai(g.key))));
    expect(own).toContain("gatewayReference"); expect(declared).not.toContain("gatewayReference"); expect(declared).not.toMatch(/pay_[0-9a-f]{8}/); expect(declared).toContain('"secretsShown":false');
  });
});
describe("notes keep no mobile number, and the audit log keeps plain choices only", () => {
  test("a hand-over note loses a typed mobile number", async () => {
    const g = await paidGame(); const h = await labelHost(g);
    expect((await call("POST", `/api/z/${g.id}/v2/host/handover`, { note: "call me on 98765 43210 please" }, keyH(h))).status).toBe(200);
    const row = q("SELECT note FROM v2_handover WHERE eid=?", g.id)[0] as { note: string }; expect(row.note).not.toMatch(/\d{5}/); expect(row.note).toMatch(/please/);
    expect(JSON.stringify(q("SELECT text FROM v2_notice WHERE eid=?", g.id))).not.toMatch(/\d{9}/);
  });
  test("a claim decision is recorded by choice (decision, ticket, pattern), never by words; owner replies are not copied", async () => {
    const g = await paidGame(); const seats = await guests(g.id, 1); const h = await labelHost(g);
    W.raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES(?,?,?,?,?,?)").run(g.id, `${seats[0]}x${"ab".repeat(6)}`, "top", 1, 11, T);
    await call("POST", `/api/z/${g.id}/v2/claimreview/mode`, { on: true }, keyH(g.key));
    await call("POST", `/api/z/${g.id}/v2/claimreview`, { round: 1, pattern: "top", ticket: seats[0], decision: "reject", reason: "Ramesh Kumar line not full" }, keyH(h));
    const id = (await j(await call("POST", "/api/v2/support", { subject: "A question here", body: "Please help me with this", game: g.id }, keyH(g.key)))).id;
    await call("POST", `/api/owner/v2/support/${id}`, { reply: "Walrus reply words", status: "answered" }, PLAT);
    const chains = (W.raw.prepare("SELECT DISTINCT chain FROM audit_log").all() as { chain: string }[]).map((r) => r.chain);
    const all: any[] = []; for (const c of chains) all.push(...(await loadRows(W.env as any, c)));
    const txt = JSON.stringify(all); expect(txt).not.toContain("Ramesh"); expect(txt).not.toContain("Walrus");
    const dec = all.find((r) => /v2\/claimreview$/.test(r.details?.path ?? "") && r.details?.method === "POST" && r.details?.changes?.decision);
    expect(dec?.details.changes).toMatchObject({ decision: "reject", pattern: "top" }); expect(dec.details.changes.reason).toBeUndefined();
  });
});
