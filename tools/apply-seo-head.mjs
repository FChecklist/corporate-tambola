// Applies the search, share and AI-search tags to the hand-written public pages (home, trust, legal, terms, dpa, organizer guide, pricing, about, contact, brochure, help desk, AI prompt, demo)
// and the small copy changes that go with them (H1 with the main phrase, visible FAQ, links to the use-case pages). Safe to run again: it writes the same result every time.
// Run: node tools/apply-seo-head.mjs      (commit the result). The tags themselves come from tools/seo-tags.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import { ORIGIN, PACKS, META, orgLd, faqLd, offersLd, withSeo, urlOf, attr } from "./seo-tags.mjs";

const PUB = new URL("../apps/web/public/", import.meta.url);
const rd = (f) => readFileSync(new URL(f, PUB), "utf8"), wr = (f, s) => writeFileSync(new URL(f, PUB), s);
const must = (s, from, to, file) => { if (!s.includes(from)) throw new Error(`${file}: text not found: ${from.slice(0, 60)}`); return s.replace(from, to); };
const swap = (s, from, to, file) => (s.includes(to) ? s : must(s, from, to, file)); // already applied → leave as is
const rs = (n) => "Rs " + n.toLocaleString("en-IN");
const pack = (n) => PACKS.find((p) => p[0] === n);
const faqSection = (qa, { cls = "" } = {}) => `<!--faq--><section id="faq" aria-labelledby="faqh"${cls}><h2 id="faqh">Questions and answers</h2>\n${qa.map(([q, a]) => `  <h3>${q}</h3>\n  <p>${a}</p>`).join("\n")}\n</section><!--/faq-->`;

// ---------- the use-case pages are written by tools/make-usecase-pages.mjs; the footer of every page links to them
const USECASES = [["/online-housie-for-employees", "Online housie for employees"], ["/tambola-for-diwali-office-party", "Tambola for a Diwali office party"], ["/tambola-for-dealer-and-customer-meets", "Tambola for dealer and customer meets"]];
const footLinks = USECASES.map(([u, t]) => `<li><a href="${u}">${t}</a></li>`).join("");
const ANCHOR = '<li><a href="/organizer-guide.html">Organizer guide</a></li>';
function footer(html, file) {
  if (html.includes(USECASES[0][0] + '">')) return html;
  return html.includes(ANCHOR) ? html.replace(ANCHOR, ANCHOR + footLinks) : html;
}

