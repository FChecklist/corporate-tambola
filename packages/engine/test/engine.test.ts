import { describe, expect, test } from "bun:test";
import { isValidTicket, ticketNumbers } from "@tambola/shared";
import { CFG, EngagementEngine, makeRewardLines, type PublicEvent } from "../src";

// ---------- helpers ----------
function seeded(seed: number) {
  let s = seed >>> 0;
  return (n: number) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor((s / 0x100000000) * n); };
}
function make(init: Parameters<typeof EngagementEngine.prototype.updateSettings>[1] & { rewards?: ReturnType<typeof makeRewardLines> } = {}) {
  let t = 1_000_000;
  const events: PublicEvent[] = [];
  const eng = new EngagementEngine({ orgName: "Acme", ...init }, { now: () => t, rand: seeded(42), emit: (e) => events.push(e) });
  return { eng, events, advance: (ms: number) => { t += ms; }, clock: () => t };
}
let phone = 9_000_000_000;
const num = () => `+91${phone++}`;
function addP(eng: EngagementEngine, name: string) {
  const e164 = num();
  const r = eng.addParticipants([{ name, e164 }]);
  if (!r.ok) throw new Error(r.reason);
  return eng.participants.find((p) => p.e164 === e164)!;
}
/** Force the next call to be n (tests only), then draw. */
function callNum(eng: EngagementEngine, n: number) {
  const rem = (eng as any).remaining as number[];
  const i = rem.indexOf(n);
  if (i < 0) throw new Error(`${n} already called`);
  const real = eng.rand;
  eng.rand = () => i;
  const err = eng.draw();
  eng.rand = real;
  if (err) throw new Error(err);
}
/** Finish a claim window and the result display so play can continue. */
function settle(h: ReturnType<typeof make>) {
  h.advance(CFG.CLAIM_CHECK + 1); h.eng.tick();
  h.advance(CFG.RESULT_SHOW + 1); h.eng.tick();
}
const startedWith = (init: any = {}) => { const h = make({ callMode: "manual", ...init }); return h; };

describe("entry rules", () => {
  test("limit and duplicates are enforced", () => {
    const { eng } = make({ limit: 2 });
    const a = num();
    expect(eng.addParticipants([{ e164: a }]).ok).toBe(true);
    expect(eng.addParticipants([{ e164: a }]).ok).toBe(false);
    expect(eng.addParticipants([{ e164: num() }, { e164: num() }]).ok).toBe(false); // would exceed 2
    expect(eng.addParticipants([{ e164: num() }]).ok).toBe(true);
    expect(eng.addParticipants([{ e164: num() }]).ok).toBe(false);
  });
  test("after Start every entry path is closed and settings are locked", () => {
    const { eng } = make({ limit: 10 });
    const p = addP(eng, "Anita");
    eng.start();
    expect(eng.addParticipants([{ e164: num() }]).ok).toBe(false);
    expect(eng.askToJoin(null, { name: "X", e164: num() })).toContain("closed");
    expect(eng.joinByNumber("d1", num())).toEqual({ t: "err", k: "closed" });
    expect(eng.updateSettings("organizer", { limit: 50 })).toContain("locked");
    expect(eng.setRole("organizer", p.id, "host")).toContain("locked");
    expect(eng.admit([])).toContain("closed");
  });
  test("host may change only the family limit", () => {
    const { eng } = make();
    expect(eng.updateSettings("host", { familyLimit: 3 })).toBeNull();
    expect(eng.updateSettings("host", { limit: 500 })).toContain("organizer");
    expect(eng.updateSettings("host", { ticketMode: "double" })).toContain("organizer");
  });
  test("rate limit: 5 tries per 10 minutes per device", () => {
    const h = make();
    for (let i = 0; i < 5; i++) expect(h.eng.joinByNumber("dev", num())).toEqual({ t: "ask" });
    expect(h.eng.joinByNumber("dev", num())).toEqual({ t: "err", k: "rate" });
    h.advance(600_001);
    expect(h.eng.joinByNumber("dev", num())).toEqual({ t: "ask" });
  });
  test("second phone is blocked and an alert is raised; Move logs the first phone out", () => {
    const { eng } = make();
    const p = addP(eng, "Rahul");
    expect(eng.confirmJoin("phone1", p.id)).toBeNull();
    expect(eng.joinByNumber("phone2", p.e164)).toEqual({ t: "err", k: "inuse" });
    expect(eng.conflicts.length).toBe(1);
    expect(eng.joinByNumber("phone1", p.e164).t).toBe("game");
    eng.resolveConflict(eng.conflicts[0]!.id, "moved");
    expect(p.device).toBe("phone2");
  });
  test("waiting room: ask, admit within limit, decline", () => {
    const { eng } = make({ limit: 2 });
    addP(eng, "A");
    const e = num(), f = num();
    expect(eng.askToJoin("d9", { name: "New", e164: e })).toBeNull();
    expect(eng.joinByNumber("d9b", e).t).toBe("wait");
    expect(eng.askToJoin(null, { name: "Other", e164: f })).toBeNull();
    expect(eng.admit(eng.waiting.map((w) => w.id))).toContain("places"); // 2 waiting, 1 place left
    expect(eng.admit([eng.waiting[0]!.id])).toBeNull();
    expect(eng.participants.length).toBe(2);
    expect(eng.decline([eng.waiting[0]!.id]).length).toBe(1);
  });
});

