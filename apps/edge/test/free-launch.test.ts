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
  test("after the first sign-in the organizer gets the welcome email: Option 1 AI work link (recommended) and Option 2 manual", async () => {
    await organizer();
    const mails = raw.prepare("SELECT subject, body FROM outbox WHERE to_addr=? ORDER BY id").all("boss@acme.com") as { subject: string; body: string }[];
    const w = mails.find((m) => /free AI assistant is ready/.test(m.subject))!;
    expect(w).toBeTruthy();
    expect(w.body).toMatch(/OPTION 1 \(RECOMMENDED\)/); expect(w.body).toMatch(/OPTION 2: DO IT YOURSELF/);
    expect(w.body).toMatch(/ChatGPT, Gemini, Grok, Claude, DeepSeek, Z\.ai/); expect(w.body).toMatch(/The AI never pays/);
    const key = w.body.match(/cta_[0-9a-f]{48}/)![0];
    expect((await call("GET", "/api/history", undefined, { "x-organizer": key })).status).toBe(200); // the emailed link really works
    expect(w.body).toMatch(/\/api\/z\/ai-manifest/);
  });
  test("a second sign-in does not email another AI link", async () => {
    await organizer();
    await call("POST", "/api/auth/email", { email: "boss@acme.com" });
    const mail = raw.prepare("SELECT body FROM outbox WHERE to_addr=? ORDER BY id DESC LIMIT 1").get("boss@acme.com") as { body: string };
    const code = mail.body.match(/\b\d{6}\b/)![0];
    await call("POST", "/api/auth/verify", { email: "boss@acme.com", code });
    const n = (raw.prepare("SELECT COUNT(*) AS c FROM outbox WHERE to_addr=? AND subject LIKE '%AI assistant is ready%'").get("boss@acme.com") as any).c;
    expect(n).toBe(1);
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
  test("the AI key cannot publish or pay, but hands the organizer the link", async () => {
    const { h } = await organizer();
    await call("POST", "/api/z", eng("DRAFT-5"), h);
    const k = await (await call("POST", "/api/org/ai", {}, h)).json() as any;
    const key = k.aiKey;
    expect(key).toMatch(/^cta_/);
    const r = await (await call("POST", "/api/z/DRAFT-5/publish", {}, { "x-organizer": key })).json() as any;
    expect(r.published).toBe(false); expect(r.needsOrganizer).toBe(true); expect(r.payUrl).toBe("https://tambola.test/zc.html?e=DRAFT-5");
    expect(raw.prepare("SELECT pack FROM engagement WHERE id='DRAFT-5'").get()).toEqual({ pack: 0 }); // still a draft
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
