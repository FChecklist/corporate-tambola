// RCA 2026-11-20 (docs/RCA-NO-INVOICE-MAIL-2026-11-20.md): the Rs 1 live payment issued its invoice, but three of its four mails (the "published" note, the owner's "paid order" note and the
// organizer's copy of the invoice) were refused by the mail service and NOTHING recorded why, and the failed mail waited for the once-a-day job. These tests pin the three repairs:
//   1. a busy mail service (429 / 5xx / no answer) is tried again at once, with ONE idempotency key (never two mails);
//   2. a mail that is still refused leaves the provider's error NAME (never its free text or the address) in the mail log;
//   3. every scheduled tick tries the newest unsent mails again, with a growing wait, newest first, three at a time.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { makeD1 } from "./d1-sqlite";
import { retryRecentOutbox, sendMail, TICK_RETRY_TRIES, type PayEnv } from "../src/pay";
import { runTick, type Env } from "../src/worker";

const T = Date.UTC(2026, 10, 20, 13, 0, 0), MIN = 60_000;
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"];
const realFetch = globalThis.fetch;
let calls: { key: string | null; to: string }[]; let script: (n: number) => { status: number; body?: unknown } | "throw";
const q = (sql: string, ...a: unknown[]) => raw.prepare(sql).all(...(a as any[])) as any[];

