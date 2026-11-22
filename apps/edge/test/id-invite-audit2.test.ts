// 21 Nov 2026, round 2 of the audit of PR #26 (audit 1 of 2): every protection the audit named gets a test that goes red when the protection is removed.
// The real Worker code against an in-memory D1, as id-invite.test.ts does.
// FALSIFIED BY: idinvite2-phone-only-gets-ticket, idinvite2-unlisted-id-in-open-game-joins, idinvite2-guest-reads-log, idinvite2-cohost-sees-all, idinvite2-other-game-id-joins,
//   idinvite2-declined-comes-back, idinvite2-forged-input-gets-seat, idinvite2-other-org-key-works
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { EMP_LEGACY_BEFORE_MS } from "../src/empid";
import { consentFor } from "./with-terms";
import { sealPii } from "../src/pii";

const T = Math.max(Date.UTC(2026, 10, 20, 10, 0, 0), EMP_LEGACY_BEFORE_MS + 86_400_000);
const GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
let env: PayEnv; let ipN = 0;
const realFetch = globalThis.fetch;
const call = (method: string, path: string, body?: unknown, key?: string, headers: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), env as any, T);
const j = async (r: Response) => (await r.json()) as any;
const dev = (i: number) => (String(i).padStart(2, "0") + "c".repeat(32)).slice(0, 32);
const count = async (sql: string, ...a: unknown[]) => Number(((await env.DB.prepare(sql).bind(...a).first<any>()) as any)?.c ?? 0);
const seats = (eid: string) => count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", eid);

