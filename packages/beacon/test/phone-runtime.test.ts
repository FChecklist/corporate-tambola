import { beforeEach, describe, expect, test } from "bun:test";
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { handle, type Env } from "../../../apps/edge/src/worker";
import { makeD1 } from "../../../apps/edge/test/d1-sqlite";
import { PhoneRuntime, type PhoneDeps } from "../src/phone-runtime";
import { ALL_PATTERNS, checkClaims, completionIndex, settleAll, ticketFor } from "../src/game";
import { deriveCalls, roundAt, roundTimeMs, type Fetcher, type Round } from "../src";
import { nextMessage, publicKeyFromSecret, readPublished, resolveControl, scheduleWithControl, signControlWithSecret, cfgOf, type KV } from "../src/control";

const SECRET = "org";
const KEY = "11".repeat(32);
const EID = "ENG-PHONE-1";
const START = 50_000;
const CALL_SECONDS = 6;
const rnd = (r: number) => bytesToHex(sha256(new TextEncoder().encode("fake" + r)));

let env: Env; let t = 0; let T0 = 0;
const D = {
  utc: () => T0 + t,
  headCall: (method: string, path: string, body?: unknown, h: Record<string, string> = {}) =>
    handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...h }, body: body === undefined ? undefined : JSON.stringify(body) }), env, 1_700_000_000_000),
};
const api = (down: () => boolean = () => false): PhoneDeps["api"] => async (method, path, body) => {
  if (down()) throw new Error("offline");
  const r = await D.headCall(method, path, body);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ?? "http " + r.status), { status: r.status });
  return j;
};
const beaconFetcher = (opt: { blocked?: () => boolean } = {}): Fetcher => async (url) => {
  if (opt.blocked?.()) throw new Error("blocked");
  const last = url.split("/").pop()!;
  const nowR = roundAt(D.utc());
  const r = last === "latest" ? nowR : Number(last);
  if (r > nowR) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" } as Round) };
};
const mkPhone = (n: number, o: { down?: () => boolean; blocked?: () => boolean } = {}) => {
  const mem = new Map<string, string>();
  const rt = new PhoneRuntime(EID, {
    api: api(o.down), mono: () => t, store: { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) },
    beacon: { fetcher: beaconFetcher({ blocked: o.blocked }), mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 },
    verify: (x) => x.signature === "aa" && x.randomness === rnd(x.round),
  });
  return { rt, mem, phone: "9" + String(100000000 + n) };
};
const step = async (phones: ReturnType<typeof mkPhone>[], ms = 3000) => { t += ms; for (const p of phones) await p.rt.tick(); };
const kvOf = (): KV => ({ get: async (k) => (await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(k).first<{ v: string }>())?.v ?? null, put: async () => {} });

beforeEach(async () => {
  const d = makeD1();
  env = { DB: d.db, ORGANIZER_SECRET: SECRET, DAILY_WRITE_BUDGET: "1000000" };
  T0 = roundTimeMs(START - 3); t = 0;
  await D.headCall("POST", "/api/z", { id: EID, startRound: START, callSeconds: CALL_SECONDS, cap: 5000 }, { "x-organizer": SECRET });
});
const registerKey = async () => (await D.headCall("PUT", `/api/z/${EID}/control/key`, { publicKey: publicKeyFromSecret(KEY) }, { "x-organizer": SECRET })).status;
const publish = async (a: Parameters<typeof nextMessage>[2]) => {
  const f = (await readPublished(kvOf(), EID))!;
  const msg = signControlWithSecret(KEY, nextMessage(f, roundAt(D.utc()), a));
  const r = await D.headCall("POST", `/api/z/${EID}/control`, { message: msg });
  return { status: r.status, body: await r.json() };
};
const reference = (pauseState?: ReturnType<typeof resolveControl>) => {
  const sched = pauseState ? scheduleWithControl(pauseState, START, 2, 90) : Array.from({ length: 90 }, (_, k) => START + k * 2);
  return deriveCalls(EID, sched.map((r) => rnd(r!)));
};

