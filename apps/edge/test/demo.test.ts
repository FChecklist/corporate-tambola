// The DEMO GAME: a real game on the real server, free, for up to 10 people (packages/beacon/src/config.ts DEMO_CAP; worker.ts, pay.ts, clone.ts).
//   - created or set with `demo: true`; the size may never go above 10 while it is a demo (a plain message says so)
//   - publishing is free: no payment, no invoice, no pack used up; it is never "held for payment" and sends no payment-due mail; info/pub/summary say demo
//   - people join exactly as in a real game (the 11th is told the game is full by the normal size rule)
//   - "Make this a real game": a paid order with a pack the payer chooses clears the demo mark and raises the size; the game carries on (same id, people, numbers)
//   - "Make a real game like this one": the clone of a demo is a normal draft unless `demo: true` is asked for
import { beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import type { PayEnv } from "../src/pay";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const H = 3_600_000;
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START_MS = T + 3 * H, START = roundAt(START_MS);
const DEMO_MSG = "A demo game is for up to 10 people. Make it a real game to invite more.";
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, key?: string, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: withDevice(method, path, body) }), env as Env, now);
const j = async (r: Response) => (await r.json()) as any;
const one = (sql: string, ...a: any[]) => raw.prepare(sql).get(...a) as any;
const count = (sql: string, ...a: any[]) => (raw.prepare(sql).get(...a) as any).c as number;
const cfgOf = (id: string) => JSON.parse(one("SELECT config FROM engagement WHERE id=?", id).config);
let ip = 0, lastAi = "";
const start = async (email: string) => { const r = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `8.8.8.${++ip}` }, body: JSON.stringify({ email }) }), env as Env, T)); lastAi = r.aiKey as string; return r.token as string; };
const PUB = { email: "boss@acme.com", phone: "9876543210" };
const mk = (key: string, id: string, over: Record<string, unknown> = {}) => call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 10, demo: true, name: "Demo night", ...over }, key);
const publish = (key: string, id: string, now = T) => call("POST", `/api/z/${id}/publish`, PUB, key, now);
const phone = (i: number) => "9" + String(100000000 + i);
const join = (i: number, id: string, now = T) => call("POST", `/api/z/${id}/join`, { phone: phone(i), name: "P" + i }, undefined, now);
const convert = (key: string, id: string, pack: number | undefined, now = T) => call("POST", "/api/checkout", { eid: id, ...(pack ? { pack } : {}), name: "Boss", org: "Acme Ltd", email: "boss@acme.com", country: "IN", taxId: "", currency: "INR" }, key, now);

beforeEach(() => {
  const d = makeD1(); raw = d.raw;
  // TEST_MODE with no gateway keys: /api/checkout completes the order at once (the same path the pay page takes in a local run)
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", TEST_MODE: "1", OWNER_EMAIL: "owner@platform.test", JOIN_PER_IP_DAY: "1000000", JOIN_PER_IP_MINUTE: "1000000" } as any;
});

