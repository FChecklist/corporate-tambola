// D5 / D5b (live test, 3 Nov 2026): the Organizer's "delete the participants' data now" was refused ("The game is being played right now") for minutes after an Auto game had
// ended early because every prize was won (the refusal waited for the 90th scheduled number plus a minute), and for up to an hour after a Host game had ended (the refusal
// waited for the Host's last press plus an hour). The erase now follows the REAL end: every prize awarded, the organizer's Stop or the phones' confirmed end. A game that is
// genuinely still being played is still refused, so nobody's ticket disappears mid-game. (Participant data is deleted within 24 hours; the Organizer may delete it sooner.)
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join as pathJoin } from "node:path";
import { HOUR, MIN, W, call, j, join, one, paidGame, reset, restore, roundAt, roundMs } from "./param-harness";
import { cfgOfRow, endBoundMs, realEndMs } from "../src/lifecycle";
import { keysInPlay, linesFor } from "../../../packages/beacon/src/config";
import { nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";

beforeEach(() => reset());
afterEach(restore);

const ORG_SECRET = "11".repeat(32);
const org = (key: string): Record<string, string> => ({ "x-organizer": key });
const kv = (): KV => ({ get: async (k) => (one("SELECT v FROM kv WHERE k=?", k) as any)?.v ?? null, put: async () => {} });
const row = (id: string) => one("SELECT * FROM engagement WHERE id=?", id);
const people = (id: string) => (one("SELECT COUNT(*) AS n FROM participant WHERE eid=?", id) as any).n as number;
const erase = (id: string, key: string, now: number) => call("POST", `/api/z/${id}/erase`, {}, org(key), now);
/** Every prize line of the game, in order, given the call index it was won at (the last one at `lastIdx`). `skip` leaves that many lines open. */
function settleAll(id: string, firstIdx: number, lastIdx: number, skip = 0) {
  const cfg = cfgOfRow(row(id));
  const all = keysInPlay(cfg.rewards), keys = all.filter((k) => k !== "unlucky");
  const lines = keys.flatMap((k) => linesFor(cfg.rewards, k).map((l) => ({ k, ordinal: l.ordinal })));
  expect(lines.length).toBeGreaterThan(1);
  const take = lines.slice(0, lines.length - skip);
  take.forEach((l, i) => {
    const idx = i === lines.length - 1 ? lastIdx : Math.min(lastIdx, firstIdx + i);
    W.raw.prepare("INSERT OR REPLACE INTO settled(eid,pattern,ordinal,round,idx,pids) VALUES(?,?,?,?,?,?)").run(id, l.k, l.ordinal, 1, idx, JSON.stringify(["1x" + "a".repeat(12)]));
  });
  return lines.length;
}

describe("D5: Auto mode, the game ends early because every prize was won", () => {
  test("erase works 3 minutes after the real end, long before the 90th scheduled number; a game still being played is refused", async () => {
    const g = await paidGame({ cap: 20, over: { callSeconds: 12 } });
    for (let i = 1; i <= 3; i++) expect((await join(g.id, i)).status).toBe(200);
    const e = row(g.id), start = roundMs(e.start_round);
    const firstCall = roundMs(e.start_round + 40); // the first number comes after the 2-minute grace
    const callAt = (k: number) => firstCall + k * 12_000;
    const bound = await endBoundMs(W.env as any, e);
    expect(bound).toBe(callAt(89) + 60_000); // the old refusal lasted until here: the 90th number plus a minute
    // still being played: every prize but one is won (the 250-person game: the last prize, Full House, came at number 55)
    settleAll(g.id, 9, 54, 1);
    const running = await erase(g.id, g.key, callAt(56) + 3 * MIN);
    expect(running.status).toBe(409); expect((await j(running)).code).toBe("game-running");
    expect((await j(await call("GET", `/api/z/${g.id}/info`, undefined, org(g.key), callAt(56) + 3 * MIN))).endedAtMs).toBeUndefined();
    expect(people(g.id)).toBe(3);
    expect(await realEndMs(W.env as any, e, callAt(56) + 3 * MIN)).toBeNull();
    // every prize won (Full House at index 54): the phones stop at the next number, index 55
    settleAll(g.id, 9, 54);
    expect(await realEndMs(W.env as any, e, callAt(55) - 1000)).toBeNull(); // the claim window of the last prize is still open
    expect(await realEndMs(W.env as any, e, callAt(55) + 3 * MIN)).toBe(callAt(55));
    const now = callAt(55) + 3 * MIN; // 3 minutes after the game ended
    expect(now).toBeLessThan(bound); // ... which the old code still called "being played"
    // the game's public facts say it has ended, at the real end, so the Organizer's console does not warn "your game is still running" before the delete
    expect((await j(await call("GET", `/api/z/${g.id}/info`, undefined, org(g.key), now))).endedAtMs).toBe(callAt(55));
    expect(readFileSync(pathJoin(import.meta.dir, "../../web/public/zc.js"), "utf8")).toContain('endMs && nowMs < endMs && !(S.info && Number(S.info.endedAtMs) > 0) ? "YOUR GAME IS STILL RUNNING.');
    const ok = await erase(g.id, g.key, now);
    expect(ok.status).toBe(200); expect((await j(ok)).erased).toBe(3);
    expect(people(g.id)).toBe(0);
    expect(start).toBeLessThan(now);
  });
  test("an Organizer who chose to keep calling after the prizes: the game goes on, so the erase still waits for the last number", async () => {
    const g = await paidGame({ cap: 20, over: { callSeconds: 12, afterPrizes: "keep" } });
    expect((await join(g.id, 1)).status).toBe(200);
    const e = row(g.id), callAt = (k: number) => roundMs(e.start_round + 40) + k * 12_000;
    settleAll(g.id, 9, 54);
    expect((await erase(g.id, g.key, callAt(55) + 3 * MIN)).status).toBe(409);
    expect((await erase(g.id, g.key, (await endBoundMs(W.env as any, e)) + 1000)).status).toBe(200);
  });
  test("the phones confirmed the end: the erase works from that moment", async () => {
    const g = await paidGame({ cap: 20, over: { callSeconds: 12 } });
    expect((await join(g.id, 1)).status).toBe(200);
    const e = row(g.id), callAt = (k: number) => roundMs(e.start_round + 40) + k * 12_000;
    expect((await erase(g.id, g.key, callAt(40))).status).toBe(409);
    W.raw.prepare("INSERT INTO life(eid,end_ms,end_src) VALUES(?,?,'phones') ON CONFLICT(eid) DO UPDATE SET end_ms=excluded.end_ms, end_src='phones'").run(g.id, callAt(40) + 5000); // what three phones' "over" reports write (lifecycle.ts acceptOver)
    expect((await erase(g.id, g.key, callAt(40) + 1000)).status).toBe(409); // not before the end they confirmed
    expect((await erase(g.id, g.key, callAt(40) + 6000)).status).toBe(200);
  });
});

describe("D5b: Host mode, the Host presses for every number", () => {
  test("erase works 3 minutes after the press that ended the game, not an hour later; while a prize is still open it is refused", async () => {
    const g = await paidGame({ cap: 20, over: { callSeconds: 6, callMode: "host" } });
    for (let i = 1; i <= 3; i++) expect((await join(g.id, i)).status).toBe(200);
    expect((await call("PUT", `/api/z/${g.id}/control/key`, { publicKey: publicKeyFromSecret(ORG_SECRET) }, org(g.key))).status).toBe(200);
    const e = row(g.id), during = roundMs(e.start_round) + 5 * MIN;
    const press = async (i: number) => {
      const at = during + i * 12_000;
      const m = signControlWithSecret(ORG_SECRET, nextMessage((await readPublished(kv(), g.id))!, roundAt(at), { action: "next" }));
      const r = await call("POST", `/api/z/${g.id}/control`, { message: m }, {}, at);
      expect(r.status).toBe(200);
      return at;
    };
    let last = 0;
    for (let i = 0; i < 9; i++) last = await press(i); // numbers 1 to 9 (index 0 to 8)
    // every prize but one is won by index 8: the game is still on
    settleAll(g.id, 4, 8, 1);
    const r1 = await erase(g.id, g.key, last + 3 * MIN);
    expect(r1.status).toBe(409); expect((await j(r1)).code).toBe("game-running");
    // the last prize is won at index 8 too, but its claim window stays open until the Host presses for the next number
    settleAll(g.id, 4, 8);
    expect((await erase(g.id, g.key, last + 3 * MIN + 1000)).status).toBe(409);
    expect(people(g.id)).toBe(3);
    last = await press(9); // the 10th number closes the window: every phone ends the game here
    const now = last + 3 * MIN;
    expect(now).toBeLessThan(await endBoundMs(W.env as any, row(g.id))); // the old refusal: the last press plus an hour
    expect(await endBoundMs(W.env as any, row(g.id))).toBeGreaterThanOrEqual(last + HOUR - 60_000);
    const ok = await erase(g.id, g.key, now);
    expect(ok.status).toBe(200); expect((await j(ok)).erased).toBe(3);
    expect(people(g.id)).toBe(0);
  });
});
