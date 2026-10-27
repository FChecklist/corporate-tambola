// Host mode on the screens ("A Host presses a button for each number"): the console's step 1 choice and step 2 without speed chips, the Game day "Next number" button
// and its states, the phone page's chip and the number screen's line. The real page scripts run in a DOM against the real Worker code; the beacon is the test's clock.
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
async function setup(eid: string, host = true, over: Record<string, unknown> = {}) {
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

describe("the console: who calls the numbers", () => {
  test("step 2 offers the two plain choices, before the gap; choosing the Host and saving stores callMode and hides the gap; the read-back says so", async () => {
    const x = await setup("HC-SET", false);
    const c = await consolePage(x, "HC-SET");
    await c.waitFor(() => !!c.$('.zc-dot[data-open="2"]')); openStep(c, 2); await c.waitFor((t) => /Who calls the numbers\?/.test(t) && /Duration \(gap\) between two numbers/.test(t));
    const chips = Array.from(c.win.document.querySelectorAll('#rg-mode .zc-radio b')).map((e: any) => e.textContent.trim());
    expect(chips).toEqual(["The game does", "I do"]);
    expect((c.$('[data-ck="mode"][data-v="auto"]') as any).checked).toBe(true);
    const html = c.win.document.getElementById("sec2")!.innerHTML; expect(html.indexOf('data-ck="mode"')).toBeLessThan(html.indexOf('data-ck="spd"')); // who calls the numbers comes first, then the gap
    expect(c.$('[data-ck="spd"]')).toBeTruthy(); // auto: the speed chips are there
    c.click('[data-ck="mode"][data-v="host"]'); await wait(50);
    expect(c.text()).toMatch(/press Next number for each number/);
    expect(c.$('[data-ck="spd"]')).toBeNull(); expect(c.$("#nospeed")).toBeTruthy(); // host mode: no gap to choose
    c.click('#sec2 [data-save="2"]');
    await c.waitFor((t) => /Saved\./.test(t));
    const sum = await x.w.json(await x.w.api("GET", "/api/z/HC-SET/summary", undefined, x.token));
    expect(sum.callMode).toBe("host");
    expect((await x.w.json(await x.w.api("GET", "/api/z/HC-SET/info"))).callMode).toBe("host");
    openStep(c, 7); await c.waitFor((t) => /a Host presses for each number/.test(t)); // the read-back
    openStep(c, 2); await c.waitFor((t) => /Who calls the numbers\?/.test(t));
    await c.waitFor(() => !(c.win as any).__zc.saving); c.click('[data-ck="mode"][data-v="auto"]'); await wait(50); c.click('#sec2 [data-save="2"]'); // and back: the speed chips return
    const until = async (f: () => Promise<boolean>) => { const t0 = Date.now(); while (!(await f())) { if (Date.now() - t0 > 8000) throw new Error("timed out"); await wait(100); } };
    await until(async () => (await x.w.json(await x.w.api("GET", "/api/z/HC-SET/info"))).callMode === "auto");
    openStep(c, 2); await c.waitFor((t) => /Duration \(gap\)/.test(t), 12_000);
  });
  test("step 2 hides the Host-calling choice for a game above 1,000 people, with a short note why (nothing breaks)", async () => {
    const x = await setup("HC-BIG", false, { cap: 1500 });
    const c = await consolePage(x, "HC-BIG");
    await c.waitFor(() => !!c.$('.zc-dot[data-open="2"]')); openStep(c, 2); await c.waitFor((t) => /Games above 1,000 people are called by the game itself/.test(t));
    expect(c.$('[data-ck="mode"]')).toBeNull(); expect(!!c.$("#callhidden")).toBe(true); expect(!!c.$('[data-ck="start"]')).toBe(true);
    expect((await x.w.json(await x.w.api("GET", "/api/z/HC-BIG/info"))).callMode).toBe("auto");
  });
});

describe("the console on Game day: the Next number button", () => {
  test("disabled before the start; a press releases one number, which shows on the button's card and on every phone; a second press too soon is refused kindly; the pause refuses a press", async () => {
    const x = await setup("HC-DAY");
    const c = await consolePage(x, "HC-DAY");
    await c.waitFor((t) => /Game day|Your game|Last step/i.test(t));
    openStep(c, 9); await c.waitFor((t) => /Next number/.test(t));
    expect(c.$("#hostcall")).toBeTruthy();
    expect((c.$("#nextnum") as any).disabled).toBe(true); expect(c.text()).toMatch(/The game has not started yet/);
    expect(c.text()).toMatch(/The number reaches every phone within about 15 seconds/);
    for (const p of x.phones) { await p.rt.boot(); expect(await p.rt.join(p.phone)).toBe(true); }
    x.goLive(); for (let i = 0; i < 4; i++) await x.step(); // the start has passed: nothing is called yet
    for (const p of x.phones) { const v = p.rt.view(); expect(v.log).toEqual([]); expect(v.waitingForHost).toBe(true); }
    await c.waitFor((t) => /Press for the first number when everyone is ready/.test(t), 15_000); // the console's own refresh (every 5 s) sees the start
    expect((c.$("#nextnum") as any).disabled).toBe(false);
    c.click("#nextnum");
    await c.waitFor((t) => /On its way/.test(t), 15_000);
    expect((c.$("#nextnum") as any).disabled).toBe(true);
    const f1 = (await file(x, "HC-DAY"))!; expect(f1.messages.map((m) => m.action)).toEqual(["next"]); // the signed press is stored by the Worker
    expect(f1.messages[0]!.atBeaconRound - f1.messages[0]!.signedAtRound).toBe(2);
    for (let i = 0; i < 5; i++) await x.step(); // 15 s: the round is published and every phone has it
    const logs = x.phones.map((p) => p.rt.view().log);
    expect(logs[0]!.length).toBe(1); expect(logs[1]).toEqual(logs[0]);
    await c.waitFor((t) => /1 of 90/.test(t) && /Press when you are ready for the next number/.test(t), 15_000);
    expect((c.$("#hostlast") as any).textContent.trim()).toBe(String(logs[0]![0]));
    expect((c.$("#nextnum") as any).disabled).toBe(false);
    // a second press right after a first: the page says so kindly, nothing is sent twice
    c.click("#nextnum"); await c.waitFor((t) => /On its way/.test(t), 15_000);
    c.click("#nextnum"); await wait(100);
    expect((await file(x, "HC-DAY"))!.messages.length).toBe(2);
    // paused: the press is refused with the calm message
    for (let i = 0; i < 5; i++) await x.step();
    const pz = await x.w.api("POST", "/api/z/HC-DAY/control", { message: signControlWithSecret(KEY, nextMessage((await file(x, "HC-DAY"))!, roundAt(x.now()), { action: "pause", pauseForRounds: 40 })) });
    expect(pz.status).toBe(200);
    const st = (await file(x, "HC-DAY"))!.messages.find((m) => m.action === "pause")!;
    while (roundAt(x.now()) < st.atBeaconRound + 1) await x.step();
    await c.waitFor((t) => /Paused\. Press Resume/.test(t), 15_000);
    c.click("#nextnum"); await c.waitFor((t) => t.includes(NEXT_REFUSALS.paused), 5_000);
    expect((await file(x, "HC-DAY"))!.messages.filter((m) => m.action === "next").length).toBe(2);
    for (const p of x.phones) expect(p.rt.view().paused).toBe(true);
    expect(c.errors).toEqual([]);
  });
  test("after End the game the Host's Next number button is off and says why; a press that still reaches a stopped game is refused in plain words, not 'engagement already stopped'", async () => {
    const x = await setup("HC-END");
    const c = await consolePage(x, "HC-END");
    await c.waitFor((t) => /Game day|Your game|Last step/i.test(t));
    openStep(c, 9); await c.waitFor((t) => /Next number/.test(t));
    for (const p of x.phones) { await p.rt.boot(); expect(await p.rt.join(p.phone)).toBe(true); }
    x.goLive(); for (let i = 0; i < 4; i++) await x.step();
    await c.waitFor((t) => /Press for the first number when everyone is ready/.test(t), 15_000);
    expect((c.$("#nextnum") as any).disabled).toBe(false);
    // a press that reaches the server after the game was ended (from another device): the server answers 422 engagement already stopped
    const real = c.win.fetch; let refuse = true;
    c.win.fetch = async (input: any, init?: any) => { const u = new URL(String(input), "http://localhost"); if (refuse && (init?.method || "GET").toUpperCase() === "POST" && u.pathname === "/api/z/HC-END/control") return new Response(JSON.stringify({ error: "engagement already stopped" }), { status: 422, headers: { "content-type": "application/json" } }); return real(input, init); };
    c.click("#nextnum"); await c.waitFor((t) => /This game has already been ended\./.test(t), 10_000);
    expect(c.text()).not.toMatch(/engagement already stopped/i);
    refuse = false;
    // and when the game really is ended from this console, the button is off at once and the line under the number says so
    c.click('[data-ctl="stop"]'); c.click("#zcsure [data-y]");
    await c.waitFor((t) => /The game is (being ended|over)/.test(t), 15_000);
    expect((c.$("#nextnum") as any).disabled).toBe(true); expect(c.$("#hoststate")!.textContent).toMatch(/The game is (being ended|over)/); expect(c.$("#hoststate")!.textContent).not.toMatch(/Press when you are ready/);
    expect((await file(x, "HC-END"))!.messages.filter((m) => m.action === "next").length).toBe(0); // no number was released by the refused press
  });
  test("in an auto-mode game there is no Next number button", async () => {
    const x = await setup("HC-AUTO", false);
    const c = await consolePage(x, "HC-AUTO");
    await c.waitFor((t) => /Game day|Your game|Last step/i.test(t));
    openStep(c, 9); await c.waitFor((t) => /Controls/.test(t));
    expect(c.$("#hostcall")).toBeNull(); expect(c.$("#nextnum")).toBeNull();
  });
});

describe("the phone page and the number screen", () => {
  const rtFake = (win: any, nowMs: () => number) => {
    const Orig = win.ZG.PhoneRuntime;
    win.ZG.PhoneRuntime = class extends Orig {
      constructor(eid: string, deps: any) {
        super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const nowR = roundAt(nowMs()); const r = last === "latest" ? nowR : Number(last); if (r > nowR) return { ok: false, status: 404, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: any) => x.signature === "aa", mono: () => deps.mono() });
      }
    };
  };
  test("the phone's chip reads 'Waiting for the host' instead of a countdown; the number screen says so too; after a press both show the number", async () => {
    const x = await setup("HC-PH");
    x.goLive(); for (let i = 0; i < 3; i++) await x.step();
    const p = await openPage(x.w.world, { url: "http://localhost/z?e=HC-PH", html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, x.now); } });
    open.push(p);
    await p.waitFor((t) => /Join the engagement/.test(t));
    (p.$("#ph") as any).value = "9822222229"; (p.$("#nm") as any).value = "Asha"; p.click("#go");
    await p.waitFor((t) => /Waiting for the host/.test(t), 20_000);
    expect(p.text()).not.toMatch(/Next number in \d+s/);
    expect(p.text()).toMatch(/The host presses for the next number/);
    const big = await openPage(x.w.world, { url: "http://localhost/big.html?e=HC-PH", html: "big.html", scripts: ["zgame.js", "big.js"], afterLoad: (win, f) => { if (f === "zgame.js") fakeBeacon(win, x.now); } });
    open.push(big);
    await big.waitFor((t) => /Waiting for the host/.test(t), 20_000);
    // a press: the number reaches the phone page and the screen
    const r = await x.w.api("POST", "/api/z/HC-PH/control", { message: signControlWithSecret(KEY, nextMessage((await readPublished(x.kv, "HC-PH"))!, roundAt(x.now()), { action: "next" })) });
    expect(r.status).toBe(200);
    for (let i = 0; i < 5; i++) await x.step(); // 15 s of beacon time: the round named by the press is published
    await p.waitFor((t) => /1 of 90 called/.test(t) && /Waiting for the host/.test(t), 25_000);
    const n = p.win.__rt.view().log[0]; expect(n).toBeGreaterThan(0); // the page's own runtime
    expect((p.$("#big") as any).textContent.trim()).toBe(String(n));
    await big.waitFor((t) => /1 of 90 numbers called/.test(t) && /Waiting for the host/.test(t), 25_000);
    expect(p.errors).toEqual([]); expect(big.errors).toEqual([]);
  });
});
