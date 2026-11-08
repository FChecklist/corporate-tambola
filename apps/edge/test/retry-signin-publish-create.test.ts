// 8 Nov 2026: a cloud test started 12 games in the same second. Cloudflare D1 answered "D1 DB is overloaded. Too many resources consumed within a 10 second window" and,
// because sign-in (/api/auth/verify), creating a game (POST /api/z) and publishing were the "ask once, then 503 busy" class, 9 of 13 games failed before a single guest joined.
// These three are now asked again (3 tries, short random pause) exactly like a join. Each test below is also a falsifiability check: put the route back to "once" and it fails.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { W, call, contact, create, dev, j, keyH, mails, mob, one, organizer, paidGame, publish, q, reset, restore, uid } from "./param-harness";
import { joinRetry, retryKind } from "../src/worker";

const OVERLOAD = "D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window";
const wrapStmt = (s: any, fail: (sql: string) => void, sql: string): any => new Proxy(s, {
  get(t, k) {
    const v = t[k];
    if (k === "__raw") return t;
    if (k === "bind") return (...a: any[]) => wrapStmt(v.apply(t, a), fail, sql);
    if (k === "first" || k === "run" || k === "all" || k === "raw") return async (...a: any[]) => { fail(sql); return v.apply(t, a); };
    return v;
  },
});
/** The test database, with `fail(sql)` run before every read/write; it throws to play the overload. */
const flaky = (fail: (sql: string) => void) => {
  const real = W.env.DB as any;
  (W.env as any).DB = { prepare: (sql: string) => wrapStmt(real.prepare(sql), fail, sql), batch: async (xs: any[]) => { fail("BATCH"); return real.batch(xs.map((x) => x.__raw ?? x)); } };
};
const oldTries = joinRetry.tries, oldBase = joinRetry.baseMs, oldSleep = joinRetry.sleep;

