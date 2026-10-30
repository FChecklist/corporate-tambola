// R1, R2, shareOut, validateManual (R3 part), hint: the pure prize planner (apps/web/public/prize-planner.js), tested against the frozen tables in spec.ts.
// FALSIFIED BY (tools/matrix/breaks/table.ts): P01..P12
import { describe, expect, test } from "bun:test";
import { PLANS, SPEC, expectedAmounts, idOf, planner, rng } from "./spec";

const P = planner();
const key = (r: any) => `${r.ticket}:${r.pattern}:${r.ordinal}`;

describe("R1: counts", () => {
  test("1 ticket offers 4/6/8/10 prizes, 2 tickets offer 12/14/16/20; defaults 6 and 14", () => {
    expect(P.COUNTS[1]).toEqual([4, 6, 8, 10]); expect(P.COUNTS[2]).toEqual([12, 14, 16, 20]);
    expect(P.DEFAULT_COUNT).toEqual({ 1: 6, 2: 14 });
  });
  test("the plan has exactly as many prizes as its count, for all 8 plans", () => {
    for (const p of PLANS) expect([p.key, P.plan(p.tickets, p.count, 100000).prizes.length]).toEqual([p.key, p.count]);
  });
  test("an unapproved count falls back to the default; a 2-ticket count on 1 ticket falls back too", () => {
    expect(P.plan(1, 12, 1000).count).toBe(6); expect(P.plan(2, 6, 1000).count).toBe(14); expect(P.plan(1, 5, 1000).count).toBe(6); expect(P.plan(2, 0, 1000).count).toBe(14);
    expect(P.split(1, 12)).toEqual([]); expect(P.split(2, 4)).toEqual([]);
  });
});

