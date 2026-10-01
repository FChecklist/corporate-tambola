// The phone-side game: everything a phone (or the organizer's console) needs to play and to check an engagement
// from the public beacon alone. Pure and deterministic: no server, no phone clock.
import { generateTicket, patternNumbers, ticketNumbers, type PatternId, type Ticket } from "../../shared/src/ticket";
import { NUMBERS, fetchRound, pickNumber, seededRand, verifyRound, type BeaconOpts, type Round } from "./index";

export const ALL_PATTERNS: readonly PatternId[] = ["early5", "top", "mid", "bot", "corners", "star", "full"];

/** The same ticket on every device for (engagement, participant). */
export const ticketFor = (engagementId: string, pid: string): Ticket => generateTicket(seededRand(`${engagementId}|${pid}`));

/** Index (0-based call number) at which the ticket first completes the pattern, or -1 if it never does within `log`. */
export function completionIndex(t: Ticket, pat: PatternId, log: readonly number[]): number {
  const need = patternNumbers(t, pat);
  const mine = new Set(ticketNumbers(t));
  if (!need) { // Early Five: any five of the ticket's numbers
    let hit = 0;
    for (let i = 0; i < log.length; i++) if (mine.has(log[i]!) && ++hit === 5) return i;
    return -1;
  }
  const left = new Set(need);
  for (let i = 0; i < log.length; i++) if (left.delete(log[i]!) && left.size === 0) return i;
  return -1;
}

export interface Settled { pattern: PatternId; idx: number; pids: string[] }

/**
 * The organizer console's settlement: from the public log and the participant list alone, who completed each pattern first.
 * Claims are not needed to decide this (a phone with no network still wins), they only cross-check it. Ties share the reward.
 */
export function settleAll(engagementId: string, pids: readonly string[], log: readonly number[]): Settled[] {
  const out: Settled[] = [];
  for (const pattern of ALL_PATTERNS) {
    let best = Infinity; let winners: string[] = [];
    for (const pid of pids) {
      const i = completionIndex(ticketFor(engagementId, pid), pattern, log);
      if (i < 0) continue;
      if (i < best) { best = i; winners = [pid]; } else if (i === best) winners.push(pid);
    }
    if (winners.length) out.push({ pattern, idx: best, pids: winners });
  }
  return out;
}

export interface Claim { pid: string; pattern: PatternId; idx: number }
/** A claim is accepted only if recomputing it from the public log gives exactly the same call index. */
export const checkClaims = (engagementId: string, claims: readonly Claim[], log: readonly number[]) => {
  const good: Claim[] = []; const bad: Claim[] = [];
  for (const c of claims) (completionIndex(ticketFor(engagementId, c.pid), c.pattern, log) === c.idx ? good : bad).push(c);
  return { good, bad };
};

/** How many numbers each pattern still needs for this ticket after the calls so far ("still to win"). */
export const stillToWin = (t: Ticket, pat: PatternId, log: readonly number[]): number => {
  const called = new Set(log);
  const need = patternNumbers(t, pat);
  if (!need) return Math.max(0, 5 - ticketNumbers(t).filter((n) => called.has(n)).length);
  return need.filter((n) => !called.has(n)).length;
};

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
