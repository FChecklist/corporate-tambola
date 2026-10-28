// REHEARSALS on the screens (1.6.0): the three cards under Publish, the REHEARSAL block on a rehearsal's pages, the calm "over" page, and the block in the share text.
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


  const rtFake = (win: any, nowMs: () => number) => {
    const Orig = win.ZG.PhoneRuntime;
    win.ZG.PhoneRuntime = class extends Orig {
      constructor(eid: string, deps: any) {
        super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const nowR = roundAt(nowMs()); const r = last === "latest" ? nowR : Number(last); if (r > nowR) return { ok: false, status: 404, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: any) => x.signature === "aa", mono: () => deps.mono() });
      }
    };
  };
const rehearsals = async (x: X, eid: string) => x.w.json(await x.w.api("GET", `/api/z/${eid}/rehearsals`, undefined, x.token));
const BLOCK = (id: string, n: number) => `Game ID: ${id}REHEARSAL GAME ${n}This link and this game are for rehearsal only. The real game has a different link and a different game.`;

describe("the three cards under Publish", () => {
  test("a paid game shows Rehearsal 1 ready and 2 and 3 grey with 'Finish rehearsal 1 first'; no number of people anywhere; Start asks first and makes a separate game", async () => {
    const x = await setup("RH-CARD", false);
    const c = await consolePage(x, "RH-CARD");
    await c.waitFor(() => !!c.$('.zc-dot[data-open="7"]')); openStep(c, 7); await c.waitFor((t) => /Start this rehearsal/.test(t), 20_000);
    const box = c.$("#rehearsals")!;
    expect(box.querySelectorAll(".zc-rehcard").length).toBe(3);
    expect(box.querySelector("#reh1")!.textContent).toContain("Start this rehearsal"); expect(box.querySelector("#reh1")!.textContent).toContain("Free, included with your game"); expect(box.querySelector("#reh1")!.textContent).toContain("Practice only, not your real game");
    expect(box.querySelector("#reh2")!.className).toContain("zc-grey"); expect(box.querySelector("#reh2")!.textContent).toContain("Finish rehearsal 1 first."); expect(box.querySelector("#reh3")!.textContent).toContain("Finish rehearsal 2 first.");
    expect(box.querySelectorAll("[data-reh=start]").length).toBe(1); // one action: only card 1 has a button
    expect(box.textContent).not.toMatch(/\b20\b/);
    c.click('[data-reh="start"]'); await c.waitFor(() => !!c.$("#zcsure"), 5000);
    expect(c.$("#zcsure")!.textContent).toContain("This is practice. It is not your real game.");
    c.click("#zcsure [data-y]");
    for (let i = 0; i < 60 && (await rehearsals(x, "RH-CARD")).cards[0].state !== "running"; i++) await wait(100);
    const after = await rehearsals(x, "RH-CARD"); expect(after.cards[0]).toMatchObject({ state: "running", id: "RH-CARD-R1" });
    expect(x.w.world.raw.query("SELECT cap, rehearsal_of FROM engagement WHERE id='RH-CARD-R1'").get()).toMatchObject({ rehearsal_of: "RH-CARD" });
  });
  test("guest-list shapes: four chips; 'No guests yet' starts an empty rehearsal; 'Pick guests' copies only the ticked ones; the number 20 is not shown", async () => {
    const x = await setup("RH-SHAPE", false);
    const ins = (id: string, k: number) => x.w.world.raw.prepare("INSERT INTO person(eid,id,ph,pii,inviter,role,status,added_ms) VALUES(?,?,?,?,?,NULL,'invited',?)").run("RH-SHAPE", id, "ph" + k, "pii" + k, "o", 1);
    ins("pa", 1); ins("pb", 2); ins("pc", 3);
    const c = await consolePage(x, "RH-SHAPE");
    await c.waitFor(() => !!c.$('.zc-dot[data-open="7"]')); openStep(c, 7); await c.waitFor((t) => /Who is invited/.test(t), 20_000);
    expect(c.$("#rehshape")!.querySelectorAll("[data-rehshape]").length).toBe(3); // rehearsal 1 has no "last rehearsal" chip
    expect(c.$("#rehearsals")!.textContent).not.toMatch(/20/);
    c.click('[data-rehshape="pick"]'); await c.waitFor(() => !!c.$("#rehpick"), 10_000);
    expect(c.$("#rehpick")!.querySelectorAll("[data-rehpick]").length).toBe(3);
    c.click('[data-rehpick="pb"]'); c.click('[data-rehpick="pc"]');
    c.click('[data-reh="start"]'); await c.waitFor(() => !!c.$("#zcsure"), 5000); c.click("#zcsure [data-y]");
    for (let i = 0; i < 60 && (await rehearsals(x, "RH-SHAPE")).cards[0].state !== "running"; i++) await wait(100);
    await wait(500); // the guests are copied just after the rehearsal row appears
    expect((x.w.world.raw.query("SELECT group_concat(ph) g FROM (SELECT ph FROM person WHERE eid='RH-SHAPE-R1' ORDER BY ph)").get() as any).g).toBe("ph2,ph3");
  });
  test("before payment all three are grey with the plain sentence and no Start button", async () => {
    const x = await setup("RH-GREY", false);
    x.w.world.raw.prepare("UPDATE engagement SET pack=0 WHERE id='RH-GREY'").run(); x.w.world.raw.prepare("DELETE FROM kv WHERE k='pub/RH-GREY'").run();
    const c = await consolePage(x, "RH-GREY");
    await c.waitFor(() => !!c.$('.zc-dot[data-open="7"]')); openStep(c, 7); await c.waitFor((t) => /Rehearsal 1/.test(t), 20_000);
    const box = c.$("#rehearsals")!; expect(box.querySelectorAll(".zc-grey").length).toBe(3); expect(box.querySelectorAll("[data-reh=start]").length).toBe(0);
    expect(box.textContent).toContain("First publish your game and pay. This unlocks your 3 rehearsals.");
  });
});

