// Renders the organizer's one-page manual to PDF (A4 landscape) with the real Chrome. Usage: node tools/onepager/render.mjs [out.pdf]
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const require = createRequire("C:/ct/tambola/package.json");
const { chromium } = require("playwright");
const out = process.argv[2] || "C:/Users/Dell/Downloads/Corporate-Tambola-Organizer-Manual.pdf";
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve("tools/onepager/organizer-manual.html")).href, { waitUntil: "load" });
  await page.pdf({ path: out, format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await page.screenshot({ path: out.replace(/\.pdf$/, ".png"), fullPage: true });
  console.log("wrote", out);
} finally { await browser.close(); }
