import type { PatternId, Scope, Ticket } from "@tambola/shared";

export type Role = "participant" | "team_lead" | "host";
export type Kind = null | "colleague" | "family";
export type EngagementStatus = "open" | "started" | "ended" | "purged";
export type CallMode = "ai" | "manual" | "both";
export type TicketMode = "single" | "double";
export type Actor = "organizer" | "host";

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
  done: boolean;
}

export interface Participant {
  id: string;
  name: string;
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
  tickets: Ticket[]; // 1 or 2
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
  name: string;
  orgName: string;
  limit: number;
  familyLimit: number; // 0..4
  familyCanWin: boolean;
  participantInvites: number; // 0..3
  ticketMode: TicketMode;
  callMode: CallMode;
  defaultCountry: string;
  startsAt: number | null;
  tz: string;
  rewards: RewardLine[];
  breaks: BrandBreak[];
}

export interface Claim { id: string; pid: string; ticket: "A" | "B" | "AB"; pattern: PatternId; cut: number[]; idx: number; at: number }

export interface Winner { pid: string; ticketId: string; idx: number; callNo: number; number: number; at: number; share: number }

export type Pause =
  | { type: "claim"; items: Claim[]; checkAt: number }
  | { type: "result"; results: ResultItem[]; until: number }
  | { type: "break"; brk: BrandBreak; until: number }
  | { type: "emergency"; reason: string };

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
  | { to: "all"; type: "break"; title: string; kind: BrandBreak["kind"]; seconds: number }
  | { to: "all"; type: "resume" }
  | { to: "all"; type: "ended"; why: string }
  | { to: "console"; type: "log"; msg: string };
