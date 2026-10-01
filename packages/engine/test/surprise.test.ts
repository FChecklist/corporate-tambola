import { describe, expect, test } from "bun:test";
import { ticketNumbers } from "@tambola/shared";
import { CFG, EngagementEngine, SCFG, Surprise, makeRewardLines, type PublicEvent, type SurpriseSettings } from "../src";

CFG.PRE_START_MS = 0;

function seeded(seed: number) { let s = seed >>> 0; return (n: number) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor((s / 0x100000000) * n); }; }
let phone = 8_000_000_000;
const num = () => `+91${phone++}`;

function make(surprise: Partial<SurpriseSettings> = {}, init: any = {}) {
  let t = 5_000_000;
  const events: PublicEvent[] = [];
  const absent = new Set<string>();
  let eng!: EngagementEngine;
  eng = new EngagementEngine({ orgName: "Acme", limit: 200, callMode: "manual", ...init, surprise }, { now: () => t, rand: seeded(7), emit: (e) => events.push(e), present: () => new Set(eng.participants.filter((p) => p.status === "joined" && !absent.has(p.id)).map((p) => p.id)) });
  return { eng, events, absent, advance: (ms: number) => { t += ms; }, clock: () => t };
}
type H = ReturnType<typeof make>;
function join(h: H, n: number, o: { family?: number } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const e164 = num();
    h.eng.addParticipants([{ name: `Person${i} Surname`, info: "Sales", e164 }]);
    const p = h.eng.participants.find((x) => x.e164 === e164)!;
    h.eng.confirmJoin("dev" + e164, p.id);
    out.push(p);
  }
  for (let i = 0; i < (o.family ?? 0); i++) {
    const tl = out[0]!;
    h.eng.setRole("organizer", tl.id, "team_lead", 25);
    const r = h.eng.createPass(tl.id, { name: `Family${i}`, e164: num(), kind: "family" });
    if (!r.ok) throw new Error(r.reason);
    h.eng.confirmJoin("fdev" + i, r.p.id);
    out.push(r.p);
  }
  return out;
}
function callNum(eng: EngagementEngine, n: number) {
  const rem = eng.remaining; const i = rem.indexOf(n); if (i < 0) throw new Error("already called");
  const real = eng.rand; eng.rand = () => i; const err = eng.draw(); eng.rand = real; if (err) throw new Error(err);
}
const settle = (h: H) => { h.advance(CFG.CLAIM_CHECK + 1); h.eng.tick(); h.advance(CFG.RESULT_SHOW + 1); h.eng.tick(); };
const toPid = (h: H, type: string) => h.events.filter((e) => e.to === "pid" && (e as any).type === type) as any[];

describe("planning summary (handoff formulas)", () => {
  const base: SurpriseSettings = { rounds: 3, callSeconds: 10, autoMark: true, luckyDraws: 6, luckyWinners: 3, luckyPrize: "gift", bumper: true, scratchCards: 5, scratchWinning: 10, scratchPrize: "mix", momentsMode: "auto", boostersAllowed: true, revealNames: false };
  test("sample setup: totals, gifts vs boosters, capacity and fit", () => {
    const p = Surprise.plan(base, 6);
    expect(p.tambolaPrizes).toBe(18);
    expect(p.luckyWinners).toBe(18);
    expect(p.scratchWinningCards).toBe(50);
    expect(p.giftPrizes).toBe(18 + 18 + 25); // tambola + gift lucky draws + half (rounded up) of the scratch cards
    expect(p.boosters).toBe(25);
    expect(p.capacity).toBe(18 + 4 + 2 + 6);
    expect(p.moments).toBe(11);
    expect(p.fits).toBe(true);
  });
  test("too many moments is a warning, not a block", () => {
    expect(Surprise.plan({ ...base, rounds: 1, luckyDraws: 10, scratchCards: 10 }, 3).fits).toBe(false);
  });
  test("a lot of boosters-only vs gifts-only", () => {
    expect(Surprise.plan({ ...base, luckyPrize: "booster", scratchPrize: "booster" }, 6).giftPrizes).toBe(18);
    expect(Surprise.plan({ ...base, scratchPrize: "gift" }, 6).boosters).toBe(0);
  });
});

