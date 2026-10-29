// The player's page (1.4.3): the claim alert and the big claim button, the friendly late message, the compact counter with the last 5 numbers, the ticket as the star with its three rules, and the prizes panel.
// The real page script runs in a DOM against the real Worker code; the runtime's view is steered so each state of the story can be seen at once.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { newWorld, openPage, roundAt, type Page } from "./harness";
import { PhoneRuntime, type PhoneDeps } from "../../../packages/beacon/src/phone-runtime";
import { GRACE_ROUNDS, PRIZE_HOUSES } from "../../../packages/beacon/src/config";
import { NEXT_REFUSALS, nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";
import { roundTimeMs, type Fetcher, type Round } from "../../../packages/beacon/src";

setDefaultTimeout(120_000);
const KEY = "11".repeat(32);
const START = 90_000; // the first number may come from this beacon round on
const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A published, paid game two hours before its start; `host` picks who calls the numbers. Returns the world, the keys, two bun phones and a step() that moves everyone 3 s. */
async function setup(eid: string, host = false, over: Record<string, unknown> = {}) {
  const w = newWorld();
  const T0 = roundTimeMs(START - 3);
  w.world.now = T0 - 2 * 3_600_000;
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  const token = s.token as string, aiKey = s.aiKey as string;
  expect((await w.api("POST", "/api/z", { id: eid, startRound: START - GRACE_ROUNDS, callSeconds: 6, cap: 100, ...(host ? { callMode: "host" } : {}), ...over }, aiKey)).status).toBe(200);
  expect((await w.api("POST", `/api/z/${eid}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, token)).status).toBe(200);
  w.world.raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(eid);
  if (!over.cap || Number(over.cap) <= 2000) expect((await w.api("PUT", `/api/z/${eid}/control/key`, { publicKey: publicKeyFromSecret(KEY) }, token)).status).toBe(200);
  let t = 0;
  const now = () => T0 + t;
  const phones = [1, 2].map((n) => {
    const mem = new Map<string, string>();
    const fetcher: Fetcher = async (url) => { const last = url.split("/").pop()!, nowR = roundAt(now()), r = last === "latest" ? nowR : Number(last); if (r > nowR) return { ok: false, status: 404, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" } as Round) }; };
    const api: PhoneDeps["api"] = async (method, path, body) => { const r = await w.api(method, path, body); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error((j as any).error ?? "http " + r.status), { status: r.status }); return j; };
    const rt = new PhoneRuntime(eid, { noEarlyEnd: true, api, mono: () => t, store: { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) }, beacon: { fetcher, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x) => x.signature === "aa" && x.randomness === rnd(x.round) } as PhoneDeps);
    return { rt, phone: "9" + String(100000000 + n) };
  });
  const step = async (ms = 3000) => { t += ms; w.world.now = now(); for (const p of phones) await p.rt.tick(); };
  const kv: KV = { get: async (k) => (w.world.raw.prepare("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} };
  const goLive = () => { w.world.now = T0; t = 0; };
  return { w, token, aiKey, phones, step, now, kv, goLive, T0 };
}
type X = Awaited<ReturnType<typeof setup>>;

/** The pages read the public beacon through ZG.RoundStore: in a test that is the test's own clock and fake randomness (the real mirrors are not reachable). */
const fakeBeacon = (win: any, nowMs: () => number) => {
  const fetcher: Fetcher = async (url) => { const last = url.split("/").pop()!, nowR = roundAt(nowMs()), r = last === "latest" ? nowR : Number(last); if (r > nowR) return { ok: false, status: 404, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" } as Round) }; };
  const Orig = win.ZG.RoundStore;
  win.ZG.RoundStore = class extends Orig { constructor(o: any = {}) { super({ ...o, fetcher, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, (y: any) => y.signature === "aa" && y.randomness === rnd(y.round)); } };
  win.ZG.fetchRound = async (r: any) => { const res = await fetcher(`x/${r}`); return res.ok ? res.json() : null; };
};
/** The console page with the signing key in hand (the browser's key store needs a real browser: the page's own TBControl.sign is given the test's key). */
async function consolePage(x: X, eid: string, extraSession: Record<string, string> = {}) {
  const p = await openPage(x.w.world, {
    url: `http://localhost/zc?e=${eid}`, html: "zc.html", scripts: ["zgame.js", "control.js", "zc.js"], session: { "ctz-org": x.token, "ctz-email": "boss@acme.com", ...extraSession },
    afterLoad: (win: any, f: string) => {
      if (f === "zgame.js" && win.ZG) { if (!win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; fakeBeacon(win, x.now); }
      if (f === "control.js") { win.confirm = () => true; win.TBControl.sign = async (code: string, _a: unknown, action: any, o: any = {}) => signControlWithSecret(KEY, nextMessage((await readPublished(x.kv, code))!, roundAt(x.now()), { action, ...o })); }
    },
  });
  open.push(p); return p;
}
const openStep = (p: Page, n: number) => p.click(`.zc-dot[data-open="${n}"]`);
const file = (x: X, eid: string) => readPublished(x.kv, eid);
  const rtFake = (win: any, nowMs: () => number) => {
  const Orig = win.ZG.PhoneRuntime;
  win.ZG.PhoneRuntime = class extends Orig {
    constructor(eid: string, deps: any) {
      super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const nowR = roundAt(nowMs()); const r = last === "latest" ? nowR : Number(last); if (r > nowR) return { ok: false, status: 404, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: any) => x.signature === "aa", mono: () => deps.mono() });
    }
  };
};




/** A real phone page whose runtime view we then steer: the page draws whatever the view says, so every state of the claim story can be seen in a moment. */
async function steered(eid: string) {
  const x = await setup(eid);
  x.goLive(); for (let i = 0; i < 30; i++) await x.step();
  const ph = await openPage(x.w.world, { url: `http://localhost/z?e=${eid}`, html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, x.now); } });
  open.push(ph); await ph.waitFor((t) => /Join the game/.test(t));
  (ph.$("#ph") as any).value = "9822222220"; (ph.$("#nm") as any).value = "Asha"; ph.click("#go");
  await ph.waitFor(() => !!(ph.win as any).__rt && !!ph.$("#storyline") && !!ph.$("#big"), 30_000);
  const rt = (ph.win as any).__rt, real = rt.view.bind(rt);
  let patch: Record<string, unknown> = {};
  rt.view = () => ({ ...real(), ...patch });
  const set = (p: Record<string, unknown>) => { patch = { late: null, ...p }; }; // (a phone that joined mid-game counts differently: steer as an on-time player)
  return { x, ph, set, base: real(), real };
}
const LOG = [12, 45, 7, 88, 31, 60];

