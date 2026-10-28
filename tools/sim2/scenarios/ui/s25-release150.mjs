// Release 1.5.0 in real Chrome: a Sneha-style game (6 phones, a new number every 12 s, one Organizer board): gold CLAIM buttons with the claim timer, the grey buttons and their Bogey question,
// a claim sent too late (the friendly Ohooo), a pause and a resume, and how fast the other phones and the board hear of a claim. Screenshots at 320, 360 and 1280 wide.
import { H, openConsole, guestText, nextPhone, guestJoinUi } from "./kit.mjs";

const ALL_RW = ["early5", "top", "mid", "bot", "corners", "star", "full"].map((p) => ({ pattern: p, scope: "ticket", ordinal: 1, text: "A prize" }));
async function checkInUi(page) {
  await page.waitForSelector("#ckshow", { timeout: 20000 }); const code = (await page.innerText("#ckshow")).trim();
  await page.check("#ckokn"); await page.check("#ckokm"); await page.fill("#ckcode", code); await page.click("#cksubmit");
  await page.waitForFunction(() => !document.getElementById("ckshow"), null, { timeout: 15000 });
}
const SIZES = [[320, 640], [360, 740], [390, 844], [430, 932], [1280, 800]];

export default [
  {
    id: "S25-01", name: "1.5.0 Sneha-style game: 6 real phones (12 s), gold and grey claim buttons, claim timer, too-late claim, pause and resume, claim notice speed, screenshots at 320/360/1280",
    async run(t) {
      const org = await t.org("o");
      const g = await t.game(org, { lead: 8 * H.MIN, cfg: { callSeconds: 12, rewards: ALL_RW }, settings: { whoCanJoin: "anyone" }, pay: true });
      const ps = [];
      for (let i = 0; i < 5; i++) { const [w, h] = SIZES[i]; const x = await t.open({ device: w >= 1000 ? "laptop" : "mobile", w, h }); await guestJoinUi(x.page, g.id, nextPhone(), "Player" + (i + 1)); x.isPhone = true; ps.push(x); }
      const con = await openConsole(t, org, g.id, { device: "laptop" }); // the console prepares the signing key for Pause and Resume
      await t.until(async () => (await H.call("GET", `/api/z/${g.id}/control`)).body.pubKey, { what: "the signing key", timeout: 15000 });
      const board = { page: await con.ctx.newPage(), ctx: con.ctx }; await board.page.goto(`${H.SIM}/board.html?e=${g.id}#k=${encodeURIComponent(org.token)}`); await board.page.bringToFront(); // (a hidden tab sends no claim signal: the board is in front; the board is a second tab of the console's browser: at most 6 browsers at once on this laptop; 5 phones + the Organizer)
      const all = [...ps, con]; // one entry per browser: the clock of a browser runs once for all its tabs
      const step = async (ms = 3000) => { await H.clock.advance(ms); t.shared.track.bump(ms); for (const o of all) await o.ctx.clock.runFor(ms); await H.sleep(40); };
      // to the start, check in, and a few numbers (no simulated tapping: the real taps below do the marking)
      const now = await H.clock.now(); const wait = g.startMs + 2 * H.MIN - 20_000 - now;
      if (wait > 0) { await H.clock.advance(wait); await t.shared.track.refresh(); await H.advanceBrowsers(all.map((o) => o.ctx), wait, { run: false }); }
      await Promise.all(ps.map((p) => p.page.waitForFunction(() => window.__rt && window.__rt.phase === "play", null, { timeout: 25000 })));
      for (const p of ps) await checkInUi(p.page);
      const tapAll = async () => { for (const p of ps) { const called = await p.page.evaluate(() => window.__rt.view().log.filter((x) => x > 0)); for (const n of called) { const c = p.page.locator(`[data-tap="${n}"]:not(.m)`).first(); if (await c.count()) await c.click({ timeout: 800 }).catch(() => {}); } } };
      // ---- play until some phone has a prize to claim
      let first = -1, seenGold = {};
      for (let i = 0; i < 160 && first < 0; i++) { await step(); await tapAll(); for (let k = 0; k < ps.length; k++) if (await ps[k].page.locator("#claimtop").count()) { first = k; break; } }
      t.check("a phone got a gold CLAIM alert after real taps", first >= 0, String(first));
      if (first < 0) return;
      const P = ps[first].page;
      const topTxt = await P.innerText("#claimalert").catch(() => "");
      t.check("the alert says 'You have won the <prize>. Click CLAIM to claim.'", /You have won the .+\. Click CLAIM to claim\./.test(topTxt), topTxt.slice(0, 120));
      t.check("three gold buttons: top, bottom bar, side by the prize", (await P.locator("#claimtop").count()) === 1 && (await P.locator("#claimbar .zbigclaim").count()) >= 1 && (await P.locator("#prizepanel .zside.zgold").count()) >= 1);
      const timerTxt = await P.innerText("#claimtop"); const dbg = await P.evaluate(() => { const v = window.__rt.view(); return JSON.stringify({ claimLeft: v.claimLeft, next: v.nextCallInSec, claimNow: v.claimNow, mode: v.callMode }); });
      const m = /Claim in the next (\d+) s/.exec(timerTxt); t.check("the claim timer shows 0 to 11", !!m && Number(m[1]) >= 0 && Number(m[1]) <= 11, timerTxt.replace(/\s+/g, " ") + " " + dbg);
      const pt = await P.innerText("body"); t.check("this player does not also see the normal 'Next number in' countdown", !/Next number in/.test(pt));
      const other = ps[(first + 1) % ps.length].page; const ot = await other.innerText("body");
      t.check("a player with nothing to claim sees the normal countdown and no gold button", /Next number in \d+s/.test(ot) && (await other.locator("#claimtop").count()) === 0 && (await other.locator("#prizepanel .zside.zgrey").count()) > 0);
      await t.shot(ps[first].page, "claim-gold-" + SIZES[first][0]);
      // ---- the grey button asks first
      await other.locator("#prizepanel .zside.zgrey").first().click(); await other.waitForSelector("#bogeyask", { timeout: 5000 });
      t.check("a grey button opens the Bogey question with Cancel and Submit", /You have no claim right now\. If you submit, it counts as a wrong claim \(Bogey\)\./.test(await other.innerText("#bogeyask")));
      await other.click("#bgcancel"); t.check("Cancel closes it and sends nothing", (await other.locator("#bogeyask").count()) === 0);
      // ---- press from the bottom bar; the phones and the board hear of it, measured on the simulated clock
      const toastSeen = new Array(ps.length).fill(null);
      const t0 = await H.clock.now();
      await P.locator("#claimbar .zbigclaim").first().click();
      await P.waitForFunction(() => /Claim sent|Sending your claim/.test(document.body.innerText), null, { timeout: 8000 });
      t.check("after one press: one claim sent, the gold buttons are gone", (await P.locator("#claimtop").count()) === 0);
      let boardSeen = null;
      for (let i = 0; i < 24; i++) { await step(500); const now2 = await H.clock.now(); for (let k = 0; k < ps.length; k++) if (k !== first && toastSeen[k] === null && /has claimed/.test(await ps[k].page.locator("#claimtoasts").innerText().catch(() => ""))) toastSeen[k] = now2 - t0; if (boardSeen === null && /has claimed/.test(await board.page.locator("#claimtoasts").innerText().catch(() => ""))) boardSeen = now2 - t0; }
      const seen = toastSeen.filter((x, k) => k !== first && x !== null); t.note("claim notice delay on the other phones, simulated ms: " + JSON.stringify(toastSeen) + ", board: " + boardSeen);
      t.check("the other 4 phones show 'Ticket N has claimed ...' within 4 s of the claim", seen.length === 4 && Math.max(...seen) <= 4000, JSON.stringify(toastSeen));
      t.check("the Organizer's board shows it within 4 s", boardSeen !== null && boardSeen <= 4000, String(boardSeen));
      // ---- a claim that arrives after the next number: held on its way, so the server's clock says too late
      let late = -1;
      for (let i = 0; i < 200 && late < 0; i++) { await step(); await tapAll(); for (let k = 0; k < ps.length; k++) if (k !== first && await ps[k].page.locator("#claimbar .zbigclaim").count()) { late = k; break; } }
      if (late >= 0) {
        const L = ps[late].page; let release;
        await L.route("**/api/z/*/claims", async (route) => { await new Promise((r) => (release = r)); route.continue(); });
        await L.locator("#claimbar .zbigclaim").first().click(); await H.sleep(300);
        for (let i = 0; i < 6; i++) await step(); // 18 s: the next number has been announced
        release && release();
        await L.waitForFunction(() => /Ohooo/.test(document.body.innerText), null, { timeout: 15000 }).then(() => t.check("a claim that reached the game after the next number gets the friendly Ohooo message", true), () => t.check("a claim that reached the game after the next number gets the friendly Ohooo message", false, "no message"));
        await L.unroute("**/api/z/*/claims");
      } else t.check("a second claimable moment came for the too-late test", false);
      // ---- pause and resume from the board
      await board.page.waitForSelector("#bp-pause:not([disabled])", { timeout: 20000 });
      await board.page.click("#bp-pause"); await board.page.waitForSelector("#bp-sure", { timeout: 5000 });
      await board.page.check("#bp-tick"); await board.page.click("#bp-yes");
      for (let i = 0; i < 30; i++) await step();
      t.check("every phone shows the pause", (await Promise.all(ps.map(async (p) => /PAUSED|Paused/.test(await p.page.innerText("body"))))).every(Boolean));
      t.check("while paused no phone shows a claim timer or the countdown", (await Promise.all(ps.map(async (p) => !/Claim in the next|Next number in/.test(await p.page.innerText("body"))))).every(Boolean));
      await board.page.waitForSelector("#bp-resume:not([disabled])", { timeout: 20000 });
      await board.page.click("#bp-resume"); await board.page.waitForSelector("#bp-sure", { timeout: 5000 }); await board.page.click("#bp-yes");
      for (let i = 0; i < 40; i++) await step();
      t.check("after the resume the numbers run again on every phone", (await Promise.all(ps.map((p) => p.page.evaluate(() => !window.__rt.view().paused)))).every(Boolean));
      for (let k = 0; k < ps.length; k++) await t.shot(ps[k].page, `phone-${SIZES[k][0]}-${k}`);
      await t.shot(board.page, "board-after");
      const widths = await Promise.all(ps.map((p) => p.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
      t.check("no sideways scroll on any of the 5 phone pages (320, 360, 390, 430, 1280)", widths.every(Boolean), JSON.stringify(widths));
    },
  },
];