beforeEach(() => {
  const d = makeD1(); raw = d.raw; calls = []; script = () => ({ status: 200 });
  env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "100000", RESEND_API_KEY: "re_test", MAIL_RETRY_MS: "0", PUBLIC_ORIGIN: "https://tambola.test" } as any;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    if (String(url) !== "https://api.resend.com/emails") return new Response("{}", { status: 404 });
    calls.push({ key: init.headers["idempotency-key"] ?? null, to: JSON.parse(init.body).to[0] });
    const r = script(calls.length); if (r === "throw") throw new Error("network down");
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const send = (to = "boss@acme.com", subject = "Corporate Tambola: invoice CT/2026-27/000001 for your game") => sendMail(env, env.DB, to, subject, "INVOICE ...", T);

describe("a busy mail service does not lose the invoice mail", () => {
  test("429 then accepted: tried again at once, ONE idempotency key for both tries, logged as sent", async () => {
    script = (n) => (n === 1 ? { status: 429, body: { name: "rate_limit_exceeded", message: "Too many requests to boss@acme.com" } } : { status: 200 });
    expect(await send()).toBe(true);
    expect(calls.length).toBe(2); expect(calls[0]!.key).toBeTruthy(); expect(calls[1]!.key).toBe(calls[0]!.key);
    expect(q("SELECT sent, body FROM outbox")).toEqual([{ sent: 1, body: "" }]);
    expect(q("SELECT * FROM mail_event").length).toBe(0); // it got through: nothing to explain
  });
  test("a service that answers 500 twice and then works is also covered; a dropped connection too", async () => {
    script = (n) => (n === 1 ? "throw" : n === 2 ? { status: 503 } : { status: 200 });
    expect(await send()).toBe(true); expect(calls.length).toBe(3);
  });
});

describe("a refused mail says why (the provider's error name only)", () => {
  test("still refused after the tries: kept for the retry, and the log holds the status and the error NAME, never the address or the provider's message", async () => {
    script = () => ({ status: 429, body: { name: "daily_quota_exceeded", message: "You have reached your daily quota for boss@acme.com" } });
    expect(await send()).toBe(false); expect(calls.length).toBe(3);
    const row = q("SELECT sent, body FROM outbox")[0]!; expect(row.sent).toBe(0); expect(row.body).toContain("INVOICE"); // kept so a later try can send it
    const ev = q("SELECT outcome, subject FROM mail_event");
    expect(ev.map((e) => e.outcome)).toEqual(["send_failed 429 daily_quota_exceeded"]);
    expect(JSON.stringify(ev)).not.toContain("boss@acme.com"); expect(JSON.stringify(ev)).not.toContain("quota for");
  });
  test("a plain refusal (403) is logged and NOT repeated", async () => {
    script = () => ({ status: 403, body: { name: "validation_error" } });
    expect(await send("raajat+x@gmail.com")).toBe(false); expect(calls.length).toBe(1);
    expect(q("SELECT outcome FROM mail_event").map((e) => e.outcome)).toEqual(["send_failed 403 validation_error"]);
  });
  test("a dropped connection is logged as 'network'", async () => {
    script = () => "throw"; await send();
    expect(q("SELECT outcome FROM mail_event").map((e) => e.outcome)).toEqual(["send_failed network"]);
  });
});

describe("the tick tries the newest unsent mails again (not only the once-a-day job)", () => {
  const failOnce = async (subject: string, at = T) => { script = () => ({ status: 429, body: { name: "rate_limit_exceeded" } }); await sendMail(env, env.DB, "boss@acme.com", subject, "body of " + subject, at); script = () => ({ status: 200 }); calls = []; };
  test("a failed invoice mail is sent by the next tick, once, and its body is cleared", async () => {
    await failOnce("invoice A");
    expect(await retryRecentOutbox(env, T + 30_000)).toBe(0); expect(calls.length).toBe(0); // too fresh: the first try may still be settling
    expect(await retryRecentOutbox(env, T + 2 * MIN)).toBe(1);
    expect(q("SELECT sent, body FROM outbox")).toEqual([{ sent: 1, body: "" }]);
    expect(calls[0]!.key).toMatch(/^outbox-\d+$/); // a stable key: a repeat can never deliver it twice
    expect(await retryRecentOutbox(env, T + 3 * MIN)).toBe(0); expect(calls.length).toBe(1);
  });
  test("the wait grows (2, 4, 8 ... minutes), it stops after the sixth try, and an old mail (over 24 hours) is left to the daily job", async () => {
    await failOnce("invoice B"); script = () => ({ status: 500 });
    let t = T, tries = 0;
    for (let i = 0; i < 240; i++) { t += MIN; const before = calls.length; await retryRecentOutbox(env, t); if (calls.length > before) tries++; } // four hours, a tick a minute
    expect(tries).toBe(TICK_RETRY_TRIES);
    calls = []; script = () => ({ status: 200 });
    expect(await retryRecentOutbox(env, T + 25 * 3600_000)).toBe(0); expect(calls.length).toBe(0);
  });
  test("newest first and three a tick: an old backlog cannot starve a fresh invoice", async () => {
    for (let i = 0; i < 5; i++) await failOnce(`old smoke ${i}`, T + i * 1000);
    await failOnce("FRESH invoice", T + 10_000);
    script = () => ({ status: 200 });
    expect(await retryRecentOutbox(env, T + 3 * MIN)).toBe(3);
    const done = q("SELECT subject FROM outbox WHERE sent=1").map((r) => r.subject);
    expect(done.some((s) => s.includes("FRESH invoice"))).toBe(true);
    expect(q("SELECT COUNT(*) AS c FROM outbox WHERE sent=0")[0]!.c).toBe(3);
  });
  test("in TEST mode, or without a mail key, the tick sends nothing", async () => {
    await failOnce("invoice C"); const k = env.RESEND_API_KEY; env.RESEND_API_KEY = undefined;
    expect(await retryRecentOutbox(env, T + 3 * MIN)).toBe(0); env.RESEND_API_KEY = k; expect(calls.length).toBe(0);
  });
  test("the scheduled tick itself runs it (wiring): runTick reports the mail it sent again", async () => {
    await failOnce("invoice D");
    raw.run("INSERT INTO kv(k,v) VALUES('outbox_retry_day','2026-11-20')"); // today's once-a-day sweep already ran (as it had when the Rs 1 invoice mail failed at 13:28 UTC): only the new tick retry can send it now
    const r = await runTick(env as Env, T + 3 * MIN);
    expect(r.mailRetried).toBe(1);
    expect(q("SELECT sent FROM outbox")).toEqual([{ sent: 1 }]);
  });
});
