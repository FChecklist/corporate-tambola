// The "stuck human" tester: drives the organizer console like a person, step by step, through many combinations of choices and mistakes, and after every press of a Save / Publish / Add button decides
// what a human would see: did the page move on, or did it refuse WITH a reason that is in view, or did nothing visible happen (silent), or is the reason out of sight, or is it written in jargon.
//   node tools/ui-permute.mjs [--steps 1,2,3] [--site http://localhost:8801] [--login demo2@xyz.in] [--view phone|desk] [--only text]
// Results: data/ui/permute-<view>.json and one line per scenario on screen (PASS / FAIL with the reason). Local TEST server only (it creates many draft games).
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { launch, signIn, sleep } from "./ui-lib.mjs";
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const SITE = opt("site", "http://localhost:8801"), LOGIN = opt("login", "demo2@xyz.in"), VIEW = opt("view", "desk"), STEPS = opt("steps", "1,2,3,4,5,6,7,9,10").split(",").map(Number), ONLY = opt("only", "");
const VP = VIEW === "phone" ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 598, height: 1126 };
const out = { view: VIEW, scenarios: [] };
const browser = await launch("chromium");
const ctx = await browser.newContext({ viewport: { width: VP.width, height: VP.height }, ...(VP.isMobile ? { isMobile: true, hasTouch: true } : {}) });
let p = await ctx.newPage(); p.on("dialog", (d) => d.accept().catch(() => {}));
let pageErrors = []; const watch = (pg) => pg.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));
watch(p);
const pad = (n) => String(n).padStart(2, "0");
const JARGON = /(\bHTTP\b|undefined|\[object|server-error|\bnull\b|TypeError|ReferenceError|stack|SQLITE|\b4\d\d\b response|code:|ENOTFOUND)/i;

// ------------------------------------------------------------------ the page helpers
const stepNo = () => p.evaluate(() => (window.ctzStep ? window.ctzStep() : null)).catch(() => null);
const bodyText = () => p.evaluate(() => document.body.innerText.replace(/\s+/g, " ")).catch(() => "");
const msgs = () => p.evaluate(() => {
  const vh = innerHeight, bar = 58; // the sticky bottom bar covers the last ~58px on a phone
  return [...document.querySelectorAll(".zc-toast, .zc-toast-foot, .zc-err, .zc-guide-box, .zg-box, [role=alert], [role=status]")].filter((e) => e.textContent.trim()).map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim().replace(/\s+/g, " ").slice(0, 220), inView: r.height > 0 && r.top >= -2 && r.bottom <= vh - bar + 2, onScreenAtAll: r.height > 0 }; });
}).catch(() => []);
async function freshDraft() {
  await p.goto(`${SITE}/zc.html`, { waitUntil: "load" }); await sleep(1500);
  if (!(await p.$("#signout"))) await signIn(p, SITE, LOGIN);
  await p.waitForSelector("#signout, #mk, #back", { timeout: 30000 });
  if (await p.$("#back")) { await p.click("#back"); await sleep(1500); } // the console reopens the last game: go home first, as a person would
  await p.waitForSelector("#mk", { timeout: 30000 });
  for (let tries = 0; tries < 12; tries++) { // at the draft limit a person deletes drafts they do not need (Your games, Delete, Delete again): the tester does the same
    await p.click("#mk"); await sleep(1200);
    if (await p.$('[data-ck="occ"]')) break;
    const d = await p.$("[data-del-draft]"); if (!d) break;
    for (let k = 0; k < 4; k++) { const b = await p.$("[data-del-draft]"); if (!b) break; await b.click(); await sleep(400); const b2 = await p.$("[data-del-draft]"); if (b2) { await b2.click(); await sleep(1500); } }
  }
  await p.waitForSelector('[data-ck="occ"]', { timeout: 40000 }); await sleep(600);
}
const openStep = async (n) => { await p.locator(`.zc-dot[data-open="${n}"], [data-open="${n}"]`).first().click(); await sleep(700); };
const futureTime = (minAhead = 180) => { const ms = Math.ceil((Date.now() + minAhead * 60000) / 300000) * 300000, ist = new Date(ms + 5.5 * 3600000); return { hh: pad(ist.getUTCHours()), mm: pad(ist.getUTCMinutes()), date: `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}` }; };
const tryClick = async (sel) => { const l = p.locator(sel).first(); if (!(await l.count())) throw new Error("missing control " + sel); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click({ timeout: 8000 }); };
const setText = async (sel, v) => { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.fill(String(v)); };

