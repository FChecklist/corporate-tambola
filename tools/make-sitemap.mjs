// Writes apps/web/public/sitemap.xml: every public, indexable page with its last-modified date (the date of the last commit that touched the file, or today if it has uncommitted changes).
// Run: bun tools/make-sitemap.mjs   (commit the result). Pages that say noindex, and the app pages, are deliberately not listed (test/seo.test.ts checks this).
// Addresses are the clean ones (Cloudflare Pages serves /x.html as /x), the same as each page's canonical (tools/seo-tags.mjs).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { urlOf } from "./seo-tags.mjs";
// [file, changefreq, priority]. partner.html is left out on purpose: it is served with X-Robots-Tag: noindex (pages/build.mjs).
export const PAGES = [["index.html", "weekly", "1.0"], ["online-housie-for-employees.html", "monthly", "0.8"], ["tambola-for-diwali-office-party.html", "monthly", "0.8"], ["tambola-for-dealer-and-customer-meets.html", "monthly", "0.8"], ["trust.html", "monthly", "0.8"], ["pricing.html", "monthly", "0.7"], ["organizer-guide.html", "monthly", "0.6"], ["helpdesk.html", "monthly", "0.5"], ["about.html", "monthly", "0.5"], ["contact.html", "monthly", "0.5"], ["ai-prompt.html", "monthly", "0.4"], ["brochure.html", "monthly", "0.3"], ["legal.html", "monthly", "0.3"], ["terms.html", "monthly", "0.3"], ["privacy.html", "monthly", "0.3"], ["legal-position.html", "monthly", "0.3"], ["dpa.html", "monthly", "0.3"], ["subprocessors.html", "monthly", "0.3"], ["partner-terms.html", "monthly", "0.3"], ["refund-policy.html", "monthly", "0.3"]];
const git = (...a) => { try { return execFileSync("git", a, { cwd: new URL("../", import.meta.url), encoding: "utf8" }).trim(); } catch { return ""; } };
const today = new Date().toISOString().slice(0, 10);
const lastmod = (f) => { const p = "apps/web/public/" + f; return git("status", "--porcelain", "--", p) ? today : git("log", "-1", "--format=%cs", "--", p) || today; };
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map(([f, cf, pr]) => `<url><loc>${urlOf(f)}</loc><lastmod>${lastmod(f)}</lastmod><changefreq>${cf}</changefreq><priority>${pr}</priority></url>`).join("\n")}\n</urlset>\n`;
writeFileSync(new URL("../apps/web/public/sitemap.xml", import.meta.url), xml);
console.log("sitemap written,", PAGES.length, "pages");
