// WP-03 A15: a Bogey sent twice (the first call reached the store but its answer was lost, so the phone sent it again) is stored ONCE.
// Before: the retry was a second Bogey, and one honest mistake put the ticket out of the prize.
import { beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 1200;
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const ORG = { "x-organizer": "plat" };
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" } as any; });
const rows = (pid: string) => (raw.query("SELECT COUNT(*) c FROM bogey WHERE pid=?").get(pid) as any).c as number;

describe("A15: the same Bogey twice is one Bogey", () => {
  test("the retry of Bogey no. 1 stores nothing and answers with the time the first one was stored; Bogey no. 2 is a new one; a third is not written", async () => {
    expect((await call("POST", "/api/z", { id: "BG-ONCE", startRound: START, callSeconds: 9, cap: 100 }, ORG)).status).toBe(200);
    const pid = (await j(await call("POST", "/api/z/BG-ONCE/join", { phone: "9100000001", name: "Asha" }))).pid as string;
    const first = await j(await call("POST", "/api/z/BG-ONCE/bogey", { pid, pattern: "top", n: 1 }, {}, T + 1000));
    expect(first).toMatchObject({ ok: true, stored: 1, atMs: T + 1000 });
    const retry = await j(await call("POST", "/api/z/BG-ONCE/bogey", { pid, pattern: "top", n: 1 }, {}, T + 9000)); // the answer was lost, the phone asks again 8 s later
    expect(retry).toMatchObject({ ok: true, stored: 0, atMs: T + 1000 });
    expect(rows(pid)).toBe(1); // ONE wrong claim is one Bogey: the ticket is not out of the prize
    const second = await j(await call("POST", "/api/z/BG-ONCE/bogey", { pid, pattern: "top", n: 2 }, {}, T + 20_000));
    expect(second).toMatchObject({ ok: true, stored: 1, atMs: T + 20_000 });
    expect((await j(await call("POST", "/api/z/BG-ONCE/bogey", { pid, pattern: "top", n: 2 }, {}, T + 30_000))).stored).toBe(0);
    expect(rows(pid)).toBe(2);
    expect((await j(await call("POST", "/api/z/BG-ONCE/bogey", { pid, pattern: "top", n: 3 }, {}, T + 40_000))).stored).toBe(0); // two put the ticket out: nothing more is written
    expect(rows(pid)).toBe(2);
  });
  test("an older phone that sends no number keeps the old rule (two at most)", async () => {
    expect((await call("POST", "/api/z", { id: "BG-OLD", startRound: START, callSeconds: 9, cap: 100 }, ORG)).status).toBe(200);
    const pid = (await j(await call("POST", "/api/z/BG-OLD/join", { phone: "9100000002", name: "Ravi" }))).pid as string;
    for (const [i, want] of [1, 1, 0].entries()) expect((await j(await call("POST", "/api/z/BG-OLD/bogey", { pid, pattern: "full" }, {}, T + 1000 * (i + 1)))).stored).toBe(want);
  });
});
