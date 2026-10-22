// The free demo link on the REAL site, as a person on a phone, with real Chrome.
//   node tools/livetest/demo-signin.mjs new  <email>            brand-new address: e-mail, Terms box, demo game made
//   node tools/livetest/demo-signin.mjs old  <email>            known address: e-mail, waits for C:\ct\games-ops\tmp\demo_code.txt (the 6-digit code), types it box by box, Submit, demo game made
// Pictures: C:\ct\games-ops\tmp\demo_signin\*.png. The test account is closed afterwards with: node tools/livetest/live.mjs cleanup --close (token in tmp/live_token.json, written here).
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
const require = createRequire("C:/ct/tambola/package.json");
const { chromium } = require("playwright");
const [mode, email] = process.argv.slice(2); const BASE = process.env.LIVE_BASE || "https://corporatetambola.com";
const OUT = "C:/ct/games-ops/tmp/demo_signin"; mkdirSync(OUT, { recursive: true });
const CODEFILE = "C:/ct/games-ops/tmp/demo_code.txt"; if (mode === "old" && existsSync(CODEFILE)) rmSync(CODEFILE);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const ok = (name, v, d = "") => { log(v ? "PASS" : "FAIL", name, v ? "" : d); if (!v) process.exitCode = 1; };
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 150)));
const text = () => page.innerText("body").then((t) => t.replace(/\s+/g, " "));
await page.goto(`${BASE}/zc.html?demo=1`, { waitUntil: "load" });
await page.waitForSelector("#lem", { timeout: 20000 });
const t0 = await text();
ok("sign-in card says 'Start your free demo game'", /Start your free demo game/.test(t0));
ok("e-mail box has the placeholder 'your e-mail'", (await page.getAttribute("#lem", "placeholder")) === "your e-mail");
ok("no 'company.com' and no 'work e-mail' anywhere", !/company\.com|work e-?mail/i.test(t0), t0.slice(0, 300));
await page.screenshot({ path: `${OUT}/${mode}-1-console-signin.png` });
await page.fill("#lem", email); await page.click("#goLogin");
await page.waitForSelector("#lMail", { timeout: 15000 });
ok("the e-mail is carried into the website's box", (await page.inputValue("#lMail")) === email);
await page.screenshot({ path: `${OUT}/${mode}-2-site-login.png` });
await page.click("#lgGo");
if (mode === "new") {
  await page.waitForSelector("#k2slot input[data-box]", { timeout: 15000 });
  ok("a new address is told 'New here?' and shown the Terms box", /New here/.test(await text()));
  ok("Continue is disabled until the box is ticked", await page.isDisabled("#lgGo"));
  await page.screenshot({ path: `${OUT}/${mode}-3-terms.png` });
  for (const b of await page.$$("#k2slot input[data-box]")) await b.check({ force: true });
  ok("Continue works after ticking", !(await page.isDisabled("#lgGo")));
  await page.click("#lgGo");
} else {
  await page.waitForSelector(".otpb", { timeout: 20000 });
  const t1 = await text();
  ok("six code boxes and a Submit button, plain words", (await page.$$(".otpb")).length === 6 && /Submit/.test(t1) && /We have sent a 6-digit code/.test(t1));
  await page.screenshot({ path: `${OUT}/${mode}-3-code.png` });
  log("waiting for the code in", CODEFILE);
  const until = Date.now() + 240000; let code = "";
  while (Date.now() < until) { if (existsSync(CODEFILE)) { code = readFileSync(CODEFILE, "utf8").replace(/\D/g, ""); if (code.length === 6) break; } await new Promise((r) => setTimeout(r, 2000)); }
  ok("the code arrived", code.length === 6, "no code file");
  const boxes = await page.$$(".otpb"); await boxes[0].click(); await page.keyboard.type(code, { delay: 120 });
  const typed = await Promise.all((await page.$$(".otpb")).map((b) => b.inputValue()));
  ok("each digit is in its own box", typed.join("") === code, typed.join(""));
  await page.screenshot({ path: `${OUT}/${mode}-4-code-filled.png` });
  await page.click("#cdGo");
}
await page.waitForURL(/\/zc(\.html)?\?demo=1/, { timeout: 30000 });
await page.waitForFunction(() => /[?&]e=[A-Za-z0-9_-]{4,}/.test(location.search) && !!document.querySelector(".zc-prog") && /DEMO GAME/.test((document.querySelector(".zc-bar") || document.body).innerText), null, { timeout: 60000 }).catch(() => {}); // a real demo game: its own id in the address, the steps bar, and the pill "DEMO GAME · free" (the words "DEMO GAME" alone are also in the home text)
const t2 = await text(); ok("the demo game is made: its own address, the 10 steps, the DEMO GAME pill, 0 of 10 done", /[?&]e=/.test(page.url()) && /^\s*Corporate Tambola Organizer DEMO GAME/.test(t2) && /0 of 10 done/.test(t2), page.url() + " " + t2.slice(0, 160));
ok("nothing to pay yet: a draft, no payment banner", !/payment is pending/i.test(t2), t2.slice(0, 200));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/${mode}-5-demo-console.png` });
const tok = await page.evaluate(() => sessionStorage.getItem("ctz-org")); if (tok) writeFileSync("C:/ct/games-ops/tmp/live_token.json", JSON.stringify({ email, token: tok, at: Date.now() }));
const eid = new URL(page.url()).searchParams.get("e") || (await page.evaluate(() => (location.search.match(/e=([A-Za-z0-9_-]+)/) || [])[1] || ""));
log("page url:", page.url().replace(/token=[^&]+/, "token=***"), "| js errors:", JSON.stringify(errs));
ok("no JavaScript error", errs.length === 0, JSON.stringify(errs));
await browser.close();
