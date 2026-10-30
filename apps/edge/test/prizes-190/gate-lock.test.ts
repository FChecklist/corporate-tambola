// R7 lock + change log, R8 new games only (both sides of PRIZES_FROM_MS), R5 privacy of the public payloads, plan storage and the clone.
// FALSIFIED BY: tools/matrix/breaks/table.ts (GT-series)
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { FROM, P, Site, body2, j, lines2, plan2, roundAt } from "./harness";
setDefaultTimeout(60_000);
const OLD_MSG = "This game was made before the new prize planner, so its prizes stay as they are. Make a new game to plan prizes from a budget.";
const s = new Site();
const H = 3_600_000;

describe("R8: new games only", () => {
  test("PRIZES_FROM_MS pin: still the coder's placeholder 2026-11-02 00:00 UTC (not yet the deploy instant). WHEN THE RELEASE SESSION FILLS IN THE REAL INSTANT, change ONLY this expected value; every other test derives its times from the constant", () => { expect(FROM).toBe(Date.UTC(2026, 10, 2, 0, 0, 0)); });
  test("whatever its value, the constant is a whole number of milliseconds, a date in 2026 or later, and prizesOn is a >= test on the game's creation time", async () => {
    expect(Number.isInteger(FROM)).toBe(true); expect(FROM).toBeGreaterThanOrEqual(Date.UTC(2026, 9, 30)); const { prizesOn } = await import("../../src/approvals");
    expect([prizesOn({ created_ms: FROM - 1 }), prizesOn({ created_ms: FROM }), prizesOn({ created_ms: FROM + 1 }), prizesOn(null), prizesOn({ created_ms: null }), prizesOn({})]).toEqual([false, true, true, false, false, false]);
  });
  test("a game created at or after the constant takes the plan and the per-ticket lines; a game created one millisecond before gets 409 prizes-old-game", async () => {
    for (const [dt, ok] of [[-1, false], [0, true], [1, true], [-86_400_000, false], [-7 * 86_400_000, false], [5 * 86_400_000, true]] as const) {
      s.reset(); const at = FROM + dt, id = `G-${dt < 0 ? "O" : "N"}${Math.abs(dt)}`, t = await s.make(id, at);
      const r = await s.patch(at + 60_000, id, body2()); const b = await j(r);
      expect([dt, r.status]).toEqual([dt, ok ? 200 : 409]);
      if (!ok) { expect(b.code).toBe("prizes-old-game"); expect(b.error).toBe(OLD_MSG); const sm = await s.summary(at + 90_000, id); expect(sm.prizePlan).toBeUndefined(); expect(sm.rewards.some((l: any) => /^ticket_[12]$/.test(l.scope))).toBe(false); }
      else { const sm = await s.summary(at + 90_000, id); expect(sm.prizePlan.budget).toBe(7654321); expect(sm.rewards.filter((l: any) => l.scope === "ticket_1").length).toBe(3); expect(sm.tickets).toBe(2); }
      void t;
    }
  });
  test("an old game: a prizePlan alone is refused, per-ticket lines alone are refused, but ordinary prize and other changes still work exactly as before", async () => {
    s.reset(); const at = FROM - 3 * 86_400_000, t0 = at + 60_000; await s.make("OLD-2", at);
    expect((await s.patch(t0, "OLD-2", { prizePlan: plan2({ prizes: [{ id: "0:top:1", amount: 5 }] }) })).status).toBe(409);
    expect((await s.patch(t0, "OLD-2", { tickets: 2, rewards: lines2.slice(0, 2) })).status).toBe(409);
    const ok = await s.patch(t0, "OLD-2", { tickets: 2, rewards: [{ pattern: "top", scope: "ticket", ordinal: 1, text: "Mug" }, { pattern: "full", scope: "two_ticket", ordinal: 1, text: "Car" }], name: "Old party" });
    expect(ok.status).toBe(200); const sm = await s.summary(t0, "OLD-2"); expect(sm.rewards.map((l: any) => l.text)).toEqual(["Mug", "Car"]); expect(sm.name).toBe("Old party"); expect(sm.prizePlan).toBeUndefined();
    expect((await s.patch(t0, "OLD-2", { prizePlan: null })).status).toBe(409); // even clearing a plan uses the new route
  });
  test("an old game that is edited again after the constant has passed stays old (the game's creation time decides, not the time of the edit)", async () => {
    s.reset(); const at = FROM - 2 * H; await s.make("OLD-3", at, {}); // starts at FROM, edited after FROM? the edit must be before the start, so edit at FROM - 1 s: still an old game
    expect((await s.patch(FROM - 1000, "OLD-3", body2())).status).toBe(409);
  });
  test("a new game keeps working with plain settings after a plan was saved (the plan is kept by a later save that does not mention it)", async () => {
    s.reset(); const at = FROM + H; await s.make("NEW-1", at); expect((await s.patch(at + 1000, "NEW-1", body2())).status).toBe(200);
    expect((await s.patch(at + 2000, "NEW-1", { name: "Party" })).status).toBe(200); const sm = await s.summary(at + 3000, "NEW-1"); expect(sm.prizePlan.budget).toBe(7654321); expect(sm.name).toBe("Party");
    expect((await s.patch(at + 4000, "NEW-1", { prizePlan: null })).status).toBe(200); expect((await s.summary(at + 5000, "NEW-1")).prizePlan).toBeUndefined();
  });
  test("G-1 (fixed): the create route POST /api/z refuses a prizePlan and per-ticket lines for a game created BEFORE the constant, with the same code and sentence as the settings route; nothing is stored", async () => {
    for (const [name, extra] of [["plan + lines", body2()], ["plan only", { prizePlan: plan2() }], ["ticket_1 line only", { tickets: 2, rewards: [{ pattern: "top", scope: "ticket_1", ordinal: 1, text: "" }] }], ["ticket_2 line only", { tickets: 2, rewards: [{ pattern: "top", scope: "ticket_2", ordinal: 1, text: "" }] }]] as const) {
      s.reset(); const at = FROM - H, r = await s.call(at, "POST", "/api/z", { id: "OLD-4", startRound: roundAt(at) + 2400, callSeconds: 9, cap: 100, ...extra }, P); const b = await j(r);
      expect([name, r.status, b.code, b.error]).toEqual([name, 409, "prizes-old-game", OLD_MSG]); expect([name, s.raw.query("SELECT COUNT(*) AS c FROM engagement WHERE id='OLD-4'").get()]).toEqual([name, { c: 0 }]);
    }
  });
  test("G-1: the create route still works for an old game with ordinary prizes (no plan, no per-ticket line), and for a new game with the plan and the lines (stored in the summary)", async () => {
    s.reset(); const old = FROM - H; const ok = await s.call(old, "POST", "/api/z", { id: "OLD-5", startRound: roundAt(old) + 2400, callSeconds: 9, cap: 100, tickets: 2, rewards: [{ pattern: "top", scope: "ticket", ordinal: 1, text: "A" }, { pattern: "full", scope: "two_ticket", ordinal: 1, text: "B" }] }, P); expect(ok.status).toBe(200);
    const at = FROM + H, nw = await s.call(at, "POST", "/api/z", { id: "NEW-5", startRound: roundAt(at) + 2400, callSeconds: 9, cap: 100, ...body2() }, P); expect(nw.status).toBe(200);
    const sm = await s.summary(at + 1000, "NEW-5"); expect(sm.prizePlan.budget).toBe(7654321); expect(sm.rewards.filter((l: any) => l.scope === "ticket_1").length).toBe(3);
  });
  test("G-1: the boundary of the create route is the same as the settings route: a game created at FROM - 1 ms is refused, at FROM accepted", async () => {
    for (const [dt, want] of [[-1, 409], [0, 200]] as const) { s.reset(); const at = FROM + dt, r = await s.call(at, "POST", "/api/z", { id: "BND-" + (dt < 0 ? "O" : "N"), startRound: roundAt(at) + 2400, callSeconds: 9, cap: 100, ...body2() }, P); expect([dt, r.status]).toEqual([dt, want]); }
  });
});

