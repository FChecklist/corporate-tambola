// 1.8.0: the join form (with the email box switched on) and the Family Passes card in Chrome at 360 / 768 / 1280, light and dark, Retro and Modern.
// node tools/sim2/family-smoke.mjs [baseUrl] [outDir]  (local server with TEST_MODE=1, C:\ct\heavy.lock, one Chrome)
import { createRequire } from "node:module";
const { chromium } = createRequire("C:/ct/ct/dpdp-app/package.json")("playwright");
import { mkdirSync, readFileSync } from "node:fs";
const BASE = (process.argv[2] || "http://localhost:8821").replace(/\/$/, ""), OUT = process.argv[3] || "C:/ct/test-sites/data/ui/housie-header-logo/family-180";
mkdirSync(OUT, { recursive: true });
const C = JSON.parse(readFileSync(new URL("../../apps/edge/src/consent-text.json", import.meta.url), "utf8"));
const consent = (k) => ({ consent: { v: C.version, boxes: Object.keys(C[k]) } });
const GENESIS = 1692803367, roundAt = (ms) => Math.floor((ms / 1000 - GENESIS) / 3) + 1, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IP = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const api = async (m, p, b, k) => { const r = await fetch(BASE + p, { method: m, headers: { "content-type": "application/json", "cf-connecting-ip": IP, ...(k ? { "x-organizer": k } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch {} return { ok: r.ok, s: r.status, j }; };
const stamp = Date.now().toString(36).slice(-5), email = `fam.${stamp}@sample-co.in`, id = `FM-${stamp.toUpperCase()}`;
const tok = (await api("POST", "/api/start", { email, ...consent("K2") })).j.token;
await api("POST", "/api/z", { id, startRound: roundAt(Date.now() + 150 * 1000), callSeconds: 9, cap: 10, demo: true, name: "Diwali party" }, tok);
await api("PATCH", `/api/z/${id}/settings`, { invites: { on: true, per: 4, cats: ["family"] }, whoCanJoin: "anyone" }, tok);
console.log("publish", (await api("POST", `/api/z/${id}/publish`, { email, phone: "9650397480", ...consent("K1") }, tok)).s);
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
let bad = 0; const check = (n, ok, d = "") => { if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : "| " + d); };
let n = 0;
for (const w of [360, 768, 1280]) for (const scheme of ["light", "dark"]) for (const look of ["retro", "modern"]) {
  n++; const tag = `${w}-${scheme}-${look}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, isMobile: w < 600, hasTouch: w < 600 });
  await ctx.addInitScript((l) => { try { localStorage.setItem("ctz-look", l); } catch {} }, look);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  try {
    await p.goto(`${BASE}/z.html?e=${id}`, { waitUntil: "load" }); await p.waitForSelector("[data-cbc='K4'] input[data-box]", { timeout: 20000 });
    check(`${tag}: email box and invitation on the join form`, (await p.locator("#mail").count()) === 1 && /Your email ID/.test(await p.locator("body").innerText()));
    await p.screenshot({ path: `${OUT}/join-${tag}.png` });
    if (n % 3 === 1) {
      const bx = p.locator("[data-cbc='K4'] input[data-box]"); for (let i = 0; i < await bx.count(); i++) await bx.nth(i).check({ force: true }).catch(() => {});
      await p.fill("#ph", "98" + String(10000000 + n * 7919).slice(0, 8)); await p.fill("#mail", `p${n}@sample-co.in`); await p.click("#go");
      await p.waitForFunction(() => window.__rt && window.__rt.pid, null, { timeout: 20000 }).catch(() => {});
      await p.waitForSelector("#ckokn", { timeout: 15000 }).catch(() => {});
      if (await p.$("#ckokn")) { await p.check("#ckokn", { force: true }); await p.check("#ckokm", { force: true }); await p.fill("#ckcode", (await p.textContent("#ckshow")).trim()); await p.click("#cksubmit"); await sleep(3000); }
      await p.waitForFunction(() => /family passes/i.test(document.body.innerText), null, { timeout: 170000 }).catch(() => {});
      const t = await p.locator("body").innerText();
      check(`${tag}: Family Passes card with the agreed words`, /family passes/i.test(t) && /You have 5 passes: 1 for you and 4 for your family and friends/.test(t) && /up to 15 minutes before the game begins/.test(t), t.slice(0, 160));
      const card = p.locator(".zinvite:has(.zfamintro)").first(); if (await card.count()) { await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: `${OUT}/card-${tag}.png` }); }
      check(`${tag}: the page carries its look (html data-pt = ${look})`, (await p.evaluate(() => document.documentElement.getAttribute("data-pt"))) === look);
    }
    check(`${tag}: no sideways scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    check(`${tag}: no script errors`, errs.length === 0, errs.join(";"));
  } catch (e) { check(`${tag}: the run`, false, String(e).slice(0, 160)); }
  await ctx.close();
}
// a LIST game: no email box (the public settings say open: false), the join form still works
{
  const id2 = `FL-${stamp.toUpperCase()}`;
  await api("POST", "/api/z", { id: id2, startRound: roundAt(Date.now() + 3 * 3600 * 1000), callSeconds: 9, cap: 10, demo: true, name: "Diwali party", whoCanJoin: "list" }, tok);
  console.log("publish list game", (await api("POST", `/api/z/${id2}/publish`, { email, phone: "9650397480", ...consent("K1") }, tok)).s);
  for (const w of [360, 1280]) { const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }); const p = await ctx.newPage();
    await p.goto(`${BASE}/z.html?e=${id2}`, { waitUntil: "load" }); await p.waitForTimeout(2500);
    const t = await p.locator("body").innerText();
    check(`list game ${w}: no email box, the notice still names it conditionally`, (await p.locator("#mail").count()) === 0 && !/Your email ID/.test(t), t.slice(0, 120));
    await p.screenshot({ path: `${OUT}/list-${w}.png` }); await ctx.close(); }
}
await browser.close(); console.log(bad ? `FAILED ${bad}` : "ALL PASSED"); process.exit(bad ? 1 : 0);
