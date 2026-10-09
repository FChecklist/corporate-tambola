// The phone-side game: everything a phone (or the organizer's console) needs to play and to check an engagement
// from the public beacon alone. Pure and deterministic: no server, no phone clock.
import { generateTicket, ticketNumbers, type PatternId, type Ticket } from "../../shared/src/ticket";
import { INTERMISSION_ROUNDS, PATTERN_ORDER, breakShift, keyOfLine, defaultCfg, keysInPlay, linesFor, roundEid, type BreakCfg, type EngagementCfg, type PatternKey } from "./config";
import type { ControlState } from "./control";
import { ticketCompletion, ticketStillNeeds } from "./house-rules";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { positionOf, seatOfPid, ticketAt } from "./unique-ticket";
import { NUMBERS, fetchRound, pickNumber, seededRand, verifyRound, type BeaconOpts, type Round } from "./index";

export const ALL_PATTERNS: readonly PatternId[] = PATTERN_ORDER;

/** The same ticket on every device for (engagement, participant). The first ticket keeps its original seed so existing links never change. */
export const ticketFor = (engagementId: string, pid: string): Ticket => {
  const seat = seatOfPid(pid); // an id issued with a seat number gets a ticket from the collision-free list: no other ticket of the round can match it
  return seat ? ticketAt(engagementId, positionOf(seat, 0)) : generateTicket(seededRand(`${engagementId}|${pid}`));
};
/** One or two tickets per participant; the second is always different from the first. */
export function ticketsFor(engagementId: string, pid: string, n: 1 | 2 = 1): Ticket[] {
  const a = ticketFor(engagementId, pid);
  if (n === 1) return [a];
  const seat = seatOfPid(pid);
  if (seat) return [a, ticketAt(engagementId, positionOf(seat, 1))]; // the second ticket is the next position: different from every other ticket too
  for (let i = 2; i < 40; i++) { const b = generateTicket(seededRand(`${engagementId}|${pid}|${i}`)); if (JSON.stringify(b) !== JSON.stringify(a)) return [a, b]; }
  throw new Error("Could not make a second ticket.");
}

/** Index (0-based call number) at which the ticket first completes the house, or -1 if it never does within `log`. (Unlucky is not decided on one ticket: always -1.) */
export function completionIndex(t: Ticket, pat: PatternKey, log: readonly number[]): number {
  return ticketCompletion(t, pat, log);
}

/** Earliest completion of a house by a participant's tickets: the best of their tickets, or all 30 numbers across two tickets for the two-ticket house. */
export function completionIndexKey(tickets: readonly Ticket[], key: PatternKey, log: readonly number[]): number {
  if (key === "full2") {
    if (tickets.length < 2) return -1;
    const left = new Set(tickets.flatMap(ticketNumbers));
    for (let i = 0; i < log.length; i++) if (left.delete(log[i]!) && left.size === 0) return i;
    return -1;
  }
  let best = -1;
  for (const t of tickets) { const i = completionIndex(t, key, log); if (i >= 0 && (best < 0 || i < best)) best = i; }
  return best;
}

export interface Settled { pattern: PatternKey; ordinal: number; idx: number; pids: string[]; round: number }

/**
 * The organizer console's settlement: from the public log, the participant list and the engagement's own settings alone, who completed each house first.
 * Claims are not needed to decide this (a phone with no network still gets its reward), they only cross-check it.
 * Ties share the reward. The 1st reward of a house goes to whoever completes it at the earliest call; the 2nd to whoever completes it at the next
 * distinct call; and so on.
 */
