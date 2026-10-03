import { beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { handle } from "../src/worker";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const plat = { "x-organizer": "plat" };
const enroll = async (phone = "98111 22233", name = "Asha") => (await (await call("POST", "/api/partner/enroll", { phone, name, consent: true })).json()) as any;
const buy = (o: Record<string, unknown> = {}) => call("POST", "/api/checkout", { org: "Acme Ltd", email: `b${Math.random().toString(36).slice(2, 7)}@acme.com`, country: "IN", taxId: "", pack: 500, currency: "INR", ...o });

beforeEach(() => {
  const d = makeD1(); raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000", TEST_MODE: "1", PUBLIC_ORIGIN: "https://tambola.test" };
});

describe("enrolling as a sales partner", () => {
  test("the reference code is the mobile number, however it is typed, and the link carries it", async () => {
    const a = await enroll("+91 98111-22233");
    expect(a.code).toBe("9811122233");
    expect(a.link).toBe("https://tambola.test/?ref=9811122233");
    expect(a.partnerKey).toMatch(/^ctp_[0-9a-f]{40}$/);
  });
  test("agreeing is required, and a bad number is refused", async () => {
    expect((await call("POST", "/api/partner/enroll", { phone: "98111 22233" })).status).toBe(400);
    expect((await call("POST", "/api/partner/enroll", { phone: "98111 22233", consent: "yes" })).status).toBe(400);
    expect((await call("POST", "/api/partner/enroll", { phone: "123", consent: true })).status).toBe(400);
    expect((await call("POST", "/api/partner/enroll", "junk")).status).toBe(400);
    expect(raw.query("SELECT COUNT(*) c FROM partner").get()).toEqual({ c: 0 });
  });
  test("enrolling twice never issues a second key or changes anything; the answer says to sign in", async () => {
    const first = await enroll();
    const again = await enroll("9811122233", "Someone Else");
    expect(again.existed).toBe(true);
    expect(again.partnerKey).toBeUndefined();
    expect(again.code).toBe(first.code);
    expect(raw.query("SELECT name FROM partner").get()).toEqual({ name: "Asha" });
  });
  test("the key is stored only as a hash, names are cleaned, and the source is kept", async () => {
    const a = await call("POST", "/api/partner/enroll", { phone: "9811122234", name: "<b>Rita</b>", consent: true, source: "ticket" });
    const k = ((await a.json()) as any).partnerKey as string;
    expect(JSON.stringify(raw.query("SELECT * FROM partner").all()).includes(k)).toBe(false);
    expect(raw.query("SELECT name, source FROM partner").get()).toEqual({ name: "bRita/b", source: "ticket" });
  });
  test("a busy day says so and enrols nobody half-way", async () => {
    env.DAILY_WRITE_BUDGET = "1";
    expect((await call("POST", "/api/partner/enroll", { phone: "9811122235", consent: true })).status).toBe(503);
    expect(raw.query("SELECT COUNT(*) c FROM partner").get()).toEqual({ c: 0 });
  });
  test("the link check says only whether a code is a real, active partner", async () => {
    await enroll();
    expect(await (await call("GET", "/api/partner/check?code=9811122233")).json()).toEqual({ valid: true });
    expect(await (await call("GET", "/api/partner/check?code=9000000000")).json()).toEqual({ valid: false });
    expect(await (await call("GET", "/api/partner/check?code=abc")).json()).toEqual({ valid: false });
    await call("POST", "/api/partners/state", { code: "9811122233", state: "blocked" }, plat);
    expect(await (await call("GET", "/api/partner/check?code=9811122233")).json()).toEqual({ valid: false });
  });
});

describe("a referred purchase", () => {
  let key = "";
  beforeEach(async () => { key = (await enroll()).partnerKey; });
  test("a paid purchase through the link is attributed; the partner earns 50% of the taxable value (never of the GST)", async () => {
    const r = await (await buy({ ref: "9811122233" })).json() as any;
    expect(r.result.ok).toBe(true);
    const c = raw.query("SELECT partner_code, base, currency, rate, amount, status FROM commission").get() as any;
    expect(c).toMatchObject({ partner_code: "9811122233", currency: "INR", rate: 0.5, amount: 1999.5, status: "accrued" });
    expect(c.base).toBe(3999); // 500 participants = Rs 3,999 software price before GST; commission is never paid on GST
  });
  test("no purchase, no commission: an unpaid or unknown-code or no-code order writes nothing", async () => {
    await buy({ ref: "9000000000" }); await buy({});
    expect(raw.query("SELECT COUNT(*) c FROM commission").get()).toEqual({ c: 0 });
    env.RAZORPAY_KEY_ID = "k"; env.RAZORPAY_KEY_SECRET = "s"; env.RAZORPAY_BASE_URL = "https://rzp.test/v1";
    const realFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => new Response(JSON.stringify({ id: "order_1", amount: 150000, currency: "INR" }), { status: 200 });
    try { const r = await (await buy({ ref: "9811122233" })).json() as any; expect(r.mode).toBe("razorpay"); } finally { globalThis.fetch = realFetch; }
    expect(raw.query("SELECT COUNT(*) c FROM commission").get()).toEqual({ c: 0 }); // created, not paid
    expect(raw.query("SELECT ref FROM payment WHERE status='created'").get()).toEqual({ ref: "9811122233" });
  });
  test("a stopped partner earns nothing from new sales", async () => {
    await call("POST", "/api/partners/state", { code: "9811122233", state: "blocked" }, plat);
    await buy({ ref: "9811122233" });
    expect(raw.query("SELECT COUNT(*) c FROM commission").get()).toEqual({ c: 0 });
  });
  test("buying through your own link is blocked with a reason, however the number is typed", async () => {
    await buy({ ref: "9811122233", phone: "+91 98111 22233" });
    expect(raw.query("SELECT status, reason FROM commission").get()).toEqual({ status: "blocked", reason: "self_referral" });
  });
  test("a customer's first purchase earns the partner half of the software price: 100 = Rs 1,999, 250 = Rs 2,999, 500 = Rs 3,999", async () => {
    let n = 0;
    for (const [pack, base, earn] of [[100, 1999, 999.5], [250, 2999, 1499.5], [500, 3999, 1999.5]] as const) {
      await buy({ ref: "9811122233", pack, email: `new${++n}@buyer.example` });
      const c = raw.query("SELECT base, rate, amount, status FROM commission ORDER BY id DESC LIMIT 1").get() as any;
      expect(c).toEqual({ base, rate: 0.5, amount: earn, status: "accrued" });
    }
  });
  test("the same customer buying again within 12 months earns the partner who first brought them 20%, even when they come back without the link", async () => {
    await buy({ ref: "9811122233", pack: 500, email: "loyal@buyer.example" });
    await buy({ pack: 250, email: "Loyal@Buyer.example" }); // no link this time, same customer
    const rows = raw.query("SELECT base, rate, amount, partner_code FROM commission ORDER BY id").all() as any[];
    expect(rows).toEqual([{ base: 3999, rate: 0.5, amount: 1999.5, partner_code: "9811122233" }, { base: 2999, rate: 0.2, amount: 599.8, partner_code: "9811122233" }]);
  });
  test("after 12 months a returning customer is new again (50%), and a customer who first bought with no partner never earns a later link-user more than the repeat rate", async () => {
    await buy({ pack: 100, email: "plain@buyer.example" }); // no partner at all
    await buy({ ref: "9811122233", pack: 100, email: "plain@buyer.example" }); // a link used for a customer who already bought: repeat rate
    expect(raw.query("SELECT rate, amount FROM commission").get()).toEqual({ rate: 0.2, amount: 399.8 });
    raw.run("UPDATE payment SET paid_ms = paid_ms - ?", [400 * 86_400_000]); // a year and more later
    await buy({ ref: "9811122233", pack: 100, email: "plain@buyer.example" });
    expect(raw.query("SELECT rate FROM commission ORDER BY id DESC LIMIT 1").get()).toEqual({ rate: 0.5 });
  });
  test("a rate set later by us still works for any sale that was waiting (old rows), exactly once", async () => {
    raw.run("INSERT INTO commission(payment_id,partner_code,base,currency,rate,amount,status,created_ms) VALUES('old-1','9811122233',1000,'INR',NULL,NULL,'pending_rate',1)");
    expect((await call("POST", "/api/partners/commission/rate", { rate: 0.1 }, plat)).status).toBe(200);
    expect((await call("POST", "/api/partners/commission/rate", { rate: 0.2 }, plat)).status).toBe(200); // nothing left to change
    expect(raw.query("SELECT base, rate, amount, status FROM commission").get()).toEqual({ base: 1000, rate: 0.1, amount: 100, status: "accrued" });
  });
  test("a lower rate can be set by the owner; absurd rates (above 50%) are refused", async () => {
    env.PARTNER_COMMISSION_RATE = "0.15";
    await buy({ ref: "9811122233" });
    expect(raw.query("SELECT rate, amount, status FROM commission").get()).toEqual({ rate: 0.15, amount: 599.85, status: "accrued" });
    for (const rate of [-0.1, 0.51, "x", null]) expect((await call("POST", "/api/partners/commission/rate", { rate }, plat)).status).toBe(400);
  });
  test("a refunded purchase can be voided, but a paid-out one cannot", async () => {
    env.PARTNER_COMMISSION_RATE = "0.1";
    const a = await (await buy({ ref: "9811122233" })).json() as any;
    const b = await (await buy({ ref: "9811122233" })).json() as any;
    await call("POST", "/api/partners/payout", { code: "9811122233", reference: "UTR12345" }, plat);
    const r1 = await (await call("POST", "/api/partners/commission/void", { paymentId: a.paymentId }, plat)).json() as any;
    expect(r1.voided).toBe(0);
    env.PARTNER_COMMISSION_RATE = "0.1";
    const c = await (await buy({ ref: "9811122233" })).json() as any;
    expect(((await (await call("POST", "/api/partners/commission/void", { paymentId: c.paymentId, reason: "refund" }, plat)).json()) as any).voided).toBe(1);
    expect(b.result.ok).toBe(true);
  });
  test("only we can set rates, record payouts, void sales, stop partners or list everyone", async () => {
    for (const [m, p, b] of [["POST", "/api/partners/commission/rate", { rate: 0.1 }], ["POST", "/api/partners/payout", { code: "9811122233", reference: "x1234" }], ["POST", "/api/partners/commission/void", { paymentId: "p" }], ["POST", "/api/partners/state", { code: "9811122233", state: "blocked" }], ["GET", "/api/partners", undefined]] as const) {
      expect((await call(m, p, b)).status).toBe(403);
      expect((await call(m, p, b, { "x-partner": key })).status).toBe(403); // a partner cannot award themselves anything
    }
  });
});

describe("what a partner can see", () => {
  test("their own sales and totals, never who bought; and nobody else's", async () => {
    const a = await enroll("9811122233"); const b = await enroll("9822233344", "Bilal");
    env.PARTNER_COMMISSION_RATE = "0.1";
    await buy({ ref: "9811122233", org: "Secret Buyer Pvt Ltd", email: "private@buyer.com" });
    await buy({ ref: "9811122233", pack: 1000 });
    await buy({ ref: "9822233344" });
    const me = await (await call("GET", "/api/partner/me", undefined, { "x-partner": a.partnerKey })).json() as any;
    expect(me.code).toBe("9811122233");
    expect(me.totals.sales).toBe(2);
    expect(me.totals.accruedInr).toBeCloseTo(399.9 + 599.9, 1);
    expect(me.rateAnnounced).toBe(true);
    const txt = JSON.stringify(me);
    expect(/Secret Buyer|private@buyer|@/.test(txt.replace(/"link":"[^"]*"/, ""))).toBe(false);
    const mine = await (await call("GET", "/api/partner/me", undefined, { "x-partner": b.partnerKey })).json() as any;
    expect(mine.totals.sales).toBe(1);
  });
  test("the partner sees the 50% earned on each sale, never who bought", async () => {
    const a = await enroll();
    await buy({ ref: "9811122233" });
    const me = await (await call("GET", "/api/partner/me", undefined, { "x-partner": a.partnerKey })).json() as any;
    expect(me.totals).toMatchObject({ sales: 1, accruedInr: 1999.5, waitingForRate: 0 });
    expect(me.rateAnnounced).toBe(true); expect(me.rate).toBe(0.5); expect(me.repeatRate).toBe(0.2);
    expect(me.sales[0].amount).toBe(1999.5); expect(JSON.stringify(me.sales)).not.toMatch(/boss|acme|@/i);
  });
  test("a wrong or missing key sees nothing", async () => {
    await enroll();
    expect((await call("GET", "/api/partner/me")).status).toBe(403);
    expect((await call("GET", "/api/partner/me", undefined, { "x-partner": "ctp_nope" })).status).toBe(403);
    expect((await call("GET", "/api/partner/me", undefined, { "x-organizer": "plat" })).status).toBe(403);
  });
  test("a payout records once and the partner then sees it as paid", async () => {
    const a = await enroll(); env.PARTNER_COMMISSION_RATE = "0.1";
    await buy({ ref: "9811122233" });
    expect((await call("POST", "/api/partners/payout", { code: "9811122233", reference: "UTR998877" }, plat)).status).toBe(200);
    expect(((await (await call("POST", "/api/partners/payout", { code: "9811122233", reference: "UTR998877" }, plat)).json()) as any).paidRows).toBe(0);
    const me = await (await call("GET", "/api/partner/me", undefined, { "x-partner": a.partnerKey })).json() as any;
    expect(me.totals.accruedInr).toBe(0);
    expect(me.totals.paidInr).toBeGreaterThan(100);
  });
  test("we can see all partners with their counts and what is owed", async () => {
    await enroll(); env.PARTNER_COMMISSION_RATE = "0.1"; await buy({ ref: "9811122233" });
    const l = await (await call("GET", "/api/partners", undefined, plat)).json() as any;
    expect(l.partners[0]).toMatchObject({ code: "9811122233", sales: 1, state: "active" });
    expect(l.partners[0].accrued).toBeGreaterThan(100);
  });
});
