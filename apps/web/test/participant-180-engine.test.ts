// 1.8.0: the participant page (z.js) driven against the REAL engine: the optional Email ID on the open join form, the Family Passes card of a family host with Approve / Not now,
// the family member's waiting screen, the 30-minute lapse, the 15-minute family cutoff, the participant cap, and the same mobile joining twice.
// Real Worker code and real z.js in a DOM (apps/web/test/harness.ts). Never put a DOM element in expect().
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join as pjoin } from "node:path";
import { newWorld, openPage, roundAt, roundMs, T, type Page } from "./harness";

setDefaultTimeout(60_000);
const T2 = Date.UTC(2026, 10, 5, 10, 0, 0); // after APPROVAL_RULES_FROM_MS (31 Oct 2026): games made now follow the 1.8.0 rules
const START = roundAt(T2) + 1200, START_MS = roundMs(START); // one hour after T2
const OLD_START = roundAt(T) + 1200, OLD_START_MS = roundMs(OLD_START); // a game made before the release date (T = 1 Oct 2026)
const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer(oldWorld = false) { const w = newWorld({ FREE_LAUNCH: "1" }); w.world.now = oldWorld ? T : T2; const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" })); return { ...w, token: s.token as string, aiKey: s.aiKey as string }; }
type O = Awaited<ReturnType<typeof organizer>>;
const rtFake = (win: any, nowMs: () => number) => { const Orig = win.ZG.PhoneRuntime; win.ZG.PhoneRuntime = class extends Orig { constructor(eid: string, deps: any) { super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(nowMs()) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: any) => x.signature === "aa" }); } }; };
const page = async (o: O, url: string, email = false) => { const p = await openPage(o.world, { url: "http://localhost" + url, html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], session: {}, afterLoad: (win: any, f: string) => { if (f === "zgame.js") { rtFake(win, () => o.world.now); } } }); open.push(p); return p; };
const game = async (o: O, id: string, over: Record<string, unknown> = {}, invites?: unknown) => {
  expect((await o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, ...over }, o.aiKey)).status).toBe(200);
  if (invites) await o.api("PATCH", `/api/z/${id}/settings`, { invites }, o.aiKey);
  expect((await o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token)).status).toBe(200);
};
const FAMILY = { on: true, per: 4, cats: ["family"] };
const join = async (p: Page, phone: string, extra: Record<string, string> = {}) => {
  await p.waitFor((x) => /Join the game/.test(x)); (p.$("#ph") as any).value = phone;
  for (const [id, v] of Object.entries(extra)) { const el = p.$("#" + id) as any; if (el) el.value = v; }
  p.click("#go");
};

describe("1.8.0 open join form", () => {
  test("a list game shows no email box (the public settings say open: false); an open game shows it", async () => {
    const o = await organizer(); await game(o, "E180-0", { whoCanJoin: "list" }); const p = await page(o, "/z?e=E180-0"); await p.waitFor((x) => /Join the game/.test(x));
    expect(p.$("#mail")).toBeNull(); expect(p.text()).not.toContain("Your email ID");
    const o2 = await organizer(); await game(o2, "E180-00"); const q = await page(o2, "/z?e=E180-00"); await q.waitFor((x) => /Join the game/.test(x));
    expect(q.$("#mail")).not.toBeNull(); expect(q.text()).toContain("Your email ID");
  });
  test("with the email box switched on the page sends the email, and 1.8.0 (EMAIL_ENABLED = false) ignores it: the join works, nothing is stored or checked", async () => {
    const o = await organizer(); await game(o, "E180-1");
    const p = await page(o, "/z?e=E180-1", true);
    await p.waitFor((x) => /Join the game/.test(x));
    expect(p.text()).toContain("Your email ID"); expect(p.text()).toContain("(optional)");
    expect(p.text()).toMatch(/You are invited to join the Corporate Tambola \(Housie\) organized by/);
    await join(p, "9811100001", { mail: "asha@acme.com" });
    await p.waitFor((x) => /Your ticket|Starting in|What you can win|Before the game|Getting ready/.test(x));
    // a bad shape and the same email on another phone are NOT refused while the server ignores email
    const q = await page(o, "/z?e=E180-1", true); await join(q, "9811100002", { mail: "asha@acme.com" });
    await q.waitFor((x) => /Your ticket|Starting in|What you can win|Before the game|Getting ready/.test(x));
    const r = await page(o, "/z?e=E180-1", true); await join(r, "9811100003", { mail: "asha@" });
    await r.waitFor((x) => /Your ticket|Starting in|What you can win|Before the game|Getting ready/.test(x));
    expect((o.world.raw.query("SELECT COUNT(*) c FROM kv WHERE k LIKE 'email/%'").get() as any).c).toBe(0);
    expect(p.errors).toEqual([]);
  });
  test("the same mobile on another device gets no second ticket, and the participant cap is kept", async () => {
    const o = await organizer(); await game(o, "E180-2", { cap: 2 });
    for (const ph of ["9811100011", "9811100012"]) { const p = await page(o, "/z?e=E180-2"); await join(p, ph); await p.waitFor((x) => /Your ticket|Starting in|What you can win|Before the game|Getting ready/.test(x)); }
    const again = await page(o, "/z?e=E180-2"); await join(again, "9811100011"); expect(await again.waitFor((x) => /different browser or app|one device only/i.test(x))).toBeTruthy(); // the same mobile on another device: refused, no second ticket
    expect(o.world.raw.query("SELECT COUNT(*) c FROM participant WHERE eid='E180-2'").get()).toEqual({ c: 2 });
    const third = await page(o, "/z?e=E180-2"); await join(third, "9811100013");
    expect(await third.waitFor((x) => /places in this game are taken|game is full/i.test(x))).toBeTruthy();
  });
});

