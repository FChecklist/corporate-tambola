// Release 1.8.0 approvals (note 300 sections 28-31): the 30-minute wait limit, polite messages, the family cutoff 15 minutes before the start, and the Email ID of an open game.
// FALSIFIED BY: appr-lapse-ignored, appr-list-shows-lapsed, appr-family-cutoff-ignored, appr-email-bad-accepted, appr-email-twice-two-tickets, appr-pure-limits
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { WAIT_LIMIT_MS, FAMILY_CUTOFF_MS, waitingLapsed, familyCutoffPassed, mayDecide, cleanEmail, LAPSED_MESSAGE, FAMILY_CLOSED_MESSAGE } from "../src/approvals";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
const roundMs = (r: number) => (GEN + (r - 1) * 3) * 1000;
const START = roundAt(T) + 1200; // one hour after T
const START_MS = roundMs(START);
let env: PayEnv; let ipN = 0;
const realFetch = globalThis.fetch;
const call = (method: string, path: string, body?: unknown, key?: string, now = T, extra: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const mob = (i: number) => "9" + String(100000000 + i);
const dev = (i: number) => (String(i).padStart(2, "0") + "b".repeat(32)).slice(0, 32);
const join = (body: Record<string, unknown>, now = T) => call("POST", "/api/z/APP-1/join", body, undefined, now);
const joinAs = (i: number, extra: Record<string, unknown> = {}, now = T) => join({ phone: mob(i), name: "G" + i, device: dev(i), ...extra }, now);

async function setup(opts: { closed?: boolean; invites?: unknown } = {}) {
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.8.${++ipN}` }, body: JSON.stringify({ email: "boss@acme.com" }) }), env, T));
  const master = st.token as string;
  await call("POST", "/api/z", { id: "APP-1", startRound: START, callSeconds: 6, cap: 100, ...(opts.closed ? { whoCanJoin: "list" } : {}) }, master);
  await call("POST", "/api/z/APP-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, master);
  if (opts.invites) await call("PATCH", "/api/z/APP-1/settings", { guestInvites: opts.invites }, master);
  return { master };
}

beforeEach(() => { const d = makeD1(); env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt" } as any; (globalThis as any).fetch = async () => new Response("{}", { status: 404 }); });
afterEach(() => { globalThis.fetch = realFetch; });

describe("the rules as small functions", () => {
  test("30 minutes to answer, 15 minutes before the start for a family host, who may decide, and the email shape", () => {
    expect(WAIT_LIMIT_MS).toBe(30 * 60_000); expect(FAMILY_CUTOFF_MS).toBe(15 * 60_000);
    expect(waitingLapsed(0, 30 * 60_000 - 1)).toBe(false); expect(waitingLapsed(0, 30 * 60_000)).toBe(true);
    expect(familyCutoffPassed(1_000_000, 1_000_000 - FAMILY_CUTOFF_MS - 1)).toBe(false); expect(familyCutoffPassed(1_000_000, 1_000_000 - FAMILY_CUTOFF_MS)).toBe(true);
    expect(mayDecide({ all: true, id: "o" }, ",c:1,")).toBe(true); expect(mayDecide({ all: false, id: "c:1" }, ",c:1,o,")).toBe(true); expect(mayDecide({ all: false, id: "c:2" }, ",c:1,o,")).toBe(false);
    expect(cleanEmail(" Asha@Acme.Com ")).toBe("asha@acme.com"); for (const bad of ["", "asha", "asha@", "@acme.com", "a@b", "a b@acme.com"]) expect(cleanEmail(bad)).toBe(null);
    expect(LAPSED_MESSAGE).toContain("ask again"); expect(FAMILY_CLOSED_MESSAGE).toContain("15 minutes");
  });
});

describe("a request waits 30 minutes, then it lapses with a polite message", () => {
  test("within 30 minutes the organizer sees and admits it; after 30 minutes the list is empty, the decision says lapsed, and the person is told to ask again", async () => {
    const t = await setup({ closed: true });
    const first = await j(await joinAs(1)); expect(first.waiting).toBe(true);
    const w1 = (await j(await call("GET", "/api/z/APP-1/waiting", undefined, t.master, T + 29 * 60_000))).waiting; expect(w1).toHaveLength(1);
    const second = await j(await joinAs(2, {}, T + 5 * 60_000)); expect(second.waiting).toBe(true);
    const late = T + 40 * 60_000;
    const w2 = (await j(await call("GET", "/api/z/APP-1/waiting", undefined, t.master, late))).waiting; expect(w2).toHaveLength(0);
    const r = await call("POST", `/api/z/APP-1/waiting/${first.wid}`, { decision: "admit" }, t.master, late); expect(r.status).toBe(409); expect((await j(r)).code).toBe("lapsed");
    const me = await j(await call("GET", `/api/z/APP-1/me?wid=${first.wid}`, undefined, undefined, late)); expect(me.state).toBe("lapsed"); expect(me.message).toBe(LAPSED_MESSAGE);
    const ok = await call("POST", `/api/z/APP-1/waiting/${second.wid}`, { decision: "admit" }, t.master, T + 20 * 60_000); expect(ok.status).toBe(200);
  });
});

describe("a family host can approve up to 15 minutes before the start", () => {
  test("one hour before: the guest admits a family member; 10 minutes before: the approval is closed", async () => {
    const t = await setup({ invites: { on: true, per: 4, cats: ["family"] } });
    const host = await j(await joinAs(1)); expect(host.pid).toBeTruthy();
    const me = await j(await call("GET", `/api/z/APP-1/me?pid=${host.pid}`, undefined, undefined, T)); expect(me.canInvite).toBe(true);
    const seat = me.seat as number;
    // the organizer closes the list so a family member's request waits for the family host
    await call("PATCH", "/api/z/APP-1/settings", { whoCanJoin: "list" }, t.master);
    const m1 = await j(await joinAs(2, { from: seat, cat: "family" })); expect(m1.waiting).toBe(true);
    const decide = (wid: string, now: number) => call("POST", `/api/z/APP-1/waiting/${wid}`, { decision: "admit", me: host.pid, device: dev(1) }, undefined, now);
    const early = await decide(m1.wid, T + 10 * 60_000); expect(early.status).toBe(200);
    const m2 = await j(await joinAs(3, { from: seat, cat: "family" }, START_MS - 25 * 60_000)); expect(m2.waiting).toBe(true);
    const closed = await decide(m2.wid, START_MS - 10 * 60_000); expect(closed.status).toBe(409); expect((await j(closed)).code).toBe("family-closed");
    // the organizer is not bound by the family cutoff
    const org = await call("POST", `/api/z/APP-1/waiting/${m2.wid}`, { decision: "admit" }, t.master, START_MS - 10 * 60_000); expect(org.status).toBe(200);
  });
});

describe("an open game may keep an Email ID", () => {
  test("a wrong email is refused kindly, a good one is kept, and the same email on another phone is not a second ticket", async () => {
    await setup();
    const bad = await joinAs(1, { email: "asha@" }); expect(bad.status).toBe(400); expect((await j(bad)).code).toBe("bad-email");
    expect((await joinAs(1, { email: "Asha@Acme.com" })).status).toBe(200);
    const again = await joinAs(2, { email: "asha@acme.com" }); expect(again.status).toBe(409); expect((await j(again)).code).toBe("email-used");
    expect((await joinAs(1, { email: "asha@acme.com" })).status).toBe(200); // the same phone again is the same ticket
    expect((await joinAs(3)).status).toBe(200); // no email: a game that does not ask for one still works as before
  });
});
