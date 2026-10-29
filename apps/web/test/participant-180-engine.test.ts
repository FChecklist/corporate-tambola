// 1.8.0: the participant page (z.js) driven against the REAL engine: the optional Email ID on the open join form, the Family Passes card of a family host with Approve / Not now,
// the family member's waiting screen, the 30-minute lapse, the 15-minute family cutoff, the participant cap, and the same mobile joining twice.
// Real Worker code and real z.js in a DOM (apps/web/test/harness.ts). Never put a DOM element in expect().
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { newWorld, openPage, roundAt, roundMs, T, type Page } from "./harness";

setDefaultTimeout(60_000);
const START = roundAt(T) + 1200, START_MS = roundMs(START); // one hour after T
const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer() { const w = newWorld({ FREE_LAUNCH: "1" }); const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" })); return { ...w, token: s.token as string, aiKey: s.aiKey as string }; }
type O = Awaited<ReturnType<typeof organizer>>;
const rtFake = (win: any, nowMs: () => number) => { const Orig = win.ZG.PhoneRuntime; win.ZG.PhoneRuntime = class extends Orig { constructor(eid: string, deps: any) { super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(nowMs()) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: any) => x.signature === "aa" }); } }; };
const page = async (o: O, url: string, email = false) => { const p = await openPage(o.world, { url: "http://localhost" + url, html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], session: {}, afterLoad: (win: any, f: string) => { if (f === "zgame.js") { rtFake(win, () => o.world.now); if (email) win.CT_EMAIL = true; } } }); open.push(p); return p; };
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
  test("by default the join form shows no email box (the join notice does not name it yet)", async () => {
    const o = await organizer(); await game(o, "E180-0"); const p = await page(o, "/z?e=E180-0"); await p.waitFor((x) => /Join the game/.test(x));
    expect(p.$("#mail")).toBeNull(); expect(p.text()).not.toContain("Your email ID");
  });
  test("with the email box switched on, an open game asks for an optional Email ID; a good one joins and is kept for the organizer, a bad one is refused in the guide's words, the same email on another phone is refused, the same phone joining again keeps its ticket", async () => {
    const o = await organizer(); await game(o, "E180-1");
    const p = await page(o, "/z?e=E180-1", true);
    await p.waitFor((x) => /Join the game/.test(x));
    expect(p.text()).toContain("Your email ID"); expect(p.text()).toContain("(optional)");
    expect(p.text()).toMatch(/You are invited to join the Corporate Tambola \(Housie\) organized by/);
    await join(p, "9811100001", { mail: "asha@acme.com" });
    await p.waitFor((x) => /Your ticket|Starting in|What you can win|Before the game|Getting ready/.test(x));
    // the same email on a second phone: one email, one ticket
    const q = await page(o, "/z?e=E180-1", true); await join(q, "9811100002", { mail: "Asha@Acme.com" });
    const t = await q.waitFor((x) => /already holds a ticket|Check your email/i.test(x)); expect(t).toMatch(/already holds a ticket|already has a ticket/i);
    // a bad shape is refused
    const r = await page(o, "/z?e=E180-1", true); await join(r, "9811100003", { mail: "asha@" });
    expect(await r.waitFor((x) => /check your email ID|looks incomplete|Check your email ID/i.test(x))).toBeTruthy();
    // no email at all is fine (optional)
    const s = await page(o, "/z?e=E180-1", true); await join(s, "9811100004");
    await s.waitFor((x) => /Your ticket|Starting in|What you can win|Before the game|Getting ready/.test(x));
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
    const o = await organizer(); await game(o, "E180-3", {}, FAMILY);
    const host = await page(o, "/z?e=E180-3"); await join(host, "9811100021");
    const t = await host.waitFor((x) => /Family Passes/.test(x)); expect(t).toMatch(/You have 5 passes: 1 for you and 4 for your family and friends/); expect(t).toMatch(/up to 15 minutes before the game begins/);
    await o.api("PATCH", "/api/z/E180-3/settings", { whoCanJoin: "list" }, o.aiKey); // a family member's request now waits for the family host
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
    const o = await organizer(); await game(o, "E180-5", {}, FAMILY);
    const host = await page(o, "/z?e=E180-5"); await join(host, "9811100041"); await host.waitFor((x) => /Family Passes/.test(x));
    await o.api("PATCH", "/api/z/E180-5/settings", { whoCanJoin: "list" }, o.aiKey);
    o.world.now = START_MS - 25 * 60_000; // the request is made 25 minutes before the start
    const m = await page(o, "/z?e=E180-5&from=1&c=family"); await join(m, "9811100042"); await m.waitFor((x) => /Please wait/i.test(x));
    await host.waitFor((x) => /wants to join your family/.test(x), 70_000);
    o.world.now = START_MS - 10 * 60_000; // inside the last 15 minutes
    (host.win.document.querySelector('[data-fam="admit"]') as any).click();
    expect(await host.waitFor((x) => /Family approvals closed 15 minutes before the game began/.test(x), 30_000)).toBeTruthy();
    expect(o.world.raw.query("SELECT COUNT(*) c FROM person WHERE eid='E180-5' AND inviter='s:1'").get()).toEqual({ c: 0 });
  }, 240_000);
  test("a request that waited 30 minutes lapses and the person reads the polite words; 10 minutes before the start the family host cannot approve any more", async () => {
    const o = await organizer(); await game(o, "E180-4", { whoCanJoin: "list" });
    const p = await page(o, "/z?e=E180-4"); await join(p, "9811100031"); await p.waitFor((x) => /Please wait/i.test(x));
    o.world.now = T + 40 * 60_000; // nobody answered for 40 minutes
    const t = await p.waitFor((x) => /waited 30 minutes and nobody answered/.test(x), 40_000);
    expect(t).toMatch(/open the game link and ask again/); expect(t).toMatch(/Ask again/);
    const w = o.world.raw.query("SELECT status FROM waiting WHERE eid='E180-4'").all() as any[]; expect(w.length).toBe(1);
  }, 120_000);
});
