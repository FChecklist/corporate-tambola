// Group 20: host mode ("A Host presses a button for each number") in real Chrome: the Organizer's console button releases one number at a time to every phone, the board
// and the number screen; a pause; a Host pressing from their own console link; a press too soon is refused kindly; a break; and the auto mode still plays by itself (S07-01).
// The ORDER of the numbers is still the public beacon's: a press only decides WHEN the next one is released (packages/beacon/src/control.ts, "next").
import { H, openConsole, openStep, guestText, nextPhone, guestJoinUi } from "./kit.mjs";

const { invariants: inv } = H;
const ALL_RW = ["early5", "top", "mid", "bot", "corners", "star", "full"].map((p) => ({ pattern: p, scope: "ticket", ordinal: 1, text: "" }));

/** a paid game starting in `lead` ms; host mode unless told otherwise */
const hostGame = (t, org, { lead = 8 * H.MIN, cfg = {}, mode = "host" } = {}) => t.game(org, { lead, cfg: { rewards: ALL_RW, callMode: mode, ...cfg }, settings: { whoCanJoin: "anyone" }, pay: true });
/** opens one phone per guest and joins through the form (the simulated time is not moved here) */
async function phones(t, g, names) {
  const out = [];
  for (const nm of names) { const x = await t.open({ device: "mobile" }); await guestJoinUi(x.page, g.id, nextPhone(), nm); out.push(x); }
  return out;
}
/** moves everyone (server clock, beacon, every page) to `beforeStart` ms before the first number (2 minutes after the start time) and waits for the phones to be in play */
async function goToStart(t, g, pages, beforeStart = 30_000) {
  const now = await H.clock.now(); const wait = g.startMs + 2 * H.MIN - beforeStart - now;
  if (wait > 0) { await H.clock.advance(wait); await t.shared.track.refresh(); await H.advanceBrowsers(pages.map((o) => o.ctx), wait, { run: false }); }
  await Promise.all(pages.filter((p) => p.isPhone).map((p) => p.page.waitForFunction(() => window.__rt && window.__rt.phase === "play", null, { timeout: 25000 })));
}
/** one 3 s step of simulated time for the server and every open page (their timers run too) */
async function stepAll(t, pages, n = 1) {
  for (let i = 0; i < n; i++) { await H.clock.advance(3000); t.shared.track.bump(3000); for (const o of pages) await o.ctx.clock.runFor(3000); await H.tapAlong(pages); await H.sleep(60); }
}
const logsOf = (phonePages) => Promise.all(phonePages.map((p) => p.page.evaluate(() => (window.__rt ? window.__rt.view().log : []))));
const chipOf = (p) => p.page.evaluate(() => { const c = document.querySelector(".zchip2"); return c ? c.textContent.trim() : ""; });
/** presses Next number in a console and steps until every phone shows `want` numbers; returns the simulated seconds that took (and wall-clock ms) */
async function pressAndMeasure(t, consolePage, phonePages, pages, want, { max = 12 } = {}) {
  const t0 = Date.now();
  await consolePage.click("#nextnum");
  let steps = 0;
  for (; steps < max; steps++) { await stepAll(t, pages); const lens = (await logsOf(phonePages)).map((l) => l.length); if (lens.every((l) => l >= want)) { steps++; break; } }
  return { simSec: steps * 3, wallMs: Date.now() - t0 };
}
/** waits until the console's button is ready for the next press (its own 5 s refresh must have read the released number) */
async function readyAgain(t, consolePage, pages) {
  for (let i = 0; i < 8; i++) { const txt = await consolePage.evaluate(() => document.getElementById("hoststate")?.textContent || ""); if (/Press when you are ready|Press for the first/.test(txt)) return true; await stepAll(t, pages); }
  return false;
}
/** the console registers the signing key when it opens before the start: wait until the control file has a public key */
async function keyReady(t, eid) { return t.until(async () => (await H.call("GET", `/api/z/${eid}/control`)).body.pubKey, { what: "the signing key", timeout: 15000 }); }

/** the games of these scenarios need the present check-in: the person ticks the two boxes and types the code shown on their own page (the ticket opens after it) */
async function checkInUi(page) {
  await page.waitForSelector("#ckshow", { timeout: 20000 }); const code = (await page.innerText("#ckshow")).trim();
  await page.check("#ckokn"); await page.check("#ckokm"); await page.fill("#ckcode", code); await page.click("#cksubmit");
  await page.waitForFunction(() => !document.getElementById("ckshow"), null, { timeout: 15000 });
}

