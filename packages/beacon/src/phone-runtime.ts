// The whole phone-side engagement loop, with no UI, so it can be tested without a browser and then wrapped by a thin page.
// It talks to exactly two things: the public beacon (through BeaconOpts) and our one small store (through deps.api).
import { generateTicket, type Ticket } from "../../shared/src/ticket";
import { ControlTracker, SAFETY_FAST, SAFETY_STANDARD, pausedAt, type ControlConfig } from "./control";
import { defaultCfg, keysInPlay, roundEid, validateCfg, type BreakCfg, type EngagementCfg, type PatternKey } from "./config";
import { RoundStore, activeBreak, activeIntermission, callRoundR, completionIndexKey, ticketsFor } from "./game";
import { NUMBERS, QUICKNET, fetchRound, pickNumber, roundAt, roundTimeMs, type BeaconOpts } from "./index";

export interface PhoneDeps {
  /** Calls our store. Must throw an Error with `.status` on HTTP errors, and a plain Error when offline. */
  api(method: string, path: string, body?: unknown): Promise<any>;
  beacon: BeaconOpts;
  /** A monotonic millisecond clock (performance.now in a browser). Never the wall clock. */
  mono(): number;
  store: { get(k: string): string | null; set(k: string, v: string): void };
  /** Optional: reads a public (CDN-cached) JSON file by absolute URL; used for the pause file when the engagement publishes one, so the Worker is not hit every few seconds. */
  getPublic?(url: string): Promise<any>;
  /** Test hook only. */
  verify?: (x: { round: number; signature: string; randomness: string }) => boolean;
}

export type Phase = "boot" | "missing" | "join" | "play" | "ended";
export interface RuntimeView {
  phase: Phase; error: string | null; pid: string | null; ticket: Ticket | null; log: number[]; nowRound: number | null;
  startRound: number; callSeconds: number; mode: "live" | "hold" | "blind" | "none"; paused: boolean; stopped: boolean;
  claimed: PatternKey[]; unsent: number; results: { pattern: PatternKey | "lucky"; ordinal: number; idx: number; count: number; winners?: string[]; round?: number }[]; pendingChecks: number; discarded: number;
  nextCallInSec: number | null;
  tickets: Ticket[]; cfg: EngagementCfg;
  /** The brand break showing right now, with seconds left; null when none. */
  brk: { title: string; kind: BreakCfg["kind"]; mediaUrl?: string; secondsLeft: number; winners?: number } | null;
  /** My earliest completion (0-based call index) of each house in play so far, or -1. */
  myIdx: Partial<Record<PatternKey, number>>;
  /** Each lucky draw of this engagement: whether its winners are published yet and whether this phone is one of them. */
  lucky: { ordinal: number; title: string; winners: number; published: boolean; won: boolean }[];
  /** The round being played (or just finished) and how many there are. */
  round: number; rounds: number;
  /** Between two rounds: which round comes next and how long until its first number. */
  intermission: { round: number; secondsLeft: number } | null;
  /** For each earlier round, the reward lines this phone received (a line is received when this phone completed it at the call the organizer published). */
  past: { round: number; got: { pattern: PatternKey; ordinal: number }[] }[];
}

export class PhoneRuntime {
  phase: Phase = "boot";
  error: string | null = null;
  pid: string | null = null;
  ticket: Ticket | null = null;
  tickets: Ticket[] = [];
  cfg: EngagementCfg = defaultCfg();
  startRound = 0;
  callSeconds = 0;
  trackClaims = true;
  controlUrl: string | null = null;
  store: RoundStore;
  tracker: ControlTracker | null = null;
  results: RuntimeView["results"] = [];
  /** Claims already sent (or not needed), as "round:house". */
  private claimedAll = new Set<string>();
  private cur = 1;
  private logs: number[][] = [[]];
  private ticketMemo = new Map<number, Ticket[]>();
  private offsetMs: number | null = null; // utc - mono
  private syncedAtMono = -Infinity;
  private lastControlPoll = -Infinity;
  private lastResultPoll = -Infinity;
  private get logCache(): number[] { return this.logs[this.cur - 1] ?? (this.logs[this.cur - 1] = []); }
  private controlFast = false;
  /** unknown: have not yet heard whether this engagement can be paused. none: the store says no pause key exists. known: we hold a verified control file. */
  private controlState: "unknown" | "none" | "known" = "unknown";
  private unknownSince: number | null = null;

