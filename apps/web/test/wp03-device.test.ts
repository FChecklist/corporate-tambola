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

describe("A15: 'Type it again' is never a dead end, and the check-in red line goes when a box is ticked", () => {
  test("on a personal link the button returns to the number box (needPhone); on an open link to the plain form", () => {
    const src = grab(pub("z.js"), /const againState = \(token\) => [^\n]*;/);
    const f = new Function(`${src}; return againState;`)() as (t: boolean) => any;
    expect(f(true).mode).toBe("needPhone"); expect(f(true).note).toMatch(/Type your mobile number again/); expect(f(false)).toEqual({ mode: "" });
    expect(pub("z.js")).toContain("Object.assign(J, againState(!!TOKEN))"); expect(pub("z.js")).not.toMatch(/J\.busyTries = 0; J\.mode = ""; J\.wid = ""; clearWait\(\); paint\(\); \};/);
  });
  test("ticking 'This name is correct' / 'This mobile number is correct' empties the red check-in line, like typing does", () => {
    const z = pub("z.js"), chk = grab(z, /const chk = \(id, key\) => \{[^\n]*\};/);
    expect(chk).toContain("clearErr()");
    expect(grab(z, /const clearErr = \(\) => \{ CK\.err = ""; const e = \$\("ckerr"\); if \(e\) e\.textContent = ""; \}/)).toBeTruthy();
    // run the real handler against a tiny page: an early Submit left the red line, ticking the box must clear it
    const doc = { ckerr: { textContent: "Before you press Submit: tick \"This name is correct\"." }, ckokn: { checked: true, onchange: null as any } };
    const CK = { err: "Before you press Submit: ..." }, x: any = {}; let synced = 0;
    new Function("$", "x", "CK", "sync", `const clearErr = () => { CK.err = ""; const e = $("ckerr"); if (e) e.textContent = ""; }; ${chk}; chk("ckokn", "okN");`)((id: string) => (doc as any)[id], x, CK, () => synced++);
    doc.ckokn.onchange(); expect(doc.ckerr.textContent).toBe(""); expect(CK.err).toBe(""); expect(x.okN).toBe(true); expect(synced).toBe(1);
  });
});

describe("A18: the welcome-back line names the numbers called while the player was away", () => {
  const src = grab(pub("z.js"), /const awayText = \(secs, missed\) => [^\n]*;/);
  const say = new Function(`${src}; return awayText;`)() as (s: number, m: number[]) => string;
  test("no number missed, a few missed, many missed", () => {
    expect(say(40, [])).toBe("Welcome back. You were away for 40 seconds. No number was called while you were away.");
    expect(say(40, [12, 45, 7])).toContain("Called meanwhile: 12, 45, 7.");
    expect(say(40, [12, 45, 7])).toMatch(/press Claim\.$/);
    const many = say(90, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(many).toContain("9 numbers were called meanwhile; the last 6 were 4, 5, 6, 7, 8, 9."); expect(many).not.toContain("Last 5 numbers called");
  });
  test("the page remembers how many numbers there were when the phone went away, and shows the new ones", () => {
    const z = pub("z.js");
    expect(z).toContain("hiddenLen = rt.view().log.length"); expect(z).toContain("from: hiddenLen"); expect(z).toContain("awayLine(v)");
    expect(z).not.toContain("The numbers called meanwhile are in the Last 5 numbers called");
  });
});

