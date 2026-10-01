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
const create = (over: Record<string, unknown> = {}) => call("POST", "/api/e", { id: "ENG1", startRound: 1000, callSeconds: 6, cap: 20000, ...over }, org);
const phone = (i: number) => "9" + String(100000000 + i);
const join = (i: number, eid = "ENG1", now = T) => call("POST", `/api/e/${eid}/join`, { phone: phone(i), name: "P" + i }, {}, now);

beforeEach(() => {
  const d = makeD1();
  raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: SECRET, DAILY_WRITE_BUDGET: "80000" };
});

describe("engagement set-up", () => {
  test("only the organizer can create one", async () => {
    expect((await call("POST", "/api/e", { id: "ENG1", startRound: 1, callSeconds: 6, cap: 10 })).status).toBe(403);
    expect((await call("POST", "/api/e", { id: "ENG1", startRound: 1, callSeconds: 6, cap: 10 }, { "x-organizer": "wrong" })).status).toBe(403);
  });
  test("with no secret configured, nobody is the organizer (no empty-secret bypass)", async () => {
    env.ORGANIZER_SECRET = undefined;
    expect((await call("POST", "/api/e", { id: "ENG1", startRound: 1, callSeconds: 6, cap: 10 }, { "x-organizer": "" })).status).toBe(403);
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
    expect(raw.query("SELECT cap FROM engagement WHERE id='ENG1'").get()).toEqual({ cap: 20000 });
  });
});

describe("joining", () => {
  beforeEach(async () => { await create(); });
  test("a join returns what the phone needs to play and nothing about others", async () => {
    const r = await (await join(1)).json() as any;
    expect(r.startRound).toBe(1000);
    expect(r.callSeconds).toBe(6);
    expect(r.pid).toHaveLength(16);
    expect(Object.keys(r).sort()).toEqual(["callSeconds", "pid", "startRound"]);
  });
  test("the same number joining twice, even typed differently, is one participant and one write", async () => {
    const a = await (await call("POST", "/api/e/ENG1/join", { phone: "+91 98765-43210" })).json() as any;
    const b = await (await call("POST", "/api/e/ENG1/join", { phone: "919876543210" })).json() as any;
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
      expect((await call("POST", "/api/e/ENG1/join", b as any)).status).toBe(400);
    expect((await call("POST", "/api/e/ENG1/join", "x".repeat(10000))).status).toBe(400);
  });
  test("names are cleaned and cut", async () => {
    await call("POST", "/api/e/ENG1/join", { phone: phone(2), name: "<script>alert(1)</script>`x`" + "y".repeat(200) });
    const n = (raw.query("SELECT name FROM participant").get() as any).name as string;
    expect(/[<>`]/.test(n)).toBe(false);
    expect(n.length).toBeLessThanOrEqual(60);
  });
  test("unknown engagement, wrong method and odd paths", async () => {
    expect((await join(1, "NOPE1")).status).toBe(404);
    expect((await call("GET", "/api/e/ENG1/join")).status).toBe(404);
    expect((await call("POST", "/api/e/ENG1/../x")).status).toBe(404);
    expect((await call("DELETE", "/api/e/ENG1/claims")).status).toBe(404);
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
  const claim = (b: unknown) => call("POST", "/api/e/ENG1/claims", b);
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
    expect((await call("GET", "/api/e/ENG1/claims")).status).toBe(403);
    expect((await call("GET", "/api/e/ENG1/claims", undefined, { "x-organizer": "no" })).status).toBe(403);
    expect((await call("GET", "/api/e/ENG1/claims", undefined, org)).status).toBe(200);
  });
});

describe("settling and results", () => {
  beforeEach(async () => { await create(); });
  test("only the organizer settles; a re-settle replaces, never duplicates", async () => {
    const body = { results: [{ pattern: "top", idx: 20, pids: ["a", "b"] }] };
    expect((await call("POST", "/api/e/ENG1/settle", body)).status).toBe(403);
    expect((await call("POST", "/api/e/ENG1/settle", body, org)).status).toBe(200);
    await call("POST", "/api/e/ENG1/settle", { results: [{ pattern: "top", idx: 18, pids: ["c"] }] }, org);
    expect(raw.query("SELECT COUNT(*) c FROM settled").get()).toEqual({ c: 1 });
  });
  test("public results show counts only, never who", async () => {
    await call("POST", "/api/e/ENG1/settle", { results: [{ pattern: "full", idx: 70, pids: ["secretpid1", "secretpid2"] }] }, org);
    const txt = await (await call("GET", "/api/e/ENG1/results")).text();
    expect(txt.includes("secretpid")).toBe(false);
    expect(JSON.parse(txt).results[0]).toEqual({ pattern: "full", idx: 70, count: 2 });
  });
  test("a malformed result changes nothing", async () => {
    expect((await call("POST", "/api/e/ENG1/settle", { results: [{ pattern: "top", idx: 1, pids: "no" }] }, org)).status).toBe(400);
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
    expect((raw.query("SELECT writes w FROM usage").get() as any).w).toBe(10001);
    expect(10001).toBeLessThan(100000 * 0.2); // one 10,000-person engagement uses ~10% of D1's free daily writes
  });
  test("10,000 joins plus every pattern claimed by 10,000 phones, twice (retries) - stored once each", async () => {
    await create({ cap: 20000 });
    const pids: string[] = [];
    for (let i = 0; i < 10000; i++) pids.push(((await (await join(i)).json()) as any).pid);
    const pats = ["early5", "top", "mid", "bot", "corners", "star", "full"];
    for (let round = 0; round < 2; round++)
      await Promise.all(pids.slice(0, 2000).map((pid, i) => call("POST", "/api/e/ENG1/claims", { pid, claims: [{ pattern: pats[i % 7], idx: i % 90 }] })));
    expect((raw.query("SELECT COUNT(*) c FROM claim").get() as any).c).toBe(2000);
  });
});