/** press a button and watch what a person would see for up to 4 seconds */
async function press(sel) {
  const before = { step: await stepNo(), text: await bodyText(), msgs: (await msgs()).map((m) => m.t).join("|") };
  await tryClick(sel);
  let after = null;
  for (let i = 0; i < 20; i++) { await sleep(200); const m = await msgs(); const step = await stepNo(); const text = await bodyText(); after = { step, text, m }; if (step !== before.step || m.map((x) => x.t).join("|") !== before.msgs) break; }
  await sleep(500); const m = await msgs(); const step = await stepNo(); const text = await bodyText();
  const advanced = step !== before.step || m.some((x) => /^Saved/.test(x.t));
  const refusal = m.filter((x) => !/^(Saved|Loading)/.test(x.t));
  const changed = text !== before.text;
  return { advanced, refusal, changed, step, msgs: m.map((x) => x.t) };
}
// expectation: "ok" = the press must move on (a person did nothing wrong); "refuse" = it must refuse WITH a visible, plain reason
let nScen = 0, nFail = 0;
async function scenario(step, name, expect, run) {
  if (ONLY && !(`${step} ${name}`).toLowerCase().includes(ONLY.toLowerCase())) return;
  nScen++; pageErrors = []; let verdict = "PASS", why = "", got = {};
  try { got = await run(); } catch (e) { verdict = "FAIL"; why = "the tester could not do it: " + String(e).slice(0, 140); }
  if (verdict === "PASS") {
    const r = got;
    const visible = (r.refusal || []).filter((x) => x.inView !== false).length || (r.refusal || []).length;
    if (expect === "ok") { if (!r.advanced) { verdict = "FAIL"; why = r.refusal && r.refusal.length ? "a valid choice was refused: " + r.refusal.map((x) => x.t).join(" / ").slice(0, 200) : "pressed Save on a valid choice and nothing visible happened"; } }
    else { if (r.advanced) { verdict = "FAIL"; why = "an invalid choice was accepted silently"; } else if (!r.refusal || !r.refusal.length) { verdict = "FAIL"; why = r.changed ? "refused but no message anywhere" : "SILENT: nothing visible happened"; } else if (!r.refusal.some((x) => x.inView)) { verdict = "FAIL"; why = "the reason is out of sight: " + r.refusal[0].t.slice(0, 120); } }
    if (verdict === "PASS" && (r.msgs || []).some((t) => JARGON.test(t))) { verdict = "FAIL"; why = "jargon in the message: " + (r.msgs || []).find((t) => JARGON.test(t)).slice(0, 120); }
    if (verdict === "PASS" && pageErrors.length) { verdict = "FAIL"; why = "page error: " + pageErrors[0]; }
  }
  if (verdict === "FAIL") nFail++;
  console.log(`${verdict} [${VIEW}] step ${step} | ${name} | expect ${expect}${why ? " | " + why : ""}`);
  out.scenarios.push({ step, name, expect, verdict, why, got: { advanced: got.advanced, msgs: got.msgs } });
  if (verdict === "FAIL") { try { mkdirSync("C:/ct/test-sites/data/ui/permute-shots", { recursive: true }); await p.screenshot({ path: `C:/ct/test-sites/data/ui/permute-shots/${VIEW}-s${step}-${name.replace(/[^a-z0-9]+/gi, "_").slice(0, 50)}.png` }); } catch { /* ignore */ } }
}
const save = (n) => press(`[data-save="${n}"]`);

