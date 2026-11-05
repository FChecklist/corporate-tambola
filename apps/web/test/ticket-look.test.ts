// The look of the player's ticket (owner order 2026-10-27): a traditional coloured housie ticket, and a red cross over a number the player has crossed.
// Tapping a crossed number again takes the cross off: the page toggles through rt.mark(), which the phone-runtime tests cover (mark / unmark).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "..", "public", "z.css"), "utf8");
const js = readFileSync(join(import.meta.dir, "..", "public", "z.js"), "utf8");
const rule = (sel: string) => { const i = css.lastIndexOf(sel + "{"); return i < 0 ? "" : css.slice(i, css.indexOf("}", i) + 1); };

describe("ticket look", () => {
  test("a crossed number carries a red cross made of two bars, drawn over the number (the number stays in the page, readable)", () => {
    const before = rule(".zticket div.m::before"), after = rule(".zticket div.m::after"), both = rule(".zticket div.m::before,.zticket div.m::after");
    expect(both).toMatch(/content:""/); expect(both).toMatch(/position:absolute/); expect(both).toMatch(/rgba\(214,40,40/);
    expect(before).toContain("rotate(45deg)"); expect(after).toContain("rotate(-45deg)");
    expect(rule(".zticket div.m")).not.toMatch(/color:#fff\b/); // not white text any more: the number is still read under the cross
  });
  test("the ticket is a coloured card with white number squares and coloured empty squares", () => {
    expect(rule(".zticket")).toMatch(/background:#FFE08A/); expect(rule(".zticket")).toMatch(/border:3px solid/);
    expect(rule(".zticket div")).toMatch(/background:#fff/);
    expect(rule(".zticket div.e")).toMatch(/repeating-linear-gradient/);
  });
  test("the page marks a number through a tap target that says whether it is crossed (so a second tap removes it)", () => {
    expect(js).toContain('aria-pressed="${marks.has(v)}"');
    expect(js).toContain("rt.mark(n)");
    expect(js).toMatch(/class="\$\{marks\.has\(v\) \? "m" : ""\}/);
  });
  test("the Modern look is a plain white card with thin black lines and bold black numbers; the red cross still applies to it; Retro stays the default", () => {
    expect(rule(".zticket.modern")).toMatch(/background:#fff/); expect(rule(".zticket.modern")).toMatch(/border:1px solid #1C2B3A/);
    expect(rule(".zticket.modern div")).toMatch(/border:1px solid #1C2B3A/); expect(rule(".zticket.modern div")).toMatch(/color:#000/); expect(rule(".zticket.modern div")).toMatch(/font-weight:800/);
    expect(rule(".zticket.modern div.e")).not.toMatch(/repeating-linear-gradient/); // no teal stripes in the modern look
    expect(css).not.toMatch(/\.zticket\.modern div\.m::(before|after)\{[^}]*background:#(?!D62828)/i); // the cross is not re-coloured: the one red cross rule serves both looks
    expect(js).toContain('store.get("ctz-look") === "modern" ? "modern" : "retro"'); // default Retro
  });
});
