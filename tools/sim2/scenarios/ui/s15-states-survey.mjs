// A survey of what a participant sees in every state they can run into (list-only game, full game, ticket on another phone, a second ticket on one phone, removed, cancelled, not open yet, wrong link).
// Writes sim/states-survey.json. Run: node tools/sim2/scenarios/ui/run.mjs --only S15-02
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { H, openConsole, openPeople, joinForm, joinApi, nextPhone } from "./kit.mjs";
/** opens the game link and, if the join form is offered, fills it like a person; if the page shows something else instead, that is what gets recorded */
const guestJoinUi = async (page, eid, phone, name) => { await page.goto(`${H.SIM}/z?e=${eid}`); const form = await page.waitForSelector("[data-cbc='K4'] input[data-box]", { timeout: 6000 }).then(() => true).catch(() => false); if (form) await joinForm(page, phone, name); };

const R = [];
const read = async (page) => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const texts = [...document.querySelectorAll("#app h1,#app h2,#app p,#app .zbanner,#app .zmsg,#app .ctg-inline,#ctg-dialog .ctg-card")].filter(vis).map((e) => e.textContent.replace(/\s+/g, " ").trim()).filter((x) => x.length > 6).slice(0, 8);
  return { texts, buttons: [...document.querySelectorAll("#app button,#app a.zbtn,#ctg-dialog button,#ctg-dialog a")].filter(vis).map((b) => b.textContent.trim().slice(0, 40)).slice(0, 8), guided: !!document.querySelector(".ctg-inline,#ctg-dialog") };
});
const rec = async (id, what, page, ...close) => { await page.waitForTimeout(1800); R.push({ id, what, ...(await read(page)) }); for (const c of close) await c.ctx.close().catch(() => {}); }; // the laptop allows 6 browsers at once: each one is closed when its state is recorded

export default [
  {
    id: "S15-02", name: "Survey: what a participant sees in every state (list-only, full, other phone, second ticket, removed, cancelled, not open, wrong link)",
    async run(t) {
      // P1: a list-only game and a stranger
      const org = await t.org("sp"); const g1 = await t.game(org, { settings: { whoCanJoin: "list" }, pay: true });
      let x = await t.open({ device: "mobile" }); await guestJoinUi(x.page, g1.id, nextPhone(), "Stranger"); await rec("P1", "list-only game, number not on the list", x.page, x);
      // P2: a full game
      const g2 = await org.createGame({ leadMs: 3 * H.HOUR, cfg: { cap: 2 } }); await org.settings(g2.id, { whoCanJoin: "anyone" }); await org.publish(g2.id); await org.pay(g2.id).catch(() => {});
      for (let i = 0; i < 2; i++) await joinApi(g2.id, nextPhone(), "P" + i);
      x = await t.open({ device: "mobile" }); await guestJoinUi(x.page, g2.id, nextPhone(), "Late Larry"); await rec("P2", "game is full", x.page, x);
      // P3: the same number on a second phone
      const g3 = await t.game(org, { settings: { whoCanJoin: "anyone" } }); const ph3 = nextPhone();
      const a = await t.open({ device: "mobile" }); await guestJoinUi(a.page, g3.id, ph3, "Asha"); await a.page.waitForTimeout(1500);
      const b = await t.open({ device: "mobile" }); await guestJoinUi(b.page, g3.id, ph3, "Asha again"); await rec("P3", "same number on a second phone", b.page, b);
      // P4: a second number on the same phone
      await guestJoinUi(a.page, g3.id, nextPhone(), "Second number"); await rec("P4", "a second number on the same phone", a.page, a);
      // P5: a guest who was removed
      const g5 = await t.game(org, { settings: { whoCanJoin: "list" }, pay: true }); const ph5 = nextPhone(); await org.addPeople(g5.id, [{ name: "Rita", phone: ph5 }, { name: "Sam", phone: nextPhone() }]);
      const rp = await t.open({ device: "mobile" }); await guestJoinUi(rp.page, g5.id, ph5, "Rita"); await rp.page.waitForTimeout(1500);
      const c = await openConsole(t, org, g5.id, { device: "laptop" }); await openPeople(c.page);
      const rm = c.page.locator("#sec6 .zc-prow:has-text('Rita') button:has-text('Remove')").first();
      if (await rm.count()) { await rm.click(); await c.page.waitForTimeout(700); const ok = c.page.locator("#sec6 button:has-text('Only this person'), #sec6 button:has-text('Yes,')").first(); if (await ok.count()) { await ok.click(); await c.page.waitForTimeout(900); } }
      await rp.page.reload(); await rec("P5", "a guest who was removed reloads their ticket", rp.page, rp, c);
      // P6: a cancelled game
      const g6 = await t.game(org, { settings: { whoCanJoin: "anyone" } }); await org.cancel(g6.id).catch(() => {});
      x = await t.open({ device: "mobile" }); await x.page.goto(`${H.SIM}/z?e=${g6.id}`); await rec("P6", "a cancelled game's link", x.page, x);
      // P7: a game not published yet
      const g7 = await t.game(org, { publish: false }); x = await t.open({ device: "mobile" }); await x.page.goto(`${H.SIM}/z?e=${g7.id}`); await rec("P7", "a draft game's link (not published)", x.page, x);
      // P8: a wrong link
      x = await t.open({ device: "mobile" }); await x.page.goto(`${H.SIM}/z?e=NOSUCHGAME1`); await rec("P8", "a mistyped game link", x.page, x);
      x = await t.open({ device: "mobile" }); await x.page.goto(`${H.SIM}/z?e=${g1.id}&t=notarealtoken123456`); await rec("P9", "a personal link with a wrong token", x.page);
      writeFileSync(join(H.ROOT, "sim", "states-survey.json"), JSON.stringify(R, null, 1));
      t.check("survey written: " + R.length + " states", R.length >= 8);
    },
  },
];
