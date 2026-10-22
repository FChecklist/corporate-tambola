// A phone-size picture of the top of a page (the first screens a person sees): node tools/livetest/shot-top.mjs <url> <out.png> [height]
import { createRequire } from "node:module";
const require = createRequire("C:/ct/tambola/package.json");
const { chromium } = require("playwright");
const [url, out, h] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 390, height: Number(h) || 1600 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await ctx.newPage(); await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(2000);
await page.screenshot({ path: out }); console.log("wrote", out);
await browser.close();