// ------------------------------------------------------------------ STEP 1: occasion, day, time
async function step1() {
  const OCC = ["Diwali party", "Dealer meet", "Annual day", "Team party", "Customer event", "Family day", "Weekend Fun", "Christmas Party", "Eid Party", "Holi Party"];
  for (const occ of OCC) await scenario(1, `occasion ${occ} on today, a time later today`, "ok", async () => { await freshDraft(); const t = futureTime(); await tryClick(`[data-ck="occ"][data-v="${occ}"]`); await tryClick('[data-ck="day"]:text("Today")'); await tryClick('[data-ck="time"][data-v="other"]'); await setText("#f-timeo", `${t.hh}:${t.mm}`); return save(1); });
  await scenario(1, "occasion Other with a custom name", "ok", async () => { await freshDraft(); const t = futureTime(); await tryClick('[data-ck="occ"][data-v="Other"]'); await setText("#f-oname", "Founders' evening"); await tryClick('[data-ck="day"]:text("Today")'); await tryClick('[data-ck="time"][data-v="other"]'); await setText("#f-timeo", `${t.hh}:${t.mm}`); return save(1); });
  await scenario(1, "occasion Other with NO name", "ok", async () => { await freshDraft(); const t = futureTime(); await tryClick('[data-ck="occ"][data-v="Other"]'); await tryClick('[data-ck="day"]:text("Today")'); await tryClick('[data-ck="time"][data-v="other"]'); await setText("#f-timeo", `${t.hh}:${t.mm}`); return save(1); });
  for (const tm of ["10:00", "12:00", "16:00", "18:00", "19:00", "20:00"]) await scenario(1, `a later day at ${tm}`, "ok", async () => { await freshDraft(); await tryClick('[data-ck="occ"][data-v="Team party"]'); const days = await p.$$eval('[data-ck="day"]', (b) => b.map((x) => x.dataset.v)); await tryClick(`[data-ck="day"][data-v="${days[2]}"]`); await tryClick(`[data-ck="time"][data-v="${tm}"]`); return save(1); });
  await scenario(1, "today but a time already past", "refuse", async () => { await freshDraft(); await tryClick('[data-ck="day"]:text("Today")'); await tryClick('[data-ck="time"][data-v="other"]'); await setText("#f-timeo", "00:05"); return save(1); });
  await scenario(1, "no day chosen at all", "refuse", async () => { await freshDraft(); return save(1); });
  await scenario(1, "day chosen but no time", "refuse", async () => { await freshDraft(); await tryClick('[data-ck="day"]:text("Today")'); return save(1); });
  await scenario(1, "other time left empty", "refuse", async () => { await freshDraft(); await tryClick('[data-ck="day"]:text("Today")'); await tryClick('[data-ck="time"][data-v="other"]'); return save(1); });
  await scenario(1, "other time typed as words", "refuse", async () => { await freshDraft(); await tryClick('[data-ck="day"]:text("Today")'); await tryClick('[data-ck="time"][data-v="other"]'); await setText("#f-timeo", "tonight"); return save(1); });
  await scenario(1, "other day, a date far in the future (400 days)", "refuse", async () => { await freshDraft(); await tryClick('[data-ck="day"][data-v="other"]'); const d = new Date(Date.now() + 400 * 86400000); await setText("#f-dayo", `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`).catch(() => {}); await tryClick('[data-ck="time"][data-v="19:00"]'); return save(1); });
  await scenario(1, "other day, yesterday", "refuse", async () => { await freshDraft(); await tryClick('[data-ck="day"][data-v="other"]'); const d = new Date(Date.now() - 86400000); await setText("#f-dayo", `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`).catch(() => {}); await tryClick('[data-ck="time"][data-v="19:00"]'); return save(1); });
  await scenario(1, "save twice quickly (double click)", "ok", async () => { await freshDraft(); const t = futureTime(); await tryClick('[data-ck="day"]:text("Today")'); await tryClick('[data-ck="time"][data-v="other"]'); await setText("#f-timeo", `${t.hh}:${t.mm}`); await p.locator('[data-save="1"]').first().dblclick(); await sleep(2500); const st = await stepNo(); const t2 = await msgs(); return { advanced: st !== 1 || t2.some((x) => /^Saved/.test(x.t)), refusal: [], msgs: t2.map((x) => x.t), changed: true }; });
}

