// D3 (250-person live game Ehvr2ch, 3 Nov 2026): 3 of 248 phones (2 real Chrome pages and 1 full protocol phone) showed Top Line won at call index 34 (ticket 220, the second
// ticket to complete it) while the store's agreed list and 245 phones said 31 (ticket 224). Tickets 157 and 245, whose Top Line was never complete, pressed Claim for it right
// after 224 did: two wrong claims (Bogeys), stamped a moment AFTER 224's claim.
// Cause (phone-runtime.ts pollSeats + worker.ts publicClaims): a claim is stamped with the store's time when its request ARRIVES and written a little later, so under load a claim
// stamped earlier (224's) can be written after one stamped later (a Bogey). A phone that read the claims in between moved its cursor to the Bogey's time and then only ever asked
// for claims "at or after" that time, so it never received 224's claim, and its own working gave Top Line to the next claimant (220, at 34). A phone shows its own working, so it
// never corrected itself. The fix: the phone asks from 30 s before the newest time it has (repeats are dropped), and after the game it shows the store's agreed result.
// Real phones (the PhoneRuntime) against the real Worker code with an in-memory database; the late write is made by inserting the claim row after the phone has read past it.
import { beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
setDefaultTimeout(120_000);
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { type Env } from "../../../apps/edge/src/worker";
import { handle } from "../../../apps/edge/test/with-terms";
import { makeD1 } from "../../../apps/edge/test/d1-sqlite";
import { CLAIM_CURSOR_SLACK_MS, PhoneRuntime, type PhoneDeps } from "../src/phone-runtime";
import { completionIndexKey, settleAll, ticketsFor } from "../src/game";
import { GRACE_ROUNDS } from "../src/config";
import { deriveCalls, roundAt, roundTimeMs, type Fetcher, type Round } from "../src";

const rnd = (r: number) => bytesToHex(sha256(new TextEncoder().encode("fake" + r)));
const SECRET = "org", EID = "D3-LATE", START = 50_000;
let env: Env; let raw: ReturnType<typeof makeD1>["raw"]; let t = 0; let T0 = 0;
const utc = () => T0 + t;
const headCall = (method: string, path: string, body?: unknown, h: Record<string, string> = {}) => handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...h }, body: body === undefined ? undefined : JSON.stringify(body) }), env, utc());
const api: PhoneDeps["api"] = async (method, path, body) => { const r = await headCall(method, path, body); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error((j as any).error ?? "http " + r.status), { status: r.status }); return j; };
const fetcher: Fetcher = async (url) => { const last = url.split("/").pop()!, nowR = roundAt(utc()), r = last === "latest" ? nowR : Number(last); if (r > nowR) return { ok: false, status: 404, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" } as Round) }; };
const mkPhone = (n: number, mem = new Map<string, string>()) => {
  const rt = new PhoneRuntime(EID, { noEarlyEnd: true, api, mono: () => t, store: { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) }, beacon: { fetcher, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x) => x.signature === "aa" && x.randomness === rnd(x.round) });
  return { rt, phone: "9" + String(100000000 + n) };
};
const ref = () => deriveCalls(EID, Array.from({ length: 90 }, (_, k) => rnd(START + k * 2)));
const callMs = (k: number) => roundTimeMs(START + k * 2); // a number every 6 s from START
const claimRow = (pid: string, idx: number, atMs: number) => raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES(?,?,'top',1,?,?)").run(EID, pid, idx, atMs);
const bogeyRow = (pid: string, atMs: number) => raw.prepare("INSERT INTO bogey(eid,pid,pattern,round,at_ms) VALUES(?,?,'top',1,?)").run(EID, pid, atMs);
const topOf = (o: ReturnType<typeof mkPhone>) => o.rt.view().results.find((x) => x.pattern === "top" && x.ordinal === 1);

beforeEach(async () => {
  const d = makeD1(); raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: SECRET, DAILY_WRITE_BUDGET: "1000000" } as Env;
  T0 = roundTimeMs(START - 3); t = 0;
  expect((await headCall("POST", "/api/z", { id: EID, startRound: START - GRACE_ROUNDS, callSeconds: 6, cap: 50, rewards: [{ pattern: "top", ordinal: 1 }] }, { "x-organizer": SECRET })).status).toBe(200);
});

