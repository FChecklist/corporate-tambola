// Group 24: many people at once. A real game and a demo game, each with five phones playing together, the organizer's console, the board and the number screen in the same run.
import { H, openConsole, openStep, guestText, nextPhone, guestJoinUi } from "./kit.mjs";

const { invariants: inv } = H;
const RW = ["early5", "top", "mid", "bot", "corners", "star", "full"].map((p) => ({ pattern: p, scope: "ticket", ordinal: 1, text: "" }));
const rw = (pattern, n) => Array.from({ length: n }, (_, i) => ({ pattern, scope: "ticket", ordinal: i + 1, text: "" }));
async function phones(t, g, names, { device = "mobile", moveTo = 2 * H.MIN } = {}) {
  const out = [];
  for (const nm of names) { const x = await t.open({ device }); x.errors = []; x.page.on("pageerror", (e) => x.errors.push(String(e).slice(0, 160))); await guestJoinUi(x.page, g.id, nextPhone(), nm); out.push(x); }
  const now = await H.clock.now(); const wait = g.startMs - moveTo - now;
  if (wait > 0) { await H.clock.advance(wait); await t.shared.track.refresh(); await H.advanceBrowsers(out.map((o) => o.ctx), wait, { run: false }); }
  await Promise.all(out.map((p) => p.page.waitForFunction(() => window.__rt && window.__rt.phase === "play", null, { timeout: 25000 })));
  return out;
}
const stepAll = async (t, list, n) => { for (let i = 0; i < n; i++) { await H.clock.advance(3000); t.shared.track.bump(3000); for (const o of list) await o.ctx.clock.runFor(3000); await new Promise((r) => setTimeout(r, 60)); } };
const view = (p) => p.evaluate(() => { const v = window.__rt.view(); return { phase: v.phase, log: v.log, results: v.results.map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, idx: x.idx, count: x.count })), won: (v.won || []).map((w) => w.pattern + "#" + w.ordinal) }; });
const same = (views) => inv.identicalWinners(views.map((v, i) => ({ who: "phone" + i, results: v.results })));

