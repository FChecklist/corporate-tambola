// Collision-free tickets. Every ticket of an engagement round comes from a different position in one huge, shuffled list of valid tickets,
// so two tickets of the same game can never be the same. No server, no lookup: the position is the seat number the player received on joining,
// and the shuffle is keyed by the engagement, so every phone (and the organizer console) makes the same ticket for the same seat.
//
// The list: every valid 3x9 ticket (5 numbers per row, every column used, each column's numbers from its own range, sorted down the column).
//   position p  ->  row shape  = shapes[p mod V]          (V is about 880,000 valid row shapes)
//                   number set = digits of floor(p / V)    (a mixed-radix code over each column's combinations)
// Every row shape has far more than 2^29 number sets, so floor(p / V) < 2^29 always fits: different p give different tickets.
import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes } from "@noble/hashes/utils";
import { columnRange, type Ticket } from "../../shared/src/ticket";

/** 2^61 - 1, a prime (see ticketAt). */
const MIX_PRIME = 2305843009213693951n;
/** Number sets used per row shape. The smallest real count over all shapes is about 1.4e12, so this is safely inside every shape. */
export const SETS_PER_SHAPE = 2 ** 29;

const ROW5: number[] = [];
for (let m = 0; m < 512; m++) { let c = 0; for (let b = 0; b < 9; b++) c += (m >> b) & 1; if (c === 5) ROW5.push(m); }

let SHAPES: Uint32Array | null = null;
/** All valid row shapes (three 5-of-9 rows that together use all nine columns), each packed as three 7-bit indexes. */
function shapes(): Uint32Array {
  if (SHAPES) return SHAPES;
  const out: number[] = [];
  for (let a = 0; a < ROW5.length; a++) for (let b = 0; b < ROW5.length; b++) { const ab = ROW5[a]! | ROW5[b]!; for (let c = 0; c < ROW5.length; c++) if ((ab | ROW5[c]!) === 511) out.push((a << 14) | (b << 7) | c); }
  return (SHAPES = Uint32Array.from(out));
}
export const shapeCount = () => shapes().length;
/** Size of the whole list of tickets. */
export const spaceSize = () => shapeCount() * SETS_PER_SHAPE;

const BINOM: number[][] = [];
for (let n = 0; n <= 12; n++) { BINOM[n] = []; for (let k = 0; k <= 3; k++) BINOM[n]![k] = k === 0 ? 1 : n === 0 ? 0 : BINOM[n - 1]![k - 1]! + (k <= n - 1 ? BINOM[n - 1]![k]! : 0); }
const SIZE = Array.from({ length: 9 }, (_, c) => { const [lo, hi] = columnRange(c); return hi - lo + 1; });

/** The `rank`-th k-element subset of {0..n-1} in lexicographic order. */
function unrankCombination(rank: number, n: number, k: number): number[] {
  const out: number[] = []; let x = 0;
  for (let i = 0; i < k; i++) {
    for (let e = x; ; e++) {
      const cnt = BINOM[n - e - 1]![k - i - 1]!;
      if (rank < cnt) { out.push(e); x = e + 1; break; }
      rank -= cnt;
    }
  }
  return out;
}

/** Number of number sets a row shape allows (used by tests to prove SETS_PER_SHAPE fits inside every shape). */
export function setsOfShape(packed: number): number {
  const rows = [ROW5[(packed >> 14) & 127]!, ROW5[(packed >> 7) & 127]!, ROW5[packed & 127]!];
  let prod = 1;
  for (let c = 0; c < 9; c++) { let k = 0; for (const r of rows) k += (r >> c) & 1; prod *= BINOM[SIZE[c]!]![k]!; }
  return prod;
}
export const shapeAt = (i: number) => shapes()[i]!;

