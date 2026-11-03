// Leak matrix on the real Worker: 8 plans x 2 modes x 7 currencies x 40 budgets = 4,480 plans saved through the real settings route; after every save the public /info, a join answer and the
// player-facing reward lines must contain no amount, no budget, no currency and no gift name, while the organizer's summary has the exact plan back.
// FALSIFIED BY: tools/matrix/breaks/table.ts (GT-series)
import { expect, setDefaultTimeout, test } from "bun:test";
import { FROM, P, Site, j } from "./harness";
import { PLANS, SPEC, expectedAmounts, idOf } from "../../../web/test/prizes-190/spec";
import { BUDGETS, CURRENCIES } from "../../../web/test/prizes-190/matrix-lib";
setDefaultTimeout(300_000);
const N_BUD = Number(process.env.PRIZE_WIRE_BUDGETS ?? 40);

test("every saved plan is invisible to players and exact for the organizer", async () => {
  const s = new Site(), at = FROM + 3_600_000; await s.make("LEAK-1", at);
  const jn = await s.call(at + 500, "POST", "/api/z/LEAK-1/join", { phone: "9810000021", name: "Asha" }); const joinTxt = await jn.text();
  let n = 0, shared = 0, zero = 0;
  for (const [pi, p] of PLANS.entries()) for (const mode of ["auto", "manual"] as const) for (const [ci, cur] of CURRENCIES.entries()) for (let b = 0; b < N_BUD; b++) {
    const budget = BUDGETS[(b * 3 + pi + ci) % BUDGETS.length]!; const rows = SPEC[p.key]!;
    const amounts = mode === "auto" ? expectedAmounts(rows, budget) : new Map(rows.map((r, k) => [idOf(r), 1 + ((budget + k * 13) % 9973)]));
    const prizes = rows.map((r, k) => ({ id: idOf(r), amount: amounts.get(idOf(r))!, ...(k % 2 ? { gift: `ZGIFT${n}K${k}` } : {}) }));
    const total = prizes.reduce((x, y) => x + y.amount, 0);
    const lines = rows.map(([t, pattern, ordinal]) => (pattern === "full2" ? { pattern: "full", scope: "two_ticket", ordinal, text: "" } : { pattern, scope: p.tickets === 2 && t ? `ticket_${t}` : "ticket", ordinal, text: "" }));
    const plan = { mode, currency: cur, budget: mode === "auto" ? Math.max(budget, total) === total ? total : budget : total, count: prizes.length, prizes };
    if (mode === "auto" && plan.budget !== total) plan.budget = total; // an auto plan adds up to its budget; a budget of 0 has no plan to save
    if (plan.budget < 1) continue;
    const r = await s.patch(at + 1000 + n, "LEAK-1", { tickets: p.tickets, rewards: lines, prizePlan: plan });
    if (prizes.some((x) => x.amount < 1)) { zero++; if (r.status !== 400) throw new Error("a plan with a 0 amount was accepted"); if (plan.budget >= 40) throw new Error(`budget ${plan.budget} has a 0 prize`); continue; } // see PRODUCT BUG P-8 in wire.test.ts
    if (r.status !== 200) throw new Error(`save ${pi}/${mode}/${cur}/${budget}: ${r.status} ${JSON.stringify(await r.json())}`);
    const info = await (await s.info(at + 2000 + n, "LEAK-1")).text();
    const hide = [`"amount"`, `"budget"`, `"gift"`, "prizePlan", `"currency"`, "ZGIFT", `"${cur}"`];
    for (const w of hide) if (info.includes(w)) throw new Error(`public info leaks ${w} (${pi}/${mode}/${cur}/${budget})`);
    if (/"text":"[^"]/.test(JSON.stringify(JSON.parse(info).rewards))) throw new Error("a reward line has text");
    // no number anywhere in the public answer equals the budget or a prize amount (whatever the key is called)
    const nums = new Set<number>(); const walk = (v: unknown) => { if (typeof v === "number") nums.add(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); }; walk(JSON.parse(info));
    for (const secret of [plan.budget, ...prizes.map((x) => x.amount)]) if (secret >= 1000 && nums.has(secret)) throw new Error(`public info carries the number ${secret} (${pi}/${mode}/${cur}/${budget})`);
    if (n % 40 === 0) { // the organizer's view holds the exact plan; a join answer and anonymous summary hold nothing
      const sm = await s.summary(at + 3000 + n, "LEAK-1"); expect(sm.prizePlan.budget).toBe(plan.budget); expect(sm.prizePlan.prizes.map((x: any) => x.amount)).toEqual(prizes.map((x) => x.amount)); expect(sm.prizePlan.currency).toBe(cur);
      const anon = await s.call(at + 3500 + n, "GET", "/api/z/LEAK-1/summary"); const t = await anon.text(); expect(t).not.toMatch(/prizePlan|ZGIFT|"amount"/);
      expect(joinTxt).not.toMatch(/prizePlan|ZGIFT|"amount"|"budget"/); shared++;
    }
    n++;
  }
  console.log(`WIRE MATRIX plans saved and checked through the real Worker: ${n} (organizer read-backs: ${shared}; plans with a 0 prize refused by the server: ${zero})`);
  expect(n).toBeGreaterThan(N_BUD * 100);
});
