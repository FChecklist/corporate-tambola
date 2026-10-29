// WP-06 TA17 / B24 (gap plan 2026-10-29, finance and IT readers): the public pages show one honest price and no invented-looking links.
//  - no computed "was" price (the old struck-out price was simply twice the real one) and no permanent "50% off" badge or line
//  - no "Test a payment (Rs 1)" link and no "Sales login" link in any public footer (the owner's own payment test page still exists, but nothing links to it)
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PUB = join(import.meta.dir, "..", "..", "web", "public");
const rd = (f: string) => readFileSync(join(PUB, f), "utf8");
const pages = readdirSync(PUB).filter((f) => f.endsWith(".html"));
const footerPages = pages.filter((f) => rd(f).includes('<footer class="uf"'));

describe("TA17: one honest price", () => {
  test("the price card has no computed 'was' price and no permanent 50% badge", () => {
    const js = rd("site.js");
    expect(js).not.toMatch(/shown \* 2/); // the old "was" was simply twice the real price
    expect(js).not.toContain('class="was"');
    expect(js).not.toContain("pburst");
    expect(js).not.toMatch(/50% OFF|Festive offer|Regular price after/i);
    expect(js).toContain('class="tot"'); // the real price is still shown
  });
  test("no public page or style says '50% off' or strikes a price through", () => {
    for (const f of pages) expect([f, /50% off|Festive offer/i.test(rd(f))]).toEqual([f, false]);
    for (const f of ["site.css"]) expect([f, /text-decoration:line-through/.test(rd(f))]).toEqual([f, false]);
  });
});

describe("B24: no test-payment link and no sales login on public pages", () => {
  test("the footer is on the expected pages", () => { expect(footerPages.length).toBeGreaterThanOrEqual(14); });
  test("no footer links to the Rs 1 payment test or to a sales login", () => {
    for (const f of footerPages) {
      const h = rd(f);
      expect([f, /Test a payment/i.test(h)]).toEqual([f, false]);
      expect([f, /href="\/paytest\.html"/.test(h)]).toEqual([f, false]);
      expect([f, /Sales login/i.test(h)]).toEqual([f, false]);
      expect([f, /#joinbox/.test(h)]).toEqual([f, false]);
    }
  });
  test("the footer still names the one payee and Razorpay, and keeps the Refer and earn link", () => {
    for (const f of footerPages) {
      const t = rd(f).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      expect([f, /IT Services by Rajat Agarwal/.test(t)]).toEqual([f, true]);
      expect([f, /Razorpay/.test(t)]).toEqual([f, true]);
      expect([f, rd(f).includes('href="/partner.html"')]).toEqual([f, true]);
    }
  });
  test("the payment test page is not linked from any public page (it stays hidden from search)", () => {
    for (const f of pages) if (f !== "paytest.html") expect([f, /href="\/?paytest\.html"/.test(rd(f))]).toEqual([f, false]);
    expect(rd("robots.txt")).toContain("Disallow: /paytest.html");
  });
});
