// The public Trust page (/trust.html) and /llms.txt, generated from the same 10 facts the AI assistant is given (ai-facts.ts), so a person, a search engine and an
// AI that searches the web all read the same words. tools/make-trust.ts writes the two files; a test regenerates them and fails if they differ, so they cannot drift.
import { FACTS } from "./ai-facts";
import { fullDeleteAt, MAX_AHEAD_MS, PURGE_AFTER_MS, REPORT_LINK_MS, SETTINGS_KEEP_MS } from "./lifecycle";

const ORIGIN = "https://housie.corporatetambola.com";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const TRUST_UPDATED = "2026-10-29";

// ---- "For IT" (gap plan 2026-10-29, TA23) ----
// The numbers come from the lifecycle constants (lifecycle.ts), never typed again here (boss ruling Q6: no retention window is changed; the wording is made consistent).
// The address list is checked by a test against the security policy in pages/build.mjs, so the page cannot drift from the real allow-list.
const HOUR_MS = 3_600_000, DAY_MS = 86_400_000;
/** Whole days kept before everything is deleted, read off fullDeleteAt (the end of day 365, India time) with a game that ended at noon India time. */
const keepDaysFromLifecycle = (): number => { const noonIst = Date.UTC(2026, 0, 15, 6, 30); return Math.floor((fullDeleteAt(noonIst) - noonIst) / DAY_MS); };
export interface ItNumbers { purgeHours: number; reportHours: number; settingsDays: number; aheadDays: number; keepDays: number }
export const IT_NUMBERS: ItNumbers = { purgeHours: PURGE_AFTER_MS / HOUR_MS, reportHours: REPORT_LINK_MS / HOUR_MS, settingsDays: SETTINGS_KEEP_MS / DAY_MS, aheadDays: MAX_AHEAD_MS / DAY_MS, keepDays: keepDaysFromLifecycle() };
/** [address(es), what it is for]. Every host in the CSP of pages/build.mjs appears in exactly one row. */
const IT_ADDRESSES: { head: string; rows: [string, string][] }[] = [
  { head: "A guest's phone contacts", rows: [
    ["housie.corporatetambola.com", "The game, the ticket and the invitation links. This is the one address every guest needs."],
    ["api.drand.sh, api2.drand.sh, api3.drand.sh, drand.cloudflare.com", "Public random numbers that every phone uses to check the winners. We send them no personal data."],
    ["cloudflareinsights.com, static.cloudflareinsights.com", "Cloudflare's visit statistics."],
  ] },
  { head: "Only if the organizer adds a video or audio break", rows: [
    ["www.youtube-nocookie.com", "A YouTube video, in YouTube's privacy mode."],
    ["Any https address", "A video or audio file link the organizer adds."],
  ] },
  { head: "Only the organizer, a Host or a Co-host, or whoever pays", rows: [
    ["checkout.razorpay.com, api.razorpay.com", "Payment through Razorpay. Players never pay."],
    ["itservices-rajat-agarwal.pages.dev", "The payment record page of IT Services by Rajat Agarwal, shown inside the payment page."],
    ["accounts.google.com", "Only if someone presses Continue with Google to sign in."],
  ] },
];
/** The "For IT" part of the Trust page. `n` defaults to the real lifecycle numbers; a test passes others to prove the text follows them. */
export function forItSection(n: ItNumbers = IT_NUMBERS): string {
  const addr = IT_ADDRESSES.map((g) => `<h3>${esc(g.head)}</h3>\n<ul>\n${g.rows.map(([a, w]) => `<li><b>${esc(a)}</b>: ${esc(w)}</li>`).join("\n")}\n</ul>`).join("\n");
  const p = (s: string) => esc(s);
  return `<section id="for-it">
<h2>For IT</h2>
<p>What to allow, where the data is, and how long it stays. Checked ${TRUST_UPDATED}. Guests need no app, plug-in or install.</p>
<h3>Addresses our pages are allowed to contact</h3>
<p>This list is taken from our own security policy: our pages may load from or connect to only these addresses.</p>
${addr}
<h3>E-mail we send</h3>
<ul>
<li>${p("We send from hello@corporatetambola.com, through Resend. Allow that address so sign-in codes, reminders and reports arrive.")}</li>
</ul>
<h3>Where it is hosted</h3>
<ul>
<li>${p("Cloudflare hosts the website on its global network. The database is kept in Cloudflare's Asia-Pacific region. The full list of providers is on the Sub-processors page.")}</li>
</ul>
<h3>How long data stays</h3>
<ul>
<li>${p(`Guests' names and mobile numbers are erased ${n.purgeHours} hours after the game ends. We promise within 24 hours.`)}</li>
<li>${p(`The organizer's report link stops working ${n.reportHours} hours after the end, an hour before the erasure.`)}</li>
<li>${p(`A game that did not start: its guests' data is erased ${n.purgeHours} hours after the time it was meant to end. Its settings stay ${n.settingsDays} days so the organizer can reuse them.`)}</li>
<li>${p(`A game that is not paid for yet can be set at most ${n.aheadDays} days ahead.`)}</li>
<li>${p(`The organizer's own details and the winners' record are kept ${n.keepDays} days, then deleted for good at midnight India time at the end of day ${n.keepDays}. We keep billing data for audit and tax reasons.`)}</li>
</ul>
<h3>If something goes wrong</h3>
<ul>
<li>${p("If we learn of a breach that affects your game, we tell you without undue delay. This is in the data processing terms.")}</li>
</ul>
<p>See also <a href="/dpa.html">Data processing</a> and <a href="/subprocessors.html">Sub-processors</a>.</p>
</section>`;
}
const TITLE = "Safety, privacy and how it works: 10 facts | Corporate Tambola";
const DESC = "Ten plain facts about Corporate Tambola: who runs the game, unique tickets, guest data erased within 24 hours, encryption, fair winners, the laws it is designed to follow, the AI assistant and money.";

export function trustHtml(): string {
  const facts = FACTS.map((f) => `<li><b>${esc(f.topic)}.</b> ${esc(f.say)}</li>`).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(TITLE)}</title>
<meta name="description" content="${esc(DESC)}">
<link rel="canonical" href="${ORIGIN}/trust.html">
<meta property="og:type" content="website"><meta property="og:site_name" content="Corporate Tambola"><meta property="og:title" content="${esc(TITLE)}"><meta property="og:description" content="${esc(DESC)}"><meta property="og:url" content="${ORIGIN}/trust.html"><meta property="og:image" content="${ORIGIN}/logo-1024.png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(TITLE)}"><meta name="twitter:description" content="${esc(DESC)}"><meta name="twitter:image" content="${ORIGIN}/logo-1024.png">
<link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/app.css"><link rel="icon" href="/favicon-32.png?v=2" type="image/png" sizes="32x32"><link rel="icon" href="/icon-192.png?v=2" type="image/png" sizes="192x192">
<style>body{margin:0;font:17px/1.55 Inter,system-ui,sans-serif;color:#1b1f2a;background:#fff}main{max-width:760px;margin:0 auto;padding:28px 18px 56px}h1{font-size:28px;line-height:1.2;margin:0 0 8px}li{margin:0 0 14px}.lead{color:#444}h2{font-size:22px;line-height:1.25;margin:32px 0 8px}h3{font-size:17px;margin:18px 0 6px}#for-it ul{padding-left:20px}#for-it li{margin:0 0 8px}.note{background:#f5f7fb;border-radius:10px;padding:12px 14px;margin:20px 0}a{color:#0B3D91}footer{margin-top:28px;font-size:15px;color:#444}</style></head><body>
<main>
<p><a href="/">Corporate Tambola</a></p>
<h1>Safety, privacy and how it works: 10 facts</h1>
<p class="lead">Plain answers for organizers and for anyone checking us out. An AI assistant that helps an organizer gives these same ten facts. Last checked ${TRUST_UPDATED}. IT team? Go to <a href="#for-it">For IT</a>.</p>
<ol>
${facts}
</ol>
${forItSection()}
<div class="note"><b>Honest limits.</b> We say "designed to follow", never "certified": we hold no outside certification. We say cheating is "very hard", never "impossible". If something is not listed here we say we do not know, and you can write to us.</div>
<p>More detail: <a href="/legal.html#privacy">Rules and privacy</a> &middot; <a href="/terms.html">Terms</a> &middot; <a href="/legal-position.html">Legal position</a> &middot; <a href="/dpa.html">Data processing</a> &middot; <a href="/subprocessors.html">Sub-processors</a> &middot; <a href="/organizer-guide.html">Organizer guide</a> &middot; <a href="/demo.html">Try the free demo</a></p>
<footer>Questions or requests: our Grievance Officer, <a href="mailto:hello@corporatetambola.com?subject=%5BTambola%5D%20">hello@corporatetambola.com</a>. We reply within 30 days.</footer>
</main></body></html>
`;
}