// ---------- home
const HOME_FAQ_NEW = [
  ["How do I play tambola online with colleagues?", "The organizer builds the game and shares one link on WhatsApp, e-mail or the intranet. Each colleague opens it on their own phone, types a mobile number and gets their own ticket. A clear voice calls every number, players tap the numbers on their ticket and press Claim, and the software checks every claim."],
  ["How do I run housie for 200 employees?", `Choose the size &ldquo;Up to ${pack(250)[0]} participants&rdquo; (${rs(pack(250)[1])} in India, no GST charged): it covers 200 employees. Building and publishing are free and you pay once before the start. Everyone plays on their own phone, from the office, home or another city. You can also run it next to a Google Meet, Zoom or Teams call.`],
  ["Is there an online tambola for corporate events in India?", `Yes. Corporate Tambola is an online tambola (housie) made for company events: employees and their families, dealers, customers and vendors. Prices are in rupees, from ${rs(PACKS[0][1])} for up to ${PACKS[0][0]} participants, and no GST is charged. You pay online through Razorpay to IT Services by Rajat Agarwal.`],
];
function home(h) {
  const F = "index.html";
  h = swap(h, "<h1 id=\"h1\">Engage your company's <em>extended family.</em></h1>", "<h1 id=\"h1\">Online tambola for your office. <em>Engage your extended family.</em></h1>", F);
  h = swap(h, "<span>Private by design</span>", "<span>Close group by design</span>", F);
  h = swap(h, "You get a private work link for your own AI assistant.", "You get a personal work link for your own AI assistant.", F);
  // FAQ: the three new questions after the first one; "How is the organizer verified?" is answered on the sign-in page and in the guide, so the list stays at 8
  if (!h.includes(HOME_FAQ_NEW[0][0])) {
    const dropVerified = h.replace(/\s*<details open><summary>How is the organizer verified\?<\/summary>[\s\S]*?<\/details>/, "");
    if (dropVerified === h) throw new Error("index.html: verified FAQ not found");
    h = dropVerified;
    const first = h.indexOf("<details open><summary>Do participants pay or install anything?</summary>");
    if (first < 0) throw new Error("index.html: FAQ anchor not found");
    h = h.slice(0, first) + HOME_FAQ_NEW.map(([q, a]) => `<details open><summary>${q}</summary><p>${a}</p></details>\n  `).join("") + h.slice(first);
  }
  h = h.replace(" festive price in India, no GST charged", " in India, no GST charged"); // the price list is the price paid; the word "festive" belongs to the offer badge only
  // links to the use-case pages, the guide and the trust page, between the FAQ and "How it works"
  if (!h.includes('id="ideas"')) {
    h = must(h, '<section class="sec" id="how" aria-labelledby="hh">', `<section class="sec" id="ideas" aria-labelledby="ih"><div class="in">
  <div class="eyebrow">Ideas for your event</div><h2 class="h" id="ih">Online housie for every kind of company event.</h2>
  <ul class="ideas">${USECASES.map(([u, t]) => `<li><a href="${u}">${t}</a></li>`).join("")}<li><a href="/organizer-guide.html">How to run a corporate tambola: organizer guide</a></li><li><a href="/trust.html">Safety and privacy: 10 facts</a></li><li><a href="/pricing.html">Pricing by number of participants</a></li></ul>
  <p class="lead">Family day tambola, a Diwali party at the office, a virtual housie for employees across cities: one link, every phone.</p>
</div></section>
<section class="sec" id="how" aria-labelledby="hh">`, F);
  }
  // JSON-LD questions come from the visible FAQ, so they cannot differ
  const faq = [...h.matchAll(/<details[^>]*><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map((m, i) => [m[1], i === 0 ? "Use the free AI assistant (the easiest way): tell it what you want and your engagement is ready in about 2 minutes. Or set it up yourself in the organizer console." : m[2]]);
  if (faq.length < 5 || faq.length > 8) throw new Error("home FAQ must have 5 to 8 questions, has " + faq.length);
  const desc = META[F].desc;
  const ld = [orgLd(), { "@type": "WebSite", "@id": ORIGIN + "/#site", name: "Corporate Tambola", url: ORIGIN + "/", inLanguage: "en", publisher: { "@id": ORIGIN + "/#org" } },
    { "@type": "SoftwareApplication", name: "Corporate Tambola", applicationCategory: "BusinessApplication", operatingSystem: "Web", description: desc, url: ORIGIN + "/", publisher: { "@type": "Organization", name: "IT Services by Rajat Agarwal" }, offers: offersLd() }, faqLd(faq)];
  h = withSeo(h, F, ld);
  return h.includes('as="image" href="/img/ticket.webp"') ? h : must(h, '<link rel="manifest" href="/site.webmanifest">', '<link rel="manifest" href="/site.webmanifest"><link rel="preload" as="image" href="/img/ticket.webp" type="image/webp" fetchpriority="high">', F); // the picture at the top loads first
}

// ---------- organizer guide: H1, close-group wording, visible FAQ
const GUIDE_FAQ = [
  ["How do I run a corporate tambola for my team?", "Build the game, share one link, and start when your people are in the waiting room. Everyone plays on their own phone, so it works as a virtual housie for employees in any city. Building and publishing are free; you pay once before the start."],
  ["Do players need to install an app?", "No. Players open your link on their phone and type a mobile number. There is no app, no SMS code and no password."],
  ["How do players win?", "Players see the number just called and tap it on their own ticket. When a row or the whole ticket is complete, they press Claim. The software checks the claim against the called numbers."],
  ["Who gives the prizes?", "You do. We provide the software only and never hold prizes or money for them. Winners confirm their details on their own phone and you tick &ldquo;Prize given&rdquo; in your console."],
  ["What happens to my players' data?", "Names and mobile numbers are deleted within 24 hours after the game ends. Open your report before then. You can also delete earlier from your console."],
  ["Can we play inside Google Meet, Zoom or Teams?", "Yes, as an option. Nothing is installed in the meeting app: share your screen with the number screen, and everyone plays on their own phone next to the call."],
];
function guide(h) {
  const F = "organizer-guide.html";
  h = swap(h, "<h1>Organizer guide</h1>", "<h1>How to run a corporate tambola: organizer guide</h1>", F);
  h = h.replace(/Keep it a private game/g, "Keep it a close-group game");
  if (!h.includes("<!--faq-->")) h = must(h, "</main>", faqSection(GUIDE_FAQ) + "\n</main>", F); else h = h.replace(/<!--faq-->[\s\S]*?<!--\/faq-->/, faqSection(GUIDE_FAQ));
  return withSeo(h, F, [faqLd(GUIDE_FAQ)]);
}

// ---------- the small changes of the other pages
const EDIT = {
  "trust.html": (h) => swap(h, "<h1>Safety, privacy and how it works: 10 facts</h1>", "<h1>Corporate Tambola safety and privacy: 10 facts</h1>", "trust.html"),
  "legal.html": (h) => swap(swap(h, "<h1>Rules, privacy and disclaimer</h1>", "<h1>Tambola rules, privacy and disclaimer</h1>", "legal.html"), "This is a private game for a closed group,", "This is a close-group game,", "legal.html"),
  "dpa.html": (h) => swap(h, "<h1>Data processing terms</h1>", "<h1>Data processing terms for Corporate Tambola</h1>", "dpa.html"),
  "pricing.html": (h) => swap(h, "<h1>Pricing</h1>", "<h1>Online tambola pricing for companies</h1>", "pricing.html"),
};

for (const f of Object.keys(META)) {
  let h = rd(f);
  if (f === "index.html") h = home(h);
  else if (f === "organizer-guide.html") h = guide(h);
  else { h = EDIT[f] ? EDIT[f](h) : h; h = withSeo(h, f); }
  wr(f, footer(h, f));
}

// ---------- demo: stays noindex (a game screen, no text to index); gets share tags so a pasted link shows a proper card, and a heading for people without scripts
{
  let h = rd("demo.html");
  const m = { file: "demo.html", title: "Free Online Tambola Demo | Corporate Tambola", desc: "A real tambola ticket and a real mini-game of about a minute, free. One button, nothing to type.", crumb: "Demo", noindex: true };
  h = withSeo(h, m);
  if (!h.includes("<noscript>")) h = must(h, '<main id="app"', '<noscript><h1>Free online tambola demo</h1><p>The demo needs JavaScript. <a href="/">Go to Corporate Tambola</a>.</p></noscript>\n<main id="app"', "demo.html");
  wr("demo.html", h);
}

// ---------- the friendly 404 (noindex already): links to the useful pages
{
  let h = rd("404.html");
  if (!h.includes("zlinks")) {
    h = must(h, '<a class="zbtn" href="/" style="text-decoration:none;display:inline-block">Go to Corporate Tambola</a>', '<a class="zbtn" href="/" style="text-decoration:none;display:inline-block">Go to Corporate Tambola</a>\n<p class="zsmall zlinks"><a href="/pricing.html">Pricing</a> &middot; <a href="/organizer-guide.html">Organizer guide</a> &middot; <a href="/zc.html?demo=1">Free demo game</a> &middot; <a href="/contact.html">Contact</a></p>', "404.html");
    wr("404.html", h);
  }
}
console.log("seo head applied to", Object.keys(META).length, "pages + demo + 404; origin", ORIGIN, urlOf("index.html"));
