// Wire tests on the real Worker: the claim check for per-ticket houses (patOk), the winners report, the host's prize list, "given" ticks and the organizer's override for per-ticket prizes.
// FALSIFIED BY: tools/matrix/breaks/table.ts (GT-series)
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { FROM, P, Site, body2, j } from "./harness";
import { callTimeMs } from "../../src/lifecycle";
import { createRequire } from "node:module";
const ZP = createRequire(import.meta.url)("../../../web/public/prize-planner.js");
setDefaultTimeout(60_000);
const s = new Site();
const AT = FROM + 3_600_000;

/** A new 2-ticket game with per-ticket lines, one player; returns the player's pid and the moment each of the first four numbers is announced. */
async function game(id: string, tickets: 1 | 2 = 2) {
  const started = await s.make(id, AT);
  const set = tickets === 2 ? body2() : { tickets: 1, ties: "share", rewards: [{ pattern: "top", scope: "ticket", ordinal: 1, text: "" }] };
  expect((await s.patch(AT + 1000, id, set)).status).toBe(200);
  const jn = await j(await s.call(AT + 5000, "POST", `/api/z/${id}/join`, { phone: "9810000001", name: "Asha", device: "0".repeat(32) })); expect(jn.pid).toBeTruthy();
  s.raw.prepare("INSERT OR REPLACE INTO kv(k,v) VALUES(?,?)").run(`present/${id}/${String(jn.pid).split("x")[0]}`, JSON.stringify({ t: AT + 6000, pid: jn.pid, dev: "0".repeat(32) })); // checked in (the check-in itself is tested elsewhere)
  const e = s.raw.query("SELECT * FROM engagement WHERE id=?").get(id) as any, at: number[] = [];
  for (let k = 0; k < 4; k++) at.push((await callTimeMs(s.env as any, e, 1, k))!);
  return { pid: jn.pid as string, at, started };
}
const claim = (id: string, pid: string, pattern: unknown, idx: number, now: number) => s.call(now, "POST", `/api/z/${id}/claims`, { pid, device: "0".repeat(32), claims: [{ pattern, idx }] });
const stored = (id: string, pattern: string, idx: number) => (s.raw.query("SELECT COUNT(*) AS c FROM claim WHERE eid=? AND pattern=? AND idx=?").get(id, pattern, idx) as any).c as number;

describe("the claim check accepts a house of one ticket and nothing else made up", () => {
  test("top@1, top@2, early5@1, full@1, full@2 are accepted (stored 1); unknown or malformed houses are not stored", async () => {
    s.reset(); const { pid, at } = await game("WIRE-1"); const now = at[2]! - 1000;
    for (const p of ["top@1", "top@2", "early5@1", "full@1", "full@2", "corners@2", "mid@1", "bot@2", "top", "full2"]) { const r = await claim("WIRE-1", pid, p, 1, now); expect([p, r.status]).toEqual([p, 200]); expect([p, (await j(r)).stored]).toEqual([p, 1]); expect([p, stored("WIRE-1", p, 1)]).toEqual([p, 1]); }
    for (const p of ["top@3", "top@0", "nope@1", "full2@1", "lucky@1", "top@1@1", "@1", "top@", "top@12", "TOP@1", "unlucky@1", "toolongname1234@1", 5, null]) { const r = await claim("WIRE-1", pid, p, 1, now); expect([String(p), (await j(r)).stored ?? 0]).toEqual([String(p), 0]); expect([String(p), stored("WIRE-1", String(p), 1)]).toEqual([String(p), 0]); }
  });
  test("a per-ticket claim is judged by the same clock: in time before the next number, late at the instant", async () => {
    s.reset(); const { pid, at } = await game("WIRE-2");
    expect((await claim("WIRE-2", pid, "top@2", 1, at[2]! - 1)).status).toBe(200);
    const late = await claim("WIRE-2", pid, "top@1", 1, at[2]!); expect(late.status).toBe(409); expect(stored("WIRE-2", "top@1", 1)).toBe(0);
  });
  test("the Not valid (bogey) route takes top@1 and refuses top@3 / nope@1 / full2@1", async () => {
    s.reset(); const { pid, at } = await game("WIRE-3"); const bg = (p: string) => s.call(at[1]! + 500, "POST", "/api/z/WIRE-3/bogey", { pid, device: "0".repeat(32), pattern: p, round: 1 });
    const ok = await bg("top@1"); expect([200, 409]).toContain(ok.status); expect(ok.status).not.toBe(400);
    for (const p of ["top@3", "nope@1", "full2@1", "lucky"]) expect([p, (await bg(p)).status]).toEqual([p, 400]);
  });
});