// ------------------------------------------------------------------ STEP 2: size, mode, tickets, rounds, who can join
async function prepStep2() { await freshDraft(); const t = futureTime(); await tryClick('[data-ck="day"]:text("Today")'); await tryClick('[data-ck="time"][data-v="other"]'); await setText("#f-timeo", `${t.hh}:${t.mm}`); await save(1); await openStep(2); await p.waitForSelector('[data-ck="cap"]'); }
async function step2() {
  const CAPS = [10, 100, 250, 500, 750, 1000, 2500, 5000, 10000], MODES = ["auto", "host"], TIX = [1, 2], RND = [1, 2, 3, 4, 5], AUD = [1, 2, 3, 4, 5, 6], VER = ["id", "mobile", "either", "both"];
  let k = 0;
  for (const cap of CAPS) for (const aud of AUD) {
    const mode = MODES[k % 2], tix = TIX[(k >> 1) % 2], rnd = RND[k % 5], ver = VER[k % 4]; k++;
    const hostTooBig = mode === "host" && cap > 2000;
    await scenario(2, `cap ${cap}, ${mode}, ${tix} ticket(s), ${rnd} game(s), audience ${aud}${aud <= 2 ? ", verify " + ver : ""}`, hostTooBig ? "refuse" : "ok", async () => {
      if (k === 1 || k % 6 === 1) await prepStep2(); else { await openStep(2); await p.waitForSelector('[data-ck="cap"]'); }
      await tryClick(`[data-ck="cap"][data-v="${cap}"]`); await tryClick(`[data-ck="mode"][data-v="${mode}"]`);
      if (mode === "auto") await tryClick(`[data-ck="spd"][data-v="${k % 2 ? 9 : 12}"]`).catch(() => {});
      await tryClick(`[data-ck="tix"][data-v="${tix}"]`); await tryClick(`[data-ck="rnd"][data-v="${rnd}"]`); await tryClick(`[data-ck="aud"][data-v="${aud}"]`);
      if (aud <= 2) await tryClick(`[data-ck="ver"][data-v="${ver}"]`).catch(() => {});
      return save(2);
    });
  }
  for (const [label, v, expect] of [["own size 180", "180", "ok"], ["own size 10001", "10001", "refuse"], ["own size 0", "0", "refuse"], ["own size negative", "-5", "refuse"], ["own size words", "about a hundred", "refuse"], ["own size empty", "", "refuse"], ["own size with a decimal", "99.5", "refuse"]])
    await scenario(2, label, expect, async () => { await prepStep2(); await tryClick('[data-ck="capOther"], [data-bool="capOther"], button:has-text("different size")'); await setText("#f-cap", v); return save(2); });
}

// ------------------------------------------------------------------ STEP 3: prizes
async function prepStep3() { await prepStep2(); await tryClick('[data-ck="cap"][data-v="100"]'); await save(2); await openStep(3); await sleep(500); }
async function step3() {
  for (const b of ["Classic", "Simple", "Rich", "Choose myself"]) await scenario(3, `prize set ${b}`, b === "Choose myself" ? "refuse" : "ok", async () => { await prepStep3(); await tryClick(`[data-ck="bundle"][data-v="${b}"]`); if (b === "Choose myself") { /* all unticked */ const on = await p.$$('#sec3 input[type=checkbox]:checked'); for (const c of on) await c.uncheck().catch(() => {}); } return save(3); });
  const PT = ["voucher", "cash", "hamper", "phone", "watch", "earbuds", "tablet", "holiday", "dinner", "movie", "dayoff", "other", "later", "none"];
  for (const pt of PT) await scenario(3, `first-five prize kind ${pt}`, "ok", async () => { await prepStep3(); await tryClick('[data-ck="bundle"][data-v="Simple"]'); await tryClick(`[data-ck="hs.early5.pt"][data-v="${pt}"]`).catch(() => {}); if (pt === "other") await setText('[data-fi="hs.early5.pd"], #f-hs-early5-pd', "A weekend for two").catch(() => {}); if (pt === "cash") await setText("#f-hs-early5-pd-amt", "5000").catch(() => {}); return save(3); });
  for (const [label, amt, expect] of [["cash amount empty", "", "ok"], ["cash amount words", "five thousand", "ok"], ["cash amount huge", "99999999999999999999", "ok"], ["cash amount with commas and decimals", "5,000.50", "ok"], ["cash negative", "-500", "ok"]]) await scenario(3, label, expect, async () => { await prepStep3(); await tryClick('[data-ck="bundle"][data-v="Simple"]'); await tryClick('[data-ck="hs.early5.pt"][data-v="cash"]'); await setText("#f-hs-early5-pd-amt", amt); return save(3); });
  for (const n of [1, 2, 3, 5, 10, 20]) await scenario(3, `${n} winners for the first-five prize`, "ok", async () => { await prepStep3(); await tryClick('[data-ck="bundle"][data-v="Simple"]'); await tryClick(`[data-ck="hs.early5.n"][data-v="${n}"]`); return save(3); });
  for (const n of ["0", "21", "-1", "abc", ""]) await scenario(3, `typed winners count "${n}"`, "refuse", async () => { await prepStep3(); await tryClick('[data-ck="bundle"][data-v="Simple"]'); await setText("#f-hs-early5-n", n); return save(3); });
  await scenario(3, "very long prize text (300 characters)", "ok", async () => { await prepStep3(); await tryClick('[data-ck="bundle"][data-v="Simple"]'); await tryClick('[data-ck="hs.early5.pt"][data-v="other"]'); await setText('[data-fi="hs.early5.pd"], #f-hs-early5-pd', "x".repeat(300)); return save(3); });
  await scenario(3, "prize text with markup and emoji", "ok", async () => { await prepStep3(); await tryClick('[data-ck="bundle"][data-v="Simple"]'); await tryClick('[data-ck="hs.early5.pt"][data-v="other"]'); await setText('[data-fi="hs.early5.pd"], #f-hs-early5-pd', "<b>Gold</b> coin 🎁 & \"quotes\""); return save(3); });
  await scenario(3, "tie rule share", "ok", async () => { await prepStep3(); await tryClick('[data-ck="bundle"][data-v="Classic"]'); await tryClick('[data-ck="ties"][data-v="share"]'); return save(3); });
}