  constructor(readonly eid: string, readonly deps: PhoneDeps) {
    this.store = new RoundStore(deps.beacon, deps.verify);
  }

  private key = (s: string) => `ctz:${this.eid}:${s}`;
  private get stride() { return this.callSeconds / QUICKNET.periodSec; }

  /** UTC now from the beacon's own schedule: one verified "latest" answer, then our monotonic clock carries it. Re-synced every minute. */
  async syncClock(): Promise<boolean> {
    const m = this.deps.mono();
    if (this.offsetMs !== null && m - this.syncedAtMono < 60_000) return true;
    const x = await fetchRound("latest", { ...this.deps.beacon, ...(this.deps.verify ? { verify: this.deps.verify as any } : {}) }, 0);
    if (!x) return this.offsetMs !== null;
    this.offsetMs = roundTimeMs(x.round) + (QUICKNET.periodSec * 1000) / 2 - m;
    this.syncedAtMono = m;
    return true;
  }
  get nowRound(): number | null { return this.offsetMs === null ? null : roundAt(this.deps.mono() + this.offsetMs); }

  async boot(): Promise<void> {
    try {
      const info = await this.deps.api("GET", `/api/z/${this.eid}/info`);
      this.startRound = info.startRound; this.callSeconds = info.callSeconds; this.trackClaims = info.trackClaims !== false; this.controlUrl = typeof info.controlUrl === "string" ? info.controlUrl : null; this.readCfg(info);
    } catch (e: any) {
      this.phase = e?.status === 404 ? "missing" : "boot";
      this.error = e?.status === 404 ? "This engagement link is not valid." : "Could not reach the engagement. Check your connection.";
      return;
    }
    const pid = this.deps.store.get(this.key("pid"));
    try { for (const p of JSON.parse(this.deps.store.get(this.key("claimed")) ?? "[]")) this.claimedAll.add(String(p).includes(":") ? String(p) : `1:${p}`); } catch { /* fresh start */ }
    if (pid) this.adopt(pid); else this.phase = "join";
    this.error = null;
  }

  /** Tickets, rewards and brand breaks come from the engagement's public settings; anything malformed falls back to the plain engagement. */
  private readCfg(info: any) {
    const v = validateCfg({ tickets: info?.tickets, rewards: info?.rewards, breaks: info?.breaks, rounds: info?.rounds });
    this.cfg = v.ok ? v.cfg : defaultCfg();
  }
  private adopt(pid: string) {
    this.pid = pid; this.ticketMemo.clear(); this.setCurrent(1); this.phase = "play";
  }
  private ticketsOf(round: number): Ticket[] {
    let t = this.ticketMemo.get(round);
    if (!t && this.pid) { t = ticketsFor(roundEid(this.eid, round), this.pid, this.cfg.tickets); this.ticketMemo.set(round, t); }
    return t ?? [];
  }
  /** Makes `round` the one shown: its tickets and its log. */
  private setCurrent(round: number) {
    this.cur = round; this.tickets = this.ticketsOf(round); this.ticket = this.tickets[0] ?? null;
    while (this.logs.length < round) this.logs.push([]);
  }

