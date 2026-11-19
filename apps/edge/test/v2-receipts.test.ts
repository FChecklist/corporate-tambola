// V2 item 2: receipts and payment history by key, for the organizer and the Hosts. Payee on every receipt: IT SERVICES BY RAJAT AGARWAL via Razorpay. Hosts and AI keys never see payment secrets.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HOUR, T, W, call, create, j, keyH, mails, one, paidGame, reset, restore, uid } from "./param-harness";

beforeEach(() => reset());
afterEach(restore);

const PAYEE = "IT SERVICES BY RAJAT AGARWAL via Razorpay";
const rec = (id: string, key: string, now = T) => call("GET", `/api/z/${id}/v2/receipts`, undefined, keyH(key), now);
async function labelHost(g: { key: string; id: string }) { return (await j(await call("POST", `/api/z/${g.id}/v2/host`, { label: "Priya" }, keyH(g.key)))).hostKey as string; }
async function gameKey(g: { key: string; id: string }, ai = false) { return (await j(await call("POST", `/api/z/${g.id}/v2/keys`, { ai }, keyH(g.key)))).key as string; }

describe("the organizer's receipts", () => {
  test("one game: payee on the receipt, the invoice number, the payer's own links", async () => {
    const g = await paidGame(); const r = await rec(g.id, g.key); const b = await j(r);
    expect(r.status).toBe(200); expect(b.payee).toBe(PAYEE); expect(b.secretsShown).toBe(true); expect(b.receipts.length).toBe(1);
    const x = b.receipts[0];
    expect(x.payee).toBe(PAYEE); expect(x.game).toBe(g.id); expect(x.status).toBe("paid"); expect(x.invoiceNumber).toBeTruthy();
    expect(x.invoiceUrl).toMatch(/\/api\/invoice\/[A-Za-z0-9_.-]+$/); expect(x.payerEmailMasked).toMatch(/^[a-z0-9]\*\*\*@acme\.com$/);
    expect(x.amount).toBeGreaterThanOrEqual(0);
  });
  test("across all games: only the organizer's own account key", async () => {
    const g = await paidGame(); const g2 = uid(); await create(g.key, g2);
    const b = await j(await call("GET", "/api/org/v2/receipts", undefined, keyH(g.key)));
    expect(b.payee).toBe(PAYEE); expect(b.receipts.length).toBe(1); expect(b.receipts[0].game).toBe(g.id);
    const h = await labelHost(g), k = await gameKey(g);
    expect((await call("GET", "/api/org/v2/receipts", undefined, keyH(h))).status).toBe(403);
    const r = await call("GET", "/api/org/v2/receipts", undefined, keyH(k)); expect(r.status).toBe(403); expect((await j(r)).code).toBe("key-scope");
    expect((await call("GET", "/api/org/v2/receipts")).status).toBeGreaterThanOrEqual(401);
  });
  test("a stranger's organizer sees nothing of this game; a draft with no payment says so plainly", async () => {
    const g = await paidGame(); const s = await paidGame();
    expect((await rec(g.id, s.key)).status).toBe(403);
    const d = uid(); await create(g.key, d);
    const b = await j(await rec(d, g.key)); expect(b.receipts).toEqual([]); expect(b.note).toMatch(/No payment has been made/);
  });
});

describe("Hosts and AI keys get the history WITHOUT payment secrets", () => {
  const SECRET_FIELDS = ["payerEmailMasked", "gatewayReference", "invoiceUrl", "invoicePdfUrl", "creditNoteUrls"];
  test("a Host key made without personal data, the organizer's AI key, an AI game key", async () => {
    const g = await paidGame(); const keys = { host: await labelHost(g), ai: g.ai, aiGame: await gameKey(g, true) };
    const full = await j(await rec(g.id, g.key)); const token = String(full.receipts[0].invoiceUrl).split("/").pop()!.replace(/\.pdf$/, "");
    for (const [who, k] of Object.entries(keys)) {
      const r = await rec(g.id, k); const b = await j(r); expect(r.status).toBe(200);
      expect(b.secretsShown).toBe(false); expect(b.payee).toBe(PAYEE); expect(b.receipts.length).toBe(1);
      for (const f of SECRET_FIELDS) expect(b.receipts[0][f], who + " " + f).toBeUndefined();
      const text = JSON.stringify(b); expect(text, who).not.toContain(token); expect(text, who).not.toContain("pay_" + g.id); expect(text, who).not.toContain("acme.com");
      expect(b.receipts[0].invoiceNumber).toBe(full.receipts[0].invoiceNumber); // the number and the amount are history, not a secret
    }
  });
  test("the Host cannot have the receipts mailed", async () => {
    const g = await paidGame(); const h = await labelHost(g);
    const r = await call("POST", `/api/z/${g.id}/v2/receipts/send`, {}, keyH(h)); expect(r.status).toBe(403);
  });
  test("a Host of a different account sees nothing", async () => {
    const g = await paidGame(); const s = await paidGame(); const h = await labelHost(s);
    expect((await rec(g.id, h)).status).toBe(403);
  });
});

describe("the receipts by e-mail", () => {
  test("the organizer asks; the e-mail names the payee and carries the invoice link, and goes to the organizer only", async () => {
    const g = await paidGame(); const before = mails().length;
    const r = await call("POST", `/api/z/${g.id}/v2/receipts/send`, {}, keyH(g.key)); expect(r.status).toBe(200);
    const m = mails().slice(before).find((x: any) => /Receipts for your game/.test(x.subject));
    expect(m).toBeTruthy(); expect(m.to_addr).toBe(g.email);
    expect(JSON.stringify(m)).toContain("IT SERVICES BY RAJAT AGARWAL via Razorpay");
  });
  test("nothing to send for a game with no payment", async () => {
    const g = await paidGame(); const d = uid(); await create(g.key, d);
    const r = await call("POST", `/api/z/${d}/v2/receipts/send`, {}, keyH(g.key)); expect(r.status).toBe(404); expect((await j(r)).code).toBe("no-payments");
  });
  test("an AI key cannot have them mailed", async () => {
    const g = await paidGame(); expect((await call("POST", `/api/z/${g.id}/v2/receipts/send`, {}, keyH(g.ai))).status).toBe(403);
  });
});

describe("the payee line is unchanged on the invoice itself", () => {
  test("the invoice the organizer receives still names the seller and Razorpay", async () => {
    const g = await paidGame(); const full = await j(await rec(g.id, g.key));
    const inv = await call("GET", String(full.receipts[0].invoiceUrl).replace(/^https?:\/\/[^/]+/, ""), undefined, {});
    expect(inv.status).toBe(200); const t = await inv.text(); expect(t).toMatch(/IT Services by Rajat Agarwal/i); expect(t).toMatch(/Razorpay/);
    void one; void W; void HOUR;
  });
});
