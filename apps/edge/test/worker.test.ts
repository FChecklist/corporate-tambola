import { beforeEach, describe, expect, test } from "bun:test";
import { handle, type Env } from "../src/worker";
import { makeD1 } from "./d1-sqlite";

const SECRET = "org-secret";
let env: Env;
let raw: ReturnType<typeof makeD1>["raw"];
const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }), env, now);
const org = { "x-organizer": SECRET };
const create = (over: Record<string, unknown> = {}) => call("POST", "/api/z", { id: "ENG1", startRound: 1000, callSeconds: 6, cap: 400, ...over }, org);
const phone = (i: number) => "9" + String(100000000 + i);
const join = (i: number, eid = "ENG1", now = T) => call("POST", `/api/z/${eid}/join`, { phone: phone(i), name: "P" + i }, {}, now);

beforeEach(() => {
  const d = makeD1();
  raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: SECRET, DAILY_WRITE_BUDGET: "80000" };
});

describe("engagement set-up", () => {
  test("only the organizer can create one", async () => {
    expect((await call("POST", "/api/z", { id: "ENG1", startRound: 1, callSeconds: 6, cap: 10 })).status).toBe(403);
    expect((await call("POST", "/api/z", { id: "ENG1", startRound: 1, callSeconds: 6, cap: 10 }, { "x-organizer": "wrong" })).status).toBe(403);
  });
  test("with no secret configured, nobody is the organizer (no empty-secret bypass)", async () => {
    env.ORGANIZER_SECRET = undefined;
    expect((await call("POST", "/api/z", { id: "ENG1", startRound: 1, callSeconds: 6, cap: 10 }, { "x-organizer": "" })).status).toBe(403);
  });
  test("call speed must be a multiple of 3 s and at least 6 s", async () => {
    for (const s of [10, 3, 7, 0, -6, 6.5]) expect((await create({ callSeconds: s })).status).toBe(400);
    expect((await create({ callSeconds: 9 })).status).toBe(200);
  });
  test("bad ids, caps and rounds are refused", async () => {
    for (const o of [{ id: "x" }, { id: "a b c d" }, { id: "../../etc" }, { cap: 0 }, { cap: 100001 }, { startRound: 1.5 }, { startRound: "1" }]) expect((await create(o)).status).toBe(400);
  });
  test("creating twice does not overwrite the first", async () => {
    await create();
    await create({ cap: 5 });
    expect(raw.query("SELECT cap FROM engagement WHERE id='ENG1'").get()).toEqual({ cap: 400 });
  });
});

