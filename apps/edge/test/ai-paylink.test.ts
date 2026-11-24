import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { lifecycleTick } from "../src/lifecycle";
import { applyCreditToGame, creditExpiryMs, creditLastDay, creditTick } from "../src/credit";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";

// (header of the credit test, reused harness)
// Spec 6 (docs/ROLES_AND_CONSOLE_SPEC_6.md): NO REFUNDS. A cancelled paid game becomes credit for the account for 365 days; credit pays for a next game (in full, in part with a top-up, or leaving a remainder),
// oldest-expiring first, atomically and once; it lapses at the end of day 365 (India time); the five e-mails go to the Organizer and Hosts only, once each.
const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const H = 3_600_000, DAY = 24 * H;
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"];
const realFetch = globalThis.fetch;
let orders: any[]; let payments: Record<string, any>; let razorpayCalls: number; let refundCalls: number;
const call = (method: string, path: string, body?: unknown, key?: string, now = T, ip?: string) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}), ...(ip ? { "cf-connecting-ip": ip } : {}) }, body: withDevice(method, path, body) }), env as Env, now);
const j = async (r: Response) => (await r.json()) as any;
const mailsTo = (to: string) => raw.prepare("SELECT subject, body FROM outbox WHERE to_addr=? ORDER BY id").all(to) as { subject: string; body: string }[];
const mailsLike = (to: string, re: RegExp) => mailsTo(to).filter((m) => re.test(m.subject));
const ever = new Map<number, { id: number; to_addr: string; subject: string; body: string }>();
/** Like mailsLike, but also counts mails the 3-day mail-log clean-up of the tick has since forgotten (each one is seen at least once: the test looks after every step). */
const mailsEver = (to: string, re: RegExp) => { for (const m of raw.prepare("SELECT id, to_addr, subject, body FROM outbox WHERE to_addr=?").all(to) as any[]) ever.set(m.id, m); return [...ever.values()].filter((m) => m.to_addr === to && re.test(m.subject)).sort((x, y) => x.id - y.id); };

beforeEach(() => {
  const d = makeD1(); raw = d.raw; orders = []; payments = {}; razorpayCalls = 0; refundCalls = 0;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    const u = String(url);
    if (!u.startsWith("https://rzp.test")) return realFetch(url, init);
    razorpayCalls++;
    if (/\/refund$/.test(u)) { refundCalls++; return new Response("{}", { status: 404 }); }
    if (u.startsWith("https://rzp.test/v1/orders")) { const b = JSON.parse(init.body); const o = { id: "order_" + (orders.length + 1), amount: b.amount, currency: b.currency, receipt: b.receipt, status: "created" }; orders.push(o); return new Response(JSON.stringify(o)); }
    const pm = u.match(/\/payments\/([^/]+)(\/capture)?$/);
    if (pm) { const p = payments[pm[1]!]; if (pm[2]) p.status = "captured"; return new Response(JSON.stringify(p)); }
    return new Response("{}", { status: 404 });
  };
  env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "sek", RAZORPAY_WEBHOOK_SECRET: "whsec", RAZORPAY_BASE_URL: "https://rzp.test/v1", PUBLIC_ORIGIN: "https://tambola.test", OWNER_EMAIL: "owner@platform.test" };
});
afterEach(() => { globalThis.fetch = realFetch; });

let ip = 0, lastAi = "";
const start = async (email: string) => { const r = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `9.9.9.${++ip}` }, body: JSON.stringify({ email }) }), env as Env, T)); lastAi = r.aiKey as string; return r.token as string; };
/** Organizer + a Host (own e-mail) + a Co-host for game GAME-1 (300 places = the 500 pack, Rs 4,999, no GST), starting 3 hours after T. */
const team = async () => {
  const master = await start("boss@acme.com"); const ai = lastAi;
  await game(master, "GAME-1", 300, T + 3 * H);
  const hostR = await j(await call("POST", "/api/org/host", { mobile: "9876500009", label: "Priya", email: "priya@acme.com" }, master));
  const cohostR = await j(await call("POST", "/api/org/cohost", { label: "Ravi", phone: "98765 00001", e: "GAME-1" }, master));
  return { master, ai, host: hostR.hostKey as string, cohost: cohostR.cohostKey as string };
};
const game = async (key: string, id: string, cap: number, startMs: number, now = T) => (await call("POST", "/api/z", { id, startRound: roundAt(startMs), callSeconds: 9, cap }, key, now)).status;
const pay = (key: string, eid: string, now = T) => call("POST", "/api/checkout", { eid, org: "Acme Ltd", name: "Boss", email: "payer@acme.com", country: "IN", taxId: "", currency: "INR" }, key, now);
const sign = (c: any, id: string) => createHmac("sha256", "sek").update(`${c.razorpay.orderId}|${id}`).digest("hex");
const complete = async (c: any, id = "pay_" + (Object.keys(payments).length + 1), now = T, status = "captured") => {
  payments[id] = { id, order_id: c.razorpay.orderId, status, amount: orders.find((o) => o.id === c.razorpay.orderId)!.amount };
  return call("POST", "/api/payments/verify", { paymentId: c.paymentId, razorpay_order_id: c.razorpay.orderId, razorpay_payment_id: id, razorpay_signature: sign(c, id) }, undefined, now);
};
const paidWithMoney = async (key: string, eid: string, now = T) => { const c = await j(await pay(key, eid, now));  const r = await j(await complete(c, undefined, now)); expect(r.published).toBe(true); return c; };
const cancelIt = (key: string, eid: string, now = T) => call("POST", `/api/z/${eid}/cancel`, { confirmations: 3 }, key, now);
const withCredit = (key: string | undefined, eid: string, now = T, body: unknown = {}) => call("POST", `/api/z/${eid}/pay-with-credit`, body, key, now);
const credits = async (key: string, now = T) => j(await call("GET", "/api/org/credit", undefined, key, now));
const paidOf = (cap: number) => ({ 100: 2999, 250: 3799, 300: 4999, 750: 6299 } as Record<number, number>)[cap]!;


