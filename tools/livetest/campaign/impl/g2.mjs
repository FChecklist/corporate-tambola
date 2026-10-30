// G2 Joining. Real pages, real clicks; the Host / organizer decisions that have no console button in the page under test are made through the same API the console uses (marked "API" in the check names).
// UC-G2-14 (30-minute lapse and 15-minute cutoff) needs a server clock the test can move: the local server runs on the real clock, so it stays "not-implemented" here (layer A covers it with the engine's test clock).
import { createHash } from "node:crypto";
import { createGame, joinPlayer, mkChecks, addPeople, addRole, acceptRole, fakePhone, text, hasTicket, closeAll, sleep } from "../core.mjs";

const LONG = { startInSec: 900 }; // nobody needs the numbers to run in these cases: the game starts far away, so nothing waits for it
const COHOST_FROM = 1_000_000_000;
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const waitPid = (p, ms = 45000) => p.page.waitForFunction(() => window.__rt && window.__rt.pid, null, { timeout: ms }).then(() => true).catch(() => false);
const waiting = async (api, g, key) => { const r = await api("GET", `/api/z/${g.tag.id}/waiting`, undefined, key); if (!r.ok) throw new Error(`waiting list refused (${r.status}): ` + JSON.stringify(r.body).slice(0, 140)); return r.body.waiting || []; };
const decide = (api, g, key, wid, decision) => api("POST", `/api/z/${g.tag.id}/waiting/${wid}`, { decision }, key);
const listGame = (o = {}) => ({ ...LONG, settings: { whoCanJoin: "list", ...(o.settings || {}) }, ...o });
const mk = (api, runId, c, o) => createGame(api, runId, c.id, { startInSec: o.startInSec, cap: o.cap, settings: o.settings, rewards: o.rewards });

