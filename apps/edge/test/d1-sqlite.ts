// Test stand-in for Cloudflare D1, backed by bun:sqlite. Same prepare/bind/run/all/first/batch shape.
import { Database } from "bun:sqlite";
import { SCHEMA, type D1, type D1Stmt } from "../src/worker";

export function makeD1(): { db: D1; raw: Database } {
  const raw = new Database(":memory:");
  for (const s of SCHEMA) raw.run(s);
  const stmt = (sql: string, vals: unknown[] = []): D1Stmt => ({
    bind: (...v) => stmt(sql, v),
    run: async () => { const r = raw.query(sql).run(...(vals as any[])); return { meta: { changes: r.changes } }; },
    all: async () => ({ results: raw.query(sql).all(...(vals as any[])) as any[] }),
    first: async () => (raw.query(sql).get(...(vals as any[])) as any) ?? null,
  });
  return { db: { prepare: (s) => stmt(s), batch: async (xs) => Promise.all(xs.map((x) => x.run())) }, raw };
}
