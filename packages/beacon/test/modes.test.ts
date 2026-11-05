import { describe, expect, test } from "bun:test";
import { ed25519 } from "@noble/curves/ed25519";
import { GO_REFUSALS, NEXT_LEAD_ROUNDS, NEXT_REFUSALS, callRound, publishControl, readPublished, registerKey, resolveControl, signControlWithSecret, describeControl, nextMessage, SAFETY_STANDARD, type ControlConfig, type ControlMsg, type KV, type UnsignedControl } from "../src";
import { callRoundR, hostGameOf } from "../src/game";
import { validateCfg } from "../src/config";

// The four modes = how it starts (auto | manual) x who calls (auto | host).
const ID = "MODE123";
const secret = Uint8Array.from({ length: 32 }, (_, i) => i + 7);
const secretHex = Array.from(secret, (b) => b.toString(16).padStart(2, "0")).join("");
const pub = Array.from(ed25519.getPublicKey(secret), (b) => b.toString(16).padStart(2, "0")).join("");
const SCHED = 5000; // the scheduled start round
const LEAD = 13; // SAFETY_STANDARD.leadRounds
const base: ControlConfig = { pubKey: pub, maxPauseRounds: 600, leadRounds: LEAD };
const manualAuto: ControlConfig = { ...base, startMode: "manual", startNotBefore: SCHED };
const manualHost: ControlConfig = { ...base, startMode: "manual", startNotBefore: SCHED, callMode: "host", hostGaps: [], maxNexts: 90 };
const mk = (seq: number, action: UnsignedControl["action"], at: number, signedAt: number, until?: number): ControlMsg =>
  signControlWithSecret(secretHex, { engagementId: ID, seq, action, atBeaconRound: at, signedAtRound: signedAt, untilRound: until });
const go = (seq: number, signedAt: number, lead = LEAD) => mk(seq, "go", signedAt + lead, signedAt);
const nx = (seq: number, signedAt: number) => mk(seq, "next", signedAt + NEXT_LEAD_ROUNDS, signedAt);
const kv = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) }; };
const STRIDE = 3, NO_BREAKS: never[] = [];

