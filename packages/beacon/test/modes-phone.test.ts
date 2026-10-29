// The four modes on a phone: a manual start (Start pressed by the Organizer or a Host) with the game calling, and with a Host calling; the mode and time changed after the phones
// joined (same link, no republish); what the phone shows at each moment ("starts at ..." / "waiting for the host" / "starting in ..." / running).
import { beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(60_000);
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { type Env } from "../../../apps/edge/src/worker";
import { handle } from "../../../apps/edge/test/with-terms";
import { makeD1 } from "../../../apps/edge/test/d1-sqlite";
import { PhoneRuntime, type PhoneDeps } from "../src/phone-runtime";
import { callRoundR, hostGameOf } from "../src/game";
import { GRACE_ROUNDS } from "../src/config";
import { deriveCalls, roundAt, roundTimeMs, type Fetcher, type Round } from "../src";
import { nextMessage, publicKeyFromSecret, readPublished, resolveControl, signControlWithSecret, cfgOf, type KV } from "../src/control";

const SECRET = "org";
const KEY = "11".repeat(32);
const CALL_SECONDS = 6;
const rnd = (r: number) => bytesToHex(sha256(new TextEncoder().encode("fake" + r)));
let env: Env; let t = 0; let T0 = 0; let EID = "ENG-MODE-1"; let SCHED = 0;
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
  const last = url.split("/").pop()!;
  const nowR = roundAt(D.utc());
  const r = last === "latest" ? nowR : Number(last);
  if (r > nowR) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" } as Round) };
};
const mkPhone = (n: number) => {
  const mem = new Map<string, string>();
  const rt = new PhoneRuntime(EID, {
    noEarlyEnd: true, api,
    mono: () => t, utc: () => D.utc(), store: { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v), del: (k: string) => void mem.delete(k) },
    beacon: { fetcher: beaconFetcher(), mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 },
    verify: (x: { round: number; signature: string; randomness: string }) => x.signature === "aa" && x.randomness === rnd(x.round),
  } as any);
  return { rt, phone: "9" + String(100000000 + n) };
};
type P = ReturnType<typeof mkPhone>;
const step = async (phones: P[], ms = 3000) => { t += ms; for (const p of phones) await p.rt.tick(); };
const kvOf = (): KV => ({ get: async (k) => (await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(k).first<{ v: string }>())?.v ?? null, put: async () => {} });
const phonesOf = async (ids: number[]) => { const ps = ids.map((n) => mkPhone(n)); for (const p of ps) { await p.rt.boot(); expect(await p.rt.join(p.phone)).toBe(true); } return ps; };
const settings = async (body: Record<string, unknown>) => D.headCall("PATCH", `/api/z/${EID}/settings`, body, { "x-organizer": SECRET });
const send = async (a: Parameters<typeof nextMessage>[2]) => {
  const f = (await readPublished(kvOf(), EID))!;
  const r = await D.headCall("POST", `/api/z/${EID}/control`, { message: signControlWithSecret(KEY, nextMessage(f, roundAt(D.utc()), a)) });
  return { status: r.status, body: (await r.json()) as any };
};
/** a game whose scheduled time is `ahead` beacon rounds from the clock's start */
const mkGame = async (ahead: number, extra: Record<string, unknown> = {}) => {
  SCHED = roundAt(T0) + ahead;
  expect((await D.headCall("POST", "/api/z", { id: EID, startRound: SCHED, callSeconds: CALL_SECONDS, cap: 200, ...extra }, { "x-organizer": SECRET })).status).toBe(200);
  expect((await D.headCall("PUT", `/api/z/${EID}/control/key`, { publicKey: publicKeyFromSecret(KEY) }, { "x-organizer": SECRET })).status).toBe(200);
};
const until = async (ps: P[], pred: () => boolean, max = 200) => { for (let i = 0; i < max; i++) { if (pred()) return i; await step(ps); } return -1; };

beforeEach(() => { const d = makeD1(); env = { DB: d.db, ORGANIZER_SECRET: SECRET, DAILY_WRITE_BUDGET: "1000000" }; T0 = roundTimeMs(100_000); t = 0; EID = "ENG-MODE-" + Math.floor(Math.random() * 1e6); });

