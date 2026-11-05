// The organizer's console helper (control-browser.ts, shipped as apps/web/public/control.js): how it picks the beacon round for a press, and how it numbers the press.
// The browser's key store (IndexedDB) and the network are replaced by small fakes; the code under test is the real helper.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { publicKeyFromSecret } from "../src/control";
import * as CB from "../src/control-browser";

const KEY = "11".repeat(32), EID = "CB-TEST-1", PUB = publicKeyFromSecret(KEY);
const G = globalThis as any;
const TB = () => G.TBControl;
const TIMED_OUT = Symbol("timed out");
/** Resolves with the promise's value, or TIMED_OUT when it has not finished in `ms` (a press that never finishes must fail the test, not hang it). */
const within = <T,>(p: Promise<T>, ms = 1500) => Promise.race([p, new Promise<typeof TIMED_OUT>((r) => setTimeout(() => r(TIMED_OUT), ms))]);

/** The browser's key store with one key: the organizer's. */
function fakeIndexedDB(keys: Map<string, unknown>) {
  const db = { createObjectStore() {}, transaction: () => ({ objectStore: () => ({
    get: (k: string) => { const q: any = {}; queueMicrotask(() => { q.result = keys.get(k); q.onsuccess?.(); }); return q; },
    put: (v: unknown, k: string) => { const q: any = {}; queueMicrotask(() => { keys.set(k, v); q.onsuccess?.(); }); return q; },
  }) }) };
  return { open: () => { const r: any = { result: db }; queueMicrotask(() => { r.onupgradeneeded?.(); r.onsuccess?.(); }); return r; } };
}
/** A network that silently drops the traffic: nothing comes back, the wait only ends when the caller aborts. */
const hang = (init?: RequestInit) => new Promise<Response>((_, rej) => { init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))); });
const ok = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
const fileWith = (messages: unknown[]) => ({ v: 1, engagementId: EID, pubKey: PUB, maxPauseRounds: 600, leadRounds: 12, messages });
const RELAY = "https://corporatetambola.com/api/beacon/";

let realFetch: typeof fetch;
beforeEach(() => {
  realFetch = G.fetch;
  G.indexedDB = fakeIndexedDB(new Map([[EID, { publicKeyHex: PUB, secretHex: KEY }]]));
  G.location = { protocol: "https:", origin: "https://corporatetambola.com" };
});
afterEach(() => { G.fetch = realFetch; delete G.indexedDB; delete G.location; });

describe("the beacon round for a press: a network that drops the beacon's servers must not hold the press", () => {
  test("our own server answers while the beacon's four servers never do: the press is signed at once, stamped with that round", async () => {
    G.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/control")) return ok(fileWith([]));
      if (url.startsWith(RELAY)) return ok({ round: 123456 });
      return hang(init); // api.drand.sh, api2, api3, drand.cloudflare.com
    }) as any;
    const m: any = await within(TB().sign(EID, { token: "t", prefix: "/api/z" }, "pause"));
    expect(m).not.toBe(TIMED_OUT);
    expect(m.signedAtRound).toBe(123456);
  });
  test("every address is asked at once and the first good answer wins (an error, a page that is not a round and a silent server do not matter)", async () => {
    const asked: string[] = [];
    G.fetch = (async (url: string, init?: RequestInit) => {
      asked.push(url);
      if (url.startsWith(RELAY)) return new Response("busy", { status: 502 });
      if (url.startsWith("https://api.drand.sh")) return ok({ round: "not a number" });
      if (url.startsWith("https://api2.drand.sh")) return hang(init);
      if (url.startsWith("https://api3.drand.sh")) return ok({ round: 777 });
      return hang(init);
    }) as any;
    const p = CB.beaconRound(500);
    await Promise.resolve();
    expect(asked.length).toBe(5); // nobody waits for a slower address before the next is asked
    expect(await within(p)).toBe(777);
  });
  test("an address that answers its headers but never finishes the body is given up on too", async () => {
    G.fetch = (async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })) as any;
    const t = Math.floor((Date.now() / 1000 - 1692803367) / 3) + 1;
    const r = await within(CB.beaconRound(40));
    expect(r).not.toBe(TIMED_OUT);
    expect(Math.abs((r as number) - t)).toBeLessThanOrEqual(3); // nothing answered: the beacon's own schedule worked out from the clock, as a last resort
  });
  test("when nothing answers, each wait is bounded by the given time and every silent fetch is aborted", async () => {
    const signals: (AbortSignal | undefined)[] = [];
    G.fetch = ((url: string, init?: RequestInit) => { signals.push(init?.signal ?? undefined); return hang(init); }) as any;
    const r = await within(CB.beaconRound(40));
    expect(r).not.toBe(TIMED_OUT);
    expect(signals.length).toBe(5);
    expect(signals.every((s) => s?.aborted === true)).toBe(true);
  });
  test("a fetch that ignores the abort is still given up on", async () => {
    G.fetch = (() => new Promise(() => {})) as any;
    expect(await within(CB.beaconRound(40))).not.toBe(TIMED_OUT);
  });
  test("the device clock is read only when no address answered", async () => {
    G.fetch = (async (url: string) => (url.startsWith(RELAY) ? ok({ round: 4242 }) : new Response("no", { status: 500 }))) as any;
    const real = Date.now; let reads = 0; Date.now = () => { reads++; return real(); };
    try { expect(await within(CB.beaconRound(500))).toBe(4242); } finally { Date.now = real; }
    expect(reads).toBe(0);
  });
});

describe("numbering a press: the sequence number comes from the newest copy of the pause file", () => {
  /** Two copies of the pause file, as the server serves them: a plain read is the shared copy up to a second old (before the last press), a read with a sign-in header is the live one. */
  function server() {
    const asked: { url: string; auth: string | null }[] = [];
    const prev = { engagementId: EID, seq: 1, action: "pause", atBeaconRound: 100, signedAtRound: 88, sig: "00".repeat(64) };
    G.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/control")) {
        const auth = new Headers(init?.headers as any).get("authorization");
        asked.push({ url, auth });
        return ok(auth || new Headers(init?.headers as any).get("x-organizer") ? fileWith([prev]) : fileWith([])); // the stale copy is what an unauthenticated read gets
      }
      return ok({ round: 5000 }); // the beacon answers everywhere here: only the numbering is under test
    }) as any;
    return asked;
  }
  test("a press right after another is numbered from the live file, not the shared copy (no 'sequence number already used')", async () => {
    const asked = server();
    const m: any = await within(TB().sign(EID, { token: "tok", prefix: "/api/z" }, "stop"));
    expect(m).not.toBe(TIMED_OUT);
    expect(m.seq).toBe(2);
    expect(asked[0]!.auth).toBe("Bearer tok");
  });
  test("the confirm page (no token of its own) is numbered from the live file too", async () => {
    server();
    const m: any = await within(TB().sign(EID, { token: "" }, "stop"));
    expect(m).not.toBe(TIMED_OUT);
    expect(m.seq).toBe(2);
  });
});
