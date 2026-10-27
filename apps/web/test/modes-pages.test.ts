// The four modes on the screens: the console's two start/play questions, the Start button on Game day (off before the time, 'Press Start, or change the start time' at the time, one press),
// the phone page and the number screen before, at and after Start. The real page scripts run in a DOM against the real Worker code; the beacon is the test's clock.
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

describe("the console: how does it start", () => {
  test("step 2 offers 'By itself at the time' / 'I press Start' and 'The game does' / 'I do'; choosing Start and saving stores startMode and says what happens", async () => {
    const x = await setup("MP-SET");
    const c = await consolePage(x, "MP-SET");
    await c.waitFor(() => !!c.$('.zc-dot[data-open="2"]')); openStep(c, 2); await c.waitFor((t) => /How does it start\?/.test(t) && /Who calls the numbers\?/.test(t));
    expect(Array.from(c.win.document.querySelectorAll('[data-ck="start"]')).map((e: any) => e.textContent.trim())).toEqual(["By itself at the time", "I press Start"]);
    expect((c.$('[data-ck="start"][data-v="auto"]') as any).className).toMatch(/ on$|^on | on /);
    c.click('[data-ck="start"][data-v="manual"]'); await wait(50);
    expect(c.text()).toMatch(/press Start on Game day/); expect(c.text()).toMatch(/to start earlier, change the start time first/);
    c.click('#sec2 [data-save="2"]'); await c.waitFor((t) => /Saved\./.test(t));
    expect((await x.w.json(await x.w.api("GET", "/api/z/MP-SET/info"))).startMode).toBe("manual");
    expect((await x.w.json(await x.w.api("GET", "/api/z/MP-SET/changes", undefined, x.token))).changes.map((r: any) => r.what).join("|")).toMatch(/now you press Start/);
  });
});

describe("Game day: the Start button", () => {
  test("off before the start time with the plain reason; at the time it says 'Press Start, or change the start time'; one press starts the game on the phone page and the number screen; a second press is impossible", async () => {
    const x = await setup("MP-DAY", false, { startMode: "manual" });
    const c = await consolePage(x, "MP-DAY");
    await c.waitFor((t) => /Game day|Your game|Last step/i.test(t));
    openStep(c, 9); await c.waitFor((t) => /Start the game/.test(t));
    expect((c.$("#startnow") as any).disabled).toBe(true);
    expect(c.text()).toMatch(/Start can be pressed from/); expect(c.text()).toMatch(/To start earlier, first change the start time/);
    expect(c.$("#changes")).toBeTruthy();
    for (const p of x.phones) { await p.rt.boot(); expect(await p.rt.join(p.phone)).toBe(true); }
    x.goLive(); for (let i = 0; i < 6; i++) await x.step();
    for (const p of x.phones) { const v = p.rt.view(); expect(v.log).toEqual([]); expect(v.waitingForStart).toBe(true); }
    await c.waitFor((t) => /Press Start, or change the start time\./.test(t), 15_000);
    expect((c.$("#startnow") as any).disabled).toBe(false);
    const ph = await openPage(x.w.world, { url: "http://localhost/z?e=MP-DAY", html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, x.now); } });
    open.push(ph);
    await ph.waitFor((t) => /Join the engagement/.test(t));
    (ph.$("#ph") as any).value = "9822222229"; (ph.$("#nm") as any).value = "Asha"; ph.click("#go");
    await ph.waitFor((t) => /Waiting for the host to begin the game/.test(t), 20_000);
    const big = await openPage(x.w.world, { url: "http://localhost/big.html?e=MP-DAY", html: "big.html", scripts: ["zgame.js", "big.js"], afterLoad: (win, f) => { if (f === "zgame.js") fakeBeacon(win, x.now); } });
    open.push(big);
    await big.waitFor((t) => /Waiting for the host/.test(t) && /presses Start/.test(t), 20_000);
    c.click("#startnow");
    await c.waitFor((t) => /Start was pressed/.test(t), 15_000);
    expect((await file(x, "MP-DAY"))!.messages.map((m) => m.action)).toEqual(["go"]);
    expect(c.$("#startnow")).toBeNull(); // pressed: the button is gone, nothing can be pressed twice
    for (let i = 0; i < 2; i++) await x.step();
    await ph.waitFor((t) => /The game is starting|Starting in/.test(t), 25_000);
    await big.waitFor((t) => /The game is starting/.test(t), 25_000);
    for (let i = 0; i < 20; i++) await x.step(); // past the Start round (about 40 s)
    await ph.waitFor((t) => /1 of 90 called|2 of 90 called|3 of 90 called|[0-9]+ of 90 called/.test(t) && !/Waiting for the host/.test(t), 25_000);
    await big.waitFor((t) => /[1-9][0-9]* of 90 numbers called/.test(t), 25_000);
    expect(ph.errors).toEqual([]); expect(big.errors).toEqual([]); expect(c.errors).toEqual([]);
  });
  test("an automatic-start game has no Start button", async () => {
    const x = await setup("MP-AUTO");
    const c = await consolePage(x, "MP-AUTO");
    await c.waitFor((t) => /Game day|Your game|Last step/i.test(t));
    openStep(c, 9); await c.waitFor((t) => /Controls/.test(t));
    expect(c.$("#startgame")).toBeNull(); expect(c.$("#startnow")).toBeNull();
  });
  test("the phone page before the time says when the game starts and that the host presses Start", async () => {
    const x = await setup("MP-PRE", false, { startMode: "manual" });
    const ph = await openPage(x.w.world, { url: "http://localhost/z?e=MP-PRE", html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, () => x.now() - 2 * 3_600_000); } });
    open.push(ph);
    await ph.waitFor((t) => /Join the engagement/.test(t));
    (ph.$("#ph") as any).value = "9822222228"; (ph.$("#nm") as any).value = "Ravi"; ph.click("#go");
    await ph.waitFor((t) => /The game starts at/.test(t) && /host presses Start/.test(t), 20_000);
  });
});
