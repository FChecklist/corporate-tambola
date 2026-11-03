// The 1.9.0 prizes matrix: >= 1,000,000 distinct scenarios, streamed, 0 failures. Set PRIZE_MATRIX_N to run fewer (the deliberate-break runner uses 30,000).
// FALSIFIED BY: tools/matrix/breaks/table.ts (MX-series)
import { expect, test } from "bun:test";
import { BUDGETS, SPACE, newCounters, runScenario, scenarioAt } from "./matrix-lib";

const N = Number(process.env.PRIZE_MATRIX_N ?? 1_000_000);
test("the scenario space is big enough and every dimension is covered", () => {
  expect(SPACE).toBeGreaterThanOrEqual(1_000_000); expect(new Set(BUDGETS).size).toBeGreaterThanOrEqual(100); for (const b of [0, 1, 7, 999, 10001, 10_000_000]) expect(BUDGETS).toContain(b);
});
test("distinct: scenario numbers 0..199,999 decode to 200,000 different scenarios (a bijection)", () => {
  const seen = new Set<string>(); for (let i = 0; i < 200_000; i++) seen.add(scenarioAt(i).key); expect(seen.size).toBe(200_000);
});
test(`${N.toLocaleString("en")} scenarios streamed through the invariants (sum = budget, floor shares, leftover rule, dense ordinals, no leaks)`, () => {
  const c = newCounters(); let firstBad = "";
  for (let i = 0; i < N; i++) { const s = scenarioAt(i); const bad = runScenario(s, c); if (bad) { firstBad = `scenario ${i} (${s.key}): ${bad}`; break; } }
  console.log(`MATRIX scenarios run: ${c.scenarios} | checks: ${c.checks} | claims dealt: ${c.claimsDealt} | positions won: ${c.positionsWon} | shared prizes: ${c.shared} (max ${c.maxSharedBy} sharing) | scenarios with no winner: ${c.zeroWinnerScenarios} | per plan: ${c.byPlan.join("/")}`);
  expect(firstBad).toBe(""); expect(c.scenarios).toBe(N);
  if (N >= 1_000_000) { expect(c.byPlan.every((x) => x > N / 10)).toBe(true); expect(c.shared).toBeGreaterThan(100_000); }
}, 900_000);