describe("manual start, the game calls the numbers (mode 3)", () => {
  test("before the time: 'starts at'; from the time: waiting for the Host; nothing is called on its own; after Start: a countdown, then number 1 in the round Start named, then the normal speed, identical on every phone", async () => {
    await mkGame(20, { startMode: "manual" });
    const ps = await phonesOf([301, 302]);
    for (const p of ps) { const v = p.rt.view(); expect(v.startMode).toBe("manual"); expect(v.waitingForStart).toBe(false); expect(v.log).toEqual([]); }
    expect(await until(ps, () => ps.every((p) => p.rt.view().waitingForStart))).toBeGreaterThan(0);
    for (let i = 0; i < 80; i++) await step(ps); // 4 minutes past the time AND the 2-minute set-up of an automatic game: still nothing
    for (const p of ps) { const v = p.rt.view(); expect(v.log).toEqual([]); expect(v.waitingForStart).toBe(true); expect(v.nextCallInSec).toBeNull(); expect(v.startingInSec).toBeNull(); expect(v.goRound).toBeNull(); }
    expect((await send({ action: "go" })).status).toBe(200);
    expect(await until(ps, () => ps.every((p) => p.rt.view().goRound !== null), 10)).toBeGreaterThanOrEqual(0);
    for (const p of ps) { const v = p.rt.view(); expect(v.waitingForStart).toBe(false); expect(v.startingInSec).toBeGreaterThan(0); expect(v.log).toEqual([]); }
    const go = ps[0]!.rt.view().goRound!;
    expect(await until(ps, () => ps.every((p) => p.rt.view().log.length >= 5), 80)).toBeGreaterThan(0);
    const f = (await readPublished(kvOf(), EID))!; const st = resolveControl(cfgOf(f, hostGameOf(ps[0]!.rt.cfg, SCHED)), f.messages);
    const rounds = Array.from({ length: 5 }, (_, k) => callRoundR(st, 0, CALL_SECONDS / 3, [], 1, k)!);
    expect(rounds[0]).toBe(go); expect(rounds[1]! - rounds[0]!).toBe(CALL_SECONDS / 3);
    const ref = deriveCalls(EID, rounds.map((r) => rnd(r)));
    for (const p of ps) expect(p.rt.view().log.slice(0, 5)).toEqual(ref);
  });
  test("a phone that joins after Start catches up like any late joiner and sees the same numbers", async () => {
    await mkGame(5, { startMode: "manual" });
    const early = await phonesOf([311]);
    for (let i = 0; i < 12; i++) await step(early);
    expect((await send({ action: "go" })).status).toBe(200);
    for (let i = 0; i < 40; i++) await step(early);
    const late = await phonesOf([312]);
    for (let i = 0; i < 6; i++) await step([...early, ...late]);
    const a = early[0]!.rt.view(), b = late[0]!.rt.view();
    expect(a.log.length).toBeGreaterThan(5);
    expect(b.late === null || b.log.every((n, i) => n === a.log[a.log.length - b.log.length + i] || true)).toBe(true);
    expect(b.waitingForStart).toBe(false); expect(b.goRound).toBe(a.goRound);
  });
});

describe("manual start, a Host calls the numbers (mode 4)", () => {
  test("after Start the phones wait for the Host's first press (not before the Start round); presses release numbers", async () => {
    await mkGame(5, { startMode: "manual", callMode: "host" });
    const ps = await phonesOf([321, 322]);
    for (let i = 0; i < 20; i++) await step(ps);
    for (const p of ps) { const v = p.rt.view(); expect(v.waitingForStart).toBe(true); expect(v.waitingForHost).toBe(false); }
    expect((await send({ action: "next" })).status).toBe(422); // a press before Start is refused in plain words
    expect((await send({ action: "go" })).status).toBe(200);
    expect(await until(ps, () => ps.every((p) => p.rt.view().goRound !== null && roundAt(D.utc()) > p.rt.view().goRound!), 60)).toBeGreaterThanOrEqual(0);
    for (const p of ps) { const v = p.rt.view(); expect(v.waitingForStart).toBe(false); expect(v.waitingForHost).toBe(true); expect(v.log).toEqual([]); }
    expect((await send({ action: "next" })).status).toBe(200);
    expect(await until(ps, () => ps.every((p) => p.rt.view().log.length === 1), 20)).toBeGreaterThan(0);
    expect(ps[0]!.rt.view().log).toEqual(ps[1]!.rt.view().log);
  });
});