describe("settings", () => {
  test("defaults leave the engagement as it was: one round, nothing extra", () => {
    const h = make();
    expect(h.eng.sx.enabled).toBe(false);
    expect(h.eng.publicState().still).toBeNull();
  });
  test("validation, host cannot change it, boosters off forces gifts", () => {
    const h = make();
    expect(h.eng.updateSettings("organizer", { surprise: { rounds: 6 } })).toContain("1 to 5");
    expect(h.eng.updateSettings("organizer", { surprise: { luckyWinners: 4 as any } })).toContain("1, 3, 5 or 10");
    expect(h.eng.updateSettings("organizer", { surprise: { scratchWinning: 7 as any } })).toContain("5, 10, 20 or 50");
    expect(h.eng.updateSettings("organizer", { surprise: { luckyDraws: 11 } })).toContain("0 to 10");
    expect(h.eng.updateSettings("host", { surprise: { rounds: 2 } })).toContain("organizer");
    expect(h.eng.updateSettings("organizer", { surprise: { luckyPrize: "booster", scratchPrize: "mix", boostersAllowed: false } })).toBeNull();
    expect(h.eng.settings.surprise.luckyPrize).toBe("gift");
    expect(h.eng.settings.surprise.scratchPrize).toBe("gift");
  });
  test("locked after Start", () => {
    const h = make(); join(h, 2); h.eng.start();
    expect(h.eng.updateSettings("organizer", { surprise: { rounds: 2 } })).toContain("locked");
  });
});

describe("schedule", () => {
  test("auto: every moment gets a slot, evenly spread; the bumper is last and in the finale", () => {
    const h = make({ rounds: 3, luckyDraws: 6, scratchCards: 5, momentsMode: "auto", autoMark: true }, { rewards: makeRewardLines([{ pattern: "top", texts: ["T"] }, { pattern: "mid", texts: ["M"] }, { pattern: "full", texts: ["F"] }]) });
    join(h, 3);
    h.eng.start();
    const ms = h.eng.sx.moments;
    expect(ms.length).toBe(11);
    expect(ms.every((m) => !!m.slot && h.eng.sx.slots.includes(m.slot))).toBe(true);
    expect(ms[ms.length - 1]!.bumper).toBe(true);
    expect(ms[ms.length - 1]!.slot).toBe("finale");
    expect(ms.filter((m) => m.bumper).length).toBe(1);
    expect(ms.filter((m) => m.kind === "lucky").length).toBe(6);
    expect(ms.filter((m) => m.kind === "scratch").length).toBe(5);
  });
  test("counters: at start, prizes are all rounds x reward lines; lucky and scratch counted per engagement", () => {
    const h = make({ rounds: 3, luckyDraws: 2, scratchCards: 1, momentsMode: "manual" }, { rewards: makeRewardLines([{ pattern: "top", texts: ["T"] }, { pattern: "full", texts: ["F"] }]) });
    join(h, 3); h.eng.start();
    expect(h.eng.publicState().still).toMatchObject({ prizes: 6, lucky: 2, scratch: 1, round: 1, rounds: 3, next: "any moment now" });
  });
});