describe("manual start, software calls (mode 3)", () => {
  test("before Start nothing is ever called: every call is a round that never arrives", () => {
    const st = resolveControl(manualAuto, []);
    expect(st.manualStart).toBe(true); expect(st.goRound).toBeNull();
    for (const k of [0, 1, 89]) expect(callRound(st, SCHED + 40, STRIDE, k)).toBe(Infinity);
    expect(callRoundR(st, SCHED + 40, STRIDE, NO_BREAKS, 1, 0)).toBe(Infinity);
  });
  test("Start pressed after the scheduled time: number 1 comes in exactly the round Start named, the rest follow at the chosen speed", () => {
    const st = resolveControl(manualAuto, [go(1, SCHED + 100)]);
    expect(st.ignored).toEqual([]); expect(st.goRound).toBe(SCHED + 100 + LEAD);
    expect(callRound(st, SCHED + 40, STRIDE, 0)).toBe(SCHED + 100 + LEAD);
    expect(callRound(st, SCHED + 40, STRIDE, 5)).toBe(SCHED + 100 + LEAD + 5 * STRIDE);
    expect(callRoundR(st, SCHED + 40, STRIDE, NO_BREAKS, 1, 0)).toBe(SCHED + 100 + LEAD);
  });
  test("the scheduled time itself is the earliest a Start can be signed; one round earlier is refused with the plain words", () => {
    expect(resolveControl(manualAuto, [go(1, SCHED - 1)]).ignored).toEqual([{ seq: 1, why: GO_REFUSALS.early }]);
    expect(resolveControl(manualAuto, [go(1, SCHED)]).ignored).toEqual([]);
    expect(GO_REFUSALS.early).toContain("change the start time");
  });
  test("a second Start does nothing: the first one stands", () => {
    const st = resolveControl(manualAuto, [go(1, SCHED + 10), go(2, SCHED + 20)]);
    expect(st.goRound).toBe(SCHED + 10 + LEAD); expect(st.ignored).toEqual([{ seq: 2, why: GO_REFUSALS.again }]);
  });
  test("Start with too little lead (or an end round) is refused: phones must have it before the round arrives", () => {
    expect(resolveControl(manualAuto, [go(1, SCHED + 10, LEAD - 1)]).ignored[0]?.why).toBe(GO_REFUSALS.lead);
    expect(resolveControl(manualAuto, [mk(1, "go", SCHED + 10 + LEAD, SCHED + 10, SCHED + 99)]).ignored[0]?.why).toBe(GO_REFUSALS.lead);
  });
  test("a pause after Start pushes the later calls by its length, as always", () => {
    const g = SCHED + 10 + LEAD;
    const st = resolveControl(manualAuto, [go(1, SCHED + 10), mk(2, "pause", g + 30, g + 10, g + 40), ]);
    expect(st.ignored).toEqual([]);
    expect(callRound(st, 0, STRIDE, 0)).toBe(g);
    expect(callRound(st, 0, STRIDE, 20)).toBe(g + 60 + 10); // call 20 = g+60 >= pause start g+30: pushed by 10
  });
  test("a stop before Start ends the game: nothing is ever called (null, not 'never yet')", () => {
    const st = resolveControl(manualAuto, [mk(1, "stop", SCHED + 50, SCHED + 30)]);
    expect(callRound(st, 0, STRIDE, 0)).toBeNull();
  });
  test("Start in a game that starts by itself is refused in plain words", () => {
    const st = resolveControl({ ...base }, [go(1, SCHED + 10)]);
    expect(st.ignored).toEqual([{ seq: 1, why: GO_REFUSALS.auto }]); expect(st.goRound).toBeNull();
    expect(callRound(st, 1000, STRIDE, 0)).toBe(1000); // the normal schedule is untouched
  });
});

describe("manual start, Host calls (mode 4)", () => {
  test("a press before Start is refused; after Start the first press may come from the Start round on, not earlier", () => {
    const early = resolveControl(manualHost, [nx(1, SCHED + 5)]);
    expect(early.ignored).toEqual([{ seq: 1, why: NEXT_REFUSALS.start }]); expect(early.nextRounds).toEqual([]);
    const g = SCHED + 10 + LEAD;
    const st = resolveControl(manualHost, [go(1, SCHED + 10), nx(2, g - NEXT_LEAD_ROUNDS - 1), nx(3, g - NEXT_LEAD_ROUNDS), nx(4, g + 10)]);
    expect(st.ignored).toEqual([{ seq: 2, why: NEXT_REFUSALS.early }]);
    expect(st.nextRounds).toEqual([g, g + 12]);
    expect(callRound(st, 0, STRIDE, 0)).toBe(g); expect(callRound(st, 0, STRIDE, 1)).toBe(g + 12); expect(callRound(st, 0, STRIDE, 2)).toBe(Infinity);
  });
  test("before the press the schedule is a round that never arrives (waiting for the Host)", () => {
    expect(callRound(resolveControl(manualHost, []), 0, STRIDE, 0)).toBe(Infinity);
  });
});

describe("automatic start (modes 1 and 2) is exactly as before", () => {
  test("auto start / host calling: a press needs no Start", () => {
    const h: ControlConfig = { ...base, callMode: "host", hostGaps: [], maxNexts: 90 };
    const st = resolveControl(h, [nx(1, 1000)]);
    expect(st.ignored).toEqual([]); expect(st.manualStart).toBe(false); expect(st.goRound).toBeNull(); expect(st.nextRounds).toEqual([1002]);
  });
  test("auto start / software calling: start + k*stride", () => {
    expect(callRound(resolveControl(base, []), 1000, 2, 7)).toBe(1014);
  });
});

