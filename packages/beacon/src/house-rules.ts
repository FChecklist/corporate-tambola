// What each house asks of ONE ticket, in one place, so the incremental engine, the whole-log settlement, the claim check and the phone page can never disagree.
//   pool rule  : the house is complete when `k` of the numbers in `pool` have been called (a fixed shape has k = pool.length; "any five" has the whole ticket as its pool and k = 5).
//   lines rule : Two Lines. Every line is its own set; the house is complete when two of them are.
// Unlucky is not a ticket rule (it compares tickets with each other): ruleOf returns null for it, and for the two-ticket house.
import { ticketNumbers, type Ticket } from "../../shared/src/ticket";
import type { PatternKey } from "./config";

export type Rule = { pool: number[]; k: number } | { lines: number[][] };

const row = (t: Ticket, r: number) => t[r]!.filter((v): v is number => v !== null);

/** The rule of house `key` on ticket `t`; null for houses that are not decided on one ticket (Unlucky, the two-ticket house). */
export function ruleOf(t: Ticket, key: PatternKey): Rule | null {
  const a = row(t, 0), b = row(t, 1), c = row(t, 2), all = ticketNumbers(t);
  const set = (n: number[]): Rule => ({ pool: n, k: n.length });
  const any = (pool: number[], k: number): Rule => ({ pool, k });
  switch (key) {
    case "early5": return any(all, 5);
    case "early7": return any(all, 7);
    case "early10": return any(all, 10);
    case "top": return set(a);
    case "mid": return set(b);
    case "bot": return set(c);
    case "twolines": return { lines: [a, b, c] };
    case "corners": return set([a[0]!, a[4]!, c[0]!, c[4]!]);
    case "star": return set([a[0]!, a[4]!, c[0]!, c[4]!, b[2]!]);
    case "plus": return set([...b, a[2]!, c[2]!]);
    case "frame": return set([...a, ...c, b[0]!, b[4]!]);
    case "topbottom": return set([...a, ...c]);
    case "midcorners": return set([...b, a[0]!, a[4]!, c[0]!, c[4]!]);
    case "odd5": return any(all.filter((n) => n % 2 === 1), 5);
    case "even5": return any(all.filter((n) => n % 2 === 0), 5);
    case "low5": return any(all.filter((n) => n <= 30), 5);
    case "high5": return any(all.filter((n) => n >= 61), 5);
    case "full": return set(all);
    default: return null; // full2, unlucky
  }
}

/** Index in `log` at which the ticket completes `key`, or -1. A 0 in the log (a number hidden from a late joiner) matches nothing. */
export function ticketCompletion(t: Ticket, key: PatternKey, log: readonly number[]): number {
  const r = ruleOf(t, key);
  if (!r) return -1;
  if ("lines" in r) {
    const done: number[] = [];
    for (const ln of r.lines) { const i = firstFull(ln, ln.length, log); if (i >= 0) done.push(i); }
    return done.length < 2 ? -1 : done.sort((x, y) => x - y)[1]!;
  }
  return firstFull(r.pool, r.k, log);
}
function firstFull(pool: readonly number[], k: number, log: readonly number[]): number {
  if (pool.length < k) return -1; // this ticket cannot complete it (for example fewer than five odd numbers)
  const left = new Set(pool); let hit = 0;
  for (let i = 0; i < log.length; i++) if (left.delete(log[i]!) && ++hit === k) return i;
  return -1;
}

/** How many more numbers this ticket needs for `key` after `called`. 99 = it cannot happen on this ticket. */
export function ticketStillNeeds(t: Ticket, key: PatternKey, called: ReadonlySet<number>): number {
  const r = ruleOf(t, key);
  if (!r) return 99;
  if ("lines" in r) { const l = r.lines.map((ln) => ln.filter((n) => !called.has(n)).length).sort((x, y) => x - y); return l[0]! + l[1]!; }
  if (r.pool.length < r.k) return 99;
  return Math.max(0, r.k - r.pool.filter((n) => called.has(n)).length);
}

/** The numbers to light up for a win: a fixed shape lights all of it; "any N" lights the first N hits up to the winning call; Two Lines lights the two lines that finished first. */
export function winningNumbers(t: Ticket, key: PatternKey, log: readonly number[], idx: number): number[] {
  const r = ruleOf(t, key);
  if (!r) return [];
  const upto = log.slice(0, idx + 1);
  if ("lines" in r) return r.lines.map((ln) => [ln, firstFull(ln, ln.length, upto)] as const).filter((x) => x[1] >= 0).sort((x, y) => x[1] - y[1]).slice(0, 2).flatMap((x) => x[0]);
  if (r.k === r.pool.length) return r.pool;
  const mine = new Set(r.pool);
  return upto.filter((n) => mine.has(n)).slice(0, r.k);
}
