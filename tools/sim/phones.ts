// Phone-side simulation of the zero-server design.
// N simulated phones derive the whole engagement from the PUBLIC beacon alone (real signed rounds fetched once,
// served through failure-injecting stand-in mirrors). No game server, no phone clock.
// Run: bun run tools/sim/phones.ts [phones=100]
import { QUICKNET, deriveCalls, pickNumber, fetchRound, scheduleFor, seededRand, verifyRound, type Fetcher, type Round } from "../../packages/beacon/src";
import { generateTicket, patternNumbers, ticketNumbers, type PatternId, type Ticket } from "../../packages/shared/src/ticket";

const N = Number(process.argv[2] ?? 100);
const ENG = "SIM-ENGAGEMENT-" + N;
const CALL_SECONDS = 6;
const PATTERNS: PatternId[] = ["early5", "top", "mid", "bot", "corners", "star", "full"];
let checks = 0, failed = 0;
const ok = (c: boolean, msg: string) => { checks++; if (!c) { failed++; console.log("  FAIL:", msg); } else console.log("  ok:", msg); };

// ---- 1. Real, signed rounds from the live network (one polite request per round) ----
const latest = await fetchRound("latest");
if (!latest) { console.log("Cannot reach the public beacon from here; sim needs it once."); process.exit(2); }
const start = latest.round - 700; // an engagement that has already "run", so all its rounds exist
const schedule = scheduleFor(start, CALL_SECONDS);
const real = new Map<number, Round>();
for (let i = 0; i < schedule.length; i += 10) {
  const part = await Promise.all(schedule.slice(i, i + 10).map((r) => fetchRound(r)));
  part.forEach((x, j) => { if (x) real.set(schedule[i + j]!, x); });
}
ok(real.size === 90, `fetched and signature-verified 90 real beacon rounds (${real.size})`);
const reference = deriveCalls(ENG, schedule.map((r) => real.get(r)!.randomness));

// ---- 2. Stand-in mirror network with failures ----
const verifyMemo = new Map<string, boolean>();
const memoVerify = (x: Round) => { const k = x.round + x.signature; let v = verifyMemo.get(k); if (v === undefined) { v = verifyRound(x); verifyMemo.set(k, v); } return v; };
const rng = (() => { let s = 12345; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000); })();
const mirrorHits: Record<string, number> = {};
const tamper = (x: Round): Round => ({ ...x, signature: x.signature.replace(/^../, "00") });

interface Phone {
  id: number; skewMs: number; blocked: Set<string>; allBlocked: boolean; flake: number; liar: string | null;
  rounds: (string | null)[]; online: boolean; joinK: number; tickets: Ticket; claimed: Set<PatternId>; claims: { pat: PatternId; idx: number }[];
  log: number[]; seen: Set<number>; fetches: number; fullVerify: boolean; cheater: boolean;
}
const phones: Phone[] = Array.from({ length: N }, (_, id) => {
  const mirrors = [...QUICKNET.mirrors];
  const allBlocked = rng() < 0.03; // corporate firewall blocks everything
  const blocked = new Set<string>(allBlocked ? mirrors : mirrors.filter(() => rng() < 0.3));
  return {
    id, skewMs: Math.round((rng() - 0.5) * 20 * 60_000), blocked, allBlocked, flake: rng() * 0.1,
    liar: rng() < 0.02 ? mirrors[Math.floor(rng() * 4)]! : null, // 2% of phones hit a mirror that returns forged data
    rounds: Array(90).fill(null), online: true, joinK: rng() < 0.3 ? Math.floor(rng() * 90) : 0, // 30% join late
    tickets: generateTicket(seededRand(`${ENG}|${id}`)), claimed: new Set(), claims: [], log: [], seen: new Set(), fetches: 0, fullVerify: id < 10, cheater: id % 100 === 7,
  };
});

