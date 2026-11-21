// Release 1.11.0: the mail service's signed webhook (POST /api/mail/events) now reports PER MAIL (delivered, bounced, complained, delayed) and stops mailing an address after a hard bounce or a complaint.
// Through the real Worker route and sendMail, a real SQLite, and stand-ins for the mail services.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { makeD1 } from "./d1-sqlite";
import { handle } from "./with-terms";
import { retryRecentOutbox, retryOutbox, sendMail, sendReportMail, type PayEnv } from "../src/pay";
import { fromIsOurs } from "../src/admin";
import { hashMail, isHardBounce } from "../src/mail-lanes";

const T = Date.UTC(2026, 10, 21, 9, 0, 0), MIN = 60_000;
const SECRET = "whsec_" + Buffer.from("test-secret-bytes-0123456789abcd").toString("base64");
const PLAT = { "x-organizer": "plat" };
let env: PayEnv & Record<string, any>; let raw: ReturnType<typeof makeD1>["raw"]; const realFetch = globalThis.fetch;
let calls: { to: string; subject: string }[]; let resendStatus = 200; let nid = 0;
const q = (sql: string, ...a: unknown[]) => raw.prepare(sql).all(...(a as any[])) as any[];
const sign = (id: string, ts: number, body: string, secret = SECRET) => "v1," + createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(`${id}.${ts}.${body}`).digest("base64");

beforeEach(() => {
  const d = makeD1(); raw = d.raw; calls = []; resendStatus = 200; nid = 0;
  env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", RESEND_API_KEY: "re_test", MAIL_RETRY_MS: "0", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "s", DATA_KEY: "k", RESEND_WEBHOOK_SECRET: SECRET, MAIL_WARMUP_START: "2026-11-20" } as any;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    if (String(url) !== "https://api.resend.com/emails") return new Response("{}", { status: 404 });
    const b = JSON.parse(init.body); calls.push({ to: b.to[0], subject: b.subject });
    return new Response(JSON.stringify(resendStatus === 200 ? { id: "em_" + ++nid } : { name: "validation_error" }), { status: resendStatus });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const route = (method: string, path: string, body?: string, headers: Record<string, string> = {}, now = T) => handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body }), env, now);
const hook = (type: string, data: Record<string, unknown>, id = "msg_" + Math.random().toString(36).slice(2), now = T, opts: { sig?: string; secret?: string } = {}) => {
  const body = JSON.stringify({ type, created_at: "2026-11-21T09:00:00Z", data }), ts = Math.floor(now / 1000);
  return route("POST", "/api/mail/events", body, { "svix-id": id, "svix-timestamp": String(ts), "svix-signature": opts.sig ?? sign(id, ts, body, opts.secret) }, now);
};
const FROM = "Corporate Tambola <hello@corporatetambola.com>";
const ev = (over: Record<string, unknown> = {}) => ({ email_id: "em_1", from: FROM, to: ["Maya.Lopez@Acme.com"], subject: "Corporate Tambola: invoice", ...over });
const send = (to = "maya.lopez@acme.com", subject = "invoice", now = T) => sendMail(env, env.DB, to, subject, "INVOICE", now);

