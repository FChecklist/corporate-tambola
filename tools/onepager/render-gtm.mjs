// Renders the go-to-market pack to PDF (A4 portrait). Usage: node tools/onepager/render-gtm.mjs [out.pdf]
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const require = createRequire("C:/ct/tambola/package.json");
const { chromium } = require("playwright");
const out = process.argv[2] || "C:/Users/Dell/Downloads/Corporate-Tambola-GTM-Pack.pdf";
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve("C:/ct/tambola/tools/onepager/gtm-pack.html")).href, { waitUntil: "load" });
  await page.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
  console.log("wrote", out);
} finally { await browser.close(); }
