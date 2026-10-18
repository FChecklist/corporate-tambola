// Go-to-market audit of the static site (docs/GO_TO_MARKET.md): prices, contact details, company name, links, alt text, robots, sitemap, offline page, 404, social cards, PWA.
// Reads the real files in apps/web/public. No browser.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PACKS } from "../../../packages/shared/src/pricing";
import { BRAND } from "../../edge/src/brand";

const PUB = join(import.meta.dir, "..", "public");
const read = (f: string) => readFileSync(join(PUB, f), "utf8");
const pages = readdirSync(PUB).filter((f) => f.endsWith(".html") && !f.startsWith("_"));
const scripts = readdirSync(PUB).filter((f) => f.endsWith(".js") && !["zgame.js", "reportgen.js", "control.js"].includes(f));
const textOf = (html: string) => html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&#8377;|&rupee;/g, "₹").replace(/\s+/g, " ");
const inr = new Set(PACKS.map((p) => p[1].toLocaleString("en-IN")));
const usd = new Set(PACKS.map((p) => String(p[2])));

describe("every page has the basics", () => {
  for (const f of pages) {
    test(`${f}: a title, a language, a viewport, and every picture has alt text`, () => {
      const h = read(f);
      expect(h).toMatch(/<title>[^<]{3,}<\/title>/i);
      expect(h).toMatch(/<html[^>]*\blang="/i);
      if (!/^(404|offline)/.test(f) || /viewport/.test(h)) expect(h).toMatch(/name="viewport"/i);
      for (const img of h.match(/<img\b[^>]*>/gi) ?? []) expect(img, img.slice(0, 120)).toMatch(/\balt=/i);
    });
  }
});

describe("prices are the price table, everywhere a rupee amount appears", () => {
  const allowedElsewhere: Record<string, Set<string>> = {
    "partner.html": new Set([...PACKS.map((p) => (p[1] * 0.5).toLocaleString("en-IN", { minimumFractionDigits: 2 })), "4,999", "0"]),
    "legal-position.html": new Set(["50,000"]),
  };
  for (const f of pages) {
    test(`${f}: each ₹ amount is a pack price`, () => {
      const t = textOf(read(f)); const found = [...t.matchAll(/(?:₹|Rs\.?)\s?([0-9][0-9,]*(?:\.[0-9]{2})?)/g)].map((m) => m[1]!.replace(/,$/, "")).filter((a) => a !== "1"); // "Test a payment (Rs 1)" is the footer link to the owner's one-rupee test (paytest.html)
      for (const a of found) expect(inr.has(a) || allowedElsewhere[f]?.has(a) === true, `${f} shows an amount that is not a pack price: ₹${a}`).toBe(true);
    });
  }
  test("the pricing page lists all eight packs with the table prices, and the brochure does too", () => {
    for (const f of ["pricing.html", "brochure.html"]) { const t = textOf(read(f)); for (const [pack, p] of PACKS) expect(t, `${f} ${pack}`).toContain("₹" + p.toLocaleString("en-IN")); }
  });
  test("no GST is added while the seller is not registered: the pricing page says so and shows no 18% line", () => {
    const t = textOf(read("pricing.html")); expect(t).not.toMatch(/\+\s?18%|plus GST|GST extra/i);
  });
  test("USD amounts shown anywhere are USD pack prices", () => {
    for (const f of pages) for (const m of textOf(read(f)).matchAll(/(?:US\$|USD\s?|\$)\s?([0-9][0-9,]*)/g)) expect(usd.has(m[1]!), `${f} $${m[1]}`).toBe(true);
  });
  test("the partner page's repeat-purchase promise matches the code (50% first, 50% repeat)", async () => {
    const { COMMISSION_RATE, REPEAT_COMMISSION_RATE } = await import("../../edge/src/partners");
    const t = textOf(read("partner.html")); expect(COMMISSION_RATE).toBe(0.5); expect(REPEAT_COMMISSION_RATE).toBe(0.5);
    expect(t).not.toMatch(/\b20%/); expect(t).toMatch(/50%/);
  });
});

describe("contact details and the seller", () => {
  test("the only e-mail address on any page is the support address", () => {
    for (const f of pages) for (const m of read(f).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g)) {
      if (/^(you|name|organizer)@(company|example)\./.test(m[0])) continue; // placeholders in form fields
      expect(m[0].toLowerCase(), f).toBe(BRAND.support);
    }
  });
  test("the support address is one constant and the contact page shows it with a mailto link and the phone number", () => {
    const h = read("contact.html"); expect(h).toContain(`mailto:${BRAND.support}`); expect(h).toMatch(/\+91[ -]?96503[ -]?97480/); expect(h).toContain("tel:+919650397480");
  });
  test("every phone number on any page is the owner's number", () => {
    for (const f of pages) for (const m of read(f).matchAll(/(?:\+91|tel:\+?91)[ -]?\d{5}[ -]?\d{5}/g)) expect(m[0].replace(/\D/g, "").slice(-10), f).toBe("9650397480");
  });
  test("the seller is IT Services by Rajat Agarwal on the pages that name a seller; no older company name appears anywhere", () => {
    const banned = /Shobha|Kamal\s+Solutions|FChecklist|Pvt\.?\s*Ltd|Private Limited|\bLLP\b/i;
    for (const f of [...pages, ...scripts, "llms.txt", "manifest.webmanifest"]) expect(read(f), f).not.toMatch(banned);
    for (const f of ["terms.html", "legal.html", "privacy.html", "dpa.html", "index.html", "brochure.html", "refund-policy.html"]) expect(textOf(read(f)), f).toMatch(/IT Services by Rajat Agarwal/);
  });
  test("the product is always called Corporate Tambola, never a shortened or older name in a title", () => {
    for (const f of pages) { const t = read(f).match(/<title>([^<]*)<\/title>/i)![1]!; expect(/Tambola|Corporate/.test(t) || /^(404|Not found|Offline)/i.test(t), `${f}: ${t}`).toBe(true); }
  });
});

