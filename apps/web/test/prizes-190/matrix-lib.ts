// The 1.9.0 prizes scenario matrix: a STREAMED generator (scenario number -> scenario, nothing kept) and the invariants every scenario must keep.
// Space: 8 plans x 2 modes x 7 currencies x 120 budgets x 7^4 winners-per-call patterns x 24 claim orders x 2 late-masks... decoded from one number with a multiplicative scramble, so scenario i != scenario j (a bijection).
// The product functions under test are the real ones: ZPRIZE.plan / shareOut / validateManual (prize-planner.js), claimsByHouse / claimCounts / winnersOfHouse (beacon game.ts), validateCfg (config.ts).
// The oracles (frozen tables, exact integer floor, dense ranking, accounting) are written here from the task text and share no code with the product.
import { claimCounts, claimsByHouse, winnersOfHouse, type PublicClaim } from "../../../../packages/beacon/src/game";
import { validateCfg } from "../../../../packages/beacon/src/config";
import { PLANS, SPEC, expectedAmounts, idOf, planner, type Row } from "./spec";

const P = planner();
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD"] as const;
const SPECIAL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 19, 20, 21, 33, 39, 40, 41, 49, 50, 51, 99, 100, 101, 199, 200, 201, 249, 250, 251, 399, 400, 401, 499, 500, 999, 1000, 1001, 1999, 2000, 2001, 4999, 5000, 9999, 10000, 10001, 12345, 99999, 100000, 100001, 999999, 1000000, 1000001, 9999999, 10000000];
/** 120 budgets: the 60 special ones above (0, 1, 7, 999, 10001 ... 10 million) and 60 spread over 1 .. 10 million by a fixed generator. */
export const BUDGETS: number[] = (() => { const out = [...SPECIAL]; let x = 190; while (out.length < 120) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; const mag = 10 ** (1 + (x % 7)); x = (Math.imul(x, 1103515245) + 12345) >>> 0; out.push(Math.min(10_000_000, 1 + (x % mag))); } return out; })();
const RADIX = [8, 2, 7, 120, 2401, 24, 4]; // plan, mode, currency, budget, winners-per-call (7^4), claim order, late-mask style
export const SPACE = RADIX.reduce((a, b) => a * b, 1);
const SCRAMBLE = 7_919_011; // coprime with SPACE (checked below), so i -> (i * SCRAMBLE) mod SPACE is a bijection on [0, SPACE)
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
if (gcd(SCRAMBLE, SPACE) !== 1) throw new Error("scramble must be coprime with the space");
export interface Scenario { id: number; plan: number; mode: 0 | 1; currency: string; budget: number; groups: number[]; order: number; lateStyle: number; house: string; key: string }
const PERMS = (() => { const out: number[][] = []; const f = (a: number[], r: number[]) => { if (!r.length) out.push(a); else r.forEach((x, i) => f([...a, x], r.filter((_, j) => j !== i))); }; f([], [0, 1, 2, 3]); return out; })();

export function scenarioAt(i: number): Scenario {
  let n = Number((BigInt(i) * BigInt(SCRAMBLE)) % BigInt(SPACE)); const d: number[] = [];
  for (const r of RADIX) { d.push(n % r); n = Math.floor(n / r); }
  const [plan, mode, cur, bi, g, order, lateStyle] = d as [number, 0 | 1, number, number, number, number, number];
  const groups = [g % 7, Math.floor(g / 7) % 7, Math.floor(g / 49) % 7, Math.floor(g / 343) % 7];
  const house = PLANS[plan]!.tickets === 1 ? "full" : (plan + bi) % 2 ? "full2" : "full"; // which house's ordinals are dealt: Full House, or Super Bumper in the 2-ticket plans
  return { id: i, plan, mode, currency: CURRENCIES[cur]!, budget: BUDGETS[bi]!, groups, order, lateStyle, house, key: `${plan}.${mode}.${cur}.${bi}.${g}.${order}.${lateStyle}` };
}

export interface Counters { scenarios: number; checks: number; claimsDealt: number; positionsWon: number; shared: number; maxSharedBy: number; byPlan: number[]; zeroWinnerScenarios: number }
export const newCounters = (): Counters => ({ scenarios: 0, checks: 0, claimsDealt: 0, positionsWon: 0, shared: 0, maxSharedBy: 0, byPlan: Array(8).fill(0), zeroWinnerScenarios: 0 });