// ------------------------------------------------------------------ STEP 4: brand moments and the company strip
async function prepStep4() { await prepStep3(); await tryClick('[data-ck="bundle"][data-v="Classic"]'); await save(3); await openStep(4); await sleep(500); }
const LOGO_OK = "C:/ct/test-sites/tambola/apps/web/public/logo-512.png";
async function step4() {
  for (const [label, name, color, logo] of [["no brand at all", "", "", false], ["name only", "Acme Foods", "", false], ["name and colour", "Acme Foods", "#1B7F5C", false], ["colour only", "", "#B3261E", false], ["logo only", "", "", true], ["name and logo", "Acme Foods", "", true], ["colour and logo", "", "#6A1B9A", true], ["name, colour and logo", "Acme Foods", "#C26A00", true], ["name with special characters", "Smith & Sons \"Ltd\" <b>", "#00798C", false], ["very long name (80 characters)", "A".repeat(80), "#37474F", false]])
    await scenario(4, `company strip: ${label}`, "ok", async () => { await prepStep4(); if (name) await setText("#f-brand-name", name); if (color) await tryClick(`[data-ck="brand.color"][data-v="${color}"]`); if (logo) { await p.setInputFiles("#brandlogo", LOGO_OK); await sleep(2500); } return save(4); });
  for (const [label, file, expect] of [["a PDF as logo", "C:/ct/test-sites/tambola/apps/web/public/brochure.pdf", "ok"], ["a GIF-named text file as logo", "C:/ct/test-sites/data/staff-bad.gif", "ok"]]) await scenario(4, `logo: ${label} (the picture is refused but the game must still save)`, expect, async () => { await prepStep4(); try { await p.setInputFiles("#brandlogo", file); } catch { /* file missing: skip */ } await sleep(1500); return save(4); });
  for (const [oN, mN, cN, lucky] of [[0, 0, 0, false], [1, 0, 0, false], [0, 1, 0, false], [0, 0, 1, false], [1, 3, 1, false], [1, 3, 1, true], [0, 2, 0, true]])
    await scenario(4, `moments: opening ${oN}, during ${mN}, closing ${cN}${lucky ? ", lucky draw" : ""} (left empty)`, "refuse", async () => { await prepStep4(); await tryClick(`[data-ck="opN"][data-v="${oN}"]`); await tryClick(`[data-ck="midN"][data-v="${mN}"]`); await tryClick(`[data-ck="clN"][data-v="${cN}"]`); if (lucky) await tryClick('button:has-text("Add a lucky draw")'); return save(4); });
  for (const [oN, mN, cN, lucky] of [[0, 0, 0, false], [0, 0, 0, true]]) await scenario(4, `moments: none chosen${lucky ? " but a lucky draw" : ""}`, "ok", async () => { await prepStep4(); await tryClick(`[data-ck="opN"][data-v="${oN}"]`); await tryClick(`[data-ck="midN"][data-v="${mN}"]`); await tryClick(`[data-ck="clN"][data-v="${cN}"]`); if (lucky) await tryClick('button:has-text("Add a lucky draw")'); return save(4); });
  for (const [kind, val, title, expect] of [["msg", "", "Welcome to Diwali", "ok"], ["msg", "", "", "refuse"], ["yt", "https://youtu.be/dQw4w9WgXcQ", "Opening", "ok"], ["yt", "not a link", "Opening", "refuse"], ["yt", "", "Opening", "refuse"], ["vid", "https://cdn.example.com/a.mp4", "Opening", "ok"], ["vid", "http://insecure.example.com/a.mp4", "Opening", "refuse"], ["aud", "https://cdn.example.com/a.mp3", "Opening", "ok"], ["aud", "javascript:alert(1)", "Opening", "refuse"]])
    await scenario(4, `opening moment ${kind} link "${val.slice(0, 24)}" title "${title.slice(0, 12)}"`, expect, async () => { await prepStep4(); await tryClick('[data-ck="opN"][data-v="1"]'); await tryClick(`[data-ck="op.0.k"][data-v="${kind}"]`).catch(() => {}); if (kind === "msg") await setText("#f-op-0-t", title); else { await setText("#f-op-0-t", title).catch(() => {}); await setText("#f-op-0-v", val); } return save(4); });
}