describe("sign-in, create and publish through a passing database overload", () => {
  let sleeps = 0;
  beforeEach(() => { reset({ TEST_MODE: "1" } as any); joinRetry.baseMs = 0; joinRetry.tries = 3; sleeps = 0; joinRetry.sleep = async () => { sleeps++; }; });
  afterEach(() => { restore(); joinRetry.tries = oldTries; joinRetry.baseMs = oldBase; joinRetry.sleep = oldSleep; });

  test("the classes: these three are asked again; sending a sign-in code, money, keys, winners and cancel are still never asked twice", () => {
    expect(retryKind("POST", "/api/auth/verify")).toBe("write");
    expect(retryKind("POST", "/api/z")).toBe("write");
    expect(retryKind("POST", "/api/z/ABCD/publish")).toBe("write");
    expect(retryKind("POST", "/api/z/ABCD/leave")).toBe("write");
    expect(retryKind("GET", "/api/z")).toBe("read");
    for (const p of ["/api/auth/email", "/api/org/host", "/api/pay/webhook", "/api/z/ABCD/cancel", "/api/z/ABCD/vote", "/api/z/ABCD/clone", "/api/z/ABCD/announce"]) expect(retryKind("POST", p)).toBe("once");
  });

  test("sign-in with the 6-digit code meets one overload: the person gets in, once, and the code is used up", async () => {
    const o = await organizer(); const ask = await j(await call("POST", "/api/auth/email", { email: o.email }, { "cf-connecting-ip": "5.5.5.5" }));
    expect(ask.devCode).toMatch(/^\d{6}$/);
    let n = 1; flaky((sql) => { if (n > 0 && sql.startsWith("SELECT code_hash")) { n--; throw new Error(OVERLOAD); } });
    const r = await call("POST", "/api/auth/verify", { email: o.email, code: ask.devCode }); const b = await j(r);
    expect(r.status).toBe(200); expect(b.token).toMatch(/^ctk_/);
    expect(n).toBe(0); expect(sleeps).toBe(1);
    expect((await call("GET", "/api/whoami", undefined, keyH(b.token))).status).toBe(200);
    expect((await call("POST", "/api/auth/verify", { email: o.email, code: ask.devCode })).status).toBe(400); // the same code never works twice
  });

  test("sign-in still busy after the tries: a gentle 503 with retry-after, not a 500, and nobody is let in", async () => {
    const o = await organizer(); const ask = await j(await call("POST", "/api/auth/email", { email: o.email }, { "cf-connecting-ip": "5.5.5.5" }));
    let reads = 0; flaky((sql) => { if (sql.startsWith("SELECT code_hash")) { reads++; throw new Error(OVERLOAD); } });
    const r = await call("POST", "/api/auth/verify", { email: o.email, code: ask.devCode });
    expect(r.status).toBe(503); expect(r.headers.get("retry-after")).toBe("3"); expect((await j(r)).code).toBe("busy");
    expect(reads).toBe(1 + joinRetry.tries); // first try + 3 repeats, then it stops
  });

  test("creating a game meets one overload at the insert: one game, and a repeat of the same request is the same game", async () => {
    const o = await organizer(); const id = uid("RC");
    let n = 1; flaky((sql) => { if (n > 0 && sql.startsWith("INSERT OR IGNORE INTO engagement")) { n--; throw new Error(OVERLOAD); } });
    const r = await create(o.key, id); expect(r.status).toBe(200); expect(n).toBe(0); expect(sleeps).toBe(1);
    expect(one("SELECT COUNT(*) c FROM engagement WHERE id=?", id).c).toBe(1);
    const again = await j(await create(o.key, id)); expect(again.existed).toBe(true); expect(one("SELECT COUNT(*) c FROM engagement WHERE id=?", id).c).toBe(1);
  });

  test("publishing meets two overloads at the final write: published once, one e-mail, nothing owed afterwards", async () => {
    const o = await organizer(); const id = uid("RP"); expect((await create(o.key, id)).status).toBe(200);
    let n = 2; flaky((sql) => { if (n > 0 && sql === "BATCH") { n--; throw new Error(OVERLOAD); } });
    const r = await publish(o.key, id); expect(r.status).toBe(200); expect((await j(r)).published).toBe(true);
    expect(n).toBe(0); expect(sleeps).toBe(2);
    expect(one("SELECT COUNT(*) c FROM kv WHERE k=?", `pub/${id}`).c).toBe(1);
    expect(one("SELECT COUNT(*) c FROM kv WHERE k=?", `mailowed/${id}`).c).toBe(0);
    expect(mails(contact.email).filter((m: any) => String(m.subject).includes(id)).length).toBe(1);
  });

  test("publishing: an overload AFTER the publish was written never loses the confirmation e-mail (at least one, owed mail is sent by the repeat)", async () => {
    const o = await organizer(); const id = uid("RQ"); expect((await create(o.key, id)).status).toBe(200);
    let n = 1; flaky((sql) => { if (n > 0 && sql.startsWith("INSERT INTO consent")) { n--; throw new Error(OVERLOAD); } });
    const r = await publish(o.key, id); expect(r.status).toBeLessThan(500);
    expect(one("SELECT COUNT(*) c FROM kv WHERE k=?", `pub/${id}`).c).toBe(1);
    expect(mails(contact.email).filter((m: any) => String(m.subject).includes(id)).length).toBeGreaterThanOrEqual(1);
    expect(q("SELECT 1 FROM kv WHERE k=?", `mailowed/${id}`).length).toBe(0);
  });

  test("a player leaving meets one overload (the first overload of the 8 Nov ramp run was a /leave): the player is taken out, once", async () => {
    const id = uid("RL"); await paidGame({ id });
    const jr = await j(await call("POST", `/api/z/${id}/join`, { phone: mob(1), name: "Guest 1", device: dev(1) })); expect(jr.pid).toBeTruthy();
    const seats = () => one("SELECT COUNT(*) c FROM seat WHERE eid=? AND pid=?", id, jr.pid).c as number;
    expect(seats()).toBe(1);
    let n = 1; flaky((sql) => { if (n > 0 && sql.startsWith("SELECT seq, pid, ph, dev")) { n--; throw new Error(OVERLOAD); } });
    const r = await call("POST", `/api/z/${id}/leave`, { pid: jr.pid, device: dev(1) }); const b = await j(r);
    expect(r.status).toBe(200); expect(b.left).toBe(true); expect(n).toBe(0); expect(sleeps).toBe(1);
    expect(seats()).toBe(0);
  });
});
