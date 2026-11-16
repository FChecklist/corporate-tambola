// Writes the three short use-case landing pages (one main phrase each, a demo button, a visible FAQ) in the same style as legal.html.
// Run: node tools/make-usecase-pages.mjs   (after tools/apply-seo-head.mjs; commit the result). Prices come from packages/shared/src/pricing.ts through tools/seo-tags.mjs.
// Copy rules (owner): "close group", English only, short sentences, no "best", no counts or ratings we cannot prove, payments only to IT Services by Rajat Agarwal through Razorpay.
import { readFileSync, writeFileSync } from "node:fs";
import { ORIGIN, PACKS, LAST_MOD, withSeo, faqLd, attr } from "./seo-tags.mjs";

const PUB = new URL("../apps/web/public/", import.meta.url);
const tpl = readFileSync(new URL("legal.html", PUB), "utf8");
const nl = tpl.includes("\r\n") ? "\r\n" : "\n";
const head = tpl.slice(0, tpl.indexOf('<main class="legal')), foot = tpl.slice(tpl.indexOf("</main>"));
const rs = (n) => "Rs " + n.toLocaleString("en-IN");
const lo = PACKS[0], hi = PACKS[PACKS.length - 1];
const cost = `You pay once per game, by the number of participants: ${rs(lo[1])} for up to ${lo[0]} participants, up to ${rs(hi[1])} for up to ${hi[0].toLocaleString("en-IN")} (prices in India, no GST charged). Building and publishing are free, and you pay before the start. Payment is online through Razorpay, to IT Services by Rajat Agarwal. See the <a href="/pricing.html">pricing page</a> for every size.`;
const STEPS = (a, b) => [a, "Add the mobile numbers and share one link by WhatsApp, e-mail or your intranet.", b, "The software checks every claim. You hand over the rewards and download the report."];

const PAGES = [
  { file: "online-housie-for-employees.html", title: "Online Housie for Employees | Corporate Tambola", crumb: "Online housie for employees",
    desc: "Run an online housie for employees in one office or many cities. Everyone plays on their own phone, with your brand video between numbers.",
    h1: "Online housie for employees", lead: "One game, one link, every phone. Your team plays together from the office, from home or from another city. There is no app to install.",
    imgAlt: "The tambola ticket an employee sees on their phone",
    blocks: [
      ["Why companies use it", "ul", ["<b>Employee engagement without effort.</b> Employees open a link and type their mobile number. Nothing else to learn.", "<b>Your brand stays on screen.</b> Between numbers, show your company video, a YouTube link, slides or a speech to everyone at once.", "<b>Families can join.</b> Add family members for a family day tambola.", "<b>No SMS, no password.</b> Participants never pay and never install anything."]],
      ["How it works", "ol", STEPS("Build the game: how many participants, the rewards and your brand breaks. Use the free AI assistant or set it up yourself.", "Everyone gets their own ticket on their phone. A clear voice calls every number.")],
      ["A virtual housie for employees in many places", "p", "Participants can be in any country. You can also play next to a Google Meet, Zoom or Teams call: nothing is installed in the meeting app, and everyone still talks as usual."],
      ["What it costs", "p", cost],
    ],
    faq: [
      ["What is online housie for employees?", "A live tambola game played on each employee's own phone. The organizer sets it up and shares a link. The software calls the numbers and checks every claim."],
      ["How many employees can play?", `A game can be sized from up to ${lo[0]} to up to ${hi[0].toLocaleString("en-IN")} participants.`],
      ["Do employees need to install an app?", "No. They open your link and type their mobile number. There is no app, no SMS code and no password."],
      ["Can employees' families join?", "Yes. Employees and their families, dealers, customers and vendors can all take part, in any country."],
      ["Can we try it first?", "Yes. Start a free demo game for up to 10 people, with no payment, or watch the demo video."],
    ] },
  { file: "tambola-for-diwali-office-party.html", title: "Tambola for Diwali Office Party | Corporate Tambola", crumb: "Tambola for a Diwali office party",
    desc: "Play tambola at your Diwali office party. Everyone gets a ticket on their phone, you show your festive video and give the gifts you chose.",
    h1: "Tambola for your Diwali office party", lead: "Make the Diwali party at the office a game everyone plays at once. Share one link, everyone gets a ticket on their phone, and you give the gifts you chose.",
    imgAlt: "A tambola ticket on a phone during a company party",
    blocks: [
      ["A game that fits the party", "ul", ["<b>Familiar and easy.</b> Tambola (housie) is simple to explain, so everyone can join in.", "<b>Your festive greeting.</b> Between numbers, play a Diwali video from your leadership or give a short speech.", "<b>Gifts are yours.</b> You choose the rewards and how many winners. Participants never pay for anything, and we never handle reward money.", "<b>The whole family.</b> Invite employees and their families."]],
      ["Set it up in four steps", "ol", STEPS("Build the game and pick the party date. You can add up to 3 brand breaks for your video or speech.", "Everyone gets their own ticket on their phone. A game calls up to 90 numbers.")],
      ["In the hall and online together", "p", "Show the number screen on the big screen in the party hall, and let everyone play on their own phone. People in other offices join with the same link, at the same time. Keep it a close-group game: invite your own people, and never ask for a fee or a purchase to take part."],
      ["What it costs", "p", cost],
    ],
    faq: [
      ["What is a Diwali tambola party at the office?", "A live housie game for your people at the Diwali celebration. Each person plays on their own phone, and the winners receive the gifts you chose."],
      ["Can we play in the hall and online together?", "Yes. Show the number screen in the hall. Everyone, in the hall or in another office, plays on their own phone with the same link."],
      ["Who gives the Diwali gifts?", "You do, the organizer. We provide the software only."],
      ["Can families join the party game?", "Yes. Families can take part, in any country."],
      ["How much does a Diwali tambola game cost?", `From ${rs(lo[1])} for up to ${lo[0]} participants, by the size of your party. No GST is charged.`],
    ] },
  { file: "tambola-for-dealer-and-customer-meets.html", title: "Tambola for Dealer and Customer Meets | Corporate Tambola", crumb: "Tambola for dealer and customer meets",
    desc: "Give your dealers and customers a live tambola on their own phones, with your brand video between numbers. No app to install. Free demo.",
    h1: "Tambola for dealer and customer meets", lead: "Give your dealers and customers a reason to join in. A live tambola on their own phones, with your brand video between numbers.",
    imgAlt: "The tambola ticket a dealer or customer sees on their phone",
    blocks: [
      ["Why it works at a meet", "ul", ["<b>Your brand on every screen.</b> Show your product video, slides or a speech to everyone at the same moment.", "<b>Nothing to install.</b> Dealers and customers open a link and type their mobile number.", "<b>Any city.</b> Everyone can join from their own shop, office or home, in any country.", "<b>A report afterwards.</b> See what happened and who took part."]],
      ["How to run it", "ol", STEPS("Build the game. Add your product launch video as a brand break, and choose the rewards.", "Dealers and customers get their own ticket on their phone. A clear voice calls every number.")],
      ["Keep it a close-group game", "p", "Invite only people you know. Taking part must be free and voluntary: never ask a dealer or customer to buy anything to join. Check the rules where you and your guests are, and read the <a href=\"/organizer-guide.html\">organizer guide</a>."],
      ["What it costs", "p", cost],
    ],
    faq: [
      ["Can dealers and customers join from different cities?", "Yes. They join with one link on their own phone, from any city or country."],
      ["Do they need an app?", "No. They type their mobile number and get their ticket. No app, no SMS code and no password."],
      ["Do dealers and customers pay to play?", "No. Participants never pay. You must never ask for a purchase or a fee to take part."],
      ["Who gives the rewards?", "You do, the organizer. We provide the software only and never handle reward money."],
      ["What happens to their mobile numbers?", "Names and mobile numbers are deleted within 24 hours after the game ends. Only the organizer sees them while the game runs."],
    ] },
];