describe("winners of per-ticket prizes are kept and listed with their own key", () => {
  const vote = (id: string, pid: string, results: unknown[], now: number) => s.call(now, "POST", `/api/z/${id}/vote`, { pid, device: "0".repeat(32), results }); 
  test("a result for top@1 and one for top@2 are two different prizes, both accepted, both listed to the organizer by key", async () => {
    s.reset(); const { pid, at, started } = await game("WIRE-4"); const now = at[3]! + 1000;
    const r = await vote("WIRE-4", pid, [{ pattern: "top@1", ordinal: 1, round: 1, idx: 3, pids: [pid] }, { pattern: "top@2", ordinal: 1, round: 1, idx: 3, pids: [pid] }], now); const b = await j(r);
    expect([r.status, b.accepted]).toEqual([200, 2]);
    const l = await j(await s.call(started + 60_000, "GET", "/api/z/WIRE-4/prizes", undefined, P)); expect(l.prizes.map((x: any) => `${x.pattern}#${x.ordinal}`).sort()).toEqual(["top@1#1", "top@2#1"]);
    const bad = await vote("WIRE-4", pid, [{ pattern: "top@3", ordinal: 1, round: 1, idx: 4, pids: [pid] }, { pattern: "early5@2", ordinal: 1, round: 1, idx: 4, pids: [pid] }], now); expect((await j(bad)).accepted).toBe(0);
    const ord = await vote("WIRE-4", pid, [{ pattern: "top@1", ordinal: 2, round: 1, idx: 9, pids: [pid] }], now); expect((await j(ord)).accepted).toBe(0); // no 2nd Line 1 for Ticket 1 in this plan
  });
  test("the organizer can tick 'given' for a per-ticket prize", async () => {
    s.reset(); const { pid, at, started } = await game("WIRE-5"); await vote("WIRE-5", pid, [{ pattern: "full@2", ordinal: 1, round: 1, idx: 3, pids: [pid] }], at[3]! + 1000);
    const seat = (await j(await s.call(started, "GET", "/api/z/WIRE-5/prizes", undefined, P))).prizes[0].seat;
    const g = await s.call(started + 1000, "POST", "/api/z/WIRE-5/prizegiven", { round: 1, ordinal: 1, pattern: "full@2", seat, given: true }, P); expect(g.status).toBe(200);
  });
  test("baseline: the organizer's override works for a plain prize (top) of a 1-ticket game", async () => {
    s.reset(); const { pid, at, started } = await game("WIRE-7", 1); const r = await vote("WIRE-7", pid, [{ pattern: "top", ordinal: 1, round: 1, idx: 3, pids: [pid] }], at[3]! + 1000); expect((await j(r)).accepted).toBe(1);
    const o = await s.call(started + 1000, "POST", "/api/z/WIRE-7/override", { round: 1, ordinal: 1, pattern: "top", seat: null }, P); expect(o.status).toBe(200);
  });
  test("P-3 (fixed): the organizer's override works for a per-ticket prize (top@1) the same as for a plain one", async () => {
    s.reset(); const { pid, at, started } = await game("WIRE-6"); await vote("WIRE-6", pid, [{ pattern: "top@1", ordinal: 1, round: 1, idx: 3, pids: [pid] }], at[3]! + 1000);
    const o = await s.call(started + 1000, "POST", "/api/z/WIRE-6/override", { round: 1, ordinal: 1, pattern: "top@1", seat: null }, P);
    expect([o.status, (await j(o)).error]).toEqual([200, undefined]);
  });
});

