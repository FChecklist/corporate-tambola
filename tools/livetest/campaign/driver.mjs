// The real-Chromium driver for layers B (local server) and C (the real site). One organizer + the players the case needs, each in its OWN browser context (own device id, own storage),
// real clicks on the real pages, assertions per case. Every game is tagged (tags.mjs) and registered for cleanup; every request is metered (meter.mjs).
// Kinds implemented in S0: basic (G1-01), duplicate (G2-07), cap (G2-08). Every other kind returns status "not-implemented": it is NEVER reported as passed.
import { mkdirSync } from "node:fs";
import { chromium, makeApi, roundAt, sleep, DATA, isReal } from "./lib.mjs";
import { tagOf, register } from "./tags.mjs";

const PHONE = { width: 390, height: 844 };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

export async function launch() { return chromium.launch({ channel: "chrome" }).catch(() => chromium.launch()); }

/** Creates the tagged demo game through the API (the organizer's own requests), registers it for cleanup, returns { tag, key }. */
export async function createGame(api, runId, caseId, o = {}) {
  const tag = tagOf(runId, caseId);
  const st = await api("POST", "/api/start", { email: tag.email });
  if (!st.ok) throw new Error("start refused: " + JSON.stringify(st.body).slice(0, 200));
  const key = st.body.token;
  register({ id: tag.id, run: runId, case: caseId, key, email: tag.email });
  const startRound = roundAt(Date.now() + (o.startInSec ?? 150) * 1000);
  const mk = await api("POST", "/api/z", { id: tag.id, startRound, callSeconds: o.callSeconds ?? 6, cap: o.cap ?? 10, demo: true, name: tag.name }, key);
  if (!mk.ok) throw new Error("create refused: " + JSON.stringify(mk.body).slice(0, 200));
  const rewards = o.rewards ?? [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "Mug" }, { pattern: "top", scope: "ticket", ordinal: 1, text: "Voucher" }];
  await api("PATCH", `/api/z/${tag.id}/settings`, { rewards, whoCanJoin: "anyone", ...(o.settings || {}) }, key);
  const pub = await api("POST", `/api/z/${tag.id}/publish`, { email: tag.email, phone: tag.phone }, key);
  if (!pub.ok) throw new Error("publish refused: " + JSON.stringify(pub.body).slice(0, 200));
  return { tag, key, startMs: Date.now() + (o.startInSec ?? 150) * 1000 };
}

async function newContext(browser, base, meter, extra = {}) {
  const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true, ...extra });
  if (meter) await meter.watch(ctx); // every request of this phone counts
  return ctx;
}

/** A player joins through the real page: tick the boxes, type the number, press the button. Returns { page, ctx, text() }. */
export async function joinPlayer(browser, base, meter, id, phone, { checkin = true, name } = {}) {
  const ctx = await newContext(browser, base, meter); const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  await page.goto(`${base}/z.html?e=${id}`, { waitUntil: "load" });
  await page.waitForSelector("[data-cbc='K4'] input[data-box]", { timeout: 25000 });
  const bx = page.locator("[data-cbc='K4'] input[data-box]"); for (let i = 0; i < await bx.count(); i++) await bx.nth(i).check({ force: true }).catch(() => {});
  await page.fill("#ph", phone); if (name && (await page.$("#nm"))) await page.fill("#nm", name);
  await page.click("#go");
  const p = { page, ctx, errs, text: async () => (await page.locator("body").innerText()).replace(/\s+/g, " "), joined: false };
  await Promise.race([page.waitForFunction(() => window.__rt && window.__rt.pid, null, { timeout: 25000 }).then(() => { p.joined = true; }), sleep(25000)]).catch(() => {});
  if (p.joined && checkin) { // check-in is required for new games and opens 5 minutes before the start
    await page.waitForSelector("#ckokn", { timeout: 20000 }).catch(() => {});
    if (await page.$("#ckokn")) { await page.check("#ckokn", { force: true }); await page.check("#ckokm", { force: true }); await page.fill("#ckcode", (await page.textContent("#ckshow")).trim()); await page.click("#cksubmit"); await sleep(1500); }
  }
  return p;
}

const mkChecks = () => { const checks = []; return { checks, ck: (n, ok, d = "") => { checks.push({ n, ok: !!ok, d: String(d).slice(0, 240) }); return !!ok; } }; };

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
      const waitMs = Math.max(0, g.startMs - Date.now()) + (N + 3) * CALL * 1000 + 20000;
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
      const gaps = stamps.slice(1).map((t, i) => (t - stamps[i]) / 1000);
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

// the cases that use an implemented kind in S0: G1-01 -> basic, G2-07 -> duplicate, G2-08 -> cap; the other kinds are listed in usecases-100.json and filled in S2
const KIND_OF = { "UC-G1-01": "basic", "UC-G2-07": "duplicate", "UC-G2-08": "cap" };

export async function runCase(c, env) {
  const kind = KIND_OF[c.id]; const t0 = Date.now();
  if (!kind || !KINDS[kind]) return { id: c.id, title: c.title, status: "not-implemented", note: `driver kind "${c.driver}" is filled in S2`, ms: 0 };
  try {
    const r = await KINDS[kind](c, env);
    const failed = r.checks.filter((x) => !x.ok);
    return { id: c.id, title: c.title, status: failed.length ? "fail" : "pass", checks: r.checks, game: r.game, ms: Date.now() - t0 };
  } catch (e) {
    return { id: c.id, title: c.title, status: e.name === "MeterStop" ? "stopped-by-meter" : "error", error: String(e && e.message || e).slice(0, 300), ms: Date.now() - t0 };
  }
}
export { makeApi, isReal, DATA };
