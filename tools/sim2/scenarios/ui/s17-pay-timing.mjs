// Group 17: paying the real game page just before and just after the start time, and what the Organizer sees next.
// After a confirmed payment the pay page opens the engagement page by itself (about 7 seconds), unless the person taps "Stay on this page".
import { H, payOnPage, payStatus, nextPhone, cohostUrl, passK5Gate } from "./kit.mjs";

const landed = (page, eid, ms = 20000) => page.waitForURL((u) => /\/zc(\.html)?$/.test(u.pathname) && u.searchParams.get("e") === eid, { timeout: ms }).then(() => true, () => false);

export default [
  {
    id: "S17-01", name: "Pay 4 minutes BEFORE the start: the pay page confirms, then opens the engagement page by itself; the game is paid and keeps its start time",
    resetAfter: true,
    async run(t) {
      const org = await t.org("o"); const g = await t.game(org, { lead: 6 * H.MIN, pay: false });
      const s0 = (await org.summary(g.id)).body;
      await H.clock.advance(2 * H.MIN); await t.shared.track.refresh();
      const x = await t.open({ device: "laptop", token: org.token });
      await x.page.goto(`${H.SIM}/pay.html?e=${g.id}`); await x.page.waitForSelector("#paygo");
      await payOnPage(x.page, { email: org.email });
      await x.page.waitForFunction(() => /PAYMENT RECEIVED/i.test(document.body.innerText), null, { timeout: 15000 });
      t.check("the receipt shows, with the way to stay and the way to open now", !!(await x.page.$("#goStay")) && /Open my game/i.test(await t.text(x.page)));
      t.check("the Organizer lands on the engagement page by themselves", await landed(x.page, g.id), x.page.url());
      await x.page.waitForSelector(".zc-sech", { timeout: 15000 });
      t.check("the engagement page shows Paid, not 'Payment pending'", /\bPaid\b/.test(await t.text(x.page)) && !/Payment pending/i.test(await t.text(x.page)));
      const s1 = (await org.summary(g.id)).body;
      t.check("the game is paid and its start time did not move", s1.payment?.status === "paid" && s1.startMs === s0.startMs, `${s0.startMs} -> ${s1.startMs}`);
      t.check("exactly one payment", (await payStatus(org, g.id)) === "paid" && (await H.sql("SELECT COUNT(*) c FROM payment WHERE eid=? AND status='paid'", [g.id]))[0].c === 1);
      await t.shot(x.page, "pay-before-start-landed");
    },
  },
  {
    id: "S17-02", name: "Pay 3 minutes AFTER the start time: the game begins at the payment, the Organizer lands on the engagement page, waiting guests get the game",
    resetAfter: true,
    async run(t) {
      const org = await t.org("o"); const g = await t.game(org, { lead: 5 * H.MIN, pay: false });
      await H.clock.advance(8 * H.MIN); await t.shared.track.refresh();
      const x = await t.open({ device: "laptop", token: org.token });
      await x.page.goto(`${H.SIM}/pay.html?e=${g.id}`); await x.page.waitForSelector("#paygo");
      const before = await H.clock.now();
      await payOnPage(x.page, { email: org.email });
      await x.page.waitForFunction(() => /PAYMENT RECEIVED/i.test(document.body.innerText), null, { timeout: 15000 });
      t.check("the receipt says when the game begins (it was waiting)", /begins at/i.test(await t.text(x.page)), (await t.text(x.page)).slice(0, 300));
      t.check("the Organizer lands on the engagement page by themselves", await landed(x.page, g.id), x.page.url());
      await x.page.waitForSelector(".zc-sech", { timeout: 15000 });
      t.check("the engagement page shows Paid", /\bPaid\b/.test(await t.text(x.page)) && !/Payment pending/i.test(await t.text(x.page)));
      const s = (await org.summary(g.id)).body;
      t.check("the start time is the payment time (not the old time)", Math.abs((s.startMs ?? 0) - before) < 60_000, `${new Date(s.startMs).toISOString()} vs ${new Date(before).toISOString()}`);
      await t.shot(x.page, "pay-after-start-landed");
    },
  },
  {
    id: "S17-03", name: "'Stay on this page' keeps the receipt; the page does not jump; the button still opens the engagement",
    resetAfter: true,
    async run(t) {
      const org = await t.org("o"); const g = await t.game(org, { lead: 30 * H.MIN, pay: false });
      const x = await t.open({ device: "laptop", token: org.token });
      await x.page.goto(`${H.SIM}/pay.html?e=${g.id}`); await x.page.waitForSelector("#paygo");
      await payOnPage(x.page, { email: org.email });
      await x.page.waitForFunction(() => /PAYMENT RECEIVED/i.test(document.body.innerText), null, { timeout: 15000 });
      await x.page.click("#goStay");
      await x.page.waitForTimeout(9000);
      t.check("still on the pay page after 9 seconds", /\/pay/.test(new URL(x.page.url()).pathname), x.page.url());
      t.check("the receipt is still shown", /PAYMENT RECEIVED/i.test(await t.text(x.page)));
      await x.page.click("text=Open my game");
      t.check("the button opens the engagement page", await landed(x.page, g.id, 15000), x.page.url());
    },
  },
  {
    id: "S17-04", name: "A Co-host pays for the game: the receipt shows and the Co-host lands on the engagement page they are allowed to see",
    resetAfter: true,
    async run(t) {
      const org = await t.org("o"); const g = await t.game(org, { lead: 45 * H.MIN, pay: false });
      const c = await org.inviteCohost({ label: "Chandra", phone: nextPhone(), e: g.id });
      const x = await t.open({ device: "mobile" });
      await x.page.goto(cohostUrl(g.id, c)); await passK5Gate(x.page); await x.page.waitForSelector(".zc-sech", { timeout: 15000 });
      await x.page.goto(`${H.SIM}/pay.html?e=${g.id}`); await x.page.waitForSelector("#paygo", { timeout: 15000 });
      await payOnPage(x.page, { email: org.email });
      await x.page.waitForFunction(() => /PAYMENT RECEIVED/i.test(document.body.innerText), null, { timeout: 15000 });
      t.check("the Co-host lands on the engagement page", await landed(x.page, g.id), x.page.url());
      t.check("API says paid", (await payStatus(org, g.id)) === "paid");
    },
  },
];