describe("settings -> config", () => {
  test("startMode manual / auto is validated, kept when a later save leaves it out, and dropped when set to auto", () => {
    const a = validateCfg({ startMode: "manual" }); expect(a.ok && a.cfg.startMode).toBe("manual");
    const b = validateCfg({ tickets: 1 }, (a as any).cfg); expect(b.ok && b.cfg.startMode).toBe("manual");
    const c = validateCfg({ startMode: "auto" }, (a as any).cfg); expect(c.ok && c.cfg.startMode).toBeUndefined();
    const d = validateCfg({ startMode: "tomorrow" }); expect(d.ok).toBe(false);
  });
  test("hostGameOf carries the start mode and the scheduled round", () => {
    const v = validateCfg({ startMode: "manual", callMode: "host" }) as any;
    expect(hostGameOf(v.cfg, 4000)).toMatchObject({ callMode: "host", startMode: "manual", startNotBefore: 4000 });
    expect(hostGameOf((validateCfg({}) as any).cfg).startMode).toBe("auto");
  });
});

describe("publishing a Start", () => {
  test("the store accepts a Start after the scheduled time, refuses an early or repeated one in plain words, and shows it in describeControl", async () => {
    const store = kv();
    expect((await registerKey(store, ID, pub, SAFETY_STANDARD)).ok).toBe(true);
    const game = { callMode: "auto" as const, startMode: "manual" as const, startNotBefore: SCHED };
    const f0 = (await readPublished(store, ID))!;
    const early = await publishControl(store, ID, signControlWithSecret(secretHex, nextMessage(f0, SCHED - 5, { action: "go" })), game);
    expect(early).toMatchObject({ ok: false, status: 422, error: GO_REFUSALS.early });
    const ok = await publishControl(store, ID, signControlWithSecret(secretHex, nextMessage(f0, SCHED + 5, { action: "go" })), game);
    expect(ok.ok).toBe(true);
    const f1 = (await readPublished(store, ID))!;
    const again = await publishControl(store, ID, signControlWithSecret(secretHex, nextMessage(f1, SCHED + 9, { action: "go" })), game);
    expect(again).toMatchObject({ ok: false, error: GO_REFUSALS.again });
    expect(describeControl(f1, SCHED + 6, game)).toMatchObject({ goRound: SCHED + 5 + SAFETY_STANDARD.leadRounds });
    // an automatic-start game refuses Start
    const s2 = kv(); await registerKey(s2, ID, pub, SAFETY_STANDARD);
    const r = await publishControl(s2, ID, signControlWithSecret(secretHex, nextMessage((await readPublished(s2, ID))!, SCHED + 5, { action: "go" })), { callMode: "auto" });
    expect(r).toMatchObject({ ok: false, error: GO_REFUSALS.auto });
  });
});

