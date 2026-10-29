// Release 1.8.0 approvals (note 300 sections 28-31): the 30-minute wait limit, polite messages, the family cutoff 15 minutes before the start, and the Email ID of an open game.
// FALSIFIED BY: info-open-always-true, appr-lapse-ignored, appr-list-shows-lapsed, appr-family-cutoff-ignored, appr-email-bad-accepted, appr-email-twice-two-tickets, appr-pure-limits
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { EMAIL_ENABLED, APPROVAL_RULES_FROM_MS, approvalRulesOn, WAIT_LIMIT_MS, FAMILY_CUTOFF_MS, waitingLapsed, familyCutoffPassed, mayDecide, cleanEmail, LAPSED_MESSAGE, FAMILY_CLOSED_MESSAGE, DECLINED_MESSAGE } from "../src/approvals";
import { erasePersonal } from "../src/lifecycle";
import { openPii } from "../src/pii";

const T = Math.max(Date.UTC(2026, 10, 5, 10, 0, 0), APPROVAL_RULES_FROM_MS + 86_400_000); // a game created after the release instant: the 1.8.0 rules apply
const GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
const roundMs = (r: number) => (GEN + (r - 1) * 3) * 1000;
const START = roundAt(T) + 1200; // one hour after T
const START_MS = roundMs(START);
const EMAIL_TEST = EMAIL_ENABLED ? test : test.skip; // the email tests run when the flag is on (1.8.1); with it off the test below proves the email is ignored
let env: PayEnv; let ipN = 0;
const realFetch = globalThis.fetch;
const call = (method: string, path: string, body?: unknown, key?: string, now = T, extra: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const mob = (i: number) => "9" + String(100000000 + i);
const dev = (i: number) => (String(i).padStart(2, "0") + "b".repeat(32)).slice(0, 32);
const join = (body: Record<string, unknown>, now = T) => call("POST", "/api/z/APP-1/join", body, undefined, now);
const joinAs = (i: number, extra: Record<string, unknown> = {}, now = T) => join({ phone: mob(i), name: "G" + i, device: dev(i), ...extra }, now);

async function setup(opts: { closed?: boolean; invites?: unknown; at?: number; start?: number } = {}) {
  const at = opts.at ?? T;
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.8.${++ipN}` }, body: JSON.stringify({ email: "boss@acme.com" }) }), env, at));
  const master = st.token as string;
  await call("POST", "/api/z", { id: "APP-1", startRound: opts.start ?? START, callSeconds: 6, cap: 100, ...(opts.closed ? { whoCanJoin: "list" } : {}) }, master, at);
  await call("POST", "/api/z/APP-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, master, at);
  if (opts.invites) await call("PATCH", "/api/z/APP-1/settings", { guestInvites: opts.invites }, master, at);
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
  EMAIL_TEST("a wrong email is refused kindly, a good one is kept, and the same email on another phone is not a second ticket", async () => {
    await setup();
    const bad = await joinAs(1, { email: "asha@" }); expect(bad.status).toBe(400); expect((await j(bad)).code).toBe("bad-email");
    expect((await joinAs(1, { email: "Asha@Acme.com" })).status).toBe(200);
    const again = await joinAs(2, { email: "asha@acme.com" }); expect(again.status).toBe(409); expect((await j(again)).code).toBe("email-unusable");
    expect((await joinAs(1, { email: "asha@acme.com" })).status).toBe(200); // the same phone again is the same ticket
    expect((await joinAs(3)).status).toBe(200); // no email: a game that does not ask for one still works as before
  });
});

describe("real engine runs of the other new paths: reject, cap, and deletion", () => {
  test("a declined request is told politely and cannot be admitted afterwards (first decision wins)", async () => {
    const t = await setup({ closed: true });
    const w = await j(await joinAs(1));
    const d = await call("POST", `/api/z/APP-1/waiting/${w.wid}`, { decision: "decline" }, t.master); expect(d.status).toBe(200);
    const me = await j(await call("GET", `/api/z/APP-1/me?wid=${w.wid}`)); expect(me.state).toBe("declined"); expect(me.message).toBe(DECLINED_MESSAGE);
    const later = await j(await call("POST", `/api/z/APP-1/waiting/${w.wid}`, { decision: "admit" }, t.master)); expect(later.already).toBe("declined");
  });
  test("the cap is enforced: an open game of 2 turns the third person away kindly, even with an email", async () => {
    const t = await setup(); await call("PATCH", "/api/z/APP-1/settings", { cap: 2 }, t.master);
    expect((await joinAs(1, { email: "a@acme.com" })).status).toBe(200); expect((await joinAs(2, { email: "b@acme.com" })).status).toBe(200);
    const third = await joinAs(3, { email: "c@acme.com" }); expect(third.status).toBe(409);
  });
  EMAIL_TEST("deletion: the email key, the people and the waiting requests are gone when the game's personal data is erased", async () => {
    const t = await setup(); await joinAs(1, { email: "gone@acme.com" });
    const kv = () => (env as any).DB.prepare("SELECT COUNT(*) AS c FROM kv WHERE k LIKE 'email/APP-1/%'").first();
    expect((await kv()).c).toBe(1);
    await erasePersonal(env as any, "APP-1", T + 30 * 3_600_000, "test");
    expect((await kv()).c).toBe(0);
    expect((await (env as any).DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid='APP-1'").first()).c).toBe(0);
    expect((await (env as any).DB.prepare("SELECT COUNT(*) AS c FROM waiting WHERE eid='APP-1'").first()).c).toBe(0);
  });
});

const OLD = APPROVAL_RULES_FROM_MS - 3 * 86_400_000; // a game created before the release instant (1.7.1 rules)
const OLD_START = roundAt(OLD) + 1200; // one hour after it was made (an unpaid game may start up to 30 days ahead)
const tokenOf = (link: string) => link.split("/j/")[1]!;
const add = (key: string, people: unknown[]) => call("POST", "/api/z/APP-1/people", { people }, key);
const cohostKey = async (master: string, phone: string, label: string) => (await j(await call("POST", "/api/org/cohost", { label, phone, e: "APP-1" }, master))).cohostKey as string;

describe("1.8.0 audit fixes", () => {
  test("1. asking again after a lapse works on the same request and a lapsed request does not use up the waiting cap", async () => {
    const t = await setup({ closed: true });
    const first = await j(await joinAs(1)); expect(first.waiting).toBe(true);
    const later = T + 41 * 60_000;
    expect((await j(await call("GET", "/api/z/APP-1/waiting", undefined, t.master, later))).waiting).toHaveLength(0);
    const again = await j(await joinAs(1, {}, later)); expect(again.waiting).toBe(true); expect(again.wid).toBe(first.wid);
    const seen = (await j(await call("GET", "/api/z/APP-1/waiting", undefined, t.master, later))).waiting; expect(seen).toHaveLength(1);
    expect((await call("POST", `/api/z/APP-1/waiting/${first.wid}`, { decision: "admit" }, t.master, later + 60_000)).status).toBe(200);
  });

  test("2. 'approve all' by a family host also stops 15 minutes before the start; the organizer's approve all still works", async () => {
    const t = await setup({ invites: { on: true, per: 4, cats: ["family"] } });
    const host = await j(await joinAs(1)); const seat = (await j(await call("GET", `/api/z/APP-1/me?pid=${host.pid}`))).seat as number;
    await call("PATCH", "/api/z/APP-1/settings", { whoCanJoin: "list" }, t.master);
    const m = await j(await joinAs(2, { from: seat, cat: "family" }, START_MS - 25 * 60_000)); expect(m.waiting).toBe(true);
    const all = await j(await call("POST", "/api/z/APP-1/waiting/all", { decision: "admit", me: host.pid, device: dev(1) }, undefined, START_MS - 10 * 60_000));
    expect(all.admitted).toBe(0); expect(all.code).toBe("family-closed");
    const org = await j(await call("POST", "/api/z/APP-1/waiting/all", { decision: "admit" }, t.master, START_MS - 10 * 60_000)); expect(org.admitted).toBe(1);
  });

  test("3. a game created before the release behaves exactly as in 1.7.1: no lapse, no family cutoff, the email is ignored", async () => {
    const t = await setup({ closed: true, at: OLD, start: OLD_START });
    const w = await j(await joinAs(1, {}, OLD)); const late = OLD + 40 * 60_000;
    expect((await j(await call("GET", "/api/z/APP-1/waiting", undefined, t.master, late))).waiting).toHaveLength(1); // still listed after 40 minutes
    expect((await call("POST", `/api/z/APP-1/waiting/${w.wid}`, { decision: "admit" }, t.master, late)).status).toBe(200);
  });
  test("3b. an old open game ignores an Email ID completely (no check, no record)", async () => {
    await setup({ at: OLD, start: OLD_START });
    expect((await joinAs(1, { email: "not-an-email" }, OLD)).status).toBe(200);
    expect((await (env as any).DB.prepare("SELECT COUNT(*) AS c FROM kv WHERE k LIKE 'email/APP-1/%'").first()).c).toBe(0);
  });

  EMAIL_TEST("4. the email-held answer is generic, and two phones asking at the same instant cannot both get the email", async () => {
    await setup();
    const both = await Promise.all([joinAs(1, { email: "race@acme.com" }), joinAs(2, { email: "race@acme.com" })]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    const lost = both.find((r) => r.status === 409)!; const body = await j(lost);
    expect(body.code).toBe("email-unusable"); expect(body.error).not.toMatch(/already holds|holds a ticket/i);
  });
  test("4b. a closed (list-only) game ignores the email even in a new game", async () => {
    await setup({ closed: true }); const r = await joinAs(1, { email: "x" }); expect(r.status).not.toBe(400);
    expect((await (env as any).DB.prepare("SELECT COUNT(*) AS c FROM kv WHERE k LIKE 'email/APP-1/%'").first()).c).toBe(0);
  });

  EMAIL_TEST("5. when a person leaves, their email is free again for another phone", async () => {
    await setup(); const a = await j(await joinAs(1, { email: "leave@acme.com" })); expect(a.pid).toBeTruthy();
    expect((await joinAs(2, { email: "leave@acme.com" })).status).toBe(409);
    const left = await call("POST", "/api/z/APP-1/leave", { pid: a.pid, device: dev(1) }); expect(left.status).toBe(200);
    expect((await (env as any).DB.prepare("SELECT COUNT(*) AS c FROM kv WHERE k LIKE 'email/APP-1/%'").first()).c).toBe(0);
    expect((await joinAs(2, { email: "leave@acme.com" })).status).toBe(200);
  });
});

describe("1.8.0 audit: who may answer a request (negative tests)", () => {
  test("a Co-host sees and answers only their own people; another Co-host gets 'No such request'", async () => {
    const t = await setup({ closed: true });
    const a = await cohostKey(t.master, "9876500002", "Ravi"), b = await cohostKey(t.master, "9876500003", "Mira");
    const added = (await j(await add(a, [{ name: "Asha", phone: mob(1) }]))).people[0];
    await join({ token: tokenOf(added.link), device: dev(1) });
    const stranger = await j(await join({ token: tokenOf(added.link), phone: mob(9), name: "Zed", device: dev(9) })); expect(stranger.waiting).toBe(true);
    expect((await j(await call("GET", "/api/z/APP-1/waiting", undefined, a))).waiting).toHaveLength(1);
    expect((await j(await call("GET", "/api/z/APP-1/waiting", undefined, b))).waiting).toHaveLength(0);
    expect((await call("POST", `/api/z/APP-1/waiting/${stranger.wid}`, { decision: "admit" }, b)).status).toBe(404);
    expect((await call("POST", `/api/z/APP-1/waiting/${stranger.wid}`, { decision: "admit" }, a)).status).toBe(200);
  });
  test("a person waiting, a plain participant, and nobody at all cannot answer a request", async () => {
    const t = await setup({ closed: true });
    const w = await j(await joinAs(1)); expect(w.waiting).toBe(true);
    const nobody = await call("POST", `/api/z/APP-1/waiting/${w.wid}`, { decision: "admit" }); expect(nobody.status).toBeGreaterThanOrEqual(400);
    const wrong = await call("POST", `/api/z/APP-1/waiting/${w.wid}`, { decision: "admit", me: "abc", device: dev(1) }); expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect((await j(await call("GET", `/api/z/APP-1/me?wid=${w.wid}`))).state).toBe("waiting"); // still waiting: nothing got in
    void t;
  });
  test("an organizer of another game cannot see or answer this game's requests", async () => {
    const t = await setup({ closed: true }); const w = await j(await joinAs(1));
    const other = (await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "7.7.8.200" }, body: JSON.stringify({ email: "other@acme.com" }) }), env, T))).token as string;
    expect((await call("GET", "/api/z/APP-1/waiting", undefined, other)).status).toBeGreaterThanOrEqual(400);
    expect((await call("POST", `/api/z/APP-1/waiting/${w.wid}`, { decision: "admit" }, other)).status).toBeGreaterThanOrEqual(400);
    expect((await j(await call("GET", `/api/z/APP-1/me?wid=${w.wid}`))).state).toBe("waiting"); void t;
  });
});

describe("the release instant (set to the real deploy time right before deploy)", () => {
  test("APPROVAL_RULES_FROM_MS is a real time in ms: a game created one ms before it keeps the old rules, one created at it gets the new rules", () => {
    expect(Number.isInteger(APPROVAL_RULES_FROM_MS)).toBe(true); expect(APPROVAL_RULES_FROM_MS).toBeGreaterThan(Date.UTC(2026, 9, 29));
    expect(approvalRulesOn({ created_ms: APPROVAL_RULES_FROM_MS - 1 })).toBe(false); expect(approvalRulesOn({ created_ms: APPROVAL_RULES_FROM_MS })).toBe(true);
    expect(approvalRulesOn({ created_ms: null })).toBe(false); expect(approvalRulesOn(null)).toBe(false);
  });
});

describe("1.8.1: the public settings say whether anyone can join (open) or only listed people (closed)", () => {
  test("an open game says open: true, so the player page shows the email box", async () => {
    await setup(); const info = await j(await call("GET", "/api/z/APP-1/info")); expect(info.open).toBe(true);
  });
  test("a list-only game says open: false, so the player page hides the email box", async () => {
    await setup({ closed: true }); const info = await j(await call("GET", "/api/z/APP-1/info")); expect(info.open).toBe(false);
  });
});

describe("1.8.0: the Email ID is OFF (EMAIL_ENABLED = false)", () => {
  test("with the flag off a join that carries an email stores nothing and gets the same result as one without", async () => {
    expect(EMAIL_ENABLED).toBe(false);
    await setup();
    const withMail = await joinAs(1, { email: "asha@acme.com" }); const bad = await joinAs(2, { email: "asha@" }); const twice = await joinAs(3, { email: "asha@acme.com" }); const plain = await joinAs(4);
    expect([withMail.status, bad.status, twice.status, plain.status]).toEqual([200, 200, 200, 200]); // no refusal, no "bad email", no "email in use"
    expect((await (env as any).DB.prepare("SELECT COUNT(*) AS c FROM kv WHERE k LIKE 'email/APP-1/%'").first()).c).toBe(0); // no key
    const rows = (await (env as any).DB.prepare("SELECT pii FROM participant WHERE eid='APP-1'").all()).results as any[];
    expect(rows.length).toBe(4);
    for (const r of rows) expect((await openPii(env as any, r.pii))?.email).toBeUndefined(); // the sealed details hold no email
  });
});