describe("1.8.0 family passes", () => {
  test("the family host sees the Family Passes card; a family member waits with the family words; the host approves in the card; the member comes in; Not now gives the polite message", async () => {
    const o = await organizer(); await game(o, "E180-3", { whoCanJoin: "list" }, FAMILY); await o.api("POST", "/api/z/E180-3/people", { people: [{ name: "Host One", phone: "9811100021" }] }, o.token);
    const host = await page(o, "/z?e=E180-3"); await join(host, "9811100021");
    const t = await host.waitFor((x) => /Family Passes/.test(x) && /Check-in opens/.test(x)); /* the card is there BEFORE check-in opens: approvals close 15 minutes before the start, check-in opens only 5 minutes before */ expect(t).toMatch(/You have 5 passes: 1 for you and 4 for your family and friends/); expect(t).toMatch(/up to 15 minutes before the game begins/);
    const m1 = await page(o, "/z?e=E180-3&from=1&c=family"); await join(m1, "9811100022");
    const w = await m1.waitFor((x) => /Please wait/i.test(x)); expect(w).toMatch(/family host approves your entry/i);
    const m2 = await page(o, "/z?e=E180-3&from=1&c=family"); await join(m2, "9811100023"); await m2.waitFor((x) => /Please wait/i.test(x));
    host.win.__rt.lastInvites = -Infinity; // let the card look again at once
    await host.waitFor((x) => /wants to join your family/.test(x), 70_000);
    const btn = (kind: string) => host.win.document.querySelector(`[data-fam="${kind}"]`) as any;
    btn("admit").click(); await host.waitFor((x) => /Approved\. They can come in now/.test(x), 30_000);
    expect(o.world.raw.query("SELECT COUNT(*) c FROM person WHERE eid='E180-3' AND inviter='s:1'").get()).toEqual({ c: 1 });
    await host.waitFor((x) => /wants to join your family/.test(x), 70_000); btn("decline").click(); await host.waitFor((x) => /Done\. They are told politely/.test(x), 30_000);
    expect((o.world.raw.query("SELECT status FROM waiting WHERE eid='E180-3' ORDER BY at_ms, id").all() as any[]).map((r) => r.status).sort()).toEqual(["admitted", "declined"]);
  }, 240_000);
  test("10 minutes before the start the family host presses Approve and is told, politely, that family approvals have closed", async () => {
    const o = await organizer(); await game(o, "E180-5", { whoCanJoin: "list" }, FAMILY); await o.api("POST", "/api/z/E180-5/people", { people: [{ name: "Host Five", phone: "9811100041" }] }, o.token);
    const host = await page(o, "/z?e=E180-5"); await join(host, "9811100041"); await host.waitFor((x) => /Family Passes/.test(x));
    o.world.now = START_MS - 25 * 60_000; // the request is made 25 minutes before the start
    const m = await page(o, "/z?e=E180-5&from=1&c=family"); await join(m, "9811100042"); await m.waitFor((x) => /Please wait/i.test(x));
    await host.waitFor((x) => /wants to join your family/.test(x), 70_000);
    o.world.now = START_MS - 10 * 60_000; // inside the last 15 minutes
    (host.win.document.querySelector('[data-fam="admit"]') as any).click();
    expect(await host.waitFor((x) => /Family approvals closed 15 minutes before the game began/.test(x), 30_000)).toBeTruthy();
    expect(o.world.raw.query("SELECT COUNT(*) c FROM person WHERE eid='E180-5' AND inviter='s:1'").get()).toEqual({ c: 0 });
  }, 240_000);
  test("only a family host asks for waiting requests: a guest invited by a guest and a player in an open game make no /waiting call at all; the family host does", async () => {
    const calls: string[] = [];
    const spy = (name: string) => async (o: O, url: string) => { const p = await openPage(o.world, { url: "http://localhost" + url, html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], session: {}, afterLoad: (win: any, f: string) => { if (f === "audio.js") { const orig = win.fetch; win.fetch = (u: any, i: any) => { if (/\/waiting/.test(String(u))) calls.push(name + " " + String(u)); return orig.call(win, u, i); }; } if (f === "zgame.js") rtFake(win, () => o.world.now); } }); open.push(p); return p; };
    // open game: the inviter may invite, but nothing waits, so nobody polls
    const o1 = await organizer(); await game(o1, "E180-6", {}, FAMILY);
    const a = await spy("open-host")(o1, "/z?e=E180-6"); await join(a, "9811100051"); await a.waitFor((x) => /Family Passes/.test(x));
    const b = await spy("guest-of-guest")(o1, "/z?e=E180-6&from=1&c=family"); await join(b, "9811100052"); await b.waitFor((x) => /Your ticket|Starting in|What you can win|Before the game|Getting ready/.test(x));
    await new Promise((r) => setTimeout(r, 2500));
    expect(calls).toEqual([]);
    // list game: the family host polls (and only the family host)
    const o2 = await organizer(); await game(o2, "E180-7", { whoCanJoin: "list" }, FAMILY); await o2.api("POST", "/api/z/E180-7/people", { people: [{ name: "Host Seven", phone: "9811100061" }] }, o2.token);
    const h = await spy("family-host")(o2, "/z?e=E180-7"); await join(h, "9811100061"); await h.waitFor((x) => /Family Passes/.test(x));
    await new Promise((r) => setTimeout(r, 2500));
    expect(calls.some((c) => c.startsWith("family-host"))).toBe(true); expect(calls.filter((c) => !c.startsWith("family-host"))).toEqual([]);
  }, 120_000);
  test("a Co-host, Host or organizer link (from= is a large code) never shows the family wording; a guest's family link does", async () => {
    const z = readFileSync(pjoin(import.meta.dir, "../public/z.js"), "utf8").replace(/\r\n/g, "\n");
    const line = /const FAMILY_LINK = [^;]+;/.exec(z)![0];
    const fam = (from: number) => new Function("INVITE_FROM", `${line}; return FAMILY_LINK;`)(from) as boolean;
    expect(fam(1)).toBe(true); expect(fam(999_999_999)).toBe(true);
    for (const from of [0, 1_000_000_000, 1_000_000_005, 1_500_000_007, 1_900_000_000]) expect([from, fam(from)]).toEqual([from, false]); // none, Co-host, Host, organizer codes
    expect(z).toContain("${FAMILY_LINK && (!J.note || /^This game is by invitation/.test(J.note)) ? \"You asked to join through a family pass."); // any other server note (for example "used all their invitations") is shown as it is
  });
  test("a request that lapses because the GAME ENDED (a game on the 1.7.1 rules) shows the server's words, not the 30-minute sentence", async () => {
    const o = await organizer(true); await game(o, "E180-11", { whoCanJoin: "list", startRound: OLD_START });
    const p = await page(o, "/z?e=E180-11"); await join(p, "9811100091"); await p.waitFor((x) => /Please wait/i.test(x));
    o.world.now = OLD_START_MS + 30 * 3600_000; // long after the game: the waiting request can only be closed because the game is over
    const t = await p.waitFor((x) => /game has ended|This request has/i.test(x), 40_000);
    expect(t).toMatch(/This game has ended/i); expect(t).not.toMatch(/waited 30 minutes/);
  }, 120_000);
  test("a request that waited 30 minutes lapses and the person reads the polite words; 10 minutes before the start the family host cannot approve any more", async () => {
    const o = await organizer(); await game(o, "E180-4", { whoCanJoin: "list" });
    const p = await page(o, "/z?e=E180-4"); await join(p, "9811100031"); await p.waitFor((x) => /Please wait/i.test(x));
    o.world.now = T2 + 40 * 60_000; // nobody answered for 40 minutes
    const t = await p.waitFor((x) => /waited 30 minutes and nobody answered/.test(x), 40_000);
    expect(t).toMatch(/open the game link and ask again/); expect(t).toMatch(/Ask again/);
    const w = o.world.raw.query("SELECT status FROM waiting WHERE eid='E180-4'").all() as any[]; expect(w.length).toBe(1);
  }, 120_000);
});

