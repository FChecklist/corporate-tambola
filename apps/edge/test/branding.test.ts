// Branding: every e-mail carries the same header (logo + wordmark) and footer (name, support address, legal link); every page has the same title pattern and icons; the name is exactly "Corporate Tambola".
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withDevice } from "./device";
import { housekeeping, type Env } from "../src/worker";
import { handle } from "./with-terms";
import * as Mails from "../src/mails";
import { BRAND, footerText, hasFooter, headerHtml, plainToHtml } from "../src/brand";
import { sendMail, sendReportMail, sentReports, type PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { readPng, isBadgeRed } from "../../web/test/png-pixels";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const ORIGIN = "https://tambola.test";
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env as Env, now);
const j = async (r: Response) => (await r.json()) as any;
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const root = join(import.meta.dir, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

beforeEach(() => {
  const d = makeD1(); raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000", PUBLIC_ORIGIN: ORIGIN, DATA_KEY: "test-data-key", TEST_MODE: "1" };
  sentReports.length = 0;
});
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** One sample call for every exported e-mail builder in mails.ts (a function whose name ends in "Mail"). A NEW builder with no entry here fails the test below, so it cannot ship unchecked. */
const SAMPLES: Record<string, () => Mails.BuiltMail> = {
  aiLinkMail: () => Mails.aiLinkMail(ORIGIN, "cta_" + "a".repeat(48), "start", T + 86_400_000),
  coHostLinkMail: () => Mails.coHostLinkMail(ORIGIN, "cth_" + "b".repeat(48), "boss@acme.com", T + 86_400_000),
  hostLinkMail: () => Mails.hostLinkMail(ORIGIN, "cth_" + "e".repeat(48), "Priya"),
  helpDeskPublishedMail: () => Mails.helpDeskPublishedMail(ORIGIN, { eid: "GAME-1", hostKey: "cth_" + "f".repeat(48), aiHostKey: "cth_" + "d".repeat(48), expiresMs: T + 86_400_000 }),
  newUseAlertMail: () => Mails.newUseAlertMail({ when: "now", country: "IN", program: "x", kind: "AI", origin: ORIGIN }),
  draftReminderMail: () => Mails.draftReminderMail(ORIGIN, { eid: "GAME-1", hours: 24, startMs: T + 86_400_000 }),
  signInMail: () => Mails.signInMail(ORIGIN, "123456", "c".repeat(48)),
};

describe("every e-mail builder has the brand header and footer", () => {
  const builders = Object.entries(Mails).filter(([k, v]) => typeof v === "function" && /Mail$/.test(k)).map(([k]) => k);
  test("every exported *Mail builder has a sample here (a new builder must be added, so it is checked)", () => {
    expect(builders.length).toBeGreaterThanOrEqual(4);
    for (const b of builders) expect(Object.keys(SAMPLES)).toContain(b);
  });
  for (const name of Object.keys(SAMPLES)) {
    test(`${name}: header (logo + Corporate Tambola), footer (name, support address, legal link) in both the HTML and the plain-text part`, () => {
      const m = SAMPLES[name]!();
      expect(m.html).toContain('data-brand="header"'); expect(m.html).toContain('data-brand="footer"');
      expect(m.html.indexOf('data-brand="header"')).toBeLessThan(m.html.indexOf('data-brand="footer"'));
      expect(m.html).toContain(`${ORIGIN}/icon-192.png`); expect(m.html).toContain(BRAND.name);
      expect(m.html).toContain(`mailto:${BRAND.support}`); expect(m.html).toContain(`${ORIGIN}${BRAND.legalPath}`);
      expect(hasFooter(m.text)).toBe(true); expect(m.text).toContain(footerText(ORIGIN)); expect(m.text).toContain(`Write to ${BRAND.support}`); expect(m.text).toContain(`${ORIGIN}${BRAND.legalPath}`);
      expect(m.html + m.text + m.subject).not.toMatch(/CORPORATE TAMBOLA(?!:)|Corporate  Tambola|Tambola Corporate/); // the name is spelled one way (the all-capitals label inside a heading is allowed only as CSS-free text in the AI-link warnings)
    });
  }
});

describe("mail that is not built by mails.ts gets the same brand when it is sent", () => {
  test("a plain mail is wrapped in the branded HTML and gets the footer once; sending the same text twice does not double the footer", async () => {
    const calls: any[] = []; globalThis.fetch = (async (_u: any, init: any) => { calls.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }) as any;
    env.RESEND_API_KEY = "re_test";
    await sendMail(env, env.DB, "a@b.com", "Payment due", "Pay now: https://tambola.test/pay.html?e=X-1", T);
    const m = calls[0]; expect(m.html).toContain('data-brand="header"'); expect(m.html).toContain('data-brand="footer"'); expect(m.html).toContain('href="https://tambola.test/pay.html?e=X-1"');
    expect(hasFooter(m.text)).toBe(true); expect(m.text.split(`Write to ${BRAND.support}`).length).toBe(2);
    await sendMail(env, env.DB, "a@b.com", "x", `Hello\n\n${footerText(ORIGIN)}`, T); expect(calls[1].text.split(`Write to ${BRAND.support}`).length).toBe(2);
    const ok = await sendReportMail(env, "a@b.com", "Report", "Open it: https://tambola.test/report.html?e=X&k=1", []); expect(ok).toBe(true);
    const r = calls[2]; expect(r.html).toContain('data-brand="header"'); expect(r.html).toContain('data-brand="footer"'); expect(hasFooter(r.text)).toBe(true);
  });
  test("the HTML for plain text escapes markup", () => {
    const h = plainToHtml("t", "<script>alert(1)</script>\n\nhttps://x.test/a?b=1&c=2", ORIGIN);
    expect(h).not.toContain("<script>"); expect(h).toContain("&lt;script&gt;"); expect(h).toContain('data-brand="header"');
  });
  test("every mail a whole unpaid lifecycle sends (sign-up, publish, co-host, reminder, could-not-begin, sign-in, replace, alert) carries the footer, and the name is spelled right", async () => {
    const o = await j(await call("POST", "/api/start", { email: "boss@acme.com" }, { "cf-connecting-ip": "1.1.1.1" })); const h = { "x-organizer": o.token };
    await call("POST", "/api/z", { id: "BRAND-1", startRound: roundAt(T + 30 * 3_600_000), callSeconds: 6, cap: 500 }, h);
    await call("POST", "/api/z/BRAND-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, h);
    const use = (ip: string, c: string, now: number) => call("GET", `/ai/${o.aiKey}`, undefined, { "cf-connecting-ip": ip, "cf-ipcountry": c, "user-agent": "ChatGPT-User/1" }, now);
    await use("1.2.3.4", "US", T); await use("5.6.7.8", "DE", T + 1000);
    await call("POST", "/api/org/host", { mobile: "9876500009", email: "host@acme.com" }, h); await call("POST", "/api/org/ai/replace", {}, h); await call("POST", "/api/org/ai/fresh", {}, h);
    await call("POST", "/api/auth/email", { email: "boss@acme.com" });
    await housekeeping(env as Env, T + 86_400_000);
    await call("GET", "/api/z/BRAND-1/info", undefined, {}, T + 40 * 3_600_000);
    const rows = raw.prepare("SELECT subject, body FROM outbox").all() as { subject: string; body: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const r of rows) { expect([r.subject, hasFooter(r.body)]).toEqual([r.subject, true]); expect(r.body + r.subject).not.toMatch(/CORPORATE TAMBOLA|Corporate Tambola Tambola/); }
    expect(rows.some((r) => /Someone new used/.test(r.subject))).toBe(true); expect(rows.some((r) => /could not begin/.test(r.subject))).toBe(true); expect(rows.some((r) => /^\[Tambola\] Payment pending for your game/.test(r.subject))).toBe(true);
  });
  test("pay.ts and nothing else talks to the mail service, and both senders add the brand", () => {
    const pay = read("apps/edge/src/pay.ts");
    expect(pay).toMatch(/async function sendMail[\s\S]*?withFooter[\s\S]*?async function sendReportMail/); expect(pay).toMatch(/async function sendReportMail[\s\S]*?withFooter/); expect(pay).toMatch(/plainToHtml/);
    for (const f of ["worker.ts", "lifecycle.ts", "partners.ts", "winners.ts", "mails.ts"]) { let t = ""; try { t = read("apps/edge/src", f); } catch { continue; } expect(t).not.toContain("api.resend.com"); }
  });
});

describe("pages: one title pattern, icons, manifest, theme colour", () => {
  const PAGES = ["index.html", "report.html", "legal.html", "terms.html", "dpa.html", "subprocessors.html", "partner-terms.html", "organizer-guide.html", "partner.html", "pay.html", "big.html", "zc.html", "z.html", "ai-link.html", "signin.html", "404.html"];
  for (const f of PAGES) {
    test(`${f}: title names Corporate Tambola exactly; favicon, touch icon, manifest and theme colour`, () => {
      const s = read("apps/web/public", f); const title = (s.match(/<title>([^<]*)<\/title>/) ?? [])[1]!;
      expect(title).toMatch(/(^Corporate Tambola|\| Corporate Tambola$)/); expect(title).not.toMatch(/CORPORATE|Tambola Corporate/);
      for (const needle of ['rel="icon"', "apple-touch-icon", 'rel="manifest"', 'name="theme-color" content="#0B3D91"']) expect(s).toContain(needle);
    });
  }
  test("the PWA manifest and the build ship the brand", () => {
    const m = JSON.parse(read("apps/web/public/manifest.webmanifest")); expect(m.name).toBe("Corporate Tambola"); expect(m.short_name).toBe("Corporate Tambola"); expect(m.theme_color).toBe("#0B3D91");
    expect(read("pages/build.mjs")).toContain('"404.html"');
  });
  test("every page header uses the Corporate Tambola name; the report PDF names it and carries the support address and legal link", () => {
    for (const f of ["zc.js", "pay.js", "ai-link.js", "signin.js", "z.js", "partner.js"]) for (const m of read("apps/web/public", f).matchAll(/<div class="zhead"><b>([^<]*)<\/b>/g)) expect(m[1]).toMatch(/^Corporate Tambola/);
    const lay = read("apps/edge/src/report-layout.ts"); expect(lay).toContain("BRAND.support"); expect(lay).toContain("BRAND.legalPath"); expect(lay).toMatch(/pdf\.footer = `Corporate Tambola/);
  });
});

describe("the legal page carries the owner's final text, and each line matches what the code does", () => {
  const html = read("apps/web/public/legal.html");
  const sec = (id: string) => { const m = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`)); expect(m).toBeTruthy(); return m![0]; };
  const items = (id: string) => [...sec(id).matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => x[1]!.replace(/<[^>]+>/g, "").replace(/&rsquo;/g, "’").replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”").replace(/&amp;/g, "&"));
  test("anchors, headings, counts, and one short line each", () => {
    for (const id of ["rules", "privacy", "disclaimer"]) expect(html).toContain(`<section id="${id}"`);
    expect(html).toContain(">Rules</h2>"); expect(html).toContain(">Privacy &amp; Data Policy</h2>"); expect(html).toContain(">Disclaimer</h2>");
    expect(items("rules").length).toBe(11); expect(items("privacy").length).toBe(16); expect(items("disclaimer").length).toBe(6);
    for (const id of ["rules", "privacy", "disclaimer"]) for (const l of items(id)) expect(l.split(/\s+/).length).toBeLessThanOrEqual(30);
    expect(html).toMatch(/<p class="muted">[^<]{1,80}<\/p>/);
  });
  test("the sixteen privacy lines, word for word, with typographic apostrophes", () => {
    expect(items("privacy")).toEqual([
      "We delete all participant data from our systems within 24 hours after the game ends.", "A game that never starts is treated the same way: its guests’ names and numbers are deleted 20 hours after the time it was meant to end.", "All data is encrypted, in transit and at rest.", "Where the data is: the website runs on Cloudflare’s global network. The database is kept in Cloudflare’s Asia-Pacific region.", "Participants never see each other’s data.", "A player can leave at any time, ask what we hold about them, or ask us to delete it, from the game page. We answer within 7 days.", "We provide the software. The organizer runs the game.", "No advertising cookies or trackers. We never sell data.", "Your phone keeps only the items listed under “What your device keeps” below. We use no other cookie.", "Exception: winner prize details are kept for 365 days, so the organizer can confirm the prize was handed over. They are then deleted automatically.", "Fair play. We keep a protected, encrypted record of game activity to keep every game fair. Only we can see it. Removed automatically 365 days after your game ends.", "Public pages: a first-party visitor id and shortened network address, never names or mobile numbers, kept 365 days. With Global Privacy Control or Do Not Track, we only count visits.", "Designed to follow India’s DPDP Act 2023, EU GDPR and US CCPA.", "Your phone contacts drand for public random numbers, and YouTube (privacy mode) only if your organizer adds a video.", "You may also complain to the Data Protection Board of India.",
      "Questions or requests: our Grievance Officer, Rajat Agarwal, hello@corporatetambola.com. We reply within 30 days. The full notice is the Privacy Policy page."]);
    expect(html).toContain('href="mailto:hello@corporatetambola.com?subject=%5BTambola%5D%20"');
  });
  test("the six disclaimer lines, word for word", () => {
    expect(items("disclaimer")).toEqual(["This is a close group game, open only to the people the organizer invites, run by the organizer named on your ticket.", "Corporate Tambola provides the software only. Participants pay nothing to play.", "The organizer provides and hands over the prizes.", "The software decides the winners. Results are final.", "The organizer makes sure the game is allowed under local law.", "We are not responsible for prize handover or for disputes between the organizer and participants."]);
  });
  test("the rules say only what the software does (no claims, no manual cutting, no blocking), and the privacy timings match lifecycle.ts", () => {
    const r = items("rules").join(" ");
    expect(r).not.toMatch(/Cut your own|Late claims|wrong claim|block your ticket|for fun/i);
    expect(r).toContain("No one knows the next number, including the organizer and us."); expect(r).not.toMatch(/No one can choose or change|not even the organizer|twice|every claim is checked/); expect(r).toContain("The 2nd Full House can only follow the 1st."); expect(r).toContain("One ticket per phone.");
    const lc = read("apps/edge/src/lifecycle.ts");
    expect(lc).toMatch(/PURGE_AFTER_MS = 20 \* 3_600_000/); // 20 h (plus a tick up to 3 h late) is inside "within 24 hours"
    expect(lc).toMatch(/endMs \+ 365 \* DAY/); expect(lc).toMatch(/DELETE FROM prize WHERE eid=\?/); // prize details go with the 365-day deletion
    expect(lc).toMatch(/DELETE FROM participant WHERE eid=\?/); expect(lc).toMatch(/DELETE FROM seat WHERE eid=\?/);
  });
});

describe("claims register: customer-facing text never says what the build does not do", () => {
  const FILES = ["apps/web/public/trust.html", "apps/web/public/llms.txt", "apps/web/public/demo.js", "apps/web/public/preview.js", "apps/edge/src/ai-facts.ts", "apps/edge/src/ai-go.ts", "apps/web/public/index.html", "apps/web/public/legal.html", "apps/web/public/partner.html", "apps/web/public/z.js", "apps/web/public/zc.js", "apps/web/public/pay.js", "apps/web/public/site.js", "apps/web/public/partner.js", "apps/web/public/ai-link.js", "apps/edge/src/worker.ts", "apps/edge/src/lifecycle.ts", "apps/edge/src/report-layout.ts", "apps/edge/src/mails.ts", "apps/edge/src/ai-link.ts", "apps/edge/src/pay.ts"];
  test("every mention of 365 days sits next to winners, prize, organizer, retention or AI-log wording", () => {
    for (const f of FILES) {
      const t = read(f);
      for (const m of t.matchAll(/365[ -]?days?|365 DAY|365\s*\*\s*DAY|RETENTION_DAYS/gi)) {
        const ctx = t.slice(Math.max(0, m.index! - 260), m.index! + 260).toLowerCase();
        expect([f, /winner|prize|credit|organi[sz]er|retention|retain|ai assistant|hand|record|engagement|deleted|purge|delete|everything|keep|kept/.test(ctx)]).toEqual([f, true]);
        expect([f, /names and numbers are kept 365|contacts kept 365|reuse your list|reuse the data.{0,40}365/.test(ctx)]).toEqual([f, false]);
      }
    }
  });
  test("banned claims are gone", () => {
    const BAN: [RegExp, string][] = [[/discount applied/i, "implies a past sale"], [/ISO\/IEC 27001/i, "unsupported certification"], [/Most popular/i, "popularity without data"], [/Nobody else sees it/i, "the organizer sees it"], [/We follow India/i, "soft wording only"], [/Built in line with/i, "soft wording only"], [/\b(fully |is |are )?compliant\b/i, "never claim compliance"], [/does not contain names or mobile/i, "winners' details are kept sealed"], [/We do not keep your participants' data/i, "prize details are kept"], [/\bterms, privacy/i, "no terms page yet"]];
    for (const f of FILES) { const t = read(f); for (const [re, why] of BAN) expect([f, why, re.test(t)]).toEqual([f, why, false]); }
  });
  test("structured data prices equal the real packs", () => {
    const h = read("apps/web/public/index.html"); const { PACKS } = require("../../../packages/shared/src/pricing") as typeof import("../../../packages/shared/src/pricing");
    expect(h).toContain(`"lowPrice":"${Math.min(...PACKS.map((p) => p[1]))}"`); expect(h).toContain(`"highPrice":"${Math.max(...PACKS.map((p) => p[1]))}"`); expect(h).toContain(`"offerCount":"${PACKS.length}"`);
    const site = read("apps/web/public/site.js"); expect(site).not.toMatch(/Festive offer|50% OFF|Regular price after/); expect(h).not.toMatch(/Festive offer|50% off/i); // boss ruling Q8 2026-10-29 (gap plan TA17): one honest price, no computed "was" price and no permanent 50% badge (apps/edge/test/wp06-price-footer.test.ts)
    expect(`${h}${site}`).not.toMatch(/Most popular|2nd most popular/); // the offer price is what is charged, and equals the structured-data price (lowPrice above)
  });
});

// RELEASE 1.6.8: the logo is the red Corporate Tambola badge in everything we send: the e-mail header, the branded report e-mail, the report page (which draws our logo on the PDF), the game log page, the share card.
describe("the logo in e-mails, the report PDF and the share card is the red Corporate Tambola badge", () => {
  const png = (f: string) => readPng(new Uint8Array(readFileSync(join(root, "apps/web/public", f))));
  test("the e-mail header picture (icon-192.png) is the new badge, 192 x 192, red to the edge", () => { const p = png("icon-192.png"); expect([p.w, p.h]).toEqual([192, 192]); expect(isBadgeRed(p.px(96, 8), 30)).toBe(true); expect(p.px(0, 0)[3]).toBe(0); });
  test("the report e-mail logo and the report page's own PDF logo (logo-512.png) are the new badge, 512 x 512", () => { const p = png("logo-512.png"); expect([p.w, p.h]).toEqual([512, 512]); expect(isBadgeRed(p.px(256, 20), 30)).toBe(true); });
  test("the share card (og-tambola.png, 1200 x 630) and the picture in the web-page data (logo-1024.png, the badge) are the new logo; the trust page names the card", () => { const c = png("og-tambola.png"); expect([c.w, c.h]).toEqual([1200, 630]); const p = png("logo-1024.png"); expect([p.w, p.h]).toEqual([1024, 1024]); expect(isBadgeRed(p.px(512, 40), 30)).toBe(true); expect(read("apps/edge/src", "trust-page.ts")).toContain("/og-tambola.png"); });
  test("the e-mail header, the report e-mail, the report page and the game log page all point at those files", () => {
    expect(headerHtmlOf()).toContain("/icon-192.png"); expect(read("apps/edge/src/report-email.ts")).toContain("/logo-512.png"); expect(read("apps/web/public/report.js")).toContain("/logo-512.png"); expect(read("apps/web/public/gamelog.js")).toContain("/logo-512.png");
  });
  test("the old logo art is nowhere in the sources the server sends", () => { for (const f of ["brand.ts", "report-email.ts", "trust-page.ts", "report-layout.ts", "pdf.ts"]) expect([f, /E8284F|#E8EEFF/.test(read("apps/edge/src", f))]).toEqual([f, false]); });
});
function headerHtmlOf() { return headerHtml("https://tambola.test"); }
