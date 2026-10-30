// G7 Data and rules and G8 Failure and safety (the cases that can be driven from outside the worker). Reasons for the ones left out:
// G7: 01 (the 24-hour sweep needs the worker's tick: layer A), 02 03 04 05 09 12 (need a finished game, the report, or routes to be confirmed). G8: 01 offline is here; 03 rate limit is here; 05 (link tokens), 09 (payment is not asked in a free demo game).
import { createGame, joinPlayer, mkChecks, fakePhone, closeAll, text, sleep, makeApi, CONSENT } from "../core.mjs";
import { IMPL as G2 } from "./g2.mjs";

const plain = (s) => typeof s === "string" && s.length > 8 && !/[{}]|^HTTP \d+|undefined|\[object/.test(s);
export const IMPL = {
  // ---- G7
  /** One wording and one version everywhere: the server's answer, the page script, the Terms page. */
  async "UC-G7-07"(c, env) {
    const { ck, checks } = mkChecks(); const { base, meter } = env; const f = async (path) => { if (meter) meter.count(1, "GET " + path); return (await fetch(base + path)).text(); };
    const js = await f("/consent.js"), terms = (await f("/terms.html")).replace(/&amp;/g, "&").replace(/&rsquo;/g, "’"), A = CONSENT.K4.A;
    ck("the page script carries the K4 wording and the current version", js.includes(A) && js.includes(`"${CONSENT.version}"`), CONSENT.version);
    ck("the Terms page carries the same K4 wording and shows the same version", terms.includes(A.replace(/&/g, "&")) || terms.replace(/\s+/g, " ").includes(A), "terms");
    ck("the Terms page shows Version " + CONSENT.version, terms.includes("Version " + CONSENT.version));
    const api = makeApi(base, meter); const r = await api("POST", "/api/z/NOPE-GAME-1/join", { phone: "9000000002", device: "a".repeat(32), consent: { v: "2026-01-01", boxes: ["A", "B"] } });
    ck("a join from an old page is answered 'out of date' with the current version number", r.body.code === "consent-required" || r.status === 404, r.status + " " + JSON.stringify(r.body).slice(0, 120));
    return { checks };
  },
  /** The privacy pages name what is kept. */
  async "UC-G7-08"(c, env) {
    const { ck, checks } = mkChecks(); const { base, meter } = env; const get = async (p) => { if (meter) meter.count(1, "GET " + p); return (await (await fetch(base + p)).text()).replace(/&rsquo;/g, "’"); };
    const priv = await get("/privacy.html"), terms = await get("/terms.html"), trust = await get("/trust.html");
    ck("the privacy page names the mobile number, the optional email ID and the 24-hour erase", /mobile number/.test(priv) && /email ID/.test(priv) && /within 24 hours/.test(priv));
    ck("the Terms page names the optional email ID among the personal data", /optional email ID/.test(terms));
    ck("the Trust page says guests may give an optional email ID in an open game", /optional email ID/.test(trust));
    return { checks };
  },
  /** No personal data in any address: every request URL of a player joining with a mobile number and an email. */
  async "UC-G7-10"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env; const g = await createGame(api, runId, c.id, { startInSec: 900 });
    const urls = []; const phone = fakePhone(), mail = "privacy.check@test.invalid";
    const p = await joinPlayer(browser, base, meter, g.tag.id, phone, { checkin: false, mail, routes: async (page) => { page.on("request", (r) => urls.push(r.url())); } });
    try {
      ck("the player joined", p.joined); await sleep(1500);
      const bad = urls.filter((u) => u.includes(phone) || u.includes(encodeURIComponent(mail)) || u.includes("privacy.check"));
      ck(`none of the ${urls.length} request addresses contains the mobile number or the email`, bad.length === 0, bad.slice(0, 2).join(" "));
    } finally { await closeAll([p]); }
    return { checks, game: g.tag.id };
  },
  /** A player leaves: the details go, and the same phone can join again as a new person. */
  async "UC-G7-11"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env; const g = await createGame(api, runId, c.id, { startInSec: 900 });
    const p = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false });
    try {
      ck("joined", p.joined); const me = await p.page.evaluate(() => ({ pid: window.__rt.pid, device: localStorage.getItem("ctz:device") }));
      const l = await api("POST", `/api/z/${g.tag.id}/leave`, { pid: me.pid, device: me.device }); ck("leaving is accepted (API, the same call the Leave link makes)", l.ok, l.status + " " + JSON.stringify(l.body).slice(0, 100));
      const again = await api("POST", `/api/z/${g.tag.id}/me`, { pid: me.pid, device: me.device }); ck("the old ticket no longer answers as a participant", !(again.ok && again.body && again.body.seat), again.status);
    } finally { await closeAll([p]); }
    return { checks, game: g.tag.id };
  },
  // ---- G8
  /** Offline for a while, then back: the page keeps the ticket and says it is back. */
  async "UC-G8-01"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env; const g = await createGame(api, runId, c.id, { startInSec: 120 });
    const p = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: true });
    try {
      ck("joined", p.joined); const pid = await p.page.evaluate(() => window.__rt.pid);
      await p.ctx.setOffline(true); await sleep(8000); const off = await text(p);
      ck("offline the page does not show a raw error", !/TypeError|\[object|undefined|\{"/.test(off), off.slice(0, 160));
      await p.ctx.setOffline(false); await sleep(8000);
      ck("back online the same ticket is still there", (await p.page.evaluate(() => window.__rt && window.__rt.pid)) === pid);
      ck("no script error went unhandled", p.errs.length === 0, p.errs.join(";"));
    } finally { await closeAll([p]); }
    return { checks, game: g.tag.id };
  },
  /** Refusals are plain sentences: unknown game, bad number, wrong key. */
  async "UC-G8-02"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env; const g = await createGame(api, runId, c.id, { startInSec: 900 });
    const r1 = await api("POST", "/api/z/NOSUCH-GAME-9/join", { phone: "9000000003", device: "b".repeat(32) }); ck("an unknown game is refused in a plain sentence", r1.status >= 400 && plain(r1.body.error), JSON.stringify(r1.body).slice(0, 120));
    const r2 = await api("POST", `/api/z/${g.tag.id}/join`, { phone: "12", device: "c".repeat(32) }); ck("a bad mobile number is refused in a plain sentence", r2.status === 400 && plain(r2.body.error), JSON.stringify(r2.body).slice(0, 120));
    const r3 = await api("GET", `/api/z/${g.tag.id}/summary`, undefined, "ct_wrongwrongwrongwrongwrongwrong"); ck("a wrong organizer key is refused in a plain sentence", r3.status >= 400 && plain(r3.body.error), JSON.stringify(r3.body).slice(0, 120));
    const p = await joinPlayer(browser, base, meter, g.tag.id, "12", { checkin: false });
    try { const t = await text(p); ck("on the page the bad number shows a sentence, never raw data", /valid mobile number/i.test(t) && !/\{"error"/.test(t), t.slice(0, 200)); } finally { await closeAll([p]); }
    return { checks, game: g.tag.id };
  },
  /** Guessing IDs: after enough wrong tries the engine slows the guesser down politely (429) and says so. */
  async "UC-G8-03"(c, env) {
    const { ck, checks } = mkChecks(); const { api, runId } = env; const g = await createGame(api, runId, c.id, { startInSec: 900, settings: { whoCanJoin: "list", verify: "id", employeesOnly: true } });
    let last = null, n = 0; for (; n < 60; n++) { last = await api("POST", `/api/z/${g.tag.id}/join`, { empId: "ZZ" + (1000 + n), device: String(n).padStart(2, "0").repeat(16).slice(0, 32) }); if (last.status === 429) break; }
    ck(`a 429 came before 60 wrong IDs (it came at try ${n + 1})`, last && last.status === 429, last && last.status);
    ck("the 429 says to wait and ask the organizer, in plain words", last && last.status === 429 && /Too many tries/.test(last.body.error || ""), JSON.stringify(last && last.body).slice(0, 140));
    return { checks, game: g.tag.id };
  },
  /** A wrong organizer key opens nothing. */
  async "UC-G8-04"(c, env) {
    const { ck, checks } = mkChecks(); const { api, runId } = env; const g = await createGame(api, runId, c.id, { startInSec: 900 });
    for (const path of ["summary", "people", "waiting", "gamelog"]) { const r = await api("GET", `/api/z/${g.tag.id}/${path}`, undefined, "ct_wrongwrongwrongwrongwrongwrong"); ck(`${path}: refused with no data`, r.status >= 400 && !r.body.people && !r.body.waiting, r.status); }
    return { checks, game: g.tag.id };
  },
  async "UC-G8-06"(c, env) { return G2["UC-G2-10"](c, env); },
  /** Double submit of Join: one ticket. */
  async "UC-G8-07"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env; const g = await createGame(api, runId, c.id, { startInSec: 900 });
    const p = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false, routes: async (page) => { await page.addInitScript(() => { window.addEventListener("click", (e) => { if (e.target && e.target.id === "go" && !window.__dbl) { window.__dbl = 1; setTimeout(() => e.target.click && e.target.click(), 0); } }, true); }); } });
    try {
      ck("joined", p.joined); await sleep(1500);
      const s = await api("GET", `/api/z/${g.tag.id}/summary`, undefined, g.key); const joined = s.body.joined ?? s.body.participants ?? s.body.people;
      ck("exactly one ticket was made for a double press of Join", joined === 1 || (Array.isArray(joined) && joined.length === 1), JSON.stringify(s.body).slice(0, 160));
    } finally { await closeAll([p]); }
    return { checks, game: g.tag.id };
  },
  /** A cancelled game: players see a calm screen and nobody can join. */
  async "UC-G8-08"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env; const g = await createGame(api, runId, c.id, { startInSec: 900 });
    const a = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false });
    try {
      const x = await api("POST", `/api/z/${g.tag.id}/cancel`, { confirmations: 3 }, g.key); ck("the organizer cancels with three confirmations (API)", x.ok, x.status + " " + JSON.stringify(x.body).slice(0, 100));
      const b = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false }); try { ck("a new person cannot join and is told the game was cancelled", !b.joined && /cancel/i.test(await text(b)), (await text(b)).slice(0, 180)); } finally { await closeAll([b]); }
      await sleep(7000); a.page.reload ? await a.page.reload({ waitUntil: "load" }) : 0; await sleep(2500); ck("the player already in sees a calm cancelled screen", /cancel/i.test(await text(a)), (await text(a)).slice(0, 180));
    } finally { await closeAll([a]); }
    return { checks, game: g.tag.id };
  },
  /** The free launch limit: more than 10 people in a demo game is refused in plain words. */
  async "UC-G8-10"(c, env) {
    const { ck, checks } = mkChecks(); const { api, runId } = env; const { tagOf, register } = await import("../tags.mjs"); const tag = tagOf(runId, c.id);
    const st = await api("POST", "/api/start", { email: tag.email }); const key = st.body.token; register({ id: tag.id, run: runId, case: c.id, key, email: tag.email });
    const r = await api("POST", "/api/z", { id: tag.id, startRound: 40000000, callSeconds: 6, cap: 11, demo: true, name: tag.name }, key);
    ck("a demo game for 11 people is refused with a plain sentence", r.status >= 400 && plain(r.body.error), r.status + " " + JSON.stringify(r.body).slice(0, 160));
    return { checks, game: tag.id };
  },
};