describe("R1: the eight percent tables", () => {
  for (const p of PLANS) {
    test(`${p.tickets} ticket(s), ${p.count} prizes: every prize and percent is as frozen, each id once, and the percents add to exactly 100`, () => {
      const rows: any[] = P.split(p.tickets, p.count), want = SPEC[p.key]!;
      expect(rows.length).toBe(want.length);
      expect(new Set(rows.map(key)).size).toBe(rows.length);
      const got = new Map(rows.map((r) => [key(r), r.pct])), exp = new Map(want.map((r) => [idOf(r), r[3]]));
      expect([...got.entries()].sort()).toEqual([...exp.entries()].sort());
      // sum in tenths of a percent (all tables use at most one decimal): exact, no float drift
      expect(rows.reduce((s, r) => s + Math.round(r.pct * 10), 0)).toBe(1000);
      expect(Math.min(...rows.map((r) => r.pct))).toBeGreaterThanOrEqual(2.5);
    });
  }
  test("the smallest percent over all 8 plans is exactly 2.5 (2t20 FH3)", () => {
    expect(Math.min(...PLANS.flatMap((p) => P.split(p.tickets, p.count).map((r: any) => r.pct)))).toBe(2.5);
  });
  test("no Unlucky anywhere; 1-ticket plans have ticket 0 only; Super Bumper only in 2-ticket plans", () => {
    for (const p of PLANS) {
      const rows: any[] = P.split(p.tickets, p.count);
      expect(rows.some((r) => /unlucky/i.test(r.pattern) || /unlucky/i.test(r.label))).toBe(false);
      if (p.tickets === 1) { expect(rows.every((r) => r.ticket === 0)).toBe(true); expect(rows.some((r) => r.pattern === "full2")).toBe(false); }
      else expect(rows.some((r) => r.pattern === "full2")).toBe(true);
    }
  });
  test("2 tickets: Early 5 belongs to Ticket 1 only (never to Ticket 2, never to both)", () => {
    for (const c of [16, 20]) {
      const e5: any[] = P.split(2, c).filter((r: any) => r.pattern === "early5");
      expect(e5.length).toBe(c === 16 ? 1 : 2); expect(e5.every((r) => r.ticket === 1)).toBe(true);
      expect(e5.map((r) => r.label)).toEqual(c === 16 ? ["Ticket 1: Early 5"] : ["Ticket 1: 1st Early 5", "Ticket 1: 2nd Early 5"]);
    }
    for (const c of [12, 14]) expect(P.split(2, c).some((r: any) => r.pattern === "early5")).toBe(false);
  });
  test("2 tickets: each ticket has the same lines, corners and Full House prizes (same percents), Super Bumper belongs to ticket 0", () => {
    for (const c of [12, 14, 16, 20]) {
      const rows: any[] = P.split(2, c), mine = (t: number) => rows.filter((r) => r.ticket === t && r.pattern !== "early5").map((r) => `${r.pattern}:${r.ordinal}:${r.pct}`);
      expect(mine(1)).toEqual(mine(2)); expect(mine(1).length).toBeGreaterThan(4);
      expect(rows.filter((r) => r.pattern === "full2").every((r) => r.ticket === 0)).toBe(true);
    }
  });
  test("labels: plain names for a single prize, ordinals when there are several, 'Ticket N:' prefix on 2-ticket prizes", () => {
    const l = (t: number, c: number) => P.split(t, c).map((r: any) => r.label);
    expect(l(1, 4)).toEqual(["Line 1", "Line 2", "Line 3", "Full House"]);
    expect(l(1, 6)).toEqual(["Line 1", "Line 2", "Line 3", "Corners", "1st Full House", "2nd Full House"]);
    expect(l(1, 10)).toContain("1st Early 5"); expect(l(1, 10)).toContain("2nd Early 5"); expect(l(1, 10)).toContain("4th Full House"); expect(l(1, 8)).toContain("Early 5");
    expect(l(2, 12)).toContain("Ticket 1: Line 1"); expect(l(2, 12)).toContain("Ticket 2: Corners"); expect(l(2, 12)).toContain("Ticket 2: Full House");
    expect(l(2, 12)).toContain("1st Super Bumper"); expect(l(2, 12)).toContain("2nd Super Bumper"); expect(l(2, 20)).toContain("4th Super Bumper"); expect(l(2, 20)).toContain("Ticket 2: 3rd Full House");
  });
  test("the ids follow '<ticket>:<pattern>:<ordinal>'", () => {
    for (const p of PLANS) for (const r of P.split(p.tickets, p.count)) expect(r.id).toMatch(/^[0-2]:(top|mid|bot|corners|early5|full|full2):[1-4]$/);
  });
});