describe("per mail: what the mail service says about each mail is kept against that mail", () => {
  test("a sent mail is tracked by the provider's id; delivered updates the same row and the mail log says so", async () => {
    expect(await send()).toBe(true);
    expect(q("SELECT ref, lane, state, rank FROM mail_track")).toEqual([{ ref: "em_1", lane: "tx", state: "sent", rank: 0 }]);
    expect((await hook("email.delivered", ev(), "d1", T + MIN)).status).toBe(200);
    expect(q("SELECT ref, lane, state FROM mail_track")).toEqual([{ ref: "em_1", lane: "tx", state: "delivered" }]);
    expect(q("SELECT outcome FROM mail_event ORDER BY id").map((e) => e.outcome)).toEqual(["provider delivered"]);
    expect(q("SELECT event FROM mail_bounce")).toEqual([{ event: "delivered" }]);
  });
  test("a bulk mail keeps its lane when the webhook reports on it", async () => {
    await sendMail(env, env.DB, "lead@acme.com", "reminder", "text", T + 5 * 86_400_000, { lane: "bulk" });
    await hook("email.delivered", ev({ to: ["lead@acme.com"] }), "d1", T + 5 * 86_400_000 + MIN);
    expect(q("SELECT lane, state FROM mail_track")).toEqual([{ lane: "bulk", state: "delivered" }]);
  });
  test("a report that arrives BEFORE our own record of the send does not lose the lane: the send fills it in and the state stays", async () => {
    await hook("email.delivered", ev({ email_id: "em_1" }), "d0", T);
    expect(q("SELECT lane, state FROM mail_track")).toEqual([{ lane: "unknown", state: "delivered" }]);
    await send(); // the provider answers em_1
    expect(q("SELECT ref, lane, state FROM mail_track")).toEqual([{ ref: "em_1", lane: "tx", state: "delivered" }]);
  });
  test("the four states and the order: delayed -> delivered -> bounced -> complained; a late 'delayed' never overwrites 'delivered'; a repeat changes nothing", async () => {
    await send();
    const st = () => q("SELECT state FROM mail_track")[0].state;
    await hook("email.delivery_delayed", ev(), "a1", T + 1); expect(st()).toBe("delayed");
    await hook("email.delivered", ev(), "a2", T + 2); expect(st()).toBe("delivered");
    await hook("email.delivery_delayed", ev(), "a3", T + 3); expect(st()).toBe("delivered"); // arrived late, out of order
    await hook("email.delivered", ev(), "a2", T + 2); expect(st()).toBe("delivered");
    await hook("email.bounced", ev({ bounce: { type: "Transient", subType: "MailboxFull" } }), "a4", T + 4); expect(st()).toBe("bounced");
    await hook("email.complained", ev(), "a5", T + 5); expect(st()).toBe("complained");
    await hook("email.delivered", ev(), "a6", T + 6); expect(st()).toBe("complained");
    expect(q("SELECT event FROM mail_bounce ORDER BY at_ms").map((e) => e.event)).toEqual(["delayed", "delivered", "delayed", "bounced", "complained", "delivered"]); // one row per call id (the repeat of a2 added none)
  });
  test("a repeat of the same call (same svix id) stores one event row, one state change and one log line", async () => {
    await send();
    for (let i = 0; i < 3; i++) await hook("email.bounced", ev({ bounce: { type: "Permanent", subType: "General" } }), "same", T + MIN);
    expect(q("SELECT COUNT(*) c FROM mail_bounce")[0].c).toBe(1); expect(q("SELECT COUNT(*) c FROM mail_suppress")[0].c).toBe(1);
    expect(q("SELECT outcome FROM mail_event WHERE outcome LIKE 'provider %'").length).toBe(1);
  });
});