describe("a rehearsal's own pages", () => {
  test("the player page opens with the exact block; the console too, and its share text carries it; after the rehearsal is closed the page is the calm 'over' page with the real game's link", async () => {
    const x = await setup("RH-PAGE", false);
    const b = await x.w.json(await x.w.api("POST", "/api/z/RH-PAGE/rehearsal", { people: "none" }, x.token)); expect(b.id).toBe("RH-PAGE-R1");
    x.goLive(); for (let i = 0; i < 6; i++) await x.step();
    const p = await openPage(x.w.world, { url: `http://localhost/z?e=${b.id}`, html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win: any, f: string) => { if (f === "zgame.js") rtFake(win, x.now); } }); open.push(p);
    await p.waitFor(() => !!p.win.document.getElementById("rehbanner"), 20_000);
    expect(p.win.document.getElementById("rehbanner")!.textContent).toBe(BLOCK(b.id, 1)); // Game ID, REHEARSAL GAME 1, the sentence (three lines)
    // the console of the rehearsal: banner, and the WhatsApp text starts with the block
    const c = await consolePage(x, b.id); await c.waitFor(() => !!c.win.document.getElementById("rehbanner"), 20_000);
    expect(c.win.document.getElementById("rehbanner")!.textContent).toContain("REHEARSAL GAME 1");
    expect(c.$("#rehearsals")).toBeNull(); // a rehearsal has no rehearsals
    // closed: a fresh page is the over page and offers the real game
    expect((await x.w.api("POST", `/api/z/${b.id}/rehearsalclose`, {}, x.token)).status).toBe(200);
    const q = await openPage(x.w.world, { url: `http://localhost/z?e=${b.id}`, html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win: any, f: string) => { if (f === "zgame.js") rtFake(win, x.now); } }); open.push(q);
    await q.waitFor((t) => /This rehearsal is over\./.test(t), 20_000);
    expect(q.text()).toContain("Thank you for practising."); expect((q.$("#realgame") as any).getAttribute("href")).toBe("/z.html?e=RH-PAGE");
  });
});