describe("R7: prizes lock when the game starts; changes before are logged", () => {
  test("every save of a different plan before the start is logged as 'The prize plan was changed' (without amounts); the same plan again is not a change", async () => {
    s.reset(); const at = FROM + H; await s.make("LOG-1", at);
    expect((await s.patch(at + 1000, "LOG-1", body2())).status).toBe(200);
    expect((await s.patch(at + 2000, "LOG-1", body2())).status).toBe(200); // unchanged
    expect((await s.patch(at + 3000, "LOG-1", body2({ prizePlan: plan2({ budget: 7654322, prizes: [...plan2().prizes.slice(0, 5), { id: "0:full2:1", amount: 1020001 }] }) }))).status).toBe(200);
    const ch = await j(await s.call(at + 4000, "GET", "/api/z/LOG-1/changes", undefined, P)); const txt = JSON.stringify(ch.changes);
    const n = (txt.match(/The prize plan was changed/g) ?? []).length; expect(n).toBe(2); // the first save (none -> plan) and the real change; not the repeat
    expect(txt).not.toMatch(/7654321|7654322|1111111|SECRETGIFT/);
  });
  test("after the start time every change is refused with 409 and the plan stays as it was (amounts, gifts, removal)", async () => {
    s.reset(); const at = FROM + H, started = await s.make("LOCK-1", at);
    expect((await s.patch(at + 1000, "LOCK-1", body2())).status).toBe(200);
    for (const b of [{ prizePlan: plan2({ budget: 1, prizes: [{ id: "1:top:1", amount: 1 }] }) }, { prizePlan: null }, body2({ prizePlan: plan2({ currency: "USD" }) }), { rewards: [{ pattern: "top", scope: "ticket", ordinal: 1, text: "" }] }]) {
      const r = await s.patch(started + 5000, "LOCK-1", b); expect([JSON.stringify(b).slice(0, 40), r.status]).toEqual([JSON.stringify(b).slice(0, 40), 409]);
    }
    const sm = await s.summary(started + 6000, "LOCK-1"); expect(sm.prizePlan).toEqual(JSON.parse(JSON.stringify(sm.prizePlan))); expect(sm.prizePlan.budget).toBe(7654321); expect(sm.prizePlan.currency).toBe("INR");
    const ch = JSON.stringify((await j(await s.call(started + 7000, "GET", "/api/z/LOCK-1/changes", undefined, P))).changes); expect((ch.match(/The prize plan was changed/g) ?? []).length).toBe(1);
  });
  test("one second before the start the save still works; at the start it does not", async () => {
    s.reset(); const at = FROM + H; const started = await s.make("LOCK-2", at); const startMs = (await s.summary(at, "LOCK-2")).startMs as number;
    expect(startMs).toBeGreaterThan(at); expect((await s.patch(startMs - 1000, "LOCK-2", body2())).status).toBe(200); expect((await s.patch(startMs, "LOCK-2", body2({ prizePlan: plan2({ budget: 9 }) }))).status).toBe(409); void started;
  });
});

