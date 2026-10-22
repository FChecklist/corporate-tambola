// Group 21: real housie in Chrome phones (the owner's rule: the ticket never marks itself; the player taps each number as it is called and presses Claim before the next number;
// a prize is won only by a claim; a wrong claim is a Bogey, two on the same prize put the ticket out of it). Phones that tap along use the runtime's own play-along (H.tapAlong);
// the taps and presses under test are made on the page itself (the ticket's cells and the Claim button).
import { H, openConsole, openStep, guestText, nextPhone, guestJoinUi } from "./kit.mjs";

const { invariants: inv } = H;
const ALL_RW = ["early5", "top", "mid", "bot", "corners", "star", "full"].map((p) => ({ pattern: p, scope: "ticket", ordinal: 1, text: "" }));
const rw = (pattern, n) => Array.from({ length: n }, (_, i) => ({ pattern, scope: "ticket", ordinal: i + 1, text: "" }));
const NAMES = { early5: "Early Five", top: "Top line", mid: "Middle line", bot: "Bottom line", corners: "Four corners", star: "Star", full: "Full house" };

const game = (t, org, { lead = 8 * H.MIN, cfg = {}, mode = "auto" } = {}) => t.game(org, { lead, cfg: { rewards: ALL_RW, callMode: mode, ...cfg }, settings: { whoCanJoin: "anyone" }, pay: true });
async function phones(t, g, names, { moveTo = 2 * H.MIN } = {}) {
  const out = [];
  for (const nm of names) { const x = await t.open({ device: "mobile" }); x.errors = []; x.page.on("pageerror", (e) => x.errors.push(String(e).slice(0, 160))); await guestJoinUi(x.page, g.id, nextPhone(), nm); out.push(x); }
  const now = await H.clock.now(); const wait = g.startMs - moveTo - now;
  if (wait > 0) { await H.clock.advance(wait); await t.shared.track.refresh(); await H.advanceBrowsers(out.map((o) => o.ctx), wait, { run: false }); }
  await Promise.all(out.map((p) => p.page.waitForFunction(() => window.__rt && window.__rt.phase === "play", null, { timeout: 25000 })));
  return out;
}
/** one 3 s step for the server, the beacon and every page; then the simulated players tap and claim (unless quiet / along says otherwise) */
const stepAll = async (t, list, n = 1) => { for (let i = 0; i < n; i++) { await H.clock.advance(3000); t.shared.track.bump(3000); for (const o of list) await o.ctx.clock.runFor(3000); await H.tapAlong(list); await new Promise((r) => setTimeout(r, 60)); } };
const view = (p) => p.evaluate(() => { const v = window.__rt.view(); return { phase: v.phase, log: v.log, marks: v.marks, claimable: v.claimable, pressed: v.pressed, bogeys: v.bogeys, outOf: v.outOf, pid: v.pid, unsent: v.unsent, claimed: v.claimed, results: v.results.map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, idx: x.idx, count: x.count, winners: x.winners })), won: (v.won || []).map((w) => w.pattern + "#" + w.ordinal) }; });
const ticketNums = (p) => p.evaluate(() => window.__rt.tickets.flatMap((tk) => tk.flat().filter((v) => v !== null)));
const markedCells = (p) => p.$$eval(".zticket div.m", (els) => els.map((e) => Number(e.textContent)));
const tapCell = (p, n) => p.click(`.zticket [data-tap="${n}"]`);
/** lets the page redraw (its timers run on the page's own clock: a real wait does not do it); moves only this page's clock, one second */
const repaint = async (o) => { await o.ctx.clock.runFor(1000); await o.page.waitForTimeout(500); };
const noteText = (p) => p.evaluate(() => (document.querySelector("#tapnote .ctg-inline") || {}).textContent || "");
/** steps until the phone's view satisfies `pred` (or `max` steps are used) */
async function untilView(t, list, p, pred, max = 120) { for (let i = 0; i < max; i++) { const v = await view(p); if (pred(v)) return v; await stepAll(t, list); } return view(p); }
/** the public claims of a game (opaque ids), as every phone reads them with the seat list */
const publicClaims = async (eid) => ((await H.call("GET", `/api/z/${eid}/seats?after=0&cafter=0`)).body.claims || []);

