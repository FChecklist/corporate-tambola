// Shared helper for the rc/tambola-1.8.5 page tests (test author only). The REAL player page (z.js) runs in a DOM against the REAL Worker code;
// the runtime's view can be overridden per test (window.__patch) so any phase of the game can be drawn at once. Test addresses: demoN@demo-test.invalid only.
import { expect } from "bun:test";
import { createHash } from "node:crypto";
import { newWorld, openPage, roundAt, T, GEN, type Page } from "../harness";
import { type Fetcher, type Round } from "../../../../packages/beacon/src";

export { roundAt, GEN, T };
export const START = roundAt(T) + 1200; // one hour after T (organizer() default)
export const NEW_AT = Date.UTC(2026, 10, 5, 10, 0, 0); // after the check-in date and after EMP_CLEAN_FROM_MS: a game made now has check-in and the uniform employee-ID rule
export const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
export const roundMs = (r: number) => (GEN + (r - 1) * 3) * 1000;

export async function organizer(at = T) {
  const w = newWorld(); w.world.now = at;
  const s = await w.json(await w.api("POST", "/api/start", { email: "demo1@demo-test.invalid" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string };
}
export type O = Awaited<ReturnType<typeof organizer>>;
export async function published(o: O, id: string, set: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  expect((await o.api("POST", "/api/z", { id, startRound: roundAt(o.world.now) + 1200, callSeconds: 9, cap: 100, ...over }, o.aiKey)).status).toBe(200); // starts one hour after the organizer\'s clock
  if (Object.keys(set).length) expect((await o.api("PATCH", `/api/z/${id}/settings`, set, o.token)).status).toBe(200);
  expect((await o.api("POST", `/api/z/${id}/publish`, { email: "demo1@demo-test.invalid", phone: "98765 43210" }, o.token)).status).toBe(200);
}
const fakeBeacon = (nowMs: () => number) => { const fetcher: Fetcher = async (url) => { const last = url.split("/").pop()!, nowR = roundAt(nowMs()), r = last === "latest" ? nowR : Number(last); if (r > nowR) return { ok: false, status: 404, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" } as Round) }; }; return { fetcher, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }; };

/** The phone page for `url`. `win.__patch` (an object) is merged over the runtime's view at every draw; set it before or after the page starts. */
export async function phone(o: O, url: string, opts: { patch?: Record<string, unknown>; session?: Record<string, string>; pre?: (win: any) => void } = {}): Promise<Page> {
  return openPage(o.world, {
    url: "http://localhost" + url, html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], session: opts.session,
    afterLoad: (win: any, f: string) => {
      if (f === "audio.js") { win.__patch = opts.patch ?? null; opts.pre?.(win); }
      if (f === "zgame.js") {
        const Orig = win.ZG.PhoneRuntime;
        win.ZG.PhoneRuntime = class extends Orig {
          constructor(eid: string, deps: any) {
            super(eid, { ...deps, beacon: fakeBeacon(() => o.world.now), verify: (x: any) => x.signature === "aa", mono: () => deps.mono() });
          }
          view() { const v = super.view(); return win.__patch ? { ...v, ...win.__patch } : v; }
        };
      }
    },
  });
}
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const setVal = (p: Page, sel: string, v: string) => { const el = p.$(sel) as any; el.value = v; el.dispatchEvent(new p.win.Event("input", { bubbles: true })); };

// ---- fabricated view pieces ----
export const grid = (b: number) => [0, 1, 2].map((r) => Array.from({ length: 9 }, (_, c) => (c % 2 === r % 2 ? b + r * 9 + c : null)));
export const REWARDS7 = ["early5", "top", "mid", "bot", "corners", "star", "full"].map((pattern) => ({ pattern, scope: "ticket", ordinal: 1, text: "" }));
export const REWARDS1 = [{ pattern: "full", scope: "ticket", ordinal: 1, text: "" }];
export const REWARDS5 = ["early5", "top", "mid", "bot", "full"].map((pattern) => ({ pattern, scope: "ticket", ordinal: 1, text: "" }));
export const LOG = Array.from({ length: 30 }, (_, i) => i + 1);
export const CALL_S = 6;
/** When a fabricated ended view (scheduledRound R, log LOG, callSeconds CALL_S) ended, in ms: the page computes it the same way. */
export const SCHED = START;
export const endMs = (log = LOG, cs = CALL_S, sched = SCHED) => roundMs(sched) + log.length * cs * 1000;
export function endedView(over: Record<string, unknown> = {}) {
  return {
    phase: "ended", pid: "p1", scheduledRound: SCHED, callSeconds: CALL_S, log: LOG, tickets: [grid(1)], round: 1, rounds: 1,
    cfg: { tickets: 1, ties: "next", rewards: REWARDS7, breaks: [], rounds: 1 }, results: [], won: [], lucky: [],
    claimNow: [], claimOpen: [], claimable: [], pressed: [], claimed: [], paused: false, locked: false, stopped: false, endedByPrizes: false, late: null,
    mode: "hold", nowRound: SCHED + 100, brk: null, intermission: null, marks: [], error: "", ...over,
  };
}
export function playView(over: Record<string, unknown> = {}) { return endedView({ phase: "play", log: LOG.slice(0, 6), nextCallInSec: 5, ...over }); }

/** A real participant of the game (joined through the Worker), so the page's "is this ticket still mine?" check passes. Same phone = same pid. */
export async function realPid(o: O, id: string, phoneNo = "9812345678"): Promise<string> {
  const r = await o.api("POST", `/api/z/${id}/join`, { phone: phoneNo, name: "Asha", device: "0a" + "b".repeat(30) });
  const b = await o.json(r); if (!b.pid) throw new Error("test setup: join failed " + JSON.stringify(b)); return b.pid;
}
