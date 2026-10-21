// The verdict on mistakes: a real person's slips, made in real Chrome (Playwright), and for EACH one the screen must
//  (1) explain it in place, politely, with a plain title and numbered steps and no technical word (no code, address, JSON, HTTP wording),
//  (2) offer "Take me there" that really lands on the right box (outlined and focused) or the right step,
//  (3) let the person fix it and carry on: the fix is made, the same action then WORKS, and what they had typed is still there,
//  (4) when the fix was on another step, bring them back to where they were working,
//  (5) never change a rule (the same refusal still happens if they do not fix it) and never show a pop-up for a typing slip.
// Run: node tools/sim2/scenarios/ui/run.mjs --only S16-
import { H, openConsole, openStep, openPeople, tickTerms, joinForm, joinApi, nextPhone } from "./kit.mjs";

const BANNED = /\b(invalid|illegal|forbidden|unauthori[sz]ed|bad request|exception|undefined|null|json|https?|endpoint|payload|stack ?trace|server error|error code|api)\b|\{|\}|\?[a-z]+=|=>|<[a-z]|\b[45]\d\d\b/i;
/** the guide as the person sees it: in place (.ctg-inline) or as a pop-up (#ctg-dialog) */
async function guide(page, { wait = 4000 } = {}) {
  await page.waitForFunction(() => document.querySelector(".ctg-inline, #ctg-dialog"), null, { timeout: wait }).catch(() => {});
  return page.evaluate(() => {
    const el = document.querySelector("#ctg-dialog .ctg-card") || document.querySelector(".ctg-inline"); if (!el) return null;
    return { popup: !!el.closest("#ctg-dialog"), title: (el.querySelector("b,h2") || {}).textContent || "", text: el.textContent.replace(/\s+/g, " ").trim(), steps: el.querySelectorAll("li").length, go: [...el.querySelectorAll('[data-ctg="go"]')].map((b) => b.textContent.trim()), buttons: [...el.querySelectorAll("button,a")].map((b) => b.textContent.trim()) };
  });
}
/** the checks every guide must pass; returns the guide */
async function wellFormed(t, page, id, what, { popup = false, title, needsGo = true } = {}) {
  const g = await guide(page);
  t.check(`${id} ${what}: a guide appears`, !!g);
  if (!g) return null;
  t.check(`${id}: shown ${popup ? "as a pop-up" : "in place, not as a pop-up"}`, g.popup === popup, g.popup ? "pop-up" : "in place");
  if (title) t.check(`${id}: title says what is wrong (${title})`, title.test(g.title), g.title);
  t.check(`${id}: has at least one numbered step`, g.steps >= 1, g.steps);
  t.check(`${id}: no technical word, no blame`, !BANNED.test(g.text) && !/\byou (failed|forgot|should have)\b/i.test(g.text), g.text.slice(0, 160));
  if (needsGo) t.check(`${id}: offers Take me there`, g.go.length === 1, g.go.join("|"));
  return g;
}
/** presses Take me there and says which element now holds focus / the outline */
async function takeMe(page) {
  await page.click('.ctg-inline [data-ctg="go"], #ctg-dialog [data-ctg="go"]');
  await page.waitForTimeout(400);
  return page.evaluate(() => { const a = document.activeElement, f = document.querySelector(".ctg-flag"); return { active: a ? (a.id || a.tagName) : "", flagged: f ? (f.id || f.tagName) : "", openStep: (document.querySelector(".zc-card.open") || {}).id || "" }; });
}
const eidOf = (page) => new URL(page.url()).searchParams.get("e");

