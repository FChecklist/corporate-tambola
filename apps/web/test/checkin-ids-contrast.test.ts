// D2 (live test, 3 Nov 2026, phone screenshot p9-admitted): on the "Before the game" card the values of Game ID, Participant ID and Ticket ID were almost invisible.
// The box (.zckids) keeps its cream background in every look, but its values (<b>) had no colour of their own, so they took the page text colour, which the Retro and
// Modern looks make pale. Each word in the box must now carry its own dark colour with at least the WCAG AA contrast (4.5:1) on the cream, in every look.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pub = (f: string) => readFileSync(join(import.meta.dir, "../public", f), "utf8").replace(/\r\n/g, "\n");
const css = pub("z.css"), z = pub("z.js");

/** The declarations of the rule whose selector is exactly `sel` (the first one, at the top level of z.css). */
const rule = (sel: string): string | null => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[}\\n])\\s*${esc}\\{([^}]*)\\}`).exec(css)?.[1] ?? null;
};
const prop = (decl: string | null, name: string): string | null => (decl ? new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(decl)?.[1]?.trim() ?? null : null);
const lum = (hex: string) => {
  const h = hex.replace("#", ""), full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const ch = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

describe("D2: the Game ID, Participant ID and Ticket ID on the Before the game card are dark and readable", () => {
  test("the card's markup: each label is a <span>, each value a <b>, inside .zckids", () => {
    expect(z).toContain('<div class="zckids"><div><span>Game ID</span><b>${esc(CK.ids.game)}</b></div><div><span>Participant ID</span><b>${esc(CK.ids.participant)}</b></div><div><span>Ticket ID</span><b>${esc(CK.ids.ticket)}</b></div></div>');
  });
  test("the box is cream, and the labels and the values each carry their own colour with at least 4.5:1 on it", () => {
    const bg = prop(rule(".zckids"), "background");
    expect(bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
    for (const sel of [".zckids b", ".zckids span"]) {
      const c = prop(rule(sel), "color");
      expect([sel, c]).toEqual([sel, expect.stringMatching(/^#[0-9A-Fa-f]{3,6}$/)]); // its own colour: nothing inherited from the look
      expect([sel, contrast(c!, bg!) >= 4.5]).toEqual([sel, true]);
    }
    expect(contrast(prop(rule(".zckids b"), "color")!, bg!)).toBeGreaterThanOrEqual(7); // the values are the part people read out: AAA
  });
  test("why it matters: the text colour of the Retro and Modern looks is pale, so a value that only inherited it could not be read on the cream box", () => {
    const bg = prop(rule(".zckids"), "background")!;
    for (const look of ["retro", "modern"]) {
      const ink = prop(rule(`html[data-pt=${look}]`), "--ink");
      expect(ink).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(contrast(ink!, bg)).toBeLessThan(1.5); // (this is what the phone showed: pale on cream)
    }
  });
  test("no look rule changes the box or its words back", () => {
    expect(css).not.toMatch(/html\[data-pt[^\]]*\][^{]*\.zckids/);
  });
});