async function owner() {
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.7.${++ipN}` }, body: JSON.stringify({ email: `demo${ipN}@demo-test.invalid` }) }), env as any, T));
  return st.token as string;
}
async function game(master: string, id: string, settings: Record<string, unknown> = {}, whoCanJoin: "list" | "anyone" = "list") {
  await call("POST", "/api/z", { id, startRound: roundAt(T) + 1200, callSeconds: 6, cap: 100, whoCanJoin }, master);
  await call("POST", `/api/z/${id}/publish`, { email: "demo1@demo-test.invalid", phone: "98765 43210" }, master);
  expect((await call("PATCH", `/api/z/${id}/settings`, { verify: "id", ...settings }, master)).status).toBe(200);
}
const add = (eid: string, key: string, ids: string[]) => call("POST", `/api/z/${eid}/people`, { people: ids.map((empId) => ({ empId })) }, key);
const join = (eid: string, body: Record<string, unknown>, i: number) => call("POST", `/api/z/${eid}/join`, { device: dev(i), ...body });
const waitingOf = async (eid: string, key: string) => (await j(await call("GET", `/api/z/${eid}/waiting`, undefined, key))).waiting as any[];
beforeEach(() => { const d = makeD1(); env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt" } as any; (globalThis as any).fetch = async () => new Response("{}", { status: 404 }); });
afterEach(() => { globalThis.fetch = realFetch; });

describe("MEDIUM 2 (what is and is not changed): an unlisted ID waits also when anyone with the link may ask", () => {
  // NOT changed, on purpose: in an OPEN game in ID mode a person who gives only a mobile number ("an outsider") still comes in at once. That is the older, tested design (verify.test.ts, join-matrix, join-global).
  // The new screens never make such a game (the default console and the previous screens make "list only" games), so ID-only is complete for them. Closing the old door is the owner's choice.
  test("an unlisted ID waits and gets no ticket; a listed ID joins in any spelling (idinvite2-unlisted-id-in-open-game-joins)", async () => {
    const m = await owner(); await game(m, "OPN-1", {}, "anyone"); await add("OPN-1", m, ["A1101"]);
    const unlisted = await join("OPN-1", { empId: "Z-9001" }, 3); expect(unlisted.status).toBe(403); expect((await j(unlisted)).code).toBe("waiting"); expect(await seats("OPN-1")).toBe(0);
    expect((await waitingOf("OPN-1", m)).map((x) => x.empId)).toEqual(["Z9001"]);
    expect((await join("OPN-1", { empId: "a 1101" }, 4)).status).toBe(200); expect(await seats("OPN-1")).toBe(1);
  });
  test("a listed ID typed together with a phone number joins by the ID; an unlisted ID with a phone number waits", async () => {
    const m = await owner(); await game(m, "OPN-2", {}, "anyone"); await add("OPN-2", m, ["B2202"]);
    expect((await join("OPN-2", { empId: "b-2202", phone: "9876543210" }, 1)).status).toBe(200);
    const w = await join("OPN-2", { empId: "Q-1", phone: "9876543211" }, 2); expect(w.status).toBe(403); expect(await seats("OPN-2")).toBe(1);
  });
  test("in a list-only ID game a phone number with no ID never gets a ticket (idinvite2-phone-only-gets-ticket)", async () => {
    const m = await owner(); await game(m, "OPN-3"); await add("OPN-3", m, ["A1101"]);
    const phone = await join("OPN-3", { phone: "9876543210", name: "Ravi" }, 1);
    expect(phone.status).not.toBe(200); expect(await seats("OPN-3")).toBe(0);
  });
});

describe("MEDIUM 3: the log and the waiting room keep their protections", () => {
  test("a real guest ticket (not an empty key) is refused by the log with the plain message, while the same ticket may read its own list (idinvite2-guest-reads-log)", async () => {
    const m = await owner(); await game(m, "LOG-1", { invites: { on: true, per: 4, cats: ["family"] } }); await add("LOG-1", m, ["G1"]);
    const jr = await join("LOG-1", { empId: "g 1" }, 1); expect(jr.status).toBe(200); const pid = (await j(jr)).pid as string;
    const hdr = { "x-ct-pid": pid, "x-ct-dev": dev(1) };
    expect((await call("GET", "/api/z/LOG-1/people", undefined, undefined, hdr)).status).toBe(200); // the ticket is real: it may read its own list
    const log = await call("GET", "/api/z/LOG-1/people/log", undefined, undefined, hdr);
    expect(log.status).toBe(403); expect((await j(log)).error).toBe("Only the Organizer, Hosts and Co-hosts can see this log.");
  });
  test("a Co-host sees only the rows of their own list; the Organizer sees all (idinvite2-cohost-sees-all)", async () => {
    const m = await owner(); await game(m, "LOG-2");
    const co = (await j(await call("POST", "/api/org/cohost", { label: "Ravi", phone: "9876500002", e: "LOG-2" }, m))).cohostKey as string;
    expect((await add("LOG-2", co, ["C1"])).status).toBe(200); await add("LOG-2", m, ["O1"]); await join("LOG-2", { empId: "Q-7" }, 1); // Q7 asks through the game link: the Organizer's request
    const ids = async (k: string) => ((await j(await call("GET", "/api/z/LOG-2/people/log", undefined, k))).log as any[]).map((r) => r.id).sort();
    expect(await ids(co)).toEqual(["C1"]);
    expect(await ids(m)).toEqual(["C1", "O1", "Q7"]); // C1 and O1 listed, Q7 asked through the game link (the Organizer's own request)
  });
  test("an ID that is on the list of game A waits in game B (idinvite2-other-game-id-joins)", async () => {
    const m = await owner(); await game(m, "GA-1"); await game(m, "GB-1"); await add("GA-1", m, ["A1101"]);
    expect((await join("GA-1", { empId: "A-1101" }, 1)).status).toBe(200);
    const b = await join("GB-1", { empId: "A-1101" }, 2); expect(b.status).toBe(403); expect((await j(b)).code).toBe("waiting"); expect(await seats("GB-1")).toBe(0);
  });
  test("a declined ID cannot come back by writing it another way, and a late yes does nothing (idinvite2-declined-comes-back)", async () => {
    const m = await owner(); await game(m, "DEC-1");
    expect((await join("DEC-1", { empId: "D-5" }, 1)).status).toBe(403);
    const w = (await waitingOf("DEC-1", m))[0]; expect((await call("POST", `/api/z/DEC-1/waiting/${w.id}`, { decision: "decline" }, m)).status).toBe(200);
    for (const [i, x] of ["d 5", "D/5", "d.5", "D5", " d-5 "].entries()) { const r = await join("DEC-1", { empId: x }, i + 2); expect(r.status).toBe(403); expect((await j(r)).code).toBe("declined"); }
    await call("POST", `/api/z/DEC-1/waiting/${w.id}`, { decision: "admit" }, m); // a yes after the no
    expect((await join("DEC-1", { empId: "D5" }, 9)).status).toBe(403); expect(await seats("DEC-1")).toBe(0);
    expect(await count("SELECT COUNT(*) AS c FROM person WHERE eid='DEC-1' AND role IS NULL")).toBe(0);
  });
  test("forged inputs never get a ticket and never crash the Worker (idinvite2-forged-input-gets-seat)", async () => {
    const m = await owner(); await game(m, "FRG-1"); await add("FRG-1", m, ["A1101"]);
    const forged: unknown[] = [["Z9"], ["Y", "9"], { id: "A1101" }, 5, true, "A1101' OR '1'='1", "x@y.com", "Z".repeat(40), "A1101​9", "<script>1</script>", "Z9;--"];
    for (const [i, empId] of forged.entries()) { const r = await join("FRG-1", { empId }, i + 1); expect(r.status).toBeLessThan(500); expect(r.status).not.toBe(200); }
    expect(await seats("FRG-1")).toBe(0);
    expect((await join("FRG-1", { empId: "a1101" }, 20)).status).toBe(200); // control: the real one still gets in
  });
  test("another organizer's key, and no key, cannot read, decide or log (idinvite2-other-org-key-works)", async () => {
    const m = await owner(); const other = await owner(); await game(m, "ORG-1"); await join("ORG-1", { empId: "W-1" }, 1);
    const w = (await waitingOf("ORG-1", m))[0]; expect(w.empId).toBe("W1");
    for (const key of [other, undefined]) {
      expect([401, 403]).toContain((await call("GET", "/api/z/ORG-1/waiting", undefined, key)).status);
      expect([401, 403]).toContain((await call("POST", `/api/z/ORG-1/waiting/${w.id}`, { decision: "admit" }, key)).status);
      expect([401, 403]).toContain((await call("GET", "/api/z/ORG-1/people/log", undefined, key)).status);
    }
    expect((await waitingOf("ORG-1", m)).length).toBe(1); // nothing was decided
  });
});

describe("auditor 2, M1: a person listed before the uniform rule, with a dash in the stored ID, still gets in (idinvite2-old-form-waits)", () => {
  test("a game made before the rule, in ID-and-mobile mode, holds A-1101; the person types A-1101 and the listed mobile number and gets a ticket, not the waiting room", async () => {
    const OLD = EMP_LEGACY_BEFORE_MS - 3 * 86_400_000;
    const at = (method: string, path: string, body?: unknown, key?: string) => handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env as any, OLD);
    const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "7.7.8.1" }, body: JSON.stringify({ email: "demo9@demo-test.invalid" }) }), env as any, OLD));
    const m = st.token as string;
    await at("POST", "/api/z", { id: "OLD-1", startRound: Math.floor((OLD / 1000 - GEN) / 3) + 1 + 1200, callSeconds: 6, cap: 100, whoCanJoin: "list" }, m);
    await at("POST", "/api/z/OLD-1/publish", { email: "demo1@demo-test.invalid", phone: "98765 43210" }, m);
    expect((await at("PATCH", "/api/z/OLD-1/settings", { verify: "both" }, m)).status).toBe(200);
    expect((await at("POST", "/api/z/OLD-1/people", { people: [{ name: "Ravi", phone: "9876500001", empId: "A1101" }] }, m)).status).toBe(200);
    const row = await env.DB.prepare("SELECT pii FROM person WHERE eid='OLD-1' AND role IS NULL").first<any>();
    expect(row).toBeTruthy();
    await env.DB.prepare("UPDATE person SET pii=? WHERE eid='OLD-1' AND role IS NULL").bind(await sealPii(env as any, { phone: "9876500001", name: "Ravi", empId: "A-1101" })).run(); // stored the way the older release stored it
    const r = await at("POST", "/api/z/OLD-1/join", { empId: "A-1101", phone: "9876500001", name: "Ravi", device: dev(1) });
    expect(r.status).toBe(200);
    expect(await count("SELECT COUNT(*) AS c FROM waiting WHERE eid='OLD-1'")).toBe(0);
    const wrong = await at("POST", "/api/z/OLD-1/join", { empId: "B-9", phone: "9876500001", name: "Ravi", device: dev(2) }); // a different ID with the listed number still waits
    expect(wrong.status).not.toBe(200);
  });
});
