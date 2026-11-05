// Diagnostic (prints, asserts only that a join is traced): which statements a join runs against a game that already has 300 people in it, and which of them SQLite answers by scanning a whole table.
// The 250-player run on 5 Nov 2026 was refused by D1 with "overloaded: too many resources consumed within a 10 second window"; rows read per join is what feeds that limit.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { W, call, dev, mob, paidGame, reset, restore, uid } from "./param-harness";

const join = (id: string, i: number) => call("POST", `/api/z/${id}/join`, { phone: mob(i), name: "Guest " + i, device: dev(i) });
describe("what one join reads", () => {
  beforeEach(() => reset()); afterEach(restore);
  test("trace one join into a game of 300", async () => {
    const id = uid("PL"); await paidGame({ id, cap: 400 });
    for (let i = 1; i <= 300; i++) expect((await join(id, i)).status).toBe(200);
    const log: { sql: string; args: any[] }[] = [];
    const real = W.env.DB as any;
    const wrap = (s: any, sql: string, args: any[]): any => ({ bind: (...a: any[]) => wrap(s.bind(...a), sql, a), first: (...x: any[]) => { log.push({ sql, args }); return s.first(...x); }, run: (...x: any[]) => { log.push({ sql, args }); return s.run(...x); }, all: (...x: any[]) => { log.push({ sql, args }); return s.all(...x); }, raw: (...x: any[]) => { log.push({ sql, args }); return s.raw(...x); }, __raw: s });
    (W.env as any).DB = { prepare: (sql: string) => wrap(real.prepare(sql), sql, []), batch: async (xs: any[]) => { for (const x of xs) {} return Promise.all(xs.map((x) => x.run())); } };
    const r = await join(id, 301); expect(r.status).toBe(200);
    (W.env as any).DB = real;
    const out: string[] = [`JOINPLAN statements=${log.length}`];
    for (const { sql, args } of log) {
      let plan = "";
      try { plan = (W.raw.prepare("EXPLAIN QUERY PLAN " + sql).all(...args) as any[]).map((p) => p.detail).join(" | "); } catch (e) { plan = "(no plan: " + String((e as any)?.message).slice(0, 60) + ")"; }
      const scan = /\bSCAN\b/.test(plan) && !/USING (COVERING )?INDEX/.test(plan.split("|").filter((p) => /\bSCAN\b/.test(p)).join("|"));
      out.push(`${scan ? "SCAN!" : "ok   "} ${sql.replace(/\s+/g, " ").slice(0, 150)} => ${plan.slice(0, 170)}`);
    }
    console.log(out.join("\n"));
  });
});
