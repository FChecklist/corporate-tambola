// node tools/ui-sizes.mjs [--out C:/ct/test-sites/data/ui/sizes]
// The SIZE CHECK of the owner's standing rule: the participant page, the organizer's console and the board screen each have two designs (laptop, phone app) and nothing may be cut off, hidden behind the edge
// or need sideways scrolling. A real Chrome (Playwright, the sim stack on this laptop; nothing leaves it) opens each page at every width and checks:
//   no sideways scroll (the document is not wider than the screen) | the ticket shows all 27 cells inside the screen | the Claim button is on the screen and nothing covers it
//   | the counter and the quiet timer are on the screen | the board's panels and buttons are reachable. A screenshot per page and size is saved.
// FALSIFICATION: the same checks are run once more with a deliberately too-wide element added; the run fails unless every one of those checks reports it.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as H from "./sim2/lib/index.mjs";

const out = (() => { const i = process.argv.indexOf("--out"); return i >= 0 ? process.argv[i + 1] : "C:/ct/test-sites/data/ui/sizes"; })();
mkdirSync(out, { recursive: true });
const SIZES = [[320, 640, "phone"], [360, 740, "phone"], [390, 844, "phone"], [430, 932, "phone"], [768, 1024, "tablet"], [1024, 768, "tablet"], [1280, 800, "laptop"], [1440, 900, "laptop"], [1920, 1080, "laptop"], [667, 375, "phone-landscape"]];
const results = []; let stack, browser;
const note = (page, size, name, ok, detail = "") => { results.push({ page, size, name, ok: !!ok, detail }); if (!ok) console.log(`FAIL ${page} ${size} ${name} ${detail}`); };

/** the checks that run inside the page */
const inPage = (kind) => {
  const iw = window.innerWidth, ih = window.innerHeight, de = document.documentElement;
  const inside = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= -0.5 && r.right <= iw + 0.5; };
  const res = { sideways: de.scrollWidth <= iw + 1 && document.body.scrollWidth <= iw + 1, scrollWidth: de.scrollWidth, innerWidth: iw };
  if (kind === "player") {
    const cells = Array.from(document.querySelectorAll(".zticket > div"));
    res.cells = cells.length; res.cellsInside = cells.length > 0 && cells.every(inside);
    const cc = document.getElementById("calledcount"), q = document.getElementById("quietcount"), big = document.getElementById("big");
    res.counter = inside(cc) && inside(big); res.timer = !q || inside(q);
    const btn = document.querySelector("#claimbar .zbigclaim");
    if (btn) { const r = btn.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); res.claim = inside(btn) && r.top >= 0 && r.bottom <= ih + 1 && (top === btn || btn.contains(top)); res.claimTall = r.height >= 60; } else res.claim = null;
  } else if (kind === "console") {
    res.live = inside(document.getElementById("livebar")); res.counter = !document.getElementById("numcount") || inside(document.getElementById("numcount"));
  } else if (kind === "board") {
    const panels = document.getElementById("panels"); res.panels = !!panels && inside(panels);
    const btns = Array.from(document.querySelectorAll("#bp-controls button")); res.buttons = btns.length > 0 && btns.every(inside);
    res.log = inside(document.getElementById("bp-logbox")); res.counter = inside(document.getElementById("storyline"));
  }
  return res;
};
const verdict = (kind, r) => ({ "no sideways scroll": r.sideways, ...(kind === "player" ? { "ticket: all 27 cells on the screen": r.cells === 27 && r.cellsInside, "counter and number on the screen": r.counter, "quiet timer on the screen": r.timer, ...(r.claim === null ? {} : { "claim button on the screen, not covered": r.claim, "claim button at least 60 px high": r.claimTall }) } : {}), ...(kind === "console" ? { "live bar on the screen": r.live, "counter on the screen": r.counter } : {}), ...(kind === "board" ? { "panels on the screen": r.panels, "control buttons reachable": r.buttons, "log reachable": r.log, "story line on the screen": r.counter } : {}) });

