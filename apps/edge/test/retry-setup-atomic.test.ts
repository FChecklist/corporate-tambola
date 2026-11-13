// 13 Nov 2026, independent audit of PR 11 (AUDIT: FAIL) found three ways the set-up retry could do harm. Each test below injects the fault AFTER or BETWEEN the writes (not only before) and would fail on the code the audit read.
//  1. create: the game and the link to its pack were two writes; a hiccup between them left the pack unlinked and the repeat answered "existed" (the console then makes a second game).
//  2. publish: the K1 consent record was written after the publish step; a hiccup in between and the repeat (already-published branch) never wrote it.
//  3. publish: with a real mail key the mail is sent first and logged after; a hiccup at the log row made the repeat send it again.
// Also: only D1's "overloaded" (proves nothing was written) is repeated for the set-up steps; a repeated sign-in does not count the same 6-digit try twice.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { W, call, create, j, one, organizer, publish, q, reset, restore, uid } from "./param-harness";
import { setupRetry } from "../src/worker";

const OVERLOAD = "D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window";
/** The test database where `fail(sql)` runs before every statement (alone or inside a batch); a batch is a real all-or-nothing transaction: a throw inside it rolls everything back, like D1. */
const flakyTx = (fail: (sql: string) => void) => {
  const real = W.env.DB as any; const raw = W.raw as any;
  const stmt = (sql: string, vals: any[] = []): any => ({
    __sql: sql, __vals: vals,
    bind: (...v: any[]) => stmt(sql, v),
    run: async () => { fail(sql); return real.prepare(sql).bind(...vals).run(); },
    first: async () => { fail(sql); return real.prepare(sql).bind(...vals).first(); },
    all: async () => { fail(sql); return real.prepare(sql).bind(...vals).all(); },
  });
  (W.env as any).DB = {
    prepare: (sql: string) => stmt(sql),
    batch: async (xs: any[]) => {
      raw.run("BEGIN");
      try { const out = []; for (const x of xs) { fail(x.__sql); out.push(await real.prepare(x.__sql).bind(...x.__vals).run()); } raw.run("COMMIT"); return out; }
      catch (e) { raw.run("ROLLBACK"); throw e; }
    },
  };
};
const orgOf = () => one("SELECT org FROM organizer_email LIMIT 1").org as string;
const oldScale = setupRetry.scale, oldSleep = setupRetry.sleep, realFetch = globalThis.fetch;
let sleeps = 0;
beforeEach(() => { reset(); setupRetry.scale = 0; sleeps = 0; setupRetry.sleep = async () => { sleeps++; }; });
afterEach(() => { restore(); setupRetry.scale = oldScale; setupRetry.sleep = oldSleep; globalThis.fetch = realFetch; });

describe("create: the game and its pack link are one step", () => {
  test("a hiccup at the pack link: nothing half-written, the repeat creates the game WITH its pack (not 'existed')", async () => {
    const o = await organizer(); const org = orgOf(); const id = uid("CA");
    q("INSERT INTO entitlement(id,org,pack,payment_id,eid,created_ms) VALUES('ent_a',?,100,'pay_a',NULL,1)", org);
    let n = 1; flakyTx((sql) => { if (n > 0 && sql.startsWith("UPDATE entitlement SET eid")) { n--; throw new Error(OVERLOAD); } });
    const r = await create(o.key, id); const b = await j(r);
    expect(r.status).toBe(200); expect(n).toBe(0); expect(sleeps).toBe(1);
    expect(b.existed).toBeUndefined(); expect(b.draft).toBe(false);
    expect(one("SELECT COUNT(*) c FROM engagement WHERE id=?", id).c).toBe(1);
    expect(one("SELECT eid FROM entitlement WHERE id='ent_a'").eid).toBe(id);
    expect(one("SELECT pack FROM engagement WHERE id=?", id).pack).toBe(100);
  });
  test("a lost connection (may mean 'written, reply lost') is NOT repeated for create: a gentle busy answer at once", async () => {
    const o = await organizer(); const id = uid("CB");
    let n = 1; flakyTx((sql) => { if (n > 0 && sql.startsWith("INSERT OR IGNORE INTO engagement")) { n--; throw new Error("D1_ERROR: Network connection lost"); } });
    const r = await create(o.key, id); expect(r.status).toBe(503); expect(sleeps).toBe(0); expect((await j(r)).code).toBe("busy");
  });
});

