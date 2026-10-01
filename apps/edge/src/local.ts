// Local stand-in for "Cloudflare Pages + one Worker + D1": serves the app files and the Worker's API from one port, with the
// database in a local SQLite file. Run: bun run apps/edge/src/local.ts   (env: PORT, ORGANIZER_SECRET, DB_FILE)
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { SCHEMA, handle, purgeOld, type D1, type D1Stmt, type Env } from "./worker";

export function sqliteD1(file: string): { db: D1; raw: Database } {
  const raw = new Database(file, { create: true });
  raw.run("PRAGMA journal_mode=WAL");
  for (const s of SCHEMA) raw.run(s);
  const stmt = (sql: string, vals: unknown[] = []): D1Stmt => ({
    bind: (...v) => stmt(sql, v),
    run: async () => { const r = raw.query(sql).run(...(vals as any[])); return { meta: { changes: r.changes } }; },
    all: async () => ({ results: raw.query(sql).all(...(vals as any[])) as any[] }),
    first: async () => (raw.query(sql).get(...(vals as any[])) as any) ?? null,
  });
  return { db: { prepare: (s) => stmt(s), batch: async (xs) => Promise.all(xs.map((x) => x.run())) }, raw };
}

export function startLocal(o: { port?: number; secret?: string; dbFile?: string; webDir?: string; budget?: string } = {}) {
  const webDir = o.webDir ?? join(import.meta.dir, "../../web/public");
  const { db, raw } = sqliteD1(o.dbFile ?? ":memory:");
  const env: Env = { DB: db, ORGANIZER_SECRET: o.secret ?? process.env.ORGANIZER_SECRET ?? "local-organizer-secret", DAILY_WRITE_BUDGET: o.budget ?? process.env.DAILY_WRITE_BUDGET ?? "80000" };
  const server = Bun.serve({
    port: o.port ?? Number(process.env.PORT ?? 8788),
    async fetch(req) {
      const u = new URL(req.url);
      if (u.pathname.startsWith("/api/")) return handle(req, env);
      const rel = u.pathname === "/" ? "/index.html" : u.pathname;
      if (rel.includes("..")) return new Response("Not found", { status: 404 });
      const f = Bun.file(join(webDir, rel));
      return (await f.exists()) ? new Response(f, { headers: { "cache-control": "no-store" } }) : new Response("Not found", { status: 404 });
    },
  });
  return { server, env, raw, url: `http://localhost:${server.port}`, purge: () => purgeOld(env, Date.now()) };
}

/** Local use: one organizer account whose key is kept in a file next to the database, so the console keeps its history across restarts. */
export async function localOrganizerKey(s: ReturnType<typeof startLocal>, keyFile: string): Promise<string> {
  const f = Bun.file(keyFile);
  if (await f.exists()) { const k = (await f.text()).trim(); if (k) return k; }
  const r = await handle(new Request("http://x/api/org", { method: "POST", headers: { "x-organizer": s.env.ORGANIZER_SECRET! } }), s.env);
  const key = ((await r.json()) as any).organizerKey as string;
  await Bun.write(keyFile, key);
  return key;
}

if (import.meta.main) {
  const dbFile = process.env.DB_FILE ?? "tambola-local.sqlite";
  const s = startLocal({ dbFile });
  const key = await localOrganizerKey(s, dbFile + ".organizer-key");
  console.log(`Corporate Tambola (zero-server mode, local) on ${s.url}
  organizer page: ${s.url}/zc.html
  organizer key:  ${key}`);
}
