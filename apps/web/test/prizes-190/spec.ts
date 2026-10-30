// Tambola 1.9.0 prizes: the FROZEN rules written out by the test author, from the task text (not read back from the product).
// Row = [ticket, pattern, ordinal, percent]. ticket 0 = a 1-ticket game, or a prize of both tickets together (Super Bumper).
import { createRequire } from "node:module";
export type Row = [number, string, number, number];
const L = (t: number, pct: number): Row[] => [[t, "top", 1, pct], [t, "mid", 1, pct], [t, "bot", 1, pct]];
const FH = (t: number, ps: number[]): Row[] => ps.map((p, i) => [t, "full", i + 1, p] as Row);
const SB = (ps: number[]): Row[] => ps.map((p, i) => [0, "full2", i + 1, p] as Row);
const two = (lines: number, corners: number, fh: number[], e5: number[], sb: number[]): Row[] => [
  ...[1, 2].flatMap((t) => [...L(t, lines), [t, "corners", 1, corners] as Row, ...FH(t, fh)]),
  ...e5.map((p, i) => [1, "early5", i + 1, p] as Row), ...SB(sb)];
export const SPEC: Record<string, Row[]> = {
  "1:4": [...L(0, 20), ...FH(0, [40])],
  "1:6": [...L(0, 15), [0, "corners", 1, 10], ...FH(0, [30, 15])],
  "1:8": [...L(0, 12), [0, "corners", 1, 8], [0, "early5", 1, 8], ...FH(0, [24, 14, 10])],
  "1:10": [...L(0, 9), [0, "corners", 1, 7], [0, "early5", 1, 7], [0, "early5", 2, 5], ...FH(0, [24, 14, 9, 7])],
  "2:12": two(5, 4, [8], [], [30, 16]),
  "2:14": two(4.5, 3.5, [8, 4], [], [26, 16]),
  "2:16": two(4, 3, [7, 4], [5], [22, 12, 9]),
  "2:20": two(3.5, 3, [6, 4, 2.5], [4, 3], [20, 11, 6, 4]),
};
export const PLANS = Object.keys(SPEC).map((k) => { const [t, c] = k.split(":").map(Number); return { tickets: t as 1 | 2, count: c!, key: k }; });
export const idOf = (r: Row) => `${r[0]}:${r[1]}:${r[2]}`;
/** Exact amounts: floor(budget x pct / 100) in whole units (pct in tenths of a percent, integers only), the leftover to the biggest percent (first on a tie). */
export function expectedAmounts(rows: Row[], budget: number): Map<string, number> {
  const out = new Map<string, number>(); let sum = 0, big = 0;
  rows.forEach((r, i) => { const a = Math.floor((budget * Math.round(r[3] * 10)) / 1000); out.set(idOf(r), a); sum += a; if (r[3] > rows[big]![3]) big = i; });
  out.set(idOf(rows[big]!), out.get(idOf(rows[big]!))! + (budget - sum));
  return out;
}
export const planner = (): any => createRequire(import.meta.url)("../../public/prize-planner.js");
/** A small seeded generator (mulberry32), so every run draws the same budgets. */
export const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
