// node tools/claim-probe.mjs [--checkin]   Ground truth for "no claim was accepted": ONE real Chrome phone plays a game on the sim stack, taps each new number and presses the Claim
// buttons the page shows, like a person. At the end it prints what /claims, /results and the claim table hold. With --checkin the game is made after the check-in rule (the page asks for the code first).
import * as H from "./sim2/lib/index.mjs";
const checkin = process.argv.includes("--checkin");
let stack, browser;
try {
  stack = await H.startStack({ build: false }); await stack.reset();
  await H.clock.set(checkin ? Date.UTC(2026, 9, 27, 10, 0, 0) : Date.UTC(2026, 9, 20, 10, 0, 0));
  const track = await H.trackClock(); browser = await H.launchChrome(); const open = H.opener(browser, { track });
  const org = await H.Organizer.signUp("sim+probe@example.com");
  const g = await org.createGame({ leadMs: 20 * 60_000, cfg: { tickets: 1 } }); await org.publish(g.id); await org.pay(g.id);
  const c = await open({ device: "mobile" }), p = c.page;
  await p.goto(`${H.SIM}/z?e=${g.id}`); await p.waitForSelector("#ph", { timeout: 20000 });
  await p.fill("#ph", "9822100001"); await p.fill("#nm", "Asha");
  for (const b of await p.$$("input[type=checkbox]")) { try { await b.check({ timeout: 2000 }); } catch {} }
  await p.click("#go");
  await p.waitForFunction(() => window.__rt && window.__rt.pid, null, { timeout: 30000 });
  p.on("response", async (r) => { if (/\/(claims|bogey|checkin)/.test(r.url()) && r.request().method() === "POST") console.log("POST", r.url().replace(/^.*\/api/, "/api"), r.status(), (await r.text().catch(() => "")).slice(0, 160), "req:", (r.request().postData() || "").slice(0, 160)); });
  p.on("console", (m) => { if (/^CLAIMRESULT/.test(m.text())) console.log(m.text().slice(0, 300)); if (m.type() === "error" && !/404/.test(m.text())) console.log("console.error", m.text().slice(0, 160)); });
  const adv = async (ms) => { await H.clock.advance(ms); track.bump(ms); await c.ctx.clock.runFor(ms); await new Promise((r) => setTimeout(r, 80)); };
  await adv(g.startMs - (await H.clock.now()) - 4 * 60_000); // 4 minutes before the start
  if (checkin) {
    await adv(2 * 60_000);
    try {
      await p.waitForSelector("#ckshow", { timeout: 15000 });
      const code = (await p.innerText("#ckshow")).trim(); await p.check("#ckokn"); await p.check("#ckokm"); await p.fill("#ckcode", code);
      const btn = await p.$("#cksubmit"); if (btn) await btn.click(); else console.log("no check-in submit button found");
      await adv(3000); console.log("after check-in, body:", (await p.innerText("body")).replace(/\s+/g, " ").slice(0, 200));
    } catch (e) { console.log("check-in step failed:", String(e).slice(0, 200)); }
  }
  await adv(g.startMs + 2 * 60_000 - (await H.clock.now()) + 1000);
  await p.evaluate(() => { const o = window.__rt.claim.bind(window.__rt); window.__rt.claim = async (k) => { const r = await o(k); console.log("CLAIMRESULT " + k + " " + JSON.stringify(r) + " view.claimOpen=" + JSON.stringify(window.__rt.view().claimOpen)); return r; }; });
  const seen = new Set(); const log = []; let claimClicks = 0;
  for (let i = 0; i < 300; i++) {
    await adv(3000);
    const v = await p.evaluate(() => { const r = window.__rt.view(); return { phase: r.phase, n: r.log.filter((x) => x > 0).length, last: r.log[r.log.length - 1], open: r.claimOpen, now: r.claimNow, results: r.results.length }; });
    if (i % 15 === 0) console.log("step", i, JSON.stringify(v), await p.evaluate(() => ({ cells: document.querySelectorAll("[data-tap]").length, marked: document.querySelectorAll("[data-tap].m").length, claimBtns: document.querySelectorAll("[data-claim]").length })));
    if (v.phase === "ended") break;
    { const called = await p.evaluate(() => window.__rt.view().log.filter((x) => x > 0)); for (const n of called) { const cell = await p.$(`[data-tap="${n}"]:not(.m)`); if (cell) { await cell.click({ timeout: 1500 }).catch((e) => { if (i % 15 === 0) console.log("tap failed", n, String(e).slice(0, 80)); }); } } }
    for (let guard = 0; guard < 4; guard++) { const loc = p.locator("[data-claim]:visible").first(); if (!(await loc.count())) break; const k = await loc.getAttribute("data-claim").catch(() => null); claimClicks++; const t0 = Date.now(); const ok = await loc.click({ timeout: 3000 }).then(() => "clicked", (e) => "FAILED " + String(e).split("\n")[0].slice(0, 90)); console.log("click", k, ok, (Date.now() - t0) + "ms", "n=" + v.n); log.push({ n: v.n, k }); await new Promise((r) => setTimeout(r, 400)); }
  }
  await adv(30000);
  const claims = await H.call("GET", `/api/z/${g.id}/claims`), results = await H.call("GET", `/api/z/${g.id}/results`);
  const rows = await (await fetch(`${H.SIM}/__sim/sql`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sql: "SELECT pattern, idx, at_ms FROM claim WHERE eid=?", params: [g.id] }) })).json();
  console.log(JSON.stringify({ checkin, claimClicks, firstClicks: log.slice(0, 8), claimsStatus: claims.status, claimsBody: JSON.stringify(claims.body).slice(0, 300), resultsBody: JSON.stringify(results.body).slice(0, 300), claimRows: rows }, null, 1));
  console.log("PAGE:", (await p.innerText("body")).replace(/\s+/g, " ").slice(0, 400));
} catch (e) { console.error("probe failed:", e && e.stack || e); process.exitCode = 2; }
finally { try { await browser?.close(); } catch {} try { stack?.stop(); } catch {} }
