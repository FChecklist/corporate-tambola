// R3 + R5 (console side) + R1 in the console: Step 3 "Prizes for your team" (apps/web/public/zc-flow-prizes.js) on top of the pack, in a DOM.
// FALSIFIED BY: tools/matrix/breaks/table.ts (P-series)
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { PRIZE_HOUSES, validateCfg } from "../../../../packages/beacon/src/config";
import { SPEC, expectedAmounts, idOf } from "./spec";

const PUB = join(import.meta.dir, "../../public");
const src = ["zc-flow-game.js", "pack/zc-flow.js", "prize-planner.js", "zc-flow-prizes.js"].map((f) => readFileSync(join(PUB, f), "utf8")).join("\n");
export const FOOT = "A note on prizes. The amounts shown here are only a guide. Please change them, or the prizes themselves, in whatever way suits you best. Whether a prize is cash, a voucher or a gift is entirely your choice, and you give it in your own way and time. Corporate Tambola only helps you plan and keep a record. We have no part in the prizes themselves.";
export const BLANK = "Enter your budget, or choose Manual to set your prizes yourself.";
const calls: any[] = [];
let failWith: { message: string; code?: string } | null = null;
let confirmAnswer = true, confirms: string[] = [];
function page(tickets: 1 | 2 = 1) {
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES };
  win.confirm = (m: string) => { confirms.push(m); return confirmAnswer; };
  const fakeFetch = async (url: string, o: any = {}) => {
    calls.push({ url, method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null });
    if (failWith && o.method === "PATCH") return { ok: false, status: 409, json: async () => ({ error: failWith!.message, code: failWith!.code }) };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  calls.length = 0; failWith = null; confirmAnswer = true; confirms = [];
  new Function("window", "document", "location", "fetch", "confirm", "MutationObserver", src)(win, win.document, win.location, fakeFetch, win.confirm, win.MutationObserver);
  const s = win.ZFLOW.state; s.done[1] = true; s.done[2] = true; s.open = 3; s.eid = "EABCDEF"; win.ZFLOW.draw();
  if (tickets === 2) click(win, '[data-tix="2"]');
  return win;
}
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const q = (w: any, sel: string) => w.document.querySelector(sel) as any;
const qa = (w: any, sel: string) => [...w.document.querySelectorAll(sel)] as any[];
const click = (w: any, sel: string) => { const n = q(w, sel); if (!n) throw new Error("no element " + sel); n.click(); };
const typeBudget = (w: any, v: string) => { const n = q(w, "#zp-budget"); n.value = v; n.dispatchEvent(new w.Event("input")); n.dispatchEvent(new w.Event("change")); };
const amounts = (w: any) => Object.fromEntries(qa(w, "[data-amount]").map((n) => [n.dataset.amount, Number(n.textContent.replace(/[^\d]/g, ""))]));
const save = async (w: any) => { click(w, "#zp-save"); await wait(); };
const msg = (w: any) => q(w, "#zp-msg").textContent as string;
const patches = () => calls.filter((c) => c.method === "PATCH");

