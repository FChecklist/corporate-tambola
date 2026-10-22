// Group 18: many winners for every prize (the organizer decides), the two tie rules, the live prizes list (open first, claimed crossed out),
// what a player sees (only the number just called: no earlier numbers, no board) and the organizer-only board.
import { H, openConsole, openStep, guestText, nextPhone, guestJoinUi, saveStep, chip } from "./kit.mjs";

const { invariants: inv } = H;
const rw = (pattern, n, scope = "ticket") => Array.from({ length: n }, (_, i) => ({ pattern, scope, ordinal: i + 1, text: "" }));

async function phones(t, g, names, { device = "mobile", moveTo = 2 * H.MIN } = {}) {
  const out = [];
  for (const nm of names) { const x = await t.open({ device }); await guestJoinUi(x.page, g.id, nextPhone(), nm); out.push(x); }
  const now = await H.clock.now(); const wait = g.startMs - moveTo - now;
  if (wait > 0) { await H.clock.advance(wait); await t.shared.track.refresh(); await H.advanceBrowsers(out.map((o) => o.ctx), wait, { run: false }); }
  await Promise.all(out.map((p) => p.page.waitForFunction(() => window.__rt && window.__rt.phase === "play", null, { timeout: 25000 })));
  return out;
}
const stepAll = async (t, list, n) => { for (let i = 0; i < n; i++) { await H.clock.advance(3000); t.shared.track.bump(3000); for (const o of list) await o.ctx.clock.runFor(3000); await H.tapAlong(list); await new Promise((r) => setTimeout(r, 60)); } };
const view = (p) => p.evaluate(() => { const v = window.__rt.view(); return { phase: v.phase, log: v.log, results: v.results.map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, idx: x.idx, count: x.count, winners: x.winners })), won: (v.won || []).map((w) => w.pattern + "#" + w.ordinal) }; });
const wonOf = async (ps) => { const out = []; for (const o of ps) out.push((await view(o.page)).won); return out; };

