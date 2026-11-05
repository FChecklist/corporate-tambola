// The four game modes: how the game STARTS (by itself at the time / the Host or Organizer presses Start) x who CALLS the numbers (the game / a Host).
//   1. Auto start, auto play    2. Auto start, manual play    3. Manual start, auto play    4. Manual start, manual play
// Plus the plain-words list of "what changed, who, when" that the Organizer and the Host can read, and that is kept in the game record.
// Nothing here ever holds a player's name, number, ticket or seat: only the rule that changed and the role of whoever changed it.
import { cfgOf as controlCfg, readPublished, resolveControl, type KV } from "../../../packages/beacon/src/control";
import { hostGameOf } from "../../../packages/beacon/src/game";
import { MANUAL_MAX_PARTICIPANTS } from "../../../packages/beacon/src/control";
import { CLAIM_LATE_TEXT, type EngagementCfg } from "../../../packages/beacon/src/config";
import type { D1 } from "./worker";

export const GENESIS_S = 1692803367;
const roundMs = (r: number) => (GENESIS_S + (r - 1) * 3) * 1000;
const istTime = (ms: number) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) + " IST";

/** The round a Start was pressed for in a manual-start game, or null (not pressed yet, or the game starts by itself). */
export async function goRoundOf(kv: KV, e: { id: string; start_round: number }, cfg: EngagementCfg): Promise<number | null> {
  if (cfg.startMode !== "manual") return null;
  const f = await readPublished(kv, e.id);
  return f ? resolveControl(controlCfg(f, hostGameOf(cfg, e.start_round)), f.messages).goRound : null;
}

/** Whether this game needs a signed control file (a key registered) to run: a Host's presses and a Start are both signed messages. */
export const needsControl = (c: Pick<EngagementCfg, "callMode" | "startMode">) => c.callMode === "host" || c.startMode === "manual";

export const MANUAL_LIMIT_MSG = `Games above ${MANUAL_MAX_PARTICIPANTS.toLocaleString("en-IN")} people are called by the game itself: choose "The game does". You can still press Start yourself.`;
/** Manual PLAY (a Host or the Organizer calls every number) is for games of up to 1,000 people. Pressing Start has no size limit: above 2,000 people it uses its own slower control-file profile with a longer lead (see startSafetyForCap). Returns the plain refusal, or null. */
export const modeTooBig = (c: Pick<EngagementCfg, "callMode" | "startMode">, cap: number): string | null =>
  c.callMode === "host" && cap > MANUAL_MAX_PARTICIPANTS ? MANUAL_LIMIT_MSG : null;
export const NEEDS_CONSOLE_MSG = "Open your console once first: it prepares the Start and Next buttons for this game. Then change this setting again.";
export const STARTED_MSG = "The game has already started, so it can no longer be changed.";
export const NOT_BEFORE_MSG = "The game cannot be started before its start time. To start earlier, change the start time first.";

/** One plain sentence for a mode, as the Organizer and the Host read it. */
export const modeWords = (c: Pick<EngagementCfg, "callMode" | "startMode">) =>
  `${c.startMode === "manual" ? "You press Start at the time" : "Starts by itself at the time"}; ${c.callMode === "host" ? "a Host calls every number" : "the game calls the numbers"}`;

/** Who did it, in words that mean something to the people reading the list (never a key, name or number). */
export function whoLabel(a: { plat?: boolean; kind?: string | null }, viaLink = false): string {
  if (a.plat) return "The platform owner";
  if (a.kind === "host") return viaLink ? "A Host's AI assistant" : "A Host";
  if (a.kind === "ai") return "The Organizer's AI assistant";
  if (a.kind === "master") return "The Organizer";
  return "Someone with the Organizer's link";
}