describe("the claim alert, the big claim button, the friendly late message", () => {
  test("the moment a prize is claimable: a gold alert near the top ('You have completed Early Five!' / 'Press Claim now, before the next number is called.'), a big fixed button with the prize name, gold Claim buttons; two prizes at once are named together", async () => {
    const { ph, set } = await steered("CU-1");
    set({ phase: "play", paused: false, locked: false, log: LOG, claimNow: ["early5"], claimOpen: ["early5"], claimable: ["early5"], pressed: [], claimed: [], results: [] });
    await ph.waitFor(() => !!ph.$("#claimalert"), 15_000);
    expect(ph.$("#claimalert")!.textContent).toContain("You have won the Early Five. Click CLAIM to claim."); expect(ph.$("#claimtop")).toBeTruthy();
    expect(ph.html().indexOf('id="claimalert"')).toBeLessThan(ph.html().indexOf('id="big"')); // near the top: above the counter
    const bar = ph.$("#claimbar") as any; expect(bar).toBeTruthy(); expect(bar.textContent).toContain("CLAIM"); expect(bar.textContent).toContain("Early Five"); expect(ph.win.document.querySelectorAll("#claimbar .zbigclaim").length).toBe(1);
    expect(ph.win.document.querySelectorAll("#prizepanel .zside.zgold").length).toBe(1); expect(ph.$("#claimhint")!.textContent).toBe("The Claim button turns gold when you complete a prize. Press it before the next number is called.");
    set({ phase: "play", paused: false, locked: false, log: LOG, claimNow: ["early5", "top"], claimOpen: ["early5", "top"], claimable: ["early5", "top"], pressed: [], claimed: [], results: [] });
    await ph.waitFor((t) => /You have won the Early Five and Top Line\. Click CLAIM to claim\./i.test(t), 15_000);
    expect(ph.win.document.querySelectorAll("#claimbar .zbigclaim").length).toBe(2); // one button per ready prize
  });
  test("after the press the bar says 'Claim sent. Checking…'; with the next number (or a pause, or the end) the alert and the big button are gone; a prize whose time passed has no gold button, only a kind note", async () => {
    const { ph, set } = await steered("CU-2");
    const play = { phase: "play", paused: false, locked: false, log: LOG, results: [] };
    set({ ...play, claimNow: ["early5"], claimOpen: ["early5"], claimable: ["early5"], pressed: [], claimed: [] }); await ph.waitFor(() => !!ph.$("#claimbar .zbigclaim"), 15_000);
    set({ ...play, claimNow: [], claimOpen: [], claimable: [], pressed: ["early5"], claimed: ["early5"] }); await ph.waitFor((t) => /Claim sent\. Checking…/.test(t), 15_000);
    expect(ph.$("#claimalert")).toBeNull(); expect(ph.$("#claimbar .zbigclaim")).toBeNull();
    set({ ...play, log: [...LOG, 3], claimNow: [], claimOpen: [], claimable: ["early5"], pressed: [], claimed: [] }); // the next number was announced
    await ph.waitFor(() => !!ph.$("#stalenote"), 15_000);
    expect(ph.$("#claimalert")).toBeNull(); expect(ph.$("#claimbar")).toBeNull(); expect(ph.win.document.querySelectorAll("#prizepanel .zside.zgold").length).toBe(0); expect(ph.$("#stalenote")!.textContent).toMatch(/The time to claim Early Five has passed/);
    set({ ...play, paused: true, claimNow: [], claimOpen: ["early5"], claimable: ["early5"], pressed: [], claimed: [] }); // paused: no alert, no big button, but the claim is still possible with the card's button
    await ph.waitFor(() => !ph.$("#claimalert") && !ph.$("#claimbar") && ph.win.document.querySelectorAll("#prizepanel .zside.zgold").length === 1, 15_000);
    set({ ...play, phase: "ended", claimNow: [], claimOpen: [], claimable: [], pressed: [], claimed: [] }); // finished
    await ph.waitFor(() => !ph.$("#claimalert") && !ph.$("#claimbar"), 15_000);
  });
  test("a claim pressed too late shows the friendly message, in the same words as the game's refusal", async () => {
    const { ph, set } = await steered("CU-3");
    const { CLAIM_LATE_TEXT } = await import("../../../packages/beacon/src/config");
    set({ phase: "play", paused: false, locked: false, log: LOG, claimNow: [], claimOpen: [], claimable: ["early5"], pressed: [], claimed: [], results: [], lateClaim: CLAIM_LATE_TEXT });
    await ph.waitFor(() => !!ph.$("#latenote"), 15_000);
    expect(ph.$("#latenote")!.textContent).toBe("Ohooo! 😊 Sorry, you pressed Claim after the next number was announced. This claim cannot be made.");
  });
});

