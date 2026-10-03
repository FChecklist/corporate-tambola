// What an organizer can set for a phone-run engagement, beyond the start time and speed: how many tickets each participant has (1 or 2),
// the reward lines (what each house wins), and brand breaks (up to 3 scheduled pauses showing the company's own message or video).
// Pure and shared: the Worker validates with it, the organizer page edits it, every phone and the organizer's settlement read it identically.
import type { PatternId, Scope } from "../../shared/src/ticket";

export type PatternKey = PatternId | "full2"; // "full2" = Full Two-Ticket House (all 30 numbers across both tickets)
export interface RewardLine { pattern: PatternId; scope: Scope; ordinal: number; text: string }
export interface BreakCfg { after: number; seconds: number; kind: "file" | "youtube" | "slides" | "speech" | "lucky"; title: string; mediaUrl?: string; winners?: 1 | 3 | 5 | 10; /** How a lucky draw is shown on phones. The winners are drawn the same way either way; a scratch card only changes the reveal. */ style?: "draw" | "scratch" }
/** Who a participant may invite. The organizer switches this on and picks the kinds of guests; each participant may invite at most `per` people (the organizer, hosts and co-hosts any number), and the invitees may invite in turn. */
export const INVITE_CATEGORIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "family", label: "Family members" }, { id: "colleagues", label: "Colleagues" }, { id: "friends", label: "Friends" }, { id: "dealers", label: "Dealers" }, { id: "vendors", label: "Vendors" },
  { id: "customers", label: "Customers" }, { id: "partners", label: "Business partners" }, { id: "franchisees", label: "Franchisees" }, { id: "neighbours", label: "Neighbours and community" }, { id: "guests", label: "Other guests" },
];
export interface InviteCfg { on: boolean; per: number; cats: string[] }
export const MAX_INVITES_PER_PERSON = 10;
export const defaultInvites = (): InviteCfg => ({ on: false, per: 4, cats: ["family", "colleagues"] });
export interface EngagementCfg { tickets: 1 | 2; rewards: RewardLine[]; breaks: BreakCfg[]; rounds: number; invites?: InviteCfg }
export const MAX_ROUNDS = 5;
/** The game starts this many 3 s beacon rounds (2 minutes) after the time the organizer gave: the last 2 minutes are "setting up, waiting for everyone to join". */
export const GRACE_ROUNDS = 40;
/** Someone who joins after the game began only sees numbers called from this many rounds (90 s) after joining, so every phone has heard about them before their first number counts. */
export const LATE_LAG_ROUNDS = 30;
/** Between two rounds everyone waits this many 3 s beacon rounds (90 s) before the next round's first number. */
export const INTERMISSION_ROUNDS = 30;
/** Round 1 keeps the engagement's own id; later rounds use a derived id, so each round has its own numbers and its own tickets. */
export const roundEid = (eid: string, round: number): string => (round <= 1 ? eid : `${eid}~r${round}`);

export const PATTERN_ORDER: readonly PatternId[] = ["early5", "top", "mid", "bot", "corners", "star", "full"];
export const MAX_BREAKS = 3;
export const MAX_REWARD_LINES = 30;
export const MAX_ORDINAL = 5;
const KINDS = new Set(["file", "youtube", "slides", "speech", "lucky"]);
export const LUCKY_WINNERS = [1, 3, 5, 10] as const;

/** One reward line for each house, no text: what an engagement has until the organizer says otherwise. */
export const defaultRewards = (): RewardLine[] => PATTERN_ORDER.map((pattern) => ({ pattern, scope: "ticket", ordinal: 1, text: "" }));
export const defaultCfg = (): EngagementCfg => ({ tickets: 1, rewards: defaultRewards(), breaks: [], rounds: 1, invites: defaultInvites() });