try {
  stack = await H.startStack({ build: true }); await stack.reset();
  await H.clock.set(Date.UTC(2026, 9, 20, 10, 0, 0)); // the game is made on a day before the check-in rule, so the player page opens straight into the game (the check-in has its own tests)
  const track = await H.trackClock(); browser = await H.launchChrome(); const open = H.opener(browser, { track });
  const email = "sim+sizes@example.com"; const org = await H.Organizer.signUp(email);
  const g = await org.createGame({ leadMs: 20 * 60_000, cfg: { tickets: 1 } }); await org.publish(g.id); await org.pay(g.id);
  await H.clock.set(g.startMs + 6 * 60_000); await track.refresh(); // the game is running: a few numbers are out
  const base = H.SIM;
  const run = async (falsify) => {
    for (const [w, h, label] of SIZES) {
      const size = `${w}x${h}`;
      const device = w < 700 || (w === 667) ? "mobile" : "laptop";
      // ---- the participant page
      { const c = await open({ device, w, h }); const p = c.page;
        await p.goto(`${base}/z?e=${g.id}`); await p.waitForSelector("#ph", { timeout: 20000 }); await p.fill("#ph", (falsify ? "9833" : "9822") + String(100000 + w)); await p.fill("#nm", "Asha"); for (const b of await p.$$("input[type=checkbox]")) { try { await b.check({ timeout: 2000 }); } catch { /* not a consent box */ } } await p.click("#go");
        try { await p.waitForSelector("#big", { timeout: 30000 }); } catch (e) { console.log("PAGE TEXT:", (await p.innerText("body")).replace(/\s+/g, " ").slice(0, 600)); await p.screenshot({ path: join(out, "debug-player.png") }); throw e; } await p.waitForTimeout(1500);
        await p.evaluate(() => { const rt = window.__rt, real = rt.view.bind(rt); rt.view = () => ({ ...real(), late: null, phase: "play", paused: false, locked: false, claimNow: ["early5"], claimOpen: ["early5"], claimable: ["early5"], pressed: [], claimed: [] }); }); // show the claim button the way it looks when a prize is ready
        await p.waitForSelector("#claimbar .zbigclaim", { timeout: 15000 });
        if (falsify) await p.evaluate(() => { const d = document.createElement("div"); d.id = "toowide"; d.style.cssText = "width:3000px;height:4px;background:red"; document.body.appendChild(d); });
        const r = await p.evaluate(inPage, "player"); const v = verdict("player", r);
        if (!falsify) { for (const [k, ok] of Object.entries(v)) note("player", size, k, ok, JSON.stringify(r)); await p.screenshot({ path: join(out, `player-${size}-${label}.png`), fullPage: false }); }
        else note("player", size, "FALSIFY: a too-wide element is detected", v["no sideways scroll"] === false);
        await c.close(); }
      if (falsify) { if (w === 360) { /* one size is enough for the other pages' falsification */ } }
      // ---- the organizer's console
      { const c = await open({ device, w, h, token: org.token }); const p = c.page;
        await p.goto(`${base}/zc?e=${g.id}`); await p.waitForSelector("#livebar", { timeout: 30000 }); await p.waitForTimeout(1500);
        if (falsify) await p.evaluate(() => { const d = document.createElement("div"); d.style.cssText = "width:3000px;height:4px"; document.body.appendChild(d); });
        const r = await p.evaluate(inPage, "console"); const v = verdict("console", r);
        if (!falsify) { for (const [k, ok] of Object.entries(v)) note("console", size, k, ok, JSON.stringify(r)); await p.screenshot({ path: join(out, `console-${size}-${label}.png`) }); }
        else note("console", size, "FALSIFY: a too-wide element is detected", v["no sideways scroll"] === false);
        await c.close(); }
      // ---- the board screen
      { const c = await open({ device, w, h, token: org.token }); const p = c.page;
        await p.goto(`${base}/board.html?e=${g.id}#k=${org.token}`); await p.waitForSelector("#bp-controls button", { timeout: 40000 }); await p.waitForTimeout(1500);
        if (falsify) await p.evaluate(() => { const d = document.createElement("div"); d.style.cssText = "width:3000px;height:4px"; document.body.appendChild(d); });
        const r = await p.evaluate(inPage, "board"); const v = verdict("board", r);
        if (!falsify) { for (const [k, ok] of Object.entries(v)) note("board", size, k, ok, JSON.stringify(r)); await p.screenshot({ path: join(out, `board-${size}-${label}.png`), fullPage: true }); }
        else note("board", size, "FALSIFY: a too-wide element is detected", v["no sideways scroll"] === false);
        await c.close(); }
      console.log(`${falsify ? "falsify" : "checked"} ${size}`);
    }
  };
  await run(false);
  const before = results.length; await run(true);
  const fals = results.slice(before);
  const falsOk = fals.length > 0 && fals.every((x) => x.ok);
  const real = results.slice(0, before), failed = real.filter((x) => !x.ok);
  const summary = { sizes: SIZES.map((s) => `${s[0]}x${s[1]}`), checks: real.length, failed: failed.length, falsification: falsOk ? "every too-wide element was caught" : "NOT CAUGHT: the check is blind", failures: failed.slice(0, 40) };
  writeFileSync(join(out, "sizes-result.json"), JSON.stringify({ summary, results }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  process.exitCode = failed.length === 0 && falsOk ? 0 : 1;
} catch (e) { console.error("size check could not finish:", e && e.stack || e); process.exitCode = 2; }
finally { try { await browser?.close(); } catch { /* gone */ } try { stack?.stop(); } catch { /* gone */ } }
