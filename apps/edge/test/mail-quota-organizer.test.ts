// 21 Nov 2026: Resend answered `429 monthly_quota_exceeded`. Owner rules: (1) the mail goes by Cloudflare Email, (2) the organizer is told honestly, (3) the owner is warned (80 % of the month, and at once when the provider itself says the month is used up).
// Through the real sendMail and the real public status address, a real SQLite; the mail services are stand-ins (fetch).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeD1 } from "./d1-sqlite";
import { sendMail, type PayEnv } from "../src/pay";
import { handle } from "./with-terms";
import { ORGANIZER_NOTE_BACKUP, ORGANIZER_NOTE_LATE, QUOTA_SEEN_MS, mailStatus } from "../src/mail-lanes";

const NOW = Date.UTC(2026, 10, 21, 10, 0, 0), ACC = "ac433821e311dbc89d0e002a192f92bc";
let env: PayEnv & Record<string, any>; let raw: ReturnType<typeof makeD1>["raw"]; let who: string[]; let resend: () => { status: number; body?: unknown }; let warns: string[];
const realFetch = globalThis.fetch, realWarn = console.warn;
const status = async (now = NOW) => (await (await handle(new Request("http://x/api/owner/mail-status", { headers: { "x-organizer": "plat" } }), env, now)).json()) as any; // the full read (owner); the public one is the same `organizer` part, cached 30 s
const publicStatus = async (now = NOW) => (await (await handle(new Request("http://x/api/status/mail"), env, now)).json()) as any;

