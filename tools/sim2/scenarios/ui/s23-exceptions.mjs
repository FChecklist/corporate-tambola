// Group 23: exceptions. Things that go wrong around a running game: the public clock unreachable, our store unreachable, two consoles editing at once,
// a guest coming back on a fresh browser, a stop while a phone is offline. In every case: no blank page, no JavaScript error, calm words, the same numbers and winners for everyone.
import { H, openConsole, openStep, nextPhone, guestJoinUi, saveStep, joinApi } from "./kit.mjs";

const { invariants: inv } = H;
const RW = ["early5", "top", "full"].map((p) => ({ pattern: p, scope: "ticket", ordinal: 1, text: "" }));
async function phones(t, g, names, { device = "mobile", moveTo = 2 * H.MIN } = {}) {
  const out = [];
  for (const nm of names) { const x = await t.open({ device }); x.errors = []; x.page.on("pageerror", (e) => x.errors.push(String(e).slice(0, 160))); await guestJoinUi(x.page, g.id, nextPhone(), nm); out.push(x); }
  const now = await H.clock.now(); const wait = g.startMs - moveTo - now;
  if (wait > 0) { await H.clock.advance(wait); await t.shared.track.refresh(); await H.advanceBrowsers(out.map((o) => o.ctx), wait, { run: false }); }
  await Promise.all(out.map((p) => p.page.waitForFunction(() => window.__rt && window.__rt.phase === "play", null, { timeout: 25000 })));
  return out;
}
const stepAll = async (t, list, n) => { for (let i = 0; i < n; i++) { await H.clock.advance(3000); t.shared.track.bump(3000); for (const o of list) await o.ctx.clock.runFor(3000); await new Promise((r) => setTimeout(r, 60)); } };
const view = (p) => p.evaluate(() => { const v = window.__rt.view(); return { phase: v.phase, log: v.log, unsent: v.unsent, error: v.error, results: v.results.map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, idx: x.idx, count: x.count })) }; });
const BUSY = { status: 503, contentType: "application/json", body: JSON.stringify({ error: "The service is busy right now. Please try again in a moment." }) };

