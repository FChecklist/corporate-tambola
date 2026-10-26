// Catching up on past rounds on a network that silently drops the traffic to the beacon's own servers (a company firewall): a blocked server is waited on once, not once per round.
import { describe, expect, test } from "bun:test";
import { RoundStore } from "../src/game";
import type { Fetcher, Round } from "../src";

const BLOCKED = ["https://blocked1.t21.test", "https://blocked2.t21.test", "https://blocked3.t21.test", "https://blocked4.t21.test"];
const RELAY = "https://relay.t21.test/api/beacon";
const round = (r: number): Round => ({ round: r, signature: "aa", randomness: "r" + r });

/** The four direct servers never answer (the wait only ends when the caller aborts); the relay answers at once. `back` lets one of them come back. */
function net() {
  const calls = new Map<string, number>(); const back = new Set<string>();
  const fetcher: Fetcher = (url, init) => {
    const host = BLOCKED.find((b) => url.startsWith(b)) ?? RELAY;
    calls.set(host, (calls.get(host) ?? 0) + 1);
    const r = Number(url.split("/").pop());
    if (host === RELAY || back.has(host)) return Promise.resolve({ ok: true, status: 200, json: async () => round(r) });
    return new Promise((_, rej) => { init?.signal?.addEventListener("abort", () => rej(new Error("blocked"))); });
  };
  const blockedCalls = () => BLOCKED.reduce((n, b) => n + (calls.get(b) ?? 0), 0);
  return { fetcher, calls, back, blockedCalls };
}
const store = (fetcher: Fetcher) => new RoundStore({ fetcher, mirrors: [...BLOCKED, RELAY], timeoutMs: 30 }, () => true);
/** What a phone's tick does: the next 8 missing rounds, each asked for at the same time, mirrors rotated by the round's place in the batch. */
const batch = (s: RoundStore, from: number) => Promise.all(Array.from({ length: 8 }, (_, i) => s.fetchBackfill(from + i, i)));

describe("catching up when the beacon's own servers are blocked", () => {
  test("the first batch finds the blocked servers; the next batches do not ask them at all", async () => {
    const n = net(), s = store(n.fetcher);
    expect((await batch(s, 1000)).every(Boolean)).toBe(true);
    const first = n.blockedCalls();
    expect(first).toBeLessThanOrEqual(16); // a round used to walk all four blocked servers, one after the other: 8 rounds x 4 = 32
    const before = n.blockedCalls();
    expect((await batch(s, 2000)).every(Boolean)).toBe(true);
    expect(n.blockedCalls() - before).toBe(0);
    expect([...Array(8).keys()].every((i) => s.rounds.has(2000 + i))).toBe(true);
  });
  test("a blocked server is left alone for about a whole catch-up, then asked again, and used once it answers", async () => {
    const n = net(), s = store(n.fetcher), B0 = BLOCKED[0]!;
    await batch(s, 1000);
    const asked = n.calls.get(B0) ?? 0;
    expect(asked).toBeGreaterThan(0);
    expect(s.pending()).toBe(0); // only the relay answered: every round went the slow, fully-checked way
    n.back.add(B0); n.back.add(BLOCKED[1]!); // two of them come back
    let from = 2000;
    for (let k = 0; k < 12; k++, from += 8) await batch(s, from); // 96 more rounds: a whole catch-up of 90 does not wait on them again
    expect(n.calls.get(B0) ?? 0).toBe(asked);
    for (let k = 0; k < 10 && (n.calls.get(B0) ?? 0) === asked; k++, from += 8) await batch(s, from);
    expect(n.calls.get(B0) ?? 0).toBeGreaterThan(asked); // asked again after a while ...
    expect(s.pending()).toBeGreaterThan(0); // ... and, answering, it gave two agreeing servers: rounds held at once, signature checked in the background
  });
  test("an ordinary mirror that answers keeps being used", async () => {
    const calls = new Map<string, number>();
    const f: Fetcher = async (url) => { const h = url.split("/")[2]!; calls.set(h, (calls.get(h) ?? 0) + 1); return { ok: true, status: 200, json: async () => round(Number(url.split("/").pop())) }; };
    const s = new RoundStore({ fetcher: f, mirrors: ["https://a.t21.test", "https://b.t21.test", "https://c.t21.test"] }, () => true);
    for (let k = 0; k < 5; k++) await batch(s, 100 + k * 8);
    expect([...calls.values()].every((c) => c > 0)).toBe(true);
    expect(s.rounds.size).toBe(40);
  });
});

describe("no phone clock", () => {
  test("the round store never reads the device clock", async () => {
    const src = await Bun.file(new URL("../src/game.ts", import.meta.url)).text();
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(/Date\.now\s*\(|new Date\s*\(|performance\.now/.test(code)).toBe(false);
  });
});
