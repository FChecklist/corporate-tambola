// The per-ticket audit of one game: every player's own ticket(s), the numbers that player received and when, every claim, every result, checked one by one.
// Writes data/player-logs/<tag>/<game>.jsonl (one line per player) and returns the checks. Used by campaign.mjs and scale.mjs.
import { mkdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { ZG, roundMs } from "./nodephone.mjs";

const DB = "C:/ct/test-sites/data/tambola-test.sqlite";
const q = (sql, ...a) => { const db = new DatabaseSync(DB, { readOnly: true }); try { return db.prepare(sql).all(...a); } finally { db.close(); } };
const flat = (t) => t.flat().filter((x) => x !== null && x !== undefined);

/** A tambola ticket: 3 rows x 9 columns, 5 numbers in every row, 15 different numbers, column c holds numbers from c*10+1 (column 1: 1..9) to c*10+10 (the last column 80..90), ascending down the column. */
export function ticketProblems(t) {
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

export function auditGame({ tag, game, players, refLog, results, speed, startRound, cfgTickets, mode, hostRounds, breaks }) {
  const checks = [], push = (n, ok, d = "") => checks.push({ n, ok: !!ok, d: String(d).slice(0, 240) });
  const live = players.filter((x) => x.ok);
  const recs = live.map((ph) => {
    const v = ph.view(), tickets = v.tickets || [];
    return { ph, v, tickets, key: tickets.map((t) => flat(t).join(",")).join("|"), seat: Number(String(v.pid || "").split("x")[0]) };
  });
  // ---- every ticket is a real ticket, and every player has the number of tickets the organizer chose
  const bad = recs.filter((r) => r.tickets.length !== cfgTickets || r.tickets.some((t) => ticketProblems(t).length));
  push(`all ${recs.length} players hold ${cfgTickets} well-formed ticket(s) each (3 x 9, 15 numbers, 5 per row, right column ranges)`, bad.length === 0, bad.slice(0, 2).map((r) => `${r.v.pid}: ${r.tickets.length} tickets ${r.tickets.flatMap(ticketProblems).slice(0, 2).join("; ")}`).join(" | "));
  // ---- every ticket is different from every other ticket of the game
  const seen = new Map(); let dup = 0; for (const r of recs) { for (const t of r.tickets) { const k = flat(t).join(","); if (seen.has(k) && seen.get(k) !== r.v.pid) dup++; seen.set(k, r.v.pid); } }
  push(`all ${recs.reduce((a, r) => a + r.tickets.length, 0)} tickets of the game are different from each other`, dup === 0, `${dup} repeated`);
  const keys = new Set(recs.map((r) => r.key)); push("no two players hold the same set of tickets", keys.size === recs.length, `${recs.length - keys.size} players share a set`);
  // ---- every player received every number, in the same order, and the first-to-last timing of the numbers on their phone is sane
  const ref = refLog.join(",");
  const full = recs.filter((r) => !r.ph.late);
  // a phone may stop one number before or after the others at the very end, when the last prize ends the game: the numbers must still agree up to the shorter list, and no phone may be more than one number apart
  const mine = (r) => r.v.log.filter((n) => n > 0);
  const wrong = full.filter((r) => { const m = mine(r), k = Math.min(m.length, refLog.length); return m.slice(0, k).join(",") !== refLog.slice(0, k).join(",") || Math.abs(m.length - refLog.length) > 1; });
  const tail = full.filter((r) => mine(r).length !== refLog.length).length;
  push(`every one of ${full.length} players received the same ${refLog.length} numbers in the same order`, wrong.length === 0, `${wrong.length} differ: ${wrong.slice(0, 3).map((r) => r.v.pid).join(", ")} (${tail} phones stopped one number earlier or later at the very end of the game)`);
  // ---- every claim a player made was true on their ticket, and every claim is on the server
  const claimRows = q("SELECT pid, pattern, idx, at_ms FROM claim WHERE eid=? ORDER BY idx, at_ms", game);
  const claimsOf = new Map(); for (const c of claimRows) { if (!claimsOf.has(c.pid)) claimsOf.set(c.pid, []); claimsOf.get(c.pid).push(c); }
  let falseClaims = 0, checkedClaims = 0;
  const seenLog = (r) => { const seen = new Set(r.v.log.filter((n) => n > 0)); return refLog.map((n) => (seen.has(n) ? n : 0)); }; // calls a late joiner never saw count as not marked
  const truth = (tickets, key, log = refLog) => { try { return ZG.completionIndexKey(tickets, key, log); } catch { return -2; } };
  const falseList = []; let beyondLog = 0;
  for (const r of recs) for (const c of claimsOf.get(r.v.pid) || []) { checkedClaims++; if (c.idx >= refLog.length) { beyondLog++; continue; } /* a game that ended by prizes keeps its numbers only up to the last prize plus one call: a claim for a later call cannot be re-checked */ const tr = truth(r.tickets, c.pattern, r.ph.late ? seenLog(r) : refLog); /* a late joiner marks only the numbers called after joining */ if (tr !== c.idx) { falseClaims++; falseList.push(`${r.v.pid} ${c.pattern} claimed call ${c.idx}, ticket completes it at call ${tr}; marks ${r.v.marks ? r.v.marks.length : "?"}`); } }
  push(`all ${checkedClaims - beyondLog} claims on the server are true on the claimer's own ticket(s) at the call claimed (${beyondLog} after the recorded numbers not re-checkable)`, falseClaims === 0, `${falseClaims} false claims got through: ${falseList.slice(0, 3).join(" | ")}`);
  // ---- the prizes: every winner really completed the house at that call, claimed in time, and nobody with an earlier valid in-time claim was passed over
  // automatic games: the clock schedule; Host games: the beacon round each press named (the Host's own signed 'next' messages), so claim windows can be judged exactly
  const callMs = (k) => (hostRounds ? (hostRounds[k] !== undefined ? roundMs(hostRounds[k]) : Infinity) : roundMs(breaks && breaks.length ? 40 + ZG.unshiftedRound(startRound, speed / 3, breaks, 1, k) : startRound + 40 + k * (speed / 3)));
  const seatPid = new Map(recs.map((r) => [r.seat, r.v.pid])); // the winners are read from the server's own winners record (seat numbers), then matched to the players
  const win = q("SELECT pattern, ordinal, idx, seat FROM winner WHERE eid=? AND round=1 ORDER BY pattern, ordinal", game).reduce((acc, w) => { let x = acc.find((y) => y.pattern === w.pattern && y.ordinal === w.ordinal); if (!x) acc.push((x = { pattern: w.pattern, ordinal: w.ordinal, idx: w.idx, pids: [] })); const pid = seatPid.get(Number(w.seat)); if (pid) x.pids.push(pid); return acc; }, []);
  let notDone = 0, notInTime = 0, passed = 0, order = 0; const passedList = [];
  const byPid = new Map(recs.map((r) => [r.v.pid, r]));
  for (const w of win) {
    for (const pid of w.pids) {
      const r = byPid.get(pid); if (!r) continue;
      if (truth(r.tickets, w.pattern) !== w.idx) notDone++;
      const cl = (claimsOf.get(pid) || []).find((c) => c.pattern === w.pattern && c.idx === w.idx);
      if (!cl) notInTime++; else if ((mode !== "host" || hostRounds) && cl.at_ms >= callMs(w.idx + 1)) notInTime++;
    }
    const earlier = claimRows.filter((c) => c.pattern === w.pattern && c.idx < w.idx && !w.pids.includes(c.pid) && ((mode === "host" && !hostRounds) || c.at_ms < callMs(c.idx + 1)));
    const taken = new Set(win.filter((x) => x.pattern === w.pattern && x.ordinal < w.ordinal).flatMap((x) => x.pids));
    { const hit = earlier.filter((c) => !taken.has(c.pid) && byPid.has(c.pid) && truth(byPid.get(c.pid).tickets, c.pattern) === c.idx); passed += hit.length; for (const c of hit) passedList.push(`${c.pattern}#${w.ordinal} claim call ${c.idx} at ${c.at_ms - callMs(c.idx + 1)} ms vs the deadline (negative = before it) winner call ${w.idx}`); }
  }
  for (const pat of new Set(win.map((x) => x.pattern))) { const l = win.filter((x) => x.pattern === pat).sort((a, b) => a.ordinal - b.ordinal); for (let i = 1; i < l.length; i++) if (l[i].idx < l[i - 1].idx) order++; }
  push(`all ${win.length} prize positions: each winner completed the house at the call stated`, notDone === 0, `${notDone} winners did not`);
  push("every winner's claim reached the server before the next number", notInTime === 0, `${notInTime} late or missing`);
  push("no earlier valid in-time claim was passed over (prize distribution follows the claims)", passed === 0, `${passed} passed over${passedList.length ? ": " + passedList.slice(0, 3).join(" | ") : ""}`);
  push("prize positions of a house are given in order of completion", order === 0, `${order} out of order`);
  // ---- the report of every player
  const recsOut = recs.map((r) => ({
    game, seat: r.seat, pid: r.v.pid, late: !!r.ph.late, reloaded: !!r.ph.reloaded, checkedIn: !!r.ph.present,
    ticketHash: createHash("sha256").update(r.key).digest("hex").slice(0, 12), tickets: r.tickets.map(flat),
    numbersReceived: r.v.log.filter((n) => n > 0).length, firstNumberAt: (r.ph.timeline[0] || {}).t || null, lastNumberAt: (r.ph.timeline[r.ph.timeline.length - 1] || {}).t || null,
    gapsMedian: (() => { const g = []; for (let i = 1; i < r.ph.timeline.length; i++) if (r.ph.timeline[i].n === r.ph.timeline[i - 1].n + 1) g.push((r.ph.timeline[i].t - r.ph.timeline[i - 1].t) / 1000); g.sort((a, b) => a - b); return g.length ? g[Math.floor(g.length / 2)] : null; })(),
    claims: (claimsOf.get(r.v.pid) || []).map((c) => ({ house: c.pattern, call: c.idx, at: c.at_ms })), wins: win.filter((w) => w.pids.includes(r.v.pid)).map((w) => `${w.pattern}#${w.ordinal}@${w.idx}`),
    phoneErrors: r.ph.errors.filter((e) => !/offline/.test(e)).length,
    // every number that reached this phone more than 4 s after its scheduled moment: [call number, seconds late] (only meaningful in automatic games without breaks or pauses)
    lateNumbers: mode === "host" ? [] : r.ph.timeline.filter((q) => q.n > 0).map((q) => [q.n, Math.round((q.t - callMs(q.n - 1)) / 100) / 10]).filter((x) => x[1] > 4),
    ticketNumbersMarked: r.v.marks ? r.v.marks.length : null,
  }));
  try { mkdirSync(`C:/ct/test-sites/data/player-logs/${tag}`, { recursive: true }); writeFileSync(`C:/ct/test-sites/data/player-logs/${tag}/${game}.numbers.json`, JSON.stringify(refLog)); writeFileSync(`C:/ct/test-sites/data/player-logs/${tag}/${game}.jsonl`, recsOut.map((x) => JSON.stringify(x)).join("\n") + "\n"); } catch { /* the report is best effort */ }
  return { checks, players: recs.length, tickets: recs.reduce((a, r) => a + r.tickets.length, 0), claims: checkedClaims };
}
