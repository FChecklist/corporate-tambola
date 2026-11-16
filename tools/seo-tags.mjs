// One place for the search-engine and sharing tags of every public page (title, description, canonical, robots, Open Graph, Twitter card, JSON-LD, font preload).
// Used by tools/make-legal-pages.mjs, tools/make-usecase-pages.mjs and tools/apply-seo-head.mjs. Written idempotently: old copies are removed first.
// ORIGIN is the one place that names the public address. Cloudflare Pages serves "/x.html" as "/x" (308), so the canonical and sitemap use the clean address.
import { readFileSync } from "node:fs";

export const ORIGIN = "https://corporatetambola.com";
export const OG_IMAGE = `${ORIGIN}/og-corporate-tambola.png`; // 1200x630 PNG, under 300 KB
export const OG_ALT = "Corporate Tambola: online tambola for office events, shown as a ticket on a phone";
export const LAST_MOD = "2026-10-30";
export const urlOf = (file) => (file === "index.html" ? ORIGIN + "/" : ORIGIN + "/" + file.replace(/\.html$/, ""));

// The real price list (packages/shared/src/pricing.ts): [participants, INR, USD]. Read from the source so the structured data can never drift from the price list.
export const PACKS = [...readFileSync(new URL("../packages/shared/src/pricing.ts", import.meta.url), "utf8").match(/PACKS[^=]*=\s*\[([\s\S]*?)\n\];/)[1].matchAll(/\[(\d+), (\d+), (\d+)\]/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);

export const attr = (v) => v.replace(/&(?!amp;|rsquo;|ldquo;|rdquo;|lsquo;|nbsp;)/g, "&amp;").replace(/"/g, "&quot;");
const plain = (v) => v.replace(/&rsquo;/g, "’").replace(/&lsquo;/g, "‘").replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const json = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

// Title (60 characters at most, main phrase first), description (155 at most) and breadcrumb name of each indexable page.
export const META = {
  "index.html": { title: "Online Tambola for Office Events | Corporate Tambola", desc: "Run a live online tambola for your office or company event. Your own brand video between numbers. Plays on any phone: no app, no SMS, no password." },
  "trust.html": { title: "Corporate Tambola Safety and Privacy: 10 Facts", crumb: "Safety and privacy", desc: "Ten plain facts: who runs the game, unique tickets, guest data erased within 24 hours, encryption, the laws it is designed to follow, and money." },
  "legal.html": { title: "Tambola Rules, Privacy and Disclaimer | Corporate Tambola", crumb: "Rules, privacy and disclaimer", desc: "The rules of a Corporate Tambola game, how participant names and mobile numbers are deleted within 24 hours, and the disclaimer. Plain English." },
  "legal-position.html": { title: "Legal Position | Corporate Tambola", crumb: "Legal position", desc: "The legal position on which Corporate Tambola is supplied: software only, no stake from players, close groups, data erased within 24 hours." },
  "refund-policy.html": { title: "Refund and Cancellation Policy | Corporate Tambola", crumb: "Refund and cancellation policy", desc: "You pay per game and there is no refund after payment. A paid game can be moved to any date within 365 days. Plain English." },
  "privacy.html": { title: "Privacy Policy and Notice | Corporate Tambola", crumb: "Privacy policy and notice", desc: "What Corporate Tambola keeps, why, for how long and who sees it. A plain-English notice with your rights and the Grievance Officer." },
  "terms.html": { title: "Corporate Tambola Terms and Conditions", crumb: "Terms and conditions", desc: "The short, plain-English terms for organizers who run a Corporate Tambola game for their company." },
  "dpa.html": { title: "Data Processing Terms | Corporate Tambola", crumb: "Data processing terms", desc: "Data processing terms for organizers: what we do with your participants' details, on one page." },
  "subprocessors.html": { title: "Sub-processors | Corporate Tambola", crumb: "Sub-processors", desc: "The providers that help us run Corporate Tambola, and what each one receives." },
  "partner-terms.html": { title: "Partner Terms | Corporate Tambola", crumb: "Partner terms", desc: "The terms for Corporate Tambola's Refer and earn partners, in plain English." },
  "organizer-guide.html": { title: "How to Run a Corporate Tambola: Organizer Guide", crumb: "Organizer guide", desc: "Short notes to run a safe, simple corporate tambola: how to set up, share, run and close a game, and how players win." },
  "ai-prompt.html": { title: "AI Assistant Setup for Online Tambola | Corporate Tambola", crumb: "AI assistant setup", desc: "Let ChatGPT, Gemini or Claude set up your online tambola for you. Copy one message, paste your personal work link, and your game is ready." },
  "brochure.html": { title: "Corporate Tambola Brochure for Organizers", crumb: "Brochure", desc: "A tambola night your whole team will talk about: what Corporate Tambola does, how it works and what it costs." },
  "about.html": { title: "About Corporate Tambola | IT Services by Rajat Agarwal", crumb: "About", desc: "Corporate Tambola is live engagement software for companies, run by IT Services by Rajat Agarwal." },
  "contact.html": { title: "Contact Corporate Tambola", crumb: "Contact", desc: "Write, call or WhatsApp the Corporate Tambola team. We reply in English." },
  "pricing.html": { title: "Online Tambola Pricing for Companies | Corporate Tambola", crumb: "Pricing", desc: "One price per game, by the number of participants. Rupees in India, US dollars abroad. No GST is charged. No yearly plan." },
  "helpdesk.html": { title: "Help Desk: Prepare Games for Organizers | Corporate Tambola", crumb: "Help Desk", desc: "Join the Help Desk: prepare tambola games for company organizers, who check and publish them, and earn on every game they run." },
};

const MAXT = 60, MAXD = 155;
export function metaFor(file) {
  const m = META[file]; if (!m) throw new Error("no SEO meta for " + file);
  if (m.title.length > MAXT) throw new Error(`title too long (${m.title.length}) for ${file}`);
  if (m.desc.length > MAXD) throw new Error(`description too long (${m.desc.length}) for ${file}`);
  return m;
}

export const orgLd = () => ({ "@type": "Organization", "@id": ORIGIN + "/#org", name: "Corporate Tambola", url: ORIGIN + "/", logo: ORIGIN + "/logo-1024.png", email: "hello@corporatetambola.com", parentOrganization: { "@type": "Organization", name: "IT Services by Rajat Agarwal" } });
export const crumbLd = (crumbs) => ({ "@type": "BreadcrumbList", itemListElement: crumbs.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: url })) });
export const faqLd = (qa) => ({ "@type": "FAQPage", mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: plain(q), acceptedAnswer: { "@type": "Answer", text: plain(a.replace(/<[^>]+>/g, "")) } })) });
export const offersLd = () => ({ "@type": "AggregateOffer", priceCurrency: "INR", lowPrice: String(Math.min(...PACKS.map((p) => p[1]))), highPrice: String(Math.max(...PACKS.map((p) => p[1]))), offerCount: String(PACKS.length), offers: PACKS.map(([n, inr]) => ({ "@type": "Offer", name: `Up to ${n} participants`, price: String(inr), priceCurrency: "INR", url: ORIGIN + "/#pricing" })) });

