// Owner order 1 Nov 2026: (1) the free demo game (up to 10 people, no payment) is limited to 3 per organizer and 3 per network address per day, and can be switched off with DEMO_GAME=0;
// (2) the Rs 1 payment test is for the owner only, and its row carries the ledger fields (product_type payment_test, txn_id TAM-...).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import type { PayEnv } from "../src/pay";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0), DAY = 86_400_000;
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T + 3 * 3_600_000);
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"]; let orders: any[]; let n = 0;
const realFetch = globalThis.fetch;
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env as Env, now);
const j = async (r: Response) => (await r.json()) as any;
const one = (sql: string, ...a: any[]) => raw.prepare(sql).get(...a) as any;
const account = async (ip: string) => { const r = await j(await call("POST", "/api/start", { email: `d${++n}@acme.com` }, { "cf-connecting-ip": ip })); return r.token as string; };
const demo = (key: string, id: string, ip: string, now = T) => call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 10, demo: true, name: "Demo night" }, { "x-organizer": key, "cf-connecting-ip": ip }, now);

beforeEach(() => {
  const d = makeD1(); raw = d.raw; orders = [];
  (globalThis as any).fetch = async (url: string, init?: any) => {
    if (String(url).startsWith("https://rzp.test/v1/orders")) { const b = JSON.parse(init.body); const o = { id: "order_" + (orders.length + 1), amount: b.amount, currency: b.currency, receipt: b.receipt, status: "created", notes: b.notes }; orders.push(o); return new Response(JSON.stringify(o)); }
    return realFetch(url, init);
  };
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "sek", RAZORPAY_WEBHOOK_SECRET: "whsec", RAZORPAY_BASE_URL: "https://rzp.test/v1", OWNER_EMAIL: "owner@platform.test", JOIN_PER_IP_DAY: "1000000" } as any;
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("demo game limits", () => {
  test("3 a day per organizer, the 4th is refused calmly; another day starts again", async () => {
    const k = await account("1.1.1.1");
    for (const i of [1, 2, 3]) expect((await demo(k, `DEMO-A${i}`, `5.5.5.${i}`)).status).toBe(200);
    const r = await demo(k, "DEMO-A4", "5.5.5.9"); expect(r.status).toBe(429);
    expect((await j(r)).error).toBe("You can make 3 free demo games a day. Please try again tomorrow, or make a real game.");
    expect((await demo(k, "DEMO-A5", "5.5.5.9", T + DAY)).status).toBe(200);
  });
  test("3 a day per network address, however many organizers", async () => {
    for (const i of [1, 2, 3]) expect((await demo(await account(`2.2.2.${i}`), `DEMO-B${i}`, "7.7.7.7")).status).toBe(200);
    expect((await demo(await account("2.2.2.9"), "DEMO-B4", "7.7.7.7")).status).toBe(429);
    expect((await demo(await account("2.2.2.10"), "DEMO-B5", "7.7.7.8")).status).toBe(200); // another address is untouched
  });
  test("a demo uses no pack and makes no payment, entitlement or invoice row", async () => {
    const k = await account("3.3.3.3");
    expect((await demo(k, "DEMO-C1", "6.6.6.6")).status).toBe(200);
    expect((await call("POST", "/api/z/DEMO-C1/publish", { email: "boss@acme.com", phone: "9876543210" }, { "x-organizer": k })).status).toBe(200);
    for (const t of ["payment", "entitlement", "invoice"]) expect(one(`SELECT COUNT(*) c FROM ${t}`).c).toBe(0);
  });
  test("a demo is never above 10 people", async () => {
    const k = await account("4.4.4.4");
    const r = await call("POST", "/api/z", { id: "DEMO-D1", startRound: START, callSeconds: 9, cap: 11, demo: true }, { "x-organizer": k }); expect(r.status).toBe(400);
  });
  test("DEMO_GAME=0 switches demo games off", async () => {
    const k = await account("8.8.1.1"); (env as any).DEMO_GAME = "0";
    const r = await demo(k, "DEMO-E1", "9.9.1.1"); expect(r.status).toBe(403); expect((await j(r)).code).toBe("demo-off");
    expect(one("SELECT COUNT(*) c FROM engagement WHERE id='DEMO-E1'").c).toBe(0);
  });
});

describe("Rs 1 payment test is owner-only", () => {
  const body = { email: "owner@x.com", name: "Owner Person", country: "IN" };
  test("no key and a wrong key are refused before any order is made", async () => {
    expect((await call("POST", "/api/payments/paytest", body)).status).toBe(403);
    expect((await call("POST", "/api/payments/paytest", body, { "x-organizer": "nope" })).status).toBe(403);
    const k = await account("1.2.3.4"); // an ordinary organizer key is not the owner key
    expect((await call("POST", "/api/payments/paytest", body, { "x-organizer": k })).status).toBe(403);
    expect(orders).toHaveLength(0); expect(one("SELECT COUNT(*) c FROM payment").c).toBe(0);
  });
  test("the owner key opens a Rs 1 order that is in the game's ledger as payment_test with a TAM- transaction id", async () => {
    const r = await call("POST", "/api/payments/paytest", body, { "x-organizer": "plat" }); expect(r.status).toBe(200);
    const b = await j(r); expect(b.razorpay.amount).toBe(100);
    const row = one("SELECT amount, product_type, txn_id, is_test FROM payment WHERE id=?", b.paymentId);
    expect(row).toMatchObject({ amount: 1, product_type: "payment_test", txn_id: `TAM-${b.paymentId}` });
    expect(orders[0].notes.payment_ref).toBe(b.paymentId);
  });
});
