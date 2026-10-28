// PRESENCE (1.6.3): phones in front report sampled counts; the console reads the last complete minute; nothing about a person is stored.
import { beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(60_000);
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { presenceK } from "../src/presence";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400;
const P = { "x-organizer": "plat" };
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" } as any; });
async function game(id: string, cap = 100) {
  expect((await call("POST", "/api/z", { id, startRound: START, callSeconds: 12, cap }, P)).status).toBe(200);
  raw.prepare("UPDATE engagement SET pack=? WHERE id=?").run(cap, id);
  return (await j(await call("POST", `/api/z/${id}/join`, { phone: "9810000001", name: "Asha" }))).pid as string;
}
const report = (id: string, pid: string, k: unknown, now: number) => call("POST", `/api/z/${id}/presence`, { pid, k }, {}, now);
const read = (id: string, now: number, h: Record<string, string> = P) => call("GET", `/api/z/${id}/presence`, undefined, h, now);

describe("presence", () => {
  test("K grows with the game size so that the writes stay at about 5 a minute (300 an hour) for any game: 20 at 100 people, 2000 at 10,000", () => {
    expect(presenceK(3)).toBe(1); expect(presenceK(5)).toBe(1); expect(presenceK(100)).toBe(20); expect(presenceK(10000)).toBe(2000);
  });
  test("reports add K phones to the minute; the console reads the last COMPLETE minute; a stranger and a guest cannot read it", async () => {
    const pid = await game("PR-A", 10000);
    const m = Math.floor((T + 3600_000) / 60_000) * 60_000;
    for (let i = 0; i < 3; i++) expect((await report("PR-A", pid, 2000, m + i * 1000)).status).toBe(200);
    expect((await j(await read("PR-A", m + 30_000))).listening).toBe(null); // the minute is still running
    const r = await j(await read("PR-A", m + 61_000)); expect(r.listening).toBe(1200); expect(r.recent[9]).toBe(6000); // the average of the last 5 minutes
    expect((await read("PR-A", m + 61_000, {})).status).toBeGreaterThanOrEqual(401);
    expect((await report("PR-A", "nobody", 2000, m)).status).toBe(403);
  });
  test("a phone cannot claim to stand for more phones than the game's size allows; nothing personal is stored", async () => {
    const pid = await game("PR-B", 100);
    const m = Math.floor((T + 3600_000) / 60_000) * 60_000;
    await report("PR-B", pid, 100000, m + 1000);
    expect((await j(await read("PR-B", m + 61_000))).listening).toBe(4); // cap 100: K is 20, so one report counts 20 and the average of 5 minutes is 4
    const cols = (raw.query("PRAGMA table_info(presence)").all() as any[]).map((c) => c.name).join(",");
    expect(cols).toBe("eid,minute,n");
  });
});
