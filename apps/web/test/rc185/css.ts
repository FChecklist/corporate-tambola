// A small CSS cascade for the tests of the 1.8.5 polish (contrast and tap sizes). happy-dom does not load style sheets in these tests, so the real files
// (apps/web/public/*.css and the <style> the guide puts into the page) are read here and the winning declaration is chosen the way a browser does:
// !important, then specificity, then order; `color` and custom properties inherit; a background is the first opaque one up the tree. Light colour scheme only.
// Only the properties these tests read are kept. A value this file cannot read (a gradient, an unknown function) comes back as null, never as a guess.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PUB = join(import.meta.dir, "../../public");
export const cssFile = (f: string) => readFileSync(join(PUB, f), "utf8");

type Decl = { prop: string; val: string; imp: boolean; spec: number; ord: number };
type Rule = { sel: string; spec: number; decls: { prop: string; val: string; imp: boolean }[]; ord: number };
const KEEP = /^(color|background|background-color|background-image|width|height|min-width|min-height|line-height|display|font-size|padding|padding-top|padding-bottom|padding-left|padding-right|position|--[\w-]+)$/;

function stripComments(s: string) { return s.replace(/\/\*[\s\S]*?\*\//g, ""); }
function mediaOk(q: string, vw: number): boolean {
  return q.split(",").some((part) => part.trim().split(/\s+and\s+/i).every((c) => {
    c = c.trim().replace(/^only\s+/i, "");
    if (/^(screen|all)$/i.test(c)) return true;
    let m = c.match(/^\(\s*max-width\s*:\s*([\d.]+)px\s*\)$/i); if (m) return vw <= Number(m[1]);
    m = c.match(/^\(\s*min-width\s*:\s*([\d.]+)px\s*\)$/i); if (m) return vw >= Number(m[1]);
    m = c.match(/^\(\s*prefers-color-scheme\s*:\s*(\w+)\s*\)$/i); if (m) return m[1] === "light";
    return false; // print, hover, reduced motion, orientation, ...: not the situation under test
  }));
}
/** The rules of a style sheet that apply at this viewport width, in source order. */
export function parseCss(text: string, vw: number, startOrd = 0): Rule[] {
  const s = stripComments(text), out: Rule[] = []; let ord = startOrd;
  const block = (src: string) => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf("{", i); if (open < 0) break;
      const head = src.slice(i, open).trim(); let depth = 1, j = open + 1;
      while (j < src.length && depth) { if (src[j] === "{") depth++; else if (src[j] === "}") depth--; j++; }
      const body = src.slice(open + 1, j - 1); i = j;
      if (head.startsWith("@")) { if (/^@media/i.test(head) && mediaOk(head.replace(/^@media/i, "").trim(), vw)) block(body); else if (/^@supports/i.test(head)) block(body); continue; }
      const decls: Rule["decls"] = [];
      for (const d of body.split(";")) { const k = d.indexOf(":"); if (k < 0) continue; const prop = d.slice(0, k).trim().toLowerCase(); let val = d.slice(k + 1).trim(); const imp = /!important\s*$/i.test(val); val = val.replace(/\s*!important\s*$/i, ""); if (KEEP.test(prop)) decls.push({ prop, val, imp }); }
      if (!decls.length) continue;
      for (const sel of splitSel(head)) out.push({ sel, spec: specificity(sel), decls, ord: ord++ });
    }
  };
  block(s); return out;
}
function splitSel(h: string): string[] { const r: string[] = []; let d = 0, cur = ""; for (const ch of h) { if (ch === "(" || ch === "[") d++; if (ch === ")" || ch === "]") d--; if (ch === "," && !d) { r.push(cur.trim()); cur = ""; } else cur += ch; } if (cur.trim()) r.push(cur.trim()); return r; }
function specificity(sel: string): number {
  let s = sel.replace(/:(not|is|has|where)\(([^)]*)\)/g, (_m, k, inner) => (k === "where" ? "" : " " + inner + " "));
  s = s.replace(/::?[\w-]+\([^)]*\)/g, " :p ");
  const ids = (s.match(/#[\w-]+/g) ?? []).length, attrs = (s.match(/\[[^\]]*\]/g) ?? []).length;
  s = s.replace(/\[[^\]]*\]/g, "");
  const cls = (s.match(/\.[\w-]+/g) ?? []).length, pse = (s.match(/(?<!:):[\w-]+/g) ?? []).length;
  const types = (s.replace(/#[\w-]+|\.[\w-]+|::?[\w-]+/g, " ").match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length + (s.match(/::[\w-]+/g) ?? []).length;
  return ids * 10000 + (cls + attrs + pse) * 100 + types;
}

export type Sheet = Rule[];
/** Sheets from files plus the document's own <style> elements (the guide injects one), in page order. */
export function sheetsFor(doc: any, files: string[], vw = 390): Sheet {
  const rules: Rule[] = []; let ord = 0;
  for (const f of files) { const r = parseCss(cssFile(f), vw, ord); ord += r.length + 1; rules.push(...r); }
  for (const st of [...doc.querySelectorAll("style")] as any[]) { const r = parseCss(st.textContent || "", vw, ord); ord += r.length + 1; rules.push(...r); }
  return rules;
}

function declsOf(el: any, sheet: Sheet): Decl[] {
  const all: Decl[] = [];
  for (const r of sheet) { let ok = false; try { ok = el.matches(r.sel); } catch { ok = false; } if (ok) for (const d of r.decls) all.push({ ...d, spec: r.spec, ord: r.ord }); }
  const st = el.getAttribute && el.getAttribute("style");
  if (st) for (const d of st.split(";")) { const k = d.indexOf(":"); if (k > 0) { const prop = d.slice(0, k).trim().toLowerCase(); if (KEEP.test(prop)) all.push({ prop, val: d.slice(k + 1).trim().replace(/\s*!important\s*$/i, ""), imp: /!important/i.test(d), spec: 1e6, ord: 1e9 }); } }
  return all;
}
const win = (a: Decl, b: Decl) => (a.imp !== b.imp ? (a.imp ? a : b) : a.spec !== b.spec ? (a.spec > b.spec ? a : b) : a.ord >= b.ord ? a : b);
function winner(el: any, sheet: Sheet, props: string[]): Decl | null { let w: Decl | null = null; for (const d of declsOf(el, sheet)) if (props.includes(d.prop)) w = w ? win(w, d) : d; return w; }

function customProp(el: any, sheet: Sheet, name: string): string | null { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const w = winner(e, sheet, [name]); if (w) return w.val; } return null; }
function resolveVars(el: any, sheet: Sheet, v: string, depth = 0): string | null {
  if (depth > 8) return null;
  let bad = false;
  const out = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_m, n, fb) => { const c = customProp(el, sheet, n); const val = c ?? fb ?? null; if (val == null) { bad = true; return ""; } const r = resolveVars(el, sheet, val.trim(), depth + 1); if (r == null) bad = true; return r ?? ""; });
  return bad ? null : out.trim();
}

