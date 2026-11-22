// 20 Nov 2026 (owner): "Invite people with just an ID". One alphanumeric ID, no name, no mobile number. A-1101, A 1101 and A/1101 are the same ID at upload, at join and at approval,
// in every game (old or new). An ID that is not on the list waits; the Organizer says yes or no; every step is in a log that shows only the ID. The list and the IDs are erased with the
// players' data. The real Worker code against an in-memory D1, as empid.test.ts does.
// FALSIFIED BY: idinvite-dash-differs, idinvite-space-differs, idinvite-slash-differs, idinvite-unlisted-joins-straight-in, idinvite-log-shows-name, idinvite-erase-keeps-ids
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { EMP_LEGACY_BEFORE_MS } from "../src/empid";
import { erasePersonal } from "../src/lifecycle";

const NEW_T = Math.max(Date.UTC(2026, 10, 20, 10, 0, 0), EMP_LEGACY_BEFORE_MS + 86_400_000);
const OLD_T = EMP_LEGACY_BEFORE_MS - 3 * 86_400_000; // a game made before the first release of the uniform rule
const GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
let env: PayEnv; let ipN = 0;
const realFetch = globalThis.fetch;
const call = (now: number, method: string, path: string, body?: unknown, key?: string) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env as any, now);
const j = async (r: Response) => (await r.json()) as any;
const dev = (i: number) => (String(i).padStart(2, "0") + "c".repeat(32)).slice(0, 32);
async function setup(at: number, settings: Record<string, unknown> = {}) {
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.7.${++ipN}` }, body: JSON.stringify({ email: `demo${ipN}@demo-test.invalid` }) }), env as any, at));
  const master = st.token as string, start = roundAt(at) + 1200;
  await call(at, "POST", "/api/z", { id: "IDI-1", startRound: start, callSeconds: 6, cap: 100, whoCanJoin: "list" }, master);
  await call(at, "POST", "/api/z/IDI-1/publish", { email: "demo1@demo-test.invalid", phone: "98765 43210" }, master);
  expect((await call(at, "PATCH", "/api/z/IDI-1/settings", { verify: "id", ...settings }, master)).status).toBe(200);
  return master;
}
const add = (at: number, key: string, ids: string[]) => call(at, "POST", "/api/z/IDI-1/people", { people: ids.map((empId) => ({ empId })) }, key);
const join = (at: number, empId: string, i: number) => call(at, "POST", "/api/z/IDI-1/join", { empId, device: dev(i) });
const count = async (sql: string, ...a: unknown[]) => Number(((await env.DB.prepare(sql).bind(...a).first<any>()) as any)?.c ?? 0);
beforeEach(() => { const d = makeD1(); env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt" } as any; (globalThis as any).fetch = async () => new Response("{}", { status: 404 }); });
afterEach(() => { globalThis.fetch = realFetch; });

for (const [label, T] of [["a new game", NEW_T], ["a game made before the uniform rule", OLD_T]] as const) {
  describe(`A-1101, A 1101 and A/1101 are one ID (${label})`, () => {
    test("uploaded as A-1101, the person gets in typing A 1101; the same ID typed again as A/1101 is the same person", async () => {
      const m = await setup(T); const r = await j(await add(T, m, ["A-1101", "B 2202"]));
      expect(r.added ?? r.people?.length).toBe(2);
      expect((await join(T, "A 1101", 1)).status).toBe(200);
      const again = await join(T, "a/1101", 2); expect(again.status).toBe(423); expect((await j(again)).code).toBe("id-used"); // the same person, already seated
      expect((await join(T, "b.2202", 3)).status).toBe(200);
    });
    test("the same ID written three ways in one upload is ONE person, never three", async () => {
      const m = await setup(T); const r = await j(await add(T, m, ["A-1101", "A 1101", "A/1101", "a.1101"]));
      expect(r.added ?? r.people?.length).toBe(1);
      expect(await count("SELECT COUNT(*) AS c FROM person WHERE eid='IDI-1' AND role IS NULL")).toBe(1);
    });
  });
}

describe("an ID that is not on the list waits for a yes", () => {
  test("it does not get a ticket; the Organizer sees only the ID; yes lets it in (any written form); no sends it away", async () => {
    const m = await setup(NEW_T); await add(NEW_T, m, ["A1101"]);
    const w1 = await join(NEW_T, "Z 9001", 1), w2 = await join(NEW_T, "Z-9002", 2);
    expect(w1.status).toBe(403); expect((await j(w1)).code).toBe("waiting"); expect(w2.status).toBe(403);
    const list = await j(await call(NEW_T, "GET", "/api/z/IDI-1/waiting", undefined, m));
    expect(list.waiting.map((x: any) => x.empId).sort()).toEqual(["Z9001", "Z9002"]); // cleaned, one box, no name asked
    expect(list.waiting.every((x: any) => !String(x.name || "").trim() && !x.last4)).toBe(true);
    const [a, b] = list.waiting;
    expect((await call(NEW_T, "POST", `/api/z/IDI-1/waiting/${a.id}`, { decision: "admit" }, m)).status).toBe(200);
    expect((await call(NEW_T, "POST", `/api/z/IDI-1/waiting/${b.id}`, { decision: "decline" }, m)).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS c FROM person WHERE eid='IDI-1' AND role IS NULL")).toBe(2); // A1101 and the one let in
    const again = await join(NEW_T, a.empId === "Z9001" ? "z/9001" : "Z.9002", a.empId === "Z9001" ? 1 : 2);
    expect(again.status).toBe(200); // the one who was let in comes in, whichever way the ID is written
  });
  test("an unlisted ID typed three ways asks once: one request, not three", async () => {
    const m = await setup(NEW_T);
    for (const [i, x] of ["Q-77", "q 77", "Q/77"].entries()) await join(NEW_T, x, i + 1);
    expect(await count("SELECT COUNT(*) AS c FROM waiting WHERE eid='IDI-1' AND status='waiting'")).toBe(1);
    expect((await j(await call(NEW_T, "GET", "/api/z/IDI-1/waiting", undefined, m))).waiting.length).toBe(1);
  });
});

describe("the invite and approval log", () => {
  test("lists who asked, through what, what was decided and by whom; only the ID, never a name or a number", async () => {
    const m = await setup(NEW_T); await add(NEW_T, m, ["L1"]);
    await join(NEW_T, "L-2", 1); await join(NEW_T, "L 3", 2);
    const [x, y] = (await j(await call(NEW_T, "GET", "/api/z/IDI-1/waiting", undefined, m))).waiting;
    await call(NEW_T, "POST", `/api/z/IDI-1/waiting/${x.id}`, { decision: "admit" }, m); await call(NEW_T + 1000, "POST", `/api/z/IDI-1/waiting/${y.id}`, { decision: "decline" }, m);
    const r = await call(NEW_T + 2000, "GET", "/api/z/IDI-1/people/log", undefined, m); expect(r.status).toBe(200);
    const log = (await j(r)).log as any[];
    const kinds = (id: string) => log.filter((e) => e.id === id).map((e) => e.kind).sort();
    expect(kinds("L1")).toEqual(["listed"]);
    expect(kinds(x.empId)).toEqual(["asked", "let in"]); expect(kinds(y.empId)).toEqual(["asked", "declined"]);
    expect(log.find((e) => e.kind === "let in").by).toBeTruthy();
    expect(JSON.stringify(log)).not.toMatch(/name|phone|mobile|last4/i);
    expect(log.every((e) => typeof e.through === "string" && e.through.length > 0)).toBe(true);
  });
  test("a guest key cannot read it (only the Organizer, Hosts and Co-hosts see a log)", async () => {
    await setup(NEW_T);
    expect([401, 403, 404]).toContain((await call(NEW_T, "GET", "/api/z/IDI-1/people/log")).status);
  });
});

describe("24 hours after the game, the list and every ID are erased", () => {
  test("the list, the waiting requests, the ID lookups and the log are empty after the erasure", async () => {
    const m = await setup(NEW_T); await add(NEW_T, m, ["E1", "E2"]); await join(NEW_T, "E1", 1); await join(NEW_T, "X-9", 2);
    expect(await count("SELECT COUNT(*) AS c FROM person WHERE eid='IDI-1'")).toBeGreaterThan(0); expect(await count("SELECT COUNT(*) AS c FROM waiting WHERE eid='IDI-1'")).toBe(1);
    await erasePersonal(env as any, "IDI-1", NEW_T + 86_400_000, "test");
    for (const t of ["person", "waiting", "seat", "participant"]) expect(await count(`SELECT COUNT(*) AS c FROM ${t} WHERE eid='IDI-1'`)).toBe(0);
    expect(await count("SELECT COUNT(*) AS c FROM kv WHERE k LIKE 'idx/IDI-1/%' OR k LIKE 'idmiss/IDI-1/%'")).toBe(0);
    const log = (await j(await call(NEW_T + 86_400_000, "GET", "/api/z/IDI-1/people/log", undefined, m))).log as any[];
    expect(log.length).toBe(0);
  });
});

describe("family invite stays: each invited person may invite 1 to 10, the default is 4", () => {
  test("the settings take 4 (the default) and 10; 11 is refused", async () => {
    const m = await setup(NEW_T);
    const ok = async (per: number) => (await call(NEW_T, "PATCH", "/api/z/IDI-1/settings", { invites: { on: true, per, cats: ["family", "colleagues"] } }, m)).status;
    expect(await ok(4)).toBe(200); expect(await ok(10)).toBe(200);
    const s = await j(await call(NEW_T, "GET", "/api/z/IDI-1/summary", undefined, m)); expect(s.invites?.per ?? s.cfg?.invites?.per).toBe(10);
    expect(await ok(11)).toBeGreaterThanOrEqual(400);
  });
});
