// The 100-case campaign: 100 different real-life games (auto 9 s / auto 12 s / manual Host mode, six audiences, prizes, tickets, brand breaks, late joiners, reloads, offline phones,
// pause, organizer ends early, wrong claims, nobody claiming ...) with about 100 fake people each (real-looking names, mobile numbers and employee IDs).
// Every phone is the REAL phone game code (zgame.js) talking to the REAL local server over the real network, on the REAL clock and the real public beacon (drand). No screen (see docs).
//   node tools/campaign.mjs [--from 1] [--to 100] [--conc 8] [--people 100] [--lead 150] [--tag run1]
import { writeFileSync } from "node:fs";
import { Harness, NodePhone, ZG, TBControl, sleep, roundAt, roundMs, beaconStats, beaconAvail, queueStats } from "./nodephone.mjs";
import { waitForReport, checkReport } from "./report-check.mjs";
import { DatabaseSync } from "node:sqlite";
import { auditGame } from "./audit.mjs";
import { fileURLToPath as __f2p } from "node:url"; const ROOT = __f2p(new URL("../../../", import.meta.url)), DATA = process.env.DATA_DIR || ROOT + "data"; const DB = process.env.DB_FILE || DATA + "/tambola-test.sqlite"; // CLOUD PORT: paths relative to the checkout; DB_FILE chooses the server database
import { mkdirSync } from "node:fs"; mkdirSync(DATA, { recursive: true });
const q2 = (sql, ...a) => { const db = new DatabaseSync(DB, { readOnly: true }); try { return db.prepare(sql).all(...a); } finally { db.close(); } };

