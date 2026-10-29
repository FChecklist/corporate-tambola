// WP-04 TA13/S14: a game that is still a DRAFT gets two e-mails to its organizer, once each: about 24 hours and about 2 hours before the start.
// (A published but unpaid game already had its own reminder: remindUnpaid.) Nothing is sent to a published game, a cancelled one, one that has started, or a draft made minutes ago.
import { beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env, remindDrafts, runTick } from "../src/worker";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { draftReminderMail } from "../src/mails";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const H = 3_600_000;
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env as Env, now);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
beforeEach(() => {
  const d = makeD1(); raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000", PUBLIC_ORIGIN: "https://tambola.test" };
});
async function organizer(email = "boss@acme.com") {
  const j = await (await call("POST", "/api/start", { email }, { "cf-connecting-ip": "1.1.1.1" })).json() as any;
  return { "x-organizer": j.token as string };
}
/** A draft made `agoH` hours before T that starts `startH` hours after T. */
async function draft(h: Record<string, string>, id: string, startH: number, agoH = 3) {
  expect((await call("POST", "/api/z", { id, startRound: roundAt(T + startH * H), callSeconds: 6, cap: 100 }, h, T - agoH * H)).status).toBe(200);
}
const drafts = (like = "%is not published yet%") => raw.prepare("SELECT subject, body FROM outbox WHERE to_addr='boss@acme.com' AND subject LIKE ? ORDER BY id").all(like) as { subject: string; body: string }[];

describe("TA13/S14: draft reminders at 24 hours and 2 hours", () => {
  test("a draft starting in 20 hours: one 24-hour mail, never repeated; at 1.5 hours to go one 2-hour mail, never repeated", async () => {
    const h = await organizer(); await draft(h, "DR-A", 20);
    await remindDrafts(env as Env, T); await remindDrafts(env as Env, T + 1000);
    expect(drafts().length).toBe(1);
    expect(drafts()[0]!.subject).toMatch(/DR-A is not published yet/); expect(drafts()[0]!.subject).toMatch(/24 hours/);
    await remindDrafts(env as Env, T + 18.5 * H); await remindDrafts(env as Env, T + 18.6 * H);
    expect(drafts().length).toBe(2);
    expect(drafts()[1]!.subject).toMatch(/2 hours/);
    await remindDrafts(env as Env, T + 21 * H); // started: nothing more
    expect(drafts().length).toBe(2);
  });
  test("a draft that starts in 30 hours gets nothing yet", async () => {
    const h = await organizer(); await draft(h, "DR-FAR", 30);
    await remindDrafts(env as Env, T); expect(drafts().length).toBe(0);
    await remindDrafts(env as Env, T + 7 * H); expect(drafts().length).toBe(1); // 23 hours to go
  });
  test("a draft made late (90 minutes to go) gets only the 2-hour mail", async () => {
    const h = await organizer(); await draft(h, "DR-LATE", 1.5, 1);
    await remindDrafts(env as Env, T);
    expect(drafts().length).toBe(1); expect(drafts()[0]!.subject).toMatch(/2 hours/);
  });
  test("a draft made 5 minutes ago is left alone (the organizer is still working on it)", async () => {
    const h = await organizer(); await draft(h, "DR-NEW", 10, 5 / 60);
    await remindDrafts(env as Env, T); expect(drafts().length).toBe(0);
    await remindDrafts(env as Env, T + 1 * H); expect(drafts().length).toBe(1);
  });
  test("a published game, a cancelled draft and a game that has already started get no draft mail", async () => {
    const h = await organizer();
    await draft(h, "DR-PUB", 10); await call("POST", "/api/z/DR-PUB/publish", { email: "boss@acme.com", phone: "98765 43210" }, h);
    await draft(h, "DR-CAN", 10); raw.prepare("UPDATE engagement SET cancelled_ms=? WHERE id='DR-CAN'").run(T);
    await draft(h, "DR-GONE", -2);
    await remindDrafts(env as Env, T);
    expect(drafts().length).toBe(0);
  });
  test("the mail says what to do in plain words, carries no secret key, and never says 'private'", async () => {
    const h = await organizer(); await draft(h, "DR-TXT", 20);
    await remindDrafts(env as Env, T);
    const m = drafts()[0]!;
    expect(m.body).toMatch(/not published yet/); expect(m.body).toMatch(/step 7/i); expect(m.body).toMatch(/Publish/); expect(m.body).toMatch(/free/i);
    expect(m.body).not.toMatch(/ctk_|cta_|cth_/); expect(m.body + m.subject).not.toMatch(/private/i);
    expect(m.body).toContain("https://tambola.test/zc.html?e=DR-TXT");
  });
  test("the scheduled tick runs it (code path only: the cron is not switched on by this change)", async () => {
    const h = await organizer(); await draft(h, "DR-TICK", 20);
    await runTick(env as Env, T);
    expect(drafts().length).toBe(1);
  });
  test("the mail builder: 24 and 2 hours, the start time in IST", () => {
    const a = draftReminderMail("https://o.test", { eid: "X1", hours: 24, startMs: T }), b = draftReminderMail("https://o.test", { eid: "X1", hours: 2, startMs: T });
    expect(a.subject).toContain("24 hours"); expect(b.subject).toContain("2 hours"); expect(a.text).toContain("IST");
  });
});
