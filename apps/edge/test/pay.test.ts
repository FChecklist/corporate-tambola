import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { handle, type Env } from "../src/worker";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"];
const realFetch = globalThis.fetch;
let rz: { orders: any[]; payments: Record<string, any>; captured: string[] };
const hmac = (secret: string, s: string) => createHmac("sha256", secret).update(s).digest("hex");
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }), env as Env, now);
const buy = (o: Record<string, unknown> = {}) => call("POST", "/api/checkout", { org: "Acme Ltd", email: "Boss@Acme.com", country: "IN", taxId: "", pack: 500, currency: "INR", ...o });

beforeEach(() => {
  const d = makeD1(); raw = d.raw;
  rz = { orders: [], payments: {}, captured: [] };
  // a stand-in for Razorpay's REST API
  (globalThis as any).fetch = async (url: string, init?: any) => {
    const u = String(url);
    if (u.startsWith("https://rzp.test/v1/orders")) { const b = JSON.parse(init.body); const o = { id: "order_" + (rz.orders.length + 1), amount: b.amount, currency: b.currency, receipt: b.receipt, status: "created" }; rz.orders.push(o); return new Response(JSON.stringify(o), { status: 200 }); }
    const pm = u.match(/\/payments\/([^/]+)(\/capture)?$/);
    if (pm) { const p = rz.payments[pm[1]!]; if (!p) return new Response(JSON.stringify({ error: { description: "no such payment" } }), { status: 404 }); if (pm[2]) { rz.captured.push(pm[1]!); p.status = "captured"; } return new Response(JSON.stringify(p), { status: 200 }); }
    return new Response("{}", { status: 404 });
  };
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000", RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "sek", RAZORPAY_WEBHOOK_SECRET: "whsec", RAZORPAY_BASE_URL: "https://rzp.test/v1", PUBLIC_ORIGIN: "https://tambola.test" };
});
afterEach(() => { globalThis.fetch = realFetch; });

const complete = async (paymentId: string, orderId: string, payId = "pay_1", status = "captured", amount?: number) => {
  rz.payments[payId] = { id: payId, order_id: orderId, status, amount: amount ?? rz.orders.find((o) => o.id === orderId)!.amount };
  return call("POST", "/api/payments/verify", { paymentId, razorpay_order_id: orderId, razorpay_payment_id: payId, razorpay_signature: hmac("sek", `${orderId}|${payId}`) });
};

describe("checkout", () => {
  test("status says which mode is on and what company details are still missing", async () => {
    const s = await (await call("GET", "/api/payments/status")).json() as any;
    expect(s.mode).toBe("razorpay");
    expect(s.legalEntity).toMatch(/SHOBHA KAMAL SOLUTIONS/i);
    expect(Array.isArray(s.missingCompanyDetails)).toBe(true);
  });
  test("without keys and without test mode nothing can be bought", async () => {
    env.RAZORPAY_KEY_ID = undefined; env.RAZORPAY_KEY_SECRET = undefined;
    expect((await buy()).status).toBe(503);
  });
  test("bad packs, bad e-mails, missing names and oversize bodies are refused before anything is created", async () => {
    for (const o of [{ pack: 123 }, { pack: "x" }, { email: "nope" }, { email: "" }, { org: "" }, { org: "A" }]) expect((await buy(o)).status).toBe(400);
    expect((await call("POST", "/api/checkout", "x".repeat(9000))).status).toBe(400);
    expect(rz.orders.length).toBe(0);
    expect(raw.query("SELECT COUNT(*) c FROM payment").get()).toEqual({ c: 0 });
  });
  test("a valid checkout creates one Razorpay order for the right amount in paise and one unpaid payment row", async () => {
    const r = await (await buy()).json() as any;
    expect(r.mode).toBe("razorpay");
    expect(r.razorpay.amount).toBe(150000); // 500 participants = Rs 1,500 incl. GST
    expect(r.razorpay.name).toBe("CORPORATE TAMBOLA");
    expect(rz.orders).toHaveLength(1);
    expect(raw.query("SELECT status FROM payment").get()).toEqual({ status: "created" });
  });
  test("dollar payments are refused until international is switched on", async () => {
    expect((await buy({ currency: "USD" })).status).toBe(400);
    env.RAZORPAY_INTERNATIONAL = "1";
    expect((await buy({ currency: "USD" })).status).toBe(200);
    expect(rz.orders[0].currency).toBe("USD");
  });
  test("Razorpay refusing the order is reported without leaving a payment behind", async () => {
    (globalThis as any).fetch = async () => new Response(JSON.stringify({ error: { description: "Authentication failed" } }), { status: 401 });
    const r = await buy();
    expect(r.status).toBe(502);
    expect(raw.query("SELECT COUNT(*) c FROM payment").get()).toEqual({ c: 0 });
  });
});

