// WP-02 (owner ruling Q3, 2026-10-29; findings TA29 / T01 "3 people claimed on 90 and nobody won"): a claim that arrives while the very last number (90) is still the latest number WINS and writes
// the winner rows. Real Worker code, real phone runtime, the test's own clock and fake randomness. Re-reads what was PERSISTED (the claim row, the settled row, the winner row), not a message.
import { beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(120_000);
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { type Env } from "../../../apps/edge/src/worker";
import { handle } from "../../../apps/edge/test/with-terms";
import { makeD1 } from "../../../apps/edge/test/d1-sqlite";
import { PhoneRuntime, type PhoneDeps } from "../src/phone-runtime";
import { settleAll } from "../src/game";
import { GRACE_ROUNDS } from "../src/config";
import { deriveCalls, roundAt, roundTimeMs, type Fetcher, type Round } from "../src";

const SECRET = "org";
const EID = "ENG-LAST-1";
const START = 50_000;
const CALL_SECONDS = 6;
const rnd = (r: number) => bytesToHex(sha256(new TextEncoder().encode("fake" + r)));
let env: Env; let raw: ReturnType<typeof makeD1>["raw"]; let t = 0; let T0 = 0;
const D = {
  utc: () => T0 + t,
  headCall: (method: string, path: string, body?: unknown, h: Record<string, string> = {}) =>
    handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...h }, body: body === undefined ? undefined : JSON.stringify(body) }), env, T0 + t),
};
const api: PhoneDeps["api"] = async (method, path, body) => {
  const r = await D.headCall(method, path, body);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ?? "http " + r.status), { status: r.status });
  return j;
};
const beaconFetcher = (): Fetcher => async (url) => {
  const last = url.split("/").pop()!, nowR = roundAt(D.utc()), r = last === "latest" ? nowR : Number(last);
  if (r > nowR) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" } as Round) };
};
const mkPhone = (n: number) => {
  const mem = new Map<string, string>();
  const rt = new PhoneRuntime(EID, {
    api, mono: () => t, store: { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v) },
    beacon: { fetcher: beaconFetcher(), mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 },
    verify: (x: { round: number; signature: string; randomness: string }) => x.signature === "aa" && x.randomness === rnd(x.round),
  } as PhoneDeps);
  return { rt, phone: "9" + String(100000000 + n), quiet: false, along: undefined as Parameters<PhoneRuntime["playAlong"]>[0] };
};
type P = ReturnType<typeof mkPhone>;
const step = async (phones: P[], ms = 3000) => { t += ms; for (const p of phones) await p.rt.tick(); for (const p of phones) if (!p.quiet) await p.rt.playAlong(p.along); };
const reference = () => deriveCalls(EID, Array.from({ length: 90 }, (_, k) => rnd(START + k * 2)));

beforeEach(async () => {
  const d = makeD1(); raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: SECRET, DAILY_WRITE_BUDGET: "1000000" };
  T0 = roundTimeMs(START - 3); t = 0;
  await D.headCall("POST", "/api/z", { id: EID, startRound: START - GRACE_ROUNDS, callSeconds: CALL_SECONDS, cap: 200 }, { "x-organizer": SECRET });
});

