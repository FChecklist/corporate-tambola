// Real housie on the phone page (z.js): the ticket never marks itself. The player taps each number as it is called (a number not called yet is refused in place, kindly), a Claim button
// appears when their marks complete a prize, pressing it sends the claim and the prize is won (worked out from the claims); a wrong claim is a Bogey, two on the same prize put the ticket
// out of it. The real page script runs in a DOM against the real Worker code; the beacon is the test's clock.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { newWorld, openPage, roundAt, type Page } from "./harness";
import { GRACE_ROUNDS, PRIZE_HOUSES } from "../../../packages/beacon/src/config";
import { roundTimeMs, type Fetcher, type Round } from "../../../packages/beacon/src";

setDefaultTimeout(240_000);
const START = 90_000; // the first number may come from this beacon round on
const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A published, paid game two hours before its start, with the classic houses. Returns the world and a step() that moves the clock 3 s. */
async function setup(eid: string, over: Record<string, unknown> = {}) {
  const w = newWorld();
  const T0 = roundTimeMs(START - 3);
  w.world.now = T0 - 2 * 3_600_000;
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  const token = s.token as string, aiKey = s.aiKey as string;
  expect((await w.api("POST", "/api/z", { id: eid, startRound: START - GRACE_ROUNDS, callSeconds: 6, cap: 100, rewards: [{ pattern: "early5", ordinal: 1 }, { pattern: "top", ordinal: 1 }, { pattern: "full", ordinal: 1 }], ...over }, aiKey)).status).toBe(200);
  expect((await w.api("POST", `/api/z/${eid}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, token)).status).toBe(200);
  w.world.raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(eid);
  let t = 0;
  const now = () => T0 + t;
  const step = (ms = 3000) => { t += ms; w.world.now = now(); };
  const goLive = () => { w.world.now = T0; t = 0; };
  return { w, token, now, step, goLive, T0 };
}
type X = Awaited<ReturnType<typeof setup>>;
const rtFake = (win: any, nowMs: () => number) => {
  const Orig = win.ZG.PhoneRuntime;
  win.ZG.PhoneRuntime = class extends Orig {
    constructor(eid: string, deps: any) {
      const fetcher: Fetcher = async (url) => { const last = url.split("/").pop()!, nowR = roundAt(nowMs()), r = last === "latest" ? nowR : Number(last); if (r > nowR) return { ok: false, status: 404, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" } as Round) }; };
      super(eid, { ...deps, beacon: { fetcher, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: any) => x.signature === "aa", mono: () => deps.mono() });
    }
  };
};
async function phonePage(x: X, eid: string, phone: string) {
  const p = await openPage(x.w.world, { url: `http://localhost/z?e=${eid}`, html: "z.html", scripts: ["audio.js", "zgame.js", "guide.js", "z.js"], afterLoad: (win, f) => { if (f === "zgame.js") { if (!win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; rtFake(win, x.now); } } });
  open.push(p);
  await p.waitFor((t) => /Join the engagement/.test(t));
  (p.$("#ph") as any).value = phone; (p.$("#nm") as any).value = "Asha"; p.click("#go");
  await p.waitFor((t) => /Your ticket|Get ready|Starting in/.test(t), 20_000);
  return p;
}
/** one tick of the page's runtime at the test's clock (the page carries its clock on real time between re-syncs: force one, as pages.test.ts does) */
const tick = async (p: Page) => { const rt = p.win.__rt; rt.syncedAtMono = -Infinity; rt.lastSeatPoll = -Infinity; rt.lastResultPoll = -Infinity; rt.lastVote = -Infinity; await rt.tick(); }; // (its poll timers run on real time too)
/** moves the clock one number at a time until the phone's log holds at least n numbers, then lets the page redraw */
async function untilCalled(x: X, p: Page, n: number) { for (let i = 0; i < 90; i++) { if (p.win.__rt.view().log.length >= n) { await wait(1200); return; } x.step(6000); await tick(p); } throw new Error("the numbers did not come"); }
const ticketNums = (p: Page): number[] => p.win.__rt.tickets.flatMap((tk: any) => tk.flat().filter((v: any) => v !== null));
const cell = (p: Page, n: number) => p.$(`[data-tap="${n}"]`) as any;

describe("the ticket on the phone never marks itself", () => {
  test("the join screen, the waiting room and the number card tell the player to tap and claim; nothing says the ticket marks itself", async () => {
    const x = await setup("RH-TXT");
    const p = await phonePage(x, "RH-TXT", "9822222221");
    const t = p.text();
    expect(t).toMatch(/Tap each number on your ticket as it is called/); expect(t).toMatch(/press Claim before the next number/); expect(t).toMatch(/Bogey/);
    expect(t).not.toMatch(/marks every number for you|marked for you|Just watch/);
    expect(p.errors).toEqual([]);
  });
  test("each number is a button; a tap on a number not called yet is refused in place in plain words and marks nothing; a called number is marked, a second tap unmarks it; the tip is under the big ball", async () => {
    const x = await setup("RH-TAP");
    const p = await phonePage(x, "RH-TAP", "9822222222"); const rt = p.win.__rt; const doc = p.win.document;
    x.goLive(); await untilCalled(x, p, 6);
    const mine0 = ticketNums(p); for (let i = 0; i < 40 && !mine0.some((n) => rt.view().log.includes(n)); i++) { x.step(6000); await tick(p); } await wait(1200); // until one of the ticket's own numbers has been called
    expect(doc.querySelectorAll('.zticket [data-tap][role="button"]').length).toBe(15);
    expect(doc.querySelectorAll(".zticket div.m").length).toBe(0); // numbers called, nothing marked by itself
    expect(p.text()).toMatch(/Tap each number as it is called\. When a prize is complete, press Claim before the next number is called\. A wrong claim is a Bogey: it does not count\./);
    const called = new Set<number>(rt.view().log), mine = ticketNums(p);
    const notYet = mine.find((n) => !called.has(n))!, yes = mine.find((n) => called.has(n))!;
    cell(p, notYet).click(); await wait(50);
    expect(doc.querySelector("#tapnote .ctg-inline")?.textContent).toMatch(new RegExp(`${notYet} has not been called yet\\. Keep listening\\.`)); // the guide's own in-place message
    expect(doc.querySelector("#tapnote .ctg-inline")?.textContent).toMatch(/That number has not been called yet/);
    expect(rt.view().marks).toEqual([]); expect(cell(p, notYet).classList.contains("m")).toBe(false);
    cell(p, yes).click(); await wait(50);
    expect(rt.view().marks).toEqual([yes]); expect(cell(p, yes).classList.contains("m")).toBe(true); expect(cell(p, yes).getAttribute("aria-pressed")).toBe("true");
    expect(doc.querySelector("#tapnote .ctg-inline")).toBeNull(); // a good tap clears the note
    cell(p, yes).click(); await wait(50);
    expect(rt.view().marks).toEqual([]); expect(cell(p, yes).classList.contains("m")).toBe(false);
    expect(p.win.localStorage.getItem("ctz:RH-TAP:marks")).toContain('"marks"'); // kept on the phone
    expect(p.errors).toEqual([]);
  });
  test("a Claim button appears when the marks complete a prize (and not before), the Still-to-win row says so; pressing it sends the claim, the card says it is being checked, then the prize is won and the ribbon shows", async () => {
    const x = await setup("RH-CLM", { rewards: [{ pattern: "early5", ordinal: 1 }, { pattern: "full", ordinal: 1 }] });
    const p = await phonePage(x, "RH-CLM", "9822222223"); const rt = p.win.__rt; const doc = p.win.document;
    x.goLive(); await untilCalled(x, p, 3);
    expect(doc.querySelector("[data-claim]")).toBeNull();
    // the person taps along until Early Five is complete on their marks
    for (let i = 0; i < 85 && !rt.view().claimable.includes("early5"); i++) { x.step(6000); await tick(p); await rt.playAlong({ claim: false }); } // one number per step, the person taps along
    await wait(1200); // the page redraws once a second
    const btn = doc.querySelector('[data-claim="early5"]') as any;
    expect(btn).toBeTruthy(); expect(btn.textContent).toBe("Claim Early Five");
    expect(p.text()).toMatch(/Press Claim before the next number is called\./);
    expect(p.text()).toMatch(/Early Five.*Complete: press Claim/); // the Still-to-win row
    expect(rt.view().marks.length).toBeGreaterThanOrEqual(5); expect(rt.view().pressed).toEqual([]);
    expect((x.w.world.raw.query("SELECT COUNT(*) c FROM claim").get() as any).c).toBe(0); // nothing was sent by itself
    btn.click();
    await p.waitFor((t) => /Claim sent for Early Five/.test(t), 5000);
    expect(rt.view().pressed).toEqual(["early5"]); expect(doc.querySelector('[data-claim="early5"]')).toBeNull();
    expect((x.w.world.raw.query("SELECT pattern, idx FROM claim").get() as any)).toMatchObject({ pattern: "early5" });
    // the next number comes, the claim window closes, the phone reads the claims back and settles: this phone won (it is the only player)
    for (let i = 0; i < 40 && !rt.view().won.length; i++) { x.step(); await tick(p); } await wait(1200);
    expect(rt.view().won.map((w: any) => w.pattern)).toEqual(["early5"]);
    await p.waitFor((t) => /Congratulations! You won Early Five/.test(t), 5000);
    expect(p.text()).toMatch(/Your prizes/);
    expect(p.errors.filter((e) => !/clearRect/.test(e))).toEqual([]); // (the Hurray's confetti canvas is not drawn by this DOM)
  });
  test("a Bogey: a stale mark makes the claim fail with 'Bogey!' in place, the card counts it; the second on the same prize puts the ticket out of it (no button, plain words), another prize stays open", async () => {
    const x = await setup("RH-BOG", { rewards: [{ pattern: "top", ordinal: 1 }, { pattern: "full", ordinal: 1 }] });
    const p = await phonePage(x, "RH-BOG", "9822222224"); const rt = p.win.__rt; const doc = p.win.document;
    x.goLive(); await untilCalled(x, p, 12);
    const called = new Set<number>(rt.view().log), top: number[] = rt.tickets[0][0].filter((v: any) => v !== null);
    const stales = top.filter((n) => !called.has(n));
    if (!stales.length) return; // (the whole top line came in the first dozen numbers: not this ticket's day; the runtime test covers the rule)
    // a stale mark from earlier (the numbers moved after a late pause message): put it in the phone's storage and make the page read it again
    p.win.localStorage.setItem("ctz:RH-BOG:marks", JSON.stringify({ marks: { 1: stales }, pressed: [], bogeys: {} })); rt.loadMarks();
    for (const n of top) if (called.has(n)) cell(p, n).click();
    await wait(1200);
    const btn = doc.querySelector('[data-claim="top"]') as any; expect(btn).toBeTruthy();
    btn.click(); await wait(100);
    expect(doc.querySelector("#tapnote .ctg-inline")?.textContent).toMatch(new RegExp(`Bogey! ${stales[0]} has not been called\\. Unmark it and keep playing\\.`));
    expect(p.text()).toMatch(/Bogeys: Top line 1/);
    expect(rt.view().pressed).toEqual([]); expect((x.w.world.raw.query("SELECT COUNT(*) c FROM claim").get() as any).c).toBe(0);
    expect((x.w.world.raw.query("SELECT COUNT(*) c FROM bogey").get() as any).c).toBe(1); // recorded for every phone
    (doc.querySelector('[data-claim="top"]') as any).click(); await wait(100);
    expect(p.text()).toMatch(/Two Bogeys on Top line: this ticket is out of the Top line prize\. Other prizes are still open to you\./);
    expect(p.text()).toMatch(/Bogeys: Top line 2/);
    expect(doc.querySelector('[data-claim="top"]')).toBeNull(); // the button is gone
    expect(rt.view().outOf).toEqual(["top"]);
    expect(p.text()).toMatch(/Top line.*out \(two Bogeys\)/);
    expect((x.w.world.raw.query("SELECT COUNT(*) c FROM bogey").get() as any).c).toBe(2);
    // the player puts the marks right and plays on: the Full House is still open to them
    for (const n of stales) cell(p, n).click();
    await wait(50); expect(rt.view().marks.every((n: number) => called.has(n))).toBe(true);
    for (let i = 0; i < 90 && !rt.view().claimable.includes("full"); i++) { x.step(6000); await tick(p); await rt.playAlong({ claim: false }); } await wait(1200);
    expect(doc.querySelector('[data-claim="full"]')).toBeTruthy(); expect(doc.querySelector('[data-claim="top"]')).toBeNull();
    expect(p.errors).toEqual([]);
  });
});
