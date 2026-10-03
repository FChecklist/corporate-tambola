// Real-Chrome proof that the game is saved on the device and opens with the network off.
// Usage: serve pages/public (python -m http.server 8765), then: node tools/sim/pwa-check.mjs http://localhost:8765
import { createRequire } from "node:module";
const require = createRequire("C:/ct/ct/package.json");
const { chromium } = require("playwright-core");
const base = process.argv[2] || "http://localhost:8765";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const out = [];
const check = (name, ok, extra = "") => { out.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); };
await page.goto(base + "/z.html?e=DEMO-1");
await page.waitForFunction(() => navigator.serviceWorker.controller || false, null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(3000);
const st = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const keys = await caches.keys();
  const list = keys.length ? (await (await caches.open(keys[0])).keys()).map((r) => new URL(r.url).pathname) : [];
  return { active: !!(reg && reg.active), keys, list, bar: document.querySelector("[role=status]")?.textContent || "", mf: document.querySelector("link[rel=manifest]")?.href };
});
check("service worker active", st.active);
check("whole game saved (22 files)", st.list.length === 22, st.list.length + " files");
check("saved-on-device notice shown", /saved on this device/i.test(st.bar), st.bar);
const mf = await page.evaluate(async () => { const r = await fetch("/manifest.webmanifest"); return r.ok ? r.json() : null; });
check("manifest served", !!mf && mf.display === "standalone");
// go offline and reopen the game link
await ctx.setOffline(true);
const p2 = await ctx.newPage();
const errs = [];
p2.on("pageerror", (e) => errs.push(String(e)));
const r = await p2.goto(base + "/z.html?e=DEMO-1", { waitUntil: "load" }).catch((e) => ({ err: String(e) }));
check("game page opens with the network OFF", !!r && !r.err, r && r.err ? r.err : "");
const probe = await p2.evaluate(() => ({ title: document.title, hasGame: !!window.ZG, app: !!document.getElementById("app") && document.getElementById("app").innerHTML.length > 20 })).catch(() => ({}));
check("game code (ZG) loaded from the saved copy while offline", !!probe.hasGame && probe.app, JSON.stringify(probe));
check("no script errors while offline", errs.length === 0, errs.join(" | "));
// installed app opens with no link: last game remembered
const last = await p2.evaluate(() => localStorage.getItem("ct-last-eid"));
check("last game remembered for the installed app", last === "DEMO-1", String(last));
await browser.close();
process.exit(out.every(Boolean) ? 0 : 1);