describe("joining", () => {
  beforeEach(async () => { await create(); });
  test("a join returns what the phone needs to play and nothing about others", async () => {
    const r = await (await join(1)).json() as any;
    expect(r.startRound).toBe(1000);
    expect(r.callSeconds).toBe(6);
    expect(r.pid).toHaveLength(16);
    expect(Object.keys(r).sort()).toEqual(["breaks", "callSeconds", "pid", "rewards", "rounds", "startRound", "tickets", "trackClaims"]);
  });
  test("the same number joining twice, even typed differently, is one participant and one write", async () => {
    const a = await (await call("POST", "/api/z/ENG1/join", { phone: "+91 98765-43210" })).json() as any;
    const b = await (await call("POST", "/api/z/ENG1/join", { phone: "919876543210" })).json() as any;
    expect(a.pid).toBe(b.pid);
    expect(b.again).toBe(true);
    expect(raw.query("SELECT COUNT(*) c FROM participant").get()).toEqual({ c: 1 });
  });
  test("the phone number itself is never stored, only a salted hash", async () => {
    await join(7);
    const dump = JSON.stringify(raw.query("SELECT * FROM participant").all());
    expect(dump.includes(phone(7))).toBe(false);
  });
  test("invalid or hostile input is refused cleanly", async () => {
    for (const b of [{}, { phone: "" }, { phone: "123" }, { phone: "9".repeat(30) }, { phone: "abc" }, null, "not json", "[]"])
      expect((await call("POST", "/api/z/ENG1/join", b as any)).status).toBe(400);
    expect((await call("POST", "/api/z/ENG1/join", "x".repeat(10000))).status).toBe(400);
  });
  test("names are cleaned and cut", async () => {
    await call("POST", "/api/z/ENG1/join", { phone: phone(2), name: "<script>alert(1)</script>`x`" + "y".repeat(200) });
    const n = (raw.query("SELECT name FROM participant").get() as any).name as string;
    expect(/[<>`]/.test(n)).toBe(false);
    expect(n.length).toBeLessThanOrEqual(60);
  });
  test("unknown engagement, wrong method and odd paths", async () => {
    expect((await join(1, "NOPE1")).status).toBe(404);
    expect((await call("GET", "/api/z/ENG1/join")).status).toBe(404);
    expect((await call("POST", "/api/z/ENG1/../x")).status).toBe(404);
    expect((await call("DELETE", "/api/z/ENG1/claims")).status).toBe(404);
  });
  test("the participant cap is enforced and a full engagement still lets existing people back in", async () => {
    await create({ id: "SMALL", cap: 3 });
    for (let i = 0; i < 3; i++) expect((await join(i, "SMALL")).status).toBe(200);
    expect((await join(99, "SMALL")).status).toBe(409);
    const back = await join(1, "SMALL");
    expect(back.status).toBe(200);
  });
});

describe("claims", () => {
  let pid: string;
  beforeEach(async () => { await create(); pid = ((await (await join(1)).json()) as any).pid; });
  const claim = (b: unknown) => call("POST", "/api/z/ENG1/claims", b);
  test("a claim is stored once even if the phone sends it five times", async () => {
    for (let i = 0; i < 5; i++) await claim({ pid, claims: [{ pattern: "top", idx: 33 }] });
    expect(raw.query("SELECT COUNT(*) c FROM claim").get()).toEqual({ c: 1 });
  });
  test("a stranger cannot claim", async () => {
    expect((await claim({ pid: "deadbeefdeadbeef", claims: [{ pattern: "top", idx: 3 }] })).status).toBe(403);
    expect((await claim({ pid: 5, claims: [] })).status).toBe(400);
  });
  test("a participant of another engagement cannot claim here", async () => {
    await create({ id: "ENG2" });
    const other = ((await (await join(50, "ENG2")).json()) as any).pid;
    expect((await claim({ pid: other, claims: [{ pattern: "full", idx: 70 }] })).status).toBe(403);
  });
  test("bad patterns and impossible call numbers are dropped, good ones kept", async () => {
    const r = await (await claim({ pid, claims: [{ pattern: "bingo", idx: 3 }, { pattern: "top", idx: 90 }, { pattern: "top", idx: -1 }, { pattern: "top", idx: 1.5 }, { pattern: "mid", idx: 40 }, null, "x"] })).json() as any;
    expect(r.stored).toBe(1);
  });
  test("a huge claims list is capped", async () => {
    expect((await claim({ pid, claims: Array.from({ length: 5000 }, (_, i) => ({ pattern: "top", idx: i % 90 })) })).status).toBe(400); // oversized body refused outright
    const r = await (await claim({ pid, claims: Array.from({ length: 60 }, (_, i) => ({ pattern: "top", idx: i })) })).json() as any;
    expect(r.stored).toBeLessThanOrEqual(7);
  });
  test("claims cannot be read without the organizer secret", async () => {
    expect((await call("GET", "/api/z/ENG1/claims")).status).toBe(403);
    expect((await call("GET", "/api/z/ENG1/claims", undefined, { "x-organizer": "no" })).status).toBe(403);
    expect((await call("GET", "/api/z/ENG1/claims", undefined, org)).status).toBe(200);
  });
});

describe("settling and results", () => {
  beforeEach(async () => { await create(); });
  test("only the organizer settles; a re-settle replaces, never duplicates", async () => {
    const body = { results: [{ pattern: "top", idx: 20, pids: ["a", "b"] }] };
    expect((await call("POST", "/api/z/ENG1/settle", body)).status).toBe(403);
    expect((await call("POST", "/api/z/ENG1/settle", body, org)).status).toBe(200);
    await call("POST", "/api/z/ENG1/settle", { results: [{ pattern: "top", idx: 18, pids: ["c"] }] }, org);
    expect(raw.query("SELECT COUNT(*) c FROM settled").get()).toEqual({ c: 1 });
  });
  test("public results show counts only, never who", async () => {
    await call("POST", "/api/z/ENG1/settle", { results: [{ pattern: "full", idx: 70, pids: ["secretpid1", "secretpid2"] }] }, org);
    const txt = await (await call("GET", "/api/z/ENG1/results")).text();
    expect(txt.includes("secretpid")).toBe(false);
    expect(JSON.parse(txt).results[0]).toEqual({ pattern: "full", ordinal: 1, round: 1, idx: 70, count: 2 });
  });
  test("a malformed result changes nothing", async () => {
    expect((await call("POST", "/api/z/ENG1/settle", { results: [{ pattern: "top", idx: 1, pids: "no" }] }, org)).status).toBe(400);
    expect(raw.query("SELECT COUNT(*) c FROM settled").get()).toEqual({ c: 0 });
  });
});

describe("free-plan guard and scale", () => {
  test("when the daily write budget is spent the system says so politely and writes nothing more", async () => {
    env.DAILY_WRITE_BUDGET = "12";
    await create();
    let busy = 0;
    for (let i = 0; i < 30; i++) if ((await join(i)).status === 503) busy++;
    expect(busy).toBeGreaterThan(15);
    expect((raw.query("SELECT writes w FROM usage").get() as any).w).toBeLessThanOrEqual(12);
    expect((raw.query("SELECT COUNT(*) c FROM participant").get() as any).c).toBeLessThanOrEqual(11);
  });
  test("the budget resets on the next UTC day", async () => {
    env.DAILY_WRITE_BUDGET = "3";
    await create();
    await join(1); await join(2);
    expect((await join(3)).status).toBe(503);
    expect((await join(3, "ENG1", T + 86_400_000)).status).toBe(200);
  });
  test("10,000 people join at once: every one gets in, no duplicates, writes stay inside the free daily budget", async () => {
    await create({ cap: 20000 });
    const rs = await Promise.all(Array.from({ length: 10000 }, (_, i) => join(i)));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect((raw.query("SELECT COUNT(*) c FROM participant").get() as any).c).toBe(10000);
    expect((raw.query("SELECT writes w FROM usage").get() as any).w).toBe(10002);
    expect(10001).toBeLessThan(100000 * 0.2); // one 10,000-person engagement uses ~10% of D1's free daily writes
  }, 120_000);
  test("a large engagement stores no per-claim rows (winners come from the public numbers), so 10,000 phones claiming adds no writes", async () => {
    await create({ cap: 20000 });
    const pids: string[] = [];
    for (let i = 0; i < 10000; i++) pids.push(((await (await join(i)).json()) as any).pid);
    const pats = ["early5", "top", "mid", "bot", "corners", "star", "full"];
    for (let round = 0; round < 2; round++)
      await Promise.all(pids.slice(0, 2000).map((pid, i) => call("POST", "/api/z/ENG1/claims", { pid, claims: [{ pattern: pats[i % 7], idx: i % 90 }] })));
    expect((raw.query("SELECT COUNT(*) c FROM claim").get() as any).c).toBe(0);
    expect((raw.query("SELECT writes w FROM usage").get() as any).w).toBe(10002); // 1 create + 1 entitlement-free + 10,000 joins
  }, 120_000);
  test("a small engagement (up to 500) stores claims once each, even when sent twice", async () => {
    await create({ cap: 500 });
    const pids: string[] = [];
    for (let i = 0; i < 300; i++) pids.push(((await (await join(i)).json()) as any).pid);
    const pats = ["early5", "top", "mid", "bot", "corners", "star", "full"];
    for (let round = 0; round < 2; round++)
      await Promise.all(pids.map((pid, i) => call("POST", "/api/z/ENG1/claims", { pid, claims: [{ pattern: pats[i % 7], idx: i % 90 }] })));
    expect((raw.query("SELECT COUNT(*) c FROM claim").get() as any).c).toBe(300);
  }, 120_000);
  test("the engagement tells phones whether claims are tracked", async () => {
    await create({ cap: 500 }); await create({ id: "BIG01", cap: 501 });
    expect(((await (await call("GET", "/api/z/ENG1/info")).json()) as any).trackClaims).toBe(true);
    expect(((await (await call("GET", "/api/z/BIG01/info")).json()) as any).trackClaims).toBe(false);
  });
});

describe("roster, history, erase and 365-day retention", () => {
  const D = 86_400_000;
  beforeEach(async () => { await create(); });
  test("only the organizer can list people, history, erase, purge or reuse", async () => {
    for (const [m, p] of [["GET", "/api/z/ENG1/participants"], ["GET", "/api/history"], ["POST", "/api/z/ENG1/erase"], ["POST", "/api/purge"], ["POST", "/api/z/ENG1/reuse"]] as const)
      expect((await call(m, p, m === "POST" ? {} : undefined)).status).toBe(403);
  });
  test("info is public and holds only what a phone needs", async () => {
    expect(await (await call("GET", "/api/z/ENG1/info")).json()).toMatchObject({ startRound: 1000, callSeconds: 6, trackClaims: true, controlUrl: null, tickets: 1, breaks: [] });
  });
  test("the organizer sees ids and names, never phone numbers or hashes", async () => {
    await join(1);
    const txt = await (await call("GET", "/api/z/ENG1/participants", undefined, org)).text();
    expect(txt.includes(phone(1))).toBe(false);
    expect(txt.includes("phone_hash")).toBe(false);
    expect(JSON.parse(txt).participants).toHaveLength(1);
  });
  test("reuse copies the roster into a new engagement and the same phone lands on the new participant", async () => {
    for (let i = 0; i < 5; i++) await join(i);
    await create({ id: "ENG2" });
    const r = await (await call("POST", "/api/z/ENG2/reuse", { from: "ENG1" }, org)).json() as any;
    expect(r.copied).toBe(5);
    const again = await (await join(2, "ENG2")).json() as any;
    expect(again.again).toBe(true); // already on the roster, no new write
    expect((raw.query("SELECT COUNT(*) c FROM participant WHERE eid='ENG2'").get() as any).c).toBe(5);
    const first = (raw.query("SELECT pid FROM participant WHERE eid='ENG1' ORDER BY pid LIMIT 1").get() as any).pid;
    expect((raw.query("SELECT COUNT(*) c FROM participant WHERE eid='ENG2' AND pid=?").get(first) as any).c).toBe(0); // new ids per engagement
  });
  test("reuse twice does not duplicate, and refuses itself or a roster bigger than the cap", async () => {
    for (let i = 0; i < 4; i++) await join(i);
    await create({ id: "ENG2", cap: 3 });
    expect((await call("POST", "/api/z/ENG2/reuse", { from: "ENG1" }, org)).status).toBe(409);
    await create({ id: "ENG3" });
    await call("POST", "/api/z/ENG3/reuse", { from: "ENG1" }, org);
    const r2 = await (await call("POST", "/api/z/ENG3/reuse", { from: "ENG1" }, org)).json() as any;
    expect(r2.copied).toBe(0);
    expect((await call("POST", "/api/z/ENG3/reuse", { from: "ENG3" }, org)).status).toBe(400);
  });
  test("erase removes the people, claims and results of one engagement and leaves the others alone", async () => {
    const pid = ((await (await join(1)).json()) as any).pid;
    await call("POST", "/api/z/ENG1/claims", { pid, claims: [{ pattern: "top", idx: 4 }] });
    await call("POST", "/api/z/ENG1/settle", { results: [{ pattern: "top", idx: 4, pids: [pid] }] }, org);
    await create({ id: "ENG2" }); await join(9, "ENG2");
    const r = await (await call("POST", "/api/z/ENG1/erase", {}, org)).json() as any;
    expect(r.erased).toBe(1);
    for (const t of ["participant", "claim", "settled"]) expect((raw.query(`SELECT COUNT(*) c FROM ${t} WHERE eid='ENG1'`).get() as any).c).toBe(0);
    expect((raw.query("SELECT COUNT(*) c FROM participant WHERE eid='ENG2'").get() as any).c).toBe(1);
  });
  test("history lists engagements newest first with head-counts", async () => {
    await join(1); await join(2);
    await create({ id: "ENG2" });
    const h = await (await call("GET", "/api/history", undefined, org)).json() as any;
    expect(h.retentionDays).toBe(365);
    expect(h.engagements.find((x: any) => x.id === "ENG1").participants).toBe(2);
  });
  test("purge deletes only engagements older than 365 days, with everything under them", async () => {
    await join(1);
    await call("POST", "/api/z", { id: "OLD1", startRound: 5, callSeconds: 6, cap: 10 }, org, T - 366 * D);
    await join(5, "OLD1", T - 366 * D);
    await call("POST", "/api/z", { id: "EDGE", startRound: 5, callSeconds: 6, cap: 10 }, org, T - 364 * D);
    const r = await (await call("POST", "/api/purge", {}, org)).json() as any;
    expect(r.purged).toBe(1);
    expect(raw.query("SELECT id FROM engagement ORDER BY id").all()).toEqual([{ id: "EDGE" }, { id: "ENG1" }]);
    expect((raw.query("SELECT COUNT(*) c FROM participant WHERE eid='OLD1'").get() as any).c).toBe(0);
  });
  test("a day over the write budget does not erase half-way: erase says busy and changes nothing", async () => {
    for (let i = 0; i < 5; i++) await join(i);
    env.DAILY_WRITE_BUDGET = "6";
    expect((await call("POST", "/api/z/ENG1/erase", {}, org)).status).toBe(503);
    expect((raw.query("SELECT COUNT(*) c FROM participant").get() as any).c).toBe(5);
  });
});

describe("organizers, their AI assistant, and what the AI may not do", () => {
  const plat = { "x-organizer": SECRET };
  let master = "", aiKey = "", other = "";
  const asM = () => ({ "x-organizer": master });
  const asA = () => ({ "x-organizer": aiKey });
  const FUTURE = Math.floor((T / 1000 - 1692803367) / 3) + 1 + 2000; // a start round well after T
  beforeEach(async () => {
    master = ((await (await call("POST", "/api/org", {}, plat)).json()) as any).organizerKey;
    other = ((await (await call("POST", "/api/org", {}, plat)).json()) as any).organizerKey;
    aiKey = ((await (await call("POST", "/api/org/ai", {}, asM())).json()) as any).aiKey;
    for (let i = 0; i < 6; i++) raw.run("INSERT INTO entitlement(id,org,pack,payment_id,eid,created_ms) SELECT 'g" + i + "'||hash, org, 1000, 'x', NULL, 0 FROM organizer_key WHERE kind='master'"); // purchased engagements
    await call("POST", "/api/z", { id: "MINE1", startRound: FUTURE, callSeconds: 6, cap: 50 }, asM());
  });
  test("only the platform makes organizers; keys are shown once and never stored in the clear", async () => {
    expect((await call("POST", "/api/org", {}, asM())).status).toBe(403);
    expect((await call("POST", "/api/org", {})).status).toBe(403);
    expect(master).toMatch(/^ctk_[0-9a-f]{48}$/);
    expect(aiKey).toMatch(/^cta_[0-9a-f]{48}$/);
    const dump = JSON.stringify(raw.query("SELECT * FROM organizer_key").all());
    expect(dump.includes(master) || dump.includes(aiKey)).toBe(false);
  });
  test("an organizer reaches only their own engagements; another organizer gets nothing", async () => {
    expect((await call("GET", "/api/z/MINE1/participants", undefined, asM())).status).toBe(200);
    expect((await call("GET", "/api/z/MINE1/participants", undefined, { "x-organizer": other })).status).toBe(403);
    expect((await call("GET", "/api/z/MINE1/claims", undefined, { "x-organizer": "ctk_nope" })).status).toBe(403);
    const h = await (await call("GET", "/api/history", undefined, { "x-organizer": other })).json() as any;
    expect(h.engagements).toEqual([]);
    expect((await (await call("GET", "/api/history", undefined, asM())).json() as any).engagements.map((x: any) => x.id)).toEqual(["MINE1"]);
  });
  test("another organizer can neither reuse my roster nor create over my id", async () => {
    await call("POST", "/api/z", { id: "THEIRS", startRound: FUTURE, callSeconds: 6, cap: 50 }, { "x-organizer": other });
    expect((await call("POST", "/api/z/THEIRS/reuse", { from: "MINE1" }, { "x-organizer": other })).status).toBe(400);
    const r = await (await call("POST", "/api/z", { id: "MINE1", startRound: 1, callSeconds: 6, cap: 1 }, { "x-organizer": other })).json() as any;
    expect(r.existed).toBe(true);
    expect(raw.query("SELECT cap FROM engagement WHERE id='MINE1'").get()).toEqual({ cap: 50 });
  });
  test("the AI can do the organizer's work: create, load an invite list, change settings, read people and claims, reuse", async () => {
    expect((await call("POST", "/api/z", { id: "BYAI1", startRound: FUTURE, callSeconds: 9, cap: 10 }, asA())).status).toBe(200);
    const r = await (await call("POST", "/api/z/BYAI1/roster", { people: [{ phone: phone(1), name: "A" }, { phone: phone(2), name: "B" }, { phone: "12" }] }, asA())).json() as any;
    expect(r).toMatchObject({ added: 2, invalid: 1 });
    expect((await call("PATCH", "/api/z/BYAI1/settings", { callSeconds: 12 }, asA())).status).toBe(200);
    expect(((await (await call("GET", "/api/z/BYAI1/participants", undefined, asA())).json()) as any).participants).toHaveLength(2);
    expect((await call("GET", "/api/z/BYAI1/claims", undefined, asA())).status).toBe(200);
    expect((await call("POST", "/api/z/MINE1/reuse", { from: "BYAI1" }, asA())).status).toBe(200);
  });
  test("the AI can NOT publish results, erase data, register the pause key, or mint keys", async () => {
    expect((await call("POST", "/api/z/MINE1/settle", { results: [{ pattern: "full", idx: 5, pids: ["x"] }] }, asA())).status).toBe(403);
    expect((await call("POST", "/api/z/MINE1/erase", {}, asA())).status).toBe(403);
    expect((await call("PUT", "/api/z/MINE1/control/key", { publicKey: "aa".repeat(32) }, asA())).status).toBe(403);
    expect((await call("POST", "/api/org/ai", {}, asA())).status).toBe(403);
    expect((await call("POST", "/api/org/ai/revoke", {}, asA())).status).toBe(403);
    expect((await call("POST", "/api/purge", {}, asA())).status).toBe(403);
    expect(raw.query("SELECT COUNT(*) c FROM settled").get()).toEqual({ c: 0 });
  });
  test("the refusal explains itself plainly, and the manifest says what the AI cannot do", async () => {
    const r = await (await call("POST", "/api/z/MINE1/erase", {}, asA())).json() as any;
    expect(r.error).toMatch(/AI assistant may not/);
    const mf = await (await call("GET", "/api/z/ai-manifest")).json() as any;
    expect(JSON.stringify(mf.you_cannot)).toMatch(/Publish results/);
    expect(JSON.stringify(mf)).not.toMatch(/lottery|bogey|player\b|prize\b|admin/i);
  });
  test("a new AI key replaces the old one; revoking stops it at once; the master key is unaffected", async () => {
    const second = ((await (await call("POST", "/api/org/ai", {}, asM())).json()) as any).aiKey;
    expect((await call("GET", "/api/z/MINE1/participants", undefined, asA())).status).toBe(403);
    expect((await call("GET", "/api/z/MINE1/participants", undefined, { "x-organizer": second })).status).toBe(200);
    const r = await (await call("POST", "/api/org/ai/revoke", {}, asM())).json() as any;
    expect(r.revoked).toBe(1);
    expect((await call("GET", "/api/z/MINE1/participants", undefined, { "x-organizer": second })).status).toBe(403);
    expect((await call("GET", "/api/z/MINE1/participants", undefined, asM())).status).toBe(200);
  });
  test("pausing: the AI asks, the organizer sees the request and clears it; nobody else can see it", async () => {
    expect((await call("POST", "/api/z/MINE1/control/request", { action: "explode" }, asA())).status).toBe(400);
    expect((await call("POST", "/api/z/MINE1/control/request", { action: "pause", note: "Fire drill <b>now</b>" }, asA())).status).toBe(200);
    const q = await (await call("GET", "/api/z/MINE1/control/request", undefined, asM())).json() as any;
    expect(q.requests).toHaveLength(1);
    expect(q.requests[0].note).not.toMatch(/[<>]/);
    expect((await call("GET", "/api/z/MINE1/control/request", undefined, { "x-organizer": other })).status).toBe(403);
    expect((await call("POST", "/api/z/MINE1/control/request/clear", {}, asA())).status).toBe(403);
    expect((await call("POST", "/api/z/MINE1/control/request/clear", {}, asM())).status).toBe(200);
    expect(((await (await call("GET", "/api/z/MINE1/control/request", undefined, asM())).json()) as any).requests).toEqual([]);
  });
  test("invite-only: a number on the list gets in, any other is told so; the list respects the limit", async () => {
    await call("PATCH", "/api/z/MINE1/settings", { closed: true, cap: 3 }, asM());
    await call("POST", "/api/z/MINE1/roster", { people: [{ phone: phone(1), name: "A" }, { phone: phone(2) }] }, asM());
    expect((await join(1, "MINE1")).status).toBe(200);
    const no = await join(9, "MINE1");
    expect(no.status).toBe(403);
    expect(((await no.json()) as any).error).toMatch(/by invitation/);
    const r = await (await call("POST", "/api/z/MINE1/roster", { people: [{ phone: phone(3) }, { phone: phone(4) }] }, asM())).json() as any;
    expect(r).toMatchObject({ added: 1, skipped: 1 });
  });
  test("a roster entry joins with the same ticket id they would get joining by themselves", async () => {
    await call("POST", "/api/z/MINE1/roster", { people: [{ phone: phone(5), name: "Rosa" }] }, asM());
    const pid = (raw.query("SELECT pid FROM participant WHERE eid='MINE1'").get() as any).pid;
    const j = await (await join(5, "MINE1")).json() as any;
    expect(j.pid).toBe(pid);
    expect(j.again).toBe(true);
  });
  test("roster limits: up to 100 per call, none empty, hostile bodies refused", async () => {
    expect((await call("POST", "/api/z/MINE1/roster", { people: [] }, asM())).status).toBe(400);
    expect((await call("POST", "/api/z/MINE1/roster", { people: Array.from({ length: 101 }, (_, i) => ({ phone: phone(i) })) }, asM())).status).toBe(400);
    expect((await call("POST", "/api/z/MINE1/roster", "not json", asM())).status).toBe(400);
  });
  test("settings can change before the first number and never after; bad values change nothing", async () => {
    expect((await call("PATCH", "/api/z/MINE1/settings", { callSeconds: 10 }, asM())).status).toBe(400);
    expect((await call("PATCH", "/api/z/MINE1/settings", { startRound: 5 }, asM())).status).toBe(400); // in the past
    expect((await call("PATCH", "/api/z/MINE1/settings", { callSeconds: 15, startRound: FUTURE + 100 }, asM())).status).toBe(200);
    expect(raw.query("SELECT call_seconds, start_round FROM engagement WHERE id='MINE1'").get()).toEqual({ call_seconds: 15, start_round: FUTURE + 100 });
    await call("POST", "/api/z", { id: "OLDSTART", startRound: 5, callSeconds: 6, cap: 5 }, asM()); // already started long ago
    expect((await call("PATCH", "/api/z/OLDSTART/settings", { cap: 9 }, asM())).status).toBe(409);
  });
  test("the limit cannot be set below the people already listed", async () => {
    await call("POST", "/api/z/MINE1/roster", { people: [{ phone: phone(1) }, { phone: phone(2) }, { phone: phone(3) }] }, asM());
    expect((await call("PATCH", "/api/z/MINE1/settings", { cap: 2 }, asM())).status).toBe(409);
  });
  test("the platform key still works everywhere (single-tenant and local use)", async () => {
    expect((await call("GET", "/api/z/MINE1/participants", undefined, plat)).status).toBe(200);
    expect((await call("POST", "/api/z/MINE1/erase", {}, plat)).status).toBe(200);
  });
  test("purge also removes the pause file and requests of an old engagement", async () => {
    await call("POST", "/api/z", { id: "ANCIENT", startRound: 5, callSeconds: 6, cap: 5 }, plat, T - 400 * 86_400_000);
    await call("POST", "/api/z/ANCIENT/control/request", { action: "pause" }, plat);
    await call("PUT", "/api/z/ANCIENT/control/key", { publicKey: "aa".repeat(32) }, plat);
    await call("POST", "/api/purge", {}, plat);
    expect(raw.query("SELECT COUNT(*) c FROM ctl_request WHERE eid='ANCIENT'").get()).toEqual({ c: 0 });
    expect(raw.query("SELECT COUNT(*) c FROM kv WHERE k LIKE 'control/ANCIENT%'").get()).toEqual({ c: 0 });
  });
});

describe("the shared suggestion board for every organizer's AI", () => {
  const plat = { "x-organizer": SECRET };
  let ma = "", mb = "", aiA = "";
  const asA = () => ({ "x-organizer": aiA });
  const asB = () => ({ "x-organizer": mb });
  const sug = (h: Record<string, string>, o: Record<string, unknown> = {}) => call("POST", "/api/z/suggestions", { kind: "feature", title: "Team leaderboard across rounds", body: "Show each team's total after every round so teams can compare.", ...o }, h);
  beforeEach(async () => {
    ma = ((await (await call("POST", "/api/org", {}, plat)).json()) as any).organizerKey;
    mb = ((await (await call("POST", "/api/org", {}, plat)).json()) as any).organizerKey;
    aiA = ((await (await call("POST", "/api/org/ai", {}, { "x-organizer": ma })).json()) as any).aiKey;
  });
  test("an organizer's AI can suggest; strangers cannot", async () => {
    expect((await sug(asA())).status).toBe(200);
    expect((await sug({ "x-organizer": "cta_nobody" })).status).toBe(403);
    expect((await sug({})).status).toBe(403);
  });
  test("every other organizer's AI can read the whole board, but never who wrote what", async () => {
    await sug(asA());
    const list = await (await call("GET", "/api/z/suggestions", undefined, asB())).json() as any;
    expect(list.suggestions).toHaveLength(1);
    expect(list.suggestions[0]).toMatchObject({ kind: "feature", status: "new", votes: 1, yours: false });
    expect(JSON.stringify(list)).not.toMatch(/"org"/);
    const mine = await (await call("GET", "/api/z/suggestions", undefined, asA())).json() as any;
    expect(mine.suggestions[0].yours).toBe(true);
    const asPlatform = await (await call("GET", "/api/z/suggestions", undefined, plat)).json() as any;
    expect(asPlatform.suggestions[0].org).toBeTruthy(); // we can see who, to follow up
  });
  test("the board is closed to the public", async () => {
    expect((await call("GET", "/api/z/suggestions")).status).toBe(403);
  });
  test("a vote counts once per organizer, however often it is sent", async () => {
    const id = ((await (await sug(asA())).json()) as any).id;
    for (let i = 0; i < 3; i++) await call("POST", `/api/z/suggestions/${id}/vote`, {}, asB());
    await call("POST", `/api/z/suggestions/${id}/vote`, {}, asA()); // the author already counted
    const list = await (await call("GET", "/api/z/suggestions", undefined, asB())).json() as any;
    expect(list.suggestions[0].votes).toBe(2);
    expect(list.suggestions[0].youSupported).toBe(true);
    expect((await call("POST", "/api/z/suggestions/9999/vote", {}, asB())).status).toBe(404);
  });
  test("the same idea sent twice is stored once", async () => {
    const a = await (await sug(asA())).json() as any;
    const b = await (await sug(asA(), { title: "  team LEADERBOARD   across rounds " })).json() as any;
    expect(b.duplicate).toBe(true);
    expect(b.id).toBe(a.id);
    expect(raw.query("SELECT COUNT(*) c FROM suggestion").get()).toEqual({ c: 1 });
  });
  test("only we decide the outcome: neither an AI nor an organizer can change a status or a note", async () => {
    const id = ((await (await sug(asA())).json()) as any).id;
    expect((await call("POST", `/api/z/suggestions/${id}/status`, { status: "shipped" }, asA())).status).toBe(403);
    expect((await call("POST", `/api/z/suggestions/${id}/status`, { status: "shipped" }, asB())).status).toBe(403);
    expect((await call("POST", `/api/z/suggestions/${id}/status`, { status: "declined" }, { "x-organizer": ma })).status).toBe(403);
    expect((await call("POST", `/api/z/suggestions/${id}/status`, { status: "mystery" }, plat)).status).toBe(400);
    expect((await call("POST", `/api/z/suggestions/${id}/status`, { status: "planned", note: "Good one <b>thanks</b>" }, plat)).status).toBe(200);
    const list = await (await call("GET", "/api/z/suggestions?status=planned", undefined, asB())).json() as any;
    expect(list.suggestions[0]).toMatchObject({ status: "planned", note: "Good one bthanks/b" });
    expect(((await (await call("GET", "/api/z/suggestions?status=new", undefined, asB())).json()) as any).suggestions).toEqual([]);
  });
  test("nobody can edit or delete a suggestion, their own or another's", async () => {
    const id = ((await (await sug(asA())).json()) as any).id;
    for (const m of ["PATCH", "PUT", "DELETE"]) expect([404, 403]).toContain((await call(m, `/api/z/suggestions/${id}`, { title: "hacked" }, asB())).status);
    expect(raw.query("SELECT title FROM suggestion WHERE id=?").get(id)).toEqual({ title: "Team leaderboard across rounds" });
  });
  test("bad kinds, too short or too long text and markup are refused or cleaned", async () => {
    for (const o of [{ kind: "hack" }, { title: "ab" }, { title: "x".repeat(121) }, { body: "short" }, { body: "y".repeat(2001) }]) expect((await sug(asA(), o)).status).toBe(400);
    const r = await (await sug(asA(), { title: "Use <script>alert(1)</script> colours", body: "Make the board <b>brighter</b> for older phones please." })).json() as any;
    expect(r.ok).toBe(true);
    const row = raw.query("SELECT title, body FROM suggestion WHERE id=?").get(r.id) as any;
    expect(/[<>`]/.test(row.title + row.body)).toBe(false);
  });
  test("personal details are refused so the shared board never leaks anyone", async () => {
    expect((await sug(asA(), { body: "Ask Priya at priya@acme.com to approve the list before it starts." })).status).toBe(400);
    expect((await sug(asA(), { body: "Call 98765 43210 when the engagement is about to begin please." })).status).toBe(400);
    expect((await sug(asA(), { body: "Call 9 8 7 6 5 4 3 2 1 0 when the engagement is about to begin." })).status).toBe(400);
    expect(raw.query("SELECT COUNT(*) c FROM suggestion").get()).toEqual({ c: 0 });
  });
  test("at most 20 a day per organizer, then fine again the next day", async () => {
    for (let i = 0; i < 20; i++) expect((await sug(asA(), { title: "Idea number " + i + " for later" })).status).toBe(200);
    expect((await sug(asA(), { title: "One idea too many today" })).status).toBe(429);
    expect((await sug(asB(), { title: "One idea too many today" })).status).toBe(200); // another organizer is unaffected
    expect((await call("POST", "/api/z/suggestions", { kind: "feature", title: "Fresh idea next day", body: "A perfectly reasonable description of the need." }, asA(), T + 86_400_001 + 1)).status).toBe(200);
  });
  test("a suggestion gives no one a way to run code or touch another organizer's engagements", async () => {
    await call("POST", "/api/z", { id: "OTHERS1", startRound: 99999999, callSeconds: 9, cap: 5 }, plat);
    for (const path of ["/api/z/OTHERS1/participants", "/api/z/OTHERS1/claims", "/api/z/OTHERS1/roster", "/api/z/OTHERS1/erase", "/api/z/OTHERS1/settle", "/api/z/OTHERS1/settings"])
      expect([403, 404, 405]).toContain((await call(path.endsWith("participants") || path.endsWith("claims") ? "GET" : "POST", path, {}, asA())).status);
  });
  test("the manifest tells the AI about the board and what not to put on it", async () => {
    const mf = await (await call("GET", "/api/z/ai-manifest")).json() as any;
    expect(JSON.stringify(mf)).toMatch(/suggest/i);
    expect(mf.suggestions_rules).toMatch(/Never include names, phone numbers/);
    expect(JSON.stringify(mf.you_cannot)).toMatch(/code/i);
  });
});