export default [
  {
    id: "S23-01", name: "Exception: the public clock (random numbers) is unreachable from one phone for a minute; that phone waits calmly, shows no error page, and ends with the same numbers and winners as the others",
    resetAfter: true,
    async run(t) {
      const org = await t.org("o"); const g = await t.game(org, { lead: 7 * H.MIN, cfg: { rewards: RW }, settings: { whoCanJoin: "anyone" }, pay: true });
      const ps = await phones(t, g, ["Asha", "Bala", "Charu"]);
      await stepAll(t, ps, 10);
      const cut = ps[1].page; await cut.route(/drand\.sh|drand\.cloudflare\.com/, (r) => r.abort("connectionfailed"));
      await stepAll(t, ps, 20);
      const txt = await t.text(cut.page ?? cut);
      t.check("while the clock is unreachable the phone shows no technical words and no blank page", txt.length > 80 && !/undefined|TypeError|Failed to fetch|NetworkError|null\b/.test(txt), txt.slice(0, 200));
      t.check("the phone's own ticket is still on the screen", /Your ticket/i.test(txt));
      await cut.unroute(/drand\.sh|drand\.cloudflare\.com/);
      const r = await H.playBrowserGame(ps, { track: t.shared.track, maxSteps: 360 });
      t.check("all three phones ended", r.ended.every(Boolean), `${r.steps} steps, ended ${r.ended}`);
      t.check("the cut phone caught up: same numbers in the same order", JSON.stringify(r.views[1].log) === JSON.stringify(r.views[0].log), `${r.views[1].log.length} vs ${r.views[0].log.length}`);
      const id = inv.identicalWinners(r.views.map((v, i) => ({ who: "phone" + i, results: v.results }))); t.check(id.name, id.ok, id.detail);
      t.check("no JavaScript error on any phone", ps.every((x) => x.errors.length === 0), JSON.stringify(ps.map((x) => x.errors).flat().slice(0, 3)));
    },
  },
  {
    id: "S23-02", name: "Exception: our store answers 'busy' to one phone for a while mid-game; numbers keep coming (they are public), the phone keeps its claims and sends them later exactly once, winners identical",
    resetAfter: true,
    async run(t) {
      const org = await t.org("o"); const g = await t.game(org, { lead: 7 * H.MIN, cfg: { rewards: RW }, settings: { whoCanJoin: "anyone" }, pay: true });
      const ps = await phones(t, g, ["Asha", "Bala", "Charu"]);
      await stepAll(t, ps, 55); for (let i = 0; i < 40 && !(await view(ps[0].page)).log.length; i++) await stepAll(t, ps, 2);
      const busy = ps[2].page; await busy.route("**/api/z/**", (r) => (r.request().method() === "GET" && /\/(info|control)/.test(r.request().url()) ? r.continue() : r.fulfill(BUSY)));
      const before = (await view(busy)).log.length;
      await stepAll(t, ps, 25);
      const mid = await view(busy);
      t.check("numbers keep arriving while the store is busy", mid.log.length > before + 10, `${before} -> ${mid.log.length}`);
      const txt = await t.text(busy);
      t.check("no technical words on the screen while the store is busy", !/undefined|TypeError|Failed to fetch|http 5/.test(txt), txt.slice(0, 200));
      await busy.unroute("**/api/z/**"); if (ps[2].mon) ps[2].mon.clear(); // the 503s above were made on purpose
      const r = await H.playBrowserGame(ps, { track: t.shared.track, maxSteps: 360 });
      t.check("all phones ended", r.ended.every(Boolean), `${r.steps} steps`);
      t.check("nothing is left unsent on the phone that was cut off", (await view(busy)).unsent === 0);
      const id = inv.identicalWinners(r.views.map((v, i) => ({ who: "phone" + i, results: v.results }))); t.check(id.name, id.ok, id.detail);
      const claims = (await org.api("GET", `/api/z/${g.id}/claims`)).body.claims || [];
      const pid = await busy.evaluate(() => window.__rt.pid);
      const mine = claims.filter((c) => c.pid === pid), keys = new Set(mine.map((c) => c.pattern + ":" + c.idx));
      t.check("that phone's claims reached the store exactly once each", mine.length > 0 && mine.length === keys.size, `${mine.length} claims, ${keys.size} distinct`);
      t.check("no JavaScript error on any phone", ps.every((x) => x.errors.length === 0), JSON.stringify(ps.map((x) => x.errors).flat().slice(0, 3)));
    },
  },
  {
    id: "S23-03", name: "Exception: two consoles (a laptop and a tablet) change the same draft at the same time; the later save wins, nothing breaks, both consoles show the same game after a refresh",
    async run(t) {
      const org = await t.org("o"); const g = await t.game(org, { lead: 3 * H.HOUR, publish: false });
      const a = await openConsole(t, org, g.id, { device: "laptop" }), b = await openConsole(t, org, g.id, { device: "tablet" });
      await openStep(a.page, 2); await openStep(b.page, 2);
      await a.page.fill("#f-cap", "180"); await a.page.dispatchEvent("#f-cap", "input"); await saveStep(a.page, 2);
      await b.page.fill("#f-cap", "260"); await b.page.dispatchEvent("#f-cap", "input"); await saveStep(b.page, 2);
      const s = (await org.summary(g.id)).body;
      t.check("the later save is the one kept", Number(s.cap ?? s.limit) === 260, JSON.stringify({ cap: s.cap, limit: s.limit }));
      for (const [who, c] of [["laptop", a], ["tablet", b]]) {
        await c.page.reload(); await c.page.waitForSelector(".zc-sech"); await openStep(c.page, 2);
        t.check(`${who}: after a refresh the console shows the kept value and no error`, (await c.page.inputValue("#f-cap")) === "260" && !/Something went wrong|TypeError/.test(await t.text(c.page)), await c.page.inputValue("#f-cap"));
      }
    },
  },
  {
    id: "S23-04", name: "Exception: the same mobile number joins again from a fresh browser; it does not get a second ticket, it is told calmly that its ticket is on another phone, and the organizer's list still has one person",
    async run(t) {
      const org = await t.org("o"); const g = await t.game(org, { lead: 20 * H.MIN, cfg: { rewards: RW }, settings: { whoCanJoin: "anyone" }, pay: true });
      const ph = nextPhone();
      const x = await t.open({ device: "mobile" }); await guestJoinUi(x.page, g.id, ph, "Asha");
      await x.page.waitForFunction(() => window.__rt && window.__rt.pid, null, { timeout: 15000 }).catch(() => {});
      const pid1 = await x.page.evaluate(() => window.__rt && window.__rt.pid);
      t.check("the first phone holds a ticket", !!pid1);
      const y = await t.open({ device: "mobile" }); await guestJoinUi(y.page, g.id, ph, "Asha").catch(() => {});
      await y.page.waitForTimeout(2500);
      const txt = await t.text(y.page);
      t.check("the second browser is told its ticket is on another phone, in plain words", /another phone|already (holds|has) a ticket|one phone/i.test(txt), txt.slice(0, 220));
      t.check("no technical words", !/undefined|TypeError|Failed to fetch|http \d/.test(txt));
      const one = await inv.oneTicketPerPhone(g.id); t.check(one.name, one.ok, one.detail);
      const n = (await org.participants(g.id)).body.participants.length;
      t.check("the organizer's list has one person, not two", n === 1, String(n));
    },
  },
  {
    id: "S23-05", name: "Exception: the organizer ends the game while a phone is offline; when it is back the phone shows the ended game and the same results as everyone else",
    resetAfter: true,
    async run(t) {
      const org = await t.org("o"); const g = await t.game(org, { lead: 7 * H.MIN, cfg: { rewards: RW }, settings: { whoCanJoin: "anyone" }, pay: true });
      // the organizer opens the console BEFORE the start (as the console does when a game is built there): that registers the pause/stop key the phones watch for
      const c = await openConsole(t, org, g.id, { device: "laptop" }); await c.page.waitForTimeout(1500);
      const ps = await phones(t, g, ["Asha", "Bala"]);
      await stepAll(t, ps, 55); for (let i = 0; i < 40 && (await view(ps[0].page)).log.length < 6; i++) await stepAll(t, ps, 2); // a few numbers have been called
      await ps[1].ctx.setOffline(true);
      await c.page.reload(); await c.page.waitForSelector(".zc-sech", { timeout: 15000 }); await openStep(c.page, 9).catch(() => {});
      c.page.on("dialog", (d) => d.accept()); // "End this game for everyone?" is a browser confirm
      await c.page.waitForSelector('[data-ctl="stop"]', { timeout: 15000 }); await c.page.click('[data-ctl="stop"]');
      await c.page.waitForFunction(() => /Stop sent|End sent|sent\./.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
      const stopped = /sent/.test(await t.text(c.page));
      const ctl = (await H.call("GET", `/api/z/${g.id}/control`)).body; t.note("control log: " + JSON.stringify(ctl).slice(0, 300));
      t.check("the store holds a signed stop message", JSON.stringify(ctl).includes('"stop"'));
      t.check("the game was ended by the organizer", stopped);
      await stepAll(t, [ps[0], c], 20); // the stop takes effect about 40 s after it is signed; the offline phone holds its numbers while it cannot check with the organizer
      for (let i = 0; i < 40 && (await view(ps[0].page)).phase !== "ended"; i++) await stepAll(t, [ps[0], c], 2);
      t.note("phone 0 after the stop: " + JSON.stringify(await view(ps[0].page)).slice(0, 200));
      t.check("the online phone shows the ended game", (await view(ps[0].page)).phase === "ended", (await view(ps[0].page)).phase);
      await ps[1].ctx.setOffline(false);
      for (let i = 0; i < 60 && (await view(ps[1].page)).phase !== "ended"; i++) await stepAll(t, ps, 3);
      await stepAll(t, ps, 12); // the last results reach both phones
      const v0 = await view(ps[0].page), v1 = await view(ps[1].page);
      const key = (xs) => JSON.stringify(xs.map((x) => `${x.pattern}:${x.ordinal}:${x.idx}`).sort());
      t.check("the phone that was offline now shows the ended game", v1.phase === "ended", v1.phase);
      t.check("both phones show the same results", key(v0.results) === key(v1.results), `${v0.results.length} vs ${v1.results.length}`);
      t.check("the ended screen says it in plain words", /ended|over|finished/i.test(await t.text(ps[1].page)));
      t.check("no JavaScript error on any phone", ps.every((x) => x.errors.length === 0), JSON.stringify(ps.map((x) => x.errors).flat().slice(0, 3)));
    },
  },
];
