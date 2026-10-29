// Game-day clarity on the screens (1.4.1): the Number board button and live strip, the PAUSED banner (who, since when, until when, Resume) with its 'Are you sure?', how the game ended in plain words, and the
// 'When every prize is won' question. The real page scripts run in a DOM against the real Worker code; the beacon is the test's clock.
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


/** the Pause question asks for a tick before "Yes" works */
const tickAndYes = async (c: Page) => { const yes = c.$("#zcsure [data-y]") as any, tick = c.$("#zcsuretick") as any; expect(yes.disabled).toBe(true); tick.checked = true; tick.dispatchEvent(new (c.win as any).Event("change")); expect(yes.disabled).toBe(false); c.click("#zcsure [data-y]"); };

describe("game-day clarity on the console", () => {
  test("the Number board button and the numbers called so far sit at the very top; the latest is highlighted; N of 90 follows the game", async () => {
    const x = await setup("GD-TOP");
    for (const p of x.phones) { await p.rt.boot(); expect(await p.rt.join(p.phone)).toBe(true); }
    const c = await consolePage(x, "GD-TOP");
    await c.waitFor((t) => /Game day|Your game|Last step/i.test(t));
    expect(c.$("#boardbtn")).toBeTruthy(); expect((c.$("#boardbtn") as any).getAttribute("href")).toMatch(/\/board\.html\?e=GD-TOP#k=/);
    expect(c.html().indexOf('id="livebar"')).toBeGreaterThan(-1); expect(c.html().indexOf('id="livebar"')).toBeLessThan(c.html().indexOf('id="sec1"')); // above every step
    x.goLive(); for (let i = 0; i < 40; i++) await x.step();
    await c.waitFor((t) => /[1-9][0-9]* of 90 called/.test(t), 20_000);
    const balls = Array.from(c.win.document.querySelectorAll("#numstrip .zc-ball")) as any[];
    expect(balls.length).toBeGreaterThan(3); expect(balls.filter((b) => b.classList.contains("last")).length).toBe(1); expect(balls[balls.length - 1].classList.contains("last")).toBe(true);
    expect(c.$("#numcount")!.textContent).toContain(`${balls.length} of 90`);
    expect(c.errors).toEqual([]);
  });
  test("the claim signal in the Organizer's console: when a claim happens a calm pop-up with the ticket number shows within a few seconds", async () => {
    const x = await setup("GD-SIG");
    for (const p of x.phones) { await p.rt.boot(); expect(await p.rt.join(p.phone)).toBe(true); }
    const c = await consolePage(x, "GD-SIG");
    await c.waitFor((t) => /Game day|Your game|Last step/i.test(t)); x.goLive(); for (let i = 0; i < 12; i++) await x.step();
    await wait(2600); // the console has read the claims that exist (none) and the signal
    const pid = (x.w.world.raw.query("SELECT pid FROM participant LIMIT 1").get() as any).pid as string;
    x.w.world.raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES('GD-SIG',?,'early5',1,10,?)").run(pid, x.now());
    x.w.world.raw.prepare("INSERT INTO kv(k,v) VALUES('cv/GD-SIG','1') ON CONFLICT(k) DO UPDATE SET v='1'").run();
    const t0 = Date.now(); while (!/has claimed Early Five/.test(c.win.document.getElementById("claimtoasts")?.textContent ?? "")) { if (Date.now() - t0 > 6000) throw new Error("no pop-up in the console"); await wait(100); }
    expect(c.win.document.getElementById("claimtoasts")!.textContent).toMatch(/^Ticket \d+ has claimed Early Five\. Checking now/);
  });
  test("Pause asks 'Are you sure? Numbers stop for everybody.'; after it a big PAUSED banner says who, since when and until when, with a Resume button that works", async () => {
    const x = await setup("GD-PZ");
    for (const p of x.phones) { await p.rt.boot(); expect(await p.rt.join(p.phone)).toBe(true); }
    const c = await consolePage(x, "GD-PZ");
    await c.waitFor((t) => /Game day|Your game|Last step/i.test(t));
    x.goLive(); for (let i = 0; i < 30; i++) await x.step();
    openStep(c, 9); await c.waitFor((t) => /Controls/.test(t), 20_000);
    c.click('[data-ctl="pause"]');
    for (let i = 0; i < 50 && !c.win.document.getElementById("zcsure"); i++) await wait(100);
    expect(c.win.document.getElementById("zcsure")!.textContent).toMatch(/Are you sure\? Numbers stop for everybody\./);
    c.click("#zcsure [data-n]"); await wait(100);
    expect((await file(x, "GD-PZ"))!.messages.length).toBe(0); // "No, keep playing": nothing was sent
    c.click('[data-ctl="pause"]'); for (let i = 0; i < 50 && !c.win.document.getElementById("zcsure"); i++) await wait(100); await tickAndYes(c);
    for (let i = 0; i < 20; i++) { await wait(200); if ((await file(x, "GD-PZ"))!.messages.length === 1) break; }
    for (let i = 0; i < 20; i++) await x.step();
    await c.waitFor((t) => /PAUSED/.test(t) && /Paused by the Organizer at/.test(t), 25_000);
    expect(c.$("#pausebanner")).toBeTruthy(); expect(c.$('#pausebanner [data-ctl="resume"]')).toBeTruthy();
    expect(c.text()).toMatch(/The numbers start again at about .* \(in about \d+ minutes?\), or sooner when you press Resume/);
    c.click('#pausebanner [data-ctl="resume"]');
    for (let i = 0; i < 20; i++) { await wait(200); if ((await file(x, "GD-PZ"))!.messages.length === 2) break; }
    expect((await file(x, "GD-PZ"))!.messages.map((m) => m.action)).toEqual(["pause", "resume"]);
  });
  test("the phone page and the big screen show the same big PAUSED banner with who and when", async () => {
    const x = await setup("GD-PH");
    x.goLive(); for (let i = 0; i < 30; i++) await x.step();
    const f = (await file(x, "GD-PH"))!;
    expect((await x.w.api("POST", "/api/z/GD-PH/control", { message: signControlWithSecret(KEY, nextMessage(f, roundAt(x.now()), { action: "pause", pauseForRounds: 150 })) })).status).toBe(200);
    for (let i = 0; i < 25; i++) await x.step(); // the pause is in force
    const ph = await openPage(x.w.world, { url: "http://localhost/z?e=GD-PH", html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, x.now); } });
    open.push(ph);
    await ph.waitFor((t) => /Join the game/.test(t));
    (ph.$("#ph") as any).value = "9822222227"; (ph.$("#nm") as any).value = "Asha"; ph.click("#go");
    await ph.waitFor((t) => /PAUSED/.test(t) && /Paused by the Organizer at/.test(t), 30_000);
    const big = await openPage(x.w.world, { url: "http://localhost/big.html?e=GD-PH", html: "big.html", scripts: ["zgame.js", "big.js"], afterLoad: (win, f) => { if (f === "zgame.js") fakeBeacon(win, x.now); } });
    open.push(big);
    await big.waitFor((t) => /PAUSED/.test(t) && /Paused by the Organizer at/.test(t), 30_000);
    expect(ph.$("#pausebanner")).toBeTruthy(); expect(big.$("#pausebanner")).toBeTruthy();
  });
  test("when all 90 numbers are called, the console, the phone page and the big screen all say 'All 90 numbers were called.'", async () => {
    const x = await setup("GD-END");
    x.goLive(); for (let i = 0; i < 6; i++) await x.step(120_000); // far past the 90th number
    const c = await consolePage(x, "GD-END");
    await c.waitFor((t) => /The game is over\./.test(t) && /All 90 numbers were called\./.test(t), 60_000);
    const ph = await openPage(x.w.world, { url: "http://localhost/z?e=GD-END", html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, x.now); } });
    open.push(ph);
    await ph.waitFor((t) => /Join the game/.test(t));
    (ph.$("#ph") as any).value = "9822222226"; (ph.$("#nm") as any).value = "Ravi"; ph.click("#go");
    await ph.waitFor((t) => /All 90 numbers were called\./.test(t), 60_000);
    const big = await openPage(x.w.world, { url: "http://localhost/big.html?e=GD-END", html: "big.html", scripts: ["zgame.js", "big.js"], afterLoad: (win, f) => { if (f === "zgame.js") fakeBeacon(win, x.now); } });
    open.push(big);
    await big.waitFor((t) => /Game over/.test(t) && /All 90 numbers were called\./.test(t), 60_000);
  });
});

