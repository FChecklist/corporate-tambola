// RELEASE 1.6.8: the top menu is exactly six items and the Corporate Tambola badge is the logo everywhere. The look (one row on a laptop, a Menu list on a phone) is checked in real Chrome (screenshots in data/ui/housie-header-logo).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { readPng, isBadgeRed } from "./png-pixels";
const PUB = new URL("../public/", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, PUB), "utf8");
const bytes = (f: string) => new Uint8Array(readFileSync(new URL(f, PUB)));
const SIX: [string, string][] = [["How it works", "#how"], ["Free demo game", "/zc?demo=1"], ["Guide", "/organizer-guide.html"], ["Brochure", "/brochure.pdf"], ["Refer & earn", "/partner.html"], ["Log in", "/#login"]];
// the landing page and the 13 information pages that carry the header
const PAGES = ["index.html", "about.html", "ai-prompt.html", "contact.html", "dpa.html", "legal.html", "legal-position.html", "organizer-guide.html", "partner-terms.html", "pricing.html", "privacy.html", "refund-policy.html", "subprocessors.html", "terms.html"];
const menu = (h: string) => { const m = /<div class="ct-menu" id="ctMenu"><ul>([\s\S]*?)<\/ul>/.exec(h); return m ? [...m[1]!.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((x) => [x[2]!.replace(/&amp;/g, "&"), x[1]!]) : []; };
const navOf = (h: string) => h.slice(h.indexOf('<nav class="ct-nav"'), h.indexOf("</nav>"));

describe("the top menu: exactly six items, in the owner's order, on every page that has it", () => {
  for (const f of PAGES) {
    test(`${f}: How it works | Free demo game | Guide | Brochure | Refer & earn | Log in, nothing else`, () => {
      const items = menu(read(f)); expect(items.length).toBe(6);
      expect(items.map((x) => x[0])).toEqual(SIX.map((x) => x[0]));
      expect(items.map((x) => x[1]!.replace(/^\/#how$/, "#how"))).toEqual(SIX.map((x) => x[1]));
    });
  }
  test("the removed buttons are gone from the header on every page: Free AI assistant, Video, Demo game (old label), Pricing, WhatsApp us", () => {
    for (const f of PAGES) {
      const h = read(f), nav = navOf(h);
      expect([f, nav.length > 100]).toEqual([f, true]);
      for (const gone of ["Free AI assistant", "Video", ">Demo game<", "Pricing", "WhatsApp", "wa.me", "aipill", "#ai-host", "#pricing", "demo.html"]) expect([f, gone, nav.includes(gone)]).toEqual([f, gone, false]);
      expect(h).not.toContain('class="snav"'); expect(h).not.toContain('class="legaltop"');
    }
  });
  test("the brand on the left is the badge with CORPORATE small above Tambola, never Housie; the Menu button opens the list", () => {
    for (const f of PAGES) {
      const h = read(f), nav = navOf(h);
      expect(nav).toContain('<img class="ct-badge" src="/logo-mark.svg?v=2" alt="Corporate Tambola logo"'); expect(nav).toContain('<span class="ct-word"><i>Corporate</i><b>Tambola</b></span>'); expect(nav).not.toMatch(/housie/i);
      expect(nav).toContain('id="ctBurger" aria-expanded="false" aria-controls="ctMenu"'); expect(h).toContain('<script src="/nav.js?v=1" defer></script>'); expect(h).toContain('href="/nav.css?v=1"');
    }
  });
  test("the Log in item keeps the id the page script uses (it turns into 'Open my console' when signed in)", () => { expect(read("index.html")).toContain('id="loginLink"'); expect(read("site.js")).toContain('$("loginLink")'); });
  test("what left the header is still reachable lower on the landing page: pricing, the AI assistant, the video, WhatsApp", () => {
    const h = read("index.html"), body = h.slice(h.indexOf("</header>"));
    expect(body).toContain('id="pricing"'); expect(body).toContain('id="ai-host"'); expect(body).toContain('href="/demo.html">Video<'); expect(body).toContain('href="/pricing.html">Pricing<'); expect(body).toContain('href="/ai-prompt.html">Set up with ChatGPT or Gemini<');
    expect(h.slice(0, h.indexOf("</header>"))).toContain('href="/demo.html">Watch the video'); expect((body.match(/https:\/\/wa\.me\/919650397480/g) ?? []).length).toBe(1); expect((h.match(/https:\/\/wa\.me\/919650397480/g) ?? []).length).toBe(2); // the "Talk to a person" line (top) and the footer
    expect(read("contact.html")).toContain("https://wa.me/919650397480");
  });
  test("the colour dots stay, now inside the menu row; the menu script, style and logo files are shipped by the Pages build", () => {
    expect(read("index.html")).toContain('<div class="ct-dots-slot"></div>'); expect(read("theme.js")).toContain('querySelector(".ct-dots-slot")');
    const build = readFileSync(new URL("../../../pages/build.mjs", import.meta.url), "utf8"); for (const f of ["nav.css", "nav.js", "logo-lockup.svg", "logo-mark.svg"]) expect(build).toContain(`"${f}"`);
  });
  test("one row on a laptop, a Menu list on a phone: the CSS has both, and the list is closed until Menu is pressed", () => {
    const css = read("nav.css"); expect(css).toContain(".ct-menu a{display:inline-flex"); expect(css).toContain("white-space:nowrap"); expect(css).toContain("@media (max-width:1079px)"); expect(css).toContain(".ct-menu:not(.open){display:none}"); expect(css).toContain("min-height:44px");
    const js = read("nav.js"); expect(js).toContain("aria-expanded"); expect(js).toContain("Escape");
  });
});

describe("the logo: the red Corporate Tambola badge (ticket on a red rounded square) in every file", () => {
  test("logo-mark.svg and logo.svg are the badge: red square, ticket with the numbers, no old blue 'T' artwork", () => {
    for (const f of ["logo-mark.svg", "logo.svg"]) { const s = read(f); expect(s).toContain('fill="#E23E57"'); expect(s).toContain("rotate(-7 32 32)"); expect(s).toContain(">45</text>"); expect(s).not.toContain("E8284F"); expect(s).not.toContain("linearGradient"); expect(s).toContain("<title>Corporate Tambola</title>"); }
  });
  test("it is the same artwork as the badge in the games row of the landing page", () => {
    const sym = /<symbol id="i-tambola" viewBox="0 0 64 64">([\s\S]*?)<\/symbol>/.exec(read("index.html"))![1]!;
    expect(read("logo-mark.svg")).toContain(sym); expect(read("logo-lockup.svg")).toContain(sym);
  });
  test("the lock-up has CORPORATE small above Tambola large", () => { const s = read("logo-lockup.svg"); expect(s).toMatch(/>CORPORATE<\/text>/); expect(s).toMatch(/>Tambola<\/text>/); expect(s).not.toMatch(/housie/i); });
  const ROUND: [string, number][] = [["logo-1024.png", 1024], ["logo-512.png", 512], ["icon-512.png", 512], ["icon-192.png", 192], ["favicon-32.png", 32]];
  for (const [f, size] of ROUND) test(`${f}: ${size} x ${size}, rounded red badge (clear corners, red at the edge)`, () => {
    const p = readPng(bytes(f)); expect([p.w, p.h]).toEqual([size, size]); expect(p.px(0, 0)[3]).toBe(0); expect(isBadgeRed(p.px(Math.round(size * 0.5), Math.max(1, Math.round(size * 0.04))), 30)).toBe(true);
  });
  for (const [f, size, safe] of [["icon-maskable-512.png", 512, true], ["icon-maskable-192.png", 192, true], ["apple-touch-icon.png", 180, false]] as const) test(`${f}: ${size} x ${size}, solid red all the way to the corners${safe ? " with the ticket inside the safe zone" : ""}`, () => {
    const p = readPng(bytes(f)); expect([p.w, p.h]).toEqual([size, size]); expect(isBadgeRed(p.px(0, 0))).toBe(true); expect(isBadgeRed(p.px(size - 1, size - 1))).toBe(true);
    if (safe) { expect(isBadgeRed(p.px(Math.round(size * 0.15), Math.round(size * 0.5)))).toBe(true); expect(isBadgeRed(p.px(Math.round(size * 0.5), Math.round(size * 0.12)))).toBe(true); }
  });
  test("the manifest lists the same four icon files; every page links the favicon, the touch icon and the 192 icon with the new version", () => {
    const m = JSON.parse(read("manifest.webmanifest")); expect(m.icons.map((i: any) => i.src).sort()).toEqual(["/icon-192.png", "/icon-512.png", "/icon-maskable-192.png", "/icon-maskable-512.png"]);
    for (const f of readdirSync(PUB).filter((x) => x.endsWith(".html"))) { const h = read(f); for (const m2 of h.matchAll(/href="\/(favicon-32|icon-192|icon-512|apple-touch-icon)\.png(\?v=\d+)?"/g)) expect([f, m2[0]]).toEqual([f, m2[0].replace(/(\?v=\d+)?"$/, '?v=4"')]); }
  });
  test("no page, script or style still draws the old logo (white square with a blue T disc)", () => {
    for (const f of readdirSync(PUB).filter((x) => /\.(html|js|css|svg)$/.test(x))) { const s = read(f); expect([f, /E8284F|#E8EEFF/.test(s)]).toEqual([f, false]); }
  });
  test("the printed pieces carry the badge too: brochure, organizer one-page manual and the WhatsApp ad (the old letter-T box is gone)", () => {
    const b = read("brochure.html"); expect(b).toContain('<img src="logo-mark.svg" alt="Corporate Tambola logo"'); expect(b).toContain("<i>Corporate</i><b>Tambola</b>");
    for (const f of ["organizer-manual.html", "whatsapp-ad.html"]) { const h = readFileSync(new URL("../../../tools/onepager/" + f, import.meta.url), "utf8"); expect(h).toContain('<img class="mark" src="../../apps/web/public/logo-mark.svg"'); expect(h).not.toContain('<div class="mark">T</div>'); }
  });
  test("the phone app cache is a new version so every phone fetches the new icons", () => { expect(read("zsw.js")).toMatch(/const CACHE = "ct-game-v(3[8-9]|[4-9]\d)"/); });
  test("every logo file the pages and the Pages build name exists", () => { for (const f of ["logo-mark.svg", "logo.svg", "logo-lockup.svg", "logo-512.png", "logo-1024.png", "favicon-32.png", "apple-touch-icon.png", "nav.css", "nav.js"]) expect([f, existsSync(new URL(f, PUB))]).toEqual([f, true]); });
});