describe("publish: consent record and mail", () => {
  test("a hiccup at the K1 consent record: the whole publish is repeated, and the K1 record exists exactly once", async () => {
    const o = await organizer(); const id = uid("PA"); expect((await create(o.key, id)).status).toBe(200);
    let n = 1; flakyTx((sql) => { if (n > 0 && sql.startsWith("INSERT INTO consent_log")) { n--; throw new Error(OVERLOAD); } });
    const r = await publish(o.key, id); expect(r.status).toBe(200); expect(n).toBe(0);
    expect(one("SELECT COUNT(*) c FROM kv WHERE k=?", `pub/${id}`).c).toBe(1);
    expect(one("SELECT COUNT(*) c FROM consent_log WHERE kind='K1' AND ref=?", id).c).toBe(1);
  });
  test("production order (mail key set, Resend called BEFORE the log row): a hiccup at the log row does not send twice, and the send carries an idempotency key", async () => {
    (W.env as any).RESEND_API_KEY = "re_test_dummy";
    const sends: string[] = [];
    (globalThis as any).fetch = async (url: string, init?: any) => { if (String(url).includes("api.resend.com")) { sends.push(String(init?.headers?.["idempotency-key"] ?? "")); return new Response(JSON.stringify({ id: "m1" }), { status: 200 }); } return realFetch(url, init); };
    const o = await organizer(); const id = uid("PB"); expect((await create(o.key, id)).status).toBe(200);
    sends.length = 0; // (signing up sent its own welcome mail)
    let n = 1; flakyTx((sql) => { if (n > 0 && sql.startsWith("INSERT INTO outbox")) { n--; throw new Error(OVERLOAD); } });
    const r = await publish(o.key, id); expect(r.status).toBe(200); expect(n).toBe(0);
    expect(sends.length).toBe(1); // the log row failed AFTER a successful send: not fatal, so no repeat, no second send
    expect(sends[0]).toBe(`pubmail-${id}`);
    expect(one("SELECT COUNT(*) c FROM consent_log WHERE kind='K1' AND ref=?", id).c).toBe(1);
  });
  test("production order, a hiccup AFTER the send at the 'owed' marker: any repeat sends with the SAME idempotency key (the mail service sends it once)", async () => {
    (W.env as any).RESEND_API_KEY = "re_test_dummy";
    const sends: string[] = [];
    (globalThis as any).fetch = async (url: string, init?: any) => { if (String(url).includes("api.resend.com")) { sends.push(String(init?.headers?.["idempotency-key"] ?? "")); return new Response("{}", { status: 200 }); } return realFetch(url, init); };
    const o = await organizer(); const id = uid("PC"); expect((await create(o.key, id)).status).toBe(200);
    sends.length = 0;
    let n = 1; flakyTx((sql) => { if (n > 0 && sql.startsWith("DELETE FROM kv WHERE k=?")) { n--; throw new Error(OVERLOAD); } });
    const r = await publish(o.key, id); expect(r.status).toBe(200);
    expect(sends.length).toBeGreaterThanOrEqual(1); expect(new Set(sends).size).toBe(1); expect(sends[0]).toBe(`pubmail-${id}`);
  });
});

describe("sign-in: a repeat does not count the same try twice", () => {
  test("six hiccups after the try was counted: still ONE try used, so the correct code is not locked out", async () => {
    reset({ TEST_MODE: "1" } as any); // the code is shown in the answer only in test mode
    const o = await organizer(); const ask = await j(await call("POST", "/api/auth/email", { email: o.email }, { "cf-connecting-ip": "5.5.5.5" }));
    flakyTx((sql) => { if (sql.startsWith("SELECT org FROM organizer_email WHERE email_hash=?")) throw new Error(OVERLOAD); });
    const r = await call("POST", "/api/auth/verify", { email: o.email, code: ask.devCode }); expect(r.status).toBe(503);
    expect(sleeps).toBe(setupRetry.delaysMs.length);
    expect(one("SELECT attempts a FROM login_code").a).toBe(1);
  });
});