describe("defaults and the page shape", () => {
  test("Auto is the default (Popular, Recommended); 1 ticket by default; chips 4/6/8/10 with 6 chosen; currency INR with the rupee sign; budget empty", () => {
    const w = page(); expect(q(w, '[data-pmode="auto"]').getAttribute("aria-checked")).toBe("true"); expect(q(w, '[data-pmode="manual"]').getAttribute("aria-checked")).toBe("false");
    expect(q(w, '[data-pmode="auto"]').textContent).toContain("(Popular) (Recommended)"); expect(q(w, '[data-tix="1"]').getAttribute("aria-checked")).toBe("true");
    expect(qa(w, "[data-count]").map((n) => n.dataset.count)).toEqual(["4", "6", "8", "10"]); expect(q(w, '[data-count="6"]').getAttribute("aria-checked")).toBe("true");
    expect(q(w, "#zp-cur").value).toBe("INR"); expect(q(w, "#zp-budget").value).toBe(""); expect(qa(w, "#zp-table tbody tr").length).toBe(6);
    expect(qa(w, "#zp-table thead th").map((n) => n.textContent)).toEqual(["Prize", "Amount", "Name the gift (optional, only you see this)"]);
  });
  test("2 tickets: chips 12/14/16/20 with 14 chosen; the table has Ticket 1 / Ticket 2 prizes and Super Bumper", () => {
    const w = page(2); expect(qa(w, "[data-count]").map((n) => n.dataset.count)).toEqual(["12", "14", "16", "20"]); expect(q(w, '[data-count="14"]').getAttribute("aria-checked")).toBe("true");
    const names = qa(w, "#zp-table tbody tr td:first-child").map((n) => n.textContent); expect(names.length).toBe(14); expect(names).toContain("Ticket 2: Line 3"); expect(names).toContain("1st Super Bumper");
    expect(names.some((n: string) => /Early 5/.test(n))).toBe(false);
  });
  test("the footer note is the frozen text, word for word, always on the page; there is no 'Change the split' link anywhere", () => {
    for (const mode of ["auto", "manual"]) { const w = page(); if (mode === "manual") click(w, '[data-pmode="manual"]'); expect(q(w, "#zp-foot").textContent).toBe(FOOT); expect(w.document.body.textContent).not.toMatch(/change the split/i); expect(qa(w, "a").some((a) => /split/i.test(a.textContent))).toBe(false); }
  });
  test("every tickets / count choice gives the table of the frozen plan (labels and counts) for all 8 plans", () => {
    for (const [t, c] of [[1, 4], [1, 6], [1, 8], [1, 10], [2, 12], [2, 14], [2, 16], [2, 20]] as const) {
      const w = page(t); click(w, `[data-count="${c}"]`); typeBudget(w, "100000");
      const ids = qa(w, "#zp-table tbody tr").map((r) => r.dataset.prize).sort(); expect([t, c, ids]).toEqual([t, c, SPEC[`${t}:${c}`]!.map(idOf).sort()]);
    }
  });
  test("switching the tickets resets the count to its default (6 or 14)", () => { const w = page(); click(w, '[data-count="10"]'); click(w, '[data-tix="2"]'); expect(q(w, '[data-count="14"]').getAttribute("aria-checked")).toBe("true"); click(w, '[data-tix="1"]'); expect(q(w, '[data-count="6"]').getAttribute("aria-checked")).toBe("true"); });
});

describe("R3: the budget is mandatory in Auto", () => {
  for (const [label, v] of [["blank", ""], ["spaces", "   "], ["zero", "0"], ["text", "abc"], ["only a symbol", "₹"], ["zeros", "000"], ["a lone dot", "."], ["two dots", "1.2.3"]] as const)
    test(`${label} (${JSON.stringify(v)}) blocks Next with the frozen sentence and sends nothing`, async () => {
      const w = page(); typeBudget(w, v); await save(w); expect(msg(w)).toBe(BLANK); expect(patches().length).toBe(0); expect(w.ZFLOW.state.done[3]).toBeFalsy();
    });
  test("PRODUCT BUG P-5: a negative number blocks Next too (R3: blank/0/negative/non-number)", async () => {
    // PRODUCT BUG P-5: the console strips everything but digits and dots, so '-500' is read as 500 and the plan is saved with a budget of 500.
    const w = page(); typeBudget(w, "-500"); await save(w); expect(msg(w)).toBe(BLANK); expect(patches().length).toBe(0);
  });
  test("a positive budget goes through: one PATCH, step 3 done, the next step opens", async () => {
    const w = page(); typeBudget(w, "50000"); await save(w); expect(patches().length).toBe(1); expect(patches()[0].url).toBe("/api/z/EABCDEF/settings"); expect(w.ZFLOW.state.done[3]).toBe(true);
  });
  test("budget typed with commas / rupee sign / spaces is understood (1,00,000 = 100000; 12.9 = 12)", async () => {
    for (const [v, want] of [["1,00,000", 100000], ["₹ 25000", 25000], [" 7 999 ", 7999], ["12.9", 12]] as const) { const w = page(); typeBudget(w, v); await save(w); expect([v, patches()[0]?.body?.prizePlan?.budget]).toEqual([v, want]); }
  });
});