export interface SettingsView { start_round: number; call_seconds: number; cap: number; closed: number | null; cfg: EngagementCfg }
const speed = (s: number) => `${s} seconds between numbers`;
/** The plain list of what a save changed, comparing the game before and after. Empty when nothing the people care about moved. */
export function describeChanges(before: SettingsView, after: SettingsView): string[] {
  const out: string[] = [];
  const b = before.cfg, a = after.cfg;
  if (before.start_round !== after.start_round) out.push(`Start time changed from ${istTime(roundMs(before.start_round))} to ${istTime(roundMs(after.start_round))}`);
  if ((b.startMode ?? "auto") !== (a.startMode ?? "auto")) out.push(a.startMode === "manual" ? "How it starts: now you press Start at the time (was: by itself)" : "How it starts: now by itself at the time (was: you press Start)");
  if ((b.callMode ?? "auto") !== (a.callMode ?? "auto")) out.push(a.callMode === "host" ? "Who calls the numbers: now a Host (was: the game)" : "Who calls the numbers: now the game (was: a Host)");
  if (!!b.keepCalling !== !!a.keepCalling) out.push(a.keepCalling ? "When every prize is won: now keep calling until all 90 numbers (was: end the game)" : "When every prize is won: now end the game (was: keep calling until all 90 numbers)");
  if (before.call_seconds !== after.call_seconds && a.callMode !== "host" && b.callMode !== "host") out.push(`Speed changed: ${speed(after.call_seconds)} (was ${before.call_seconds})`);
  if (before.cap !== after.cap) out.push(`Number of people changed from ${before.cap} to ${after.cap}`);
  if ((before.closed ? 1 : 0) !== (after.closed ? 1 : 0)) out.push(after.closed ? "Who can join: now only people on the list" : "Who can join: now anyone with the link");
  if (b.tickets !== a.tickets) out.push(`Tickets per person changed from ${b.tickets} to ${a.tickets}`);
  if (JSON.stringify(b.rewards) !== JSON.stringify(a.rewards)) out.push("The prizes were changed");
  if (JSON.stringify(b.prizePlan ?? null) !== JSON.stringify(a.prizePlan ?? null)) out.push("The prize plan was changed"); // 1.9.0: logged like every other change before the game starts (no amounts in the line)
  if (JSON.stringify(b.breaks) !== JSON.stringify(a.breaks)) out.push("The breaks and brand moments were changed");
  if (b.rounds !== a.rounds) out.push(`Number of rounds changed from ${b.rounds} to ${a.rounds}`);
  if ((b.ties ?? "share") !== (a.ties ?? "share")) out.push("The tie rule was changed");
  if ((b.name ?? "") !== (a.name ?? "")) out.push("The game name was changed");
  if (JSON.stringify(b.invites) !== JSON.stringify(a.invites)) out.push("The invite settings were changed");
  if (JSON.stringify([b.verify, b.employeesOnly, b.idKind]) !== JSON.stringify([a.verify, a.employeesOnly, a.idKind])) out.push("How people are checked at the door was changed");
  if (JSON.stringify([b.opening, b.closing, b.brand]) !== JSON.stringify([a.opening, a.closing, a.brand])) out.push("The company look or opening/closing moments were changed");
  return out;
}

export interface ChangeRow { at: number; who: string; what: string }
const KEEP = 200;
const key = (eid: string) => `chg/${eid}`;
/** Appends lines to the game's visible list. Best effort: the list must never break the work it describes. */
export async function logChanges(db: D1, eid: string, now: number, who: string, what: string[]): Promise<void> {
  if (!what.length) return;
  try {
    const row = await db.prepare("SELECT v FROM kv WHERE k=?").bind(key(eid)).first<{ v: string }>();
    let list: ChangeRow[] = []; try { list = row ? JSON.parse(row.v) : []; } catch { list = []; }
    for (const w of what) list.push({ at: now, who, what: w.slice(0, 240) });
    list = list.slice(-KEEP);
    await db.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(key(eid), JSON.stringify(list)).run();
  } catch { /* best effort */ }
}
export async function readChanges(db: D1, eid: string): Promise<ChangeRow[]> {
  try {
    const row = await db.prepare("SELECT v FROM kv WHERE k=?").bind(key(eid)).first<{ v: string }>();
    const list = row ? JSON.parse(row.v) : [];
    return (Array.isArray(list) ? list : []).filter((x: any) => x && Number.isFinite(x.at) && typeof x.who === "string" && typeof x.what === "string").map((x: any) => ({ at: x.at, who: x.who, what: x.what }));
  } catch { return []; }
}
/** The list as the Organizer and the Host see it: newest first, each with a readable time. */
export const changesView = (rows: ChangeRow[]) => rows.slice().reverse().map((r) => ({ at: r.at, when: istTime(r.at), who: r.who, what: r.what }));

/** What phones, the big screen and the Host screen need to follow a change made after publishing. It rides in the control file they already poll (no extra requests). */
export function liveOf(e: { start_round: number; call_seconds: number }, cfg: EngagementCfg) {
  return { startRound: e.start_round, callSeconds: e.call_seconds, callMode: cfg.callMode === "host" ? "host" : "auto", startMode: cfg.startMode === "manual" ? "manual" : "auto", afterPrizes: cfg.keepCalling ? "keep" : "end" };
}

/** A prize completed on number N can be claimed only until number N+1 is announced: what a player is told when the claim came too late (the Worker's clock decides). */
export const CLAIM_LATE_MSG = CLAIM_LATE_TEXT;