  /** Joins with a mobile number. The same number again returns the same participant (and the same ticket). */
  async join(phone: string, name?: string): Promise<boolean> {
    try {
      const r = await this.deps.api("POST", `/api/z/${this.eid}/join`, { phone, name });
      this.startRound = r.startRound; this.callSeconds = r.callSeconds; this.trackClaims = r.trackClaims !== false;
      if (r.tickets !== undefined || r.rewards !== undefined || r.breaks !== undefined || r.rounds !== undefined) this.readCfg(r);
      this.deps.store.set(this.key("pid"), r.pid);
      this.adopt(r.pid); this.error = null;
      return true;
    } catch (e: any) {
      this.error = e?.status === 409 ? "This engagement is full." : e?.status === 400 ? "Enter a valid mobile number." : e?.status === 503 ? "It is a busy day. Please try again in a few minutes." : "Could not join. Check your connection and try again.";
      return false;
    }
  }

  private async pollControl(now: number) {
    const m = this.deps.mono();
    const every = this.controlFast ? 6_000 : 9_000;
    if (m - this.lastControlPoll < every + (Math.floor(m) % 3000)) return; // 9 s plus a little jitter so phones do not all poll together
    this.lastControlPoll = m;
    let body: any = null;
    try { body = this.controlUrl && this.deps.getPublic ? await this.deps.getPublic(this.controlUrl) : await this.deps.api("GET", `/api/z/${this.eid}/control`); } catch (e: any) {
      if (e?.status === 404) { this.tracker = null; this.controlState = "none"; return; } // no key registered: this engagement cannot be paused
      this.tracker?.failed(now); return;
    }
    if (!body?.pubKey) { this.tracker?.failed(now); return; }
    if (!this.tracker) {
      const cfg: ControlConfig = { pubKey: body.pubKey, maxPauseRounds: body.maxPauseRounds, leadRounds: body.leadRounds };
      this.controlFast = body.leadRounds === SAFETY_FAST.leadRounds;
      const safety = body.leadRounds === SAFETY_FAST.leadRounds ? SAFETY_FAST : SAFETY_STANDARD;
      this.tracker = new ControlTracker(cfg, this.eid, safety, now);
    }
    if (await this.tracker.ingest(now, body)) this.controlState = "known";
  }

  private modeAt(now: number): RuntimeView["mode"] {
    if (this.controlState === "none") return "none";
    if (this.controlState === "unknown") return this.unknownSince !== null && now - this.unknownSince >= SAFETY_STANDARD.giveUpRounds ? "blind" : "hold";
    return this.tracker!.mode(now);
  }
  private roundFor(k: number, round = this.cur): number | null {
    return callRoundR(this.tracker ? this.tracker.state : null, this.startRound, this.stride, this.cfg.breaks, round, k);
  }
  /** The latest round whose first number is due. Rounds before it are played out (or being caught up). */
  private startedRounds(now: number): number {
    let n = 0;
    for (let r = 1; r <= this.cfg.rounds; r++) { const f = this.roundFor(0, r); if (f === null || f > now) break; n = r; }
    return n;
  }

  /** One pass of the loop. Call about once a second. Safe to call while offline (it simply makes no progress). */
  async tick(): Promise<RuntimeView> {
    if (this.phase === "ended") { await this.autoClaim(); await this.pollResults(); return this.view(); } // a claim that failed to send keeps being retried after the last call // the engagement is over, but the outcome is still worth fetching
    if (this.phase !== "play") return this.view();
    if (!(await this.syncClock())) { this.error = "Waiting for the clock. Check your connection."; return this.view(); }
    this.error = null;
    const now = this.nowRound!;
    await this.pollControl(now);
    if (this.controlState === "unknown" && this.unknownSince === null) this.unknownSince = now;
    const m = this.modeAt(now);
    const live = m === "live" || m === "none" || m === "blind"; // blind = we have been unable to ask for a long time: play on, visibly flagged
    const started = this.startedRounds(now);
    // beacon rounds we are entitled to reveal: their scheduled round has been published
    const want: number[] = [];
    for (let r = 1; r <= started && want.length < 8; r++) {
      if ((this.logs[r - 1]?.length ?? 0) >= NUMBERS) continue;
      for (let k = 0; k < NUMBERS && want.length < 8; k++) {
        const br = this.roundFor(k, r);
        if (br === null || br > now) break;
        if (!this.store.rounds.has(br)) want.push(br);
      }
    }
    await Promise.all(want.map((br, i) => (now - br <= 2 ? this.store.fetchLive(br, i) : this.store.fetchBackfill(br, i))));
    this.store.verifySome(2);
    if (live) for (let r = 1; r <= Math.max(1, started); r++) this.buildLog(now, r); // on hold we keep showing what we had, and reveal nothing new
    this.setCurrent(Math.max(1, started));
    if (m !== "blind") await this.autoClaim(); // never claim from a log that might be missing a pause we could not hear about
    await this.pollResults();
    const stopped = this.tracker?.state.stopRound != null && now >= this.tracker.state.stopRound;
    if ((this.cur >= this.cfg.rounds && (this.logs[this.cur - 1]?.length ?? 0) >= NUMBERS) || stopped) this.phase = "ended";
    return this.view();
  }