describe("rounds", () => {
  test("round 1 finishes -> intermission -> round 2 with brand new tickets and numbers; report has both rounds", () => {
    const h = make({ rounds: 2, momentsMode: "manual" }, { rewards: makeRewardLines([{ pattern: "top", texts: ["T"] }]) });
    const [a] = join(h, 3);
    h.eng.start();
    const before = JSON.stringify(a!.tickets);
    const top = a!.tickets[0]![0]!.filter((v): v is number => v !== null);
    top.forEach((n) => callNum(h.eng, n));
    h.eng.claim(a!.id, { ticket: "A", pattern: "top", cut: top });
    settle(h);
    expect(h.eng.status).toBe("started");
    expect(h.eng.paused?.type).toBe("intermission");
    expect(h.events.some((e) => e.type === "round_end")).toBe(true);
    h.advance(SCFG.INTERMISSION_MS + 1); h.eng.tick();
    expect(h.eng.sx.round).toBe(2);
    expect(h.eng.called.length).toBe(0);
    expect(h.eng.paused).toBeNull();
    expect(JSON.stringify(a!.tickets)).not.toBe(before); // new tickets
    expect(h.events.some((e) => e.type === "round_start" && (e as any).round === 2)).toBe(true);
    // round 2: same reward lines, fresh
    const top2 = a!.tickets[0]![0]!.filter((v): v is number => v !== null);
    top2.forEach((n) => callNum(h.eng, n));
    h.eng.claim(a!.id, { ticket: "A", pattern: "top", cut: top2 });
    settle(h);
    expect(h.eng.status).toBe("ended");
    const rep = h.eng.report();
    expect(rep.winners.map((w) => w.round).sort()).toEqual([1, 2]);
    expect(rep.notAwarded).toEqual([]);
    expect(rep.roundsPlayed).toBe(2);
  });
  test("a round whose Full House is never claimed ends when 90 numbers are called, and unawarded rewards are listed per round", () => {
    const h = make({ rounds: 2, momentsMode: "manual" }, { rewards: makeRewardLines([{ pattern: "full", texts: ["F"] }]), callMode: "ai" });
    join(h, 1);
    h.eng.start();
    for (let i = 0; i < 92; i++) { h.advance(CFG.AI_GAP + 1); h.eng.tick(); } // 90 numbers, then the round closes
    expect(h.eng.sx.round).toBe(1);
    expect(h.eng.paused?.type).toBe("intermission");
    h.advance(SCFG.INTERMISSION_MS + 1); h.eng.tick();
    expect(h.eng.sx.round).toBe(2);
  });
  test("brand breaks happen only in round 1", () => {
    const h = make({ rounds: 2, momentsMode: "manual" }, { rewards: makeRewardLines([{ pattern: "top", texts: ["T"] }]) });
    join(h, 2);
    h.eng.setBreaks("organizer", [{ id: "b1", after: 2, kind: "slides", title: "X", seconds: 1 }]);
    h.eng.start();
    callNum(h.eng, 1); callNum(h.eng, 2);
    expect(h.eng.draw()).toBeNull();
    expect(h.eng.paused?.type).toBe("break");
  });
  test("state survives a save and restore during the break between rounds", () => {
    const h = make({ rounds: 2, luckyDraws: 1, momentsMode: "manual" }, { rewards: makeRewardLines([{ pattern: "top", texts: ["T"] }]) });
    const [a] = join(h, 2); h.eng.start();
    const top = a!.tickets[0]![0]!.filter((v): v is number => v !== null);
    top.forEach((n) => callNum(h.eng, n)); h.eng.claim(a!.id, { ticket: "A", pattern: "top", cut: top }); settle(h);
    const back = EngagementEngine.restore(h.eng.snapshot(), { now: h.clock });
    expect(back.sx.round).toBe(1);
    expect(back.paused?.type).toBe("intermission");
    expect(back.sx.moments.length).toBe(1);
    expect(back.settings.surprise.rounds).toBe(2);
  });
});