export default [
  // ===================================================================== sign-in
  {
    id: "S16-01", name: "Sign-in mistakes (Organizer): empty e-mail, bad e-mail, wrong code, short code. Each explains itself in place; Take me there focuses the right box; after the fix the sign-in works",
    async run(t) {
      const x = await t.open({ device: "laptop" }); const P = x.page;
      await P.goto(H.SIM + "/#login"); await P.waitForSelector("#lMail");
      await P.fill("#lMail", ""); await P.click("#lgGo");
      const g1 = await wellFormed(t, P, "S16-01a", "empty e-mail", { title: /e-mail/i });
      const at = await takeMe(P); t.check("S16-01a: Take me there lands on the e-mail box", /lMail/.test(at.active) || /lMail/.test(at.flagged), JSON.stringify(at));
      await P.fill("#lMail", "abc"); await P.click("#lgGo");
      await wellFormed(t, P, "S16-01b", "e-mail 'abc'", { title: /e-mail/i });
      // fix it and carry on: the real e-mail works and the code box appears, the typed e-mail was kept
      const mail = t.mail("v16"); await P.fill("#lMail", mail);
      await tickTerms(t, P, { scope: "[data-cbc='K2']", btn: "#lgGo", what: "Sign-in" }).catch(() => {}); await P.click("#lgGo"); await P.waitForSelector("#lCode");
      t.check("S16-01c: after the fix the code box opens and shows the typed e-mail", (await P.textContent(".sendto")) === mail);
      await P.fill("#lCode", "000000"); await P.click("#cdGo");
      await wellFormed(t, P, "S16-01d", "wrong code", { title: /code/i });
      await P.fill("#lCode", "12"); await P.click("#cdGo");
      await wellFormed(t, P, "S16-01e", "code of 2 digits", { title: /6 digits/i });
      await P.fill("#lCode", ""); let code = null; try { code = await H.mailbox.code(mail); } catch { code = null; }
      if (code) { await P.fill("#lCode", code); await P.click("#cdGo"); await P.waitForURL(/zc/, { timeout: 12000 }).catch(() => {}); t.check("S16-01f: the right code then signs in (nothing was changed by the mistakes)", /zc/.test(P.url()), P.url()); }
    },
  },
  // ===================================================================== console: step 2 (size), a typing slip on the same step
  {
    id: "S16-02", name: "Console step 2 (Organizer): 0, empty and over-limit players; each is explained in place, Take me there outlines the box, and after typing a good number Save and continue works",
    async run(t) {
      const org = await t.org("v162"); const g = await t.game(org, { publish: false });
      const x = await openConsole(t, org, g.id, { device: "laptop" }); const P = x.page;
      await openStep(P, 2);
      await P.fill("#f-cap", "0"); await P.click('#sec2 [data-save="2"]');
      await wellFormed(t, P, "S16-02a", "players = 0", { title: /how many people/i });
      const at = await takeMe(P); t.check("S16-02a: Take me there lands on the players box", /f-cap/.test(at.active) || /f-cap/.test(at.flagged), JSON.stringify(at));
      await P.fill("#f-cap", ""); await P.click('#sec2 [data-save="2"]');
      await wellFormed(t, P, "S16-02b", "players empty", { title: /how many people/i });
      await P.fill("#f-cap", "99999"); await P.click('#sec2 [data-save="2"]');
      const g3 = await wellFormed(t, P, "S16-02c", "players over 10,000", { title: /more than our standard packs/i, needsGo: true });
      t.check("S16-02c: offers a WhatsApp message to us (a custom arrangement)", g3 && g3.buttons.some((b) => /WhatsApp/i.test(b)), g3 && g3.buttons.join("|"));
      await P.fill("#f-cap", "150"); await P.click('#sec2 [data-save="2"]'); await P.waitForTimeout(900);
      const sum = await org.summary(g.id); t.check("S16-02d: after the fix the step saves for real (150 players)", sum.body && (sum.body.cap === 150 || sum.body.participants === 150 || JSON.stringify(sum.body).includes("150")), JSON.stringify(sum.body).slice(0, 120));
      t.check("S16-02e: the guide is gone once the step is saved", (await guide(P, { wait: 500 })) === null);
    },
  },
  // ===================================================================== console: the team step, each box named exactly
  {
    id: "S16-03", name: "Console step 5 (Organizer): Host and Co-host slips; each guide names the right box and Take me there outlines exactly it",
    async run(t) {
      const org = await t.org("v163"); const g = await t.game(org, { publish: false });
      const x = await openConsole(t, org, g.id, { device: "laptop" }); const P = x.page;
      await openStep(P, 5);
      const cases = [
        ["a", "Host: nothing typed", async () => { await P.click("#hostadd"); }, /Host's name/i, /hostlabel/],
        ["b", "Host: name but no mobile or e-mail", async () => { await P.fill("#hostlabel", "Hema"); await P.click("#hostadd"); }, /mobile number or e-mail/i, /hostphone/],
        ["c", "Host: e-mail 'x@'", async () => { await P.fill("#hostemail", "x@"); await P.click("#hostadd"); }, /e-mail address/i, /hostemail/],
        ["d", "Host: phone '123'", async () => { await P.fill("#hostemail", ""); await P.fill("#hostphone", "123"); await P.click("#hostadd"); }, /mobile number/i, /hostphone/],
        ["e", "Co-host: nothing typed", async () => { await P.click("#cohostadd"); }, /Co-host's name/i, /cohostlabel/],
        ["f", "Co-host: name but no number", async () => { await P.fill("#cohostlabel", "Colin"); await P.click("#cohostadd"); }, /Co-host's mobile/i, /cohostphone/],
      ];
      for (const [k, what, doIt, title, box] of cases) {
        await doIt();
        await wellFormed(t, P, "S16-03" + k, what, { title });
        const at = await takeMe(P); t.check(`S16-03${k}: Take me there lands on the right box`, box.test(at.active) || box.test(at.flagged), JSON.stringify(at));
      }
      // the fix works: a proper Host is then added
      await P.fill("#hostphone", "9812345679"); await P.fill("#hostlabel", "Hema"); await P.click("#hostadd"); await P.waitForTimeout(1200);
      t.check("S16-03g: after the fix the Host is really added (shown in the team list)", /Hema/.test(await t.text(P, "#sec5")), (await t.text(P, "#sec5")).slice(0, 100));
    },
  },
  // ===================================================================== publish: the greyed-out button, then a typing slip
  {
    id: "S16-04", name: "Publish (Organizer): the greyed-out button says what is still needed; a bad e-mail is explained in place; after the fix the game publishes",
    async run(t) {
      const org = await t.org("v164"); const g = await t.game(org, { publish: false });
      const x = await openConsole(t, org, g.id, { device: "laptop" }); const P = x.page;
      await openStep(P, 7); await P.click("#publishopen"); await P.waitForSelector("#pubEmail"); await P.waitForTimeout(500);
      const hint = await P.textContent(".ctg-needs").catch(() => "");
      t.check("S16-04a: the Publish button says what is still needed (e-mail, mobile, agreements)", /e-mail/i.test(hint) && /mobile/i.test(hint) && /agree/i.test(hint), hint);
      await P.fill("#pubEmail", "nope"); await P.fill("#pubPhone", "1"); await tickTerms(t, P, { scope: "[data-cbc='K1']", btn: "#pubgo", what: "Publish" }).catch(() => {});
      await P.click("#pubgo");
      await wellFormed(t, P, "S16-04b", "bad e-mail on publish", { title: /e-mail/i });
      await P.fill("#pubEmail", org.email); await P.fill("#pubPhone", "9811122233"); await P.click("#pubgo");
      await P.waitForSelector("#cancelopen", { timeout: 15000 }).catch(() => {});
      t.check("S16-04c: after the fix the game is published", !!(await P.$("#cancelopen")));
      const sum = await org.summary(g.id); t.check("S16-04d: and the server agrees (published)", JSON.stringify(sum.body).includes("publish") || sum.body.published === true || sum.body.status === "published", JSON.stringify(sum.body).slice(0, 100));
    },
  },
  // ===================================================================== the service has a bad moment
  {
    id: "S16-05", name: "When the service has a bad moment (Organizer): a failed save (500), too many tries (429) and a dropped connection each explain themselves, say nothing is lost, offer Try again, and Try again then really saves",
    async run(t) {
      const org = await t.org("v165"); const g = await t.game(org, { publish: false });
      const x = await openConsole(t, org, g.id, { device: "laptop" }); const P = x.page;
      await openStep(P, 2); await P.fill("#f-cap", "60");
      const fail = (status, body) => P.route("**/api/z/**", (r) => (r.request().method() !== "GET" ? (status ? r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }) : r.abort("internetdisconnected")) : r.continue()));
      const close = async () => { await P.click('#ctg-dialog [data-ctg="close"]').catch(() => {}); };
      await fail(500, { error: "Something went wrong. Please try again.", code: "server-error" }); await P.click('#sec2 [data-save="2"]');
      const a = await wellFormed(t, P, "S16-05a", "server failure", { popup: true, title: /on our side/i, needsGo: false });
      t.check("S16-05a: says it is not the person's doing and offers Try again and a WhatsApp message with a reference", a && /not your doing/i.test(a.text) && a.buttons.includes("Try again") && /Reference:/.test(a.text) && a.buttons.some((b) => /WhatsApp/i.test(b)), a && a.buttons.join("|"));
      await close(); await P.waitForTimeout(1200); t.check("S16-05z: after Close the pop-up does not come back by itself", !(await P.$("#ctg-dialog")), "reappeared"); await P.unroute("**/api/z/**"); x.mon.clear(); // the 500 above was made on purpose
      await fail(429, { error: "Too many tries from this network. Please use an e-mail code, or try again tomorrow." }); await P.fill("#f-cap", "60"); await P.click('#sec2 [data-save="2"]');
      const b = await wellFormed(t, P, "S16-05b", "too many tries", { popup: true, title: /try again a little later/i, needsGo: false });
      t.check("S16-05b: says nothing is lost", b && /nothing you did is lost/i.test(b.text));
      await close(); await P.unroute("**/api/z/**");
      await fail(0);
      await P.click('#sec2 [data-save="2"]', { timeout: 6000 }).catch(async (e) => { console.log("CLICK-BLOCKED-BY:", JSON.stringify(await P.evaluate(() => { const b = document.querySelector('#sec2 [data-save="2"]'); const r = b && b.getBoundingClientRect(); const top = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { dialog: !!document.getElementById("ctg-dialog"), top: top ? top.tagName + "." + String(top.className).slice(0, 50) + "#" + top.id : null, rect: r && [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }; }))); throw e; });
      const c = await wellFormed(t, P, "S16-05c", "internet down", { popup: true, title: /reach the service/i, needsGo: false });
      t.check("S16-05c: says what was typed is not lost and nothing was charged", c && /(nothing you typed is lost|not lost)/i.test(c.text));
      t.check("S16-05d: what the person typed is still in the box", (await P.inputValue("#f-cap")) === "60");
      await P.unroute("**/api/z/**"); x.mon.clear(); // the 500 above was made on purpose
      const retry = await P.$('.ctg-inline [data-ctg="retry"], #ctg-dialog [data-ctg="retry"]'); if (retry) await retry.click(); else await P.click('#sec2 [data-save="2"]');
      await P.waitForTimeout(1200);
      const sum = await org.summary(g.id); t.check("S16-05e: Try again then really saves", JSON.stringify(sum.body).includes("60"), JSON.stringify(sum.body).slice(0, 100));
    },
  },
  // ===================================================================== the participant's join form
  {
    id: "S16-06", name: "Participant join form: a short number, a number with letters and an empty name are each explained in place with steps; after the fix the person gets their ticket",
    async run(t) {
      const org = await t.org("v166"); const g = await t.game(org, { settings: { who: "anyone" } });
      const x = await t.open({ device: "mobile" }); const P = x.page;
      await P.goto(H.SIM + "/z?e=" + g.id); await P.waitForSelector("[data-cbc='K4'] input[data-box]", { timeout: 15000 });
      await tickTerms(t, P, { scope: "[data-cbc='K4']", btn: "#go", what: "Join" });
      await P.fill("#ph", "123"); if (await P.$("#nm")) await P.fill("#nm", "Asha"); await P.click("#go");
      await wellFormed(t, P, "S16-06a", "short mobile number", { title: /mobile number/i });
      const at = await takeMe(P); t.check("S16-06a: Take me there lands on the number box", /ph/.test(at.active) || /ph/.test(at.flagged), JSON.stringify(at));
      await P.fill("#ph", "9812345671"); await P.click("#go"); await P.waitForTimeout(1500);
      t.check("S16-06b: after the fix the person is in and sees their ticket or the countdown", /You are in|Starting in|ticket/i.test(await t.text(P)), (await t.text(P)).slice(0, 100));
    },
  },
  // ===================================================================== a participant in every state
  {
    id: "S16-07", name: "Participant in every state (list-only game, full game, ticket on another phone, cancelled game, game not open yet, mistyped link, bad personal link): each is explained with steps, without a button into the Organizer's console, and nothing technical is shown",
    async run(t) {
      const org = await t.org("v167");
      const check = async (id, what, P, expect) => {
        const g = await wellFormed(t, P, id, what, { title: expect, needsGo: false });
        if (g) { t.check(`${id}: a guest is given no button into the Organizer's console`, g.go.length === 0, g.go.join("|")); t.check(`${id}: does not tell a guest to use an Organizer-only screen`, !/Number of participants|Check and publish|Go to my games/i.test(g.text), g.text.slice(0, 140)); }
        return g;
      };
      const tryJoin = async (P, eid, phone, name) => { await P.goto(H.SIM + "/z?e=" + eid); const form = await P.waitForSelector("[data-cbc='K4'] input[data-box]", { timeout: 6000 }).then(() => true).catch(() => false); if (form) await joinForm(P, phone, name); };
      const open = async () => (await t.open({ device: "mobile" })).page;
      const shut = async (...ps) => { for (const q of ps) await q.context().close().catch(() => {}); }; // the laptop allows 6 browsers at once
      // 1. list-only game, a number that is not on the list
      const g1 = await t.game(org, { settings: { whoCanJoin: "list" }, pay: true });
      let P = await open(); await tryJoin(P, g1.id, nextPhone(), "Stranger");
      await check("S16-07a", "a stranger in a list-only game", P, /by invitation/i); await shut(P);
      // 2. a full game
      const g2 = await org.createGame({ leadMs: 3 * H.HOUR, cfg: { cap: 2 } }); await org.settings(g2.id, { whoCanJoin: "anyone" }); await org.publish(g2.id); await org.pay(g2.id).catch(() => {});
      for (let i = 0; i < 2; i++) await joinApi(g2.id, nextPhone(), "P" + i);
      P = await open(); await tryJoin(P, g2.id, nextPhone(), "Late Larry");
      await check("S16-07b", "a full game", P, /game is full/i); await shut(P);
      // 3. the same number on a second phone
      const g3 = await t.game(org, { settings: { whoCanJoin: "anyone" } }); const ph = nextPhone();
      const A = await open(); await tryJoin(A, g3.id, ph, "Asha"); await A.waitForTimeout(1200);
      const B = await open(); await tryJoin(B, g3.id, ph, "Asha again");
      await check("S16-07c", "the same number on a second phone", B, /another phone/i); await shut(A, B);
      // 4. a cancelled game's link
      const g4 = await t.game(org, { settings: { whoCanJoin: "anyone" } }); await org.cancel(g4.id).catch(() => {});
      P = await open(); await P.goto(H.SIM + "/z?e=" + g4.id);
      await check("S16-07d", "a cancelled game", P, /not going ahead/i); await shut(P);
      // 5. a game that is not published yet
      const g5 = await t.game(org, { publish: false }); P = await open(); await P.goto(H.SIM + "/z?e=" + g5.id);
      await check("S16-07e", "a game that is not open yet", P, /not open yet/i); await shut(P);
      // 6. a mistyped link
      P = await open(); await P.goto(H.SIM + "/z?e=NOSUCHGAME1");
      await check("S16-07f", "a mistyped link", P, /does not work/i); await shut(P);
      // 7. a personal link with a wrong token: pressing the button gets a clear answer, nothing is changed
      const g6 = await t.game(org, { settings: { whoCanJoin: "list" }, pay: true });
      P = await open(); await P.goto(H.SIM + "/z?e=" + g6.id + "&t=notarealtoken123456");
      await P.waitForSelector("#go", { timeout: 12000 }); await tickTerms(t, P, { scope: "[data-cbc='K4']", btn: "#go", what: "Join" }).catch(() => {}); await P.click("#go");
      await P.waitForTimeout(2200); const tx = await t.text(P, "#app");
      t.check("S16-07g: a wrong or old personal link says so plainly and tells the guest exactly what to do (the page's own message is already complete)", /not active any more/i.test(tx) && /ask the person who invited you/i.test(tx) && !BANNED.test(tx), tx.slice(0, 160));
    },
  },
  // ===================================================================== take me there, then bring me back to where I was working
  {
    id: "S16-08", name: "Take me there and back (Organizer): from Check and publish the guide takes the person to another step and exact box; after the fix one tap on 'Done? Back to ...' returns them to where they were; what they had typed on the way is still there",
    async run(t) {
      const org = await t.org("v168"); const g = await t.game(org, { publish: false });
      const x = await openConsole(t, org, g.id, { device: "laptop" }); const P = x.page;
      await openStep(P, 7); await P.click("#publishopen"); await P.waitForSelector("#pubEmail"); await P.fill("#pubEmail", org.email); await P.waitForTimeout(300);
      // the guide is asked to take the person to step 2 (as it does for a pack that is too small)
      await P.evaluate(() => window.CTG.go({ step: 2, field: "#f-cap", label: "Number of participants" }, { back: { step: window.ctzStep(), label: window.ctzStepName(window.ctzStep()) } }));
      await P.waitForTimeout(600);
      const at = await P.evaluate(() => ({ open: (document.querySelector(".zc-card.open") || {}).id, flagged: (document.querySelector(".ctg-flag") || {}).id, active: (document.activeElement || {}).id }));
      t.check("S16-08a: step 2 is open and its players box is outlined and focused", at.open === "sec2" && (/f-cap/.test(at.flagged) || /f-cap/.test(at.active)), JSON.stringify(at));
      const back = await P.$("#ctg-back"); t.check("S16-08b: a 'Done? Back to Check and publish' button appears", !!back && /Check and publish/.test(await back.textContent()), back ? await back.textContent() : "none");
      await P.fill("#f-cap", "120"); await P.click('#sec2 [data-save="2"]'); await P.waitForTimeout(800);
      const back2 = await P.$("#ctg-back"); t.check("S16-08c: the way back is still offered after the fix is saved", !!back2);
      if (back2) await back2.click(); await P.waitForTimeout(700);
      const after = await P.evaluate(() => ({ open: (document.querySelector(".zc-card.open") || {}).id, email: (document.getElementById("pubEmail") || {}).value || "" }));
      t.check("S16-08d: one tap returns to Check and publish", after.open === "sec7", JSON.stringify(after));
      t.check("S16-08e: what the person had typed on the way (their e-mail) is still there", after.email === org.email, after.email);
      t.check("S16-08f: the way back is gone once used", !(await P.$("#ctg-back")));
    },
  },
  // ===================================================================== adding people
  {
    id: "S16-09", name: "Adding people (Organizer, step 6): a number with a digit missing, the same number twice, and a list longer than the game allows are each explained with what to do; the person can correct the wrong number right there and add it",
    async run(t) {
      const org = await t.org("v169"); const g = await t.game(org, { cfg: { cap: 3 }, settings: { whoCanJoin: "list" }, pay: true });
      const x = await openConsole(t, org, g.id, { device: "laptop" }); const P = x.page;
      await openPeople(P);
      const ph = nextPhone();
      // a list with one good, one with a digit missing, and one repeated
      await P.click('[data-mode="paste"]').catch(() => {}); await P.waitForTimeout(400);
      const txtSel = await P.$("#rosterTxt") ? "#rosterTxt" : null;
      t.check("S16-09a: the paste box for a list is there", !!txtSel);
      if (!txtSel) return;
      await P.fill(txtSel, `Asha ${ph}
BadNumber 98123
Asha again ${ph}`); await P.click("#rosterGo"); await P.waitForTimeout(1200);
      const sec = await t.text(P, "#sec6");
      t.check("S16-09b: the screen says which number looks wrong and gives a box to correct it", /BadNumber/.test(sec) && (await P.$("[data-fix]")) !== null, sec.slice(0, 200));
      t.check("S16-09c: the repeat is named as already on the list, not silently dropped", /already|twice|repeat|duplicate|same/i.test(sec), sec.slice(0, 200));
      const plain = sec.replace(/https?:\/\/\S+/g, ""); // the share link itself is meant to be shown
      t.check("S16-09d: no technical word is shown (apart from the share link itself)", !BANNED.test(plain), (plain.match(BANNED) || [""])[0] + " | " + plain.slice(0, 100));
      await P.fill("#fixin0", nextPhone()); await P.click('[data-fix="0"]'); await P.waitForTimeout(1000);
      const ppl = (await org.people(g.id)).body.people ?? [];
      t.check("S16-09e: after correcting the number on the spot, the person is added (2 people now)", ppl.length === 2, ppl.length);
      // more people than the game allows
      await P.fill(txtSel, `X1 ${nextPhone()}
X2 ${nextPhone()}`); await P.click("#rosterGo"); await P.waitForTimeout(1200);
      const g2 = await guide(P);
      t.check("S16-09f: too many people is explained with what to do (raise the number of participants, or remove someone)", !!g2 && /places|full|number of participants/i.test(g2.text), g2 ? g2.text.slice(0, 160) : "no guide");
      if (g2) t.check("S16-09g: it offers Take me there to the number of participants", g2.go.length === 1, g2.go.join("|"));
    },
  },
  // ===================================================================== the Host's first sign-in
  {
    id: "S16-10", name: "Host's first sign-in (Host): a bad e-mail, a wrong code and a short code are each explained in place with steps; after the fix the Host gets in",
    async run(t) {
      const org = await t.org("v1610"); const email = t.mail("host"), mobile = nextPhone(); t.team.add(email);
      const inv = await org.inviteHost({ label: "Hema", email, mobile });
      const h = await t.open({ device: "mobile" }); const P = h.page;
      await P.goto(inv.link); await P.waitForSelector("#finishsetup", { timeout: 15000 });
      if (await P.$("#setupemail")) {
        await P.fill("#setupemail", "nope");
        await tickTerms(t, P, { scope: "[data-cbc='K5']", btn: "#setupsend", what: "Host setup" }).catch(() => {}); await P.click("#setupsend");
        await wellFormed(t, P, "S16-10a", "Host: bad e-mail address", { title: /e-mail/i, needsGo: false });
        await P.fill("#setupemail", email); await P.click("#setupsend"); await P.waitForSelector("#setupcode", { timeout: 10000 });
        await P.fill("#setupcode", "000000"); await P.click("#setupverify");
        await wellFormed(t, P, "S16-10b", "Host: wrong code", { title: /code/i, needsGo: false });
        await P.fill("#setupcode", "12"); await P.click("#setupverify");
        await wellFormed(t, P, "S16-10c", "Host: code of 2 digits", { title: /6 digits|code/i, needsGo: false });
        const m = await H.mailbox.waitFor({ to: email, timeout: 8000 });
        await P.fill("#setupcode", H.mailbox.code(m)); await P.click("#setupverify");
        await P.waitForFunction(() => !document.getElementById("setupcode"), null, { timeout: 15000 }).catch(() => {});
        t.check("S16-10d: after the fixes the right code lets the Host in", !(await P.$("#setupcode")));
      } else { t.check("S16-10: the setup asks for an e-mail", false, "no #setupemail"); }
    },
  },
  // ===================================================================== the pay page, a stranger on the pay link, the logo, the game-day message, the partner sign-up
  {
    id: "S16-11", name: "Pay page (Organizer): the Pay button says what is still needed; a bad e-mail is explained in place; after the fix the payment goes through",
    async run(t) {
      const org = await t.org("v1611"); const g = await t.game(org, { pay: false });
      const x = await t.open({ device: "laptop", token: org.token }); const P = x.page;
      await P.goto(H.SIM + "/pay?e=" + g.id); await P.waitForSelector("#paygo", { timeout: 15000 }); await P.waitForTimeout(500);
      const hint = await P.textContent(".ctg-needs").catch(() => "");
      t.check("S16-11a: the Pay button says what is still needed (name, e-mail, agreements)", /name/i.test(hint) && /e-?mail/i.test(hint) && /agree/i.test(hint), hint);
      await P.fill("#nm", "Sim Payer"); await P.fill("#em", "nope");
      await tickTerms(t, P, { scope: "[data-cbc='K3']", btn: "#paygo", what: "Pay" }).catch(() => {}); await P.click("#paygo");
      await wellFormed(t, P, "S16-11b", "bad e-mail on the pay page", { title: /e-mail/i, needsGo: false });
      await P.fill("#em", org.email); await P.click("#paygo");
      await P.waitForFunction(() => /paid|thank|invoice|done/i.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
      const st = await org.summary(g.id); t.check("S16-11c: after the fix the payment goes through (test mode)", JSON.stringify(st.body.payment ?? st.body).includes("paid"), JSON.stringify(st.body.payment ?? st.body).slice(0, 100));
    },
  },
  {
    id: "S16-12", name: "A stranger on a pay link (payer): missing name or e-mail is explained in place and the payment then goes through",
    async run(t) {
      const org = await t.org("v1612"); const g = await t.game(org, { pay: false });
      const lk = await org.api("POST", `/api/z/${g.id}/paylink`, {}); const url = lk.body && lk.body.url; t.check("S16-12a: a pay link was made", !!url, JSON.stringify(lk.body).slice(0, 80));
      if (!url) return;
      const x = await t.open({ device: "mobile" }); const P = x.page;
      await P.goto(url.replace(/^https?:\/\/[^/]+/, H.SIM)); await P.waitForSelector("#paygo", { timeout: 15000 }); await P.waitForTimeout(500);
      const hint = await P.textContent(".ctg-needs").catch(() => "");
      t.check("S16-12b: the Pay button says what is still needed", /name|e-mail|agree/i.test(hint), hint);
      await P.fill("#nm", "A Stranger"); await P.fill("#em", "bad@"); await P.check("#cbc-K3-A"); await P.waitForTimeout(500);
      const enabled = await P.isEnabled("#paygo");
      if (enabled) { await P.click("#paygo"); await wellFormed(t, P, "S16-12c", "stranger: bad e-mail (the button was pressable, the page explains)", { title: /e-mail/i, needsGo: false }); }
      else { const hint2 = await P.textContent(".ctg-needs").catch(() => ""); t.check("S16-12c: with a badly typed e-mail the greyed-out Pay button says so (check the e-mail, it has a typing slip)", /e-?mail/i.test(hint2) && /typing slip/i.test(hint2), hint2); }
      await P.fill("#em", t.mail("stranger")); await P.waitForTimeout(500); t.check("S16-12e: after the mistake the agreement tick and the typed name are still there (nothing had to be done again)", (await P.isChecked("#cbc-K3-A")) && (await P.inputValue("#nm")) === "A Stranger", await P.isChecked("#cbc-K3-A")); await P.click("#paygo", { timeout: 6000 });
      await P.waitForFunction(() => /paid|thank|done|invoice/i.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
      const st = await org.summary(g.id); t.check("S16-12d: after the fix the game is paid", JSON.stringify(st.body.payment ?? st.body).includes("paid"), JSON.stringify(st.body.payment ?? st.body).slice(0, 100));
    },
  },
  {
    id: "S16-13", name: "Logo and game-day message (Organizer): a file that is not a picture, a picture over 5 MB, and an empty message are each explained in place with steps",
    async run(t) {
      const org = await t.org("v1613"); const g = await t.game(org, { publish: true });
      const x = await openConsole(t, org, g.id, { device: "laptop" }); const P = x.page;
      await openStep(P, 4);
      await P.setInputFiles("#brandlogo", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("this is not a picture") }); await P.waitForTimeout(800);
      await wellFormed(t, P, "S16-13a", "a text file chosen as a logo", { title: /picture/i, needsGo: false });
      await P.setInputFiles("#brandlogo", { name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(6 * 1024 * 1024, 1) }); await P.waitForTimeout(800);
      await wellFormed(t, P, "S16-13b", "a picture over 5 MB", { title: /picture/i, needsGo: false });
      await openStep(P, 9); await P.waitForSelector("#annText", { timeout: 8000 });
      await P.fill("#annText", ""); await P.click("#annSend"); await P.waitForTimeout(600);
      await wellFormed(t, P, "S16-13c", "an empty message to everyone", { title: /message/i, needsGo: false });
    },
  },
  {
    id: "S16-14", name: "Refer and earn sign-up (partner): a missing box tick and a bad mobile number or e-mail are explained in place; after the fix the sign-up goes on to the code",
    async run(t) {
      const x = await t.open({ device: "mobile" }); const P = x.page;
      await P.goto(H.SIM + "/partner"); await P.waitForSelector("#join");
      await P.fill("#ph", nextPhone()); await P.fill("#em", t.mail("pt")); await P.fill("#nm", "Hema"); await P.click("#join");
      await wellFormed(t, P, "S16-14a", "the agreement box not ticked", { title: /box|tick/i, needsGo: false });
      await P.check("#ok"); await P.fill("#ph", "12"); await P.click("#join"); await P.waitForTimeout(1200);
      await wellFormed(t, P, "S16-14b", "a bad mobile number", { title: /mobile/i, needsGo: false });
      await P.fill("#ph", nextPhone()); await P.fill("#em", "no-at-sign"); await P.click("#join"); await P.waitForTimeout(1200);
      await wellFormed(t, P, "S16-14c", "a bad e-mail", { title: /e-mail/i, needsGo: false });
      await P.fill("#em", t.mail("pt2")); await P.click("#join"); await P.waitForSelector("#cd", { timeout: 10000 }).catch(() => {});
      t.check("S16-14d: after the fixes the sign-up asks for the code", !!(await P.$("#cd")));
    },
  },
  // ===================================================================== wiring: no screen may have two things with the same id (a tap on one must not run the other)
  {
    id: "S16-15", name: "Wiring sweep: no screen, once drawn, has two elements with the same id; and tapping a text box, a label or a tick box never runs a button's action by accident (every screen of every role)",
    async run(t) {
      const org = await t.org("v1615"); const g = await t.game(org, { pay: false }); const gp = await t.game(org, { settings: { whoCanJoin: "anyone" } });
      const lk = await org.api("POST", `/api/z/${g.id}/paylink`, {}); const payurl = lk.body && lk.body.url ? lk.body.url.replace(/^https?:\/\/[^/]+/, H.SIM) : null;
      const pages = [
        ["home", "/", null], ["pricing", "/pricing.html", null], ["partner", "/partner", null], ["helpdesk", "/helpdesk", null], ["demo", "/demo.html", null],
        ["player join", "/z?e=" + gp.id, null], ["console", "/zc?e=" + g.id, org.token], ["pay page", "/pay?e=" + g.id, org.token], ["big screen", "/big?e=" + gp.id, null], ["preview", "/preview.html?e=" + gp.id, null],
        ...(payurl ? [["pay link", payurl, null]] : []),
      ];
      const dupes = [];
      for (const [label, path, token] of pages) {
        const x = await t.open({ device: "laptop", token: token ?? undefined }); const P = x.page;
        await P.goto(path.startsWith("http") ? path : H.SIM + path).catch(() => {}); await P.waitForTimeout(2200);
        if (label === "console") { for (let n = 1; n <= 10; n++) { await openStep(P, n).catch(() => {}); await P.waitForTimeout(150); } }
        const d = await P.evaluate(() => { const c = {}; for (const e of document.querySelectorAll("[id]")) c[e.id] = (c[e.id] || 0) + 1; return Object.entries(c).filter(([, n]) => n > 1).map(([id, n]) => id + "x" + n); });
        if (d.length) dupes.push(label + ": " + d.join(", "));
        await x.ctx.close().catch(() => {});
      }
      t.check("S16-15a: no drawn screen has two elements with the same id", dupes.length === 0, dupes.join(" | "));
      // tapping into the sign-up form must not run its button: tap the phone box, the e-mail box and the tick box, nothing is sent and no error appears
      const x = await t.open({ device: "mobile" }); const P = x.page; let sent = 0;
      P.on("request", (r) => { if (/api\/partner\/enroll/.test(r.url())) sent++; });
      await P.goto(H.SIM + "/partner"); await P.waitForSelector("#join"); await P.waitForTimeout(1500);
      await P.click("#ph"); await P.click("#em"); await P.click("#nm"); await P.click("#ok"); await P.click("#ok"); await P.waitForTimeout(900);
      t.check("S16-15b: tapping the boxes of the partner sign-up form sends nothing", sent === 0, sent);
      t.check("S16-15c: and shows no error", (await guide(P, { wait: 300 })) === null);
    },
  },
];
