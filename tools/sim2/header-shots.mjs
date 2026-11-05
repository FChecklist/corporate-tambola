// 1.6.8: the top menu and the logo in real Chrome. node tools/sim2/header-shots.mjs [baseUrl] [outDir]
// For each of 1920 / 1280 / 390 / 360 wide, light and dark: screenshot of the top of the landing page and of an information page,
// the six items (exactly, in order), one row with no wrapping on a laptop, no sideways scrolling, the Menu button on a phone (closed, then open),
// the Tab key walking brand -> six items in order, and the logo files loading. Run it while holding C:\ct\heavy.lock.
import { createRequire } from "node:module";
const { chromium } = createRequire("C:/ct/ct/dpdp-app/package.json")("playwright");
import { mkdirSync } from "node:fs";
const BASE = (process.argv[2] || "http://localhost:8821").replace(/\/$/, ""), OUT = process.argv[3] || "C:/ct/test-sites/data/ui/housie-header-logo";
mkdirSync(OUT, { recursive: true });
const SIX = ["How it works", "Free demo game", "Guide", "Brochure", "Refer & earn", "Log in"];
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
let bad = 0;
const check = (n, ok, d = "") => { if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : "| " + d); };
for (const [w, h] of [[1920, 1000], [1280, 800], [390, 844], [360, 740]]) for (const scheme of ["light", "dark"]) for (const page of ["/", "/about.html"]) {
  const phone = w < 1080, tag = `${w}-${scheme}-${page === "/" ? "landing" : "about"}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, isMobile: w < 600, hasTouch: w < 600 }), p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  await p.goto(BASE + page, { waitUntil: "load" }); await p.waitForTimeout(900);
  await p.screenshot({ path: `${OUT}/header-${tag}.png` });
  if (phone) {
    const burger = p.locator("#ctBurger");
    check(`${tag}: Menu button visible, list closed`, (await burger.isVisible()) && !(await p.locator("#ctMenu").isVisible()) && (await burger.getAttribute("aria-expanded")) === "false");
    await burger.click(); await p.waitForTimeout(300);
    check(`${tag}: after Menu is pressed the list is open`, (await p.locator("#ctMenu").isVisible()) && (await burger.getAttribute("aria-expanded")) === "true");
    await p.screenshot({ path: `${OUT}/header-${tag}-menu-open.png` });
  }
  const r = await p.evaluate(() => {
    const vis = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const items = [...document.querySelectorAll("#ctMenu ul a")].map((a) => ({ t: a.textContent.trim(), top: Math.round(a.getBoundingClientRect().top), v: vis(a), href: a.getAttribute("href") }));
    const badge = document.querySelector(".ct-badge"), word = document.querySelector(".ct-word");
    return { items, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, badgeOk: !!badge && badge.complete && badge.naturalWidth > 0, word: word ? word.innerText.replace(/\s+/g, " ") : "", txt: document.body.innerText, navH: document.querySelector(".ct-nav").getBoundingClientRect().height };
  });
  check(`${tag}: exactly the six items, in order`, JSON.stringify(r.items.map((x) => x.t)) === JSON.stringify(SIX), JSON.stringify(r.items.map((x) => x.t)));
  check(`${tag}: no sideways scrolling`, r.sw <= r.cw, `${r.sw} > ${r.cw}`);
  check(`${tag}: logo badge loaded; reads CORPORATE above Tambola`, r.badgeOk && /^corporate tambola$/i.test(r.word), r.word);
  if (!phone) { check(`${tag}: one row on a laptop (all six items at the same height, all visible)`, new Set(r.items.map((x) => x.top)).size === 1 && r.items.every((x) => x.v), JSON.stringify(r.items.map((x) => x.top))); check(`${tag}: the bar is one row high (<= 96 px)`, r.navH <= 96, String(r.navH)); }
  if (page === "/") check(`${tag}: no 'private' on the page`, !/private/i.test(r.txt));
  if (!phone && scheme === "light" && page === "/") {
    // keyboard: Tab from the top reaches the brand, then the six items in order
    await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.keyboard.press("Tab"); const seen = [];
    for (let i = 0; i < 12 && seen.length < 8; i++) { seen.push(await p.evaluate(() => (document.activeElement && (document.activeElement.getAttribute("aria-label") || document.activeElement.textContent.trim())) || "")); await p.keyboard.press("Tab"); }
    const order = seen.filter((s) => SIX.includes(s));
    check(`${tag}: Tab walks the six items in order`, JSON.stringify(order.slice(0, 6)) === JSON.stringify(SIX), JSON.stringify(seen));
    await p.keyboard.press("Shift+Tab"); await p.keyboard.press("Shift+Tab");
  }
  if (phone && scheme === "light" && page === "/") { // Escape closes the list and gives focus back to the Menu button
    await p.keyboard.press("Escape"); await p.waitForTimeout(200);
    check(`${tag}: Escape closes the list`, !(await p.locator("#ctMenu").isVisible()) && (await p.evaluate(() => document.activeElement && document.activeElement.id)) === "ctBurger");
  }
  check(`${tag}: no script errors`, errs.length === 0, errs.join(" | "));
  await ctx.close();
}
// the logo files load and are the right size
const ctx = await browser.newContext(), p = await ctx.newPage(); await p.goto(BASE + "/", { waitUntil: "load" });
const files = await p.evaluate(async () => { const o = {}; for (const f of ["/logo-mark.svg", "/logo.svg", "/logo-lockup.svg", "/logo-512.png", "/logo-1024.png", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png", "/favicon-32.png", "/nav.css?v=1", "/nav.js?v=1", "/brochure.pdf", "/organizer-manual.pdf"]) { const r = await fetch(f, { cache: "no-store" }); o[f] = [r.status, r.headers.get("content-type")]; } return o; });
for (const [f, [s, t]] of Object.entries(files)) check(`file ${f} answers 200 (${t})`, s === 200, String(s));
await browser.close();
console.log(bad ? `${bad} FAILED` : "ALL PASSED");
process.exit(bad ? 1 : 0);