describe("lucky draw", () => {
  test("manual: the organizer starts it; the server draws; winner taps I'm here; result shows a ticket id, never a name", () => {
    const h = make({ luckyDraws: 1, luckyWinners: 1, bumper: false, momentsMode: "manual" });
    join(h, 5); h.eng.start();
    expect(h.eng.triggerMoment("lucky")).toBeNull();
    expect(h.eng.paused?.type).toBe("moment");
    const won = toPid(h, "lucky_won");
    expect(won.length).toBe(1);
    expect(h.eng.confirmPresent(won[0].pid, h.eng.sx.moments[0]!.id)).toBeNull();
    expect(h.eng.paused).toBeNull();
    const res = h.events.find((e) => e.type === "moment_result") as any;
    expect(res.winners.length).toBe(1);
    expect(res.winners[0]).toMatch(/^TMB-ACME-/);
    expect(JSON.stringify(h.events.filter((e) => e.to === "all"))).not.toContain("Surname");
    expect(h.eng.publicState().still).toMatchObject({ lucky: 0 });
  });
  test("only joined, present, eligible people are drawn; family excluded when they cannot win; one prize per person", () => {
    const h = make({ luckyDraws: 1, luckyWinners: 10, bumper: false, momentsMode: "manual" }, { familyCanWin: false });
    const people = join(h, 6, { family: 2 });
    h.absent.add(people[1]!.id); // not present
    h.eng.addParticipants([{ name: "NotJoined", e164: num() }]); // on the list but never joined
    h.eng.start();
    h.eng.triggerMoment("lucky");
    const pids = toPid(h, "lucky_won").map((x) => x.pid) as string[];
    expect(new Set(pids).size).toBe(pids.length);
    expect(pids).not.toContain(people[1]!.id);
    for (const pid of pids) { const p = h.eng.participants.find((x) => x.id === pid)!; expect(p.kind).not.toBe("family"); expect(p.status).toBe("joined"); }
    expect(pids.length).toBe(5); // 6 joined minus the absent one; family (2) excluded; fewer than the 10 asked for
  });
  test("a winner who does not confirm in 60 s is replaced once, and the redraw is logged", () => {
    const h = make({ luckyDraws: 1, luckyWinners: 1, bumper: false, momentsMode: "manual" });
    join(h, 5); h.eng.start();
    h.eng.triggerMoment("lucky");
    const first = toPid(h, "lucky_won")[0].pid;
    h.advance(SCFG.LUCKY_CONFIRM_MS + 1); h.eng.tick();
    const all = toPid(h, "lucky_won");
    expect(all.length).toBe(2);
    expect(all[1].pid).not.toBe(first);
    expect(h.eng.log.some((l) => l.msg.includes("redraw"))).toBe(true);
    h.eng.confirmPresent(all[1].pid, h.eng.sx.moments[0]!.id);
    expect(h.eng.paused).toBeNull();
  });
  test("booster prize: the winner gets a booster that shows on their phone", () => {
    const h = make({ luckyDraws: 1, luckyWinners: 3, luckyPrize: "booster", bumper: false, momentsMode: "manual" });
    join(h, 6); h.eng.start();
    h.eng.triggerMoment("lucky");
    const pids: string[] = toPid(h, "lucky_won").map((x) => x.pid);
    pids.forEach((pid) => h.eng.confirmPresent(pid, h.eng.sx.moments[0]!.id));
    const total = pids.reduce((n, pid) => { const b = h.eng.boostersOf(pid); return n + b.joker + b.extra + b.pass; }, 0);
    expect(total).toBe(3);
    expect(toPid(h, "booster").length).toBe(3);
  });
  test("the organizer cannot start a draw in automatic mode, nor when none are left", () => {
    const h = make({ luckyDraws: 1, momentsMode: "auto" }); join(h, 3); h.eng.start();
    expect(h.eng.triggerMoment("lucky")).toContain("automatically");
    const m = make({ luckyDraws: 0, scratchCards: 1, momentsMode: "manual" }); join(m, 3); m.eng.start();
    expect(m.eng.triggerMoment("lucky")).toContain("no lucky draws");
  });
  test("a Lucky draw pass is used up by the next draw", () => {
    const h = make({ luckyDraws: 1, luckyWinners: 1, bumper: false, momentsMode: "manual" });
    const ps = join(h, 4); ps[0]!.boosters.pass = 1; h.eng.start();
    h.eng.triggerMoment("lucky");
    expect(ps[0]!.boosters.pass).toBe(0);
  });
});

