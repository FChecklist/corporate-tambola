// Guard: the small mark "१३९" is on every page, once, with the approved look (owner order, 25 Nov 2026).
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const MARK = `<div class="mark139" lang="hi" aria-hidden="true"><span>१३९</span></div>`;
const CSS = `.mark139{position:absolute;top:0;left:0;right:0;margin:0;padding:1px 0 0;text-align:center;line-height:1;pointer-events:none;user-select:none;z-index:2147483647;font-family:"Noto Sans Devanagari","Mukta","Nirmala UI","Mangal","Kohinoor Devanagari","Devanagari Sangam MN",sans-serif;font-size:6px;font-weight:700;color:#0B2A6B}
.mark139 span{display:inline-block;border-bottom:.5px solid #7A1010;padding-bottom:.5px}`;
const norm = (s: string) => s.replace(/\r\n/g, "\n");
const count = (s: string, needle: string) => s.split(needle).length - 1;

const PUB = "apps/web/public";
const walkHtml = (d: string): string[] => readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (e.name === "node_modules" ? [] : walkHtml(`${d}/${e.name}`)) : e.name.endsWith(".html") ? [`${d}/${e.name}`] : []);
const STATIC = walkHtml(PUB); // every html page, in every folder (the generated trust.html too: tools/make-trust.ts)
const CSS_IN_APP_CSS = new Set([`${PUB}/z.html`, `${PUB}/zc.html`]); // their policy is style-src 'self': the CSS comes from app.css
// Pages built in code: file -> how many page templates it holds (e-mails are not pages: brand.ts, report-email.ts).
const BUILT: Record<string, number> = {
  "apps/edge/src/admin.ts": 1, "apps/edge/src/people.ts": 2, "apps/edge/src/v2-certs.ts": 1, "apps/edge/src/trust-page.ts": 1, "packages/billing/src/index.ts": 1,
};

describe("mark 139: the approved text", () => {
  test("shared source holds exactly the approved markup and CSS", () => {
    const s = norm(read("apps/edge/src/mark139.ts"));
    expect(s).toContain(CSS); expect(s).toContain(MARK);
  });
  test("the approved numbers are in the CSS", () => {
    for (const t of ["#0B2A6B", "#7A1010", "font-size:6px", "font-weight:700", ".5px solid", "padding-bottom:.5px", "pointer-events:none", "user-select:none", "position:absolute"]) expect(CSS).toContain(t);
    expect(MARK).toContain("१३९"); // १३९
  });
});

describe("mark 139: every static page", () => {
  test("there are pages to check", () => { expect(STATIC.length).toBeGreaterThan(40); });
  for (const f of STATIC) {
    test(f, () => {
      const s = norm(read(f));
      expect(count(s, 'class="mark139"')).toBe(1);
      expect(count(s, MARK)).toBe(1);
      const body = /<body[^>]*>/.exec(s)![0];
      expect(s).toContain(body + MARK); // first child of <body>
      if (CSS_IN_APP_CSS.has(f)) { expect(count(s, ".mark139")).toBe(0); expect(s).toContain('href="/app.css"'); }
      else expect(count(s, CSS)).toBe(1);
    });
  }
  test("app.css carries the CSS once (for the pages with no inline style)", () => { expect(count(norm(read(`${PUB}/app.css`)), CSS)).toBe(1); });
});

describe("mark 139: pages built in code", () => {
  for (const [f, n] of Object.entries(BUILT)) {
    test(f, () => {
      const s = norm(read(f));
      if (f.startsWith("packages/")) { expect(count(s, CSS)).toBe(1); expect(count(s, MARK)).toBe(1); }
      else { expect(count(s, "${MARK139_HTML}")).toBe(n); expect(count(s, "${MARK139_CSS}")).toBe(n); expect(s).toContain('from "./mark139"'); }
    });
  }
  test("no other source builds a whole page unnoticed (e-mails are the only ones left out)", () => {
    const left = new Set(["apps/edge/src/brand.ts", "apps/edge/src/report-email.ts", "apps/edge/src/mark139.ts"]);
    const found: string[] = [];
    const walk = (d: string) => { for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "test") continue;
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p); else if (/\.(ts|mjs|js)$/.test(e.name) && /<!doctype html/i.test(read(p))) found.push(p);
    } };
    walk("apps/edge/src"); walk("packages"); walk("pages/functions"); walk("apps/cron/src");
    expect(found.filter((p) => !(p in BUILT) && !left.has(p))).toEqual([]);
  });
  test("the invoice fragment shown on the payment-done screen (which has its own mark) strips the mark, on both paths", () => {
    expect(count(read("apps/edge/src/pay.ts"), "mark139")).toBe(2);
  });
});
