// 1.7.1: the participant page in Chrome: invitation screen, then the ticket, in Retro and Modern, at 360 / 768 / 1280 wide, light and dark.
// node tools/sim2/look-smoke.mjs [baseUrl] [outDir]  (needs the local server with TEST_MODE=1 and C:\ct\heavy.lock; one Chrome)
import { createRequire } from "node:module";
const { chromium } = createRequire("C:/ct/ct/dpdp-app/package.json")("playwright");
import { mkdirSync, readFileSync } from "node:fs";
const BASE = (process.argv[2] || "http://localhost:8821").replace(/\/$/, ""), OUT = process.argv[3] || "C:/ct/test-sites/data/ui/housie-header-logo/look-171";
mkdirSync(OUT, { recursive: true });
const C = JSON.parse(readFileSync(new URL("../../apps/edge/src/consent-text.json", import.meta.url), "utf8"));
const consent = (k) => ({ consent: { v: C.version, boxes: Object.keys(C[k]) } });
const GENESIS = 1692803367, roundAt = (ms) => Math.floor((ms / 1000 - GENESIS) / 3) + 1, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IP = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const api = async (m, p, b, k) => { const r = await fetch(BASE + p, { method: m, headers: { "content-type": "application/json", "cf-connecting-ip": IP, ...(k ? { "x-organizer": k } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch {} return { ok: r.ok, s: r.status, j }; };
const stamp = Date.now().toString(36).slice(-5), email = `look.${stamp}@sample-co.in`, id = `LK-${stamp.toUpperCase()}`;
const tok = (await api("POST", "/api/start", { email, ...consent("K2") })).j.token;
const start = roundAt(Date.now() + 150 * 1000);
await api("POST", "/api/z", { id, startRound: start, callSeconds: 9, cap: 10, demo: true, name: "Diwali party", tickets: 2 }, tok);
await api("PATCH", `/api/z/${id}/settings`, { tickets: 2, rewards: [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "Mug" }, { pattern: "top", scope: "ticket", ordinal: 1, text: "Voucher" }], whoCanJoin: "anyone" }, tok);
console.log("publish", (await api("POST", `/api/z/${id}/publish`, { email, phone: "9650397480", ...consent("K1") }, tok)).s);
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
let bad = 0; const check = (n, ok, d = "") => { if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : "| " + d); };
let n = 0;
for (const w of [360, 768, 1280]) for (const scheme of ["light", "dark"]) for (const look of ["retro", "modern"]) {
  n++;
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, colorScheme: scheme, isMobile: w < 600, hasTouch: w < 600 });
  await ctx.addInitScript((l) => { try { localStorage.setItem("ctz-look", l); } catch {} }, look);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  const tag = `${w}-${scheme}-${look}`;
  try {
  await p.goto(`${BASE}/z.html?e=${id}`, { waitUntil: "load" });
  await p.waitForSelector("[data-cbc='K4'] input[data-box]", { timeout: 20000 });
  check(`${tag}: theme attribute`, (await p.evaluate(() => document.documentElement.getAttribute("data-pt"))) === look);
  const txt = await p.locator("body").innerText();
  check(`${tag}: invitation text`, /You are invited to join the Corporate Tambola \(Housie\) organized by/.test(txt) && /To join, type your mobile number\./.test(txt), txt.slice(0, 200));
  await p.screenshot({ path: `${OUT}/join-${tag}.png` });
  if (n % 3 === 1) { // join once per few combinations and look at the ticket
    const bx = p.locator("[data-cbc='K4'] input[data-box]"); for (let i = 0; i < await bx.count(); i++) await bx.nth(i).check({ force: true }).catch(() => {});
    await p.fill("#ph", "98" + String(10000000 + n * 7919).slice(0, 8)); await p.click("#go");
    await p.waitForFunction(() => window.__rt && window.__rt.pid, null, { timeout: 20000 }).catch(() => {}); await sleep(1500);
    await p.waitForSelector("#ckokn", { timeout: 15000 }).catch(() => {});
    if (await p.$("#ckokn")) { await p.check("#ckokn", { force: true }); await p.check("#ckokm", { force: true }); await p.fill("#ckcode", (await p.textContent("#ckshow")).trim()); await p.click("#cksubmit"); await sleep(3000); }
    await p.waitForSelector("[data-tpbtn]", { timeout: 170000 }).catch(() => {}); // the ticket opens when the game starts
    const t2 = await p.locator("body").innerText();
    check(`${tag}: ticket page shows Ticket A and B with the Playing switch`, /Playing:/.test(t2) && /Ticket A/.test(t2) && /Ticket B/.test(t2), t2.slice(0, 200));
    if (await p.locator('[data-tpbtn="B"]').count()) { await p.locator('button[data-tpbtn="B"]').click(); await sleep(400); check(`${tag}: after choosing Ticket B, Ticket A is greyed`, (await p.locator(".ztkwrap.zdim").first().getAttribute("data-tpbtn")) === "A"); }
    await p.screenshot({ path: `${OUT}/ticket-${tag}.png` });
  }
  check(`${tag}: no sideways scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check(`${tag}: no script errors`, errs.length === 0, errs.join(";"));
  } catch (e) { check(`${tag}: the run`, false, String(e).slice(0, 160)); }
  await ctx.close();
}
await browser.close();
console.log(bad ? `FAILED ${bad}` : "ALL PASSED"); process.exit(bad ? 1 : 0);
