// Shared pieces for the click-only real-browser tests: browser choice (Chrome, Chromium, WebKit), human sign-in, and reading what a page shows.
import { createRequire } from "node:module";
import { install as installBeacon } from "./standin-beacon.mjs";
const require = createRequire(import.meta.url);
const pw = require("playwright");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const launch = async (B) => { // CLOUD PORT: Playwright's own Chromium/WebKit; every context blocks service workers and gets the stand-in beacon
  const br = await (B === "webkit" ? pw.webkit.launch({ headless: true }) : pw.chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-extensions", "--no-first-run"] }));
  const orig = br.newContext.bind(br); br.newContext = async (o = {}) => { const c = await orig({ ...o, serviceWorkers: "block" }); await installBeacon(c); return c; }; return br; };
// sign in the way a person does: type the e-mail, press Continue, tick the box if asked, then use the code the local test screen offers (or type it)
export async function signIn(p, SITE, email, code) {
  await p.goto(`${SITE}/zc.html${process.env.PASS ? "?pass=" + process.env.PASS : ""}`, { waitUntil: "load" }); await p.waitForSelector("#lem", { timeout: 30000 }); await p.fill("#lem", email); await p.click("#goLogin");
  await p.waitForSelector("#lMail", { timeout: 20000 }); await sleep(600); await p.fill("#lMail", email); await p.click("#lgGo"); await sleep(2500);
  for (let i = 0; i < 40; i++) { if (await p.locator("#cdGo").isVisible() || await p.locator("#signout").isVisible()) break; if (await p.getByRole("checkbox").count()) { const cb = p.getByRole("checkbox").first(); if (!(await cb.isChecked())) { await cb.check({ timeout: 8000 }); await sleep(500); await p.click("#lgGo"); await sleep(2000); } } await sleep(500); }
  await p.waitForSelector("#signout, #cdGo", { timeout: 90000 });
  if (!(await p.locator("#signout").isVisible())) {
    await p.waitForSelector("#cdGo", { timeout: 20000 }); const use = await p.$("#useCode");
    if (use) { await use.click(); await sleep(1500); if ((await p.$("#cdGo")) && !(await p.$("#mk")) && !(await p.$(".zc-dot"))) await p.click("#cdGo", { timeout: 4000 }).catch(() => {}); }
    else { const boxes = await p.$$("input[type=text]:visible"); if (boxes.length >= 6) { await boxes[0].click(); await p.keyboard.type(code || "123456", { delay: 120 }); } else await p.fill("#lCode", code || "123456", { force: true }); await sleep(400); await p.click("#cdGo"); await sleep(3000); }
  }
  await p.waitForSelector("#signout", { timeout: 30000 });
}
export const ctrls = (p) => p.$$eval("input,select,button,textarea", (e) => e.filter((x) => x.offsetParent).map((x) => (x.id ? "#" + x.id : "") + "|" + (x.dataset.ck ? "ck=" + x.dataset.ck + ":" + x.dataset.v : "") + (x.dataset.open ? "open=" + x.dataset.open : "") + (x.dataset.save ? "save=" + x.dataset.save : "") + (x.dataset.bool ? "bool=" + x.dataset.bool : "") + "|" + (x.textContent || x.value || "").trim().slice(0, 22)).join("  ;  "));
