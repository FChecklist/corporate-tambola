// The first-run journey of an Organizer, end to end through the real Worker code: sign-up with a mailed code -> build -> publish -> pay -> guests join -> play and win
// -> the report mail -> the 20-hour deletion -> the 365-day deletion. The clock after the game is driven ONLY by ordinary requests (the lazy tick), so this also proves the
// promise holds when the scheduler never runs. No browser; the real-Chrome version of the same journey is tools/sim2 (S02 and S06).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fullDeleteAt, endBoundMs, lifecycleTick, PURGE_AFTER_MS } from "../src/lifecycle";
import { lazyTickReset, purgeOld } from "../src/worker";
import { sentReports } from "../src/pay";
import { settleByPhones } from "./settle";
import { HOUR, MIN, T, W, call, callRaw, capture, checkout, j, join, keyH, mails, one, q, reset, restore, roundMs, startIn, verify } from "./param-harness";

beforeEach(() => { reset(); lazyTickReset(); sentReports.length = 0; });
afterEach(restore);

describe("the first game of a new Organizer", () => {
  test("sign-up code -> game -> publish -> pay -> play -> report -> deletion, with no scheduler at all", async () => {
    // 1. sign-up: a first visit opens the console at once; a second visit by the same address needs the mailed code
    const email = "newbie@acme.com";
    const first = await j(await call("POST", "/api/start", { email }, { "cf-connecting-ip": "3.3.3.3" })); expect(first.token).toMatch(/^ctk_/);
    expect((await j(await call("POST", "/api/start", { email }, { "cf-connecting-ip": "3.3.3.4" }))).exists).toBe(true);
    expect((await call("POST", "/api/auth/email", { email })).status).toBe(200);
    const code = mails(email).filter((m) => /code|sign/i.test(m.subject)).pop()!.body.match(/\b\d{6}\b/)![0];
    const signed = await j(await call("POST", "/api/auth/verify", { email, code })); expect(signed.token).toMatch(/^ctk_/);
    const h = keyH(signed.token);
    // 2. build: name, size, two rounds, prizes, a brand and one lucky draw; a draft nobody can see yet
    const id = "FIRST-RUN";
    const built = await call("POST", "/api/z", {
      id, startRound: startIn(3 * HOUR), callSeconds: 6, cap: 100, name: "Annual Day", rounds: 2, tickets: 1,
      rewards: [{ pattern: "early5", ordinal: 1, text: "Mug" }, { pattern: "top", ordinal: 1, text: "Pen" }, { pattern: "full", ordinal: 1, text: "Hamper" }],
      brand: { name: "Acme", color: "#0B3D91" }, breaks: [{ after: 40, seconds: 60, kind: "lucky", title: "Lucky draw", winners: 3 }],
    }, h);
    expect(built.status).toBe(200);
    expect((await call("GET", `/api/z/${id}/info`)).status).toBe(403); // a draft is not open to guests
    // 3. publish with the organizer's own e-mail and mobile number, then pay
    expect((await call("POST", `/api/z/${id}/publish`, { email, phone: "98765 43210" }, h)).status).toBe(200);
    const info = await j(await call("GET", `/api/z/${id}/info`)); expect(info.name).toBe("Annual Day");
    const c = await checkout(signed.token, { eid: id, email }); expect(c.status).toBe(200); capture(c.body, "pay_first");
    const v = await j(await verify(c.body, "pay_first")); expect(v.ok).toBe(true);
    const invoice = await (await call("GET", v.invoiceUrl)).text(); expect(invoice).toContain("IT Services by Rajat Agarwal"); expect(invoice).toContain("2,399");
    // 4. guests join from their phones
    for (let i = 1; i <= 6; i++) expect((await join(id, i, { name: "Guest " + i }, T + MIN)).status).toBe(200);
    const pids = q("SELECT pid FROM seat ORDER BY seq").map((r) => r.pid as string);
    expect(pids.length).toBe(6);
    // 5. play and win: several phones report the same winners; a person cannot choose them
    const start = roundMs(one("SELECT start_round s FROM engagement WHERE id=?", id).s);
    const seats = await j(await call("GET", `/api/z/${id}/seats`, undefined, {}, start + 3 * MIN)); expect(seats.ready).toBe(true); expect(seats.seats.length).toBe(6);
    expect((await call("POST", `/api/z/${id}/settle`, { results: [] }, h, start + 10 * MIN)).status).toBe(403);
    await settleByPhones(call, id, [{ pattern: "early5", idx: 9, pids: [pids[1]!] }, { pattern: "top", idx: 30, pids: [pids[2]!] }], pids.slice(0, 5), start + 20 * MIN);
    expect(q("SELECT pattern FROM winner ORDER BY pattern").map((r) => r.pattern)).toEqual(["early5", "top"]);
    // 6. after the game, only ordinary requests arrive (a guest opening a page, the big screen polling): each may run the housekeeping
    const end = await endBoundMs(W.env as any, one("SELECT * FROM engagement WHERE id=?", id));
    const pending: Promise<unknown>[] = [];
    const traffic = async (at: number) => { await callRaw("GET", "/api/mode", undefined, {}, at, (p) => { pending.push(p); }); await Promise.all(pending.splice(0)); };
    for (let k = 0; k < 12 && !sentReports.length; k++) await traffic(end + 6 * MIN + k * 6 * MIN);
    expect(sentReports.length).toBe(1); expect(sentReports[0]!.to).toBe(email);
    const link = sentReports[0]!.text.match(/report\.html\?e=([A-Za-z0-9_-]+)&k=([0-9a-f]+)/)!;
    expect((await call("GET", `/api/report/${link[1]}?k=${link[2]}&part=base`, undefined, {}, end + 2 * HOUR)).status).toBe(200);
    expect(q("SELECT COUNT(*) c FROM participant")[0].c).toBe(6); // still there while the report can be read
    // 7. twenty hours after the end the guests' details are gone; the traffic that did it was a single ordinary request
    await traffic(end + PURGE_AFTER_MS + 6 * MIN);
    expect(q("SELECT COUNT(*) c FROM participant")[0].c).toBe(0); expect(q("SELECT COUNT(*) c FROM seat")[0].c).toBe(0);
    expect((await call("GET", `/api/report/${link[1]}?k=${link[2]}&part=base`, undefined, {}, end + PURGE_AFTER_MS + 7 * MIN)).status).toBe(404);
    expect(q("SELECT COUNT(*) c FROM winner")[0].c).toBe(2); // the winners record stays (seat, prize, round, time: no names)
    expect(JSON.stringify(q("SELECT * FROM winner"))).not.toMatch(/Guest|98765/);
    expect(mails(email).filter((m) => /deleted|erased/i.test(m.subject)).length).toBe(1);
    expect((await call("GET", v.invoiceUrl)).status).toBe(200); // billing records stay
    // 8. after 365 days the game goes at 00:00 IST; payment and invoice remain for the books
    await purgeOld(W.env as any, fullDeleteAt(end) + HOUR);
    expect(one("SELECT COUNT(*) c FROM engagement WHERE id=?", id).c).toBe(0);
    expect(one("SELECT COUNT(*) c FROM invoice").c).toBe(1); expect(one("SELECT COUNT(*) c FROM payment").c).toBeGreaterThan(0);
    expect(one("SELECT COUNT(*) c FROM winner").c).toBe(0);
  });

  test("an Organizer who never pays: the game never begins, the guests' details go 20 hours after the intended end, nobody is charged", async () => {
    const o = await j(await call("POST", "/api/start", { email: "nopay@acme.com" }, { "cf-connecting-ip": "3.3.3.9" })); const h = keyH(o.token);
    await call("POST", "/api/z", { id: "NO-PAY", startRound: startIn(2 * HOUR), callSeconds: 6, cap: 100 }, h);
    await call("POST", "/api/z/NO-PAY/publish", { email: "nopay@acme.com", phone: "9876543210" }, h);
    expect((await join("NO-PAY", 1, {}, T)).status).toBe(200);
    const start = roundMs(one("SELECT start_round s FROM engagement WHERE id=?", "NO-PAY").s);
    expect((await j(await call("GET", `/api/z/NO-PAY/control`, undefined, {}, start - 10_000))).locked).toBe(true); // held, not begun
    const end = await endBoundMs(W.env as any, one("SELECT * FROM engagement WHERE id=?", "NO-PAY"));
    await lifecycleTick(W.env as any, end + PURGE_AFTER_MS + 5 * MIN);
    expect(q("SELECT COUNT(*) c FROM participant")[0].c).toBe(0);
    expect(one("SELECT COUNT(*) c FROM payment").c).toBe(0); expect(one("SELECT COUNT(*) c FROM invoice").c).toBe(0);
    expect((await j(await call("GET", `/api/z/NO-PAY/info`, undefined, {}, end + PURGE_AFTER_MS + 6 * MIN))).didNotStart).toBe(true);
  });
});
