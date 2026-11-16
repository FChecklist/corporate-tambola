// 1.8.2: /zc opens the new organizer screens by default, "Use the previous screens" goes back (and is remembered), "Use the new organizer screens" returns. 360 / 768 / 1280, light and dark.
// node tools/sim2/zc-mode-smoke.mjs [baseUrl] [outDir]  (local server with TEST_MODE=1 or the live site; C:\ct\heavy.lock; one Chrome)
import { createRequire } from "node:module";
const { chromium } = createRequire("C:/ct/ct/dpdp-app/package.json")("playwright");
import { mkdirSync } from "node:fs";
const BASE = (process.argv[2] || "http://localhost:8821").replace(/\/$/, ""), OUT = process.argv[3] || "C:/ct/test-sites/data/ui/housie-header-logo/mode-182";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
let bad = 0; const check = (n, ok, d = "") => { if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : "| " + d); };
for (const w of [360, 768, 1280]) for (const scheme of ["light", "dark"]) {
  const tag = `${w}-${scheme}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, colorScheme: scheme, isMobile: w < 600, hasTouch: w < 600 });
  const p = await ctx.newPage(), errs = [], miss = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  p.on("response", (r) => { if (r.status() >= 400 && !/\/api\/|favicon/.test(r.url())) miss.push(r.status() + " " + new URL(r.url()).pathname); });
  try {
    await p.goto(`${BASE}/zc.html`, { waitUntil: "load" }); await p.waitForTimeout(1800);
    check(`${tag}: default = new screens`, (await p.locator(".zf-bar").count()) > 0 && /flow=new/.test(p.url()), p.url());
    check(`${tag}: link says Use the previous screens`, /Use the previous screens/.test(await p.locator("#trynew").innerText()));
    await p.screenshot({ path: `${OUT}/new-${tag}.png` });
    await p.click("#trynew"); await p.waitForLoadState("load"); await p.waitForTimeout(1800);
    check(`${tag}: previous screens after the link (no new bar)`, (await p.locator(".zf-bar").count()) === 0 && /flow=old/.test(p.url()), p.url());
    check(`${tag}: link now says Use the new organizer screens`, /Use the new organizer screens/.test(await p.locator("#trynew").innerText()));
    await p.screenshot({ path: `${OUT}/old-${tag}.png` });
    await p.goto(`${BASE}/zc.html`, { waitUntil: "load" }); await p.waitForTimeout(1500);
    check(`${tag}: remembered (opens the previous screens again)`, (await p.locator(".zf-bar").count()) === 0 && /flow=old/.test(p.url()), p.url());
    await p.click("#trynew"); await p.waitForLoadState("load"); await p.waitForTimeout(1500);
    check(`${tag}: back to the new screens in one press`, (await p.locator(".zf-bar").count()) > 0, p.url());
    check(`${tag}: a second link sits near the top (above the console)`, await p.locator("#trynewtop").isVisible() && /Use the previous screens/.test(await p.locator("#trynewtop").innerText()));
    await p.evaluate(() => localStorage.clear());
    await p.goto(`${BASE}/zc.html?demo=1`, { waitUntil: "load" }); await p.waitForTimeout(1500);
    check(`${tag}: a demo link opens the previous screens, no choice link offered`, (await p.locator(".zf-bar").count()) === 0 && /flow=old/.test(p.url()) && !(await p.locator("#trynew").isVisible()), p.url());
    await p.goto(`${BASE}/zc.html`, { waitUntil: "load" }); await p.waitForTimeout(1500);
    check(`${tag}: and that did not change the default (new screens again, nothing stored)`, (await p.locator(".zf-bar").count()) > 0, p.url());
    check(`${tag}: no sideways scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    check(`${tag}: no script errors, no missing files`, errs.length === 0 && miss.length === 0, errs.concat(miss).join(";"));
  } catch (e) { check(`${tag}: the run`, false, String(e).slice(0, 160)); }
  await ctx.close();
}
await browser.close(); console.log(bad ? `FAILED ${bad}` : "ALL PASSED"); process.exit(bad ? 1 : 0);
