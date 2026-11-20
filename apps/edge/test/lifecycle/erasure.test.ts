// LIFECYCLE SUITE, part 3: the erasure job. Owner rule (suite rules v1.1, 20 Nov 2026): players' data and IDs are deleted within 24 hours after the game, and the lists with them.
// Run for each of the four formats. The sweep looks at EVERY table of the database, in the clear AND inside every sealed (encrypted) value, for any ID, name, number or ID hash of the game's people.
// FALSIFIED BY: erase-keeps-prize-id (prize.pii kept the winner's ID 365 days: DEFECT LC-1, fixed in lifecycle.ts erasePersonal), erase-skips-waiting, erase-after-24h
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore, mails } from "../param-harness";
import { FORMATS, newGame, seat, addIds, joinId, waiting, decide, runAllNumbers, callLog, winnersOf, row, W, one, q, call, j, MIN, HOUR, count, type Game } from "./harness";
import { lifecycleTick, reportLink } from "../../src/lifecycle";
import { openText } from "../../src/pii";
import { empHashOf } from "../../src/people";
setDefaultTimeout(120_000);
beforeEach(() => reset()); afterEach(restore);

/** every string in every table of the database, plus what each sealed value opens to */
async function everything(): Promise<string> {
  const parts: string[] = [];
  for (const t of q("SELECT name FROM sqlite_master WHERE type='table'").map((r: any) => r.name as string)) {
    for (const r of q(`SELECT * FROM ${t}`)) for (const v of Object.values(r)) {
      if (typeof v !== "string") continue;
      parts.push(v);
      const o = await openText(W.env as any, v); if (o) parts.push(o);
    }
  }
  return parts.join("\n");
}
async function playWholeGame(g: Game, n = 8) {
  const pids = await seat(g, n);
  await joinId(g, "ZZ-9001", 900); // a stranger asks and waits
  await joinId(g, "YY-8001", 901); const [, y] = await waiting(g); void y;
  const last = await runAllNumbers(g);
  const { log } = await callLog(g);
  const res = winnersOf(g, pids, log).map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, round: 1, idx: x.idx, pids: x.pids }));
  for (const pid of pids) for (let i = 0; i < res.length; i += 3) await call("POST", `/api/z/${g.id}/vote`, { pid, results: res.slice(i, i + 3) }, {}, last + MIN);
  return { pids, last, res };
}
/** run the cron once a minute from `t0` until the report is ready (it is made in steps) */
async function tickUntilReport(g: Game, t0: number) {
  let t = t0;
  for (let i = 0; i < 10; i++, t += MIN) {
    await lifecycleTick(W.env as any, t);
    const k = new URL(await reportLink(W.env as any, g.id)).searchParams.get("k");
    const r = await call("GET", `/api/report/${g.id}?k=${k}`, undefined, {}, t);
    if (r.status === 200) return { t, k: k!, body: (await r.json()) as any };
  }
  throw new Error("the report was never made");
}

