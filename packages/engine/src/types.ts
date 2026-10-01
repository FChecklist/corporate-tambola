import type { PatternId, Scope, Ticket } from "@tambola/shared";

export type Role = "participant" | "team_lead" | "host";
export type Kind = null | "colleague" | "family";
export type EngagementStatus = "open" | "starting" | "started" | "ended" | "purged";
export type CallMode = "ai" | "manual" | "both";
export type TicketMode = "single" | "double";
export type Actor = "organizer" | "host";

export interface Boosters { joker: number; extra: number; pass: number }
export type BoosterKind = "joker" | "extra" | "pass";
export type PrizeKind = "gift" | "booster" | "mix";
/** Optional: rounds, lucky draws, scratch cards, boosters. Defaults leave the engagement exactly as before (one round, nothing extra). */
export interface SurpriseSettings {
  rounds: number; // 1-5
  callSeconds: 6 | 9 | 12 | 15; // calling speed: multiples of the 3 s public-beacon round (fast / normal / relaxed / slow)
  autoMark: boolean; // phones mark called numbers for the participant (claims still carry the cut list)
  luckyDraws: number; // 0-10, counted per engagement
  luckyWinners: 1 | 3 | 5 | 10;
  luckyPrize: "gift" | "booster";
  bumper: boolean; // the last lucky draw is a bumper and always the last moment
  scratchCards: number; // 0-10, counted per engagement
  scratchWinning: 5 | 10 | 20 | 50; // exact number of winning cards per scratch round, never a percentage
  scratchPrize: PrizeKind;
  momentsMode: "auto" | "manual";
  boostersAllowed: boolean;
  revealNames: boolean; // OFF by default: winners are shown by ticket id. ON: first name + department + last 4 digits (needs participants' consent wording)
}
export const DEFAULT_SURPRISE: SurpriseSettings = { rounds: 1, callSeconds: 9, autoMark: true, luckyDraws: 0, luckyWinners: 3, luckyPrize: "gift", bumper: true, scratchCards: 0, scratchWinning: 10, scratchPrize: "mix", momentsMode: "auto", boostersAllowed: true, revealNames: false };

export interface Moment {
  id: string; kind: "lucky" | "scratch"; slot: string; winners: number; prize: PrizeKind; bumper: boolean;
  status: "pending" | "running" | "done" | "skipped"; startedAt?: number; endedAt?: number; round?: number;
}

export interface RewardLine {
  id: string;
  pattern: PatternId;
  scope: Scope;
  ordinal: number; // 1 = first house of this kind
  text: string;
}

export interface BrandBreak {
  id: string;
  after: number; // starts when this many numbers have been called
  kind: "file" | "youtube" | "slides" | "speech";
  title: string;
  seconds: number;
  mediaUrl?: string; // company-hosted video file URL or YouTube link
  done: boolean;
}

export interface Participant {
  id: string;
  name: string;
  info: string; // department / flat
  e164: string;
  role: Role;
  kind: Kind;
  source: "list" | "pass" | "waiting_room";
  invitedBy: string | null;
  status: "not_joined" | "pass_sent" | "joined";
  cap: number;
  passCode: string | null;
  roleLink: string | null;
  device: string | null;
  tickets: Ticket[]; // 1 or 2 (3 when an Extra ticket booster is used)
  boosters: Boosters;
  namesConsent?: boolean; // joined while the "show winners' names" option was on, so they saw its consent wording
  serial: number;
  notValid: number;
  blocked: boolean;
  consentAt: number | null;
  joinedAt: number | null;
}

export interface WaitingEntry {
  id: string;
  name: string;
  info: string;
  e164: string;
  invitedBy: string | null;
  device: string | null;
  at: number;
}

export interface Conflict { id: string; pid: string; device: string; at: number; done: boolean; resolution?: "kept" | "moved" }

export interface Settings {
  id: string;
  code: string;
  screenKey: string; // secret for the big-screen link
  name: string;
  orgName: string;
  limit: number;
  familyLimit: number; // 0..4
  familyCanWin: boolean;
  participantInvites: number; // 0..3
  ticketMode: TicketMode;
  callMode: CallMode;
  defaultCountry: string;
  surprise: SurpriseSettings;
  startsAt: number | null;
  tz: string;
  rewards: RewardLine[];
  breaks: BrandBreak[];
}

export interface Claim { id: string; pid: string; ticket: "A" | "B" | "C" | "AB"; pattern: PatternId; cut: number[]; idx: number; at: number }

export interface Winner { pid: string; ticketId: string; idx: number; callNo: number; number: number; at: number; share: number }

export type Pause =
  | { type: "claim"; items: Claim[]; checkAt: number }
  | { type: "result"; results: ResultItem[]; until: number }
  | { type: "break"; brk: BrandBreak; until: number }
  | { type: "emergency"; reason: string }
  | { type: "moment"; momentId: string; until: number }
  | { type: "intermission"; round: number; until: number };

export interface ResultItem {
  ok: boolean;
  fun: boolean;
  pid: string; // internal only; never broadcast
  ticketId: string;
  rewardLineId: string | null;
  rewardName: string;
  why?: string;
}

/** Everything sent to participants is built from these; none carries a name, number or other personal data. */
export type PublicEvent =
  | { to: "all"; type: "call"; callNo: number; number: number }
  | { to: "all"; type: "pause"; kind: "claim" | "result" | "break" | "emergency"; reason?: string }
  | { to: "all"; type: "result"; items: { ticketId: string; reward: string; ok: boolean; fun: boolean }[] }
  | { to: "all"; type: "break"; title: string; kind: BrandBreak["kind"]; seconds: number; mediaUrl?: string }
  | { to: "all"; type: "resume" }
  | { to: "all"; type: "starting"; liveAt: number; inMs: number }
  | { to: "all"; type: "live" }
  | { to: "all"; type: "ended"; why: string }
  | { to: "all"; type: "round_start"; round: number; of: number }
  | { to: "all"; type: "round_end"; round: number; of: number }
  | { to: "all"; type: "moment_start"; id: string; kind: "lucky" | "scratch"; winners: number; bumper: boolean; prize: string; seconds: number }
  | { to: "all"; type: "moment_result"; id: string; kind: "lucky" | "scratch"; winners: string[]; winningCards?: number; bumper: boolean }
  | { to: "pid"; pid: string; type: "lucky_won"; momentId: string; confirmSeconds: number; prize: string }
  | { to: "pid"; pid: string; type: "scratch_result"; momentId: string; outcome: "gift" | "joker" | "extra" | "pass" | "none" }
  | { to: "pid"; pid: string; type: "booster"; boosters: Boosters }
  | { to: "console"; type: "log"; msg: string };
