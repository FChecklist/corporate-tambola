// The whole phone-side engagement loop, with no UI, so it can be tested without a browser and then wrapped by a thin page.
// It talks to exactly two things: the public beacon (through BeaconOpts) and our one small store (through deps.api).
import { generateTicket, type Ticket } from "../../shared/src/ticket";
import { winningNumbers } from "./house-rules";
import { ALL_SAFETIES, ControlTracker, SAFETY_FAST, SAFETY_STANDARD, hostControlOf, pausedAt, type ControlConfig } from "./control";
import { CLAIM_WINDOW_CALLS, GRACE_ROUNDS, LATE_LAG_ROUNDS, defaultCfg, houseLabel, keysInPlay, linesFor, roundEid, validateCfg, votersFor, type BreakCfg, type EngagementCfg, type PatternKey } from "./config";
import { PrizeEngine, countFromOf } from "./prize-engine";
import { BOGEYS_OUT, RoundStore, activeBreak, activeIntermission, callRoundR, completionIndexKey, hostGameOf, luckyRound, luckyWinners, ticketsFor, type PublicClaim } from "./game";
import { seatOfPid } from "./unique-ticket";
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
  /** Test hook only: never end the engagement early because every prize was awarded (lets a test watch all 90 numbers). */
  noEarlyEnd?: boolean;
  /** Test hook only. */
  verify?: (x: { round: number; signature: string; randomness: string }) => boolean;
}

export type Phase = "boot" | "missing" | "join" | "play" | "ended";
export interface RuntimeView {
  phase: Phase; error: string | null; pid: string | null; ticket: Ticket | null; log: number[]; nowRound: number | null;
  locked: boolean;
  startRound: number; scheduledRound: number; callSeconds: number; mode: "live" | "hold" | "blind" | "none"; paused: boolean; stopped: boolean;
  claimed: PatternKey[]; unsent: number; results: { pattern: PatternKey | "lucky"; ordinal: number; idx: number; count: number; winners?: string[]; round?: number }[]; pendingChecks: number; discarded: number;
  nextCallInSec: number | null;
  tickets: Ticket[]; cfg: EngagementCfg;
  /** The brand break showing right now, with seconds left; null when none. */
  brk: { title: string; kind: BreakCfg["kind"]; mediaUrl?: string; secondsLeft: number; seconds: number; winners?: number } | null;
  /** My earliest completion (0-based call index) of each house in play so far, or -1. */
  myIdx: Partial<Record<PatternKey, number>>;
  /** Each lucky draw of this engagement: whether its winners are published yet and whether this phone is one of them. */
  lucky: { ordinal: number; title: string; winners: number; published: boolean; won: boolean; style: "draw" | "scratch" }[];
  /** The organizer's latest message to everyone (shown and spoken on phones), or null. */
  announcement: { id: string; text: string } | null;
  /** The round being played (or just finished) and how many there are. */
  round: number; rounds: number;
  /** Between two rounds: which round comes next and how long until its first number. */
  intermission: { round: number; secondsLeft: number } | null;
  /** For each earlier round, the reward lines this phone received (a line is received when this phone completed it at the call the organizer published). */
  past: { round: number; got: { pattern: PatternKey; ordinal: number }[] }[];
  /** Every reward line this phone won, in any round (a line is won when this phone completed it at the call the results name). `text` is what the organizer wrote for that line. */
  won: { round: number; pattern: PatternKey; ordinal: number; text: string; cells: number[]; idx: number }[];
  /** True when every reward line of the round being played has been awarded. */
  allAwarded: boolean;
  /** The engagement ended because every prize was awarded (not because all 90 numbers were called). */
  endedByPrizes: boolean;
  /** Joined after the first number: numbers called before `countFromRound` are gone for this phone. `secondsUntil` > 0 means the phone's own numbers have not started yet; `hidden` is how many numbers were called before it joined. */
  late: { countFromRound: number; secondsUntil: number; hidden: number } | null;
  /** The winners were worked out on this phone from the public seat list (true), or taken from the organizer's published results (false). */
  localWinners: boolean;
  /** Who calls the numbers: the software (auto) or a Host pressing a button for each number (host). */
  callMode: "auto" | "host";
  /** Host mode, game running: the last number has reached this phone and the Host has not pressed for the next one yet. */
  waitingForHost: boolean;
  /** The numbers of the round being played that THIS player has tapped on their ticket (kept on the phone). The ticket never marks itself. */
  marks: number[];
  /** The houses this player's own marks have completed and not yet claimed (and that still have an open position): a Claim button is shown for each. */
  claimable: PatternKey[];
  /** The houses this player pressed Claim for in the round being played (whether or not the result is out yet). */
  pressed: PatternKey[];
  /** Wrong claims (Bogeys) this player made in the round being played, per house. Two on the same house and the ticket is out of that house for the round (`outOf`). */
  bogeys: { pattern: PatternKey; n: number }[];
  /** The houses this ticket is out of for the round being played (two Bogeys on it): no Claim button, and no later claim of theirs counts anywhere. */
  outOf: PatternKey[];
  /** The public claims this phone knows of (every phone works the winners out from these and the numbers). */
  claimsKnown: number;
}

