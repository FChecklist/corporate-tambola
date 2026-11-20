// 250x10 game 4 (docs/250x10/RESULTS.md, FINDINGS): a Host who waited 34 rounds (about 100 seconds) before pressing Next could look at the numbers the 32 ALREADY-PUBLISHED beacon rounds would
// give for the next call (27 different numbers), choose the one they wanted and sign a press that names that old round. The store accepted it, because a signed message was only checked
// against ITSELF (`signedAtRound` is whatever the signer writes). A press must name a round that has not been published yet when the store accepts it.
import { describe, expect, test } from "bun:test";
import { NEXT_REFUSALS, publicKeyFromSecret, publishControl, registerKey, readPublished, signControlWithSecret, SAFETY_FAST, type KV, type UnsignedControl } from "../src";
import { hostGameOf } from "../src/game";

const ID = "FRESH-1", SECRET = "11".repeat(32);
const kvOf = (): KV => { const m = new Map<string, string>(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) }; };
const game = hostGameOf({ callMode: "host", startMode: "auto", breaks: [], rounds: 1 }, 1000);
const msg = (seq: number, action: UnsignedControl["action"], at: number, signedAt: number, until?: number) => signControlWithSecret(SECRET, { engagementId: ID, seq, action, atBeaconRound: at, signedAtRound: signedAt, ...(until !== undefined ? { untilRound: until } : {}) });
async function fresh() { const kv = kvOf(); expect((await registerKey(kv, ID, publicKeyFromSecret(SECRET), SAFETY_FAST)).ok).toBe(true); return kv; }

describe("a signed message must name a round that is still in the future when the store accepts it", () => {
  test("an honest press (named round = the round after next) is accepted", async () => {
    const kv = await fresh(); const now = 5000;
    const r = await publishControl(kv, ID, msg(1, "next", now + 2, now), game, now);
    expect(r.ok).toBe(true);
  });
  test("a Host who waited 34 rounds cannot name a round that is already published: refused, and nothing is stored", async () => {
    const kv = await fresh(); const now = 5000;
    expect((await publishControl(kv, ID, msg(1, "next", now - 38, now - 40), game, now - 40)).ok).toBe(true); // the previous press, at its own time
    const late = await publishControl(kv, ID, msg(2, "next", now - 10, now - 12), game, now); // ten rounds in the past: its beacon randomness is public
    expect(late.ok).toBe(false); if (!late.ok) { expect(late.status).toBe(422); expect(late.error).toBe(NEXT_REFUSALS.lead); }
    expect((await readPublished(kv, ID))!.messages).toHaveLength(1);
  });
  test("a press naming the round in progress (its randomness may already be out) is refused; the next one is accepted", async () => {
    const kv = await fresh(); const now = 5000;
    expect((await publishControl(kv, ID, msg(1, "next", now, now - 2), game, now)).ok).toBe(false);
    expect((await publishControl(kv, ID, msg(1, "next", now + 1, now - 1), game, now)).ok).toBe(true);
  });
  test("a Resume dated into the past is refused too (an Organizer could otherwise choose the round the numbers restart from)", async () => {
    const kv = await fresh(); const now = 5000; const auto = hostGameOf({ callMode: "auto", startMode: "auto", breaks: [], rounds: 1 }, 1000);
    expect((await publishControl(kv, ID, msg(1, "pause", now + 20, now), auto, now)).ok).toBe(true);
    const back = await publishControl(kv, ID, msg(2, "resume", now + 25, now + 24), auto, now + 30); // the pause began at now+20; now it is now+30 and this Resume names now+25, a round whose randomness is public
    expect(back.ok).toBe(false);
    expect((await publishControl(kv, ID, msg(2, "resume", now + 41, now + 30), auto, now + 30)).ok).toBe(true);
  });
  test("without a clock the check is off (the older local server and the phones' own replays are unchanged)", async () => {
    const kv = await fresh();
    expect((await publishControl(kv, ID, msg(1, "next", 3, 1), game)).ok).toBe(true);
  });
});
