// The ask rhythm of a phone (1.5.2): every phone asks the claim signal once per period, at its own SLOT, so that thousands of phones do not ask in waves.
// slot = ticket number mod the number of slots; the slot decides the moment inside the period. Small games ask every 2 s in 8 slots (250 ms apart); big games get more slots and a longer period.
// Everything is derived from the game's size (known to every phone), so there is nothing extra to announce and a late joiner falls into the pattern at once.
export const beatPeriodMs = (cap: number): number => (cap <= 2000 ? 2000 : cap <= 5000 ? 3000 : 4000);
export const beatSlots = (cap: number): number => Math.min(64, Math.max(8, Math.round((cap || 0) / 150)));
/** The ticket number inside a participant id ("7x4f.." is ticket 7); 0 when unknown. */
export const ticketOf = (pid: string | null | undefined): number => { const n = parseInt(String(pid ?? ""), 10); return Number.isFinite(n) && n > 0 ? n : 0; };
/** The moment inside the period at which this ticket asks (milliseconds after a period starts, on the beacon-synced clock). A small fixed per-ticket nudge inside the slot spreads tickets that share a slot. */
export const beatOffsetMs = (ticket: number, cap: number): number => {
  const p = beatPeriodMs(cap), s = beatSlots(cap), w = Math.max(1, Math.floor(p / s));
  return Math.floor(((ticket % s) * p) / s) + (Math.floor(ticket / s) * 37) % w;
};
/** How long from `wallMs` until this ticket's next ask (0 = now). */
export const msToNextBeat = (wallMs: number, ticket: number, cap: number): number => {
  const p = beatPeriodMs(cap), off = beatOffsetMs(ticket, cap);
  const phase = (((wallMs - off) % p) + p) % p;
  return phase === 0 ? 0 : p - phase;
};
/** After the claim signal moved, the claim list is read after this wait (0..1 s by slot), so 10,000 phones do not read it at the same instant. A claimant's own press is never delayed. */
export const followUpSpreadMs = (ticket: number, cap: number): number => { const s = beatSlots(cap), span = cap <= 2000 ? 500 : 1000; return Math.floor(((ticket % s) * span) / s); }; // (half a second in small games so the notice stays near 3 s; a second in big ones)
/** A phone that has had no answer for this long shows a calm "Reconnecting" line. */
export const reconnectAfterMs = (cap: number): number => Math.round(beatPeriodMs(cap) * 1.5) + 1000;

/** PRESENCE sampling: about this many "I am listening" reports a minute for a whole game, however big (so about 300 small writes an hour). */
export const PRESENCE_PER_MIN = 5;
/** One phone in K reports in a given minute (ticket mod K = minute mod K) and each report counts K phones. */
export const presenceK = (cap: number) => Math.max(1, Math.ceil((Number(cap) || 0) / PRESENCE_PER_MIN));