// ------------------------------------------------------------------ STEP 5 and 6: team and people
async function prepStep5() { await prepStep4(); await save(4); await openStep(5); await sleep(500); }
async function step5() {
  for (const [label, lab, ph, em, expect] of [["host with name, mobile and e-mail", "Priya", "9876543210", "priya@acme.com", "ok"], ["host with name and mobile only", "Priya", "9876543210", "", "ok"], ["host with name and e-mail only", "Priya", "", "priya@acme.com", "ok"], ["host with nothing", "", "", "", "refuse"], ["host with a bad mobile", "Priya", "12345", "", "refuse"], ["host with a bad e-mail", "Priya", "", "priya-at-acme", "refuse"], ["host name only", "Priya", "", "", "refuse"]])
    await scenario(5, label, expect, async () => { await prepStep5(); await setText("#hostlabel", lab); await setText("#hostphone", ph); await setText("#hostemail", em); const b = await press("#hostadd"); b.advanced = b.advanced || /added|link|sent|Host/i.test((await bodyText()).slice(0, 4000)) && b.refusal.length === 0; return b; });
  await scenario(5, "co-host with name and mobile", "ok", async () => { await prepStep5(); await setText("#cohostlabel", "Sam"); await setText("#cohostphone", "9876543211"); const b = await press("#cohostadd"); return b; });
  await scenario(5, "co-host with nothing", "refuse", async () => { await prepStep5(); return press("#cohostadd"); });
  for (const n of ["10 people", "50 people", "100 people", "250 people", "500 people", "1000 people"]) await scenario(5, `co-host limit ${n}`, "ok", async () => { await prepStep5(); await tryClick(`button:has-text("${n}")`); await sleep(800); return { advanced: true, refusal: [], msgs: (await msgs()).map((m) => m.t), changed: true }; });
  await scenario(5, "Continue on step 5 with no team", "ok", async () => { await prepStep5(); return save(5); });
}
const csv = (rows) => rows.join("\n") + "\n";
async function step6() {
  const files = {
    good: csv(["Name,Employee ID", "Asha Rao,E001", "Ravi Kumar,E002"]),
    bom: "\ufeff" + csv(["Name,Employee ID", "Asha Rao,E001"]),
    quoted: csv(['Name,Employee ID', '"Rao, Asha",E001', '"Kumar, Ravi",E002']),
    wrongHeader: csv(["Full name;ID", "Asha Rao;E001"]),
    onlyHeader: csv(["Name,Employee ID"]),
    empty: "",
    dup: csv(["Name,Employee ID", "Asha,E001", "Asha,E001", "Ravi,E002"]),
    noIds: csv(["Name,Employee ID", "Asha,", "Ravi,"]),
    unicode: csv(["Name,Employee ID", "आशा शर्मा,E001", "José Núñez,E002", "李雷,E003"]),
    big: csv(["Name,Employee ID", ...Array.from({ length: 300 }, (_, i) => `Person ${i + 1},E${String(i + 1).padStart(4, "0")}`)]),
    mobiles: csv(["Name,Mobile", "Asha,9876543210", "Ravi,+91 98765 43211", "Bad,12345"]),
    formula: csv(["Name,Employee ID", "=HYPERLINK(\"http://x\"),E001"]),
  };
  mkdirSync("C:/ct/test-sites/data/ui/permute-files", { recursive: true });
  for (const [k, v] of Object.entries(files)) writeFileSync(`C:/ct/test-sites/data/ui/permute-files/${k}.csv`, v);
  await scenario(6, "step 6 opens and Continue works with no list (audience: anyone)", "ok", async () => { await prepStep5(); await save(5); await openStep(6); return save(6); });
  for (const [k, expectAdd] of [["good", "ok"], ["bom", "ok"], ["quoted", "ok"], ["wrongHeader", "refuse"], ["onlyHeader", "refuse"], ["empty", "refuse"], ["dup", "ok"], ["noIds", "refuse"], ["unicode", "ok"], ["big", "ok"], ["mobiles", "ok"], ["formula", "ok"]])
    await scenario(6, `upload a CSV: ${k}`, expectAdd, async () => { await prepStep5(); await save(5); await openStep(6); await tryClick('[data-mode="file"]'); await sleep(400); await tryClick(k === "mobiles" ? '[data-cols="mobile"]' : '[data-cols="id"]').catch(() => {}); const before = await bodyText(); await p.setInputFiles("#gfile", `C:/ct/test-sites/data/ui/permute-files/${k}.csv`); await sleep(2500); const m = await msgs(); const t = await bodyText(); const good = /\d+ good|on the list|added|Remove/.test(t) && !/0 good/.test(t); const noteYes = /good|duplicate|look wrong|could not|No people|nothing|empty/i.test(t.replace(before, "")) || m.length > 0; return { advanced: good, refusal: good ? [] : m.map((x) => ({ ...x })).concat(m.length ? [] : (noteYes ? [{ t: (t.match(/[^.]*(look wrong|could not|No people|nothing|empty)[^.]*\./i) || [""])[0], inView: true }] : [])), changed: t !== before, msgs: m.map((x) => x.t) }; });
  for (const [label, nm, ph, expect] of [["add one: name and mobile", "Asha Rao", "9876543210", "ok"], ["add one: name with +91 mobile", "Ravi Kumar", "+91 98765 43211", "ok"], ["add one: no name", "", "9876543210", "refuse"], ["add one: no mobile", "Asha", "", "refuse"], ["add one: short mobile", "Asha", "12345", "refuse"], ["add one: mobile with letters", "Asha", "98765abcde", "refuse"]])
    await scenario(6, label, expect, async () => { await prepStep5(); await save(5); await openStep(6); await tryClick('[data-mode="type"]').catch(() => {}); await setText("#gname", nm); await setText("#gphone", ph); const before = await bodyText(); const r = await press("#gadd"); const t = await bodyText(); const added = /1 good|on my list|Remove/.test(t) && t !== before; return { ...r, advanced: added || r.advanced }; });
}

