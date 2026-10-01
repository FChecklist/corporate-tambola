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

/** Signs up and signs in the way a real organizer does; the code is read from the mail outbox (nothing is sent without a mail key). */
async function organizer(email = "boss@acme.com") {
  expect((await call("POST", "/api/signup", { email })).status).toBe(200);
  expect((await call("POST", "/api/auth/email", { email })).status).toBe(200);
  const mail = raw.prepare("SELECT body FROM outbox WHERE to_addr=? ORDER BY id DESC LIMIT 1").get(email) as { body: string };
  const code = mail.body.match(/\b\d{6}\b/)![0];
  const v = await (await call("POST", "/api/auth/verify", { email, code })).json() as any;
  expect(v.token).toMatch(/^ctk_/);
  return { h: { "x-organizer": v.token as string }, mail: mail.body };
}

describe("build first, pay to publish", () => {
  test("the sign-in email carries the code and both ways to work", async () => {
    const { mail } = await organizer();
    expect(mail).toMatch(/OPTION 1: AI WORK LINK/); expect(mail).toMatch(/OPTION 2: WORK IN THE WEBPAGE/); expect(mail).toMatch(/Payment is asked only when you publish/);
  });
  test("signup alone gives no key", async () => {
    const r = await (await call("POST", "/api/signup", { email: "x@acme.com" })).json() as any;
    expect(JSON.stringify(r)).not.toMatch(/ctk_/);
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
    const r = await call("POST", "/api/z/DRAFT-3/publish", {}, h);
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
    expect((await call("POST", "/api/z/DRAFT-4/publish", {}, h)).status).toBe(200);
    expect((await call("POST", "/api/z/DRAFT-4/join", { phone: "9876543210" })).status).toBe(200);
    expect((raw.prepare("SELECT eid FROM entitlement WHERE id='ent_t'").get() as any).eid).toBe("DRAFT-4");
  });
  test("the AI key cannot publish", async () => {
    const { h } = await organizer();
    await call("POST", "/api/z", eng("DRAFT-5"), h);
    const k = await (await call("POST", "/api/org/ai", {}, h)).json() as any;
    const key = k.aiKey;
    expect(key).toMatch(/^cta_/);
    expect([401, 403]).toContain((await call("POST", "/api/z/DRAFT-5/publish", {}, { "x-organizer": key })).status);
  });
  test("optional free-publish switch lets small engagements go out without payment", async () => {
    env.FREE_LAUNCH = "1";
    const { h } = await organizer();
    await call("POST", "/api/z", eng("DRAFT-6", 100), h);
    expect((await call("POST", "/api/z/DRAFT-6/publish", {}, h)).status).toBe(200);
    await call("POST", "/api/z", eng("DRAFT-7", 101), h);
    expect((await call("POST", "/api/z/DRAFT-7/publish", {}, h)).status).toBe(402);
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
