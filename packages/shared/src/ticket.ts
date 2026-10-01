/** Ticket generation and patterns (handout section 5, prototype genTicket/patternNums). */

export type Ticket = (number | null)[][]; // 3 rows x 9 columns
export type Rand = (n: number) => number; // returns integer in [0, n)

export const cryptoRand: Rand = (n) => {
  const a = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n; // rejection sampling: no modulo bias
  do {
    crypto.getRandomValues(a);
  } while (a[0]! >= limit);
  return a[0]! % n;
};

export const shuffle = <T>(arr: T[], rand: Rand): T[] => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
};

/** Column c holds 1-9, 10-19, ... 80-90. */
export const columnRange = (c: number): [number, number] => [c === 0 ? 1 : c * 10, c === 8 ? 90 : c * 10 + 9];

export function generateTicket(rand: Rand = cryptoRand): Ticket {
  for (;;) {
    const mask = [0, 1, 2].map(() => {
      const row = Array<boolean>(9).fill(false);
      shuffle([...Array(9).keys()], rand)
        .slice(0, 5)
        .forEach((c) => (row[c] = true));
      return row;
    });
    if (![...Array(9).keys()].every((c) => mask.some((r) => r[c]))) continue;
    const t: Ticket = [[], [], []];
    for (let c = 0; c < 9; c++) {
      const [lo, hi] = columnRange(c);
      const pool: number[] = [];
      for (let v = lo; v <= hi; v++) pool.push(v);
      const k = [0, 1, 2].filter((r) => mask[r]![c]).length;
      const picked = shuffle(pool, rand).slice(0, k).sort((a, b) => a - b);
      let i = 0;
      for (let r = 0; r < 3; r++) t[r]![c] = mask[r]![c] ? picked[i++]! : null;
    }
    return t;
  }
}

export const ticketNumbers = (t: Ticket): number[] => t.flat().filter((v): v is number => v !== null);

/** Structural validity check (used by tests and the server). */
export function isValidTicket(t: Ticket): boolean {
  if (t.length !== 3 || t.some((r) => r.length !== 9)) return false;
  for (const r of t) if (r.filter((v) => v !== null).length !== 5) return false;
  const seen = new Set<number>();
  for (let c = 0; c < 9; c++) {
    const [lo, hi] = columnRange(c);
    const col = [0, 1, 2].map((r) => t[r]![c]).filter((v): v is number => v !== null);
    if (col.length < 1) return false;
    for (let i = 0; i < col.length; i++) {
      const v = col[i]!;
      if (v < lo || v > hi || seen.has(v)) return false;
      if (i > 0 && v <= col[i - 1]!) return false;
      seen.add(v);
    }
  }
  return seen.size === 15;
}

export const ticketKey = (t: Ticket) => JSON.stringify(t);

// ---------- patterns ----------
export type PatternId = "early5" | "top" | "mid" | "bot" | "corners" | "star" | "full";
export type Scope = "ticket" | "two_ticket";

export const PATTERNS: Record<PatternId, { name: string; desc: string }> = {
  early5: { name: "Early Five", desc: "Any 5 numbers on your ticket" },
  top: { name: "Top Line", desc: "All 5 numbers of the first row" },
  mid: { name: "Middle Line", desc: "All 5 numbers of the second row" },
  bot: { name: "Bottom Line", desc: "All 5 numbers of the third row" },
  corners: { name: "Four Corners", desc: "First and last numbers of the top and bottom rows" },
  star: { name: "Star", desc: "Four corners and the centre of the middle row" },
  full: { name: "Full House", desc: "All 15 numbers on your ticket" },
};

const row = (t: Ticket, r: number) => t[r]!.filter((v): v is number => v !== null);

/** Numbers that must be called AND cut for a pattern. Early Five has no fixed set (returns null). */
export function patternNumbers(t: Ticket, p: PatternId): number[] | null {
  switch (p) {
    case "top": return row(t, 0);
    case "mid": return row(t, 1);
    case "bot": return row(t, 2);
    case "corners": { const a = row(t, 0), c = row(t, 2); return [a[0]!, a[4]!, c[0]!, c[4]!]; }
    case "star": { const a = row(t, 0), b = row(t, 1), c = row(t, 2); return [a[0]!, a[4]!, c[0]!, c[4]!, b[2]!]; }
    case "full": return ticketNumbers(t);
    case "early5": return null;
  }
}

export const ordinalName = (k: number): string =>
  ["", "1st", "2nd", "3rd"][k] ?? `${k}th`;

/** Human name of a reward line, e.g. "2nd Full House", "1st Full Two-Ticket House". */
export function rewardName(pattern: PatternId, scope: Scope, ordinal: number, ofTotal: number): string {
  const base = scope === "two_ticket" ? "Full Two-Ticket House" : PATTERNS[pattern].name;
  return ofTotal > 1 ? `${ordinalName(ordinal)} ${base}` : base;
}
