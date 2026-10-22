// Group 19: the DEMO GAME in real Chrome. A free game for up to 10 people on real phones, DEMO GAME on every screen, the 11th guest told kindly, two phones playing to the end
// with the watermark, "Make this a real game" during the game (the 11th then joins) and after it (a real game like this one), and the conversion payment failing once (500) with the guide's Try again.
// Run: node tools/sim2/scenarios/ui/run.mjs --only S19-
import { H, openConsole, openStep, saveStep, uiPublish, payOnPage, payStatus, guestJoinUi, guestText, joinApi, nextPhone } from "./kit.mjs";

const { invariants: inv } = H;
const ALL_RW = ["early5", "top", "mid", "bot", "corners", "star", "full"].map((p) => ({ pattern: p, scope: "ticket", ordinal: 1, text: "" }));
const DEMO_MSG = /A demo game is for up to 10 people/;
/** a published demo game (free) starting in `lead` ms, open to anyone with the link */
const demoGame = (t, org, { lead = 8 * H.MIN, cfg = {} } = {}) => t.game(org, { lead, cfg: { cap: 10, demo: true, rewards: ALL_RW, ...cfg }, settings: { whoCanJoin: "anyone" }, publish: true, pay: false });
/** opens one Chrome phone per name, joins through the form, moves the clocks to `moveTo` before the start and waits for play */
async function phones(t, g, names, { moveTo = 2 * H.MIN } = {}) {
  const out = [];
  for (const nm of names) { const x = await t.open({ device: "mobile" }); await guestJoinUi(x.page, g.id, nextPhone(), nm); out.push(x); }
  const now = await H.clock.now(); const wait = g.startMs - moveTo - now;
  if (wait > 0) { await H.clock.advance(wait); await t.shared.track.refresh(); await H.advanceBrowsers(out.map((o) => o.ctx), wait, { run: false }); }
  await Promise.all(out.map((p) => p.page.waitForFunction(() => window.__rt && window.__rt.phase === "play", null, { timeout: 25000 })));
  return out;
}
const stepAll = async (t, n, list) => { for (let i = 0; i < n; i++) { await H.clock.advance(3000); t.shared.track.bump(3000); for (const o of list) await o.ctx.clock.runFor(3000); await new Promise((r) => setTimeout(r, 60)); } };
const row = async (eid) => (await H.sql("SELECT cap, pack, config FROM engagement WHERE id=?", [eid]))[0];
const isDemoRow = (r) => { try { return JSON.parse(r.config).demo === true; } catch { return false; } };
const payRows = async (eid) => (await H.sql("SELECT COUNT(*) c FROM payment WHERE eid=?", [eid]))[0].c;
/** the guide as the person sees it: in place or as a pop-up */
async function guide(page, { wait = 4000 } = {}) {
  await page.waitForFunction(() => document.querySelector(".ctg-inline, #ctg-dialog"), null, { timeout: wait }).catch(() => {});
  return page.evaluate(() => {
    const el = document.querySelector("#ctg-dialog .ctg-card") || document.querySelector(".ctg-inline"); if (!el) return null;
    return { popup: !!el.closest("#ctg-dialog"), title: (el.querySelector("b,h2") || {}).textContent || "", text: el.textContent.replace(/\s+/g, " ").trim(), steps: el.querySelectorAll("li").length, buttons: [...el.querySelectorAll("button,a")].map((b) => b.textContent.trim()) };
  });
}
const convert = (org, eid, pack) => org.api("POST", "/api/payments/test", { eid, pack, email: org.email, org: "Sim Org", country: "IN" });
const hasWatermark = (page) => page.evaluate(() => { const el = document.querySelector(".zticket.zdemogame"); if (!el) return false; const cs = getComputedStyle(el, "::after"); return cs.content.includes("DEMO GAME") && parseFloat(cs.width) > 0; });