/** Runs one scenario; returns "" if every invariant holds, else the first violation. */
export function runScenario(s: Scenario, c: Counters): string {
  const p = PLANS[s.plan]!, rows = SPEC[p.key]!;
  c.scenarios++; c.byPlan[s.plan]!++;
  let amounts: Map<string, number>, ids: string[], labels: string[];
  if (s.mode === 0) {
    // ---- R1 + R2: the auto plan ----
    const pl = P.plan(p.tickets, p.count, s.budget);
    const want = expectedAmounts(rows, s.budget);
    if (pl.prizes.length !== rows.length || pl.prizes.length !== p.count) return `prize count ${pl.prizes.length} != ${p.count}`;
    amounts = new Map(); for (const r of pl.prizes) { amounts.set(r.id, r.amount); if (!Number.isInteger(r.amount) || r.amount < 0) return `amount not a whole number: ${r.id}=${r.amount}`; if (want.get(r.id) !== r.amount) return `amount ${r.id}=${r.amount}, floor/leftover rule says ${want.get(r.id)}`; }
    let sum = 0; for (const v of amounts.values()) sum += v; if (sum !== s.budget || pl.total !== s.budget) return `sum ${sum} (total ${pl.total}) != budget ${s.budget}`;
    if (new Set(pl.prizes.map((r: any) => r.id)).size !== pl.prizes.length) return "duplicate prize id";
    ids = pl.prizes.map((r: any) => r.id); labels = pl.prizes.map((r: any) => r.label);
    let hundred = 0; for (const r of pl.prizes) hundred += Math.round(r.pct * 10); if (hundred !== 1000) return "percents do not add to 100";
    c.checks += 6;
  } else {
    // ---- R3: a Manual list: the organizer's own amounts (a deterministic spread of the budget), accepted by validateManual and the engine's own validation ----
    const b = Math.max(s.budget, rows.length); const weights = rows.map((_, k) => 1 + ((s.id + k * 7) % 5)); const wsum = weights.reduce((x, y) => x + y, 0);
    const list = rows.map((r, k) => ({ id: idOf(r), amount: Math.max(1, Math.floor((b * weights[k]!) / wsum)), ...(k % 3 === 0 ? { gift: `GIFT-${s.id}-${k}` } : {}) }));
    if (P.validateManual(list).length) return "validateManual refused a good list: " + P.validateManual(list).join(" | ");
    const bad = list.map((x, k) => (k === (s.id % list.length) ? { ...x, amount: 0 } : x)); if (!P.validateManual(bad).length) return "validateManual accepted a 0 amount";
    const dup = [...list, list[0]!]; if (!P.validateManual(dup).length) return "validateManual accepted a duplicate id";
    amounts = new Map(list.map((x) => [x.id, x.amount])); ids = list.map((x) => x.id); labels = list.map((x) => x.id);
    const budget = list.reduce((x, y) => x + y.amount, 0);
    const v: any = validateCfg({ tickets: p.tickets, rewards: rows.map((r) => lineOf(r, p.tickets)), prizePlan: { mode: "manual", currency: s.currency, budget, count: list.length, prizes: list } });
    if (!v.ok) return "engine validation refused a good manual plan: " + v.error;
    if (v.cfg.prizePlan.prizes.length !== list.length || v.cfg.prizePlan.budget !== budget) return "validated plan lost a prize or the budget";
    c.checks += 5;
  }

  // ---- R5: no amount, budget, currency or gift reaches the player-facing parts of the game (names, reward lines) ----
  const rewardsJson = rewardsJsonFor(s.plan);
  if (/"amount"|"budget"|"gift"|prizePlan|"currency"/.test(rewardsJson) || /GIFT-/.test(rewardsJson)) return "reward lines carry plan data";
  if (/"text":"[^"]/.test(rewardsJson)) return "a reward line has text";
  for (const l of labels) if (/GIFT-|₹|\$|€|£|\bINR\b|\bUSD\b/.test(l)) return "a label carries money: " + l;
  c.checks += 3;

  // ---- R4: claims -> shares -> dense ranking, for the house of this scenario ----
  const prizes = ids.filter((id) => id.split(":")[1] === s.house).sort((a, b) => Number(a.split(":")[2]) - Number(b.split(":")[2]));
  const perm = PERMS[s.order]!;
  const claims: PublicClaim[] = []; const groupsPids: [number, string[]][] = []; const validPids: Map<number, string[]> = new Map();
  const callIdx = [10, 17, 25, 33], rounds = Array.from({ length: 90 }, (_, k) => 1000 + k * 3);
  for (const gi of perm) { // claims arrive group by group in this permuted order
    const n = s.groups[gi]!; const pids: string[] = [];
    for (let k = 0; k < n; k++) {
      const pid = `${gi * 10 + k + 1}x${(gi * 10 + k + 1).toString(16).padStart(12, "0")}`; pids.push(pid);
      const late = s.lateStyle === 1 ? k % 2 === 1 : s.lateStyle === 2 ? gi % 2 === 1 : s.lateStyle === 3 ? (k + gi) % 3 === 0 : false;
      const t = roundMs(rounds[callIdx[gi]! + 1]!);
      claims.push({ pid, pattern: s.house, round: 1, idx: callIdx[gi]!, atMs: late ? t + (k % 3) : t - 1 - (k % 5) });
      if (!late) (validPids.get(gi) ?? validPids.set(gi, []).get(gi)!).push(pid);
      c.claimsDealt++;
    }
    groupsPids.push([callIdx[gi]!, pids]);
  }
  const h = claimsByHouse(claims, 1);
  const kept = groupsPids.slice().sort((a, b) => a[0] - b[0]).map(([i, ps]) => [i, ps.filter((pid) => claimCounts(h, s.house, pid, i, rounds[i + 1]))] as [number, string[]]).filter((g) => g[1].length);
  const out = winnersOfHouse("EID", s.house, kept, "share", () => "");
  // oracle: groups with at least one in-time claim, in call order, take ordinals 1, 2, 3 ... with no gaps
  const expectGroups = [0, 1, 2, 3].filter((gi) => validPids.has(gi));
  if (out.length !== expectGroups.length) return `${out.length} winner positions, expected ${expectGroups.length}`;
  let paid = 0, kept$ = 0, accounted = 0;
  for (let k = 0; k < out.length; k++) {
    const exp = validPids.get(expectGroups[k]!)!;
    if (out[k]!.idx !== callIdx[expectGroups[k]!]) return `ordinal ${k + 1} is at call ${out[k]!.idx}, not ${callIdx[expectGroups[k]!]} (dense ranking)`;
    if ([...out[k]!.pids].sort().join() !== [...exp].sort().join()) return `ordinal ${k + 1} winners differ`;
    c.positionsWon++;
  }
  for (let k = 0; k < prizes.length; k++) {
    const a = amounts.get(prizes[k]!)!; const w = out[k]?.pids.length ?? 0; const sh = P.shareOut(a, w);
    const wantShare = w ? Math.floor(a / w) : 0, wantLeft = w ? a - wantShare * w : a;
    if (sh.share !== wantShare || sh.leftover !== wantLeft) return `shareOut(${a},${w}) = ${sh.share}/${sh.leftover}, expected ${wantShare}/${wantLeft}`;
    if (sh.share * w + sh.leftover !== a) return "share x winners + leftover != amount";
    if (w > 1 && sh.leftover >= w) return "leftover is a whole share or more";
    paid += sh.share * w; kept$ += sh.leftover; accounted += a; if (w > 1) { c.shared++; c.maxSharedBy = Math.max(c.maxSharedBy, w); }
  }
  if (paid + kept$ !== accounted) return `paid ${paid} + kept ${kept$} != the house's prizes ${accounted}`;
  if (out.length > prizes.length) { /* positions beyond the planned prizes carry no prize */ }
  if (!out.length) c.zeroWinnerScenarios++;
  c.checks += 4 + prizes.length;
  void paid; return "";
}
const roundMs = (r: number) => (1692803367 + (r - 1) * 3) * 1000;
function lineOf(r: Row, tickets: number) { const [t, pattern, ordinal] = r; if (pattern === "full2") return { pattern: "full", scope: "two_ticket", ordinal, text: "" }; return { pattern, scope: tickets === 2 && t ? (t === 2 ? "ticket_2" : "ticket_1") : "ticket", ordinal, text: "" }; }
const cache: string[] = [];
function rewardsJsonFor(plan: number): string { if (cache[plan] === undefined) { const p = PLANS[plan]!; const v: any = validateCfg({ tickets: p.tickets, ties: "share", rewards: SPEC[p.key]!.map((r) => lineOf(r, p.tickets)) }); if (!v.ok) throw new Error(v.error); cache[plan] = JSON.stringify(v.cfg.rewards); } return cache[plan]!; }