export class PhoneRuntime {
  phase: Phase = "boot";
  error: string | null = null;
  pid: string | null = null;
  ticket: Ticket | null = null;
  tickets: Ticket[] = [];
  cfg: EngagementCfg = defaultCfg();
  startRound = 0;
  /** The time the organizer gave. The first number is GRACE_ROUNDS later (startRound above already includes it). */
  scheduledRound = 0;
  callSeconds = 0;
  trackClaims = true;
  controlUrl: string | null = null;
  /** The engagement was not paid for by its start time: nothing is shown until it is. */
  locked = false;
  announcement: { id: string; text: string } | null = null;
  store: RoundStore;
  tracker: ControlTracker | null = null;
  results: RuntimeView["results"] = [];
  /** Claims already sent (or not needed), as "round:house". */
  private claimedAll = new Set<string>();
  private cur = 1;
  private logs: number[][] = [[]];
  private ticketMemo = new Map<number, Ticket[]>();
  private offsetMs: number | null = null; // utc - mono
  private offsetSamples: number[] = []; // the last few clock answers (the median is used)
  private syncedAtMono = -Infinity;
  private clockFailSince: number | null = null; // when the public clock first failed to answer (a blocked network): after 15 seconds the banner says what to try
  private sendingBogeys = false; // one send loop at a time, so two ticks that overlap never send the same Bogey twice
  private lastControlPoll = -Infinity;
  private lastResultPoll = -Infinity;
  private get logCache(): number[] { return this.logs[this.cur - 1] ?? (this.logs[this.cur - 1] = []); }
  private controlFast = false;
  private pollBaseMs = 9_000; private pollJitterMs = 3_000;
  /** The engagement can be held for non-payment (the server says so), so a phone near its start keeps asking. */
  private gated = false;
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
    // One answer of "latest" can be a round or two old (a cached mirror) and then makes the clock run SLOW (seen: the countdown jumped 1:43 -> 1:49). A stale answer is never too new, so of the
    // last 5 answers the NEWEST estimate (the largest) is the most accurate; the error left is under 1.5 s. An answer more than 15 s below the best one (a changed clock) starts the list again.
    const sample = roundTimeMs(x.round) + (QUICKNET.periodSec * 1000) / 2 - m;
    if (this.offsetSamples.length && Math.max(...this.offsetSamples) - sample > 15_000) this.offsetSamples = [];
    this.offsetSamples.push(sample); if (this.offsetSamples.length > 5) this.offsetSamples.shift();
    this.offsetMs = Math.max(...this.offsetSamples);
    this.syncedAtMono = m;
    return true;
  }
  get nowRound(): number | null { return this.offsetMs === null ? null : roundAt(this.deps.mono() + this.offsetMs); }

  async boot(): Promise<void> {
    try {
      const info = await this.deps.api("GET", `/api/z/${this.eid}/info`);
      this.cap = Number(info.cap) || 0; this.scheduledRound = info.startRound; this.startRound = info.startRound + GRACE_ROUNDS; this.callSeconds = info.callSeconds; this.trackClaims = info.trackClaims !== false; this.controlUrl = typeof info.controlUrl === "string" ? info.controlUrl : null; this.locked = !!info.locked; this.gated = info.locked !== undefined; this.readCfg(info);
    } catch (e: any) {
      const st = e?.status; // the real reason: a wrong link, a game that is not open, or the connection / the service
      this.phase = st === 404 || st === 403 || st === 410 ? "missing" : "boot";
      this.error = st === 404 ? "This engagement link is not valid." : st === 403 || st === 410 ? String(e?.message || "This engagement is not open yet.") : st && st >= 500 ? "The game could not be opened just now. Please try again in a minute." : "Could not reach the engagement. Check your connection.";
      return;
    }
    const pid = this.deps.store.get(this.key("pid"));
    this.myJr = Number(this.deps.store.get(this.key("jr")) ?? 0) || 0;
    try { for (const p of JSON.parse(this.deps.store.get(this.key("claimed")) ?? "[]")) this.claimedAll.add(String(p).includes(":") ? String(p) : `1:${p}`); } catch { /* fresh start */ }
    this.loadMarks();
    if (pid) this.adopt(pid); else this.phase = "join";
    this.error = null;
  }

  /** Tickets, rewards and brand breaks come from the engagement's public settings; anything malformed falls back to the plain engagement. */
  private readCfg(info: any) {
    const v = validateCfg({ tickets: info?.tickets, ties: info?.ties, rewards: info?.rewards, breaks: info?.breaks, rounds: info?.rounds, invites: info?.invites, opening: info?.opening, closing: info?.closing, callMode: info?.callMode === "host" ? "host" : undefined }, undefined, { stored: true });
    this.cfg = v.ok ? v.cfg : defaultCfg();
    if (this.tracker) Object.assign(this.tracker.cfg, hostControlOf(hostGameOf(this.cfg))); // the settings are locked once the game starts; before that a re-read keeps the control rules in step
  }
  private get hostMode() { return this.cfg.callMode === "host"; }

  // ---- real housie: the ticket never marks itself. The player's own marks, presses and Bogeys are kept on this phone (ctz:<eid>:marks) ----
  /** round -> the numbers this player tapped */
  private marks = new Map<number, Set<number>>();
  /** "round:house" for every Claim the player pressed and the phone accepted (the claim itself is sent by autoClaim, and retried until it is through) */
  private pressed = new Set<string>();
  /** "round:house" -> wrong claims (Bogeys) on it; at BOGEYS_OUT the ticket is out of that house for the round */
  private bogeys = new Map<string, number>();
  /** Bogey records the store has not taken yet (sent again on the next tick, like a claim) */
  private bogeyUnsent: { pattern: PatternKey; round: number }[] = [];
  private loadMarks() {
    this.marks.clear(); this.pressed.clear(); this.bogeys.clear();
    try {
      const j = JSON.parse(this.deps.store.get(this.key("marks")) ?? "{}");
      for (const [r, ns] of Object.entries(j?.marks ?? {})) if (Array.isArray(ns)) this.marks.set(Number(r), new Set(ns.map(Number).filter((n) => n >= 1 && n <= NUMBERS)));
      for (const p of j?.pressed ?? []) if (typeof p === "string" && p.includes(":")) this.pressed.add(p);
      for (const [id, n] of Object.entries(j?.bogeys ?? {})) if (id.includes(":") && Number(n) > 0) this.bogeys.set(id, Number(n));
    } catch { /* fresh start */ }
  }
  private saveMarks() {
    const marks: Record<string, number[]> = {}; for (const [r, s] of this.marks) marks[r] = [...s].sort((a, b) => a - b);
    this.deps.store.set(this.key("marks"), JSON.stringify({ marks, pressed: [...this.pressed], bogeys: Object.fromEntries(this.bogeys) }));
  }
  private bogeysOn(key: PatternKey, round = this.cur) { return this.bogeys.get(`${round}:${key}`) ?? 0; }
  /** Out of a house for the round: BOGEYS_OUT wrong claims on it. */
  private outOf(key: PatternKey, round = this.cur) { return this.bogeysOn(key, round) >= BOGEYS_OUT; }
  /** Tells the store about a Bogey (every phone must know it, so the winners agree). Kept and sent again if the store cannot be reached. */
  private async sendBogeys() {
    if (this.sendingBogeys) return; // the loop already running also sends anything added meanwhile (its condition is read again after every send)
    this.sendingBogeys = true;
    try { await this.sendBogeysNow(); } finally { this.sendingBogeys = false; }
  }
  private async sendBogeysNow() {
    while (this.bogeyUnsent.length && this.pid) {
      const b = this.bogeyUnsent[0]!;
      try {
        const ans = this.trackClaims ? await this.deps.api("POST", `/api/z/${this.eid}/bogey`, { pid: this.pid, device: this.device(), pattern: b.pattern, ...(b.round > 1 ? { round: b.round } : {}) }) : null;
        this.bogeyUnsent.shift();
        if (ans && Number(ans.atMs) > 0) this.noteClaims([{ pid: this.pid, pattern: b.pattern, round: b.round, idx: -1, atMs: Number(ans.atMs), bogey: true }]);
      } catch { break; /* the next tick tries again */ }
    }
  }
  /** The numbers this player has marked in `round`, as a "log" to judge completeness on: what the player SAYS is complete. Whether it is true is checked only at Claim time, against the called numbers (a Bogey if not). */
  private markedLog(round: number): number[] { return [...(this.marks.get(round) ?? [])]; }
  /** The player taps a number on their ticket. A number that has not been called yet is refused (nothing is marked); a called number is marked, and tapping it again unmarks it. */
  mark(n: number): { ok: true; marked: boolean } | { ok: false; error: string } {
    if (this.phase !== "play" && this.phase !== "ended") return { ok: false, error: "The game has not started on this phone yet." }; // (after the last number a player may still mark it and claim)
    if (!Number.isInteger(n) || n < 1 || n > NUMBERS) return { ok: false, error: `${n} is not a number of this game.` };
    let s = this.marks.get(this.cur); if (!s) { s = new Set(); this.marks.set(this.cur, s); }
    const marked = !s.has(n);
    if (marked && !this.visibleLog().includes(n)) return { ok: false, error: `${n} has not been called yet. Keep listening.` }; // (a mark can always be taken off, called or not: that is how a Bogey is put right)
    if (marked) s.add(n); else s.delete(n);
    this.saveMarks();
    return { ok: true, marked };
  }
  /** The houses in play that this player's own marks complete and that they have not claimed yet, and are not out of (Unlucky is never claimed: the software decides it). */
  private claimableNow(): PatternKey[] {
    if (!this.tickets.length || (this.phase !== "play" && this.phase !== "ended")) return [];
    const ml = this.markedLog(this.cur);
    return keysInPlay(this.cfg.rewards).filter((k) => k !== "unlucky" && !this.pressed.has(`${this.cur}:${k}`) && !this.outOf(k) && completionIndexKey(this.tickets, k, ml) >= 0);
  }
  /**
   * The player presses Claim for a house. The phone checks the marks against the REAL called numbers: if the house is complete there, the claim goes to the store (and is retried until it is through)
   * and this phone remembers "claimed by me"; if not, it is a BOGEY: nothing is sent, the Bogey is counted, and the player can fix the marks and claim again. Whether the claim WINS is decided by
   * every phone from the public claims and numbers (it must be the real completion call, and in time: before the next number).
   */
  async claim(key: PatternKey): Promise<{ ok: true; sent: boolean; idx: number } | { ok: false; bogey: boolean; out?: boolean; error: string }> {
    if (!this.pid || !this.tickets.length) return { ok: false, bogey: false, error: "The game has not started on this phone yet." };
    if (!keysInPlay(this.cfg.rewards).includes(key) || key === "unlucky") return { ok: false, bogey: false, error: "That prize is not in this game." };
    const id = `${this.cur}:${key}`, label = houseLabel(key);
    if (this.outOf(key)) return { ok: false, bogey: false, out: true, error: `Two Bogeys on ${label}: this ticket is out of the ${label} prize. Other prizes are still open to you.` };
    if (this.pressed.has(id)) return { ok: true, sent: this.claimedAll.has(id), idx: completionIndexKey(this.tickets, key, this.maskedLog(this.cur)) };
    if (completionIndexKey(this.tickets, key, this.markedLog(this.cur)) < 0) return { ok: false, bogey: false, error: "Mark every number of this prize on your ticket first, then press Claim." };
    const log = this.maskedLog(this.cur), called = new Set(log.filter((n) => n > 0)), wrong = [...(this.marks.get(this.cur) ?? [])].find((n) => !called.has(n));
    const idx = completionIndexKey(this.tickets, key, log);
    if (wrong !== undefined || idx < 0) { // a Bogey: the marks do not stand up against the called numbers. The store is told (every phone must know, so the winners agree).
      const n = this.bogeysOn(key) + 1; this.bogeys.set(id, n); this.saveMarks();
      this.bogeyUnsent.push({ pattern: key, round: this.cur }); await this.sendBogeys();
      const why = wrong !== undefined ? `Bogey! ${wrong} has not been called. Unmark it and keep playing.` : "Bogey! This prize is not complete on the called numbers. Check your ticket and keep playing.";
      return n >= BOGEYS_OUT ? { ok: false, bogey: true, out: true, error: `${why} Two Bogeys on ${label}: this ticket is out of the ${label} prize. Other prizes are still open to you.` } : { ok: false, bogey: true, error: why };
    }
    this.pressed.add(id); this.saveMarks();
    this.claimLens = []; // make the next autoClaim look again
    await this.autoClaim();
    return { ok: true, sent: this.claimedAll.has(id), idx };
  }
  /**
   * For tests, rehearsals and the Chrome simulations only (never called by the page): plays like an attentive person: taps every called number on the ticket that is not marked yet and presses Claim
   * for every prize the marks complete. `claim`: false = never press Claim; a list of houses or a function = press only for those. `tap`: false = do not tap (only claim what is already marked). Returns what was pressed.
   */
  async playAlong(o: { claim?: boolean | readonly PatternKey[] | ((key: PatternKey) => boolean); tap?: boolean } = {}): Promise<PatternKey[]> {
    if (!this.tickets.length || (this.phase !== "play" && this.phase !== "ended")) return [];
    if (o.tap !== false) {
      const mine = new Set(this.tickets.flatMap((t) => t.flat().filter((x): x is number => x !== null)));
      const m = this.marks.get(this.cur);
      for (const n of this.visibleLog()) if (mine.has(n) && !m?.has(n)) this.mark(n);
    }
    const out: PatternKey[] = [];
    if (o.claim === false) return out;
    const wants = (k: PatternKey) => (typeof o.claim === "function" ? o.claim(k) : Array.isArray(o.claim) ? (o.claim as readonly PatternKey[]).includes(k) : true);
    for (const k of this.claimableNow()) { if (!wants(k)) continue; const r = await this.claim(k); if (r.ok) out.push(k); }
    return out;
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

  /** This device's own random id (made once, kept on the device). A ticket belongs to the one device that joined with it; the store only keeps a hash. */
  private device(): string {
    let d = this.deps.store.get("ctz:device");
    if (!d || !/^[0-9a-f]{32}$/.test(d)) { d = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""); this.deps.store.set("ctz:device", d); }
    return d;
  }

  /** Joins with a mobile number. The same number again returns the same participant (and the same ticket). */
  async join(phone: string, name?: string, invite?: { from?: number; cat?: string }, empId?: string): Promise<boolean> {
    try {
      const r = await this.deps.api("POST", `/api/z/${this.eid}/join`, { phone, name, ...(empId ? { empId } : {}), device: this.device(), ...(invite && Number.isInteger(invite.from) ? { from: invite.from, cat: invite.cat } : {}) });
      this.scheduledRound = r.startRound; this.startRound = r.startRound + GRACE_ROUNDS; this.callSeconds = r.callSeconds; this.trackClaims = r.trackClaims !== false;
      if (r.tickets !== undefined || r.rewards !== undefined || r.breaks !== undefined || r.rounds !== undefined || r.opening !== undefined || r.closing !== undefined || r.callMode !== undefined) this.readCfg(r);
      this.deps.store.set(this.key("pid"), r.pid);
      this.myJr = Number(r.jr) > 0 ? Number(r.jr) : 0; this.deps.store.set(this.key("jr"), String(this.myJr));
      this.adopt(r.pid); this.error = null;
      return true;
    } catch (e: any) {
      const m = String(e?.message ?? "").trim(), st = Number(e?.status) || 0;
      const own = st >= 400 && m !== "" && !/^http \d+$/.test(m); // the server's own plain words say what is wrong and what to do (an employee ID, a full game, a busy minute): they are shown as they are
      this.error = own ? m : st === 503 ? "It is a busy day. Please try again in a few minutes." : "Could not join. Check your connection and try again.";
      return false;
    }
  }

  private async pollControl(now: number) {
    const m = this.deps.mono();
    if (this.controlState === "none" && !this.locked) {
      // nothing can be paused here (no key was registered, and none can be after the start), so there is almost nothing to ask:
      // once the start has passed a hold can no longer begin, and before it we ask rarely, or every few seconds close to the start if it can be held
      const toStart = this.scheduledRound - now; // a hold can only begin around the time the organizer gave
      if (toStart < -20) { if (m - this.lastControlPoll < 60_000 + (Math.floor(m) % 3000)) return; } // after the start: once a minute, so a key the organizer registers late (a game built through the AI link, console opened during the game) still reaches every phone and Pause / End the game work
      else
      if (m - this.lastControlPoll < (this.gated && toStart < 40 ? 9_000 : 60_000) + (Math.floor(m) % 3000)) return;
    } else if (m - this.lastControlPoll < this.pollBaseMs + (Math.floor(m) % this.pollJitterMs)) return; // the profile's interval plus a little jitter so phones do not all poll together
    this.lastControlPoll = m;
    let body: any = null;
    try { body = this.controlUrl && this.deps.getPublic ? await this.deps.getPublic(this.controlUrl) : await this.deps.api("GET", `/api/z/${this.eid}/control`); } catch (e: any) {
      if (e?.status === 404) { if (this.locked) { this.locked = false; await this.reloadSchedule(); } this.tracker = null; this.controlState = "none"; return; } // no key registered: this engagement cannot be paused
      this.tracker?.failed(now); return;
    }
    this.announcement = body && body.ann && typeof body.ann.id === "string" && typeof body.ann.text === "string" ? { id: body.ann.id, text: body.ann.text.slice(0, 200) } : null;
    const wasLocked = this.locked; this.locked = !!body?.locked;
    if (wasLocked && !this.locked) await this.reloadSchedule(); // paid at last: the start time has moved, read it again
    if (!body?.pubKey) { this.tracker?.failed(now); return; }
    // the Hosts' console keys ride in the same file as the organizer's key (trusted the same way, on first use); the list only grows, and never beyond the team's size
    const hostKeys: string[] = Array.isArray(body.hostKeys) ? body.hostKeys.filter((k: unknown): k is string => typeof k === "string" && /^[0-9a-f]{64}$/i.test(k)).slice(0, 5) : [];
    if (!this.tracker) {
      const cfg: ControlConfig = { pubKey: body.pubKey, maxPauseRounds: body.maxPauseRounds, leadRounds: body.leadRounds, hostKeys, ...hostControlOf(hostGameOf(this.cfg)) };
      this.controlFast = body.leadRounds === SAFETY_FAST.leadRounds;
      const safety = ALL_SAFETIES.find((s) => s.leadRounds === body.leadRounds) ?? SAFETY_STANDARD;
      if (safety !== SAFETY_FAST && safety !== SAFETY_STANDARD) { this.pollBaseMs = Math.round(safety.pollMaxSec * 750); this.pollJitterMs = Math.round(safety.pollMaxSec * 250); }
      else { this.pollBaseMs = this.controlFast ? 6_000 : 9_000; this.pollJitterMs = 3_000; }
      if (this.hostMode) { this.pollBaseMs = 5_000; this.pollJitterMs = 2_000; } // a Host's press must reach every phone within seconds: the fast safety's timer (5 to 7 s), whatever the game's size
      this.tracker = new ControlTracker(cfg, this.eid, safety, now);
    } else if (hostKeys.length > (this.tracker.cfg.hostKeys?.length ?? 0)) this.tracker.cfg.hostKeys = [...new Set([...(this.tracker.cfg.hostKeys ?? []), ...hostKeys])].slice(0, 5);
    if (await this.tracker.ingest(now, body)) this.controlState = "known";
  }

  private async reloadSchedule() {
    try { const info = await this.deps.api("GET", `/api/z/${this.eid}/info`); this.scheduledRound = info.startRound; this.startRound = info.startRound + GRACE_ROUNDS; this.callSeconds = info.callSeconds; this.gated = info.locked !== undefined; this.readCfg(info); } catch { /* the next poll tries again */ }
  }
  private modeAt(now: number): RuntimeView["mode"] {
    if (this.locked) return "hold";
    if (this.controlState === "none") return "none";
    if (this.controlState === "unknown") return this.unknownSince !== null && now - this.unknownSince >= SAFETY_STANDARD.giveUpRounds ? "blind" : "hold";
    return this.tracker!.mode(now);
  }
  private roundFor(k: number, round = this.cur): number | null {
    if (this.hostMode && !this.tracker) return Infinity; // a game whose numbers the Host presses, with no signing key registered yet: nothing is called on a schedule of its own, the phone shows "waiting for the host" until the first press
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
    if (this.phase === "ended") { await this.autoClaim(); await this.sendBogeys(); if (this.nowRound !== null) await this.pollSeats(this.nowRound); this.syncEngines(this.cur); await this.pollResults(); await this.castVotes(); return this.view(); } // after the last number the last claims (and the claims of others) still arrive: keep reading them, so the winners settle // a claim that failed to send keeps being retried after the last call // the engagement is over, but the outcome is still worth fetching
    if (this.phase !== "play") return this.view();
    if (!(await this.syncClock())) { const m0 = this.deps.mono(); if (this.clockFailSince === null) this.clockFailSince = m0; this.error = m0 - this.clockFailSince > 15_000 ? "This network is not letting the game get its numbers. If you are on office Wi-Fi, switch to mobile data. Keep this page open: it carries on by itself." : "Waiting for the clock. Check your connection."; return this.view(); }
    this.clockFailSince = null;
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
    try { this.onProgress?.(); } catch { /* the page drawing must never stop the game loop */ } // show the new number NOW: the claim, seat-list and Bogey calls below can take seconds when the store is busy, and must not hold the number back
    if (m !== "blind") await this.autoClaim(); // never claim from a log that might be missing a pause we could not hear about
    await this.sendBogeys();
    await this.pollSeats(now);
    this.syncEngines(Math.max(1, started));
    await this.pollResults();
    await this.castVotes();
    const stopped = this.tracker?.state.stopRound != null && now >= this.tracker.state.stopRound;
    const byPrizes = !this.deps.noEarlyEnd && this.cur >= this.cfg.rounds && this.prizesAwarded(this.cur) && this.breaksPlayed(now);
    if (byPrizes) {
      this.prizesEnded = true;
      // The game stops where the last prize was completed (plus the one call whose claim window had to close): a phone that was reloaded, or that joined late, must not show the numbers that the clock would
      // have called afterwards, so every phone, the number screen and the report agree on the count.
      const idxs = this.allResults.filter((x) => (x.round ?? 1) === this.cur && Number.isInteger((x as any).idx)).map((x) => (x as any).idx as number);
      if (idxs.length) { const E = Math.max(...idxs) + 2, lg = this.logs[this.cur - 1]; if (lg && lg.length > E) lg.length = E; }
    }
    if ((this.cur >= this.cfg.rounds && (this.logs[this.cur - 1]?.length ?? 0) >= NUMBERS) || stopped || byPrizes) this.phase = "ended";
    return this.view();
  }

  private get myCountFrom() { return countFromOf(this.myJr); }
  /** Round `round`'s calls as this phone may count them: numbers called before it could count become 0, so call positions stay the same for everyone. */
  private maskedLog(round: number): number[] {
    const log = this.logs[round - 1] ?? [], cf = this.myCountFrom;
    if (!cf) return log;
    return log.map((n, k) => ((this.roundFor(k, round) ?? Infinity) >= cf ? n : 0));
  }
  private builtDiscards = 0;
  private builtMsgs = 0;
  /** Extends a round's call log with newly available rounds instead of recomputing all 90 calls every second. Rebuilds from scratch only if a provisional round was thrown away or an organizer message arrived. */
  private buildLog(now: number, round: number): number[] {
    const msgs = this.tracker ? this.tracker.log.filter((m) => m.action !== "next").length : 0; // a Host's press only adds a call at the end: nothing earlier moves, so no re-derivation
    if (this.store.discarded !== this.builtDiscards || msgs !== this.builtMsgs) { this.logs = this.logs.map(() => []); this.logResets++; this.builtDiscards = this.store.discarded; this.builtMsgs = msgs; } // a new organizer message can move later calls: re-derive
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
  /** Set once the last prize of the last round was awarded and every break has been played. */
  private prizesEnded = false;
  /** The beacon round this phone joined in when that was after the game began (0: in time). */
  private myJr = 0;
  private cap = 0;
  // every phone works out the winners itself from the public seat list
  private seatList: { pid: string; countFrom: number; ex?: boolean; blk?: boolean }[] = [];
  private blkVer = 0; // changes when the list of removed seats changes
  private engineBlk = new Map<number, number>();
  private seatUpto = 0;
  private seatsFetched = false;
  private lastSeatPoll = -Infinity;
  /** The beacon round the newest seat list was asked for in: a lucky draw is only worked out from a list at least that fresh. */
  private seatsFreshRound = 0;
  private wantSeats = false;
  // ---- winners are settled by phones, never by a person: this phone reports what it worked out, and the store accepts a result once enough different phones agree
  private voted = new Set<string>();
  private firstSeen = new Map<string, number>();
  private lastVote = -Infinity;
  private luckyLocal: { ordinal: number; idx: number; round: number; winners: string[] }[] = [];
  private luckyBusy = false;
  private engines = new Map<number, PrizeEngine>();
  private engineCursor = new Map<number, number>();
  private engineReset = new Map<number, number>();
  private logResets = 0;
  private serverResults: NonNullable<RuntimeView["results"]> = [];
  private claimLens: number[] = [];
  private async autoClaim() {
    if (!this.pid) return;
    const lens = this.logs.map((l) => l.length);
    if (lens.length === this.claimLens.length && lens.every((n, i) => n === this.claimLens[i]) && this.unsent === 0) return; // nothing new has been called and nothing is waiting to be sent
    this.claimLens = lens;
    this.unsent = 0;
    for (let r = 1; r <= this.logs.length; r++) {
      const tk = this.ticketsOf(r), log = this.maskedLog(r);
      if (!tk.length || !log.length) continue;
      for (const p of keysInPlay(this.cfg.rewards)) {
        const id = `${r}:${p}`;
        if (this.claimedAll.has(id)) continue;
        if (!this.pressed.has(id)) continue; // a claim goes only when the player pressed Claim (claim() above), never by itself
        const idx = completionIndexKey(tk, p, log);
        if (idx < 0) continue;
        try {
          const ans = this.trackClaims ? await this.deps.api("POST", `/api/z/${this.eid}/claims`, { pid: this.pid, device: this.device(), claims: [{ pattern: p, idx, ...(r > 1 ? { round: r } : {}) }] }) : null;
          this.claimedAll.add(id);
          this.deps.store.set(this.key("claimed"), JSON.stringify([...this.claimedAll]));
          // this phone knows its own claim at once (the others learn it with the seat list): the store's clock says when it arrived
          if (ans && Number(ans.atMs) > 0) this.noteClaims([{ pid: this.pid, pattern: p, round: r, idx, atMs: Number(ans.atMs) }]);
        } catch { this.unsent++; /* kept: the next tick sends it again; a claim is never lost because nothing is marked sent until it was */ }
      }
    }
  }

  private allResults: NonNullable<RuntimeView["results"]> = [];
  /** Every reward line of `round` has a published result. A house that fewer people complete than it has lines never gets here, and the engagement then runs to its last number as before. */
  private prizesAwarded(round: number): boolean {
    const all = keysInPlay(this.cfg.rewards), others = all.filter((k) => k !== "unlucky");
    const keys = others.length ? others : all; // Unlucky never keeps a game running: it is decided when the others are done (or at the first Full House)
    if (!keys.length) return false;
    return keys.every((k) => linesFor(this.cfg.rewards, k).every((l) => this.allResults.some((x) => x.pattern === k && x.ordinal === l.ordinal && (x.round ?? 1) === round)));
  }
  /** Round 1 holds the brand breaks: the engagement does not end before the last one has been played. */
  private breaksPlayed(now: number): boolean {
    if (this.cur > 1 || !this.cfg.breaks.length) return true;
    return this.cfg.breaks.every((b) => this.logCache.length >= b.after) && this.currentBreak(now) === null;
  }
  /** This phone claimed a house but its result is not out yet: ask often so the winner hears quickly. */
  private waitingForResult(): boolean {
    if (!this.tickets.length) return false;
    return keysInPlay(this.cfg.rewards).some((k) => this.pressed.has(`${this.cur}:${k}`) && !this.allResults.some((x) => x.pattern === k && (x.round ?? 1) === this.cur));
  }
  // ---- the public claims: every phone reads them with the seat list (one request, already made) and feeds them to its engines ----
  private claimList: PublicClaim[] = [];
  private claimIds = new Set<string>();
  private claimUpto = 0; // the newest atMs received: the next ask starts there
  private claimVer = 0; // changes when the list changes
  private engineClaims = new Map<number, number>();
  /** `fromStore`: a page the store answered (its newest time becomes the next ask's start). This phone's own claim, noted at once, must NOT move that cursor: others' earlier claims would be skipped. */
  private noteClaims(list: readonly PublicClaim[], fromStore = false) {
    let changed = false;
    for (const c of list) {
      if (!c || typeof c.pid !== "string" || typeof c.pattern !== "string" || !Number.isInteger(c.idx) || !(Number(c.atMs) > 0)) continue;
      if (fromStore && c.atMs > this.claimUpto) this.claimUpto = c.atMs;
      const id = `${c.round ?? 1}:${c.pattern}:${c.pid}${c.bogey ? ":b" + c.atMs : ""}`; // a ticket may have two Bogeys on a house: each is its own record
      if (this.claimIds.has(id)) continue;
      this.claimIds.add(id); this.claimList.push({ pid: c.pid, pattern: c.pattern, round: c.round ?? 1, idx: c.idx, atMs: Number(c.atMs), ...(c.bogey ? { bogey: true as const } : {}) }); changed = true;
    }
    if (changed) this.claimVer++;
  }
  /** The store's time (as this phone estimates it, a round of slack taken off) up to which it holds EVERY claim and Bogey: set by each seat-list answer. A position is settled only once this passed its claim deadline. */
  /** Set by the page: called as soon as the numbers of this pass are known, before the slower calls of the same pass (claims, seat list, Bogeys). */
  onProgress: (() => void) | null = null;
  private claimsFreshMs = -Infinity;
  /**
   * A winner position at call `idx` is final only when its claim window has closed (the next number was called, by the schedule every phone uses) AND this phone has read the store's claims up to
   * that moment, so no claim in time can still be missing. Until then it is not shown, not voted and does not end the game (with a quorum of one, a premature vote would be the last word).
   * The last call of a round (or a stopped game): no next number ever comes, so the window is taken as one call gap after it. Host mode before the next press: the window is still open.
   */
  private resultFinal(round: number, idx: number): boolean {
    const nextK = idx + CLAIM_WINDOW_CALLS;
    let deadline: number;
    if (nextK < NUMBERS) {
      const nb = this.roundFor(nextK, round);
      if (nb === Infinity) return false; // host mode: the Host has not pressed for the next number yet
      if (nb !== null) deadline = roundTimeMs(nb);
      else { const here = this.roundFor(idx, round); if (here === null || here === Infinity) return false; deadline = roundTimeMs(here) + Math.max(9, this.callSeconds) * 1000; } // stopped: nothing more comes
    } else { const here = this.roundFor(idx, round); if (here === null || here === Infinity) return false; deadline = roundTimeMs(here) + Math.max(9, this.callSeconds) * 1000; }
    return this.claimsFreshMs >= deadline;
  }
  /** A claim this phone has pressed that the store has not shown back yet: ask for the seat list (and the claims that ride with it) sooner. */
  private wantClaims(): boolean { return [...this.pressed].some((id) => { const [r, k] = id.split(":"); return !this.claimIds.has(`${r}:${k}:${this.pid}`); }); }
  /** Seat list polling: how often depends on the engagement's size so the free plan is never stretched, and always stays well inside the late-joiner lag. */
  private seatEveryMs(): number { const c = this.cap; return c <= 250 ? 15_000 : c <= 1000 ? 25_000 : c <= 2500 ? 40_000 : 50_000; }
  private async pollSeats(now: number) {
    const m = this.deps.mono();
    // a phone that pressed Claim and has no result yet asks sooner (a few polls by a few phones), so a winner hears quickly and the game can end once the last prize is settled
    if (now < this.startRound || (!this.wantSeats && m - this.lastSeatPoll < (this.seatsFetched ? (this.wantClaims() || this.waitingForResult() ? Math.min(6_000, this.seatEveryMs()) : this.seatEveryMs()) : 5_000) + (Math.floor(m) % 2000))) return;
    this.lastSeatPoll = m; this.wantSeats = false;
    const askedAt = this.nowRound ?? 0;
    try {
      const askedMs = this.offsetMs === null ? null : this.deps.mono() + this.offsetMs;
      const r = await this.deps.api("GET", `/api/z/${this.eid}/seats?after=${this.seatUpto}&cafter=${this.claimUpto}`);
      if (Array.isArray(r?.claims)) { // the public claims ride with the seat list; after this answer every claim up to (about) the time of the ask is here, unless the page was full
        this.noteClaims(r.claims, true);
        const full = r.claims.length >= 500, newest = r.claims.reduce((m: number, c: any) => Math.max(m, Number(c?.atMs) || 0), 0);
        if (askedMs !== null) this.claimsFreshMs = Math.max(this.claimsFreshMs, full ? Math.min(newest, askedMs - 3000) : askedMs - 3000);
      }
      if (!r || !r.ready || !Array.isArray(r.seats)) return;
      const known = new Set(this.seatList.map((x) => x.pid));
      const blk = new Set<string>(Array.isArray(r.blk) ? r.blk.filter((x: unknown): x is string => typeof x === "string") : []); // removed seats: still listed, never a winner of Unlucky
      for (const [, pid, jr, ex] of r.seats as [number, string, number, number?][]) if (!known.has(pid)) { known.add(pid); this.seatList.push({ pid, countFrom: countFromOf(jr), ex: ex === 1, blk: blk.has(pid) }); }
      if (Array.isArray(r.blk)) { let changed = false; for (const s of this.seatList) { const b = blk.has(s.pid); if (!!s.blk !== b) { s.blk = b; changed = true; } } if (changed) this.blkVer++; }
      this.seatUpto = Math.max(this.seatUpto, Number(r.upto) || 0);
      this.seatsFetched = true; this.seatsFreshRound = Math.max(this.seatsFreshRound, askedAt);
    } catch { /* the next poll tries again; until then the organizer's published results (if any) are used */ }
  }
  /** Brings each round's engine up to date with the seats and numbers this phone knows. Tickets are made in small slices so the screen never freezes. */
  private syncEngines(started: number) {
    if (!this.seatsFetched) return;
    for (let r = 1; r <= started; r++) {
      let e = this.engines.get(r);
      if (!e) { e = new PrizeEngine(this.eid, this.cfg, r); e.setCallRound((k) => (k < NUMBERS ? this.roundFor(k, r) : null)); this.engines.set(r, e); this.engineCursor.set(r, 0); this.engineReset.set(r, this.logResets); }
      if (this.engineReset.get(r) !== this.logResets) { e.resetCalls(); this.engineReset.set(r, this.logResets); }
      const cur = this.engineCursor.get(r)!;
      if (cur < this.seatList.length) { e.addSeats(this.seatList.slice(cur)); this.engineCursor.set(r, this.seatList.length); }
      if (this.engineBlk.get(r) !== this.blkVer) { for (const s of this.seatList) e.setOut(s.pid, !!s.ex || !!s.blk); this.engineBlk.set(r, this.blkVer); }
      if (this.engineClaims.get(r) !== this.claimVer) { e.setClaims(this.claimList); this.engineClaims.set(r, this.claimVer); } // a prize is won only by a claim in time: the engine needs them all
      e.work(25);
      const log = this.logs[r - 1] ?? [];
      for (let k = e.calls; k < log.length; k++) { const br = this.roundFor(k, r); if (br === null) break; e.feed(log[k]!, br, this.store.rounds.get(br)?.randomness ?? ""); }
      e.setOver(e.calls >= NUMBERS || (e.calls >= log.length && this.roundFor(log.length, r) === null && started >= r && log.length > 0)); // the last number was called, or the game was stopped before the next one: Unlucky may be decided at the end
    }
  }
  private get localOk(): boolean { return this.seatsFetched && this.engines.size > 0 && [...this.engines.values()].every((e) => e.pending === 0); }
  private async pollResults() {
    const m = this.deps.mono();
    const nowR = this.nowRound;
    if (nowR !== null) await this.computeLucky(nowR);
    const local = this.localOk;
    if (local) {
      const mine: NonNullable<RuntimeView["results"]> = [];
      for (const [r, e] of this.engines) for (const x of e.results()) { if (x.pattern !== "unlucky" && !this.resultFinal(r, x.idx)) continue; mine.push({ pattern: x.pattern, ordinal: x.ordinal, idx: x.idx, count: x.pids.length, round: r, ...(x.pattern === "unlucky" || this.cfg.ties === "next" ? { winners: x.pids } : {}) }); } // a position is shown, voted and counted only once its claim window has closed and the claims are in
      this.allResults = [...mine, ...this.luckyResults(), ...this.serverResults.filter((x) => x.pattern === "lucky" && !this.luckyLocal.some((l) => l.ordinal === x.ordinal))];
    }
    // the organizer's published results: the fallback while the seat list is not here yet, and the only source for lucky draws
    // (lucky draws: only once a draw's break has been reached and its winners are not out yet, and then every 10 s)
    const luckyDue = this.cur === 1 && this.luckyView().some((l, i) => !l.published && this.logCache.length >= (this.cfg.breaks.filter((b) => b.kind === "lucky")[i]?.after ?? Infinity));
    const needServer = !local || luckyDue;
    if (!needServer || m - this.lastResultPoll < (local ? 10_000 : this.waitingForResult() ? 4_000 : 15_000) || !this.logs.some((l) => l.length > 0)) return;
    this.lastResultPoll = m;
    try {
      this.serverResults = (await this.deps.api("GET", `/api/z/${this.eid}/results`)).results ?? this.serverResults;
      this.allResults = this.localOk ? [...this.allResults.filter((x) => x.pattern !== "lucky"), ...this.luckyResults(), ...this.serverResults.filter((x) => x.pattern === "lucky" && !this.luckyLocal.some((l) => l.ordinal === x.ordinal))] : this.serverResults;
    } catch { /* shown next time */ }
  }
  private luckyResults(): NonNullable<RuntimeView["results"]> { return this.luckyLocal.map((l) => ({ pattern: "lucky" as const, ordinal: l.ordinal, idx: l.idx, count: l.winners.length, round: 1, winners: l.winners })); }
  /** A lucky draw is worked out here, from the public randomness of the round that ends its break and the public seat list: the same on every phone, and nobody can steer it. */
  private async computeLucky(now: number) {
    if (this.luckyBusy || !this.seatsFetched) return;
    const L = this.cfg.breaks.filter((b) => b.kind === "lucky");
    if (!L.length) return;
    this.luckyBusy = true;
    try {
      for (let i = 0; i < L.length; i++) {
        if (this.luckyLocal.some((x) => x.ordinal === i + 1)) continue;
        const round = luckyRound(this.tracker ? this.tracker.state : null, this.startRound, this.stride, this.cfg.breaks, L[i]!);
        if (round === null || round > now) continue;
        if (this.seatsFreshRound < round) { this.wantSeats = true; continue; } // the seat list must be at least as new as the draw
        const x = this.store.rounds.get(round) ?? (await fetchRound(round, { ...this.deps.beacon, ...(this.deps.verify ? { verify: this.deps.verify as any } : {}) }, 0));
        if (!x) continue;
        const pids = this.seatList.filter((s) => s.countFrom <= round && !s.ex).map((s) => s.pid); // the Organizer, Hosts and Co-hosts (flagged before the game) stay out of lucky draws
        this.luckyLocal.push({ ordinal: i + 1, idx: L[i]!.after, round, winners: luckyWinners(this.eid, L[i]!.after, x.randomness, pids, L[i]!.winners || 3) });
      }
    } catch { /* tried again on the next pass */ } finally { this.luckyBusy = false; }
  }
  private sampled(seat: number, key: string, p: number): boolean {
    if (p >= 1) return true;
    let h = 2166136261; const s = seat + "|" + key;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h / 4294967296 < p;
  }
  /** Reports this phone's own result for every prize to the store. Only a share of the phones speak up at first (so a big game stays inside the free request allowance); the rest join in, wave by wave, if no result appears. */
  private async castVotes() {
    const m = this.deps.mono();
    if (!this.pid || !this.localOk || m - this.lastVote < 4_000) return;
    const seat = seatOfPid(this.pid);
    if (seat === null) return;
    this.lastVote = m;
    const people = Math.max(1, this.seatList.length), p0 = votersFor(people) / people;
    const items: { key: string; body: object }[] = [];
    for (const [r, e] of this.engines) for (const x of e.results()) { if (x.pattern !== "unlucky" && !this.resultFinal(r, x.idx)) continue; items.push({ key: `${r}:${x.pattern}:${x.ordinal}`, body: { pattern: x.pattern, ordinal: x.ordinal, round: r, idx: x.idx, pids: [...x.pids].sort() } }); }
    for (const l of this.luckyLocal) items.push({ key: `1:lucky:${l.ordinal}`, body: { pattern: "lucky", ordinal: l.ordinal, round: 1, idx: l.idx, pids: [...l.winners].sort() } });
    const send: { key: string; body: object }[] = [];
    for (const it of items) {
      if (this.voted.has(it.key)) continue;
      const first = this.firstSeen.get(it.key) ?? (this.firstSeen.set(it.key, m), m);
      const wave = Math.min(12, Math.floor((m - first) / 30_000));
      if (this.sampled(seat, it.key, Math.min(1, p0 * 2 ** wave))) send.push(it);
    }
    for (let i = 0; i < send.length; i += 3) {
      const part = send.slice(i, i + 3);
      try { await this.deps.api("POST", `/api/z/${this.eid}/vote`, { pid: this.pid, device: this.device(), results: part.map((x) => x.body) }); for (const x of part) this.voted.add(x.key); }
      catch { break; /* kept: the next pass reports it again */ }
    }
  }

  private currentBreak(now: number | null): RuntimeView["brk"] {
    if (now === null || this.phase !== "play" || !this.cfg.breaks.length || this.cur > 1) return null; // brand breaks belong to round 1
    const a = activeBreak(this.tracker ? this.tracker.state : null, this.startRound, this.stride, this.cfg.breaks, now);
    if (!a || this.offsetMs === null) return null;
    if (this.logCache.length < a.brk.after) return null; // the number the break follows is still on its way: show the break only once it is on the screen
    return { title: a.brk.title, kind: a.brk.kind, ...(a.brk.mediaUrl ? { mediaUrl: a.brk.mediaUrl } : {}), ...(a.brk.winners ? { winners: a.brk.winners } : {}), seconds: a.brk.seconds, secondsLeft: Math.max(0, Math.round((roundTimeMs(a.endsAtRound) - (this.deps.mono() + this.offsetMs)) / 1000)) };
  }
  private luckyView(): RuntimeView["lucky"] {
    const out: RuntimeView["lucky"] = []; let n = 0;
    for (const b of this.cfg.breaks) {
      if (b.kind !== "lucky") continue;
      n++;
      const r = this.allResults.find((x) => x.pattern === "lucky" && x.ordinal === n);
      out.push({ ordinal: n, title: b.title, winners: b.winners ?? 3, style: b.style === "scratch" ? "scratch" : "draw", published: !!r, won: !!r && !!this.pid && (r.winners ?? []).includes(this.pid) });
    }
    return out;
  }
  /** The player's own marks, not the called numbers, say what is complete on the screen (it must not give away a number the player missed). */
  private myIdx(): Partial<Record<PatternKey, number>> {
    const o: Partial<Record<PatternKey, number>> = {};
    if (this.tickets.length) { const ml = this.markedLog(this.cur); for (const k of keysInPlay(this.cfg.rewards)) o[k] = completionIndexKey(this.tickets, k, ml); }
    return o;
  }
  /** A prize is this player's only when they pressed Claim for it (Unlucky is the software's own decision, nothing to press). The published winners already say so; this is the phone's own belt. */
  private mineInRealMode(round: number, key: PatternKey): boolean { return key === "unlucky" || this.pressed.has(`${round}:${key}`); }
  private pastView(): RuntimeView["past"] {
    const out: RuntimeView["past"] = [];
    for (let r = 1; r < this.cur; r++) {
      const tk = this.ticketsOf(r), log = this.maskedLog(r);
      const got: { pattern: PatternKey; ordinal: number }[] = [];
      for (const x of this.allResults) {
        if ((x.round ?? 1) !== r || x.pattern === "lucky" || !this.mineInRealMode(r, x.pattern as PatternKey)) continue;
        if (x.pattern === "unlucky" || this.cfg.ties === "next" ? !!this.pid && (x.winners ?? []).includes(this.pid) : completionIndexKey(tk, x.pattern as PatternKey, log) === x.idx) got.push({ pattern: x.pattern as PatternKey, ordinal: x.ordinal });
      }
      out.push({ round: r, got });
    }
    return out;
  }

  private wonView(): RuntimeView["won"] {
    const out: RuntimeView["won"] = [];
    if (!this.pid) return out;
    for (const x of this.allResults) {
      if (x.pattern === "lucky") continue;
      const r = x.round ?? 1, key = x.pattern as PatternKey, tk = this.ticketsOf(r), log = this.maskedLog(r);
      if (!tk.length || !this.mineInRealMode(r, key)) continue; // real housie: the engine may name this phone a winner in the published results, but the phone shows only what the player claimed
      const un = key === "unlucky"; // Unlucky is not completed on a ticket: this phone won it when its seat is the named winner
      if (un || this.cfg.ties === "next" ? !(x.winners ?? []).includes(this.pid) || (!un && completionIndexKey(tk, key, log) !== x.idx) : completionIndexKey(tk, key, log) !== x.idx) continue; // taking turns: only the named winner of this position won it
      const line = linesFor(this.cfg.rewards, key).find((l) => l.ordinal === x.ordinal);
      out.push({ round: r, pattern: key, ordinal: x.ordinal, text: line?.text ?? "", cells: un ? [] : winCells(tk, key, log, x.idx), idx: x.idx });
    }
    return out;
  }

  private visibleLog(): number[] { const cf = this.myCountFrom; return cf ? this.maskedLog(this.cur).filter((n) => n > 0) : this.logCache; }
  private lateView(now: number | null): RuntimeView["late"] {
    const cf = this.myCountFrom;
    if (!cf) return null;
    const hidden = this.maskedLog(this.cur).filter((n) => n === 0).length;
    const secondsUntil = now === null || this.offsetMs === null ? LATE_LAG_ROUNDS * 3 : // clock not synced yet: assume the full wait rather than telling them their numbers have started
       Math.max(0, Math.round((roundTimeMs(cf) - (this.deps.mono() + this.offsetMs)) / 1000));
    return { countFromRound: cf, secondsUntil, hidden };
  }

  view(): RuntimeView {
    const now = this.nowRound;
    const st = this.tracker?.state;
    const done = this.logCache.length >= NUMBERS;
    const nextInRound = !done ? this.roundFor(this.logCache.length) : null;
    const nextRoundFirst = done && this.cur < this.cfg.rounds ? this.roundFor(0, this.cur + 1) : null;
    const nextRound0 = nextInRound ?? nextRoundFirst;
    const nextRound = nextRound0 !== null && Number.isFinite(nextRound0) ? nextRound0 : null; // host mode: Infinity = the Host has not pressed yet, so there is no countdown
    const secsTo = (br: number) => (this.offsetMs === null ? null : Math.max(0, Math.round((roundTimeMs(br) - (this.deps.mono() + this.offsetMs)) / 1000)));
    const inter = now !== null && this.cur < this.cfg.rounds ? activeIntermission(st ?? null, this.startRound, this.stride, this.cfg.breaks, this.cur + 1, now) : null;
    const claimedNow = keysInPlay(this.cfg.rewards).filter((k) => this.claimedAll.has(`${this.cur}:${k}`));
    const isPaused = !!st && now !== null && pausedAt(st, now);
    const waitingForHost = this.hostMode && this.phase === "play" && !this.locked && !isPaused && now !== null && now >= this.startRound && nextRound0 === Infinity && !inter && this.currentBreak(now) === null;
    return {
      phase: this.phase, error: this.error, pid: this.pid, ticket: this.ticket, log: this.visibleLog(), nowRound: now, startRound: this.startRound, scheduledRound: this.scheduledRound, callSeconds: this.callSeconds,
      locked: this.locked, announcement: this.announcement,
      mode: now === null ? (this.controlState === "none" ? "none" : "hold") : this.modeAt(now), paused: isPaused, stopped: !!st && now !== null && st.stopRound !== null && now >= st.stopRound,
      claimed: claimedNow, unsent: this.unsent, results: this.allResults.filter((x) => (x.round ?? 1) === this.cur), pendingChecks: this.store.pending(), discarded: this.store.discarded,
      nextCallInSec: nextRound !== null && now !== null ? secsTo(nextRound) : null,
      tickets: this.tickets, cfg: this.cfg, brk: this.currentBreak(now), myIdx: this.myIdx(), lucky: this.luckyView(),
      round: this.cur, rounds: this.cfg.rounds, intermission: inter ? { round: this.cur + 1, secondsLeft: secsTo(inter.endsAtRound) ?? 0 } : null, past: this.pastView(),
      won: this.wonView(), allAwarded: this.prizesAwarded(this.cur), endedByPrizes: this.prizesEnded, late: this.lateView(now), localWinners: this.localOk,
      callMode: this.hostMode ? "host" : "auto", waitingForHost,
      marks: [...(this.marks.get(this.cur) ?? [])].sort((a, b) => a - b), claimable: this.claimableNow(),
      pressed: keysInPlay(this.cfg.rewards).filter((k) => this.pressed.has(`${this.cur}:${k}`)), claimsKnown: this.claimList.length,
      bogeys: keysInPlay(this.cfg.rewards).filter((k) => this.bogeysOn(k) > 0).map((k) => ({ pattern: k, n: this.bogeysOn(k) })), outOf: keysInPlay(this.cfg.rewards).filter((k) => this.outOf(k)),
    };
  }
}

/** The numbers on the ticket(s) that made the winning pattern, to light them up (see `winningNumbers`). Two-ticket house and Unlucky: no highlight. Empty when it cannot be told. */
function winCells(tickets: readonly Ticket[], key: PatternKey, log: readonly number[], idx: number): number[] {
  if (key === "full2" || key === "unlucky") return [];
  for (const t of tickets) if (completionIndexKey([t], key, log) === idx) return winningNumbers(t, key, log, idx);
  return [];
}

export { generateTicket };
