// The whole phone-side engagement loop, with no UI, so it can be tested without a browser and then wrapped by a thin page.
// It talks to exactly two things: the public beacon (through BeaconOpts) and our one small store (through deps.api).
import { generateTicket, type Ticket } from "../../shared/src/ticket";
import { ControlTracker, SAFETY_FAST, SAFETY_STANDARD, pausedAt, type ControlConfig } from "./control";
import { defaultCfg, keysInPlay, validateCfg, type BreakCfg, type EngagementCfg, type PatternKey } from "./config";
import { RoundStore, activeBreak, callRoundFull, completionIndexKey, ticketsFor } from "./game";
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
  claimed: PatternKey[]; unsent: number; results: { pattern: PatternKey | "lucky"; ordinal: number; idx: number; count: number; winners?: string[] }[]; pendingChecks: number; discarded: number;
  nextCallInSec: number | null;
  tickets: Ticket[]; cfg: EngagementCfg;
  /** The brand break showing right now, with seconds left; null when none. */
  brk: { title: string; kind: BreakCfg["kind"]; mediaUrl?: string; secondsLeft: number; winners?: number } | null;
  /** My earliest completion (0-based call index) of each house in play so far, or -1. */
  myIdx: Partial<Record<PatternKey, number>>;
  /** Each lucky draw of this engagement: whether its winners are published yet and whether this phone is one of them. */
  lucky: { ordinal: number; title: string; winners: number; published: boolean; won: boolean }[];
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
  private claimed = new Set<PatternKey>();
  private offsetMs: number | null = null; // utc - mono
  private syncedAtMono = -Infinity;
  private lastControlPoll = -Infinity;
  private lastResultPoll = -Infinity;
  private logCache: number[] = [];
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
    try { for (const p of JSON.parse(this.deps.store.get(this.key("claimed")) ?? "[]")) this.claimed.add(p); } catch { /* fresh start */ }
    if (pid) this.adopt(pid); else this.phase = "join";
    this.error = null;
  }

  /** Tickets, rewards and brand breaks come from the engagement's public settings; anything malformed falls back to the plain engagement. */
  private readCfg(info: any) {
    const v = validateCfg({ tickets: info?.tickets, rewards: info?.rewards, breaks: info?.breaks });
    this.cfg = v.ok ? v.cfg : defaultCfg();
  }
  private adopt(pid: string) {
    this.pid = pid; this.tickets = ticketsFor(this.eid, pid, this.cfg.tickets); this.ticket = this.tickets[0]!; this.phase = "play";
  }

  /** Joins with a mobile number. The same number again returns the same participant (and the same ticket). */
  async join(phone: string, name?: string): Promise<boolean> {
    try {
      const r = await this.deps.api("POST", `/api/z/${this.eid}/join`, { phone, name });
      this.startRound = r.startRound; this.callSeconds = r.callSeconds; this.trackClaims = r.trackClaims !== false;
      if (r.tickets !== undefined || r.rewards !== undefined || r.breaks !== undefined) this.readCfg(r);
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
  private roundFor(k: number): number | null {
    return callRoundFull(this.tracker ? this.tracker.state : null, this.startRound, this.stride, this.cfg.breaks, k);
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
    // rounds we are entitled to reveal: scheduled round has been published
    const want: number[] = [];
    for (let k = 0; k < NUMBERS; k++) {
      const r = this.roundFor(k);
      if (r === null || r > now) break;
      if (!this.store.rounds.has(r)) want.push(r);
    }
    const batch = want.slice(0, 8);
    await Promise.all(batch.map((r, i) => (now - r <= 2 ? this.store.fetchLive(r, i) : this.store.fetchBackfill(r, i))));
    this.store.verifySome(2);
    if (live) this.logCache = this.buildLog(now); // on hold we keep showing what we had, and reveal nothing new
    if (m !== "blind") await this.autoClaim(); // never claim from a log that might be missing a pause we could not hear about
    await this.pollResults();
    if (this.logCache.length >= NUMBERS || (this.tracker?.state.stopRound != null && now >= this.tracker.state.stopRound)) this.phase = "ended";
    return this.view();
  }

  private builtDiscards = 0;
  private builtMsgs = 0;
  /** Extends the call log with newly available rounds instead of recomputing all 90 calls every second. Rebuilds from scratch only if a provisional round was thrown away. */
  private buildLog(now: number): number[] {
    const msgs = this.tracker?.log.length ?? 0;
    if (this.store.discarded !== this.builtDiscards || msgs !== this.builtMsgs) { this.logCache = []; this.builtDiscards = this.store.discarded; this.builtMsgs = msgs; } // a new organizer message can move later calls: re-derive
    const out = this.logCache;
    for (let k = out.length; k < NUMBERS; k++) {
      const r = this.roundFor(k);
      if (r === null || r > now) break;
      const x = this.store.rounds.get(r);
      if (!x) break;
      out.push(pickNumber(this.eid, k, x.randomness, out));
    }
    return out;
  }

  private unsent = 0;
  private claimLen = -1;
  private async autoClaim() {
    if (!this.tickets.length || !this.pid) return;
    if (this.logCache.length === this.claimLen && this.unsent === 0) return; // nothing new has been called and nothing is waiting to be sent
    this.claimLen = this.logCache.length;
    this.unsent = 0;
    for (const p of keysInPlay(this.cfg.rewards)) {
      if (this.claimed.has(p)) continue;
      const idx = completionIndexKey(this.tickets, p, this.logCache);
      if (idx < 0) continue;
      try {
        if (this.trackClaims) await this.deps.api("POST", `/api/z/${this.eid}/claims`, { pid: this.pid, claims: [{ pattern: p, idx }] });
        this.claimed.add(p);
        this.deps.store.set(this.key("claimed"), JSON.stringify([...this.claimed]));
      } catch { this.unsent++; /* kept: the next tick sends it again; a claim is never lost because nothing is marked sent until it was */ }
    }
  }

  private async pollResults() {
    const m = this.deps.mono();
    if (m - this.lastResultPoll < 15_000 || this.logCache.length === 0) return;
    this.lastResultPoll = m;
    try { this.results = (await this.deps.api("GET", `/api/z/${this.eid}/results`)).results ?? this.results; } catch { /* shown next time */ }
  }

  private currentBreak(now: number | null): RuntimeView["brk"] {
    if (now === null || this.phase !== "play" || !this.cfg.breaks.length) return null;
    const a = activeBreak(this.tracker ? this.tracker.state : null, this.startRound, this.stride, this.cfg.breaks, now);
    if (!a || this.offsetMs === null) return null;
    return { title: a.brk.title, kind: a.brk.kind, ...(a.brk.mediaUrl ? { mediaUrl: a.brk.mediaUrl } : {}), ...(a.brk.winners ? { winners: a.brk.winners } : {}), secondsLeft: Math.max(0, Math.round((roundTimeMs(a.endsAtRound) - (this.deps.mono() + this.offsetMs)) / 1000)) };
  }
  private luckyView(): RuntimeView["lucky"] {
    const out: RuntimeView["lucky"] = []; let n = 0;
    for (const b of this.cfg.breaks) {
      if (b.kind !== "lucky") continue;
      n++;
      const r = this.results.find((x) => x.pattern === "lucky" && x.ordinal === n);
      out.push({ ordinal: n, title: b.title, winners: b.winners ?? 3, published: !!r, won: !!r && !!this.pid && (r.winners ?? []).includes(this.pid) });
    }
    return out;
  }
  private myIdx(): Partial<Record<PatternKey, number>> {
    const o: Partial<Record<PatternKey, number>> = {};
    if (this.tickets.length) for (const k of keysInPlay(this.cfg.rewards)) o[k] = completionIndexKey(this.tickets, k, this.logCache);
    return o;
  }

  view(): RuntimeView {
    const now = this.nowRound;
    const st = this.tracker?.state;
    const nextRound = this.logCache.length < NUMBERS ? this.roundFor(this.logCache.length) : null;
    return {
      phase: this.phase, error: this.error, pid: this.pid, ticket: this.ticket, log: this.logCache, nowRound: now, startRound: this.startRound, callSeconds: this.callSeconds,
      mode: now === null ? (this.controlState === "none" ? "none" : "hold") : this.modeAt(now), paused: !!st && now !== null && pausedAt(st, now), stopped: !!st && now !== null && st.stopRound !== null && now >= st.stopRound,
      claimed: [...this.claimed], unsent: this.unsent, results: this.results, pendingChecks: this.store.pending(), discarded: this.store.discarded,
      nextCallInSec: nextRound !== null && now !== null && this.offsetMs !== null ? Math.max(0, Math.round((roundTimeMs(nextRound) - (this.deps.mono() + this.offsetMs)) / 1000)) : null,
      tickets: this.tickets, cfg: this.cfg, brk: this.currentBreak(now), myIdx: this.myIdx(), lucky: this.luckyView(),
    };
  }
}

export { generateTicket };