/** An observer phone and 8 players (who only join). X completes Top Line first, Y next (later), Z presses a wrong Top claim. */
async function setup() {
  const o = mkPhone(1), players = Array.from({ length: 8 }, (_, i) => mkPhone(10 + i));
  for (const p of [o, ...players]) { await p.rt.boot(); expect(await p.rt.join(p.phone)).toBe(true); }
  const log = ref();
  const done = players.map((p) => ({ pid: p.rt.pid!, idx: completionIndexKey(ticketsFor(EID, p.rt.pid!, 1), "top", log) })).filter((x) => x.idx >= 0).sort((a, b) => a.idx - b.idx);
  const X = done[0]!, Y = done.find((d) => d.idx > X.idx)!;
  expect(done.filter((d) => d.idx === X.idx)).toHaveLength(1); // one first completer
  expect(Y).toBeTruthy();
  const Z = players.map((p) => p.rt.pid!).find((pid) => pid !== X.pid && pid !== Y.pid)!;
  return { o, X, Y, Z, log };
}
/** Ticks the observer every 3 s until `untilMs` (store time), running `at` hooks once their time has come. */
async function run(o: ReturnType<typeof mkPhone>, untilMs: number, hooks: { at: number; fn: () => Promise<void> | void }[]) {
  while (utc() < untilMs) {
    t += 3000; await o.rt.tick();
    for (const h of hooks) if (h.at <= utc() && !(h as any).done) { (h as any).done = true; await h.fn(); }
  }
}
const readNow = async (o: ReturnType<typeof mkPhone>) => { const r = o.rt as any; r.lastSeatPoll = -Infinity; r.wantSeats = false; await o.rt.tick(); }; // the phone reads the seat list (and the claims) right now

