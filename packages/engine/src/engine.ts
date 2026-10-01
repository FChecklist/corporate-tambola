import {
  cryptoRand, generateTicket, normalize as _n, patternNumbers, PATTERNS, rewardName, ticketKey, ticketNumbers,
  type PatternId, type Rand, type Scope, type Ticket,
} from "@tambola/shared";
import { DEFAULT_SURPRISE } from "./types";
import { Surprise } from "./surprise";
import type {
  Actor, BrandBreak, CallMode, Claim, Conflict, EngagementStatus, Kind, Participant, Pause, PublicEvent,
  ResultItem, Role, RewardLine, Settings, TicketMode, WaitingEntry, Winner,
} from "./types";

void _n;

export const CFG = { AI_GAP: 10_000, MIN_HOST_GAP: 5_000, CLAIM_CHECK: 2_400, RESULT_SHOW: 5_000, RESUME_DELAY: 3_000, MAX_REWARD_LINES: 30, MAX_BREAKS: 3,
  /** After the organizer presses Start, the first number is called this long after, so every phone can finish getting ready. Entry stays open meanwhile. */
  PRE_START_MS: 60_000 };

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface Deps {
  now: () => number;
  rand?: Rand;
  emit?: (e: PublicEvent) => void;
  /** Ids of participants with a live connection right now (lucky draws pick only people who are present). */
  present?: () => Set<string> | null;
}

export type Err = string;
export type JoinResult =
  | { t: "game"; p: Participant }
  | { t: "consent"; p: Participant }
  | { t: "wait"; w: WaitingEntry }
  | { t: "ask" }
  | { t: "err"; k: "rate" | "inuse" | "closed" | "usepass" | "full" | "blocked" };

export interface SettingsInit extends Partial<Omit<Settings, "rewards" | "breaks" | "surprise">> {
  rewards?: RewardLine[];
  breaks?: BrandBreak[];
  surprise?: Partial<import("./types").SurpriseSettings>;
}

/** Build reward lines: texts.length houses of one kind -> ordinals 1..n. */
export function makeRewardLines(spec: { pattern: PatternId; scope?: Scope; texts: string[] }[]): RewardLine[] {
  const out: RewardLine[] = [];
  for (const s of spec) {
    s.texts.forEach((text, i) => out.push({ id: `${s.pattern}:${s.scope ?? "ticket"}:${i + 1}`, pattern: s.pattern, scope: s.scope ?? "ticket", ordinal: i + 1, text }));
  }
  return out;
}

export const DEFAULT_REWARDS = (): RewardLine[] =>
  makeRewardLines([
    { pattern: "early5", texts: ["Reward: Early Five"] },
    { pattern: "top", texts: ["Reward: Top Line"] },
    { pattern: "mid", texts: ["Reward: Middle Line"] },
    { pattern: "bot", texts: ["Reward: Bottom Line"] },
    { pattern: "corners", texts: ["Reward: Four Corners"] },
    { pattern: "full", texts: ["Reward: Full House"] },
  ]);

export class EngagementEngine {
  settings: Settings;
  status: EngagementStatus = "open";
  participants: Participant[] = [];
  waiting: WaitingEntry[] = [];
  conflicts: Conflict[] = [];
  called: number[] = [];
  current: number | null = null;
  paused: Pause | null = null;
  nextAt: number | null = null;
  lastDrawAt = 0;
  startedAt: number | null = null;
  liveAt: number | null = null;
  pendingEmergency: string | null = null; // a pause asked for during a claim check or brand break; applied right after it
  endedAt: number | null = null;
  winners = new Map<string, Winner[]>(); // reward line id -> winners
  notValidLog: { pid: string; ticketId: string; pattern: PatternId; at: number; why: string }[] = [];
  claims: Claim[] = [];
  log: { t: number; msg: string }[] = [];
  summary: { players: number; family: number; teamLeads: number; startedAt: number | null; endedAt: number | null } | null = null;

  remaining: number[] = Array.from({ length: 90 }, (_, i) => i + 1); // secret, never exposed
  sx: Surprise = new Surprise(this); // optional features: rounds, lucky draws, scratch cards, boosters
  present: (() => Set<string> | null) | undefined;
  private deviceTries = new Map<string, number[]>();
  private cancelledPasses = new Set<string>();
  ticketKeys = new Set<string>();
  private serial = 100;
  private seq = 1;
  now: () => number;
  rand: Rand; // public so tests can steer draws
  emit: (e: PublicEvent) => void;

  constructor(init: SettingsInit = {}, deps: Deps) {
    this.now = deps.now;
    this.rand = deps.rand ?? cryptoRand;
    this.emit = deps.emit ?? (() => {});
    this.present = deps.present;
    this.settings = {
      id: this.code(4), code: this.code(7), screenKey: this.code(14), name: "My engagement", orgName: "My organization", limit: 100,
      familyLimit: 2, familyCanWin: true, participantInvites: 0, ticketMode: "single", callMode: "ai",
      defaultCountry: "IN", startsAt: null, tz: "Asia/Kolkata", rewards: DEFAULT_REWARDS(), breaks: [], ...init,
    } as Settings;
    this.settings.surprise = { ...DEFAULT_SURPRISE, ...(init.surprise ?? {}) };
  }