describe("plan storage and validation on the real route", () => {
  test("a plan with a bad shape is refused with 400 and the sentence; nothing is stored", async () => {
    s.reset(); const at = FROM + H; await s.make("VAL-1", at);
    for (const pp of [{ mode: "auto" }, { ...plan2(), budget: -1 }, { ...plan2(), prizes: [] }, { ...plan2(), prizes: [{ id: "1:top:1", amount: 0 }] }, { ...plan2(), prizes: [{ id: "1:top:1", amount: 5 }, { id: "1:top:1", amount: 6 }] }, "text", 5]) {
      const r = await s.patch(at + 1000, "VAL-1", { tickets: 2, rewards: lines2, prizePlan: pp }); expect([JSON.stringify(pp).slice(0, 50), r.status]).toEqual([JSON.stringify(pp).slice(0, 50), 400]);
      expect((await j(r)).error).toBe("The prize plan needs a budget, a prize count and, for each prize, a whole amount above 0 (at most 30 prizes).");
    }
    expect((await s.summary(at + 2000, "VAL-1")).prizePlan).toBeUndefined();
  });
  test("per-ticket lines in a 1-ticket game are refused with the plain sentence", async () => {
    s.reset(); const at = FROM + H; await s.make("VAL-2", at); const r = await s.patch(at + 1000, "VAL-2", { tickets: 1, rewards: lines2 });
    expect(r.status).toBe(400); expect((await j(r)).error).toBe("A prize for one ticket needs two tickets per participant.");
  });
  test("the gift names are cleaned (no < > `) and kept only in the organizer's summary", async () => {
    s.reset(); const at = FROM + H; await s.make("VAL-3", at); const pp = plan2({ prizes: [{ id: "1:top:1", amount: 5, gift: "  Big <b>hamper</b> `x` " }], count: 1, budget: 5 });
    expect((await s.patch(at + 1000, "VAL-3", { tickets: 2, rewards: lines2.slice(0, 1), prizePlan: pp })).status).toBe(200);
    expect((await s.summary(at + 2000, "VAL-3")).prizePlan.prizes[0].gift).toBe("Big bhamper/b x");
  });
  test("'Create a new game like this one' carries the plan (and the per-ticket lines) to the new draft", async () => {
    s.reset(); const at = FROM + H; await s.make("CLN-1", at); expect((await s.patch(at + 1000, "CLN-1", body2())).status).toBe(200);
    const r = await s.call(at + 2000, "POST", "/api/z/CLN-1/clone", {}, P); expect(r.status).toBe(200); const nid = (await j(r)).id as string;
    const sm = await s.summary(at + 3000, nid); expect(sm.prizePlan).toEqual(plan2()); expect(sm.tickets).toBe(2); expect(sm.rewards.filter((l: any) => l.scope === "ticket_2").length).toBe(2);
  });
});

