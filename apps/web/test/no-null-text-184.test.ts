import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 1.8.4: the Ready check printed "Paymentnull" and "Prizes chosennull". Element.append turns a null argument into the word "null"; el() skips null, append() does not.
const src = readFileSync(join(import.meta.dir, "../public/pack/zc-flow.js"), "utf8");

describe("organizer pages never print the word null", () => {
  test("no native .append( call is given a conditional that can be null", () => {
    const bad = src.split("\n").filter((l) => /(^|[^a-zA-Z])(li|row|card|frame|bar|ul|box)\.append\(/.test(l) && !/el\(/.test(l.replace(/^[^(]*\.append\(/, "").split(")")[0]) && /\?[^:]*:\s*null/.test(l));
    expect(bad.length).toBe(0);
  });
  test("the Ready check line puts the optional note in a spread, not a null", () => {
    expect(src.includes('i.label, ...(i.optional ? [el("i", { text: " (optional)" })] : []));')).toBe(true);
    expect(/i\.label, i\.optional \? el\("i"[^)]*\) : null\)/.test(src)).toBe(false);
  });
});