export default [
  {
    id: "S20-01", name: "Host mode: 3 phones, the board and the number screen show the same numbers, only when the Organizer presses Next number; nothing moves on its own",
    async run(t) {
      const org = await t.org("o"); const g = await hostGame(t, org);
      const c = await openConsole(t, org, g.id, { device: "laptop" }); await keyReady(t, g.id);
      const ps = await phones(t, g, ["Asha", "Bala", "Chitra"]); ps.forEach((p) => (p.isPhone = true));
      const big = await t.open({ device: "wide" }); await big.page.goto(`${H.SIM}/big.html?e=${g.id}`);
      const board = await t.open({ device: "laptop" }); await board.page.goto(`${H.SIM}/board.html?e=${g.id}#k=${encodeURIComponent(org.token)}`);
      const all = [c, ...ps, big, board];
      await goToStart(t, g, all, 30_000);
      await stepAll(t, all, 14); // past the start: the software calls nothing
      for (const p of ps) await checkInUi(p.page);
      const lens0 = (await logsOf(ps)).map((l) => l.length);
      t.check("no number appears without a press (3 phones, 12 s past the start)", lens0.every((l) => l === 0), lens0.join("/"));
      t.check("the phone chip reads Waiting for the host", (await chipOf(ps[0])) === "Waiting for the host", await chipOf(ps[0]));
      t.check("the number screen says Waiting for the host", /Waiting for the host/.test(await guestText(big.page)), (await guestText(big.page)).slice(0, 120));
      t.check("the board says Waiting for the host", /Waiting for the host/.test(await guestText(board.page)), (await guestText(board.page)).slice(0, 120));
      await openStep(c.page, 9); await c.page.waitForSelector("#nextnum", { timeout: 10000 });
      t.check("the console's Next number button is enabled once the game has started", !(await c.page.locator("#nextnum").isDisabled()), await t.text(c.page, "#hostcall"));
      const delays = [];
      for (let k = 1; k <= 3; k++) {
        const d = await pressAndMeasure(t, c.page, ps, all, k);
        delays.push(d.simSec);
        t.check(`press ${k}: every phone shows number ${k} within 15 s (simulated)`, d.simSec > 0 && d.simSec <= 15, `${d.simSec} s simulated, ${d.wallMs} ms wall clock`);
        t.check(`press ${k}: the button says On its way while the number travels, then shows the number`, await readyAgain(t, c.page, all), await t.text(c.page, "#hostcall"));
      }
      t.note("press-to-phone delay, simulated seconds per press: " + delays.join(", "));
      const logs = await logsOf(ps);
      t.check("the three phones hold the identical three numbers", logs.every((l) => l.length === 3 && l.join() === logs[0].join()), logs.map((l) => l.join("-")).join(" | "));
      await stepAll(t, all, 3);
      const last = String(logs[0][2]);
      const bigTxt = await guestText(big.page), boardTxt = await guestText(board.page), consoleLast = await c.page.evaluate(() => document.getElementById("hostlast")?.textContent.trim());
      t.check("the number screen shows the last number and 3 of 90", new RegExp(`\\b${last}\\b`).test(bigTxt) && /3 of 90 called/.test(bigTxt), bigTxt.slice(0, 160));
      t.check("the board shows the last number and 3 of 90", new RegExp(`\\b${last}\\b`).test(boardTxt) && /3 of 90 called/.test(boardTxt), boardTxt.slice(0, 160));
      t.check("the console's card shows the number just released", consoleLast === last, `${consoleLast} vs ${last}`);
      await stepAll(t, all, 20); // and again nothing more without a press
      const lens2 = (await logsOf(ps)).map((l) => l.length);
      t.check("a minute later, still 3 numbers on every phone", lens2.every((l) => l === 3), lens2.join("/"));
      const ctl = (await H.call("GET", `/api/z/${g.id}/control`)).body;
      t.check("the control file holds three signed presses, each naming a round 2 beacon rounds after it was signed", ctl.messages.length === 3 && ctl.messages.every((m) => m.action === "next" && m.atBeaconRound - m.signedAtRound === 2), JSON.stringify(ctl.messages.map((m) => [m.action, m.signedAtRound, m.atBeaconRound])));
      await t.shot(c.page, "console-next-number"); await t.shot(ps[0].page, "phone-waiting"); await t.shot(big.page, "big-host-mode");
    },
  },
  {
    id: "S20-02", name: "Host mode: a pause in the middle. A press while paused is refused with a calm message; after Resume the presses go on",
    async run(t) {
      const org = await t.org("o"); const g = await hostGame(t, org);
      const c = await openConsole(t, org, g.id, { device: "laptop" }); await keyReady(t, g.id);
      const ps = await phones(t, g, ["Dev", "Esha"]); ps.forEach((p) => (p.isPhone = true));
      const all = [c, ...ps];
      await goToStart(t, g, all, 30_000); await stepAll(t, all, 12);
      await openStep(c.page, 9); await c.page.waitForSelector("#nextnum", { timeout: 10000 });
      const d1 = await pressAndMeasure(t, c.page, ps, all, 1); t.check("the first press reaches both phones", d1.simSec > 0, `${d1.simSec} s`);
      await readyAgain(t, c.page, all);
      await c.page.click('[data-ctl="pause"]'); await c.page.waitForTimeout(800);
      const ctl = (await H.call("GET", `/api/z/${g.id}/control`)).body, pz = (ctl.messages || []).find((m) => m.action === "pause");
      t.check("the pause was signed and stored", !!pz, JSON.stringify(ctl.messages?.map((m) => m.action)));
      if (pz) { while (H.roundAt(await H.clock.now()) < pz.atBeaconRound + 1) await stepAll(t, all); } // the pause takes effect leadRounds after it was signed
      await stepAll(t, all, 2);
      t.check("the phones show Paused", (await chipOf(ps[0])) === "Paused", await chipOf(ps[0]));
      await c.page.click("#nextnum"); await c.page.waitForTimeout(500);
      const note = await c.page.evaluate(() => (document.getElementById("nextnote") || document.getElementById("hoststate"))?.textContent || "");
      t.check("a press while paused is refused with a calm message", /paused/i.test(note) && /Resume/.test(note), note);
      const lens = (await logsOf(ps)).map((l) => l.length);
      t.check("no number was released by that press", lens.every((l) => l === 1), lens.join("/"));
      await c.page.click('[data-ctl="resume"]'); await c.page.waitForTimeout(800);
      const after = (await H.call("GET", `/api/z/${g.id}/control`)).body, rs = after.messages.find((m) => m.action === "resume");
      t.check("the resume was signed and stored", !!rs);
      if (rs) { while (H.roundAt(await H.clock.now()) < rs.atBeaconRound + 1) await stepAll(t, all); }
      await stepAll(t, all, 3);
      const d2 = await pressAndMeasure(t, c.page, ps, all, 2);
      t.check("after the resume a press releases the next number to both phones", d2.simSec > 0 && d2.simSec <= 15, `${d2.simSec} s`);
      const logs = await logsOf(ps); t.check("both phones agree", logs[0].join() === logs[1].join(), logs.map((l) => l.join("-")).join(" | "));
      await t.shot(c.page, "console-paused-press");
    },
  },
  {
    id: "S20-03", name: "A Host (not the Organizer) presses Next number from their own console link; their key signs beside the Organizer's",
    async run(t) {
      const org = await t.org("o"); const g = await hostGame(t, org);
      const c = await openConsole(t, org, g.id, { device: "laptop" }); await keyReady(t, g.id);
      const email = t.mail("h"); t.team.add(email);
      const inv = await org.inviteHost({ label: "Hema", email, mobile: nextPhone() });
      const { token } = await new H.Host(inv.hostKey).firstOpen({ email, mobile: "9876500123" });
      const hc = await openConsole(t, org, g.id, { device: "laptop", token, label: "host-console" });
      t.check("the Host's console opens (role pill says Host)", /\bHost\b/.test(await t.text(hc.page)));
      await t.until(async () => ((await H.call("GET", `/api/z/${g.id}/control`)).body.hostKeys || []).length === 1, { what: "the Host's key beside the Organizer's", timeout: 15000 });
      const ps = await phones(t, g, ["Faiz", "Gita"]); ps.forEach((p) => (p.isPhone = true));
      const all = [c, hc, ...ps];
      await goToStart(t, g, all, 30_000); await stepAll(t, all, 12);
      await openStep(hc.page, 9); await hc.page.waitForSelector("#nextnum", { timeout: 10000 });
      t.check("the Host sees the Next number button", !(await hc.page.locator("#nextnum").isDisabled()), await t.text(hc.page, "#hostcall"));
      const d = await pressAndMeasure(t, hc.page, ps, all, 1);
      t.check("the Host's press releases a number to every phone within 15 s", d.simSec > 0 && d.simSec <= 15, `${d.simSec} s`);
      const ctl = (await H.call("GET", `/api/z/${g.id}/control`)).body;
      t.check("the press was signed with the Host's key, not the Organizer's (the file has one Host key and one next)", ctl.hostKeys.length === 1 && ctl.messages.length === 1 && ctl.messages[0].action === "next", JSON.stringify({ hostKeys: ctl.hostKeys.length, msgs: ctl.messages.map((m) => m.action) }));
      await readyAgain(t, hc.page, all);
      await openStep(c.page, 9); await stepAll(t, all, 2);
      const d2 = await pressAndMeasure(t, c.page, ps, all, 2);
      t.check("and the Organizer can still press from their own console", d2.simSec > 0 && d2.simSec <= 15, `${d2.simSec} s`);
      const logs = await logsOf(ps); t.check("both phones agree on both numbers", logs.every((l) => l.length === 2) && logs[0].join() === logs[1].join(), logs.map((l) => l.join("-")).join(" | "));
      await t.shot(hc.page, "host-console-next");
    },
  },
  {
    id: "S20-04", name: "Exception: a press while the previous number is still on its way is refused kindly, and is not counted",
    async run(t) {
      const org = await t.org("o"); const g = await hostGame(t, org);
      const c = await openConsole(t, org, g.id, { device: "laptop" }); await keyReady(t, g.id);
      const ps = await phones(t, g, ["Hari"]); ps.forEach((p) => (p.isPhone = true));
      const all = [c, ...ps];
      await goToStart(t, g, all, 30_000); await stepAll(t, all, 12);
      await openStep(c.page, 9); await c.page.waitForSelector("#nextnum", { timeout: 10000 });
      await c.page.click("#nextnum"); await c.page.waitForFunction(() => /On its way/.test(document.getElementById("nextnum")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
      t.check("right after a press the button is disabled and says On its way", (await c.page.locator("#nextnum").isDisabled()) && /On its way/.test(await c.page.locator("#nextnum").innerText()), await t.text(c.page, "#hostcall"));
      // a second press slipping through anyway (another tab, a double tap) is refused by the store in plain words
      const r = await c.page.evaluate(async ([eid, token]) => { const x = await window.TBControl.publish(eid, { token, prefix: "/api/z" }, "next"); return { status: x.status, error: x.data && x.data.error }; }, [g.id, org.token]);
      t.check("the second press is refused (422) with the kind message", r.status === 422 && /One moment: the last number is still on its way/.test(r.error || ""), JSON.stringify(r));
      const ctl = (await H.call("GET", `/api/z/${g.id}/control`)).body;
      t.check("only one press is stored", ctl.messages.length === 1, String(ctl.messages.length));
      await stepAll(t, all, 5);
      const lens = (await logsOf(ps)).map((l) => l.length);
      t.check("the phone shows exactly one number", lens[0] === 1, lens.join("/"));
      t.check("the button is ready again once the number is out", await readyAgain(t, c.page, all), await t.text(c.page, "#hostcall"));
    },
  },
  {
    id: "S20-05", name: "Host mode with a brand break after 2 numbers: the break shows on the phones; a press during it is refused; after it the press counts",
    async run(t) {
      const org = await t.org("o"); const g = await hostGame(t, org, { cfg: { breaks: [{ after: 2, seconds: 30, kind: "speech", title: "A word from our sponsor" }] } });
      const c = await openConsole(t, org, g.id, { device: "laptop" }); await keyReady(t, g.id);
      const ps = await phones(t, g, ["Isha", "Jai"]); ps.forEach((p) => (p.isPhone = true));
      const all = [c, ...ps];
      await goToStart(t, g, all, 30_000); await stepAll(t, all, 12);
      await openStep(c.page, 9); await c.page.waitForSelector("#nextnum", { timeout: 10000 });
      for (const k of [1, 2]) { const d = await pressAndMeasure(t, c.page, ps, all, k); t.check(`press ${k} reaches both phones`, d.simSec > 0, `${d.simSec} s`); await readyAgain(t, c.page, all); }
      await stepAll(t, all, 1);
      const txt = await guestText(ps[0].page);
      t.check("after the 2nd number the phones show the break", /A word from our sponsor/.test(txt), txt.slice(0, 160));
      await c.page.click("#nextnum"); await c.page.waitForTimeout(600);
      const note = await c.page.evaluate(() => document.getElementById("nextnote")?.textContent || "");
      t.check("a press during the break is refused kindly", /break is still on/.test(note), note);
      await stepAll(t, all, 10); // the 30 s break is over
      const d3 = await pressAndMeasure(t, c.page, ps, all, 3);
      t.check("after the break the press counts", d3.simSec > 0 && d3.simSec <= 15, `${d3.simSec} s`);
      const logs = await logsOf(ps); t.check("both phones agree", logs.every((l) => l.length === 3) && logs[0].join() === logs[1].join(), logs.map((l) => l.join("-")).join(" | "));
    },
  },
  {
    id: "S20-06", name: "Auto mode still plays by itself (S07-01): two phones play a whole game with no press, identical winners, no JavaScript errors",
    async run(t) {
      const org = await t.org("o"); const g = await hostGame(t, org, { mode: "auto" });
      const ps = await phones(t, g, ["Kabir", "Lata"]); ps.forEach((p) => (p.isPhone = true));
      await goToStart(t, g, ps, 2 * H.MIN);
      const t0 = Date.now(); const r = await H.playBrowserGame(ps, { track: t.shared.track });
      t.check("both phones reached the end within the time budget", r.ended.every(Boolean) && Date.now() - t0 < 240000, `${r.steps} steps, ${((Date.now() - t0) / 1000).toFixed(0)} s, ended ${r.ended}`);
      const id = inv.identicalWinners(r.views.map((v, i) => ({ who: "phone" + i, results: v.results }))); t.check(id.name, id.ok && r.views[0].results.length > 0, id.detail);
      t.check("logs are the same length on both phones", r.views[0].log.length === r.views[1].log.length && r.views[0].log.length > 20, r.views.map((v) => v.log.length).join("/"));
      const ctl = (await H.call("GET", `/api/z/${g.id}/control`)).body;
      t.check("no press was ever needed or stored", !ctl.messages || ctl.messages.length === 0, JSON.stringify(ctl.messages || []));
    },
  },
  {
    id: "S20-07", name: "Manual play at uneven moments: no screen counts down to the next number (phone, number screen, board); each says the host calls the numbers; every number appears only when pressed",
    async run(t) {
      const org = await t.org("o"); const g = await hostGame(t, org);
      const c = await openConsole(t, org, g.id, { device: "laptop" }); await keyReady(t, g.id);
      const ps = await phones(t, g, ["Mira", "Nikhil"]); ps.forEach((p) => (p.isPhone = true));
      const big = await t.open({ device: "wide" }); await big.page.goto(`${H.SIM}/big.html?e=${g.id}`);
      const board = await t.open({ device: "laptop" }); await board.page.goto(`${H.SIM}/board.html?e=${g.id}#k=${encodeURIComponent(org.token)}`);
      const all = [c, ...ps, big, board];
      await goToStart(t, g, all, 30_000); await stepAll(t, all, 14);
      for (const p of ps) await checkInUi(p.page);
      await openStep(c.page, 9); await c.page.waitForSelector("#nextnum", { timeout: 10000 });
      const noCount = async (label) => {
        const texts = [await guestText(ps[0].page), await guestText(ps[1].page), await guestText(big.page), await guestText(board.page)];
        t.check(`${label}: no 'Next number in', no 'seconds to the next number' on the phones, the number screen or the board`, texts.every((x) => !/Next number in|seconds to the next number/i.test(x)), texts.map((x) => (x.match(/Next number in[^.]{0,12}|\d+\s+seconds to the next number/i) || [""])[0]).join(" | "));
      };
      await noCount("before the first press");
      const waits = [0, 4, 15, 1, 8]; // uneven pauses between presses, in 3 s steps (0 s, 12 s, 45 s, 3 s, 24 s)
      for (let k = 1; k <= waits.length; k++) {
        await stepAll(t, all, waits[k - 1]);
        const d = await pressAndMeasure(t, c.page, ps, all, k);
        t.check(`press ${k}: the number reaches both phones`, d.simSec > 0 && d.simSec <= 15, `${d.simSec} s`);
        await stepAll(t, all, 2);
        await noCount(`after press ${k}`);
        const phoneTxt = await guestText(ps[0].page);
        t.check(`after press ${k}: the phone says the host calls the numbers`, /The host calls the numbers|Waiting for the host/.test(phoneTxt), phoneTxt.slice(0, 200));
        await readyAgain(t, c.page, all);
      }
      await stepAll(t, all, 25); // a long wait with no press: still nothing counts down, still nothing is called
      await noCount("after a 75 s wait");
      const lens = (await logsOf(ps)).map((l) => l.length); t.check("still exactly 5 numbers on both phones", lens.every((l) => l === 5), lens.join("/"));
      const ctl = (await H.call("GET", `/api/z/${g.id}/control`)).body;
      const rounds = ctl.messages.filter((m) => m.action === "next").map((m) => m.atBeaconRound), gaps = rounds.slice(1).map((r, i) => (r - rounds[i]) * 3);
      t.check("the presses were not evenly spaced (no fixed gap in the control file)", new Set(gaps).size > 2, gaps.join(", "));
      await board.page.waitForSelector("#bp-avg", { timeout: 15000 }); const gt = await board.page.innerText("#bp-avg"); t.check("the board's average-gap box says called by the host, not by the game", /Called by the host/.test(gt) && !/Called by the game/.test(gt), gt.slice(0, 200));
      await t.shot(ps[0].page, "phone-manual-play"); await t.shot(board.page, "board-manual-play");
    },
  },
  {
    id: "S20-08", name: "A tap that starts before a redraw and ends after it still counts, exactly once: a ticket number on the phone, and the Pause button on the organizer's board",
    async run(t) {
      const org = await t.org("o"); const g = await hostGame(t, org, { mode: "auto" });
      const ps = await phones(t, g, ["Om"]); ps.forEach((p) => (p.isPhone = true));
      const board = await t.open({ device: "laptop" }); await board.page.goto(`${H.SIM}/board.html?e=${g.id}#k=${encodeURIComponent(org.token)}`);
      const all = [...ps, board];
      await goToStart(t, g, all, 30_000); await stepAll(t, all, 40);
      const ph = ps[0].page; await checkInUi(ph);
      let n = null; // (no simulated tapping from here: wait for a NEW number that is on this ticket, then tap it with the real mouse)
      for (let i = 0; i < 80 && n === null; i++) { await H.clock.advance(3000); t.shared.track.bump(3000); for (const o of all) await o.ctx.clock.runFor(3000); await H.sleep(60); n = await ph.evaluate(() => { const called = new Set(window.__rt.view().log); const c = [...document.querySelectorAll("[data-tap]:not(.m)")].find((e) => called.has(Number(e.dataset.tap))); return c ? Number(c.dataset.tap) : null; }); }
      t.check("a called number is waiting on the ticket", n !== null, String(n));
      if (n !== null) {
        const before = await ph.evaluate(() => document.querySelectorAll("[data-tap].m").length);
        await ph.locator(`[data-tap="${n}"]`).scrollIntoViewIfNeeded(); const box = await ph.locator(`[data-tap="${n}"]`).boundingBox();
        await ph.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await ph.mouse.down();
        await ps[0].ctx.clock.runFor(1200); // one redraw beat while the finger is down
        await ph.mouse.up(); await H.sleep(300);
        const marked = await ph.evaluate((x) => { const e = document.querySelector(`[data-tap="${x}"]`); return !!e && e.classList.contains("m"); }, n);
        t.check("the number is marked although a redraw came between the touch and the release", marked);
        const count = await ph.evaluate(() => document.querySelectorAll("[data-tap].m").length); t.check("and exactly one number was marked (not toggled twice)", count === before + 1, `${before} -> ${count}`);
      }
      await board.page.waitForSelector("#bp-pause:not([disabled])", { timeout: 20000 });
      const pb = await board.page.evaluate(() => { const e = document.getElementById("bp-pause"); e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
      await board.page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await board.page.mouse.down();
      await board.ctx.clock.runFor(1200);
      await board.page.mouse.up();
      const sure = await board.page.waitForSelector("#bp-sure", { timeout: 6000 }).then(() => true, () => false);
      t.check("the board's Pause press, spread over a redraw beat, opens the Are you sure box", sure, (await guestText(board.page)).slice(0, 120));
    },
  },
];
