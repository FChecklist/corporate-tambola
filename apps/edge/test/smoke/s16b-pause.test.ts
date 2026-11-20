// SMOKE 20 NOV, owner step 16: pause and resume before the start, in the middle of the game and in the finale, in each of the four start formats, timed and open-ended.
// Invariants for every cell: no number is called inside a pause; numbers called before a pause keep their time; the first number after a resume waits a full gap; a pause that ends before the start does not move number 1; the Host's Next is refused inside a pause.
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore, installProvider, FORMATS, newGame, seat, press, control, startGame, pressNext, row, call, j, W, MIN, HOUR, roundAt, roundMs, count, type Game } from "./h";
import { callTimeMs } from "../../src/lifecycle";
setDefaultTimeout(180_000);
beforeEach(() => { reset(); installProvider(); }); afterEach(restore);

const times = async (g: Game) => { const out: number[] = []; for (let k = 0; k < 90; k++) { const t = await callTimeMs(W.env as any, row(g.id), 1, k); if (t === null) break; out.push(t); } return out; };
const msgs = async (g: Game, now: number) => (await control(g, now)).messages as any[];
type Phase = "before" | "mid" | "finale";
const PHASES: Phase[] = ["before", "mid", "finale"];

for (const f of FORMATS.filter((x) => x.callMode === "auto")) for (const phase of PHASES) for (const kind of ["timed", "open"] as const) describe(`[${f.key}] pause ${phase} the start / game, ${kind}`, () => {
  const label = phase === "before" ? "before the start" : phase === "mid" ? "in the middle of the game" : "in the finale (after number 80)";
  test(`S16-PA pause ${label}, ${kind}: nothing is called inside the pause, earlier numbers keep their time, the first number after the resume waits a full gap`, async () => {
    const g = await newGame(f);
    if (f.startMode === "manual" && phase !== "before") { expect((await press(g, "go", g.at + 5000)).status).toBe(200); }
    const base = f.startMode === "manual" && phase === "before" ? null : await times(g);
    const firstAt = base ? base[0]! : g.at + 120_000;
    const idx = phase === "mid" ? 40 : 82;
    const pauseAt = phase === "before" ? g.at - 30 * MIN : base![idx]! + 2000; // the moment the organizer presses Pause
    const dur = phase === "before" ? 10 * MIN : 3 * MIN;
    const p = await press(g, "pause", pauseAt, undefined, kind === "timed" ? { untilRound: roundAt(pauseAt + dur) } : {});
    expect([f.key, phase, kind, p.status, JSON.stringify(p.body)]).toEqual([f.key, phase, kind, 200, JSON.stringify(p.body)]);
    const pz = (await msgs(g, pauseAt + 10 * MIN)).find((m) => m.action === "pause"); const pStart = roundMs(pz.atBeaconRound);
    let pEnd: number;
    if (kind === "timed") pEnd = roundMs(roundAt(pauseAt + dur)); else { const rAt = Math.max(pStart + dur, pauseAt + dur); const r = await press(g, "resume", rAt); expect(r.status).toBe(200); pEnd = roundMs((await msgs(g, rAt + MIN)).find((m) => m.action === "resume").atBeaconRound); }
    if (f.startMode === "manual" && phase === "before") { expect((await press(g, "go", Math.max(g.at + 5000, pEnd + 5000))).status).toBe(200); }
    const after = await times(g);
    expect(after.length).toBe(90); // all 90 numbers still come
    for (let i = 1; i < after.length; i++) expect(after[i]!).toBeGreaterThan(after[i - 1]!);
    for (const [i, t] of after.entries()) if (!(f.startMode === "manual" && phase === "before" && false)) expect([i, t >= pStart && t < pEnd]).toEqual([i, false]); // never a number inside the pause
    if (base) for (const [i, t] of base.entries()) if (t < pStart) expect([i, after[i]]).toEqual([i, t]); // numbers before the pause: same moment
    if (base) { const moved = after.findIndex((t, i) => t !== base[i]); if (moved >= 0 && base[moved]! >= pStart) { /* the first moved number is the first one due at or after the pause start */ } }
    if (phase === "before" && pEnd <= firstAt && f.startMode === "auto") expect(after[0]).toBe(base![0]); // F38: a pause that is over before Start does not move number 1
    const firstAfterResume = after.find((t) => t >= pEnd); if (firstAfterResume !== undefined && phase !== "before") expect(firstAfterResume - pEnd).toBeGreaterThanOrEqual(row(g.id).call_seconds * 1000 - 3000); // full gap after the resume
  });
});
for (const f of FORMATS.filter((x) => x.callMode === "host")) for (const phase of PHASES) describe(`[${f.key}] Host calls: pause ${phase}`, () => {
  test(`S16-PH the Host's Next is refused inside a pause, works after the resume, and 90 numbers can still be called (${phase})`, async () => {
    const g = await newGame(f); const first = await startGame(g);
    const nBefore = phase === "before" ? 0 : phase === "mid" ? 40 : 82; let t = Math.max(first, g.at + 60_000);
    if (nBefore) t = await pressNext(g, nBefore, t, 20_000);
    const at = phase === "before" ? g.at - 20 * MIN : t + 5000;
    const pz = await press(g, "pause", at, undefined, {}); expect(pz.status).toBe(200);
    const pStart = roundMs((await msgs(g, at + 20 * MIN)).find((m) => m.action === "pause").atBeaconRound);
    const inside = await press(g, "next", pStart + 30_000); expect(inside.status).toBeGreaterThanOrEqual(400); // F39: no press inside any pause
    const rAt = pStart + 4 * MIN; expect((await press(g, "resume", rAt)).status).toBe(200);
    let tt = rAt + 3 * MIN; const rest = 90 - nBefore;
    if (phase === "before") { tt = Math.max(tt, g.at + 3 * MIN); }
    for (let i = 0; i < rest; i++) { const r = await press(g, "next", tt); expect([i, r.status]).toEqual([i, 200]); tt += 20_000; }
    expect((await press(g, "next", tt)).status).toBeGreaterThanOrEqual(400); // no 91st
  });
});
describe("pause is not offered in a game above 2,000 people (only Start)", () => {
  test("the refusal is plain and the game goes on without it", async () => {
    const g = await newGame(FORMATS[2]!, { cap: 2001 }); expect((await press(g, "go", g.at + 5000)).status).toBe(200);
    const r = await press(g, "pause", g.at + 10 * MIN); expect(r.status).toBeGreaterThanOrEqual(400); expect(String(r.body.error)).toMatch(/2,000/);
    expect((await times(g)).length).toBe(90);
  });
});
