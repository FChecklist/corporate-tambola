// 1.6.8: screenshots of the real build for the brochure and the organizer manual (phone and laptop). node tools/sim2/pdf-shots.mjs [baseUrl] [outDir]
// Needs the local server (bun run apps/edge/src/local.ts with TEST_MODE=1) and the heavy lock. Shots: landing top, console games list, setup steps, the invite step, a published demo game
// (waiting room, live ticket with the claim buttons), the report page text. Names are stable: the PDF sources point at them.
import { createRequire } from "node:module";
const { chromium } = createRequire("C:/ct/ct/dpdp-app/package.json")("playwright");
import { mkdirSync, readFileSync } from "node:fs";
const BASE = (process.argv[2] || "http://localhost:8821").replace(/\/$/, ""), OUT = process.argv[3] || "C:/ct/test-sites/data/ui/housie-header-logo/pdf";
mkdirSync(OUT, { recursive: true });
const C = JSON.parse(readFileSync(new URL("../../apps/edge/src/consent-text.json", import.meta.url), "utf8"));
const consent = (k) => ({ consent: { v: C.version, boxes: Object.keys(C[k]) } });
const GENESIS = 1692803367, roundAt = (ms) => Math.floor((ms / 1000 - GENESIS) / 3) + 1, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IP = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const api = async (m, p, b, k) => { const r = await fetch(BASE + p, { method: m, headers: { "content-type": "application/json", "cf-connecting-ip": IP, ...(k ? { "x-organizer": k } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch {} return { ok: r.ok, s: r.status, j }; };
const stamp = Date.now().toString(36).slice(-5), email = `demo.${stamp}@sample-co.in`, id = `PD-${stamp.toUpperCase()}`;
const st = await api("POST", "/api/start", { email, ...consent("K2") }); const tok = st.j.token;
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const dev = { phone: { width: 390, height: 844, mobile: true }, laptop: { width: 1280, height: 800, mobile: false } };
const ctxFor = async (d, org) => { const c = await browser.newContext({ viewport: { width: d.width, height: d.height }, isMobile: d.mobile, hasTouch: d.mobile, deviceScaleFactor: 2 }); if (org) await c.addInitScript((t) => { try { localStorage.setItem("ctz-org", t); sessionStorage.setItem("ctz-org", t); } catch {} }, tok); return c; };
const shot = async (p, name, o = {}) => { await p.screenshot({ path: `${OUT}/${name}.png`, ...o }); console.log("shot", name); };
try {
  if (!process.env.SKIP_DRAFT) {
  // landing page (the new top menu)
  for (const [tag, d] of Object.entries(dev)) { const c = await ctxFor(d, false), p = await c.newPage(); await p.goto(BASE + "/", { waitUntil: "load" }); await sleep(900); await shot(p, `landing-${tag}`); await c.close(); }
  // a draft game, then the console
  const startRound = roundAt(Date.now() + 3 * 3600 * 1000);
  await api("POST", "/api/z", { id, startRound, callSeconds: 9, cap: 250, name: "Diwali party" }, tok);
  for (const [tag, d] of Object.entries(dev)) {
    const c = await ctxFor(d, true), p = await c.newPage(); await p.goto(`${BASE}/zc.html?e=${id}`, { waitUntil: "load" });
    await p.waitForSelector("#sec1", { timeout: 20000 }).catch(() => {}); await sleep(2500);
    await shot(p, `console-${tag}-top`);
    for (const n of [1, 2, 3, 4, 6, 7]) { // one screen per step: the step scrolled to the top of the window
      const b = await p.$(`[data-open="${n}"]`); if (!b) { console.log("no step", n); continue; }
      await b.click().catch(() => {}); await sleep(900); await p.evaluate((k) => { const e = document.getElementById("sec" + k); if (e) e.scrollIntoView({ block: "start" }); window.scrollBy(0, -8); }, n); await sleep(400);
      await shot(p, `console-${tag}-step${n}`);
    }
    // rehearsals sit under "Check and publish" (step 7)
    await p.evaluate(() => { const h = [...document.querySelectorAll("h3,h4,b,div")].find((e) => /^Rehearsals$/.test((e.textContent || "").trim())); if (h) h.scrollIntoView({ block: "start" }); }); await sleep(400); await shot(p, `console-${tag}-rehearsals`);
    await c.close();
  }
  }
  // a published demo game with one player: waiting room, the live ticket with the Claim buttons, the organizer's game-day view
  const id2 = `PL-${stamp.toUpperCase()}`, start2 = roundAt(Date.now() + 110 * 1000), first = (GENESIS + (start2 - 1) * 3) * 1000 + 120000;
  await api("POST", "/api/z", { id: id2, startRound: start2, callSeconds: 9, cap: 10, demo: true, name: "Diwali party" }, tok);
  await api("PATCH", `/api/z/${id2}/settings`, { rewards: [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "Mug" }, { pattern: "top", scope: "ticket", ordinal: 1, text: "Voucher" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "Hamper" }], whoCanJoin: "anyone" }, tok);
  const pub = await api("POST", `/api/z/${id2}/publish`, { email, phone: "9650397480", ...consent("K1") }, tok); console.log("publish", pub.s);
  const players = {};
  for (const [tag, d] of Object.entries(dev)) {
    const c = await ctxFor(d, false), p = await c.newPage(); await p.goto(`${BASE}/z.html?e=${id2}`, { waitUntil: "load" });
    await p.waitForSelector("[data-cbc='K4'] input[data-box]", { timeout: 20000 }); const bx = p.locator("[data-cbc='K4'] input[data-box]"); for (let i = 0; i < await bx.count(); i++) await bx.nth(i).check({ force: true }).catch(() => {});
    await p.fill("#ph", tag === "phone" ? "9811100301" : "9811100302"); await p.fill("#nm", "Meera"); await p.click("#go"); await p.waitForFunction(() => window.__rt && window.__rt.pid, null, { timeout: 20000 }); await sleep(1500);
    await shot(p, `play-${tag}-waiting`); players[tag] = p;
    if (await p.$("#ckokn")) { await p.check("#ckokn", { force: true }); await p.check("#ckokm", { force: true }); await p.fill("#ckcode", (await p.textContent("#ckshow")).trim()); await shot(p, `play-${tag}-checkin`); await p.click("#cksubmit"); await sleep(2500); }
  }
  while (Date.now() < first + 9000 * 6) await sleep(1000);
  for (const [tag, p] of Object.entries(players)) { // tap the numbers called so far, then the ticket shows the live bar and the Claim buttons
    const v = await p.evaluate(() => window.__rt.view()); for (const n of v.log.slice(-6)) { const cell = await p.$(`[data-tap="${n}"]:not(.m)`); if (cell) await cell.click().catch(() => {}); } await sleep(800);
    await shot(p, `play-${tag}-live`);
  }
  { const c = await ctxFor(dev.phone, true), p = await c.newPage(); await p.goto(`${BASE}/zc.html?e=${id2}`, { waitUntil: "load" }); await p.waitForSelector("#sec1", { timeout: 20000 }).catch(() => {}); await sleep(2500);
    const b = await p.$('[data-open="9"]'); if (b) { await b.click().catch(() => {}); await sleep(900); await p.evaluate(() => { const e = document.getElementById("sec9"); if (e) e.scrollIntoView({ block: "start" }); }); await sleep(500); }
    await shot(p, "console-phone-gameday"); const b10 = await p.$('[data-open="10"]'); if (b10) { await b10.click().catch(() => {}); await sleep(900); await p.evaluate(() => { const e = document.getElementById("sec10"); if (e) e.scrollIntoView({ block: "start" }); }); await sleep(500); await shot(p, "console-phone-after"); } await c.close(); }
  { const c = await ctxFor(dev.laptop, true), p = await c.newPage(); await p.goto(`${BASE}/zc.html?e=${id2}`, { waitUntil: "load" }); await p.waitForSelector("#sec1", { timeout: 20000 }).catch(() => {}); await sleep(2500);
    const b = await p.$('[data-open="9"]'); if (b) { await b.click().catch(() => {}); await sleep(900); await p.evaluate(() => { const e = document.getElementById("sec9"); if (e) e.scrollIntoView({ block: "start" }); }); await sleep(500); } await shot(p, "console-laptop-gameday"); await c.close(); }
} finally { await browser.close(); }
console.log("id", id);
