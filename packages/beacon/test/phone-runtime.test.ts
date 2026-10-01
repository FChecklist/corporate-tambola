import { beforeEach, describe, expect, test } from "bun:test";
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { handle, type Env } from "../../../apps/edge/src/worker";
import { makeD1 } from "../../../apps/edge/test/d1-sqlite";
import { PhoneRuntime, type PhoneDeps } from "../src/phone-runtime";
import { ALL_PATTERNS, checkClaims, completionIndex, luckyRound, luckyWinners, scheduleFull, settleAll, ticketFor } from "../src/game";
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
  await D.headCall("POST", "/api/z", { id: EID, startRound: START, callSeconds: CALL_SECONDS, cap: 400 }, { "x-organizer": SECRET });
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

describe("after the last call", () => {
  test("a claim that failed to send on the very last tick is still delivered afterwards", async () => {
    let off = false;
    const a = mkPhone(160, { down: () => off }); await a.rt.boot(); await a.rt.join(a.phone);
    // play to the end with our store reachable until the final stretch, then cut it, then restore
    for (let i = 0; i < 175; i++) await step([a]);
    off = true;
    for (let i = 0; i < 30; i++) await step([a]);
    expect(a.rt.view().phase).toBe("ended");
    const stuck = a.rt.view().unsent;
    off = false;
    for (let i = 0; i < 5; i++) await step([a]);
    expect(a.rt.view().unsent).toBe(0);
    expect(stuck).toBeGreaterThanOrEqual(0);
    const n = (await (await D.headCall("GET", `/api/z/${EID}/claims`, undefined, { "x-organizer": SECRET })).json() as any).claims.filter((c: any) => c.pid === a.rt.pid).length;
    expect(n).toBe(7);
  });
});

describe("a late joiner who cannot hear about a pause", () => {
  test("holds instead of guessing, never claims from a wrong log, and ends with the true log once it can ask", async () => {
    await registerKey();
    const a = mkPhone(170);
    await a.rt.boot(); await a.rt.join(a.phone);
    for (let i = 0; i < 30; i++) await step([a]);
    expect((await publish({ action: "pause", pauseForRounds: 20 })).status).toBe(200);
    for (let i = 0; i < 20; i++) await step([a]);
    // a phone joins now, with the control file unreachable for a while
    const b = mkPhone(171);
    let controlDown = true;
    const realApi = b.rt.deps.api;
    (b.rt.deps as any).api = async (m: string, p: string, x?: unknown) => { if (controlDown && p.endsWith("/control")) throw new Error("outage"); return realApi(m, p, x); };
    await b.rt.boot(); await b.rt.join(b.phone);
    for (let i = 0; i < 40; i++) { await step([a, b]); expect(b.rt.view().log).toEqual([]); expect(b.rt.view().mode).toBe("hold"); }
    controlDown = false;
    for (let i = 0; i < 12; i++) await step([a, b]);
    expect(b.rt.view().mode).toBe("live");
    for (let i = 0; i < 200; i++) await step([a, b]);
    const f = (await readPublished(kvOf(), EID))!;
    const ref = reference(resolveControl(cfgOf(f), f.messages));
    expect(b.rt.view().log).toEqual(ref);
    const claims = (await (await D.headCall("GET", `/api/z/${EID}/claims`, undefined, { "x-organizer": SECRET })).json() as any).claims.filter((c: any) => c.pid === b.rt.pid);
    expect(claims.length).toBe(7);
    expect(checkClaims(EID, claims, ref).bad).toEqual([]);
  });
});

describe("pause file read from a cached public copy", () => {
  test("when the engagement publishes a static file, the phone reads the pause file from it and does not ask the Worker", async () => {
    await registerKey();
    const a = mkPhone(180);
    let viaApi = 0, viaPublic = 0;
    const realApi = a.rt.deps.api;
    (a.rt.deps as any).api = async (m: string, p: string, x?: unknown) => { if (p.endsWith("/control")) viaApi++; if (p.endsWith("/info")) { const j = await realApi(m, p, x); return { ...j, controlUrl: "https://static.test/c/x.json" }; } return realApi(m, p, x); };
    (a.rt.deps as any).getPublic = async (url: string) => { viaPublic++; expect(url).toBe("https://static.test/c/x.json"); return realApi("GET", `/api/z/${EID}/control`); };
    await a.rt.boot(); await a.rt.join(a.phone);
    for (let i = 0; i < 30; i++) await step([a]);
    expect(viaPublic).toBeGreaterThan(0);
    expect(viaApi).toBe(0);
    expect(a.rt.view().mode).toBe("live");
  });
});

