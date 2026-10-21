// A survey, not a verdict: a real person's mistakes, made one by one in real Chrome (Playwright), and a record of exactly what the screen then shows
// (the new text, which element holds it, what buttons come with it). Writes sim/faults-survey.json. The verdict scenarios (s16-faults.mjs) are written from what this finds.
// Run: node tools/sim2/scenarios/ui/run.mjs --only S15-01
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { H, openConsole, openStep, openPeople, tickTerms, joinForm } from "./kit.mjs";

/** every short visible text on the page with the element that holds it */
const SNAP = () => {
  const out = [];
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  for (const e of document.querySelectorAll("body *")) {
    if (e.children.length > 3 || !vis(e)) continue;
    const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
    const full = e.textContent.replace(/\s+/g, " ").trim();
    const text = own.length >= 8 ? own : e.children.length === 0 ? full : "";
    if (text.length < 8 || text.length > 400) continue;
    const cls = (typeof e.className === "string" ? e.className : "").split(/\s+/).slice(0, 4).join(".");
    out.push({ text, tag: e.tagName.toLowerCase(), id: e.id || "", cls, role: e.getAttribute("role") || "", inGuide: !!e.closest("#ctg-dialog,.ctg-inline") });
  }
  return out;
};
const diff = (a, b) => { const seen = new Set(a.map((x) => x.text)); return b.filter((x) => !seen.has(x.text)); };
const buttonsNow = (page) => page.evaluate(() => [...document.querySelectorAll("#ctg-dialog button,#ctg-dialog a,.ctg-inline button,.ctg-inline a")].map((b) => b.textContent.trim().slice(0, 40)));
const R = []; // the survey result

async function fault(t, page, id, role, what, doIt) {
  const before = await page.evaluate(SNAP);
  let err = "";
  try { await doIt(); } catch (e) { err = String(e.message).slice(0, 100); }
  await page.waitForTimeout(900);
  const after = await page.evaluate(SNAP);
  const added = diff(before, after);
  const rec = { id, role, what, err, shown: added.slice(0, 8), guided: added.some((x) => x.inGuide), buttons: await buttonsNow(page) };
  R.push(rec);
  const closeBtn = await page.$('#ctg-dialog [data-ctg="close"]'); if (closeBtn) { await closeBtn.click().catch(() => {}); await page.waitForTimeout(200); } // the person presses Close
  return rec;
}