// ------------------------------------------------------------------ STEP 7: check and publish (free demo path)
async function prepStep7(cap) { await prepStep2(); await tryClick(`[data-ck="cap"][data-v="${cap}"]`); await save(2); await tryClick('[data-save="3"]').catch(() => {}); await openStep(3); await tryClick('[data-ck="bundle"][data-v="Classic"]'); await save(3); await openStep(4); await save(4); await openStep(7); await sleep(600); }
async function step7() {
  await scenario(7, "demo game (10 people): the Publish button opens a card", "ok", async () => { await prepStep7(10); const r = await press("#publishopen"); const t = await bodyText(); return { ...r, advanced: r.advanced || /mobile|phone|e-mail|email|confirm/i.test(t) }; });
  for (const [label, em, ph, tick, expect] of [["demo publish: nothing filled", "", "", false, "refuse"], ["demo publish: mobile only", "", "9876543210", true, "refuse"], ["demo publish: bad mobile", "boss@acme.com", "123", true, "refuse"], ["demo publish: bad e-mail", "boss-at-acme", "9876543210", true, "refuse"], ["demo publish: everything but the tick", "boss@acme.com", "9876543210", false, "refuse"], ["demo publish: all filled and ticked", "boss@acme.com", "9876543210", true, "ok"]])
    await scenario(7, label, expect, async () => {
      await prepStep7(10); await tryClick("#publishopen"); await sleep(800);
      const fields = await p.$$eval("#sec7 input", (e) => e.filter((x) => x.offsetParent).map((x) => ({ id: x.id, type: x.type, ph: x.placeholder })));
      for (const f of fields) { if (f.type === "email" || /mail/i.test(f.id + f.ph)) await setText("#" + f.id, em).catch(() => {}); else if (/tel|phone|mobile/i.test(f.type + f.id + f.ph)) await setText("#" + f.id, ph).catch(() => {}); }
      if (tick) for (const c of await p.$$("#sec7 input[type=checkbox]")) await c.check().catch(() => {});
      const btn = (await p.locator('#sec7 button:has-text("Publish"), #sec7 [data-act="publish"], #publishgo').count()) ? '#sec7 button:has-text("Publish"), #sec7 [data-act="publish"], #publishgo' : "#publishopen";
      const r = await press(btn); const t = await bodyText(); return { ...r, advanced: r.advanced || /is open|published|Paid|Game day|Your game is/.test(t) };
    });
}

