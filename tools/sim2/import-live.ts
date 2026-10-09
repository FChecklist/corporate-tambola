// bun tools/sim2/import-live.ts  : data-backup/live-export.sql -> sim/live-copy.sqlite (pristine, never written by a run)
import { importLiveExport } from "./db";
import { join } from "node:path";
const root = join(import.meta.dir, "../..");
const r = importLiveExport(join(root, "data-backup/live-export.sql"), join(root, "sim/live-copy.sqlite"));
console.log("imported tables (rows):", JSON.stringify(r.tables));
console.log("statements the current code's SCHEMA had to ADD to the live copy:", r.schemaAdded.length ? "\n  " + r.schemaAdded.join("\n  ") : "none");
