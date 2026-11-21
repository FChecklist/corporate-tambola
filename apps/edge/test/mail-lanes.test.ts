// Release 1.11.0: two mail lanes (transactional never held up by bulk), the warm-up of the young sending domain, a send counter with an 80 % alert of the monthly quota, and a status address.
// Through the real sendMail / tick code and a real SQLite; the mail services are stand-ins (fetch). The rule itself (bulkDecision) is also tested as a pure function.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { makeD1 } from "./d1-sqlite";
import { drainBulkMail, retryRecentOutbox, sendMail, type PayEnv } from "../src/pay";
import { handle } from "./with-terms";
import { BULK_AFTER_WARMUP, BULK_QUEUE_KEEP_MS, STATUS_TTL_MS, WARMUP_BULK_CAPS, bulkCapForDay, bulkDecision, mailStatus, readUsage, suppressKey, warmupDay } from "../src/mail-lanes";
import { adminTick } from "../src/admin";

const DAY = 86_400_000, MIN = 60_000;
const D1ST = Date.UTC(2026, 10, 20, 10, 0, 0); // 20 Nov 2026 10:00 UTC = warm-up day 1 (MAIL_WARMUP_START below)
const dayAt = (n: number) => D1ST + (n - 1) * DAY;
const ACC = "ac433821e311dbc89d0e002a192f92bc", TOKEN = "cf-secret-token-123", KEY = "re_live_secret_key_abc";
let env: PayEnv & Record<string, any>; let raw: ReturnType<typeof makeD1>["raw"]; const realFetch = globalThis.fetch; const realWarn = console.warn;
type Call = { who: "resend" | "cf"; key: string | null; to: string; subject: string };
let calls: Call[]; let resend: (n: number) => { status: number; body?: unknown } | "throw"; let warns: string[]; let nid = 0;
const q = (sql: string, ...a: unknown[]) => raw.prepare(sql).all(...(a as any[])) as any[];
const by = (w: Call["who"]) => calls.filter((c) => c.who === w);
const quota429 = { status: 429, body: { name: "monthly_quota_exceeded" } };