  // ---------- helpers ----------
  code(n = 8): string {
    let s = "";
    for (let i = 0; i < n; i++) s += CODE_CHARS[this.rand(CODE_CHARS.length)];
    return s;
  }
  uid(p: string) { return `${p}${this.seq++}`; }
  logMsg(msg: string) { this.log.unshift({ t: this.now(), msg }); if (this.log.length > 200) this.log.pop(); this.emit({ to: "console", type: "log", msg }); }
  get placesUsed() { return this.participants.length; }
  get placesLeft() { return this.settings.limit - this.placesUsed; }
  get entryOpen() { return this.status === "open" || this.status === "starting"; }
  private byId(pid: string) { return this.participants.find((p) => p.id === pid); }
  private byNumber(e164: string) { return this.participants.find((p) => p.e164 === e164); }
  numberInEngagement(e164: string) { return this.byNumber(e164) ?? this.waiting.find((w) => w.e164 === e164); }
  private ticketCount() { return this.settings.ticketMode === "double" ? 2 : 1; }
  ticketCountFor() { return this.ticketCount(); }
  newTicket(): Ticket {
    for (;;) {
      const t = generateTicket(this.rand);
      const k = ticketKey(t);
      if (!this.ticketKeys.has(k)) { this.ticketKeys.add(k); return t; }
    }
  }
  private makeParticipant(o: Partial<Participant>): Participant {
    this.serial += 1 + this.rand(9);
    return {
      id: this.uid("p"), name: "", info: "", e164: "", role: "participant", kind: null, source: "list", invitedBy: null,
      status: "not_joined", cap: 25, passCode: null, roleLink: null, device: null,
      tickets: Array.from({ length: this.ticketCount() }, () => this.newTicket()),
      boosters: { joker: 0, extra: 0, pass: 0 },
      serial: this.serial, notValid: 0, blocked: false, consentAt: null, joinedAt: null, ...o,
    };
  }
  guardEntry(n = 1): Err | null {
    if (!this.entryOpen) return "Entry is closed. The engagement has started.";
    if (this.placesLeft < n) return `The engagement is full (${this.settings.limit} places). Raise the participant limit to add more.`;
    return null;
  }

  /** Public ticket id: shown to everyone instead of a name. */
  ticketId(p: Participant, which: "A" | "B" | "C" | "AB" = "A"): string {
    const org = (this.settings.orgName.replace(/[^A-Za-z]/g, "").toUpperCase() || "ORG").slice(0, 4);
    return `TMB-${org}-${this.settings.id}-${String(p.serial).padStart(6, "0")}-${which}`;
  }

  // ---------- settings (organizer; host may change only the family limit) ----------
  updateSettings(actor: Actor, patch: Partial<Pick<Settings, "name" | "limit" | "familyLimit" | "familyCanWin" | "participantInvites" | "ticketMode" | "callMode" | "defaultCountry" | "startsAt" | "tz" | "orgName">> & { surprise?: Partial<import("./types").SurpriseSettings> }): Err | null {
    if (this.status !== "open") return "Settings are locked after the start.";
    const keys = Object.keys(patch);
    if (actor === "host" && keys.some((k) => k !== "familyLimit")) return "Only the organizer can change this setting.";
    if (patch.surprise !== undefined) {
      if (actor === "host") return "Only the organizer can change this setting.";
      const bad = this.sx.validate(patch.surprise);
      if (bad) return bad;
      Object.assign(this.settings.surprise, patch.surprise);
      this.sx.normalise();
      delete patch.surprise;
    }
    if (patch.limit !== undefined && patch.limit < this.placesUsed) return `The limit cannot be below the ${this.placesUsed} places already used.`;
    if (patch.familyLimit !== undefined && (patch.familyLimit < 0 || patch.familyLimit > 4)) return "Family limit is 0 to 4.";
    if (patch.participantInvites !== undefined && (patch.participantInvites < 0 || patch.participantInvites > 3)) return "Invites are 0 to 3.";
    if (patch.ticketMode && patch.ticketMode !== this.settings.ticketMode) {
      if (patch.ticketMode === "single" && this.settings.rewards.some((r) => r.scope === "two_ticket")) return "Remove the Two-Ticket rewards first.";
      this.settings.ticketMode = patch.ticketMode;
      const n = this.ticketCount();
      for (const p of this.participants) {
        while (p.tickets.length < n) p.tickets.push(this.newTicket());
        while (p.tickets.length > n) this.ticketKeys.delete(ticketKey(p.tickets.pop()!));
      }
      delete patch.ticketMode;
    }
    Object.assign(this.settings, patch);
    return null;
  }

  setRewards(actor: Actor, lines: RewardLine[]): Err | null {
    if (actor !== "organizer") return "Only the organizer can change rewards.";
    if (this.status !== "open") return "Settings are locked after the start.";
    if (lines.length === 0) return "Add at least one reward.";
    if (lines.length > CFG.MAX_REWARD_LINES) return `At most ${CFG.MAX_REWARD_LINES} rewards.`;
    const kinds = new Map<string, number[]>();
    for (const l of lines) {
      if (l.scope === "two_ticket" && (this.settings.ticketMode !== "double" || l.pattern !== "full")) return "Two-Ticket rewards need a 2-ticket engagement and are Full House only.";
      const k = `${l.pattern}:${l.scope}`;
      kinds.set(k, [...(kinds.get(k) ?? []), l.ordinal]);
    }
    for (const [k, ords] of kinds) {
      const sorted = [...ords].sort((a, b) => a - b);
      if (sorted.some((o, i) => o !== i + 1)) return `Houses of kind ${k} must be numbered 1, 2, 3 ... without gaps.`;
    }
    this.settings.rewards = lines.map((l) => ({ ...l }));
    return null;
  }

