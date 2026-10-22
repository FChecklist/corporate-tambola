// Renders the WhatsApp advertisement (1080 x 1350 PNG) with the real Chrome. Usage: node tools/onepager/render-ad.mjs [out.png]
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const require = createRequire("C:/ct/tambola/package.json");
const { chromium } = require("playwright");
const out = process.argv[2] || "C:/Users/Dell/Downloads/Corporate-Tambola-WhatsApp-Ad.png";
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(resolve("tools/onepager/whatsapp-ad.html")).href, { waitUntil: "load" });
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1080, height: 1350 } });
  console.log("wrote", out);
} finally { await browser.close(); }
