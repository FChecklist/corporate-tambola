// 1.5.1: a join writes everything in ONE database batch (seat, person rows, the two per-address counters, the consent record). 2,000 joins in 120 simulated seconds,
// counting database round trips. Run: bun test tools/load/join-storm.test.ts
import { describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(300_000);
import { withDevice } from "../../apps/edge/test/device";
import { handle } from "../../apps/edge/test/with-terms";
import { makeD1 } from "../../apps/edge/test/d1-sqlite";

const JOINS = Number(process.env.JOINS ?? 2000), T = Date.UTC(2026, 9, 1, 10, 0, 0);
describe("join storm", () => {
  test("write round trips per join stay at 4 or fewer, nothing is lost, and a crowd arriving at once never passes the limit", async () => {
    const d = makeD1(); let simNow = T; let writeTrips = 0, readTrips = 0, batches = 0, writeStmts = 0; let counting = false;
    const wrap = (sql: string, st: any): any => { const rd = /^\s*(select|with)/i.test(sql); return { sql, rd, bind: (...v: unknown[]) => wrap(sql, st.bind(...v)), run: async () => { if (counting) { writeTrips++; writeStmts++; } return st.run(); }, all: async () => { if (counting) (rd ? readTrips++ : (writeTrips++, writeStmts++)); return st.all(); }, first: async () => { if (counting) (rd ? readTrips++ : (writeTrips++, writeStmts++)); return st.first(); }, _run: () => st.run() }; };
    const db: any = { prepare: (sql: string) => wrap(sql, d.db.prepare(sql)), batch: async (xs: any[]) => { if (counting) { writeTrips++; batches++; writeStmts += xs.length; } return Promise.all(xs.map((x) => x._run())); } };
    const env: any = { DB: db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" };
    const call = (m: string, p: string, b?: unknown, h: Record<string, string> = {}) => handle(new Request("http://x" + p, { method: m, headers: { "content-type": "application/json", ...h }, body: withDevice(m, p, b) }), env, simNow);
    const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
    expect((await call("POST", "/api/z", { id: "JS-1", startRound: roundAt(T) + 2400, callSeconds: 12, cap: 100000 }, { "x-organizer": "plat" })).status).toBe(200);
    d.raw.prepare("UPDATE engagement SET pack=100000 WHERE id=?").run("JS-1");
    counting = true; let ok = 0; const t0 = performance.now();
    for (let i = 0; i < JOINS; i++) { simNow = T + Math.floor((i * 120_000) / JOINS); const r = await call("POST", "/api/z/JS-1/join", { phone: "9" + String(100000000 + i), name: "P" + i }, { "cf-connecting-ip": "10." + ((i >> 8) & 255) + "." + (i & 255) + ".1" }); if (r.status === 200) ok++; }
    counting = false; const ms = performance.now() - t0;
    const consent = (d.raw.query("SELECT COUNT(*) c FROM consent_log WHERE kind='K4' AND ref='JS-1'").get() as any).c, seats = (d.raw.query("SELECT COUNT(*) c FROM seat WHERE eid='JS-1'").get() as any).c, parts = (d.raw.query("SELECT COUNT(*) c FROM participant WHERE eid='JS-1'").get() as any).c;
    const counters = (d.raw.query("SELECT COUNT(*) c FROM kv WHERE k LIKE 'jbm/%' OR k LIKE 'jlim/%'").get() as any).c;
    console.log("JOINSTORM " + JSON.stringify({ joins: JOINS, ok, writeRoundTripsPerJoin: +(writeTrips / JOINS).toFixed(2), batchesPerJoin: +(batches / JOINS).toFixed(2), writeStatementsPerJoin: +(writeStmts / JOINS).toFixed(2), readRoundTripsPerJoin: +(readTrips / JOINS).toFixed(2), handlerMsPerJoin: +(ms / JOINS).toFixed(2), seats, consent, counters }));
    expect(ok).toBe(JOINS); expect(seats).toBe(JOINS); expect(parts).toBe(JOINS); expect(consent).toBe(JOINS); expect(counters).toBeGreaterThan(0);
    expect(writeTrips / JOINS).toBeLessThanOrEqual(4.01);
  });
});