for (const f of FORMATS) describe(`[${f.key}] ${f.label}: the report, then the erasure within 24 hours`, () => {
  test("the report is made after the game; it carries IDs only (no names, no numbers); the link closes before the data goes; 20 hours after the end every ID, ticket, waiting request, list and log of the people is gone", async () => {
    const g = await newGame(f);
    const { pids, last } = await playWholeGame(g);
    const idsBefore = await everything();
    expect(idsBefore).toContain("P1000"); expect(idsBefore).toContain("ZZ9001"); // sanity: the sweep really sees the IDs while the game is on (so "gone" later means gone)
    expect(count("SELECT COUNT(*) AS c FROM waiting WHERE eid=?", g.id)).toBe(2);
    // --- the report
    const rep = await tickUntilReport(g, last + 10 * MIN);
    expect(rep.body.base.engagementId).toBe(g.id);
    expect(rep.body.base.endReason).toBeTruthy();
    expect(rep.body.base.prizes.length).toBe(7); // every house of the default prizes has its winner in the report
    expect(rep.body.totalPeople).toBe(8);
    const ppl = await j(await call("GET", `/api/report/${g.id}?k=${rep.k}&part=people&i=0`, undefined, {}, rep.t));
    expect(ppl.people.length).toBe(8);
    expect(JSON.stringify(ppl)).not.toMatch(/"phone":"[0-9+]{5,}/); // an ID game asks for no mobile number
    // --- the data stays until its time ...
    const endMs = Number(one("SELECT end_ms FROM life WHERE eid=?", g.id).end_ms);
    await lifecycleTick(W.env as any, endMs + 19 * HOUR - MIN);
    expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBe(8);
    // --- the report link closes at 19 h, before the data goes at 20 h
    await lifecycleTick(W.env as any, endMs + 19 * HOUR + MIN);
    expect((await call("GET", `/api/report/${g.id}?k=${rep.k}`, undefined, {}, endMs + 19 * HOUR + MIN)).status).toBe(404);
    expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBe(8);
    // --- ... and is gone within 24 hours after the end
    await lifecycleTick(W.env as any, endMs + 20 * HOUR + MIN);
    for (const t of ["participant", "seat", "person", "waiting", "settled", "rvote", "rcand", "claim", "overvote"]) expect([t, count(`SELECT COUNT(*) AS c FROM ${t} WHERE eid=?`, g.id)]).toEqual([t, 0]);
    expect(count("SELECT COUNT(*) AS c FROM kv WHERE k LIKE ? OR k LIKE ? OR k LIKE ?", `idx/${g.id}/%`, `idmiss/${g.id}/%`, `rpt%/${g.id}%`)).toBe(0);
    expect(Number(one("SELECT purged_ms FROM life WHERE eid=?", g.id).purged_ms)).toBeLessThan(endMs + 24 * HOUR);
    const log = await call("GET", `/api/z/${g.id}/people/log`, undefined, g.h, endMs + 21 * HOUR);
    expect((await j(log)).log ?? []).toEqual([]);
    // --- the sweep: no ID of any kind survives anywhere, in the clear, sealed or hashed
    const all = await everything();
    const ids = ["P1000", "P1001", "P1007", "ZZ9001", "ZZ-9001", "YY8001", "YY-8001"];
    for (const id of ids) expect([id, all.includes(id)]).toEqual([id, false]);
    for (const id of ["P1000", "P1007", "ZZ9001"]) { const h = await empHashOf(W.env as any, id); expect([id + " hash", all.includes(h)]).toEqual([id + " hash", false]); }
    for (const p of pids) expect([p, all.includes(p)]).toEqual([p, false]); // not even the ticket ids
  });
  test("every one of the 24 hours counts: the erasure runs at the first cron after 20 hours, never later than 24 hours after the game ended, even when the cron only wakes at the last minute", async () => {
    const g = await newGame(f);
    const { last } = await playWholeGame(g, 4);
    const rep = await tickUntilReport(g, last + 10 * MIN); void rep;
    const endMs = Number(one("SELECT end_ms FROM life WHERE eid=?", g.id).end_ms);
    await lifecycleTick(W.env as any, endMs + 24 * HOUR - MIN); // one minute before the 24 hours are up: the job has run
    expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBe(0);
    expect(count("SELECT COUNT(*) AS c FROM person WHERE eid=?", g.id)).toBe(0);
  });
  test("a person who is waiting at the end of the game (never answered) is erased with the rest, and so is a declined one", async () => {
    const g = await newGame(f); await addIds(g, ["A1"]);
    await joinId(g, "WAIT-1", 1); await joinId(g, "NO-1", 2);
    const no = (await waiting(g)).find((x) => x.empId === "NO1"); await decide(g, no.id, "decline");
    expect(count("SELECT COUNT(*) AS c FROM waiting WHERE eid=?", g.id)).toBe(2);
    const { erasePersonal } = await import("../../src/lifecycle");
    await erasePersonal(W.env as any, g.id, 1, "test");
    expect(count("SELECT COUNT(*) AS c FROM waiting WHERE eid=?", g.id)).toBe(0);
    expect(await everything()).not.toMatch(/WAIT1|NO1|WAIT-1/);
  });
});