// 20 Nov 2026 (owner): the Organizer's limited AI key (cta_) may MAKE the pay link (POST /api/z/{id}/paylink). It pays nothing: a person opens the link and pays. Every other AI limit stays.
const tokenOf = (url: string) => url.split("t=")[1]!;
describe("the limited AI key (cta_) makes the pay link and nothing more", () => {
  test("it makes a link for a draft game; a person opens it and sees the price; the call is in the AI audit trail", async () => {
    const t = await team();
    const r = await call("POST", "/api/z/GAME-1/paylink", {}, t.ai);
    expect(r.status).toBe(200);
    const link = await j(r); expect(link.url).toContain("/paylink.html?t="); expect(link.expiresMs).toBeGreaterThan(T);
    const view = await j(await call("GET", `/api/paylink/${tokenOf(link.url)}`)); expect(view.price.total).toBe(paidOf(300));
    const made = raw.prepare("SELECT created_by FROM paylink WHERE eid='GAME-1' AND revoked=0").get() as { created_by: string };
    expect(made.created_by).toBe("ai");
    const trail = (await j(await call("GET", "/api/org/ai/audit", undefined, t.master))).trail as any[];
    const row = trail.find((x) => x.method === "POST" && /\/api\/z\/GAME-1\/paylink$/.test(x.path));
    expect(row).toBeTruthy(); expect(row.status).toBe(200);
  });
  test("a second link cancels the first; a paid or cancelled game gets no link; a game of another account is not found", async () => {
    const t = await team();
    const one = await j(await call("POST", "/api/z/GAME-1/paylink", {}, t.ai)), two = await j(await call("POST", "/api/z/GAME-1/paylink", {}, t.ai));
    expect((await j(await call("GET", `/api/paylink/${tokenOf(one.url)}`))).status).not.toBe("open");
    expect((await j(await call("GET", `/api/paylink/${tokenOf(two.url)}`))).status).toBe("open");
    const other = await start("other@acme.com"); const otherAi = lastAi; await game(other, "GAME-9", 100, T + 3 * H);
    expect((await call("POST", "/api/z/GAME-9/paylink", {}, t.ai)).status).toBe(404); // not this account's game
    expect((await call("POST", "/api/z/GAME-9/paylink", {}, otherAi)).status).toBe(200);
    await paidWithMoney(t.master, "GAME-1");
    const paid = await call("POST", "/api/z/GAME-1/paylink", {}, t.ai); expect(paid.status).toBe(409); expect((await j(paid)).code).toBe("already-paid");
  });
  test("every other limit of the AI key stays: it cannot pay, use credit, add a Host or a Co-host", async () => {
    const t = await team();
    expect((await pay(t.ai, "GAME-1")).status).toBe(403); // pay
    expect((await call("POST", "/api/org/host", { mobile: "9876500010", label: "X", email: "x@acme.com" }, t.ai)).status).toBe(403); // team
    expect((await call("POST", "/api/org/cohost", { label: "Z", phone: "98765 00002", e: "GAME-1" }, t.ai)).status).toBe(403); // keys for others
    expect((await withCredit(t.ai, "GAME-1")).status).toBe(403); // credit
    expect((await call("POST", "/api/z/GAME-1/paylink", {}, undefined)).status).not.toBe(200); // nobody
    expect((await call("POST", "/api/z/GAME-1/paylink", {}, "cta_" + "0".repeat(48))).status).not.toBe(200); // a wrong key
    expect(raw.prepare("SELECT COUNT(*) AS c FROM paylink").get()).toEqual({ c: 0 }); // none of those made a link
  });
  test("the organizer's own key, a Host and a Co-host still make the link; the AI manifest says the AI can make it", async () => {
    const t = await team();
    for (const key of [t.master, t.host, t.cohost]) expect((await call("POST", "/api/z/GAME-1/paylink", {}, key)).status).toBe(200);
    const man = JSON.stringify(await j(await call("GET", "/api/z/ai-manifest", undefined, t.ai)));
    expect(man).toContain("POST /api/z/{id}/paylink"); expect(man).not.toContain("answers 403 to an AI key");
  });
  test("the public trust page, the AI facts and the AI function list say what the code does (the AI may make the link, never pays)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(import.meta.dir, "..", "..", "..");
    const trust = readFileSync(join(root, "apps/web/public/trust.html"), "utf8"), facts = readFileSync(join(root, "apps/edge/src/ai-facts.ts"), "utf8"), fns = readFileSync(join(root, "apps/edge/src/ai-functions.ts"), "utf8");
    for (const text of [trust, facts]) { expect(text).not.toContain("cannot pay, make a pay link"); expect(text).toContain("message guests, make a pay link and read results"); expect(text).toContain("cannot pay, publish,"); }
    expect(fns).not.toContain("cannot make a pay link anyone can open");
    expect(fns).not.toContain("paylink answers 403)");
  });
});