// Removes every tag this module writes, so it can be written again.
export function stripSeo(html, { manifest = true } = {}) {
  return html.replace(/[ \t]*<meta name="description"[^>]*>\r?\n?/g, "").replace(/[ \t]*<link rel="canonical"[^>]*>\r?\n?/g, "").replace(/[ \t]*<meta property="og:[^>]*>\r?\n?/g, "").replace(/[ \t]*<meta name="twitter:[^>]*>\r?\n?/g, "")
    .replace(/[ \t]*<meta name="robots" content="index[^>]*>\r?\n?/g, "").replace(/[ \t]*<script type="application\/ld\+json">[\s\S]*?<\/script>\r?\n?/g, "")
    .replace(/[ \t]*<link rel="preload" href="\/fonts\/[^>]*>\r?\n?/g, "").replace(manifest ? /[ \t]*<link rel="manifest"[^>]*>\r?\n?/g : /(?!)/g, "");
}

// file: "x.html"; ld: extra JSON-LD objects (without @context); noindex: leave out the robots tag (the page keeps its own noindex).
export function seoBlock({ file, title, desc, ld = [], nl = "\n", noindex = false }) {
  const url = urlOf(file), t = attr(title), d = attr(desc);
  const tags = [
    `<meta name="description" content="${d}">`, `<link rel="canonical" href="${url}">`, ...(noindex ? [] : [`<meta name="robots" content="index, follow, max-image-preview:large">`]),
    `<meta property="og:type" content="website"><meta property="og:site_name" content="Corporate Tambola"><meta property="og:title" content="${t}"><meta property="og:description" content="${d}"><meta property="og:url" content="${url}"><meta property="og:image" content="${OG_IMAGE}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${attr(OG_ALT)}"><meta property="og:locale" content="en_IN">`,
    `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${t}"><meta name="twitter:description" content="${d}"><meta name="twitter:image" content="${OG_IMAGE}"><meta name="twitter:image:alt" content="${attr(OG_ALT)}">`,
    `<link rel="preload" href="/fonts/Inter-normal-400.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/fonts/Fraunces-normal-500-700.woff2" as="font" type="font/woff2" crossorigin>`,
  ];
  if (!noindex) tags.push(`<link rel="manifest" href="/site.webmanifest">`);
  if (ld.length) tags.push(`<script type="application/ld+json">${json(ld.map((o) => ({ "@context": "https://schema.org", ...o })))}</script>`);
  return tags.join(nl);
}

// Rewrites <title> and all the tags above in a page's head. Page is one of META's files, or { file, title, desc } for a new page.
export function withSeo(html, page, ld = []) {
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  const m = typeof page === "string" ? { file: page, ...metaFor(page) } : page;
  if (m.title.length > MAXT || m.desc.length > MAXD) throw new Error("title or description too long for " + m.file);
  const crumbs = m.file === "index.html" ? [] : [crumbLd([["Home", ORIGIN + "/"], [m.crumb ?? m.title.split(" |")[0], urlOf(m.file)]])];
  const stripped = stripSeo(html, { manifest: !m.noindex }).replace(/<title>[^<]*<\/title>\r?\n?/, `<title>${attr(m.title)}</title>${nl}`);
  return stripped.replace(/(<title>[^<]*<\/title>)\r?\n?/, (_, a) => a + nl + seoBlock({ file: m.file, title: m.title, desc: m.desc, ld: [...ld, ...crumbs], nl, noindex: m.noindex }) + nl);
}