export function settleAll(engagementId: string, pids: readonly string[], log: readonly number[], cfg: EngagementCfg = defaultCfg(), round = 1, late?: { countFrom: ReadonlyMap<string, number>; callRounds: readonly number[] }, un?: UnluckyOpts): Settled[] {
  const eid = roundEid(engagementId, round);
  const inPlay = keysInPlay(cfg.rewards);
  const wantUnlucky = inPlay.includes("unlucky");
  const keys = inPlay.filter((k) => k !== "unlucky");
  const loop: PatternKey[] = wantUnlucky && !keys.includes("full") ? [...keys, "full"] : keys; // Unlucky needs the first Full House even when Full House is not a prize
  const best = new Map<PatternKey, Map<number, string[]>>(loop.map((k) => [k, new Map()]));
  const marked = new Map<string, Ticket[]>(), cfOf = new Map<string, number>(), minePid = new Map<string, readonly number[]>();
  for (const pid of pids) {
    const tk = ticketsFor(eid, pid, cfg.tickets);
    // someone who joined late counts only the numbers called from their `countFrom` beacon round on; earlier calls become 0 (a number no ticket has), so call indexes stay global
    const cf = late?.countFrom.get(pid) ?? 0;
    const mine = cf > 0 && late ? log.map((n, k) => ((late.callRounds[k] ?? Infinity) >= cf ? n : 0)) : log;
    if (wantUnlucky) { marked.set(pid, tk); cfOf.set(pid, cf); minePid.set(pid, mine); }
    for (const k of loop) {
      const i = completionIndexKey(tk, k, mine);
      if (i < 0) continue;
      const g = best.get(k)!; const arr = g.get(i); if (arr) arr.push(pid); else g.set(i, [pid]);
    }
  }
  const out: Settled[] = [];
  for (const k of keys) {
    const groups = [...best.get(k)!.entries()].sort((a, b) => a[0] - b[0]);
    for (const line of linesFor(cfg.rewards, k)) { const g = groups[line.ordinal - 1]; if (g) out.push({ pattern: k, ordinal: line.ordinal, idx: g[0], pids: g[1], round }); }
  }
  if (wantUnlucky && log.length) {
    const fk = [...best.get("full")!.keys()];
    const lines = cfg.rewards.filter((l) => l.pattern !== "unlucky");
    const allDone = lines.length > 0 && lines.every((l) => out.some((x) => x.pattern === keyOfLine(l) && x.ordinal === l.ordinal));
    const at = unluckyAt(fk.length ? Math.min(...fk) : -1, allDone ? Math.max(...out.map((x) => x.idx)) : -1, log.length, !!un?.over || log.length >= NUMBERS);
    if (at >= 0) {
      const br = late?.callRounds[at] ?? Infinity, cand: UnluckyCand[] = [];
      for (const pid of pids) {
        if (un?.out?.has(pid)) continue;
        const cf = cfOf.get(pid) ?? 0;
        if (cf > br) continue; // joined after that moment: had no numbers yet
        const upto = new Set(minePid.get(pid)!.slice(0, at + 1));
        cand.push({ pid, marked: Math.min(...marked.get(pid)!.map((t) => ticketNumbers(t).filter((n) => upto.has(n)).length)) });
      }
      const w = unluckyPick(eid, un?.randomness?.[at] ?? "", cand);
      if (w !== null) out.push({ pattern: "unlucky", ordinal: 1, idx: at, pids: [w], round });
    }
  }
  return out;
}

/** What settleAll needs for Unlucky beyond the numbers: seats that can never win it (flagged Organizer/Host/Co-host seats, removed/blocked seats), the public randomness of each call's beacon round (for ties), and whether the game is over for good. */
export interface UnluckyOpts { out?: ReadonlySet<string>; randomness?: readonly string[]; over?: boolean }
export interface UnluckyCand { pid: string; marked: number }
/**
 * When Unlucky is decided, as a call index: the first call at which anyone completed a Full House (`firstFull`), or the call at which every other prize had been awarded (`othersDone`, the game ends there),
 * or the last call when the game is over. The earliest of those that exist; -1 while it is still open.
 */
export function unluckyAt(firstFull: number, othersDone: number, calls: number, over: boolean): number {
  const c = [firstFull, othersDone].filter((x) => x >= 0);
  if (over && calls > 0) c.push(calls - 1);
  return c.length ? Math.min(...c) : -1;
}
/** The Unlucky winner: fewest numbers marked; a tie goes to the lowest hash of the round's public randomness and the seat (nobody can steer it, every phone computes the same). Null when nobody is eligible. */
export function unluckyPick(engagementId: string, randomnessHex: string, cands: readonly UnluckyCand[]): string | null {
  const rank = (pid: string) => bytesToHex(sha256(utf8ToBytes(`CT1-UNLUCKY|${engagementId}|${randomnessHex}|${pid}`)));
  const sorted = [...new Map(cands.map((c) => [c.pid, c])).values()].map((c) => [c.marked, rank(c.pid), c.pid] as const)
    .sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return sorted.length ? sorted[0]![2] : null;
}

