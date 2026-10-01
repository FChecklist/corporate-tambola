/**
 * Optional features: several Tambola rounds, lucky draws, scratch cards, boosters and the "still to win" counters.
 * Off by default (rounds = 1, no draws, no cards). Every random choice is made here, on the server: the organizer, hosts and the AI work link can
 * neither choose nor see winners in advance. The schedule is FIXED when the engagement goes live, so the counters never promise what will not happen.
 *
 * Words: never "lottery". Winners are shown by ticket id unless the organizer opted in to names (first name + department + last 4 digits).
 */
import { maskTail } from "./util";
import type { EngagementEngine } from "./engine";
import type { BoosterKind, Moment, Participant, PrizeKind, SurpriseSettings, Winner } from "./types";

export const SCFG = {
  INTERMISSION_MS: 20_000, // pause between rounds (moments for the break run inside it)
  LUCKY_CONFIRM_MS: 60_000, // a lucky-draw winner has this long to tap "I'm here"
  LUCKY_REDRAW_MS: 30_000, // replacement winners get this long
  SCRATCH_MS: 45_000, // scratch cards auto-reveal after this
  MIN_CALLS_BETWEEN: 5, // at least this many numbers between two moments in a round
};

type Cont = "none" | "start" | "resume" | "intermission" | "finale";
export interface MomentResult { momentId: string; kind: "lucky" | "scratch"; round: number; at: number; winners: { pid: string; ticketId: string; prize: string }[]; winningCards?: number; redraws: number; note?: string }

export class Surprise {
  round = 1;
  roundWinners: { round: number; lineId: string; winners: Winner[] }[] = [];
  moments: Moment[] = [];
  slots: string[] = [];
  results: MomentResult[] = [];
  queue: string[] = [];
  cont: Cont = "none";
  intermissionUntil = 0;
  resultWindows = 0;
  between = false; // true from the end of a round until the next one starts (the finished round has nothing left to win)
  lastMomentCall = -99;
  lucky: null | { id: string; winners: string[]; confirmed: string[]; deadline: number; redrawn: boolean; drawn: string[] } = null;
  scratch: null | { id: string; outcomes: Record<string, string>; revealed: string[]; until: number; concurrent: boolean; winningCards: number } = null;
  boosterUses: { at: number; pid: string; kind: BoosterKind; round: number }[] = [];

  constructor(private e: EngagementEngine) {}

  get cfg(): SurpriseSettings { return this.e.settings.surprise; }
  get rounds() { return this.cfg.rounds; }
  /** True when anything optional is switched on. */
  get enabled() { return this.cfg.rounds > 1 || this.cfg.luckyDraws > 0 || this.cfg.scratchCards > 0; }

  // ---------------------------------------------------------------- settings
  validate(s: Partial<SurpriseSettings>): string | null {
    if (s.rounds !== undefined && !(Number.isInteger(s.rounds) && s.rounds >= 1 && s.rounds <= 5)) return "Rounds must be 1 to 5.";
    if (s.callSeconds !== undefined && ![6, 10, 15].includes(s.callSeconds)) return "Calling speed must be 6, 10 or 15 seconds.";
    if (s.luckyDraws !== undefined && !(Number.isInteger(s.luckyDraws) && s.luckyDraws >= 0 && s.luckyDraws <= 10)) return "Lucky draws must be 0 to 10.";
    if (s.scratchCards !== undefined && !(Number.isInteger(s.scratchCards) && s.scratchCards >= 0 && s.scratchCards <= 10)) return "Scratch cards must be 0 to 10.";
    if (s.luckyWinners !== undefined && ![1, 3, 5, 10].includes(s.luckyWinners)) return "Winners in each draw must be 1, 3, 5 or 10.";
    if (s.scratchWinning !== undefined && ![5, 10, 20, 50].includes(s.scratchWinning)) return "Winning cards in each scratch round must be 5, 10, 20 or 50.";
    if (s.luckyPrize !== undefined && !["gift", "booster"].includes(s.luckyPrize)) return "Lucky draw reward must be a gift or a booster.";
    if (s.scratchPrize !== undefined && !["gift", "booster", "mix"].includes(s.scratchPrize)) return "Scratch card reward must be a gift, a booster or half and half.";
    if (s.momentsMode !== undefined && !["auto", "manual"].includes(s.momentsMode)) return "Surprise moments are automatic or manual.";
    return null;
  }
  /** With boosters off every booster option is forced back to gifts (owner handoff 18.1). */
  normalise(): void {
    const c = this.cfg;
    if (!c.boostersAllowed) { c.luckyPrize = "gift"; c.scratchPrize = "gift"; }
  }