describe("Start at any size: the profile maths and the start-only file", () => {
  test("each size has a profile; the Start lead is longer than the slowest asking cadence plus the cache and the latency (so every online phone hears Start before its round); profiles are told apart by their lead", async () => {
    const { startSafetyForCap, ALL_SAFETIES, SAFETY_BIG, SAFETY_BIG10K, SAFETY_LEAN60, SAFETY_LEAN30, safetyForCap } = await import("../src/control");
    expect(startSafetyForCap(250).safety).toBe(safetyForCap(250)!); expect(startSafetyForCap(1000).safety).toBe(SAFETY_LEAN30); expect(startSafetyForCap(2000)).toEqual({ safety: SAFETY_LEAN60, startOnly: false });
    for (const cap of [2001, 5000, 10000]) expect(startSafetyForCap(cap)).toEqual({ safety: SAFETY_BIG10K, startOnly: true });
    for (const cap of [10001, 50000, 100000]) expect(startSafetyForCap(cap)).toEqual({ safety: SAFETY_BIG, startOnly: true });
    for (const s of [SAFETY_LEAN60, SAFETY_BIG10K, SAFETY_BIG]) { expect(s.leadRounds * 3).toBeGreaterThan(s.pollMaxSec + 3 + 3); expect(s.holdAfterRounds * 3).toBeGreaterThanOrEqual(s.pollMaxSec * 2); } // a phone is "live" for at least two asking periods
    expect(new Set(ALL_SAFETIES.map((s) => s.leadRounds)).size).toBe(ALL_SAFETIES.length); // a phone finds the profile of its game from the lead in the control file
    expect(SAFETY_BIG10K.leadRounds * 3).toBeGreaterThanOrEqual(150); expect(SAFETY_BIG10K.leadRounds * 3).toBeLessThanOrEqual(240); expect(SAFETY_BIG.leadRounds * 3).toBeLessThanOrEqual(300);
  });
  test("before the Start message is in a phone's log, number 1 does not exist for it, whatever the profile; after it, it is the named round", async () => {
    const { SAFETY_BIG } = await import("../src/control");
    const big: ControlConfig = { ...manualAuto, leadRounds: SAFETY_BIG.leadRounds, startOnly: true };
    expect(callRound(resolveControl(big, []), 0, 3, 0)).toBe(Infinity);
    const st = resolveControl(big, [go(1, SCHED + 10, SAFETY_BIG.leadRounds)]);
    expect(st.ignored).toEqual([]); expect(callRound(st, 0, 3, 0)).toBe(SCHED + 10 + SAFETY_BIG.leadRounds);
    expect(resolveControl(big, [go(1, SCHED + 10, SAFETY_BIG.leadRounds - 1)]).ignored[0]?.why).toBe(GO_REFUSALS.lead); // a phone applies the same lead rule as the Worker
  });
  test("a start-only file refuses pause, resume, extend and end in plain words and never lets them take effect; Start still works", async () => {
    const { BIG_GAME_REFUSAL, SAFETY_BIG10K } = await import("../src/control");
    const big: ControlConfig = { ...manualAuto, leadRounds: SAFETY_BIG10K.leadRounds, startOnly: true };
    const L2 = SAFETY_BIG10K.leadRounds;
    const st = resolveControl(big, [go(1, SCHED + 10, L2), mk(2, "pause", SCHED + 400, SCHED + 10, SCHED + 500), mk(3, "stop", SCHED + 400, SCHED + 10), mk(4, "resume", SCHED + 400, SCHED + 10)]);
    expect(st.ignored.map((x) => x.why)).toEqual([BIG_GAME_REFUSAL, BIG_GAME_REFUSAL, BIG_GAME_REFUSAL]); expect(st.intervals).toEqual([]); expect(st.stopRound).toBeNull();
    expect(callRound(st, 0, 3, 5)).toBe(SCHED + 10 + L2 + 15);
  });
  test("a pause by the Worker's store is refused the same way (publish)", async () => {
    const { BIG_GAME_REFUSAL, SAFETY_BIG } = await import("../src/control");
    const store = kv(); expect((await registerKey(store, ID, pub, SAFETY_BIG, 600, { startOnly: true })).ok).toBe(true);
    const f = (await readPublished(store, ID))!; expect(f.startOnly).toBe(true); expect(f.leadRounds).toBe(SAFETY_BIG.leadRounds);
    const game = { callMode: "auto" as const, startMode: "manual" as const, startNotBefore: SCHED };
    const r = await publishControl(store, ID, signControlWithSecret(secretHex, nextMessage(f, SCHED + 5, { action: "pause", pauseForRounds: 50 })), game);
    expect(r).toMatchObject({ ok: false, error: BIG_GAME_REFUSAL });
    const ok = await publishControl(store, ID, signControlWithSecret(secretHex, nextMessage(f, SCHED + 5, { action: "go" })), game);
    expect(ok.ok).toBe(true);
  });
});
