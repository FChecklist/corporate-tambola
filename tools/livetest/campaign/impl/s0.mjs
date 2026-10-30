// The three kinds built in S0: UC-G1-01 (basic), UC-G2-07 (duplicate), UC-G2-08 (cap).
import { createGame, joinPlayer, newContext, mkChecks, median, sleep, speed, now } from "../core.mjs";
export const IMPL = {};
const KINDS = {
  /** G1-01: automatic start, the game calls the numbers: 10 pages (organizer + 9 players), the numbers come on the beat, identical on every phone, no repeats. */
  async basic(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env; const N = env.numbers ?? 5, CALL = 6;
    const g = await createGame(api, runId, c.id, { startInSec: env.startInSec ?? 150, callSeconds: CALL, cap: 10 });
    const players = [];
    try {
      const octx = await newContext(browser, base, meter); await octx.addInitScript((t) => { try { sessionStorage.setItem("ctz-org", t); localStorage.setItem("ctz-org", t); } catch {} }, g.key);
      const op = await octx.newPage(); const oerr = []; op.on("pageerror", (e) => oerr.push(String(e).slice(0, 120))); await op.goto(`${base}/zc.html?e=${g.tag.id}`, { waitUntil: "load" }); await sleep(2500);
      ck("organizer console opens without a script error", oerr.length === 0, oerr.join(";")); players.push({ ctx: octx });
      for (let i = 0; i < 9; i++) { players.push(await joinPlayer(browser, base, meter, g.tag.id, String(9000000000 + (Date.now() % 100000) * 100 + i))); }
      const pp = players.slice(1);
      ck("all 9 players joined", pp.every((p) => p.joined), pp.map((p) => p.joined).join(","));
      const SP = speed(); const waitMs = (Math.max(0, g.startMs - now()) + (N + 3) * CALL * 1000) / SP + 20000;
      const t0 = Date.now(); const stamps = []; let last = 0;
      while (Date.now() - t0 < waitMs) {
        const n = await pp[0].page.evaluate(() => (window.__rt && window.__rt.view ? window.__rt.view().log.length : 0)).catch(() => 0);
        if (n > last) { stamps.push(Date.now()); last = n; }
        if (last >= N) break; await sleep(300);
      }
      ck(`the game started by itself and ${N} numbers were called`, last >= N, `numbers seen ${last}`);
      await sleep(1500);
      const logs = await Promise.all(pp.map((p) => p.page.evaluate(() => window.__rt.view().log.slice()).catch(() => [])));
      const m = Math.min(...logs.map((l) => l.length));
      ck("every phone shows the same numbers in the same order", m >= N && logs.every((l) => l.slice(0, m).join() === logs[0].slice(0, m).join()), logs.map((l) => l.slice(0, N).join("-")).join(" | "));
      ck("no number repeats and all are within 1..90", new Set(logs[0]).size === logs[0].length && logs[0].every((x) => x >= 1 && x <= 90), logs[0].join(","));
      const gaps = stamps.slice(1).map((t, i) => ((t - stamps[i]) / 1000) * SP); // in game seconds
      ck(`the numbers come on the ${CALL}-second beat (median gap ${median(gaps).toFixed(1)} s)`, gaps.length >= 2 && Math.abs(median(gaps) - CALL) <= 1.5, gaps.map((x) => x.toFixed(1)).join(","));
      ck("no phone had a script error", pp.every((p) => p.errs.length === 0), pp.flatMap((p) => p.errs).join(";"));
    } finally { await Promise.all(players.map((p) => p.ctx.close().catch(() => {}))); }
    return { checks, game: g.tag.id };
  },

  /** G2-07: the same mobile number on a second device is refused with the one-device words; no second ticket, the first player keeps theirs. */
  async duplicate(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await createGame(api, runId, c.id, { startInSec: 600 });
    const a = await joinPlayer(browser, base, meter, g.tag.id, "9000001111", { checkin: false });
    const b = await joinPlayer(browser, base, meter, g.tag.id, "9000001111", { checkin: false });
    try {
      ck("the first device joined", a.joined);
      const t = await b.text();
      ck("the second device is told one ticket plays on one device", !b.joined && /different browser or app|one device only|one phone, one ticket/i.test(t), t.slice(0, 200));
      ck("the first device still holds its ticket", (await a.page.evaluate(() => !!(window.__rt && window.__rt.pid))));
      const info = await api("GET", `/api/z/${g.tag.id}/info`); ck("the game is still there and answers", info.ok, info.status);
    } finally { await a.ctx.close(); await b.ctx.close(); }
    return { checks, game: g.tag.id };
  },

  /** G2-08: the cap is kept: with room for two, the third player is told the places are taken and the first two keep their tickets. */
  async cap(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await createGame(api, runId, c.id, { startInSec: 600, cap: 2 });
    const ps = [];
    try {
      for (const ph of ["9000002221", "9000002222", "9000002223"]) ps.push(await joinPlayer(browser, base, meter, g.tag.id, ph, { checkin: false }));
      ck("the first two players joined", ps[0].joined && ps[1].joined, ps.map((p) => p.joined).join(","));
      const t = await ps[2].text();
      ck("the third player is told the places are taken", !ps[2].joined && /places in this game are taken|game is full/i.test(t), t.slice(0, 200));
      ck("the first two keep their tickets", (await Promise.all(ps.slice(0, 2).map((p) => p.page.evaluate(() => !!(window.__rt && window.__rt.pid))))).every(Boolean));
    } finally { await Promise.all(ps.map((p) => p.ctx.close().catch(() => {}))); }
    return { checks, game: g.tag.id };
  },
};
IMPL["UC-G1-01"] = KINDS.basic; IMPL["UC-G2-07"] = KINDS.duplicate; IMPL["UC-G2-08"] = KINDS.cap;
