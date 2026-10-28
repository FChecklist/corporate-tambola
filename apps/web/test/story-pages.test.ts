// One plain story for everybody (1.4.3): the same sentence on every screen for every state, the counter, the vital details on the console, and the game log page.
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



const storyOf = (p: Page) => ({ state: (p.$("#storyline") as any)?.getAttribute("data-state"), text: String(p.$("#storyline")?.textContent ?? "").replace(/\s+/g, " ").trim() });

describe("one plain story: the same sentence on every screen", () => {
  test("before the start: the console, the phone page and the big screen all say when the game starts, and each tells its reader what to do", async () => {
    const x = await setup("ST-WAIT");
    const c = await consolePage(x, "ST-WAIT");
    await c.waitFor((t) => /Game day|Your game|Last step/i.test(t));
    const when = /The game starts at [A-Z][a-z]{2} \d{1,2}:\d{2} (am|pm)\./;
    expect(storyOf(c).state).toBe("waiting"); expect(storyOf(c).text).toMatch(when); expect(storyOf(c).text).toContain("Nothing to do yet. Share the link and keep this page open.");
    const ph = await openPage(x.w.world, { url: "http://localhost/z?e=ST-WAIT", html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, () => x.now() - 2 * 3_600_000); } });
    open.push(ph); await ph.waitFor((t) => /Join the engagement/.test(t));
    (ph.$("#ph") as any).value = "9822222221"; (ph.$("#nm") as any).value = "Asha"; ph.click("#go");
    await ph.waitFor((t) => /The game starts at/.test(t), 25_000);
    expect(storyOf(ph).state).toBe("waiting"); expect(storyOf(ph).text).toMatch(when); expect(storyOf(ph).text).toContain("Keep this page open. The numbers start by themselves.");
    const big = await openPage(x.w.world, { url: "http://localhost/big.html?e=ST-WAIT", html: "big.html", scripts: ["zgame.js", "big.js"], afterLoad: (win, f) => { if (f === "zgame.js") fakeBeacon(win, () => x.now() - 2 * 3_600_000); } });
    open.push(big); await big.waitFor((t) => /The game starts at/.test(t), 25_000);
    expect(storyOf(big).state).toBe("waiting"); expect(storyOf(big).text).toContain("Players: open the link below on your phone to get your ticket.");
    const say = (p: Page) => storyOf(p).text.match(/^The game starts at [^.]*\./)![0];
    expect(say(ph)).toBe(say(c)); expect(say(big)).toBe(say(c)); // the SAME words
  });
  test("while it runs: 'The game is on. N of 90 numbers called.' with the counter ('N of 90 called · M remaining'), the latest number big and the last 5 numbers, on the console, the phone page and the big screen", async () => {
    const x = await setup("ST-RUN");
    x.goLive(); for (let i = 0; i < 40; i++) await x.step();
    const c = await consolePage(x, "ST-RUN");
    const ph = await openPage(x.w.world, { url: "http://localhost/z?e=ST-RUN", html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, x.now); } });
    open.push(ph); await ph.waitFor((t) => /Join the engagement/.test(t));
    (ph.$("#ph") as any).value = "9822222222"; (ph.$("#nm") as any).value = "Ravi"; ph.click("#go");
    const big = await openPage(x.w.world, { url: "http://localhost/big.html?e=ST-RUN", html: "big.html", scripts: ["zgame.js", "big.js"], afterLoad: (win, f) => { if (f === "zgame.js") fakeBeacon(win, x.now); } });
    open.push(big);
    await c.waitFor((t) => /The game is on\./.test(t), 30_000);
    await ph.waitFor((t) => /[1-9]\d* of 90 called|called since you joined/.test(t), 30_000);
    await big.waitFor((t) => /[1-9]\d* of 90 called/.test(t), 30_000);
    expect(storyOf(c).state).toBe("running"); expect(storyOf(c).text).toContain("Watch the board. Pause only if you really must.");
    expect(storyOf(ph).state).toBe("running"); expect(storyOf(ph).text).toContain("Tap each number on your ticket. Press Claim when a prize is complete.");
    expect(storyOf(big).state).toBe("running"); expect(storyOf(big).text).toContain("Watch the numbers. Players tap them on their tickets.");
    expect(c.$("#latestnum")!.textContent!.trim()).toMatch(/^\d+$/); expect(c.$("#numcount")!.textContent).toMatch(/\d+ of 90 called · \d+ left/);
    expect(big.$("#calledbig")!.textContent).toMatch(/\d+ of 90 called · \d+ left/); expect(big.$("#lastfew")!.textContent).toMatch(/Last 5 numbers called: \d/);
    expect(ph.$("#calledcount")!.textContent).toMatch(/^\d+ of 90 called · \d+ left$/);
    for (const p of [c, ph, big]) expect(p.text()).not.toMatch(/\bidx\b|\bround\b/i);
  });
  test("finished: the same sentence on the console, the phone and the big screen", async () => {
    const x = await setup("ST-END");
    x.goLive(); for (let i = 0; i < 6; i++) await x.step(120_000);
    const c = await consolePage(x, "ST-END");
    await c.waitFor((t) => /The game is over\. All 90 numbers were called\./.test(t), 60_000);
    const ph = await openPage(x.w.world, { url: "http://localhost/z?e=ST-END", html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, x.now); } });
    open.push(ph); await ph.waitFor((t) => /Join the engagement/.test(t));
    (ph.$("#ph") as any).value = "9822222223"; (ph.$("#nm") as any).value = "Meera"; ph.click("#go");
    const big = await openPage(x.w.world, { url: "http://localhost/big.html?e=ST-END", html: "big.html", scripts: ["zgame.js", "big.js"], afterLoad: (win, f) => { if (f === "zgame.js") fakeBeacon(win, x.now); } });
    open.push(big);
    await ph.waitFor((t) => /The game is over\. All 90 numbers were called\./.test(t), 60_000);
    await big.waitFor((t) => /The game is over\. All 90 numbers were called\./.test(t), 60_000);
    for (const p of [c, ph, big]) { expect(storyOf(p).state).toBe("endedAll"); expect(storyOf(p).text).toContain("The game is over. All 90 numbers were called."); }
    expect(storyOf(c).text).toContain("Download the game log and hand over the prizes."); expect(storyOf(ph).text).toContain("Thank you for playing.");
  });
});