export const keyOfLine = (l: Pick<RewardLine, "pattern" | "scope">): PatternKey => (l.scope === "two_ticket" ? "full2" : l.pattern);
export const lineKey = (l: RewardLine) => `${keyOfLine(l)}#${l.ordinal}`;
/** The distinct houses in play, in a stable order. */
export const keysInPlay = (rewards: readonly RewardLine[]): PatternKey[] => {
  const seen = new Set<PatternKey>();
  const order: PatternKey[] = [...PATTERN_ORDER, "full2"];
  for (const l of rewards) seen.add(keyOfLine(l));
  return order.filter((k) => seen.has(k));
};
export const linesFor = (rewards: readonly RewardLine[], key: PatternKey) => rewards.filter((l) => keyOfLine(l) === key).sort((a, b) => a.ordinal - b.ordinal);

/** Rounds (3 s each) a break adds before call index `k`: every break that starts at or before it. */
export const breakShift = (breaks: readonly BreakCfg[], k: number): number => breaks.reduce((s, b) => s + (b.after <= k ? b.seconds / 3 : 0), 0);

const cleanText = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[<>`]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "");
const YT = /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i;

/** Validates what the organizer sent. Returns the cleaned config, or a plain-English reason. Missing parts keep their defaults. */
export function validateCfg(input: { tickets?: unknown; rewards?: unknown; breaks?: unknown; rounds?: unknown; invites?: unknown }, base: EngagementCfg = defaultCfg()): { ok: true; cfg: EngagementCfg } | { ok: false; error: string } {
  const cfg: EngagementCfg = { tickets: base.tickets, rewards: base.rewards, breaks: base.breaks, rounds: base.rounds ?? 1, invites: base.invites ?? defaultInvites() };
  if (input.rounds !== undefined) {
    if (!Number.isInteger(input.rounds) || (input.rounds as number) < 1 || (input.rounds as number) > MAX_ROUNDS) return { ok: false, error: `An engagement has 1 to ${MAX_ROUNDS} rounds.` };
    cfg.rounds = input.rounds as number;
  }
  if (input.tickets !== undefined) {
    if (input.tickets !== 1 && input.tickets !== 2) return { ok: false, error: "Each participant gets 1 or 2 tickets." };
    cfg.tickets = input.tickets;
  }
  if (input.rewards !== undefined) {
    if (!Array.isArray(input.rewards) || input.rewards.length < 1 || input.rewards.length > MAX_REWARD_LINES) return { ok: false, error: `Add between 1 and ${MAX_REWARD_LINES} rewards.` };
    const out: RewardLine[] = []; const seen = new Set<string>();
    for (const r of input.rewards as any[]) {
      const pattern = r?.pattern as PatternId; const scope: Scope = r?.scope === "two_ticket" ? "two_ticket" : "ticket"; const ordinal = r?.ordinal === undefined ? 1 : r.ordinal;
      if (!PATTERN_ORDER.includes(pattern)) return { ok: false, error: "Unknown house in the rewards." };
      if (scope === "two_ticket" && pattern !== "full") return { ok: false, error: "Only the Full House can be won across two tickets." };
      if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > MAX_ORDINAL) return { ok: false, error: `A house can be awarded up to ${MAX_ORDINAL} times.` };
      const id = `${scope}:${pattern}#${ordinal}`;
      if (seen.has(id)) return { ok: false, error: "The same reward is listed twice." };
      seen.add(id);
      out.push({ pattern, scope, ordinal, text: cleanText(r?.text, 80) });
    }
    for (const l of out) if (l.ordinal > 1 && !out.some((x) => x.pattern === l.pattern && x.scope === l.scope && x.ordinal === l.ordinal - 1)) return { ok: false, error: "A 2nd, 3rd... reward needs the one before it. Note that sending rewards REPLACES the whole list, so send every reward line each time, with ordinals starting at 1 for each house." };
    if (out.some((l) => l.scope === "two_ticket") && (input.tickets ?? cfg.tickets) !== 2) return { ok: false, error: "A Full Two-Ticket House needs two tickets per participant." };
    cfg.rewards = out;
  }
  if (cfg.tickets === 1 && cfg.rewards.some((l) => l.scope === "two_ticket")) cfg.rewards = cfg.rewards.filter((l) => l.scope !== "two_ticket");
  if (cfg.rewards.length === 0) cfg.rewards = defaultRewards();
  if (input.breaks !== undefined) {
    if (!Array.isArray(input.breaks) || input.breaks.length > MAX_BREAKS) return { ok: false, error: `At most ${MAX_BREAKS} brand breaks.` };
    const out: BreakCfg[] = [];
    for (const b of input.breaks as any[]) {
      const after = b?.after, seconds = b?.seconds, kind = b?.kind;
      if (!Number.isInteger(after) || after < 1 || after > 89) return { ok: false, error: "A break starts after 1 to 89 numbers have been called." };
      if (!Number.isInteger(seconds) || seconds < 15 || seconds > 600 || seconds % 3) return { ok: false, error: "A break lasts 15 to 600 seconds, in steps of 3." };
      if (!KINDS.has(kind)) return { ok: false, error: "A break is a file, a YouTube link, slides, a speech or a lucky draw." };
      const winners = kind === "lucky" ? (b?.winners === undefined ? 3 : b.winners) : undefined;
      if (kind === "lucky" && !(LUCKY_WINNERS as readonly number[]).includes(winners)) return { ok: false, error: "A lucky draw picks 1, 3, 5 or 10 people." };
      const style = kind === "lucky" ? (b?.style === undefined || b.style === "" ? "draw" : b.style) : undefined;
      if (kind === "lucky" && style !== "draw" && style !== "scratch") return { ok: false, error: "A lucky draw is shown as a draw or as a scratch card." };
      if (kind !== "lucky" && b?.style !== undefined && b.style !== "") return { ok: false, error: "Only a lucky draw has a style." };
      const title = cleanText(b?.title, 80);
      if (title.length < 2) return { ok: false, error: "Give each break a short title." };
      let mediaUrl: string | undefined;
      if (b?.mediaUrl !== undefined && b.mediaUrl !== "") {
        if (typeof b.mediaUrl !== "string" || b.mediaUrl.length > 300 || !/^https:\/\/[^\s<>"'`]+$/i.test(b.mediaUrl)) return { ok: false, error: "The link must start with https:// and have no spaces." };
        if (kind === "youtube" && !YT.test(b.mediaUrl)) return { ok: false, error: "A YouTube break needs a YouTube link." };
        mediaUrl = b.mediaUrl;
      }
      if ((kind === "file" || kind === "youtube") && !mediaUrl) return { ok: false, error: "This kind of break needs a link." };
      if (kind === "lucky" && mediaUrl) return { ok: false, error: "A lucky draw has no link." };
      out.push({ after, seconds, kind, title, ...(mediaUrl ? { mediaUrl } : {}), ...(winners ? { winners } : {}), ...(style === "scratch" ? { style } : {}) });
    }
    out.sort((a, b) => a.after - b.after);
    for (let i = 1; i < out.length; i++) if (out[i]!.after === out[i - 1]!.after) return { ok: false, error: "Two breaks cannot start at the same number." };
    cfg.breaks = out;
  }
  if (input.invites !== undefined) {
    const v = input.invites as any;
    if (!v || typeof v !== "object" || typeof v.on !== "boolean") return { ok: false, error: "Invites: say whether they are on or off." };
    const per = v.per === undefined ? cfg.invites!.per : v.per;
    if (!Number.isInteger(per) || per < 1 || per > MAX_INVITES_PER_PERSON) return { ok: false, error: `Each person can invite 1 to ${MAX_INVITES_PER_PERSON} people.` };
    const cats = v.cats === undefined ? cfg.invites!.cats : v.cats;
    if (!Array.isArray(cats) || cats.some((c: unknown) => !INVITE_CATEGORIES.some((k) => k.id === c))) return { ok: false, error: "Pick the kinds of guests from the list." };
    const uniq = [...new Set(cats as string[])];
    if (v.on && uniq.length < 1) return { ok: false, error: "Pick at least one kind of guest people may invite." };
    cfg.invites = { on: v.on, per, cats: uniq };
  }
  return { ok: true, cfg };
}
