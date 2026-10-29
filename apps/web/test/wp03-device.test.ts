// WP-03 (gap plan 2026-10-29): player device reality. TA08 + A15: the screen stays on from check-in to the end of the game, including a pause.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const pub = (f: string) => readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8");
const grab = (src: string, re: RegExp) => { const m = src.match(re); expect(m).toBeTruthy(); return m![0]; };

describe("TA08: the wake lock is held through check-in and through a pause", () => {
  const src = grab(pub("z.js"), /const wantAwake = \(v, o\) => [^\n]*;/);
  const want = new Function(`${src}; return wantAwake;`)() as (v: any, o: any) => boolean;
  const base = { phase: "play", locked: false, paused: false, stopped: false, log: [1, 2], nextCallInSec: 5 };
  const ctx = { dns: false, cancelled: false, removed: false, checkinWaiting: false, graceSecs: 30 };
  test("while numbers are being called the screen is held", () => { expect(want(base, ctx)).toBe(true); });
  test("a pause does NOT let go of the screen (the numbers come back after the break)", () => { expect(want({ ...base, paused: true }, ctx)).toBe(true); });
  test("a person waiting to check in, or checking in, keeps the screen on", () => {
    expect(want({ ...base, log: [], nextCallInSec: 900 }, { ...ctx, checkinWaiting: true })).toBe(true);
    expect(want({ ...base, log: [], nextCallInSec: 900 }, ctx)).toBe(false); // no check-in and the first number is far away: nothing is held yet
  });
  test("a game that is over, stopped, cancelled, not started or a removed ticket lets the screen go", () => {
    expect(want({ ...base, stopped: true }, ctx)).toBe(false);
    expect(want({ ...base, locked: true }, ctx)).toBe(false);
    expect(want({ ...base, phase: "ended" }, ctx)).toBe(false);
    expect(want(base, { ...ctx, cancelled: true })).toBe(false);
    expect(want(base, { ...ctx, dns: true })).toBe(false);
    expect(want(base, { ...ctx, removed: true })).toBe(false);
    expect(want(base, { ...ctx, checkinWaiting: true, removed: true })).toBe(false);
  });
  test("the page uses it, and says in one line to keep the screen on", () => {
    const z = pub("z.js");
    expect(z).toContain("wantAwake(v,"); expect(z).not.toMatch(/awake = v\.phase === "play"/);
    expect(z).toMatch(/const KEEPON = "Tip: keep this screen on, and turn on Do Not Disturb/);
    expect(z.split("esc(KEEPON)").length - 1).toBe(3); // the check-in wait, the check-in form and the ticket page (which is also what a pause shows)
  });
});