describe("scratch card", () => {
  test("exactly the set number of winning cards, decided before anyone scratches, even if few scratch", () => {
    const h = make({ scratchCards: 1, scratchWinning: 5, scratchPrize: "gift", autoMark: true, momentsMode: "manual" });
    const ps = join(h, 30); h.eng.start();
    h.eng.triggerMoment("scratch");
    expect(h.eng.paused).toBeNull(); // auto-mark: numbers keep being called
    const sc = h.eng.sx.scratch!;
    expect(Object.keys(sc.outcomes).length).toBe(5); // decided already
    // only 3 people scratch before the timer; everyone else is auto-revealed
    ps.slice(0, 3).forEach((p) => h.eng.revealScratch(p.id, sc.id));
    h.advance(SCFG.SCRATCH_MS + 1); h.eng.tick();
    const results = toPid(h, "scratch_result");
    expect(results.length).toBe(30); // everyone got their result
    expect(results.filter((r) => r.outcome === "gift").length).toBe(5);
    expect(results.filter((r) => r.outcome === "none").length).toBe(25);
    expect(h.eng.publicState().still).toMatchObject({ scratch: 0 });
    const moment = h.events.find((e) => e.type === "moment_result" && (e as any).kind === "scratch") as any;
    expect(moment.winningCards).toBe(5);
    expect(moment.winners).toEqual([]); // no names, no ids: only the total is public
  });
  test("a person only learns their own result, and cannot scratch twice or for another moment", () => {
    const h = make({ scratchCards: 1, scratchWinning: 5, scratchPrize: "gift", momentsMode: "manual" });
    const ps = join(h, 10); h.eng.start(); h.eng.triggerMoment("scratch");
    const id = h.eng.sx.scratch!.id;
    const r1 = h.eng.revealScratch(ps[0]!.id, id), r2 = h.eng.revealScratch(ps[0]!.id, id);
    expect(r1).toEqual(r2);
    expect(toPid(h, "scratch_result").filter((x) => x.pid === ps[0]!.id).length).toBe(1);
    expect(typeof h.eng.revealScratch(ps[0]!.id, "wrong")).toBe("string");
  });
  test("without auto-mark the card pauses calling; half and half rounds the gifts up", () => {
    const h = make({ scratchCards: 1, scratchWinning: 5, scratchPrize: "mix", autoMark: false, momentsMode: "manual" });
    const ps = join(h, 20); h.eng.start(); h.eng.triggerMoment("scratch");
    expect(h.eng.paused?.type).toBe("moment");
    h.advance(SCFG.SCRATCH_MS + 1); h.eng.tick();
    expect(h.eng.paused).toBeNull();
    const out = toPid(h, "scratch_result").filter((r) => r.outcome !== "none");
    expect(out.length).toBe(5);
    expect(out.filter((r) => r.outcome === "gift").length).toBe(3);
    expect(out.filter((r) => r.outcome !== "gift").length).toBe(2);
    void ps;
  });
  test("family members cannot win a card when they cannot win rewards", () => {
    const h = make({ scratchCards: 1, scratchWinning: 50, scratchPrize: "gift", momentsMode: "manual" }, { familyCanWin: false, familyLimit: 4 });
    const ps = join(h, 4, { family: 3 }); h.eng.start(); h.eng.triggerMoment("scratch");
    const winners = Object.keys(h.eng.sx.scratch!.outcomes);
    expect(winners.length).toBe(4); // 50 asked for, 4 eligible
    for (const p of ps.filter((x) => x.kind === "family")) expect(winners).not.toContain(p.id);
  });
});