  // ---------------------------------------------------------------- planning (shown live in the console; formulas from the handoff)
  /** Planning summary. Warns, never blocks. */
  static plan(c: SurpriseSettings, prizesPerRound: number) {
    const R = c.rounds, P = prizesPerRound;
    const tambola = R * P, luckyWinners = c.luckyDraws * c.luckyWinners, scratchWinners = c.scratchCards * c.scratchWinning;
    const half = Math.ceil(scratchWinners / 2);
    const gifts = tambola + (c.luckyPrize === "gift" ? luckyWinners : 0) + (c.scratchPrize === "gift" ? scratchWinners : c.scratchPrize === "mix" ? half : 0);
    const boosters = (c.luckyPrize === "booster" ? luckyWinners : 0) + (c.scratchPrize === "booster" ? scratchWinners : c.scratchPrize === "mix" ? scratchWinners - half : 0);
    const capacity = R * P + 2 * (R - 1) + 2 + (c.autoMark ? 2 * R : 0);
    const moments = c.luckyDraws + c.scratchCards;
    const speed = 10; // minutes estimate uses the normal 10 s unless the caller changes calling speed
    const minutes = Math.round(R * (70 * speed / 60) + R * P * 20 / 60 + c.luckyDraws * 1.2 + (c.autoMark ? 0 : c.scratchCards * 0.7) + 2 * (R - 1));
    return { tambolaPrizes: tambola, luckyWinners, scratchWinningCards: scratchWinners, giftPrizes: gifts, boosters, capacity, moments, fits: moments <= capacity, estimatedMinutes: minutes };
  }

  /** Build the schedule once, when the engagement goes live. */
  private buildSchedule(): void {
    const c = this.cfg, R = c.rounds, P = Math.max(1, this.e.settings.rewards.length);
    const slots: string[] = ["opening"];
    for (let r = 1; r <= R; r++) {
      for (let k = 1; k <= Math.max(1, P - 1); k++) slots.push(`award:${r}:${k}`);
      if (r < R) slots.push(`break:${r}:1`, `break:${r}:2`);
    }
    slots.push("finale");
    this.slots = slots;
    const mk = (kind: "lucky" | "scratch", bumper: boolean): Moment => ({ id: this.e.uid("m"), kind, slot: "", winners: kind === "lucky" ? c.luckyWinners : c.scratchWinning, prize: kind === "lucky" ? c.luckyPrize : c.scratchPrize, bumper, status: "pending" });
    const lucky = Array.from({ length: c.luckyDraws }, (_, i) => mk("lucky", c.bumper && i === c.luckyDraws - 1));
    const bumper = lucky.find((m) => m.bumper);
    const body: Moment[] = [];
    const L = lucky.filter((m) => !m.bumper), S = Array.from({ length: c.scratchCards }, () => mk("scratch", false));
    while (L.length || S.length) { if (S.length) body.push(S.shift()!); if (L.length) body.push(L.shift()!); } // alternate so the variety is steady
    const pool = slots.slice(0, -1);
    body.forEach((m, i) => { const idx = Math.min(pool.length - 1, Math.floor(((i + 0.5) * pool.length) / body.length)); m.slot = pool[idx]!; });
    if (bumper) bumper.slot = "finale";
    this.moments = [...body, ...(bumper ? [bumper] : [])];
  }