  private builtDiscards = 0;
  private builtMsgs = 0;
  /** Extends a round's call log with newly available rounds instead of recomputing all 90 calls every second. Rebuilds from scratch only if a provisional round was thrown away or an organizer message arrived. */
  private buildLog(now: number, round: number): number[] {
    const msgs = this.tracker?.log.length ?? 0;
    if (this.store.discarded !== this.builtDiscards || msgs !== this.builtMsgs) { this.logs = this.logs.map(() => []); this.builtDiscards = this.store.discarded; this.builtMsgs = msgs; } // a new organizer message can move later calls: re-derive
    while (this.logs.length < round) this.logs.push([]);
    const out = this.logs[round - 1]!;
    const id = roundEid(this.eid, round);
    for (let k = out.length; k < NUMBERS; k++) {
      const r = this.roundFor(k, round);
      if (r === null || r > now) break;
      const x = this.store.rounds.get(r);
      if (!x) break;
      out.push(pickNumber(id, k, x.randomness, out));
    }
    return out;
  }

  private unsent = 0;
  private claimLens: number[] = [];
  private async autoClaim() {
    if (!this.pid) return;
    const lens = this.logs.map((l) => l.length);
    if (lens.length === this.claimLens.length && lens.every((n, i) => n === this.claimLens[i]) && this.unsent === 0) return; // nothing new has been called and nothing is waiting to be sent
    this.claimLens = lens;
    this.unsent = 0;
    for (let r = 1; r <= this.logs.length; r++) {
      const tk = this.ticketsOf(r), log = this.logs[r - 1]!;
      if (!tk.length || !log.length) continue;
      for (const p of keysInPlay(this.cfg.rewards)) {
        const id = `${r}:${p}`;
        if (this.claimedAll.has(id)) continue;
        const idx = completionIndexKey(tk, p, log);
        if (idx < 0) continue;
        try {
          if (this.trackClaims) await this.deps.api("POST", `/api/z/${this.eid}/claims`, { pid: this.pid, claims: [{ pattern: p, idx, ...(r > 1 ? { round: r } : {}) }] });
          this.claimedAll.add(id);
          this.deps.store.set(this.key("claimed"), JSON.stringify([...this.claimedAll]));
        } catch { this.unsent++; /* kept: the next tick sends it again; a claim is never lost because nothing is marked sent until it was */ }
      }
    }
  }

  private allResults: NonNullable<RuntimeView["results"]> = [];
  private async pollResults() {
    const m = this.deps.mono();
    if (m - this.lastResultPoll < 15_000 || !this.logs.some((l) => l.length > 0)) return;
    this.lastResultPoll = m;
    try { this.allResults = (await this.deps.api("GET", `/api/z/${this.eid}/results`)).results ?? this.allResults; } catch { /* shown next time */ }
  }

