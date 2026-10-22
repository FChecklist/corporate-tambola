// Real housie, the Worker's part: claims are stored for every game size and say when they arrived; a Bogey (a wrong claim the phone refused) is recorded too; every phone reads
// both with the seat list, as opaque ticket ids only; the organizer's own claims list carries the Bogeys flagged; a removed or erased person takes their claims and Bogeys with them.
import { beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { GRACE_ROUNDS } from "../../../packages/beacon/src/config";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 1200; // an hour ahead
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const ORG = { "x-organizer": "plat" };
const DURING = T + 3_600_000 + GRACE_ROUNDS * 3000 + 60_000; // a minute into the numbers
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" } as any; });
const make = async (id: string, over: Record<string, unknown> = {}) => { expect((await call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 5000, ...over }, ORG)).status).toBe(200); };
const join = async (id: string, i: number) => (await j(await call("POST", `/api/z/${id}/join`, { phone: "9" + String(100000000 + i), name: "P" + i }))).pid as string;

describe("claims and Bogeys in the store", () => {
  test("a claim is kept for a 5,000-person game, answered with the store's time; a Bogey is recorded (two at most per house); both ride with the public seat list as opaque ids, from a time on", async () => {
    await make("RH-ST"); const a = await join("RH-ST", 1), b = await join("RH-ST", 2);
    const c1 = await j(await call("POST", "/api/z/RH-ST/claims", { pid: a, claims: [{ pattern: "top", idx: 12 }] }, {}, DURING));
    expect(c1).toMatchObject({ ok: true, stored: 1, atMs: DURING });
    const b1 = await j(await call("POST", "/api/z/RH-ST/bogey", { pid: b, pattern: "top" }, {}, DURING + 2000));
    expect(b1).toMatchObject({ ok: true, stored: 1, atMs: DURING + 2000 });
    expect((await j(await call("POST", "/api/z/RH-ST/bogey", { pid: b, pattern: "top" }, {}, DURING + 4000))).stored).toBe(1);
    expect((await j(await call("POST", "/api/z/RH-ST/bogey", { pid: b, pattern: "top" }, {}, DURING + 6000))).stored).toBe(0); // two put the ticket out: a third is not written
    expect((await j(await call("POST", "/api/z/RH-ST/bogey", { pid: b, pattern: "full" }, {}, DURING + 8000))).stored).toBe(1); // another house: its own count
    expect((raw.query("SELECT COUNT(*) c FROM bogey").get() as any).c).toBe(3);
    const s = await j(await call("GET", "/api/z/RH-ST/seats?after=0&cafter=0", undefined, {}, DURING + 10_000));
    expect(s.ready).toBe(true);
    expect(s.claims).toEqual([
      { pid: a, pattern: "top", round: 1, idx: 12, atMs: DURING },
      { pid: b, pattern: "top", round: 1, idx: -1, atMs: DURING + 2000, bogey: true },
      { pid: b, pattern: "top", round: 1, idx: -1, atMs: DURING + 4000, bogey: true },
      { pid: b, pattern: "full", round: 1, idx: -1, atMs: DURING + 8000, bogey: true },
    ]);
    expect(JSON.stringify(s)).not.toMatch(/P1|P2|9100000001/); // opaque ticket ids only: no names or numbers
    const later = await j(await call("GET", `/api/z/RH-ST/seats?after=0&cafter=${DURING + 4000}`, undefined, {}, DURING + 10_000));
    expect(later.claims.map((x: any) => x.atMs)).toEqual([DURING + 4000, DURING + 8000]); // from the asked time on (inclusive: the phone drops what it has)
    const tail = await j(await call("GET", `/api/z/RH-ST/seats?after=5&cafter=0`, undefined, {}, DURING + 10_000)); // the small-tail answer carries them too
    expect(tail.claims.length).toBe(4);
  });
  test("a Bogey needs a real participant and a real house; the organizer's claims list carries the Bogeys flagged; a removed person's claims and Bogeys go", async () => {
    await make("RH-BG", { cap: 100 }); const a = await join("RH-BG", 1);
    expect((await call("POST", "/api/z/RH-BG/bogey", { pid: "1xdeadbeefdead", pattern: "top" }, {}, DURING)).status).toBe(403);
    expect((await call("POST", "/api/z/RH-BG/bogey", { pid: a, pattern: "bingo" }, {}, DURING)).status).toBe(400);
    expect((await call("POST", "/api/z/RH-BG/bogey", { pid: a, pattern: "lucky" }, {}, DURING)).status).toBe(400); // a lucky draw is not claimed
    expect((await call("POST", "/api/z/RH-BG/bogey", { pid: a, pattern: "top", round: 3 }, {}, DURING)).status).toBe(400); // no such round
    await call("POST", "/api/z/RH-BG/claims", { pid: a, claims: [{ pattern: "mid", idx: 20 }] }, {}, DURING);
    await call("POST", "/api/z/RH-BG/bogey", { pid: a, pattern: "top" }, {}, DURING + 1000);
    const list = (await j(await call("GET", "/api/z/RH-BG/claims", undefined, ORG))).claims;
    expect(list).toEqual([{ pid: a, pattern: "mid", round: 1, idx: 20, atMs: DURING }, { pid: a, pattern: "top", round: 1, idx: -1, atMs: DURING + 1000, bogey: true }]);
    const person = (await j(await call("GET", "/api/z/RH-BG/people", undefined, ORG))).people.find((p: any) => p.status === "joined");
    expect((await call("POST", `/api/z/RH-BG/people/${person.id}/remove`, {}, ORG)).status).toBe(200); // before the start: the seat and everything about it go
    expect((raw.query("SELECT COUNT(*) c FROM claim").get() as any).c).toBe(0);
    expect((raw.query("SELECT COUNT(*) c FROM bogey").get() as any).c).toBe(0);
  });
  test("erasing a game's people erases its claims and Bogeys too", async () => {
    await make("RH-ER", { cap: 100 }); const a = await join("RH-ER", 1);
    await call("POST", "/api/z/RH-ER/claims", { pid: a, claims: [{ pattern: "mid", idx: 20 }] }, {}, DURING);
    await call("POST", "/api/z/RH-ER/bogey", { pid: a, pattern: "top" }, {}, DURING);
    expect((await call("POST", "/api/z/RH-ER/erase", {}, ORG, DURING + 3_600_000)).status).toBe(200);
    expect((raw.query("SELECT COUNT(*) c FROM claim").get() as any).c + (raw.query("SELECT COUNT(*) c FROM bogey").get() as any).c).toBe(0);
  });
});