  setBreaks(actor: Actor, breaks: Omit<BrandBreak, "done">[]): Err | null {
    if (actor !== "organizer") return "Only the organizer can change brand breaks.";
    if (this.status !== "open") return "Brand breaks cannot be changed after the start.";
    if (breaks.length > CFG.MAX_BREAKS) return `At most ${CFG.MAX_BREAKS} brand breaks.`;
    const pos = breaks.map((b) => b.after);
    if (pos.some((a, i) => a < 1 || a > 89 || (i > 0 && a <= pos[i - 1]!))) return "Brand breaks must come at increasing positions between call 1 and 89.";
    if (breaks.some((b) => b.mediaUrl && !/^https?:\/\//i.test(b.mediaUrl))) return "Video links must start with http:// or https://.";
    this.settings.breaks = breaks.map((b) => ({ ...b, done: false }));
    return null;
  }

  // ---------- list upload ----------
  addParticipants(items: { name?: string; info?: string; e164: string }[]): { ok: true } | { ok: false; reason: string } {
    const e = this.guardEntry(items.length);
    if (e) return { ok: false, reason: e };
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.e164) || this.numberInEngagement(it.e164)) return { ok: false, reason: `${it.e164} is already in this engagement.` };
      seen.add(it.e164);
    }
    for (const it of items) this.participants.push(this.makeParticipant({ name: it.name ?? "", info: it.info ?? "", e164: it.e164, source: "list" }));
    this.logMsg(`Organizer added ${items.length} participants`);
    return { ok: true };
  }

  // ---------- roles ----------
  setRole(actor: Actor, pid: string, role: Role, cap?: number): Err | null {
    const p = this.byId(pid);
    if (!p) return "Not found.";
    if (!this.entryOpen) return "Settings are locked after the start.";
    if (p.kind === "family") return "Family members cannot be made Host or Team Lead.";
    if (actor === "host" && (role === "host" || p.role === "host")) return "Only the organizer can make or change Hosts.";
    p.role = role;
    if (role === "team_lead") p.cap = cap ?? p.cap ?? 25;
    if (role !== "participant" && !p.roleLink) p.roleLink = this.code(8);
    this.logMsg(`${actor} set ${p.name || p.e164} to ${role}`);
    return null;
  }

  descendants(p: Participant): Participant[] {
    const out: Participant[] = [];
    const walk = (x: Participant) => this.participants.filter((c) => c.invitedBy === x.id).forEach((c) => { out.push(c); walk(c); });
    walk(p);
    return out;
  }

  removeParticipants(actor: Actor, ids: string[]): { removed: Participant[] } | Err {
    if (!this.entryOpen) return "Nobody can be removed after the start.";
    const set = new Set<Participant>();
    for (const id of ids) {
      const p = this.byId(id);
      if (!p || (actor === "host" && p.role === "host")) continue;
      set.add(p);
      this.descendants(p).forEach((c) => set.add(c));
    }
    const removed = [...set];
    this.participants = this.participants.filter((p) => !set.has(p));
    removed.forEach((p) => p.tickets.forEach((t) => this.ticketKeys.delete(ticketKey(t))));
    this.logMsg(`Removed ${removed.length} participants`);
    return { removed };
  }

  // ---------- passes ----------
  colleaguesUsed(p: Participant) { return this.participants.filter((x) => x.invitedBy === p.id && x.kind === "colleague").length; }
  familyUsed(p: Participant) { return this.participants.filter((x) => x.invitedBy === p.id && x.kind === "family").length; }
  participantInvitesUsed(p: Participant) {
    return this.waiting.filter((w) => w.invitedBy === p.id).length +
      this.participants.filter((x) => x.invitedBy === p.id && x.kind === "colleague" && x.source === "waiting_room").length;
  }

  createPass(senderId: string, o: { name: string; e164: string; kind: "colleague" | "family" }): { ok: true; p: Participant } | { ok: false; reason: string } {
    const sender = this.byId(senderId);
    if (!sender) return { ok: false, reason: "Sender not found." };
    const g = this.guardEntry();
    if (g) return { ok: false, reason: g };
    if (!o.name || o.name.trim().length < 2) return { ok: false, reason: "Enter their name." };
    if (this.numberInEngagement(o.e164)) return { ok: false, reason: "This number is already in this engagement." };
    if (sender.kind === "family") return { ok: false, reason: "Family members cannot invite anyone." };
    if (o.kind === "colleague") {
      if (sender.role !== "team_lead") return { ok: false, reason: "Only Team Leads can send colleague passes." };
      if (sender.kind === "colleague") return { ok: false, reason: "Invited colleagues cannot invite colleagues." };
      if (this.colleaguesUsed(sender) >= sender.cap) return { ok: false, reason: `You have used all ${sender.cap} colleague passes.` };
    } else {
      if (this.settings.familyLimit === 0) return { ok: false, reason: "This engagement does not allow family members." };
      if (this.familyUsed(sender) >= this.settings.familyLimit) return { ok: false, reason: `You have used all ${this.settings.familyLimit} family passes.` };
    }
    const p = this.makeParticipant({ name: o.name.trim(), e164: o.e164, kind: o.kind, source: "pass", invitedBy: sender.id, status: "pass_sent", passCode: this.code(8) });
    this.participants.push(p);
    this.logMsg(`${sender.name} created a ${o.kind} pass`);
    return { ok: true, p };
  }

  cancelPass(pid: string): Err | null {
    const p = this.byId(pid);
    if (!p) return "Not found.";
    if (p.status === "joined") return "This pass has been used. It cannot be cancelled.";
    if (!this.entryOpen) return "Entry is closed.";
    if (p.passCode) this.cancelledPasses.add(p.passCode);
    this.participants = this.participants.filter((x) => x !== p);
    p.tickets.forEach((t) => this.ticketKeys.delete(ticketKey(t)));
    return null;
  }

  reissuePass(pid: string): Err | null {
    const p = this.byId(pid);
    if (!p) return "Not found.";
    if (!this.entryOpen) return "Entry is closed.";
    if (p.passCode) this.cancelledPasses.add(p.passCode);
    p.passCode = this.code(8);
    p.device = null;
    if (p.status === "joined") p.status = "pass_sent";
    return null;
  }

  // ---------- joining ----------
  private bind(p: Participant, device: string) {
    p.device = device; p.status = "joined"; p.joinedAt = this.now(); p.consentAt = this.now();
    p.namesConsent = this.settings.surprise.revealNames;
  }
  raiseConflict(p: Participant, device: string) {
    if (!this.conflicts.find((c) => c.pid === p.id && c.device === device && !c.done)) {
      this.conflicts.push({ id: this.uid("c"), pid: p.id, device, at: this.now(), done: false });
      this.logMsg(`Second phone tried to join as ${p.name || p.e164}`);
    }
  }
  private rateLimited(device: string): boolean {
    const now = this.now();
    const tries = (this.deviceTries.get(device) ?? []).filter((t) => now - t < 600_000);
    if (tries.length >= 5) { this.deviceTries.set(device, tries); return true; }
    tries.push(now);
    this.deviceTries.set(device, tries);
    return false;
  }

  joinByNumber(device: string, e164: string): JoinResult {
    if (this.rateLimited(device)) return { t: "err", k: "rate" };
    const p = this.byNumber(e164);
    if (p && p.status === "joined") {
      if (p.device === device) return { t: "game", p };
      this.raiseConflict(p, device);
      return { t: "err", k: "inuse" };
    }
    if (!this.entryOpen) return { t: "err", k: "closed" };
    if (p) return p.source === "pass" && p.status === "pass_sent" ? { t: "err", k: "usepass" } : { t: "consent", p };
    const w = this.waiting.find((x) => x.e164 === e164);
    if (w) return { t: "wait", w };
    if (this.placesLeft < 1) return { t: "err", k: "full" };
    return { t: "ask" };
  }

  /** Participant ticked consent on the on-list route. */
  confirmJoin(device: string, pid: string): Err | null {
    const p = this.byId(pid);
    if (!p) return "Not found.";
    if (!this.entryOpen) return "Entry is closed.";
    if (p.status === "joined" && p.device !== device) return "This number is already in use on another phone.";
    this.bind(p, device);
    return null;
  }

  openPass(device: string, passCode: string): { t: "pass"; p: Participant } | { t: "game"; p: Participant } | { t: "err"; k: "inuse" | "closed" | "cancelled" | "badlink" } {
    const p = this.participants.find((x) => x.passCode === passCode);
    if (p) {
      if (p.status === "joined") {
        if (p.device === device) return { t: "game", p };
        this.raiseConflict(p, device);
        return { t: "err", k: "inuse" };
      }
      if (!this.entryOpen) return { t: "err", k: "closed" };
      return { t: "pass", p };
    }
    return { t: "err", k: this.cancelledPasses.has(passCode) ? "cancelled" : "badlink" };
  }

  askToJoin(device: string | null, o: { name: string; info?: string; e164: string; invitedBy?: string | null }): Err | null {
    const e = this.guardEntry();
    if (e) return e;
    if (this.numberInEngagement(o.e164)) return "This number is already in this engagement.";
    if (o.invitedBy) {
      const inviter = this.byId(o.invitedBy);
      if (!inviter || inviter.kind) return "Invited colleagues and family cannot invite colleagues.";
      if (this.participantInvitesUsed(inviter) >= this.settings.participantInvites) return "No invites left.";
    }
    this.waiting.push({ id: this.uid("w"), name: o.name, info: o.info ?? "", e164: o.e164, invitedBy: o.invitedBy ?? null, device, at: this.now() });
    this.logMsg(`${o.name} is in the waiting room`);
    return null;
  }

  admit(ids: string[]): Err | null {
    if (!this.entryOpen) return "Entry is closed.";
    const list = this.waiting.filter((w) => ids.includes(w.id));
    if (this.placesLeft < list.length) return `Only ${this.placesLeft} places are left under your limit of ${this.settings.limit}.`;
    for (const w of list) {
      const p = this.makeParticipant({ name: w.name, info: w.info, e164: w.e164, source: "waiting_room", invitedBy: w.invitedBy, kind: w.invitedBy ? "colleague" : null });
      this.participants.push(p);
      if (w.device) this.bind(p, w.device);
    }
    this.waiting = this.waiting.filter((w) => !ids.includes(w.id));
    this.logMsg(`Admitted ${list.length} from the waiting room`);
    return null;
  }

  decline(ids: string[]): WaitingEntry[] {
    const list = this.waiting.filter((w) => ids.includes(w.id));
    this.waiting = this.waiting.filter((w) => !ids.includes(w.id));
    return list;
  }

  resolveConflict(cid: string, res: "kept" | "moved"): Err | null {
    const c = this.conflicts.find((x) => x.id === cid);
    if (!c || c.done) return "Not found.";
    c.done = true; c.resolution = res;
    const p = this.byId(c.pid);
    if (p && res === "moved") p.device = c.device;
    return null;
  }

  // ---------- lifecycle ----------
  /**
   * Organizer presses Start: settings lock now, but entry stays open for PRE_START_MS so phones that open the link
   * at the last moment can still download the software. The first number is called when that window ends.
   */
  start(): Err | null {
    if (this.status !== "open") return "Already started.";
    this.logMsg("Start pressed. Settings locked; entry stays open until the first number.");
    if (CFG.PRE_START_MS <= 0) { this.goLive(); return null; }
    this.status = "starting";
    this.liveAt = this.now() + CFG.PRE_START_MS;
    this.emit({ to: "all", type: "starting", liveAt: this.liveAt, inMs: CFG.PRE_START_MS });
    return null;
  }

  private goLive(): void {
    this.status = "started";
    this.startedAt = this.now();
    this.liveAt = null;
    this.nextAt = null;
    this.logMsg("Engagement live. Entry closed.");
    this.emit({ to: "all", type: "live" });
    if (!this.sx.onGoLive()) this.nextAt = this.settings.callMode === "manual" ? null : this.now(); // an opening moment, if any, holds the first number
  }

  finishEngagement(why: string): void { this.end(why); }
  applyPendingEmergency(): void { if (this.pendingEmergency) this.applyEmergency(this.pendingEmergency); }
  /** Calling gap: 6 / 10 / 15 s from the settings (the test speed switch still overrides the normal 10 s). */
  gapMs(): number { const c = this.settings.surprise.callSeconds; return c === 10 ? CFG.AI_GAP : c * 1000; }

  end(why = "Organizer ended the engagement"): void {
    if (this.status !== "started") return;
    this.status = "ended";
    this.endedAt = this.now();
    this.paused = null;
    this.nextAt = null;
    this.logMsg(why);
    this.emit({ to: "all", type: "ended", why });
  }

  /** An engagement that was set up but never run and has passed its date: close it so the normal purge path applies. */
  discard(): void {
    if (this.status !== "open") return;
    this.status = "ended";
    this.endedAt = this.now();
    this.logMsg("Closed without being run");
  }

  /** Writes the anonymous summary, then deletes everything personal. */
  purge(): Err | null {
    if (this.status !== "ended") return "Only an ended engagement can be purged.";
    this.summary = {
      players: this.participants.length,
      family: this.participants.filter((p) => p.kind === "family").length,
      teamLeads: this.participants.filter((p) => p.role === "team_lead").length,
      startedAt: this.startedAt, endedAt: this.endedAt,
    };
    this.participants = []; this.waiting = []; this.conflicts = []; this.log = []; this.claims = [];
    this.notValidLog = []; this.winners = new Map(); this.deviceTries.clear(); this.ticketKeys.clear();
    this.sx = new Surprise(this);
    this.status = "purged";
    return null;
  }

  // ---------- live ----------
  private nextBreak(): BrandBreak | undefined {
    if (this.sx.round > 1) return undefined; // brand breaks belong to round 1; later rounds use the break between rounds
    return this.settings.breaks.find((b) => !b.done && b.after === this.called.length);
  }
  private openRewardLines(): RewardLine[] {
    return this.settings.rewards.filter((l) => !this.winners.get(l.id)?.length);
  }

  draw(by?: string): Err | null {
    if (this.status !== "started") return "The engagement is not running.";
    if (this.paused) return "The engagement is paused.";
    if (this.called.length >= 90) { this.sx.finishRound("All 90 numbers called"); return null; }
    const brk = this.nextBreak();
    if (brk) {
      brk.done = true;
      this.paused = { type: "break", brk, until: this.now() + brk.seconds * 1000 };
      this.logMsg(`Brand break: ${brk.title} (${brk.seconds} sec)`);
      this.emit({ to: "all", type: "pause", kind: "break" });
      this.emit({ to: "all", type: "break", title: brk.title, kind: brk.kind, seconds: brk.seconds, mediaUrl: brk.mediaUrl });
      return null;
    }
    const i = this.rand(this.remaining.length);
    const n = this.remaining.splice(i, 1)[0]!;
    this.called.push(n);
    this.current = n;
    this.lastDrawAt = this.now();
    this.nextAt = this.settings.callMode === "manual" ? null : this.now() + this.gapMs();
    this.logMsg(`Call ${this.called.length}${by ? ` (drawn by ${by})` : ""}`); // number deliberately not logged: nobody sees past numbers during the engagement
    this.emit({ to: "all", type: "call", callNo: this.called.length, number: n });
    return null;
  }

  hostDraw(who = "host"): Err | null {
    if (this.settings.callMode !== "manual") return "In this calling mode the system calls the numbers.";
    if (this.paused) return "The engagement is paused.";
    const wait = CFG.MIN_HOST_GAP - (this.now() - this.lastDrawAt);
    if (this.lastDrawAt && wait > 0) return `Wait ${Math.ceil(wait / 1000)} more seconds between numbers.`;
    return this.draw(who);
  }

  emergency(reason: string): Err | null {
    if (this.status !== "started") return "Cannot pause now.";
    if (this.paused?.type === "emergency") return "Already paused.";
    if (this.paused) { this.pendingEmergency = reason; this.logMsg(`Emergency pause requested: ${reason}. It starts right after the current check.`); return null; }
    this.applyEmergency(reason);
    return null;
  }
  private applyEmergency(reason: string) {
    this.paused = { type: "emergency", reason };
    this.pendingEmergency = null;
    this.emit({ to: "all", type: "pause", kind: "emergency", reason });
    this.logMsg(`Emergency pause: ${reason}`);
  }
  resume(): void {
    if (this.paused?.type === "emergency") {
      this.paused = null;
      this.nextAt = this.settings.callMode === "manual" ? null : this.now() + 4_000;
      this.emit({ to: "all", type: "resume" });
    }
  }
  endBreak(): void {
    if (this.paused?.type === "break") this.paused.until = this.now();
  }

  // ---------- claims ----------
  private ticketsOf(p: Participant, which: "A" | "B" | "C" | "AB"): Ticket[] | null {
    if (which === "A") return p.tickets[0] ? [p.tickets[0]] : null;
    if (which === "B") return p.tickets[1] ? [p.tickets[1]] : null;
    if (which === "C") return p.tickets[2] ? [p.tickets[2]] : null; // the Extra ticket booster
    return p.tickets.length >= 2 ? [p.tickets[0]!, p.tickets[1]!] : null; // two-ticket houses use the first two
  }
  private scopeOf(which: "A" | "B" | "C" | "AB"): Scope { return which === "AB" ? "two_ticket" : "ticket"; }
  private linesFor(pattern: PatternId, scope: Scope): RewardLine[] {
    return this.settings.rewards.filter((l) => l.pattern === pattern && l.scope === scope).sort((a, b) => a.ordinal - b.ordinal);
  }

  /**
   * A claim carries the client's list of cut numbers (honour system, owner decision).
   * idx is the call that was current when the claim reached the server (owner decision: claim in flight).
   */
  claim(pid: string, o: { ticket: "A" | "B" | "C" | "AB"; pattern: PatternId; cut: number[] }): Err | null {
    const p = this.byId(pid);
    if (!p) return "Not found.";
    if (this.status !== "started") return "The engagement is not running.";
    if (p.blocked) return "Your ticket is blocked after 2 Not valid claims.";
    if (this.paused && this.paused.type !== "claim") return "Please wait: paused.";
    if (this.called.length === 0) return "No number has been called yet.";
    const ts = this.ticketsOf(p, o.ticket);
    if (!ts) return "You do not have that ticket.";
    const scope = this.scopeOf(o.ticket);
    if (scope === "two_ticket" && o.pattern !== "full") return "Two-ticket claims are for Full House only.";
    const lines = this.linesFor(o.pattern, scope);
    if (lines.length === 0) return "This reward is not in this engagement.";
    const idx = this.called.length - 1;
    const open = lines.some((l) => { const w = this.winners.get(l.id); return !w?.length || w[0]!.idx === idx; });
    if (!open) return "All rewards of this kind have already been awarded.";
    if (this.paused?.type === "claim" && this.paused.items.some((c) => c.pid === pid && c.ticket === o.ticket && c.pattern === o.pattern)) return "Already claimed.";
    const c: Claim = { id: this.uid("cl"), pid, ticket: o.ticket, pattern: o.pattern, cut: [...o.cut], idx, at: this.now() };
    this.claims.push(c);
    if (!this.paused) {
      this.paused = { type: "claim", items: [c], checkAt: this.now() + CFG.CLAIM_CHECK };
      this.emit({ to: "all", type: "pause", kind: "claim" });
    } else this.paused.items.push(c);
    this.logMsg(`${p.name || "A participant"} claimed ${PATTERNS[o.pattern].name}`);
    return null;
  }

  /** Index (in call order) of the call that completed the pattern, or -1 if not complete. */
  private completionIdx(ts: Ticket[], pattern: PatternId, cut: number[]): number {
    const called = new Map(this.called.map((n, i) => [n, i] as const));
    const own = new Set(ts.flatMap(ticketNumbers));
    const cutSet = new Set(cut.filter((n) => own.has(n) && called.has(n)));
    if (pattern === "early5") {
      const idxs = [...cutSet].map((n) => called.get(n)!).sort((a, b) => a - b);
      return idxs.length >= 5 ? idxs[4]! : -1;
    }
    const nums = ts.flatMap((t) => patternNumbers(t, pattern)!);
    if (!nums.every((n) => cutSet.has(n))) return -1;
    return Math.max(...nums.map((n) => called.get(n)!));
  }

  private checkClaims(): void {
    if (this.paused?.type !== "claim") return;
    const results: ResultItem[] = [];
    for (const c of this.paused.items) {
      const p = this.byId(c.pid);
      if (!p) continue;
      const ts = this.ticketsOf(p, c.ticket)!;
      const scope = this.scopeOf(c.ticket);
      const lines = this.linesFor(c.pattern, scope);
      const tid = this.ticketId(p, c.ticket);
      const line = lines.find((l) => { const w = this.winners.get(l.id); return !w?.length || w[0]!.idx === c.idx; });
      let why = "";
      let ok = false;
      if (!line) why = "All rewards of this kind have already been awarded.";
      else {
        const ci = this.completionIdx(ts, c.pattern, c.cut);
        if (ci === -1) {
          const nums = c.pattern === "early5" ? null : ts.flatMap((t) => patternNumbers(t, c.pattern)!);
          why = nums && nums.some((n) => !this.called.includes(n)) ? "Some numbers of this pattern have not been called." : "Some numbers of this pattern were not cut.";
        } else if (ci < c.idx) why = "Late claim: the pattern was complete before the last number. Claims must come before the next number.";
        else ok = true;
      }
      const rName = line ? rewardName(line.pattern, line.scope, line.ordinal, lines.length) : PATTERNS[c.pattern].name;
      if (ok && line) {
        const fun = p.kind === "family" && !this.settings.familyCanWin;
        if (!fun) {
          const ws = this.winners.get(line.id) ?? [];
          if (!ws.find((w) => w.ticketId === tid)) ws.push({ pid: p.id, ticketId: tid, idx: c.idx, callNo: this.called.length, number: this.current!, at: this.now(), share: 1 });
          this.winners.set(line.id, ws);
        }
        results.push({ ok: true, fun, pid: p.id, ticketId: tid, rewardLineId: line.id, rewardName: rName });
        this.logMsg(fun ? `${tid}: valid ${rName} (family for fun)` : `Reward awarded: ${rName} to ${tid}`);
      } else {
        p.notValid++;
        if (p.notValid >= 2) p.blocked = true;
        this.notValidLog.push({ pid: p.id, ticketId: tid, pattern: c.pattern, at: this.now(), why });
        results.push({ ok: false, fun: false, pid: p.id, ticketId: tid, rewardLineId: null, rewardName: rName, why });
        this.logMsg(`Not valid: ${tid} ${rName}. ${why}`);
      }
    }
    for (const ws of this.winners.values()) ws.forEach((w) => (w.share = ws.length));
    this.paused = { type: "result", results, until: this.now() + CFG.RESULT_SHOW };
    this.emit({ to: "all", type: "result", items: results.map((r) => ({ ticketId: r.ticketId, reward: r.rewardName, ok: r.ok, fun: r.fun })) });
  }

  /** Drive the state machine; call from the room alarm. */
  tick(): void {
    if (this.status === "starting" && this.liveAt !== null && this.now() >= this.liveAt) this.goLive();
    if (this.status !== "started") return;
    this.sx.tick();
    if (this.status !== "started") return;
    const t = this.now();
    const pz = this.paused;
    if (pz) {
      if (pz.type === "claim" && t >= pz.checkAt) this.checkClaims();
      else if ((pz.type === "result" || pz.type === "break") && t >= pz.until) {
        const wasResult = pz.type === "result";
        this.paused = null;
        this.nextAt = this.settings.callMode === "manual" ? null : t + CFG.RESUME_DELAY;
        this.emit({ to: "all", type: "resume" });
        if (wasResult && this.openRewardLines().length === 0) { this.sx.finishRound("All rewards awarded"); return; }
        if (wasResult && this.sx.onResultWindowEnd()) return; // a lucky draw or scratch card starts here
        if (this.pendingEmergency) this.applyEmergency(this.pendingEmergency);
      }
    } else if (this.settings.callMode !== "manual" && this.nextAt !== null && t >= this.nextAt) this.draw();
  }

  // ---------- persistence and report ----------
  snapshot(): string {
    return JSON.stringify({
      settings: this.settings, status: this.status, participants: this.participants, waiting: this.waiting,
      conflicts: this.conflicts, called: this.called, current: this.current, paused: this.paused, nextAt: this.nextAt,
      lastDrawAt: this.lastDrawAt, startedAt: this.startedAt, liveAt: this.liveAt, pendingEmergency: this.pendingEmergency, endedAt: this.endedAt, winners: [...this.winners.entries()],
      notValidLog: this.notValidLog, claims: this.claims, log: this.log, summary: this.summary, remaining: this.remaining,
      cancelledPasses: [...this.cancelledPasses], serial: this.serial, seq: this.seq, sx: this.sx.toJSON(),
    });
  }

  static restore(json: string, deps: Deps): EngagementEngine {
    const s = JSON.parse(json);
    const e = new EngagementEngine({}, deps);
    e.settings = s.settings; e.status = s.status; e.participants = s.participants; e.waiting = s.waiting;
    e.conflicts = s.conflicts; e.called = s.called; e.current = s.current; e.paused = s.paused; e.nextAt = s.nextAt;
    e.lastDrawAt = s.lastDrawAt; e.startedAt = s.startedAt; e.liveAt = s.liveAt ?? null; e.pendingEmergency = s.pendingEmergency ?? null; e.endedAt = s.endedAt; e.winners = new Map(s.winners);
    e.notValidLog = s.notValidLog; e.claims = s.claims; e.log = s.log; e.summary = s.summary; e.remaining = s.remaining;
    e.cancelledPasses = new Set(s.cancelledPasses); e.serial = s.serial; e.seq = s.seq;
    e.sx.load(s.sx);
    e.settings.surprise = { ...DEFAULT_SURPRISE, ...(e.settings.surprise ?? {}) };
    e.settings.screenKey ??= e.code(14);
    for (const p of e.participants) p.boosters ??= { joker: 0, extra: 0, pass: 0 };
    e.present = deps.present;
    e.ticketKeys = new Set(e.participants.flatMap((p) => p.tickets.map(ticketKey)));
    return e;
  }

  /** Organizer-only report (contains personal data; deleted with the purge). */
  report() {
    const byPid = new Map(this.participants.map((p) => [p.id, p]));
    const all: { round: number; lineId: string; winners: Winner[] }[] = [...this.sx.roundWinners, ...[...this.winners.entries()].map(([lineId, winners]) => ({ round: this.sx.round, lineId, winners }))];
    const wins = all.flatMap(({ round, lineId, winners: ws }) => {
      const line = this.settings.rewards.find((l) => l.id === lineId);
      if (!line) return [];
      const total = this.linesFor(line.pattern, line.scope).length;
      return ws.map((w) => {
        const p = byPid.get(w.pid);
        return { round, ticketId: w.ticketId, name: p?.name ?? "", e164: p?.e164 ?? "", role: p?.role ?? "", kind: p?.kind ?? null,
          reward: rewardName(line.pattern, line.scope, line.ordinal, total), rewardText: line.text, winners: ws.length, wonOnNumber: w.number, callNo: w.callNo, at: w.at };
      });
    });
    const playedRounds = this.status === "started" || this.status === "ended" ? this.sx.round : 0;
    const notAwarded: { round: number; id: string; text: string }[] = [];
    for (let r = 1; r <= playedRounds; r++) for (const l of this.settings.rewards) {
      const won = r === this.sx.round ? !!this.winners.get(l.id)?.length : this.sx.roundWinners.some((x) => x.round === r && x.lineId === l.id);
      if (!won) notAwarded.push({ round: r, id: l.id, text: l.text });
    }
    const moments = this.sx.results.map((r) => ({ ...r, winners: r.winners.map((w) => ({ ...w, name: byPid.get(w.pid)?.name ?? "" })) }));
    return {
      engagement: this.settings.name, status: this.status, startedAt: this.startedAt, endedAt: this.endedAt, rounds: this.sx.rounds, roundsPlayed: playedRounds,
      participants: this.participants.map((p) => ({ ticketId: this.ticketId(p), name: p.name, e164: p.e164, role: p.role, kind: p.kind, joined: p.status === "joined", notValid: p.notValid, blocked: p.blocked })),
      winners: wins, notAwarded, notValid: this.notValidLog, callOrder: this.called, moments, boosterUses: this.sx.boosterUses.length,
    };
  }

  /** What a (re)connecting participant may be told: no past numbers, no personal data. */
  publicState() {
    return {
      status: this.status,
      liveAt: this.liveAt,
      liveIn: this.liveAt === null ? null : Math.max(0, this.liveAt - this.now()), // relative, so phone clocks do not matter
      callNo: this.called.length,
      current: this.current,
      paused: this.paused ? this.paused.type : null,
      round: this.sx.round, rounds: this.sx.rounds,
      still: this.sx.enabled ? this.sx.still() : null,
      moment: this.sx.activeMoment(),
      surprise: this.sx.enabled ? { autoMark: this.settings.surprise.autoMark, boostersAllowed: this.settings.surprise.boostersAllowed, revealNames: this.settings.surprise.revealNames } : null,
      rewards: this.settings.rewards.map((l) => {
        const total = this.linesFor(l.pattern, l.scope).length;
        return { id: l.id, name: rewardName(l.pattern, l.scope, l.ordinal, total), text: l.text, winners: (this.winners.get(l.id) ?? []).map((w) => w.ticketId) };
      }),
    };
  }

  // ---------------------------------------------------------------- optional features: entry points used by the room
  confirmPresent(pid: string, momentId: string) { return this.sx.confirmPresent(pid, momentId); }
  revealScratch(pid: string, momentId: string) { return this.sx.revealScratch(pid, momentId); }
  useJoker(pid: string, ticket: "A" | "B" | "C", cut: number[]) { return this.sx.useJoker(pid, ticket, cut); }
  triggerMoment(kind: "lucky" | "scratch") { return this.sx.trigger(kind); }
  boostersOf(pid: string) { return this.sx.boostersOf(pid); }
}

export type { Kind, CallMode, TicketMode };