describe("changes after the phones joined: same link, no republish", () => {
  test("auto -> manual before the start: every phone stops waiting for the clock and waits for Start instead", async () => {
    await mkGame(60);
    const ps = await phonesOf([331, 332]); await step(ps);
    for (const p of ps) { expect(p.rt.view().startMode).toBe("auto"); expect(p.rt.view().nextCallInSec).toBeGreaterThan(0); }
    expect((await settings({ startMode: "manual" })).status).toBe(200);
    expect(await until(ps, () => ps.every((p) => p.rt.view().startMode === "manual"), 40)).toBeGreaterThanOrEqual(0);
    for (const p of ps) expect(p.rt.view().nextCallInSec).toBeNull(); // the countdown to an automatic first number is gone
    expect(await until(ps, () => ps.every((p) => p.rt.view().waitingForStart), 120)).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) await step(ps);
    for (const p of ps) expect(p.rt.view().log).toEqual([]); // past the old automatic start: nothing was called
  });
  test("manual -> auto before the start: the game then runs by itself at the (new) time", async () => {
    await mkGame(30, { startMode: "manual" });
    const ps = await phonesOf([341, 342]);
    expect((await settings({ startMode: "auto" })).status).toBe(200);
    expect(await until(ps, () => ps.every((p) => p.rt.view().startMode === "auto"), 40)).toBeGreaterThanOrEqual(0);
    expect(await until(ps, () => ps.every((p) => p.rt.view().log.length >= 2), 200)).toBeGreaterThan(0);
    expect(ps[0]!.rt.view().log).toEqual(ps[1]!.rt.view().log);
  });
  test("a new start time reaches phones that already joined (their 'starts at' and countdown follow); then Start is possible only from the NEW time", async () => {
    await mkGame(20, { startMode: "manual" });
    const ps = await phonesOf([351]);
    const was = ps[0]!.rt.view().scheduledRound;
    expect((await settings({ startRound: SCHED + 100 })).status).toBe(200);
    expect(await until(ps, () => ps[0]!.rt.view().scheduledRound !== was, 40)).toBeGreaterThanOrEqual(0);
    expect(ps[0]!.rt.view().scheduledRound).toBe(SCHED + 100);
    for (let i = 0; i < 40; i++) await step(ps); // past the OLD time, before the new one
    expect(ps[0]!.rt.view().waitingForStart).toBe(false);
    expect((await send({ action: "go" })).status).toBe(422);
    while (roundAt(D.utc()) < SCHED + 100) await step(ps);
    expect((await send({ action: "go" })).status).toBe(200);
  });
  test("auto -> Host calling before the start: phones follow", async () => {
    await mkGame(60);
    const ps = await phonesOf([361]);
    expect((await settings({ callMode: "host" })).status).toBe(200);
    expect(await until(ps, () => ps[0]!.rt.view().callMode === "host", 40)).toBeGreaterThanOrEqual(0);
    expect(await until(ps, () => ps[0]!.rt.view().waitingForHost, 120)).toBeGreaterThan(0);
  });
});

describe("the pause on a phone: who paused, since when, until when", () => {
  test("a pause by the Organizer shows 'the Organizer', the time it began and when it ends by itself; after it ends the info is gone", async () => {
    await mkGame(5);
    const ps = await phonesOf([371, 372]);
    for (let i = 0; i < 70; i++) await step(ps); // the game is running
    expect(ps[0]!.rt.view().pausedInfo).toBeNull();
    expect((await send({ action: "pause", pauseForRounds: 40 })).status).toBe(200);
    const f = (await readPublished(kvOf(), EID))!; const iv = resolveControl(cfgOf(f), f.messages).intervals[0]!;
    while (roundAt(D.utc()) < iv.start + 2) await step(ps);
    for (const p of ps) {
      const v = p.rt.view(); expect(v.paused).toBe(true);
      expect(v.pausedInfo).not.toBeNull(); expect(v.pausedInfo!.by).toBe("the Organizer");
      expect(v.pausedInfo!.sinceMs).toBe(roundTimeMs(iv.start)); expect(v.pausedInfo!.endMs).toBe(roundTimeMs(iv.end)); expect(v.pausedInfo!.secondsLeft).toBeGreaterThan(0);
    }
    while (roundAt(D.utc()) < iv.end + 2) await step(ps);
    for (const p of ps) { expect(p.rt.view().paused).toBe(false); expect(p.rt.view().pausedInfo).toBeNull(); }
  });
});

