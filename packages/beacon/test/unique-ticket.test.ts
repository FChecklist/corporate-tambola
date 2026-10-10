import { describe, expect, test } from "bun:test";
import { isValidTicket, ticketKey } from "../../shared/src/ticket";
import { SETS_PER_SHAPE, permute, positionOf, seatOfPid, setsOfShape, shapeAt, shapeCount, spaceSize, ticketAt } from "../src/unique-ticket";
import { ticketFor, ticketsFor } from "../src/game";
import { sha256 } from "@noble/hashes/sha256";

describe("collision-free tickets", () => {
  test("the shuffle is a true permutation: a small list comes out as exactly the same set, no repeats", () => {
    const key = sha256(new TextEncoder().encode("k"));
    for (const n of [1000, 4097, 65536]) { const seen = new Set<number>(); for (let i = 0; i < n; i++) seen.add(permute(i, n, key)); expect(seen.size).toBe(n); expect(Math.max(...seen)).toBeLessThan(n); }
  });
  test("every row shape has more number sets than we use, so positions can never collide inside a shape", () => {
    let min = Infinity;
    for (let i = 0; i < shapeCount(); i++) min = Math.min(min, setsOfShape(shapeAt(i)));
    expect(min).toBeGreaterThan(SETS_PER_SHAPE * 100); // generous margin
    expect(spaceSize()).toBeGreaterThan(1e14);
  });
  test("every ticket is a valid housie ticket", () => {
    for (let i = 0; i < 3000; i++) expect(isValidTicket(ticketAt("ENG-1", i * 7919))).toBe(true);
  });
  test("200,000 consecutive seats (tickets) of one round: all different", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200_000; i++) seen.add(ticketKey(ticketAt("BIG-1", i)));
    expect(seen.size).toBe(200_000);
  }, 120_000);
  test("the same seat gives the same ticket every time, a different round or engagement gives a different one", () => {
    expect(ticketKey(ticketAt("E1", 5))).toBe(ticketKey(ticketAt("E1", 5)));
    expect(ticketKey(ticketAt("E1", 5))).not.toBe(ticketKey(ticketAt("E2", 5)));
    expect(ticketKey(ticketAt("E1", 5))).not.toBe(ticketKey(ticketAt("E1#2", 5)));
  });
  test("seat ids: ticketFor/ticketsFor use the list; two tickets of one seat differ; old ids still use the old generator", () => {
    expect(seatOfPid("17x0123456789abcdef")).toBe(17); expect(seatOfPid("0123456789abcdef")).toBeNull(); expect(seatOfPid("0x0123456789abcdef")).toBeNull();
    const a = ticketFor("E", "17x0123456789abcdef"); expect(ticketKey(a)).toBe(ticketKey(ticketAt("E", positionOf(17, 0))));
    const two = ticketsFor("E", "17x0123456789abcdef", 2); expect(two.length).toBe(2); expect(ticketKey(two[0]!)).toBe(ticketKey(a)); expect(ticketKey(two[1]!)).toBe(ticketKey(ticketAt("E", positionOf(17, 1))));
    expect(ticketKey(two[0]!)).not.toBe(ticketKey(two[1]!));
    const old = ticketFor("E", "0123456789abcdef"); expect(isValidTicket(old)).toBe(true); expect(ticketKey(old)).toBe(ticketKey(ticketFor("E", "0123456789abcdef")));
  });
  test("a whole game of 10,000 players with two tickets each: 20,000 tickets, none repeated", () => {
    const seen = new Set<string>();
    for (let s = 1; s <= 10_000; s++) for (const t of ticketsFor("GAME", `${s}x00000000deadbeef`, 2)) seen.add(ticketKey(t));
    expect(seen.size).toBe(20_000);
  }, 120_000);
});

describe("numbers are spread evenly over the tickets (20-game rehearsal G04)", () => {
  // Before the fix the number-set code only reached the first columns' digits: 70 and 80 were on EVERY ticket, 75-79 and 83-90 on none, and 64-69 on almost none.
  // Whenever 70 or 80 was called late, every ticket that was otherwise complete won the Full House at the same call (a 963-way tie in a 1000-person game).
  for (const eid of ["G04-r1", "SOME-OTHER", "PXA-2"]) {
    test(`${eid}: 6,000 tickets: every number from 1 to 90 is on about 1 ticket in 6 (within 20% of the expected count)`, () => {
      const N = 6000, cnt = new Array(91).fill(0);
      for (let i = 0; i < N; i++) { const t = ticketAt(eid, i); for (const row of t) for (const n of row) if (n !== null) cnt[n]++; }
      const expected = (N * 15) / 90; // 1000
      const off = cnt.map((c, n) => [n, c] as const).filter(([n, c]) => n >= 1 && Math.abs(c - expected) > expected * 0.2);
      expect(off).toEqual([]);
    });
  }
  test("each column of the ticket uses its whole range: the 70s column shows all of 70 to 79, the 80s column all of 80 to 90", () => {
    const seen = new Set<number>(); for (let i = 0; i < 3000; i++) for (const row of ticketAt("RANGE", i)) for (const n of row) if (n !== null) seen.add(n);
    for (let n = 1; n <= 90; n++) expect(seen.has(n)).toBe(true);
  });
  test("with 1,000 tickets the first Full House does not wait for one particular number: over 100 call orders it is never later than call 80", () => {
    const sets: Set<number>[] = Array.from({ length: 1000 }, (_, i) => new Set(ticketAt("G04-r1", i).flat().filter((n): n is number => n !== null)));
    let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
    let worst = 0;
    for (let k = 0; k < 100; k++) { const order = Array.from({ length: 90 }, (_, i) => i + 1).sort(() => rnd() - 0.5); const pos = new Array(91); order.forEach((n, i) => (pos[n] = i)); let best = 999; for (const s of sets) { let m = 0; for (const n of s) if (pos[n] > m) m = pos[n]; if (m < best) best = m; } worst = Math.max(worst, best); }
    expect(worst).toBeLessThanOrEqual(80);
  });
});
