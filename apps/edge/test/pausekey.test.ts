// Pause and "End the game" need a signing key the phones have heard about before the start (phones stop asking 60 s after the start time when no key exists).
// A key registered later would never reach them: the store refuses it with a plain sentence instead of promising a stop that cannot happen.
import { beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { publicKeyFromSecret } from "../../../packages/beacon/src/control";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400; // two hours ahead
const startMs = (1692803367 + (START - 1) * 3) * 1000;
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const ORG = "11".repeat(32);
let orgSeq = 0;
async function organizer() { const s = await j(await call("POST", "/api/start", { email: `boss${++orgSeq}@acme.com` })); return { token: s.token as string, h: { "x-organizer": s.token as string } }; }
const make = (o: { token: string }, id: string) => call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100 }, { "x-organizer": o.token });
const publish = async (o: { token: string }, id: string) => { const r = await call("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, { "x-organizer": o.token }); raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id); return r; }; // paid, as a real game is before its start
const registerAt = (o: { token: string }, id: string, now: number) => call("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret(ORG) }, o.h, now);

beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" } as any; });

describe("the pause/stop key must exist before the start", () => {
  test("registering the key before the start works; so does registering it within the first minute after the start time", async () => {
    const o = await organizer(); expect((await make(o, "PK-1")).status).toBe(200); expect((await publish(o, "PK-1")).status).toBe(200);
    expect((await registerAt(o, "PK-1", T + 60_000)).status).toBe(200);
    const o2 = await organizer(); expect((await make(o2, "PK-2")).status).toBe(200); expect((await publish(o2, "PK-2")).status).toBe(200);
    expect((await registerAt(o2, "PK-2", startMs + 30_000)).status).toBe(200);
  });
  test("a first key registered later than 60 s after the start time is refused with a plain sentence (the phones have stopped listening)", async () => {
    const o = await organizer(); expect((await make(o, "PK-3")).status).toBe(200); expect((await publish(o, "PK-3")).status).toBe(200);
    const r = await registerAt(o, "PK-3", startMs + 5 * 60_000);
    expect(r.status).toBe(409);
    const b = await j(r);
    expect(b.code).toBe("late-key");
    expect(b.error).toContain("were not set up before the start");
    expect(b.error).toContain("open the console once before the game begins");
    expect(/http|undefined|key|token/i.test(b.error.replace(/the game/g, ""))).toBe(false); // no technical words for the organizer
  });
  test("a key that was registered in time can still be used late: registering it again after the start is not refused as late", async () => {
    const o = await organizer(); expect((await make(o, "PK-4")).status).toBe(200); expect((await publish(o, "PK-4")).status).toBe(200);
    expect((await registerAt(o, "PK-4", T + 1000)).status).toBe(200);
    const again = await registerAt(o, "PK-4", startMs + 10 * 60_000);
    expect(again.status === 200 || (again.status === 409 && !/were not set up/.test((await j(again)).error || ""))).toBe(true);
  });
});
