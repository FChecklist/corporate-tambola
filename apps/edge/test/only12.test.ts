// New games use one speed (12 s) when the live site's setting ONLY_12S is on; an older game keeps the speed it has and can still be edited; a copy of an old game gets 12.
import { beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { withDevice } from "./device";
import { ONLY_12S_MSG, only12, type Env } from "../src/worker";
import { handle } from "./with-terms";
import { CONSENT_VERSION, boxesOf } from "../src/consent";
import { makeD1 } from "./d1-sqlite";
setDefaultTimeout(60_000);
const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400;
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const P = { "x-organizer": "plat" };
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, T);
const mk = (on: boolean) => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt", ...(on ? { ONLY_12S: "1" } : {}) } as any; };
describe("one speed for new games", () => {
  test("the setting is on only when it is exactly 1", () => { expect(only12({ ONLY_12S: "1" })).toBe(true); expect(only12({})).toBe(false); expect(only12({ ONLY_12S: "0" })).toBe(false); });
  test("a new game: 9 is refused with a plain message, 12 (or none given) is accepted; with the setting off the old behaviour stays", async () => {
    mk(true);
    const bad = await call("POST", "/api/z", { id: "NEW-9", startRound: START, callSeconds: 9, cap: 50 }, P); expect(bad.status).toBe(400); expect(((await bad.json()) as any).error).toBe(ONLY_12S_MSG);
    { const r12 = await call("POST", "/api/z", { id: "NEW-12", startRound: START, callSeconds: 12, cap: 50 }, P); expect([r12.status, await r12.text()]).toEqual([200, expect.anything()]); }
    { const rn = await call("POST", "/api/z", { id: "NEW-NONE", startRound: START, cap: 50 }, P); expect([rn.status, await rn.text()]).toEqual([200, expect.anything()]); }
    expect((raw.query("SELECT call_seconds AS c FROM engagement WHERE id='NEW-NONE'").get() as any).c).toBe(12);
    mk(false); { const r9 = await call("POST", "/api/z", { id: "NEW-9", startRound: START, callSeconds: 9, cap: 50 }, P); expect([r9.status, await r9.text()]).toEqual([200, expect.anything()]); }
  });
  test("an older 9 s game keeps 9 and can still be saved (name change); picking 6 for it is refused; copying it gives 12", async () => {
    mk(false); expect((await call("POST", "/api/z", { id: "OLD-9", startRound: START, callSeconds: 9, cap: 50 }, P)).status).toBe(200);
    env = { ...env, ONLY_12S: "1" } as any;
    const same = await call("PATCH", "/api/z/OLD-9/settings", { callSeconds: 9, cap: 60 }, P); expect(same.status).toBe(200);
    expect((raw.query("SELECT call_seconds AS c FROM engagement WHERE id='OLD-9'").get() as any).c).toBe(9);
    const six = await call("PATCH", "/api/z/OLD-9/settings", { callSeconds: 6 }, P); expect(six.status).toBe(400);
    const cp = await call("POST", "/api/z/OLD-9/clone", {}, P); expect(cp.status).toBe(200); const id = ((await cp.json()) as any).id ?? ((await cp.json?.call(cp)) as any)?.id;
    const row = raw.query("SELECT call_seconds AS c FROM engagement WHERE id<>'OLD-9' ORDER BY created_ms DESC LIMIT 1").get() as any; expect(row.c).toBe(12);
  });
});

describe("a Co-host may read the live panels but not press anything", () => {
  test("Co-host: GET claims and the game log work (ticket numbers only); a control message is refused", async () => {
    mk(false);
    const mj = async (r: Response) => (await r.json()) as any;
    const start = await mj(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "8.8.8.8" }, body: JSON.stringify({ email: "boss@acme.com" }) }), env as Env, T));
    const master = start.token as string;
    expect((await call("POST", "/api/z", { id: "COH-1", startRound: START, callSeconds: 12, cap: 50 }, { "x-organizer": master })).status).toBe(200);
    const ch = await mj(await call("POST", "/api/org/cohost", { label: "Ravi", phone: "98765 00001", e: "COH-1" }, { "x-organizer": master })); const co = ch.cohostKey as string; expect(co).toBeTruthy();
    const hdr = { "x-organizer": co };
    const ticks = (kind: string) => ({ [kind]: true });
    await call("POST", "/api/org/role/accept", { consent: { v: CONSENT_VERSION, boxes: boxesOf("K5") } }, hdr);
    const claims = await call("GET", "/api/z/COH-1/claims", undefined, hdr); expect(claims.status).toBe(200);
    const gl = await call("GET", "/api/z/COH-1/gamelog", undefined, hdr); expect(gl.status).toBe(200);
    expect(JSON.stringify(await gl.json())).not.toMatch(/phone|mobile|98765/);
    expect((await call("POST", "/api/z/COH-1/control", { message: {} }, hdr)).status).toBe(403);
    expect((await call("GET", "/api/z/COH-1/claims", undefined, { "x-organizer": "ctk_" + "0".repeat(48) })).status).not.toBe(200);
  });
});