const pub = (...a) => Promise.race([TBControl.publish(...a), new Promise((_, rej) => setTimeout(() => rej(new Error("control call timed out")), 30000))]);
const BASE = process.env.BASE || "http://localhost:8801";
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const FROM = Number(opt("from", 1)), TO = Number(opt("to", 100)), CONC = Number(opt("conc", 8)), PEOPLE = Number(opt("people", 100)), HEAVY = Number(opt("heavy", 1e9)), LEAD = Number(opt("lead", 150)), TAG = opt("tag", "run" + Date.now().toString(36).slice(-4));
const PLAIN = args.includes("--plain"); // only plain automatic games (no breaks, pauses, late joiners, reloads, offline phones): the games whose number timing can be counted for every phone
const H = new Harness(BASE, { ipPool: 300 });
let lag = 0, lagMax = 0; { let t = Date.now(); setInterval(() => { const d = Date.now() - t - 250; t = Date.now(); lag = Math.max(0, d); lagMax = Math.max(lagMax, lag); }, 250); } // how late this program runs its own timers: if it is above ~300 ms the test machine, not the game, is the bottleneck
const FIRST = ["Asha", "Ravi", "Meera", "Imran", "Sunita", "Karan", "Priya", "Vikram", "Fatima", "Arjun", "Neha", "Rohit", "Anjali", "Sanjay", "Deepa", "Manoj", "Kavita", "Suresh", "Pooja", "Amit", "Lakshmi", "Harish", "Nisha", "Farhan", "Divya", "Gaurav", "Swati", "Rahul", "Shalini", "Tarun", "Rekha", "Mohan", "Isha", "Nitin", "Jaya", "Aman", "Bhavna", "Yash", "Seema", "Dev"];
const LAST = ["Sharma", "Verma", "Iyer", "Khan", "Patel", "Singh", "Reddy", "Nair", "Gupta", "Das", "Joshi", "Mehta", "Rao", "Kapoor", "Bose", "Menon", "Shah", "Pillai", "Chopra", "Malhotra"];
const nameOf = (i) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]}`;
const pad = (n, w) => String(n).padStart(w, "0");
const COMPANIES = ["Sunrise Textiles", "Bharat Logistics", "Neelkanth Pharma", "Orchid Software", "Lotus Foods", "Kaveri Motors", "Himalaya Steel", "Indus Retail"];

// ---------------------------------------------------------------- the 100 cases
const MODES = ["auto9", "auto12", "host"];
const AUDS = ["open", "list-mobile", "emp-id", "emp-both", "everyone-id", "everyone-both"];
const PRIZES = [
  [["early5", 1], ["top", 1]],
  [["early5", 1], ["top", 1], ["mid", 1], ["bot", 1], ["corners", 1], ["full", 1]],
  [["early5", 1], ["early5", 2], ["top", 1], ["top", 2], ["full", 1], ["full", 2]],
  [["star", 1], ["corners", 1], ["top", 1], ["full", 1]],
];
function caseOf(n) { // n = 1..100: every (mode x audience) pair (18) appears 5 or 6 times; the other choices rotate so every combination of option is met
  const k = n - 1, pair = k % 18, rep = Math.floor(k / 18);
  const mode = MODES[pair % 3], aud = AUDS[Math.floor(pair / 3)];
  const c = { n, id: `CMP-${TAG.toUpperCase()}-${pad(n, 3)}`, mode, aud, speed: mode === "auto12" ? 12 : 9, tickets: (rep + pair) % 2 === 0 ? 1 : 2, prizes: PRIZES[(rep + Math.floor(pair / 3)) % 4], ties: (rep + pair) % 3 === 0 ? "share" : "next", brand: (rep + pair) % 3 === 1, rounds: 1, events: [], claim: "mixed", people: PEOPLE };
  if (n % 17 === 0) c.rounds = 2;
  if (n % 5 === 0) c.events.push("late");
  if (n % 6 === 0) c.events.push("reload");
  if (n % 7 === 0) c.events.push("offline");
  if (n % 9 === 0 && mode !== "host") c.events.push("pause");
  if (n % 11 === 0) c.events.push("bogey");
  if (n % 13 === 0) c.events.push("slow");
  if (n === 23 || n === 61 || n === 88) c.events.push("end");
  if (n === 8 || n === 47) { c.claim = "none"; c.prizes = PRIZES[0]; c.brand = false; c.events = []; c.rounds = 1; } // nobody claims: all 90 numbers must come
  if (n === 4 || n === 55) { c.people = 10; c.aud = "open"; } // the Rs 0 demo-size game
  if (n === 99) { c.people = 100; c.tickets = 2; c.prizes = PRIZES[1]; c.brand = true; c.events = ["late", "reload", "offline"]; }
  if (PLAIN) { c.mode = n % 2 ? "auto9" : "auto12"; c.speed = c.mode === "auto12" ? 12 : 9; c.events = c.events.filter((e) => e === "bogey" || e === "slow"); c.brand = false; c.rounds = 1; }
  return c;
}

// ---------------------------------------------------------------- one case
const rewardsOf = (c) => c.prizes.map(([pattern, ordinal]) => ({ pattern, scope: "ticket", ordinal, text: ordinal === 1 ? "Prize " + pattern : "Prize " + pattern + " " + ordinal }));
const brandOf = (c) => (c.brand ? { opening: [{ kind: "speech", title: `Opening speech from ${COMPANIES[c.n % COMPANIES.length]}`, seconds: 21 }], breaks: [{ after: 6, seconds: 21, kind: "speech", title: "Message from the CEO" }], closing: [{ kind: "speech", title: "Thank you from the team" }] } : {});
async function runCase(c) {
  const R = { ticks: 0, n: c.n, id: c.id, mode: c.mode, aud: c.aud, speed: c.speed, tickets: c.tickets, prizes: c.prizes.map((p) => p.join("#")).join(","), ties: c.ties, brand: c.brand, rounds: c.rounds, events: c.events.join("+") || "-", claim: c.claim, people: c.people, checks: [], notes: [] };
  const check = (name, ok, d = "") => { R.checks.push({ n: name, ok: !!ok, d: String(d).slice(0, 240) }); if (!ok) console.log(`FAIL #${c.n} ${name} | ${String(d).slice(0, 200)}`); };
  const hsh = parseInt(((await import("node:crypto")).createHash("sha256").update(TAG + ":" + c.n).digest("hex")).slice(0, 8), 16), ip = `10.${hsh % 250}.${(hsh >> 8) % 250}.${1 + ((hsh >> 16) % 250)}`, email = `cmp${c.n}.${TAG}@sample-co.in`;
  const allow = async (addr) => { await H.call("POST", "/api/owner/test-mail", { add: addr }, "local-organizer-secret", "10.250.0.1"); }; // TEST mode e-mails only addresses on the owner's list: the organizer and the payer of every case are put on it, so the real mails can be read and checked
  await allow(email); if (c.people > 10 && c.n % 2 === 0) await allow(`finance${c.n}.${TAG}@sample-co.in`);
  const st = await H.call("POST", "/api/start", { email, ...H.consent("K2") }, undefined, ip); const tok = st.j.token; check("organizer account made", !!tok, JSON.stringify(st.j).slice(0, 100));
  const startRound = roundAt(Date.now() + LEAD * 1000), startMs = roundMs(startRound), firstMs = startMs + 120000;
  let r = await H.call("POST", "/api/z", { id: c.id, startRound, callSeconds: c.speed, cap: c.people <= 10 ? 10 : c.people + 15, ...(c.people <= 10 ? { demo: true } : {}), name: `${COMPANIES[c.n % COMPANIES.length]} game ${c.n}`, ...(c.mode === "host" ? { callMode: "host" } : {}), tickets: c.tickets, ...(c.rounds > 1 ? { rounds: c.rounds } : {}) }, tok, ip);
  check("game created", r.ok, JSON.stringify(r.j).slice(0, 160));
  const verify = c.aud === "emp-id" || c.aud === "everyone-id" ? "id" : c.aud === "emp-both" || c.aud === "everyone-both" ? "both" : "mobile";
  const employeesOnly = c.aud === "emp-id" || c.aud === "emp-both";
  const settings = { rewards: rewardsOf(c), ties: c.ties, whoCanJoin: c.aud === "list-mobile" || employeesOnly ? "list" : "anyone", ...(verify !== "mobile" ? { verify } : {}), ...(employeesOnly ? { employeesOnly: true } : {}), ...brandOf(c), tickets: c.tickets, ...(c.rounds > 1 ? { rounds: c.rounds } : {}) };
  r = await H.call("PATCH", `/api/z/${c.id}/settings`, settings, tok, ip); check("settings saved", r.ok, JSON.stringify(r.j).slice(0, 200));
  r = await H.call("POST", `/api/z/${c.id}/publish`, { email, phone: "9650397480", ...H.consent("K1") }, tok, ip); check("published", r.ok && r.j.published, JSON.stringify(r.j).slice(0, 200));
  const payVia = c.people > 10 ? (c.n % 2 ? "org" : "link") : null; let payerMail = email;
  if (payVia === "org") { // the organizer pays in the console (test payment: marked paid at once, publishes the draft)
    r = await H.call("POST", "/api/payments/test", { pack: 100, email, name: "Organizer " + c.n, org: COMPANIES[c.n % COMPANIES.length], country: "IN", eid: c.id, ...H.consent("K3") }, tok, ip); check("the organizer's payment was accepted", r.ok, JSON.stringify(r.j).slice(0, 200));
  } else if (payVia === "link") { // the organizer forwards the pay link; a person with no account (the finance team) pays it
    r = await H.call("POST", `/api/z/${c.id}/paylink`, {}, tok, ip); const lt = (r.j.url || "").match(/t=([0-9a-f]{48})/)?.[1]; check("a pay link was made for the game", !!lt, JSON.stringify(r.j).slice(0, 160));
    payerMail = `finance${c.n}.${TAG}@sample-co.in`;
    if (lt) { const v = await H.call("GET", `/api/paylink/${lt}`, undefined, undefined, "10.200." + (c.n % 250) + ".9"); check("the pay link page shows the game and a price", v.ok && !!v.j.price, JSON.stringify(v.j).slice(0, 160)); r = await H.call("POST", `/api/paylink/${lt}/checkout`, { name: "Finance Team " + c.n, email: payerMail, org: "Finance", country: "IN", ...H.consent("K3") }, undefined, "10.200." + (c.n % 250) + ".9"); check("someone else paid through the link", r.ok, JSON.stringify(r.j).slice(0, 200)); }
  }
  if (payVia) { await sleep(500); const inf = (await H.call("GET", `/api/z/${c.id}/info`, undefined, undefined, ip)).j; check("after payment the game is unlocked by itself (not held) and published", inf.locked !== true && inf.cap > 0, JSON.stringify({ locked: inf.locked, cap: inf.cap })); R.paidVia = payVia; R.payerMail = payerMail; }
  // ---- the people: a plan of who is a real participant, who is not on the list, who has the wrong ID ----
  const nOK = Math.round(c.people * 0.85), nBad = c.people - nOK; const base = c.n * 10000; const mob = (i) => `9${pad(c.n % 100, 2)}${pad(i, 7)}`.slice(0, 10);
  const emp = (i) => `EMP-${pad(1000 + i, 5)}`; const plan = [];
  for (let i = 0; i < nOK; i++) {
    if (c.aud === "open") plan.push({ kind: "ok", phone: mob(i), name: nameOf(i + base) });
    else if (c.aud === "list-mobile") plan.push({ kind: "ok", phone: mob(i), name: nameOf(i + base), onList: true });
    else if (c.aud === "emp-id") plan.push({ kind: "ok", empId: i % 3 === 0 ? emp(i).toLowerCase() : emp(i), name: nameOf(i + base), onList: true });
    else if (c.aud === "emp-both") plan.push({ kind: "ok", phone: mob(i), empId: emp(i), name: nameOf(i + base), onList: true });
    else if (c.aud === "everyone-id") plan.push(i % 3 === 0 ? { kind: "ok", phone: mob(i), name: nameOf(i + base) } : { kind: "ok", empId: emp(i), name: nameOf(i + base), onList: true });
    else plan.push(i % 3 === 0 ? { kind: "ok", phone: mob(i), name: nameOf(i + base) } : { kind: "ok", phone: mob(i), empId: emp(i), name: nameOf(i + base), onList: true });
  }
  for (let i = 0; i < nBad; i++) {
    const j = nOK + i;
    if (c.aud === "open") plan.push({ kind: "ok", phone: mob(j), name: nameOf(j + base) });
    else if (c.aud === "list-mobile") plan.push({ kind: "waiting", phone: mob(j), name: nameOf(j + base) });
    else if (c.aud === "emp-id" || c.aud === "everyone-id") plan.push(i % 2 === 0 ? { kind: "waiting", empId: `EMP-9${pad(i, 4)}`, name: nameOf(j + base) } : (c.aud === "emp-id" ? { kind: "needid", phone: mob(j), name: nameOf(j + base) } : { kind: "ok", phone: mob(j), name: nameOf(j + base) }));
    else plan.push(i % 2 === 0 ? { kind: "waiting", phone: mob(j), empId: `EMP-8${pad(i, 4)}`, name: nameOf(j + base) } : (c.aud === "emp-both" ? { kind: "needid", phone: mob(j), name: nameOf(j + base) } : { kind: "ok", phone: mob(j), name: nameOf(j + base) }));
  }
  const onList = plan.filter((p) => p.onList).map((p) => ({ name: p.name, ...(p.phone ? { phone: p.phone } : {}), ...(p.empId ? { empId: p.empId } : {}), type: "employee" }));
  if (onList.length) { let added = 0, invalid = 0, st = 200; for (let k = 0; k < onList.length; k += 200) { r = await H.call("POST", `/api/z/${c.id}/people`, { people: onList.slice(k, k + 200), ...H.consent("K6") }, tok, ip); added += r.j.added || 0; invalid += (r.j.invalid || []).length; if (!r.ok) st = r.s; } check("the participant list was added", added === onList.length, JSON.stringify({ added, invalid, want: onList.length, s: st })); } // the console sends a big list in parts of 200
  // ---- everyone opens the link and joins at human pace over about a minute ----
  const players = []; const late = []; const waiters = []; const joinMs = [];
  const eidPath = `/api/z/${c.id}`;
  const stag = Math.min(150000, 40000 + c.people * 1100); // people arrive over a couple of minutes, as they do in a real game (the local test server is one disk-bound process)
  const isLate = (i) => c.events.includes("late") && i % 10 === 9;
  await Promise.all(plan.map(async (p, i) => {
    await sleep(Math.random() * stag);
    if (p.kind === "ok" && isLate(i)) { late.push({ p, i }); return; }
    const ph = new NodePhone(H, c.id, p, { light: i >= HEAVY, claim: p.kind === "ok" ? (c.claim === "none" ? "never" : c.events.includes("bogey") && i % 11 === 0 ? "bogey" : c.events.includes("slow") && i % 4 === 0 ? "never" : "always") : "never", react: c.events.includes("slow") && i % 4 === 1 ? [5000, 12000] : [900, 4500] });
    if (p.kind === "ok") {
      const t0 = Date.now(); await ph.open(); const ok = await ph.join(); joinMs.push(Date.now() - t0); ph.ok = ok; ph.plan = p; players.push(ph); if (ok) ph.go();
    } else { // not allowed in: the join must say why in a way the phone can act on
      try { const body = { ...(p.phone ? { phone: p.phone } : {}), ...(p.empId ? { empId: p.empId } : {}), name: p.name, device: `d${c.n}${i}`.padEnd(32, "0").slice(0, 32), ...H.consent("K4") }; const res = await fetch(BASE + eidPath + "/join", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": H.ips[i % H.ips.length] }, body: JSON.stringify(body) }); const j = await res.json().catch(() => ({})); waiters.push({ p, s: res.status, code: j.code }); } catch (e) { waiters.push({ p, s: 0, code: "net" }); }
    }
  }));
  const okJoined = players.filter((x) => x.ok).length;
  check(`all ${plan.filter((p) => p.kind === "ok" && !isLateP(p)).length} allowed people got a ticket`, okJoined === plan.filter((p, i) => p.kind === "ok" && !isLate(i)).length, `${okJoined} of ${plan.filter((p, i) => p.kind === "ok" && !isLate(i)).length}`);
  function isLateP() { return false; }
  const wantWait = waiters.filter((w) => w.p.kind === "waiting"), wantNeed = waiters.filter((w) => w.p.kind === "needid");
  check("people not on the list or with a wrong ID are held in the waiting room (403 waiting)", wantWait.every((w) => w.s === 403 && w.code === "waiting"), JSON.stringify(wantWait.filter((w) => !(w.s === 403 && w.code === "waiting")).slice(0, 2)));
  check("people who gave no employee ID are asked for it (400 need-id)", wantNeed.every((w) => w.s === 400 && w.code === "need-id"), JSON.stringify(wantNeed.filter((w) => !(w.s === 400 && w.code === "need-id")).slice(0, 2)));
  R.joined = okJoined; R.waiting = wantWait.length; R.needId = wantNeed.length; R.joinMedianMs = joinMs.sort((a, b) => a - b)[Math.floor(joinMs.length / 2)] ?? null;
  // ---- the game day ----
  const ref = () => players.find((x) => x.ok && !x.late) || players[0];
  const control = { token: tok, base: BASE, prefix: "/api/z" };
  const presses = []; let pressStop = false; let ended = false; let manualDone = false;
  if (c.mode === "host") {
    try { const k = await TBControl.ensureKey(c.id, control); if (!k.ok) R.notes.push("ensureKey " + JSON.stringify(k).slice(0, 80)); } catch (e) { R.notes.push("ensureKey error " + e.message); }
    (async () => {
      await sleep(Math.max(0, firstMs - 30000 - Date.now()));
      while (!pressStop && !ended) { try { const pr = await pub(c.id, control, "next"); if (pr.status === 200) presses.push(Date.now()); } catch { /* retry */ } await sleep(7000 + Math.random() * 7000); }
    })();
  } else if (c.events.includes("pause") || c.events.includes("end")) { try { await TBControl.ensureKey(c.id, control); } catch { /* the pause below reports it */ } }
  const maxMs = firstMs + (c.rounds > 1 ? 2.2 : 1) * (90 * c.speed * 1000 + (c.brand ? 90000 : 0)) + (c.mode === "host" ? 90 * 6000 : 0) + 240000;
  let paused = false, resumed = false, offlineDone = false, reloadDone = false, lateDone = false, endSent = false;
  const t00 = Date.now();
  while (Date.now() < maxMs) {
    await sleep(2000);
    const rv = ref(); if (!rv) break; const v = rv.view(); const n = v.log.length;
    if (++R.ticks % 30 === 0 && c.n % 8 === 1) console.log(`  [server] calls ${H.calls} failed ${H.fails} ${JSON.stringify(H.failKinds).slice(0, 300)}`);
    if (++R.ticks % 30 === 0) console.log(`  #${c.n} ${c.mode}/${c.aud} t+${Math.round((Date.now() - t00) / 1000)}s numbers ${n} winners ${(v.results || []).length} phase ${v.phase} lag ${lag}/${lagMax}ms queue max ${Math.round(queueStats.maxMs)}ms (${queueStats.over500} over 0.5 s) calls ${H.calls} failed ${H.fails}`);
    if (!lateDone && late.length && n >= 8) { lateDone = true; for (const { p, i } of late) { const ph = new NodePhone(H, c.id, p, { claim: "always" }); ph.late = true; await ph.open(); ph.ok = await ph.join(); players.push(ph); if (ph.ok) ph.go(); await sleep(150); } }
    if (!reloadDone && c.events.includes("reload") && n >= 10) { reloadDone = true; for (const ph of players.filter((x) => x.ok && !x.late).slice(0, 10)) { ph.stop(); await ph.reload(); ph.reloaded = true; ph.go(); } }
    if (!offlineDone && c.events.includes("offline") && n >= 12) { offlineDone = true; for (const ph of players.filter((x) => x.ok && !x.late).slice(10, 20)) ph.offlineUntil = Date.now() + 25000; R.notes.push("offline 25s on 10 phones at number " + n); }
    if (!paused && c.events.includes("pause") && n >= 8) { paused = true; try { const pr = await pub(c.id, control, "pause", { pauseForRounds: 600 }); check("organizer's Pause accepted", pr.status === 200, JSON.stringify(pr.data || pr).slice(0, 100)); R.pausedAtN = n; R.pausedAt = Date.now(); } catch (e) { check("organizer's Pause accepted", false, e.message); } }
    if (paused && !resumed && Date.now() - R.pausedAt > 45000) { resumed = true; try { const rr = await pub(c.id, control, "resume", {}); check("organizer's Resume accepted", rr.status === 200, JSON.stringify(rr.data || rr).slice(0, 100)); R.resumedAt = Date.now(); } catch (e) { check("organizer's Resume accepted", false, e.message); } }
    if (paused && !resumed && Date.now() - R.pausedAt > 30000) { const nn = ref().view().log.length; if (R.nAt30 === undefined) R.nAt30 = nn; }
    if (c.events.includes("end") && !endSent && n >= 15) { endSent = true; try { const er = await pub(c.id, control, "stop", {}); check("organizer's End accepted", er.status === 200, JSON.stringify(er.data || er).slice(0, 100)); R.endedAtN = n; } catch (e) { check("organizer's End accepted", false, e.message); } }
    if (v.phase === "ended") { ended = true; break; }
  }
  pressStop = true;
  const tEnd = Date.now(); // the other phones see the end a moment later; a phone that was offline needs a little longer to catch up: wait for every phone, up to 90 s, and record how long it took
  while (Date.now() - tEnd < 90000 && players.some((x) => x.ok && x.view().phase !== "ended")) await sleep(2000);
  R.catchUpSec = Math.round((Date.now() - tEnd) / 1000); await sleep(4000);
  { // winners are final on a phone once it has read the store's claims after the claim window of the last result: a phone that has just seen the end may need one more seat-list poll (up to 25 s). Wait up to 45 s for all phones to agree and record how long it took: a phone that never agrees is a real defect.
    const keyOf = (x) => JSON.stringify(x.view().results.map((q) => `${q.pattern}#${q.ordinal}@${q.idx}`).sort()); const t1 = Date.now();
    while (Date.now() - t1 < 45000 && new Set(players.filter((x) => x.ok).map(keyOf)).size > 1) await sleep(2000);
    R.winnersAgreeSec = Math.round((Date.now() - t1) / 1000); }
  // ---- checks ----
  const live = players.filter((x) => x.ok);
  const views = live.map((x) => ({ x, v: x.view() }));
  check("every phone that joined reached the end of the game", views.every(({ v }) => v.phase === "ended"), `${views.filter(({ v }) => v.phase !== "ended").length} still not ended of ${views.length}`);
  const full = views.filter(({ x }) => !x.late); const refLog = full[0]?.v.log.filter((q) => q > 0) ?? [];
  R.numbers = refLog.length;
  { const one = ({ v }) => v.log.filter((q) => q > 0), bad = full.filter((x) => { const m = one(x), k = Math.min(m.length, refLog.length); return JSON.stringify(m.slice(0, k)) !== JSON.stringify(refLog.slice(0, k)) || Math.abs(m.length - refLog.length) > 1; }); check("every phone shows the same numbers in the same order (a phone may stop one number earlier or later at the very end of the game)", bad.length === 0, `${bad.length} differ`); }
  check("no number repeats and all are between 1 and 90", new Set(refLog).size === refLog.length && refLog.every((q) => q >= 1 && q <= 90), refLog.join(",").slice(0, 80));
  const lateOK = views.filter(({ x }) => x.late).every(({ v }) => { const l = v.log.filter((q) => q > 0); return l.length > 0 && JSON.stringify(refLog.slice(refLog.length - l.length)) === JSON.stringify(l); });
  if (late.length) check("late joiners see only the numbers called after they joined, and they match", lateOK, "");
  const resKey = (v) => JSON.stringify((v.results || []).map((q) => `${q.pattern}#${q.ordinal}@${q.idx}`).sort());
  const refRes = full[0] ? resKey(full[0].v) : "[]";
  check("every phone shows the same winners", views.every(({ v }) => resKey(v) === refRes), `${views.filter(({ v }) => resKey(v) !== refRes).length} differ`);
  const storeRes = (await H.call("GET", `/api/z/${c.id}/results`, undefined, undefined, ip)).j; const sr = JSON.stringify((storeRes.results || []).map((q) => `${q.pattern}#${q.ordinal}@${q.idx}`).sort());
  check("the winners in the store equal the winners on the phones" + (c.rounds > 1 ? " (round 2 shown on the phone is inside the store list)" : ""), c.rounds > 1 ? JSON.parse(refRes).every((k) => JSON.parse(sr).includes(k)) : sr === refRes, `store ${sr.slice(0, 100)} phones ${refRes.slice(0, 100)}`);
  R.winners = (full[0]?.v.results || []).length;
  if (c.rounds === 1) { // the per-ticket audit: every player's own ticket, numbers, claims and results, one by one (and a log file per game)
    const simple = c.mode === "host" || c.brand || c.events.includes("pause") || c.events.includes("end");
    let hostRounds; if (simple) { try { const jj = await (await fetch(BASE + "/api/z/" + c.id + "/control")).json(); hostRounds = jj.messages.filter((m) => m.action === "next").sort((x, y) => x.seq - y.seq).map((m) => m.atBeaconRound); } catch { /* the audit then keeps the older host rule */ } }
    try { const au = auditGame({ tag: TAG, game: c.id, players, refLog, results: (full[0]?.v.results || []), speed: c.speed, startRound, cfgTickets: c.tickets, mode: simple ? "host" : "auto", hostRounds, breaks: c.brand ? (brandOf(c).breaks || []) : [] });
      for (const ch of au.checks) check("audit: " + ch.n, ch.ok, ch.d); R.audit = { players: au.players, tickets: au.tickets, claims: au.claims }; } catch (e) { check("audit ran", false, String(e && e.stack || e).slice(0, 200)); }
  }
  const byPrizes = !!full[0]?.v.endedByPrizes;
  if (c.claim === "none") { check("nobody claimed: all 90 numbers were called", refLog.length === 90, String(refLog.length)); check("nobody claimed: no prize was awarded and the game did not end by prizes", R.winners === 0 && !byPrizes, `${R.winners} ${byPrizes}`); }
  else if (c.events.includes("end")) { check("the organizer's End stopped the game before 90 numbers", refLog.length < 90 && refLog.length >= (R.endedAtN || 0), `${refLog.length} (ended at ${R.endedAtN})`); }
  else {
    const want = c.prizes.length;
    check(`the game ended because every prize was won (${want} prizes) or all 90 numbers were called`, (byPrizes && R.winners >= want - (c.ties === "share" ? 0 : 0)) || refLog.length === 90, `byPrizes ${byPrizes} winners ${R.winners} numbers ${refLog.length}`);
    check("when the last prize was won the numbers stopped (not called to 90)", !byPrizes || refLog.length < 90, `numbers ${refLog.length}`);
  }
  // cadence of the numbers on a phone that watched them all
  const tl = (full.find(({ x }) => !x.reloaded)?.x.timeline || []).filter((q) => q.n > 0); const gaps = []; for (let i = 1; i < tl.length; i++) if (tl[i].n === tl[i - 1].n + 1) gaps.push((tl[i].t - tl[i - 1].t) / 1000);
  if (c.mode === "auto" || c.mode.startsWith("auto")) { // how late did each number reach the phone, counted from the moment its random value was published (only games without breaks, pauses or late joiners have a plain schedule)
    if (!c.brand && !c.events.includes("pause") && !c.events.includes("offline") && c.rounds === 1) { // every phone, every number: how many reached the phone more than 4 s / 6 s after the moment the number was published (the unit of the six-sigma count)
      let dn = 0, l4 = 0, l6 = 0, own6 = 0; const byN = {}; const bd = []; for (let k = 0; k < 90; k++) { const rn = startRound + 40 + Math.round(k * (c.speed / 3)); const av = beaconAvail.get(rn); if (av) bd.push((av - roundMs(rn)) / 1000); } bd.sort((a, b) => a - b); if (bd.length) { R.beaconP50 = Math.round(bd[Math.floor(bd.length / 2)] * 10) / 10; R.beaconMax = Math.round(bd[bd.length - 1] * 10) / 10; R.beaconOver3 = bd.filter((x) => x > 3).length; R.beaconRounds = bd.length; } for (const { x } of full) { if (x.reloaded) continue; for (const q of x.timeline || []) { if (!(q.n > 0)) continue; const d = (q.t - roundMs(startRound + 40 + (q.n - 1) * (c.speed / 3))) / 1000; dn++; const rn2 = startRound + 40 + Math.round((q.n - 1) * (c.speed / 3)), av2 = beaconAvail.get(rn2), dOwn = av2 ? (q.t - Math.max(roundMs(rn2), av2)) / 1000 : d; if (dOwn > 6) own6++; if (d > 4) l4++; if (d > 6) { l6++; byN[q.n] = (byN[q.n] || 0) + 1; } } }
      R.deliveries = dn; R.late4 = l4; R.late6 = l6; R.late6ByN = byN; R.late6Own = own6;
    }
    if (!c.brand && !c.events.includes("pause") && c.rounds === 1) { const rtl = (full.find(({ x }) => !x.reloaded)?.x.timeline || []).filter((q) => q.n > 0); const dl = rtl.map((q) => (q.t - roundMs(startRound + 40 + (q.n - 1) * (c.speed / 3))) / 1000).sort((a, b) => a - b); if (dl.length) { R.delayP50 = Math.round(dl[Math.floor(dl.length * 0.5)] * 10) / 10; R.delayP95 = Math.round(dl[Math.floor(dl.length * 0.95)] * 10) / 10; R.delayMax = Math.round(dl[dl.length - 1] * 10) / 10; R.delays = dl.map((x) => Math.round(x * 10) / 10); check(`auto: every number reached the phone within 4 s of its time (p50 ${R.delayP50}, p95 ${R.delayP95}, max ${R.delayMax} s)`, R.delayMax <= 4, `max ${R.delayMax}`); } }
  }
  gaps.sort((a, b) => a - b); const med = gaps[Math.floor(gaps.length / 2)] ?? 0; R.medianGap = Math.round(med * 10) / 10; R.timelineRef = tl.map((q) => [Math.round(q.t / 100) / 10 % 100000, q.n]).slice(0, 120); R.fastestGap = gaps[0] ?? null;
  if (c.mode !== "host") {
    check(`auto: the median gap between numbers is ${c.speed} s (+-1): ${R.medianGap}`, Math.abs(med - c.speed) <= 1, JSON.stringify(gaps.slice(0, 5)));
    const fast = gaps.filter((g) => g < c.speed * 0.5).length; R.p5Gap = gaps[Math.floor(gaps.length * 0.05)] ?? null; R.p95Gap = gaps[Math.floor(gaps.length * 0.95)] ?? null;
    check("auto: no burst of numbers: no two numbers came less than half the set gap apart", fast === 0, `${fast} bursts, fastest ${gaps[0]}, 5th percentile ${R.p5Gap}, 95th ${R.p95Gap}`);
  } else {
    const ctlf = await (await fetch(`${BASE}/api/z/${c.id}/control`, { signal: AbortSignal.timeout(30000) }).catch(() => null))?.json().catch(() => null); const stored = ctlf && Array.isArray(ctlf.messages) ? ctlf.messages.filter((m) => m.action === "next").length : presses.length; R.presses = stored; R.pressesSeen = presses.length;
    check("manual: the numbers came only because the Host pressed Next (numbers <= presses stored on the server + 1)", refLog.length <= stored + 1 && (c.rounds > 1 || refLog.length >= Math.max(1, stored - 3)), `numbers ${refLog.length} presses stored ${stored} (seen by the test ${presses.length})`);
  }
  if (c.events.includes("pause")) check("during the 30 s after Pause no number came on the reference phone", R.nAt30 === undefined || R.nAt30 - (R.pausedAtN || 0) <= 5, `at pause ${R.pausedAtN}, at +30 s ${R.nAt30}`);
  check("no phone had an unhandled error", live.every((x) => x.errors.filter((e) => !/offline/.test(e)).length === 0), JSON.stringify(live.flatMap((x) => x.errors).filter((e) => !/offline/.test(e)).slice(0, 3)));
  R.players = live.length; R.endedAtMs = Date.now(); R.runMin = Math.round((Date.now() - t00) / 6000) / 10;
  R.id = c.id; R.pass = R.checks.every((q) => q.ok); for (const x of players) x.stop();
  return R;
}

// ---------------------------------------------------------------- run them in waves
setInterval(() => { H.call("POST", "/api/lifecycle/tick", undefined, "local-organizer-secret", "10.250.0.2").catch(() => {}); }, 15000); // the live site's scheduled job (every minute), imitated: reports, deletions, reminders
const todo = []; for (let n = FROM; n <= TO; n++) todo.push(caseOf(n));
console.log(`campaign ${TAG}: cases ${FROM}..${TO}, ${CONC} at a time, ${PEOPLE} people each, lead ${LEAD}s, ${BASE}`);
const results = []; let next = 0;
const worker = async () => { while (next < todo.length) { const c = todo[next++]; const t0 = Date.now(); try { const R = await Promise.race([runCase(c), new Promise((_, rej) => setTimeout(() => rej(new Error("case did not finish in time")), 75 * 60000))]); results.push(R); console.log(`${R.pass ? "PASS" : "FAIL"} #${c.n} ${c.mode} ${c.aud} t${c.tickets} ${c.events.join("+") || "-"} | numbers ${R.numbers} winners ${R.winners} players ${R.players} gap ${R.medianGap} | ${R.checks.filter((q) => !q.ok).length} failed of ${R.checks.length} | ${Math.round((Date.now() - t0) / 60000)} min`); } catch (e) { results.push({ n: c.n, id: c.id, pass: false, checks: [{ n: "case crashed", ok: false, d: String(e.stack || e).slice(0, 300) }] }); console.log(`CRASH #${c.n} ${e.message}`); } writeFileSync(`${DATA}/campaign-${TAG}.json`, JSON.stringify({ tag: TAG, results, h: { calls: H.calls, fails: H.fails, failKinds: H.failKinds }, beacon: beaconStats }, null, 1)); } };
await Promise.all(Array.from({ length: CONC }, () => worker()));
// ---- the end-of-game report e-mails (they go out a few minutes after each game ends) ----
for (const R of results.filter((x) => x.id && x.numbers !== undefined)) {
  try { const link = await waitForReport(BASE, R.id, 14); R.reportMail = !!link; R.checks.push({ n: "the end-of-game report e-mail was sent", ok: !!link, d: link ? `after ${link.waitedSec}s` : "none in 14 min" });
    if (link && link.k) { const rp = await checkReport(BASE, link, { numbers: R.numbers, callSeconds: R.speed, winners: R.winners }); for (const q of rp.checks) R.checks.push({ n: "report: " + q.n, ok: q.ok, d: q.d }); }
  } catch (e) { R.checks.push({ n: "report check", ok: false, d: e.message }); }
  if (R.paidVia) { try { const rows = q2("SELECT to_addr FROM outbox WHERE subject LIKE ? ", `%invoice%`).map((x) => String(x.to_addr).toLowerCase()); const orgM = `cmp${R.n}.${TAG}@sample-co.in`;
      R.checks.push({ n: "the invoice reached the payer", ok: rows.includes(R.payerMail.toLowerCase()), d: R.payerMail }); R.checks.push({ n: "the invoice reached the organizer", ok: rows.includes(orgM), d: orgM }); } catch (e) { R.checks.push({ n: "invoice mail check", ok: false, d: e.message }); } }
  R.pass = R.checks.every((q) => q.ok);
}
const lat = H.lat.slice().sort((a, b) => a - b); const pct = (q) => Math.round(lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] ?? 0);
const total = results.length, pass = results.filter((x) => x.pass).length, checksAll = results.flatMap((x) => x.checks || []);
const summary = { tag: TAG, cases: total, casesPassed: pass, checks: checksAll.length, checksFailed: checksAll.filter((q) => !q.ok).length, calls: H.calls, serverErrors: H.fails, failKinds: H.failKinds, latencyMs: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: Math.round(lat[lat.length - 1] ?? 0) }, beacon: beaconStats };
writeFileSync(`${DATA}/campaign-${TAG}.json`, JSON.stringify({ summary, results }, null, 1));
console.log("SUMMARY", JSON.stringify(summary));
for (const R of results.filter((x) => !x.pass)) console.log("FAILED CASE", R.n, R.mode, R.aud, R.events, JSON.stringify((R.checks || []).filter((q) => !q.ok).map((q) => q.n + " | " + q.d)).slice(0, 700));
process.exit(0);