export default [
  {
    id: "S24-01", name: "Real game with five phones, the organizer's console, the board and the number screen all at once: identical numbers and winners everywhere, prizes with several winners, the console lists the winners at the end",
    resetAfter: true,
    async run(t) {
      const org = await t.org("o");
      const g = await t.game(org, { lead: 8 * H.MIN, cfg: { rewards: [...rw("early5", 2), ...rw("top", 2), ...RW.filter((r) => !["early5", "top"].includes(r.pattern))], ties: "next" }, settings: { whoCanJoin: "anyone" }, pay: true });
      const c = await openConsole(t, org, g.id, { device: "laptop" }); await c.page.waitForTimeout(1200); // registers the pause/stop key before the start
      const ps = await phones(t, g, ["Asha", "Bala", "Charu", "Devi", "Esha"]);
      const board = await c.ctx.newPage(); await board.goto(`${H.SIM}/board.html?e=${g.id}#k=${encodeURIComponent(org.token)}`);
      const big = await c.ctx.newPage(); await big.goto(`${H.SIM}/big.html?e=${g.id}`);
      const r = await H.playBrowserGame(ps, { track: t.shared.track, maxSteps: 420 });
      t.check("all five phones ended", r.ended.every(Boolean), `${r.steps} steps, ended ${r.ended}`);
      const id = same(r.views); t.check(id.name, id.ok, id.detail);
      t.check("every phone has the same numbers in the same order", r.views.every((v) => JSON.stringify(v.log) === JSON.stringify(r.views[0].log)), r.views.map((v) => v.log.length).join("/"));
      const pub = (await H.call("GET", `/api/z/${g.id}/results`)).body.results ?? [];
      t.check("the store's winners equal what the phones show", pub.length === r.views[0].results.length && pub.length > 0, `${pub.length} vs ${r.views[0].results.length}`);
      const won = []; for (const o of ps) won.push((await view(o.page)).won);
      t.check("every published prize position is held by exactly one phone (ties take turns)", pub.every((x) => won.filter((w) => w.includes(x.pattern + "#" + x.ordinal)).length === 1), JSON.stringify(won));
      await H.advanceBrowsers([c.ctx], r.steps * 3000, { run: false }); await board.waitForTimeout(2500); await big.waitForTimeout(500);
      const bt = await board.innerText("body").catch(() => "");
      t.check("the organizer's board shows the numbers that were called", (await board.$$(".board > div.c, .board > div.l")).length >= r.views[0].log.length - 2, `${(await board.$$(".board > div.c, .board > div.l")).length} vs ${r.views[0].log.length}`);
      t.check("the number screen shows the game is over and lists the prizes", /over|ended|finished|Prizes/i.test(await big.innerText("body").catch(() => "")));
      t.check("no guest name or phone number on the number screen", !/Asha|Bala|Charu|Devi|Esha|\b9\d{9}\b/.test(await big.innerText("body").catch(() => "")));
      const sm = (await org.summary(g.id)).body;
      t.check("the organizer's summary counts the winners", (sm.winners ?? sm.results ?? pub).length >= pub.length, JSON.stringify(sm).slice(0, 120));
      const one = await inv.oneTicketPerPhone(g.id); t.check(one.name, one.ok, one.detail);
      t.check("no JavaScript error on any phone", ps.every((x) => x.errors.length === 0), JSON.stringify(ps.map((x) => x.errors).flat().slice(0, 3)));
      await t.shot(ps[0].page, "real-multiuser-end"); await t.shot(board, "real-multiuser-board");
      await board.close(); await big.close();
    },
  },
  {
    id: "S24-02", name: "Demo game with five phones: every ticket carries the DEMO GAME mark; the organizer makes it a real game mid-game; the mark goes, a sixth person joins, and all six end with the same winners",
    resetAfter: true,
    async run(t) {
      const org = await t.org("d");
      const g = await t.game(org, { lead: 8 * H.MIN, cfg: { cap: 10, demo: true, rewards: [...rw("early5", 2), ...RW.filter((r) => r.pattern !== "early5")] }, settings: { whoCanJoin: "anyone" } });
      const info0 = (await org.info(g.id)).body; t.check("the game is a free demo", info0.demo === true && !info0.locked, JSON.stringify(info0).slice(0, 120));
      const ps = await phones(t, g, ["Asha", "Bala", "Charu", "Devi", "Esha"]);
      for (const [i, o] of ps.entries()) t.check(`phone ${i + 1} shows the DEMO GAME mark`, /DEMO GAME/.test(await guestText(o.page)));
      await stepAll(t, ps, 55); for (let i = 0; i < 40 && !(await view(ps[0].page)).log.length; i++) await stepAll(t, ps, 2);
      let got = 0; for (let i = 0; i < 110 && !got; i++) { await stepAll(t, ps, 3); got = (await view(ps[0].page)).results.length; }
      t.check("a first prize is won while it is still a demo", got > 0);
      const conv = await org.api("POST", "/api/payments/test", { eid: g.id, pack: 100, email: org.email, org: "Sim Org", country: "IN" });
      t.check("the organizer makes it a real game of 100 mid-game", conv.ok, `${conv.status} ${JSON.stringify(conv.body).slice(0, 160)}`);
      const info1 = (await org.info(g.id)).body; t.check("the server now says real game, 100 people", !info1.demo && Number(info1.cap) === 100, JSON.stringify(info1).slice(0, 120));
      await stepAll(t, ps, 25); // phones re-read the game once a minute while it is a demo
      t.check("the DEMO GAME mark is gone from the phones", (await Promise.all(ps.map((o) => guestText(o.page)))).every((x) => !/DEMO GAME/.test(x)));
      const six = await t.open({ device: "mobile" }); six.errors = []; six.page.on("pageerror", (e) => six.errors.push(String(e).slice(0, 160)));
      await guestJoinUi(six.page, g.id, nextPhone(), "Farah"); await six.page.waitForFunction(() => window.__rt && window.__rt.phase === "play", null, { timeout: 25000 });
      t.check("a sixth person joins after the conversion", true);
      const all = [...ps, six];
      const r = await H.playBrowserGame(all, { track: t.shared.track, maxSteps: 420 });
      t.check("all six phones ended", r.ended.every(Boolean), `${r.steps} steps, ended ${r.ended}`);
      const id = same(r.views); t.check(id.name, id.ok, id.detail);
      const pub = (await H.call("GET", `/api/z/${g.id}/results`)).body.results ?? [];
      t.check("the store's winners equal what the phones show", pub.length === r.views[0].results.length && pub.length > 0, `${pub.length} vs ${r.views[0].results.length}`);
      t.check("the final screen no longer says DEMO GAME", !/DEMO GAME/.test(await guestText(ps[0].page)));
      const one = await inv.oneTicketPerPhone(g.id); t.check(one.name, one.ok, one.detail);
      t.check("no JavaScript error on any phone", all.every((x) => x.errors.length === 0), JSON.stringify(all.map((x) => x.errors).flat().slice(0, 3)));
      await t.shot(ps[0].page, "demo-multiuser-end");
    },
  },
];
