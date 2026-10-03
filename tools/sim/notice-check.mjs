// Real Chrome: with notifications allowed in the browser, a notice we publish appears as a notification, once, without anything on the page. Usage: node tools/sim/notice-check.mjs
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
const require = createRequire("C:/ct/ct/package.json");
const { chromium } = require("playwright-core");
const BUN = "C:/Users/Dell/AppData/Roaming/npm/node_modules/bun/node_modules/@oven/bun-windows-x64-baseline/bin/bun.exe";
const PORT = 8794, BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(BUN, ["run", "tools/sim/local-e2e-server.ts"], { cwd: "C:/ct/tambola", env: { ...process.env, PORT: String(PORT) } });
await new Promise((res, rej) => { srv.stdout.on("data", (d) => String(d).includes("READY") && res()); srv.on("exit", () => rej(new Error("server exited"))); setTimeout(() => rej(new Error("no start")), 30000); });
const ok = [];
const check = (n, v, x = "") => { ok.push(v); console.log((v ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };
const post = await fetch(BASE + "/api/notices", { method: "POST", headers: { "content-type": "application/json", "x-organizer": "e2e" }, body: JSON.stringify({ notices: [{ id: "buy-1", title: "Games for 5,000 people", body: "New packs are out. Tap to see.", url: "/partner.html" }] }) });
check("notice published with the platform key", post.status === 200);
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const spy = () => { window.__shown = []; const o = ServiceWorkerRegistration.prototype.showNotification; ServiceWorkerRegistration.prototype.showNotification = function (t, opts) { window.__shown.push({ title: t, body: opts && opts.body, tag: opts && opts.tag, url: opts && opts.data && opts.data.url }); return o.call(this, t, opts); }; }; // headless Chrome does not list notifications, so we record what the page asked the browser to show
const ctx = await b.newContext({ permissions: ["notifications"] }); await ctx.addInitScript(spy);
const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(`${BASE}/index.html`); await page.waitForTimeout(1500);
let shown = [];
for (let i = 0; i < 20 && !shown.length; i++) { shown = await page.evaluate(() => window.__shown); await sleep(500); }
check("the browser was asked to show the notification (title, text and where a tap leads)", shown.length === 1 && shown[0].title === "Games for 5,000 people" && shown[0].url === "/partner.html", JSON.stringify(shown));
const bar = await page.evaluate(() => ({ status: [...document.querySelectorAll("body > div[role=status]")].some((d) => d.style.position === "fixed"), text: /saving the game|saved on this device|install app|remind me|allow notifications/i.test(document.body.innerText) }));
check("nothing of ours is added to the page: no bar, no button, no text", !bar.status && !bar.text, JSON.stringify(bar));
await page.reload(); await page.waitForTimeout(2500);
const again = await page.evaluate(() => window.__shown.length);
check("shown once only, not again on the next visit", again === 0, String(again)); // after the reload the page asked for nothing: the device remembers it was shown
const nctx = await b.newContext({ permissions: [] }); await nctx.addInitScript(spy); const noPermission = await nctx.newPage(); await noPermission.goto(`${BASE}/index.html`); await noPermission.waitForTimeout(2500);
const none = await noPermission.evaluate(() => window.__shown.length);
check("without the browser's permission nothing is shown", none === 0, String(none));
check("no script errors", errs.length === 0, errs.join(" | "));
await b.close(); srv.kill(); process.exit(ok.every(Boolean) ? 0 : 1);