// ------------------------------------------------------------------ STEPS 9 and 10: game day and after (a published demo game)
async function publishedDemo() { await prepStep7(10); await tryClick("#publishopen"); await sleep(800); const fields = await p.$$eval("#sec7 input", (e) => e.filter((x) => x.offsetParent).map((x) => ({ id: x.id, type: x.type, ph: x.placeholder }))); for (const f of fields) { if (f.type === "email" || /mail/i.test(f.id + f.ph)) await setText("#" + f.id, "boss@acme.com").catch(() => {}); else if (/tel|phone|mobile/i.test(f.type + f.id + f.ph)) await setText("#" + f.id, "9876543210").catch(() => {}); } for (const c of await p.$$("#sec7 input[type=checkbox]")) await c.check().catch(() => {}); await press('#sec7 button:has-text("Publish"), #sec7 [data-act="publish"], #publishgo').catch(() => {}); await sleep(1500); }
async function step9() {
  await scenario(9, "game day before the game is published: the step explains why it is not open", "ok", async () => { await prepStep7(10); await openStep(9); const t = await bodyText(); const explained = /opens when your game is published|publish/i.test(t); return { advanced: explained, refusal: [], msgs: [], changed: true }; });
  await scenario(9, "game day on a published game: controls are visible and the login line is shown", "ok", async () => { await publishedDemo(); await openStep(9); const t = await bodyText(); return { advanced: /Pause/.test(t) && /Organizer \/ Host has to log into the game/.test(t), refusal: [], msgs: [], changed: true }; });
  await scenario(9, "send an empty message to everyone", "refuse", async () => { await publishedDemo(); await openStep(9); return press("#annSend"); });
  await scenario(9, "send a message", "ok", async () => { await publishedDemo(); await openStep(9); await setText("#annText", "Dinner at 8"); const r = await press("#annSend"); return { ...r, advanced: r.advanced || /sent|Sent|shown/i.test(await bodyText()) }; });
}
async function step10() {
  await scenario(10, "after the game: erase asks to confirm and says what happens", "ok", async () => { await publishedDemo(); await openStep(10); await tryClick("#erase"); await sleep(800); const t = await bodyText(); return { advanced: /delete|erase|sure|confirm/i.test(t), refusal: [], msgs: [], changed: true }; });
}

try {
  const table = { 1: step1, 2: step2, 3: step3, 4: step4, 5: step5, 6: step6, 7: step7, 9: step9, 10: step10 };
  for (const n of STEPS) { if (table[n]) { try { await table[n](); } catch (e) { console.log("STEP", n, "aborted:", String(e).slice(0, 200)); } } }
} finally {
  out.total = nScen; out.failed = nFail; mkdirSync("C:/ct/test-sites/data/ui", { recursive: true }); writeFileSync(`C:/ct/test-sites/data/ui/permute-${VIEW}.json`, JSON.stringify(out, null, 1));
  console.log(`DONE ${nScen} scenarios, ${nFail} failed`); await browser.close(); process.exit(0);
}