describe("the console question: when every prize is won", () => {
  test("two radio buttons with a plain sentence each; the saved value is shown; choosing 'keep calling' and saving stores it", async () => {
    const x = await setup("GD-RAD");
    const c = await consolePage(x, "GD-RAD");
    await c.waitFor(() => !!c.$('.zc-dot[data-open="2"]')); openStep(c, 2); await c.waitFor((t) => /When every prize is won:/.test(t));
    const radio = Array.from(c.win.document.querySelectorAll('input[type=radio][name="after"]')) as any[];
    expect(radio.map((e) => e.value)).toEqual(["end", "keep"]); expect(radio.filter((e) => e.checked).map((e) => e.value)).toEqual(["end"]); // a game made before the question keeps the old rule until the organizer chooses
    expect(Array.from(c.win.document.querySelectorAll("#rg-after .zc-radio b")).map((e: any) => e.textContent.trim())).toEqual(["Stop when every prize is awarded", "Keep calling all numbers"]); // WP-02 / owner ruling Q1: stopping at the last prize comes first, keeping on calling is the organizer's option
    expect(c.win.document.querySelectorAll("#rg-after .zc-rdesc").length).toBe(2);
    c.click('[data-ck="after"][data-v="keep"]'); await wait(50);
    c.click('#sec2 [data-save="2"]'); await c.waitFor((t) => /Saved\./.test(t));
    expect((await x.w.json(await x.w.api("GET", "/api/z/GD-RAD/info"))).afterPrizes).toBe("keep");
  });
});
