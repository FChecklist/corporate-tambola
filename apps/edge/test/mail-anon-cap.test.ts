// 1.11.0 audit 2, M4: mail that ANY visitor can trigger for ANY address (the Refer & earn code) has a site-wide cap per hour, on top of the per-address and per-network caps,
// so many addresses from many networks cannot use up the month's mail for the invoices. The sign-in code is not capped by this: it can only go to an address that already has an account.
import { beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import type { Env } from "../src/worker";
import { makeD1 } from "./d1-sqlite";
import { anonMailAllowed, lanesTick } from "../src/mail-lanes";

const T = Date.UTC(2026, 10, 21, 10, 0, 0), H = 3_600_000;
let env: PayEnv & Record<string, any>; let raw: ReturnType<typeof makeD1>["raw"]; let ip = 0; let warns: string[];
const enroll = (email: string, now = T) => handle(new Request("http://x/api/partner/enroll", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `9.9.${Math.floor(++ip / 200)}.${ip % 200}` }, body: withDevice("POST", "/api/partner/enroll", { phone: "98" + String(10000000 + ip), name: "A", email, consent: true }) }), env as Env, now);
const codeMails = () => (raw.query("SELECT subject FROM outbox WHERE subject LIKE '%Refer%code%'").all() as any[]).length;

beforeEach(() => {
  const d = makeD1(); raw = d.raw; ip = 0; warns = [];
  env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "100000", PUBLIC_ORIGIN: "https://tambola.test", ANON_MAIL_PER_HOUR: "3" };
  console.warn = (...a: unknown[]) => { warns.push(a.map(String).join(" ")); };
});

describe("a site-wide hourly cap on mail an anonymous visitor can trigger", () => {
  test("the first 3 codes of the hour are mailed, the 4th and later get a plain 'try again in about an hour' and send nothing; the next hour starts fresh", async () => {
    for (let i = 1; i <= 3; i++) expect((await enroll(`p${i}@x${i}.example`)).status).toBe(200);
    expect(codeMails()).toBe(3);
    const r = await enroll("p4@x4.example"); expect(r.status).toBe(429); expect(((await r.json()) as any).error).toMatch(/try again in about an hour/i);
    expect((await enroll("p5@x5.example")).status).toBe(429); expect(codeMails()).toBe(3);
    expect(warns.filter((w) => w.startsWith("[mail-alert] anonymous-triggered mail")).length).toBe(1); // ONE alert line per hour, numbers only
    expect(warns.join("\n")).not.toMatch(/@|x4\.example/);
    expect((await enroll("p6@x6.example", T + H)).status).toBe(200); expect(codeMails()).toBe(4);
  });
  test("ANON_MAIL_PER_HOUR=0 switches the cap off; the default is 60; a database that cannot count never blocks", async () => {
    env.ANON_MAIL_PER_HOUR = "0";
    for (let i = 1; i <= 6; i++) expect((await enroll(`q${i}@y${i}.example`)).status).toBe(200);
    const bare = makeD1().db; expect(await anonMailAllowed(bare, {}, T)).toBe(true);
    for (let i = 0; i < 58; i++) await anonMailAllowed(bare, {}, T); expect(await anonMailAllowed(bare, {}, T)).toBe(true); expect(await anonMailAllowed(bare, {}, T)).toBe(false); // the 60th is allowed, the 61st is not
    const broken = { prepare: () => { throw new Error("db down"); } } as any; expect(await anonMailAllowed(broken, {}, T)).toBe(true);
  });
  test("the hourly counter rows are forgotten after two days by the hourly tick", async () => {
    await enroll("r1@z.example");
    expect((raw.query("SELECT COUNT(*) c FROM kv WHERE k LIKE 'anonmail/%'").get() as any).c).toBe(1);
    await lanesTick(env.DB, T + 49 * H);
    expect((raw.query("SELECT COUNT(*) c FROM kv WHERE k LIKE 'anonmail/%'").get() as any).c).toBe(0);
  });
});
