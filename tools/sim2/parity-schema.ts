// Schema parity, run by tools/sim2/parity.mjs (bun). Prints one JSON object on stdout.
// Three databases are built and compared by table / column / index: (live) the raw export of the live D1 with NOTHING applied on top, (schema) a fresh DB made from the Worker's SCHEMA constant,
// (migrations) a fresh DB made from apps/edge/migrations/*.sql in file order (what `wrangler d1 migrations apply` would build).
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA } from "../../apps/edge/src/worker";

const ROOT = join(import.meta.dir, "../..");
const shape = (db: Database) => {
  const out: Record<string, { cols: Record<string, string>; indexes: string[] }> = {};
  for (const t of db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name<>'d1_migrations' ORDER BY name").all() as { name: string }[]) {
    const cols: Record<string, string> = {};
    for (const c of db.query(`PRAGMA table_info("${t.name}")`).all() as any[]) cols[c.name] = `${String(c.type).toUpperCase()}${c.notnull ? " NOT NULL" : ""}${c.dflt_value !== null ? " DEFAULT " + c.dflt_value : ""}${c.pk ? " PK" + c.pk : ""}`;
    const indexes = (db.query(`PRAGMA index_list("${t.name}")`).all() as any[]).filter((i) => !String(i.name).startsWith("sqlite_autoindex")).map((i) => `${i.name}${i.unique ? " UNIQUE" : ""}(${(db.query(`PRAGMA index_info("${i.name}")`).all() as any[]).map((x) => x.name).join(",")})`).sort();
    out[t.name] = { cols, indexes };
  }
  const triggers = (db.query("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name").all() as { name: string }[]).map((x) => x.name);
  return { tables: out, triggers };
};
const diff = (an: string, a: ReturnType<typeof shape>, bn: string, b: ReturnType<typeof shape>) => {
  const d: string[] = [];
  for (const t of new Set([...Object.keys(a.tables), ...Object.keys(b.tables)])) {
    const x = a.tables[t], y = b.tables[t];
    if (!x) { d.push(`table ${t}: only in ${bn}`); continue; } if (!y) { d.push(`table ${t}: only in ${an}`); continue; }
    for (const c of new Set([...Object.keys(x.cols), ...Object.keys(y.cols)])) {
      if (!(c in x.cols)) d.push(`${t}.${c}: only in ${bn} (${y.cols[c]})`); else if (!(c in y.cols)) d.push(`${t}.${c}: only in ${an} (${x.cols[c]})`);
      else if (x.cols[c] !== y.cols[c]) d.push(`${t}.${c}: ${an} "${x.cols[c]}" vs ${bn} "${y.cols[c]}"`);
    }
    for (const i of new Set([...x.indexes, ...y.indexes])) { if (!x.indexes.includes(i)) d.push(`index ${t}/${i}: only in ${bn}`); else if (!y.indexes.includes(i)) d.push(`index ${t}/${i}: only in ${an}`); }
  }
  for (const t of new Set([...a.triggers, ...b.triggers])) { if (!a.triggers.includes(t)) d.push(`trigger ${t}: only in ${bn}`); else if (!b.triggers.includes(t)) d.push(`trigger ${t}: only in ${an}`); }
  return d;
};

const live = new Database(":memory:"); live.exec(readFileSync(join(ROOT, "data-backup/live-export.sql"), "utf8"));
const liveCounts: Record<string, number> = {}; for (const t of Object.keys(shape(live).tables)) liveCounts[t] = (live.query(`SELECT COUNT(*) c FROM "${t}"`).get() as any).c;
const hasD1Migrations = !!live.query("SELECT 1 FROM sqlite_master WHERE name='d1_migrations'").get();

const sch = new Database(":memory:"); const schemaErrors: string[] = [];
for (const s of SCHEMA) { try { sch.run(s); } catch (e: any) { schemaErrors.push(String(e?.message).slice(0, 120) + " :: " + s.slice(0, 80)); } }

const mig = new Database(":memory:"); const migErrors: string[] = []; const dir = join(ROOT, "apps/edge/migrations");
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".sql")).sort() : [];
for (const f of files) { try { mig.exec(readFileSync(join(dir, f), "utf8")); } catch (e: any) { migErrors.push(f + ": " + String(e?.message).slice(0, 140)); } }

const L = shape(live), S = shape(sch), M = shape(mig);
console.log(JSON.stringify({
  migrationFiles: files, liveHasD1MigrationsTable: hasD1Migrations, liveRowCounts: liveCounts,
  tables: { live: Object.keys(L.tables).length, schema: Object.keys(S.tables).length, migrations: Object.keys(M.tables).length },
  schemaErrors, migErrors,
  liveVsSchema: diff("live", L, "SCHEMA", S), liveVsMigrations: diff("live", L, "migrations", M), schemaVsMigrations: diff("SCHEMA", S, "migrations", M),
}));