describe("roles, passes and invite depth", () => {
  test("team lead cap, family limit, and invite chain stops", () => {
    const { eng } = make({ limit: 50, familyLimit: 1 });
    const tl = addP(eng, "Priya");
    eng.setRole("organizer", tl.id, "team_lead", 2);
    const c1 = eng.createPass(tl.id, { name: "Col One", e164: num(), kind: "colleague" });
    const c2 = eng.createPass(tl.id, { name: "Col Two", e164: num(), kind: "colleague" });
    expect(c1.ok && c2.ok).toBe(true);
    expect(eng.createPass(tl.id, { name: "Col Three", e164: num(), kind: "colleague" }).ok).toBe(false); // cap 2
    const fam = eng.createPass(tl.id, { name: "Meera", e164: num(), kind: "family" });
    expect(fam.ok).toBe(true);
    expect(eng.createPass(tl.id, { name: "Meera2", e164: num(), kind: "family" }).ok).toBe(false); // family limit 1
    if (fam.ok) expect(eng.createPass(fam.p.id, { name: "Deep", e164: num(), kind: "family" }).ok).toBe(false); // family cannot invite
    if (c1.ok) expect(eng.createPass(c1.p.id, { name: "Deeper", e164: num(), kind: "colleague" }).ok).toBe(false);
  });
  test("cancel frees the place; removal cascades; host cannot touch hosts", () => {
    const { eng } = make({ limit: 5 });
    const tl = addP(eng, "TL");
    eng.setRole("organizer", tl.id, "team_lead", 5);
    const c = eng.createPass(tl.id, { name: "Colleague", e164: num(), kind: "colleague" });
    if (!c.ok) throw new Error("x");
    expect(eng.placesLeft).toBe(3);
    expect(eng.cancelPass(c.p.id)).toBeNull();
    expect(eng.placesLeft).toBe(4);
    const c2 = eng.createPass(tl.id, { name: "Colleague2", e164: num(), kind: "colleague" });
    if (!c2.ok) throw new Error("x");
    const r = eng.removeParticipants("organizer", [tl.id]);
    expect(typeof r === "object" && r.removed.length).toBe(2);
    const h = addP(eng, "Host1");
    eng.setRole("organizer", h.id, "host");
    expect(eng.setRole("host", h.id, "participant")).toContain("Only the organizer");
    const rr = eng.removeParticipants("host", [h.id]);
    expect(typeof rr === "object" && rr.removed.length).toBe(0);
  });
  test("a used pass cannot be cancelled; reissue invalidates the old code", () => {
    const { eng } = make();
    const tl = addP(eng, "TL");
    eng.setRole("organizer", tl.id, "team_lead", 5);
    const c = eng.createPass(tl.id, { name: "Karan", e164: num(), kind: "colleague" });
    if (!c.ok) throw new Error("x");
    const old = c.p.passCode!;
    expect(eng.openPass("dA", old).t).toBe("pass");
    eng.confirmJoin("dA", c.p.id);
    expect(eng.cancelPass(c.p.id)).toContain("used");
    eng.reissuePass(c.p.id);
    expect(eng.openPass("dB", old)).toEqual({ t: "err", k: "cancelled" });
    expect(eng.openPass("dB", c.p.passCode!).t).toBe("pass");
    expect(eng.openPass("dB", "NOPE1234")).toEqual({ t: "err", k: "badlink" });
  });
});

