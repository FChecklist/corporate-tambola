// Every phone works out the winners itself. This is the incremental engine behind that: it holds one unit per ticket (and one per two-ticket
// house), is told each called number once, and knows at every moment which participants completed which house at which call. It gives exactly the
// answer `settleAll` gives from the whole log (a test proves it), but a call costs a few thousand tiny updates instead of re-reading every ticket.
//
// Late joiners: a participant who joined after the game began counts only the numbers whose beacon round is at or after `countFrom`
// (their join round plus LATE_LAG_ROUNDS), so every phone has heard of them before their first number counts and nobody's result changes later.
import { ticketNumbers } from "../../shared/src/ticket";
import { LATE_LAG_ROUNDS, keysInPlay, linesFor, roundEid, type EngagementCfg, type PatternKey } from "./config";
import { ruleOf } from "./house-rules";
import { ticketsFor, unluckyAt, unluckyPick, type Settled } from "./game";
import { NUMBERS } from "./index";

/** The first beacon round whose number counts for a seat that joined in round `jr` (0 or missing: joined in time, everything counts). */
export const countFromOf = (jr: number | null | undefined): number => (jr && jr > 0 ? jr + LATE_LAG_ROUNDS : 0);

/** `ex`: a flagged seat (Organizer, Host, Co-host): never wins Unlucky. `blk`: a removed/blocked seat: never wins Unlucky either. */
export interface SeatIn { pid: string; countFrom: number; ex?: boolean; blk?: boolean }

export class PrizeEngine {
  /** The houses that have reward lines (Unlucky is not here: it is not decided on one ticket, see `unluckyResult()`), plus Full House when only Unlucky needs it. */
  readonly keys: PatternKey[];
  private readonly eid: string;
  private readonly wantUnlucky: boolean;
  private readonly twoBit: number; // the bit of Two Lines (its three lines use the bits after the houses, and a counter after those)
  private readonly nb: number;
  private readonly auxBase: number;
  private readonly bit = new Map<PatternKey, number>();
  // one unit per ticket (patterns), plus one per two-ticket participant (the two-ticket house)
  private unitPid: string[] = [];
  private unitCf: number[] = [];
  private unitMask: Uint32Array[] = [];
  private unitIsTicket: boolean[] = [];
  private unitNums: Uint8Array[] = [];
  private unitLeft0: Uint8Array[] = [];
  private unitLeft: Uint8Array[] = [];
  private inv: number[][] = Array.from({ length: 91 }, () => []);
  private callNum: number[] = [];
  private callBr: number[] = [];
  private donePid: Set<string>[];
  private byKey: Map<number, string[]>[];
  private known = new Set<string>();
  private queue: SeatIn[] = [];
  private callRand: string[] = [];
  private pos = new Int16Array(91).fill(-1); // call index of each number called so far
  private out = new Set<string>(); // seats that can never win Unlucky (flagged or removed)
  private outVer = 0;
  private over = false;
  private uCache: { key: string; r: Settled | null } | null = null;

  constructor(engagementId: string, readonly cfg: EngagementCfg, readonly round = 1) {
    this.eid = roundEid(engagementId, round);
    const all = keysInPlay(cfg.rewards);
    this.wantUnlucky = all.includes("unlucky");
    const ks = all.filter((k) => k !== "unlucky");
    if (this.wantUnlucky && !ks.includes("full")) ks.push("full"); // Unlucky is decided at the first Full House, even when Full House is not a prize
    this.keys = ks;
    this.keys.forEach((k, i) => this.bit.set(k, i));
    this.auxBase = this.keys.length;
    this.nb = this.keys.length + (this.bit.has("twolines") ? 4 : 0);
    this.twoBit = this.bit.get("twolines") ?? -1;
    this.donePid = this.keys.map(() => new Set());
    this.byKey = this.keys.map(() => new Map());
  }

  get seatCount() { return this.known.size; }
  get pending() { return this.queue.length; }
  get calls() { return this.callNum.length; }

