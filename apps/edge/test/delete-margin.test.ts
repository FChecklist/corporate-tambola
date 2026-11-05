// Deletion margin (audit of D1 to D5, check 6, 3 Nov 2026): the automatic deletion promises "within 24 hours after the game ends" and its job runs 20 hours after the end, so up to
// 3 hours of a late scheduler fit inside the promise. Until the phones confirm the end, the stored end is the SCHEDULED one: in Host mode the latest press plus an hour. A Host game that
// really ended early (every prize awarded) and was not confirmed by phones was therefore wiped about 21 hours after the real end, so a scheduler 3 hours late broke the 24 hours.
// The 20 hours now count from the EARLIER of the stored end and the real end (`realEndMs`) in both deletion checks of the tick and in the shown erasure time. A game still being played has
// no real end, so it keeps the stored end and nothing is wiped while it runs.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HOUR, MIN, W, call, j, join, one, paidGame, reset, restore, roundAt, roundMs } from "./param-harness";
import { cfgOfRow, deleteClockEndMs, endBoundMs, erasureOf, lifecycleTick, PURGE_AFTER_MS, realEndMs } from "../src/lifecycle";
import { keysInPlay, linesFor } from "../../../packages/beacon/src/config";
import { nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";

beforeEach(() => reset());
afterEach(restore);

const ORG_SECRET = "11".repeat(32);
const org = (key: string): Record<string, string> => ({ "x-organizer": key });
const kv = (): KV => ({ get: async (k) => (one("SELECT v FROM kv WHERE k=?", k) as any)?.v ?? null, put: async () => {} });
const row = (id: string) => one("SELECT * FROM engagement WHERE id=?", id);
const people = (id: string) => (one("SELECT COUNT(*) AS n FROM participant WHERE eid=?", id) as any).n as number;
const tick = (now: number) => lifecycleTick(W.env as any, now);
/** Every prize line of the game given the call index it was won at (the last one at `lastIdx`). `skip` leaves that many lines open. (Same helper as erase-real-end.test.ts.) */
function settleAll(id: string, firstIdx: number, lastIdx: number, skip = 0) {
  const cfg = cfgOfRow(row(id));
  const all = keysInPlay(cfg.rewards), keys = all.filter((k) => k !== "unlucky");
  const lines = keys.flatMap((k) => linesFor(cfg.rewards, k).map((l) => ({ k, ordinal: l.ordinal })));
  expect(lines.length).toBeGreaterThan(1);
  lines.slice(0, lines.length - skip).forEach((l, i) => {
    const idx = i === lines.length - 1 ? lastIdx : Math.min(lastIdx, firstIdx + i);
    W.raw.prepare("INSERT OR REPLACE INTO settled(eid,pattern,ordinal,round,idx,pids) VALUES(?,?,?,?,?,?)").run(id, l.k, l.ordinal, 1, idx, JSON.stringify(["1x" + "a".repeat(12)]));
  });
}
/** A Host game (the Host presses for every number) with 3 players: numbers 1 to 10 are pressed; every prize is won by number 9; the 10th press closes the last claim window. Nobody's phone confirms the end. */
async function hostGameEndedByPrizes() {
  const g = await paidGame({ cap: 20, over: { callSeconds: 6, callMode: "host" } });
  for (let i = 1; i <= 3; i++) expect((await join(g.id, i)).status).toBe(200);
  expect((await call("PUT", `/api/z/${g.id}/control/key`, { publicKey: publicKeyFromSecret(ORG_SECRET) }, org(g.key))).status).toBe(200);
  const e = row(g.id), during = roundMs(e.start_round) + 5 * MIN;
  let last = 0;
  for (let i = 0; i < 10; i++) {
    const at = during + i * 12_000, m = signControlWithSecret(ORG_SECRET, nextMessage((await readPublished(kv(), g.id))!, roundAt(at), { action: "next" }));
    expect((await call("POST", `/api/z/${g.id}/control`, { message: m }, {}, at)).status).toBe(200);
    last = at;
    if (i === 8) settleAll(g.id, 4, 8); // every prize is won at index 8; the window of the last one closes at the next press
  }
  return { g, last };
}

describe("Host mode: a game that really ended early is wiped 20 hours after the real end, not 21", () => {
  test("the stored end is the scheduled one (an hour after the last press), the real end is the press that closed the last prize, and the data goes at real end + 20 hours", async () => {
    const { g, last } = await hostGameEndedByPrizes();
    const e = row(g.id), seen = last + 3 * MIN;
    const real = await realEndMs(W.env as any, e, seen), bound = await endBoundMs(W.env as any, e);
    expect(real).not.toBeNull();
    expect(bound - (real as number)).toBeGreaterThan(50 * MIN); // the stored end is about an hour after the real end: this gap used to be added to the 20 hours
    await tick(seen); // stores the scheduled end (no phone confirmed anything)
    expect((one("SELECT end_src FROM life WHERE eid=?", g.id) as any).end_src).toBe("schedule");
    expect(people(g.id)).toBe(3);
    await tick((real as number) + PURGE_AFTER_MS - MIN); // one minute before 20 hours after the real end: nothing is wiped early
    expect(people(g.id)).toBe(3);
    await tick((real as number) + PURGE_AFTER_MS + MIN); // one minute after: gone (the old rule waited for the stored end + 20 hours, about an hour more)
    expect(people(g.id)).toBe(0);
    expect((one("SELECT purged_ms FROM life WHERE eid=?", g.id) as any).purged_ms).not.toBeNull();
    expect((real as number) + PURGE_AFTER_MS + 3 * HOUR).toBeLessThan((real as number) + 24 * HOUR); // a scheduler 3 hours late is still inside the 24 hours
  });
  test("the erasure time shown to the Organizer is real end + 20 hours too, and still the stored end + 20 hours while the game is being played", async () => {
    const { g, last } = await hostGameEndedByPrizes();
    const e = row(g.id), seen = last + 3 * MIN, real = (await realEndMs(W.env as any, e, seen)) as number;
    expect(await erasureOf(W.env as any, e, seen)).toBe(real + PURGE_AFTER_MS);
    const info = await j(await call("GET", `/api/z/${g.id}/info`, undefined, org(g.key), seen));
    expect(info.erasureMs).toBe(real + PURGE_AFTER_MS);
    // still being played (a prize is open): no real end, so the clock keeps the stored end and nothing moves earlier
    W.raw.prepare("DELETE FROM settled WHERE eid=? AND ordinal=(SELECT MAX(ordinal) FROM settled WHERE eid=?)").run(g.id, g.id);
    expect(await realEndMs(W.env as any, e, seen)).toBeNull();
    expect(await deleteClockEndMs(W.env as any, e, 123_456, seen)).toBe(123_456);
    expect(await erasureOf(W.env as any, e, seen)).toBe((await endBoundMs(W.env as any, e)) + PURGE_AFTER_MS);
  });
});

describe("Auto mode: the same rule, and a game that is still running is never wiped early", () => {
  test("every prize awarded at number 56: the data goes 20 hours after the real end, a few minutes before the 90th scheduled number plus 20 hours", async () => {
    const g = await paidGame({ cap: 20, over: { callSeconds: 12 } });
    for (let i = 1; i <= 3; i++) expect((await join(g.id, i)).status).toBe(200);
    const e = row(g.id), callAt = (k: number) => roundMs(e.start_round + 40) + k * 12_000;
    settleAll(g.id, 9, 54);
    const real = callAt(55), bound = await endBoundMs(W.env as any, e);
    expect(await realEndMs(W.env as any, e, real + 3 * MIN)).toBe(real);
    expect(bound - real).toBeGreaterThan(5 * MIN);
    await tick(real + 3 * MIN);
    await tick(real + PURGE_AFTER_MS - MIN);
    expect(people(g.id)).toBe(3);
    await tick(real + PURGE_AFTER_MS + MIN);
    expect(people(g.id)).toBe(0);
  });
  test("a prize still open: the game is running, so nothing is wiped at 20 hours after the point where it would have ended, only at the stored end + 20 hours", async () => {
    const g = await paidGame({ cap: 20, over: { callSeconds: 12 } });
    for (let i = 1; i <= 3; i++) expect((await join(g.id, i)).status).toBe(200);
    const e = row(g.id), callAt = (k: number) => roundMs(e.start_round + 40) + k * 12_000;
    settleAll(g.id, 9, 54, 1); // one prize line still open
    const bound = await endBoundMs(W.env as any, e);
    expect(await realEndMs(W.env as any, e, callAt(56) + 3 * MIN)).toBeNull();
    await tick(callAt(56) + 3 * MIN);
    await tick(callAt(55) + PURGE_AFTER_MS + MIN); // where the real end would have been if the last prize had been won: not a real end, so nothing is wiped
    expect(people(g.id)).toBe(3);
    await tick(bound + PURGE_AFTER_MS + MIN); // the scheduled end + 20 hours, as before
    expect(people(g.id)).toBe(0);
  });
});