describe("two-ticket mode (CR-01)", () => {
  test("each participant gets two distinct valid tickets; all tickets unique in the engagement", () => {
    const { eng } = make({ ticketMode: "double", limit: 300 });
    for (let i = 0; i < 200; i++) addP(eng, "P" + i);
    const keys = new Set<string>();
    for (const p of eng.participants) {
      expect(p.tickets.length).toBe(2);
      p.tickets.forEach((t) => { expect(isValidTicket(t)).toBe(true); keys.add(JSON.stringify(t)); });
    }
    expect(keys.size).toBe(400);
  });
  test("switching mode adds/removes tickets and refuses single while two-ticket rewards exist", () => {
    const { eng } = make({ limit: 5 });
    const p = addP(eng, "A");
    expect(p.tickets.length).toBe(1);
    expect(eng.updateSettings("organizer", { ticketMode: "double" })).toBeNull();
    expect(p.tickets.length).toBe(2);
    expect(eng.setRewards("organizer", makeRewardLines([{ pattern: "full", scope: "two_ticket", texts: ["Big"] }]))).toBeNull();
    expect(eng.updateSettings("organizer", { ticketMode: "single" })).toContain("Two-Ticket");
  });
  test("reward validation: contiguous houses, scope needs double mode, cap", () => {
    const { eng } = make();
    expect(eng.setRewards("organizer", makeRewardLines([{ pattern: "full", scope: "two_ticket", texts: ["x"] }]))).toContain("2-ticket");
    const gap = [{ id: "a", pattern: "full" as const, scope: "ticket" as const, ordinal: 2, text: "x" }];
    expect(eng.setRewards("organizer", gap)).toContain("numbered");
    expect(eng.setRewards("host", makeRewardLines([{ pattern: "full", texts: ["x"] }]))).toContain("organizer");
    const many = makeRewardLines([{ pattern: "full", texts: Array.from({ length: 31 }, (_, i) => "r" + i) }]);
    expect(eng.setRewards("organizer", many)).toContain("At most");
    expect(eng.setRewards("organizer", makeRewardLines([{ pattern: "full", texts: ["1", "2", "3", "4", "5"] }]))).toBeNull();
  });
});