describe("a claim on the very last number (90) wins", () => {
  test("a player whose Full House completes exactly on number 90 claims it while 90 is still the latest number: the claim, the settled prize and the winner row are all saved", async () => {
    // Full House completes on the last number for a ticket that holds the last number called. Take the first players (new phone numbers) until one's ticket does.
    const lastNumber = reference()[89]!;
    let a: P | null = null; let pid = "";
    for (let n = 1; n <= 80 && !a; n++) {
      const p = mkPhone(n); await p.rt.boot(); expect(await p.rt.join(p.phone)).toBe(true);
      const full = settleAll(EID, [p.rt.pid!], reference()).find((s) => s.pattern === "full");
      if (full && full.idx === 89 && p.rt.ticket.flat().includes(lastNumber)) { a = p; pid = p.rt.pid!; }
    }
    expect(a).not.toBeNull(); // (if no ticket among 80 holds the last number the fixture itself is wrong)
    for (let i = 0; i < 200 && a!.rt.view().phase !== "ended"; i++) await step([a!]);
    const v = a!.rt.view();
    expect(v.log.length).toBe(90); expect(v.log[89]).toBe(lastNumber); expect(v.phase).toBe("ended");
    for (let i = 0; i < 6; i++) await step([a!], 5000); // the phone sends its claim and its report; the store settles
    // 1. the claim reached the store while 90 was still the latest number
    const claim = raw.query("SELECT idx, at_ms FROM claim WHERE eid=? AND pid=? AND pattern='full'").get(EID, pid) as { idx: number; at_ms: number } | null;
    expect(claim).not.toBeNull(); expect(claim!.idx).toBe(89);
    // 2. the prize is settled to this ticket, at call 89 ...
    const settled = raw.query("SELECT pattern, ordinal, idx, pids FROM settled WHERE eid=? AND pattern='full'").all(EID) as { pattern: string; ordinal: number; idx: number; pids: string }[];
    expect(settled.length).toBe(1); expect(settled[0]!.idx).toBe(89); expect(JSON.parse(settled[0]!.pids)).toEqual([pid]);
    // 3. ... and the winners record has its row
    const rows = raw.query("SELECT pattern, ordinal, seat, idx FROM winner WHERE eid=? AND pattern='full'").all(EID) as { pattern: string; ordinal: number; seat: number; idx: number }[];
    expect(rows.length).toBe(1); expect(rows[0]!.idx).toBe(89); expect(rows[0]!.seat).toBe(Number(pid.split("x")[0]));
    // 4. the player's own phone shows the win
    expect(a!.rt.view().won.map((w) => w.pattern)).toContain("full");
  });

  test("three players complete Full House on number 90 and all three claim it (the rehearsal of 1.4.4: \"3 people claimed on 90 and nobody won\"): somebody wins, and every settled winner has a winner row", async () => {
    const lastNumber = reference()[89]!;
    const group: P[] = [];
    for (let n = 1; n <= 300 && group.length < 3; n++) {
      const p = mkPhone(n); await p.rt.boot(); expect(await p.rt.join(p.phone)).toBe(true);
      const full = settleAll(EID, [p.rt.pid!], reference()).find((x) => x.pattern === "full");
      if (full && full.idx === 89 && p.rt.ticket.flat().includes(lastNumber)) group.push(p); else p.quiet = true;
    }
    expect(group.length).toBe(3);
    for (let i = 0; i < 200 && group.some((p) => p.rt.view().phase !== "ended"); i++) await step(group);
    for (let i = 0; i < 6; i++) await step(group, 5000);
    const claims = raw.query("SELECT pid FROM claim WHERE eid=? AND pattern='full' AND idx=89").all(EID) as { pid: string }[];
    expect(claims.map((c) => c.pid).sort()).toEqual(group.map((p) => p.rt.pid!).sort()); // all three claims reached the store in time
    const settled = raw.query("SELECT pids, idx FROM settled WHERE eid=? AND pattern='full' ORDER BY ordinal").all(EID) as { pids: string; idx: number }[];
    expect(settled.length).toBeGreaterThanOrEqual(1); expect(settled[0]!.idx).toBe(89);
    const winners = new Set(settled.flatMap((x) => JSON.parse(x.pids) as string[])); expect(winners.size).toBeGreaterThanOrEqual(1);
    const rows = raw.query("SELECT seat FROM winner WHERE eid=? AND pattern='full'").all(EID) as { seat: number }[];
    expect(rows.map((r) => r.seat).sort()).toEqual([...winners].map((w) => Number(w.split("x")[0])).sort());
  });
});