  /** Called when the engagement goes live. Returns true if a moment was started (calling waits for it). */
  onGoLive(): boolean {
    this.round = 1; this.resultWindows = 0; this.lastMomentCall = -99;
    if (!this.enabled) return false;
    if (this.cfg.momentsMode === "manual") {
      // counters stay exact: moments exist but start when the organizer presses the button
      const c = this.cfg;
      const mk = (kind: "lucky" | "scratch", bumper: boolean): Moment => ({ id: this.e.uid("m"), kind, slot: "manual", winners: kind === "lucky" ? c.luckyWinners : c.scratchWinning, prize: kind === "lucky" ? c.luckyPrize : c.scratchPrize, bumper, status: "pending" });
      this.moments = [...Array.from({ length: c.scratchCards }, () => mk("scratch", false)), ...Array.from({ length: c.luckyDraws }, (_, i) => mk("lucky", c.bumper && i === c.luckyDraws - 1))];
      return false;
    }
    this.buildSchedule();
    return this.runSlots(["opening"], "start");
  }

  // ---------------------------------------------------------------- running moments
  private due(slots: string[], respectGap: boolean): Moment[] {
    let list = this.moments.filter((m) => m.status === "pending" && slots.includes(m.slot));
    if (respectGap && list.length && this.e.called.length - this.lastMomentCall < SCFG.MIN_CALLS_BETWEEN) {
      // too soon after the last moment: push them to the next slot so numbers are called in between
      for (const m of list) { const i = this.slots.indexOf(m.slot); m.slot = this.slots[Math.min(this.slots.length - 1, i + 1)]!; }
      list = [];
    }
    return list;
  }
  private runSlots(slots: string[], cont: Cont, respectGap = false): boolean {
    const d = this.due(slots, respectGap);
    if (!d.length) return false;
    this.queue = d.map((m) => m.id); this.cont = cont;
    this.startNext();
    return true;
  }
  private get(id: string) { return this.moments.find((m) => m.id === id)!; }

  private startNext(): void {
    const id = this.queue.shift();
    if (!id) return this.afterMoment();
    const m = this.get(id);
    if (m.kind === "lucky") this.startLucky(m); else this.startScratch(m);
  }

  private eligible(forDraw: boolean): Participant[] {
    const present = this.e.present?.() ?? null;
    return this.e.participants.filter((p) => p.status === "joined" && (!forDraw || !present || present.has(p.id)) && !(p.kind === "family" && !this.e.settings.familyCanWin));
  }

  /** Weighted draw without replacement; a Lucky draw pass counts as one extra entry. */
  private pick(pool: Participant[], n: number, exclude: Set<string>): Participant[] {
    const entries: Participant[] = [];
    for (const p of pool) { if (exclude.has(p.id)) continue; entries.push(p); if (p.boosters.pass > 0) entries.push(p); }
    const out: Participant[] = [];
    while (out.length < n && entries.length) {
      const i = this.e.rand(entries.length), p = entries[i]!;
      out.push(p);
      for (let j = entries.length - 1; j >= 0; j--) if (entries[j] === p) entries.splice(j, 1);
    }
    return out;
  }

  private display(p: Participant): string {
    if (!this.cfg.revealNames || !p.namesConsent) return this.e.ticketId(p); // names only for people who saw the consent wording when they joined
    const parts = (p.name || "").trim().split(/\s+/);
    const first = parts[0] ?? "", initial = parts[1] ? ` ${parts[1][0]}.` : "";
    return [first + initial, p.info || "", maskTail(p.e164)].filter(Boolean).join(" · ");
  }

  private startLucky(m: Moment): void {
    const t = this.e.now();
    m.status = "running"; m.startedAt = t; m.round = this.round;
    const pool = this.eligible(true);
    const winners = this.pick(pool, m.winners, new Set());
    for (const p of pool) if (p.boosters.pass > 0) p.boosters.pass--; // a pass expires after the next draw whether or not it won
    this.lucky = { id: m.id, winners: winners.map((p) => p.id), confirmed: [], deadline: t + SCFG.LUCKY_CONFIRM_MS, redrawn: false, drawn: winners.map((p) => p.id) };
    this.e.paused = { type: "moment", momentId: m.id, until: this.lucky.deadline };
    this.e.logMsg(`Lucky draw${m.bumper ? " (bumper)" : ""}: ${winners.length} drawn from ${pool.length} present`);
    this.e.emit({ to: "all", type: "pause", kind: "claim" });
    this.e.emit({ to: "all", type: "moment_start", id: m.id, kind: "lucky", winners: m.winners, bumper: m.bumper, prize: m.prize, seconds: SCFG.LUCKY_CONFIRM_MS / 1000 });
    for (const p of winners) this.e.emit({ to: "pid", pid: p.id, type: "lucky_won", momentId: m.id, confirmSeconds: SCFG.LUCKY_CONFIRM_MS / 1000, prize: m.prize });
    if (!winners.length) this.finishLucky();
  }

