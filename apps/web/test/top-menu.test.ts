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
  test("the lock-up (badge + CORPORATE small above Tambola large, text drawn as outlines so no font is needed) never says Housie", () => { const s = read("logo-lockup.svg"); expect(s).toMatch(/viewBox="0 0 [0-9]+ 72"/); expect(s).toContain('aria-label="Corporate Tambola"'); expect(s).toContain("<path d="); expect(s).not.toMatch(/housie/i); });
  // the sha256 of each file as copied from the shared brand kit (C:\ct\test-sites\corporate-brand-kit\logos); .svg compared with line ends as LF
  const KIT: Record<string, [string, string]> = {
    "logo-mark.svg": ["9f52e24c3e17519035e6be6a79ccc64e589cd5e05405725477fc46bc96624174", "tambola.svg"],
    "logo.svg": ["9f52e24c3e17519035e6be6a79ccc64e589cd5e05405725477fc46bc96624174", "tambola.svg"],
    "logo-lockup.svg": ["a8767bd668e7d42f73275776cc46b92c1a1eccebd93ed821548069af52b3af10", "lockups/tambola-lockup-light.svg"],
    "logo-512.png": ["f3cfd8f404c4db01cbf94901b99fb575d6b5d2c113cdb4b08ac480bc283511df", "png/tambola-512.png"],
    "icon-512.png": ["f3cfd8f404c4db01cbf94901b99fb575d6b5d2c113cdb4b08ac480bc283511df", "png/tambola-512.png"],
    "icon-192.png": ["b63f1dc88fd0e2a0cd524aa53a2235c58c7bc3bba11ef393edd1ad1ef3c85331", "png/tambola-192.png"],
    "apple-touch-icon.png": ["63b6e05e9890421cea5625cdca62a2ce3cbbb79160196ab0f789a5813922d28a", "png/tambola-180.png"],
    "favicon-32.png": ["768d43f8ffd3789004b9983f74e3f1b4143f72c58b18718998fdde5684683ae5", "png/tambola-32.png"],
    "icon-maskable-192.png": ["c48115c4acbcf92caf36a6b046ca8aca532d08dc1013a921fb0be3534295bfd5", "png/tambola-maskable-192.png"],
    "icon-maskable-512.png": ["67891252226f7eff61b7868a5db2a29d10d60557384ddb626e054e2fe438990a", "png/tambola-maskable-512.png"],
    "favicon.ico": ["5b297d87bb83bf90ad37ef16265188af6ac8dbd328dc0a209a5e189b70a8810e", "ico/tambola.ico"],
    "og-tambola.png": ["3e51dba508b62ae3f832ccf08115a0ef347acfec55f8f533a1a5e4e859e6dfed", "social/tambola-social-1200x630.png"],
  };
  const sha = (b: Buffer, f: string) => new Bun.CryptoHasher("sha256").update(f.endsWith(".svg") ? b.filter((c) => c !== 13) : b).digest("hex");
  test("every logo file is exactly the brand kit's file (pinned checksums),", () => {
    for (const [f, [h]] of Object.entries(KIT)) {
      expect([f, sha(readFileSync(new URL(f, PUB)), f)]).toEqual([f, h]);
    }
  });
  test("the share card (og-tambola.png) is 1200 x 630 and every page's og:image and twitter:image name it", () => {
    const p = readPng(bytes("og-tambola.png")); expect([p.w, p.h]).toEqual([1200, 630]);
    for (const f of PAGES.filter((x) => x !== "legal-position.html")) { const h = read(f); expect(h).toMatch(/<meta property="og:image" content="https:\/\/housie\.corporatetambola\.com\/og-tambola\.png">/); expect(h).toMatch(/<meta name="twitter:image" content="https:\/\/housie\.corporatetambola\.com\/og-tambola\.png">/); }
  });
  const ROUND: [string, number][] = [["logo-1024.png", 1024], ["logo-512.png", 512], ["icon-512.png", 512], ["icon-192.png", 192], ["favicon-32.png", 32]];
  for (const [f, size] of ROUND) test(`${f}: ${size} x ${size}, rounded red badge (clear corners, red at the edge)`, () => {
    const p = readPng(bytes(f)); expect([p.w, p.h]).toEqual([size, size]); expect(p.px(0, 0)[3]).toBe(0); expect(isBadgeRed(p.px(Math.round(size * 0.5), Math.max(1, Math.round(size * 0.04))), 30)).toBe(true);
  });
  for (const [f, size, safe] of [["icon-maskable-512.png", 512, true], ["icon-maskable-192.png", 192, true], ["apple-touch-icon.png", 180, false]] as const) test(`${f}: ${size} x ${size}, solid red all the way to the corners${safe ? " with the ticket inside the safe zone" : ""}`, () => {
    const p = readPng(bytes(f)); expect([p.w, p.h]).toEqual([size, size]); expect(isBadgeRed(p.px(0, 0))).toBe(true); expect(isBadgeRed(p.px(size - 1, size - 1))).toBe(true);
    if (safe) { expect(isBadgeRed(p.px(Math.round(size * 0.05), Math.round(size * 0.5)))).toBe(true); expect(isBadgeRed(p.px(Math.round(size * 0.5), Math.round(size * 0.05)))).toBe(true); expect(isBadgeRed(p.px(Math.round(size * 0.5), Math.round(size * 0.5)))).toBe(false); }
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
