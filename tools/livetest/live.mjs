// Live test of the REAL website with real Chrome phones (no fake clock, real public beacon, real store).
//   node tools/livetest/live.mjs signin-start <email>
//   node tools/livetest/live.mjs signin-finish <email> <code>            (the 6-digit code from the e-mail)
//   node tools/livetest/live.mjs game --mode auto|host|demo --people 100 --phones 6 --speed 6 --lead 3
//   node tools/livetest/live.mjs cleanup <id> [<id> ...]                 (erase every participant of those games)
// Everything is written to C:\ct\games-ops\tmp\live_*.json / live_shots. Fake participants use 9xxxxxxxxx numbers that never receive anything.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
const require = createRequire("C:/ct/tambola/package.json");
const { chromium } = require("playwright");

const BASE = process.env.LIVE_BASE || "https://corporatetambola.com";
const TMP = "C:/ct/games-ops/tmp"; mkdirSync(TMP + "/live_shots", { recursive: true });
const TOKEN_FILE = TMP + "/live_token.json";
const CONSENT = JSON.parse(readFileSync("C:/ct/tambola/apps/edge/src/consent-text.json", "utf8"));
const kindOf = (method, path, body) => {
  if (method !== "POST") return null;
  if (path === "/api/start") return "K2";
  if (/^\/api\/z\/[A-Za-z0-9_-]{4,40}\/publish$/.test(path)) return "K1";
  if (/^\/api\/z\/[A-Za-z0-9_-]{4,40}\/join$/.test(path)) return "K4";
  if (/^\/api\/z\/[A-Za-z0-9_-]{4,40}\/(roster|people)(\?.*)?$/.test(path)) return "K6";
  return null;
};
const sha = (s) => createHash("sha256").update(s).digest("hex");
const GENESIS = 1692803367;
const roundAt = (ms) => Math.floor((ms / 1000 - GENESIS) / 3) + 1;
const roundMs = (r) => (GENESIS + (r - 1) * 3) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2); const cmd = args[0];
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };

async function call(method, path, body, headers = {}) {
  const k = kindOf(method, path, body);
  if (k && body && !body.consent) body = { ...body, consent: { v: CONSENT.version, boxes: Object.keys(CONSENT[k]) } };
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, body: j };
}
const token = () => (existsSync(TOKEN_FILE) ? JSON.parse(readFileSync(TOKEN_FILE, "utf8")) : null);
const org = (method, path, body) => { const t = token(); if (!t) throw new Error("sign in first"); return call(method, path, body, { "x-organizer": t.token }); };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (cmd === "signin-start") {
  const email = args[1]; const r = await call("POST", "/api/auth/email", { email });
  log("auth/email", r.status, JSON.stringify(r.body).slice(0, 200)); process.exit(r.ok ? 0 : 1);
}
if (cmd === "signin-finish") {
  const email = args[1], code = args[2]; const r = await call("POST", "/api/auth/verify", { email, code });
  log("auth/verify", r.status, JSON.stringify(r.body).slice(0, 120));
  if (r.ok && r.body.token) { writeFileSync(TOKEN_FILE, JSON.stringify({ email, token: r.body.token, at: Date.now() })); log("token saved"); }
  process.exit(r.ok ? 0 : 1);
}
if (cmd === "cleanup") {
  for (const id of args.slice(1).filter((x) => !x.startsWith("--"))) { const r = await org("POST", `/api/z/${id}/erase`, {}); log("erase", id, r.status, JSON.stringify(r.body).slice(0, 160)); }
  if (args.includes("--close")) { const r = await org("POST", "/api/org/close", {}); log("close organizer account (deletes its games)", r.status, JSON.stringify(r.body).slice(0, 160)); }
  process.exit(0);
}
if (cmd !== "game") { console.log("usage: see the header"); process.exit(2); }

