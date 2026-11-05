// The average gap between two numbers, worked out from the REAL times of the calls of this game, separately for the numbers the game called by itself (automatic) and the numbers a Host or the Organizer
// called by hand (manual). A mode shows "not yet" until it has at least MIN_FOR_AVERAGE numbers. Pauses and breaks are part of real time, so they show in the average.
export const MIN_FOR_AVERAGE = 3;
export const averageGapSeconds = (timesMs: readonly number[]): number | null => {
  if (timesMs.length < MIN_FOR_AVERAGE) return null;
  const s = [...timesMs].sort((a, b) => a - b);
  return Math.round(((s[s.length - 1]! - s[0]!) / (s.length - 1)) / 100) / 10; // seconds, one decimal
};
export interface CallTime { ms: number; manual: boolean }
export function gapsByMode(calls: readonly CallTime[]): { auto: number | null; manual: number | null; nAuto: number; nManual: number } {
  const a = calls.filter((c) => !c.manual).map((c) => c.ms), m = calls.filter((c) => c.manual).map((c) => c.ms);
  return { auto: averageGapSeconds(a), manual: averageGapSeconds(m), nAuto: a.length, nManual: m.length };
}

/** The one counter line, the same words on the player's page, the board screen, the log, the game log and the e-mail: "31 of 90 called \u00b7 59 left". */
export const calledLine = (called: number, total = 90): string => `${called} of ${total} called \u00b7 ${Math.max(0, total - called)} left`;
/** The one-line check at the top of the log: how many numbers were announced and whether any was missed. `due` = how many were due by the schedule; `announced` = how many the log holds. */
export function sequenceCheck(announced: number, due: number): { ok: boolean; missing: number[]; text: string } {
  const missing: number[] = []; for (let k = announced + 1; k <= due; k++) missing.push(k);
  const n = announced === 1 ? "1 number" : `${announced} numbers`;
  if (announced === 0 && due === 0) return { ok: true, missing, text: "No number has been announced yet." };
  return missing.length ? { ok: false, missing, text: `${n} announced. Missed: ${missing.length > 6 ? missing.slice(0, 6).join(", ") + " and more" : missing.join(", ")}.` } : { ok: true, missing, text: `${n} announced, none missed.` };
}
