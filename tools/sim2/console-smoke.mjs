// 1.7.0: smoke of the real pages in Chrome at phone and laptop width: the old default console, ?flow=new, a participant link and the sign-in page.
// node tools/sim2/console-smoke.mjs [baseUrl] [outDir]   (hold C:\ct\heavy.lock; one Chrome)
import { createRequire } from "node:module";
const { chromium } = createRequire("C:/ct/ct/dpdp-app/package.json")("playwright");
import { mkdirSync } from "node:fs";
const BASE = (process.argv[2] || "http://localhost:8821").replace(/\/$/, ""), OUT = process.argv[3] || "C:/ct/test-sites/data/ui/housie-header-logo/smoke-170";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
let bad = 0;
const check = (n, ok, d = "") => { if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : "| " + d); };
const PAGES = [["old-console", "/zc.html"], ["new-console", "/zc.html?flow=new"], ["participant", "/z.html?e=EABCDEF"], ["signin", "/signin.html"]];
for (const [w, h] of [[1280, 800], [390, 844]]) for (const [name, path] of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 600, hasTouch: w < 600 }), p = await ctx.newPage();
  const errs = [], miss = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  p.on("response", (r) => { if (r.status() >= 400 && new URL(r.url()).pathname !== "/favicon.ico" && !/\/api\//.test(r.url())) miss.push(r.status() + " " + new URL(r.url()).pathname); });
  await p.goto(BASE + path, { waitUntil: "load" }); await p.waitForTimeout(1500);
  const tag = `${name}-${w}`;
  await p.screenshot({ path: `${OUT}/${tag}.png`, fullPage: false });
  const txt = (await p.locator("body").innerText()).slice(0, 4000);
  check(`${tag}: no script errors`, errs.length === 0, errs.join(" ; "));
  check(`${tag}: no missing files`, miss.length === 0, miss.join(" ; "));
  check(`${tag}: no sideways scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check(`${tag}: no 'private' in the words`, !/\bprivate\b/i.test(txt));
  if (name === "old-console") check(`${tag}: the default console is the old one, with the one 'Try the new organizer screens' link`, !(await p.locator("#zf-ready, [id^=zf-]").count()) && /Try the new organizer screens/i.test(await p.content()));
  if (name === "new-console") check(`${tag}: ?flow=new loads the new screens`, (await p.content()).includes("zf-"));
  await ctx.close();
}
await browser.close();
console.log(bad ? `FAILED ${bad}` : "ALL PASSED");
process.exit(bad ? 1 : 0);