  /** The winner taps "I'm here". */
  confirmPresent(pid: string, momentId: string): string | null {
    const l = this.lucky;
    if (!l || l.id !== momentId) return "This draw is over.";
    if (!l.winners.includes(pid)) return "You are not a winner of this draw.";
    if (!l.confirmed.includes(pid)) l.confirmed.push(pid);
    if (l.confirmed.length >= l.winners.length) this.finishLucky();
    return null;
  }

  private lucky_tick(t: number): void {
    const l = this.lucky;
    if (!l || t < l.deadline) return;
    const missing = l.winners.filter((p) => !l.confirmed.includes(p));
    if (missing.length && !l.redrawn) {
      // redraw once, with a logged reason
      const m = this.get(l.id);
      const pool = this.eligible(true);
      const repl = this.pick(pool, missing.length, new Set(l.drawn));
      l.winners = [...l.winners.filter((p) => l.confirmed.includes(p)), ...repl.map((p) => p.id)];
      l.drawn.push(...repl.map((p) => p.id));
      l.redrawn = true; l.deadline = t + SCFG.LUCKY_REDRAW_MS;
      if (this.e.paused?.type === "moment") this.e.paused.until = l.deadline;
      this.e.logMsg(`Lucky draw redraw: ${missing.length} winner(s) did not confirm in time`);
      for (const p of repl) this.e.emit({ to: "pid", pid: p.id, type: "lucky_won", momentId: m.id, confirmSeconds: SCFG.LUCKY_REDRAW_MS / 1000, prize: m.prize });
      if (!repl.length) this.finishLucky();
      return;
    }
    this.finishLucky();
  }

  private finishLucky(): void {
    const l = this.lucky; if (!l) return;
    const m = this.get(l.id), t = this.e.now();
    const winners = l.winners.map((id) => this.e.participants.find((p) => p.id === id)).filter((p): p is Participant => !!p);
    const out: MomentResult["winners"] = [];
    for (const p of winners) {
      let prize = "gift";
      if (m.prize === "booster" && this.cfg.boostersAllowed) { prize = this.randomBooster(); this.grant(p, prize as BoosterKind); }
      out.push({ pid: p.id, ticketId: this.e.ticketId(p), prize });
    }
    this.results.push({ momentId: m.id, kind: "lucky", round: this.round, at: t, winners: out, redraws: l.redrawn ? 1 : 0, note: winners.length ? undefined : "Nobody was present to draw." });
    this.e.emit({ to: "all", type: "moment_result", id: m.id, kind: "lucky", winners: winners.map((p) => this.display(p)), bumper: m.bumper });
    this.lucky = null;
    this.completeMoment(m);
  }

  private randomBooster(): BoosterKind { return (["joker", "extra", "pass"] as BoosterKind[])[this.e.rand(3)]!; }
  private grant(p: Participant, kind: BoosterKind): void {
    p.boosters[kind]++;
    this.e.emit({ to: "pid", pid: p.id, type: "booster", boosters: { ...p.boosters } });
  }

