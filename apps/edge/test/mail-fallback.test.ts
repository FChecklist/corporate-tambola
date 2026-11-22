// Owner decision 2026-11-17 + RCA 2026-11-20: the Resend account is shared by the products and its MONTHLY quota ran out, so the Rs 1 invoice mail was refused ("429 monthly_quota_exceeded").
// Transactional mail now falls back to Cloudflare Email Service (the owner's own account) when Resend answers a quota, a busy (429) or a server error (5xx) or does not answer:
// ONE idempotency key for the mail on both paths, one fallback send, no second mail when Resend took it, a plain refusal never re-sent, and the reason always logged.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { makeD1 } from "./d1-sqlite";
import { RESEND_PAUSE_MS, cfFrom, retryRecentOutbox, sendMail, type PayEnv } from "../src/pay";
import { adminTick, MAIL_LOG_KEEP_MS } from "../src/admin";

const T = Date.UTC(2026, 10, 20, 16, 0, 0), MIN = 60_000, ACC = "ac433821e311dbc89d0e002a192f92bc", TOKEN = "cf-secret-token-123";
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"];
const realFetch = globalThis.fetch;
type Call = { who: "resend" | "cf"; key: string | null; to: string; auth: string; url: string; body: any; signal: boolean };
let calls: Call[]; let resend: (n: number) => { status: number; body?: unknown } | "throw"; let cf: (n: number) => { status: number; body?: unknown } | "throw";
const q = (sql: string, ...a: unknown[]) => raw.prepare(sql).all(...(a as any[])) as any[];
const by = (who: Call["who"]) => calls.filter((c) => c.who === who);