describe("a phone from first open to full house", () => {
  test("open, join, wait for the first call, play all 90 calls, claim every pattern, and match the public reference", async () => {
    const a = mkPhone(1);
    await a.rt.boot();
    expect(a.rt.phase).toBe("join");
    expect(await a.rt.join(a.phone, "Asha")).toBe(true);
    expect(a.rt.phase).toBe("play");
    let v = await a.rt.tick();
    expect(v.log).toEqual([]); // first call is still in the future
    expect(v.nextCallInSec).not.toBeNull();
    for (let i = 0; i < 200; i++) await step([a]);
    v = await a.rt.tick();
    expect(v.log.length).toBe(90);
    expect(v.log).toEqual(reference());
    expect(v.phase).toBe("ended");
    expect(new Set(v.claimed)).toEqual(new Set(ALL_PATTERNS));
    expect(v.unsent).toBe(0);
  });
  test("calls are revealed one at a time as their rounds are published, never early", async () => {
    const a = mkPhone(2); await a.rt.boot(); await a.rt.join(a.phone);
    let last = 0;
    for (let i = 0; i < 40; i++) {
      const v = await (async () => { await step([a], 3000); return a.rt.view(); })();
      const expectedMax = Math.max(0, Math.floor((roundAt(D.utc()) - START) / 2) + 1);
      expect(v.log.length).toBeLessThanOrEqual(expectedMax);
      expect(v.log.length).toBeGreaterThanOrEqual(last);
      last = v.log.length;
    }
  });
  test("the same number on a second phone gives the same participant and ticket; the ticket is kept after a reload", async () => {
    const a = mkPhone(3); await a.rt.boot(); await a.rt.join(a.phone);
    const b = mkPhone(3); await b.rt.boot(); await b.rt.join("+91 " + a.phone.slice(0, 5) + " " + a.phone.slice(5));
    expect(b.rt.pid).toBe(a.rt.pid);
    expect(b.rt.ticket).toEqual(a.rt.ticket);
    const c = new PhoneRuntime(EID, { ...a.rt.deps });
    await c.boot();
    expect(c.phase).toBe("play"); // remembered on this phone
    expect(c.pid).toBe(a.rt.pid);
  });
  test("a bad link says so and does nothing else", async () => {
    const x = new PhoneRuntime("NO-SUCH-ENG", mkPhone(4).rt.deps);
    await x.boot();
    expect(x.phase).toBe("missing");
  });
  test("a mobile number that is too short is refused with a human message, and the phone can retry", async () => {
    const a = mkPhone(5); await a.rt.boot();
    expect(await a.rt.join("123")).toBe(false);
    expect(a.rt.error).toMatch(/valid mobile/);
    expect(a.rt.phase).toBe("join");
    expect(await a.rt.join(a.phone)).toBe(true);
  });
});

