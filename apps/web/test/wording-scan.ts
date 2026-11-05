// Shared by the wording guard tests: finds a banned word inside the TEXT a person reads (string literals and HTML text), not in names of variables, SQL or comments.
import { readFileSync } from "node:fs";

const LIT = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const SQL = /\b(FROM|INTO|UPDATE|JOIN|TABLE|WHERE|SELECT|DELETE)\b/;

/** Every string literal of a script that contains the word (template parts like ${...} are not text and are cut out first; SQL strings are skipped). */
export function wordInLiterals(src: string, word: RegExp): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length)); // comments are not shown to anyone
  for (const m of clean.matchAll(LIT)) {
    const t = m[0].replace(/\$\{[^}]*\}/g, "");
    if (word.test(t) && !SQL.test(t)) out.push({ line: clean.slice(0, m.index).split("\n").length, text: t.slice(0, 120) });
  }
  return out;
}

/** The visible text of an HTML page: no tags, no scripts or styles, no attribute values except the ones people read (alt, title, placeholder, aria-label, content of meta description). */
export function htmlText(html: string): string {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const attrs = [...body.matchAll(/\b(?:alt|title|placeholder|aria-label)="([^"]*)"/gi)].map((m) => m[1]).join(" ");
  const meta = [...body.matchAll(/<meta[^>]*name="description"[^>]*content="([^"]*)"/gi)].map((m) => m[1]).join(" ");
  return body.replace(/<[^>]+>/g, " ") + " " + attrs + " " + meta;
}

export const read = (rel: string, base: URL): string => readFileSync(new URL(rel, base), "utf8");