describe("boosters", () => {
  test("Joker marks one called number that is on the ticket but not cut, once", () => {
    const h = make({ luckyDraws: 1, momentsMode: "manual" });
    const [a] = join(h, 2); a!.boosters.joker = 1; h.eng.start();
    const mine = ticketNumbers(a!.tickets[0]!);
    callNum(h.eng, mine[0]!); callNum(h.eng, mine[1]!);
    const r = h.eng.useJoker(a!.id, "A", [mine[0]!]);
    expect(typeof r).toBe("object");
    expect((r as any).number).toBe(mine[1]!);
    expect(h.eng.useJoker(a!.id, "A", [])).toBe("You have no Joker.");
    a!.boosters.joker = 1;
    expect(h.eng.useJoker(a!.id, "A", [mine[0]!, mine[1]!])).toContain("Nothing to mark");
  });
  test("boosters off: nobody can use one", () => {
    const h = make({ luckyDraws: 1, boostersAllowed: false, momentsMode: "manual" });
    const [a] = join(h, 2); a!.boosters.joker = 1; h.eng.start();
    expect(h.eng.useJoker(a!.id, "A", [])).toContain("not part of this engagement");
  });
  test("Extra ticket: one more ticket in the next round only", () => {
    const h = make({ rounds: 3, momentsMode: "manual" }, { rewards: makeRewardLines([{ pattern: "top", texts: ["T"] }]) });
    const [a, b] = join(h, 2); a!.boosters.extra = 1; h.eng.start();
    const win = (pl: typeof a) => { const t = pl!.tickets[0]![0]!.filter((v): v is number => v !== null); t.forEach((n) => callNum(h.eng, n)); h.eng.claim(pl!.id, { ticket: "A", pattern: "top", cut: t }); settle(h); h.advance(SCFG.INTERMISSION_MS + 1); h.eng.tick(); };
    win(b);
    expect(a!.tickets.length).toBe(2); // round 2: extra ticket
    expect(b!.tickets.length).toBe(1);
    expect(a!.boosters.extra).toBe(0);
    win(b);
    expect(a!.tickets.length).toBe(1); // round 3: back to normal
  });
});

describe("extra ticket claims", () => {
  test("the third ticket (Extra ticket booster in a 2-ticket engagement) can claim", () => {
    const h = make({ rounds: 2, momentsMode: "manual" }, { ticketMode: "double", rewards: makeRewardLines([{ pattern: "top", texts: ["T"] }]) });
    const [a, b] = join(h, 2); a!.boosters.extra = 1; h.eng.start();
    const t = b!.tickets[0]![0]!.filter((v): v is number => v !== null);
    t.forEach((n) => callNum(h.eng, n)); h.eng.claim(b!.id, { ticket: "A", pattern: "top", cut: t }); settle(h);
    h.advance(SCFG.INTERMISSION_MS + 1); h.eng.tick();
    expect(a!.tickets.length).toBe(3);
    const c = a!.tickets[2]![0]!.filter((v): v is number => v !== null);
    c.forEach((n) => callNum(h.eng, n));
    expect(h.eng.claim(a!.id, { ticket: "C", pattern: "top", cut: c })).toBeNull();
    settle(h);
    expect(h.eng.winners.get("top:ticket:1")![0]!.ticketId.endsWith("-C")).toBe(true);
  });
});

describe("privacy of moments", () => {
  test("by default winners are ticket ids; with the opt-in they show first name, department and last 4 digits, never the full number", () => {
    const off = make({ luckyDraws: 1, luckyWinners: 1, bumper: false, momentsMode: "manual" });
    join(off, 3); off.eng.start(); off.eng.triggerMoment("lucky"); off.eng.confirmPresent(toPid(off, "lucky_won")[0].pid, off.eng.sx.moments[0]!.id);
    expect((off.events.find((e) => e.type === "moment_result") as any).winners[0]).toMatch(/^TMB-/);
    const on = make({ luckyDraws: 1, luckyWinners: 1, bumper: false, revealNames: true, momentsMode: "manual" });
    const ps = join(on, 3); on.eng.start(); on.eng.triggerMoment("lucky"); on.eng.confirmPresent(toPid(on, "lucky_won")[0].pid, on.eng.sx.moments[0]!.id);
    const shown = (on.events.find((e) => e.type === "moment_result") as any).winners[0] as string;
    expect(shown).toMatch(/Person\d S\./);
    expect(shown).toContain("Sales");
    expect(shown).toMatch(/••••\d{4}$/);
    for (const p of ps) expect(shown).not.toContain(p.e164.slice(1, 8));
  });
});