export interface Claim { pid: string; pattern: PatternKey; idx: number; round?: number }
/** A claim is accepted only if recomputing it from the public log gives exactly the same call index. */
export const checkClaims = (engagementId: string, claims: readonly Claim[], log: readonly number[] | Readonly<Record<number, readonly number[]>>, cfg: EngagementCfg = defaultCfg(), late?: { countFrom: ReadonlyMap<string, number>; callRounds: Readonly<Record<number, readonly number[]>> }) => {
  const good: Claim[] = []; const bad: Claim[] = []; const cache = new Map<string, Ticket[]>();
  for (const c of claims) {
    const round = c.round ?? 1;
    const l = Array.isArray(log) ? (round === 1 ? (log as readonly number[]) : undefined) : (log as Readonly<Record<number, readonly number[]>>)[round];
    if (!l || round < 1 || round > cfg.rounds) { bad.push(c); continue; }
    const key = `${round}|${c.pid}`;
    let tk = cache.get(key); if (!tk) { tk = ticketsFor(roundEid(engagementId, round), c.pid, cfg.tickets); cache.set(key, tk); }
    const cf = late?.countFrom.get(c.pid) ?? 0, cr = late?.callRounds[round]; // a late joiner's claim is checked against the numbers that counted for them
    const mine = cf > 0 && cr ? l.map((n, k) => ((cr[k] ?? Infinity) >= cf ? n : 0)) : l;
    (completionIndexKey(tk, c.pattern, mine) === c.idx ? good : bad).push(c);
  }
  return { good, bad };
};

/** How many numbers each house still needs for this participant after the calls so far ("still to win"). */
export const stillToWin = (t: Ticket | readonly Ticket[], pat: PatternKey, log: readonly number[]): number => {
  const tickets: readonly Ticket[] = Array.isArray((t as any)[0]?.[0]) ? (t as unknown as readonly Ticket[]) : [t as unknown as Ticket];
  const called = new Set(log);
  if (pat === "full2") return tickets.length < 2 ? 30 : tickets.flatMap(ticketNumbers).filter((n) => !called.has(n)).length;
  let min = Infinity;
  for (const tk of tickets) { const left = ticketStillNeeds(tk, pat, called); if (left < min) min = left; }
  return min;
};

/**
 * Lucky draw: picks `n` participants from the list using the public randomness of the round that ends the break. Nobody can know the round's
 * randomness beforehand, and anyone holding the participant list can recompute the winners. Every participant is equally likely; nobody wins twice.
 */
export function luckyWinners(engagementId: string, breakAfter: number, randomnessHex: string, pids: readonly string[], n: number): string[] {
  const rank = (pid: string) => bytesToHex(sha256(utf8ToBytes(`CT1-LUCKY|${engagementId}|${breakAfter}|${randomnessHex}|${pid}`)));
  return [...new Set(pids)].map((pid) => [rank(pid), pid] as const).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, Math.max(0, n)).map((x) => x[1]);
}
/** The beacon round whose randomness decides a lucky draw: the round in which the break ends. */
export function luckyRound(st: ControlState | null, start: number, stride: number, breaks: readonly BreakCfg[], b: BreakCfg): number | null {
  const prev = callRoundFull(st, start, stride, breaks, b.after - 1);
  return prev === null ? null : prev + 1 + b.seconds / 3;
}

/* ---------------- the schedule, with brand breaks and the organizer's pauses ---------------- */

/**
 * Round `round` (1..rounds) call k, on the schedule where nothing has been paused yet: round 1 follows the plain schedule plus brand breaks; every later
 * round starts a fixed intermission after the previous round's last call and has no breaks. Pauses are applied on top (see callRoundR).
 */
export function unshiftedRound(start: number, stride: number, breaks: readonly BreakCfg[], round: number, k: number): number {
  if (round <= 1) return start + k * stride + breakShift(breaks, k);
  return unshiftedRound(start, stride, breaks, round - 1, NUMBERS - 1) + stride + INTERMISSION_ROUNDS + k * stride;
}
/** The beacon round call k of round `round` uses, with the organizer's signed pauses applied. Null when the engagement was stopped before it. */
export function callRoundR(st: ControlState | null, start: number, stride: number, breaks: readonly BreakCfg[], round: number, k: number): number | null {
  let a = unshiftedRound(start, stride, breaks, round, k);
  if (st) { for (const i of st.intervals) if (a >= i.start) a += i.end - i.start; if (st.stopRound !== null && a >= st.stopRound) return null; }
  return a;
}
/**
 * The beacon round call k uses: the plain schedule, pushed later by every brand break that starts at or before it, and then by every pause the
 * organizer signed. Breaks are part of the engagement's public settings, so every phone computes the same schedule.
 */
export function callRoundFull(st: ControlState | null, start: number, stride: number, breaks: readonly BreakCfg[], k: number): number | null {
  return callRoundR(st, start, stride, breaks, 1, k);
}
export const scheduleFull = (st: ControlState | null, start: number, stride: number, breaks: readonly BreakCfg[], count = NUMBERS): (number | null)[] =>
  Array.from({ length: count }, (_, k) => callRoundFull(st, start, stride, breaks, k));