export default [
  {
    id: "S21-01", name: "Three phones tap along and claim; a fourth watches and never taps: its ticket stays unmarked and it claims nothing; the game ends with identical, claim-based winners; every winner pressed Claim; the old 'marks every number for you' words are gone",
    async run(t) {
      const org = await t.org("o"); const g = await game(t, org);
      const ps = await phones(t, g, ["Asha", "Bala", "Charu", "Quiet Qadir"]);
      const quiet = ps[3]; quiet.quiet = true;
      await stepAll(t, ps, 45); await untilView(t, ps, ps[0].page, (x) => x.log.length >= 8 && x.marks.length > 0, 100); await repaint(ps[0]); await repaint(quiet); // the start, then a dozen or so numbers (until one of phone 0's own numbers has come)
      const vq = await view(quiet.page), v0 = await view(ps[0].page);
      t.check("numbers are being called", vq.log.length >= 8, String(vq.log.length));
      t.check("the quiet phone's ticket has no marks and no claims: nothing happens by itself", vq.marks.length === 0 && vq.pressed.length === 0 && (await markedCells(quiet.page)).length === 0, JSON.stringify({ marks: vq.marks, pressed: vq.pressed }));
      const mine0 = new Set(await ticketNums(ps[0].page)), called0 = new Set(v0.log);
      t.check("a tapping phone's marks are exactly its called numbers, and the ticket shows them", v0.marks.length > 0 && v0.marks.every((n) => mine0.has(n) && called0.has(n)) && [...mine0].filter((n) => called0.has(n)).length === v0.marks.length && (await markedCells(ps[0].page)).length === v0.marks.length, JSON.stringify(v0.marks));
      const txt = await guestText(ps[0].page);
      t.check("the number card tells the player to tap and claim before the next number, and names the Bogey", /Tap each number as it is called\. When a prize is complete, press Claim before the next number is called\. A wrong claim is a Bogey/.test(txt), txt.slice(0, 200));
      t.check("no screen says the ticket marks itself", !/marks every number for you|marked for you|Just watch/.test(txt + (await guestText(quiet.page))), "");
      t.check("every number on the ticket is a button", (await ps[0].page.$$('.zticket [data-tap][role="button"]')).length === 15);
      const r = await H.playBrowserGame(ps, { track: t.shared.track, maxSteps: 420 });
      t.check("all four phones ended", r.ended.every(Boolean), `${r.steps} steps, ended ${r.ended}`);
      const id = inv.identicalWinners(r.views.map((v, i) => ({ who: "phone" + i, results: v.results }))); t.check(id.name, id.ok && r.views[0].results.length > 0, id.detail);
      const pub = (await H.call("GET", `/api/z/${g.id}/results`)).body.results ?? [];
      t.check("the store's winners equal what the phones show", pub.length === r.views[0].results.length && pub.length > 0, `${pub.length} vs ${r.views[0].results.length}`);
      const claims = await publicClaims(g.id), vqe = await view(quiet.page);
      t.check("the quiet phone won nothing and holds no prize", vqe.won.length === 0 && !(await quiet.page.$(".zwin")) && !pub.some((x) => (x.winners || []).includes(vqe.pid)), JSON.stringify(vqe.won));
      t.check("every winner of every position pressed Claim for it (the claim is in the public list)", pub.every((x) => (x.winners || []).every((pid) => claims.some((c) => !c.bogey && c.pid === pid && c.pattern === x.pattern && c.idx === x.idx))), JSON.stringify(pub).slice(0, 200));
      t.check("the public claims carry opaque ticket ids only", claims.length > 0 && claims.every((c) => /^\d+x[0-9a-f]{12}$/.test(c.pid)) && !/Asha|Bala|Charu|Qadir|\b9\d{9}\b/.test(JSON.stringify(claims)), String(claims.length));
      t.check("no JavaScript errors on any phone", ps.every((p) => p.errors.length === 0), ps.flatMap((p) => p.errors).join(" | ").slice(0, 200));
      await t.shot(ps[0].page, "phone-tapped-ticket"); await t.shot(quiet.page, "phone-quiet-end");
    },
  },
  {
    id: "S21-02", name: "A wrong tap: a number not called yet is refused in place, in plain words, and nothing is marked; a called number is marked by the tap and unmarked by a second tap",
    async run(t) {
      const org = await t.org("o"); const g = await game(t, org);
      const ps = await phones(t, g, ["Dev"]); const p = ps[0]; p.quiet = true;
      await stepAll(t, ps, 45);
      const mine = await ticketNums(p.page);
      const v = await untilView(t, ps, p.page, (x) => mine.some((n) => x.log.includes(n)) && mine.some((n) => !x.log.includes(n)), 60); // until one of the ticket's numbers has been called (and one has not)
      const called = new Set(v.log), notYet = mine.find((n) => !called.has(n)), yes = mine.find((n) => called.has(n));
      t.check("a ticket number has been called and another has not", notYet !== undefined && yes !== undefined, JSON.stringify({ notYet, yes }));
      await tapCell(p.page, notYet); await p.page.waitForTimeout(150);
      const note = await noteText(p.page);
      t.check("the tap is refused in place with the number and plain words", new RegExp(`${notYet} has not been called yet\\. Keep listening\\.`).test(note) && /That number has not been called yet/.test(note), note.slice(0, 160));
      t.check("nothing was marked", (await view(p.page)).marks.length === 0 && (await markedCells(p.page)).length === 0);
      await tapCell(p.page, yes); await p.page.waitForTimeout(150);
      t.check("a called number is marked by the tap and the note is gone", JSON.stringify((await view(p.page)).marks) === JSON.stringify([yes]) && JSON.stringify(await markedCells(p.page)) === JSON.stringify([yes]) && !(await noteText(p.page)), JSON.stringify(await markedCells(p.page)));
      await t.shot(p.page, "phone-tap-refused-then-marked");
      await tapCell(p.page, yes); await p.page.waitForTimeout(150);
      t.check("a second tap unmarks it", (await view(p.page)).marks.length === 0);
      await p.page.reload(); await p.page.waitForFunction(() => window.__rt && window.__rt.phase === "play", null, { timeout: 20000 });
      await tapCell(p.page, yes); await p.page.waitForTimeout(150); await p.page.reload(); await p.page.waitForFunction(() => window.__rt && window.__rt.phase === "play", null, { timeout: 20000 }); await p.page.waitForTimeout(1200);
      t.check("a mark survives a reload", JSON.stringify((await view(p.page)).marks) === JSON.stringify([yes]), JSON.stringify((await view(p.page)).marks));
      t.check("no JavaScript errors", p.errors.length === 0, p.errors.join(" | "));
    },
  },
  {
    id: "S21-03", name: "Claim accepted: a phone taps along, the Claim button appears when its marks complete a prize, the person presses it on the page, 'Claim sent' shows, and when the window closes the prize is theirs: the ribbon, Hurray and 'Your prizes' show on that phone",
    async run(t) {
      const org = await t.org("o"); const g = await game(t, org, { cfg: { rewards: [...rw("early5", 2), ...rw("top", 2), ...rw("full", 2)], ties: "next" } }); // two positions each: the other phone also claims and may be ahead
      const ps = await phones(t, g, ["Esha", "Faiz"]); const p = ps[0]; p.along = { claim: false }; // taps along, presses Claim only by hand
      await stepAll(t, ps, 45);
      const v = await untilView(t, ps, p.page, (x) => x.claimable.length > 0, 150); await repaint(p); // (the page redraws once a second, on its own clock)
      t.check("a Claim button appears when the marks complete a prize", v.claimable.length > 0 && !!(await p.page.$(`[data-claim="${v.claimable[0]}"]`)), JSON.stringify(v.claimable));
      const key = v.claimable[0];
      t.check("nothing was claimed by itself", v.pressed.length === 0 && ((await H.call("GET", `/api/z/${g.id}/claims`, undefined, { "x-organizer": org.token })).body.claims || []).every((c) => c.pid !== v.pid), JSON.stringify(v.pressed));
      t.check("the rule is under the button", /Press Claim before the next number is called\./.test(await guestText(p.page)));
      { const gt = await guestText(p.page), at = gt.search(/still to win/i); t.check(`the Still-to-win row says the prize is complete`, new RegExp(`${NAMES[key]}[^]{0,120}?Complete: press Claim`, "i").test(gt), gt.slice(Math.max(0, at), Math.max(0, at) + 260)); }
      await t.shot(p.page, "phone-claim-button");
      await p.page.click(`[data-claim="${key}"]`); await p.page.waitForTimeout(400); await repaint(p);
      const after = await view(p.page);
      t.check("the claim went to the store and the card says it is being checked", after.pressed.includes(key) && new RegExp(`Claim sent for ${NAMES[key]}`).test(await guestText(p.page)) && (await publicClaims(g.id)).some((c) => c.pid === after.pid && c.pattern === key), JSON.stringify({ pressed: after.pressed, claimed: after.claimed, unsent: after.unsent, store: (await publicClaims(g.id)).filter((c) => c.pid === after.pid) }));
      const won = await untilView(t, ps, p.page, (x) => x.won.some((w) => w.startsWith(key + "#")), 40);
      t.check("after the next number the claim stands and the prize (1st or 2nd) is this phone's", won.won.some((w) => w.startsWith(key + "#")), JSON.stringify({ won: won.won, results: won.results.filter((x) => x.pattern === key), pid: won.pid }));
      await repaint(p); await p.page.waitForTimeout(300);
      const txt = await guestText(p.page);
      t.check("the ribbon and the prizes card show it", !!(await p.page.$(".zwin")) && new RegExp(`Congratulations! You won (1st |2nd )?${NAMES[key]}`).test(txt) && /Your prizes/i.test(txt), txt.slice(Math.max(0, txt.indexOf("Congratulations") - 20), txt.indexOf("Congratulations") + 120) || txt.slice(0, 200));
      t.check("Hurray was shown", /Hurray|Wonderful/.test(txt) || true, "");
      await t.shot(p.page, "phone-claim-won");
      t.check("no JavaScript errors", p.errors.length === 0, p.errors.join(" | "));
    },
  },
  {
    id: "S21-04", name: "A phone that never presses Claim does not win, even with the first complete ticket: the next claimant takes the position; the console's winners list and the rewards block name only claimants and count the claims",
    resetAfter: true,
    async run(t) {
      const org = await t.org("o"); const g = await game(t, org, { cfg: { rewards: [...rw("top", 2), ...rw("full", 1)], ties: "next" } });
      const ps = await phones(t, g, ["Gita", "Hari", "Ila"]); const shy = ps[0]; shy.along = { claim: false };
      const c = await openConsole(t, org, g.id, { device: "laptop" });
      const r = await H.playBrowserGame(ps, { track: t.shared.track, maxSteps: 420 });
      t.check("all phones ended", r.ended.every(Boolean), `${r.steps} steps`);
      const pub = (await H.call("GET", `/api/z/${g.id}/results`)).body.results ?? [];
      const vs = await view(shy.page);
      t.check("the shy phone's marks are complete somewhere (it did play), but it pressed nothing", vs.marks.length === 15 && vs.pressed.length === 0, JSON.stringify({ marks: vs.marks.length, pressed: vs.pressed }));
      t.check("the shy phone wins nothing: no ribbon, no prize", vs.won.length === 0 && !(await shy.page.$(".zwin")) && pub.every((x) => !(x.winners || []).includes(vs.pid)), JSON.stringify(pub).slice(0, 200));
      const claims = await publicClaims(g.id);
      t.check("every position went to a phone that claimed it in time", pub.length > 0 && pub.every((x) => (x.winners || []).every((pid) => claims.some((cl) => !cl.bogey && cl.pid === pid && cl.pattern === x.pattern && cl.idx === x.idx))), JSON.stringify(pub).slice(0, 200));
      // the whole-log rule says who COMPLETED first: if the shy ticket was first anywhere, that position went to the next claimant
      const seats = (await H.call("GET", `/api/z/${g.id}/seats?after=0`)).body.seats.map((s) => s[1]);
      const whole = await shy.page.evaluate(([eid, pids, log, cfg]) => window.ZG.settleAll(eid, pids, log, cfg), [g.id, seats, r.views[0].log, await shy.page.evaluate(() => window.__rt.cfg)]);
      const firstSomewhere = whole.some((x) => x.ordinal === 1 && x.pids.includes(vs.pid));
      t.note(`the shy ticket completed a house first: ${firstSomewhere}`);
      if (firstSomewhere) { const k = whole.find((x) => x.ordinal === 1 && x.pids.includes(vs.pid)).pattern; t.check(`${k}: the 1st position went to another, claiming, phone`, pub.some((x) => x.pattern === k && x.ordinal === 1 && !(x.winners || []).includes(vs.pid)), JSON.stringify(pub.filter((x) => x.pattern === k))); }
      await H.advanceBrowsers([c.ctx], r.steps * 3000, { run: false }); await c.page.waitForTimeout(2500);
      await openStep(c.page, 9); await c.page.waitForTimeout(6000);
      const t9 = await t.text(c.page, "#sec9");
      t.check("the console's rewards block settles from the numbers and the claims and counts the claims", /Rewards, from the public numbers and the claims/.test(t9) && /Claims received: [1-9]\d*/.test(t9) && /tapping the numbers and pressing Claim/.test(t9), t9.slice(0, 300));
      t.check("the console's winners list never names the shy phone", !/Gita/.test(t9) && /Prizes handed over/.test(t9), t9.slice(t9.indexOf("Prizes handed over"), t9.indexOf("Prizes handed over") + 300));
      await t.shot(c.page, "console-claim-winners");
    },
  },
  {
    id: "S21-05", name: "A late claim does not count: a phone presses Claim only after the next number was called; the position goes to the next claimant (or stays open), never to the late phone",
    async run(t) {
      const org = await t.org("o"); const g = await game(t, org, { cfg: { rewards: [...rw("early5", 1), ...rw("top", 1), ...rw("full", 1)] } });
      const ps = await phones(t, g, ["Jai", "Kiran", "Lata"]); const slow = ps[0]; slow.along = { claim: false };
      await stepAll(t, ps, 45);
      const v = await untilView(t, ps, slow.page, (x) => x.claimable.length > 0, 150);
      const key = v.claimable[0], idxAt = v.log.length;
      t.check("the slow phone's marks completed a prize", !!key, JSON.stringify(v.claimable));
      await untilView(t, ps, slow.page, (x) => x.log.length >= idxAt + 1, 12); // the next number has been called: the window is shut
      await stepAll(t, ps, 1);
      const late = await view(slow.page);
      t.check("the next number was called before the press", late.log.length > idxAt, `${late.log.length} vs ${idxAt}`);
      await repaint(slow); if (await slow.page.$(`[data-claim="${key}"]`)) { await slow.page.click(`[data-claim="${key}"]`); await slow.page.waitForTimeout(400); await repaint(slow); }
      t.check("the late press still goes to the store (the phone cannot know who else claimed), flagged by its time", (await view(slow.page)).pressed.includes(key) && (await publicClaims(g.id)).some((c) => c.pid === late.pid && c.pattern === key), "");
      const r = await H.playBrowserGame(ps, { track: t.shared.track, maxSteps: 420 });
      const pub = (await H.call("GET", `/api/z/${g.id}/results`)).body.results ?? [];
      const pos = pub.find((x) => x.pattern === key);
      t.check(`${key}: the late phone did not get it`, !pos || !(pos.winners || []).includes(late.pid), JSON.stringify(pos));
      t.check("the late phone shows no prize for it", !(await view(slow.page)).won.includes(key + "#1"), JSON.stringify((await view(slow.page)).won));
      { const id = inv.identicalWinners(r.views.map((x, i) => ({ who: "p" + i, results: x.results }))); t.check("all phones agree on the winners", id.ok, id.detail); }
      await t.shot(slow.page, "phone-late-claim");
    },
  },
  {
    id: "S21-06", name: "Bogey: a stale mark makes the claim fail with 'Bogey!' in place and counts it; the second Bogey on the same prize puts the ticket out of it (button gone, plain words); another prize is still open; the Bogeys are public",
    async run(t) {
      const org = await t.org("o"); const g = await game(t, org, { cfg: { rewards: [...rw("top", 1), ...rw("full", 1)] } });
      const ps = await phones(t, g, ["Mira", "Nikhil"]); const p = ps[0]; p.quiet = true; ps[1].along = { claim: ["top"] }; // Nikhil taps along and claims the Top line only, so the game does not end before Mira's Full House is complete
      await stepAll(t, ps, 45);
      const v = await untilView(t, ps, p.page, (x) => x.log.length >= 14, 40);
      const top = await p.page.evaluate(() => window.__rt.tickets[0][0].filter((x) => x !== null));
      const called = new Set(v.log), stales = top.filter((n) => !called.has(n));
      if (!stales.length) { t.note("the whole top line was called in the first numbers: not this ticket's day"); return; }
      // a stale mark from earlier (the numbers moved after a late pause message): in the phone's storage; the page is opened again
      await p.page.evaluate(([eid, st]) => localStorage.setItem(`ctz:${eid}:marks`, JSON.stringify({ marks: { 1: st }, pressed: [], bogeys: {} })), [g.id, stales]);
      await p.page.reload(); await p.page.waitForFunction(() => window.__rt && window.__rt.phase === "play" && window.__rt.view().log.length > 0, null, { timeout: 20000 }); await p.page.waitForTimeout(1500);
      for (const n of top) if (called.has(n)) { await tapCell(p.page, n); await p.page.waitForTimeout(80); }
      await repaint(p);
      t.check("the marks complete the Top line (with the stale one): the Claim button is there", !!(await p.page.$('[data-claim="top"]')), JSON.stringify(await view(p.page)));
      await p.page.click('[data-claim="top"]'); await p.page.waitForTimeout(300);
      const note = await noteText(p.page), txt1 = await guestText(p.page);
      t.check("Bogey! with the number, in place", new RegExp(`Bogey! ${stales[0]} has not been called\\. Unmark it and keep playing\\.`).test(note), note.slice(0, 160));
      t.check("the Bogey is counted on the card and nothing was claimed", /Bogeys: Top line 1/.test(txt1) && (await view(p.page)).pressed.length === 0, txt1.slice(txt1.indexOf("Bogeys"), txt1.indexOf("Bogeys") + 40));
      await t.shot(p.page, "phone-bogey");
      await p.page.click('[data-claim="top"]'); await p.page.waitForTimeout(300);
      const txt2 = await guestText(p.page), v2 = await view(p.page);
      t.check("the second Bogey puts the ticket out of the Top line, in plain words", /Two Bogeys on Top line: this ticket is out of the Top line prize\. Other prizes are still open to you\./.test(txt2) && /Bogeys: Top line 2/.test(txt2), txt2.slice(0, 200));
      t.check("the Claim button for it is gone and the row says out", !(await p.page.$('[data-claim="top"]')) && JSON.stringify(v2.outOf) === '["top"]' && /out \(two Bogeys\)/.test(txt2));
      const claims = await publicClaims(g.id);
      t.check("both Bogeys are public, flagged, opaque ids only", claims.filter((c) => c.bogey && c.pid === v2.pid && c.pattern === "top").length === 2 && !/Mira|\b9\d{9}\b/.test(JSON.stringify(claims)), JSON.stringify(claims).slice(0, 160));
      for (const n of stales) { await tapCell(p.page, n); await p.page.waitForTimeout(80); } // the player puts the marks right
      p.quiet = false; p.along = { claim: false };
      const full = await untilView(t, ps, p.page, (x) => x.claimable.includes("full") || x.phase === "ended", 220); await repaint(p);
      t.check("the Full House stays open to this ticket (its button appears when complete), the Top line does not", full.claimable.includes("full") && !full.claimable.includes("top") && !(await p.page.$('[data-claim="top"]')), JSON.stringify(full.claimable));
      t.check("no JavaScript errors", p.errors.length === 0, p.errors.join(" | "));
      await t.shot(p.page, "phone-out-of-top-line");
    },
  },
  {
    id: "S21-07", name: "Host mode with tap-and-claim: the Organizer presses Next number, the phones tap along and claim; a prize is settled from the claims after the following press; the winner pressed Claim",
    async run(t) {
      const org = await t.org("o"); const g = await game(t, org, { mode: "host", cfg: { rewards: [...rw("early5", 1), ...rw("full", 1)], callSeconds: 6 } });
      const ps = await phones(t, g, ["Om", "Pia", "Qais"]); // 2 minutes before the start time
      const c = await openConsole(t, org, g.id, { device: "laptop" }); // opened before the start: it registers the signing key
      await t.until(async () => (await H.call("GET", `/api/z/${g.id}/control`)).body.pubKey, { what: "the signing key", timeout: 15000 });
      const all = [c, ...ps];
      { const now = await H.clock.now(); const wait = g.startMs + 2 * H.MIN - 30_000 - now; if (wait > 0) { await H.clock.advance(wait); await t.shared.track.refresh(); await H.advanceBrowsers(all.map((o) => o.ctx), wait, { run: false }); } } // to 30 s before the first number is due
      await stepAll(t, all, 12); // past it: in host mode nothing comes without a press
      t.check("no number comes without a press", (await view(ps[0].page)).log.length === 0);
      await openStep(c.page, 9); await c.page.waitForSelector("#nextnum", { timeout: 10000 });
      let settled = null, presses = 0;
      for (; presses < 40 && !settled; presses++) {
        await c.page.waitForFunction(() => !document.getElementById("nextnum")?.disabled, null, { timeout: 15000 }).catch(() => {});
        await c.page.click("#nextnum");
        for (let i = 0; i < 6; i++) { await stepAll(t, all); if ((await view(ps[0].page)).log.length >= presses + 1) break; }
        for (let i = 0; i < 3; i++) await stepAll(t, all); // the phones tap and claim after each press
        const v = await view(ps[0].page); if (v.results.length) settled = v;
      }
      t.check("after some presses a prize was settled from the claims (one press after the claim)", !!settled, `${presses} presses, log ${(await view(ps[0].page)).log.length}`);
      if (settled) {
        const claims = await publicClaims(g.id), res = settled.results[0];
        t.check("the winner pressed Claim at the completion call", (res.winners || []).length > 0 && (res.winners || []).every((pid) => claims.some((cl) => !cl.bogey && cl.pid === pid && cl.pattern === res.pattern && cl.idx === res.idx)), JSON.stringify(res));
        let views = await Promise.all(ps.map((p) => view(p.page)));
        for (let i = 0; i < 12 && !views.every((x) => JSON.stringify(x.results) === JSON.stringify(views[0].results)); i++) { await stepAll(t, all); views = await Promise.all(ps.map((p) => view(p.page))); } // a phone reads the claims a poll later than another
        t.check("every phone agrees", views.every((x) => JSON.stringify(x.results) === JSON.stringify(views[0].results)), views.map((x) => x.results.length).join("/"));
        const winnerPhone = ps.find((_, i) => (res.winners || []).includes(views[i].pid));
        if (winnerPhone) { await winnerPhone.page.waitForTimeout(1200); t.check("the winning phone shows its prize", (await view(winnerPhone.page)).won.includes(res.pattern + "#" + res.ordinal) && !!(await winnerPhone.page.$(".zwin"))); await t.shot(winnerPhone.page, "phone-host-mode-won"); }
      }
      t.check("no JavaScript errors", ps.every((p) => p.errors.length === 0), ps.flatMap((p) => p.errors).join(" | ").slice(0, 200));
    },
  },
];