describe("a crowd and the awkward cases", () => {
  test("40 phones, some late, some offline for a while, one behind a blocked network for a while: everyone ends with the identical log and the claims match the organizer's settlement", async () => {
    let off = false, blocked = false;
    const ps = Array.from({ length: 40 }, (_, i) => mkPhone(i + 10, i === 5 ? { down: () => off } : i === 6 ? { blocked: () => blocked } : {}));
    for (const p of ps.slice(0, 30)) { await p.rt.boot(); await p.rt.join(p.phone); }
    for (let i = 0; i < 200; i++) {
      if (i === 20) off = true; if (i === 35) off = false;
      if (i === 40) blocked = true; if (i === 55) blocked = false;
      if (i === 45) for (const p of ps.slice(30)) { await p.rt.boot(); await p.rt.join(p.phone); } // late joiners arrive mid-game
      await step(ps);
    }
    for (let i = 0; i < 6; i++) await step(ps);
    const ref = reference();
    for (const p of ps) expect(p.rt.view().log).toEqual(ref);
    // organizer: everything it needs, from the public log + our store, and only from those
    const pids = (await (await D.headCall("GET", `/api/z/${EID}/participants`, undefined, { "x-organizer": SECRET })).json() as any).participants.map((x: any) => x.pid);
    expect(pids.length).toBe(40);
    const claims = (await (await D.headCall("GET", `/api/z/${EID}/claims`, undefined, { "x-organizer": SECRET })).json() as any).claims;
    const chk = checkClaims(EID, claims.map((c: any) => ({ pid: c.pid, pattern: c.pattern, idx: c.idx })), ref);
    expect(chk.bad).toEqual([]);
    expect(chk.good.length).toBe(40 * 7);
    const settled = settleAll(EID, pids, ref);
    const post = await D.headCall("POST", `/api/z/${EID}/settle`, { results: settled }, { "x-organizer": SECRET });
    expect(post.status).toBe(200);
    const pub = await (await D.headCall("GET", `/api/z/${EID}/results`)).json() as any;
    expect(pub.results.length).toBe(7);
    // every phone's own results view agrees
    for (const p of ps) { await step([p], 16000); expect(p.rt.view().results.length).toBe(7); }
  });
  test("a phone whose network drops while a claim is sent keeps it and sends it again later, exactly once", async () => {
    let off = false;
    const a = mkPhone(60, { down: () => off }); await a.rt.boot(); await a.rt.join(a.phone);
    const b = mkPhone(61); await b.rt.boot(); await b.rt.join(b.phone);
    for (let i = 0; i < 120; i++) { if (i === 10) off = true; await step([a]); }
    expect(a.rt.view().unsent).toBeGreaterThan(0); // completed something while its own link to our store was down
    off = false;
    for (let i = 0; i < 200; i++) await step([a]);
    expect(a.rt.view().unsent).toBe(0);
    const n = (await (await D.headCall("GET", `/api/z/${EID}/claims`, undefined, { "x-organizer": SECRET })).json() as any).claims.filter((c: any) => c.pid === a.rt.pid).length;
    expect(n).toBe(7);
  });
  test("a phone cannot claim something it has not completed: the organizer's check rejects it", async () => {
    const a = mkPhone(70); await a.rt.boot(); await a.rt.join(a.phone);
    await api()("POST", `/api/z/${EID}/claims`, { pid: a.rt.pid, claims: [{ pattern: "full", idx: 12 }] });
    const claims = (await (await D.headCall("GET", `/api/z/${EID}/claims`, undefined, { "x-organizer": SECRET })).json() as any).claims;
    expect(checkClaims(EID, claims, reference()).bad.length).toBe(1);
    // and settlement never uses it
    expect(settleAll(EID, [a.rt.pid!], reference()).find((s) => s.pattern === "full")!.idx).toBe(completionIndex(ticketFor(EID, a.rt.pid!), "full", reference()));
  });
  test("the beacon unreachable for a stretch: nothing is invented, and the phone catches up exactly afterwards", async () => {
    let blocked = false;
    const a = mkPhone(80, { blocked: () => blocked }); await a.rt.boot(); await a.rt.join(a.phone);
    for (let i = 0; i < 20; i++) await step([a]);
    const before = a.rt.view().log.slice();
    blocked = true;
    for (let i = 0; i < 30; i++) await step([a]);
    expect(a.rt.view().log).toEqual(before); // frozen, not guessed
    blocked = false;
    for (let i = 0; i < 200; i++) await step([a]);
    expect(a.rt.view().log).toEqual(reference());
  });
  test("a lying mirror that returns forged randomness is never believed", async () => {
    const liar: Fetcher = async (url) => {
      const last = url.split("/").pop()!;
      const r = last === "latest" ? roundAt(D.utc()) : Number(last);
      return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r + 1), signature: "aa" }) };
    };
    const a = mkPhone(90);
    (a.rt.deps as any).beacon = { fetcher: liar, mirrors: ["https://a.test"], timeoutMs: 300 };
    (a.rt.store as any).opts = (a.rt.deps as any).beacon;
    await a.rt.boot(); await a.rt.join(a.phone);
    for (let i = 0; i < 40; i++) await step([a]);
    expect(a.rt.view().log).toEqual([]);
  });
});