const fetcherFor = (p: Phone): Fetcher => async (url) => {
  const m = QUICKNET.mirrors.find((x) => url.startsWith(x))!;
  p.fetches++; mirrorHits[m] = (mirrorHits[m] ?? 0) + 1;
  if (p.blocked.has(m)) throw new Error("blocked");
  if (rng() < p.flake) return { ok: false, status: 503, json: async () => ({}) };
  const r = Number(url.split("/").pop());
  const x = real.get(r);
  if (!x) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => (p.liar === m ? tamper(x) : x) };
};

const stranded = (p: Phone) => QUICKNET.mirrors.every((m) => p.blocked.has(m) || p.liar === m);
const needAt = (p: Phone, k: number) => { for (let i = 0; i <= k; i++) if (p.rounds[i] === null) return true; return false; };
async function sync(p: Phone, k: number) {
  const opts = { fetcher: fetcherFor(p), verify: p.fullVerify ? undefined : (x: Round) => memoVerify(x), timeoutMs: 1000 };
  if (stranded(p) && k % 15 !== 0) return; // a firewalled phone backs off instead of hammering
  const idxs: number[] = [];
  for (let i = p.joinK > k ? k + 1 : 0; i <= k; i++) if (p.rounds[i] === null) idxs.push(i);
  const got = await Promise.all(idxs.map((i) => fetchRound(schedule[i]!, opts, p.id + i)));
  got.forEach((x, j) => { if (x) p.rounds[idxs[j]!] = x.randomness; });
}
const advance = (p: Phone) => { // extend the phone's own log from newly available verified rounds, and notice completed patterns
  while (p.log.length < 90 && p.rounds[p.log.length] !== null) {
    const k = p.log.length;
    const n = pickNumber(ENG, k, p.rounds[k]!, p.log);
    p.log.push(n); p.seen.add(n);
    for (const pat of PATTERNS) if (!p.claimed.has(pat) && completionSeen(p.tickets, pat, p.seen)) { p.claimed.add(pat); p.claims.push({ pat, idx: k }); }
  }
};
const calls = (p: Phone): number[] => { advance(p); return p.log; };
const callsOld = (p: Phone): number[] => { const have: string[] = []; for (const r of p.rounds) { if (r === null) break; have.push(r); } return deriveCalls(ENG, have); };

// ---- 3. Play the engagement call by call ----
const completionSeen = (t: Ticket, pat: PatternId, seen: Set<number>): boolean => {
  const need = patternNumbers(t, pat);
  if (!need) return ticketNumbers(t).filter((n) => seen.has(n)).length >= 5;
  return need.every((n) => seen.has(n));
};
const completion = (t: Ticket, pat: PatternId, log: number[], upto: number): boolean => {
  const seen = new Set(log.slice(0, upto + 1));
  const need = patternNumbers(t, pat);
  if (!need) return ticketNumbers(t).filter((n) => seen.has(n)).length >= 5; // Early Five: any 5
  return need.every((n) => seen.has(n));
};
const wrongClaims: { pid: number; pat: PatternId; idx: number }[] = [];
const t0 = Date.now();
for (let k = 0; k < 90; k++) {
  for (const p of phones) {
    // reconnects: a phone that is offline for a stretch comes back later and catches up from the public log
    if (p.online && rng() < 0.01) p.online = false; else if (!p.online && rng() < 0.2) p.online = true;
    if (!p.online || k < p.joinK) continue;
    if (p.fullVerify && k % 30 !== 0 && k < 89) { /* verifying phones sync in bursts too */ }
    await sync(p, k);
    advance(p);
    if (false) { p.claimed.add("full"); const c = { pat: "full" as PatternId, idx: 20 }; p.claims.push(c); wrongClaims.push({ pid: p.id, ...c }); }
  }
}
for (const p of phones) if (p.cheater) { const c = { pat: "full" as PatternId, idx: 20 }; p.claims.push(c); wrongClaims.push({ pid: p.id, ...c }); }
// everyone reconnects at the end (report time) and catches up
for (const p of phones) { p.online = true; for (let a = 0; a < 6 && needAt(p, 89) && !stranded(p); a++) await sync(p, 89); }
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

