// Screenshots of the Housie landing page at 320 / 360 / 1280 (1.6.6): node tools/sim2/landing-shots.mjs [baseUrl] [outDir]
// Also checks: no horizontal scroll, the six game links, the contact line, the primary button, the headline, no "Live now"/"Coming soon"/"private".
import { createRequire } from "node:module";
const { chromium } = createRequire("C:/ct/ct/dpdp-app/package.json")("playwright"); // the same Playwright the other real-browser tools use
import { mkdirSync } from "node:fs";
const BASE = process.argv[2] || "http://localhost:8899/", OUT = process.argv[3] || "C:/ct/test-sites/data/ui/housie-redesign";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
let bad = 0;
const check = (n, ok, d = "") => { if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : "| " + d); };
for (const [w, h] of [[320, 700], [360, 800], [1280, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }), p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: "load" }); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/landing-${w}.png`, fullPage: true });
  await p.screenshot({ path: `${OUT}/landing-${w}-fold.png` });
  const r = await p.evaluate(() => {
    const vis = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== "hidden";
    const hrefs = (sel) => [...document.querySelectorAll(sel + " a, " + sel.replace(/ul$/, "") + " .lp-allgames")].filter(vis).map((a) => a.href);
    const txt = document.body.innerText;
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h1: document.getElementById("h1").innerText.replace(/\s+/g, " "), sub: document.getElementById("herosub").innerText,
      main: [...document.querySelectorAll(".lp-main")].map((a) => [a.innerText, a.getAttribute("href"), vis(a)]),
      chips: hrefs(".lp-choose"), six: hrefs(".lp-six"), contact: document.querySelector(".lp-contact").innerText, contactVis: vis(document.querySelector(".lp-contact")),
      bad: /live now|coming soon|private/i.test(txt), facts: document.querySelectorAll(".lp-facts li").length,
      cssv: [...document.querySelectorAll("link[rel=stylesheet],script[src]")].filter((e) => /\/(app|site|landing)\.css|\/site\.js|\/theme\.js/.test(e.href || e.src)).every((e) => /\?v=\d+/.test(e.href || e.src)) };
  });
  check(`${w}px: no sideways scrolling`, r.sw <= r.cw, `${r.sw} > ${r.cw}`);
  check(`${w}px: headline`, r.h1 === "This week, which teams will you engage with a close group online Housie?", r.h1);
  check(`${w}px: sub line`, /close group online engagement of employees and associates/i.test(r.sub));
  check(`${w}px: primary button goes to the demo`, r.main.some(([t, href, v]) => v && /Try a free game with 10 people/.test(t) && href === "/zc?demo=1"), JSON.stringify(r.main));
  const row = w < 900 ? r.chips : r.six;
  check(`${w}px: the row of games (${w < 900 ? "chips" : "panel"}) links to the five game sites and All games`, ["https://housie.corporatetambola.com/", "https://bingo.corporatetambola.com/", "https://tictactoe.corporatetambola.com/", "https://snakes.corporatetambola.com/", "https://luck.corporatetambola.com/", "https://home.corporatetambola.com/contact", "https://home.corporatetambola.com/"].every((u) => row.includes(u)), JSON.stringify(row));
  check(`${w}px: the other layout is hidden (phone chips vs laptop panel)`, w < 900 ? r.six.length === 0 : r.chips.length === 0);
  check(`${w}px: contact visible`, r.contactVis && /96503 97480/.test(r.contact) && /hello@corporatetambola\.com/.test(r.contact), r.contact);
  check(`${w}px: no "Live now", "Coming soon" or "private"`, !r.bad);
  check(`${w}px: eight trust facts`, r.facts === 8);
  check(`${w}px: css and js linked with ?v=N`, r.cssv);
  await ctx.close();
}
await browser.close();
console.log(bad ? `${bad} FAILED` : "ALL PASSED");
process.exit(bad ? 1 : 0);
