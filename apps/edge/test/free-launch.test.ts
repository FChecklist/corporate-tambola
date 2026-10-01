import { beforeEach, describe, expect, test } from "bun:test";
import { handle, type Env } from "../src/worker";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), env as Env, now);
const eng = (id: string, cap = 100) => ({ id, startRound: 100, callSeconds: 6, cap });

beforeEach(() => {
  const d = makeD1(); raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000", PUBLIC_ORIGIN: "https://tambola.test" };
});

/** A new organizer types an email and the console opens at once: no mail, no code. */
async function organizer(email = "boss@acme.com", ip = "1.1.1.1") {
  const r = await call("POST", "/api/start", { email }, { "cf-connecting-ip": ip });
  const j = await r.json() as any;
  expect(r.status).toBe(200); expect(j.token).toMatch(/^ctk_/); expect(j.aiKey).toMatch(/^cta_/);
  return { h: { "x-organizer": j.token as string }, ai: j.aiKey as string, aiMessage: j.aiMessage as string };
}
const ok = { email: "boss@acme.com", phone: "98765 43210" };

describe("build first, pay to publish", () => {
  test("entering an email opens the console at once, with a ready AI work link, and sends no email", async () => {
    const o = await organizer();
    expect(o.aiMessage).toMatch(/\/api\/z\/ai-manifest/); expect(o.aiMessage).toContain(o.ai); expect(o.aiMessage).toMatch(/Never try to pay/);
    expect((await call("GET", "/api/history", undefined, { "x-organizer": o.ai })).status).toBe(200); // the AI link really works
    expect((raw.prepare("SELECT COUNT(*) AS c FROM outbox").get() as any).c).toBe(0);
  });
  test("an email that already has an account is not let in by typing it: it is asked for the e-mailed code", async () => {
    await organizer();
    const r = await (await call("POST", "/api/start", { email: "boss@acme.com" }, { "cf-connecting-ip": "2.2.2.2" })).json() as any;
    expect(r.exists).toBe(true); expect(r.token).toBeUndefined();
    await call("POST", "/api/auth/email", { email: "boss@acme.com" });
    const mail = raw.prepare("SELECT body FROM outbox WHERE to_addr=? ORDER BY id DESC LIMIT 1").get("boss@acme.com") as { body: string };
    const code = mail.body.match(/\d{6}/)![0];
    expect(((await (await call("POST", "/api/auth/verify", { email: "boss@acme.com", code })).json()) as any).token).toMatch(/^ctk_/);
  });
  test("a network address can open only a few new organizer accounts a day", async () => {
    for (let i = 1; i <= 5; i++) await organizer(`u${i}@acme.com`, "9.9.9.9");
    expect((await call("POST", "/api/start", { email: "u6@acme.com" }, { "cf-connecting-ip": "9.9.9.9" })).status).toBe(429);
    expect((await call("POST", "/api/start", { email: "u7@acme.com" }, { "cf-connecting-ip": "8.8.8.8" })).status).toBe(200);
  });
  test("an organizer builds an engagement with no payment: it is a draft", async () => {
    const { h } = await organizer();
    const r = await (await call("POST", "/api/z", eng("DRAFT-1", 500), h)).json() as any;
    expect(r.ok).toBe(true); expect(r.draft).toBe(true);
    const hist = await (await call("GET", "/api/history", undefined, h)).json() as any;
    expect(hist.engagements[0].id).toBe("DRAFT-1"); expect(!!hist.engagements[0].draft).toBe(true);
  });
  test("participants cannot see or join a draft; the organizer can read it", async () => {
    const { h } = await organizer();
    await call("POST", "/api/z", eng("DRAFT-2"), h);
    expect((await call("POST", "/api/z/DRAFT-2/join", { phone: "9876543210" })).status).toBe(403);
    expect((await call("GET", "/api/z/DRAFT-2/info")).status).toBe(403);
    expect((await call("GET", "/api/z/DRAFT-2/info", undefined, h)).status).toBe(200);
  });
  test("publishing asks for payment, and the draft stays saved", async () => {
    const { h } = await organizer();
    await call("POST", "/api/z", eng("DRAFT-3", 500), h);
    const r = await call("POST", "/api/z/DRAFT-3/publish", ok, h);
    expect(r.status).toBe(402);
    const j = await r.json() as any;
    expect(j.draft).toBe(true); expect(j.needPack).toBe(500); expect(j.error).toMatch(/Payment opens soon/);
    expect((await call("POST", "/api/z/DRAFT-3/join", { phone: "9876543210" })).status).toBe(403);
  });
  test("after a pack is bought, publishing opens the engagement to participants", async () => {
    const { h } = await organizer();
    await call("POST", "/api/z", eng("DRAFT-4", 100), h);
    const org = (raw.prepare("SELECT org FROM engagement WHERE id='DRAFT-4'").get() as any).org;
    raw.prepare("INSERT INTO entitlement(id,org,pack,payment_id,eid,created_ms) VALUES('ent_t',?,500,'p',NULL,?)").run(org, T);
    expect((await call("POST", "/api/z/DRAFT-4/publish", ok, h)).status).toBe(200);
    expect((await call("POST", "/api/z/DRAFT-4/join", { phone: "9876543210" })).status).toBe(200);
    expect((raw.prepare("SELECT eid FROM entitlement WHERE id='ent_t'").get() as any).eid).toBe("DRAFT-4");
  });
  test("the AI key cannot publish or pay, but hands the organizer the link", async () => {
    const { h, ai: key } = await organizer();
    await call("POST", "/api/z", eng("DRAFT-5"), h);
    const r = await (await call("POST", "/api/z/DRAFT-5/publish", {}, { "x-organizer": key })).json() as any;
    expect(r.published).toBe(false); expect(r.needsOrganizer).toBe(true); expect(r.payUrl).toBe("https://tambola.test/zc.html?e=DRAFT-5");
    expect(raw.prepare("SELECT pack FROM engagement WHERE id='DRAFT-5'").get()).toEqual({ pack: 0 }); // still a draft
  });
  test("publishing first asks the organizer to confirm a valid email and mobile number", async () => {
    const { h } = await organizer();
    await call("POST", "/api/z", eng("CONF-1"), h);
    expect((await call("POST", "/api/z/CONF-1/publish", {}, h)).status).toBe(400);
    expect((await call("POST", "/api/z/CONF-1/publish", { email: "nope", phone: "9876543210" }, h)).status).toBe(400);
    expect((await call("POST", "/api/z/CONF-1/publish", { email: "boss@acme.com", phone: "123" }, h)).status).toBe(400);
    const r = await call("POST", "/api/z/CONF-1/publish", { email: "New.Boss@acme.com", phone: "+91 98765 43210" }, h); // corrected details are accepted
    expect(r.status).toBe(402); const j = await r.json() as any;
    expect(j.confirmed).toEqual({ email: "New.Boss@acme.com", phone: "9876543210" });
    expect(JSON.parse((raw.prepare("SELECT v FROM kv WHERE k='contact/CONF-1'").get() as any).v).phone).toBe("9876543210");
  });
  test("a draft nobody published is forgotten after 30 days, with its contact details", async () => {
    const { h } = await organizer();
    await call("POST", "/api/z", eng("OLD-DRAFT"), h);
    await call("POST", "/api/z/OLD-DRAFT/publish", ok, h);
    const { purgeOld } = await import("../src/worker");
    expect(await purgeOld(env as Env, T + 29 * 86_400_000)).toBe(0);
    expect(await purgeOld(env as Env, T + 31 * 86_400_000)).toBe(1);
    expect(raw.prepare("SELECT COUNT(*) AS c FROM kv WHERE k='contact/OLD-DRAFT'").get()).toEqual({ c: 0 });
  });
  test("optional free-publish switch lets small engagements go out without payment", async () => {
    env.FREE_LAUNCH = "1";
    const { h } = await organizer();
    await call("POST", "/api/z", eng("DRAFT-6", 100), h);
    expect((await call("POST", "/api/z/DRAFT-6/publish", ok, h)).status).toBe(200);
    await call("POST", "/api/z", eng("DRAFT-7", 101), h);
    expect((await call("POST", "/api/z/DRAFT-7/publish", ok, h)).status).toBe(402);
  });
  test("ten unpublished drafts at most", async () => {
    const { h } = await organizer();
    for (let i = 1; i <= 10; i++) expect((await call("POST", "/api/z", eng("DR-" + String(i).padStart(2, "0")), h)).status).toBe(200);
    expect((await call("POST", "/api/z", eng("DR-11"), h)).status).toBe(409);
  });
  test("the platform key still creates a published engagement at once", async () => {
    const r = await (await call("POST", "/api/z", eng("PLAT-1"), { "x-organizer": "plat" })).json() as any;
    expect(r.draft).toBe(false);
    expect((await call("POST", "/api/z/PLAT-1/join", { phone: "9876543210" })).status).toBe(200);
  });
});
