// Tambola pays ONLY through the console (owner order 27 Nov 2026, MONEY-LOGIC): the console asks `payable`, Moneypenny charges credits, the console says `paid`,
// this game unlocks the pack. With PAY_VIA_CONSOLE=1 the game's own pay / credit routes are shut and nothing is ever opened with Razorpay (not even as a fallback).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
// @ts-ignore the contract kit is plain JavaScript copied from the console repo
import { makeCtx, buildAssertion } from "./console-contract/kit.mjs";

const T = Date.UTC(2026, 9, 1, 10, 0, 0), GEN = 1692803367;
const roundOf = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("");
let env: Env, ctx: any, n = 0, raw: any;
const origin = "https://tambola.test";
const realFetch = globalThis.fetch;
let outbound: string[] = [];

async function boot(flag: "1" | undefined) {
  ctx = await makeCtx();
  const d = makeD1(); raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "10000000", PHONE_SALT: "salt", DATA_KEY: "k", PUBLIC_ORIGIN: origin, CONSOLE_ORIGIN: "https://console.test", CONSOLE_PUBKEYS: "k1:" + ctx.publicB64u, ...(flag ? { PAY_VIA_CONSOLE: flag } : {}) } as any;
  outbound = [];
  globalThis.fetch = (async (u: any, i?: any) => { outbound.push(String(u instanceof Request ? u.url : u)); return realFetch(u, i); }) as any;
}
afterEach(() => { globalThis.fetch = realFetch; });
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), env, T);
const j = async (r: Response) => (await r.json()) as any;
async function person(email: string) { const name = "p" + ++n; ctx.people[name] = { email, sub: await sha("email|" + email) }; return name; }
const asr = async (spec: any) => (await buildAssertion(ctx, spec, origin, T)).token;
const payable = async (who: string, eid: string) => call("POST", "/api/console/payable", { assertion: await asr({ act: "payable", person: who, eid }), eid });
const paid = async (who: string, eid: string, item: string, orderRef: string) => call("POST", "/api/console/paid", { assertion: await asr({ act: "paid", person: who, eid }), eid, item, orderRef });
async function organizer(email: string) {
  const s = await j(await call("POST", "/api/start", { email }, { "cf-connecting-ip": "10.1.0." + ++n }));
  return { key: s.token as string, who: await person(email) };
}
async function draft(key: string, id: string, cap = 50) {
  expect((await call("POST", "/api/z", { id, startRound: roundOf(T) + 1200, callSeconds: 12, cap }, { "x-organizer": key })).status).toBe(200);
  await call("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, { "x-organizer": key });
}
const rows = (sql: string, ...a: any[]) => raw.prepare(sql).all(...a);

describe("the console pay step in Tambola (new path)", () => {
  beforeEach(async () => { await boot("1"); });
  test("payable: the organizer's own game, its pack size, not yet paid; a stranger is not the owner", async () => {
    const a = await organizer("alice@acme.com"), b = await organizer("mallory@evil.com");
    await draft(a.key, "game0001");
    expect(await j(await payable(a.who, "game0001"))).toMatchObject({ ok: true, owner: true, item: "100", paid: false });
    expect(await j(await payable(b.who, "game0001"))).toMatchObject({ owner: false, item: null, paid: false });
  });
  test("paid: unlocks the pack once; the same order id again is a safe repeat (no second pack, no second row, no money in this game's books)", async () => {
    const a = await organizer("alice2@acme.com"); await draft(a.key, "game0002");
    const r1 = await paid(a.who, "game0002", "100", "GAME-tambola-game0002");
    expect(r1.status).toBe(200); expect(await j(r1)).toMatchObject({ ok: true, repeat: false });
    expect(await j(await paid(a.who, "game0002", "100", "GAME-tambola-game0002"))).toMatchObject({ ok: true, repeat: true });
    expect(rows("SELECT pack FROM engagement WHERE id='game0002'")[0].pack).toBe(100);
    expect(rows("SELECT id FROM payment WHERE id='GAME-tambola-game0002'").length).toBe(1);
    expect(rows("SELECT id FROM entitlement WHERE payment_id='GAME-tambola-game0002'").length).toBe(1);
    expect(rows("SELECT amount FROM payment WHERE id='GAME-tambola-game0002'")[0].amount).toBe(0);
    expect(await j(await payable(a.who, "game0002"))).toMatchObject({ owner: true, paid: true });
  });
  test("a retry after a lost answer (lease run out) with the same order id marks again without a second charge or pack", async () => {
    const a = await organizer("alice3@acme.com"); await draft(a.key, "game0003");
    expect((await paid(a.who, "game0003", "100", "GAME-tambola-game0003")).status).toBe(200);
    raw.prepare("UPDATE console_paid SET state='marking', at_ms=0 WHERE order_ref=?").run("GAME-tambola-game0003");
    expect((await paid(a.who, "game0003", "100", "GAME-tambola-game0003")).status).toBe(200);
    expect(rows("SELECT id FROM payment WHERE id='GAME-tambola-game0003'").length).toBe(1);
    expect(rows("SELECT id FROM entitlement WHERE payment_id='GAME-tambola-game0003'").length).toBe(1);
  });
  test("paid is refused (definite, nothing changed) for a stranger, a wrong size, a second payment, or a cancelled game", async () => {
    const a = await organizer("alice4@acme.com"), b = await organizer("mallory4@evil.com"); await draft(a.key, "game0004"); await draft(a.key, "game0005");
    expect(await j(await paid(b.who, "game0004", "100", "GAME-tambola-x1"))).toMatchObject({ error: "game_refused" });
    expect(await j(await paid(a.who, "game0004", "250", "GAME-tambola-x2"))).toMatchObject({ error: "game_refused" });
    expect(rows("SELECT pack FROM engagement WHERE id='game0004'")[0].pack).toBe(0);
    expect((await paid(a.who, "game0004", "100", "GAME-tambola-x3")).status).toBe(200);
    expect(await j(await paid(a.who, "game0004", "100", "GAME-tambola-x4"))).toMatchObject({ error: "game_refused" });
    raw.prepare("UPDATE engagement SET cancelled_ms=1 WHERE id='game0005'").run();
    expect(await j(await paid(a.who, "game0005", "100", "GAME-tambola-x5"))).toMatchObject({ error: "game_refused" });
  });
  test("the chain is down (no paid notice ever comes): the game stays unpaid and no call to Razorpay or the central order service is made", async () => {
    const a = await organizer("alice5@acme.com"); await draft(a.key, "game0006");
    const ck = await call("POST", "/api/checkout", { eid: "game0006", pack: 100, email: "alice5@acme.com" }, { "x-organizer": a.key });
    expect(ck.status).toBe(410);
    expect(outbound.filter((u) => /razorpay|api\/pay\/order/i.test(u))).toEqual([]);
    expect(rows("SELECT pack FROM engagement WHERE id='game0006'")[0].pack).toBe(0);
  });
  test("even if something reaches placeOrder with the flag on and keys present, it opens no order (F2)", async () => {
    (env as any).RAZORPAY_KEY_ID = "rzp_test_x"; (env as any).RAZORPAY_KEY_SECRET = "s"; (env as any).PAY_SERVICE_KEY = "";
    const a = await organizer("alice8@acme.com"); await draft(a.key, "game0008");
    for (const p of ["/api/checkout", "/api/payments/test"]) expect((await call("POST", p, { eid: "game0008", pack: 100 }, { "x-organizer": a.key })).status).toBe(410);
    expect(outbound.filter((u) => /razorpay/i.test(u))).toEqual([]);
  });
  test("the old pay, credit and proforma routes answer 410 with the console's address; Razorpay's webhook is not shut", async () => {
    const a = await organizer("alice6@acme.com");
    for (const [m, p] of [["POST", "/api/checkout"], ["POST", "/api/payments/test"], ["POST", "/api/payments/paytest"], ["POST", "/api/payments/verify"], ["POST", "/api/proforma"], ["GET", "/api/org/credit"], ["POST", "/api/z/game0007/pay-with-credit"], ["POST", "/api/z/game0007/paylink"], ["GET", "/api/paylink/" + "a".repeat(48)], ["POST", "/api/paylink/" + "a".repeat(48) + "/checkout"]] as const) {
      const r = await call(m, p, m === "POST" ? {} : undefined, { "x-organizer": a.key });
      expect([m, p, r.status]).toEqual([m, p, 410]);
      expect((await j(r)).console).toBe("https://console.test");
    }
    expect((await call("POST", "/api/payments/webhook", {}, {})).status).not.toBe(410);
  });
});

describe("assertion checks on both console pay routes", () => {
  beforeEach(async () => { await boot("1"); });
  test("a 'payable' assertion sent to /paid, a reused id, and a bad signature are all 401 on both routes", async () => {
    const a = await organizer("alice9@acme.com"); await draft(a.key, "game0009");
    const wrong = await asr({ act: "payable", person: a.who, eid: "game0009" });
    expect((await call("POST", "/api/console/paid", { assertion: wrong, eid: "game0009", item: "100", orderRef: "GAME-tambola-y1" })).status).toBe(401);
    expect((await call("POST", "/api/console/payable", { assertion: await asr({ act: "paid", person: a.who, eid: "game0009" }), eid: "game0009" })).status).toBe(401);
    const tok = await asr({ act: "paid", person: a.who, eid: "game0009" });
    const body = { assertion: tok, eid: "game0009", item: "100", orderRef: "GAME-tambola-y2" };
    expect((await call("POST", "/api/console/paid", body)).status).toBe(200);
    expect((await call("POST", "/api/console/paid", body)).status).toBe(401); // same jti twice
    const ptok = await asr({ act: "payable", person: a.who, eid: "game0009" });
    expect((await call("POST", "/api/console/payable", { assertion: ptok, eid: "game0009" })).status).toBe(200);
    expect((await call("POST", "/api/console/payable", { assertion: ptok, eid: "game0009" })).status).toBe(401);
    const forged = (await buildAssertion(ctx, { act: "paid", person: a.who, eid: "game0009", mutate: { forge: true } }, origin, T)).token;
    expect((await call("POST", "/api/console/paid", { assertion: forged, eid: "game0009", item: "100", orderRef: "GAME-tambola-y3" })).status).toBe(401);
    const forgedP = (await buildAssertion(ctx, { act: "payable", person: a.who, eid: "game0009", mutate: { forge: true } }, origin, T)).token;
    expect((await call("POST", "/api/console/payable", { assertion: forgedP, eid: "game0009" })).status).toBe(401);
  });
});

describe("rollback: with the flag off the old path is not shut", () => {
  beforeEach(async () => { await boot(undefined); });
  test("the old routes do not answer 410", async () => {
    const a = await organizer("alice7@acme.com");
    for (const p of ["/api/checkout", "/api/proforma"]) expect((await call("POST", p, {}, { "x-organizer": a.key })).status).not.toBe(410);
    expect((await call("GET", "/api/org/credit", undefined, { "x-organizer": a.key })).status).not.toBe(410);
  });
});
