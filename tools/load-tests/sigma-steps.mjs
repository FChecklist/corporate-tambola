// Step-by-step six-sigma proof for the parts of Corporate Tambola that are decided by rules (no network): each step is checked against an INDEPENDENT oracle written here, millions of times.
// run: bun run tools/sigma-steps.mjs [trialsPerStep]   (writes data/sigma-steps.json)
import { writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { cleanPhone, normEmp } from "../tambola/apps/edge/src/people.ts";
import { perm10k } from "../tambola/apps/edge/src/checkin.ts";
import { validateCfg, HOUSE_ORDER, MAX_ROUNDS } from "../tambola/packages/beacon/src/config.ts";
import { maxWinnersFor } from "../tambola/packages/beacon/src/config.ts";
import { settleAll, claimInTime } from "../tambola/packages/beacon/src/game.ts";
import { roundTimeMs } from "../tambola/packages/beacon/src/index.ts";
import { defaultCfg } from "../tambola/packages/beacon/src/config.ts";
import { settingsOf } from "../tambola/apps/edge/src/gamerecord.ts";
import { ticketsFor, completionIndexKey } from "../tambola/packages/beacon/src/game.ts";
import { ticketCompletion } from "../tambola/packages/beacon/src/house-rules.ts";
import { deriveCalls } from "../tambola/packages/beacon/src/index.ts";
import { winnersOfHouse } from "../tambola/packages/beacon/src/game.ts";

function ticketProblems(t) {
  const p = [];
  if (!Array.isArray(t) || t.length !== 3 || t.some((r) => !Array.isArray(r) || r.length !== 9)) return ["not 3 rows of 9"];
  for (const r of t) if (r.filter((x) => x !== null && x !== undefined).length !== 5) p.push("a row does not hold exactly 5 numbers");
  const all = flat(t); if (all.length !== 15 || new Set(all).size !== 15) p.push("not 15 different numbers");
  for (let c = 0; c < 9; c++) {
    const lo = c === 0 ? 1 : c * 10, hi = c === 8 ? 90 : c * 10 + 9; let prev = 0;
    for (let r = 0; r < 3; r++) { const x = t[r][c]; if (x === null || x === undefined) continue; if (x < lo || x > hi) p.push(`column ${c + 1} has ${x} (allowed ${lo} to ${hi})`); if (x <= prev) p.push(`column ${c + 1} is not ascending`); prev = x; }
    if (t.every((r) => r[c] === null || r[c] === undefined)) p.push(`column ${c + 1} is empty`);
  }
  return p;
}


const N = Number(process.argv[2] || 1_000_000);
const out = {}; const t0 = Date.now();
const flat0 = 0;
const flat = (t) => t.flat().filter((x) => x !== null && x !== undefined);
let seed = Number(BigInt("0x" + randomBytes(6).toString("hex")) % 2147483647n) || 12345;
const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
const rint = (n) => Math.floor(rnd() * n);
const eidOf = () => "SIG" + randomBytes(5).toString("hex").toUpperCase();
const pid = (seat) => `${seat}x${randomBytes(6).toString("hex")}`;
const done = (name, trials, defects, note = "") => { out[name] = { trials, defects, dpmo: Math.round(defects / trials * 1e6 * 100) / 100, upper95PerMillion: Math.round((defects === 0 ? 3 : defects + 3) / trials * 1e6 * 100) / 100, note }; console.log(name, JSON.stringify(out[name])); };

// ---- Step 1: every ticket is a real ticket (3 x 9, 15 numbers, 5 per row, right column ranges, ascending)
{ let trials = 0, defects = 0; const games = Math.ceil(N / 20000);
  for (let g = 0; g < games; g++) { const eid = eidOf(); for (let s = 1; s <= 10000; s++) { const two = ticketsFor(eid, pid(s), 2); for (const t of two) { trials++; if (ticketProblems(t).length) defects++; } } }
  done("S1 ticket is well-formed", trials, defects, "tickets of 10,000 seats x 2 tickets per game"); }

// ---- Step 2: no two tickets of one game are the same (up to 10,000 players with 2 tickets each)
{ let trials = 0, defects = 0; const games = Math.max(3, Math.ceil(N / 20000));
  for (let g = 0; g < games; g++) { const eid = eidOf(); const seen = new Set(); for (let s = 1; s <= 10000; s++) { const two = ticketsFor(eid, pid(s), 2); for (const t of two) { trials++; const k = flat(t).join(","); if (seen.has(k)) defects++; seen.add(k); } } }
  done("S2 tickets of one game are all different", trials, defects, "every ticket compared with every earlier ticket of its game"); }

// ---- Step 3: the number draw: 90 different numbers 1..90, the same on every phone (same input, same answer)
{ let trials = 0, defects = 0; const games = Math.ceil(N / 90);
  for (let g = 0; g < games; g++) { const eid = eidOf(); const rr = Array.from({ length: 90 }, () => randomBytes(32).toString("hex")); const a = deriveCalls(eid, rr); const b = deriveCalls(eid, rr);
    const ok = a.length === 90 && new Set(a).size === 90 && a.every((x) => Number.isInteger(x) && x >= 1 && x <= 90);
    trials += 90; if (!ok) defects += 1; if (a.join() !== b.join()) defects += 1; }
  done("S3 number draw is 90 different numbers, same on every phone", trials, defects, "each number drawn counted once; a game with any fault counted as a defect"); }

// ---- Step 4: a ticket completes a house at exactly the right call (independent oracle works on the ticket grid, not on the engine's rules)
const grid = (t) => ({ r: t.map((row) => row.filter((v) => v !== null && v !== undefined)), all: flat(t) });
const firstAt = (nums, k, log) => { let hit = 0; const set = new Set(nums); for (let i = 0; i < log.length; i++) if (set.has(log[i]) && ++hit === k) return i; return -1; };
const oracle = (t, key, log) => { const { r, all } = grid(t); const [a, b, c] = r;
  switch (key) {
    case "early5": return firstAt(all, 5, log);
    case "early7": return firstAt(all, 7, log);
    case "top": return firstAt(a, 5, log); case "mid": return firstAt(b, 5, log); case "bot": return firstAt(c, 5, log);
    case "corners": return firstAt([a[0], a[4], c[0], c[4]], 4, log);
    case "star": return firstAt([a[0], a[4], c[0], c[4], b[2]], 5, log);
    case "full": return firstAt(all, 15, log);
    case "twolines": { const x = [firstAt(a, 5, log), firstAt(b, 5, log), firstAt(c, 5, log)].filter((v) => v >= 0).sort((p, q) => p - q); return x.length < 2 ? -1 : x[1]; }
    case "low5": { const p = all.filter((n) => n <= 30); return p.length < 5 ? -1 : firstAt(p, 5, log); }
    case "high5": { const p = all.filter((n) => n >= 61); return p.length < 5 ? -1 : firstAt(p, 5, log); }
    default: return NaN; } };
{ const KEYS = ["early5", "early7", "top", "mid", "bot", "corners", "star", "full", "twolines", "low5", "high5"]; let trials = 0, defects = 0; const eid = eidOf();
  const tix = Array.from({ length: 2000 }, (_, i) => ticketsFor(eid, pid(i + 1), 1)[0]);
  const perm = () => { const l = Array.from({ length: 90 }, (_, i) => i + 1); for (let i = 89; i > 0; i--) { const j = rint(i + 1); [l[i], l[j]] = [l[j], l[i]]; } return l; };
  while (trials < N) { const log = perm(); if (rnd() < 0.3) for (let i = 0; i < 90; i++) if (rnd() < 0.4) log[i] = 0; /* numbers a late joiner never saw */ const t = tix[rint(tix.length)];
    for (const key of KEYS) { trials++; if (ticketCompletion(t, key, log) !== oracle(t, key, log)) defects++; } }
  done("S4 house completed at exactly the right call", trials, defects, "11 houses on random tickets and random call orders (a third with hidden numbers)"); }

// ---- Step 5: two tickets: the best of the two, and the two-ticket house needs all 30
{ let trials = 0, defects = 0; const eid = eidOf(); const pool = Array.from({ length: 1000 }, (_, i) => ticketsFor(eid, pid(i + 1), 2));
  const perm = () => { const l = Array.from({ length: 90 }, (_, i) => i + 1); for (let i = 89; i > 0; i--) { const j = rint(i + 1); [l[i], l[j]] = [l[j], l[i]]; } return l; };
  while (trials < N) { const log = perm(); const two = pool[rint(pool.length)];
    for (const key of ["early5", "top", "corners", "full"]) { trials++; const o = two.map((t) => oracle(t, key, log)).filter((v) => v >= 0); const best = o.length ? Math.min(...o) : -1; if (completionIndexKey(two, key, log) !== best) defects++; }
    trials++; const all30 = new Set(two.flatMap(flat)); let want = -1, left = new Set(all30); for (let i = 0; i < 90; i++) if (left.delete(log[i]) && left.size === 0) { want = i; break; } if (completionIndexKey(two, "full2", log) !== want) defects++; }
  done("S5 best of two tickets; the two-ticket house", trials, defects, "random pairs of tickets and call orders"); }

// ---- Step 6: prize distribution: everyone who completed gets exactly one position, earliest call first, nobody is lost or doubled, the tie-break does not depend on input order and is the same every time
{ let trials = 0, defects = 0;
  while (trials < N) { const eid = eidOf(), key = ["early5", "top", "full", "corners"][rint(4)]; const mode = rnd() < 0.5 ? "share" : "next"; const groupsN = 1 + rint(4); const idxs = new Set(); while (idxs.size < groupsN) idxs.add(5 + rint(80)); let pidN = 0;
    const groups = [...idxs].sort((x, y) => x - y).map((i) => [i, Array.from({ length: 1 + rint(4) }, () => pid(++pidN))]);
    const rand = (i) => createHash("sha256").update(eid + i).digest("hex");
    const w1 = winnersOfHouse(eid, key, groups, mode, rand), w2 = winnersOfHouse(eid, key, groups.map(([i, p]) => [i, [...p].reverse()]), mode, rand), w3 = winnersOfHouse(eid, key, groups, mode, rand);
    const want = groups.flatMap(([, p]) => p).sort();
    for (const w of [w1]) { trials++; const got = w.flatMap((x) => x.pids).sort(); let bad = JSON.stringify(got) !== JSON.stringify(want); for (let i = 1; i < w.length; i++) if (w[i].idx < w[i - 1].idx) bad = true; if (mode === "share" && w.length !== groups.length) bad = true; if (mode === "next" && w.length !== want.length) bad = true; if (bad) defects++; }
    trials++; if (JSON.stringify(w1) !== JSON.stringify(w3)) defects++;
    trials++; if (JSON.stringify(w1.map((x) => [x.idx, [...x.pids].sort()])) !== JSON.stringify(w2.map((x) => [x.idx, [...x.pids].sort()]))) defects++; }
  done("S6 prize distribution (positions, order, tie-break)", trials, defects, "random sets of winners; same answer every time"); }


// ---- Step 7: a typed mobile number is read correctly (valid Indian numbers in every usual way of typing are accepted and normalised; wrong ones are refused)
{ let trials = 0, defects = 0; const digit = (a, b) => String(a + rint(b - a + 1));
  while (trials < N) { const ten = digit(6, 9) + Array.from({ length: 9 }, () => rint(10)).join(""); const f = rint(8);
    const typed = [ten, "+91" + ten, "+91 " + ten.slice(0, 5) + " " + ten.slice(5), "0" + ten, "91" + ten, ten.slice(0, 5) + "-" + ten.slice(5), "(" + ten.slice(0, 3) + ") " + ten.slice(3), "0091" + ten][f];
    trials++; const r = cleanPhone(typed); if (!(r.ok && r.digits === "91" + ten && r.last10 === ten)) defects++;
    const bad = [digit(1, 5) + Array.from({ length: 9 }, () => rint(10)).join(""), ten.slice(0, 9), "98765abcde", ten + "x", "", "   "][rint(6)]; trials++; if (cleanPhone(bad).ok) defects++; }
  done("S7 a typed mobile number is read correctly", trials, defects, "valid numbers typed 8 ways accepted and normalised; wrong numbers refused"); }

// ---- Step 8: the check-in code of each ticket is different for every ticket of a game (a 4-digit code for each of 10,000 seats)
{ let trials = 0, defects = 0; while (trials < N) { const key = randomBytes(32).toString("hex"); const seen = new Set(); for (let x = 0; x < 10000; x++) { trials++; const v = perm10k(key, x); if (!(v >= 0 && v < 10000) || seen.has(v)) defects++; seen.add(v); } }
  done("S8 check-in codes never repeat inside a game", trials, defects, "10,000 seats per key, many keys"); }

// ---- Step 9: employee IDs are read correctly
{ let trials = 0, defects = 0; const ch = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  while (trials < N) { const len = 1 + rint(12); const id = Array.from({ length: len }, () => ch[rint(ch.length)]).join(""); const typed = [id, id.toLowerCase(), " " + id + " ", id.split("").join(" ")][rint(4)];
    trials++; if (normEmp(typed) !== id) defects++;
    const badp = ["$" + id, id + "#", "a b!", "<" + id + ">", "é" + id][rint(5)]; trials++; if (normEmp(badp) !== null) defects++; }
  done("S9 an employee ID is read correctly", trials, defects, "IDs typed in small, capital and spaced letters accepted; symbols refused"); }

// ---- Step 11: the organizer's game settings are accepted when valid and refused when not (every house, ordinal, ticket count, tie rule, call mode, rounds value; checked against rules written here)
{ let trials = 0, defects = 0; const HOUSES = HOUSE_ORDER.filter((h) => h !== "full2");
  const pick = (a) => a[rint(a.length)];
  while (trials < N) {
    const good = rnd() < 0.7; const tickets = good ? pick([1, 2]) : pick([1, 2, 2, 1, 3, 0, "2", null]), ties = good ? pick(["share", "next"]) : pick(["share", "next", "next", "both", "", 5]), callMode = good ? pick(["auto", "host"]) : pick(["auto", "host", "host", "robot", 7]), rounds = good ? pick([1, 2, 3, MAX_ROUNDS]) : pick([1, 2, 3, MAX_ROUNDS, MAX_ROUNDS + 1, 0, -1, 1.5, "2"]);
    const rewards = []; const n = 1 + rint(4); let valid = true; const seen = new Set();
    for (let k = 0; k < n; k++) { const pattern = good ? HOUSES[(k * 3 + rint(2)) % HOUSES.length] : pick([...HOUSES, "bogus", "full2"]), scope = good ? "ticket" : pick(["ticket", "ticket", "two_ticket"]); const mx = HOUSES.includes(pattern) ? maxWinnersFor(scope === "two_ticket" ? "full2" : pattern) : 1; const ordinal = good ? 1 : pick([1, 1, 1, 2, 3, mx, mx + 1, 0, -1]); rewards.push({ pattern, scope, ordinal, text: "x" });
      const id = scope + ":" + pattern + "#" + ordinal; if (!HOUSES.includes(pattern) || (scope === "two_ticket" && (pattern !== "full" || tickets !== 2)) || !Number.isInteger(ordinal) || ordinal < 1 || ordinal > mx || seen.has(id)) valid = false; seen.add(id); }
    for (const r of rewards) if (r.ordinal > 1 && !rewards.some((x) => x.pattern === r.pattern && x.scope === r.scope && x.ordinal === r.ordinal - 1)) valid = false;
    const wantOk = valid && (tickets === 1 || tickets === 2) && (ties === "share" || ties === "next") && (callMode === "auto" || callMode === "host") && Number.isInteger(rounds) && rounds >= 1 && rounds <= MAX_ROUNDS;
    trials++; globalThis.__ok = (globalThis.__ok || 0) + (wantOk ? 1 : 0); let got; try { got = validateCfg({ tickets, ties, callMode, rounds, rewards }).ok; } catch { got = "threw"; } if (got !== wantOk) defects++; }
  done("S11 game settings: valid accepted, invalid refused", trials, defects, `(${globalThis.__ok} valid, rest invalid) random settings: tickets, tie rule, call mode, rounds, houses and winner positions`); }

// ---- Step 12: WHO WINS WHAT: the whole prize decision (completion, claim, deadline, wrong claims, tie rule, winner positions) against a plain re-statement of the rules written here
{ let trials = 0, defects = 0; const firstBad = []; const HOUSES6 = ["early5", "top", "mid", "bot", "corners", "full"];
  while (trials < N / 20) { // N / 20 whole games
    const eid = eidOf(), n = 5 + rint(40), pids = Array.from({ length: n }, (_, i) => pid(i + 1));
    const tix = new Map(pids.map((p) => [p, ticketsFor(eid, p, 1)])); const callRounds = Array.from({ length: 90 }, (_, k) => 1_000_000 + k * 3);
    const log = deriveCalls(eid, callRounds.map((r) => createHash("sha256").update("f" + eid + r).digest("hex")));
    const ties = rnd() < 0.5 ? "share" : "next"; const houses = HOUSES6.filter(() => rnd() < 0.6); if (!houses.length) houses.push("top");
    const rewards = []; for (const h of houses) { const k = 1 + rint(3); for (let o = 1; o <= k; o++) rewards.push({ pattern: h, scope: "ticket", ordinal: o, text: "" }); }
    const cfg = { ...defaultCfg(), ties, rewards };
    const claims = [];
    for (const p of pids) for (const h of houses) {
      const done = log.length ? completionIndexKey(tix.get(p), h, log) : -1; // the engine's own completion is checked in step 4; here it is the input of the claim rules
      if (done < 0) { if (rnd() < 0.05) claims.push({ pid: p, pattern: h, round: 1, idx: rint(90), atMs: roundTimeMs(callRounds[rint(90)]) + 500 }); continue; }
      const r = rnd(); const deadline = done + 1 < 90 ? roundTimeMs(callRounds[done + 1]) : null;
      if (r < 0.55) claims.push({ pid: p, pattern: h, round: 1, idx: done, atMs: (deadline ?? roundTimeMs(callRounds[done]) + 9000) - 500 - rint(8000) }); // in time
      else if (r < 0.7) claims.push({ pid: p, pattern: h, round: 1, idx: done, atMs: (deadline ?? roundTimeMs(callRounds[done]) + 9000) + 100 + rint(8000) }); // late
      else if (r < 0.75) claims.push({ pid: p, pattern: h, round: 1, idx: done + 1 + rint(3), atMs: roundTimeMs(callRounds[Math.min(89, done + 2)]) }); // wrong call
      if (rnd() < 0.05) { const t = roundTimeMs(callRounds[done]) + rint(5000); claims.push({ pid: p, pattern: h, round: 1, idx: done, atMs: t, bogey: true }); if (rnd() < 0.5) claims.push({ pid: p, pattern: h, round: 1, idx: done, atMs: t + 100, bogey: true }); }
    }
    // the rules, restated: eligible = the earliest real claim of the house is exactly at the completion call, arrived before the next call, and fewer than 2 wrong claims (Bogeys) before it
    const elig = new Map(); const doneOf = (p, h) => completionIndexKey(tix.get(p), h, log);
    for (const h of houses) { const l = []; for (const p of pids) { const mine = claims.filter((c) => c.pid === p && c.pattern === h); const real = mine.filter((c) => !c.bogey).sort((a, b) => a.atMs - b.atMs)[0]; if (!real) continue;
      const d = doneOf(p, h); if (d < 0 || real.idx !== d) continue; const nextR = d + 1 < 90 ? callRounds[d + 1] : null; if (nextR !== null && !(real.atMs < roundTimeMs(nextR))) continue;
      if (mine.filter((c) => c.bogey && c.atMs < real.atMs).length >= 2) continue; l.push({ p, idx: d }); } elig.set(h, l.sort((a, b) => a.idx - b.idx)); }
    const got = settleAll(eid, pids, log, cfg, 1, undefined, undefined, { claims, callRounds });
    trials++; let bad = false; globalThis.__pos = (globalThis.__pos || 0) + got.length; globalThis.__dec = (globalThis.__dec || 0) + pids.length * houses.length;
    for (const h of houses) {
      const L = elig.get(h), K = rewards.filter((r) => r.pattern === h).length, mineGot = got.filter((x) => x.pattern === h).sort((a, b) => a.ordinal - b.ordinal);
      if (ties === "share") { const groups = []; for (const e of L) { const g = groups[groups.length - 1]; if (g && g.idx === e.idx) g.pids.push(e.p); else groups.push({ idx: e.idx, pids: [e.p] }); }
        const want = groups.slice(0, K); if (mineGot.length !== want.length) bad = true; else want.forEach((w, i) => { if (mineGot[i].idx !== w.idx || [...mineGot[i].pids].sort().join() !== [...w.pids].sort().join()) bad = true; }); }
      else { const want = L.slice(0, K); if (mineGot.length !== want.length) bad = true; else want.forEach((w, i) => { if (mineGot[i].idx !== w.idx || mineGot[i].pids.length !== 1 || !L.some((e) => e.p === mineGot[i].pids[0] && e.idx === w.idx)) bad = true; });
        const gotSet = mineGot.flatMap((x) => x.pids); if (new Set(gotSet).size !== gotSet.length) bad = true; // nobody wins a house twice
        const lastIdx = want.length ? want[want.length - 1].idx : -1; const fullGroups = L.filter((e) => e.idx < lastIdx).map((e) => e.p); if (fullGroups.some((p) => !gotSet.includes(p))) bad = true; } // everyone before the last tie group got a position
    }
    if (bad) { defects++; if (firstBad.length < 2) firstBad.push({ eid, ties, houses: houses.join(), n }); } }
  done("S12 who wins what (completion + claim + deadline + wrong claims + tie rule + positions)", globalThis.__dec, defects, `an opportunity is one player-house decision; ${trials} whole games with up to 45 players and 6 houses (a game with any wrong decision counts as one defect), ${globalThis.__dec} player-house decisions, ${globalThis.__pos} winner positions awarded` + (firstBad.length ? " FIRST BAD: " + JSON.stringify(firstBad) : "")); }

// ---- Step 13: the permanent settings record of a game never holds a person (a name, mobile number, employee ID or e-mail planted anywhere outside the named setting fields never appears in it)
{ let trials = 0, defects = 0;
  while (trials < N) { const tag = randomBytes(5).toString("hex"); const planted = { name: "PN" + tag, phone: "9" + tag.replace(/\D/g, "7").padEnd(9, "1").slice(0, 9), emp: "EMP-" + tag, mail: tag + "@person.example" };
    const cfg = { ties: rnd() < 0.5 ? "share" : "next", rounds: 1 + rint(5), callMode: rnd() < 0.5 ? "host" : "auto", rewards: [{ pattern: "top", scope: "ticket", ordinal: 1, text: "Prize " + rint(99), phone: planted.phone, person: planted.name }],
      breaks: [{ after: 10, seconds: 60, kind: "speech", title: "Speech " + rint(99), mediaUrl: "https://x.example/" + planted.emp, host: planted.mail }], brand: { name: "Co " + rint(99), color: "#112233", logo: "data:image/png;base64," + planted.emp },
      people: [planted], guests: [planted.name, planted.phone], hostEmail: planted.mail, coHosts: [{ name: planted.name, phone: planted.phone }], organizer: { email: planted.mail, phone: planted.phone, name: planted.name }, contact: planted };
    const rec = JSON.stringify(settingsOf({ id: "G" + tag, start_round: 1 + rint(1e6), call_seconds: 9, cap: 10 + rint(1000), tickets: 1 + rint(2), pack: rint(2) ? 100 : 0, closed: rint(2), config: JSON.stringify(cfg), cancelled_ms: null }));
    trials++; for (const v of Object.values(planted)) if (rec.includes(v)) { defects++; break; } if (rec.includes("data:image")) defects++; }
  done("S13 the permanent settings record holds no person", trials, defects, "personal items planted in many places of the stored settings; none may reach the record"); }

out._meta = { trialsPerStep: N, seconds: Math.round((Date.now() - t0) / 1000), at: new Date().toISOString() };
writeFileSync("C:/ct/test-sites/data/sigma-steps.json", JSON.stringify(out, null, 1)); console.log("DONE", out._meta.seconds, "s");
