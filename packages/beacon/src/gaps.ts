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
