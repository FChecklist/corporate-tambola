// 20 Nov 2026, audit round 2 of the ID invite (PR 26). Protections the first audit found had no test that goes red:
//  - an ID that is NOT on the list waits even when the game is open to anyone (worker.ts "ID alone, not on the list")
//  - a guest ticket can never read the invite log; a Co-host sees only the rows of their own link
//  - a game made before the uniform ID rule, "ID + mobile number" mode, with a stored ID that has punctuation: the listed person still gets in
// The real Worker code against an in-memory D1, as id-invite.test.ts does.
// FALSIFIED BY: idfix-unlisted-id-joins-open-game, idfix-guest-reads-log, idfix-cohost-reads-all-rows, idfix-both-mode-punctuated-id-waits
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { EMP_LEGACY_BEFORE_MS } from "../src/empid";

const NEW_T = Math.max(Date.UTC(2026, 10, 20, 10, 0, 0), EMP_LEGACY_BEFORE_MS + 86_400_000);
const OLD_T = EMP_LEGACY_BEFORE_MS - 3 * 86_400_000;
const GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
let env: PayEnv; let ipN = 0;
const realFetch = globalThis.fetch;
const call = (now: number, method: string, path: string, body?: unknown, key?: string) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env as any, now);
const j = async (r: Response) => (await r.json()) as any;
const dev = (i: number) => (String(i).padStart(2, "0") + "d".repeat(32)).slice(0, 32);
const count = async (sql: string, ...a: unknown[]) => Number(((await env.DB.prepare(sql).bind(...a).first<any>()) as any)?.c ?? 0);
beforeEach(() => { const d = makeD1(); env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt" } as any; });
afterEach(() => { globalThis.fetch = realFetch; });

async function game(at: number, id: string, create: Record<string, unknown>, settings: Record<string, unknown> = {}) {
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `8.8.8.${++ipN}` }, body: JSON.stringify({ email: `fix${ipN}@demo-test.invalid` }) }), env as any, at));
  const master = st.token as string, start = roundAt(at) + 1200;
  expect((await call(at, "POST", "/api/z", { id, startRound: start, callSeconds: 6, cap: 100, ...create }, master)).status).toBe(200);
  expect((await call(at, "POST", `/api/z/${id}/publish`, { email: "boss@demo-test.invalid", phone: "98765 43210" }, master)).status).toBe(200);
  if (Object.keys(settings).length) expect((await call(at, "PATCH", `/api/z/${id}/settings`, settings, master)).status).toBe(200);
  return master;
}

describe("an ID that is not on the list waits, even in a game open to anyone", () => {
  test("verify id + anyone: the listed ID gets a ticket, the unlisted one gets none and waits", async () => {
    const m = await game(NEW_T, "FIX-OPN", { whoCanJoin: "anyone" }, { verify: "id" });
    expect((await call(NEW_T, "POST", "/api/z/FIX-OPN/people", { people: [{ empId: "L-1" }] }, m)).status).toBe(200);
    const ok = await call(NEW_T, "POST", "/api/z/FIX-OPN/join", { empId: "L-1", device: dev(1) });
    expect(ok.status).toBe(200); expect(typeof (await j(ok)).pid).toBe("string");
    const no = await call(NEW_T, "POST", "/api/z/FIX-OPN/join", { empId: "NOT-LISTED", device: dev(2) });
    const nb = await j(no);
    expect(no.status).toBe(403); expect(nb.waiting).toBe(true); expect(nb.pid).toBeUndefined();
    expect(await count("SELECT COUNT(*) AS c FROM participant WHERE eid='FIX-OPN'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS c FROM waiting WHERE eid='FIX-OPN'")).toBe(1);
  });
});

describe("the invite log: a guest never reads it, a Co-host reads only their own link's rows", () => {
  test("a real guest ticket (a joined participant of a game with guest invites on) is refused with the log's own sentence", async () => {
    const m = await game(NEW_T, "FIX-LOG", { whoCanJoin: "anyone" }, { guestInvites: { on: true, per: 3 } });
    const g = await j(await call(NEW_T, "POST", "/api/z/FIX-LOG/join", { phone: "9100000001", name: "Guest One", device: dev(3) }));
    expect(typeof g.pid).toBe("string");
    const r = await call(NEW_T, "GET", `/api/z/FIX-LOG/people/log?me=${g.pid}&device=${dev(3)}`);
    expect(r.status).toBe(403); expect((await j(r)).error).toBe("Only the Organizer, Hosts and Co-hosts can see this log.");
    expect((await call(NEW_T, "GET", "/api/z/FIX-LOG/people/log", undefined, m)).status).toBe(200); // the Organizer still can
  });
  test("a Co-host does not see a row that came through the game link; the Organizer does", async () => {
    const m = await game(NEW_T, "FIX-CO", { whoCanJoin: "list" }, { verify: "id" });
    const co = (await j(await call(NEW_T, "POST", "/api/org/cohost", { label: "Ravi", phone: "9876500002", e: "FIX-CO" }, m))).cohostKey as string;
    expect(typeof co).toBe("string");
    expect((await call(NEW_T, "POST", "/api/z/FIX-CO/join", { empId: "STRANGER-7", device: dev(4) })).status).toBe(403); // waits: asked through the game link
    const org = (await j(await call(NEW_T, "GET", "/api/z/FIX-CO/people/log", undefined, m))).log as any[];
    expect(org.some((x) => x.id === "STRANGER7" || x.id === "STRANGER-7" || /STRANGER/.test(x.id))).toBe(true);
    const cr = await call(NEW_T, "GET", "/api/z/FIX-CO/people/log", undefined, co);
    expect(cr.status).toBe(200);
    expect(((await j(cr)).log as any[]).length).toBe(0);
  });
});

describe("a game made before the uniform rule, 'ID + mobile number' mode, an ID stored with punctuation", () => {
  test("the listed person who types the same ID and the listed number gets in (the stored form is compared in every form it can have)", async () => {
    const m = await game(OLD_T, "FIX-OLD", { whoCanJoin: "list" }, { verify: "both" });
    const add = await j(await call(OLD_T, "POST", "/api/z/FIX-OLD/people", { people: [{ empId: "A-1101", phone: "9876543210" }] }, m));
    expect(add.added).toBe(1);
    const r = await call(OLD_T, "POST", "/api/z/FIX-OLD/join", { empId: "A-1101", phone: "9876543210", device: dev(5) });
    const b = await j(r);
    expect(r.status).toBe(200); expect(typeof b.pid).toBe("string");
  });
});
