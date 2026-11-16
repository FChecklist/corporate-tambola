// CLAIM HOLD (owner order 1 Nov 2026): while a claim is checked the game waits for everyone, then goes on for everyone. Off unless CLAIM_HOLD=1.
// Every phone gets the same hold intervals through the control file, so every phone works out the same call times (identical logs).
import { beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(60_000);
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { ControlTracker, SAFETY_STANDARD, callRound, nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";
import { callTimeMs } from "../src/lifecycle";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400, AT = T + 2 * 3_600_000, ORG = "11".repeat(32);
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const P = { "x-organizer": "plat" };
const kv = (): KV => ({ get: async (k) => (raw.query("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} });
const setup = async (flag: boolean, id = "CH-1") => {
  const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt", ...(flag ? { CLAIM_HOLD: "1" } : {}) } as any;
  expect((await call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100 }, P)).status).toBe(200);
  raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id);
  expect((await call("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret(ORG) }, P)).status).toBe(200);
  const pids: string[] = []; for (let i = 1; i <= 3; i++) pids.push((await j(await call("POST", `/api/z/${id}/join`, { phone: "981000000" + i, name: "P" + i }))).pid);
  return pids;
};
const claim = (pid: string, idx: number, now: number, id = "CH-1") => call("POST", `/api/z/${id}/claims`, { pid, device: "0".repeat(32), claims: [{ pattern: "top", idx }] }, {}, now);
const control = async (now: number, id = "CH-1") => j(await call("GET", `/api/z/${id}/control`, undefined, {}, now));
const decide = (kind: "settled" | "bogey") => kind === "settled"
  ? raw.prepare("INSERT INTO settled(eid,pattern,ordinal,round,idx,pids) VALUES('CH-1','top',1,1,1,'[]')").run()
  : raw.prepare("INSERT INTO bogey(eid,pid,pattern,round,at_ms) VALUES('CH-1','x','top',1,1)").run();
const NOW = AT + 10_000;

describe("claim hold", () => {
  test("off by default: a claim changes nothing for the game", async () => {
    const [a] = await setup(false); expect((await claim(a!, 1, NOW)).status).toBe(200);
    expect((await control(NOW + 1000)).holds).toBeUndefined();
  });
  test("a claim pauses the game for 3 phones alike: the same hold, the same call times, the same numbers on every phone", async () => {
    const [a] = await setup(true); expect((await claim(a!, 1, NOW)).status).toBe(200);
    const body = await control(NOW + 1000); expect(body.holds).toHaveLength(1);
    const h = body.holds[0], lead = body.leadRounds; expect(h.start).toBe(roundAt(NOW) + lead); expect(h.end - h.start).toBe(20); // starts after the safe lead, 60 s at most
    const phones = [0, 1, 2].map((i) => new ControlTracker({ pubKey: body.pubKey, maxPauseRounds: body.maxPauseRounds, leadRounds: lead, fullGap: true }, "CH-1", SAFETY_STANDARD, h.start - 5 + i));
    for (const p of phones) expect(await p.ingest(roundAt(NOW), body)).toBe(true);
    const logs = phones.map((p) => Array.from({ length: 90 }, (_, k) => p.callRound(START, 3, k)));
    expect(logs[1]).toEqual(logs[0]); expect(logs[2]).toEqual(logs[0]);
    const base = (k: number) => START + k * 3, inside = logs[0].filter((r, k) => base(k) >= h.start && base(k) < h.end);
    expect(inside.length).toBeGreaterThan(0); for (const r of inside) expect(r! >= h.end).toBe(true); // no number is called while the claim is checked
  });
  test("accepted: the game goes on for everyone (the hold ends at the decision)", async () => {
    const [a] = await setup(true); await claim(a!, 1, NOW);
    const open = (await control(NOW + 1000)).holds[0]; expect(open.end - open.start).toBe(20);
    decide("settled"); const t = NOW + 6000, after = (await control(t)).holds[0];
    expect(after.end).toBeLessThan(open.end); expect(after.end).toBeGreaterThan(after.start - 1); expect(after.end).toBeLessThanOrEqual(Math.max(after.start + 1, roundAt(t + 2400) + 1)); expect(after.end).toBeGreaterThanOrEqual(roundAt(t + 2400) + 1 - 0); /* restart 2.4 s or more after the decision, at the next clock tick */
  });
  test("rejected (a false claim is recorded): the game goes on for everyone too", async () => {
    const [a] = await setup(true); await claim(a!, 1, NOW); decide("bogey");
    const t = NOW + 6000, after = (await control(t)).holds[0]; expect(after.end - after.start).toBeLessThan(20);
  });
  test("nobody decides: the hold lets go by itself after 60 seconds, so the game can never stay stuck", async () => {
    const [a] = await setup(true); await claim(a!, 1, NOW);
    const first = (await control(NOW + 2000)).holds[0], later = (await control(NOW + 3 * 60_000)).holds[0];
    expect(later.end).toBe(first.start + 20); const e = raw.query("SELECT * FROM engagement WHERE id='CH-1'").get() as any;
    const t90 = await callTimeMs(env as any, e, 1, 89); expect(t90).not.toBeNull(); // the schedule is finite again
  });
  test("two claims at once wait in line: one hold, released only when both are decided", async () => {
    const [a, b] = await setup(true); await claim(a!, 1, NOW); await claim(b!, 1, NOW + 500);
    expect((await control(NOW + 1000)).holds).toHaveLength(1);
    decide("settled"); const mid = (await control(NOW + 6000)).holds[0]; expect(mid.end - mid.start).toBe(20); // one decided, one still waiting: still held
    raw.prepare("INSERT INTO bogey(eid,pid,pattern,round,at_ms) VALUES('CH-1','y','top',1,1)").run();
    const done = (await control(NOW + 9000)).holds[0]; expect(done.end - done.start).toBeLessThan(20);
  });
  test("the Organizer's pause is untouched: a signed pause still works beside a hold", async () => {
    const [a] = await setup(true); await claim(a!, 1, NOW);
    const m = signControlWithSecret(ORG, nextMessage((await readPublished(kv(), "CH-1"))!, roundAt(NOW), { action: "pause", pauseForRounds: 5 }));
    expect((await call("POST", "/api/z/CH-1/control", { message: m }, {}, NOW)).status).toBe(200);
    const body = await control(NOW + 1000); expect(body.messages).toHaveLength(1); expect(body.holds).toHaveLength(1);
  });
});
