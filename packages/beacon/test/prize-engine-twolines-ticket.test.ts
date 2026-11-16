// Found by the 100-million smoke test (rule T-15, 2026-11-04, seeds 5444 / 7667 / 40993 of the tambola generator): a per-ticket Two Lines prize ("twolines@1" / "twolines@2")
// was never awarded by the phone's PrizeEngine, because the engine reserved its line bits only for a house whose key is exactly "twolines". The organizer console (settleAll)
// did award it, so phones and console showed different winners. The phone engine must give exactly what settleAll gives.
// FALSIFIED BY: twolines-ticket-bits-dropped (PrizeEngine allocates line bits only for the exact key "twolines")
import { expect, test } from "bun:test";
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { settleAll } from "../src/game";
import { PrizeEngine } from "../src/prize-engine";
import { defaultCfg, type EngagementCfg } from "../src/config";
import { deriveCalls } from "../src";

const rnd = (r: number) => bytesToHex(sha256(new TextEncoder().encode("tl" + r)));
const eid = "TL-ENGINE";
const pids = Array.from({ length: 6 }, (_, i) => `${i + 1}x${(i + 1).toString(16).padStart(12, "0")}`);
const callRounds = Array.from({ length: 90 }, (_, k) => 1000 + k * 3);
const log = deriveCalls(eid, callRounds.map(rnd));
const norm = (x: { pattern: string; ordinal: number; idx: number; pids: string[] }[]) => x.map((s) => `${s.pattern}#${s.ordinal}@${s.idx}:${[...s.pids].sort().join(",")}`).sort();

for (const [name, patterns] of [["Ticket 1 only", ["twolines@1"]], ["Ticket 2 only", ["twolines@2"]], ["both tickets and each ticket at once", ["twolines", "twolines@1", "twolines@2"]]] as const) {
  test(`phone engine awards Two Lines like the whole-log settlement: ${name}`, () => {
    const cfg: EngagementCfg = { ...defaultCfg(), tickets: 2, ties: "share", rewards: patterns.map((p) => ({ pattern: p as never, scope: "ticket" as const, ordinal: 1, text: "" })) };
    const want = settleAll(eid, pids, log, cfg, 1);
    expect(want.length).toBe(patterns.length); // every Two Lines house is won in a full 90-number game
    const e = new PrizeEngine(eid, cfg);
    e.addSeats(pids.map((pid) => ({ pid, countFrom: 0 }))); e.work(10_000);
    log.forEach((n, i) => e.feed(n, callRounds[i]!));
    expect(norm(e.results())).toEqual(norm(want));
  });
}