describe("verify (the buyer's browser says it paid)", () => {
  let paymentId = "", orderId = "";
  beforeEach(async () => { const r = await (await buy()).json() as any; paymentId = r.paymentId; orderId = r.razorpay.orderId; });
  test("a real, captured payment fulfils: organizer key shown once, entitlement, invoice, mail", async () => {
    const r = await (await complete(paymentId, orderId)).json() as any;
    expect(r.ok).toBe(true);
    expect(r.organizerKey).toMatch(/^ctk_[0-9a-f]{48}$/);
    expect(r.invoiceNumber).toMatch(/\//);
    expect(raw.query("SELECT pack, eid FROM entitlement").get()).toEqual({ pack: 500, eid: null });
    expect(raw.query("SELECT COUNT(*) c FROM invoice").get()).toEqual({ c: 1 });
    const mail = raw.query("SELECT to_addr, body FROM outbox").get() as any;
    expect(mail.to_addr).toBe("boss@acme.com");
    expect(mail.body).toContain(r.organizerKey);
    expect(mail.body).toContain("INVOICE");
    const dump = JSON.stringify(raw.query("SELECT * FROM organizer_key").all());
    expect(dump.includes(r.organizerKey)).toBe(false); // only a hash is kept
  });
  test("paying again for the same order changes nothing (idempotent)", async () => {
    await complete(paymentId, orderId);
    const again = await (await complete(paymentId, orderId)).json() as any;
    expect(again.ok).toBe(true);
    expect(raw.query("SELECT COUNT(*) c FROM entitlement").get()).toEqual({ c: 1 });
    expect(raw.query("SELECT COUNT(*) c FROM invoice").get()).toEqual({ c: 1 });
    expect(raw.query("SELECT COUNT(*) c FROM outbox").get()).toEqual({ c: 1 });
  });
  test("a wrong signature is refused and nothing is granted", async () => {
    rz.payments.pay_1 = { id: "pay_1", order_id: orderId, status: "captured", amount: 150000 };
    const r = await call("POST", "/api/payments/verify", { paymentId, razorpay_order_id: orderId, razorpay_payment_id: "pay_1", razorpay_signature: "deadbeef" });
    expect(r.status).toBe(400);
    expect(raw.query("SELECT COUNT(*) c FROM entitlement").get()).toEqual({ c: 0 });
  });
  test("a valid signature for the wrong amount, wrong order, failed or unknown payment grants nothing", async () => {
    expect((await complete(paymentId, orderId, "pay_2", "captured", 100)).status).toBe(400);
    rz.orders.push({ id: "order_other", amount: 150000, currency: "INR" });
    expect((await complete(paymentId, "order_other", "pay_3")).status).toBe(404);
    expect((await complete(paymentId, orderId, "pay_4", "failed")).status).toBe(402);
    const r = await call("POST", "/api/payments/verify", { paymentId, razorpay_order_id: orderId, razorpay_payment_id: "pay_ghost", razorpay_signature: hmac("sek", `${orderId}|pay_ghost`) });
    expect(r.status).toBe(400);
    expect(raw.query("SELECT COUNT(*) c FROM entitlement").get()).toEqual({ c: 0 });
  });
  test("an authorized payment is captured for exactly the order amount, then fulfilled", async () => {
    const r = await complete(paymentId, orderId, "pay_5", "authorized");
    expect(r.status).toBe(200);
    expect(rz.captured).toEqual(["pay_5"]);
  });
  test("someone else's payment id cannot be used to claim this order", async () => {
    const r = await call("POST", "/api/payments/verify", { paymentId: "pay_nonexistent", razorpay_order_id: orderId, razorpay_payment_id: "p", razorpay_signature: "s" });
    expect(r.status).toBe(404);
  });
});

describe("webhook (the buyer closed the tab)", () => {
  let paymentId = "", orderId = "";
  beforeEach(async () => { const r = await (await buy()).json() as any; paymentId = r.paymentId; orderId = r.razorpay.orderId; });
  const hook = (ev: unknown, secret = "whsec") => { const raw = JSON.stringify(ev); return call("POST", "/api/payments/webhook", raw, { "x-razorpay-signature": hmac(secret, raw) }); };
  const captured = (amount = 150000) => ({ event: "payment.captured", payload: { payment: { entity: { id: "pay_w1", order_id: orderId, amount } } } });
  test("a signed capture fulfils, and a repeat delivery does not double up", async () => {
    expect((await hook(captured())).status).toBe(200);
    expect((await hook(captured())).status).toBe(200);
    expect(raw.query("SELECT COUNT(*) c FROM entitlement").get()).toEqual({ c: 1 });
    expect(raw.query("SELECT COUNT(*) c FROM invoice").get()).toEqual({ c: 1 });
  });
  test("a wrong signature, a missing secret and a garbage body are all refused", async () => {
    expect((await hook(captured(), "wrong")).status).toBe(400);
    expect((await call("POST", "/api/payments/webhook", "{}", {})).status).toBe(400);
    expect((await call("POST", "/api/payments/webhook", "not json", { "x-razorpay-signature": hmac("whsec", "not json") })).status).toBe(400);
    env.RAZORPAY_WEBHOOK_SECRET = undefined;
    expect((await hook(captured())).status).toBe(503);
    expect(raw.query("SELECT COUNT(*) c FROM entitlement").get()).toEqual({ c: 0 });
  });
  test("an unrelated event, an unknown order, or a capture for a different amount grants nothing", async () => {
    expect(await (await hook({ event: "payment.failed", payload: {} })).json()).toMatchObject({ ignored: "payment.failed" });
    expect(await (await hook({ event: "payment.captured", payload: { payment: { entity: { id: "p", order_id: "order_zzz", amount: 1 } } } })).json()).toMatchObject({ ignored: "unknown order" });
    expect(await (await hook(captured(100))).json()).toMatchObject({ ignored: "amount mismatch" });
    expect(raw.query("SELECT COUNT(*) c FROM entitlement").get()).toEqual({ c: 0 });
  });
  test("the browser verify arriving after the webhook returns the same result without a second grant", async () => {
    await hook(captured());
    rz.payments.pay_w1 = { id: "pay_w1", order_id: orderId, status: "captured", amount: 150000 };
    const r = await call("POST", "/api/payments/verify", { paymentId, razorpay_order_id: orderId, razorpay_payment_id: "pay_w1", razorpay_signature: hmac("sek", `${orderId}|pay_w1`) });
    expect(r.status).toBe(200);
    expect(raw.query("SELECT COUNT(*) c FROM entitlement").get()).toEqual({ c: 1 });
  });
});

describe("what a purchase lets you do", () => {
  const FUT = Math.floor((T / 1000 - 1692803367) / 3) + 1 + 5000;
  const purchase = async (o: Record<string, unknown> = {}) => { const r = await (await buy(o)).json() as any; return (await (await complete(r.paymentId, r.razorpay.orderId, "pay_" + Math.random().toString(36).slice(2, 8))).json()) as any; };
  test("no purchase, no engagement; one purchase, one engagement of up to the pack; a second needs a second purchase", async () => {
    const first = await purchase();
    const K = { "x-organizer": first.organizerKey };
    const mk = (id: string, cap: number) => call("POST", "/api/z", { id, startRound: FUT, callSeconds: 9, cap }, K);
    expect((await call("POST", "/api/z", { id: "NOPE1", startRound: FUT, callSeconds: 9, cap: 10 }, { "x-organizer": "ctk_none" })).status).toBe(403);
    expect((await mk("TOOBIG", 501)).status).toBe(200); // pack is 500: it can be built, as a draft, but not published with this pack
    expect((await call("POST", "/api/z/TOOBIG/publish", { email: "b@acme.com", phone: "9876543210" }, K)).status).toBe(402);
    expect((await mk("FIRST1", 400)).status).toBe(200);
    expect(raw.query("SELECT pack FROM engagement WHERE id='FIRST1'").get()).toEqual({ pack: 500 }); // published at once: a purchased pack was waiting
    expect((await mk("SECOND", 10)).status).toBe(200); // a second one can be built, but it is a draft until another purchase
    expect(raw.query("SELECT pack FROM engagement WHERE id='SECOND'").get()).toEqual({ pack: 0 });
    expect((await call("POST", "/api/z/SECOND/publish", { email: "b@acme.com", phone: "9876543210" }, K)).status).toBe(402);
    expect(raw.query("SELECT eid FROM entitlement").get()).toEqual({ eid: "FIRST1" });
    expect(raw.query("SELECT pack FROM engagement WHERE id='FIRST1'").get()).toEqual({ pack: 500 });
  });
  test("the limit can be raised only up to what was paid for", async () => {
    const first = await purchase(); const K = { "x-organizer": first.organizerKey };
    await call("POST", "/api/z", { id: "LIM1", startRound: FUT, callSeconds: 9, cap: 100 }, K);
    expect((await call("PATCH", "/api/z/LIM1/settings", { cap: 500 }, K)).status).toBe(200);
    const r = await call("PATCH", "/api/z/LIM1/settings", { cap: 501 }, K);
    expect(r.status).toBe(402);
    expect(((await r.json()) as any).error).toMatch(/Buy a bigger pack/);
  });
  test("a returning buyer (same e-mail) gets another entitlement on the same organizer, with no second key", async () => {
    const first = await purchase();
    const again = await purchase({ email: "BOSS@acme.com", pack: 1000 });
    expect(again.organizerKey).toBeNull();
    expect(again.newOrganizer).toBe(false);
    expect(raw.query("SELECT COUNT(*) c FROM organizer_key WHERE kind='master'").get()).toEqual({ c: 1 });
    expect(raw.query("SELECT COUNT(*) c FROM entitlement").get()).toEqual({ c: 2 });
    const K = { "x-organizer": first.organizerKey };
    expect((await call("POST", "/api/z", { id: "BIGONE", startRound: FUT, callSeconds: 9, cap: 900 }, K)).status).toBe(200); // picks the 1000 pack
  });
  test("another e-mail is another organizer with their own key and nothing shared", async () => {
    const a = await purchase(); const b = await purchase({ email: "other@corp.com" });
    expect(b.organizerKey).not.toBe(a.organizerKey);
    await call("POST", "/api/z", { id: "AAA11", startRound: FUT, callSeconds: 9, cap: 10 }, { "x-organizer": a.organizerKey });
    expect((await call("GET", "/api/z/AAA11/participants", undefined, { "x-organizer": b.organizerKey })).status).toBe(403);
  });
  test("the platform can still create engagements with no purchase", async () => {
    expect((await call("POST", "/api/z", { id: "FREE1", startRound: FUT, callSeconds: 9, cap: 99 }, { "x-organizer": "plat" })).status).toBe(200);
  });
});

describe("invoices", () => {
  test("numbers run in sequence per brand and financial year, and each is viewable by its private link only", async () => {
    const nums: string[] = []; const urls: string[] = [];
    for (let i = 0; i < 3; i++) { const r = await (await buy({ email: `u${i}@x.com` })).json() as any; const f = await (await complete(r.paymentId, r.razorpay.orderId, "pay_i" + i)).json() as any; nums.push(f.invoiceNumber); urls.push(f.invoiceUrl); }
    expect(nums.map((n) => Number(n.split("/").pop()))).toEqual([1, 2, 3]);
    const html = await (await call("GET", urls[0]!)).text();
    expect(html).toContain("SHOBHA KAMAL");
    expect(html).toContain(nums[0]!);
    expect((await call("GET", "/api/invoice/inv_" + "0".repeat(32))).status).toBe(404);
    expect((await call("GET", "/api/invoice/anything")).status).toBe(404);
  });
  test("missing company details make the invoice a DRAFT, never a fake valid one", async () => {
    const r = await (await buy()).json() as any; const f = await (await complete(r.paymentId, r.razorpay.orderId)).json() as any;
    const html = await (await call("GET", f.invoiceUrl)).text();
    expect(html).toContain("DRAFT:");
  });
  test("with the company details filled in, the invoice is not a draft and splits GST", async () => {
    env.COMPANY_JSON = JSON.stringify({ gstin: "07AAAAA0000A1Z5", pan: "AAAAA0000A", stateCode: "07", stateName: "Delhi", sacCode: "998439", addressLines: ["1 Test Road", "New Delhi"], email: "billing@x.test" });
    const r = await (await buy()).json() as any; const f = await (await complete(r.paymentId, r.razorpay.orderId)).json() as any;
    const html = await (await call("GET", f.invoiceUrl)).text();
    expect(html).not.toContain("DRAFT:");
    expect(html).toContain("1,271.19"); // 1500 / 1.18
  });
});

describe("test mode (local only)", () => {
  beforeEach(() => { env.RAZORPAY_KEY_ID = undefined; env.RAZORPAY_KEY_SECRET = undefined; env.TEST_MODE = "1"; });
  test("fulfils at once with no Razorpay, and says so", async () => {
    const r = await (await buy()).json() as any;
    expect(r.mode).toBe("test");
    expect(r.result.organizerKey).toMatch(/^ctk_/);
    expect(rz.orders).toHaveLength(0);
  });
  test("the write budget protects a fulfilment: a busy day says so and takes no half-step", async () => {
    env.DAILY_WRITE_BUDGET = "3";
    const r = await buy();
    expect(r.status).toBe(503);
    expect(raw.query("SELECT COUNT(*) c FROM entitlement").get()).toEqual({ c: 0 });
  });
});

describe("sign in by e-mailed code", () => {
  beforeEach(() => { env.RAZORPAY_KEY_ID = undefined; env.RAZORPAY_KEY_SECRET = undefined; env.TEST_MODE = "1"; });
  const ask = (email: string) => call("POST", "/api/auth/email", { email });
  const verify = (email: string, code: string) => call("POST", "/api/auth/verify", { email, code });
  const account = async () => { await buy({ email: "Owner@Corp.com" }); };
  test("an organizer who lost their key asks for a code, enters it, and gets a working fresh key; the old key still works", async () => {
    const first = (await (await buy({ email: "Owner@Corp.com" })).json() as any).result.organizerKey as string;
    const r = await (await ask("owner@corp.com")).json() as any;
    expect(r.devCode).toMatch(/^\d{6}$/);
    const t = await (await verify("OWNER@corp.com", r.devCode)).json() as any;
    expect(t.token).toMatch(/^ctk_/);
    expect(t.token).not.toBe(first);
    expect((await call("GET", "/api/history", undefined, { "x-organizer": t.token })).status).toBe(200);
    expect((await call("GET", "/api/history", undefined, { "x-organizer": first })).status).toBe(200);
    expect((raw.query("SELECT COUNT(*) c FROM outbox WHERE subject LIKE '%sign-in code%'").get() as any).c).toBe(1);
  });
  test("an unknown address gets exactly the same answer and no mail, so nobody can learn who has an account", async () => {
    const r = await (await ask("nobody@nowhere.com")).json() as any;
    expect(r).toEqual({ ok: true, devCode: undefined } as any);
    expect(raw.query("SELECT COUNT(*) c FROM outbox").get()).toEqual({ c: 0 });
    expect((await verify("nobody@nowhere.com", "123456")).status).toBe(400);
  });
  test("production never reveals the code in the response", async () => {
    await account(); env.TEST_MODE = undefined; env.RAZORPAY_KEY_ID = "k"; env.RAZORPAY_KEY_SECRET = "s";
    const r = await (await ask("owner@corp.com")).json() as any;
    expect(r.devCode).toBeUndefined();
    expect((raw.query("SELECT COUNT(*) c FROM outbox WHERE subject LIKE '%sign-in code%'").get() as any).c).toBe(1);
  });
  test("a wrong code is refused, five wrong guesses lock that code, and the right one then no longer works", async () => {
    await account();
    const code = ((await (await ask("owner@corp.com")).json()) as any).devCode as string;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await verify("owner@corp.com", wrong)).status).toBe(400);
    expect((await verify("owner@corp.com", code)).status).toBe(400);
    const again = ((await (await ask("owner@corp.com")).json()) as any).devCode as string; // a new code resets the guesses
    expect((await verify("owner@corp.com", again)).status).toBe(200);
  });
  test("a code works once and expires after 10 minutes", async () => {
    await account();
    const c1 = ((await (await ask("owner@corp.com")).json()) as any).devCode as string;
    expect((await call("POST", "/api/auth/verify", { email: "owner@corp.com", code: c1 }, {}, T + 11 * 60_000)).status).toBe(400);
    const c2 = ((await (await ask("owner@corp.com")).json()) as any).devCode as string;
    expect((await verify("owner@corp.com", c2)).status).toBe(200);
    expect((await verify("owner@corp.com", c2)).status).toBe(400);
  });
  test("at most five codes an hour per address", async () => {
    await account();
    for (let i = 0; i < 5; i++) expect((await ask("owner@corp.com")).status).toBe(200);
    expect((await ask("owner@corp.com")).status).toBe(429);
    expect((await call("POST", "/api/auth/email", { email: "owner@corp.com" }, {}, T + 3_600_001)).status).toBe(200);
  });
  test("bad e-mails and malformed codes are refused", async () => {
    expect((await ask("not-an-email")).status).toBe(400);
    expect((await verify("owner@corp.com", "12")).status).toBe(400);
    expect((await call("POST", "/api/auth/verify", "junk")).status).toBe(400);
  });
});

