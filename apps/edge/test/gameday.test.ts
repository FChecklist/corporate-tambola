// Game-day clarity (1.4.1): "When every prize is won" (keep calling to 90 / end the game) is a setting like the others; who paused / resumed / ended / started is recorded in role words and rides in the
// control file every phone and screen reads; the same events are in the plain "what changed" list; the report says how the game ended in plain words.
import { beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";
import { NEEDS_CONSOLE_MSG } from "../src/modes";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400;
const AT = T + 2 * 3_600_000;
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const ORG = "11".repeat(32), HOST = "22".repeat(32);
const kv = (): KV => ({ get: async (k) => (raw.query("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} });
async function organizer() { const s = await j(await call("POST", "/api/start", { email: "boss@acme.com" })); return { token: s.token as string, h: { "x-organizer": s.token as string } }; }
async function host(o: { token: string }) { const r = await j(await call("POST", "/api/org/host", { label: "Priya", mobile: "9822200011", email: "host@acme.com" }, { "x-organizer": o.token })); raw.prepare("UPDATE host_state SET verified_ms=?, mobile_ok=1").run(T); return { h: { "x-organizer": r.hostKey as string } }; }
const make = (o: { token: string }, id: string, over: Record<string, unknown> = {}) => call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, ...over }, { "x-organizer": o.token });
const info = async (id: string, now = T) => j(await call("GET", `/api/z/${id}/info`, undefined, {}, now));
const control = async (id: string, now = T) => j(await call("GET", `/api/z/${id}/control`, undefined, {}, now));
const press = async (id: string, secret: string, action: any, now: number, extra: Record<string, unknown> = {}) => {
  const r = await call("POST", `/api/z/${id}/control`, { message: signControlWithSecret(secret, nextMessage((await readPublished(kv(), id))!, roundAt(now), { action, ...extra })) }, {}, now);
  return { status: r.status, body: await j(r) };
};
async function live(id: string) {
  const o = await organizer(); expect((await make(o, id)).status).toBe(200);
  await call("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.h); raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id);
  expect((await call("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret(ORG) }, o.h)).status).toBe(200);
  return o;
}
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" } as any; });

describe("When every prize is won: keep calling until all 90 numbers, or end the game", () => {
  test("a game made before this setting ends when the prizes are won (as it always did); the setting is saved at creation and in the settings, shown to phones, and refused when it is not one of the two answers", async () => {
    const o = await organizer();
    expect((await make(o, "GD-1")).status).toBe(200);

    expect((await j(await call("GET", "/api/z/GD-1/info", undefined, o.h))).afterPrizes).toBe("end");
    expect((await j(await call("PATCH", "/api/z/GD-1/settings", { afterPrizes: "keep" }, o.h))).afterPrizes).toBe("keep");
    expect((await j(await call("GET", "/api/z/GD-1/info", undefined, o.h))).afterPrizes).toBe("keep");
    expect((await j(await call("GET", "/api/z/GD-1/summary", undefined, o.h))).afterPrizes).toBe("keep");
    expect((await make(o, "GD-2", { afterPrizes: "keep" })).status).toBe(200);
    expect((await j(await call("GET", "/api/z/GD-2/info", undefined, o.h))).afterPrizes).toBe("keep");
    const bad = await call("PATCH", "/api/z/GD-1/settings", { afterPrizes: "never" }, o.h);
    expect(bad.status).toBe(400); expect((await j(bad)).error).toMatch(/keep calling until all 90 numbers/);
    expect((await j(await call("PATCH", "/api/z/GD-1/settings", { afterPrizes: "end" }, o.h))).afterPrizes).toBe("end");
  });
  test("after publishing the Organizer and a Host can switch it until the start; the control file phones poll carries it; the list says who; it locks at the start like the rest", async () => {
    const o = await live("GD-LIVE"); const h = await host(o);
    expect((await call("PATCH", "/api/z/GD-LIVE/settings", { afterPrizes: "keep" }, h.h)).status).toBe(200);
    expect((await control("GD-LIVE")).live.afterPrizes).toBe("keep");
    expect((await call("PATCH", "/api/z/GD-LIVE/settings", { afterPrizes: "end" }, o.h)).status).toBe(200);
    expect((await control("GD-LIVE")).live.afterPrizes).toBe("end");
    const ch = (await j(await call("GET", "/api/z/GD-LIVE/changes", undefined, o.h))).changes.map((x: any) => `${x.who}: ${x.what}`);
    expect(ch[1]).toMatch(/^A Host: When every prize is won: now keep calling until all 90 numbers/); expect(ch[0]).toMatch(/^The Organizer: When every prize is won: now end the game/);
    const late = await call("PATCH", "/api/z/GD-LIVE/settings", { afterPrizes: "keep" }, o.h, AT + 60_000);
    expect(late.status).toBe(409);
  });
  test("with people already in and no signing key yet, the switch is refused kindly (phones would never hear of it)", async () => {
    const o = await organizer(); await make(o, "GD-NK"); await call("POST", "/api/z/GD-NK/publish", { email: "boss@acme.com", phone: "98765 43210" }, o.h); raw.prepare("UPDATE engagement SET pack=100 WHERE id='GD-NK'").run();
    expect((await call("POST", "/api/z/GD-NK/join", { phone: "9810000001", name: "Asha" })).status).toBe(200);
    const r = await call("PATCH", "/api/z/GD-NK/settings", { afterPrizes: "keep" }, o.h);
    expect(r.status).toBe(409); expect((await j(r)).error).toBe(NEEDS_CONSOLE_MSG);
  });
  test("the permanent game record says which it was", async () => {
    const o = await organizer(); await make(o, "GD-REC", { afterPrizes: "keep" });
    const { keepGameRecord } = await import("../src/gamerecord");
    await keepGameRecord(env.DB as any, raw.query("SELECT * FROM engagement WHERE id='GD-REC'").get(), T + 1000);
    expect(JSON.parse((raw.query("SELECT settings FROM game_record WHERE eid='GD-REC'").get() as any).settings).whenPrizesWon).toBe("keep calling until all 90 numbers");
  });
});

describe("who paused: role words in the control file, and the plain list", () => {
  test("a pause by the Organizer and a resume by a Host are recorded as such; only the words Organizer / Host travel, never a key or a name", async () => {
    const o = await live("GD-PZ"); const h = await host(o);
    expect((await call("PUT", "/api/z/GD-PZ/control/key", { publicKey: publicKeyFromSecret(HOST) }, h.h)).status).toBe(200);
    const t = AT + 10 * 60_000;
    expect((await press("GD-PZ", ORG, "pause", t, { pauseForRounds: 200 })).status).toBe(200);
    const f1 = await control("GD-PZ", t); expect(f1.by).toEqual(["Organizer"]);
    expect((await press("GD-PZ", HOST, "resume", t + 120_000)).status).toBe(200);
    expect((await press("GD-PZ", HOST, "pause", t + 300_000, { pauseForRounds: 100 })).status).toBe(200);
    const f2 = await control("GD-PZ", t + 300_000); expect(f2.by).toEqual(["Organizer", "Host", "Host"]); expect(f2.messages.map((m: any) => m.action)).toEqual(["pause", "resume", "pause"]);
    expect(JSON.stringify(f2.by)).not.toMatch(/ctk_|cth_|Priya|boss@/);
    const ch = (await j(await call("GET", "/api/z/GD-PZ/changes", undefined, o.h, t + 400_000))).changes.map((x: any) => `${x.who}: ${x.what}`);
    expect(ch).toEqual(["A Host: The game was paused", "A Host: The game was resumed", "The Organizer: The game was paused"]);
  });
});
