// The console's numbers (src/owner-stats.ts): its own key, read-only, counts and payer e-mails only, never a mobile number, never a player.
import { beforeEach, describe, expect, test } from "bun:test";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 27, 10, 0, 0);
const KEY = "stats-key-for-test-0123456789";
let env: Env & Record<string, any>; let raw: ReturnType<typeof makeD1>["raw"];
const get = (headers: Record<string, string> = {}, method = "GET") => handle(new Request("http://x/api/owner/stats", { method, headers }), env as any, T);
beforeEach(() => {
  const d = makeD1(); raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: "plat", OWNER_STATS_KEY: KEY, DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://game.test", PHONE_SALT: "salt" } as any;
});
describe("owner stats", () => {
  test("only the stats key opens it; the platform key, no key, a wrong key and a POST all get the plain 404", async () => {
    for (const h of [{}, { "x-organizer": "plat" }, { "x-owner-stats-key": "wrong" }, { "x-owner-stats-key": KEY + "x" }]) expect((await get(h as any)).status).toBe(404);
    expect((await get({ "x-owner-stats-key": KEY }, "POST")).status).toBe(404);
    expect((await get({ "x-owner-stats-key": KEY })).status).toBe(200);
  });
  test("with no key configured nothing opens it, not even an empty header", async () => {
    delete env.OWNER_STATS_KEY;
    expect((await get({ "x-owner-stats-key": "" })).status).toBe(404);
  });
  test("counts games made / completed, players, and paying organizers' e-mail; mobile is always null", async () => {
    raw.prepare("INSERT INTO game_record(eid,org,created_ms,start_round,settings,outcome,first_kept_ms,kept_ms) VALUES('G1','o1',1,10,'{}',?,1,1)").run(JSON.stringify({ joined: 120, winnerPositions: 9 }));
    raw.prepare("INSERT INTO game_record(eid,org,created_ms,start_round,settings,outcome,first_kept_ms,kept_ms) VALUES('G2','o1',1,10,'{}',NULL,1,1)").run();
    raw.prepare("INSERT INTO payment(id,org,email,pack,currency,amount,tax,status,created_ms,paid_ms,meta) VALUES('p1','o1','boss@acme.com',100,'INR',500,90,'paid',1,2,'{}')").run();
    raw.prepare("INSERT INTO payment(id,org,email,pack,currency,amount,tax,status,created_ms,meta) VALUES('p2','o2','unpaid@acme.com',100,'INR',500,90,'created',1,'{}')").run();
    const b = (await (await get({ "x-owner-stats-key": KEY })).json()) as any;
    expect(b.release.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(b.games.made).toBe(2); expect(b.games.completed).toBe(1);
    expect(b.players.everJoined).toBe(120); expect(b.players.biggestGame).toBe(120); expect(b.players.winnerPositions).toBe(9);
    expect(b.organizerContacts.map((c: any) => c.email)).toEqual(["boss@acme.com"]);
    expect(b.organizerContacts[0].mobile).toBeNull();
    expect(JSON.stringify(b)).not.toContain("unpaid@acme.com");
  });
});