describe("the player's page: the compact counter, the last 5, the ticket as the star, the rules, the prizes", () => {
  test("'Number just called' with ONE short line '30 of 90 called · 60 left' (next to the small timer, never under the ball) in a compact card with a thin bar; 'Last 5 numbers called' with five small balls and never more; no board of all the numbers", async () => {
    const { ph, set } = await steered("CU-4");
    const log = Array.from({ length: 30 }, (_, i) => i + 1);
    set({ phase: "play", paused: false, locked: false, log, claimNow: [], claimOpen: [], claimable: [], pressed: [], claimed: [], results: [] });
    await ph.waitFor(() => /30 of 90 called/.test(ph.$("#calledcount")?.textContent ?? ""), 15_000);
    expect(ph.$("#calledcount")!.textContent!.replace(/\s+/g, " ").trim()).toBe("30 of 90 called · 60 left"); expect(ph.$("#ballhelp")!.textContent).toBe("Find it on your ticket and tap it.");
    expect(ph.text()).toContain("Number just called"); expect(ph.$("#big")!.textContent!.trim()).toBe("30");
    expect(ph.$("#lastfew")!.textContent).toContain("Last 5 numbers called"); const balls = Array.from(ph.win.document.querySelectorAll("#lastfew .zlastn")).map((e: any) => e.textContent.trim());
    expect(balls).toEqual(["29", "28", "27", "26", "25"]); expect(ph.win.document.querySelectorAll(".zlastn").length).toBeLessThanOrEqual(5);
    expect((ph.$(".zprog i") as any).style.width).toBe("33%");
    expect(ph.html()).not.toMatch(/id="board"|class="zboard|all the numbers/i); // players never get the history or a board of all 90
  });
  test("the order on the phone: story, counter, ticket (with Sneha's three rules), claim, prizes; and the laptop layout has two columns", async () => {
    const { ph, set } = await steered("CU-5");
    set({ phase: "play", paused: false, locked: false, log: LOG, claimNow: [], claimOpen: [], claimable: [], pressed: [], claimed: [], results: [] });
    await ph.waitFor(() => !!ph.$("#zrules") && !!ph.$("#prizepanel"), 15_000);
    const h = ph.html(), at = (id: string) => h.indexOf(id);
    expect(at('id="storyline"')).toBeLessThan(at('id="calledcount"')); expect(at('id="calledcount"')).toBeLessThan(at('id="claimhint"')); expect(at('id="claimhint"')).toBeLessThan(at('id="prizepanel"')); expect(at('id="prizepanel"')).toBeLessThan(at('id="zrules"')); // owner 29 Oct: the rules row sits at the bottom
    expect(Array.from(ph.win.document.querySelectorAll("#zrules li")).map((e: any) => e.textContent)).toEqual(["This game works like the real one.", "When a number is called, tap it on your ticket to cross it out.", "If you complete a prize, press Claim before the next number is called."]);
    const css = (await import("node:fs")).readFileSync(new URL("../public/z.css", import.meta.url), "utf8");
    expect(css).toMatch(/@media\(min-width:861px\) and \(min-height:521px\)\{[^@]*\.zplay\{display:grid;grid-template-columns:minmax\(0,1\.55fr\) minmax\(320px,1fr\)/); expect(css).toMatch(/\.zplay>\.ztk\{grid-column:1/);
  });
  test("prizes: still to win in gold with how many numbers are still needed; already won, grey and struck through, with the winning ticket number", async () => {
    const { ph, set, base } = await steered("CU-6");
    set({ phase: "play", paused: false, locked: false, log: LOG, claimNow: [], claimOpen: [], claimable: [], pressed: [], claimed: [], results: [{ pattern: "early5", ordinal: 1, idx: 4, count: 1, round: 1, tickets: [188] }] });
    await ph.waitFor(() => !!ph.$("#prizepanel li.done"), 15_000);
    const done = ph.$("#prizepanel li.done")!.textContent!; expect(done).toContain("Won by Ticket 188"); expect(ph.$("#prizepanel li.done s")).toBeTruthy();
    const open = Array.from(ph.win.document.querySelectorAll("#prizepanel li.open")) as any[]; expect(open.length).toBeGreaterThan(0);
    expect(open.every((li) => /You need \d+ more numbers?/.test(li.textContent) || /Unlucky|Lucky/.test(li.textContent))).toBe(true); expect(open[0].textContent).toContain("To win");
    void base;
  });
});

describe("the quiet countdown on the player's page", () => {
  test("small and calm: 'Next number in 7s' with a thin line, following the schedule's seconds; restarts at each number; gone while paused; nothing is spoken or sounded for it", async () => {
    const { ph, set } = await steered("CU-7");
    const spoken: string[] = []; const T = (ph.win as any).TBAudio; if (T) { T.say = (t: string) => void spoken.push(String(t)); } if (ph.$("#snd") && /Sound off/.test(ph.$("#snd")!.textContent ?? "")) ph.click("#snd"); // sound on, so a spoken countdown could not hide
    const run = { phase: "play", paused: false, locked: false, brk: null, intermission: null, waitingForHost: false, mode: "live", log: LOG, callSeconds: 12, claimNow: [], claimOpen: [], claimable: [], pressed: [], claimed: [], results: [] };
    for (const secs of [12, 7, 3, 1]) {
      set({ ...run, nextCallInSec: secs }); await ph.waitFor(() => (ph.$("#quietcount")?.textContent ?? "").includes(`Next number in ${secs}s`), 15_000);
    }
    expect(ph.$("#quietcount")!.getAttribute("role")).toBe("timer"); expect(ph.$("#quietcount i b")).toBeTruthy(); expect(ph.$(".zring")).toBeNull(); expect(ph.$(".zcount")).toBeNull(); // no big ring, no big digits
    set({ ...run, log: [...LOG, 5], nextCallInSec: 12 }); await ph.waitFor(() => (ph.$("#quietcount")?.textContent ?? "").includes("Next number in 12s"), 15_000); // a number came: it starts again from 12
    set({ ...run, paused: true, nextCallInSec: 6 }); await ph.waitFor(() => !ph.$("#quietcount"), 15_000); // paused: hidden
    set({ ...run, phase: "ended", nextCallInSec: null }); await ph.waitFor(() => !ph.$("#quietcount"), 15_000);
    expect(spoken.filter((t) => /next number|\d+\s*s\b|seconds/i.test(t))).toEqual([]); // the voice calls only the number itself
    const css = (await import("node:fs")).readFileSync(new URL("../public/z.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.zquiet\{[^}]*font-size:12px[^}]*color:#7a6f73/); expect(css).not.toMatch(/\.zquiet[^{]*\{[^}]*animation/); // small, muted, nothing that draws the eye
  });
  test("the seconds are the game's own schedule: the countdown shows what the runtime works out from the schedule, not a local guess", async () => {
    const { ph, set, real } = await steered("CU-8");
    set({ phase: "play", paused: false, locked: false, brk: null, intermission: null, waitingForHost: false, log: LOG, claimNow: [], claimOpen: [], claimable: [], pressed: [], claimed: [], results: [] }); // (the runtime's own nextCallInSec flows through)
    await ph.waitFor(() => !!ph.$("#quietcount"), 30_000);
    const shown = Number((ph.$("#quietcount")!.textContent ?? "").match(/Next number in (\d+)s/)![1]), now = real().nextCallInSec;
    expect(now).not.toBeNull(); expect(Math.abs(shown - now)).toBeLessThanOrEqual(2); // (the page redraws once a second)
    expect(shown).toBeLessThanOrEqual(12);
  });
});

describe("the Lucky Draw is a prize like the others", () => {
  test("listed in the prizes panel: to win while it is not drawn, then struck through with the winning tickets", async () => {
    const { ph, set } = await steered("CU-9");
    const base = { phase: "play", paused: false, locked: false, log: LOG, claimNow: [], claimOpen: [], claimable: [], pressed: [], claimed: [] };
    set({ ...base, results: [], lucky: [{ ordinal: 1, title: "Gift hamper", winners: 3, published: false, won: false, style: "draw" }] });
    await ph.waitFor(() => !!ph.$("#prizepanel li.lucky.open"), 15_000);
    expect(ph.$("#prizepanel li.lucky.open")!.textContent).toContain("Lucky draw: Gift hamper"); expect(ph.$("#prizepanel li.lucky.open")!.textContent).toMatch(/3 tickets are picked at random/);
    set({ ...base, results: [{ pattern: "lucky", ordinal: 1, idx: 20, count: 3, round: 1, tickets: [4, 9, 31] }], lucky: [{ ordinal: 1, title: "Gift hamper", winners: 3, published: true, won: false, style: "draw" }] });
    await ph.waitFor(() => !!ph.$("#prizepanel li.lucky.done"), 15_000);
    expect(ph.$("#prizepanel li.lucky.done")!.textContent).toContain("Won by Ticket 4, 9, 31"); expect(ph.$("#prizepanel li.lucky.done s")).toBeTruthy();
  });
});

describe("coming back to the game after another app's call or message", () => {
  test("on return the page asks for the game's schedule at once and says how long the player was away; a short look away says nothing", async () => {
    const { ph, set } = await steered("CU-10");
    set({ phase: "play", paused: false, locked: false, log: LOG, claimNow: [], claimOpen: [], claimable: [], pressed: [], claimed: [], results: [] });
    await ph.waitFor(() => !!ph.$("#calledcount"), 15_000);
    const rt = (ph.win as any).__rt; let resync = 0, ticks = 0; const rs = rt.resync.bind(rt), tk = rt.tick.bind(rt);
    rt.resync = () => { resync++; return rs(); }; rt.tick = async () => { ticks++; return tk(); };
    const doc = ph.win.document as any; let state = "hidden"; Object.defineProperty(doc, "visibilityState", { configurable: true, get: () => state });
    const flip = (to: string) => { state = to; doc.dispatchEvent(new (ph.win as any).Event("visibilitychange")); };
    flip("hidden"); flip("visible"); // a quick look away
    await wait(300); expect(resync).toBe(1); expect(ph.$("#awayline")).toBeNull();
    const realNow = (ph.win as any).Date.now.bind((ph.win as any).Date); flip("hidden"); (ph.win as any).Date.now = () => realNow() + 40_000; flip("visible");
    await ph.waitFor(() => !!ph.$("#awayline"), 15_000);
    expect(ph.$("#awayline")!.textContent).toContain("You were away for 40 seconds."); expect(ph.$("#awayline")!.textContent).toContain("Welcome back."); expect(ph.$("#awayline")!.textContent).toContain("No number was called while you were away."); // (A18: the line names the numbers called meanwhile; here none was)
    expect(resync).toBe(2); expect(ticks).toBeGreaterThanOrEqual(2); // the schedule was asked for each time the page came back
  });
  test("the join page carries the Do Not Disturb tip", async () => {
    const x = await setup("CU-11");
    const ph = await openPage(x.w.world, { url: "http://localhost/z?e=CU-11", html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, x.now); } });
    open.push(ph); await ph.waitFor((t) => /Join the game/.test(t));
    expect(ph.$("#dndtip")!.textContent).toBe("Tip: turn on Do Not Disturb so other apps do not interrupt your game.");
  });
});

describe("pop-ups about other tickets' claims (no pause): calm, plain, ticket numbers only", () => {
  test("claimed -> checking; correct -> congratulations and 'it is no longer available'; wrong -> 'was not correct'; each closes by itself; the prizes panel strikes the prize out with the ticket", async () => {
    const { ph, set } = await steered("CU-12");
    (ph.win as any).__toastMs = 700; // (so the test does not wait six seconds)
    const base = { phase: "play", paused: false, locked: false, log: LOG, claimNow: [], claimOpen: [], claimable: [], pressed: [], claimed: [], results: [], claimFeed: [] };
    set(base); await wait(1500); // the page has seen the starting state: nothing before this moment is announced
    set({ ...base, claimFeed: [{ id: "c1", ticket: 214, pattern: "top", bogey: false, atMs: 1 }] });
    await ph.waitFor(() => /Ticket 214 has claimed Top Line\. Checking now…/i.test(ph.$("#claimtoasts")?.textContent ?? ""), 15_000);
    set({ ...base, claimFeed: [{ id: "c1", ticket: 214, pattern: "top", bogey: false, atMs: 1 }], results: [{ pattern: "top", ordinal: 1, idx: 5, count: 1, round: 1, tickets: [214] }] });
    await ph.waitFor(() => /Ticket 214's claim is correct\. Congratulations Ticket 214 on winning Top Line! 🎉 The game continues\./i.test(ph.$("#claimtoasts")?.textContent ?? ""), 15_000);
    expect(ph.$("#claimtoasts")!.textContent).toMatch(/Top Line has been won\. It is no longer available\./i);
    await ph.waitFor(() => /Won by Ticket 214/.test(ph.$("#prizepanel")?.textContent ?? ""), 15_000); expect(ph.$("#prizepanel li.done s")).toBeTruthy();
    set({ ...base, claimFeed: [{ id: "c1", ticket: 214, pattern: "top", bogey: false, atMs: 1 }, { id: "c2", ticket: 7, pattern: "mid", bogey: true, atMs: 2 }], results: [{ pattern: "top", ordinal: 1, idx: 5, count: 1, round: 1, tickets: [214] }] });
    await ph.waitFor(() => /Ticket 7's claim was not correct\. The game continues\./.test(ph.$("#claimtoasts")?.textContent ?? ""), 15_000);
    await ph.waitFor(() => !ph.$("#claimtoasts"), 15_000); // each closes by itself
    expect(ph.text()).not.toMatch(/Zainab|98\d{8}/);
  });
});

describe("the sticky claim bar tells the truth about sending, and stays small with several prizes", () => {
  test("pressed but not yet taken by the store: 'Sending your claim…'; taken: 'Claim sent. Checking…'; two prizes ready: one big button and one compact", async () => {
    const { ph, set } = await steered("CU-13");
    const base = { phase: "play", paused: false, locked: false, log: LOG, claimable: [], results: [], claimFeed: [] };
    set({ ...base, claimNow: [], claimOpen: [], pressed: ["early5"], claimed: [] });
    await ph.waitFor(() => /Sending your claim…/.test(ph.$("#claimbar")?.textContent ?? ""), 15_000); expect(ph.$("#claimbar")!.textContent).not.toMatch(/Claim sent/);
    set({ ...base, claimNow: [], claimOpen: [], pressed: ["early5"], claimed: ["early5"] });
    await ph.waitFor(() => /Claim sent\. Checking…/.test(ph.$("#claimbar")?.textContent ?? ""), 15_000);
    set({ ...base, claimNow: ["early5", "top"], claimOpen: ["early5", "top"], pressed: [], claimed: [] });
    await ph.waitFor(() => ph.win.document.querySelectorAll("#claimbar .zbigclaim").length === 2, 15_000);
    const bs = Array.from(ph.win.document.querySelectorAll("#claimbar .zbigclaim")) as any[]; expect(bs[0].classList.contains("zmore")).toBe(false); expect(bs[1].classList.contains("zmore")).toBe(true);
  });
});

describe("manual play: no quiet 'Next number in' countdown, one plain line instead", () => {
  test("the game calls the numbers: 'Next number in 7s'. A Host calls them: 'The host calls the numbers' (or 'Waiting for the host'), never a count", async () => {
    const { ph, set } = await steered("CU-HOST");
    const play = { phase: "play", paused: false, locked: false, log: LOG, claimNow: [], claimOpen: [], claimable: [], pressed: [], claimed: [], results: [], brk: null, intermission: null, nextCallInSec: 7, waitingForHost: false };
    set({ ...play, callMode: "auto" });
    await ph.waitFor((t) => /Next number in 7s/.test(t), 15_000);
    set({ ...play, callMode: "host" });
    await ph.waitFor((t) => /The host calls the numbers/.test(t), 15_000);
    expect(ph.text()).not.toMatch(/Next number in/); expect(ph.$("#quietcount")).toBeNull();
    set({ ...play, callMode: "host", waitingForHost: true, nextCallInSec: null });
    await ph.waitFor((t) => /Waiting for the host/.test(t), 15_000);
    expect(ph.text()).not.toMatch(/Next number in/);
  });
});

describe("after the game ended: one end message, nothing contradicting it", () => {
  test("no 'Checking with the organizer' banner, no 'Find it on your ticket', and the end is said once", async () => {
    const { ph, set } = await steered("CU-END");
    const ended = { phase: "ended", paused: false, locked: false, stopped: false, endedByPrizes: false, log: LOG, claimNow: [], claimOpen: [], claimable: [], pressed: [], claimed: [], results: [], mode: "hold", nowRound: 5, brk: null, intermission: null };
    set(ended);
    await ph.waitFor((t) => /The game is over/.test(t), 15_000);
    const t = ph.text();
    expect(t).not.toMatch(/Checking with the organizer/); expect(t).not.toMatch(/Find it on your ticket and tap it/); expect(t).toContain("The game is over.");
    expect((t.match(/All 90 numbers were called/g) || []).length).toBe(1);
    set({ ...ended, endedByPrizes: true });
    await ph.waitFor((t2) => /All prizes were awarded/.test(t2), 15_000);
    expect((ph.text().match(/All prizes were awarded/g) || []).length).toBe(1);
    set({ ...ended, phase: "play", mode: "hold" }); // while playing, the hold banner still shows
    await ph.waitFor((t3) => /Checking with the organizer/.test(t3), 15_000);
  });
});

describe("a tap is never lost to a redraw", () => {
  test("while a finger is down on the Claim button the screen is not redrawn (the same button stays); after the release it is redrawn once, with the new state", async () => {
    const { ph, set } = await steered("CU-HOLD");
    const base = { phase: "play", paused: false, locked: false, log: LOG, claimNow: ["early5"], claimOpen: ["early5"], claimable: ["early5"], pressed: [], claimed: [], results: [] };
    set(base);
    await ph.waitFor(() => !!ph.$("#claimbar .zbigclaim"), 15_000);
    const btn = ph.$("#claimbar .zbigclaim") as any; const W = ph.win as any;
    btn.dispatchEvent(new W.Event("pointerdown", { bubbles: true }));
    set({ ...base, log: [...LOG, 77] }); // the game moves on while the finger is down
    await wait(2200); // two redraw beats
    expect(btn.isConnected).toBe(true); expect(ph.text()).toContain("6 of 90 called"); // nothing was redrawn yet
    btn.dispatchEvent(new W.Event("pointerup", { bubbles: true }));
    await ph.waitFor((t) => /7 of 90 called/.test(t), 15_000);
    expect(btn.isConnected).toBe(false); // redrawn right after the release
  });
});

describe("1.5.0 claim buttons: gold top, bottom and side; grey side otherwise; the claim timer", () => {
  const play = { phase: "play", paused: false, locked: false, log: LOG, claimable: [], pressed: [], claimed: [], results: [], brk: null, intermission: null, callMode: "auto", waitingForHost: false };
  test("a prize to claim: gold CLAIM in the alert, in the bottom bar and by the prize; any other prize has a grey side button; all gold ones carry the same timer", async () => {
    const { ph, set } = await steered("CU-G1");
    set({ ...play, claimNow: ["early5"], claimOpen: ["early5"], claimable: ["early5"], claimLeft: 11, nextCallInSec: 12 });
    await ph.waitFor(() => !!ph.$("#claimtop") && !!ph.$("#claimbar .zbigclaim"), 15_000);
    const d = ph.win.document;
    expect(d.querySelectorAll("#prizepanel .zside.zgold").length).toBe(1); expect(d.querySelectorAll("#prizepanel .zside.zgrey").length).toBeGreaterThan(0);
    expect(d.querySelector("#claimtop")!.textContent).toContain("Claim in the next 11 s"); expect(d.querySelector("#claimbar")!.textContent).toContain("Claim in the next 11 s"); expect(d.querySelector("#prizepanel .zside.zgold")!.textContent).toContain("Claim in the next 11 s");
    expect(ph.text()).not.toMatch(/Next number in/); // the normal countdown is hidden for this player while the claim timer shows
    set({ ...play, claimNow: ["early5"], claimOpen: ["early5"], claimable: ["early5"], claimLeft: 0, nextCallInSec: 1 });
    await ph.waitFor((t) => /Claim in the next 0 s/.test(t), 15_000);
    set({ ...play, claimNow: [], claimOpen: [], claimable: [], claimLeft: null, nextCallInSec: 12 }); // the next number: gold and timer go, the normal countdown returns at once
    await ph.waitFor((t) => /Next number in 12s/.test(t), 15_000);
    expect(ph.$("#claimtop")).toBeNull(); expect(ph.$("#claimbar")).toBeNull(); expect(d.querySelectorAll("#prizepanel .zside.zgold").length).toBe(0); expect(d.querySelectorAll("#prizepanel .zside.zgrey").length).toBeGreaterThan(0); expect(ph.text()).not.toMatch(/Claim in the next/);
  });
  test("manual play (a Host calls the numbers): gold buttons but NO timer", async () => {
    const { ph, set } = await steered("CU-G2");
    set({ ...play, callMode: "host", claimNow: ["early5"], claimOpen: ["early5"], claimable: ["early5"], claimLeft: 8, nextCallInSec: null });
    await ph.waitFor(() => !!ph.$("#claimtop"), 15_000);
    expect(ph.text()).not.toMatch(/Claim in the next/);
  });
  test("one press = one claim from any gold button (and two prizes at once are claimed together); a double press sends it once", async () => {
    const { ph, set } = await steered("CU-G3");
    const calls: string[] = []; const rt = (ph.win as any).__rt; rt.claim = async (k: string) => { calls.push(k); await wait(300); return { ok: true, sent: false, idx: 5 }; };
    set({ ...play, claimNow: ["early5", "top"], claimOpen: ["early5", "top"], claimable: ["early5", "top"], claimLeft: 8, nextCallInSec: 9 });
    await ph.waitFor(() => !!ph.$("#claimtop"), 15_000);
    (ph.$("#claimtop") as any).click(); (ph.$("#claimtop") as any).click(); await wait(900);
    expect(calls).toEqual(["early5", "top"]); // both prizes, once each, though pressed twice
    calls.length = 0;
    set({ ...play, claimNow: ["early5"], claimOpen: ["early5"], claimable: ["early5"], claimLeft: 8, nextCallInSec: 9, pressed: [] });
    await ph.waitFor(() => !!ph.$("#prizepanel .zside.zgold"), 15_000);
    (ph.$("#prizepanel .zside.zgold") as any).click(); await wait(600);
    expect(calls).toEqual(["early5"]); // the side button claims too
  });
  test("a grey button asks first: Cancel does nothing, Submit sends the wrong claim as before", async () => {
    const { ph, set } = await steered("CU-G4");
    const calls: string[] = []; const rt = (ph.win as any).__rt; rt.claim = async (k: string) => { calls.push(k); return { ok: false, bogey: true, error: "Bogey!" }; };
    set({ ...play, claimNow: [], claimOpen: [], claimable: [], claimLeft: null, nextCallInSec: 12 });
    await ph.waitFor(() => !!ph.$("#prizepanel .zside.zgrey"), 15_000);
    const grey = ph.$("#prizepanel .zside.zgrey") as any; const key = grey.dataset.claim;
    grey.click(); await ph.waitFor(() => !!ph.$("#bogeyask"), 15_000);
    expect(ph.$("#bogeyask")!.textContent).toContain("You have no claim right now. If you submit, it counts as a wrong claim (Bogey).");
    (ph.$("#bgcancel") as any).click(); await ph.waitFor(() => !ph.$("#bogeyask"), 15_000); expect(calls).toEqual([]);
    (ph.$("#prizepanel .zside.zgrey") as any).click(); await ph.waitFor(() => !!ph.$("#bogeyask"), 15_000);
    (ph.$("#bgsubmit") as any).click(); await wait(500); expect(calls).toEqual([key]); expect(ph.$("#bogeyask")).toBeNull();
  });
  test("no side buttons when the game is not in play (before the start, ended)", async () => {
    const { ph, set } = await steered("CU-G5");
    set({ ...play, phase: "ended", claimNow: [], claimOpen: [], claimable: [], claimLeft: null }); await wait(2200);
    expect(ph.win.document.querySelectorAll(".zside").length).toBe(0);
  });
});

describe("the Bogey question never covers a real claim", () => {
  test("an open Are-you-sure box closes by itself when a prize becomes claimable, so the gold buttons are not hidden", async () => {
    const { ph, set } = await steered("CU-G6");
    const play = { phase: "play", paused: false, locked: false, log: LOG, claimable: [], pressed: [], claimed: [], results: [], brk: null, intermission: null, callMode: "auto", waitingForHost: false, claimLeft: null, nextCallInSec: 12 };
    set({ ...play, claimNow: [], claimOpen: [] });
    await ph.waitFor(() => !!ph.$("#prizepanel .zside.zgrey"), 15_000);
    (ph.$("#prizepanel .zside.zgrey") as any).click(); await ph.waitFor(() => !!ph.$("#bogeyask"), 15_000);
    set({ ...play, claimNow: ["early5"], claimOpen: ["early5"], claimable: ["early5"], claimLeft: 9 });
    await ph.waitFor(() => !!ph.$("#claimtop") && !ph.$("#bogeyask"), 15_000);
  });
});

describe("1.6.2 language dropdown", () => {
  test("a small English-only dropdown sits at the top right outside the redrawn page, is remembered per browser, and is nowhere near the gold Claim buttons", async () => {
    const { ph, set } = await steered("CU-LANG");
    set({ phase: "play", paused: false, locked: false, log: LOG, claimNow: ["early5"], claimOpen: ["early5"], claimable: ["early5"], pressed: [], claimed: [], results: [], claimLeft: 9, nextCallInSec: 10 });
    await ph.waitFor(() => !!ph.$("#claimbar .zbigclaim"), 15_000);
    const sel = ph.win.document.getElementById("langsel") as any, menu = ph.win.document.getElementById("langmenu") as any; expect(sel).toBeTruthy(); expect(sel.tagName).toBe("BUTTON"); // (a button with a small menu, not a drop-down list: the console has a rule against those)
    expect(Array.from(menu.querySelectorAll("[role=option]")).map((o: any) => o.textContent)).toEqual(["English"]); expect(sel.textContent).toContain("EN"); expect(menu.hidden).toBe(true);
    expect(sel.parentElement).toBe(ph.win.document.body); expect(ph.win.document.getElementById("app")!.contains(sel)).toBe(false); // outside the page that redraws every second: it never closes by itself
    expect(sel.style.position).toBe("fixed"); expect(sel.style.top).toBe("6px"); expect(sel.style.right).toBe("6px");
    sel.click(); expect(menu.hidden).toBe(false); await wait(1500); expect(menu.hidden).toBe(false); // stays open through redraws
    (menu.querySelector("[data-lang=en]") as any).click(); expect(ph.win.localStorage.getItem("ctz-lang")).toBe("en"); expect(menu.hidden).toBe(true);
    expect(ph.win.document.getElementById("langsel")).toBe(sel);
  });
});