  private currentBreak(now: number | null): RuntimeView["brk"] {
    if (now === null || this.phase !== "play" || !this.cfg.breaks.length || this.cur > 1) return null; // brand breaks belong to round 1
    const a = activeBreak(this.tracker ? this.tracker.state : null, this.startRound, this.stride, this.cfg.breaks, now);
    if (!a || this.offsetMs === null) return null;
    return { title: a.brk.title, kind: a.brk.kind, ...(a.brk.mediaUrl ? { mediaUrl: a.brk.mediaUrl } : {}), ...(a.brk.winners ? { winners: a.brk.winners } : {}), secondsLeft: Math.max(0, Math.round((roundTimeMs(a.endsAtRound) - (this.deps.mono() + this.offsetMs)) / 1000)) };
  }
  private luckyView(): RuntimeView["lucky"] {
    const out: RuntimeView["lucky"] = []; let n = 0;
    for (const b of this.cfg.breaks) {
      if (b.kind !== "lucky") continue;
      n++;
      const r = this.allResults.find((x) => x.pattern === "lucky" && x.ordinal === n);
      out.push({ ordinal: n, title: b.title, winners: b.winners ?? 3, published: !!r, won: !!r && !!this.pid && (r.winners ?? []).includes(this.pid) });
    }
    return out;
  }
  private myIdx(): Partial<Record<PatternKey, number>> {
    const o: Partial<Record<PatternKey, number>> = {};
    if (this.tickets.length) for (const k of keysInPlay(this.cfg.rewards)) o[k] = completionIndexKey(this.tickets, k, this.logCache);
    return o;
  }
  private pastView(): RuntimeView["past"] {
    const out: RuntimeView["past"] = [];
    for (let r = 1; r < this.cur; r++) {
      const tk = this.ticketsOf(r), log = this.logs[r - 1] ?? [];
      const got: { pattern: PatternKey; ordinal: number }[] = [];
      for (const x of this.allResults) {
        if ((x.round ?? 1) !== r || x.pattern === "lucky") continue;
        if (completionIndexKey(tk, x.pattern as PatternKey, log) === x.idx) got.push({ pattern: x.pattern as PatternKey, ordinal: x.ordinal });
      }
      out.push({ round: r, got });
    }
    return out;
  }

  view(): RuntimeView {
    const now = this.nowRound;
    const st = this.tracker?.state;
    const done = this.logCache.length >= NUMBERS;
    const nextInRound = !done ? this.roundFor(this.logCache.length) : null;
    const nextRoundFirst = done && this.cur < this.cfg.rounds ? this.roundFor(0, this.cur + 1) : null;
    const nextRound = nextInRound ?? nextRoundFirst;
    const secsTo = (br: number) => (this.offsetMs === null ? null : Math.max(0, Math.round((roundTimeMs(br) - (this.deps.mono() + this.offsetMs)) / 1000)));
    const inter = now !== null && this.cur < this.cfg.rounds ? activeIntermission(st ?? null, this.startRound, this.stride, this.cfg.breaks, this.cur + 1, now) : null;
    const claimedNow = keysInPlay(this.cfg.rewards).filter((k) => this.claimedAll.has(`${this.cur}:${k}`));
    return {
      phase: this.phase, error: this.error, pid: this.pid, ticket: this.ticket, log: this.logCache, nowRound: now, startRound: this.startRound, callSeconds: this.callSeconds,
      mode: now === null ? (this.controlState === "none" ? "none" : "hold") : this.modeAt(now), paused: !!st && now !== null && pausedAt(st, now), stopped: !!st && now !== null && st.stopRound !== null && now >= st.stopRound,
      claimed: claimedNow, unsent: this.unsent, results: this.allResults.filter((x) => (x.round ?? 1) === this.cur), pendingChecks: this.store.pending(), discarded: this.store.discarded,
      nextCallInSec: nextRound !== null && now !== null ? secsTo(nextRound) : null,
      tickets: this.tickets, cfg: this.cfg, brk: this.currentBreak(now), myIdx: this.myIdx(), lucky: this.luckyView(),
      round: this.cur, rounds: this.cfg.rounds, intermission: inter ? { round: this.cur + 1, secondsLeft: secsTo(inter.endsAtRound) ?? 0 } : null, past: this.pastView(),
    };
  }
}

export { generateTicket };
