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
// The ONE exception: the owner's own trust line of the 2026-11-23 pricing update, word for word (PRICING_COPY.trust[0] in packages/shared/src/pricing.ts and TB.PRICING_COPY in common.js, pages and brochure).
// It is the owner's newer, written wording and overrides the 1 Nov order for this exact sentence only, AT MOST ONCE PER SCANNED FILE (a second copy in the same file fails); any other use of the word still fails. To go back to the 1 Nov rule, change the sentence in those places to "deleted" and delete this line.
const OWNER_TRUST_LINE = "Players' details are erased within 24 hours after the game.";
const strip = (s: string) =>
  s.replace(OWNER_TRUST_LINE, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\w])\/\/[^\n]*/g, "$1").replace(/<!--[\s\S]*?-->/g, "")
    .replace(/["'`]erase[sd]?["'`]/gi, "").replace(/["'`]erasure["'`]/g, "")
    .replace(/\/(api\/[\w/{}$.]*)?erase\b/g, "").replace(/\b(erase|erased|erasure)[_:=]/g, "").replace(/[_.](erase|erased)\b/g, "")
    .replace(/\{action:\s*["']?erase["']?[,}]/g, "").replace(/pause\|resume\|stop\|erase/g, "").replace(/\|erase\b|\berase\|/g, "")
    .replace(/kind: access \| correction \| erasure/g, "").replace(/`(stop|pause)` or `erase`/g, "").replace(/\\b(delete|erase)\\b/g, "")
    .replace(/\berase(d)? \?/g, "").replace(/\berased\)/g, "").replace(/\berased: (true|boolean)/g, "").replace(/\b(\w+)\.erased\b/g, "").replace(/\berased,/g, "").replace(/\bdo=erase\b/g, "").replace(/\{ erased\b/g, "").replace(/const erased\b/g, "");

describe("customer text has no erase words", () => {
  test("the scanned files exist", () => { expect(files.length).toBeGreaterThan(40); });
  for (const f of files) {
    test(f, () => {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(src.split(OWNER_TRUST_LINE).length - 1).toBeLessThanOrEqual(1); // the owner's sentence may stand once in a file, never twice
      const hits = [...strip(src).matchAll(new RegExp(".{0,40}" + WORD.source + ".{0,30}", "gi"))].map((m) => m[0].replace(/\s+/g, " "));
      expect(hits).toEqual([]);
    });
  }
});