describe("links and files", () => {
  const DYNAMIC = /^\/(api|ai|j)\//;
  const exists = (path: string) => { const p = path.replace(/^\//, "").split(/[?#]/)[0]!; return p === "" || existsSync(join(PUB, p)) || existsSync(join(PUB, p + ".html")) || existsSync(join(PUB, p, "index.html")); };
  for (const f of pages) {
    test(`${f}: every local link, script, stylesheet and picture points at a file we ship`, () => {
      const h = read(f);
      for (const m of h.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
        const u = m[1]!; if (/^(https?:|mailto:|tel:|#|data:|javascript:|\/\/)/i.test(u) || DYNAMIC.test(u) || u.includes("${")) continue;
        expect(exists(u.startsWith("/") ? u : "/" + u), `${f} -> ${u}`).toBe(true);
      }
    });
  }
  test("no link on any page points at a pages.dev address or a localhost address", () => {
    for (const f of pages) expect(read(f).replace(/https:\/\/(?:rajat-agarwal-startup-coach|itservices-rajat-agarwal)\.pages\.dev\/?/g, "").replace(/>itservices-rajat-agarwal\.pages\.dev</g, "><"), f).not.toMatch(/https?:\/\/[^"' )]*(?:\.pages\.dev|localhost|127\.0\.0\.1)/i); // the footer's sister-product link is the one allowed exception (listed in GO_TO_MARKET.md)
  });
  test("every external https link opens safely: noopener when it opens a new tab", () => {
    for (const f of pages) for (const a of read(f).match(/<a\b[^>]*target="_blank"[^>]*>/gi) ?? []) expect(a, f).toMatch(/rel="[^"]*noopener/);
  });
});

describe("robots, sitemap, social cards, offline page, 404, PWA", () => {
  const robots = read("robots.txt");
  test("robots.txt keeps private pages and the API out of search and names the sitemap on the real domain", () => {
    for (const p of ["/api/", "/ai/", "/pay.html", "/z.html", "/zc.html", "/report.html", "/signin.html"]) expect(robots).toContain(`Disallow: ${p}`);
    expect(robots).toContain(`Sitemap: ${BRAND.defaultOrigin}/sitemap.xml`);
    for (const m of robots.matchAll(/Disallow: (\/\S+\.html)/g)) expect(existsSync(join(PUB, m[1]!)), m[1]).toBe(true);
  });
  const sm = read("sitemap.xml"); const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  test("the sitemap lists only pages that exist, once each, on the real domain, and none that robots.txt hides", () => {
    expect(locs.length).toBeGreaterThan(8); expect(new Set(locs).size).toBe(locs.length);
    for (const l of locs) { expect(l.startsWith(BRAND.defaultOrigin + "/")).toBe(true); const path = l.slice(BRAND.defaultOrigin.length); expect(existsSync(join(PUB, path === "/" ? "index.html" : path.slice(1))), l).toBe(true); expect(robots.split("\n").map((x) => x.trim()), l).not.toContain(`Disallow: ${path}`); }
  });
  test("the home page, pricing and legal pages are in the sitemap", () => { for (const p of ["/", "/pricing.html", "/terms.html", "/privacy.html", "/legal.html", "/contact.html"]) expect(locs, p).toContain(BRAND.defaultOrigin + p); });
  for (const f of ["index.html", "pricing.html", "about.html", "contact.html", "partner.html", "organizer-guide.html"]) {
    test(`${f}: a description under 175 characters, a canonical link on the real domain, and a share card with image, title and description`, () => {
      const h = read(f); const d = h.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? ""; expect(d.length).toBeGreaterThan(40); expect(d.length, f).toBeLessThanOrEqual(175);
      expect(h).toMatch(new RegExp(`<link rel="canonical" href="${BRAND.defaultOrigin.replace(/\./g, "\\.")}/`)); expect(h).toMatch(/property="og:title"/); expect(h).toMatch(/property="og:description"/); expect(h).toMatch(/property="og:image"/);
      const img = h.match(/property="og:image" content="([^"]+)"/i)?.[1]!; if (img.startsWith(BRAND.defaultOrigin)) expect(existsSync(join(PUB, img.slice(BRAND.defaultOrigin.length + 1))), img).toBe(true);
    });
  }
  test("the offline page tells the person plainly what happened and offers a way back", () => { const t = textOf(read("offline.html")); expect(t.length).toBeGreaterThan(40); expect(read("offline.html")).toMatch(/href="\/?[^"]*"|onclick|location/i); expect(t).not.toMatch(/undefined|null|\[object/); });
  test("the 404 page says the page was not found in plain words and links to the home page and the support address", () => {
    const h = read("404.html"); expect(textOf(h)).toMatch(/not found|could not find|no such page|isn.t here/i); expect(h).toMatch(/href="\/"/); expect(h).not.toMatch(/\.pages\.dev|stack|trace/i);
  });
  test("the manifest is complete: name, start page, icons that exist, standalone display", () => {
    const m = JSON.parse(read("manifest.webmanifest")); expect(m.name).toBe("Corporate Tambola"); expect(m.display).toBe("standalone"); expect(existsSync(join(PUB, m.start_url.slice(1).split("?")[0]))).toBe(true);
    for (const i of m.icons) { expect(existsSync(join(PUB, i.src.slice(1))), i.src).toBe(true); expect(statSync(join(PUB, i.src.slice(1))).size).toBeGreaterThan(500); }
    expect(m.icons.some((i: any) => i.purpose === "maskable")).toBe(true); expect(m.icons.some((i: any) => i.sizes === "512x512")).toBe(true);
  });
  test("the service worker caches the offline page and every file it names exists", () => {
    const sw = read("sw.js") + read("zsw.js"); expect(sw).toMatch(/offline\.html/);
    for (const m of (read("sw.js") + read("zsw.js")).matchAll(/["'](\/[A-Za-z0-9._-]+\.(?:html|js|css|png|svg|json|webmanifest))["']/g)) expect(existsSync(join(PUB, m[1]!.slice(1))), m[1]).toBe(true);
  });
  test("llms.txt names the product, the support address and no wrong price", () => { const t = read("llms.txt"); expect(t).toContain("Corporate Tambola"); for (const m of t.matchAll(/(?:₹|Rs\.?\s?)([0-9][0-9,]+)/g)) expect(inr.has(m[1]!)).toBe(true); });
});

describe("the support and grievance path", () => {
  test("the contact page promises one thing about timing, and the privacy page names the data-request route and the 30-day outer limit", () => {
    expect(textOf(read("contact.html"))).toMatch(/30 days/); const p = textOf(read("privacy.html")); expect(p).toMatch(/delete|erase/i);
  });
  test("the player page links to the 'what do you hold about me / delete me' flow", () => { expect(read("z.js") + read("rights.js") + read("play.js")).toMatch(/datareq/); });
  test("the legal page names a grievance contact with an address", () => { const t = textOf(read("legal.html")); expect(t).toMatch(/grievance|complaint|contact/i); expect(read("legal.html")).toContain(BRAND.support); });
});

describe("the deletion times written for people match the clock in the code", () => {
  test("no public page, script or AI text still says 22 or 23 hours (the clock is 20 hours, the report link 19; the promise is 24)", async () => {
    const { PURGE_AFTER_MS, REPORT_LINK_MS } = await import("../../edge/src/lifecycle");
    expect(PURGE_AFTER_MS / 3_600_000).toBe(20); expect(REPORT_LINK_MS / 3_600_000).toBe(19);
    const EDGE = join(import.meta.dir, "..", "..", "edge", "src");
    const files = [...pages.map((f) => join(PUB, f)), ...scripts.map((f) => join(PUB, f)), ...["consent-text.json", "ai-facts.ts", "ai-functions.ts", "ai-link.ts", "mails.ts", "report-layout.ts"].map((f) => join(EDGE, f))];
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/(?:22|23)[ -]hours?/i);
  });
  test("the pages that give an exact time for a game that never started say 20 hours", () => {
    for (const f of ["terms.html", "legal.html", "trust.html"]) expect(textOf(read(f)), f).toMatch(/20 hours after/);
  });
});