describe("live engine: claims, houses, windows", () => {
  function run(init: any = {}) {
    const h = startedWith({ limit: 20, ...init });
    return h;
  }

  test("Top Line: valid on the completing number; paused for everyone; result public; reward line awarded", () => {
    const h = run();
    const p = addP(h.eng, "Anita");
    h.eng.start();
    const top = p.tickets[0]!.map((r) => r)[0]!.filter((v): v is number => v !== null);
    top.forEach((n) => callNum(h.eng, n));
    expect(h.eng.claim(p.id, { ticket: "A", pattern: "top", cut: top })).toBeNull();
    expect(h.eng.paused?.type).toBe("claim");
    h.advance(CFG.CLAIM_CHECK + 1); h.eng.tick();
    expect(h.eng.paused?.type).toBe("result");
    expect(h.eng.winners.get("top:ticket:1")?.length).toBe(1);
    const res = h.events.find((e) => e.type === "result") as Extract<PublicEvent, { type: "result" }>;
    expect(res.items[0]).toMatchObject({ ok: true, reward: "Top Line" });
  });

  test("late claim (after the next number) is Not valid; 2 Not valid = blocked", () => {
    const h = run();
    const p = addP(h.eng, "Anita");
    h.eng.start();
    const top = p.tickets[0]![0]!.filter((v): v is number => v !== null);
    top.forEach((n) => callNum(h.eng, n));
    const extra = [...Array(90).keys()].map((i) => i + 1).find((n) => !top.includes(n))!;
    callNum(h.eng, extra); // next number called, claim now late
    expect(h.eng.claim(p.id, { ticket: "A", pattern: "top", cut: top })).toBeNull();
    settle(h);
    expect(p.notValid).toBe(1);
    expect(h.eng.winners.get("top:ticket:1")).toBeUndefined();
    // second invalid claim blocks
    const extra2 = [...Array(90).keys()].map((i) => i + 1).find((n) => !top.includes(n) && n !== extra)!;
    callNum(h.eng, extra2);
    h.eng.claim(p.id, { ticket: "A", pattern: "mid", cut: [] });
    settle(h);
    expect(p.blocked).toBe(true);
    expect(h.eng.claim(p.id, { ticket: "A", pattern: "bot", cut: [] })).toContain("blocked");
  });

  test("cannot claim numbers that were never called, even if the phone says they are cut", () => {
    const h = run();
    const p = addP(h.eng, "Cheat");
    h.eng.start();
    const top = p.tickets[0]![0]!.filter((v): v is number => v !== null);
    callNum(h.eng, top[0]!);
    h.eng.claim(p.id, { ticket: "A", pattern: "top", cut: top });
    h.advance(CFG.CLAIM_CHECK + 1); h.eng.tick();
    expect(p.notValid).toBe(1);
    expect(h.eng.winners.size).toBe(0);
  });

  test("same-window valid claims share the reward equally", () => {
    const h = run({ rewards: makeRewardLines([{ pattern: "top", texts: ["T"] }]) });
    const a = addP(h.eng, "A"), b = addP(h.eng, "B");
    b.tickets[0] = JSON.parse(JSON.stringify(a.tickets[0])); // test only: identical tickets complete on the same call
    h.eng.start();
    const top = a.tickets[0]![0]!.filter((v): v is number => v !== null);
    top.forEach((n) => callNum(h.eng, n));
    expect(h.eng.claim(a.id, { ticket: "A", pattern: "top", cut: top })).toBeNull();
    expect(h.eng.claim(b.id, { ticket: "A", pattern: "top", cut: top })).toBeNull(); // joins the same window
    settle(h);
    const ws = h.eng.winners.get("top:ticket:1")!;
    expect(ws.length).toBe(2);
    expect(ws.every((w) => w.share === 2)).toBe(true);
  });

  test("Early Five: the 5th cut number must be the latest call", () => {
    const h = run({ rewards: makeRewardLines([{ pattern: "early5", texts: ["EF"] }]) });
    const p = addP(h.eng, "A");
    h.eng.start();
    const ns = ticketNumbers(p.tickets[0]!);
    ns.slice(0, 5).forEach((n) => callNum(h.eng, n));
    expect(h.eng.claim(p.id, { ticket: "A", pattern: "early5", cut: ns.slice(0, 5) })).toBeNull();
    settle(h);
    expect(h.eng.winners.get("early5:ticket:1")?.length).toBe(1);
  });

  test("numbered houses: 2nd Full House opens only after the 1st is awarded; each winner gets the next house", () => {
    const h = run({ rewards: makeRewardLines([{ pattern: "full", texts: ["H1", "H2", "H3"] }]) });
    const a = addP(h.eng, "A"), b = addP(h.eng, "B");
    h.eng.start();
    const fa = ticketNumbers(a.tickets[0]!), fb = ticketNumbers(b.tickets[0]!);
    fa.forEach((n) => callNum(h.eng, n));
    // A completes 1st house
    h.eng.claim(a.id, { ticket: "A", pattern: "full", cut: fa });
    settle(h);
    expect(h.eng.winners.get("full:ticket:1")?.length).toBe(1);
    expect(h.eng.status).toBe("started");
    // B completes later -> awarded as the 2nd Full House
    const need = fb.filter((n) => !h.eng.called.includes(n));
    expect(need.length).toBeGreaterThan(0);
    need.forEach((n) => callNum(h.eng, n));
    h.eng.claim(b.id, { ticket: "A", pattern: "full", cut: fb });
    settle(h);
    expect(h.eng.winners.get("full:ticket:2")?.length).toBe(1);
    expect(h.eng.winners.get("full:ticket:3")).toBeUndefined();
    const pub = h.eng.publicState();
    expect(pub.rewards.map((r) => r.name)).toEqual(["1st Full House", "2nd Full House", "3rd Full House"]);
  });

  test("Full Two-Ticket House needs all 30 numbers; one ticket alone is not enough", () => {
    const h = run({ ticketMode: "double", rewards: makeRewardLines([{ pattern: "full", scope: "two_ticket", texts: ["Big"] }, { pattern: "full", texts: ["Single"] }]) });
    const p = addP(h.eng, "A");
    h.eng.start();
    const [ta, tb] = p.tickets as [any, any];
    const na = ticketNumbers(ta), nb = ticketNumbers(tb);
    na.forEach((n) => callNum(h.eng, n));
    // claiming two-ticket now is Not valid (B not called)
    h.eng.claim(p.id, { ticket: "AB", pattern: "full", cut: [...na] });
    settle(h);
    expect(p.notValid).toBe(1);
    // ticket A single Full House was completed at the last of na; that claim is now late -> not needed here.
    const need = nb.filter((n) => !h.eng.called.includes(n));
    need.forEach((n) => callNum(h.eng, n));
    h.eng.claim(p.id, { ticket: "AB", pattern: "full", cut: [...na, ...nb] });
    settle(h);
    expect(h.eng.winners.get("full:two_ticket:1")?.length).toBe(1);
    const w = h.eng.winners.get("full:two_ticket:1")![0]!;
    expect(w.ticketId.endsWith("-AB")).toBe(true);
  });

  test("a player may win a house on ticket A and a different house on ticket B", () => {
    const h = run({ ticketMode: "double", rewards: makeRewardLines([{ pattern: "full", texts: ["H1", "H2"] }]) });
    const p = addP(h.eng, "A");
    h.eng.start();
    const na = ticketNumbers(p.tickets[0]!), nb = ticketNumbers(p.tickets[1]!);
    na.forEach((n) => callNum(h.eng, n));
    h.eng.claim(p.id, { ticket: "A", pattern: "full", cut: na });
    settle(h);
    nb.filter((n) => !h.eng.called.includes(n)).forEach((n) => callNum(h.eng, n));
    h.eng.claim(p.id, { ticket: "B", pattern: "full", cut: nb });
    settle(h);
    expect(h.eng.winners.get("full:ticket:1")![0]!.ticketId.endsWith("-A")).toBe(true);
    expect(h.eng.winners.get("full:ticket:2")![0]!.ticketId.endsWith("-B")).toBe(true);
    expect(h.eng.status).toBe("ended"); // all rewards awarded
  });

  test("claiming a house that does not exist, or a ticket you do not have, is refused immediately", () => {
    const h = run({ rewards: makeRewardLines([{ pattern: "top", texts: ["T"] }]) });
    const p = addP(h.eng, "A");
    h.eng.start();
    callNum(h.eng, 5);
    expect(h.eng.claim(p.id, { ticket: "A", pattern: "star", cut: [] })).toContain("not in this");
    expect(h.eng.claim(p.id, { ticket: "B", pattern: "top", cut: [] })).toContain("do not have");
    expect(h.eng.claim(p.id, { ticket: "AB", pattern: "full", cut: [] })).toContain("do not have");
  });

  test("family plays for fun: valid but no reward recorded", () => {
    const h = run({ familyCanWin: false, rewards: makeRewardLines([{ pattern: "top", texts: ["T"] }]) });
    const tl = addP(h.eng, "TL");
    h.eng.setRole("organizer", tl.id, "team_lead", 5);
    const f = h.eng.createPass(tl.id, { name: "Meera", e164: num(), kind: "family" });
    if (!f.ok) throw new Error("x");
    h.eng.start();
    const top = f.p.tickets[0]![0]!.filter((v): v is number => v !== null);
    top.forEach((n) => callNum(h.eng, n));
    h.eng.claim(f.p.id, { ticket: "A", pattern: "top", cut: top });
    h.advance(CFG.CLAIM_CHECK + 1); h.eng.tick();
    expect(h.eng.winners.size).toBe(0);
    const res = h.events.find((e) => e.type === "result") as Extract<PublicEvent, { type: "result" }>;
    expect(res.items[0]).toMatchObject({ ok: true, fun: true });
  });

  test("brand break fires at the configured call, never during a claim", () => {
    const h = run({ rewards: makeRewardLines([{ pattern: "top", texts: ["T"] }]) });
    const p = addP(h.eng, "A");
    expect(h.eng.setBreaks("organizer", [{ id: "b1", after: 3, kind: "youtube", title: "Launch", seconds: 30 }])).toBeNull();
    h.eng.start();
    callNum(h.eng, 1); callNum(h.eng, 2); callNum(h.eng, 3);
    expect(h.eng.draw()).toBeNull(); // 4th draw -> break instead of a number
    expect(h.eng.paused?.type).toBe("break");
    expect(h.eng.called.length).toBe(3);
    expect(h.eng.claim(p.id, { ticket: "A", pattern: "top", cut: [] })).toContain("paused");
    h.advance(31_000); h.eng.tick();
    expect(h.eng.paused).toBeNull();
    callNum(h.eng, 4);
    expect(h.eng.called.length).toBe(4);
  });

  test("brand break limits: max 3, increasing positions, organizer only", () => {
    const { eng } = make();
    const b = (after: number) => ({ id: "b" + after, after, kind: "file" as const, title: "t", seconds: 30 });
    expect(eng.setBreaks("organizer", [b(22), b(45), b(67)])).toBeNull();
    expect(eng.setBreaks("organizer", [b(10), b(20), b(30), b(40)])).toContain("At most");
    expect(eng.setBreaks("organizer", [b(30), b(20)])).toContain("increasing");
    expect(eng.setBreaks("host", [b(30)])).toContain("organizer");
  });

  test("manual draw respects the 5 s gap; AI mode refuses host draw; emergency pause blocks claims", () => {
    const h = make({ callMode: "manual" });
    addP(h.eng, "A");
    h.eng.start();
    expect(h.eng.hostDraw()).toBeNull();
    expect(h.eng.hostDraw()).toContain("Wait");
    h.advance(5_001);
    expect(h.eng.hostDraw()).toBeNull();
    const ai = make({ callMode: "ai" });
    ai.eng.start();
    expect(ai.eng.hostDraw()).toContain("system calls");
    h.eng.emergency("Internet down");
    expect(h.eng.paused?.type).toBe("emergency");
    expect(h.eng.draw()).toContain("paused");
    h.eng.resume();
    expect(h.eng.paused).toBeNull();
  });

  test("AI mode: tick draws every 10 s; numbers never repeat over 90 calls; game ends at 90", () => {
    const h = make({ callMode: "ai", rewards: makeRewardLines([{ pattern: "full", texts: ["x"] }]) });
    addP(h.eng, "A");
    h.eng.start();
    for (let i = 0; i < 400 && h.eng.status === "started"; i++) { h.advance(10_000); h.eng.tick(); }
    expect(h.eng.called.length).toBe(90);
    expect(new Set(h.eng.called).size).toBe(90);
    h.advance(10_000); h.eng.tick();
    expect(h.eng.status).toBe("ended");
  });
});

