// Customer-visible text never says erase / erasing / erased / erasure (owner order, 1 Nov 2026). A timer says "auto-deleted", a person says "deleted".
// API and function names may keep the word: route names (/erase), action values ("erase"), identifiers (eraseAll, erasureMs), and code comments are not customer text.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const dirs = ["apps/web/public", "apps/web/public/pack", "apps/edge/src", "apps/server/src"];
const ext = /\.(html|js|txt|ts|json)$/;
const files = dirs.flatMap((d) => readdirSync(join(ROOT, d), { withFileTypes: true }).filter((e) => e.isFile() && ext.test(e.name)).map((e) => join(d, e.name)));
files.push("docs/AI_PROMPT.md", "docs/AI_WORK_PROMPT_ORGANIZER.md", "tools/legal/terms.frag.html", "tools/legal/legal-position.frag.html", "tools/onepager/organizer-manual.html");

const WORD = /\b(erase[sd]?|erasing|erasure)\b/gi;
// not customer text: comments, then the machine names that keep the word
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\w])\/\/[^\n]*/g, "$1").replace(/<!--[\s\S]*?-->/g, "")
    .replace(/["'`]erase[sd]?["'`]/gi, "").replace(/["'`]erasure["'`]/g, "")
    .replace(/\/(api\/[\w/{}$.]*)?erase\b/g, "").replace(/\b(erase|erased|erasure)[_:=]/g, "").replace(/[_.](erase|erased)\b/g, "")
    .replace(/\{action:\s*["']?erase["']?[,}]/g, "").replace(/pause\|resume\|stop\|erase/g, "").replace(/\|erase\b|\berase\|/g, "")
    .replace(/kind: access \| correction \| erasure/g, "").replace(/`(stop|pause)` or `erase`/g, "").replace(/\\b(delete|erase)\\b/g, "")
    .replace(/\berase(d)? \?/g, "").replace(/\berased\)/g, "").replace(/\berased: (true|boolean)/g, "").replace(/\b(\w+)\.erased\b/g, "").replace(/\berased,/g, "").replace(/\bdo=erase\b/g, "").replace(/\{ erased\b/g, "").replace(/const erased\b/g, "");

describe("customer text has no erase words", () => {
  test("the scanned files exist", () => { expect(files.length).toBeGreaterThan(40); });
  for (const f of files) {
    test(f, () => {
      const hits = [...strip(readFileSync(join(ROOT, f), "utf8")).matchAll(new RegExp(".{0,40}" + WORD.source + ".{0,30}", "gi"))].map((m) => m[0].replace(/\s+/g, " "));
      expect(hits).toEqual([]);
    });
  }
});