  private startScratch(m: Moment): void {
    const t = this.e.now();
    m.status = "running"; m.startedAt = t; m.round = this.round;
    const everyone = this.eligible(false);
    const canWin = everyone; // family only when allowed (eligible already excludes them)
    const k = Math.min(m.winners, canWin.length);
    const chosen = this.pick(canWin.map((p) => ({ ...p, boosters: { joker: 0, extra: 0, pass: 0 } }) as Participant), k, new Set()); // no weights for scratch
    const outcomes: Record<string, string> = {};
    const kinds: string[] = [];
    for (let i = 0; i < chosen.length; i++) {
      const gift = m.prize === "gift" || !this.cfg.boostersAllowed || (m.prize === "mix" && i < Math.ceil(chosen.length / 2));
      kinds.push(gift ? "gift" : this.randomBooster());
    }
    for (let i = kinds.length - 1; i > 0; i--) { const j = this.e.rand(i + 1); [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!]; } // which winner gets which prize is random too
    chosen.forEach((p, i) => (outcomes[p.id] = kinds[i]!)); // decided NOW, before anyone scratches
    const concurrent = this.cfg.autoMark; // with auto-mark nobody misses a number, so calling can continue
    this.scratch = { id: m.id, outcomes, revealed: [], until: t + SCFG.SCRATCH_MS, concurrent, winningCards: chosen.length };
    this.e.logMsg(`Scratch card: ${chosen.length} winning cards among ${everyone.length}`);
    this.e.emit({ to: "all", type: "moment_start", id: m.id, kind: "scratch", winners: chosen.length, bumper: false, prize: m.prize, seconds: SCFG.SCRATCH_MS / 1000 });
    if (concurrent) this.afterMoment(); // do not hold up the numbers
    else { this.e.paused = { type: "moment", momentId: m.id, until: this.scratch.until }; this.e.emit({ to: "all", type: "pause", kind: "claim" }); }
  }

  /** A participant scratches (or the card auto-reveals). The result goes only to them. */
  revealScratch(pid: string, momentId: string): { outcome: string } | string {
    const s = this.scratch;
    if (!s || s.id !== momentId) return "This card is no longer open.";
    const p = this.e.participants.find((x) => x.id === pid);
    if (!p || p.status !== "joined") return "Not found.";
    const outcome = (s.outcomes[pid] ?? "none") as "gift" | "joker" | "extra" | "pass" | "none";
    if (!s.revealed.includes(pid)) {
      s.revealed.push(pid);
      if (outcome === "joker" || outcome === "extra" || outcome === "pass") this.grant(p, outcome);
      this.e.emit({ to: "pid", pid, type: "scratch_result", momentId, outcome });
    }
    return { outcome };
  }

  private scratch_tick(t: number): void {
    const s = this.scratch;
    if (!s || t < s.until) return;
    // auto-reveal: every unscratched card is revealed so the number of winning cards is exact
    for (const p of this.e.participants) if (p.status === "joined" && !s.revealed.includes(p.id) && this.eligible(false).includes(p)) this.revealScratch(p.id, s.id);
    const m = this.get(s.id);
    const winners = Object.entries(s.outcomes).map(([pid, prize]) => ({ pid, ticketId: this.e.ticketId(this.e.participants.find((x) => x.id === pid)!), prize }));
    this.results.push({ momentId: m.id, kind: "scratch", round: this.round, at: t, winners, winningCards: s.winningCards, redraws: 0 });
    this.e.emit({ to: "all", type: "moment_result", id: m.id, kind: "scratch", winners: [], winningCards: s.winningCards, bumper: false });
    const wasConcurrent = s.concurrent;
    this.scratch = null;
    m.status = "done"; m.endedAt = t; this.lastMomentCall = this.e.called.length;
    if (!wasConcurrent) this.afterMoment();
  }

  private completeMoment(m: Moment): void {
    m.status = "done"; m.endedAt = this.e.now(); this.lastMomentCall = this.e.called.length;
    this.afterMoment();
  }

  /** The next queued moment, or whatever was waiting for the moments to finish. */
  private afterMoment(): void {
    if (this.queue.length) return this.startNext();
    if (this.scratch && !this.scratch.concurrent) return; // still waiting for a pausing scratch card
    const c = this.cont; this.cont = "none";
    const e = this.e, t = e.now();
    switch (c) {
      case "start": e.paused = null; e.nextAt = e.settings.callMode === "manual" ? null : t; e.emit({ to: "all", type: "resume" }); break;
      case "resume": e.paused = null; e.nextAt = e.settings.callMode === "manual" ? null : t + 3000; e.emit({ to: "all", type: "resume" }); e.applyPendingEmergency(); break;
      case "intermission": e.paused = { type: "intermission", round: this.round, until: Math.max(t, this.intermissionUntil) }; break;
      case "finale": e.finishEngagement("All rounds complete"); break;
      default: e.paused = null;
    }
  }