// ---- a keyed shuffle of positions (Feistel network + cycle walking: a true permutation of [0, n), no repeats) ----
const keyCache = new Map<string, Uint8Array>();
const keyOf = (eid: string) => { let k = keyCache.get(eid); if (!k) { if (keyCache.size > 64) keyCache.clear(); k = sha256(utf8ToBytes("ticket-space|" + eid)); keyCache.set(eid, k); } return k; };
function feistel(x: number, half: number, key: Uint8Array): number {
  const M = 2 ** half, mask = M - 1;
  let left = Math.floor(x / M), right = x % M;
  const buf = new Uint8Array(key.length + 5); buf.set(key);
  for (let r = 0; r < 6; r++) {
    buf[key.length] = r; buf[key.length + 1] = (right >>> 24) & 255; buf[key.length + 2] = (right >>> 16) & 255; buf[key.length + 3] = (right >>> 8) & 255; buf[key.length + 4] = right & 255;
    const h = sha256(buf), f = (((h[0]! << 24) | (h[1]! << 16) | (h[2]! << 8) | h[3]!) >>> 0) & mask;
    const next = (left ^ f) >>> 0;
    left = right; right = next;
  }
  return left * M + right;
}
/** A keyed permutation of 0..n-1: every input gives a different output, and the same key always gives the same shuffle. */
export function permute(i: number, n: number, key: Uint8Array): number {
  if (!Number.isInteger(i) || i < 0 || i >= n) throw new Error("position outside the list");
  let bits = 2; while (2 ** bits < n) bits++; if (bits & 1) bits++;
  const half = bits / 2;
  let x = i;
  do x = feistel(x, half, key); while (x >= n);
  return x;
}

/** The ticket at `position` of the (shuffled) list of this engagement round. Positions 0..n-1 always give n different valid tickets. */
export function ticketAt(engagementId: string, position: number): Ticket {
  const sh = shapes(), V = sh.length;
  const p = permute(position, V * SETS_PER_SHAPE, keyOf(engagementId));
  const shape = sh[p % V]!;
  const rows = [ROW5[(shape >> 14) & 127]!, ROW5[(shape >> 7) & 127]!, ROW5[shape & 127]!];
  // The number-set code is below 2^29, but a shape has 1.3e12 to 9e12 number sets. Read as plain mixed-radix digits that code only reaches the FIRST columns' digits: the high columns (the 60s, 70s, 80s)
  // almost always got their lowest numbers, so 70 and 80 were on EVERY ticket and 75-79 and 83-90 on none; when 70 or 80 was called late, hundreds of tickets completed the Full House at the same call
  // (found by the 20-game rehearsal, G04). Multiplying by a large prime modulo the shape's number-set count spreads the code over the whole space. The count has only prime factors up to 11, so the
  // prime is coprime to it and the map is one-to-one: different positions still give different tickets.
  let rest = Number((BigInt((p - (p % V)) / V) * MIX_PRIME) % BigInt(setsOfShape(shape)));
  const t: Ticket = [[], [], []];
  for (let c = 0; c < 9; c++) {
    const present = [0, 1, 2].filter((r) => (rows[r]! >> c) & 1);
    const k = present.length, total = BINOM[SIZE[c]!]![k]!;
    const rc = rest % total; rest = (rest - rc) / total;
    const [lo] = columnRange(c);
    const picks = unrankCombination(rc, SIZE[c]!, k);
    for (let r = 0; r < 3; r++) t[r]![c] = null;
    present.forEach((r, i) => (t[r]![c] = lo + picks[i]!));
  }
  return t;
}

/** A participant id made by the store carries its seat number: "<seat>x<hash>". Older ids (plain hash) have none. */
export const seatOfPid = (pid: string): number | null => { const m = /^(\d{1,7})x[0-9a-f]{8,}$/.exec(pid); const s = m ? Number(m[1]) : 0; return s >= 1 ? s : null; };
/** Seat s (1, 2, 3, ...) owns positions 2(s-1) (first ticket) and 2(s-1)+1 (second ticket). */
export const positionOf = (seat: number, which: 0 | 1) => 2 * (seat - 1) + which;