describe("making a demo game", () => {
  test("up to 10 people is a demo draft; 11 is refused with the plain message; the draft carries the mark everywhere it is read", async () => {
    const master = await start("boss@acme.com");
    const r = await j(await mk(master, "DEMO-1")); expect(r).toMatchObject({ ok: true, draft: true, demo: true });
    expect(cfgOf("DEMO-1").demo).toBe(true);
    const bad = await mk(master, "DEMO-2", { cap: 11 }); expect(bad.status).toBe(400); expect((await j(bad)).error).toBe(DEMO_MSG);
    expect(one("SELECT COUNT(*) AS c FROM engagement WHERE id='DEMO-2'").c).toBe(0);
    const s = await j(await call("GET", "/api/z/DEMO-1/summary", undefined, master));
    expect(s.demo).toBe(true); expect(s.demoCap).toBe(10); expect(s.status).toMatch(/draft \(DEMO GAME/);
    expect(s.nextSteps.some((x: any) => /make it a real game/i.test(x.step))).toBe(true);
    expect(s.nextSteps.some((x: any) => /does not begin until it is paid/.test(x.step))).toBe(false);
  });
  test("a real draft can become a demo and a demo draft can become real, while nothing is published yet", async () => {
    const master = await start("boss@acme.com");
    await mk(master, "REAL-1", { demo: false, cap: 250 });
    const no = await call("PATCH", "/api/z/REAL-1/settings", { demo: true }, master); expect(no.status).toBe(400); expect((await j(no)).error).toBe(DEMO_MSG); // 250 people is no demo
    const ok = await call("PATCH", "/api/z/REAL-1/settings", { demo: true, cap: 10 }, master); expect(ok.status).toBe(200); expect((await j(ok)).demo).toBe(true);
    const back = await call("PATCH", "/api/z/REAL-1/settings", { demo: false, cap: 500 }, master); expect(back.status).toBe(200); expect((await j(back)).demo).toBeUndefined();
    expect(cfgOf("REAL-1").demo).toBeUndefined(); expect(one("SELECT cap, pack FROM engagement WHERE id='REAL-1'")).toEqual({ cap: 500, pack: 0 });
  });
});

describe("publishing a demo game is free", () => {
  test("published and 'paid' with its own size: no payment, no invoice, no pack used up; the mail says DEMO GAME and never payment pending; info, the public settings and the summary say demo", async () => {
    const master = await start("boss@acme.com");
    await mk(master, "DEMO-1");
    const p = await j(await publish(master, "DEMO-1")); expect(p).toMatchObject({ ok: true, published: true, paid: true, demo: true, free: true });
    expect(one("SELECT pack, cap FROM engagement WHERE id='DEMO-1'")).toEqual({ pack: 10, cap: 10 });
    expect(count("SELECT COUNT(*) AS c FROM payment")).toBe(0); expect(count("SELECT COUNT(*) AS c FROM invoice")).toBe(0); expect(count("SELECT COUNT(*) AS c FROM entitlement")).toBe(0);
    const mails = raw.prepare("SELECT subject, body FROM outbox").all() as any[];
    expect(mails.some((m) => /Your game/.test(m.subject) && /Rs 0/.test(m.subject))).toBe(true);
    expect(mails.some((m) => /payment pending/i.test(m.subject + m.body))).toBe(false);
    const info = await j(await call("GET", "/api/z/DEMO-1/info", undefined, master));
    expect(info.demo).toBe(true); expect(info.draft).toBeUndefined(); expect(info.unpaid).toBeUndefined(); expect(info.locked).toBeUndefined(); expect(info.waitingFor).toBeNull();
    const pubInfo = await j(await call("GET", "/api/z/DEMO-1/info")); expect(pubInfo.demo).toBe(true); // a guest's phone reads the same mark
    const s = await j(await call("GET", "/api/z/DEMO-1/summary", undefined, master));
    expect(s.status).toMatch(/published, DEMO GAME \(free/); expect(s.paid).toBe(true); expect(s.demo).toBe(true); expect(s.payment?.status ?? s.payment).not.toBe("confirming");
    expect(s.links.makeRealGame).toBe("https://tambola.test/pay.html?e=DEMO-1"); expect(s.links.pay).toBe("https://tambola.test/pay.html?e=DEMO-1");
    const parts = await j(await call("GET", "/api/z/DEMO-1/participants", undefined, master)); expect(parts.demo).toBe(true);
    const coh = await j(await call("GET", "/api/z/DEMO-1/cohost", undefined, master)); expect(coh.demo).toBe(true); expect(coh.price).toBeNull(); // no pack = no price, and no crash
  });
  test("a bought pack is never used up by a demo: the entitlement stays for a real game", async () => {
    const master = await start("boss@acme.com");
    await mk(master, "REAL-0", { demo: false, cap: 100 }); await call("POST", "/api/checkout", { eid: "REAL-0", name: "Boss", email: "boss@acme.com", country: "IN", currency: "INR" }, master); // one real pack, bound to REAL-0
    raw.prepare("UPDATE entitlement SET eid=NULL").run(); // ... now a spare pack of 100 in the account
    await mk(master, "DEMO-1"); await publish(master, "DEMO-1");
    expect(one("SELECT eid FROM entitlement").eid).toBeNull(); expect(one("SELECT pack FROM engagement WHERE id='DEMO-1'").pack).toBe(10);
  });
  test("never held for payment: 45 s before the start, at the start and after it, phones are not locked and nobody is mailed that payment is due", async () => {
    const master = await start("boss@acme.com");
    await mk(master, "DEMO-1"); await publish(master, "DEMO-1");
    const before = count("SELECT COUNT(*) AS c FROM outbox");
    for (const now of [START_MS - 30_000, START_MS, START_MS + 10 * 60_000]) {
      const info = await j(await call("GET", "/api/z/DEMO-1/info", undefined, undefined, now));
      expect(info.locked).toBeUndefined(); expect(info.waitingFor).toBeNull();
      const c = await j(await call("GET", "/api/z/DEMO-1/control", undefined, undefined, now)); expect(c.locked).toBeUndefined();
    }
    expect((await join(1, "DEMO-1", START_MS + 60_000)).status).toBe(200); // joining after the start works, as in any paid game
    expect(count("SELECT COUNT(*) AS c FROM outbox")).toBe(before); expect(count("SELECT COUNT(*) AS c FROM kv WHERE k='lockmail/DEMO-1'")).toBe(0);
  });
  test("the AI's publish answer explains a demo game, and the AI manual mentions it", async () => {
    const master = await start("boss@acme.com"); const ai = lastAi;
    await mk(master, "DEMO-1");
    const a = await j(await call("POST", "/api/z/DEMO-1/publish", {}, ai)); expect(a.demo).toBe(true); expect(a.message).toMatch(/game for up to 10 people at Rs 0/);
    const manual = await (await call("GET", `/ai/${ai}`)).text(); expect(manual).toMatch(/A DEMO GAME exists/);
  });
});

describe("people join a demo exactly as in a real game", () => {
  test("ten people are in; the eleventh is told kindly that the game is full", async () => {
    const master = await start("boss@acme.com");
    await mk(master, "DEMO-1"); await publish(master, "DEMO-1");
    for (let i = 1; i <= 10; i++) { const r = await join(i, "DEMO-1"); expect(r.status).toBe(200); expect((await j(r)).demo).toBe(true); }
    const full = await join(11, "DEMO-1"); expect(full.status).toBe(409); expect((await j(full)).error).toBe("This engagement is full.");
    expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid='DEMO-1'")).toBe(10);
    expect((await join(3, "DEMO-1")).status).toBe(200); // someone already in gets back in
  });
});

describe("the size of a demo", () => {
  test("cannot go above 10 (before or after publishing), can move within 10 (the free pack follows), and the mark cannot be switched off without paying", async () => {
    const master = await start("boss@acme.com");
    await mk(master, "DEMO-1", { cap: 6 });
    const d = await call("PATCH", "/api/z/DEMO-1/settings", { cap: 11 }, master); expect(d.status).toBe(400); expect((await j(d)).error).toBe(DEMO_MSG);
    await publish(master, "DEMO-1");
    const p = await call("PATCH", "/api/z/DEMO-1/settings", { cap: 11 }, master); expect(p.status).toBe(400); expect((await j(p)).error).toBe(DEMO_MSG);
    const ok = await call("PATCH", "/api/z/DEMO-1/settings", { cap: 9 }, master); expect(ok.status).toBe(200);
    expect(one("SELECT cap, pack FROM engagement WHERE id='DEMO-1'")).toEqual({ cap: 9, pack: 9 });
    const flip = await call("PATCH", "/api/z/DEMO-1/settings", { demo: false, cap: 100 }, master); expect(flip.status).toBe(402); expect((await j(flip)).error).toMatch(/^To make this a real game, choose the number of people and pay/);
    expect(cfgOf("DEMO-1").demo).toBe(true); expect(one("SELECT cap FROM engagement WHERE id='DEMO-1'").cap).toBe(9);
  });
});

describe("Make this a real game", () => {
  test("a paid order with a chosen pack clears the demo, raises the size, binds the pack, issues an invoice, tells the payer; the game keeps its id, people and start; the 11th can join", async () => {
    const master = await start("boss@acme.com");
    await mk(master, "DEMO-1"); await publish(master, "DEMO-1");
    for (let i = 1; i <= 10; i++) expect((await join(i, "DEMO-1")).status).toBe(200);
    const during = START_MS + 5 * 60_000; // numbers are being called
    expect((await join(11, "DEMO-1", during)).status).toBe(409);
    const noPack = await convert(master, "DEMO-1", undefined, during); expect(noPack.status).toBe(400); expect((await j(noPack)).error).toBe("Choose a pack."); // the payer chooses the size of the real game
    const r = await j(await convert(master, "DEMO-1", 250, during)); expect(r.mode).toBe("test"); expect(r.result).toMatchObject({ ok: true, pack: 250, published: true, converted: true, eid: "DEMO-1" });
    expect(one("SELECT cap, pack, start_round FROM engagement WHERE id='DEMO-1'")).toEqual({ cap: 250, pack: 250, start_round: START }); // the start is NOT moved: the game carries on
    expect(cfgOf("DEMO-1").demo).toBeUndefined(); expect(cfgOf("DEMO-1").name).toBe("Demo night");
    expect(one("SELECT eid, pack FROM entitlement")).toEqual({ eid: "DEMO-1", pack: 250 }); expect(count("SELECT COUNT(*) AS c FROM invoice")).toBe(1);
    expect(one("SELECT v FROM kv WHERE k='converted/DEMO-1'")).toBeTruthy();
    expect((raw.prepare("SELECT body FROM outbox").all() as any[]).some((m) => /demo game is now a real game for up to 250 people/.test(m.body))).toBe(true);
    const info = await j(await call("GET", "/api/z/DEMO-1/info", undefined, undefined, during)); expect(info.demo).toBeUndefined(); expect(info.cap).toBe(250); expect(info.locked).toBeUndefined();
    const s = await j(await call("GET", "/api/z/DEMO-1/summary", undefined, master, during)); expect(s.status).toBe("published and paid"); expect(s.demo).toBeUndefined(); expect(s.payment.status).toBe("paid");
    expect((await join(11, "DEMO-1", during)).status).toBe(200); expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid='DEMO-1'")).toBe(11);
    const again = await convert(master, "DEMO-1", 500, during); expect(again.status).toBe(409); expect((await j(again)).error).toBe("This engagement is already published."); // a real game is paid once
    expect(count("SELECT COUNT(*) AS c FROM payment WHERE status='paid'")).toBe(1);
  });
  test("before the demo is published, paying for it publishes it as a real game of the paid size", async () => {
    const master = await start("boss@acme.com");
    await mk(master, "DEMO-1");
    const r = await j(await convert(master, "DEMO-1", 100)); expect(r.result).toMatchObject({ ok: true, pack: 100, published: true, converted: true });
    expect(one("SELECT cap, pack FROM engagement WHERE id='DEMO-1'")).toEqual({ cap: 100, pack: 100 }); expect(cfgOf("DEMO-1").demo).toBeUndefined();
    const info = await j(await call("GET", "/api/z/DEMO-1/info", undefined, master)); expect(info.draft).toBeUndefined(); expect(info.demo).toBeUndefined();
  });
  test("a Host may make it real too; a Co-host as well; a stranger and an AI key may not", async () => {
    const master = await start("boss@acme.com"); const ai = lastAi;
    await mk(master, "DEMO-1"); await publish(master, "DEMO-1");
    const host = (await j(await call("POST", "/api/org/host", { mobile: "9876500009", label: "Priya", email: "priya@acme.com" }, master))).hostKey as string;
    expect((await convert(ai, "DEMO-1", 100)).status).toBe(403);
    expect((await convert(await start("rival@other.com"), "DEMO-1", 100)).status).toBe(404);
    const r = await j(await convert(host, "DEMO-1", 100)); expect(r.result.converted).toBe(true);
    expect(JSON.parse(one("SELECT v FROM kv WHERE k='paidby/DEMO-1'").v)).toMatchObject({ by: "host", converted: true });
  });
  test("the proforma invoice for a demo being made real is for the chosen pack", async () => {
    const master = await start("boss@acme.com");
    await mk(master, "DEMO-1"); await publish(master, "DEMO-1");
    const pf = await j(await call("POST", "/api/proforma", { eid: "DEMO-1", pack: 500, name: "Boss", email: "boss@acme.com" }, master)); expect(pf.ok).toBe(true); expect(pf.total).toBe(4699); expect(pf.html).toMatch(/up to 500 participants/);
    const pf2 = await j(await call("POST", "/api/proforma", { eid: "DEMO-1", name: "Boss", email: "boss@acme.com" }, master)); expect(pf2.total).toBe(2399); // no choice yet: the smallest pack
  });
});

describe("after the demo", () => {
  test("Make a real game like this one: the clone of a demo is a normal draft with the same settings (no demo mark); demo: true keeps it a demo", async () => {
    const master = await start("boss@acme.com");
    await mk(master, "DEMO-1", { cap: 8, rewards: [{ pattern: "full", ordinal: 1, text: "Hamper" }] }); await publish(master, "DEMO-1");
    const c = await j(await call("POST", "/api/z/DEMO-1/clone", {}, master, START_MS + 2 * H)); expect(c.ok).toBe(true); expect(c.fromDemo).toBe(true); expect(c.demo).toBeUndefined(); expect(c.message).toMatch(/not a demo/);
    const row = one("SELECT cap, pack, config FROM engagement WHERE id=?", c.id); expect(row.pack).toBe(0); expect(row.cap).toBe(8);
    const cfg = JSON.parse(row.config); expect(cfg.demo).toBeUndefined(); expect(cfg.rewards[0].text).toBe("Hamper");
    const d = await j(await call("POST", "/api/z/DEMO-1/clone", { demo: true }, master, START_MS + 2 * H)); expect(d.demo).toBe(true); expect(d.copied).toContain("Demo game (free, up to 10 people)");
    expect(JSON.parse(one("SELECT config FROM engagement WHERE id=?", d.id).config).demo).toBe(true);
    const info = await j(await call("GET", `/api/z/${c.id}/info`, undefined, master, START_MS + 2 * H)); expect(info.draft).toBe(true); expect(info.demo).toBeUndefined();
    expect((await call("PATCH", `/api/z/${c.id}/settings`, { cap: 250, startRound: roundAt(START_MS + 3 * 24 * H) }, master, START_MS + 2 * H)).status).toBe(200); // a real draft: any size, to publish and pay for
  });
  test("cancelling a demo: no money is involved, and the mail says so", async () => {
    const master = await start("boss@acme.com");
    await mk(master, "DEMO-1"); await publish(master, "DEMO-1");
    const pv = await j(await call("GET", "/api/z/DEMO-1/cancel-preview", undefined, master)); expect(pv.canCancel).toBe(true); expect(pv.credit).toBeNull();
    const r = await j(await call("POST", "/api/z/DEMO-1/cancel", { confirmations: 3 }, master)); expect(r.cancelled).toBe(true); expect(r.credit).toBeNull();
    expect((raw.prepare("SELECT body FROM outbox").all() as any[]).some((m) => /free DEMO GAME, so no money is involved/.test(m.body))).toBe(true);
    expect(count("SELECT COUNT(*) AS c FROM credit")).toBe(0);
  });
});