  // ---------------------------------------------------------------- rounds
  onResultWindowEnd(): boolean {
    this.resultWindows++;
    if (this.cfg.momentsMode === "manual") return false;
    return this.runSlots([`award:${this.round}:${this.resultWindows}`], "resume", true);
  }

  /** All rewards of this round were awarded, or all 90 numbers were called. */
  finishRound(why: string): void {
    const e = this.e;
    if (this.round < this.rounds) for (const [lineId, ws] of e.winners) this.roundWinners.push({ round: this.round, lineId, winners: ws.map((w) => ({ ...w })) });
    e.logMsg(`Round ${this.round} of ${this.rounds} finished: ${why}`);
    e.emit({ to: "all", type: "round_end", round: this.round, of: this.rounds });
    if (this.round >= this.rounds) {
      // the last round's winners stay where they are (the ticket screen and report read them there)
      e.nextAt = null;
      if (this.cfg.momentsMode === "auto" && this.runSlots(["finale"], "finale")) return;
      return this.finishAllPending();
    }
    e.winners = new Map();
    this.between = true;
    this.intermissionUntil = e.now() + SCFG.INTERMISSION_MS;
    e.paused = { type: "intermission", round: this.round, until: this.intermissionUntil };
    e.nextAt = null;
    if (this.cfg.momentsMode === "auto") this.runSlots([`break:${this.round}:1`, `break:${this.round}:2`], "intermission");
  }

  /** Last round, no finale moment left (or manual): any moment still pending is flushed so the counters were truthful, then the engagement ends. */
  private finishAllPending(): void {
    if (this.cfg.momentsMode === "auto") {
      const rest = this.moments.filter((m) => m.status === "pending");
      if (rest.length) { rest.forEach((m) => (m.slot = "finale")); this.queue = rest.map((m) => m.id); this.cont = "finale"; this.startNext(); return; }
    }
    this.e.finishEngagement("All rounds complete");
  }

  private startNextRound(): void {
    const e = this.e;
    this.round++; this.resultWindows = 0; this.lastMomentCall = -99; this.between = false;
    e.called = []; e.remaining = Array.from({ length: 90 }, (_, i) => i + 1); e.current = null; e.lastDrawAt = 0;
    e.ticketKeys.clear();
    for (const p of e.participants) {
      const extra = p.boosters.extra > 0 && this.cfg.boostersAllowed;
      if (extra) { p.boosters.extra--; this.boosterUses.push({ at: e.now(), pid: p.id, kind: "extra", round: this.round }); }
      p.tickets = Array.from({ length: e.ticketCountFor() + (extra ? 1 : 0) }, () => e.newTicket());
    }
    e.paused = null;
    e.nextAt = e.settings.callMode === "manual" ? null : e.now() + 3000;
    e.logMsg(`Round ${this.round} of ${this.rounds} started with new tickets`);
    e.emit({ to: "all", type: "round_start", round: this.round, of: this.rounds });
  }

  // ---------------------------------------------------------------- the clock
  tick(): void {
    const e = this.e, t = e.now();
    this.lucky_tick(t);
    this.scratch_tick(t);
    const pz = e.paused;
    if (pz?.type === "intermission" && t >= pz.until && !this.queue.length && !this.lucky && !(this.scratch && !this.scratch.concurrent)) this.startNextRound();
  }

  // ---------------------------------------------------------------- manual mode
  /** The organizer presses "Start lucky draw" / "Start scratch card". */
  trigger(kind: "lucky" | "scratch"): string | null {
    const e = this.e;
    if (e.status !== "started") return "The engagement is not running.";
    if (this.cfg.momentsMode !== "manual") return "Surprise moments run automatically in this engagement.";
    if (e.paused) return "Wait until the engagement is not paused.";
    const m = this.moments.find((x) => x.status === "pending" && x.kind === kind && !(x.kind === "lucky" && x.bumper && this.moments.some((y) => y.status === "pending" && y.kind === "lucky" && !y.bumper)));
    if (!m) return kind === "lucky" ? "There are no lucky draws left." : "There are no scratch cards left.";
    this.queue = [m.id]; this.cont = "resume";
    this.startNext();
    return null;
  }

