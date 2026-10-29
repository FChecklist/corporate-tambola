// Idiot-proof player pages (owner order of 26 Oct 2026: every player is told what went wrong and exactly what to do, next to the control used, and the game is never hampered).
// The real page scripts (z.js, big.js) run in a DOM and talk to the REAL Worker code with an in-memory database, as phone-guest.test.ts does. Only the public randomness is the test's own clock.
// (z.js and big.js are read from apps/web/public; the Worker wording comes straight from apps/edge/src. The runtime texts are tested in packages/beacon/test/phone-runtime.test.ts.)
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { newWorld, openPage, roundAt, roundMs, T, type Page } from "./harness";
import { GRACE_ROUNDS } from "../../../packages/beacon/src/config";
import { roundTimeMs, type Fetcher, type Round } from "../../../packages/beacon/src";

setDefaultTimeout(240_000);
const HOUR = 3_600_000;
const START = roundAt(T) + 1200; // one hour after T
const T2 = Date.UTC(2026, 9, 24, 10, 0, 0); // after the present check-in began (23 Oct 2026): a game made now needs it
const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer(at = T) {
  const w = newWorld(); w.world.now = at;
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const make = (o: O, id: string, over: Record<string, unknown> = {}) => o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, ...over }, o.aiKey);
const publish = (o: O, id: string) => o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token);
const published = async (o: O, id: string, set: Record<string, unknown> = {}) => { await make(o, id); if (Object.keys(set).length) expect((await o.api("PATCH", `/api/z/${id}/settings`, set, o.token)).status).toBe(200); await publish(o, id); };
const fakeBeacon = (nowMs: () => number) => { const fetcher: Fetcher = async (url) => { const last = url.split("/").pop()!, nowR = roundAt(nowMs()), r = last === "latest" ? nowR : Number(last); if (r > nowR) return { ok: false, status: 404, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" } as Round) }; }; return { fetcher, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }; };
const rtFake = (win: any, nowMs: () => number) => { // the phone's runtime with a fake public beacon (the real one is not reachable from a test)
  const Orig = win.ZG.PhoneRuntime;
  win.ZG.PhoneRuntime = class extends Orig { constructor(eid: string, deps: any) { super(eid, { ...deps, beacon: fakeBeacon(nowMs), verify: (x: any) => x.signature === "aa", mono: () => deps.mono() }); } };
};
/** `pre` runs before the page's own scripts (to preset storage or wrap fetch). */
async function phoneAt(o: O, url: string, pre?: (win: any) => void) {
  const p = await openPage(o.world, { url: "http://localhost" + url, html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "audio.js") pre?.(win); if (f === "zgame.js") rtFake(win, () => o.world.now); } });
  open.push(p); return p;
}
const typeJoin = async (p: Page, phone: string, name = "Asha") => { await p.waitFor((x) => /Join the engagement/.test(x)); (p.$("#ph") as any).value = phone; (p.$("#nm") as any).value = name; p.click("#go"); };
const setVal = (p: Page, sel: string, v: string) => { const el = p.$(sel) as any; el.value = v; el.dispatchEvent(new p.win.Event("input", { bubbles: true })); };
const SEEN = /Your ticket|What you can win|Starting in|Getting ready/;

describe("joining: a refusal is shown next to the button, and a wrong entry can be typed again", () => {
  const listOnly = (o: O, id: string) => published(o, id, { whoCanJoin: "list" });
  const addPerson = async (o: O, id: string, name: string, phone: string) => { const r = await o.json(await o.api("POST", `/api/z/${id}/people`, { people: [{ name, phone }] }, o.token)); expect(r.added).toBe(1); return r.people[0] as { id: string; link: string }; };
  test("a personal link opened on a second phone: the number she types is refused in plain words above the button, and an empty box is answered too", async () => {
    const o = await organizer(); await listOnly(o, "IP-TK"); const pr = await addPerson(o, "IP-TK", "Meera", "9822211111"); const tk = pr.link.split("/j/")[1]!;
    const first = await phoneAt(o, `/z?e=IP-TK&t=${tk}`); await first.waitFor((x) => /Your personal link is ready/.test(x)); first.click("#go"); await first.waitFor((x) => SEEN.test(x));
    const p = await phoneAt(o, `/z?e=IP-TK&t=${tk}`); await p.waitFor((x) => /Your personal link is ready/.test(x)); p.click("#go");
    await p.waitFor((x) => /already opened on another phone/.test(x)); expect(!!p.$("#ph")).toBe(true);
    (p.$("#ph") as any).value = "9822211111"; p.click("#go"); // her own number, as the page told her: the game refuses it, because this phone is not the one that opened the link first
    await p.waitFor(() => !!p.$(".zbanner.bad"));
    const bad = String(p.$(".zbanner.bad").textContent);
    expect(bad).toMatch(/different browser or app/); expect(bad).toMatch(/same browser or app you used first/); expect(bad).toMatch(/ask your organizer to move your ticket/);
    expect(p.$(".zbanner.info")).toBeNull(); // the older blue line is not shown beside the newer refusal
    expect((p.$("#go") as any).textContent).toBe("Get my ticket"); // the button is back, not stuck on 'Getting your ticket'
    (p.$("#ph") as any).value = ""; p.click("#go"); // nothing typed: the page says what to type, instead of doing nothing
    await p.waitFor((x) => /Type your own mobile number, then press the button again/.test(x));
  });
  test("the waiting card shows what was typed and a button to type it again; the form comes back with it filled in, and a corrected entry gets the ticket", async () => {
    const o = await organizer(); await listOnly(o, "IP-WT"); await addPerson(o, "IP-WT", "Ravi", "9822233333");
    const p = await phoneAt(o, "/z?e=IP-WT"); await typeJoin(p, "9822233330"); // one digit wrong: not on the list, so the request goes to the organizer
    await p.waitFor((x) => /Please wait a moment/.test(x));
    expect(p.text()).toMatch(/You asked with \+91 98222 33330/); expect(p.text()).toMatch(/Wrong number or ID\? Type it again/);
    p.click("#again");
    await p.waitFor((x) => /Join the engagement/.test(x));
    expect((p.$("#ph") as any).value).toBe("9822233330"); // what she typed is still there, so the slip can be seen
    (p.$("#ph") as any).value = "9822233333"; p.click("#go");
    await p.waitFor((x) => SEEN.test(x), 20_000);
    expect(p.win.localStorage.getItem("ctz-wait-IP-WT") || "").toBe(""); // and the old waiting note is gone
  });
});

describe("a game that cannot be opened", () => {
  test("the screen has a Try again button, it also tries again when the phone is back online, and the game opens without a reload", async () => {
    const o = await organizer(); await published(o, "IP-BOOT");
    let failInfo = true;
    const p = await phoneAt(o, "/z?e=IP-BOOT", (win) => { const of = win.fetch; win.fetch = async (u: any, i?: any) => { if (failInfo && /\/info$/.test(String(u))) throw new Error("offline"); return of(u, i); }; });
    await p.waitFor((x) => /Could not reach the engagement|No connection right now/.test(x));
    expect(!!p.$("#retry")).toBe(true); expect(p.text()).toMatch(/tries again by itself/);
    p.click("#retry"); // still no signal: the button comes back, nothing is lost
    await p.waitFor(() => !!p.$("#retry") && !(p.$("#retry") as any).disabled);
    failInfo = false; p.win.dispatchEvent(new p.win.Event("online")); // the signal returns: no reload needed
    await p.waitFor((x) => /Join the engagement/.test(x));
    expect(p.$("#retry")).toBeNull();
  });
});

describe("check-in", () => {
  /** A game made after the check-in began, 2 hours ahead, paid; one guest has joined; then the clock moves to 3 minutes before the start, when the check-in is open. */
  async function checkinGame(id: string) {
    const o = await organizer(T2); const startRound = roundAt(T2 + 2 * HOUR);
    expect((await o.api("POST", "/api/z", { id, startRound, callSeconds: 9, cap: 100 }, o.aiKey)).status).toBe(200);
    expect((await publish(o, id)).status).toBe(200);
    o.world.raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id); // as if paid
    const dev = "ab".repeat(16);
    const j = await o.json(await o.api("POST", `/api/z/${id}/join`, { phone: "9822200011", name: "Asha", device: dev }));
    expect(j.checkin).toBe(true);
    o.world.now = roundMs(startRound) - 3 * 60_000;
    return { o, pre: (win: any) => { win.localStorage.setItem(`ctz:${id}:pid`, j.pid); win.localStorage.setItem("ctz:device", dev); } };
  }
  test("Submit is always there and says what it needs; Edit works while the button has the focus; a wrong code is answered next to the button; the right code opens the ticket", async () => {
    const { o, pre } = await checkinGame("IP-CK1"); const p = await phoneAt(o, "/z?e=IP-CK1", pre);
    await p.waitFor((x) => /Mark yourself present/.test(x));
    expect((p.$("#cksubmit") as any).hasAttribute("hidden")).toBe(false);
    p.click("#cksubmit"); expect(String(p.$("#ckerr").textContent)).toMatch(/Before you press Submit: tick .*type your 4-digit code/); // pressed too early: it says what is missing
    (p.$("#ckeditn") as any).focus(); p.click("#ckeditn"); // on Android Chrome a tapped button keeps the focus: the redraw must still happen
    await p.waitFor(() => !(p.$("#ckname") as any)?.disabled); expect(String(p.$("#ckeditn").textContent)).toBe("Done");
    const code = String(p.$("#ckshow").textContent).trim(); const wrong = code === "0000" ? "1111" : "0000";
    for (const id of ["#ckokn", "#ckokm"]) { const el = p.$(id) as any; el.checked = true; el.dispatchEvent(new p.win.Event("change", { bubbles: true })); }
    setVal(p, "#ckcode", wrong); (p.$("#cksubmit") as any).focus(); p.click("#cksubmit");
    await p.waitFor((x) => /That code is not the one on your ticket/.test(x));
    expect((p.$("#cksubmit") as any).disabled).toBe(false); // the button is usable again at once
    setVal(p, "#ckcode", code); p.click("#cksubmit");
    await p.waitFor((x) => SEEN.test(x), 10_000);
  });
  test("a guest the organizer removed, or whose ticket belongs to another phone, is told so instead of waiting on 'Loading your check-in' for ever", async () => {
    const { o, pre } = await checkinGame("IP-CK2");
    const refuse = (body: object) => (win: any) => { pre(win); const of = win.fetch; win.fetch = async (u: any, i?: any) => (/\/checkin\?/.test(String(u)) ? new Response(JSON.stringify(body), { status: 403, headers: { "content-type": "application/json" } }) : of(u, i)); };
    const gone = await phoneAt(o, "/z?e=IP-CK2", refuse({ error: "Not a participant of this engagement." }));
    await gone.waitFor((x) => /You have been removed from this game/.test(x)); expect(gone.text()).not.toMatch(/Loading your check-in/);
    const moved = await phoneAt(o, "/z?e=IP-CK2", refuse({ error: "This ticket belongs to another phone. Open your own link on your own phone to check in.", code: "other-phone" }));
    await moved.waitFor((x) => /We could not open your check-in/.test(x)); expect(moved.text()).toMatch(/belongs to another phone/); expect(moved.text()).not.toMatch(/Loading your check-in/);
  });
});

