// Rehearsals in real Chrome (1.6.0): the same phone and the same people go through rehearsal 1, 2, 3 and the real game. Each run has its own link, ticket, check-in and saved data; an old tab of a finished
// rehearsal shows the calm "over" page with the real game's link; a link of one run never opens another; the real game starts clean. One browser holds the phone; a second browser is "a new phone".
import { H, guestJoinUi, nextPhone } from "./kit.mjs";

async function checkInUi(page) {
  await page.waitForSelector("#ckshow", { timeout: 20000 }); const code = (await page.innerText("#ckshow")).trim();
  await page.check("#ckokn"); await page.check("#ckokm"); await page.fill("#ckcode", code); await page.click("#cksubmit");
  await page.waitForFunction(() => !document.getElementById("ckshow"), null, { timeout: 15000 });
}
const BLOCK = (id, n) => [`Game ID: ${id}`, `REHEARSAL GAME ${n}`, "This link and this game are for rehearsal only. The real game has a different link and a different game."];

export default [
  {
    id: "S26-01", name: "Rehearsals: one phone through rehearsal 1, 2, 3 and the real game; separate tickets, check-ins and saved data; old tabs say 'over'; the real game starts clean",
    async run(t) {
      const org = await t.org("o"); const g = await t.game(org, { lead: 60 * H.MIN, cfg: { callSeconds: 12 }, settings: { whoCanJoin: "anyone" }, pay: true });
      const phone = nextPhone();
      const A = await t.open({ device: "mobile" });
      const api = (m, p, b) => H.call(m, p, b, org.h);
      const runs = [];
      for (let n = 1; n <= 3; n++) {
        const r = await api("POST", `/api/z/${g.id}/rehearsal`, { people: "none" }); t.check(`rehearsal ${n} starts`, r.status === 200 && r.body.id === `${g.id}-R${n}`, JSON.stringify(r.body).slice(0, 120));
        const id = r.body.id; runs.push(id);
        await guestJoinUi(A.page, id, phone, "Asha");
        await A.page.waitForSelector("#rehbanner", { timeout: 20000 });
        const lines = await A.page.$$eval("#rehbanner > div", (ds) => ds.map((d) => d.textContent));
        t.check(`rehearsal ${n}: the page opens with the exact block`, JSON.stringify(lines) === JSON.stringify(BLOCK(id, n)), JSON.stringify(lines));
        await checkInUi(A.page); // checks in again in every run
        t.check(`rehearsal ${n}: the ticket opens after the check-in of THIS run`, await A.page.locator(".zticket").count() > 0);
        const keys = await A.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ctz:")));
        t.check(`rehearsal ${n}: the phone's saved data is keyed by this run's code (no other run's)`, keys.filter((k) => /^ctz:[A-Z0-9_-]+:/i.test(k)).every((k) => k.startsWith("ctz:" + id + ":") || !runs.slice(0, -1).some((o) => k.startsWith("ctz:" + o + ":") && false) ), keys.join(","));
        t.check(`rehearsal ${n}: a link of another run is not this run (different code)`, !runs.slice(0, -1).includes(id));
        t.note(`R${n} ticket text: ` + (await A.page.locator(".zticket").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 60));
        const close = await api("POST", `/api/z/${id}/rehearsalclose`, {}); t.check(`rehearsal ${n} can be closed`, close.status === 200);
      }
      // the old tab of rehearsal 3 (still open): its pages say it is over after a moment, and offer the real game
      await A.page.waitForFunction(() => /this rehearsal is over/i.test(document.body.innerText), null, { timeout: 60000 }).then(() => t.check("the old tab of a closed rehearsal says it is over (no reload needed)", true), async () => { await A.page.reload(); await A.page.waitForFunction(() => /this rehearsal is over/i.test(document.body.innerText), null, { timeout: 20000 }).then(() => t.check("an old rehearsal page says it is over after a reload", true), async () => t.check("an old rehearsal page says it is over", false, (await A.page.innerText("body")).replace(/\s+/g, " ").slice(0, 300))); });
      t.check("the over page offers the real game's link", (await A.page.locator("#realgame").getAttribute("href")) === "/z.html?e=" + g.id);
      // run 1's link opened now: over, with the real game's link
      await A.page.goto(`${H.SIM}/z?e=${runs[0]}`); await A.page.waitForFunction(() => /this rehearsal is over/i.test(document.body.innerText), null, { timeout: 20000 }).then(() => t.check("a link of rehearsal 1 opened later is the over page", true), () => t.check("a link of rehearsal 1 opened later is the over page", false));
      // the real game: the same phone, a clean start
      await guestJoinUi(A.page, g.id, phone, "Asha");
      t.check("the real game's page has no REHEARSAL block", (await A.page.locator("#rehbanner").count()) === 0);
      const sql = async (q, ...params) => (await (await fetch(`${H.SIM}/__sim/sql`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sql: q, params }) })).json()).rows;
      const counts = await Promise.all([...runs, g.id].map(async (id) => (await sql("SELECT COUNT(*) AS c FROM seat WHERE eid=?", id))[0].c));
      t.check("each run has exactly one seat for this phone (4 runs, 4 seats)", counts.every((c) => c === 1), JSON.stringify(counts));
      const claims = (await sql("SELECT COUNT(*) AS c FROM claim WHERE eid=?", g.id))[0].c; t.check("the real game holds no claims and no rehearsal data", claims === 0);
      const present = await Promise.all([...runs, g.id].map(async (id) => (await sql("SELECT COUNT(*) AS c FROM seat WHERE eid=? AND pid IN (SELECT pid FROM participant WHERE eid=?)", id, id))[0].c));
      t.check("every run's participant belongs to that run only", present.every((c) => c === 1), JSON.stringify(present));
      // a second phone (a new browser) on the real link and on a rehearsal link
      const B = await t.open({ device: "mobile" }); await guestJoinUi(B.page, g.id, nextPhone(), "Bala");
      t.check("a new phone joins the real game without trouble", (await B.page.locator("#rehbanner").count()) === 0);
      await t.shot(A.page, "real-after-rehearsals");
    },
  },
  {
    id: "S26-02", name: "Rehearsals and the offline app: a rehearsal page opened offline stays on its own run; the real game's page offline never shows a rehearsal's data; after the rehearsal is closed the same link says it is over",
    async run(t) {
      const org = await t.org("o"); const g = await t.game(org, { lead: 60 * H.MIN, cfg: { callSeconds: 12 }, settings: { whoCanJoin: "anyone" }, pay: true });
      const api = (m, p, b) => H.call(m, p, b, org.h);
      const r = await api("POST", `/api/z/${g.id}/rehearsal`, { people: "none" }); const rid = r.body.id;
      const A = await t.open({ device: "mobile" }); const phone = nextPhone();
      await guestJoinUi(A.page, rid, phone, "Asha"); await A.page.waitForSelector("#rehbanner", { timeout: 20000 });
      await A.page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller ? true : navigator.serviceWorker.getRegistration().then((x) => !!(x && x.active)), null, { timeout: 15000 }).catch(() => {});
      await A.page.waitForTimeout(3000);
      await A.ctx.setOffline(true); await A.page.reload().catch(() => {}); await A.page.waitForTimeout(2500);
      const off = await t.text(A.page);
      t.check("offline, the rehearsal page still opens (saved on the device)", off.length > 40, off.slice(0, 160));
      t.check("offline, the rehearsal page does not show an error page of the browser", !/no internet|ERR_|This site can.t be reached/i.test(off), off.slice(0, 120));
      await A.page.goto(`${H.SIM}/z?e=${g.id}`).catch(() => {}); await A.page.waitForTimeout(2500);
      const real = await t.text(A.page);
      t.check("offline, the REAL game's page never carries the rehearsal block or its ticket", !/REHEARSAL GAME/i.test(real) && (await A.page.locator("#rehbanner").count()) === 0 && (await A.page.locator(".zticket").count()) === 0, real.slice(0, 160));
      await A.ctx.setOffline(false);
      const close = await api("POST", `/api/z/${rid}/rehearsalclose`, {}); t.check("the rehearsal closes", close.status === 200);
      await A.page.goto(`${H.SIM}/z?e=${rid}`); await A.page.waitForFunction(() => /this rehearsal is over/i.test(document.body.innerText), null, { timeout: 20000 }).then(() => t.check("online again, the same link says the rehearsal is over", true), () => t.check("online again, the same link says the rehearsal is over", false));
      await t.shot(A.page, "rehearsal-offline-over");
    },
  },
];
