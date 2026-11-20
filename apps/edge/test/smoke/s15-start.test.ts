// SMOKE 20 NOV, owner step 15: the start of the game, in each of the four start formats.
// Start by the clock, start by hand, a console whose clock is wrong, a Start before the time, a game over IST midnight, a game cancelled before it starts, a game nobody starts, a game given up while paused.
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore, provider, installProvider, FORMATS, newGame, seat, joinId, addIds, press, control, info, callLog, runAllNumbers, row, one, q, call, j, W, T, HOUR, MIN, DAY, roundAt, roundMs, startIn, kv, ORG_SECRET, nextMessage, readPublished, signControlWithSecret, count, type Game } from "./h";
import { callTimeMs, lifecycleTick, fullDeleteAt, personalDeleteAt, GENESIS } from "../../src/lifecycle";
setDefaultTimeout(120_000);
beforeEach(() => { reset(); installProvider(); }); afterEach(restore);

const MANUAL = FORMATS.filter((f) => f.startMode === "manual"), AUTO = FORMATS.filter((f) => f.startMode === "auto");
/** a signed button whose signer believes the time is `now + skewSec` */
async function pressSkewed(g: Game, action: "go" | "pause" | "resume" | "next", now: number, skewSec: number) {
  const msg = signControlWithSecret(ORG_SECRET, nextMessage((await readPublished(kv(), g.id))!, roundAt(now + skewSec * 1000), { action } as any));
  const r = await call("POST", `/api/z/${g.id}/control`, { message: msg }, {}, now);
  return { status: r.status, body: await j(r) };
}

