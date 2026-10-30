// 1.8.3 audit fixes for the optional Email ID: (4) the public "open" flag follows the rule date, (2) the email guessing counters are erased with the game's data,
// (a) a ticket that already exists is never erased by the email race undo, (c) leaving and the 24-hour erase delete the email record, (1) the privacy pages name the Email ID.
// FALSIFIED BY: open-ignores-rule-date, emailmiss-not-erased, email-key-kept-on-leave, privacy-silent-about-email
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join as pjoin } from "node:path";
import { handle, type Env } from "../src/worker";
import { CONSENT_VERSION, boxesOf, type ConsentKind } from "../src/consent";
import { erasePersonal } from "../src/lifecycle";
import { makeD1 } from "./d1-sqlite";

const T_NEW = Date.UTC(2026, 10, 5, 10, 0, 0), T_OLD = Date.UTC(2026, 9, 1, 10, 0, 0), GEN = 1692803367; // after / before APPROVAL_RULES_FROM_MS
const startOf = (t: number) => Math.floor((t / 1000 - GEN) / 3) + 1200;
let env: Env; let raw: ReturnType<typeof makeD1>["raw"]; let ip = 0;
const call = (method: string, path: string, body?: unknown, key?: string, now = T_NEW) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.9.${++ip % 200}`, ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const ticks = (k: ConsentKind) => ({ v: CONSENT_VERSION, boxes: boxesOf(k) });
const dev = (i: number) => i.toString(16).padStart(4, "0").repeat(8);
const ROOT = pjoin(import.meta.dir, "../../..");
const rd = (f: string) => readFileSync(pjoin(ROOT, f), "utf8").replace(/\r\n/g, "\n");

beforeEach(() => {
  const d = makeD1({ strictHosts: true }); raw = d.raw; ip = 0;
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt", DATA_KEY: "k", TEST_MODE: "1", FREE_LAUNCH: "1" } as Env;
});
async function game(id: string, t: number, over: Record<string, unknown> = {}) {
  const key = (await j(await call("POST", "/api/start", { email: `boss.${id.toLowerCase()}@acme.com`, consent: ticks("K2") }, undefined, t))).token as string;
  expect((await call("POST", "/api/z", { id, startRound: startOf(t), callSeconds: 6, cap: 100, ...over }, key, t)).status).toBe(200);
  expect((await call("POST", `/api/z/${id}/publish`, { email: `boss.${id.toLowerCase()}@acme.com`, phone: "98765 43210", consent: ticks("K1") }, key, t)).status).toBe(200);
  return key;
}
const join = (id: string, i: number, email?: string, t = T_NEW) => call("POST", `/api/z/${id}/join`, { phone: "98111005" + String(10 + i), name: "P" + i, device: dev(i), ...(email ? { email } : {}), consent: ticks("K4") }, undefined, t);

describe("(4) the open flag follows the rule date", () => {
  test("open: true only for an open game made after the date; false for a list game and for any game made before the date (the server ignores email there)", async () => {
    await game("EF-1", T_NEW); await game("EF-2", T_NEW, { whoCanJoin: "list" }); await game("EF-3", T_OLD);
    expect((await j(await call("GET", "/api/z/EF-1/info"))).open).toBe(true);
    expect((await j(await call("GET", "/api/z/EF-2/info"))).open).toBe(false);
    expect((await j(await call("GET", "/api/z/EF-3/info", undefined, undefined, T_OLD))).open).toBe(false);
    expect((await j(await join("EF-1", 1))).open).toBe(true); // and the join answer says the same
  });
});

describe("(2) + (c) the email records and the guessing counters go with the game's data", () => {
  test("a refused second phone leaves an emailmiss counter; the 24-hour erase removes it with the email key and the idmiss counters", async () => {
    await game("EF-4", T_NEW);
    expect((await join("EF-4", 1, "asha@acme.com")).status).toBe(200);
    expect((await join("EF-4", 2, "asha@acme.com")).status).toBe(409); // makes the emailmiss counter
    raw.run("INSERT INTO kv(k,v) VALUES(?,?)", ["idmiss/EF-4/2026-11-05T10:0/abcd", "1"]);
    const count = (prefix: string) => (raw.query("SELECT COUNT(*) c FROM kv WHERE k >= ? AND k < ?").get(prefix, prefix.slice(0, -1) + "0") as any).c;
    expect(count("email/EF-4/")).toBe(1); expect(count("emailmiss/EF-4/")).toBe(1); expect(count("idmiss/EF-4/")).toBe(1);
    await erasePersonal(env as any, "EF-4", T_NEW + 21 * 3600_000, "sweep");
    expect([count("email/EF-4/"), count("emailmiss/EF-4/"), count("idmiss/EF-4/")]).toEqual([0, 0, 0]);
  });
  test("a player who LEAVES gives the email back: another phone can use it afterwards", async () => {
    await game("EF-5", T_NEW);
    const a = await j(await join("EF-5", 1, "asha@acme.com")); expect(a.pid).toBeTruthy();
    expect((await join("EF-5", 2, "asha@acme.com")).status).toBe(409);
    expect((await call("POST", "/api/z/EF-5/leave", { pid: a.pid, device: dev(1) })).status).toBe(200);
    expect((raw.query("SELECT COUNT(*) c FROM kv WHERE k LIKE 'email/EF-5/%'").get() as any).c).toBe(0);
    expect((await join("EF-5", 2, "asha@acme.com")).status).toBe(200);
  });
});

describe("(a) the email race undo never erases a ticket that already exists", () => {
  test("a phone that already holds a ticket (without an email) rejoins with an email another phone has claimed: it keeps its ticket and is not undone", async () => {
    await game("EF-6", T_NEW);
    const a = await j(await join("EF-6", 1)); expect(a.pid).toBeTruthy(); // seated without an email
    expect((await join("EF-6", 2, "shared@acme.com")).status).toBe(200); // another phone claims the email
    const again = await join("EF-6", 1, "shared@acme.com"); expect(again.status).toBe(200); expect((await j(again)).pid).toBe(a.pid);
    expect(raw.query("SELECT COUNT(*) c FROM participant WHERE eid='EF-6'").get()).toEqual({ c: 2 });
    expect(raw.query("SELECT COUNT(*) c FROM seat WHERE eid='EF-6' AND pid=?").get(a.pid)).toEqual({ c: 1 });
  });
  test("the undo only takes back a seat THIS request made (the guard is in the code)", () => {
    const w = rd("apps/edge/src/worker.ts");
    expect(w).toContain("joined_ms FROM participant WHERE eid=? AND pid=?"); expect(w).toContain("if (!madeNow) return reply(row.pid");
  });
});

describe("(1) the pages name the optional Email ID", () => {
  test("privacy, DPA, terms and the Trust facts say: open game, optional, this game only, deleted with the rest within 24 hours", () => {
    const p = rd("apps/web/public/privacy.html");
    expect(p).toContain("In an open game you may also give an email ID: it is optional, used only for this game");
    expect(p).toContain("name, mobile number, email ID (if given), ticket, phone code");
    expect(rd("apps/web/public/dpa.html")).toContain("an optional email ID in an open game");
    expect(rd("apps/web/public/terms.html")).toContain("mobile number, optional email ID, device identifier");
    expect(rd("apps/edge/src/ai-facts.ts")).toContain("a guest in an open game may also give an optional email ID for that game, deleted with the rest within 24 hours");
    expect(rd("apps/web/public/trust.html")).toContain("optional email ID");
  });
});