beforeEach(() => {
  const d = makeD1(); raw = d.raw; who = []; warns = [];
  resend = () => ({ status: 200, body: { id: "em_1" } });
  env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", RESEND_API_KEY: "re_key", MAIL_RETRY_MS: "0", PUBLIC_ORIGIN: "https://tambola.test", MAIL_WARMUP_START: "2026-11-01" } as any;
  console.warn = (...a: unknown[]) => { warns.push(a.map(String).join(" ")); };
  (globalThis as any).fetch = async (url: string) => {
    const u = String(url);
    if (u === "https://api.resend.com/emails") { who.push("resend"); const r = resend(); return new Response(JSON.stringify(r.body ?? {}), { status: r.status }); }
    if (u.startsWith("https://api.cloudflare.com/")) { who.push("cf"); return new Response(JSON.stringify({ success: true }), { status: 200 }); }
    return new Response("{}", { status: 404 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; console.warn = realWarn; });

describe("Resend says monthly_quota_exceeded", () => {
  test("with the Cloudflare route set: the invoice mail goes by Cloudflare, the status says so in plain words, the owner gets ONE critical alert", async () => {
    env.CF_EMAIL_TOKEN = "cf-token"; env.CF_ACCOUNT_ID = ACC;
    resend = () => ({ status: 429, body: { name: "monthly_quota_exceeded" } });
    expect(await sendMail(env, env.DB, "boss@acme.com", "Corporate Tambola: invoice CT/1", "INVOICE", NOW)).toBe(true);
    expect(who).toEqual(["resend", "cf"]);
    const s = await status();
    expect(s.quota.providerSaysUsedUp).toBe(true); expect(s.ok).toBe(false);
    expect(s.organizer).toEqual({ degraded: "backup", note: ORGANIZER_NOTE_BACKUP });
    expect(warns.filter((w) => w.startsWith("[mail-alert] CRITICAL")).length).toBe(1);
    await sendMail(env, env.DB, "boss2@acme.com", "Corporate Tambola: invoice CT/2", "INVOICE", NOW + 60_000);
    expect(warns.filter((w) => w.startsWith("[mail-alert] CRITICAL")).length).toBe(1); // once a month, not once a mail
  });
  test("without the Cloudflare route: the organizer is told mail can be late (never that a backup exists), the mail is not lost (it waits in the mail log for the retry)", async () => {
    resend = () => ({ status: 429, body: { name: "monthly_quota_exceeded" } });
    expect(await sendMail(env, env.DB, "boss@acme.com", "Corporate Tambola: invoice CT/1", "INVOICE", NOW)).toBe(false);
    expect(who).toEqual(["resend"]); // a used-up quota is not asked again for the same mail
    const s = await status();
    expect(s.organizer).toEqual({ degraded: "late", note: ORGANIZER_NOTE_LATE });
    expect(ORGANIZER_NOTE_LATE).not.toMatch(/backup route (is|are) (on|working)/i);
    expect(raw.prepare("SELECT COUNT(*) n FROM outbox WHERE sent=0 AND body<>''").get()).toEqual({ n: 1 });
  });
  test("the note is honest: no provider name, no number, no secret; it says the payment is not affected", () => {
    for (const n of [ORGANIZER_NOTE_BACKUP, ORGANIZER_NOTE_LATE]) { expect(n).not.toMatch(/resend|cloudflare|\d|re_|token/i); expect(n).toContain("Your payment is not affected."); }
  });
  test("1.11.0 audit M2: the 'late' note only promises what happens: the invoice can be late, and the key must be kept from the screen (a waiting mail never carries the key)", async () => {
    expect(ORGANIZER_NOTE_LATE).toMatch(/invoice e-mail can arrive late/i);
    expect(ORGANIZER_NOTE_LATE).not.toMatch(/\(invoice, organizer key\)|e-mails \(/i); // no longer "your e-mails (invoice, organizer key) can arrive late"
    expect(ORGANIZER_NOTE_LATE).toMatch(/keep the organizer key shown on this screen/i);
    expect(ORGANIZER_NOTE_LATE).toMatch(/does not carry the key/i);
    // the fact the note rests on: a mail that failed and waits for its retry has the organizer key blanked out
    resend = () => ({ status: 429, body: { name: "monthly_quota_exceeded" } });
    const key = "ctk_" + "ab".repeat(24);
    expect(await sendMail(env, env.DB, "boss@acme.com", "Your organizer key", `Your key: ${key}`, NOW)).toBe(false);
    const kept = raw.prepare("SELECT body FROM outbox WHERE sent=0 AND body<>''").get() as { body: string };
    expect(kept.body).not.toContain(key); expect(kept.body).toContain("blanked");
    // and the public address carries the same words
    expect((await publicStatus()).organizer).toEqual({ degraded: "late", note: ORGANIZER_NOTE_LATE });
  });
  test("audit 1 L1: only a MONTHLY quota answer is a used-up month: a daily quota answer raises no critical alert and no organizer note", async () => {
    resend = () => ({ status: 429, body: { name: "daily_quota_exceeded" } });
    await sendMail(env, env.DB, "boss@acme.com", "Corporate Tambola: invoice CT/1", "INVOICE", NOW);
    expect(warns.filter((w) => w.includes("[mail-alert] CRITICAL"))).toEqual([]);
    expect((await status()).organizer.degraded).toBe("none");
  });
  test("when nothing is wrong the organizer is told nothing", async () => {
    const s = await status();
    expect(s.organizer).toEqual({ degraded: "none", note: null }); expect(s.ok).toBe(true);
  });
  test("the provider's word counts for a limited time: two hours later with no new answer, the note is gone", async () => {
    resend = () => ({ status: 429, body: { name: "monthly_quota_exceeded" } });
    await sendMail(env, env.DB, "boss@acme.com", "Corporate Tambola: invoice CT/1", "INVOICE", NOW);
    expect((await status(NOW + QUOTA_SEEN_MS - 1000)).organizer.degraded).toBe("late");
    expect((await status(NOW + QUOTA_SEEN_MS + 1000)).organizer.degraded).toBe("none");
  });
  test("a plain 429 (rate limit, not quota) is not a used-up month: no alert, no note", async () => {
    resend = () => ({ status: 429, body: { name: "rate_limit_exceeded" } });
    await sendMail(env, env.DB, "boss@acme.com", "Corporate Tambola: invoice CT/1", "INVOICE", NOW);
    expect(warns.filter((w) => w.includes("[mail-alert]"))).toEqual([]);
    expect((await status()).organizer.degraded).toBe("none");
  });
  test("our own counter at 100 % of the quota also says used up (no provider answer needed)", async () => {
    env.MAIL_MONTHLY_QUOTA = "2";
    await sendMail(env, env.DB, "a@acme.com", "s1", "x", NOW); await sendMail(env, env.DB, "b@acme.com", "s2", "x", NOW);
    const s = await mailStatus(env.DB, env, NOW);
    expect(s.level).toBe("critical"); expect(s.organizer.degraded).toBe("late");
  });
});

describe("the 80 % warning of the monthly Resend quota", () => {
  test("one [mail-alert] WARN line at the mail that reaches 80 %, none before, none again; Cloudflare mails are not counted against Resend's quota", async () => {
    env.MAIL_MONTHLY_QUOTA = "10"; env.CF_EMAIL_TOKEN = "t"; env.CF_ACCOUNT_ID = ACC;
    for (let i = 1; i <= 7; i++) await sendMail(env, env.DB, `u${i}@acme.com`, "s" + i, "x", NOW);
    expect(warns.filter((w) => w.includes("[mail-alert]"))).toEqual([]);
    await sendMail(env, env.DB, "u8@acme.com", "s8", "x", NOW);
    expect(warns.filter((w) => w.startsWith("[mail-alert] WARN")).length).toBe(1);
    await sendMail(env, env.DB, "u9@acme.com", "s9", "x", NOW);
    expect(warns.filter((w) => w.startsWith("[mail-alert] WARN")).length).toBe(1);
    const s = await status(); expect(s.level).toBe("warn"); expect(s.alert).toBe("warn"); expect(s.organizer.degraded).toBe("none"); // a warning is for the owner; the organizer is told only when mail is really affected
  });
});

describe("the screens that say 'we e-mailed you' ask for the note", () => {
  const PUB = join(import.meta.dir, "../../web/public");
  test("common.js has TB.mailNote, and the order-done sheet and the pay-done card call it", () => {
    expect(readFileSync(join(PUB, "common.js"), "utf8")).toContain("TB.mailNote = ");
    expect(readFileSync(join(PUB, "site.js"), "utf8")).toContain('TB.mailNote("mailNote")');
    expect(readFileSync(join(PUB, "paykit.js"), "utf8")).toContain('TB.mailNote("mailNote")');
  });
});
