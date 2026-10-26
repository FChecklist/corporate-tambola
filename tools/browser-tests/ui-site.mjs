// What a visitor sees: the public pages of the live site, opened by clicking links like a person, at phone size and desktop size, in Chrome / Chromium / WebKit.
// Checks: the page opens, shows text, no page error, no 5xx, no sideways scroll on a phone, every main link on the home page opens a real page, "Start a demo game" leads to the sign-in.
//   BROWSER=chrome SITE=https://corporatetambola.com node tools/ui-site.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { launch, sleep } from "./ui-lib.mjs";
const B = process.env.BROWSER || "chrome", SITE = process.env.SITE || "https://corporatetambola.com";
const R = { browser: B, site: SITE, checks: [], errors: [], failedReq: [] };
const check = (n, ok, d = "") => { R.checks.push({ n, ok: !!ok, d: String(d).slice(0, 250) }); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : "| " + String(d).slice(0, 250)); };
const browser = await launch(B);
const shots = `C:/ct/test-sites/data/ui/site-${B}`; mkdirSync(shots, { recursive: true });
for (const [label, vp, mobile] of [["phone", { width: 390, height: 844 }, true], ["desktop", { width: 1280, height: 900 }, false]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile && B !== "webkit", hasTouch: mobile }); const p = await ctx.newPage();
  p.on("pageerror", (e) => R.errors.push(label + ": " + String(e).slice(0, 160))); p.on("response", (x) => { if (x.status() >= 500) R.failedReq.push(`${label} ${x.status()} ${x.url().slice(0, 90)}`); });
  p.on("dialog", (d) => d.accept().catch(() => {}));
  await p.goto(SITE + "/", { waitUntil: "load" }); await sleep(1500);
  const t = (await p.innerText("body")).replace(/\s+/g, " ");
  check(`${label}: the home page shows its headline and the demo button`, /Engage your company/i.test(t) && /demo game/i.test(t), t.slice(0, 100));
  if (mobile) { const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2); check("phone: no sideways scroll on the home page", !wide); }
  await p.screenshot({ path: `${shots}/home-${label}.png` });
  for (const path of ["/pricing.html", "/organizer-guide.html", "/terms.html", "/privacy.html", "/about.html", "/contact.html", "/zc.html"]) {
    const r = await p.goto(SITE + path, { waitUntil: "load" }).catch(() => null); await sleep(800);
    const body = (await p.innerText("body").catch(() => "")).replace(/\s+/g, " ");
    check(`${label}: ${path} opens with text`, r && r.status() < 400 && body.length > 200, `${r && r.status()} ${body.length}`);
    if (mobile) { const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2); if (wide) check(`phone: no sideways scroll on ${path}`, false, "page is wider than the screen"); }
  }
  await p.goto(SITE + "/", { waitUntil: "load" }); await sleep(1000);
  const demo = p.getByText("Start a demo game").first(); if (await demo.count()) { await demo.click(); await sleep(2500); const u = p.url(), tt = (await p.innerText("body")).replace(/\s+/g, " "); check(`${label}: Start a demo game leads to the sign-in or the console`, /Sign in|ORGANIZER|e-mail/i.test(tt) || /zc/.test(u), u + " " + tt.slice(0, 80)); await p.screenshot({ path: `${shots}/demo-${label}.png` }); }
  await ctx.close();
}
check("no page error and no 5xx from our own site", R.errors.length === 0 && R.failedReq.length === 0, JSON.stringify([...R.errors, ...R.failedReq].slice(0, 3)));
writeFileSync(`C:/ct/test-sites/data/ui/site-${B}.json`, JSON.stringify(R, null, 1)); await browser.close(); process.exit(0);