beforeEach(() => {
  const d = makeD1(); raw = d.raw; calls = []; warns = []; nid = 0;
  resend = () => ({ status: 200, body: { id: "em_" + ++nid } });
  env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", RESEND_API_KEY: KEY, MAIL_RETRY_MS: "0", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "s", DATA_KEY: "k", MAIL_WARMUP_START: "2026-11-20", MAIL_DAILY_LIMIT: "0" } as any;
  console.warn = (...a: unknown[]) => { warns.push(a.map(String).join(" ")); };
  (globalThis as any).fetch = async (url: string, init?: any) => {
    const u = String(url), who = u === "https://api.resend.com/emails" ? "resend" : u.startsWith("https://api.cloudflare.com/") ? "cf" : null;
    if (!who) return new Response("{}", { status: 404 });
    const body = JSON.parse(init.body);
    calls.push({ who, key: init.headers["idempotency-key"] ?? null, to: who === "resend" ? body.to[0] : body.to, subject: body.subject });
    if (who === "cf") return new Response(JSON.stringify({ success: true }), { status: 200 });
    const r = resend(by("resend").length); if (r === "throw") throw new Error("down");
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.warn = realWarn; });

const tx = (to = "boss@acme.com", subject = "Corporate Tambola: invoice CT/1", now = D1ST) => sendMail(env, env.DB, to, subject, "INVOICE", now);
const bulk = (to = "lead@acme.com", subject = "Finish your draft", now = D1ST) => sendMail(env, env.DB, to, subject, "Finish it", now, { lane: "bulk" });

describe("the lane rule (pure): bulkDecision", () => {
  const U0 = { txToday: 0, bulkToday: 0, txMonth: 0, bulkMonth: 0 };
  test("warm-up day 1: no bulk mail at all, whatever the room; the ramp is never a decrease and never a jump over 100 a day", () => {
    expect(bulkDecision(U0, 1, 0, 3000)).toEqual({ allow: false, why: "warmup day 1: transactional mail only" });
    expect(bulkCapForDay(1)).toBe(0);
    for (let d = 2; d <= WARMUP_BULK_CAPS.length; d++) { expect(bulkCapForDay(d)).toBeGreaterThanOrEqual(bulkCapForDay(d - 1)); expect(bulkCapForDay(d) - bulkCapForDay(d - 1)).toBeLessThanOrEqual(100); }
    expect(bulkCapForDay(2)).toBe(20); expect(bulkCapForDay(WARMUP_BULK_CAPS.length + 1)).toBe(BULK_AFTER_WARMUP); expect(bulkCapForDay(0)).toBe(0);
  });
  test("the day's ramp cap stops bulk mail: day 2 allows 20, the 21st waits", () => {
    expect(bulkDecision({ ...U0, bulkToday: 19 }, 2, 0, 3000).allow).toBe(true);
    expect(bulkDecision({ ...U0, bulkToday: 20 }, 2, 0, 3000)).toMatchObject({ allow: false, why: expect.stringContaining("warmup cap 20") });
  });
  test("transactional mail keeps half of the daily limit: with a limit of 100, bulk gets at most 50 a day when no transactional mail was sent", () => {
    expect(bulkDecision({ ...U0, bulkToday: 49 }, 20, 100, 3000).allow).toBe(true);
    expect(bulkDecision({ ...U0, bulkToday: 50 }, 20, 100, 3000)).toMatchObject({ allow: false, why: expect.stringContaining("daily limit") });
  });
  test("transactional mail that went beyond its half gives bulk less room (the day is shared), never more", () => {
    // tx used 80 of 100: the reserve is used up, so bulk may use what is left of the day (19 more), not 50
    expect(bulkDecision({ ...U0, txToday: 80, bulkToday: 19 }, 20, 100, 3000).allow).toBe(true);
    expect(bulkDecision({ ...U0, txToday: 80, bulkToday: 20 }, 20, 100, 3000).allow).toBe(false);
    // tx used 10: still 40 of its half unused and kept, so bulk may use 50
    expect(bulkDecision({ ...U0, txToday: 10, bulkToday: 49 }, 20, 100, 3000).allow).toBe(true);
    expect(bulkDecision({ ...U0, txToday: 10, bulkToday: 50 }, 20, 100, 3000).allow).toBe(false);
  });
  test("the month is shared the same way: with 3000 a month bulk gets at most 1500 while transactional mail uses nothing", () => {
    expect(bulkDecision({ ...U0, bulkMonth: 1499 }, 30, 0, 3000).allow).toBe(true);
    expect(bulkDecision({ ...U0, bulkMonth: 1500 }, 30, 0, 3000)).toMatchObject({ allow: false, why: expect.stringContaining("monthly quota") });
  });
  test("a daily limit of 0 means the plan has none", () => {
    expect(bulkDecision({ ...U0, bulkToday: 300 }, 30, 0, 100000).allow).toBe(true);
  });
});

describe("day 1 of the warm-up: only transactional mail", () => {
  test("an invoice goes out; a bulk mail does not touch the provider, it waits in the queue and the log says why", async () => {
    expect(await tx()).toBe(true);
    expect(await bulk()).toBe(false);
    expect(by("resend").map((c) => c.subject)).toEqual(["[Tambola] Corporate Tambola: invoice CT/1"]);
    const queued = q("SELECT to_addr, subject FROM mail_bulk_queue"); expect(queued).toEqual([{ to_addr: "lead@acme.com", subject: expect.stringContaining("Finish your draft") }]);
    expect(q("SELECT outcome FROM mail_event").map((e) => e.outcome)).toEqual(["bulk_waiting warmup day 1: transactional mail only"]);
    expect(q("SELECT COUNT(*) c FROM outbox WHERE subject LIKE '%Finish%'")[0].c).toBe(0); // never in the transactional outbox, so the transactional retry can never pick it up
  });
  test("the day number follows the clock: MAIL_WARMUP_START is day 1, the next day is day 2", async () => {
    expect(await warmupDay(env.DB, env, D1ST)).toBe(1); expect(await warmupDay(env.DB, env, D1ST + DAY)).toBe(2); expect(await warmupDay(env.DB, env, dayAt(15))).toBe(15);
  });
  test("with no date set, the day the code first handles a mail is day 1, and it stays the same on every later call", async () => {
    delete (env as any).MAIL_WARMUP_START;
    expect(await warmupDay(env.DB, env, D1ST, true)).toBe(1);
    expect(q("SELECT v FROM kv WHERE k='mail/warmup_start'")).toEqual([{ v: "2026-11-20" }]);
    expect(await warmupDay(env.DB, env, D1ST + 3 * DAY, true)).toBe(4);
    expect(q("SELECT v FROM kv WHERE k='mail/warmup_start'")).toEqual([{ v: "2026-11-20" }]);
  });
});

describe("the ramp: bulk mail follows the day's cap, in its own counter", () => {
  test("day 2: 20 bulk mails go, the 21st waits; transactional mail is not counted in the bulk cap", async () => {
    const t = dayAt(2);
    for (let i = 0; i < 5; i++) expect(await tx(`t${i}@acme.com`, "invoice " + i, t)).toBe(true);
    for (let i = 0; i < 20; i++) expect([i, await bulk(`b${i}@acme.com`, "reminder " + i, t)]).toEqual([i, true]);
    expect(await bulk("late@acme.com", "reminder late", t)).toBe(false);
    expect(await readUsage(env.DB, t)).toMatchObject({ txToday: 5, bulkToday: 20, txMonth: 5, bulkMonth: 20 });
    expect(q("SELECT to_addr FROM mail_bulk_queue")).toEqual([{ to_addr: "late@acme.com" }]);
    expect(q("SELECT outcome FROM mail_event").map((e) => e.outcome)).toEqual([expect.stringContaining("warmup cap 20")]);
  });
  test("a transactional mail is NEVER refused or delayed because the bulk lane is full: 70 invoices after a full bulk lane all go out at once", async () => {
    env.MAIL_DAILY_LIMIT = "100"; const t = dayAt(20);
    for (let i = 0; i < 60; i++) await bulk(`b${i}@acme.com`, "reminder " + i, t); // only the bulk half of the day (50) goes
    expect((await readUsage(env.DB, t)).bulkToday).toBe(50); expect(q("SELECT COUNT(*) c FROM mail_bulk_queue")[0].c).toBe(10);
    const before = by("resend").length;
    for (let i = 0; i < 70; i++) expect([i, await tx(`t${i}@acme.com`, "invoice " + i, t)]).toEqual([i, true]);
    expect(by("resend").length - before).toBe(70); // every invoice went to the provider immediately
    expect((await readUsage(env.DB, t)).txToday).toBe(70);
  });
  test("the bulk lane keeps off the part of the day that transactional mail keeps: with a daily limit of 100, bulk stops at 50 even on a late day", async () => {
    env.MAIL_DAILY_LIMIT = "100"; const t = dayAt(40);
    let sent = 0; for (let i = 0; i < 80; i++) if (await bulk(`b${i}@acme.com`, "r" + i, t)) sent++;
    expect(sent).toBe(50);
  });
});

describe("the bulk lane uses only the main route and never holds the main route's retry", () => {
  test("a quota answer to a bulk mail: ONE call, no Cloudflare, the mail waits; Resend is then paused for everybody, so the next invoice goes straight to Cloudflare", async () => {
    env.CF_EMAIL_TOKEN = TOKEN; env.CF_ACCOUNT_ID = ACC; const t = dayAt(5);
    resend = () => quota429;
    expect(await bulk("lead@acme.com", "reminder", t)).toBe(false);
    expect(by("resend").length).toBe(1); expect(by("cf").length).toBe(0);
    expect(q("SELECT COUNT(*) c FROM mail_bulk_queue")[0].c).toBe(1);
    expect(await tx("boss@acme.com", "invoice", t + MIN)).toBe(true);
    expect(by("resend").length).toBe(1); expect(by("cf").map((c) => c.subject)).toEqual(["[Tambola] invoice"]); // Resend skipped (paused): the invoice used the second route
  });
  test("without the Cloudflare secrets a bulk quota answer still pauses bulk (no wasted calls) and an invoice still tries Resend", async () => {
    const t = dayAt(5); resend = () => quota429;
    await bulk("lead@acme.com", "reminder", t); expect(by("resend").length).toBe(1);
    expect((await bulk("lead2@acme.com", "reminder2", t + MIN))).toBe(false); expect(by("resend").length).toBe(1); // bulk: paused, no call
    resend = () => ({ status: 200, body: { id: "em_ok" } });
    expect(await tx("boss@acme.com", "invoice", t + 2 * MIN)).toBe(true); expect(by("resend").length).toBe(2); // transactional: still asks Resend
  });
  test("a failed bulk mail does not enter the transactional outbox, so the transactional retry loop never spends a try on it", async () => {
    const t = dayAt(5); resend = () => ({ status: 500 });
    expect(await bulk("lead@acme.com", "reminder", t)).toBe(false);
    expect(q("SELECT COUNT(*) c FROM outbox WHERE sent=0 AND body<>''")[0].c).toBe(0);
    expect(q("SELECT COUNT(*) c FROM mail_bulk_queue")[0].c).toBe(1);
    const n = by("resend").length; await retryRecentOutbox(env, t + 10 * MIN); expect(by("resend").length).toBe(n);
  });
});

describe("the tick sends waiting bulk mail, after and never before the transactional retry", () => {
  const EVE = D1ST + 12 * 3_600_000; // 22:00 UTC on day 1
  const queueOne = async (t: number, to = "lead@acme.com") => { await env.DB.prepare("INSERT INTO mail_bulk_queue(at_ms,to_addr,subject,body,html) VALUES(?,?,?,?,NULL)").bind(t, to, "[Tambola] reminder", "Finish it").run(); };
  test("day 1 queues, day 2 the tick sends it with its own key and the queue is empty", async () => {
    expect(await bulk("lead@acme.com", "reminder", EVE)).toBe(false); expect(q("SELECT COUNT(*) c FROM mail_bulk_queue")[0].c).toBe(1);
    expect(await drainBulkMail(env, EVE + 2 * MIN)).toBe(0); // still day 1
    const n = by("resend").length;
    expect(await drainBulkMail(env, dayAt(2) + 2 * 3_600_000)).toBe(1);
    expect(by("resend").length - n).toBe(1); expect(by("resend").at(-1)!.key).toMatch(/^bulkq-\d+$/);
    expect(q("SELECT COUNT(*) c FROM mail_bulk_queue")[0].c).toBe(0); expect((await readUsage(env.DB, dayAt(2))).bulkToday).toBe(1);
  });
  test("while an invoice is waiting for its retry the bulk queue sends nothing (the invoice goes first)", async () => {
    await queueOne(EVE);
    const t = dayAt(2) + 2 * 3_600_000;
    await env.DB.prepare("INSERT INTO outbox(to_addr,subject,body,at_ms,sent) VALUES('boss@acme.com','invoice','INVOICE',?,0)").bind(t - 5 * MIN).run();
    const n = by("resend").length;
    expect(await drainBulkMail(env, t)).toBe(0); expect(by("resend").length).toBe(n);
    expect(q("SELECT COUNT(*) c FROM mail_bulk_queue")[0].c).toBe(1);
    await env.DB.prepare("UPDATE outbox SET sent=1, body=''").run();
    expect(await drainBulkMail(env, t + MIN)).toBe(1);
  });
  test("a waiting mail older than 24 hours is dropped, not sent late; the hourly tick also clears it", async () => {
    await queueOne(D1ST);
    expect(await drainBulkMail(env, dayAt(2) + 2 * 3_600_000)).toBe(0); expect(q("SELECT COUNT(*) c FROM mail_bulk_queue")[0].c).toBe(0); // 26 hours old: dropped, nothing sent
    await queueOne(D1ST + 5 * DAY); await adminTick(env.DB, D1ST + 5 * DAY + BULK_QUEUE_KEEP_MS + MIN); expect(q("SELECT COUNT(*) c FROM mail_bulk_queue")[0].c).toBe(0);
  });
  test("an address that went on the do-not-mail list while its mail waited is dropped, not mailed", async () => {
    await queueOne(EVE);
    await env.DB.prepare("INSERT INTO mail_suppress(to_hash,to_mask,reason,at_ms) VALUES(?,?,?,?)").bind(await suppressKey("lead@acme.com"), "l***@acme.com", "complained", D1ST).run();
    const n = by("resend").length;
    expect(await drainBulkMail(env, dayAt(2) + 2 * 3_600_000)).toBe(0); expect(by("resend").length).toBe(n); expect(q("SELECT COUNT(*) c FROM mail_bulk_queue")[0].c).toBe(0);
  });
  test("a provider refusal stops the tick's bulk sending (the rest would be refused too) and the mail stays for the next tick", async () => {
    await queueOne(EVE, "a@acme.com"); await queueOne(EVE, "b@acme.com");
    resend = () => ({ status: 500 }); const n = by("resend").length;
    expect(await drainBulkMail(env, dayAt(2) + 2 * 3_600_000)).toBe(0); expect(by("resend").length - n).toBe(1);
    expect(q("SELECT COUNT(*) c FROM mail_bulk_queue")[0].c).toBe(2);
  });
});

describe("the send counter counts what the provider ACCEPTED, per lane and per route", () => {
  test("refusals and failures are not counted; the Cloudflare route is counted apart and does not use the Resend quota", async () => {
    env.CF_EMAIL_TOKEN = TOKEN; env.CF_ACCOUNT_ID = ACC; const t = dayAt(3);
    resend = (n) => (n === 1 ? { status: 400, body: { name: "validation_error" } } : { status: 200, body: { id: "em_" + n } });
    expect(await tx("bad@acme.com", "invoice bad", t)).toBe(false); expect(await readUsage(env.DB, t)).toMatchObject({ txMonth: 0, cfMonth: 0 });
    expect(await tx("ok@acme.com", "invoice ok", t)).toBe(true); expect(await readUsage(env.DB, t)).toMatchObject({ txToday: 1, txMonth: 1 });
    resend = () => quota429; expect(await tx("cf@acme.com", "invoice cf", t + MIN)).toBe(true);
    expect(await readUsage(env.DB, t)).toMatchObject({ txToday: 1, txMonth: 1, cfToday: 1, cfMonth: 1 });
  });
  test("a report mail (sent with an attachment) counts as transactional", async () => {
    const { sendReportMail } = await import("../src/pay");
    expect(await sendReportMail(env, "boss@acme.com", "Your report", "text", [{ filename: "r.pdf", content: new Uint8Array([1, 2]) }])).toBe(true);
    expect((await readUsage(env.DB, Date.now())).txMonth).toBe(1);
  });
});

describe("80 % of the provider's monthly quota raises the alert (a log line and the status address)", () => {
  beforeEach(() => { env.MAIL_MONTHLY_QUOTA = "10"; });
  test("7 of 10: nothing; the 8th: ONE log line and an alert on the status address; the 9th: no second line; the 10th: the critical line, once", async () => {
    const t = dayAt(3);
    for (let i = 1; i <= 7; i++) await tx(`t${i}@acme.com`, "i" + i, t);
    expect(warns).toEqual([]); expect((await mailStatus(env.DB, env, t)).alert).toBeNull();
    await tx("t8@acme.com", "i8", t); expect(warns.length).toBe(1);
    expect(warns[0]).toMatch(/^\[mail-alert\] WARN: 8 of 10 mails of the month sent \(80 %/);
    const s8 = await mailStatus(env.DB, env, t); expect(s8).toMatchObject({ ok: false, level: "warn", alert: "warn", quota: { monthly: 10, sent: 8, pct: 80 } });
    await tx("t9@acme.com", "i9", t); expect(warns.length).toBe(1);
    await tx("t10@acme.com", "i10", t); expect(warns.length).toBe(2); expect(warns[1]).toMatch(/CRITICAL: 10 of 10/);
    expect(await mailStatus(env.DB, env, t)).toMatchObject({ level: "critical", alert: "critical" });
    await tx("t11@acme.com", "i11", t); expect(warns.length).toBe(2);
  });
  test("a new month starts again at zero (the alert can come again); bulk mail counts toward the same quota", async () => {
    const t = dayAt(3);
    for (let i = 1; i <= 4; i++) await tx(`t${i}@acme.com`, "i" + i, t);
    for (let i = 1; i <= 4; i++) await bulk(`b${i}@acme.com`, "b" + i, t);
    expect(warns.length).toBe(1); // 4 + 4 = 8 of 10
    const next = Date.UTC(2026, 11, 3, 10); // December
    expect((await mailStatus(env.DB, env, next)).quota.sent).toBe(0);
    for (let i = 1; i <= 8; i++) await tx(`n${i}@acme.com`, "n" + i, next); expect(warns.length).toBe(2);
  });
  test("the alert line carries numbers only: no address, no key, no token", async () => {
    env.CF_EMAIL_TOKEN = TOKEN; env.CF_ACCOUNT_ID = ACC; const t = dayAt(3);
    for (let i = 1; i <= 8; i++) await tx(`secret.person${i}@acme.com`, "i" + i, t);
    const text = warns.join("\n"); for (const bad of ["acme", "secret.person", KEY, TOKEN, ACC, "@"]) expect(text).not.toContain(bad);
  });
});

describe("GET /api/status/mail: public and short; the full numbers are the owner's", () => {
  const call = (method: string, path = "/api/status/mail", headers: Record<string, string> = {}, now = D1ST) => handle(new Request("http://x" + path, { method, headers }), env, now);
  const OWNER = { "x-organizer": "plat" };
  test("the public answer has only ok, level, time and the organizer note: no counters, no plan size, no route setting, no secret or address", async () => {
    env.CF_EMAIL_TOKEN = TOKEN; env.CF_ACCOUNT_ID = ACC;
    await tx("secret.person@acme.com", "invoice"); await bulk("lead@acme.com", "r");
    const r = await call("GET"); expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toBe("no-store");
    const s: any = await r.json();
    expect(Object.keys(s).sort()).toEqual(["at", "level", "ok", "organizer"]);
    expect(s).toMatchObject({ ok: true, level: "ok", organizer: { degraded: "none", note: null } });
    const text = JSON.stringify(s); for (const bad of ["acme", "secret.person", KEY, TOKEN, ACC, "quota", "cloudflare", "lanes", "warmup", "doNotMail"]) expect(text).not.toContain(bad);
  });
  test("the public answer is read from the database at most every 30 seconds (a loop on the address, and every payment-done screen, share one read)", async () => {
    const reads = () => { let n = 0; const real = env.DB.prepare.bind(env.DB); (env.DB as any).prepare = (sql: string) => { if (/mail_count|mail_suppress|mail_bulk_queue/.test(sql)) n++; return real(sql); }; return () => n; };
    const n = reads();
    await call("GET", "/api/status/mail", {}, D1ST); const first = n(); expect(first).toBeGreaterThan(0);
    for (let i = 1; i <= 5; i++) await call("GET", "/api/status/mail", {}, D1ST + i * 5000); expect(n()).toBe(first); // five more calls inside 30 s: no new reads
    await call("GET", "/api/status/mail", {}, D1ST + STATUS_TTL_MS + 1000); expect(n()).toBeGreaterThan(first); // after 30 s: one fresh read
  });
  test("the full numbers (lanes, plan size, warm-up day, backup route set, do-not-mail count) are behind the owner key", async () => {
    env.CF_EMAIL_TOKEN = TOKEN; env.CF_ACCOUNT_ID = ACC;
    await tx("secret.person@acme.com", "invoice"); await bulk("lead@acme.com", "r");
    for (const h of [{}, { "x-organizer": "wrong" }, { ...OWNER, "x-cb-link": "1" }]) expect((await call("GET", "/api/owner/mail-status", h as any)).status).toBe(404);
    const s: any = await (await call("GET", "/api/owner/mail-status", OWNER)).json();
    expect(s).toMatchObject({ ok: true, level: "ok", alert: null, month: "2026-11", quota: { monthly: 3000, sent: 1, pct: 0, providerSaysUsedUp: false }, cloudflare: { configured: true, today: 0 },
      lanes: { tx: { today: 1, month: 1 }, bulk: { today: 0, todayCap: 0, allowedNow: false, waiting: 1 } }, warmup: { day: 1, startedOn: "2026-11-20", bulkCapToday: 0, transactionalOnly: true } });
    const text = JSON.stringify(s); for (const bad of ["acme", "secret.person", KEY, TOKEN, ACC]) expect(text).not.toContain(bad);
  });
  test("a day later bulk is allowed (cap 20) and the day number moves; reading the status never starts the warm-up clock", async () => {
    delete (env as any).MAIL_WARMUP_START;
    const s: any = await (await call("GET", "/api/owner/mail-status", OWNER)).json(); expect(s.warmup).toMatchObject({ day: 1, startedOn: null });
    expect(q("SELECT COUNT(*) c FROM kv WHERE k='mail/warmup_start'")[0].c).toBe(0);
  });
  test("only GET and HEAD; it still answers while the site is switched off; a Resend quota answer shows as providerSaysUsedUp and not ok", async () => {
    expect((await call("POST")).status).toBe(404);
    await env.DB.prepare("INSERT INTO kv(k,v) VALUES('site/off','{}')").run();
    expect((await call("GET", "/api/z/ABCD/control", {}, D1ST + 60_000)).status).toBe(503); // the switch is really on (the cache is looked at a minute later)
    expect((await call("GET", "/api/status/mail", {}, D1ST + 60_000)).status).toBe(200);
    await env.DB.prepare("DELETE FROM kv WHERE k='site/off'").run();
  });
  test("when the provider says its quota is used up the status says so and the bulk lane says why it is closed (also on a day when the ramp would allow it)", async () => {
    const t = dayAt(5);
    expect((await mailStatus(env.DB, env, t)).lanes.bulk).toMatchObject({ allowedNow: true, todayCap: 50 });
    await env.DB.prepare("INSERT INTO kv(k,v) VALUES('mail_resend_pause_until',?)").bind(String(t + 10 * MIN)).run();
    const s = await mailStatus(env.DB, env, t + MIN);
    expect(s).toMatchObject({ ok: false, quota: { providerSaysUsedUp: true }, lanes: { bulk: { allowedNow: false, why: "the provider said its quota is used up" } } });
    expect((await mailStatus(env.DB, env, t + 11 * MIN)).quota.providerSaysUsedUp).toBe(false); // the pause is over
  });
});

describe("only retention-listed data is kept, and for as long as the list says", () => {
  test("the hourly tick forgets old counters (100 days), per-mail rows (3 days), do-not-mail rows (365 days)", async () => {
    const T = D1ST + 400 * DAY;
    await env.DB.prepare("INSERT INTO mail_count(day,lane,provider,n) VALUES('2026-11-20','tx','resend',5),(?,'tx','resend',5)").bind(new Date(T - 5 * DAY).toISOString().slice(0, 10)).run();
    await env.DB.prepare("INSERT INTO mail_track(ref,at_ms,to_hash,subject,lane,state,rank,state_ms) VALUES('old',?,'h','s','tx','sent',0,0),('new',?,'h','s','tx','sent',0,0)").bind(T - 4 * DAY, T - DAY).run();
    await env.DB.prepare("INSERT INTO mail_suppress(to_hash,to_mask,reason,at_ms) VALUES('hold','o***@x.com','complained',?),('hnew','n***@x.com','complained',?)").bind(T - 366 * DAY, T - 100 * DAY).run();
    await adminTick(env.DB, T);
    expect(q("SELECT day FROM mail_count").length).toBe(1); expect(q("SELECT ref FROM mail_track")).toEqual([{ ref: "new" }]); expect(q("SELECT to_hash FROM mail_suppress")).toEqual([{ to_hash: "hnew" }]);
  });
});

describe("which mails are bulk: the draft reminder and the Help Desk invitation; everything else stays transactional", () => {
  const H = 3_600_000, T0 = Date.UTC(2026, 9, 1, 10, 0, 0); // 1 Oct 2026, warm-up day 1 for this test
  test("a draft reminder is a bulk mail: on warm-up day 1 it waits in the queue (the provider is not called), the next day's tick sends it", async () => {
    const { withDevice } = await import("./device"); const { remindDrafts } = await import("../src/worker");
    env.MAIL_WARMUP_START = "2026-10-01";
    const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T0) =>
      handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
    const j = (await (await call("POST", "/api/start", { email: "boss@acme.com" }, { "cf-connecting-ip": "1.1.1.1" })).json()) as any, h = { "x-organizer": j.token as string };
    const round = Math.floor(((T0 + 20 * H) / 1000 - 1692803367) / 3) + 1;
    expect((await call("POST", "/api/z", { id: "DR-B", startRound: round, callSeconds: 6, cap: 100 }, h, T0 - 3 * H)).status).toBe(200);
    calls.length = 0; // the sign-in mail of the organizer is not what is looked at
    await remindDrafts(env, T0);
    expect(by("resend").filter((c) => /not published yet/.test(c.subject)).length).toBe(0);
    expect(q("SELECT subject FROM mail_bulk_queue").map((r) => r.subject)).toEqual([expect.stringContaining("DR-B is not published yet")]);
    expect(await drainBulkMail(env, T0 + 14 * H)).toBe(1); // 2 Oct 00:00 UTC, day 2
    expect(by("resend").filter((c) => /not published yet/.test(c.subject)).length).toBe(1);
  });
  test("the draft reminder is the ONLY bulk mail: the Help Desk invitation (a live link), the sign-in code, invoice and payment mails are all transactional", async () => {
    const { readFileSync } = await import("node:fs");
    const src = (f: string) => readFileSync(new URL("../src/" + f, import.meta.url), "utf8");
    const marked = ["worker.ts", "pay.ts", "partners.ts", "hostsetup.ts", "credit.ts", "rights.ts", "people.ts", "v2-receipts.ts", "v2-host.ts", "v2-support.ts", "owner-mail.ts", "helpdesk.ts"].flatMap((f) => [...src(f).matchAll(/lane: "bulk"/g)].map(() => f));
    expect(marked.filter((f) => f === "worker.ts").length).toBe(1); // only the draft reminder
    expect(marked.filter((f) => f === "pay.ts").length).toBe(0); // no invoice, receipt or payment mail is bulk
    for (const f of ["partners.ts", "hostsetup.ts", "credit.ts", "rights.ts", "people.ts", "v2-receipts.ts", "v2-host.ts", "v2-support.ts", "owner-mail.ts", "helpdesk.ts"]) expect([f, marked.includes(f)]).toEqual([f, false]);
    expect(src("helpdesk.ts")).toMatch(/asks to prepare Corporate Tambola games for you[\s\S]{0,900}\{ secret: true \}\)/);
  });
  test("1.11.0 audit M1: a `secret` mail that reaches the bulk lane is never queued: no address, no body, no link is kept; it is dropped and the log says why", async () => {
    // day 1: the bulk cap is 0, so a bulk mail would normally wait in the queue
    expect(await sendMail(env, env.DB, "helper.target@acme.com", "invite", "https://tambola.test/helpdesk-accept.html?t=" + "a".repeat(48), D1ST, { lane: "bulk", secret: true })).toBe(false);
    expect(q("SELECT COUNT(*) c FROM mail_bulk_queue")[0].c).toBe(0);
    expect(q("SELECT COUNT(*) c FROM outbox WHERE body<>''")[0].c).toBe(0);
    expect(JSON.stringify(q("SELECT * FROM mail_bulk_queue"))).not.toMatch(/helpdesk-accept|helper\.target/);
    expect(q("SELECT outcome FROM mail_event").map((e) => e.outcome).join("|")).toMatch(/bulk_secret_dropped/);
    // the provider refusing a secret bulk mail on an open day does not queue it either
    resend = () => ({ status: 500 });
    expect(await sendMail(env, env.DB, "helper.target@acme.com", "invite", "https://tambola.test/helpdesk-accept.html?t=" + "b".repeat(48), dayAt(6), { lane: "bulk", secret: true })).toBe(false);
    expect(q("SELECT COUNT(*) c FROM mail_bulk_queue")[0].c).toBe(0);
    // a plain (not secret) bulk mail still waits as before
    expect(await sendMail(env, env.DB, "lead@acme.com", "reminder", "x", D1ST, { lane: "bulk" })).toBe(false);
    expect(q("SELECT COUNT(*) c FROM mail_bulk_queue")[0].c).toBe(1);
  });
});
