// Found by the 100-game campaign (case 16, 2026-10-24): a claim that reached the store a moment AFTER the next number was due was judged "late" by phones that already had that number
// and "in time" by phones whose log was still one call behind, so phones (and the store) showed different winners and different counts. Every phone must judge a claim by the same
// deadline: the clock schedule's round of the next call, whether or not this phone's log has reached that call yet.
import { describe, expect, test } from "bun:test";
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { completionIndexKey, ticketsFor, type PublicClaim } from "../src/game";
import { PrizeEngine } from "../src/prize-engine";
import { defaultCfg, type EngagementCfg, type PatternKey } from "../src/config";
import { deriveCalls, roundTimeMs } from "../src";

const rnd = (r: number) => bytesToHex(sha256(new TextEncoder().encode("fake" + r)));
const eid = "CD-ENGINE";
const pids = Array.from({ length: 12 }, (_, i) => `${i + 1}x${(i + 1).toString(16).padStart(12, "0")}`);
const callRounds = Array.from({ length: 90 }, (_, k) => 1000 + k * 3); // a call every 9 s
const log = deriveCalls(eid, callRounds.map((r) => rnd(r)));
const cfg: EngagementCfg = { ...defaultCfg(), ties: "next", rewards: [{ pattern: "top", scope: "ticket", ordinal: 1, text: "" }, { pattern: "top", scope: "ticket", ordinal: 2, text: "" }] };
const doneAt = (pid: string, key: PatternKey) => completionIndexKey(ticketsFor(eid, pid, 1), key, log);
const engine = (claims: PublicClaim[], upto: number, withSchedule: boolean) => {
  const e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); e.work(10_000); e.setClaims(claims);
  if (withSchedule) e.setCallRound((k) => callRounds[k] ?? null);
  for (let k = 0; k < upto; k++) e.feed(log[k]!, callRounds[k]!, rnd(callRounds[k]!));
  return e;
};
const key = (e: PrizeEngine) => e.results().map((x) => `${x.pattern}#${x.ordinal}@${x.idx}:${[...x.pids].sort().join("+")}`).sort();

describe("every phone judges a claim by the same deadline", () => {
  const completers = pids.map((pid) => ({ pid, idx: doneAt(pid, "top") })).filter((x) => x.idx >= 0).sort((a, b) => a.idx - b.idx);
  const first = completers[0]!, second = completers.find((x) => x.idx > first.idx)!;
  const claim = (c: { pid: string; idx: number }, atMs: number): PublicClaim => ({ pid: c.pid, pattern: "top", round: 1, idx: c.idx, atMs });
  // the first completer claims 0.4 s AFTER the next call was due (late); the second claims in good time
  const late = claim(first, roundTimeMs(callRounds[first.idx + 1]!) + 400), ok = claim(second, roundTimeMs(callRounds[second.idx + 1]!) - 2000);

  test("a phone that has the next call and a phone that is one call behind agree: the late claim does not win (nobody else claimed)", () => {
    const upToNext = engine([late], first.idx + 2, true), oneBehind = engine([late], first.idx + 1, true);
    expect(key(oneBehind)).toEqual(key(upToNext));
    expect(key(upToNext)).toEqual([]);
  });
  test("with a later claim in time, both phones give the first position to that claimant", () => {
    const upTo = engine([late, ok], second.idx + 2, true), behind = engine([late, ok], second.idx + 1, true);
    expect(key(behind)).toEqual(key(upTo));
    expect(upTo.results().find((x) => x.ordinal === 1)!.pids).toEqual([second.pid]);
  });
  test("without the schedule the phone that was one call behind used to call the late claim in time (the old behaviour, kept only for callers that give no schedule)", () => {
    const oneBehind = engine([late, ok], first.idx + 1, false);
    expect(oneBehind.results().find((x) => x.ordinal === 1)!.pids).toEqual([first.pid]);
  });
  test("a call that cannot be told yet (no schedule answer) leaves the window open", () => {
    const e = new PrizeEngine(eid, cfg); e.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); e.work(10_000); e.setClaims([late]); e.setCallRound(() => null);
    for (let k = 0; k <= first.idx; k++) e.feed(log[k]!, callRounds[k]!, rnd(callRounds[k]!));
    expect(e.results().find((x) => x.ordinal === 1)!.pids).toEqual([first.pid]);
  });
});