beforeEach(() => {
  const d = makeD1(); raw = d.raw; calls = [];
  resend = () => ({ status: 200 }); cf = () => ({ status: 200, body: { success: true, result: { delivered: ["x"] } } });
  env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "100000", RESEND_API_KEY: "re_test", MAIL_RETRY_MS: "0", PUBLIC_ORIGIN: "https://tambola.test", CF_EMAIL_TOKEN: TOKEN, CF_ACCOUNT_ID: ACC } as any;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    const u = String(url), who = u === "https://api.resend.com/emails" ? "resend" : u.startsWith("https://api.cloudflare.com/client/v4/accounts/") ? "cf" : null;
    if (!who) return new Response("{}", { status: 404 });
    const body = JSON.parse(init.body);
    calls.push({ who, key: init.headers["idempotency-key"] ?? null, to: who === "resend" ? body.to[0] : body.to, auth: init.headers.authorization, url: u, body, signal: !!init.signal });
    const r = (who === "resend" ? resend : cf)(by(who).length); if (r === "throw") throw new Error("network down");
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const send = (to = "boss@acme.com", subject = "Corporate Tambola: invoice CT/2026-27/000001 for your game", now = T) => sendMail(env, env.DB, to, subject, "INVOICE ...", now);
const quota = { status: 429, body: { name: "monthly_quota_exceeded", message: "You have used the monthly quota of boss@acme.com" } };

describe("Resend answers 'quota used up': the mail goes out through Cloudflare Email, once", () => {
  test("429 monthly_quota_exceeded: Resend is asked ONCE (no useless retries), Cloudflare gets the same mail with the SAME key, the mail counts as sent", async () => {
    resend = () => quota;
    expect(await send()).toBe(true);
    expect(by("resend").length).toBe(1); expect(by("cf").length).toBe(1);
    const c = by("cf")[0]!, r = by("resend")[0]!;
    expect(c.key).toBeTruthy(); expect(c.key).toBe(r.key); // one key for the mail on both paths
    expect(c.url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACC}/email/sending/send`); expect(c.auth).toBe(`Bearer ${TOKEN}`);
    expect(c.to).toBe("boss@acme.com"); expect(c.body.from).toBe("Corporate Tambola <hello@corporatetambola.com>");
    expect(c.body.subject).toContain("invoice CT/2026-27/000001"); expect(c.body.text).toContain("INVOICE"); expect(typeof c.body.html).toBe("string");
    expect(q("SELECT sent, body FROM outbox")).toEqual([{ sent: 1, body: "" }]);
    const ev = q("SELECT outcome FROM mail_event").map((e) => e.outcome); expect(ev).toEqual(["resend_failed 429 monthly_quota_exceeded; sent_by_cloudflare"]);
    expect(JSON.stringify(ev)).not.toContain("boss@acme.com"); expect(JSON.stringify(ev)).not.toContain(TOKEN);
  });
  test("both providers have a time limit on the call (a stuck provider cannot hold the tick)", async () => {
    resend = () => quota; await send();
    expect(by("resend")[0]!.signal).toBe(true); expect(by("cf")[0]!.signal).toBe(true);
  });
  test("after a quota answer Resend is not asked again for 30 minutes (every mail goes straight to Cloudflare), then it is asked again", async () => {
    resend = () => quota; await send("a@acme.com");
    expect(by("resend").length).toBe(1);
    await send("b@acme.com", "second", T + 10 * MIN); expect(by("resend").length).toBe(1); expect(by("cf").length).toBe(2); // paused: no call to Resend
    expect(q("SELECT outcome FROM mail_event").map((e) => e.outcome)[1]).toBe("resend_failed 429 quota (paused); sent_by_cloudflare");
    resend = () => ({ status: 200 });
    await send("c@acme.com", "third", T + RESEND_PAUSE_MS + MIN); expect(by("resend").length).toBe(2); expect(by("cf").length).toBe(2); // pause over: Resend again, and it works
  });
});

describe("a busy or broken Resend: tried again, then the same mail goes through Cloudflare (one key, no double send)", () => {
  test("500 on all three tries: Resend 3 times, then Cloudflare once, same key", async () => {
    resend = () => ({ status: 500 });
    expect(await send()).toBe(true); expect(by("resend").length).toBe(3); expect(by("cf").length).toBe(1);
    expect(new Set([...by("resend"), ...by("cf")].map((c) => c.key)).size).toBe(1);
    expect(q("SELECT outcome FROM mail_event").map((e) => e.outcome)).toEqual(["resend_failed 500; sent_by_cloudflare"]);
  });
  test("no answer at all from Resend: Cloudflare takes it, the reason is 'network'", async () => {
    resend = () => "throw"; expect(await send()).toBe(true); expect(by("cf").length).toBe(1);
    expect(q("SELECT outcome FROM mail_event").map((e) => e.outcome)).toEqual(["resend_failed network; sent_by_cloudflare"]);
  });
  test("Resend answers on the second try: Cloudflare is never used (no double send)", async () => {
    resend = (n) => (n === 1 ? { status: 429, body: { name: "rate_limit_exceeded" } } : { status: 200 });
    expect(await send()).toBe(true); expect(by("resend").length).toBe(2); expect(by("cf").length).toBe(0);
    expect(q("SELECT * FROM mail_event").length).toBe(0);
  });
  test("Resend accepts the mail at once: Cloudflare is never used", async () => {
    expect(await send()).toBe(true); expect(by("cf").length).toBe(0); expect(by("resend").length).toBe(1);
  });
});

describe("what is NOT sent a second way, and what is logged when nothing works", () => {
  test("a plain refusal from Resend (403 validation_error: bad address or sender) is not repeated and not sent through Cloudflare", async () => {
    resend = () => ({ status: 403, body: { name: "validation_error" } });
    expect(await send("tester+x@example.com")).toBe(false); expect(by("resend").length).toBe(1); expect(by("cf").length).toBe(0);
    expect(q("SELECT outcome FROM mail_event").map((e) => e.outcome)).toEqual(["send_failed 403 validation_error"]);
  });
  test("both fail: not sent, the body is kept for the retries, both reasons are logged (status and error code only)", async () => {
    resend = () => quota; cf = () => ({ status: 400, body: { success: false, errors: [{ code: 10001, message: "sender boss@acme.com not verified" }] } });
    expect(await send()).toBe(false);
    const row = q("SELECT sent, body FROM outbox")[0]!; expect(row.sent).toBe(0); expect(row.body).toContain("INVOICE");
    const ev = q("SELECT outcome FROM mail_event").map((e) => e.outcome); expect(ev).toEqual(["send_failed 429 monthly_quota_exceeded; cloudflare 400 code10001"]);
    expect(JSON.stringify(ev)).not.toContain("not verified"); expect(JSON.stringify(ev)).not.toContain("boss@acme.com");
  });
  test("Cloudflare says success:false with a 200: not counted as sent", async () => {
    resend = () => quota; cf = () => ({ status: 200, body: { success: false, errors: [] } });
    expect(await send()).toBe(false); expect(q("SELECT sent FROM outbox")).toEqual([{ sent: 0 }]);
  });
  test("without the two Cloudflare settings nothing changes: Resend quota answer is logged, no second path", async () => {
    delete (env as any).CF_EMAIL_TOKEN; resend = () => quota;
    expect(await send()).toBe(false); expect(by("cf").length).toBe(0); expect(by("resend").length).toBe(1);
    expect(q("SELECT outcome FROM mail_event").map((e) => e.outcome)).toEqual(["send_failed 429 monthly_quota_exceeded"]);
  });
  test("an account id that is not 32 hex characters is never put into the address", async () => {
    env.CF_ACCOUNT_ID = "../../evil"; resend = () => quota; expect(await send()).toBe(false); expect(by("cf").length).toBe(0);
  });
});

describe("the scheduled retry uses the second path too, one try a tick", () => {
  test("an unsent invoice mail is sent through Cloudflare by the tick; Resend is asked once (the tick is the retry loop); both calls carry key outbox-<id>", async () => {
    resend = () => ({ status: 500 }); cf = () => ({ status: 500 }); // the first send fails everywhere
    await send(); expect(q("SELECT sent FROM outbox")).toEqual([{ sent: 0 }]);
    calls = []; cf = () => ({ status: 200, body: { success: true } });
    expect(await retryRecentOutbox(env, T + 3 * MIN)).toBe(1);
    expect(by("resend").length).toBe(1); expect(by("cf").length).toBe(1);
    expect(by("cf")[0]!.key).toMatch(/^outbox-\d+$/); expect(by("cf")[0]!.key).toBe(by("resend")[0]!.key);
    expect(q("SELECT sent, body FROM outbox")).toEqual([{ sent: 1, body: "" }]);
  });
});

describe("small parts", () => {
  test("the sender name is quoted for Cloudflare only when it needs it", () => {
    expect(cfFrom("Corporate Tambola <hello@corporatetambola.com>")).toBe("Corporate Tambola <hello@corporatetambola.com>");
    expect(cfFrom("Tambola, Corporate <hello@x.com>")).toBe(`"Tambola, Corporate" <hello@x.com>`);
    expect(cfFrom("hello@x.com")).toBe("hello@x.com");
  });
  test("the mail log is forgotten after 3 days by the tick (it holds a hash of the address)", async () => {
    raw.run("INSERT INTO mail_event(at_ms,to_hash,subject,outcome) VALUES(?,?,?,?)", T - MAIL_LOG_KEEP_MS - 1000, "h1", "old", "send_failed 429");
    raw.run("INSERT INTO mail_event(at_ms,to_hash,subject,outcome) VALUES(?,?,?,?)", T - 1000, "h2", "new", "send_failed 429");
    await adminTick(env.DB, T);
    expect(q("SELECT subject FROM mail_event").map((r) => r.subject)).toEqual(["new"]);
  });
});
