// The four game modes (start x play), the Worker's part: the settings (startMode, callMode), changes after publishing without a new link, the Start press, the plain
// "what changed, who, when" list, the safe rule for a game nobody starts, and the permissions of each role.
import { beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { BIG_GAME_REFUSAL, GO_REFUSALS, NEXT_REFUSALS, SAFETY_BIG, SAFETY_BIG10K, SAFETY_LEAN60, nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";
import { endBoundMs, NEVER_STARTED_MS } from "../src/lifecycle";
import { NEEDS_CONSOLE_MSG, NOT_BEFORE_MSG, STARTED_MSG } from "../src/modes";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400; // two hours ahead
const AT = T + 2 * 3_600_000; // the scheduled moment
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const ORG = "11".repeat(32), HOST = "22".repeat(32);
const kv = (): KV => ({ get: async (k) => (raw.query("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} });

async function organizer() {
  const s = await j(await call("POST", "/api/start", { email: "boss@acme.com" }));
  return { token: s.token as string, h: { "x-organizer": s.token as string } };
}
async function host(o: { token: string }) {
  const r = await j(await call("POST", "/api/org/host", { label: "Priya", mobile: "9822200011", email: "host@acme.com" }, { "x-organizer": o.token }));
  raw.prepare("UPDATE host_state SET verified_ms=?, mobile_ok=1").run(T);
  return { key: r.hostKey as string, h: { "x-organizer": r.hostKey as string } };
}
const make = (o: { token: string }, id: string, over: Record<string, unknown> = {}) => call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, ...over }, { "x-organizer": o.token });
const publish = (o: { token: string }, id: string) => call("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, { "x-organizer": o.token });
const signed = async (id: string, secret: string, now: number, a: Parameters<typeof nextMessage>[2]) => signControlWithSecret(secret, nextMessage((await readPublished(kv(), id))!, roundAt(now), a));
const post = async (id: string, msg: unknown, now = AT) => { const r = await call("POST", `/api/z/${id}/control`, { message: msg }, {}, now); return { status: r.status, body: await j(r) }; };
const P = { "x-organizer": "plat" }; // big games are made with the platform key (an organizer needs a bought pack, and none that large exists)
const mkP = (id: string, over: Record<string, unknown> = {}) => call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, ...over }, P);
const info = async (id: string, h: Record<string, string> = {}, now = T) => j(await call("GET", `/api/z/${id}/info`, undefined, h, now));
const control = async (id: string, now = T) => j(await call("GET", `/api/z/${id}/control`, undefined, {}, now));
const changes = async (id: string, h: Record<string, string>, now = T) => j(await call("GET", `/api/z/${id}/changes`, undefined, h, now));
/** a paid, published game with the organizer's key registered (what the console does when it opens) */
async function live(id: string, over: Record<string, unknown> = {}) {
  const o = await organizer();
  expect((await make(o, id, over)).status).toBe(200); await publish(o, id);
  raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id);
  expect((await call("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret(ORG) }, o.h)).status).toBe(200);
  return o;
}

beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" } as any; });

describe("the four modes are two plain settings", () => {
  test("startMode is saved at creation and in the settings, shown to phones, defaults to auto, and a bad value is refused in plain words", async () => {
    const o = await organizer();
    expect((await make(o, "MD-1")).status).toBe(200);
    expect((await info("MD-1", o.h)).startMode).toBe("auto");
    expect((await call("PATCH", "/api/z/MD-1/settings", { startMode: "manual" }, o.h)).status).toBe(200);
    expect((await info("MD-1", o.h)).startMode).toBe("manual");
    expect((await j(await call("GET", "/api/z/MD-1/summary", undefined, o.h))).startMode).toBe("manual");
    expect((await j(await call("PATCH", "/api/z/MD-1/settings", { startMode: "auto" }, o.h))).startMode).toBe("auto");
    expect((await make(o, "MD-2", { startMode: "manual", callMode: "host" })).status).toBe(200);
    const i2 = await info("MD-2", o.h); expect([i2.startMode, i2.callMode]).toEqual(["manual", "host"]);
    const bad = await call("PATCH", "/api/z/MD-1/settings", { startMode: "tomorrow" }, o.h);
    expect(bad.status).toBe(400); expect((await j(bad)).error).toMatch(/How does the game start/);
  });
  test("all four combinations can be made and read back", async () => {
    const o = await organizer();
    for (const [n, s, c] of [["A", "auto", "auto"], ["B", "auto", "host"], ["C", "manual", "auto"], ["D", "manual", "host"]] as const) {
      expect((await make(o, `M-4${n}`, { startMode: s, callMode: c })).status).toBe(200);
      const i = await info(`M-4${n}`, o.h); expect([i.startMode, i.callMode]).toEqual([s, c]);
    }
  });
  test("above 1,000 people only manual PLAY is refused (Start by hand stays); 1,000 allows all four; shrinking back re-allows it", async () => {
    const o = await organizer(); const P = { "x-organizer": "plat" };
    const host = await mkP("M-BIG", { cap: 5000, callMode: "host" });
    expect(host.status).toBe(409); expect((await j(host)).error).toMatch(/Games above 1,000 people are called by the game itself: choose "The game does"\. You can still press Start yourself/);
    for (const [id, sm, cm, cap, ok] of [["M-A1000", "auto", "auto", 1000, 1], ["M-B1000", "auto", "host", 1000, 1], ["M-C1000", "manual", "auto", 1000, 1], ["M-D1000", "manual", "host", 1000, 1], ["M-A1001", "auto", "auto", 1001, 1], ["M-B1001", "auto", "host", 1001, 0], ["M-C1001", "manual", "auto", 1001, 1], ["M-D1001", "manual", "host", 1001, 0]] as const) {
      const r = await mkP(id, { cap, startMode: sm, callMode: cm }); expect([id, r.status]).toEqual([id, ok ? 200 : 409]);
    }
    // a game that uses manual play cannot grow past 1,000, but one that only presses Start can; switching manual play on above 1,000 is refused; shrinking re-allows
    expect((await call("PATCH", "/api/z/M-D1000/settings", { cap: 1001 }, P)).status).toBe(409);
    expect((await call("PATCH", "/api/z/M-C1000/settings", { cap: 1500 }, P)).status).toBe(200);
    const sw = await call("PATCH", "/api/z/M-C1000/settings", { callMode: "host" }, P); expect(sw.status).toBe(409); expect((await j(sw)).error).toMatch(/choose "The game does"/);
    expect((await call("PATCH", "/api/z/M-C1000/settings", { cap: 1000, callMode: "host" }, P)).status).toBe(200);
    expect((await call("PATCH", "/api/z/M-D1000/settings", { cap: 1001, callMode: "auto" }, P)).status).toBe(200);
    // pressing Start has no size limit
    for (const cap of [2000, 2001, 10000, 10001, 100000]) expect([cap, (await mkP(`M-C${cap}`, { cap, startMode: "manual" })).status]).toEqual([cap, 200]);
  });
});

describe("after publishing: every setting can change until the start, with the same links", () => {
  test("the organizer AND a Host switch the mode and move the time after publishing; the control file phones poll follows at once; nothing is republished", async () => {
    const o = await live("M-PUB"); const h = await host(o);
    const link = "/api/z/M-PUB/info";
    expect((await call("GET", link)).status).toBe(200);
    expect((await call("PATCH", "/api/z/M-PUB/settings", { startMode: "manual" }, o.h)).status).toBe(200);
    let c = await control("M-PUB"); expect(c.live).toMatchObject({ startMode: "manual", callMode: "auto", startRound: START });
    expect((await call("PATCH", "/api/z/M-PUB/settings", { callMode: "host", startRound: START + 600 }, h.h)).status).toBe(200); // a Host may do it too
    c = await control("M-PUB"); expect(c.live).toMatchObject({ startMode: "manual", callMode: "host", startRound: START + 600 });
    const i = await info("M-PUB"); expect([i.startMode, i.callMode, i.startRound]).toEqual(["manual", "host", START + 600]); // the same address, new state
    expect((await call("PATCH", "/api/z/M-PUB/settings", { startMode: "auto", callMode: "auto" }, o.h)).status).toBe(200);
    c = await control("M-PUB"); expect(c.live).toMatchObject({ startMode: "auto", callMode: "auto" });
    expect(c.pubKey).toBe(publicKeyFromSecret(ORG)); // the same key and file, only the live settings moved
  });
  test("a switch to a mode that needs signed buttons, with people already in and no key registered, is refused kindly (open the console first)", async () => {
    const o = await organizer(); await make(o, "M-NK"); await publish(o, "M-NK"); raw.prepare("UPDATE engagement SET pack=100 WHERE id='M-NK'").run();
    expect((await call("POST", "/api/z/M-NK/join", { phone: "9810000001", name: "Asha" })).status).toBe(200);
    const r = await call("PATCH", "/api/z/M-NK/settings", { startMode: "manual" }, o.h);
    expect(r.status).toBe(409); expect((await j(r)).error).toBe(NEEDS_CONSOLE_MSG);
    expect((await call("PUT", "/api/z/M-NK/control/key", { publicKey: publicKeyFromSecret(ORG) }, o.h)).status).toBe(200);
    expect((await call("PATCH", "/api/z/M-NK/settings", { startMode: "manual" }, o.h)).status).toBe(200);
  });
  test("an automatic-start game still locks at its start time, as before", async () => {
    const o = await live("M-LOCK");
    const r = await call("PATCH", "/api/z/M-LOCK/settings", { callMode: "host" }, o.h, AT + 60_000);
    expect(r.status).toBe(409); expect((await j(r)).error).toMatch(/already started/);
  });
});

describe("the Start press", () => {
  test("Start before the scheduled time is refused in plain words (server clock and signature rule); at the time it goes through; a second press is refused", async () => {
    const o = await live("M-GO", { startMode: "manual" });
    const early = await post("M-GO", await signed("M-GO", ORG, AT - 60_000, { action: "go" }), AT - 60_000);
    expect(early.status).toBe(422); expect(early.body.error).toBe(NOT_BEFORE_MSG);
    expect((await call("GET", "/api/z/M-GO/changes", undefined, o.h)).status).toBe(200);
    const skewed = await post("M-GO", await signed("M-GO", ORG, AT + 60_000, { action: "go" }), AT - 60_000); // a console whose own clock runs ahead cannot start it early either
    expect(skewed.status).toBe(422); expect(skewed.body.error).toBe(NOT_BEFORE_MSG);
    const at = AT + 10_000;
    const go = await signed("M-GO", ORG, at, { action: "go" });
    expect(await post("M-GO", go, at)).toEqual({ status: 200, body: { ok: true, seq: 1 } });
    expect((await post("M-GO", go, at)).body.duplicate).toBe(true);
    const again = await post("M-GO", await signed("M-GO", ORG, at + 9000, { action: "go" }), at + 9000);
    expect(again.status).toBe(422); expect(again.body.error).toBe(GO_REFUSALS.again);
    const ch = await changes("M-GO", o.h, at + 20_000);
    expect(ch.started).toBe(true); expect(ch.changes.map((x: any) => x.what)).toContain("Start was pressed");
  });
  test("Start in a game that starts by itself is refused: there is no Start button there", async () => {
    await live("M-AUTO");
    const r = await post("M-AUTO", await signed("M-AUTO", ORG, AT + 5000, { action: "go" }), AT + 5000);
    expect(r.status).toBe(422); expect(r.body.error).toBe(GO_REFUSALS.auto);
  });
  test("manual start + Host calls: a press before Start is refused, after Start it is accepted", async () => {
    await live("M-HP", { startMode: "manual", callMode: "host", callSeconds: 6 });
    const t = AT + 5000;
    const early = await post("M-HP", await signed("M-HP", ORG, t, { action: "next" }), t);
    expect(early.status).toBe(422); expect(early.body.error).toBe(NEXT_REFUSALS.start);
    expect((await post("M-HP", await signed("M-HP", ORG, t + 1000, { action: "go" }), t + 1000)).status).toBe(200);
    const go = (await control("M-HP", t + 1000)).messages[0].atBeaconRound;
    const tooSoon = await post("M-HP", await signed("M-HP", ORG, t + 3000, { action: "next" }), t + 3000); // the lead of Start (about 40 s) has not passed yet
    expect(tooSoon.status).toBe(422); expect(tooSoon.body.error).toBe(NEXT_REFUSALS.early);
    const ok = await post("M-HP", await signed("M-HP", ORG, (go * 3 + 1692803367) * 1000 + 1000, { action: "next" }), (go * 3 + 1692803367) * 1000 + 1000);
    expect(ok.status).toBe(200);
  });
  test("a Host's own key can press Start; the list says a Host did", async () => {
    const o = await live("M-HK", { startMode: "manual" }); const h = await host(o);
    expect((await call("PUT", "/api/z/M-HK/control/key", { publicKey: publicKeyFromSecret(HOST) }, h.h)).status).toBe(200);
    const t = AT + 5000;
    expect((await post("M-HK", await signed("M-HK", HOST, t, { action: "go" }), t)).status).toBe(200);
    expect((await changes("M-HK", h.h, t + 1000)).changes[0]).toMatchObject({ who: "A Host", what: "Start was pressed" });
  });
});

describe("a manual-start game waiting past its time", () => {
  test("it is still changeable until Start: the time can move, other settings can change; after Start nothing can", async () => {
    const o = await live("M-WAIT", { startMode: "manual" });
    const late = AT + 30 * 60_000;
    const keep = await call("PATCH", "/api/z/M-WAIT/settings", { callSeconds: 12 }, o.h, late); // same (past) time kept: allowed while nobody has pressed Start
    expect(keep.status).toBe(200);
    const past = await call("PATCH", "/api/z/M-WAIT/settings", { startRound: roundAt(T) + 10 }, o.h, late);
    expect(past.status).toBe(400); expect((await j(past)).error).toMatch(/Press Start, or pick a new start time/);
    expect((await call("PATCH", "/api/z/M-WAIT/settings", { startRound: roundAt(late) + 1200 }, o.h, late)).status).toBe(200);
    expect((await info("M-WAIT", {}, late)).startRound).toBe(roundAt(late) + 1200);
    // Start is again impossible before the NEW time, possible at it
    const newAt = (roundAt(late) + 1200 - 1) * 3000 + 1692803367000;
    expect((await post("M-WAIT", await signed("M-WAIT", ORG, late + 60_000, { action: "go" }), late + 60_000)).status).toBe(422);
    expect((await post("M-WAIT", await signed("M-WAIT", ORG, newAt + 1000, { action: "go" }), newAt + 1000)).status).toBe(200);
    const locked = await call("PATCH", "/api/z/M-WAIT/settings", { callSeconds: 9, startRound: roundAt(newAt) + 5000 }, o.h, newAt + 5000);
    expect(locked.status).toBe(409); expect((await j(locked)).error).toBe(STARTED_MSG);
  });
  test("nobody presses Start: the system never starts it; the game is treated as ended a day after its time (its guest data goes on the usual clock)", async () => {
    await live("M-NEVER", { startMode: "manual" });
    const e = raw.query("SELECT * FROM engagement WHERE id='M-NEVER'").get() as any;
    const end = await endBoundMs(env as any, e);
    expect(end).toBe((1692803367 + (e.start_round - 1) * 3) * 1000 + NEVER_STARTED_MS);
    const c = await control("M-NEVER", AT + 3 * 3_600_000); expect(c.messages).toEqual([]); // no message, so no phone ever starts
  });
  test("a person who joins before Start is not a late joiner; one who joins after the Start round is", async () => {
    await live("M-LATE", { startMode: "manual" });
    const before = await j(await call("POST", "/api/z/M-LATE/join", { phone: "9810000011", name: "A" }, {}, AT + 600_000));
    expect(before.jr ?? 0).toBe(0);
    expect((await post("M-LATE", await signed("M-LATE", ORG, AT + 700_000, { action: "go" }), AT + 700_000)).status).toBe(200);
    const after = await j(await call("POST", "/api/z/M-LATE/join", { phone: "9810000012", name: "B" }, {}, AT + 900_000));
    expect(after.jr).toBeGreaterThan(0);
  });
});

describe("what changed, who, when", () => {
  test("every save is listed in plain words with the role and the time; the Host sees it too; nobody else does; no player data in it", async () => {
    const o = await live("M-LOG"); const h = await host(o);
    await call("POST", "/api/z/M-LOG/join", { phone: "9810000099", name: "Zainab Secret" });
    await call("PATCH", "/api/z/M-LOG/settings", { startMode: "manual", startRound: START + 300 }, o.h, T + 1000);
    await call("PATCH", "/api/z/M-LOG/settings", { callMode: "host" }, h.h, T + 2000);
    const lo = await changes("M-LOG", o.h, T + 3000);
    expect(lo.changes.length).toBe(3);
    expect(lo.changes[0]).toMatchObject({ who: "A Host", what: "Who calls the numbers: now a Host (was: the game)" });
    expect(lo.changes.map((x: any) => x.what).join("|")).toMatch(/Start time changed from .* to .*IST/);
    expect(lo.changes.map((x: any) => x.what).join("|")).toMatch(/now you press Start/);
    expect(lo.changes.every((x: any) => x.who && x.when && x.at)).toBe(true);
    expect(JSON.stringify(lo)).not.toMatch(/Zainab|9810000099|ctk_|cth_/);
    expect(JSON.stringify(await changes("M-LOG", h.h, T + 3000))).toBe(JSON.stringify(lo));
    expect((await call("GET", "/api/z/M-LOG/changes")).status).toBe(403); // a player or a stranger cannot read it
    // an identical save adds nothing
    await call("PATCH", "/api/z/M-LOG/settings", { callMode: "host" }, o.h, T + 4000);
    expect((await changes("M-LOG", o.h, T + 5000)).changes.length).toBe(3);
  });
  test("the same list is kept in the permanent game record, still without player data", async () => {
    const o = await live("M-REC");
    await call("PATCH", "/api/z/M-REC/settings", { startMode: "manual" }, o.h, T + 1000);
    const { keepGameRecord } = await import("../src/gamerecord");
    await keepGameRecord(env.DB as any, raw.query("SELECT * FROM engagement WHERE id='M-REC'").get(), T + 2000);
    const rec = JSON.parse((raw.query("SELECT settings FROM game_record WHERE eid='M-REC'").get() as any).settings);
    expect(rec.startMode).toBe("manual");
    expect(rec.changeLog[0]).toMatchObject({ who: "The Organizer" }); expect(rec.changeLog[0].what).toMatch(/now you press Start/);
  });
  test("a Co-host cannot change the settings or read the list", async () => {
    const o = await live("M-CO");
    const co = (await j(await call("POST", "/api/org/cohost", { label: "Ravi", phone: "9876500001", e: "M-CO" }, o.h))).cohostKey as string;
    const r = await call("PATCH", "/api/z/M-CO/settings", { startMode: "manual" }, { "x-organizer": co });
    expect(r.status === 400 || r.status === 403).toBe(true);
    expect((await call("GET", "/api/z/M-CO/changes", undefined, { "x-organizer": co })).status).not.toBe(200);
    expect((await info("M-CO", o.h)).startMode).toBe("auto");
  });
});

describe("pressing Start at any size: its own control-file profile, a longer lead, no pause", () => {
  const bigGame = async (id: string, cap: number) => {
    expect((await mkP(id, { cap, startMode: "manual" })).status).toBe(200);
    raw.prepare("UPDATE engagement SET pack=? WHERE id=?").run(cap, id);
    return { h: P };
  };
  test("the signing key registers at 2,000 / 2,001 / 10,000 / 10,001 / 100,000 with the profile of that size; only above 2,000 is the file start-only; the lead grows with the size", async () => {
    const expected: [number, number, boolean][] = [[2000, SAFETY_LEAN60.leadRounds, false], [2001, SAFETY_BIG10K.leadRounds, true], [10000, SAFETY_BIG10K.leadRounds, true], [10001, SAFETY_BIG.leadRounds, true], [100000, SAFETY_BIG.leadRounds, true]];
    for (const [cap, lead, only] of expected) {
      const id = `M-K${cap}`; const o = await bigGame(id, cap);
      const k = await call("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret(ORG) }, o.h); expect([cap, k.status]).toEqual([cap, 200]);
      const f = await control(id); expect([cap, f.leadRounds, !!f.startOnly]).toEqual([cap, lead, only]);
    }
    expect(SAFETY_BIG10K.leadRounds).toBeGreaterThan(SAFETY_LEAN60.leadRounds); expect(SAFETY_BIG.leadRounds).toBeGreaterThan(SAFETY_BIG10K.leadRounds);
    expect(SAFETY_BIG10K.leadRounds * 3).toBeGreaterThanOrEqual(150); expect(SAFETY_BIG10K.leadRounds * 3).toBeLessThanOrEqual(240); // about 2.5 to 4 minutes
    expect(SAFETY_BIG.leadRounds * 3).toBeLessThanOrEqual(300);
  });
  test("a big game that does NOT press Start still has no key (as before): the message says pause is for up to 2,000 people", async () => {
    const o = { h: P }; await mkP("M-AUTO5K", { cap: 5000 }); raw.prepare("UPDATE engagement SET pack=5000 WHERE id='M-AUTO5K'").run();
    const k = await call("PUT", "/api/z/M-AUTO5K/control/key", { publicKey: publicKeyFromSecret(ORG) }, o.h); expect(k.status).toBe(409); expect((await j(k)).error).toMatch(/up to 2,000 participants/);
  });
  test("Start in a 5,000-person game: refused before the time, accepted at it, named a full profile lead ahead; a Start with the small-game lead is refused; pause, resume, extend and end are refused in plain words", async () => {
    const o = await bigGame("M-S5K", 5000); expect((await call("PUT", "/api/z/M-S5K/control/key", { publicKey: publicKeyFromSecret(ORG) }, o.h)).status).toBe(200);
    const early = await post("M-S5K", await signed("M-S5K", ORG, AT - 60_000, { action: "go" }), AT - 60_000);
    expect(early.status).toBe(422); expect(early.body.error).toBe(NOT_BEFORE_MSG);
    const t = AT + 10_000, f0 = (await readPublished(kv(), "M-S5K"))!;
    const short = signControlWithSecret(ORG, { engagementId: "M-S5K", seq: 1, action: "go", atBeaconRound: roundAt(t) + 13, signedAtRound: roundAt(t) }); // the lead of a small game is not enough for 5,000 phones
    const refusedShort = await post("M-S5K", short, t); expect(refusedShort.status).toBe(422); expect(refusedShort.body.error).toBe(GO_REFUSALS.lead);
    for (const action of ["pause", "extend", "stop"] as const) { const r = await post("M-S5K", await signed("M-S5K", ORG, t + 1000, { action, ...(action === "pause" ? { pauseForRounds: 100 } : {}) }), t + 1000); expect([action, r.status, r.body.error]).toEqual([action, 422, BIG_GAME_REFUSAL]); }
    const ok = await post("M-S5K", await signed("M-S5K", ORG, t, { action: "go" }), t); expect(ok).toEqual({ status: 200, body: { ok: true, seq: 1 } });
    const go = (await control("M-S5K", t)).messages[0]; expect(go.atBeaconRound - go.signedAtRound).toBe(f0.leadRounds); expect(f0.leadRounds).toBe(SAFETY_BIG10K.leadRounds);
    const again = await post("M-S5K", await signed("M-S5K", ORG, t + 20_000, { action: "go" }), t + 20_000); expect(again.body.error).toBe(GO_REFUSALS.again);
    const resume = await post("M-S5K", await signed("M-S5K", ORG, t + 30_000, { action: "resume" }), t + 30_000); expect(resume.body.error).toBe(BIG_GAME_REFUSAL);
  });
  test("moving the size across 2,000 before anything was sent gives the key the right profile (the unused key is forgotten so the console registers it again)", async () => {
    const o = await bigGame("M-XSZ", 1500); expect((await call("PUT", "/api/z/M-XSZ/control/key", { publicKey: publicKeyFromSecret(ORG) }, o.h)).status).toBe(200);
    expect((await control("M-XSZ")).leadRounds).toBe(SAFETY_LEAN60.leadRounds);
    raw.prepare("UPDATE engagement SET pack=6000 WHERE id='M-XSZ'").run();
    expect((await call("PATCH", "/api/z/M-XSZ/settings", { cap: 6000 }, { "x-organizer": "plat" })).status).toBe(200);
    expect(raw.query("SELECT COUNT(*) AS c FROM kv WHERE k='control/M-XSZ.json'").get()).toEqual({ c: 0 });
    expect((await call("PUT", "/api/z/M-XSZ/control/key", { publicKey: publicKeyFromSecret(ORG) }, o.h)).status).toBe(200);
    const f = await control("M-XSZ"); expect([f.leadRounds, !!f.startOnly]).toEqual([SAFETY_BIG10K.leadRounds, true]);
  });
});