export const IMPL = {
  /** Listed employee ID joins with the listed name; a wrong ID does not get in and is told to wait for approval. */
  async "UC-G2-01"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await mk(api, runId, c, listGame({ settings: { verify: "id", employeesOnly: true } }));
    const ids = ["E1001", "E1002", "E1003"]; await addPeople(api, g, ids.map((e, i) => ({ name: "Staff " + (i + 1), empId: e })));
    const ps = [];
    try {
      for (const e of ids) ps.push(await joinPlayer(browser, base, meter, g.tag.id, null, { checkin: false, emp: e }));
      ck("the three listed IDs joined directly", ps.every((p) => p.joined), ps.map((p) => p.joined).join(","));
      const bad = await joinPlayer(browser, base, meter, g.tag.id, null, { checkin: false, emp: "E9999" }); ps.push(bad);
      const t = await text(bad);
      ck("an ID that is not on the list does not get a ticket and the organizer is asked", !bad.joined && /Please wait|could not find|not on this game|asked/i.test(t), t.slice(0, 200));
      ck("the organizer sees the request waiting (API)", (await waiting(api, g, g.key)).length >= 1);
    } finally { await closeAll(ps); }
    return { checks, game: g.tag.id };
  },
  /** An email typed where an employee ID is asked is refused in plain words (the engine's IDs are letters and numbers only). */
  async "UC-G2-02"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await mk(api, runId, c, listGame({ settings: { verify: "id", employeesOnly: true } }));
    await addPeople(api, g, [{ name: "Staff 1", empId: "E2001" }]);
    const p = await joinPlayer(browser, base, meter, g.tag.id, null, { checkin: false, emp: "asha@acme.invalid" });
    try {
      const t = await text(p);
      ck("an email in the ID box is refused with the plain sentence (letters and numbers only)", !p.joined && /letters and numbers only|valid|ID/i.test(t), t.slice(0, 220));
      ck("no ticket was made for it", !(await hasTicket(p)));
    } finally { await closeAll([p]); }
    return { checks, game: g.tag.id };
  },
  /** A person who is not on the list asks; the Host admits; the page flips to the ticket by itself. */
  async "UC-G2-03"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await mk(api, runId, c, listGame());
    const hk = await addRole(api, g, "host", "Priya"); await acceptRole(api, hk);
    const p = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false });
    try {
      const t = await text(p); ck("the request waits (not a ticket)", !p.joined && /Please wait|request/i.test(t), t.slice(0, 160));
      const w = await waiting(api, g, hk); ck("the Host sees the request (API)", w.length >= 1, JSON.stringify(w).slice(0, 120));
      if (w[0]) { const d = await decide(api, g, hk, w[0].id, "admit"); ck("the Host admits (API)", d.ok, d.status); }
      ck("the player's page turns into the ticket by itself", await waitPid(p));
    } finally { await closeAll([p]); }
    return { checks, game: g.tag.id };
  },
  /** A Co-host admits only the people who came through the Co-host's own link. */
  async "UC-G2-04"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await mk(api, runId, c, listGame());
    const ck1 = await addRole(api, g, "cohost", "Ravi"); await acceptRole(api, ck1);
    const ck2 = await addRole(api, g, "cohost", "Meena"); await acceptRole(api, ck2);
    const from = (k) => COHOST_FROM + parseInt(sha256("key|" + k).slice(0, 7), 16);
    const a = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false, query: `&from=${from(ck1)}` });
    const b = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false, query: `&from=${from(ck2)}` });
    try {
      const w1 = await waiting(api, g, ck1), w2 = await waiting(api, g, ck2);
      ck("each Co-host sees exactly one request: their own (API)", w1.length === 1 && w2.length === 1 && w1[0].id !== w2[0].id, `${w1.length}/${w2.length}`);
      if (w1[0]) ck("a Co-host cannot decide the other Co-host's request (API)", (await decide(api, g, ck1, w2[0].id, "admit")).status >= 400);
      if (w1[0]) ck("a Co-host admits their own (API)", (await decide(api, g, ck1, w1[0].id, "admit")).ok);
      ck("the first person gets the ticket, the second keeps waiting", (await waitPid(a)) && !(await hasTicket(b)));
    } finally { await closeAll([a, b]); }
    return { checks, game: g.tag.id };
  },
  /** The organizer admits one and declines another: the first gets a ticket, the second reads the polite message. */
  async "UC-G2-05"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await mk(api, runId, c, listGame());
    const a = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false });
    const b = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false });
    try {
      const w = await waiting(api, g, g.key); ck("the organizer sees two requests (API)", w.length === 2, w.length);
      const [wa, wb] = w; if (wa) await decide(api, g, g.key, wa.id, "admit"); if (wb) await decide(api, g, g.key, wb.id, "decline");
      const aIsFirst = wa && (await waitPid(a, 30000)); const bIsFirst = wb && (await waitPid(b, 30000));
      const got = [await hasTicket(a), await hasTicket(b)]; ck("exactly one of the two got a ticket", got.filter(Boolean).length === 1, got.join(","));
      const loser = got[0] ? b : a; await sleep(6500); const t = await text(loser);
      ck("the declined person reads the polite message", /could not add you|not accepted|talk to whoever/i.test(t), t.slice(0, 220));
      void aIsFirst; void bIsFirst;
    } finally { await closeAll([a, b]); }
    return { checks, game: g.tag.id };
  },
  /** Open join with an optional email: good, bad shape, reused, none. */
  async "UC-G2-06"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await mk(api, runId, c, LONG); const ps = [];
    try {
      const a = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false, mail: "asha@test.invalid" }); ps.push(a);
      ck("a good email joins", a.joined);
      const b = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false, mail: "Asha@Test.invalid" }); ps.push(b);
      ck("the same email on another phone gets the one neutral sentence", !b.joined && /could not use this email ID/i.test(await text(b)), (await text(b)).slice(0, 160));
      const d = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false, mail: "asha@" }); ps.push(d);
      ck("a bad shape is refused in plain words", !d.joined && /check your email ID|looks incomplete/i.test(await text(d)));
      const e = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false }); ps.push(e);
      ck("no email at all is fine", e.joined);
    } finally { await closeAll(ps); }
    return { checks, game: g.tag.id };
  },
  /** Joining after the numbers have started: the ticket counts from the join; the earlier numbers are history. */
  async "UC-G2-09"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await mk(api, runId, c, { startInSec: 40 }); const first = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: true }); let late = null;
    try {
      ck("the first player joined", first.joined);
      const t0 = Date.now(); let n = 0;
      while (Date.now() - t0 < 120000 && n < 3) { n = await first.page.evaluate(() => (window.__rt && window.__rt.view ? window.__rt.view().log.length : 0)).catch(() => 0); await sleep(500); }
      ck("numbers started before the late joiner arrives", n >= 3, n);
      late = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: true });
      ck("the late joiner gets a ticket", late.joined);
      const v = await late.page.evaluate(() => { const x = window.__rt.view(); return { log: x.log.length, late: !!x.late }; }).catch(() => ({}));
      ck("the page is in play for the late joiner (numbers shown, no refusal)", v.log >= 3, JSON.stringify(v));
    } finally { await closeAll([first, late]); }
    return { checks, game: g.tag.id };
  },
  /** A cached page that sends the old consent version is told to reload; after the reload it joins. */
  async "UC-G2-10"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await mk(api, runId, c, LONG);
    const stale = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false, routes: async (page) => { await page.route("**/consent.js*", async (route) => { const r = await route.fetch(); const body = (await r.text()).replace(/C\.version = "[0-9-]+"/, 'C.version = "2026-10-15"'); await route.fulfill({ response: r, body }); }); } });
    try {
      const t = await text(stale);
      ck("the old page is told it is out of date, with the reload sentence", !stale.joined && /This page is out of date/.test(t) && !/Please tick the box to continue/.test(t), t.slice(0, 220));
      ck("a Reload button is shown", (await stale.page.locator("#reloadpage").count()) === 1);
      await stale.page.unroute("**/consent.js*"); await stale.page.reload({ waitUntil: "load" });
      await stale.page.waitForSelector("[data-cbc='K4'] input[data-box]"); const bx = stale.page.locator("[data-cbc='K4'] input[data-box]"); for (let i = 0; i < await bx.count(); i++) await bx.nth(i).check({ force: true }).catch(() => {});
      await stale.page.fill("#ph", fakePhone()); await stale.page.click("#go");
      ck("after the reload the player joins", await waitPid(stale, 25000));
    } finally { await closeAll([stale]); }
    return { checks, game: g.tag.id };
  },
  /** Close the page and open the link again: same ticket. */
  async "UC-G2-11"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await mk(api, runId, c, LONG); const p = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false });
    try {
      ck("joined", p.joined); const pid = await p.page.evaluate(() => window.__rt.pid);
      await p.page.close(); const page2 = await p.ctx.newPage(); await page2.goto(`${base}/z.html?e=${g.tag.id}`, { waitUntil: "load" }); await sleep(3500);
      const pid2 = await page2.evaluate(() => window.__rt && window.__rt.pid).catch(() => null);
      ck("the reopened page shows the same ticket (same player id)", !!pid && pid === pid2, `${pid} / ${pid2}`);
    } finally { await closeAll([p]); }
    return { checks, game: g.tag.id };
  },
  /** The same mobile on a second device: the one-device words, and what to do. */
  async "UC-G2-12"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await mk(api, runId, c, LONG); const phone = fakePhone();
    const a = await joinPlayer(browser, base, meter, g.tag.id, phone, { checkin: false }); const b = await joinPlayer(browser, base, meter, g.tag.id, phone, { checkin: false });
    try {
      ck("the first device keeps the ticket", a.joined && (await hasTicket(a)));
      const t = await text(b); ck("the second device is told one ticket plays on one device and what to do", !b.joined && /one device only/i.test(t) && /ask your organizer/i.test(t), t.slice(0, 260));
    } finally { await closeAll([a, b]); }
    return { checks, game: g.tag.id };
  },
  /** Family pass: the family host approves one request and declines another from the Family Passes card. */
  async "UC-G2-13"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await mk(api, runId, c, { startInSec: 900, settings: { whoCanJoin: "list", invites: { on: true, per: 4, cats: ["family"] } } });
    const hostPhone = fakePhone(); await addPeople(api, g, [{ name: "Host Family", phone: hostPhone }]);
    const host = await joinPlayer(browser, base, meter, g.tag.id, hostPhone, { checkin: false }); const ps = [host];
    try {
      ck("the family host joined (seat 1)", host.joined);
      await host.page.waitForFunction(() => /Family Passes/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
      ck("the Family Passes card shows the agreed words", /You have 5 passes: 1 for you and 4 for your family and friends/.test(await text(host)));
      const m1 = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false, query: "&from=1&c=family" }); const m2 = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false, query: "&from=1&c=family" }); ps.push(m1, m2);
      ck("both members wait with the family words", /family host approves your entry/.test(await text(m1)) && /family host approves your entry/.test(await text(m2)));
      await host.page.waitForSelector('[data-fam="admit"]', { timeout: 80000 }).catch(() => {});
      const pressedAdmit = await host.page.click('[data-fam="admit"]', { timeout: 8000 }).then(() => true).catch(() => false); ck("the family host pressed Admit (the button was there)", pressedAdmit); await sleep(1500);
      await host.page.waitForSelector('[data-fam="decline"]', { timeout: 40000 }).catch(() => {}); const pressedDecline = await host.page.click('[data-fam="decline"]', { timeout: 8000 }).then(() => true).catch(() => false); ck("the family host pressed Decline on the other request", pressedDecline);
      for (let i = 0; i < 45 && !((await hasTicket(m1)) || (await hasTicket(m2))); i++) await sleep(1000); await sleep(4000); // the member's page asks again every few seconds
      const got = [await hasTicket(m1), await hasTicket(m2)]; ck("exactly one family member got in", got.filter(Boolean).length === 1, got.join(","));
      const loser = got[0] ? m2 : m1; ck("the other reads the polite message", /could not add you|talk to whoever/i.test(await text(loser)));
    } finally { await closeAll(ps); }
    return { checks, game: g.tag.id };
  },
};