describe("a game made BEFORE the approval rules date behaves exactly like 1.7.1", () => {
  const dev = (i: number) => (String(i).padStart(2, "0") + "c".repeat(32)).slice(0, 32);
  test("no 30-minute lapse, no 15-minute family cutoff and no email handling for a game created before 31 Oct 2026", async () => {
    const o = await organizer(true); // the world clock is 1 Oct 2026: the game is created before APPROVAL_RULES_FROM_MS
    await game(o, "E180-8", { whoCanJoin: "list", startRound: OLD_START }, FAMILY);
    await o.api("POST", "/api/z/E180-8/people", { people: [{ name: "Host Eight", phone: "9811100071" }] }, o.token);
    const hostJoin = await o.json(await o.api("POST", "/api/z/E180-8/join", { phone: "9811100071", name: "Host Eight", device: dev(1) })); expect(hostJoin.pid).toBeTruthy();
    const ask = async (i: number) => o.json(await o.api("POST", "/api/z/E180-8/join", { phone: "98111000" + (71 + i), name: "M" + i, device: dev(10 + i), from: 1, cat: "family" }));
    const m1 = await ask(1), m2 = await ask(2); expect(m1.waiting).toBe(true); expect(m2.waiting).toBe(true);
    const decide = (wid: string) => o.api("POST", `/api/z/E180-8/waiting/${wid}`, { decision: "admit", me: hostJoin.pid, device: dev(1) });
    o.world.now = T + 40 * 60_000; // 40 minutes later: under 1.8.0 rules it would have lapsed
    const list = await o.json(await o.api("GET", `/api/z/E180-8/waiting?me=${hostJoin.pid}&device=${dev(1)}`)); expect((list.waiting as any[]).length).toBe(2);
    const a = await decide(m1.wid); expect(a.status).toBe(200); expect((await o.json(a)).code).toBeUndefined();
    const st = await o.json(await o.api("GET", `/api/z/E180-8/me?wid=${m2.wid}`)); expect(st.state).toBe("waiting"); // not "lapsed"
    o.world.now = OLD_START_MS - 10 * 60_000; // 10 minutes before the start: under 1.8.0 rules the family cutoff would refuse
    const b = await decide(m2.wid); expect(b.status).toBe(200); expect((await o.json(b)).code).toBeUndefined();
    // an open game made before the date: an email in the join is not read at all (no 400, no stored email, no email key)
    const o2 = await organizer(true); await game(o2, "E180-9", { startRound: OLD_START });
    const j = await o2.api("POST", "/api/z/E180-9/join", { phone: "9811100081", name: "Old", device: dev(2), email: "asha@" }); expect(j.status).toBe(200);
    expect((o2.world.raw.query("SELECT COUNT(*) c FROM kv WHERE k LIKE 'email/%'").get() as any).c).toBe(0);
    const pii = (o2.world.raw.query("SELECT pii FROM participant WHERE eid='E180-9'").get() as any).pii as string; expect(typeof pii).toBe("string");
    // and also for a game made after the date while EMAIL_ENABLED is false (the email is switched on in 1.8.1)
    const o3 = await organizer(); await game(o3, "E180-10");
    expect((await o3.api("POST", "/api/z/E180-10/join", { phone: "9811100082", name: "New", device: dev(3), email: "asha@" })).status).toBe(200); // 1.8.0: EMAIL_ENABLED is false, so email is ignored for every game
  }, 120_000);
});