describe("R5: players never see amounts, gift names or the plan (public payloads)", () => {
  const SECRET = /prizePlan|7654321|1111111|1222222|1333333|1444444|1555555|1020000|SECRETGIFT|"amount"|"budget"|"gift"/;
  test("the public /info of a game with a plan has none of it; its reward lines have empty text (names only)", async () => {
    s.reset(); const at = FROM + H; await s.make("PUB-1", at); expect((await s.patch(at + 1000, "PUB-1", body2())).status).toBe(200);
    const r = await s.info(at + 2000, "PUB-1"); expect(r.status).toBe(200); const txt = await r.text(); expect(txt).not.toMatch(SECRET);
    const info = JSON.parse(txt); expect(info.rewards.length).toBe(6); expect(info.rewards.every((l: any) => l.text === "")).toBe(true); expect(info.rewards.filter((l: any) => l.scope === "ticket_1").length).toBe(3);
    // also with a wrong key and with a participant's key: still nothing
    for (const h of [{ "x-organizer": "wrong" }, { authorization: "Bearer nope" }] as Record<string, string>[]) { const x = await s.call(at + 2000, "GET", "/api/z/PUB-1/info", undefined, h); expect(await x.text()).not.toMatch(SECRET); }
  });
  test("the join answer, the results, my prizes and the game log do not carry it either; the organizer summary does", async () => {
    s.reset(); const at = FROM + H, started = await s.make("PUB-2", at); expect((await s.patch(at + 1000, "PUB-2", body2())).status).toBe(200);
    const jn = await s.call(at + 5000, "POST", "/api/z/PUB-2/join", { phone: "9810000011", name: "Asha" }); expect(jn.status).toBe(200); const jt = await jn.text(); expect(jt).not.toMatch(SECRET);
    const pid = JSON.parse(jt).pid as string;
    for (const path of ["/results", "/myprizes?pid=" + pid, "/gamelog"]) { const x = await s.call(started + 3_600_000, "GET", `/api/z/PUB-2${path}`); expect([path, x.status < 500]).toEqual([path, true]); expect([path, await x.text()].join(" ")).not.toMatch(SECRET); }
    const sm = await s.call(at + 6000, "GET", "/api/z/PUB-2/summary", undefined, P); expect(await sm.text()).toMatch(/prizePlan/);
    const anon = await s.call(at + 6000, "GET", "/api/z/PUB-2/summary"); expect([401, 403]).toContain(anon.status); expect(await anon.text()).not.toMatch(SECRET);
  });
});

describe("P-4 (fixed): the tie rule of a game the new console makes (the console now sends `ties: \"share\"`)", () => {
  test("a plan saved the way the console saves it NOW (tickets, ties share, rewards, prizePlan) leaves the game on 'share' in the public info and in the organizer summary; clone-style re-save keeps it", async () => {
    s.reset(); const at = FROM + H; await s.make("TIE-0", at); expect((await s.patch(at + 1000, "TIE-0", body2())).status).toBe(200);
    expect((await j(await s.info(at + 2000, "TIE-0"))).ties).toBe("share"); expect((await s.summary(at + 2000, "TIE-0")).ties).toBe("share");
    expect((await s.patch(at + 3000, "TIE-0", { name: "Party" })).status).toBe(200); expect((await j(await s.info(at + 4000, "TIE-0"))).ties).toBe("share");
  });
  test("a body with ties 'next' is still accepted and kept (it is the organizer's choice); an unknown value is refused", async () => {
    s.reset(); const at = FROM + H; await s.make("TIE-2", at); expect((await s.patch(at + 1000, "TIE-2", body2({ ties: "next" }))).status).toBe(200); expect((await j(await s.info(at + 2000, "TIE-2"))).ties).toBe("next");
    expect((await s.patch(at + 3000, "TIE-2", body2({ ties: "both" }))).status).toBe(400);
  });
  test("OBSERVATION: the SERVER default did not change: a plan saved WITHOUT `ties` (any client other than the new console) leaves the game on 'next', so that client's players do not share", async () => {
    s.reset(); const at = FROM + H; await s.make("TIE-1", at);
    const { ties: _t, ...consoleBody } = body2(); void _t;
    expect((await s.patch(at + 1000, "TIE-1", consoleBody)).status).toBe(200);
    const info = await j(await s.info(at + 2000, "TIE-1"));
    expect(info.ties).toBe("next"); // pins today's behaviour: a decision for the owner (R4 says players share), not a pass/fail judgement of the planner
  });
});
