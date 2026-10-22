// Pictures of the sign-in screens from the LOCAL build (pages/public served statically): console sign-in (phone + laptop), the website's login sheet and the 6-box code screen (phone), the phone home top.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
const require = createRequire("C:/ct/tambola/package.json");
const { chromium } = require("playwright");
const ROOT = "C:/ct/tambola/pages/public", OUT = "C:/ct/games-ops/tmp/signin_shots"; mkdirSync(OUT, { recursive: true });
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };
const srv = http.createServer(async (req, res) => {
  let p = req.url.split("?")[0]; if (p === "/") p = "/index.html"; if (!extname(p)) p += ".html";
  if (p.startsWith("/api/")) { res.writeHead(p.includes("payments/status") ? 200 : 204, { "content-type": "application/json" }); return res.end(p.includes("payments/status") ? JSON.stringify({ mode: "razorpay", siteMode: "LIVE" }) : ""); }
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" }); res.end(b); } catch { res.writeHead(404); res.end(); }
}).listen(8807);
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
async function shot(name, path, vp, mobile, after) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); page.on("pageerror", (e) => console.log(name, "JS ERROR", String(e).slice(0, 120)));
  await page.goto("http://localhost:8807" + path, { waitUntil: "load" }); await page.waitForTimeout(1200);
  if (after) await after(page);
  await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("wrote", name);
  await ctx.close();
}
await shot("console-signin-phone", "/zc.html?demo=1", { width: 390, height: 844 }, true);
await shot("console-signin-laptop", "/zc.html?demo=1", { width: 1366, height: 768 }, false);
await shot("home-phone-top", "/", { width: 390, height: 1400 }, true);
await shot("site-login-phone", "/#login", { width: 390, height: 844 }, true, async (p) => { await p.waitForSelector("#lMail", { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(500); });
await shot("site-code-phone", "/#login", { width: 390, height: 844 }, true, async (p) => {
  await p.waitForSelector("#lMail", { timeout: 5000 }).catch(() => {});
  await p.evaluate(() => { const r = document.getElementById("sheet"); if (r && window.__dbgCode) window.__dbgCode(); });
  // drive the code screen directly: the api is mocked (204), so ask for the code view through the real path with a fake 200
  await p.route("**/api/auth/email", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  await p.fill("#lMail", "you@company.com"); const boxes = await p.$$("[data-cbc='K2'] input[data-box]"); for (const b of boxes) await b.check({ force: true }).catch(() => {});
  await p.click("#lgGo"); await p.waitForSelector(".otpb", { timeout: 5000 }).catch(() => {}); const first = await p.$(".otpb"); if (first) { await first.click(); await p.keyboard.type("48"); } await p.waitForTimeout(400);
});
await browser.close(); srv.close();