export default [
  {
    id: "S18-01", name: "Step 3: the organizer types 7 winners for the Top Line, taps 3 for the Full House, picks the tie rule; the game keeps exactly that and the console shows it again",
    async run(t) {
      const org = await t.org("o"); const g = await t.game(org, { lead: 3 * H.HOUR, publish: false });
      const c = await openConsole(t, org, g.id, { device: "laptop" }); await openStep(c.page, 3);
      const on = await c.page.$eval('[data-hc="top"]', (e) => e.checked).catch(() => false);
      if (!on) await c.page.click('[data-hc="top"]'); // make sure the Top Line is ticked
      if (!(await c.page.$('[data-ck="hs.top.n"]'))) { await c.page.waitForSelector('[data-ph="top"]', { timeout: 8000 }); await c.page.click('[data-ph="top"]'); }
      await c.page.waitForSelector("#f-hs-top-n", { timeout: 8000 });
      await c.page.fill("#f-hs-top-n", "7"); await c.page.dispatchEvent("#f-hs-top-n", "input");
      t.check("the typed count is kept in the form", (await c.page.inputValue("#f-hs-top-n")) === "7");
      await c.page.click('[data-ph="full"]'); await c.page.waitForSelector('[data-ck="hs.full.n"][data-v="3"]'); await chip(c.page, "hs.full.n", "3");
      t.check("the tie rule offers the two plain choices", !!(await c.page.$('[data-ck="ties"][data-v="next"]')) && !!(await c.page.$('[data-ck="ties"][data-v="share"]')));
      await chip(c.page, "ties", "share"); t.check("choosing share explains it", /Everyone who finishes on the same number wins that same prize/.test(await t.text(c.page)));
      await chip(c.page, "ties", "next"); t.check("choosing next explains the public order", /fixed, public order/.test(await t.text(c.page)));
      await saveStep(c.page, 3);
      const s = (await org.summary(g.id)).body;
      t.check("the game has 7 Top Line winners and 3 Full House winners", s.rewards.filter((r) => r.pattern === "top").length === 7 && s.rewards.filter((r) => r.pattern === "full").length === 3, JSON.stringify(s.rewards.map((r) => r.pattern + r.ordinal)));
      t.check("the game keeps the tie rule", s.ties === "next", String(s.ties));
      await c.page.reload(); await c.page.waitForSelector(".zc-sech"); await openStep(c.page, 3);
      t.check("reopening shows 7 winners for the Top Line", /7 winners/.test(await t.text(c.page)), (await t.text(c.page)).slice(0, 300));
      await t.shot(c.page, "step3-winners");
    },
  },
  {
    id: "S18-02", name: "Ties take turns: 5 phones, Top Line with 3 prizes and Full House with 2; every prize position has one winner in order; the live prizes list puts open prizes first and crosses out claimed ones; a player sees no earlier numbers and no board",
    resetAfter: true,
    async run(t) {
      const org = await t.org("o");
      const g = await t.game(org, { lead: 8 * H.MIN, cfg: { rewards: [...rw("top", 3), ...rw("full", 2)], ties: "next" }, settings: { whoCanJoin: "anyone" }, pay: true });
      const ps = await phones(t, g, ["Asha", "Bala", "Charu", "Devi", "Esha"]);
      // what a player sees while numbers are called (the phones stand 2 minutes before the start: walk past the first numbers)
      await stepAll(t, ps, 55);
      const p0 = ps[0].page; for (let i = 0; i < 40 && !(await view(p0)).log.length; i++) await stepAll(t, ps, 2);
      t.check("no board of all the numbers on a player's phone", !(await p0.$(".zboard")), "found .zboard");
      t.check("no row of earlier numbers on a player's phone", !(await p0.$(".zlast")), "found .zlast");
      const big = await p0.$eval(".zcall .zbig", (e) => e.textContent.replace(/\D/g, "")).catch(() => "");
      const lg = (await view(p0)).log;
      t.check("the big ball shows the number just called", lg.length > 0 && String(lg[lg.length - 1]) === big, `${big} vs ${lg.slice(-1)}`);
      t.check("the live prizes list is on the phone with every prize still open", (await p0.$$(".zps li")).length === 5 && (await p0.$$(".zps li.done")).length === 0);
      // run until the first prize is published, then look at the list
      let got = 0; for (let i = 0; i < 110 && !got; i++) { await stepAll(t, ps, 3); got = (await view(p0)).results.length; }
      t.check("a first prize is published", got > 0);
      if (got) {
        await stepAll(t, ps, 1);
        const lis = await p0.$$eval(".zps li", (els) => els.map((e) => ({ done: e.classList.contains("done"), struck: !!e.querySelector("s"), tag: (e.querySelector("small") || {}).textContent || "", text: e.textContent.trim() })));
        const firstDone = lis.findIndex((x) => x.done), lastOpen = lis.map((x) => !x.done).lastIndexOf(true);
        t.check("the open prizes are on top and the claimed ones below", firstDone > 0 && lastOpen < firstDone, JSON.stringify(lis.map((x) => (x.done ? "C" : "o")).join("")));
        t.check("a claimed prize is crossed out with a small 'claimed'", lis.filter((x) => x.done).every((x) => x.struck && /claimed/.test(x.tag)), JSON.stringify(lis.filter((x) => x.done)));
        t.check("the heading counts the prizes still to win", /Prizes still to win.{0,4}\d+/i.test(await guestText(p0)), (await guestText(p0)).slice(0, 160));
        await t.shot(p0, "prizes-list-mid-game");
      }
      const r = await H.playBrowserGame(ps, { track: t.shared.track, maxSteps: 360 });
      t.check("all five phones ended", r.ended.every(Boolean), `${r.steps} steps, ended ${r.ended}`);
      const id = inv.identicalWinners(r.views.map((v, i) => ({ who: "phone" + i, results: v.results }))); t.check(id.name, id.ok, id.detail);
      const top = r.views[0].results.filter((x) => x.pattern === "top").sort((a, b) => a.ordinal - b.ordinal);
      t.check("Top Line: 3 prize positions, each with exactly one winner", top.length === 3 && top.every((x) => x.count === 1), JSON.stringify(top));
      t.check("the positions go 1st, 2nd, 3rd at the same or later calls", top.every((x, i) => x.ordinal === i + 1 && (i === 0 || x.idx >= top[i - 1].idx)), JSON.stringify(top));
      const pub = (await H.call("GET", `/api/z/${g.id}/results`)).body.results ?? [];
      t.check("the store names the winner of each position (opaque ticket ids only, never a number)", pub.filter((x) => x.pattern === "top").every((x) => Array.isArray(x.winners) && x.winners.length === 1) && !/\b[6-9]\d{9}\b/.test(JSON.stringify(pub)), JSON.stringify(pub).slice(0, 200));
      const wonBy = (await wonOf(ps)).map((w) => w.filter((x) => x.startsWith("top#")));
      t.check("three different phones each hold one Top Line prize, nobody holds two", wonBy.filter((w) => w.length === 1).length === 3 && wonBy.every((w) => w.length <= 1), JSON.stringify(wonBy));
      const one = await inv.oneTicketPerPhone(g.id); t.check(one.name, one.ok, one.detail);
    },
  },
  {
    id: "S18-03", name: "Ties share: the same game with the sharing rule; each prize position is a later call, and people finishing together share it",
    resetAfter: true,
    async run(t) {
      const org = await t.org("o");
      const g = await t.game(org, { lead: 8 * H.MIN, cfg: { rewards: [...rw("top", 3), ...rw("early5", 2), ...rw("full", 1)], ties: "share" }, settings: { whoCanJoin: "anyone" }, pay: true });
      const ps = await phones(t, g, ["Asha", "Bala", "Charu", "Devi"]);
      const r = await H.playBrowserGame(ps, { track: t.shared.track, maxSteps: 360 });
      t.check("all phones ended", r.ended.every(Boolean), `${r.steps} steps`);
      const id = inv.identicalWinners(r.views.map((v, i) => ({ who: "phone" + i, results: v.results }))); t.check(id.name, id.ok, id.detail);
      const top = r.views[0].results.filter((x) => x.pattern === "top").sort((a, b) => a.ordinal - b.ordinal);
      t.check("each Top Line position is at a strictly later call than the one before", top.every((x, i) => i === 0 || x.idx > top[i - 1].idx), JSON.stringify(top));
      t.check("positions are numbered from 1 without gaps", top.every((x, i) => x.ordinal === i + 1), JSON.stringify(top));
      const pub = (await H.call("GET", `/api/z/${g.id}/results`)).body.results ?? [];
      t.check("with the sharing rule the store shows counts, no winner ids for a house", pub.filter((x) => x.pattern === "top").every((x) => x.winners === undefined), JSON.stringify(pub).slice(0, 200));
      const won = (await wonOf(ps)).flat();
      t.check("every published prize position is held by at least one phone", top.every((x) => won.includes("top#" + x.ordinal)), JSON.stringify(won));
    },
  },
  {
    id: "S18-04", name: "Only the organizer has the board: the board page without the key says so; with the key it shows the 90 numbers; the number screen shows the prizes and no board",
    async run(t) {
      const org = await t.org("o"); const g = await t.game(org, { lead: 6 * H.MIN, cfg: { rewards: rw("full", 1) }, settings: { whoCanJoin: "anyone" }, pay: true });
      const ps = await phones(t, g, ["Asha", "Bala"]); await stepAll(t, ps, 55);
      for (let i = 0; i < 40 && !(await view(ps[0].page)).log.length; i++) await stepAll(t, ps, 2);
      const ck = await H.call("GET", `/api/z/${g.id}/cohost`, undefined, { "x-organizer": org.token });
      t.check("the organizer's key passes the board check", ck.ok, `${ck.status} ${JSON.stringify(ck.body).slice(0, 120)}`);
      const x = await t.open({ device: "laptop" });
      await x.page.goto(`${H.SIM}/board.html?e=${g.id}`); await x.page.waitForTimeout(1200);
      t.check("without the key the board page says it is for the Organizer and shows no numbers", /This board is for the Organizer/.test(await t.text(x.page)) && !(await x.page.$(".board")));
      await x.page.goto(`${H.SIM}/board.html?e=${g.id}#k=${encodeURIComponent(org.token)}`); const seen = await x.page.waitForSelector(".board", { timeout: 15000 }).then(() => true).catch(() => false);
      if (!seen) t.note("board page text: " + (await t.text(x.page)).slice(0, 300));
      t.check("with the key the board shows all 90 numbers", (await x.page.$$(".board > div")).length === 90);
      t.check("the key is not left in the address bar", !/k=/.test(x.page.url()), x.page.url());
      const calledOnBoard = (await x.page.$$(".board > div.c, .board > div.l")).length, lg = (await view(ps[0].page)).log.length;
      t.check("the board marks the numbers already called", calledOnBoard >= Math.max(1, lg - 1) && calledOnBoard <= lg + 1, `${calledOnBoard} on the board, ${lg} called`);
      t.check("the organizer's board lists the prizes", (await x.page.$$(".ps li")).length === 1);
      await t.shot(x.page, "organizer-board");
      const b = await x.ctx.newPage(); await b.goto(`${H.SIM}/big.html?e=${g.id}`); await b.waitForTimeout(1500);
      t.check("the number screen has no board and no earlier numbers", !(await b.$(".board")) && !(await b.$(".recent")));
      t.check("the number screen shows the number just called and the prizes", !!(await b.$(".num")) && (await b.$$(".ps li")).length === 1);
      await t.shot(b, "number-screen"); await b.close();
    },
  },
  {
    id: "S18-05", name: "The Bumper: with two tickets the Full Two-Ticket House can have many winners; the prizes list names 1st, 2nd... positions; a 101st winner is refused with a plain message",
    async run(t) {
      const org = await t.org("o"); const g = await t.game(org, { lead: 3 * H.HOUR, cfg: { tickets: 2 }, publish: false });
      const ok = await org.settings(g.id, { tickets: 2, rewards: [...rw("full", 1), ...rw("full", 25, "two_ticket")] });
      t.check("25 Bumper winners are accepted", ok.ok, JSON.stringify(ok.body).slice(0, 160));
      const info = (await org.info(g.id)).body;
      t.check("the game lists the 25 Bumper positions", (info.rewards || []).filter((r) => r.scope === "two_ticket").length === 25);
      const too = await org.settings(g.id, { tickets: 2, rewards: rw("top", 101) });
      t.check("a 101st winner is refused", !too.ok && too.status === 400);
      t.check("the refusal is in plain words and names the house", /Top Line/.test(too.body.error || "") && /at most 100 winners/.test(too.body.error || ""), too.body.error);
      const bad = await org.settings(g.id, { ties: "both" });
      t.check("an unknown tie rule is refused with a plain sentence", !bad.ok && /share the winner position|next positions/.test(bad.body.error || ""), bad.body.error);
      const c = await openConsole(t, org, g.id, { device: "laptop" }); await openStep(c.page, 3);
      const el = await c.page.$("#f-hs-full-n"); if (!el) await c.page.click('[data-ph="full"]');
      await c.page.waitForSelector("#f-hs-full-n", { timeout: 8000 }); await c.page.fill("#f-hs-full-n", "150"); await c.page.dispatchEvent("#f-hs-full-n", "input");
      await saveStep(c.page, 3);
      const s = (await org.summary(g.id)).body;
      t.check("typing 150 winners is kept to the ceiling of 100, never an error page", s.rewards.filter((r) => r.pattern === "full" && r.scope === "ticket").length === 100, String(s.rewards.filter((r) => r.pattern === "full" && r.scope === "ticket").length));
    },
  },
];