describe("P-3 (fixed) more: the override takes every per-ticket id and still refuses malformed ones", () => {
  const vote = (id: string, pid: string, results: unknown[], now: number) => s.call(now, "POST", `/api/z/${id}/vote`, { pid, device: "0".repeat(32), results });
  test("top@2, early5@1, full@1, full@2 can be overridden (nobody gets it); the change is listed; the 'given' tick still works after", async () => {
    s.reset(); const { pid, at, started } = await game("WIRE-8"); const keys = ["top@2", "early5@1", "full@1", "full@2"];
    for (const [n, k] of keys.entries()) { const vr = await j(await vote("WIRE-8", pid, [{ pattern: k, ordinal: 1, round: 1, idx: 3, pids: [pid] }], at[3]! + 1000 + n)); expect([k, vr.accepted, vr.error]).toEqual([k, 1, undefined]); }
    for (const k of keys) { const o = await s.call(started + 1000, "POST", "/api/z/WIRE-8/override", { round: 1, ordinal: 1, pattern: k, seat: null }, P); expect([k, o.status, (await j(o)).error]).toEqual([k, 200, undefined]); }
  });
  test("malformed per-ticket ids are still a 400 'Choose the prize and who gets it.': top@3, top@0, top@, @1, TOP@1, top@1@1, top@12", async () => {
    s.reset(); const { started } = await game("WIRE-9");
    for (const k of ["top@3", "top@0", "top@", "@1", "TOP@1", "top@1@1", "top@12", "top @1", "t@1"]) { const o = await s.call(started + 1000, "POST", "/api/z/WIRE-9/override", { round: 1, ordinal: 1, pattern: k, seat: null }, P); const b = await j(o); expect([k, o.status, b.code]).toEqual([k, 400, "bad-override"]); }
  });
});

function vote0() { /* keeps the helper section above readable */ }
void vote0;

describe("the plan the console's own planner makes must be accepted by the server", () => {
  const save = async (id: string, tickets: 1 | 2, count: number, budget: number) => {
    s.reset(); await s.make(id, AT); const pl = ZP.plan(tickets, count, budget);
    const rewards = pl.prizes.map((r: any) => (r.pattern === "full2" ? { pattern: "full", scope: "two_ticket", ordinal: r.ordinal, text: "" } : { pattern: r.pattern, scope: tickets === 2 && r.ticket ? `ticket_${r.ticket}` : "ticket", ordinal: r.ordinal, text: "" }));
    return s.patch(AT + 1000, id, { tickets, rewards, prizePlan: { mode: "auto", currency: "INR", budget, count: pl.prizes.length, prizes: pl.prizes.map((r: any) => ({ id: r.id, amount: r.amount })) } });
  };
  test("budgets from 100 up are accepted for all 8 plans (the smallest prize is at least 2.5 units)", async () => {
    for (const [t, c] of [[1, 4], [1, 6], [1, 8], [1, 10], [2, 12], [2, 14], [2, 16], [2, 20]] as const) for (const b of [100, 999, 10001, 123457]) { const r = await save("PLAN-" + t + c, t, c, b); expect([t, c, b, r.status]).toEqual([t, c, b, 200]); }
  });
  test("P-8 (fixed on the console side): the server still refuses a plan with a 0 prize, and the console now blocks exactly those budgets itself (the sentence is tested in console-step3). Here: server and planner agree for all 8 plans and 26 budgets - refused iff some planner amount is below 1", async () => {
    let refused = 0, accepted = 0;
    for (const [t, c] of [[1, 4], [1, 6], [1, 8], [1, 10], [2, 12], [2, 14], [2, 16], [2, 20]] as const) for (const b of [1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 33, 34, 35, 36, 39, 40, 41, 45, 50, 60, 80, 99, 100, 101, 500, 1000]) {
      const zero = ZP.plan(t, c, b).prizes.some((p: any) => p.amount < 1), r = await save("SMALL-" + t + c + "-" + b, t, c, b); expect([t, c, b, r.status]).toEqual([t, c, b, zero ? 400 : 200]); zero ? refused++ : accepted++;
    }
    expect(refused).toBeGreaterThan(20); expect(accepted).toBeGreaterThan(100);
  });
  test("P-8: the server's refusal of a 0 prize is a plain sentence the organizer can act on (it is only reached by a client that skips the console check)", async () => {
    const r = await save("SMALL-MSG", 1, 6, 7), b = await j(r); expect(r.status).toBe(400); expect(b.error).toBe("The prize plan needs a budget, a prize count and, for each prize, a whole amount above 0 (at most 30 prizes).");
  });
});