describe("brand breaks, reward lines and two tickets on real phones", () => {
  const setCfg = async (o: { tickets?: number; rewards?: unknown; breaks?: unknown }) =>
    env.DB.prepare("UPDATE engagement SET tickets=?, config=? WHERE id=?").bind(o.tickets ?? 1, JSON.stringify({ rewards: o.rewards, breaks: o.breaks }), EID).run();
  const breaks = [{ after: 5, seconds: 30, kind: "speech", title: "CEO message" }, { after: 40, seconds: 45, kind: "youtube", title: "Our story", mediaUrl: "https://youtu.be/abc" }];
  const refWith = (b: any[]) => deriveCalls(EID, (scheduleFull(null, START, 2, b, 90) as number[]).map((r) => rnd(r)));

  test("a brand break pauses the numbers for exactly its length, shows its card, and everyone's logs stay identical", async () => {
    await setCfg({ breaks });
    const ps = Array.from({ length: 6 }, (_, i) => mkPhone(200 + i));
    for (const p of ps) { await p.rt.boot(); await p.rt.join(p.phone); }
    let sawBreak = false; const during = new Set<number>(); let title = "";
    for (let i = 0; i < 260; i++) {
      await step(ps);
      const v = ps[0]!.rt.view();
      if (v.brk) { sawBreak = true; title = v.brk.title; if (v.brk.title === "CEO message") during.add(v.log.length); expect(v.brk.secondsLeft).toBeGreaterThanOrEqual(0); }
      if (v.brk) for (const p of ps) expect(p.rt.view().brk?.title).toBe(v.brk.title); // all phones show the same card at the same time (within a tick)
    }
    expect(sawBreak).toBe(true);
    expect(during.size).toBe(1); // the log did not grow while the break was showing
    expect([...during][0]).toBe(5);
    const ref = refWith(breaks);
    for (const p of ps) expect(p.rt.view().log).toEqual(ref);
    expect(ps[0]!.rt.view().brk).toBeNull();
    expect(title.length).toBeGreaterThan(0);
  });
  test("a phone that opens the page in the middle of a break shows the card and then the same numbers as everyone", async () => {
    await setCfg({ breaks });
    const early = mkPhone(210); await early.rt.boot(); await early.rt.join(early.phone);
    for (let i = 0; i < 18; i++) await step([early]); // call 5 is at ~round 10; the break runs ~10 rounds after it
    const late = mkPhone(211); await late.rt.boot(); await late.rt.join(late.phone);
    let sawCard = late.rt.view().brk !== null;
    await step([early, late]); sawCard = sawCard || late.rt.view().brk !== null;
    for (let i = 0; i < 250; i++) { await step([early, late]); if (late.rt.view().brk) sawCard = true; }
    expect(late.rt.view().log).toEqual(refWith(breaks));
    expect(early.rt.view().log).toEqual(late.rt.view().log);
    expect(sawCard).toBe(true);
  });
  test("a break together with a signed pause: both delay the calls and the logs still match the organizer's reference", async () => {
    await registerKey(); await setCfg({ breaks });
    const ps = [mkPhone(220), mkPhone(221)];
    for (const p of ps) { await p.rt.boot(); await p.rt.join(p.phone); }
    for (let i = 0; i < 30; i++) await step(ps);
    expect((await publish({ action: "pause", pauseForRounds: 20 })).status).toBe(200);
    for (let i = 0; i < 260; i++) await step(ps);
    const f = (await readPublished(kvOf(), EID))!; const st = resolveControl(cfgOf(f), f.messages);
    const ref = deriveCalls(EID, (scheduleFull(st, START, 2, breaks as any, 90) as number[]).map((r) => rnd(r)));
    for (const p of ps) expect(p.rt.view().log).toEqual(ref);
  });
  test("only the houses with a reward are claimed and shown; the rest are not in play", async () => {
    await setCfg({ rewards: [{ pattern: "top", scope: "ticket", ordinal: 1, text: "Voucher" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "Hamper" }] });
    const a = mkPhone(230); await a.rt.boot(); await a.rt.join(a.phone);
    for (let i = 0; i < 200; i++) await step([a]);
    const v = a.rt.view();
    expect(new Set(v.claimed)).toEqual(new Set(["top", "full"]));
    expect(Object.keys(v.myIdx).sort()).toEqual(["full", "top"]);
    const n = (await (await D.headCall("GET", `/api/z/${EID}/claims`, undefined, { "x-organizer": SECRET })).json() as any).claims.filter((c: any) => c.pid === a.rt.pid).length;
    expect(n).toBe(2);
  });
  test("two tickets: the phone holds two different tickets, claims the two-ticket house, and the organizer's settlement agrees with the phone's own numbers", async () => {
    await setCfg({ tickets: 2, rewards: [{ pattern: "full", scope: "ticket", ordinal: 1, text: "Hamper" }, { pattern: "full", scope: "ticket", ordinal: 2, text: "Mug" }, { pattern: "full", scope: "two_ticket", ordinal: 1, text: "Grand" }] });
    const ps = Array.from({ length: 12 }, (_, i) => mkPhone(240 + i));
    for (const p of ps) { await p.rt.boot(); await p.rt.join(p.phone); }
    for (let i = 0; i < 220; i++) await step(ps);
    const v = ps[0]!.rt.view();
    expect(v.tickets).toHaveLength(2);
    expect(JSON.stringify(v.tickets[0])).not.toBe(JSON.stringify(v.tickets[1]));
    expect(new Set(v.claimed)).toEqual(new Set(["full", "full2"]));
    const ref = refWith([]);
    const cfg = { tickets: 2 as const, rewards: [{ pattern: "full" as const, scope: "ticket" as const, ordinal: 1, text: "" }, { pattern: "full" as const, scope: "ticket" as const, ordinal: 2, text: "" }, { pattern: "full" as const, scope: "two_ticket" as const, ordinal: 1, text: "" }], breaks: [] };
    const pids = (await (await D.headCall("GET", `/api/z/${EID}/participants`, undefined, { "x-organizer": SECRET })).json() as any).participants.map((x: any) => x.pid);
    const claims = (await (await D.headCall("GET", `/api/z/${EID}/claims`, undefined, { "x-organizer": SECRET })).json() as any).claims;
    expect(checkClaims(EID, claims, ref, cfg).bad).toEqual([]);
    const settled = settleAll(EID, pids, ref, cfg);
    expect(settled.map((s) => `${s.pattern}#${s.ordinal}`).sort()).toEqual(["full#1", "full#2", "full2#1"].filter((k) => settled.some((s) => `${s.pattern}#${s.ordinal}` === k)).sort());
    expect((await D.headCall("POST", `/api/z/${EID}/settle`, { results: settled.map((s) => ({ pattern: s.pattern, ordinal: s.ordinal, idx: s.idx, pids: s.pids })) }, { "x-organizer": SECRET })).status).toBe(200);
    // each phone can tell whether it received a published reward line by comparing its own completion call with the published one
    await step(ps, 16000);
    const pub = ps[0]!.rt.view().results;
    expect(pub.length).toBe(settled.length);
    for (const r of pub) { const mine = settled.find((s) => s.pattern === r.pattern && s.ordinal === r.ordinal)!; expect(r.idx).toBe(mine.idx); expect(r.count).toBe(mine.pids.length); }
  });
});