describe("R2: amounts", () => {
  const exact = (tickets: number, count: number, budget: number) => {
    const pl = P.plan(tickets, count, budget), want = expectedAmounts(SPEC[`${tickets}:${count}`]!, budget);
    expect(pl.prizes.length).toBe(want.size);
    for (const r of pl.prizes) { expect(Number.isInteger(r.amount)).toBe(true); expect([budget, tickets, count, r.id, r.amount]).toEqual([budget, tickets, count, r.id, want.get(r.id)!]); }
    expect(pl.prizes.reduce((s: number, r: any) => s + r.amount, 0)).toBe(budget); expect(pl.total).toBe(budget); expect(pl.budget).toBe(budget);
  };
  test("budgets 1, 7, 99, 100, 101, 999, 1000, 10001, 12345, 1e6, 1e7 for all 8 plans: each prize is the floor, the sum is the budget", () => {
    for (const p of PLANS) for (const b of [1, 7, 99, 100, 101, 999, 1000, 10001, 12345, 1_000_000, 10_000_000]) exact(p.tickets, p.count, b);
  });
  test("20,000 random budgets from 0 to 10 million over all 8 plans: floor per prize, leftover to the biggest, sum equals the budget", () => {
    const r = rng(190); let n = 0;
    for (let i = 0; i < 2500; i++) { const b = Math.floor(r() * 10_000_001); for (const p of PLANS) { exact(p.tickets, p.count, b); n++; } }
    expect(n).toBe(20000);
  });
  test("the leftover goes to the biggest prize: the Full House (1 ticket) or the 1st Super Bumper (2 tickets), and only there", () => {
    for (const p of PLANS) {
      const b = 100003, pl = P.plan(p.tickets, p.count, b), rows: any[] = P.split(p.tickets, p.count);
      const top = rows.reduce((m: any, r: any) => (r.pct > m.pct ? r : m), rows[0]);
      expect(top.pattern).toBe(p.tickets === 1 ? "full" : "full2"); expect(top.ordinal).toBe(1);
      for (const r of pl.prizes) { const pure = Math.floor((b * Math.round(r.pct * 10)) / 1000); expect(r.id === top.id ? r.amount >= pure : r.amount === pure).toBe(true); }
    }
  });
  test("tie for the biggest prize: the first one in display order gets the leftover", () => {
    // 1 ticket, 4 prizes: Lines 20/20/20 and Full House 40: no tie. Build a tie by hand through the same function with a custom split is not possible (not exported), so this uses the only real tie: none of the 8 plans has one.
    for (const p of PLANS) { const rows: any[] = P.split(p.tickets, p.count), mx = Math.max(...rows.map((r) => r.pct)); expect(rows.filter((r) => r.pct === mx).length).toBe(1); }
  });
  test("budget 1: the whole unit goes to the biggest prize, the rest are 0; budget 0 / blank / negative / NaN: all 0", () => {
    for (const p of PLANS) {
      const pl = P.plan(p.tickets, p.count, 1); expect(pl.prizes.filter((r: any) => r.amount > 0).length).toBe(1);
      for (const b of [0, -5, NaN, "", null, undefined, "abc"]) { const z = P.plan(p.tickets, p.count, b); expect(z.total).toBe(0); expect(z.budget).toBe(0); expect(z.prizes.every((r: any) => r.amount === 0)).toBe(true); }
    }
  });
  test("a fractional budget is floored to whole units (12.9 -> 12); the sum equals the floored budget", () => {
    for (const p of PLANS) { const pl = P.plan(p.tickets, p.count, 12345.99); expect(pl.budget).toBe(12345); expect(pl.total).toBe(12345); }
  });
  test("amounts never go negative and never exceed the budget", () => {
    const r = rng(7); for (let i = 0; i < 500; i++) { const b = Math.floor(r() * 5000); for (const p of PLANS) for (const x of P.plan(p.tickets, p.count, b).prizes) { expect(x.amount).toBeGreaterThanOrEqual(0); expect(x.amount).toBeLessThanOrEqual(b); } }
  });
});

describe("R4 part: shareOut", () => {
  test("equal share floored, the leftover stays with the organizer", () => {
    expect(P.shareOut(1000, 3)).toEqual({ share: 333, leftover: 1, winners: 3 });
    expect(P.shareOut(1000, 1)).toEqual({ share: 1000, leftover: 0, winners: 1 });
    expect(P.shareOut(1000, 7)).toEqual({ share: 142, leftover: 6, winners: 7 });
    expect(P.shareOut(5, 6)).toEqual({ share: 0, leftover: 5, winners: 6 });
    expect(P.shareOut(0, 2)).toEqual({ share: 0, leftover: 0, winners: 2 });
  });
  test("no winner: share 0 and the whole amount is the leftover", () => {
    expect(P.shareOut(777, 0)).toEqual({ share: 0, leftover: 777, winners: 0 });
    expect(P.shareOut(777, -1)).toEqual({ share: 0, leftover: 777, winners: 0 });
  });
  test("invariant for 100,000 draws: share x winners + leftover = amount, leftover < winners", () => {
    const r = rng(44);
    for (let i = 0; i < 100000; i++) { const a = Math.floor(r() * 5_000_000), n = Math.floor(r() * 7), s = P.shareOut(a, n); expect(s.share * n + s.leftover).toBe(a); if (n > 0) { expect(s.leftover).toBeLessThan(n); expect(s.share).toBe(Math.floor(a / n)); } }
  });
});

