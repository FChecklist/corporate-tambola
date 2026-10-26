// Waits for the end-of-game report e-mail of a game on the LOCAL test copy (it goes out a few minutes after the game ends; the server's lazy tick sends it when the site is hit),
// opens the report link in a real page, and checks the report against what the phones saw. Returns { ok, notes, data }.
import { DatabaseSync } from "node:sqlite";
const DB = "C:/ct/test-sites/data/tambola-test.sqlite";
const q = (sql, ...a) => { const db = new DatabaseSync(DB, { readOnly: true }); try { return db.prepare(sql).all(...a); } finally { db.close(); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitForReport(BASE, id, maxMin = 12) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMin * 60000) {
    const rows = q("SELECT body FROM outbox WHERE body LIKE '%report.html?e=%' ORDER BY id DESC LIMIT 20");
    for (const r of rows) { const m = r.body.match(/report\.html\?e=([A-Za-z0-9_-]+)&k=([0-9a-f]+)/); if (m && m[1] === id) return { eid: m[1], k: m[2], waitedSec: Math.round((Date.now() - t0) / 1000) }; }
    // the server's own record: the report was e-mailed (state "sent" and a mail event for this game's report). The link itself is not always kept in the test outbox of a big game.
    try { const l = q("SELECT report_state FROM life WHERE eid=?", id)[0], m = q("SELECT outcome FROM mail_event WHERE subject LIKE ?", `%engagement report ${id}:%`)[0]; if (l && l.report_state === "sent" && m && /^sent/.test(m.outcome)) return { eid: id, k: null, viaDb: true, waitedSec: Math.round((Date.now() - t0) / 1000) }; } catch { /* the outbox check above still stands */ }
    await fetch(BASE + "/api/mode").catch(() => {}); // any hit lets the lazy tick run
    await sleep(15000);
  }
  return null;
}
export async function checkReport(BASE, link, expect, page) {
  const out = { notes: [], checks: [] };
  const check = (n, ok, d = "") => out.checks.push({ n, ok: !!ok, d: String(d).slice(0, 250) });
  const base = await (await fetch(`${BASE}/api/report/${link.eid}?k=${link.k}&part=base`)).json().catch(() => ({}));
  const d = base.base ?? base.data ?? base; out.data = { endReason: d.endReason, numbersCalled: d.numbersCalled, rounds: d.rounds, callSeconds: d.callSeconds, wasHeld: d.wasHeld, prizes: (d.prizes || []).map((p) => [p.label, (p.winners || []).length]), firstNumberMs: d.firstNumberMs, endMs: d.endMs };
  check("the report link opens and has the game's data", !!d.engagementId, JSON.stringify(Object.keys(d)).slice(0, 120));
  check("the report is not 'did not start'", d.wasHeld === false, String(d.wasHeld));
  if (expect.numbers !== undefined) check(`numbers called in the report (${d.numbersCalled}) match what the phones saw (${expect.numbers}) within 1`, Math.abs((d.numbersCalled ?? -9) - expect.numbers) <= 1, `${d.numbersCalled} vs ${expect.numbers}`);
  if (expect.numbers !== undefined && expect.numbers < 90) check("the report does not claim 'All 90 numbers were called' for a game that ended earlier", !/All 90/.test(d.endReason || ""), d.endReason);
  check(`the report's call speed is ${expect.callSeconds} s`, d.callSeconds === expect.callSeconds, String(d.callSeconds));
  if (expect.winners !== undefined) check("the report's winners count equals the phones' results", (d.prizes || []).reduce((s, p) => s + (p.winners || []).length, 0) === expect.winners, JSON.stringify(out.data.prizes));
  if (page) { await page.goto(`${BASE}/report.html?e=${link.eid}&k=${link.k}`, { waitUntil: "load" }); await sleep(4000); out.pageText = (await page.evaluate(() => document.body.innerText).catch(() => "")).slice(0, 900); check("the report page shows the game", /Numbers called|Prizes|winners/i.test(out.pageText), out.pageText.slice(0, 120)); }
  out.ok = out.checks.every((c) => c.ok); return out;
}