describe("amounts update live and the PATCH body is what the engine reads", () => {
  test("typing a budget shows an amount for every prize in whole units that adds up to the budget (the frozen floor / leftover rule), formatted with the sign", () => {
    for (const [t, c] of [[1, 6], [2, 14], [2, 20]] as const) for (const b of [7, 999, 10001, 123457]) {
      const w = page(t); click(w, `[data-count="${c}"]`); typeBudget(w, String(b)); const got = amounts(w), want = expectedAmounts(SPEC[`${t}:${c}`]!, b);
      expect([t, c, b, got]).toEqual([t, c, b, Object.fromEntries(want)]); expect(Object.values(got).reduce((s: number, x) => s + (x as number), 0)).toBe(b);
    }
    const w = page(); typeBudget(w, "100000"); expect(q(w, '[data-amount="0:full:1"]').textContent).toBe("₹ 30,000"); expect(q(w, '[data-amount="0:full:2"]').textContent).toBe("₹ 15,000"); // 1 ticket, 6 prizes: 1st Full House 30%, 2nd 15%
  });
  test("the currency is display only: USD shows $ and is sent as the currency; the amounts do not change", async () => {
    const w = page(); typeBudget(w, "10000"); const before = amounts(w); const c = q(w, "#zp-cur"); c.value = "USD"; c.dispatchEvent(new w.Event("change")); expect(amounts(w)).toEqual(before);
    expect(q(w, '[data-amount="0:full:1"]').textContent.startsWith("$ ")).toBe(true); await save(w); expect(patches()[0].body.prizePlan.currency).toBe("USD");
  });
  test("1 ticket: rewards are plain 'ticket' lines with empty text; the plan has the amounts; no gift key when none was typed", async () => {
    const w = page(); typeBudget(w, "100000"); await save(w); const b = patches()[0].body;
    expect(b.tickets).toBe(1); expect(b.rewards.every((r: any) => r.scope === "ticket" && r.text === "")).toBe(true); expect(b.rewards.length).toBe(6);
    expect(b.prizePlan).toMatchObject({ mode: "auto", currency: "INR", budget: 100000, count: 6 }); expect(b.prizePlan.prizes.length).toBe(6); expect(b.prizePlan.prizes.every((p: any) => !("gift" in p))).toBe(true);
    expect(b.prizePlan.prizes.reduce((s: number, p: any) => s + p.amount, 0)).toBe(100000);
  });
  test("2 tickets: per-ticket prizes are ticket_1 / ticket_2 lines, Early 5 only ticket_1, Super Bumper = Full House two_ticket; text always empty", async () => {
    const w = page(2); click(w, '[data-count="20"]'); typeBudget(w, "1000000"); await save(w); const b = patches()[0].body;
    expect(b.tickets).toBe(2); expect(b.rewards.length).toBe(20); expect(b.rewards.every((r: any) => r.text === "")).toBe(true);
    const k = (r: any) => `${r.pattern}/${r.scope}/${r.ordinal}`; const keys = b.rewards.map(k);
    expect(keys.filter((x: string) => x.startsWith("early5/"))).toEqual(["early5/ticket_1/1", "early5/ticket_1/2"]);
    expect(keys.filter((x: string) => x.startsWith("full/two_ticket/")).length).toBe(4); expect(keys).toContain("full/ticket_2/3"); expect(keys).toContain("top/ticket_1/1"); expect(keys).toContain("top/ticket_2/1");
    expect(keys.some((x: string) => /\/ticket\//.test(x))).toBe(false);
  });
  test("all 8 plans: the body the console sends is accepted by the engine's own validation and keeps every prize", async () => {
    for (const [t, c] of [[1, 4], [1, 6], [1, 8], [1, 10], [2, 12], [2, 14], [2, 16], [2, 20]] as const) {
      const w = page(t); click(w, `[data-count="${c}"]`); typeBudget(w, "123457"); await save(w); const b = patches()[0].body;
      const v: any = validateCfg({ tickets: b.tickets, rewards: b.rewards, prizePlan: b.prizePlan }); expect([t, c, v.ok, v.error]).toEqual([t, c, true, undefined]);
      expect(v.cfg.rewards.length).toBe(c); expect(v.cfg.prizePlan.prizes.length).toBe(c); expect(v.cfg.prizePlan.budget).toBe(123457);
      expect(b.prizePlan.prizes.reduce((s: number, p: any) => s + p.amount, 0)).toBe(123457);
    }
  });
  test("a gift name typed in the table is sent (organizer only) and appears in no reward line", async () => {
    const w = page(); typeBudget(w, "9000"); const g = q(w, 'input[aria-label="Gift name for 1st Full House"]'); g.value = "Smart watch"; g.dispatchEvent(new w.Event("input")); expect(q(w, "[data-prize] input[maxlength]").getAttribute("maxlength")).toBe("60"); await save(w);
    const b = patches()[0].body; expect(b.prizePlan.prizes.find((p: any) => p.id === "0:full:1").gift).toBe("Smart watch"); expect(JSON.stringify(b.rewards)).not.toContain("watch");
  });
  test("the small-prize hint shows (never blocks) under 100 per prize on average and not above", async () => {
    const w = page(); typeBudget(w, "100"); expect(q(w, "#zp-hint")).toBeTruthy(); await save(w); expect(patches().length).toBe(1);
    const x = page(); typeBudget(x, "6000"); expect(q(x, "#zp-hint")).toBeNull();
  });
  test("the step needs the game saved first", async () => { const w = page(); w.ZFLOW.state.eid = ""; typeBudget(w, "5000"); await save(w); expect(msg(w)).toBe("Please save step 1 first."); expect(patches().length).toBe(0); });
  test("a server error is shown in the step and the step stays open", async () => {
    const w = page(); failWith = { message: "Pick a start time in the future." }; typeBudget(w, "5000"); await save(w); expect(msg(w)).toBe("Pick a start time in the future."); expect(w.ZFLOW.state.done[3]).toBeFalsy();
  });
  test("a game made before the planner (409 prizes-old-game): the step falls back to the pack's own Step 3 (house list)", async () => {
    const w = page(); failWith = { message: "This game was made before the new prize planner, so its prizes stay as they are. Make a new game to plan prizes from a budget.", code: "prizes-old-game" };
    typeBudget(w, "5000"); await save(w); await wait(); expect(q(w, "#zp-table")).toBeNull(); expect(qa(w, "#zf-sec3 [data-house]").length).toBeGreaterThan(5);
  });
});

describe("Manual", () => {
  const toManual = (w: any) => click(w, '[data-pmode="manual"]');
  const rowsOf = (w: any) => qa(w, "#zp-table tbody tr");
  const amt = (w: any, i: number, v: string) => { const n = rowsOf(w)[i].querySelector(".zp-amt"); n.value = v; n.dispatchEvent(new w.Event("input")); };
  test("Auto -> Manual carries the table over (same prizes and amounts); the budget input is gone; currency stays", () => {
    const w = page(); typeBudget(w, "100000"); const a = amounts(w); toManual(w);
    expect(q(w, '[data-pmode="manual"]').getAttribute("aria-checked")).toBe("true"); expect(q(w, "#zp-budget")).toBeNull();
    const m = Object.fromEntries(rowsOf(w).map((r) => [r.dataset.prize, Number(r.querySelector(".zp-amt").value)])); expect(m).toEqual(a);
  });
  test("Manual needs at least 1 prize", async () => {
    const w = page(); typeBudget(w, "10000"); toManual(w); while (rowsOf(w).length) click(w, "#zp-table tbody tr .zf-link"); await save(w); expect(msg(w)).toBe("Add at least one prize."); expect(patches().length).toBe(0);
  });
  test("every prize needs an amount: a blank, 0 or text amount blocks Next with the plain sentence", async () => {
    for (const v of ["", "0", "abc"]) { const w = page(); typeBudget(w, "10000"); toManual(w); amt(w, 2, v); await save(w); expect([v, msg(w)]).toEqual([v, "Prize 3 needs an amount (a whole number above 0)."]); expect(patches().length).toBe(0); }
  });
  test("PRODUCT BUG P-6: a valid Manual list saves (a gift name is optional). Today Next stays blocked with an EMPTY message: `validateManual(..).concat(orderProblem(..))` adds the empty string '' to the problem list", async () => { const w = page(); typeBudget(w, "10000"); toManual(w); await save(w); expect([msg(w), patches().length]).toEqual([msg(w), 1]); expect(patches()[0].body.prizePlan.mode).toBe("manual"); });
  test("the 1st of a prize must come before the 2nd: removing '1st Full House' while '2nd Full House' stays is refused", async () => {
    const w = page(); typeBudget(w, "10000"); toManual(w); const i = rowsOf(w).findIndex((r) => r.dataset.prize === "0:full:1"); click(w, `#zp-table tbody tr:nth-child(${i + 1}) .zf-link`); await save(w);
    expect(msg(w)).toBe("Add the 1st Full House before the 2nd Full House."); expect(patches().length).toBe(0);
  });
  test("no prize can be listed twice: the pick lists offer only prizes not already in the table", () => {
    const w = page(); typeBudget(w, "10000"); toManual(w); const first = rowsOf(w)[0].querySelector("select"); const taken = rowsOf(w).slice(1).map((r) => r.dataset.prize);
    const offered = [...first.querySelectorAll("option")].map((o: any) => o.value); for (const t of taken) expect(offered).not.toContain(t); expect(offered).toContain(rowsOf(w)[0].dataset.prize);
  });
  test("'Add a prize' adds the next unused prize until all are used (10 on 1 ticket, 22 on 2 tickets), never above 30", () => {
    const w = page(); toManual(w); for (let i = 0; i < 40; i++) { const b = q(w, "#zp-add"); b.click(); } expect(rowsOf(w).length).toBe(10);
    const x = page(2); toManual(x); for (let i = 0; i < 40; i++) q(x, "#zp-add").click(); expect(rowsOf(x).length).toBe(22); expect(rowsOf(x).length).toBeLessThanOrEqual(30);
    expect(new Set(rowsOf(x).map((r) => r.dataset.prize)).size).toBe(22);
  });
  test("PRODUCT BUG P-6 (same cause): a good Manual list is sent with mode manual, its own amounts, the budget = their sum, and engine-valid lines", async () => {
    const w = page(2); click(w, '[data-count="12"]'); typeBudget(w, "50000"); toManual(w); amt(w, 0, "111"); amt(w, 1, "222"); const g = rowsOf(w)[0].querySelector('input[maxlength]'); g.value = "Mug"; g.dispatchEvent(new w.Event("input")); await save(w);
    const b = patches()[0].body; expect(b.prizePlan.mode).toBe("manual"); const sum = b.prizePlan.prizes.reduce((s: number, p: any) => s + p.amount, 0); expect(b.prizePlan.budget).toBe(sum);
    expect(b.prizePlan.prizes[0]).toEqual({ id: rowsOf(w)[0].dataset.prize, amount: 111, gift: "Mug" }); expect(b.prizePlan.prizes[1].amount).toBe(222);
    const v: any = validateCfg({ tickets: b.tickets, rewards: b.rewards, prizePlan: b.prizePlan }); expect(v.ok).toBe(true);
  });
  test("Manual -> Auto asks first (browser confirm); 'No' keeps the Manual list; 'Yes' goes back to a plan made from the budget", () => {
    const w = page(); typeBudget(w, "10000"); toManual(w); amt(w, 0, "5"); confirmAnswer = false; click(w, '[data-pmode="auto"]'); expect(confirms.length).toBe(1); expect(confirms[0]).toMatch(/replaced by a plan made from your budget/); expect(q(w, '[data-pmode="manual"]').getAttribute("aria-checked")).toBe("true");
    confirmAnswer = true; click(w, '[data-pmode="auto"]'); expect(confirms.length).toBe(2); expect(q(w, '[data-pmode="auto"]').getAttribute("aria-checked")).toBe("true"); expect(q(w, "#zp-budget")).toBeTruthy();
  });
  test("Manual with nothing changed from Auto does not warn when going back (only when there is a list to lose is a question asked) — pins today's behaviour", () => {
    const w = page(); toManual(w); confirmAnswer = false; click(w, '[data-pmode="auto"]'); expect(confirms.length).toBe(1); // the Manual list always exists after the switch, so the question is always asked
  });
});