describe("pause file served from a cached static copy", () => {
  const plat = { "x-organizer": SECRET };
  let store: Map<string, any>;
  beforeEach(async () => {
    store = new Map();
    env.CONTROL_R2 = { put: async (k: string, v: string, o: unknown) => void store.set(k, { v, o }), delete: async (k: string) => void store.delete(k) };
    env.CONTROL_BASE = "https://c.example.test/";
    await create();
  });
  test("info tells phones where the static file is only when a static store is configured", async () => {
    expect(((await (await call("GET", "/api/z/ENG1/info")).json()) as any).controlUrl).toBe("https://c.example.test/c/ENG1.json");
    env.CONTROL_R2 = undefined;
    expect(((await (await call("GET", "/api/z/ENG1/info")).json()) as any).controlUrl).toBeNull();
  });
  test("registering the key and every signed message refreshes the static copy, which equals what the Worker serves", async () => {
    const { publicKeyFromSecret, signControlWithSecret, nextMessage, readPublished } = await import("../../../packages/beacon/src/control");
    const KEY = "55".repeat(32);
    expect((await call("PUT", "/api/z/ENG1/control/key", { publicKey: publicKeyFromSecret(KEY) }, plat)).status).toBe(200);
    expect(store.get("c/ENG1.json")).toBeTruthy();
    const kv = { get: async (k: string) => (raw.query("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} };
    const f = (await readPublished(kv, "ENG1"))!;
    const nowRound = Math.floor((T / 1000 - 1692803367) / 3) + 1;
    const m = signControlWithSecret(KEY, nextMessage(f, nowRound, { action: "pause", pauseForRounds: 20 }));
    expect((await call("POST", "/api/z/ENG1/control", { message: m })).status).toBe(200);
    const served = await (await call("GET", "/api/z/ENG1/control")).text();
    expect(JSON.parse(store.get("c/ENG1.json").v)).toEqual(JSON.parse(served));
    expect(JSON.parse(served).messages).toHaveLength(1);
    expect(store.get("c/ENG1.json").o.httpMetadata.cacheControl).toBe("public, max-age=3");
  });
  test("a refused message leaves the static copy untouched", async () => {
    const { publicKeyFromSecret, signControlWithSecret, nextMessage, readPublished } = await import("../../../packages/beacon/src/control");
    await call("PUT", "/api/z/ENG1/control/key", { publicKey: publicKeyFromSecret("55".repeat(32)) }, plat);
    const before = store.get("c/ENG1.json").v;
    const kv = { get: async (k: string) => (raw.query("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} };
    const f = (await readPublished(kv, "ENG1"))!;
    const bad = signControlWithSecret("66".repeat(32), nextMessage(f, 100, { action: "pause", pauseForRounds: 10 }));
    expect((await call("POST", "/api/z/ENG1/control", { message: bad })).status).toBe(403);
    expect(store.get("c/ENG1.json").v).toBe(before);
  });
  test("if the static store fails, signing and serving still work from the Worker", async () => {
    const { publicKeyFromSecret } = await import("../../../packages/beacon/src/control");
    env.CONTROL_R2 = { put: async () => { throw new Error("r2 down"); }, delete: async () => {} };
    expect((await call("PUT", "/api/z/ENG1/control/key", { publicKey: publicKeyFromSecret("55".repeat(32)) }, plat)).status).toBe(200);
    expect((await call("GET", "/api/z/ENG1/control")).status).toBe(200);
  });
  test("purging an old engagement removes its static copy too", async () => {
    const { publicKeyFromSecret } = await import("../../../packages/beacon/src/control");
    await call("POST", "/api/z", { id: "OLD99", startRound: 5, callSeconds: 6, cap: 5 }, plat, T - 400 * 86_400_000);
    await call("PUT", "/api/z/OLD99/control/key", { publicKey: publicKeyFromSecret("77".repeat(32)) }, plat);
    expect(store.has("c/OLD99.json")).toBe(true);
    await call("POST", "/api/purge", {}, plat);
    expect(store.has("c/OLD99.json")).toBe(false);
  });
});

describe("tickets, reward lines and brand breaks", () => {
  const FUT = Math.floor((T / 1000 - 1692803367) / 3) + 1 + 4000;
  const mk = (extra: Record<string, unknown> = {}, id = "CFG01") => call("POST", "/api/z", { id, startRound: FUT, callSeconds: 9, cap: 50, ...extra }, org);
  const info = async (id = "CFG01") => (await (await call("GET", `/api/z/${id}/info`)).json()) as any;
  test("an engagement with nothing set shows phones the plain defaults", async () => {
    await mk();
    const i = await info();
    expect(i.tickets).toBe(1);
    expect(i.rewards).toHaveLength(7);
    expect(i.breaks).toEqual([]);
  });
  test("settings given at creation are kept and shown to every phone; bad ones refuse the whole creation", async () => {
    const good = { tickets: 2, rewards: [{ pattern: "full", ordinal: 1, text: "Hamper" }, { pattern: "full", scope: "two_ticket", text: "Grand hamper" }], breaks: [{ after: 40, seconds: 45, kind: "speech", title: "CEO message" }] };
    expect((await mk(good)).status).toBe(200);
    const i = await info();
    expect(i).toMatchObject({ tickets: 2, breaks: [{ after: 40, seconds: 45, kind: "speech", title: "CEO message" }] });
    expect(i.rewards.map((r: any) => r.text)).toEqual(["Hamper", "Grand hamper"]);
    expect((await mk({ breaks: [{ after: 5, seconds: 20, kind: "speech", title: "x" }] }, "CFG02")).status).toBe(400);
    expect((await mk({ tickets: 5 }, "CFG03")).status).toBe(400);
    expect(raw.query("SELECT COUNT(*) c FROM engagement WHERE id IN ('CFG02','CFG03')").get()).toEqual({ c: 0 });
  });
  test("joining returns the settings too, so a phone never needs a second call", async () => {
    await mk({ tickets: 2, rewards: [{ pattern: "full", text: "Hamper" }] });
    const r = await (await join(1, "CFG01")).json() as any;
    expect(r.tickets).toBe(2);
    expect(r.rewards[0].text).toBe("Hamper");
  });
  test("settings can be changed before the start and never after, and a bad change changes nothing", async () => {
    await mk();
    expect((await call("PATCH", "/api/z/CFG01/settings", { tickets: 2, rewards: [{ pattern: "top", text: "Voucher" }], breaks: [{ after: 20, seconds: 30, kind: "speech", title: "Welcome" }] }, org)).status).toBe(200);
    expect(await info()).toMatchObject({ tickets: 2, rewards: [{ pattern: "top", text: "Voucher" }], breaks: [{ after: 20 }] });
    expect((await call("PATCH", "/api/z/CFG01/settings", { breaks: [{ after: 20, seconds: 31, kind: "speech", title: "Welcome" }] }, org)).status).toBe(400);
    expect((await info()).breaks).toHaveLength(1);
    await call("POST", "/api/z", { id: "STARTED1", startRound: 5, callSeconds: 6, cap: 5 }, org);
    expect((await call("PATCH", "/api/z/STARTED1/settings", { tickets: 2 }, org)).status).toBe(409);
  });
  test("results carry which reward line each outcome is for, and a line can be re-published", async () => {
    await mk({ tickets: 1, rewards: [{ pattern: "full", ordinal: 1 }, { pattern: "full", ordinal: 2 }] });
    const body = (idx: number) => ({ results: [{ pattern: "full", ordinal: 1, idx, pids: ["a"] }, { pattern: "full", ordinal: 2, idx: idx + 3, pids: ["b", "c"] }] });
    expect((await call("POST", "/api/z/CFG01/settle", body(50), org)).status).toBe(200);
    expect((await call("POST", "/api/z/CFG01/settle", body(51), org)).status).toBe(200);
    const r = await (await call("GET", "/api/z/CFG01/results")).json() as any;
    expect(r.results).toEqual([{ pattern: "full", ordinal: 1, round: 1, idx: 51, count: 1 }, { pattern: "full", ordinal: 2, round: 1, idx: 54, count: 2 }]);
    expect((await call("POST", "/api/z/CFG01/settle", { results: [{ pattern: "full", ordinal: 6, idx: 1, pids: [] }] }, org)).status).toBe(400);
    expect((await call("POST", "/api/z/CFG01/settle", { results: [{ pattern: "full2", ordinal: 1, idx: 1, pids: [] }] }, org)).status).toBe(200);
  });
});

describe("lucky draw results", () => {
  const FUT = Math.floor((T / 1000 - 1692803367) / 3) + 1 + 4000;
  beforeEach(async () => {
    await call("POST", "/api/z", { id: "LUCK1", startRound: FUT, callSeconds: 9, cap: 50, breaks: [{ after: 20, seconds: 30, kind: "lucky", title: "Lucky draw", winners: 3 }] }, org);
  });
  const pub = async () => (await (await call("GET", "/api/z/LUCK1/results")).json()) as any;
  test("only the organizer's own console publishes winners, and they are shown by opaque ids so each phone can tell if it won", async () => {
    expect((await call("POST", "/api/z/LUCK1/settle", { results: [{ pattern: "lucky", ordinal: 1, idx: 20, pids: ["aa11", "bb22", "cc33"] }] })).status).toBe(403);
    expect((await call("POST", "/api/z/LUCK1/settle", { results: [{ pattern: "lucky", ordinal: 1, idx: 20, pids: ["aa11", "bb22", "cc33"] }] }, org)).status).toBe(200);
    const r = await pub();
    expect(r.results[0]).toEqual({ pattern: "lucky", ordinal: 1, round: 1, idx: 20, count: 3, winners: ["aa11", "bb22", "cc33"] });
  });
  test("house results still carry counts only", async () => {
    await call("POST", "/api/z/LUCK1/settle", { results: [{ pattern: "full", ordinal: 1, idx: 70, pids: ["secretpid"] }] }, org);
    expect(JSON.stringify(await pub()).includes("secretpid")).toBe(false);
  });
  test("a draw that is not in the engagement's settings, or with too many winners, is refused", async () => {
    expect((await call("POST", "/api/z/LUCK1/settle", { results: [{ pattern: "lucky", ordinal: 2, idx: 20, pids: ["a"] }] }, org)).status).toBe(400);
    expect((await call("POST", "/api/z/LUCK1/settle", { results: [{ pattern: "lucky", ordinal: 1, idx: 20, pids: Array.from({ length: 11 }, (_, i) => "p" + i) }] }, org)).status).toBe(400);
    expect((await call("POST", "/api/z/LUCK1/settle", { results: [{ pattern: "lucky", ordinal: 1, idx: 20, pids: [1, 2] }] }, org)).status).toBe(400);
    expect((await pub()).results).toEqual([]);
  });
  test("re-publishing a draw replaces it rather than adding a second set of winners", async () => {
    await call("POST", "/api/z/LUCK1/settle", { results: [{ pattern: "lucky", ordinal: 1, idx: 20, pids: ["a"] }] }, org);
    await call("POST", "/api/z/LUCK1/settle", { results: [{ pattern: "lucky", ordinal: 1, idx: 20, pids: ["b"] }] }, org);
    expect((await pub()).results.map((x: any) => x.winners)).toEqual([["b"]]);
  });
  test("an engagement with no lucky draw refuses lucky results", async () => {
    await call("POST", "/api/z", { id: "PLAIN1", startRound: FUT, callSeconds: 9, cap: 50 }, org);
    expect((await call("POST", "/api/z/PLAIN1/settle", { results: [{ pattern: "lucky", ordinal: 1, idx: 20, pids: ["a"] }] }, org)).status).toBe(400);
  });
});

describe("an organizer's own sign-in keys", () => {
  const plat = { "x-organizer": SECRET };
  let a1 = "", other = "";
  beforeEach(async () => { a1 = ((await (await call("POST", "/api/org", {}, plat)).json()) as any).organizerKey; other = ((await (await call("POST", "/api/org", {}, plat)).json()) as any).organizerKey; });
  const list = async (k: string) => (await (await call("GET", "/api/org/keys", undefined, { "x-organizer": k })).json()) as any;
  test("lists only their own keys, marks the one in use, and never shows a key", async () => {
    const l = await list(a1);
    expect(l.keys).toHaveLength(1);
    expect(l.keys[0]).toMatchObject({ kind: "master", revoked: false, thisOne: true });
    expect(JSON.stringify(l).includes(a1)).toBe(false);
    expect((await list(other)).keys).toHaveLength(1);
    expect((await call("GET", "/api/org/keys")).status).toBe(403);
  });
  test("an old key can be retired from another signed-in key, and then stops working at once", async () => {
    const aiK = ((await (await call("POST", "/api/org/ai", {}, { "x-organizer": a1 })).json()) as any).aiKey;
    const l = await list(a1);
    const ai = l.keys.find((k: any) => k.kind === "ai");
    expect((await call("POST", "/api/org/keys/revoke", { id: ai.id }, { "x-organizer": a1 })).status).toBe(200);
    expect((await call("GET", "/api/history", undefined, { "x-organizer": aiK })).status).toBe(403);
    expect((await list(a1)).keys.find((k: any) => k.id === ai.id).revoked).toBe(true);
  });
  test("you cannot retire the key you are using, and the AI key cannot manage keys", async () => {
    const mine = (await list(a1)).keys[0];
    const r = await call("POST", "/api/org/keys/revoke", { id: mine.id }, { "x-organizer": a1 });
    expect(r.status).toBe(409);
    expect((await call("GET", "/api/history", undefined, { "x-organizer": a1 })).status).toBe(200);
    const aiK = ((await (await call("POST", "/api/org/ai", {}, { "x-organizer": a1 })).json()) as any).aiKey;
    expect((await call("GET", "/api/org/keys", undefined, { "x-organizer": aiK })).status).toBe(403);
    expect((await call("POST", "/api/org/keys/revoke", { id: mine.id }, { "x-organizer": aiK })).status).toBe(403);
  });
  test("one organizer cannot retire another's key, and a bad id is refused", async () => {
    const theirs = (await list(other)).keys[0];
    const r = await (await call("POST", "/api/org/keys/revoke", { id: theirs.id }, { "x-organizer": a1 })).json() as any;
    expect(r.revoked).toBe(0);
    expect((await call("GET", "/api/history", undefined, { "x-organizer": other })).status).toBe(200);
    for (const id of ["zz", "", 5, "../../../etc"]) expect((await call("POST", "/api/org/keys/revoke", { id }, { "x-organizer": a1 })).status).toBe(400);
  });
});

describe("rounds in the store", () => {
  const FUT = Math.floor((T / 1000 - 1692803367) / 3) + 1 + 4000;
  test("rounds are set at creation or before the start, shown to phones, and 1 to 5 only", async () => {
    expect((await call("POST", "/api/z", { id: "RND01", startRound: FUT, callSeconds: 9, cap: 50, rounds: 3 }, org)).status).toBe(200);
    expect(((await (await call("GET", "/api/z/RND01/info")).json()) as any).rounds).toBe(3);
    expect((await call("PATCH", "/api/z/RND01/settings", { rounds: 2 }, org)).status).toBe(200);
    expect(((await (await call("GET", "/api/z/RND01/info")).json()) as any).rounds).toBe(2);
    for (const r of [0, 6, 1.5, "2"]) { expect((await call("PATCH", "/api/z/RND01/settings", { rounds: r }, org)).status).toBe(400); expect((await call("POST", "/api/z", { id: "BADR" + String(r).length, startRound: FUT, callSeconds: 9, cap: 5, rounds: r }, org)).status).toBe(400); }
    expect(((await (await call("GET", "/api/z/RND01/info")).json()) as any).rounds).toBe(2);
  });
  test("an engagement with nothing set is one round", async () => {
    await call("POST", "/api/z", { id: "RND02", startRound: FUT, callSeconds: 9, cap: 50 }, org);
    expect(((await (await call("GET", "/api/z/RND02/info")).json()) as any).rounds).toBe(1);
  });
  test("claims are kept per round, a round that does not exist is ignored, and the same claim in two rounds is two claims", async () => {
    await call("POST", "/api/z", { id: "RND03", startRound: FUT, callSeconds: 9, cap: 50, rounds: 2 }, org);
    const pid = ((await (await join(1, "RND03")).json()) as any).pid;
    const claim = (c: unknown) => call("POST", "/api/z/RND03/claims", { pid, claims: [c] });
    await claim({ pattern: "top", idx: 20 }); await claim({ pattern: "top", idx: 25, round: 2 }); await claim({ pattern: "top", idx: 25, round: 2 }); await claim({ pattern: "top", idx: 30, round: 3 }); await claim({ pattern: "top", idx: 30, round: 0 });
    const c = (await (await call("GET", "/api/z/RND03/claims", undefined, org)).json() as any).claims;
    expect(c).toEqual([{ pid, pattern: "top", round: 1, idx: 20 }, { pid, pattern: "top", round: 2, idx: 25 }]);
  });
  test("results are published per round and lines can be re-published; a round that does not exist, or a lucky draw in round 2, is refused", async () => {
    await call("POST", "/api/z", { id: "RND04", startRound: FUT, callSeconds: 9, cap: 50, rounds: 2, breaks: [{ after: 20, seconds: 30, kind: "lucky", title: "Draw", winners: 3 }] }, org);
    const post = (results: unknown[]) => call("POST", "/api/z/RND04/settle", { results }, org);
    expect((await post([{ pattern: "full", ordinal: 1, round: 1, idx: 60, pids: ["a"] }, { pattern: "full", ordinal: 1, round: 2, idx: 70, pids: ["b", "c"] }])).status).toBe(200);
    await post([{ pattern: "full", ordinal: 1, round: 2, idx: 71, pids: ["d"] }]);
    const r = (await (await call("GET", "/api/z/RND04/results")).json() as any).results;
    expect(r.map((x: any) => [x.round, x.idx, x.count])).toEqual([[1, 60, 1], [2, 71, 1]]);
    expect((await post([{ pattern: "full", round: 3, idx: 1, pids: [] }])).status).toBe(400);
    expect((await post([{ pattern: "full", round: 0, idx: 1, pids: [] }])).status).toBe(400);
    expect((await post([{ pattern: "lucky", ordinal: 1, round: 2, idx: 20, pids: ["a"] }])).status).toBe(400);
    expect((await post([{ pattern: "lucky", ordinal: 1, round: 1, idx: 20, pids: ["a"] }])).status).toBe(200);
  });
  test("erase removes every round's claims and results", async () => {
    await call("POST", "/api/z", { id: "RND05", startRound: FUT, callSeconds: 9, cap: 50, rounds: 2 }, org);
    const pid = ((await (await join(1, "RND05")).json()) as any).pid;
    await call("POST", "/api/z/RND05/claims", { pid, claims: [{ pattern: "top", idx: 20, round: 2 }] });
    await call("POST", "/api/z/RND05/settle", { results: [{ pattern: "top", round: 2, idx: 20, pids: [pid] }] }, org);
    await call("POST", "/api/z/RND05/erase", {}, org);
    for (const t of ["claim", "settled", "participant"]) expect((raw.query(`SELECT COUNT(*) c FROM ${t} WHERE eid='RND05'`).get() as any).c).toBe(0);
  });
});

describe("big lists come in pages, and the daily clean-up runs by itself", () => {
  const plat = { "x-organizer": SECRET };
  const D = 86_400_000;
  const old = (id: string) => raw.run("INSERT INTO engagement(id,start_round,call_seconds,cap,created_ms,org,closed,pack,tickets,config) VALUES(?,?,?,?,?,NULL,0,5,1,NULL)".replace(/\?/g, () => "?"), [id, 5, 6, 5, T - 400 * D] as any);
  test("participants are returned in pages with a total, so one request never has to carry a whole 10,000-person list", async () => {
    await create({ cap: 20000 });
    for (let i = 0; i < 7; i++) await join(i);
    const p1 = await (await call("GET", "/api/z/ENG1/participants?limit=3", undefined, org)).json() as any;
    const p2 = await (await call("GET", "/api/z/ENG1/participants?limit=3&offset=3", undefined, org)).json() as any;
    const p3 = await (await call("GET", "/api/z/ENG1/participants?limit=3&offset=6", undefined, org)).json() as any;
    expect([p1.participants.length, p2.participants.length, p3.participants.length]).toEqual([3, 3, 1]);
    expect(p1.total).toBe(7);
    expect(new Set([...p1.participants, ...p2.participants, ...p3.participants].map((x: any) => x.pid)).size).toBe(7);
    const all = await (await call("GET", "/api/z/ENG1/participants", undefined, org)).json() as any;
    expect(all.participants).toHaveLength(7);
    for (const q of ["limit=0", "limit=-5", "limit=abc", "offset=-4", "limit=999999"]) expect((await call("GET", "/api/z/ENG1/participants?" + q, undefined, org)).status).toBe(200);
    expect(((await (await call("GET", "/api/z/ENG1/participants?limit=999999", undefined, org)).json()) as any).limit).toBeLessThanOrEqual(2000);
  });
  test("the 365-day purge runs on its own the first time an organizer acts each day, and at most once a day", async () => {
    old("OLDONE");
    expect((raw.query("SELECT COUNT(*) c FROM engagement WHERE id='OLDONE'").get() as any).c).toBe(1);
    await call("GET", "/api/history", undefined, plat, T); // first organizer request of the day: housekeeping runs
    expect((raw.query("SELECT COUNT(*) c FROM engagement WHERE id='OLDONE'").get() as any).c).toBe(0);
    old("OLDTWO");
    await call("GET", "/api/history", undefined, plat, T + 1000); // same day: does not run again
    expect((raw.query("SELECT COUNT(*) c FROM engagement WHERE id='OLDTWO'").get() as any).c).toBe(1);
    await call("GET", "/api/history", undefined, plat, T + D + 1000); // next day: runs
    expect((raw.query("SELECT COUNT(*) c FROM engagement WHERE id='OLDTWO'").get() as any).c).toBe(0);
  });
  test("phones and public reads never trigger it (only organizer-side requests do)", async () => {
    await create();
    old("OLDTHREE");
    await call("GET", "/api/z/ENG1/info"); await join(1);
    expect((raw.query("SELECT COUNT(*) c FROM engagement WHERE id='OLDTHREE'").get() as any).c).toBe(1);
  });
});