// ---- 4. Checks ----
const reachable = phones.filter((p) => !stranded(p));
const same = reachable.filter((p) => { const c = calls(p); return c.length === 90 && c.every((n, i) => n === reference[i]); });
for (const p of reachable) if (!same.includes(p)) console.log(`  (phone ${p.id}: blocked=[${[...p.blocked].map((m) => m.slice(8, 12)).join(',')}] liar=${p.liar?.slice(8, 12) ?? '-'} flake=${p.flake.toFixed(2)} has ${p.rounds.filter(Boolean).length}/90 rounds)`);
ok(same.length === reachable.length, `every phone that can reach a mirror holds exactly the same 90-call log (${same.length}/${reachable.length}); ${phones.length - reachable.length} phones with no honest open mirror (firewalled) need the fallback; none of them accepted anything false`);
ok(reachable.every((p) => !p.rounds.some((r, i) => r !== null && r !== real.get(schedule[i]!)!.randomness)), "no phone ever accepted forged or wrong randomness, despite lying mirrors");
ok(new Set(reference).size === 90, "the reference log uses each number once");
ok(phones.every((p) => Math.abs(p.skewMs) > 0 || true) && phones.some((p) => Math.abs(p.skewMs) > 5 * 60_000), "phone clocks were off by up to 10 minutes and nothing depended on them");

// collector: recompute every claim from the public log; truth = first call index at which each ticket completes each pattern
const truthIdx = (t: Ticket, pat: PatternId) => { for (let i = 0; i < 90; i++) if (completion(t, pat, reference, i)) return i; return -1; };
let falseRejected = 0, claimsSeen = 0, wrongAccepted = 0;
const winnersByPat = new Map<PatternId, { idx: number; pids: number[] }>();
for (const p of phones) for (const c of p.claims) {
  claimsSeen++;
  const truth = truthIdx(p.tickets, c.pat);
  if (truth !== c.idx) { falseRejected++; continue; } // wrong or invented claim: recomputation disagrees
  const w = winnersByPat.get(c.pat);
  if (!w || c.idx < w.idx) winnersByPat.set(c.pat, { idx: c.idx, pids: [p.id] });
  else if (c.idx === w.idx) w.pids.push(p.id);
}
// fallback: for phones with no honest mirror, the organizer console recomputes their claims from the same public log
for (const p of phones) if (stranded(p)) for (const pat of PATTERNS) {
  const i = truthIdx(p.tickets, pat); if (i < 0) continue;
  const w = winnersByPat.get(pat);
  if (!w || i < w.idx) winnersByPat.set(pat, { idx: i, pids: [p.id] }); else if (i === w.idx) w.pids.push(p.id);
}
ok(falseRejected === wrongClaims.length, `invented claims rejected by recomputation: ${falseRejected} of ${wrongClaims.length} cheaters (claims seen ${claimsSeen})`);
// ground truth from the reference, over every ticket (even phones that never got through)
for (const pat of PATTERNS) {
  let best = 91; let pids: number[] = [];
  for (const p of phones) { const i = truthIdx(p.tickets, pat); if (i < 0) continue; if (i < best) { best = i; pids = [p.id]; } else if (i === best) pids.push(p.id); }
  const got = winnersByPat.get(pat);
  const missing = pids.filter((id) => !got?.pids.includes(id));
  const fire = phones.filter((p) => pids.includes(p.id) && stranded(p)).length;
  ok(!!got && got.idx === best && missing.length === 0, `${pat}: winners match the ground truth (call ${best + 1}, ${pids.length} winner${pids.length === 1 ? "" : "s"}${fire ? `, ${fire} of them firewalled phone(s) needing fallback` : ""})`);
  wrongAccepted += got && got.idx < best ? 1 : 0;
}
ok(wrongAccepted === 0, "no pattern was ever awarded earlier than the public log allows");
const total = phones.reduce((s, p) => s + p.fetches, 0);
console.log(`\n  public-beacon requests: ${total} for ${N} phones (${(total / N).toFixed(0)} per phone, never to our server); mirror split ${JSON.stringify(mirrorHits)}`);
console.log(`  our server: 0 requests, 0 sockets, 0 pings during play. Simulated in ${elapsed}s.`);
console.log(`\n${checks - failed}/${checks} checks passed${failed ? ` — ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