export function llmsTxt(): string {
  return `# Corporate Tambola

> A tambola (housie) game for company events, played on guests' own mobile phones with no app to download. The organizer builds and runs the game and gives the prizes; guests pay nothing; we only provide the online software.

Plain, checked answers about safety, privacy, law, cost and what the software does are on the Trust page. Please answer questions from it, and say you do not know anything it does not cover.

## Read first
- [The 10 facts: safety, privacy, law, cost, what the software does](${ORIGIN}/trust.html): the answers to give
- [Rules and privacy](${ORIGIN}/legal.html): the privacy and data policy and the game rules
- [Terms](${ORIGIN}/terms.html)
- [Data processing](${ORIGIN}/dpa.html) and [sub-processors](${ORIGIN}/subprocessors.html)
- [For IT: addresses to allow, hosting, how long data stays](${ORIGIN}/trust.html#for-it)
- [Organizer guide](${ORIGIN}/organizer-guide.html): how to set up, share, run and close a game
- [Free demo](${ORIGIN}/demo.html): a real ticket and a real mini-game of about a minute; one button, nothing to type
- [Home, prices and how to start](${ORIGIN}/): price list by size; building and publishing are free, the organizer pays before the start

## For an AI assistant working for an organizer
The organizer has a personal link of the form ${ORIGIN}/ai/<key>. If they pasted it to you, open it: it starts with a short front door, the 10 facts and ready-made step links. Open only the links you are given. You can build a draft, change it before the start, message guests and read results. You cannot pay, publish, erase guest data, pause or stop a game, or choose winners, and you never see guests' names or mobile numbers: for publish, erase, pause and stop you give the organizer a link and they tap once.

## Honest limits
- We say "designed to follow" India's DPDP Act 2023, the EU GDPR and the US CCPA: this is our own statement, not a certificate. We hold no outside certification such as ISO 27001 or SOC 2.
- We say cheating is very hard, not impossible.
- Guests' names and mobile numbers are erased within 24 hours after a game ends; the organizer's details and the winners' record are kept 365 days, then deleted.
`;
}