describe("e-mail through Resend (organizers only)", () => {
  let sent: any[]; let resendUp: boolean;
  beforeEach(() => {
    sent = []; resendUp = true;
    env.RAZORPAY_KEY_ID = undefined; env.RAZORPAY_KEY_SECRET = undefined; env.TEST_MODE = "1";
    env.RESEND_API_KEY = "re_test_dummy"; env.MAIL_REPLY_TO = "help@veridian-aios.com";
    const inner = (globalThis as any).fetch;
    (globalThis as any).fetch = async (url: string, init?: any) => {
      if (String(url) === "https://api.resend.com/emails") { if (!resendUp) return new Response("{}", { status: 500 }); sent.push({ auth: init.headers.authorization, ...JSON.parse(init.body) }); return new Response("{}", { status: 200 }); }
      return inner(url, init);
    };
  });
  test("the purchase mail goes from the Corporate Tambola sender on the shared verified domain, to the buyer only", async () => {
    const r = await (await buy({ email: "Boss@Acme.com" })).json() as any;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from: "Corporate Tambola <tambola@veridian-aios.com>", to: ["boss@acme.com"], reply_to: "help@veridian-aios.com", headers: { "Auto-Submitted": "auto-generated" } });
    expect(sent[0].auth).toBe("Bearer re_test_dummy");
    expect(sent[0].text).toContain(r.result.organizerKey);
    expect(sent[0].text).toContain("INVOICE");
  });
  test("after a successful send no mail body (and so no organizer key) is kept anywhere", async () => {
    const r = await (await buy()).json() as any;
    expect(raw.query("SELECT sent, body FROM outbox").get()).toEqual({ sent: 1, body: "" });
    expect(JSON.stringify(raw.query("SELECT * FROM outbox").all()).includes(r.result.organizerKey)).toBe(false);
  });
  test("if Resend is down the purchase still completes; the unsent mail is kept without the key and retried by the daily job", async () => {
    resendUp = false;
    const r = await (await buy()).json() as any;
    expect(r.result.organizerKey).toMatch(/^ctk_/); // the buyer still sees the key on screen
    const row = raw.query("SELECT sent, body FROM outbox").get() as any;
    expect(row.sent).toBe(0);
    expect(row.body.includes(r.result.organizerKey)).toBe(false);
    expect(row.body).toContain("INVOICE");
    resendUp = true;
    const { retryOutbox } = await import("../src/pay");
    expect(await retryOutbox(env, T + 3600_000)).toMatchObject({ retried: 1 });
    expect(raw.query("SELECT sent, body FROM outbox").get()).toEqual({ sent: 1, body: "" });
    expect(sent).toHaveLength(1);
  });
  test("mail older than 3 days is dropped whether sent or not", async () => {
    resendUp = false; await buy();
    const { retryOutbox } = await import("../src/pay");
    resendUp = false;
    const r = await retryOutbox(env, T + 4 * 86_400_000);
    expect(r.dropped).toBe(1);
    expect(raw.query("SELECT COUNT(*) c FROM outbox").get()).toEqual({ c: 0 });
  });
  test("sign-in codes are mailed to the organizer's address only, and the code is not kept afterwards", async () => {
    await buy({ email: "owner@corp.com" });
    sent.length = 0;
    const r = await (await call("POST", "/api/auth/email", { email: "owner@corp.com" })).json() as any;
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["owner@corp.com"]);
    expect(sent[0].text).toContain(r.devCode);
    expect(JSON.stringify(raw.query("SELECT * FROM outbox").all()).includes(r.devCode)).toBe(false);
    await call("POST", "/api/auth/email", { email: "stranger@nowhere.com" });
    expect(sent).toHaveLength(1); // nobody without an account is ever e-mailed
  });
  test("only organizers have an e-mail address on file: the store keeps none for participants", async () => {
    // participants join with a mobile number; the schema has no e-mail column on them
    const cols = raw.query("PRAGMA table_info(participant)").all().map((c: any) => c.name);
    expect(cols.some((c: string) => /mail/i.test(c))).toBe(false);
  });
});