describe("a hard bounce or a complaint: the address is not mailed again", () => {
  test("a Permanent bounce puts the address on the do-not-mail list (hash and masked form only); the next mail is not sent and the log says why", async () => {
    await send();
    const r = await hook("email.bounced", ev({ bounce: { type: "Permanent", subType: "General", message: "550 5.1.1 maya.lopez@acme.com does not exist" } }), "b1", T + MIN);
    expect(await r.json()).toEqual({ ok: true, event: "bounced", again: false });
    const row = q("SELECT * FROM mail_suppress")[0]; expect(row).toMatchObject({ to_mask: "m***@acme.com", reason: "bounced_permanent", ref: "em_1", at_ms: T + MIN }); expect(row.to_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toMatch(/maya|lopez|does not exist/i);
    const n = calls.length;
    expect(await send("maya.lopez@acme.com", "invoice 2", T + 2 * MIN)).toBe(false);
    expect(calls.length).toBe(n); expect(q("SELECT outcome FROM mail_event ORDER BY id").map((e) => e.outcome)).toContain("suppressed_bounce");
    expect(q("SELECT COUNT(*) c FROM outbox WHERE subject LIKE '%invoice 2%'")[0].c).toBe(0); // nothing kept to retry
  });
  test("the same person written another way (capitals, a +tag) is the same address", async () => {
    await hook("email.bounced", ev({ bounce: { type: "Permanent", subType: "General" } }), "b1");
    for (const a of ["MAYA.LOPEZ@ACME.COM", "maya.lopez+games@acme.com", " Maya.Lopez@acme.com "]) expect([a, await send(a, "x", T + MIN)]).toEqual([a, false]);
    expect(await send("maya.other@acme.com", "x", T + MIN)).toBe(true);
  });
  test("a complaint (marked as spam) does the same", async () => {
    await hook("email.complained", ev(), "c1");
    expect(q("SELECT reason FROM mail_suppress")).toEqual([{ reason: "complained" }]); expect(await send("maya.lopez@acme.com", "x", T + MIN)).toBe(false);
  });
  test("a transient bounce (mailbox full), an undetermined one, a delay, a failure and a delivery do NOT stop mailing", async () => {
    await hook("email.bounced", ev({ bounce: { type: "Transient", subType: "MailboxFull" } }), "t1");
    await hook("email.bounced", ev({ bounce: { type: "Undetermined", subType: "Undetermined" } }), "t2");
    await hook("email.bounced", ev({ bounce: { subType: "General" } }), "t3"); // no type: not treated as hard
    for (const t of ["email.delivery_delayed", "email.failed", "email.delivered"]) await hook(t, ev(), "x" + t);
    expect(q("SELECT COUNT(*) c FROM mail_suppress")[0].c).toBe(0); expect(await send()).toBe(true);
  });
  test("the mail service account is shared with other products: a bounce of mail from ANOTHER domain is recorded but does not stop OUR mail", async () => {
    await hook("email.bounced", ev({ from: "Other Product <hello@other-product.com>", bounce: { type: "Permanent", subType: "General" } }), "o1");
    expect(q("SELECT COUNT(*) c FROM mail_bounce")[0].c).toBe(1); expect(q("SELECT COUNT(*) c FROM mail_suppress")[0].c).toBe(0);
    await hook("email.bounced", ev({ from: "Corporate Tambola <hello@mail.corporatetambola.com>", to: ["sub@acme.com"], bounce: { type: "Permanent", subType: "General" } }), "o2");
    expect(q("SELECT reason FROM mail_suppress").length).toBe(1); // a sub-domain of ours counts
    expect(fromIsOurs(undefined)).toBe(true); expect(fromIsOurs("x@corporatetambola.com.evil.com")).toBe(false); expect(fromIsOurs("A <a@corporatetambola.com>", "B <b@corporatetambola.com>")).toBe(true);
    expect(isHardBounce("Permanent")).toBe(true); expect(isHardBounce("permanent ")).toBe(true); expect(isHardBounce("Transient")).toBe(false); expect(isHardBounce(undefined)).toBe(false);
  });
  test("it holds for every kind of mail: an invoice, a report with a PDF, and the retry loops never send to a stopped address", async () => {
    await env.DB.prepare("INSERT INTO mail_suppress(to_hash,to_mask,reason,at_ms) VALUES(?,?,?,?)").bind(await hashMail("maya.lopez@acme.com"), "m***@acme.com", "bounced_permanent", T).run();
    const before = calls.length;
    expect(await sendReportMail(env, "maya.lopez@acme.com", "Your report", "t", [{ filename: "r.pdf", content: new Uint8Array([1]) }])).toBe(false);
    // a mail that failed BEFORE the address was stopped waits in the outbox: neither retry loop sends it, and its body is dropped
    for (const [k, run] of [["tick", (now: number) => retryRecentOutbox(env, now)], ["daily", (now: number) => retryOutbox(env, now)]] as const) {
      await env.DB.prepare("INSERT INTO outbox(to_addr,subject,body,at_ms,sent) VALUES('maya.lopez@acme.com','invoice ' || ?,'INVOICE',?,0)").bind(k, T - 10 * MIN).run();
      await run(T + MIN);
    }
    expect(calls.length).toBe(before); expect(q("SELECT COUNT(*) c FROM outbox WHERE body<>''")[0].c).toBe(0);
  });
  test("the lookup that decides can fail without stopping an invoice: with the table missing the mail still goes", async () => {
    raw.run("DROP TABLE mail_suppress"); expect(await send()).toBe(true);
  });
});

describe("the receiver itself: signed, verified, idempotent", () => {
  test("with no secret set the address answers 404 and stores nothing", async () => {
    delete (env as any).RESEND_WEBHOOK_SECRET;
    expect((await hook("email.bounced", ev({ bounce: { type: "Permanent" } }), "n1")).status).toBe(404);
    for (const t of ["mail_bounce", "mail_track", "mail_suppress"]) expect(q(`SELECT COUNT(*) c FROM ${t}`)[0].c).toBe(0);
  });
  test("a wrong signature, a wrong secret, a stale time and a body changed after signing are refused and change nothing", async () => {
    const data = ev({ bounce: { type: "Permanent", subType: "General" } });
    expect((await hook("email.bounced", data, "s1", T, { sig: "v1,AAAA" })).status).toBe(400);
    expect((await hook("email.bounced", data, "s2", T, { secret: "whsec_" + Buffer.from("another-secret-another-secret-12").toString("base64") })).status).toBe(400);
    const body = JSON.stringify({ type: "email.bounced", data }), ts = Math.floor(T / 1000), good = sign("s3", ts, body);
    expect((await route("POST", "/api/mail/events", body.replace("Permanent", "Transient"), { "svix-id": "s3", "svix-timestamp": String(ts), "svix-signature": good })).status).toBe(400);
    expect((await route("POST", "/api/mail/events", body, { "svix-id": "s4", "svix-timestamp": String(ts - 3600), "svix-signature": sign("s4", ts - 3600, body) })).status).toBe(400);
    expect((await route("POST", "/api/mail/events", body, {})).status).toBe(400);
    for (const t of ["mail_bounce", "mail_track", "mail_suppress"]) expect(q(`SELECT COUNT(*) c FROM ${t}`)[0].c).toBe(0);
    expect(q("SELECT COUNT(*) c FROM mail_event")[0].c).toBe(0);
  });
  test("every delivery of the same call applies its effects again (idempotent): a call that died after the event row was written is finished by the provider's retry", async () => {
    await send();
    const data = ev({ bounce: { type: "Permanent", subType: "General" } });
    await hook("email.bounced", data, "r1"); raw.run("DELETE FROM mail_suppress"); raw.run("UPDATE mail_track SET state='sent', rank=0"); // as if the effects of the first call were lost
    const r = await hook("email.bounced", data, "r1"); expect((await r.json() as any).again).toBe(true);
    expect(q("SELECT COUNT(*) c FROM mail_suppress")[0].c).toBe(1); expect(q("SELECT state FROM mail_track")).toEqual([{ state: "bounced" }]); expect(q("SELECT COUNT(*) c FROM mail_bounce")[0].c).toBe(1);
  });
  test("an event with no address or an unknown type is ignored, and nothing about the person or the provider's message text is kept", async () => {
    expect(await (await hook("email.opened", ev(), "i1")).json()).toEqual({ ok: true, ignored: true });
    expect(await (await hook("email.bounced", ev({ to: [] }), "i2")).json()).toEqual({ ok: true, ignored: true });
    await hook("email.bounced", ev({ bounce: { type: "Permanent", subType: "General", message: "550 5.1.1 maya.lopez@acme.com does not exist" } }), "i3");
    const dump = JSON.stringify([q("SELECT * FROM mail_bounce"), q("SELECT * FROM mail_track"), q("SELECT * FROM mail_suppress"), q("SELECT * FROM mail_event")]);
    expect(dump).not.toMatch(/maya|lopez|does not exist/i);
  });
});

describe("the owner can read the do-not-mail list (masked) and take an address off it", () => {
  test("only the owner; clearing a wrongly stopped customer lets the next mail go; the address is not written to the access log", async () => {
    await hook("email.bounced", ev({ bounce: { type: "Permanent", subType: "General" } }), "b1");
    for (const h of [{}, { "x-organizer": "wrong" }, { ...PLAT, "x-cb-link": "1" }]) { expect((await route("GET", "/api/owner/mail-suppress", undefined, h as any)).status).toBe(404); expect((await route("POST", "/api/owner/mail-suppress", JSON.stringify({ action: "clear", email: "maya.lopez@acme.com" }), h as any)).status).toBe(404); }
    expect(await send("maya.lopez@acme.com", "x", T + MIN)).toBe(false);
    const list = await (await route("GET", "/api/owner/mail-suppress", undefined, PLAT)).json() as any;
    expect(list).toMatchObject({ count: 1, addresses: [{ to: "m***@acme.com", reason: "bounced_permanent" }] }); expect(JSON.stringify(list)).not.toMatch(/lopez/i);
    expect(await (await route("POST", "/api/owner/mail-suppress", JSON.stringify({ action: "clear", email: "Maya.Lopez@acme.com" }), PLAT)).json()).toEqual({ ok: true, cleared: true });
    expect(await send("maya.lopez@acme.com", "x", T + 2 * MIN)).toBe(true);
    expect(await (await route("POST", "/api/owner/mail-suppress", JSON.stringify({ action: "clear", email: "maya.lopez@acme.com" }), PLAT)).json()).toEqual({ ok: true, cleared: false });
    expect((await route("POST", "/api/owner/mail-suppress", JSON.stringify({ action: "clear", email: "not-an-address" }), PLAT)).status).toBe(400);
    expect(JSON.stringify(q("SELECT * FROM audit_access"))).not.toMatch(/lopez/i);
  });
  test("the owner can add an address by hand (for a complaint that came another way)", async () => {
    expect(await (await route("POST", "/api/owner/mail-suppress", JSON.stringify({ action: "add", email: "angry@acme.com" }), PLAT)).json()).toEqual({ ok: true, added: true });
    expect(await send("angry@acme.com")).toBe(false);
  });
});