describe("privacy: nothing personal reaches participants", () => {
  test("every public event across a full engagement contains no name or number of any participant", () => {
    const h = startedWith({ limit: 30, rewards: makeRewardLines([{ pattern: "top", texts: ["T"] }, { pattern: "full", texts: ["F"] }]) });
    const names = ["Anita Rao", "Priya Nair", "Rahul Mehta"];
    const ps = names.map((n) => addP(h.eng, n));
    h.eng.start();
    const top = ps[0]!.tickets[0]![0]!.filter((v): v is number => v !== null);
    top.forEach((n) => callNum(h.eng, n));
    h.eng.claim(ps[0]!.id, { ticket: "A", pattern: "top", cut: top });
    settle(h);
    h.eng.emergency("Network issue");
    h.eng.resume();
    const publicEvents = h.events.filter((e) => e.to === "all");
    expect(publicEvents.length).toBeGreaterThan(5);
    const blob = JSON.stringify(publicEvents) + JSON.stringify(h.eng.publicState());
    for (const p of ps) {
      expect(blob).not.toContain(p.e164);
      p.name.split(" ").forEach((part) => expect(blob).not.toContain(part));
    }
    expect(blob).toContain("TMB-ACME-"); // ticket id is what is shown
  });
  test("reconnect state has no past numbers, only the current one", () => {
    const h = startedWith();
    addP(h.eng, "A");
    h.eng.start();
    callNum(h.eng, 11); callNum(h.eng, 22);
    const s = h.eng.publicState() as any;
    expect(s.current).toBe(22);
    expect(JSON.stringify(s)).not.toContain("11");
    expect("called" in s).toBe(false);
  });
});

describe("purge", () => {
  test("keeps only an anonymous summary", () => {
    const h = startedWith({ rewards: makeRewardLines([{ pattern: "top", texts: ["T"] }]) });
    addP(h.eng, "A");
    h.eng.start();
    h.eng.end();
    expect(h.eng.purge()).toBeNull();
    expect(h.eng.participants.length).toBe(0);
    expect(h.eng.log.length).toBe(0);
    expect(h.eng.summary?.players).toBe(1);
    expect(h.eng.status).toBe("purged");
  });
});
