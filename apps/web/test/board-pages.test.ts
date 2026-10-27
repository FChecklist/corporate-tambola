// The organizer's board screen (1.4.3): the live panels, the controls on the same screen, the averages, and nothing of it on the player's page.
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




/** the live panels sit under the board, outside the board's own box */
const ptext = (b: Page) => String(b.win.document.getElementById("panels")?.textContent ?? "").replace(/\s+/g, " ");
const until = async (f: () => boolean, ms = 30_000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error("timed out"); await wait(100); } };
async function boardPage(x: X, eid: string, key: string, scripts = ["zgame.js", "control.js", "board.js"]) {
  const p = await openPage(x.w.world, {
    url: `http://localhost/board.html?e=${eid}#k=${key}`, html: "board.html", scripts,
    afterLoad: (win: any, f: string) => {
      if (f === "zgame.js" && win.ZG) { if (!win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; fakeBeacon(win, x.now); }
      if (f === "control.js") win.TBControl.sign = async (code: string, _a: unknown, action: any, o: any = {}) => signControlWithSecret(KEY, nextMessage((await readPublished(x.kv, code))!, roundAt(x.now()), { action, ...o }));
    },
  });
  open.push(p); return p;
}

describe("the organizer's board screen: live panels", () => {
  test("story line, the whole log (numbers, prizes, pauses with who) newest first, claims, people, and the quiet next-number timer; the controls sit on the same screen", async () => {
    const x = await setup("BD-1");
    for (const p of x.phones) { await p.rt.boot(); expect(await p.rt.join(p.phone)).toBe(true); }
    x.goLive(); for (let i = 0; i < 30; i++) await x.step();
    x.w.world.raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES('BD-1',1,'early5',1,2,10,?, 'phones')").run(x.now() - 120_000);
    x.w.world.raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES('BD-1',?,'early5',1,10,?)").run((x.w.world.raw.query("SELECT pid FROM participant LIMIT 1").get() as any).pid, x.now() - 120_000);
    const b = await boardPage(x, "BD-1", x.token);
    await until(() => /The whole game, newest first/.test(ptext(b)));
    expect(b.$("#storyline")!.textContent).toMatch(/The game is on\./); expect(b.$("#storyline")!.textContent).toContain("Watch the board. Pause only if you really must.");
    await until(() => !!b.$("#bp-quiet"), 20_000); expect(b.$("#bp-quiet")!.textContent).toMatch(/^Next number in \d+s$|^Next number any moment$/);
    const evs = Array.from(b.win.document.querySelectorAll("#bp-logbox .bpev")).map((e: any) => e.textContent as string);
    expect(evs.length).toBeGreaterThan(10); expect(evs.some((e) => /was called/.test(e))).toBe(true); expect(evs.some((e) => /Early Five.*won by Ticket 2/.test(e))).toBe(true);
    const times = evs.map((e) => e.slice(0, 8)); expect([...times].sort().reverse()).toEqual(times); // newest first
    expect(b.$("#bp-claims")!.textContent).toMatch(/accepted/); expect(b.$("#bp-people")!.textContent).toMatch(/2 joined/);
    expect(b.$("#bp-pause")).toBeTruthy(); expect(b.$("#bp-resume")).toBeTruthy();
    expect(b.html()).not.toMatch(/\b9\d{9}\b|@/); // no mobile number or e-mail anywhere on the board
  });
  test("the average gap: separate lines for the game's own numbers and the numbers called by hand; 'not yet' under 3 numbers", async () => {
    const x = await setup("BD-2");
    x.goLive(); for (let i = 0; i < 12; i++) await x.step();
    const b = await boardPage(x, "BD-2", x.token);
    await until(() => !!b.$("#bp-avg"));
    expect(b.$("#bp-avg")!.textContent).toMatch(/Called by the game: [\d.]+ seconds \(from \d+ numbers\)/); expect(b.$("#bp-avg")!.textContent).toMatch(/Called by hand: not yet \(needs at least 3 numbers\)/);
    const m = b.$("#bp-avg")!.textContent!.match(/Called by the game: ([\d.]+) seconds/)!; expect(Number(m[1])).toBeGreaterThan(5); expect(Number(m[1])).toBeLessThan(7); // this test game calls a number every 6 seconds
  });
  test("each control works from the board and is written in the live log with the time and who; a second press is not possible straight away", async () => {
    const x = await setup("BD-3");
    x.goLive(); for (let i = 0; i < 30; i++) await x.step();
    const b = await boardPage(x, "BD-3", x.token);
    await until(() => !!b.$("#bp-pause") && !(b.$("#bp-pause") as any).disabled);
    b.click("#bp-pause"); for (let i = 0; i < 50 && !b.win.document.getElementById("bp-sure"); i++) await wait(100);
    const yes = b.$("#bp-sure #bp-yes") as any, tick = b.$("#bp-tick") as any; expect(b.$("#bp-sure")!.textContent).toContain("Are you sure? Numbers stop for everybody."); expect(yes.disabled).toBe(true);
    tick.checked = true; tick.dispatchEvent(new (b.win as any).Event("change")); expect(yes.disabled).toBe(false); b.click("#bp-sure #bp-yes");
    for (let i = 0; i < 50 && (await file(x, "BD-3"))!.messages.length < 1; i++) await wait(100);
    expect((await file(x, "BD-3"))!.messages.map((m) => m.action)).toEqual(["pause"]);
    expect((b.$("#bp-pause") as any).disabled).toBe(true); // busy: no double press
    for (let i = 0; i < 25; i++) await x.step();
    await until(() => /paused the game|was paused/.test(b.$("#bp-logbox")?.textContent ?? "")); expect(b.$("#bp-logbox")!.textContent).toMatch(/the Organizer (paused the game)|The Organizer: The game was paused/);
    await until(() => /The game is paused by/.test(b.$("#storyline")?.textContent ?? ""), 30_000);
    expect(b.$("#storyline")!.textContent).toContain("The game is paused by the Organizer."); expect(b.$("#storyline")!.textContent).toContain("Press Resume when you are ready.");
    await until(() => !!b.$("#bp-resume") && !(b.$("#bp-resume") as any).disabled, 20_000); b.click("#bp-resume");
    for (let i = 0; i < 50 && (await file(x, "BD-3"))!.messages.length < 2; i++) await wait(100);
    expect((await file(x, "BD-3"))!.messages.map((m) => m.action)).toEqual(["pause", "resume"]);
  });
  test("a stranger and a player cannot open the board; the player's page has none of these panels", async () => {
    const x = await setup("BD-4");
    const b = await boardPage(x, "BD-4", "ctk_nothing");
    await b.waitFor((t) => /This board is for the Organizer/.test(t), 20_000); expect(b.$("#bp-controls")).toBeNull(); expect(b.$("#bp-log")).toBeNull();
    x.goLive(); for (let i = 0; i < 30; i++) await x.step();
    const ph = await openPage(x.w.world, { url: "http://localhost/z?e=BD-4", html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, x.now); } });
    open.push(ph); await ph.waitFor((t) => /Join the engagement/.test(t));
    (ph.$("#ph") as any).value = "9822222220"; (ph.$("#nm") as any).value = "Asha"; ph.click("#go");
    await ph.waitFor(() => !!ph.$("#calledcount"), 30_000);
    for (const id of ["bp-controls", "bp-log", "bp-claims", "bp-avg", "bp-people", "bp-pause", "bp-logbox"]) expect([id, !!ph.$("#" + id)]).toEqual([id, false]);
    expect(ph.text()).not.toMatch(/Average gap|Claims as they come|The whole game, newest first/);
  });
});