export default [
  {
    id: "S19-01", name: "Make a demo in the console: tick the demo chip in step 2 (the size drops to 10, bigger sizes vanish), 12 people is refused in place by the guide, publishing is free: DEMO GAME badge, no payment pending, no payment row, a DEMO GAME mail",
    async run(t) {
      const org = await t.org("d1"); const g = await t.game(org, { publish: false, cfg: { cap: 100 } });
      const c = await openConsole(t, org, g.id, { device: "laptop" }); const P = c.page;
      await openStep(P, 2); await P.waitForSelector('[data-ck="demo"][data-v="1"]');
      t.check("S19-01a: step 2 asks whether this is a free demo game, next to the number of people", /Is this a free demo game/.test(await t.text(P, "#sec2")));
      await P.click('[data-ck="demo"][data-v="1"]'); await P.waitForTimeout(300);
      t.check("S19-01b: with the demo on, the size chips stop at 10 and the big packs are gone", !!(await P.$('[data-ck="cap"][data-v="10"]')) && !(await P.$('[data-ck="cap"][data-v="250"]')), await t.text(P, "#gl-cap"));
      t.check("S19-01c: the number typed earlier (100) came down to 10 by itself", (await P.inputValue("#f-cap")) === "10", await P.inputValue("#f-cap"));
      await saveStep(P, 2);
      const s1 = (await org.summary(g.id)).body; t.check("S19-01d: saved as a demo of 10 (the server says so)", s1.demo === true && s1.limit === 10 && /DEMO GAME/.test(s1.status), JSON.stringify({ demo: s1.demo, limit: s1.limit, status: s1.status }));
      await openStep(P, 2); await P.fill("#f-cap", "12"); await P.click('#sec2 [data-save="2"]');
      const gd = await guide(P);
      t.check("S19-01e: 12 people in a demo is refused in place, politely, with steps and no pop-up", !!gd && !gd.popup && DEMO_MSG.test(gd.title) && gd.steps >= 1, gd && gd.title);
      t.check("S19-01f: the rule held: the game is still a demo of 10", (await org.summary(g.id)).body.limit === 10);
      await P.fill("#f-cap", "8"); await saveStep(P, 2);
      t.check("S19-01g: 8 people is fine", (await org.summary(g.id)).body.limit === 8);
      await uiPublish(P, org.email);
      const pill = await t.text(P, "#paypill").catch(() => "");
      t.check("S19-01h: after publishing the header carries the DEMO GAME badge and the payment pill says DEMO GAME, free", !!(await P.$("#demopill")) && /DEMO GAME/.test(pill) && /free/i.test(pill), pill);
      const body = await t.text(P);
      t.check("S19-01i: no 'payment pending' anywhere on the console", !/payment pending|payment is pending|Pay now/i.test(body));
      const r = await row(g.id);
      t.check("S19-01j: published free: the game is 'paid' with its own size, nothing was bought, no payment row", r.pack === 8 && r.cap === 8 && isDemoRow(r) && (await payRows(g.id)) === 0, JSON.stringify(r).slice(0, 120));
      const mails = await H.mailbox.list({ to: org.email });
      t.check("S19-01k: the publish mail says DEMO GAME and free, never payment pending", mails.some((m) => /DEMO GAME/.test(m.subject) && /free/.test(m.subject)) && !mails.some((m) => /payment pending/i.test(m.subject)), mails.map((m) => m.subject).join(" | ").slice(0, 240));
      await openStep(P, 8); const t8 = await t.text(P, "#sec8");
      t.check("S19-01l: step 8 offers Make this a real game with the packs instead of a payment", /Make this a real game/.test(t8) && /Up to 100 people/.test(t8) && !!(await P.$("#makerealgo")), t8.slice(0, 200));
      await t.shot(P, "console-demo");
    },
  },
  {
    id: "S19-02", name: "Ten phones join a demo (one of them a real Chrome phone that sees the watermark); the eleventh phone is told kindly that the game is full, with the guide",
    async run(t) {
      const org = await t.org("d2"); const g = await demoGame(t, org);
      for (let i = 0; i < 9; i++) { const r = await joinApi(g.id, nextPhone(), "P" + i); if (!r.ok) t.note("join " + i + " " + r.status); }
      const ten = await t.open({ device: "mobile" }); await guestJoinUi(ten.page, g.id, nextPhone(), "Tenth Tina");
      await ten.page.waitForFunction(() => window.__rt && window.__rt.phase === "play", null, { timeout: 20000 });
      const txt = await guestText(ten.page);
      t.check("S19-02a: the tenth person is in and sees DEMO GAME on the page", /DEMO GAME/.test(txt) && !/game is full/i.test(txt), txt.slice(0, 200));
      t.check("S19-02b: the ticket carries the diagonal DEMO GAME watermark", await hasWatermark(ten.page));
      t.check("S19-02c: nothing about payment on a guest's phone", !/pay|unpaid|invoice/i.test(txt));
      await t.shot(ten.page, "phone-demo-ticket");
      t.check("S19-02d: ten people are in", (await H.sql("SELECT COUNT(*) c FROM participant WHERE eid=?", [g.id]))[0].c === 10);
      const x = await t.open({ device: "mobile" });
      await guestJoinUi(x.page, g.id, nextPhone(), "Eleventh Ed"); await x.page.waitForTimeout(2500);
      const t11 = await guestText(x.page);
      t.check("S19-02e: the eleventh is told the game is full and is not in", /full/i.test(t11) && !/YOU ARE IN/i.test(t11), t11.slice(0, 240));
      const gd = await guide(x.page, { wait: 2000 });
      t.check("S19-02f: the guide explains it for a guest, with no button into the Organizer's console", !!gd && /full/i.test(gd.title + gd.text) && !gd.buttons.some((b) => /Number of participants|console/i.test(b)), gd && (gd.title + " | " + gd.buttons.join("|")));
      t.check("S19-02g: still ten people", (await H.sql("SELECT COUNT(*) c FROM participant WHERE eid=?", [g.id]))[0].c === 10);
      await t.shot(x.page, "phone-demo-full");
    },
  },
  {
    id: "S19-03", name: "A demo made by the API publishes free from the console: step 7 says nothing to pay, the pay page offers Make this a real game, the number screen and the board carry the badge",
    async run(t) {
      const org = await t.org("d3"); const g = await t.game(org, { publish: false, cfg: { cap: 10, demo: true } });
      const c = await openConsole(t, org, g.id, { device: "laptop" }); const P = c.page;
      await openStep(P, 7); const t7 = await t.text(P, "#sec7");
      t.check("S19-03a: step 7 says this is a DEMO GAME with nothing to pay", /DEMO GAME/.test(t7) && /nothing to pay/i.test(t7), t7.slice(0, 200));
      await uiPublish(P, org.email);
      t.check("S19-03b: published free (API: paid, demo, status says DEMO GAME)", (await payStatus(org, g.id)) === "paid" && (await org.summary(g.id)).body.demo === true, (await org.summary(g.id)).body.status);
      t.check("S19-03c: no payment row, no invoice", (await payRows(g.id)) === 0 && (await H.sql("SELECT COUNT(*) c FROM invoice WHERE payment_id IN (SELECT id FROM payment WHERE eid=?)", [g.id]))[0].c === 0);
      const pay = await t.open({ device: "laptop", token: org.token });
      await pay.page.goto(`${H.SIM}/pay.html?e=${g.id}`); await pay.page.waitForSelector("#paygo", { timeout: 15000 });
      const tp = await t.text(pay.page); t.note("pay page: " + tp.slice(tp.indexOf("DEMO GAME"), tp.indexOf("DEMO GAME") + 280));
      t.check("S19-03d: the pay page says Make this a real game and lets the payer pick the size; it does not say payment pending", /Make this a real game/i.test(tp) && /Up to 100/.test(tp) && /Up to 250/.test(tp) && !/Payment pending|already paid and published/i.test(tp), tp.slice(0, 200));
      await t.shot(pay.page, "pay-make-real");
      const big = await t.open({ device: "wide" }); await big.page.goto(`${H.SIM}/big.html?e=${g.id}`); await big.page.waitForSelector("#demogame", { timeout: 10000 }).catch(() => {});
      t.check("S19-03e: the number screen shows the DEMO GAME badge", /DEMO GAME/.test(await guestText(big.page)), (await guestText(big.page)).slice(0, 120));
      await t.shot(big.page, "big-demo");
      const board = await t.open({ device: "laptop" }); await board.page.goto(`${H.SIM}/board.html?e=${g.id}#k=${encodeURIComponent(org.token)}`); await board.page.waitForSelector("#demogame", { timeout: 10000 }).catch(() => {});
      t.check("S19-03f: the organizer's board shows the DEMO GAME badge", /DEMO GAME/.test(await guestText(board.page)), (await guestText(board.page)).slice(0, 120));
    },
  },
  {
    id: "S19-04", name: "Two Chrome phones play a demo to the end: the watermark stays all through, both end, identical winners, the final screen still says DEMO GAME",
    async run(t) {
      const org = await t.org("d4"); const g = await demoGame(t, org);
      const ps = await phones(t, g, ["Asha", "Bala"]);
      t.check("S19-04a: both phones show the watermark while waiting for the first number", (await hasWatermark(ps[0].page)) && (await hasWatermark(ps[1].page)));
      const r = await H.playBrowserGame(ps, { track: t.shared.track });
      t.check("S19-04b: both phones reached the end", r.ended.every(Boolean), `${r.steps} steps, ended ${r.ended}`);
      const id = inv.identicalWinners(r.views.map((v, i) => ({ who: "phone" + i, results: v.results }))); t.check(id.name, id.ok && r.views[0].results.length > 0, id.detail);
      const txt = await guestText(ps[0].page);
      t.check("S19-04c: the final screen says Game complete and DEMO GAME", /Game complete/i.test(txt) && /DEMO GAME/.test(txt), txt.slice(0, 200));
      t.check("S19-04d: the watermark is still on the ticket at the end", await hasWatermark(ps[0].page));
      const r2 = await row(g.id); t.check("S19-04e: still a free demo: no payment row, the mark stays", isDemoRow(r2) && (await payRows(g.id)) === 0);
      await t.shot(ps[0].page, "phone-demo-end");
    },
  },
  {
    id: "S19-05", name: "Make this a real game DURING the demo: the game carries on (same numbers), the watermark goes within a minute, the number screen drops its badge, an eleventh person joins, the console says Paid",
    async run(t) {
      const org = await t.org("d5"); const g = await demoGame(t, org, { lead: 9 * H.MIN });
      const ps = await phones(t, g, ["Chand", "Dev"]);
      for (let i = 0; i < 8; i++) await joinApi(g.id, nextPhone(), "P" + i); // the demo is full (10)
      const big = await t.open({ device: "wide" }); await big.page.goto(`${H.SIM}/big.html?e=${g.id}`); await big.page.waitForTimeout(1500);
      await stepAll(t, 115, [...ps, big]); // 2 minutes to the start, 2 minutes of setting up, then numbers are being called
      const before = await ps[0].page.evaluate(() => window.__rt.view().log.length);
      t.check("S19-05a: numbers are being called on a demo phone", before > 0, String(before));
      t.check("S19-05b: an eleventh guest is still refused while it is a demo", !(await joinApi(g.id, nextPhone(), "Late")).ok);
      const c = await convert(org, g.id, 100);
      t.check("S19-05c: the conversion payment (pack 100) is accepted and says converted", c.ok && c.body.result && c.body.result.converted === true && c.body.result.pack === 100, `${c.status} ${JSON.stringify(c.body).slice(0, 160)}`);
      const r = await row(g.id);
      t.check("S19-05d: the game is now a real game of 100, the demo mark gone, one paid payment", r.pack === 100 && r.cap === 100 && !isDemoRow(r) && (await payRows(g.id)) === 1, JSON.stringify(r).slice(0, 100));
      const eleventh = await joinApi(g.id, nextPhone(), "Eleventh Ella");
      t.check("S19-05e: the eleventh person joins now", eleventh.ok, `${eleventh.status}`);
      await stepAll(t, 25, [...ps, big]); // a minute and a bit of game time: the phones re-read the settings
      t.check("S19-05f: the watermark is gone from both phones within a minute, and the numbers went on", !(await hasWatermark(ps[0].page)) && !(await hasWatermark(ps[1].page)) && (await ps[0].page.evaluate(() => window.__rt.view().log.length)) > before, String(await ps[0].page.evaluate(() => window.__rt.view().log.length)));
      t.check("S19-05g: the phones no longer say DEMO GAME", !/DEMO GAME/.test(await guestText(ps[0].page)), (await guestText(ps[0].page)).slice(0, 160));
      t.check("S19-05h: the number screen dropped its badge", !/DEMO GAME/.test(await guestText(big.page)), (await guestText(big.page)).slice(0, 120));
      const sum = (await org.summary(g.id)).body;
      t.check("S19-05i: the console's summary: published and paid, 100 people, the start time unchanged", sum.status === "published and paid" && sum.limit === 100 && sum.startRound === g.startRound && sum.demo === undefined, JSON.stringify({ status: sum.status, limit: sum.limit }));
      const con = await openConsole(t, org, g.id, { device: "laptop" });
      t.check("S19-05j: the console pill reads Paid and the DEMO GAME badge is gone", /\bPaid\b/.test(await t.text(con.page, "#paypill")) && !(await con.page.$("#demopill")), await t.text(con.page, "#paypill"));
      const mail = await H.mailbox.list({ to: org.email, subject: "payment received" });
      t.check("S19-05k: the payment mail says the demo is now a real game for up to 100 people", mail.some((m) => /demo game is now a real game for up to 100 people/.test(m.text)), mail.map((m) => m.subject).join("|").slice(0, 160));
      await t.shot(ps[0].page, "phone-converted");
    },
  },
  {
    id: "S19-06", name: "After the demo has ended: step 8 offers Make a real game like this one; it makes a NEW real draft (no demo mark, same prizes), nothing paid or published, ready for the usual publish and pay",
    async run(t) {
      const org = await t.org("d6"); const g = await demoGame(t, org, { cfg: { rewards: [{ pattern: "full", scope: "ticket", ordinal: 1, text: "Hamper" }] } });
      const ps = await phones(t, g, ["Esha", "Faiz"]);
      const r = await H.playBrowserGame(ps, { track: t.shared.track });
      t.check("S19-06a: the demo ended on both phones", r.ended.every(Boolean), `${r.steps} steps`);
      await H.clock.advanceWithTicks(5 * H.MIN, H.MIN); await t.shared.track.refresh();
      const c = await openConsole(t, org, g.id, { device: "laptop" }); const P = c.page;
      await openStep(P, 8); await P.waitForSelector("#makereal", { timeout: 10000 });
      const t8 = await t.text(P, "#sec8");
      t.check("S19-06b: after the end step 8 offers Make a real game like this one (no mid-game conversion any more)", /Make a real game like this one/.test(t8) && !!(await P.$("#makerealclone")) && !(await P.$("#makerealgo")), t8.slice(0, 200));
      await P.click("#makerealclone"); await P.waitForSelector("#clonego", { timeout: 8000 });
      const panel = await t.text(P, "#clonepanel");
      t.check("S19-06c: the panel says it is a real game, not a demo, to publish and pay for", /real game, not a demo/i.test(panel) && /pay/i.test(panel), panel.slice(0, 200));
      await P.click("#clonego"); await P.waitForFunction((old) => new URL(location.href).searchParams.get("e") && new URL(location.href).searchParams.get("e") !== old, g.id, { timeout: 15000 });
      const nid = new URL(P.url()).searchParams.get("e"); await P.waitForSelector(".zc-sech", { timeout: 15000 }); await P.waitForTimeout(1200);
      const s = (await org.summary(nid)).body;
      t.check("S19-06d: the new game is a draft, not a demo, not paid, with the same prize", s.status === "draft" && s.demo === undefined && s.paid === false && (s.rewards || []).some((x) => x.text === "Hamper"), JSON.stringify({ status: s.status, demo: s.demo, paid: s.paid }));
      t.check("S19-06e: the console of the new game shows no DEMO GAME badge and says it is a new game with nothing paid or published", !(await P.$("#demopill")) && /Nothing is paid or published yet/.test(await t.text(P)), (await t.text(P)).slice(0, 160));
      await openStep(P, 2); await P.waitForSelector('[data-ck="demo"][data-v="0"]');
      t.check("S19-06f: step 2 of the new game has the demo chip off and the big packs back", (await P.getAttribute('[data-ck="demo"][data-v="0"]', "class")).includes("on") && !!(await P.$('[data-ck="cap"][data-v="250"]')));
      const r2 = await row(g.id); t.check("S19-06g: the old demo is untouched (still a free demo, no payment)", isDemoRow(r2) && (await payRows(g.id)) === 0);
      await t.shot(P, "console-after-clone");
    },
    resetAfter: true,
  },
  {
    id: "S19-07", name: "Exception: the conversion payment fails on our side (500): the guide says it is not the person's doing, nothing is charged, offers Try again; Try again then really makes it a real game",
    async run(t) {
      const org = await t.org("d7"); const g = await demoGame(t, org, { lead: 3 * H.HOUR });
      const x = await t.open({ device: "laptop", token: org.token }); const P = x.page;
      await P.goto(`${H.SIM}/pay.html?e=${g.id}&pack=250`); await P.waitForSelector("#paygo", { timeout: 15000 });
      t.check("S19-07a: the pack chosen in the console (250) is pressed on the pay page", (await P.getAttribute('[data-pack="250"]', "aria-pressed")) === "true" && /Up to 250/.test(await t.text(P, ".pgame")), await t.text(P, ".pgame"));
      await P.route("**/api/checkout", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Something went wrong. Please try again.", code: "server-error" }) }));
      await payOnPage(P, { email: org.email });
      const gd = await guide(P);
      t.check("S19-07b: a pop-up explains it is on our side, not the person's doing, with Try again and a WhatsApp message with a reference", !!gd && gd.popup && /on our side/i.test(gd.title) && /not your doing/i.test(gd.text) && gd.buttons.includes("Try again") && /Reference:/.test(gd.text), gd && (gd.title + " | " + gd.buttons.join("|")));
      t.check("S19-07c: nothing was charged and the game is still a free demo", (await payRows(g.id)) === 0 && isDemoRow(await row(g.id)));
      await P.unroute("**/api/checkout"); x.mon.clear(); // the 500 above was made on purpose
      await P.click('#ctg-dialog [data-ctg="retry"]');
      await t.until(async () => (await payStatus(org, g.id)) === "paid", { what: "paid after Try again", timeout: 15000 });
      const r = await row(g.id);
      t.check("S19-07d: Try again really made it a real game of 250", r.pack === 250 && r.cap === 250 && !isDemoRow(r) && (await payRows(g.id)) === 1, JSON.stringify(r).slice(0, 100));
      await P.reload(); await P.waitForTimeout(2000);
      t.check("S19-07e: the pay page now says it is paid and published, and cannot pay again", /already paid and published/i.test(await t.text(P)) && !(await P.$("#paygo")), (await t.text(P)).slice(0, 160));
      await t.shot(P, "pay-after-retry");
    },
  },
  {
    id: "S19-08", name: "The pay page conversion as a person: pick another pack on the page, pay (test payment), the page says the demo is now a real game, the console shows Paid and the DEMO GAME badge is gone",
    async run(t) {
      const org = await t.org("d8"); const g = await demoGame(t, org, { lead: 3 * H.HOUR });
      const x = await t.open({ device: "mobile", token: org.token }); const P = x.page;
      await P.goto(`${H.SIM}/pay.html?e=${g.id}&pack=100`); await P.waitForSelector("#paygo", { timeout: 15000 });
      await P.click('[data-pack="500"]'); await P.waitForTimeout(400);
      t.check("S19-08a: another pack can be picked on the page and the amount follows", /Up to 500/.test(await t.text(P, ".pgame")) && /4,699/.test(await t.text(P, "#paygo")), await t.text(P, "#paygo"));
      await payOnPage(P, { email: org.email });
      await P.waitForFunction(() => /PAYMENT RECEIVED/i.test(document.body.innerText), null, { timeout: 15000 });
      const done = await t.text(P);
      t.check("S19-08b: the done page says the demo game is now a real game for up to 500, with an invoice", /demo game is now a real game/i.test(done) && /500/.test(done) && /invoice/i.test(done), done.slice(0, 220));
      const r = await row(g.id); t.check("S19-08c: 500 people, the demo mark gone, one payment", r.pack === 500 && r.cap === 500 && !isDemoRow(r) && (await payRows(g.id)) === 1, JSON.stringify(r).slice(0, 100));
      const c = await openConsole(t, org, g.id, { device: "laptop" });
      t.check("S19-08d: the console pill reads Paid, no DEMO GAME badge, no demo block in step 8", /\bPaid\b/.test(await t.text(c.page, "#paypill")) && !(await c.page.$("#demopill")), await t.text(c.page, "#paypill"));
      await openStep(c.page, 8); await c.page.waitForTimeout(500);
      t.check("S19-08e: step 8 shows the paid row and no Make this a real game", !(await c.page.$("#makereal")) && /Paid/.test(await t.text(c.page, "#sec8")), (await t.text(c.page, "#sec8")).slice(0, 160));
      await t.shot(P, "pay-converted-mobile");
    },
  },
];