  /** Queues seats not seen before. Their tickets are made later, in small slices (`work`), so a big list never freezes the screen. */
  addSeats(seats: readonly SeatIn[]) { for (const s of seats) if (!this.known.has(s.pid)) { this.known.add(s.pid); this.queue.push(s); if (s.ex || s.blk) this.setOut(s.pid, true); } }
  /** A seat is flagged or was removed/blocked: it stays in every other house but can never win Unlucky. */
  setOut(pid: string, out: boolean) { if (out === this.out.has(pid)) return; if (out) this.out.add(pid); else this.out.delete(pid); this.outVer++; }
  /** The game is over for good (the last number was called, or it was stopped and every call before the stop is in): Unlucky may be decided at the end if nobody completed a Full House. */
  setOver(over: boolean) { this.over = over; }

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
      const mask = new Uint32Array(91), left = new Uint8Array(this.nb + 1);
      for (const k of this.keys) {
        if (k === "full2") continue;
        const b = this.bit.get(k)!, r = ruleOf(t, k);
        if (!r) continue;
        if ("lines" in r) { // Two Lines: each line counts down on its own bit; the counter after them waits for two lines
          r.lines.forEach((ln, i) => { for (const n of ln) mask[n]! |= 1 << (this.auxBase + i); left[this.auxBase + i] = ln.length; });
          left[this.auxBase + 3] = 2; left[b] = 250;
        } else {
          for (const n of r.pool) mask[n]! |= 1 << b;
          left[b] = r.pool.length < r.k ? 250 : r.k; // 250: this ticket cannot complete it
        }
      }
      this.push(s, mask, left, true, Uint8Array.from(ticketNumbers(t)));
    }
    if (tickets.length === 2 && this.bit.has("full2")) { // the two-ticket house: every number on both tickets
      const b = this.bit.get("full2")!, all = new Set(tickets.flatMap(ticketNumbers)), mask = new Uint32Array(91), left = new Uint8Array(this.nb + 1);
      for (const n of all) mask[n]! |= 1 << b;
      left[b] = all.size;
      this.push(s, mask, left, false, new Uint8Array(0));
    }
    // numbers already called that count for this seat
    // CALL BY CALL (oldest first) across all of this seat's units, exactly as if the seat had been here from the start: "their other ticket got there first" in `apply` must be decided by call order.
    // Going ticket by ticket instead made a two-ticket seat whose SECOND ticket completed a house earlier keep the FIRST ticket's later completion, so a phone that built its tickets late (every late
    // joiner) saw a different tie than every other phone (found by the 20-game rehearsal, G11, and covered by prize-engine.test.ts).
    for (let j = 0; j < this.callNum.length; j++) for (let u = first; u < this.unitPid.length; u++) this.apply(u, j, this.callNum[j]!, this.callBr[j]!);
  }
  private push(s: SeatIn, mask: Uint32Array, left: Uint8Array, isTicket: boolean, nums: Uint8Array) {
    const u = this.unitPid.length;
    this.unitPid.push(s.pid); this.unitCf.push(s.countFrom); this.unitIsTicket.push(isTicket); this.unitNums.push(nums); this.unitMask.push(mask); this.unitLeft0.push(left); this.unitLeft.push(left.slice());
    for (let n = 1; n <= 90; n++) if (mask[n]) this.inv[n]!.push(u);
  }

  private apply(u: number, j: number, n: number, br: number) {
    if (br < this.unitCf[u]!) return; // joined late: this number was called before it counted for them
    const m = this.unitMask[u]![n]!;
    if (!m) return;
    const left = this.unitLeft[u]!;
    for (let b = 0; b < this.nb; b++) {
      if (!((m >> b) & 1)) continue;
      if (--left[b]! !== 0) continue;
      let h = b;
      if (b >= this.auxBase) { if (--left[this.auxBase + 3]! !== 0) continue; h = this.twoBit; } // the second line of Two Lines is complete
      const pid = this.unitPid[u]!;
      if (this.donePid[h]!.has(pid)) continue; // their other ticket got there first
      this.donePid[h]!.add(pid);
      const g = this.byKey[h]!.get(j); if (g) g.push(pid); else this.byKey[h]!.set(j, [pid]);
    }
  }

  /** Tells the engine the next called number (in call order) and the beacon round it was called in. */
  feed(number: number, beaconRound: number, randomness = "") {
    const j = this.callNum.length;
    this.callNum.push(number); this.callBr.push(beaconRound); this.callRand.push(randomness); if (number >= 1 && number <= 90) this.pos[number] = j;
    for (const u of this.inv[number]!) this.apply(u, j, number, beaconRound);
  }

  /** Forgets the calls (the schedule moved, for example after a pause message) but keeps the tickets: feed the calls again. */
  resetCalls() {
    this.callNum = []; this.callBr = []; this.callRand = []; this.pos.fill(-1); this.uCache = null;
    this.unitLeft = this.unitLeft0.map((l) => l.slice());
    this.donePid = this.keys.map(() => new Set());
    this.byKey = this.keys.map(() => new Map());
  }

  /** One reward line per ordinal: the 1st goes to whoever completed the house at the earliest call (ties share), the 2nd to the next distinct call, and so on. Unlucky (one winner) is added when it is in play and decided. */
  results(): Settled[] {
    const out: Settled[] = [];
    this.keys.forEach((k, b) => {
      const groups = [...this.byKey[b]!.entries()].sort((a, c) => a[0] - c[0]);
      for (const line of linesFor(this.cfg.rewards, k)) { const g = groups[line.ordinal - 1]; if (g) out.push({ pattern: k, ordinal: line.ordinal, idx: g[0], pids: g[1].slice(), round: this.round }); }
    });
    const u = this.unluckyResult(out);
    if (u) out.push(u);
    return out;
  }

  /**
   * Unlucky: the ticket with the FEWEST numbers marked at the moment the first Full House is completed by anyone, or, if nobody completes one, when the game ends. "The game ends" is the moment every
   * other prize has been awarded, or the last number / the stop (`setOver`). Flagged and removed seats are out; a seat that joined after that moment had no numbers yet and is out too. Ties go to the lowest hash
   * of the public randomness of that call's round (the same idea as the lucky draw). A person with two tickets counts with the ticket that has fewer marked.
   */
  private unluckyResult(done: readonly Settled[]): Settled | null {
    if (!this.wantUnlucky || !this.callNum.length) return null;
    const fk = [...this.byKey[this.bit.get("full")!]!.keys()];
    const firstFull = fk.length ? Math.min(...fk) : -1;
    const lines = this.cfg.rewards.filter((l) => l.pattern !== "unlucky");
    const allDone = lines.length > 0 && lines.every((l) => done.some((x) => x.pattern === (l.scope === "two_ticket" ? "full2" : l.pattern) && x.ordinal === l.ordinal));
    const othersDone = allDone ? Math.max(...done.map((x) => x.idx)) : -1;
    const at = unluckyAt(firstFull, othersDone, this.callNum.length, this.over || this.callNum.length >= NUMBERS);
    if (at < 0) return null;
    const key = `${at}|${this.unitPid.length}|${this.outVer}`;
    if (this.uCache?.key === key) return this.uCache.r;
    const br = this.callBr[at]!, best = new Map<string, number>();
    for (let u = 0; u < this.unitPid.length; u++) {
      if (!this.unitIsTicket[u]) continue;
      const pid = this.unitPid[u]!, cf = this.unitCf[u]!;
      if (this.out.has(pid) || cf > br) continue;
      let c = 0;
      for (const n of this.unitNums[u]!) { const p = this.pos[n]!; if (p >= 0 && p <= at && this.callBr[p]! >= cf) c++; }
      const had = best.get(pid); if (had === undefined || c < had) best.set(pid, c);
    }
    const pid = unluckyPick(this.eid, this.callRand[at] ?? "", [...best].map(([p, marked]) => ({ pid: p, marked })));
    const r: Settled | null = pid === null ? null : { pattern: "unlucky", ordinal: 1, idx: at, pids: [pid], round: this.round };
    this.uCache = { key, r };
    return r;
  }
}