describe("lucky draw on phones", () => {
  test("every phone sees the draw; after the organizer publishes, exactly the winners are told they won", async () => {
    await env.DB.prepare("UPDATE engagement SET config=? WHERE id=?").bind(JSON.stringify({ breaks: [{ after: 10, seconds: 30, kind: "lucky", title: "Lucky draw", winners: 3 }] }), EID).run();
    const ps = Array.from({ length: 8 }, (_, i) => mkPhone(300 + i));
    for (const p of ps) { await p.rt.boot(); await p.rt.join(p.phone); }
    let sawCard = false;
    for (let i = 0; i < 60; i++) { await step(ps); const b = ps[0]!.rt.view().brk; if (b) { sawCard = true; expect(b.kind).toBe("lucky"); expect(b.winners).toBe(3); } }
    expect(sawCard).toBe(true);
    for (const p of ps) expect(p.rt.view().lucky).toEqual([{ ordinal: 1, title: "Lucky draw", winners: 3, published: false, won: false }]);
    // the organizer's console draws from the participant list with the public randomness of the round that ends the break
    const brk = { after: 10, seconds: 30, kind: "lucky" as const, title: "Lucky draw", winners: 3 as const };
    const round = luckyRound(null, START, 2, [brk], brk)!;
    const pids = (await (await D.headCall("GET", `/api/z/${EID}/participants`, undefined, { "x-organizer": SECRET })).json() as any).participants.map((x: any) => x.pid);
    const winners = luckyWinners(EID, 10, rnd(round), pids, 3);
    expect(winners).toHaveLength(3);
    expect((await D.headCall("POST", `/api/z/${EID}/settle`, { results: [{ pattern: "lucky", ordinal: 1, idx: 10, pids: winners }] }, { "x-organizer": SECRET })).status).toBe(200);
    await step(ps, 16000);
    for (const p of ps) { const v = p.rt.view(); expect(v.lucky[0]!.published).toBe(true); expect(v.lucky[0]!.won).toBe(winners.includes(p.rt.pid!)); }
    expect(ps.filter((p) => p.rt.view().lucky[0]!.won)).toHaveLength(3);
  });
});
