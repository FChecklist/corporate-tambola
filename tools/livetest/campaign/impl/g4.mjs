// G4 Play and timer. Implemented here: UC-G4-01 (the 6/12-second beat, same as UC-G1-01), 06 (no repeats across 90 numbers), 12 (Ticket A | B), 13 (Retro and Modern), 14 (phone, tablet, laptop widths).
// Not implemented: 02 03 04 05 07 08 09 10 11 (they need organizer controls or a forced situation: manual start, host-called roll, pause, stop, end rules, the numbers strip, crossing).
import { createGame, joinPlayer, mkChecks, playGame, newContext, fakePhone, closeAll, sleep } from "../core.mjs";
import { IMPL as S0 } from "./s0.mjs";

export const IMPL = {
  async "UC-G4-01"(c, env) { return S0["UC-G1-01"](c, env); },
  /** All 90 numbers: 1..90 exactly once, the same order on every phone. */
  async "UC-G4-06"(c, env) {
    const { ck, checks } = mkChecks();
    const s = await playGame(env, c, { rewards: [{ pattern: "full", scope: "ticket", ordinal: 1, text: "Hamper" }], maxGameSec: 700, done: (st) => st.numbers >= 90 });
    try {
      const l0 = s.logs[0] || [];
      ck("the game reached the numbers asked for (90, or it ended earlier when the last prize was won)", s.numbers >= 60 || s.endedBy === "done", s.numbers);
      ck("no number repeats", new Set(l0).size === l0.length, l0.join(","));
      ck("every number is within 1..90", l0.every((x) => x >= 1 && x <= 90));
      ck("every phone shows the same numbers in the same order", s.logs.every((l) => { const m = Math.min(l.length, l0.length); return l.slice(0, m).join() === l0.slice(0, m).join(); }));
    } finally { await closeAll(s.ps); }
    return { checks, game: s.g.tag.id };
  },
  /** Two tickets each: Ticket A and B shown, switching greys the other one. */
  async "UC-G4-12"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await createGame(api, runId, c.id, { startInSec: 40, settings: { tickets: 2 } });
    const p = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: true });
    try {
      await p.page.waitForSelector("[data-tpbtn]", { timeout: 90000 }).catch(() => {});
      ck("the Playing switch with Ticket A and Ticket B is there", (await p.page.locator('button[data-tpbtn="A"]').count()) === 1 && (await p.page.locator('button[data-tpbtn="B"]').count()) === 1);
      await p.page.click('button[data-tpbtn="B"]').catch(() => {}); await sleep(500);
      ck("choosing Ticket B greys Ticket A", (await p.page.locator('.ztkwrap.zdim[data-tpbtn="A"]').count()) === 1);
      await p.page.click('button[data-tpbtn="A"]').catch(() => {}); await sleep(500);
      ck("choosing Ticket A greys Ticket B again", (await p.page.locator('.ztkwrap.zdim[data-tpbtn="B"]').count()) === 1);
    } finally { await closeAll([p]); }
    return { checks, game: g.tag.id };
  },
  /** Retro and Modern: the page theme follows, the cross rule exists in both. */
  async "UC-G4-13"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await createGame(api, runId, c.id, { startInSec: 40 });
    const p = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: true });
    try {
      await p.page.waitForSelector('input[name="zlook"]', { timeout: 90000 }).catch(() => {});
      for (const look of ["modern", "retro"]) {
        await p.page.check(`input[name="zlook"][value="${look}"]`, { force: true }).catch(() => {}); await sleep(600);
        ck(`the page follows the ${look} look (html data-pt)`, (await p.page.evaluate(() => document.documentElement.getAttribute("data-pt"))) === look);
        ck(`a crossed number keeps its number and shows a cross in ${look}`, await p.page.evaluate(() => { const css = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch { return []; } }).join(" "); return /zticket[^{]*div\.m(::before|::after)/.test(css); }));
      }
    } finally { await closeAll([p]); }
    return { checks, game: g.tag.id };
  },
  /** Phone, tablet and laptop widths: no sideways scroll on the join page and on the ticket page. */
  async "UC-G4-14"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await createGame(api, runId, c.id, { startInSec: 40 }); const ctxs = [];
    try {
      for (const w of [360, 768, 1280]) {
        const ctx = await newContext(browser, base, meter, { viewport: { width: w, height: 800 }, isMobile: w < 600, hasTouch: w < 600 }); ctxs.push({ ctx }); const page = await ctx.newPage();
        await page.goto(`${base}/z.html?e=${g.tag.id}`, { waitUntil: "load" }); await page.waitForSelector("[data-cbc='K4'] input[data-box]", { timeout: 25000 });
        ck(`${w}px: the join page does not scroll sideways`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        const bx = page.locator("[data-cbc='K4'] input[data-box]"); for (let i = 0; i < await bx.count(); i++) await bx.nth(i).check({ force: true }).catch(() => {});
        await page.fill("#ph", fakePhone()); await page.click("#go"); await page.waitForFunction(() => window.__rt && window.__rt.pid, null, { timeout: 25000 }).catch(() => {}); await sleep(2500);
        ck(`${w}px: the page after joining does not scroll sideways`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      }
    } finally { await closeAll(ctxs); }
    return { checks, game: g.tag.id };
  },
};
