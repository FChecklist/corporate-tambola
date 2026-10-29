// 1.8.0, optional and OFF by default: a different prize for Ticket A and Ticket B in a two-ticket game.
// A reward line keeps its `text` (the prize for Ticket A, and for both when nothing else is said) and may carry `textB` (the prize for Ticket B).
// Who wins is NOT decided here: either ticket can still win, exactly as before. These two small functions only say WHICH ticket won and WHICH prize text goes with it.
import { completionIndex } from "./game";
import type { PatternKey, RewardLine } from "./config";
import type { Ticket } from "../../shared/src/ticket";

export type TicketSlot = "A" | "B";

/** The ticket that completed the house first, from the called numbers `log`. Ticket A on a tie. Null when neither completed it (or with one ticket: always "A" when it completed). */
export function winningSlot(tickets: readonly Ticket[], key: PatternKey, log: readonly number[]): TicketSlot | null {
  const at = tickets.slice(0, 2).map((t) => completionIndex(t, key, log));
  const done = at.map((i, n) => ({ i, n })).filter((x) => x.i >= 0 && Number.isFinite(x.i));
  if (!done.length) return null;
  done.sort((a, b) => a.i - b.i || a.n - b.n);
  return done[0]!.n === 0 ? "A" : "B";
}

/** The prize text for the ticket that won: the Ticket B text only when the line has one and Ticket B won; otherwise the line's own text. */
export const prizeTextFor = (line: Pick<RewardLine, "text"> & { textB?: string }, slot: TicketSlot | null): string => (slot === "B" && line.textB ? line.textB : line.text);

/** True when any line of this game has its own Ticket B prize (the setting is on). */
export const hasPerTicketPrizes = (rewards: readonly (Pick<RewardLine, "scope"> & { textB?: string })[]): boolean => rewards.some((l) => l.scope === "ticket" && !!l.textB);
