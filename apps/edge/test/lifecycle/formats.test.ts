// LIFECYCLE SUITE, part 1: every step of a Corporate Tambola game, run once for EACH of the four start formats
//   A-A  auto-start + auto-numbers        A-H  auto-start + organizer-calls-numbers
//   M-A  organizer-start + auto-numbers   M-H  organizer-start + organizer-calls-numbers
// Real Worker code, in-memory D1, handed-in clock, the test Razorpay stand-in, a stand-in for the public beacon. No browser, no network, no money.
// Owner rules covered: ID-only invite, IDs A-1101 / A 1101 / A/1101 are one ID, listed ID joins with no approval, unlisted ID waits for a yes (or a no), family 1 to 10 (default 4),
// a game starts only when paid, data and IDs erased within 24 hours.
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore, create, publish, contact, organizer } from "../param-harness";
// @ts-ignore plain browser script with a CommonJS tail: the console's own paste / CSV reader
import ZIdList from "../../../web/public/idlist.js";
import { kv, readPublished, FORMATS, newGame, payGame, seat, addIds, joinId, waiting, decide, info, press, control, startGame, runAllNumbers, callLog, winnersOf, oracleIdx, ticketFor, ticketNumbers, isValidTicket, row, count, call, j, q, one, dev, T, HOUR, MIN, W, keyH, pidOf, startIn, roundMs, type Game } from "./harness";
setDefaultTimeout(120_000);
beforeEach(() => reset()); afterEach(restore);