describe("the vital details on the console and the game log page", () => {
  test("during the game: status, numbers called, people, pauses, prizes won so far with ticket number and time, warnings; the Game log buttons are not there before the end", async () => {
    const x = await setup("ST-VIT");
    for (const p of x.phones) { await p.rt.boot(); expect(await p.rt.join(p.phone)).toBe(true); }
    x.goLive(); for (let i = 0; i < 40; i++) await x.step();
    x.w.world.raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES('ST-VIT',1,'early5',1,2,20,?, 'phones')").run(x.now() - 60_000);
    const f = (await file(x, "ST-VIT"))!;
    expect((await x.w.api("POST", "/api/z/ST-VIT/control", { message: signControlWithSecret(KEY, nextMessage(f, roundAt(x.now()), { action: "pause", pauseForRounds: 400 })) })).status).toBe(200);
    for (let i = 0; i < 20; i++) await x.step();
    const c = await consolePage(x, "ST-VIT");
    await c.waitFor((t) => /Game details/.test(t) && /Ticket number 2/.test(t), 30_000);
    expect(c.$("#v-called")).toBeNull(); /* the counter is shown once, at the top */ expect(c.$("#v-people")!.textContent).toMatch(/^2 joined, none waiting/);
    expect(c.$("#v-status")!.textContent).toContain("The game is paused by the Organizer."); expect(c.$("#v-pauses")!.textContent).toMatch(/Paused by the Organizer at/);
    expect(c.$("#v-prizes")!.textContent).toMatch(/Early Five.*Ticket number 2/); expect(c.$("#v-warn")!.textContent).toMatch(/The game is paused/);
    expect(c.$("#gamelogbox")).toBeNull();
  });
  test("after the game: the console offers the game log; the page lists the vital details and every number called with its time (90) and has no name or mobile number; the text file says the same", async () => {
    const x = await setup("ST-LOG");
    for (const p of x.phones) { await p.rt.boot(); expect(await p.rt.join(p.phone, "Zainab Secret")).toBe(true); }
    x.goLive(); for (let i = 0; i < 6; i++) await x.step(120_000);
    x.w.world.raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES('ST-LOG',1,'full',1,1,80,?, 'phones')").run(x.now() - 500_000);
    const c = await consolePage(x, "ST-LOG");
    await c.waitFor((t) => /Game log/.test(t) && /Open the game log/.test(t), 60_000);
    expect((c.$("#gamelogopen") as any).getAttribute("href")).toMatch(/\/gamelog\.html\?e=ST-LOG#k=/); expect((c.$("#gamelogtxt") as any).getAttribute("href")).toMatch(/&txt=1#k=/);
    const g = await openPage(x.w.world, { url: `http://localhost/gamelog.html?e=ST-LOG#k=${x.token}`, html: "gamelog.html", scripts: ["zgame.js", "gamelog.js"], afterLoad: (win, f) => { if (f === "zgame.js") fakeBeacon(win, x.now); } });
    open.push(g);
    await g.waitFor((t) => /Every number called, with its time/.test(t) && /People who joined/.test(t), 30_000);
    for (let i = 0; i < 300 && !((g.win as any).__gamelog && (g.win as any).__gamelog.nums.length === 90); i++) await wait(200);
    const t = g.text(); const txt = (g.win as any).__gamelog.text() as string;
    expect(t).toMatch(/Full House.*Ticket number 1/); expect(t).toMatch(/Start time/); expect(t).toMatch(/How it ended/); expect(t).toMatch(/The game was never paused\./); expect(t).toMatch(/Report e-mail/);
    expect(g.win.document.querySelectorAll("#numlist div").length).toBe(90);
    expect(t).toMatch(/At a glance/); expect(t).toMatch(/Claims/); expect(t).toMatch(/More games from Corporate Tambola/); for (const n of ["Housie / Tambola", "Bingo", "Tic-Tac-Toe", "Snakes & Ladders", "Luck by Chance", "Lucky Draw"]) { expect(t).toContain(n); expect(txt).toContain(n); }
    expect(g.win.document.querySelector('img[src="/logo-512.png"]')).toBeTruthy(); expect(txt).toContain("365 days");
    for (const s0 of [t, txt]) { const s = s0.replace(/hello@corporatetambola\.com/g, ""); expect(s).not.toMatch(/Zainab|Secret|98\d{8}|@/); expect(s).not.toMatch(/\bidx\b/i); }
    expect(txt).toMatch(/Game log: /); expect(txt).toMatch(/Ticket number 1/); expect(txt.split("\n").filter((l) => /^Number \d+ announced \d\d:\d\d:\d\d · \d+ of 90 called · \d+ left$/.test(l)).length).toBe(90);
    expect(g.errors).toEqual([]);
  });
  test("a stranger's key gets a polite refusal, not the log", async () => {
    const x = await setup("ST-DENY");
    const g = await openPage(x.w.world, { url: "http://localhost/gamelog.html?e=ST-DENY#k=ctk_nothing", html: "gamelog.html", scripts: ["zgame.js", "gamelog.js"], afterLoad: (win, f) => { if (f === "zgame.js") fakeBeacon(win, x.now); } });
    open.push(g); await g.waitFor((t) => /for the Organizer and the Hosts of the game/.test(t), 20_000);
    expect(g.text()).not.toMatch(/People who joined/);
  });
});
