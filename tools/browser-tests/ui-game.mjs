// A whole game played ONLY by clicking and typing in real browser pages, as people do: the Organizer signs in on the website and builds the game through the 10-step console, publishes it,
// then the Host (manual games) and the players open the real link on phone-sized pages, tick the boxes, type name and number, check in with the code on the ticket, tap numbers and press Claim.
// No API call is used to set anything up. Everything is read back from what the pages show.
//   BROWSER=chrome|chromium|webkit SITE=https://corporatetambola.com node tools/ui-game.mjs --tag U1 --login demo1@xyz.in --cap 10 --players 10 --mode auto --lead 9
import { writeFileSync, mkdirSync } from "node:fs";
import { launch, signIn, ctrls, sleep } from "./ui-lib.mjs";
import { Harness, NodePhone } from "./nodephone.mjs";
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const B = process.env.BROWSER || "chrome", SITE = process.env.SITE || "http://localhost:8801";
const TAG = opt("tag", "U" + Date.now().toString(36).slice(-3)), LOGIN = opt("login", "demo1@xyz.in"), CAP = Number(opt("cap", 10)), PLAYERS = Number(opt("players", 10)), MODE = opt("mode", "auto"), LEAD = Number(opt("lead", 9)), AUD = opt("aud", "5"), SPEED = Number(opt("speed", 9)), STOP = opt("stop", ""), REAL = Number(opt("real", PLAYERS)), EMP = ["1", "2", "6"].includes(AUD);
const H = new Harness(SITE, { ipPool: 1 }); // protocol phones (people beyond --real); the live site sees this laptop's real address
const R = { tag: TAG, browser: B, site: SITE, mode: MODE, cap: CAP, checks: [], errors: [], failedReq: [], notes: [] };
const check = (n, ok, d = "") => { R.checks.push({ n, ok: !!ok, d: String(d).slice(0, 300) }); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : "| " + String(d).slice(0, 300)); };
const save = () => { mkdirSync("C:/ct/test-sites/data/ui", { recursive: true }); writeFileSync(`C:/ct/test-sites/data/ui/ui-${B}-${TAG}.json`, JSON.stringify(R, null, 1)); };
const pad = (n) => String(n).padStart(2, "0");
const watch = (page, tag) => { page.on("pageerror", (e) => R.errors.push(tag + ": " + String(e).slice(0, 200) + " | " + String(e && e.stack || "").replace(/\s+/g, " ").slice(0, 260))); page.on("response", (x) => { if (x.status() >= 500) R.failedReq.push(`${tag} ${x.status()} ${x.url().slice(0, 100)}`); }); };
const browser = await launch(B);
let eid = null, startMs = 0; const reals = [], nodes = [];
const org = async () => (await browser.newContext({ viewport: { width: 1280, height: 900 } }));
const body = async (p) => (await p.innerText("body")).replace(/\s+/g, " ");
const clickSave = async (p, n) => { await p.click(`[data-save="${n}"]`); await sleep(1500); };
const openStep = async (p, n) => { const b = p.locator(`.zc-dot[data-open="${n}"], [data-open="${n}"]`).first(); await b.click(); await sleep(900); };
try {
  // ---------------- the Organizer, only through the screens
  const octx = await org(); const p = await octx.newPage(); watch(p, "organizer"); p.on("request", (q) => { if (q.method() !== "GET" && /\/api\/z\//.test(q.url())) (R.reqs = R.reqs || []).push(q.method() + " " + q.url().replace(/^.*\/api\//, "/api/") + " " + String(q.postData() || "").slice(0, 160)); }); p.on("dialog", (d) => d.accept().catch(() => {}));
  await signIn(p, SITE, LOGIN); check("signed in as Organizer", /Signed in as Organizer/.test(await body(p)));
  if (await p.$("#mk")) await p.click("#mk"); await p.waitForSelector('[data-ck="occ"]', { timeout: 40000 }); await sleep(800);
  check("the organizer's e-mail is shown at the top right", (await body(p)).includes(LOGIN));
  eid = new URL(p.url()).searchParams.get("e"); R.eid = eid; check("a draft game exists after pressing Create a new game", !!eid, p.url());
  // step 1: occasion, today, other time
  startMs = Math.ceil((Date.now() + LEAD * 60000) / 300000) * 300000; const ist = new Date(startMs + 5.5 * 3600000);
  await p.click('[data-ck="occ"][data-v="Diwali party"]'); await p.click('[data-ck="day"]:text("Today")'); await p.click('[data-ck="time"][data-v="other"]'); await p.waitForSelector("#f-timeo");
  await p.fill("#f-timeo", `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`); await clickSave(p, 1);
  // step 2
  await openStep(p, 2); await p.waitForSelector('[data-ck="cap"]', { timeout: 10000 });
  const capOpts = await p.$$eval('[data-ck="cap"]', (b) => b.map((x) => x.dataset.v)); R.capOptions = capOpts; check("the size choices are shown as chips", capOpts.length >= 5, capOpts.join(","));
  await p.click(`[data-ck="cap"][data-v="${CAP}"]`); await p.click(`[data-ck="mode"][data-v="${MODE}"]`);
  if (MODE === "auto") await p.click(`[data-ck="spd"][data-v="${SPEED}"]`);
  check("manual hides the gap (duration) and auto shows it", MODE === "host" ? !(await p.$('[data-ck="spd"]')) : !!(await p.$('[data-ck="spd"]')));
  await p.click('[data-ck="tix"][data-v="1"]'); if (await p.locator('[data-ck="rnd"][data-v="1"]').first().isVisible().catch(() => false)) await p.click('[data-ck="rnd"][data-v="1"]'); /* since 1.3.0 the rounds choice is hidden: one round is the only option */ await p.click(`[data-ck="aud"][data-v="${AUD}"]`); await sleep(400);
  R.step2 = await ctrls(p); await clickSave(p, 2); R.sum2 = await p.evaluate(async (e) => { const t = localStorage.getItem('ctz-org'); const r = await fetch('/api/z/' + e + '/summary', { headers: { 'x-organizer': t } }); const j = await r.json().catch(() => ({})); return { verify: j.verify, emp: j.employeesOnly, who: j.whoCanJoin, status: r.status }; }, eid);
  // steps 3..6: look at each, accept the defaults the way a person pressing Continue would
  for (const n of [3, 4, 5, 6]) {
    await openStep(p, n); R["step" + n] = (await body(p)).slice(0, 80); (R.verTrail = R.verTrail || []).push(n + ":" + JSON.stringify(await p.evaluate(async (e) => { const t = localStorage.getItem('ctz-org'); const j = await (await fetch('/api/z/' + e + '/summary', { headers: { 'x-organizer': t } })).json(); return [j.verify, j.employeesOnly]; }, eid)));
    if (n === 6 && EMP) {
      const csv = "Name,Employee ID\n" + Array.from({ length: PLAYERS }, (_, i) => `UI Player ${i + 1},E${String(i + 1).padStart(3, "0")}`).join("\n") + "\n";
      const f = `C:/ct/test-sites/data/ui/staff-${TAG}.csv`; writeFileSync(f, csv);
      await p.click('[data-cols="id"]').catch(() => {}); await sleep(500); await p.click('[data-mode="file"]'); await sleep(600);
      R.step6before = await ctrls(p);
      await p.click("#cbc-K6-A").catch(() => {}); await sleep(600);
      await p.setInputFiles("#gfile", f); await sleep(4000);
      R.step6after = await ctrls(p); R.step6text = (await p.locator('#sec6').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(-600); R.toasts = await p.$$eval('.zc-toast,[role=status],[role=alert],.zc-warnt', (e) => e.map((x) => x.textContent.trim().slice(0, 200))); R.pageErr = [...R.errors]; R.wrong = (await p.locator('#wronglist').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500);
      for (const bx of await p.$$("#sec6 input[type=checkbox]")) await bx.check({ force: true }).catch(() => {});
      await sleep(500);
      for (const sel of ["#gadd", "#gfileGo", "#fileGo", "button:has-text('Add them')", "button:has-text('Add these')", "button:has-text('Add all')"]) { const b = p.locator(sel).first(); if (await b.count() && await b.isVisible() && await b.isEnabled().catch(() => false)) { await b.click(); R.addSel = sel; break; } }
      await sleep(3000);
      const cnt = await p.locator("#gcount").first().innerText().catch(() => "?"); check(`the staff list was uploaded by clicking: ${PLAYERS} employees on the list`, Number(cnt) === PLAYERS, `count shows ${cnt}; ${R.addSel}`);
    }
    if (await p.$(`[data-save="${n}"]`)) await clickSave(p, n);
  }
  // step 7: check and publish
  await openStep(p, 7); R.step7 = await ctrls(p);
  if (await p.$("#publishopen")) { await p.click("#publishopen").catch(() => {}); await sleep(800);
  await p.fill("#pubEmail", "raajat.agarwal@gmail.com").catch(() => {}); await p.fill("#pubPhone", "9650397480").catch(() => {});
  for (const bx of await p.$$("#sec7 input[type=checkbox]")) await bx.check({ force: true }).catch(() => {});
  await sleep(500); await p.click("#pubgo"); await sleep(6000); } else R.notes.push("no publish button: the game was already published (test pack)");
  const info = await (await fetch(`${SITE}/api/z/${eid}/info`)).json().catch(() => ({})); R.info = { cap: info.cap, locked: info.locked, demo: info.demo, startMs: info.startMs };
  check("the game is published and open to people", info.startMs && info.locked !== true, JSON.stringify(R.info)); startMs = info.startMs || startMs; save();
  if (STOP === "publish") { check("stopped after publishing, as asked", true); save(); await browser.close().catch(() => {}); process.exit(0); }
  console.log("GAME", eid, "starts", new Date(startMs).toISOString(), "link", `${SITE}/z.html?e=${eid}`);

  // ---------------- the players: real phone-sized pages, arriving over the minutes before the start
  let orgPage = p;
  const newReal = async (i) => {
    const name = `UI Player ${i + 1}`, phone = `98122${String(i + 1).padStart(5, "0")}`;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: B !== "webkit", hasTouch: true, deviceScaleFactor: 2 });
    const pg = await ctx.newPage(); watch(pg, name); await pg.goto(`${SITE}/z.html?e=${eid}`, { waitUntil: "load" });
    await pg.waitForSelector("[data-cbc='K4'] input[data-box]", { timeout: 40000 }); await sleep(800 + Math.random() * 2500);
    const bx = pg.locator("[data-cbc='K4'] input[data-box]"); for (let k = 0; k < await bx.count(); k++) await bx.nth(k).check({ force: true }).catch(() => {});
    if (await pg.$("#emp")) await pg.type("#emp", `E${String(i + 1).padStart(3, "0")}`, { delay: 60 }); if (await pg.$("#ph")) await pg.type("#ph", phone, { delay: 60 }); if (await pg.$("#nm")) await pg.type("#nm", name, { delay: 50 });
    await sleep(500); await pg.click("#go"); await pg.waitForFunction(() => window.__rt && window.__rt.pid, null, { timeout: 60000 });
    return { ctx, p: pg, name, phone, tapped: new Set(), claims: [], errors: [], present: false };
  };
  const checkIn = async (ph) => { try { await ph.p.waitForSelector("#ckshow", { timeout: 20 * 60000 }); await sleep(2000 + Math.random() * 15000); await ph.p.click("#ckokn"); await sleep(300); await ph.p.click("#ckokm"); await sleep(300); const code = (await ph.p.innerText("#ckshow")).trim(); await ph.p.click("#ckcode"); await ph.p.type("#ckcode", code, { delay: 120 }); await ph.p.click("#cksubmit"); await ph.p.waitForSelector(".zticket", { timeout: 60000 }); ph.present = true; } catch (e) { ph.errors.push("checkin " + String(e).slice(0, 100)); } };
  const view = (pg) => pg.evaluate(() => { const v = window.__rt.view(); return { phase: v.phase, n: v.log.filter((x) => x > 0).length, last: v.log[v.log.length - 1], paused: !!v.paused }; }).catch(() => null);
  const human = async (ph, react) => {
    const v = await view(ph.p); if (!v) return v;
    if (v.n !== (ph.seenN || 0)) { ph.seenN = v.n; ph.lastNewAt = Date.now(); }
    if (ph.lastNewAt && Date.now() - ph.lastNewAt > react[0] + Math.random() * (react[1] - react[0]) && !ph.tapped.has(v.n)) { ph.tapped.add(v.n); const cell = await ph.p.$(`[data-tap="${v.last}"]:not(.m)`); if (cell) await cell.click().catch(() => {}); }
    for (const b of await ph.p.$$("[data-claim]")) { await sleep(300 + Math.random() * 1500); await b.click().catch(() => {}); ph.claims.push({ k: await b.getAttribute("data-claim").catch(() => null), at: Date.now() }); }
    return v;
  };
  console.log("waiting until 7 minutes before the start", new Date(startMs - 7 * 60000).toISOString());
  while (Date.now() < startMs - 7 * 60000) await sleep(5000);
  await Promise.all(Array.from({ length: PLAYERS }, (_, i) => (async () => { await sleep(Math.random() * Math.min(PLAYERS >= 200 ? 200000 : 120000, 20000 + PLAYERS * 800));
    if (i < REAL) { try { const ph = await newReal(i); reals.push(ph); checkIn(ph); } catch (e) { R.errors.push("real " + i + " " + String(e).slice(0, 150)); } }
    else { try { const ph = new NodePhone(H, eid, { phone: EMP ? "" : `98122${String(i + 1).padStart(5, "0")}`, name: `Phone ${i + 1}`, ...(EMP ? { empId: `E${String(i + 1).padStart(3, "0")}` } : {}) }, { react: [900, 4500], claim: "always", light: i >= 60 }); await ph.open(); ph.ok = await ph.join(); if (ph.ok) ph.go(); nodes.push(ph); } catch (e) { R.errors.push("node " + i + " " + String(e).slice(0, 150)); } }
  })()));
  check(`all ${PLAYERS} people joined (${REAL} on real browser pages, ${PLAYERS - REAL} on protocol phones)`, reals.length === REAL && nodes.length === PLAYERS - REAL && nodes.every((x) => x.ok), `${reals.length} pages, ${nodes.filter((x) => x.ok).length}/${nodes.length} phones`);
  // the organizer presses each number for a manual game, through the Game day step
  const pressNext = async () => { for (const sel of ['[data-act="next"]', "#nextnum", '[data-host="next"]', "#hnext", "button:has-text('Call the next number')", "button:has-text('Next number')"]) { const b = orgPage.locator(sel).first(); if (await b.count() && await b.isVisible() && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return sel; } } return null; };
  while (Date.now() < startMs + 120000 - 5000) await sleep(500);
  const MAX = Date.now() + 45 * 60000; let endedAll = false, allEndedAt = 0, pressed = 0, nextSel = null, lastPress = 0;
  if (MODE === "host") { await openStep(orgPage, 9); R.step9 = await ctrls(orgPage); }
  while (Date.now() < MAX) {
    if (MODE === "host" && Date.now() - lastPress > 7000) { lastPress = Date.now(); const s = await pressNext(); if (s) { pressed++; nextSel = s; } }
    const vs = []; for (const ph of reals) vs.push(await human(ph, [800 + Math.random() * 600, 3500 + Math.random() * 2500]));
    const nodeEnded = nodes.filter((x) => x.ok).every((x) => x.rt.phase === "ended");
    if (vs.length && vs.every((v) => v && v.phase === "ended") && nodeEnded) { if (!allEndedAt) allEndedAt = Date.now(); if (Date.now() - allEndedAt > 20000) { endedAll = true; break; } }
    await sleep(400);
  }
  if (MODE === "host") check("the organizer pressed the numbers through the page buttons", pressed > 0, `${pressed} presses via ${nextSel}`);
  check("every page reached the end of the game", endedAll, JSON.stringify((await Promise.all(reals.map((r) => view(r.p)))).map((v) => v?.phase)));
  const flat = (t) => t.flat().filter((x) => x !== null && x !== undefined);
  const snaps = []; for (const ph of reals) { const v = await ph.p.evaluate(() => JSON.parse(JSON.stringify(window.__rt.view()))).catch(() => null); if (v) snaps.push({ ph, v }); }
  for (const ph of nodes.filter((x) => x.ok)) { const v = JSON.parse(JSON.stringify(ph.rt.view())); snaps.push({ ph: { name: ph.name || ph.opts?.name || "phone", present: true, claims: [], errors: [], p: null }, v }); }
  const ref = snaps[0]?.v.log.filter((n) => n > 0) ?? [];
  const same = snaps.filter(({ v }) => { const m = v.log.filter((n) => n > 0), k = Math.min(m.length, ref.length); return m.slice(0, k).join() === ref.slice(0, k).join() && Math.abs(m.length - ref.length) <= 1; }).length;
  check(`all ${snaps.length} pages show the same ${ref.length} numbers in the same order`, same === snaps.length && snaps.length === PLAYERS, `${same}/${snaps.length}`);
  const keys = new Set(snaps.map(({ v }) => v.tickets.map((t) => flat(t).join(",")).join("|")));
  check("every person holds a different, well-formed ticket", keys.size === snaps.length && snaps.every(({ v }) => v.tickets.length >= 1 && v.tickets.every((t) => t.length === 3 && flat(t).length === 15 && new Set(flat(t)).size === 15)), `${keys.size} different`);
  const resKey = (v) => JSON.stringify(v.results.map((x) => `${x.pattern}#${x.ordinal}@${x.idx}`).sort());
  check("all pages show the same winners", snaps.every(({ v }) => resKey(v) === resKey(snaps[0].v)), snaps.map(({ v }) => v.results.length).join(","));
  check("no page error and no 5xx from our own site", R.errors.length === 0 && R.failedReq.filter((x) => !/drand/.test(x)).length === 0, JSON.stringify([...R.errors, ...R.failedReq.filter((x) => !/drand/.test(x))].slice(0, 3)));
  const shots = `C:/ct/test-sites/data/ui/shots-${B}-${TAG}`; mkdirSync(shots, { recursive: true }); for (const ph of reals.slice(0, 3).filter((x) => x.p)) await ph.p.screenshot({ path: `${shots}/${ph.name.replace(/ /g, "_")}.png` }).catch(() => {}); await orgPage.screenshot({ path: `${shots}/organizer.png`, fullPage: true }).catch(() => {});
  mkdirSync(`C:/ct/test-sites/data/player-logs/ui-${B}-${TAG}`, { recursive: true });
  writeFileSync(`C:/ct/test-sites/data/player-logs/ui-${B}-${TAG}/${eid}.jsonl`, snaps.map(({ ph, v }) => JSON.stringify({ game: eid, name: ph.name, pid: v.pid, checkedIn: ph.present, numbersReceived: v.log.filter((n) => n > 0).length, claims: ph.claims, wins: v.results.filter((r) => (r.pids || []).includes(v.pid)).map((r) => `${r.pattern}#${r.ordinal}@${r.idx}`), errors: ph.errors })).join("\n") + "\n");
} catch (e) { check("the organizer built and published the game by clicking", false, String(e).slice(0, 400)); }
finally { save(); }
await browser.close().catch(() => {}); process.exit(0);