describe("S15-A Start press with a console clock that is wrong (beacon unreachable, device clock used)", () => {
  for (const f of MANUAL) for (const skew of [-600, -300, -120, -30, 0, 30, 120, 600]) test(`[${f.key}] console clock ${skew >= 0 ? "+" : ""}${skew} s: Start is refused, or the first number comes after the press and within 3 minutes of it: never before the press, never 10 minutes late`, async () => {
    const g = await newGame(f);
    const now = g.at + 120_000;
    const r = await pressSkewed(g, "go", now, skew);
    const goMsgs = async () => (await control(g, now)).messages.filter((m: any) => m.action === "go");
    if (r.status !== 200) { expect(r.status).toBeGreaterThanOrEqual(400); expect(r.body.error).toBeTruthy(); expect((await goMsgs()).length).toBe(0); return; } // refused: plainly, and nothing started
    const effect = roundMs((await goMsgs())[0].atBeaconRound); // the moment the Start takes effect on every phone
    expect(effect).toBeGreaterThanOrEqual(now); // the Start never takes effect before the press reached the server (numbers cannot be called in the past)
    expect(effect - now).toBeLessThanOrEqual(3 * MIN); // and never minutes after it
  });
});
describe("S15-B Start before the time (manual) and Start in a game that starts by itself", () => {
  for (const f of MANUAL) for (const off of [-3600, -60, -10, -4]) test(`[${f.key}] Start pressed ${-off} s before the time is refused with the plain reason and nothing starts`, async () => {
    const g = await newGame(f); const r = await press(g, "go", g.at + off * 1000);
    expect(r.status).toBeGreaterThanOrEqual(400); expect(String(r.body.error)).toMatch(/cannot be started before its start time/i);
    expect(await callTimeMs(W.env as any, row(g.id), 1, 0)).toBeNull();
    expect((await control(g, g.at + 30_000)).messages.filter((m: any) => m.action === "go").length).toBe(0);
  });
  for (const f of MANUAL) test(`[${f.key}] Start at the time works once; a second Start changes nothing; the first number is called after the press`, async () => {
    const g = await newGame(f); const t = g.at + 5000;
    expect((await press(g, "go", t)).status).toBe(200);
    const eff = (await control(g, t)).messages.find((m: any) => m.action === "go").atBeaconRound; expect(roundMs(eff)).toBeGreaterThanOrEqual(t);
    const again = await press(g, "go", t + 20_000); expect(again.status).toBeGreaterThanOrEqual(400);
    expect((await control(g, t + 30_000)).messages.filter((m: any) => m.action === "go").length).toBe(1);
  });
  for (const f of AUTO) test(`[${f.key}] a game that starts by itself has no Start button: a Start press is refused and the first number still comes at the scheduled time`, async () => {
    const g = await newGame(f); const before = await callTimeMs(W.env as any, row(g.id), 1, 0);
    const r = await press(g, "go", g.at + 60_000); expect(r.status).toBeGreaterThanOrEqual(400); expect(String(r.body.error)).toMatch(/starts by itself/i);
    expect(await callTimeMs(W.env as any, row(g.id), 1, 0)).toBe(before);
    if (f.callMode === "auto") expect(before).toBe(g.at + 120_000); // number 1 two minutes after the scheduled time (the grace the phones are told about)
  });
  for (const f of AUTO) for (const skew of [-3600, -300, -30, 30, 300, 3600]) test(`[${f.key}] the request clock is ${skew} s off: the schedule of the numbers is the same (time comes from the game, not from the caller)`, async () => {
    const g = await newGame(f);
    const a = await j(await call("GET", `/api/z/${g.id}/info`, undefined, {}, g.at - 600_000));
    const b = await j(await call("GET", `/api/z/${g.id}/info`, undefined, {}, g.at - 600_000 + skew * 1000));
    expect([a.startRound, a.startMs ?? null, a.startMode, a.callMode]).toEqual([b.startRound, b.startMs ?? null, b.startMode, b.callMode]);
    expect(await callTimeMs(W.env as any, row(g.id), 1, 0)).toBe(f.callMode === "auto" ? g.at + 120_000 : null);
  });
});
describe("S15-C a game that plays across IST midnight (DST-free)", () => {
  /** a game whose first number is at 23:50 IST of 1 Oct 2026, so the 90 numbers cross 00:00 IST */
  const late = (f: (typeof FORMATS)[number]) => newGame(f, { over: { startRound: roundAt(Date.UTC(2026, 9, 1, 18, 20, 0)) } }).then((g0) => { const e = row(g0.id); return { ...g0, startRound: e.start_round, startMs: roundMs(e.start_round), at: roundMs(e.start_round) } as Game; });
  for (const f of FORMATS) test(`[${f.key}] 23:50 IST start: numbers 1 to 90 are in order across midnight, end after midnight, deletion exactly 20 h after the end, report says the right IST day`, async () => {
    const g = await late(f);
    expect(new Date(g.at + 19_800_000).toISOString().slice(11, 16)).toBe("23:50");
    const last = await runAllNumbers(g);
    const { rounds } = await callLog(g); expect(rounds.length).toBe(90);
    for (let i = 1; i < rounds.length; i++) expect(rounds[i]!).toBeGreaterThan(rounds[i - 1]!);
    const istDay = (ms: number) => new Date(ms + 19_800_000).toISOString().slice(0, 10);
    expect(istDay(roundMs(rounds[89]!))).toBe("2026-10-02"); // really crossed midnight
    await seat(g, 3); await tickLater(g, last);
    const life = one("SELECT end_ms, purged_ms FROM life WHERE eid=?", g.id);
    expect(istDay(life.end_ms)).toBe("2026-10-02");
    await lifecycleTick(W.env as any, life.end_ms + 20 * HOUR - MIN); expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBe(3); // not a minute early
    await lifecycleTick(W.env as any, life.end_ms + 20 * HOUR + MIN); expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBe(0);
  });
});
async function tickLater(g: Game, last: number) { for (let t = last + 4 * MIN, i = 0; i < 6; i++, t += MIN) await lifecycleTick(W.env as any, t); }
describe("S15-C2 the 365-day clock is IST midnight, whatever the server's own time zone is", () => {
  for (const tz of ["UTC", "Asia/Kolkata", "America/New_York", "Europe/London", "Australia/Lord_Howe", "Pacific/Chatham"]) for (const [label, end] of [["23:59:59 IST", Date.UTC(2026, 9, 1, 18, 29, 59)], ["00:00:01 IST", Date.UTC(2026, 9, 1, 18, 30, 1)], ["12:00 IST", Date.UTC(2026, 9, 1, 6, 30, 0)]] as const) test(`end ${label} with the server in ${tz}: everything goes at 00:00 IST after day 365`, () => {
    const old = process.env.TZ; process.env.TZ = tz;
    try {
      const at = fullDeleteAt(end);
      expect(new Date(at + 19_800_000).toISOString().slice(11, 19)).toBe("00:00:00"); // IST midnight
      expect(at - end).toBeGreaterThanOrEqual(365 * DAY); expect(at - end).toBeLessThanOrEqual(366 * DAY);
      expect(at).toBe(fullDeleteAt(end)); expect(personalDeleteAt(end) - end).toBe(20 * HOUR);
    } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
  });
});
describe("S15-D a game cancelled before it starts", () => {
  for (const f of FORMATS) test(`[${f.key}] cancel: nobody can join, no number is ever called, one 'cancelled' mail, no 'started' mail, guest data goes 20 h after the cancel`, async () => {
    const g = await newGame(f); await addIds(g, ["C1", "C2"]); const r1 = await joinId(g, "C1", 1); expect(r1.status).toBe(200);
    const at = T + 30 * MIN;
    const c = await call("POST", `/api/z/${g.id}/cancel`, { confirmations: 3 }, g.h, at); expect(c.status).toBe(200);
    expect((await joinId(g, "C2", 2, {}, at + MIN)).status).toBeGreaterThanOrEqual(400);
    for (let t = g.at; t < g.at + 10 * MIN; t += 2 * MIN) await lifecycleTick(W.env as any, t);
    expect(provider.delivered.filter((m) => /cancel/i.test(m.subject) && m.text.includes(g.id)).length).toBe(1);
    expect(provider.delivered.filter((m) => /\bstarted\b/i.test(m.subject) && !/published/i.test(m.subject)).length).toBe(0);
    await lifecycleTick(W.env as any, at + 20 * HOUR - MIN); expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBe(1);
    await lifecycleTick(W.env as any, at + 20 * HOUR + MIN); expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBe(0);
    expect(count("SELECT COUNT(*) AS c FROM person WHERE eid=?", g.id)).toBe(0);
    expect(provider.delivered.filter((m) => /Your guests' personal data has been deleted/i.test(m.subject) && m.text.includes(g.id)).length).toBe(1);
  });
});
describe("S15-E a manual game that nobody starts", () => {
  for (const f of MANUAL) {
    test(`[${f.key}] nobody presses Start: no number is ever called by the system, the scheduled time passing changes nothing`, async () => {
      const g = await newGame(f); await seat(g, 3);
      for (const t of [g.at + MIN, g.at + HOUR, g.at + 10 * HOUR]) { await lifecycleTick(W.env as any, t); expect(await callTimeMs(W.env as any, row(g.id), 1, 0)).toBeNull(); }
    });
    test.failing(`[${f.key}] OWNER RULE: people's data are deleted within 24 hours of the SCHEDULED time when nobody ever pressed Start (OPEN: the code allows 44 h, LC-4, owner decision)`, async () => {
      const g = await newGame(f); await seat(g, 3);
      await lifecycleTick(W.env as any, g.at + 24 * HOUR);
      expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBe(0);
    });
  }
});
describe("S15-F a game given up part-way", () => {
  for (const f of FORMATS) test(`[${f.key}] paused for good (nobody resumes): the pause ends by itself, the game finishes, nothing is erased early, the data goes 20 h after the real end`, async () => {
    const g = await newGame(f); const pids = await seat(g, 3);
    const first = await callTimeMs(W.env as any, row(g.id), 1, 0).then((x) => x ?? g.at); // manual: needs Start first
    if (f.startMode === "manual") expect((await press(g, "go", g.at + 5000)).status).toBe(200);
    const t = Math.max(first, g.at) + 5 * MIN;
    const p = await press(g, "pause", t, undefined, {}); expect(p.status).toBe(200);
    // nobody resumes; a day passes
    for (const h of [1, 3, 6, 12]) { await lifecycleTick(W.env as any, t + h * HOUR); expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBe(3); } // not erased while the pause could still end
    const life = () => one("SELECT end_ms FROM life WHERE eid=?", g.id);
    await lifecycleTick(W.env as any, t + 12 * HOUR); const end = Number(life()?.end_ms);
    expect(end).toBeGreaterThan(t); // the end moved beyond the pause, it is not "the start + a minute"
    await lifecycleTick(W.env as any, end + 20 * HOUR + 5 * MIN); expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBe(0);
    void pids;
  });
});