describe("the big screen", () => {
  test("before the start it shows the whole address to type, and when the numbers stop arriving it says the connection is lost", async () => {
    const o = await organizer(); await published(o, "IP-BIG");
    const p = await openPage(o.world, { url: "http://localhost/big?e=IP-BIG", html: "big.html", scripts: ["zgame.js", "big.js"] }); open.push(p);
    const t = await p.waitFor((x) => /The game starts in/.test(x));
    expect(t).toMatch(/Open the link on your phone and get your ticket: localhost\/z\?e=IP-BIG/); expect(t).toMatch(/Join: localhost\/z\?e=IP-BIG/); expect(t).not.toMatch(/Connection lost/);
    p.win.ZG.fetchRound = async () => null; o.world.now += 20_000; // the hall's network drops: no answer from the public clock for 20 seconds
    await p.waitFor((x) => /Connection lost\. The numbers on this screen may be late/.test(x), 8000);
  });
});

describe("the phone during the game", () => {
  test("TA22: the join page tells a late person the game is already running, before they join; not before the start", async () => {
    const o = await organizer(); await published(o, "IP-LATE");
    const at = (ms: () => number) => (win: any) => { win.Date.now = ms; };
    const early = await phoneAt(o, "/z?e=IP-LATE", at(() => o.world.now)); await early.waitFor((x) => /Join the engagement/.test(x));
    expect(early.$("#latetip")).toBeNull(); // the first number is hours away: nothing to warn about
    const late = await phoneAt(o, "/z?e=IP-LATE", at(() => roundMs(START) + 10 * 60_000)); await late.waitFor((x) => /This game is already running\./.test(x));
    const t = late.$("#latetip")!.textContent ?? ""; expect(t).toMatch(/about 90 seconds later/); expect(t).toMatch(/prizes already won stay won/); expect(t).toMatch(/other prizes are still open/);
  });
  test("TA21: a new player's phone does not read the numbers aloud until they switch sound on (an open office stays quiet)", async () => {
    const o = await organizer(); await published(o, "IP-QUIET");
    const p = await phoneAt(o, "/z?e=IP-QUIET");
    await p.waitFor((x) => /Sound is off, so your phone stays quiet/.test(x)); // said before joining
    await typeJoin(p, "9822222288"); await p.waitFor((x) => /Starting in\s*\d\d:\d\d:\d\d/.test(x));
    expect(p.win.TBAudio.enabled).toBe(false); expect(p.$("#snd")!.textContent).toMatch(/Sound off/); expect((p.$("#snd") as any).getAttribute("aria-pressed")).toBe("false");
    p.click("#snd"); await p.waitFor((x) => /Sound on/.test(x)); expect(p.win.TBAudio.enabled).toBe(true); // one tap switches it on
  });
  test("the screen is held awake only from about a minute before the first number, and the sound button tells the truth about a locked sound", async () => {
    const o = await organizer(); await published(o, "IP-AWAKE");
    let requests = 0;
    const p = await phoneAt(o, "/z?e=IP-AWAKE", (win) => { try { win.localStorage.setItem("ctz-sound", "on"); } catch { /* a returning player who had switched sound on */ } Object.defineProperty(win.navigator, "wakeLock", { value: { request: async () => { requests++; return { release: async () => {}, addEventListener() {} }; } }, configurable: true }); });
    await typeJoin(p, "9822222299"); await p.waitFor((x) => /Starting in\s*\d\d:\d\d:\d\d/.test(x));
    expect(requests).toBe(0); // the first number is an hour away: the screen is not held for an hour
    p.win.TBAudio.unlocked = false; // a returning player: the page was opened again and nobody has tapped yet
    await p.waitFor((x) => /Tap for sound/.test(x)); // it does not claim 'Sound on' while the phone would stay silent
    p.click("#snd"); await p.waitFor((x) => /Sound on/.test(x)); // the first tap unlocks the sound: it does not switch it off
    expect((p.$("#snd") as any).getAttribute("aria-pressed")).toBe("true");
    const rt = p.win.__rt; o.world.now = roundMs(rt.scheduledRound) + 5_000; rt.syncedAtMono = -Infinity; // the time arrives: the game is setting up
    await p.waitFor((x) => /Your game is setting up/.test(x)); await p.waitFor(() => requests === 1);
  });
  test("a claim that has not reached the game is not called 'sent': the card says it is being sent, until the game has it", async () => {
    const START2 = 90_000; // the first number may come from this beacon round on
    const w = newWorld(); const T0 = roundTimeMs(START2 - 3); w.world.now = T0 - 2 * HOUR;
    const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
    expect((await w.api("POST", "/api/z", { id: "IP-CLM", startRound: START2 - GRACE_ROUNDS, callSeconds: 6, cap: 100, rewards: [{ pattern: "early5", ordinal: 1 }, { pattern: "full", ordinal: 1 }] }, s.aiKey)).status).toBe(200);
    expect((await w.api("POST", "/api/z/IP-CLM/publish", { email: "boss@acme.com", phone: "98765 43210" }, s.token)).status).toBe(200);
    w.world.raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run("IP-CLM");
    let t = 0; const now = () => T0 + t; const step = (ms = 3000) => { t += ms; w.world.now = now(); };
    const p = await openPage(w.world, { url: "http://localhost/z?e=IP-CLM", html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, now); } }); open.push(p);
    await p.waitFor((x) => /Join the engagement/.test(x)); (p.$("#ph") as any).value = "9822222231"; (p.$("#nm") as any).value = "Asha"; p.click("#go");
    await p.waitFor((x) => /Your ticket|Get ready|Starting in/.test(x), 20_000);
    const rt = p.win.__rt, doc = p.win.document;
    const tick = async () => { rt.syncedAtMono = -Infinity; rt.lastSeatPoll = -Infinity; rt.lastResultPoll = -Infinity; rt.lastVote = -Infinity; await rt.tick(); };
    w.world.now = T0; t = 0;
    for (let i = 0; i < 90 && rt.view().log.length < 3; i++) { step(6000); await tick(); } await wait(1200);
    for (let i = 0; i < 85 && !rt.view().claimable.includes("early5"); i++) { step(6000); await tick(); await rt.playAlong({ claim: false }); } await wait(1200); // the person taps along until Early Five is complete
    const btn = doc.querySelector('[data-claim="early5"]') as any; expect(btn).toBeTruthy();
    const real = p.win.fetch; p.win.fetch = (u: any, i?: any) => (/\/claims$/.test(String(u)) && String(i?.method).toUpperCase() === "POST" ? new Promise(() => {}) : real(u, i)); // the claim never gets an answer (a weak signal)
    btn.click();
    await p.waitFor((x) => /Sending your claim for Early Five/.test(x), 5000);
    expect(p.text()).not.toMatch(/Claim sent for Early Five/);
    expect(rt.view().pressed).toEqual(["early5"]); expect(rt.view().claimed).toEqual([]);
  });
});