export default [
  {
    id: "S15-01", name: "Survey: what each role sees when they make a mistake (Organizer, Host, Co-host, participant)",
    async run(t) {
      // ---------- home page sign-in ----------
      const hp = await t.open({ device: "laptop" });
      await hp.page.goto(H.SIM + "/#login"); await hp.page.waitForSelector("#lMail");
      await fault(t, hp.page, "H1", "Organizer", "sign-in: no e-mail", async () => { await hp.page.fill("#lMail", ""); await hp.page.click("#lgGo"); });
      await fault(t, hp.page, "H2", "Organizer", "sign-in: e-mail 'abc'", async () => { await hp.page.fill("#lMail", "abc"); await hp.page.click("#lgGo"); });
      const mail = t.mail("sv");
      await fault(t, hp.page, "H3", "Organizer", "sign-in: wrong 6-digit code", async () => { await hp.page.fill("#lMail", mail); await tickTerms(t, hp.page, { scope: "[data-cbc='K2']", btn: "#lgGo", what: "Sign-in" }).catch(() => {}); await hp.page.click("#lgGo"); await hp.page.waitForSelector("#lCode"); await hp.page.fill("#lCode", "000000"); await hp.page.click("#cdGo"); });
      await fault(t, hp.page, "H4", "Organizer", "sign-in: code with only 2 digits", async () => { await hp.page.fill("#lCode", "12"); await hp.page.click("#cdGo"); });

      // ---------- the console ----------
      const org = await t.org("sv");
      const g = await t.game(org, { publish: false });
      const x = await openConsole(t, org, g.id, { device: "laptop" });
      const P = x.page;
      await P.waitForTimeout(800);
      { const d = await P.evaluate(() => { const b = document.querySelector('.zc-sech[data-open="2"]'); const r = b && b.getBoundingClientRect(); const top = r && document.elementFromPoint(r.x + 20, r.y + r.height / 2); return { dialog: !!document.getElementById("ctg-dialog"), inline: document.querySelectorAll(".ctg-inline").length, top: top ? top.tagName + "." + top.className + "#" + top.id : null, topText: top ? top.textContent.slice(0, 120) : null }; }); console.log("BEFORE-STEP2:", JSON.stringify(d)); const e = await P.evaluate(() => { const hs = [...document.querySelectorAll(".zc-sech")].map((b) => { const r = b.getBoundingClientRect(); return b.getAttribute("data-open") + ":" + Math.round(r.width) + "x" + Math.round(r.height) + "@" + Math.round(r.y) + (getComputedStyle(b).visibility); }); return { headers: hs, scrollY: scrollY, innerH: innerHeight, body: document.body.scrollHeight, url: location.href.slice(-40) }; }); console.log("HEADERS:", JSON.stringify(e)); }
      try { await openStep(P, 2); } catch (e) { console.log("OPENSTEP2-FAILED:", String(e.message).replace(/\s+/g, " ").slice(0, 1400)); throw e; }
      for (const [id, val, what] of [["O1", "0", "participants: 0"], ["O2", "abc", "participants: letters"], ["O3", "99999", "participants: 99999 (more than any pack)"], ["O4", "", "participants: empty"], ["O5", "1.5", "participants: 1.5"]]) {
        await fault(t, P, id, "Organizer", "console step 2, " + what, async () => { await P.fill("#f-cap", val); await P.click('#sec2 [data-save="2"]'); });
      }
      await openStep(P, 5);
      await fault(t, P, "O6", "Organizer", "team: Add a Host with nothing filled", async () => { await P.click("#hostadd"); });
      await fault(t, P, "O7", "Organizer", "team: Host with a short phone '123'", async () => { await P.fill("#hostlabel", "Hema"); await P.fill("#hostphone", "123"); await P.click("#hostadd"); });
      await fault(t, P, "O8", "Organizer", "team: Host with e-mail 'x@'", async () => { await P.fill("#hostphone", ""); await P.fill("#hostemail", "x@"); await P.click("#hostadd"); });
      await fault(t, P, "O9", "Organizer", "team: Add a Co-host with nothing filled", async () => { await P.click("#cohostadd"); });
      await fault(t, P, "O10", "Organizer", "team: Co-host with a bad phone", async () => { await P.fill("#cohostlabel", "Colin"); await P.fill("#cohostphone", "99"); await P.click("#cohostadd"); });
      await openStep(P, 7);
      await fault(t, P, "O11", "Organizer", "publish: open, nothing filled, press Publish", async () => { await P.click("#publishopen"); await P.waitForSelector("#pubEmail"); await P.click("#pubgo", { force: true }); });
      await fault(t, P, "O12", "Organizer", "publish: bad e-mail and bad phone", async () => { await P.fill("#pubEmail", "nope"); await P.fill("#pubPhone", "1"); await tickTerms(t, P, { scope: "[data-cbc='K1']", btn: "#pubgo", what: "Publish" }).catch(() => {}); await P.click("#pubgo", { force: true }); });
      // a server failure in the middle of saving: the page must still guide
      await P.waitForTimeout(800);
      console.log("BEFORE-S1:", JSON.stringify(await P.evaluate(() => { const b = document.querySelector('.zc-sech[data-open="2"]'); const r = b && b.getBoundingClientRect(); const top = r && document.elementFromPoint(Math.min(innerWidth - 5, r.x + 20), Math.min(innerHeight - 5, Math.max(5, r.y + r.height / 2))); return { dialog: !!document.getElementById('ctg-dialog'), dialogText: (document.getElementById('ctg-dialog') || {}).textContent ? document.getElementById('ctg-dialog').textContent.slice(0, 200) : null, rect: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null, top: top ? top.tagName + '.' + String(top.className).slice(0, 40) + '#' + top.id : null, innerH: innerHeight }; })));
      await openStep(P, 2);
      await P.route("**/api/z/**", (route) => (route.request().method() !== "GET" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Something went wrong. Please try again.", code: "server-error" }) }) : route.continue()));
      await fault(t, P, "S1", "Organizer", "save step 2 while the server answers 500", async () => { await P.fill("#f-cap", "50"); await P.click('#sec2 [data-save="2"]'); });
      await P.unroute("**/api/z/**");
      await P.route("**/api/z/**", (route) => (route.request().method() !== "GET" ? route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "Too many tries from this network. Please use an e-mail code, or try again tomorrow." }) }) : route.continue()));
      await fault(t, P, "S2", "Organizer", "save step 2 while the server answers 429", async () => { await P.click('#sec2 [data-save="2"]'); });
      await P.unroute("**/api/z/**");
      await P.route("**/api/z/**", (route) => (route.request().method() !== "GET" ? route.abort("internetdisconnected") : route.continue()));
      await fault(t, P, "S3", "Organizer", "save step 2 while the internet is down", async () => { await P.click('#sec2 [data-save="2"]'); });
      await P.unroute("**/api/z/**");

      // ---------- people (step 6) ----------
      await openPeople(P);
      const ids = await P.evaluate(() => [...document.querySelectorAll("#sec6 textarea, #sec6 input")].map((e) => e.id + ":" + (e.getAttribute("placeholder") || "")).slice(0, 14));
      R.push({ id: "P0", role: "Organizer", what: "people step controls", shown: ids.map((x) => ({ text: x })), guided: false, buttons: [] });

      // ---------- participant: the join form ----------
      const og = await t.org("pg");
      const pub = await t.game(og, { publish: true, settings: { who: "anyone" } }).catch(async () => t.game(og));
      const jp = await t.open({ device: "mobile" });
      await jp.page.goto(H.SIM + "/z?e=" + pub.id); await jp.page.waitForSelector("[data-cbc='K4'] input[data-box]", { timeout: 15000 });
      await fault(t, jp.page, "G1", "Participant", "join: short number '123'", async () => { await joinForm(jp.page, "123", "Asha"); });
      await fault(t, jp.page, "G2", "Participant", "join: number with letters", async () => { await jp.page.fill("#ph", "98abc45678"); await jp.page.click("#go"); });
      await fault(t, jp.page, "G3", "Participant", "join: empty name", async () => { await jp.page.fill("#ph", "9812345670"); await jp.page.fill("#nm", ""); await jp.page.click("#go", { force: true }); });

      x.mon.clear(); // the 500 answers above were made on purpose
      writeFileSync(join(H.ROOT, "sim", "faults-survey.json"), JSON.stringify(R, null, 1));
      t.check("survey written: " + R.length + " mistakes made and recorded", R.length >= 20);
    },
  },
];