describe("R3 part: validateManual", () => {
  const ok = (id: string, amount: unknown = 100, extra: object = {}) => ({ id, amount, ...extra });
  const raw = (id: string, amount: unknown) => ({ id, amount });
  const many = (n: number) => Array.from({ length: n }, (_, i) => ok(`1:full:${i + 1}`));
  test("a valid list gives no problems; a gift name is optional", () => {
    expect(P.validateManual([ok("0:top:1")])).toEqual([]); expect(P.validateManual([ok("0:top:1", 50, { gift: "Mug" }), ok("0:full:1", 500, { gift: "" })])).toEqual([]);
  });
  test("at least one prize", () => { expect(P.validateManual([]).length).toBe(1); expect(P.validateManual(null)[0]).toMatch(/at least one prize/i); expect(P.validateManual(undefined).length).toBe(1); });
  test("an amount is needed for every prize: whole number above 0", () => {
    for (const a of [0, -1, "", null, undefined, "abc", 1.5, NaN]) expect([a, P.validateManual([raw("0:top:1", a)]).length]).toEqual([a, 1]);
    for (const a of [1, 2, "300", 99999]) expect([a, P.validateManual([ok("0:top:1", a)])]).toEqual([a, []]);
  });
  test("no duplicate prize id", () => { const b = P.validateManual([ok("0:top:1"), ok("0:full:1"), ok("0:top:1")]); expect(b.length).toBe(1); expect(b[0]).toMatch(/Prize 3/); });
  test.failing("PRODUCT BUG P-2 (low): an amount of Infinity passes validateManual (the console cannot type it; the server refuses it)", () => { expect(P.validateManual([raw("0:top:1", Infinity)]).length).toBe(1); });
  test("a prize with no id is refused", () => { expect(P.validateManual([{ amount: 5 }]).length).toBe(1); expect(P.validateManual([{ id: "", amount: 5 }]).length).toBe(1); expect(P.validateManual([null]).length).toBe(1); });
  test("at most 30 prizes: 30 ok, 31 refused", () => { expect(P.MAX_MANUAL).toBe(30); expect(P.validateManual(many(30))).toEqual([]); const b = P.validateManual(many(31)); expect(b.length).toBeGreaterThanOrEqual(1); expect(b.join(" ")).toMatch(/up to 30 prizes/); });
  test("gift name up to 60 characters: 60 ok, 61 refused", () => { expect(P.validateManual([ok("0:top:1", 5, { gift: "x".repeat(60) })])).toEqual([]); expect(P.validateManual([ok("0:top:1", 5, { gift: "x".repeat(61) })]).length).toBe(1); });
  test.failing("PRODUCT BUG P-1 (low): an id that is also an Object.prototype name ('constructor') is reported as listed twice on its first use", () => {
    // PRODUCT-BUG probe (P-1): the duplicate check uses a plain object, so the first prize called 'constructor' would be reported as listed twice.
    expect(P.validateManual([ok("constructor")]).filter((x: string) => /listed twice/.test(x))).toEqual([]);
  });
});

describe("hint", () => {
  test("a hint (never a block) when the average prize is under 100 units; none from 100 up", () => {
    expect(P.hint(P.plan(1, 6, 100))).toMatch(/Your prizes are small/); expect(P.hint(P.plan(1, 6, 6000))).toBe("");
    expect(P.hint(P.plan(1, 6, 599))).not.toBe(""); expect(P.hint(P.plan(1, 6, 600))).toBe("");
    expect(P.hint(P.plan(2, 20, 1999))).not.toBe(""); expect(P.hint(P.plan(2, 20, 2000))).toBe("");
  });
  test("no hint without a budget, and none for an empty plan", () => { expect(P.hint(P.plan(1, 6, 0))).toBe(""); expect(P.hint(null)).toBe(""); expect(P.hint({})).toBe(""); });
});
