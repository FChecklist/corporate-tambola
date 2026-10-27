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
  open.push(ph); await ph.waitFor((t) => /Join the engagement/.test(t));
  (ph.$("#ph") as any).value = "9822222220"; (ph.$("#nm") as any).value = "Asha"; ph.click("#go");
  await ph.waitFor(() => !!(ph.win as any).__rt && !!ph.$("#storyline") && !!ph.$("#big"), 30_000);
  const rt = (ph.win as any).__rt, real = rt.view.bind(rt);
  let patch: Record<string, unknown> = {};
  rt.view = () => ({ ...real(), ...patch });
  const set = (p: Record<string, unknown>) => { patch = { late: null, ...p }; }; // (a phone that joined mid-game counts differently: steer as an on-time player)
  return { x, ph, set, base: real() };
}
const LOG = [12, 45, 7, 88, 31, 60];

describe("the claim alert, the big claim button, the friendly late message", () => {
  test("the moment a prize is claimable: a gold alert near the top ('You have completed Early Five!' / 'Press Claim now, before the next number is called.'), a big fixed button with the prize name, gold Claim buttons; two prizes at once are named together", async () => {
    const { ph, set } = await steered("CU-1");
    set({ phase: "play", paused: false, locked: false, log: LOG, claimNow: ["early5"], claimOpen: ["early5"], claimable: ["early5"], pressed: [], claimed: [], results: [] });
    await ph.waitFor(() => !!ph.$("#claimalert"), 15_000);
    expect(ph.$("#claimalert")!.textContent).toContain("You have completed Early Five!"); expect(ph.$("#claimalert")!.textContent).toContain("Press Claim now, before the next number is called.");
    expect(ph.html().indexOf('id="claimalert"')).toBeLessThan(ph.html().indexOf('id="big"')); // near the top: above the counter
    const bar = ph.$("#claimbar") as any; expect(bar).toBeTruthy(); expect(bar.textContent).toContain("Press to claim your prize"); expect(bar.textContent).toContain("Early Five"); expect(ph.win.document.querySelectorAll("#claimbar .zbigclaim").length).toBe(1);
    expect(ph.win.document.querySelectorAll("#claims .zclaim.ready").length).toBe(1); expect(ph.$("#claimhint")!.textContent).toBe("The Claim button turns gold when you complete a prize. Press it before the next number is called.");
    set({ phase: "play", paused: false, locked: false, log: LOG, claimNow: ["early5", "top"], claimOpen: ["early5", "top"], claimable: ["early5", "top"], pressed: [], claimed: [], results: [] });
    await ph.waitFor((t) => /You have completed Early Five and Top Line!/i.test(t), 15_000);
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
    expect(ph.$("#claimalert")).toBeNull(); expect(ph.$("#claimbar")).toBeNull(); expect(ph.win.document.querySelectorAll("#claims .zclaim").length).toBe(0); expect(ph.$("#stalenote")!.textContent).toMatch(/The time to claim Early Five has passed/);
    set({ ...play, paused: true, claimNow: [], claimOpen: ["early5"], claimable: ["early5"], pressed: [], claimed: [] }); // paused: no alert, no big button, but the claim is still possible with the card's button
    await ph.waitFor(() => !ph.$("#claimalert") && !ph.$("#claimbar") && ph.win.document.querySelectorAll("#claims .zclaim.ready").length === 1, 15_000);
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
  test("'Number just called', '30 of 90 called' and '60 remaining' in a compact card with a thin bar; 'Last 5 numbers called' with five small balls and never more; no board of all the numbers", async () => {
    const { ph, set } = await steered("CU-4");
    const log = Array.from({ length: 30 }, (_, i) => i + 1);
    set({ phase: "play", paused: false, locked: false, log, claimNow: [], claimOpen: [], claimable: [], pressed: [], claimed: [], results: [] });
    await ph.waitFor(() => /30 of 90 called/.test(ph.$("#calledcount")?.textContent ?? ""), 15_000);
    expect(ph.$("#calledcount")!.textContent!.replace(/\s+/g, " ").trim()).toBe("30 of 90 called60 remaining");
    expect(ph.text()).toContain("Number just called"); expect(ph.$("#big")!.textContent!.trim()).toBe("30");
    expect(ph.$("#lastfew")!.textContent).toContain("Last 5 numbers called"); const balls = Array.from(ph.win.document.querySelectorAll("#lastfew .zlastn")).map((e: any) => e.textContent.trim());
    expect(balls).toEqual(["29", "28", "27", "26", "25"]); expect(ph.win.document.querySelectorAll(".zlastn").length).toBeLessThanOrEqual(5);
    expect((ph.$(".zbar i") as any).style.width).toBe("33%");
    expect(ph.html()).not.toMatch(/id="board"|class="zboard|all the numbers/i); // players never get the history or a board of all 90
  });
  test("the order on the phone: story, counter, ticket (with Sneha's three rules), claim, prizes; and the laptop layout has two columns", async () => {
    const { ph, set } = await steered("CU-5");
    set({ phase: "play", paused: false, locked: false, log: LOG, claimNow: [], claimOpen: [], claimable: [], pressed: [], claimed: [], results: [] });
    await ph.waitFor(() => !!ph.$("#zrules") && !!ph.$("#prizepanel"), 15_000);
    const h = ph.html(), at = (id: string) => h.indexOf(id);
    expect(at('id="storyline"')).toBeLessThan(at('id="calledcount"')); expect(at('id="calledcount"')).toBeLessThan(at('id="zrules"')); expect(at('id="zrules"')).toBeLessThan(at('id="claimhint"')); expect(at('id="claimhint"')).toBeLessThan(at('id="prizepanel"'));
    expect(Array.from(ph.win.document.querySelectorAll("#zrules li")).map((e: any) => e.textContent)).toEqual(["This game works like the real one.", "When a number is called, tap it on your ticket to cross it out.", "If you complete a prize, press Claim before the next number is called."]);
    const css = (await import("node:fs")).readFileSync(new URL("../public/z.css", import.meta.url), "utf8");
    expect(css).toMatch(/@media\(min-width:861px\)\{[^}]*\.zplay\{display:grid;grid-template-columns:minmax\(0,1\.55fr\) minmax\(320px,1fr\)/); expect(css).toMatch(/\.zplay>\.ztk\{grid-column:1/);
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
