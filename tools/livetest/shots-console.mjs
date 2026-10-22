// Pictures of the organizer console on the live site, laptop and phone: a new game right after "Start a new game" (steps all pending) and a finished game (what is done). Also measures how long the console takes to load.
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
const require = createRequire("C:/ct/tambola/package.json");
const { chromium } = require("playwright");
const BASE = "https://corporatetambola.com"; const OUT = "C:/ct/games-ops/tmp/console_shots"; mkdirSync(OUT, { recursive: true });
const t = JSON.parse(readFileSync("C:/ct/games-ops/tmp/live_token.json", "utf8"));
const endedId = process.argv[2];
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const loaded = async (page) => { const t0 = Date.now(); await page.waitForFunction(() => !/^\s*Loading/.test((document.querySelector(".zc-frame") || document.body).innerText.replace(/[\s\S]*?(Loading|$)/, "$1")) && !document.body.innerText.includes("Loading..."), null, { timeout: 60000 }).catch(() => {}); return Math.round((Date.now() - t0) / 100) / 10; };
async function ctxFor(vp, mobile) { const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 }); await ctx.addInitScript((tok) => { try { sessionStorage.setItem("ctz-org", tok); } catch {} }, t.token); return ctx; }
async function shots(page, name) { await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/${name}-top.png` }); await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true }); const txt = (await page.innerText("body")).replace(/\s+/g, " "); console.log(name, "|", (txt.match(/(\d+) of 10 done[^|]{0,8}/) || ["(no progress line)"])[0], "|", (txt.match(/Next: [^.]{0,70}|The game is over[^.]{0,60}|All done[^.]{0,30}/) || [""])[0]); }
for (const [tag, vp, mob] of [["laptop", { width: 1366, height: 768 }, false], ["phone", { width: 390, height: 844 }, true]]) {
  // a new game, the way a person starts it
  let ctx = await ctxFor(vp, mob), page = await ctx.newPage();
  await page.goto(`${BASE}/zc.html`, { waitUntil: "load" }); console.log(tag, "home console loaded in", await loaded(page), "s");
  const btn = page.getByRole("button", { name: "Start a new game", exact: true }); if (await btn.count()) { await btn.first().click(); await page.waitForSelector(".zc-prog", { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500); }
  await shots(page, `${tag}-new`);
  const newId = new URL(page.url()).searchParams.get("e"); console.log(tag, "new draft id", newId);
  await ctx.close();
  if (endedId) { ctx = await ctxFor(vp, mob); page = await ctx.newPage(); await page.goto(`${BASE}/zc.html?e=${endedId}`, { waitUntil: "load" }); console.log(tag, "ended-game console loaded in", await loaded(page), "s"); await shots(page, `${tag}-ended`); await ctx.close(); }
}
await browser.close();