export type RGBA = [number, number, number, number];
const NAMED: Record<string, RGBA> = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] };
export function parseColor(v: string): RGBA | null {
  v = v.trim().toLowerCase(); if (NAMED[v]) return NAMED[v];
  let m = v.match(/^#([0-9a-f]{3})$/); if (m) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1) as RGBA;
  m = v.match(/^#([0-9a-f]{6})$/); if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)).concat(1) as RGBA;
  m = v.match(/^#([0-9a-f]{8})$/); if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)).concat(parseInt(m[1].slice(6, 8), 16) / 255) as RGBA;
  m = v.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/); if (m) { const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : Number(m[4]); return [Number(m[1]), Number(m[2]), Number(m[3]), a]; }
  return null;
}
const over = (top: RGBA, under: RGBA): RGBA => { const a = top[3] + under[3] * (1 - top[3]); return a === 0 ? [0, 0, 0, 0] : [0, 1, 2].map((i) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a).concat(a) as RGBA; };

/** The text colour that applies to the element (inherited when nothing sets it), or null if unreadable. */
export function textColor(el: any, sheet: Sheet): RGBA | null {
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    const w = winner(e, sheet, ["color"]); if (!w) continue;
    const r = resolveVars(e, sheet, w.val); return r == null ? null : parseColor(r);
  }
  return [0, 0, 0, 1]; // the browser default
}
/** The colours that can be behind the element's text: its own background, else the nearest ancestor's (translucent ones are blended over what is under them). A gradient gives one colour per stop, so a text must read on every stop. null when an unreadable value is behind it. */
export function backColors(el: any, sheet: Sheet): RGBA[] | null {
  let acc: RGBA[] = [[0, 0, 0, 0]];
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    const w = winner(e, sheet, ["background", "background-color", "background-image"]);
    if (!w) continue;
    const r = resolveVars(e, sheet, w.val); if (r == null) return null;
    if (/url\(/i.test(r)) return null;
    let layer: RGBA[];
    if (/gradient/i.test(r)) { const toks = r.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? []; layer = toks.map(parseColor).filter((c): c is RGBA => !!c); if (!layer.length) return null; }
    else { const c = parseColor(r.replace(/\s*(none|no-repeat|fixed|scroll)\b.*$/i, "").trim()); if (!c) return null; layer = [c]; }
    acc = acc.flatMap((a) => layer.map((l) => over(a, l))); // what is already there (translucent) sits on top of the layer further up
    if (acc.every((c) => c[3] >= 0.999)) return acc;
  }
  return acc.map((c) => (c[3] >= 0.999 ? c : over(c, [255, 255, 255, 1]))); // the canvas is white
}
const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (c: RGBA) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export function ratio(a: RGBA, b: RGBA): number { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
/** Worst contrast of the element's text against everything that can be behind it, or null if a colour cannot be read from the CSS. */
export function contrastOf(el: any, sheet: Sheet): { ratio: number; fg: string; bg: string } | null {
  const fg = textColor(el, sheet), bgs = backColors(el, sheet); if (!fg || !bgs) return null;
  const hex = (c: RGBA) => "#" + c.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
  let worst: { ratio: number; fg: string; bg: string } | null = null;
  for (const bg of bgs) { const f = fg[3] < 1 ? over(fg, bg) : fg; const r = ratio(f, bg); if (!worst || r < worst.ratio) worst = { ratio: r, fg: hex(f), bg: hex(bg) }; }
  return worst;
}

const px = (v: string | undefined): number | null => { if (!v) return null; const m = v.trim().match(/^([\d.]+)px$/); return m ? Number(m[1]) : null; };
/** The size a tap lands on: the larger of width / min-width (and height / min-height / line-height of a block-level box). null for a side the CSS leaves to the content. */
export function boxSize(el: any, sheet: Sheet): { w: number | null; h: number | null; display: string | null } {
  const g = (p: string) => { const w = winner(el, sheet, [p]); return w ? resolveVars(el, sheet, w.val) ?? undefined : undefined; };
  const max = (...v: (number | null)[]) => { const n = v.filter((x): x is number => x != null); return n.length ? Math.max(...n) : null; };
  return { w: max(px(g("width")), px(g("min-width"))), h: max(px(g("height")), px(g("min-height")), px(g("line-height"))), display: g("display") ?? null };
}