/** The intermission before `round` (2..), if it is showing at `nowRound`: it starts right after the previous round's last call and ends when this round's first call is due. */
export function activeIntermission(st: ControlState | null, start: number, stride: number, breaks: readonly BreakCfg[], round: number, nowRound: number): { endsAtRound: number } | null {
  if (round < 2) return null;
  const prevLast = callRoundR(st, start, stride, breaks, round - 1, NUMBERS - 1), first = callRoundR(st, start, stride, breaks, round, 0);
  if (prevLast === null || first === null) return null;
  return nowRound > prevLast && nowRound < first ? { endsAtRound: first } : null;
}

/** The brand break showing at `nowRound`, if any: it starts right after the call it follows and lasts its stated length. */
export function activeBreak(st: ControlState | null, start: number, stride: number, breaks: readonly BreakCfg[], nowRound: number): { brk: BreakCfg; endsAtRound: number } | null {
  for (const b of breaks) {
    const prev = callRoundFull(st, start, stride, breaks, b.after - 1);
    if (prev === null) continue;
    const from = prev + 1, to = from + b.seconds / 3;
    if (nowRound >= from && nowRound < to) return { brk: b, endsAtRound: to };
  }
  return null;
}

/**
 * Rounds a phone holds for an engagement. Past rounds (a late joiner) are accepted provisionally when two different mirrors
 * give byte-identical answers, then checked against the BLS signature in the background so the join never blocks for seconds.
 * Current rounds are always signature-checked straight away. Anything that fails the check is thrown away and re-fetched.
 */
export class RoundStore {
  readonly rounds = new Map<number, Round>();
  readonly verified = new Set<number>();
  discarded = 0;
  constructor(readonly opts: BeaconOpts = {}, readonly verify: (x: Round) => boolean = (x) => verifyRound(x, opts.net)) {}

  /** Live round: verified immediately. */
  async fetchLive(r: number, salt = 0): Promise<boolean> {
    if (this.verified.has(r)) return true;
    const x = await fetchRound(r, { ...this.opts, verify: (y) => this.verify(y) }, salt);
    if (!x) return false;
    this.rounds.set(r, x); this.verified.add(r);
    return true;
  }

  /** Past round: needs two mirrors to agree (their raw answers are compared), signature check deferred. */
  async fetchBackfill(r: number, salt = 0): Promise<boolean> {
    if (this.rounds.has(r)) return true;
    const mirrors = this.opts.mirrors ?? ["https://api.drand.sh", "https://api2.drand.sh", "https://api3.drand.sh", "https://drand.cloudflare.com"];
    const answers: Round[] = [];
    for (let i = 0; i < mirrors.length && answers.length < 2; i++) {
      // no per-round signature check here (verify: always true); the deferred check below is what makes it safe
      const x = await fetchRound(r, { ...this.opts, mirrors: [mirrors[(i + salt) % mirrors.length]!], verify: (y) => !!y && y.round === r && typeof y.signature === "string" && typeof y.randomness === "string" }, 0);
      if (x) answers.push(x);
    }
    if (answers.length < 2) { // not enough mirrors: fall back to the slow, fully-checked path rather than trust a single answer
      return this.fetchLive(r, salt);
    }
    if (answers[0]!.signature !== answers[1]!.signature || answers[0]!.randomness !== answers[1]!.randomness) return this.fetchLive(r, salt);
    this.rounds.set(r, answers[0]!);
    return true;
  }

  /** Checks up to `max` provisional rounds. Call repeatedly (e.g. one per animation frame / timer tick). Returns how many remain. */
  verifySome(max = 1): number {
    let n = 0;
    for (const [r, x] of this.rounds) {
      if (this.verified.has(r)) continue;
      if (n >= max) break;
      n++;
      if (this.verify(x)) this.verified.add(r); else { this.rounds.delete(r); this.discarded++; }
    }
    return this.pending();
  }
  pending(): number { let p = 0; for (const r of this.rounds.keys()) if (!this.verified.has(r)) p++; return p; }
  async verifyAll(): Promise<void> { while (this.verifySome(1) > 0) await new Promise((r) => setTimeout(r, 0)); }
}

/** The call log from the rounds held so far, stopping at the first missing round. */
export function logFrom(engagementId: string, schedule: readonly number[], store: Pick<RoundStore, "rounds">, upto = NUMBERS): number[] {
  const out: number[] = [];
  for (let k = 0; k < Math.min(upto, schedule.length); k++) {
    const x = store.rounds.get(schedule[k]!);
    if (!x) break;
    out.push(pickNumber(engagementId, k, x.randomness, out));
  }
  return out;
}