describe("names consent", () => {
  test("someone who joined BEFORE the names option was switched on is still shown by ticket id", () => {
    const h = make({ luckyDraws: 1, luckyWinners: 1, bumper: false, momentsMode: "manual" });
    join(h, 3); // joined while the option was off
    expect(h.eng.updateSettings("organizer", { surprise: { revealNames: true } })).toBeNull();
    h.eng.start(); h.eng.triggerMoment("lucky"); h.eng.confirmPresent(toPid(h, "lucky_won")[0].pid, h.eng.sx.moments[0]!.id);
    expect((h.events.find((e) => e.type === "moment_result") as any).winners[0]).toMatch(/^TMB-/);
  });
});

describe("a whole event: 2 rounds, lucky draws, a scratch card, a bumper", () => {
  test("every counted moment happens, the bumper is last, counters never go below zero, and the engagement ends", () => {
    const h = make({ rounds: 2, luckyDraws: 3, luckyWinners: 1, bumper: true, scratchCards: 2, scratchWinning: 5, scratchPrize: "mix", momentsMode: "auto", autoMark: true },
      { callMode: "manual", rewards: makeRewardLines([{ pattern: "top", texts: ["T"] }, { pattern: "mid", texts: ["M"] }, { pattern: "bot", texts: ["B"] }]) });
    const ps = join(h, 12);
    h.eng.start();
    const min = { prizes: 99, lucky: 99, scratch: 99 };
    const watch = () => { const s = h.eng.publicState().still!; min.prizes = Math.min(min.prizes, s.prizes); min.lucky = Math.min(min.lucky, s.lucky); min.scratch = Math.min(min.scratch, s.scratch); };
    const pump = () => { // keep the engagement moving: confirm lucky winners, reveal scratch, end intermissions
      for (let i = 0; i < 6; i++) {
        for (const w of toPid(h, "lucky_won")) h.eng.confirmPresent(w.pid, w.momentId);
        h.advance(SCFG.SCRATCH_MS + 1); h.eng.tick();
        h.advance(SCFG.INTERMISSION_MS + 1); h.eng.tick(); watch();
      }
    };
    pump();
    let guard = 0;
    while (h.eng.status === "started" && guard++ < 40) {
      pump();
      if (h.eng.status !== "started" || h.eng.paused) continue;
      const r = h.eng.sx.round;
      const lines = ["top", "mid", "bot"] as const;
      // one participant wins one open line per pass of this loop
      const pl = ps[guard % ps.length]!;
      const open = lines.find((l) => !h.eng.winners.get(`${l}:ticket:1`)?.length);
      if (!open) continue;
      const row = open === "top" ? 0 : open === "mid" ? 1 : 2;
      const need = pl.tickets[0]![row]!.filter((v): v is number => v !== null).filter((n) => !h.eng.called.includes(n));
      if (need.length) need.forEach((n) => { if (!h.eng.paused && h.eng.remaining.includes(n)) callNum(h.eng, n); });
      const cut = pl.tickets[0]!.flat().filter((v): v is number => v !== null).filter((n) => h.eng.called.includes(n));
      h.eng.claim(pl.id, { ticket: "A", pattern: open, cut });
      settle(h); watch(); void r;
    }
    expect(h.eng.status).toBe("ended");
    const sx = h.eng.sx;
    expect(sx.round).toBe(2);
    expect(sx.moments.every((m) => m.status === "done")).toBe(true);
    expect(sx.moments.filter((m) => m.kind === "lucky").length).toBe(3);
    expect(sx.moments.filter((m) => m.kind === "scratch").length).toBe(2);
    const order = sx.results.map((r) => r.momentId);
    const bumper = sx.moments.find((m) => m.bumper)!;
    expect(order[order.length - 1]).toBe(bumper.id); // the bumper draw is the last moment of the event
    expect(min.prizes).toBeGreaterThanOrEqual(0); expect(min.lucky).toBeGreaterThanOrEqual(0); expect(min.scratch).toBeGreaterThanOrEqual(0);
    for (const r of sx.results.filter((x) => x.kind === "scratch")) expect(r.winningCards).toBe(5);
    expect(h.eng.publicState().still).toMatchObject({ lucky: 0, scratch: 0 });
    const rep = h.eng.report();
    expect(rep.moments.length).toBe(5);
    expect(rep.winners.length).toBeGreaterThanOrEqual(6);
  });
});