  // ---------------------------------------------------------------- boosters
  /** Joker: marks one called number that is on the ticket but not cut. The client sends its cut list (honour system, as with claims). */
  useJoker(pid: string, ticket: "A" | "B" | "C", cut: number[]): { number: number } | string {
    const e = this.e;
    if (!this.cfg.boostersAllowed) return "Boosters are not part of this engagement.";
    if (e.status !== "started") return "The engagement is not running.";
    const p = e.participants.find((x) => x.id === pid);
    if (!p) return "Not found.";
    if (p.boosters.joker < 1) return "You have no Joker.";
    const t = p.tickets[ticket === "A" ? 0 : ticket === "B" ? 1 : 2];
    if (!t) return "You do not have that ticket.";
    const mine = new Set(t.flat().filter((v): v is number => v !== null)), have = new Set(cut);
    const missed = e.called.filter((n) => mine.has(n) && !have.has(n));
    if (!missed.length) return "Nothing to mark: you have already cut every called number on this ticket.";
    const n = missed[e.rand(missed.length)]!;
    p.boosters.joker--;
    this.boosterUses.push({ at: e.now(), pid, kind: "joker", round: this.round });
    e.emit({ to: "pid", pid, type: "booster", boosters: { ...p.boosters } });
    return { number: n };
  }

  // ---------------------------------------------------------------- what everyone may be told
  still() {
    const e = this.e;
    const open = this.between ? 0 : e.settings.rewards.filter((l) => !e.winners.get(l.id)?.length).length;
    const prizes = open + Math.max(0, this.rounds - this.round) * e.settings.rewards.length; // this round's open rewards plus every later round's full list
    // before the engagement goes live the schedule does not exist yet: the counters show exactly what was configured
    const planned = e.status === "open" || e.status === "starting";
    const lucky = planned ? this.cfg.luckyDraws : this.moments.filter((m) => m.kind === "lucky" && (m.status === "pending" || m.status === "running")).length;
    const scratch = planned ? this.cfg.scratchCards : this.moments.filter((m) => m.kind === "scratch" && (m.status === "pending" || m.status === "running")).length;
    const nxt = this.moments.find((m) => m.status === "pending");
    const next = this.cfg.momentsMode === "manual" ? (nxt ? "any moment now" : "") : nxt ? (nxt.bumper ? "bumper lucky draw" : nxt.kind === "lucky" ? "lucky draw" : "scratch card") : "";
    return { prizes, lucky, scratch, round: this.round, rounds: this.rounds, next, enabled: this.enabled };
  }
  /** What a reconnecting phone needs to rebuild a moment that is on screen. */
  activeMoment() {
    const m = this.lucky ? this.get(this.lucky.id) : this.scratch ? this.get(this.scratch.id) : null;
    if (!m) return null;
    const until = this.lucky ? this.lucky.deadline : this.scratch!.until;
    return { id: m.id, kind: m.kind, winners: m.winners, bumper: m.bumper, prize: m.prize, leftMs: Math.max(0, until - this.e.now()) };
  }
  boostersOf(pid: string) { const p = this.e.participants.find((x) => x.id === pid); return p ? { ...p.boosters } : { joker: 0, extra: 0, pass: 0 }; }

  // ---------------------------------------------------------------- persistence
  toJSON() {
    return { round: this.round, roundWinners: this.roundWinners, moments: this.moments, slots: this.slots, results: this.results, queue: this.queue, cont: this.cont, intermissionUntil: this.intermissionUntil,
      resultWindows: this.resultWindows, between: this.between, lastMomentCall: this.lastMomentCall, lucky: this.lucky, scratch: this.scratch, boosterUses: this.boosterUses };
  }
  load(s: any): void { if (s) Object.assign(this, s); }
}

export type { PrizeKind };