describe("D3: a claim written a moment after a later one is still seen by every phone", () => {
  test("the winner's claim lands after a Bogey stamped a second later, and after this phone read the Bogey: the phone still gives Top Line to the first claimant, as the store does", async () => {
    const { o, X, Y, Z, log } = await setup();
    const xAt = callMs(X.idx) + 2000, bAt = callMs(X.idx) + 3000; // both in the claim window of X's number (the next number comes 6 s after it)
    await run(o, callMs(89) + 60_000, [
      { at: bAt + 500, fn: async () => {
        bogeyRow(Z, bAt); // the Bogey is written first...
        await readNow(o); // ...the phone reads the claims...
        expect((o.rt as any).claimUpto).toBe(bAt); // (its newest time is now past X's claim)
        claimRow(X.pid, X.idx, xAt); // ...and only then is X's claim written, stamped a second BEFORE the Bogey
      } },
      { at: callMs(Y.idx) + 1500, fn: () => { claimRow(Y.pid, Y.idx, callMs(Y.idx) + 1000); } }, // the next ticket to complete Top Line claims it too
    ]);
    expect(o.rt.phase).toBe("ended");
    // what the store's claims decide: X, at X's call
    const pub = (await (await headCall("GET", `/api/z/${EID}/seats?after=0&cafter=0`)).json() as any).claims;
    const want = settleAll(EID, (await (await headCall("GET", `/api/z/${EID}/seats?after=0&cafter=0`)).json() as any).seats.map((s: any) => s[1]), log, o.rt.cfg, 1, undefined, undefined, { claims: pub, callRounds: log.map((_, k) => START + k * 2) });
    expect(want.find((x) => x.pattern === "top")).toMatchObject({ idx: X.idx, pids: [X.pid] });
    expect((await (await headCall("GET", `/api/z/${EID}/results`)).json() as any).results).toEqual([]); // nothing agreed by the store here: the phone's own working is what it shows
    expect(topOf(o)).toMatchObject({ idx: X.idx }); // the old phone said Y.idx (the next claimant): the 3 phones' "34"
    expect(topOf(o)!.idx).not.toBe(Y.idx);
  });
  test("the phone asks for claims from a little before the newest time it has (repeats are dropped), so the late one arrives with the next read", async () => {
    const { o, X, Z } = await setup();
    const xAt = callMs(X.idx) + 2000, bAt = callMs(X.idx) + 3000;
    const asked: string[] = []; const orig = (o.rt as any).deps.api;
    (o.rt as any).deps.api = (m: string, p: string, b: unknown) => { if (p.includes("/seats?")) asked.push(p); return orig(m, p, b); };
    await run(o, callMs(X.idx) + 40_000, [{ at: bAt + 500, fn: async () => { bogeyRow(Z, bAt); await readNow(o); claimRow(X.pid, X.idx, xAt); asked.length = 0; await readNow(o); } }]);
    expect(asked[0]).toContain(`cafter=${bAt - CLAIM_CURSOR_SLACK_MS}`);
    expect(((o.rt as any).claimList as any[]).filter((c) => c.pid === X.pid && !c.bogey)).toHaveLength(1); // received once
    expect(topOf(o)).toMatchObject({ idx: X.idx });
  });
  test("the bundle the phones load (apps/web/public/zgame.js) carries both parts of the fix", () => {
    const src = readFileSync(new URL("../src/phone-runtime.ts", import.meta.url), "utf8"), shipped = readFileSync(new URL("../../../apps/web/public/zgame.js", import.meta.url), "utf8");
    expect(src).toContain("const cafter = this.claimPageFull ? this.claimUpto : Math.max(0, this.claimUpto - CLAIM_CURSOR_SLACK_MS);");
    expect(shipped).toMatch(/this\.claimPageFull\?this\.claimUpto:Math\.max\(0,this\.claimUpto-[\w$]+\)/);
    expect(shipped).toContain("this.allResults=[...this.withStore(");
    expect(shipped).toMatch(/this\.phase==="ended"&&this\.endResultPolls<[\w$]+&&!this\.storeHasAll\(\)/);
  });
  test("a phone that never received a claim (written far too late for any read): after the game it shows the store's agreed result, not its own different working", async () => {
    const { o, X, Y, Z } = await setup();
    const xAt = callMs(X.idx) + 2000, bAt = Math.max(callMs(Y.idx) + 3000, xAt + CLAIM_CURSOR_SLACK_MS + 10_000);
    await run(o, callMs(89) + 90_000, [
      { at: callMs(Y.idx) + 1500, fn: () => { claimRow(Y.pid, Y.idx, callMs(Y.idx) + 1000); } },
      { at: bAt + 1000, fn: async () => { bogeyRow(Z, bAt); await readNow(o); expect((o.rt as any).claimUpto).toBeGreaterThan(xAt + CLAIM_CURSOR_SLACK_MS); claimRow(X.pid, X.idx, xAt); } }, // written later than any read could still catch
      { at: callMs(89) + 20_000, fn: () => { raw.prepare("INSERT INTO settled(eid,pattern,ordinal,round,idx,pids) VALUES(?,?,?,?,?,?)").run(EID, "top", 1, 1, X.idx, JSON.stringify([X.pid])); } }, // the store's agreed result (the other phones' votes)
    ]);
    expect(o.rt.phase).toBe("ended");
    const v = o.rt.view();
    expect(v.results.filter((x) => x.pattern === "top")).toHaveLength(1);
    expect(topOf(o)).toMatchObject({ idx: X.idx, tickets: [Number(X.pid.split("x")[0])] }); // the store's: X at X's call
  });
});