describe("pause, resume and stop", () => {
  test("a signed pause: nobody sees a number during it, everyone resumes together, and all logs equal the paused reference", async () => {
    expect(await registerKey()).toBe(200);
    const ps = Array.from({ length: 12 }, (_, i) => mkPhone(100 + i));
    for (const p of ps) { await p.rt.boot(); await p.rt.join(p.phone); }
    for (let i = 0; i < 30; i++) await step(ps);
    const r = await publish({ action: "pause", pauseForRounds: 20 });
    expect(r.status).toBe(200);
    const f = (await readPublished(kvOf(), EID))!;
    const st = resolveControl(cfgOf(f), f.messages);
    const iv = st.intervals[0]!;
    const lenAtStart = ps[0]!.rt.view().log.length;
    let during = new Set<number>();
    for (let i = 0; i < 200; i++) {
      await step(ps);
      const now = roundAt(D.utc());
      if (now >= iv.start && now < iv.end) during.add(ps[0]!.rt.view().log.length);
      if (now >= iv.start && now < iv.end) for (const p of ps) expect(p.rt.view().paused).toBe(true);
    }
    const dl = [...during];
    expect(Math.max(...dl) - Math.min(...dl)).toBe(0); // no number appeared during the pause
    const ref = reference(st);
    for (const p of ps) expect(p.rt.view().log).toEqual(ref);
    expect(lenAtStart).toBeLessThan(90);
  });
  test("nobody can pause but the organizer: an unsigned or wrongly signed message is refused", async () => {
    await registerKey();
    const f = (await readPublished(kvOf(), EID))!;
    const m = signControlWithSecret("22".repeat(32), nextMessage(f, roundAt(D.utc()), { action: "pause", pauseForRounds: 10 }));
    expect((await D.headCall("POST", `/api/z/${EID}/control`, { message: m })).status).toBe(403);
    expect((await D.headCall("POST", `/api/z/${EID}/control`, { message: { ...m, sig: "00" } })).status).toBeGreaterThanOrEqual(400);
    expect((await D.headCall("PUT", `/api/z/${EID}/control/key`, { publicKey: publicKeyFromSecret("33".repeat(32)) })).status).toBe(403); // not the organizer
    expect((await D.headCall("PUT", `/api/z/${EID}/control/key`, { publicKey: publicKeyFromSecret("33".repeat(32)) }, { "x-organizer": SECRET })).status).toBe(409); // key cannot be swapped
  });
  test("when the control file cannot be reached the phone holds (shows 'checking') instead of revealing, then recovers", async () => {
    await registerKey();
    let down = false;
    const a = mkPhone(130, { down: () => false });
    const c = mkPhone(131);
    let controlDown = false;
    const realApi = a.rt.deps.api;
    (a.rt.deps as any).api = async (m: string, p: string, b?: unknown) => { if (controlDown && p.endsWith("/control")) throw new Error("outage"); return realApi(m, p, b); };
    await a.rt.boot(); await a.rt.join(a.phone); await c.rt.boot(); await c.rt.join(c.phone);
    for (let i = 0; i < 25; i++) await step([a, c]);
    expect(a.rt.view().mode).toBe("live");
    controlDown = true; down = true;
    let held = false;
    for (let i = 0; i < 12; i++) { await step([a, c]); if (a.rt.view().mode === "hold") held = true; }
    expect(held).toBe(true);
    const frozen = a.rt.view().log.length;
    expect(c.rt.view().log.length).toBeGreaterThanOrEqual(frozen);
    controlDown = false;
    for (let i = 0; i < 12; i++) await step([a, c]);
    expect(a.rt.view().mode).toBe("live");
    for (let i = 0; i < 200; i++) await step([a, c]);
    expect(a.rt.view().log).toEqual(reference());
  });
  test("stop ends the engagement for everyone at the same call", async () => {
    await registerKey();
    const ps = [mkPhone(140), mkPhone(141)];
    for (const p of ps) { await p.rt.boot(); await p.rt.join(p.phone); }
    for (let i = 0; i < 20; i++) await step(ps);
    expect((await publish({ action: "stop" })).status).toBe(200);
    for (let i = 0; i < 200; i++) await step(ps);
    const [x, y] = ps.map((p) => p.rt.view());
    expect(x!.phase).toBe("ended"); expect(y!.phase).toBe("ended");
    expect(x!.log).toEqual(y!.log);
    expect(x!.log.length).toBeLessThan(90);
  });
  test("an engagement with no key registered simply cannot be paused and plays on", async () => {
    const a = mkPhone(150); await a.rt.boot(); await a.rt.join(a.phone);
    for (let i = 0; i < 200; i++) await step([a]);
    expect(a.rt.view().mode).toBe("none");
    expect(a.rt.view().log).toEqual(reference());
  });
});
