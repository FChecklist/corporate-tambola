// Opens the organizer console of a live game with the saved token and reports the Next-number button and the call mode.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire("C:/ct/tambola/package.json");
const { chromium } = require("playwright");
const id = process.argv[2]; const BASE = "https://corporatetambola.com";
const t = JSON.parse(readFileSync("C:/ct/games-ops/tmp/live_token.json", "utf8"));
const info = await (await fetch(`${BASE}/api/z/${id}/info`)).json();
console.log("info callMode", info.callMode, "started", info.started, "locked", info.locked, "cap", info.cap, "keys", Object.keys(info).join(","));
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript((tok) => { try { sessionStorage.setItem("ctz-org", tok); } catch {} }, t.token);
const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`${BASE}/zc.html?e=${id}`, { waitUntil: "load" }); await page.waitForTimeout(6000);
const b = await page.$("#nextnum"); console.log("#nextnum", !!b, b ? "disabled=" + (await b.isDisabled()) + " text=" + (await b.innerText()).slice(0, 60) : "");
const h = await page.$("#hostcall"); console.log("#hostcall", !!h, h ? (await h.innerText()).replace(/\s+/g, " ").slice(0, 400) : "");
const body = (await page.innerText("body")).replace(/\s+/g, " ");
const i = body.search(/Who calls|Next number|calls the numbers/i); console.log("around:", i >= 0 ? body.slice(Math.max(0, i - 200), i + 500) : body.slice(0, 600));
for (const w of [0, 10, 20]) { await page.waitForTimeout(w * 1000); const l = await page.$("#zclive"); console.log("after +" + (6 + w) + "s live line:", l ? (await l.innerText()).replace(/\s+/g, " ") : "(none)", "| next hint:", ((await page.innerText("body")).match(/Next: [^\n]{0,80}/) || [""])[0]); }
console.log("errors", errs);
await page.screenshot({ path: "C:/ct/games-ops/tmp/live_shots/dbg-console.png", fullPage: false });
await browser.close();
