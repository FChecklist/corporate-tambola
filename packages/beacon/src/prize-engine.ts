// Every phone works out the winners itself. This is the incremental engine behind that: it holds one unit per ticket (and one per two-ticket
// house), is told each called number once, and knows at every moment which participants completed which house at which call. It gives exactly the
// answer `settleAll` gives from the whole log (a test proves it), but a call costs a few thousand tiny updates instead of re-reading every ticket.
//
// Late joiners: a participant who joined after the game began counts only the numbers whose beacon round is at or after `countFrom`
// (their join round plus LATE_LAG_ROUNDS), so every phone has heard of them before their first number counts and nobody's result changes later.
import { patternNumbers, ticketNumbers } from "../../shared/src/ticket";
import { LATE_LAG_ROUNDS, keysInPlay, linesFor, roundEid, type EngagementCfg, type PatternKey } from "./config";
import { ticketsFor, type Settled } from "./game";

/** The first beacon round whose number counts for a seat that joined in round `jr` (0 or missing: joined in time, everything counts). */
export const countFromOf = (jr: number | null | undefined): number => (jr && jr > 0 ? jr + LATE_LAG_ROUNDS : 0);

export interface SeatIn { pid: string; countFrom: number }

export class PrizeEngine {
  readonly keys: PatternKey[];
  private readonly eid: string;
  private readonly bit = new Map<PatternKey, number>();
  // one unit per ticket (patterns), plus one per two-ticket participant (the two-ticket house)
  private unitPid: string[] = [];
  private unitCf: number[] = [];
  private unitMask: Uint16Array[] = [];
  private unitLeft0: Uint8Array[] = [];
  private unitLeft: Uint8Array[] = [];
  private inv: number[][] = Array.from({ length: 91 }, () => []);
  private callNum: number[] = [];
  private callBr: number[] = [];
  private donePid: Set<string>[];
  private byKey: Map<number, string[]>[];
  private known = new Set<string>();
  private queue: SeatIn[] = [];

  constructor(engagementId: string, readonly cfg: EngagementCfg, readonly round = 1) {
    this.eid = roundEid(engagementId, round);
    this.keys = keysInPlay(cfg.rewards);
    this.keys.forEach((k, i) => this.bit.set(k, i));
    this.donePid = this.keys.map(() => new Set());
    this.byKey = this.keys.map(() => new Map());
  }

  get seatCount() { return this.known.size; }
  get pending() { return this.queue.length; }
  get calls() { return this.callNum.length; }

  /** Queues seats not seen before. Their tickets are made later, in small slices (`work`), so a big list never freezes the screen. */
  addSeats(seats: readonly SeatIn[]) { for (const s of seats) if (!this.known.has(s.pid)) { this.known.add(s.pid); this.queue.push(s); } }

  /** Makes tickets for queued seats until `budgetMs` has passed. Returns true when nothing is left to do. */
  work(budgetMs: number, now: () => number = () => performance.now()): boolean {
    const t0 = now();
    while (this.queue.length) {
      const s = this.queue.shift()!;
      this.build(s);
      if (now() - t0 >= budgetMs) break;
    }
    return this.queue.length === 0;
  }

  private build(s: SeatIn) {
    const tickets = ticketsFor(this.eid, s.pid, this.cfg.tickets);
    const first = this.unitPid.length;
    for (const t of tickets) {
      const mask = new Uint16Array(91), left = new Uint8Array(this.keys.length);
      for (const k of this.keys) {
        if (k === "full2") continue;
        const b = this.bit.get(k)!, need = patternNumbers(t, k as any);
        if (!need) { for (const n of ticketNumbers(t)) mask[n]! |= 1 << b; left[b] = 5; } // Early Five: any five of the ticket
        else { for (const n of need) mask[n]! |= 1 << b; left[b] = need.length; }
      }
      this.push(s, mask, left);
    }
    if (tickets.length === 2 && this.bit.has("full2")) { // the two-ticket house: every number on both tickets
      const b = this.bit.get("full2")!, all = new Set(tickets.flatMap(ticketNumbers)), mask = new Uint16Array(91), left = new Uint8Array(this.keys.length);
      for (const n of all) mask[n]! |= 1 << b;
      left[b] = all.size;
      this.push(s, mask, left);
    }
    // numbers already called that count for this seat
    for (let u = first; u < this.unitPid.length; u++) for (let j = 0; j < this.callNum.length; j++) this.apply(u, j, this.callNum[j]!, this.callBr[j]!);
  }
  private push(s: SeatIn, mask: Uint16Array, left: Uint8Array) {
    const u = this.unitPid.length;
    this.unitPid.push(s.pid); this.unitCf.push(s.countFrom); this.unitMask.push(mask); this.unitLeft0.push(left); this.unitLeft.push(left.slice());
    for (let n = 1; n <= 90; n++) if (mask[n]) this.inv[n]!.push(u);
  }

  private apply(u: number, j: number, n: number, br: number) {
    if (br < this.unitCf[u]!) return; // joined late: this number was called before it counted for them
    const m = this.unitMask[u]![n]!;
    if (!m) return;
    const left = this.unitLeft[u]!;
    for (let b = 0; b < this.keys.length; b++) {
      if (!((m >> b) & 1)) continue;
      if (--left[b]! === 0) {
        const pid = this.unitPid[u]!;
        if (this.donePid[b]!.has(pid)) continue; // their other ticket got there first
        this.donePid[b]!.add(pid);
        const g = this.byKey[b]!.get(j); if (g) g.push(pid); else this.byKey[b]!.set(j, [pid]);
      }
    }
  }

  /** Tells the engine the next called number (in call order) and the beacon round it was called in. */
  feed(number: number, beaconRound: number) {
    const j = this.callNum.length;
    this.callNum.push(number); this.callBr.push(beaconRound);
    for (const u of this.inv[number]!) this.apply(u, j, number, beaconRound);
  }

  /** Forgets the calls (the schedule moved, for example after a pause message) but keeps the tickets: feed the calls again. */
  resetCalls() {
    this.callNum = []; this.callBr = [];
    this.unitLeft = this.unitLeft0.map((l) => l.slice());
    this.donePid = this.keys.map(() => new Set());
    this.byKey = this.keys.map(() => new Map());
  }

  /** One reward line per ordinal: the 1st goes to whoever completed the house at the earliest call (ties share), the 2nd to the next distinct call, and so on. */
  results(): Settled[] {
    const out: Settled[] = [];
    this.keys.forEach((k, b) => {
      const groups = [...this.byKey[b]!.entries()].sort((a, c) => a[0] - c[0]);
      for (const line of linesFor(this.cfg.rewards, k)) { const g = groups[line.ordinal - 1]; if (g) out.push({ pattern: k, ordinal: line.ordinal, idx: g[0], pids: g[1].slice(), round: this.round }); }
    });
    return out;
  }
}
