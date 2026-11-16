// Owner order 1 Nov 2026: no street, city or state anywhere in shipped files. Only "India" (the courts in India, a sole proprietorship in India).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

const ROOT = join(import.meta.dir, "..", "..", "..");
const dirs = ["apps/web/public", "apps/web/public/pack", "apps/edge/src", "apps/edge/migrations", "apps/server/src", "packages/billing/src", "tools/legal", "tools/onepager", "config"];
const ext = /\.(html|js|txt|ts|json|sql|md|mjs)$/;
const files = dirs.filter((d) => existsSync(join(ROOT, d))).flatMap((d) => readdirSync(join(ROOT, d), { withFileTypes: true }).filter((e) => e.isFile() && ext.test(e.name)).map((e) => join(d, e.name)));
files.push("apps/edge/wrangler.toml", "docs/AI_PROMPT.md", "docs/AI_WORK_PROMPT_ORGANIZER.md");
const BAD = /Ghaziabad|Uttar Pradesh|Indirapuram|Shipra|Krishna Vista|B-1105|201014|Gautam Buddh|Vasundhara|\bNoida\b/i;

describe("no address, city or state in shipped files", () => {
  test("the scan covers the shipped files", () => { expect(files.length).toBeGreaterThan(60); });
  for (const f of files) test(f, () => { const s = readFileSync(join(ROOT, f), "utf8"); expect(s.match(BAD)?.[0] ?? null).toBeNull(); });
  for (const f of ["apps/web/public/brochure.pdf", "apps/web/public/organizer-manual.pdf"]) test(f + " (text in its streams)", () => {
    const b = readFileSync(join(ROOT, f)); let text = b.toString("latin1");
    for (const m of text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) { try { text += inflateSync(Buffer.from(m[1]!, "latin1")).toString("latin1"); } catch { /* not a deflate stream */ } }
    expect(text.match(BAD)?.[0] ?? null).toBeNull();
  });
});