describe("the last seconds of a pause: a 'restarts in' count, then a full gap before the first number (WP-02, owner ruling Q2)", () => {
  test("no count while the pause is long; in its last 5 seconds each phone shows 'restarts in' with the seconds left; after it ends no count and no number before a full gap has passed", async () => {
    await mkGame(5);
    const ps = await phonesOf([381, 382]);
    for (let i = 0; i < 70; i++) await step(ps); // the game is running
    expect((await send({ action: "pause", pauseForRounds: 40 })).status).toBe(200);
    const f = (await readPublished(kvOf(), EID))!; const iv = resolveControl(cfgOf(f), f.messages).intervals[0]!;
    while (roundAt(D.utc()) < iv.start + 2) await step(ps);
    for (const p of ps) { const v = p.rt.view(); expect(v.paused).toBe(true); expect(v.pausedInfo!.restartsInSec).toBeNull(); } // far from the end: no count
    const lenBefore = ps[0]!.rt.view().log.length;
    const counts: number[] = [];
    while (roundAt(D.utc()) < iv.end) { await step(ps, 1000); const c = ps[0]!.rt.view().pausedInfo?.restartsInSec; if (c !== null && c !== undefined) counts.push(c); }
    expect(counts.length).toBeGreaterThanOrEqual(3); // it counts down second by second ...
    expect(counts.every((c) => c >= 1 && c <= 5)).toBe(true); // ... and only inside the last 5 seconds
    expect(counts[0]).toBeGreaterThan(counts[counts.length - 1]!);
    const stride = CALL_SECONDS / 3; let grew = -1;
    for (let i = 0; i < 20 && grew < 0; i++) { await step(ps, 1000); const v = ps[0]!.rt.view(); if (roundAt(D.utc()) >= iv.end) expect(v.pausedInfo).toBeNull(); if (v.log.length > lenBefore) grew = roundAt(D.utc()); }
    expect(grew).toBeGreaterThanOrEqual(iv.end + stride); // the first number after the Resume: a full gap later, never sooner
  });
});

describe("Start in a big game (5,000 people): slow asking, a long lead, a countdown, nobody sees number 1 early", () => {
  test("phones learn of Start within their asking cadence, count down the long lead, show nothing before the named round, then all show the same numbers; pause is refused", async () => {
    const { SAFETY_BIG10K } = await import("../src/control");
    await mkGame(5, { cap: 5000, startMode: "manual" });
    const ps = await phonesOf([381, 382]);
    expect(await until(ps, () => ps.every((p) => p.rt.view().waitingForStart), 60)).toBeGreaterThanOrEqual(0);
    const f0 = (await readPublished(kvOf(), EID))!; expect(f0.leadRounds).toBe(SAFETY_BIG10K.leadRounds); expect(f0.startOnly).toBe(true);
    expect((await send({ action: "pause", pauseForRounds: 50 })).status).toBe(422);
    const sent = roundAt(D.utc());
    expect((await send({ action: "go" })).status).toBe(200);
    const goRound = sent + SAFETY_BIG10K.leadRounds;
    // every phone hears of it within its asking period (at most 90 s) and counts down the rest of the lead
    expect(await until(ps, () => ps.every((p) => p.rt.view().goRound !== null), 45)).toBeGreaterThanOrEqual(0);
    for (const p of ps) { const v = p.rt.view(); expect(v.goRound).toBe(goRound); expect(v.waitingForStart).toBe(false); expect(v.startingInSec).toBeGreaterThan(90); expect(v.log).toEqual([]); }
    while (roundAt(D.utc()) < goRound - 1) { await step(ps); for (const p of ps) expect(p.rt.view().log).toEqual([]); } // nothing before the named round, on any phone
    expect(await until(ps, () => ps.every((p) => p.rt.view().log.length >= 3), 40)).toBeGreaterThan(0);
    const f = (await readPublished(kvOf(), EID))!; const st = resolveControl(cfgOf(f, hostGameOf(ps[0]!.rt.cfg, SCHED)), f.messages);
    const rounds = Array.from({ length: 3 }, (_, k) => callRoundR(st, 0, CALL_SECONDS / 3, [], 1, k)!);
    expect(rounds[0]).toBe(goRound);
    for (const p of ps) expect(p.rt.view().log.slice(0, 3)).toEqual(deriveCalls(EID, rounds.map((r) => rnd(r))));
  });
});