for (const f of FORMATS) describe(`[${f.key}] ${f.label}`, () => {
  // ------------------------------------------------------------------ 1. create
  test("create: the game is made with the chosen start and call settings, and a game that is only a draft takes nobody", async () => {
    const o = await organizer();
    const r = await create(o.key, `LC-C-${f.key}`, { startMode: f.startMode, callMode: f.callMode, callSeconds: f.callMode === "host" ? 9 : 12, verify: "id", whoCanJoin: "list" });
    expect(r.status).toBe(200);
    const i = await j(await call("GET", `/api/z/LC-C-${f.key}/info`, undefined, o.h));
    expect([i.startMode, i.callMode, i.whoCanJoin]).toEqual([f.startMode, f.callMode, "list"]);
    const d = await call("POST", `/api/z/LC-C-${f.key}/join`, { empId: "A1", device: dev(1) });
    expect(d.status).toBe(403); expect((await j(d)).error).toMatch(/not open yet/i); // draft: no guest gets in
  });
  // ------------------------------------------------------------------ 2. ID list upload and paste, one ID rule
  test("ID list: upload (CSV) and paste are read, IDs are cleaned, A-1101 / A 1101 / A/1101 are the same person", async () => {
    const g = await newGame(f);
    const pasted = ZIdList.parse("A-1101\nb 2202\nC/3303\nd.4404\n").ids as string[];
    expect(pasted).toEqual(["A1101", "B2202", "C3303", "D4404"]);
    const csv = ZIdList.parse("S.No,Name,Employee ID\n1,Asha Rao,E 5505\n2,Ravi Shah,E-5506\n").ids as string[];
    expect(csv).toEqual(["E5505", "E5506"]); // the name column never leaves the browser
    const r = await j(await addIds(g, [...pasted, ...csv]));
    expect(r.added).toBe(6);
    // the same ID written three ways, in one upload, is ONE person
    const dup = await j(await addIds(g, ["F-7707", "F 7707", "F/7707", "f.7707"]));
    expect(dup.added).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM person WHERE eid=? AND role IS NULL", g.id)).toBe(7);
    // an ID that cannot be an ID is refused, with a reason, and the others still go in
    const bad = await j(await addIds(g, ["G8808", "x@y.com", "ΑΒΓ1"]));
    expect(bad.added).toBe(1); expect(bad.invalid.length).toBe(2);
    // the same ID typed again later is a duplicate, never a second person
    expect((await j(await addIds(g, ["A 1101"]))).added).toBe(0);
    expect(count("SELECT COUNT(*) AS c FROM person WHERE eid=? AND role IS NULL", g.id)).toBe(8);
  });
  // ------------------------------------------------------------------ 3. join by listed ID, no approval
  test("a listed ID joins at once, typed in any of its written forms, with no approval and nobody in the waiting room", async () => {
    const g = await newGame(f);
    await addIds(g, ["A-1101", "B 2202", "C/3303"]);
    for (const [i, typed] of ["A 1101", "b/2202", "c.3303"].entries()) {
      const r = await joinId(g, typed, i + 1); expect([typed, r.status]).toEqual([typed, 200]);
      const b = await j(r); expect(b.pid).toMatch(/^\d+x[0-9a-f]{12}$/); expect(b.waiting).toBeUndefined();
    }
    expect(await waiting(g)).toEqual([]);
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(3);
  });
  // ------------------------------------------------------------------ 4. waiting room: approve AND decline
  test("an unlisted ID goes to the waiting room, gets no ticket, and the Organizer APPROVES it: the person then plays", async () => {
    const g = await newGame(f); await addIds(g, ["A1101"]);
    const w = await joinId(g, "Z-9001", 5);
    expect(w.status).toBe(403); expect((await j(w)).code).toBe("waiting");
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(0);
    const list = await waiting(g); expect(list.map((x) => x.empId)).toEqual(["Z9001"]);
    expect((await decide(g, list[0].id, "admit")).status).toBe(200);
    const again = await joinId(g, "z 9001", 5); expect(again.status).toBe(200);
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(1);
    expect(await waiting(g)).toEqual([]);
  });
  test("an unlisted ID goes to the waiting room and the Organizer DECLINES it: no ticket, now or later, and asking again does not get past the no", async () => {
    const g = await newGame(f); await addIds(g, ["A1101"]);
    await joinId(g, "Y-7001", 6);
    const [x] = await waiting(g);
    expect((await decide(g, x.id, "decline")).status).toBe(200);
    expect(await waiting(g)).toEqual([]);
    const again = await joinId(g, "Y 7001", 6);
    expect(again.status).toBe(403); expect((await j(again)).code).toBe("declined");
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(0);
    const log = (await j(await call("GET", `/api/z/${g.id}/people/log`, undefined, g.h))).log as any[];
    expect(log.filter((e) => e.id === "Y7001").map((e) => e.kind).sort()).toEqual(["asked", "declined"]);
  });
  test("an ID game that is not set to 'only people on the list' still holds an unlisted ID in the waiting room (an ID never walks straight in); a listed ID still joins at once", async () => {
    const g = await newGame(f, { list: false }); await addIds(g, ["OPEN1"]);
    expect((await call("GET", `/api/z/${g.id}/info`, undefined, g.h)).status).toBe(200);
    expect((await j(await call("GET", `/api/z/${g.id}/info`, undefined, g.h))).whoCanJoin).toBe("anyone");
    expect((await joinId(g, "OPEN-1", 1)).status).toBe(200);
    const un = await joinId(g, "NOT-LISTED", 2); expect(un.status).toBe(403); expect((await j(un)).code).toBe("waiting");
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(1);
    const [w] = await waiting(g); expect(w.empId).toBe("NOTLISTED");
    expect((await decide(g, w.id, "admit")).status).toBe(200);
    expect((await joinId(g, "NOT LISTED", 2)).status).toBe(200);
  });
  // ------------------------------------------------------------------ 5. family invite
  test("family invite: a listed guest adds 4 family IDs (the default), the 5th is refused, and those 4 join with no approval", async () => {
    const g = await newGame(f, { invites: { on: true, per: 4 } });
    const [pid] = await seat(g, 1);
    const me = { me: pid, device: dev(1000) };
    expect((await call("GET", `/api/z/${g.id}/invites?pid=${pid}`)).status).toBe(200);
    const four = await call("POST", `/api/z/${g.id}/people`, { people: ["F1", "F2", "F3", "F4"].map((empId) => ({ empId })), ...me });
    expect([four.status, (await j(four)).added]).toEqual([200, 4]);
    const fifth = await call("POST", `/api/z/${g.id}/people`, { people: [{ empId: "F5" }], ...me });
    expect(fifth.status).toBeGreaterThanOrEqual(400); expect((await j(fifth)).code).toBe("over-limit");
    for (const [i, id] of ["F1", "F2", "F3", "F4"].entries()) expect((await joinId(g, id, 2000 + i)).status).toBe(200);
    expect(await waiting(g)).toEqual([]);
    // a person invited by a guest cannot invite more people
    const kid = (await seat(g, 0), (await call("POST", `/api/z/${g.id}/join`, { empId: "F1", device: dev(2000) }))); const kidPid = (await j(kid)).pid;
    const more = await call("POST", `/api/z/${g.id}/people`, { people: [{ empId: "F9" }], me: kidPid, device: dev(2000) });
    expect(more.status).toBe(403);
  });
  test("family invite by the guest's link: an ID not on the list waits for the inviting guest; the guest says yes to up to 4 and the next is told the invitation is used up", async () => {
    const g = await newGame(f, { invites: { on: true, per: 4 } });
    const [pid] = await seat(g, 1);
    const seatNo = (await j(await call("GET", `/api/z/${g.id}/invites?pid=${pid}`))).seat;
    for (let k = 0; k < 4; k++) { const r = await joinId(g, "L" + k, 3000 + k, { from: seatNo, cat: "family" }); expect([r.status, (await j(r)).waiting]).toEqual([403, true]); }
    const mine = await j(await call("GET", `/api/z/${g.id}/waiting?me=${pid}&device=${dev(1000)}`));
    expect(mine.waiting.length).toBe(4);
    for (const w of mine.waiting) expect((await call("POST", `/api/z/${g.id}/waiting/${w.id}`, { decision: "admit", me: pid, device: dev(1000) })).status).toBe(200);
    for (let k = 0; k < 4; k++) expect((await joinId(g, "L" + k, 3000 + k)).status).toBe(200);
    // the 5th asks too, but the guest has used all 4 places: the guest's yes is refused and the 5th does not get a ticket
    const fifth = await joinId(g, "L9", 3009, { from: seatNo, cat: "family" });
    expect(fifth.status).toBe(403); expect((await j(fifth)).waiting).toBe(true);
    const w5 = (await j(await call("GET", `/api/z/${g.id}/waiting?me=${pid}&device=${dev(1000)}`))).waiting;
    expect(w5.length).toBe(1);
    const yes5 = await call("POST", `/api/z/${g.id}/waiting/${w5[0].id}`, { decision: "admit", me: pid, device: dev(1000) });
    expect(yes5.status).toBeGreaterThanOrEqual(400);
    expect((await joinId(g, "L9", 3009)).status).toBe(403);
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=? AND inv=1", g.id)).toBe(4);
  });
  test("family limit can be 1 to 10: 10 is allowed, 0 and 11 are refused", async () => {
    const g = await newGame(f);
    const set = async (per: number) => (await call("PATCH", `/api/z/${g.id}/settings`, { invites: { on: true, per, cats: ["family"] } }, g.h)).status;
    expect(await set(1)).toBe(200); expect(await set(10)).toBe(200);
    expect(await set(0)).toBeGreaterThanOrEqual(400); expect(await set(11)).toBeGreaterThanOrEqual(400);
  });
  // ------------------------------------------------------------------ 6. unique tickets
  test("unique tickets: 200 players get 200 valid tickets, all different; the same player always gets the same ticket", async () => {
    const g = await newGame(f, { cap: 300 });
    const pids = await seat(g, 200);
    const keys = new Set<string>(), seen = new Set<string>();
    for (const p of pids) {
      const t = ticketFor(g.id, p); expect(isValidTicket(t)).toBe(true); expect(ticketNumbers(t).length).toBe(15);
      keys.add(JSON.stringify(t)); seen.add(p);
      expect(JSON.stringify(ticketFor(g.id, p))).toBe(JSON.stringify(t));
    }
    expect(keys.size).toBe(200); expect(seen.size).toBe(200);
    // reopening the link (same ID, same phone) gives the same ticket id, not a new one
    const again = await joinId(g, "P1000", 1000); expect((await j(again)).pid).toBe(pids[0]);
  });
  // ------------------------------------------------------------------ 7. numbers: random, never repeat
  test("numbers: all 90 are called, each exactly once, in a random order that differs from game to game and from the plain 1..90 order", async () => {
    const orders: string[] = [];
    for (let k = 0; k < 3; k++) {
      const g = await newGame(f); await seat(g, 3, "N" + k);
      await runAllNumbers(g);
      const { log, rounds } = await callLog(g);
      expect(log.length).toBe(90);
      expect([...log].sort((a, b) => a - b)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1)); // a permutation: none missing, none twice
      expect(new Set(rounds).size).toBe(90); // each call has its own beacon round
      expect(log).not.toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
      orders.push(log.join(","));
    }
    expect(new Set(orders).size).toBe(3);
  });
  // ------------------------------------------------------------------ 8. paid, start, pause, end
  test("a game starts only when paid: unpaid at its time it is held and takes nobody; paying opens it", async () => {
    const g = await newGame(f, { pay: false, sign: false });
    await addIds(g, ["A1101"]);
    expect((await joinId(g, "A1101", 1)).status).toBe(200); // before the start time an unpaid game still takes the listed (the organizer has until the start to pay)
    const late = g.at + 5 * MIN;
    const held = await info(g, late, g.h); expect(held.locked).toBe(true); expect(held.unpaid).toBe(true);
    const refused = await joinId(g, "B2202", 2, {}, late); // an unlisted person wanting in after the lock
    expect([403]).toContain(refused.status); expect(["locked", "waiting"]).toContain((await j(refused)).code);
    const v = await payGame(g, late);
    expect(v.paid ?? v.ok ?? true).toBeTruthy();
    const open = await info(g, late, g.h); expect(open.locked).toBeFalsy(); expect(open.unpaid).toBeFalsy();
    expect(row(g.id).pack).toBeGreaterThan(0);
  });
  test("start: " + (f.startMode === "auto" ? "automatic: the first number is due 2 minutes after the scheduled time, with no press" : "by hand: no number before the Organizer presses Start; Start before the time is refused; a stranger cannot press it; a second Start changes nothing"), async () => {
    const g = await newGame(f); await seat(g, 2);
    const e = row(g.id);
    if (f.startMode === "auto") {
      const first = await startGame(g);
      if (f.callMode === "auto") expect(first).toBe(g.at + 120_000);
      else expect((await callLog(g, 1)).log.length).toBe(0); // the Host has not pressed Next: still no number
      return;
    }
    const { callTimeMs } = await import("../../src/lifecycle");
    expect(await callTimeMs(W.env as any, e, 1, 0)).toBeNull(); // nothing is ever called before Start
    const early = await press(g, "go", g.at - 60_000, undefined, {}); expect(early.status).toBeGreaterThanOrEqual(400); // not before the scheduled time
    const stranger = await call("POST", `/api/z/${g.id}/control`, { message: { action: "go", forged: true } }, {}, g.at + 60_000);
    expect(stranger.status).toBeGreaterThanOrEqual(400);
    const wrongKey = await press(g, "go", g.at + 60_000, "33".repeat(32)); expect(wrongKey.status).toBeGreaterThanOrEqual(400); // signed with a key the game does not know
    expect(await callTimeMs(W.env as any, row(g.id), 1, 0)).toBeNull();
    const ok = await press(g, "go", g.at + 60_000); expect(ok.status).toBe(200);
    const first = await callTimeMs(W.env as any, row(g.id), 1, 0);
    if (f.callMode === "auto") { expect(first).toBeGreaterThan(g.at + 60_000); await press(g, "go", g.at + 90_000); expect(await callTimeMs(W.env as any, row(g.id), 1, 0)).toBe(first); } // a second Start does not move it
    else { expect(first).toBeNull(); expect((await callLog(g, 1)).log.length).toBe(0); }
  });
  test("organizer calls the numbers: " + (f.callMode === "host" ? "no number until Next is pressed; each press calls exactly one number; 90 presses call all 90; the 91st is ignored" : "the game calls by itself at the chosen speed, and a Next press is refused"), async () => {
    const g = await newGame(f); await seat(g, 2);
    const first = await startGame(g);
    const { callTimeMs } = await import("../../src/lifecycle");
    if (f.callMode === "auto") {
      const t0 = await callTimeMs(W.env as any, row(g.id), 1, 0), t1 = await callTimeMs(W.env as any, row(g.id), 1, 1);
      expect(t1! - t0!).toBe(12_000); // the chosen speed
      const nx = await press(g, "next", first + 60_000); expect(nx.status).toBeGreaterThanOrEqual(400);
      return;
    }
    expect(await callTimeMs(W.env as any, row(g.id), 1, 0)).toBeNull();
    const t = await (await import("./harness")).pressNext(g, 3, Math.max(first, g.at + 60_000), 20_000);
    expect((await callLog(g, 10)).log.length).toBe(3);
    await (await import("./harness")).pressNext(g, 87, t, 20_000);
    expect((await callLog(g, 100)).log.length).toBe(90);
    const extra = await press(g, "next", t + 87 * 20_000 + 20_000);
    expect((await callLog(g, 100)).log.length).toBe(90); // still 90: no 91st number exists
    void extra;
  });
  test("pause and resume: a pause stops the numbers, resume continues the same order, later numbers move by the length of the pause; a stranger cannot pause", async () => {
    const g = await newGame(f); await seat(g, 2);
    const first = await startGame(g);
    const { callTimeMs } = await import("../../src/lifecycle");
    let t = Math.max(first, g.at + 60_000);
    if (f.callMode === "host") t = await (await import("./harness")).pressNext(g, 10, t, 20_000);
    const before = (await callLog(g, 40)).log;
    const forged = await call("POST", `/api/z/${g.id}/control`, { message: { action: "pause", forged: true } }, {}, t); expect(forged.status).toBeGreaterThanOrEqual(400);
    const pz = await press(g, "pause", t, undefined, { pauseForRounds: 100 }); expect(pz.status).toBe(200);
    expect((await control(g, t)).messages.map((m: any) => m.action)).toContain("pause");
    const rs = await press(g, "resume", t + 120_000); expect(rs.status).toBe(200);
    expect((await control(g, t + 120_000)).messages.map((m: any) => m.action)).toEqual(expect.arrayContaining(["pause", "resume"]));
    const after = (await callLog(g, 40)).log;
    const pausedRound = (await control(g, t + 120_000)).messages.find((m: any) => m.action === "pause").atBeaconRound as number;
    const { rounds } = await callLog(g, 40); const m = rounds.filter((r) => r < pausedRound).length;
    expect(after.slice(0, m)).toEqual(before.slice(0, m)); // numbers called before the pause never change; the order carries on from there
    expect(new Set(after).size).toBe(after.length); // and still no number twice
    if (f.callMode === "auto") { // later numbers moved by the pause
      const plain = g.at + 120_000 + 30 * 12_000;
      expect(await callTimeMs(W.env as any, row(g.id), 1, 30)).toBeGreaterThan(plain);
    }
    void callTimeMs;
  });
});
