// Rule 88: at most 3 demo games per Organizer in 24 hours; the game-code message says what the rule is (4 to 40 characters).
import { beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 10, 5, 10, 0, 0), GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
let env: any, raw: any;
const call = (method: string, path: string, body?: unknown, key?: string, now = T) => handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
beforeEach(() => { const d: any = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt" }; });

describe("demo games and game codes", () => {
  test("the 4th demo game within a day is refused politely; a day later it is allowed again", async () => {
    const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "7.7.9.2" }, body: JSON.stringify({ email: "boss@acme.com" }) }), env, T)); const key = st.token as string;
    const make = (id: string, now = T) => call("POST", "/api/z", { id, startRound: roundAt(now) + 2400, callSeconds: 9, cap: 10, demo: true }, key, now);
    for (const id of ["DEMO-1", "DEMO-2", "DEMO-3"]) expect((await make(id)).status).toBe(200);
    const r = await make("DEMO-4"); expect(r.status).toBe(429); const b = await j(r); expect(b.code).toBe("demo-day"); expect(b.error).toBe("Three demo games a day is the most. Please try again tomorrow, or make this a real game.");
    raw.prepare("UPDATE engagement SET created_ms=created_ms-90000000").run(); expect((await make("DEMO-5")).status).toBe(200); /* a day later the three are out of the window */
  });
  test("a game code that is too short says 4 to 40 characters, the same as the rule", async () => {
    const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "7.7.9.3" }, body: JSON.stringify({ email: "boss2@acme.com" }) }), env, T)); const key = st.token as string;
    const r = await call("POST", "/api/z", { id: "abc", startRound: roundAt(T) + 2400, callSeconds: 9, cap: 10 }, key); expect(r.status).toBe(400); expect((await j(r)).error).toContain("4 to 40 characters");
    expect((await call("POST", "/api/z", { id: "abcd", startRound: roundAt(T) + 2400, callSeconds: 9, cap: 10 }, key)).status).toBe(200);
  });
});
