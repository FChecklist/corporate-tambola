/** The one place that spells a prize position: 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 22nd, 23rd ... 101st ... 111th. Returns "" for 0 or less (there is no 0th prize). */
export const ordinalName = (k: number): string => {
  if (!Number.isFinite(k) || k < 1) return "";
  const n = Math.floor(k), t = n % 100, r = n % 10;
  return n + (t >= 11 && t <= 13 ? "th" : r === 1 ? "st" : r === 2 ? "nd" : r === 3 ? "rd" : "th");
};