const words = (h) => h.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").split(/\s+/).filter(Boolean).length;
const list = (t, items) => `<${t}>${items.map((i) => `<li>${i}</li>`).join("")}</${t}>`;
for (const p of PAGES) {
  const faqHtml = `<section id="faq" aria-labelledby="faqh"><h2 id="faqh">Questions and answers</h2>${nl}${p.faq.map(([q, a]) => `  <h3>${q}</h3>${nl}  <p>${a}</p>`).join(nl)}${nl}</section>`;
  const related = `<p class="muted">More: ${PAGES.filter((o) => o !== p).map((o) => `<a href="/${o.file.replace(/\.html$/, "")}">${o.crumb}</a>`).join(" &middot; ")} &middot; <a href="/trust.html">Safety and privacy</a> &middot; <a href="/organizer-guide.html">Organizer guide</a></p>`;
  const body = [
    `<nav class="muted" aria-label="Breadcrumb"><a href="/">Home</a> &rsaquo; ${p.crumb}</nav>`,
    `<h1>${p.h1}</h1>`, `<p class="lead">${p.lead}</p>`,
    `<p class="cta"><a class="go" href="/zc.html?demo=1">Start a free demo game</a><a href="/demo.html">Watch the demo video</a><a href="/pricing.html">See pricing</a></p>`,
    `<img src="/img/ticket.webp" width="1400" height="879" alt="${attr(p.imgAlt)}" loading="lazy" decoding="async" style="max-width:100%;height:auto;border-radius:12px">`,
    ...p.blocks.map(([h, t, c], i) => `<section aria-labelledby="s${i}"><h2 id="s${i}">${h}</h2>${t === "p" ? `<p>${c}</p>` : list(t, c)}</section>`),
    faqHtml, related,
  ].join(nl + nl);
  const n = words(body.replace(/<nav[\s\S]*?<\/nav>/, "").replace(/<p class="cta">[\s\S]*?<\/p>/, "").replace(/<p class="muted">[\s\S]*?<\/p>/, ""));
  if (n < 300 || n > 450) throw new Error(`${p.file}: ${n} words, must be 300 to 450`);
  let html = head + `<main class="legal uc">${nl}${body}${nl}` + foot;
  html = withSeo(html, { file: p.file, title: p.title, desc: p.desc, crumb: p.crumb }, [
    { "@type": "WebPage", "@id": `${ORIGIN}/${p.file.replace(/\.html$/, "")}#page`, name: p.h1, url: `${ORIGIN}/${p.file.replace(/\.html$/, "")}`, description: p.desc, inLanguage: "en", isPartOf: { "@type": "WebSite", name: "Corporate Tambola", url: ORIGIN + "/" }, dateModified: LAST_MOD },
    faqLd(p.faq)]);
  writeFileSync(new URL(p.file, PUB), html);
  console.log(p.file, n, "words,", p.faq.length, "questions");
}