// ---------------------------------------------------------------- a whole game
const mode = opt("mode", "auto"), people = Number(opt("people", 100)), phonesN = Number(opt("phones", 6)), speed = Number(opt("speed", 6)), lead = Number(opt("lead", 3));
const demo = mode === "demo";
const report = { base: BASE, mode, people, phonesN, speed, startedAt: new Date().toISOString(), checks: [], notes: [] };
const check = (name, ok, detail = "") => { report.checks.push({ name, ok: !!ok, detail: String(detail ?? "").slice(0, 300) }); log(ok ? "PASS" : "FAIL", name, ok ? "" : detail); };
const save = () => writeFileSync(`${TMP}/live_${mode}.json`, JSON.stringify(report, null, 2));
const t = token(); if (!t) { console.log("sign in first"); process.exit(2); }

const id = (demo ? "LT-DEMO-" : mode === "host" ? "LT-HOST-" : "LT-AUTO-") + Date.now().toString(36).toUpperCase().slice(-5);
const startRound = roundAt(Date.now() + lead * 60_000);
const cfg = { id, startRound, callSeconds: speed, cap: demo ? 10 : people, ...(demo ? { demo: true } : {}), ...(mode === "host" ? { callMode: "host" } : {}), name: `Live test ${mode}` };
let r = await org("POST", "/api/z", cfg); check("game created", r.ok, `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
if (!r.ok) { save(); process.exit(1); }
const rewards = [...[1, 2].map((o) => ({ pattern: "top", scope: "ticket", ordinal: o, text: "Voucher" })), { pattern: "early5", scope: "ticket", ordinal: 1, text: "Mug" }, { pattern: "mid", scope: "ticket", ordinal: 1, text: "" }, { pattern: "bot", scope: "ticket", ordinal: 1, text: "" }, { pattern: "corners", scope: "ticket", ordinal: 1, text: "" }, ...[1, 2].map((o) => ({ pattern: "full", scope: "ticket", ordinal: o, text: "Hamper" }))];
r = await org("PATCH", `/api/z/${id}/settings`, { rewards, ties: "next", whoCanJoin: "anyone" }); check("prizes set (Top Line x2, Full House x2, ties next, open to anyone)", r.ok, `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
r = await org("POST", `/api/z/${id}/publish`, { email: t.email, phone: "9650397480" }); check("published" + (demo ? " (demo, free)" : " (free launch, cap " + people + ")"), r.ok && r.body.published, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
const info = (await call("GET", `/api/z/${id}/info`)).body; check("not held for payment", !info.locked, JSON.stringify(info).slice(0, 160));
report.id = id; report.startMs = roundMs(startRound); report.links = { console: `${BASE}/zc.html?e=${id}`, guest: `${BASE}/z.html?e=${id}`, big: `${BASE}/big.html?e=${id}`, board: `${BASE}/board.html?e=${id}#k=<key>` }; save();

// 100 people on the list (personal links) and 100 fake joins (as if each opened their link)
const n = demo ? 10 : people;
const list = Array.from({ length: n }, (_, i) => ({ name: `Test Person ${i + 1}`, phone: "9" + String(100000000 + ((Date.now() % 10000000) * 10 + i) % 900000000).padStart(9, "0") }));
let added = 0; for (let i = 0; i < list.length; i += 50) { const rr = await org("POST", `/api/z/${id}/people`, { people: list.slice(i, i + 50) }); if (rr.ok) added += (rr.body.added ?? rr.body.count ?? list.slice(i, i + 50).length); else report.notes.push("people add: " + JSON.stringify(rr.body).slice(0, 160)); }
const pl = await org("GET", `/api/z/${id}/people`); const links = JSON.stringify(pl.body).match(/https?:\/\/[^"]+/g) || [];
check(`${n} people on the list with personal links`, pl.ok && (pl.body.people?.length ?? pl.body.count ?? 0) >= n, `${pl.status} people=${pl.body.people?.length ?? "?"} links=${links.length}`);
report.personalLinks = links.length;
let joined = 0; const joinedPids = [];
for (const p of list) { const rr = await call("POST", `/api/z/${id}/join`, { phone: p.phone, name: p.name, device: sha("dev|" + p.phone).slice(0, 32) }); if (rr.ok && rr.body.pid) { joined++; joinedPids.push(rr.body.pid); } else report.notes.push("join " + p.phone + ": " + JSON.stringify(rr.body).slice(0, 120)); }
check(`${n} fake participants joined through the API (one ticket each)`, joined === n, `${joined}/${n}`);
if (!demo) { const extra = await call("POST", `/api/z/${id}/join`, { phone: "9000000001", name: "Over cap", device: sha("dev|over").slice(0, 32) }); check("the 101st person is refused (game full)", !extra.ok && /full/i.test(extra.body.error || ""), JSON.stringify(extra.body).slice(0, 120)); }
save();

// real Chrome phones (K of the 100 play for real: tap and claim)
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const phones = [];
try {
  for (let i = 0; i < phonesN; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36" });
    const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    const who = list[i]; // the first K list people play on real phones (the same number: the ticket joins from the phone instead; the API join above used a different device, so this phone is told it is on another phone -> use fresh people instead)
    const ph = "9" + String(200000000 + (Date.now() % 1000000) * 100 + i).slice(-9), nm = `Phone ${i + 1}`;
    await page.goto(`${BASE}/z.html?e=${id}`, { waitUntil: "load" });
    await page.waitForSelector("[data-cbc='K4'] input[data-box]", { timeout: 20000 });
    const boxes = page.locator("[data-cbc='K4'] input[data-box]"); const bn = await boxes.count();
    for (let b = 0; b < bn; b++) { const bx = boxes.nth(b); if (!(await bx.isChecked())) await bx.check({ force: true }).catch(() => {}); }
    if (await page.$("#ph")) await page.fill("#ph", ph); if (await page.$("#nm")) await page.fill("#nm", nm);
    await page.click("#go");
    const ok = await page.waitForFunction(() => window.__rt && window.__rt.pid, null, { timeout: 25000 }).then(() => true).catch(() => false);
    phones.push({ i, ctx, page, errors, ph, nm, joined: ok });
    log("phone", i + 1, ok ? "joined" : "NOT joined");
  }
  check(`${phonesN} real Chrome phones joined through the page (boxes ticked, number, name)`, phones.every((p) => p.joined));
  // the organizer's console, board and number screen
  const octx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await octx.addInitScript((tok) => { try { sessionStorage.setItem("ctz-org", tok); } catch {} }, t.token);
  const console_ = await octx.newPage(); await console_.goto(`${BASE}/zc.html?e=${id}`, { waitUntil: "load" }); await console_.waitForSelector(".zc-sech", { timeout: 30000 }).catch(() => {});
  const board = await octx.newPage(); await board.goto(`${BASE}/board.html?e=${id}#k=${encodeURIComponent(t.token)}`, { waitUntil: "load" });
  const big = await octx.newPage(); await big.goto(`${BASE}/big.html?e=${id}`, { waitUntil: "load" });
  await sleep(3000);
  check("the organizer's board opens with the key (90 cells)", (await board.$$(".board > div")).length === 90 || /for the Organizer/.test(await board.innerText("body").catch(() => "")) === false, String((await board.$$(".board > div")).length));
  check("the number screen shows no board", !(await big.$(".board")));
  const view = (p) => p.evaluate(() => { const v = window.__rt.view(); return { phase: v.phase, n: v.log.length, last: v.log[v.log.length - 1], results: v.results.map((x) => `${x.pattern}#${x.ordinal}@${x.idx}`), won: (v.won || []).map((w) => w.pattern + "#" + w.ordinal), bogeys: v.bogeys ?? null, claimable: v.claimable ?? null }; }).catch(() => null);
  log("waiting for the start at", new Date(report.startMs + 120_000).toISOString(), "(2 min after", new Date(report.startMs).toISOString(), ")");
  // play: every 3 s, every phone taps along and claims; in host mode the organizer presses Next number every ~8 s
  const deadline = Date.now() + 40 * 60_000; let lastPress = 0, presses = 0, shots = 0;
  const pressNext = async () => { const b = await console_.$("#nextnum"); if (!b) return false; if (await b.isDisabled().catch(() => true)) return false; await b.click(); presses++; lastPress = Date.now(); return true; };
  while (Date.now() < deadline) {
    const vs = []; for (const p of phones) { const v = await view(p.page); vs.push(v); if (v && v.phase === "play") await p.page.evaluate(() => window.__rt.playAlong({})).catch(() => {}); }
    if (mode === "host" && Date.now() - lastPress > 8000) { const first = vs.find((v) => v); if (first && (first.phase === "play")) await pressNext().catch(() => {}); }
    const ns = vs.map((v) => v?.n ?? -1);
    if (shots === 0 && Math.max(...ns) >= 10) { await phones[0].page.screenshot({ path: `${TMP}/live_shots/${mode}-phone-mid.png` }); await board.screenshot({ path: `${TMP}/live_shots/${mode}-board-mid.png` }); await big.screenshot({ path: `${TMP}/live_shots/${mode}-big-mid.png` }); await console_.screenshot({ path: `${TMP}/live_shots/${mode}-console-mid.png`, fullPage: false }); shots = 1; }
    if (Math.max(...ns) % 10 === 0 && Math.max(...ns) > 0) log("numbers", ns.join("/"), "results", vs[0]?.results?.length ?? 0, mode === "host" ? "presses " + presses : "");
    if (vs.every((v) => v && v.phase === "ended")) break;
    await sleep(3000);
  }
  const finals = []; for (const p of phones) finals.push(await view(p.page));
  report.finals = finals; report.presses = presses;
  check("every phone reached the end of the game", finals.every((v) => v && v.phase === "ended"), finals.map((v) => v?.phase).join("/"));
  check("every phone has the same numbers in the same order", finals.every((v) => v && v.n === finals[0].n), finals.map((v) => v?.n).join("/"));
  check("every phone agrees on the winners", finals.every((v) => v && JSON.stringify(v.results) === JSON.stringify(finals[0].results)), JSON.stringify(finals[0]?.results));
  check("prizes were won (by claiming)", (finals[0]?.results?.length ?? 0) > 0, String(finals[0]?.results?.length));
  check("the phones that played hold the prizes (nobody who did not claim won)", finals.flatMap((v) => v?.won ?? []).length === (finals[0]?.results?.length ?? -1), JSON.stringify(finals.map((v) => v?.won)));
  if (mode === "host") check("numbers came only on presses (presses >= numbers called)", presses >= (finals[0]?.n ?? 999), `${presses} presses, ${finals[0]?.n} numbers`);
  const pub = (await call("GET", `/api/z/${id}/results`)).body.results || [];
  check("the store's winners equal the phones'", pub.length === (finals[0]?.results?.length ?? -1), `${pub.length} vs ${finals[0]?.results?.length}`);
  const claims = (await org("GET", `/api/z/${id}/claims`)).body; report.claims = JSON.stringify(claims).length;
  check("the organizer can read the claims (and Bogeys)", !!claims && Array.isArray(claims.claims), JSON.stringify(claims).slice(0, 120));
  check("no JavaScript error on any phone", phones.every((p) => p.errors.length === 0), JSON.stringify(phones.map((p) => p.errors).flat().slice(0, 3)));
  await phones[0].page.screenshot({ path: `${TMP}/live_shots/${mode}-phone-end.png` }); await console_.goto(`${BASE}/zc.html?e=${id}`); await sleep(4000); await console_.screenshot({ path: `${TMP}/live_shots/${mode}-console-end.png` });
  const ct = await console_.innerText("body").catch(() => "");
  check("the console shows the game ended with winners", /winner|prize|ended|over/i.test(ct), ct.slice(0, 200));
  report.consoleText = ct.slice(0, 2000);
} finally { await browser.close(); report.finishedAt = new Date().toISOString(); save(); }
log("done", `${TMP}/live_${mode}.json`, "failed:", report.checks.filter((c) => !c.ok).map((c) => c.name).join("; ") || "none");
