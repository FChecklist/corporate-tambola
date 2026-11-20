// SMOKE 20 NOV, owner step 20: deleting the data within 24 hours. At the boundary, on every way a game can end (played, stopped, all prizes won, cancelled, never paid, abandoned by the Host),
// whatever the cron's rhythm, when the job fails half way, what stays 365 days (organizer, Host, winners, game settings, invoices) and what is gone, and a check that fails when the job is broken.
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { failOnce, reset, restore, provider, installProvider, FORMATS, newGame, seat, joinId, addIds, press, runAllNumbers, callLog, winnersOf, startGame, pressNext, row, one, q, call, j, W, T, MIN, HOUR, DAY, count, tickFor, lifecycleTick, publish, create, organizer, type Game, type Format } from "./h";
import { openText, openPii } from "../../src/pii";
import { runTick } from "../../src/worker";
import { fullDeleteAt, personalDeleteAt, erasePersonal, realEndMs } from "../../src/lifecycle";
setDefaultTimeout(300_000);
beforeEach(() => { reset(); installProvider(); }); afterEach(restore);

async function everything(): Promise<string> {
  const parts: string[] = [];
  for (const t of q("SELECT name FROM sqlite_master WHERE type='table'").map((r: any) => r.name as string)) for (const r of q(`SELECT * FROM ${t}`)) for (const v of Object.values(r)) { if (typeof v !== "string") continue; parts.push(v); const o = await openText(W.env as any, v); if (o) parts.push(o); }
  return parts.join("\n");
}
const word = (all: string, id: string) => new RegExp(`(^|[^A-Za-z0-9+/_=-])${id.replace(/[-]/g, "\\-")}($|[^A-Za-z0-9+/_=-])`).test(all);
const endOf = (g: Game) => Number(one("SELECT end_ms FROM life WHERE eid=?", g.id).end_ms);
const purgedAt = (g: Game) => one("SELECT purged_ms FROM life WHERE eid=?", g.id)?.purged_ms as number | null;
async function played(g: Game, n = 5) {
  const pids = await seat(g, n); await joinId(g, "WAIT-77", 900); const last = await runAllNumbers(g);
  const { log } = await callLog(g); const res = winnersOf(g, pids, log).map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, round: 1, idx: x.idx, pids: x.pids }));
  for (const pid of pids) for (let i = 0; i < res.length; i += 3) await call("POST", `/api/z/${g.id}/vote`, { pid, results: res.slice(i, i + 3) }, {}, last + MIN);
  return { pids, last };
}
const personalLeft = (g: Game) => ["participant", "seat", "person", "waiting", "claim", "settled", "rvote", "rcand", "overvote", "bogey"].reduce((s, t) => s + count(`SELECT COUNT(*) AS c FROM ${t} WHERE eid=?`, g.id), 0);

describe("S20-A timing: the deletion happens within 24 hours of the game's end, whatever the cron's rhythm", () => {
  for (const f of FORMATS) for (const period of [MIN, 15 * MIN, HOUR, 3 * HOUR]) test(`[${f.key}] the job wakes every ${period / MIN} min: erased at the first wake at or after end + 20 h, never later than end + 24 h, and not before 20 h`, async () => {
    const g = await newGame(f); const { last } = await played(g, 4); await tickFor(last + 5 * MIN, 12);
    const stored = endOf(g); const end = (await realEndMs(W.env as any, row(g.id), stored + HOUR))!; // the moment the game REALLY ended (all prizes awarded); the 24 hours count from it
    expect(end).toBeLessThanOrEqual(stored);
    let t = end + 10 * MIN + (period === 3 * HOUR ? 7 * MIN : 0);
    let first: number | null = null;
    for (let i = 0; i < Math.ceil((26 * HOUR) / period); i++, t += period) { await lifecycleTick(W.env as any, t); if (first === null && personalLeft(g) === 0) first = t; if (t < end + 20 * HOUR) expect(personalLeft(g)).toBeGreaterThan(0); }
    expect(first).not.toBeNull(); expect(first!).toBeGreaterThanOrEqual(end + 20 * HOUR); expect(first!).toBeLessThanOrEqual(end + 24 * HOUR);
    expect(purgedAt(g)!).toBeLessThanOrEqual(end + 24 * HOUR);
  });
});
describe("S20-B the ways a game can end", () => {
  for (const f of FORMATS) {
    test(`[${f.key}] the Organizer ends the game early (Stop): the 20 hours count from the Stop, not from the scheduled end`, async () => {
      const g = await newGame(f); const pids = await seat(g, 3); const first = await startGame(g);
      let t = Math.max(first, g.at + 60_000); if (f.callMode === "host") t = await pressNext(g, 20, t, 20_000); else t += 5 * MIN;
      const st = await press(g, "stop", t + 10_000); expect(st.status).toBe(200);
      const stopAt = Number(new Date(t + 10_000 + 120_000).getTime());
      for (let k = 0; k < 30; k++) await lifecycleTick(W.env as any, t + 15 * MIN + k * MIN);
      const end = endOf(g); expect(end).toBeLessThan(t + 30 * MIN); // ended at the Stop, not 18 minutes later
      await lifecycleTick(W.env as any, end + 20 * HOUR + 5 * MIN); expect(personalLeft(g)).toBe(0); void pids; void stopAt;
    });
    test(`[${f.key}] a Host who stops pressing after number 30 and walks away: the data is erased within 24 hours of the LAST number`, async () => {
      if (f.callMode !== "host") return;
      const g = await newGame(f); await seat(g, 3); const first = await startGame(g); let t = Math.max(first, g.at + 60_000); t = await pressNext(g, 30, t, 20_000);
      const lastPress = t - 20_000;
      let first0: number | null = null;
      for (let h = 0; h < 30; h++) { await lifecycleTick(W.env as any, lastPress + h * HOUR + 3 * MIN); if (first0 === null && personalLeft(g) === 0) first0 = lastPress + h * HOUR; }
      expect(first0).not.toBeNull(); expect(first0! - lastPress).toBeLessThanOrEqual(24 * HOUR);
    });
  }
});
describe("S20-C a game that never ran", () => {
  for (const f of FORMATS) {
    test(`[${f.key}] never paid: its people and IDs are erased 20 h after it was meant to end, it is closed, and the organizer gets one 'did not start' mail`, async () => {
      const g = await newGame(f, { pay: false }); await addIds(g, ["U1", "U2"]); await joinId(g, "U1", 1); await joinId(g, "U9", 9);
      for (let t = g.at; t < g.at + 50 * HOUR; t += HOUR) { await lifecycleTick(W.env as any, t); if (personalLeft(g) === 0) { if (f.startMode === "auto") expect(t).toBeLessThanOrEqual(g.at + 30 * HOUR); break; } }
      expect(personalLeft(g)).toBe(0);
      expect(provider.delivered.filter((m) => /did not start/i.test(m.subject) && m.text.includes(g.id)).length).toBe(1);
    });
    test(`[${f.key}] cancelled: erased 20 h after the cancel, one mail, nobody's data kept for the 365 days`, async () => {
      const g = await newGame(f); await seat(g, 3); const at = T + HOUR;
      expect((await call("POST", `/api/z/${g.id}/cancel`, { confirmations: 3 }, g.h, at)).status).toBe(200);
      for (let t = at; t < at + 26 * HOUR; t += HOUR) await lifecycleTick(W.env as any, t);
      expect(personalLeft(g)).toBe(0); expect(purgedAt(g)! - at).toBeLessThanOrEqual(24 * HOUR);
      expect(provider.delivered.filter((m) => /Your guests' personal data has been deleted/i.test(m.subject) && m.text.includes(g.id)).length).toBe(1);
    });
  }
});
describe("S20-D the job fails half way", () => {
  for (const f of FORMATS) {
    test(`[${f.key}] the database refuses the erasure once: nothing is marked as erased, the next wake finishes it, the deletion mail is sent once`, async () => {
      const g = await newGame(f); const { last } = await played(g, 4); await tickFor(last + 5 * MIN, 12); const end = endOf(g);
      const fail = failOnce(/DELETE FROM participant/);
      await lifecycleTick(W.env as any, end + 20 * HOUR + MIN);
      expect(fail.fired).toBe(true); expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBeGreaterThan(0); expect(purgedAt(g)).toBeNull();
      expect(provider.delivered.filter((m) => /personal data has been deleted/i.test(m.subject)).length).toBe(0);
      await lifecycleTick(W.env as any, end + 20 * HOUR + 2 * MIN);
      expect(personalLeft(g)).toBe(0); expect(provider.delivered.filter((m) => /personal data has been deleted/i.test(m.subject) && m.text.includes(g.id)).length).toBe(1);
    });
    test(`[${f.key}] the prize hand-over record cannot be cleaned on the first try: a later wake cleans it (the winner's ID is not kept 365 days)`, async () => {
      const g = await newGame(f); const { last } = await played(g, 4); await tickFor(last + 5 * MIN, 12); const end = endOf(g);
      const fail = failOnce(/^UPDATE prize SET pii/);
      for (let k = 0; k < 6; k++) await lifecycleTick(W.env as any, end + 20 * HOUR + (k + 1) * HOUR);
      expect(fail.fired).toBe(true); // the failure really happened
      let withId = 0; for (const r of q("SELECT pii, orig FROM prize WHERE eid=?", g.id)) for (const s of [r.pii, r.orig]) if ((await openPii(W.env as any, s))?.empId) withId++;
      expect(withId).toBe(0);
    });
  }
});
describe("S20-E what stays 365 days and what goes", () => {
  for (const f of FORMATS) test(`[${f.key}] after the 24 hours: organizer, Host, winners, prizes (no IDs), game settings and invoice stay; after 365 days (IST midnight) all of it goes, except invoices and payments`, async () => {
    const g = await newGame(f);
    const h = await j(await call("POST", "/api/org/host", { label: "Priya", mobile: "9822200011", email: "host@acme.com" }, g.h)); W.raw.prepare("UPDATE host_state SET verified_ms=?, mobile_ok=1").run(T); expect(h.hostKey).toBeTruthy();
    const { last } = await played(g, 5); await tickFor(last + 5 * MIN, 12); const end = endOf(g);
    await lifecycleTick(W.env as any, end + 21 * HOUR);
    expect(personalLeft(g)).toBe(0);
    expect(count("SELECT COUNT(*) AS c FROM kv WHERE k=?", `contact/${g.id}`)).toBe(1); // the organizer's confirmed details
    expect(count("SELECT COUNT(*) AS c FROM organizer_key WHERE org=? AND kind='host'", row(g.id).org)).toBeGreaterThanOrEqual(1); // the Host
    expect(count("SELECT COUNT(*) AS c FROM winner WHERE eid=?", g.id)).toBeGreaterThanOrEqual(7);
    expect(count("SELECT COUNT(*) AS c FROM prize WHERE eid=?", g.id)).toBeGreaterThanOrEqual(7);
    expect(count("SELECT COUNT(*) AS c FROM game_record WHERE eid=?", g.id)).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM invoice")).toBeGreaterThanOrEqual(1);
    const doomsday = fullDeleteAt(end);
    await runTick(W.env as any, doomsday - 1000); expect(count("SELECT COUNT(*) AS c FROM engagement WHERE id=?", g.id)).toBe(1); // one second early: all still there
    await runTick(W.env as any, doomsday + 1000);
    expect(count("SELECT COUNT(*) AS c FROM engagement WHERE id=?", g.id)).toBe(0);
    for (const t of ["winner", "prize", "life"]) expect([t, count(`SELECT COUNT(*) AS c FROM ${t} WHERE eid=?`, g.id)]).toEqual([t, 0]);
    expect(count("SELECT COUNT(*) AS c FROM kv WHERE k=?", `contact/${g.id}`)).toBe(0);
    expect(count("SELECT COUNT(*) AS c FROM invoice")).toBeGreaterThanOrEqual(1); // billing data is kept for audit and tax
    expect(count("SELECT COUNT(*) AS c FROM payment WHERE eid=? AND status='paid'", g.id)).toBeGreaterThanOrEqual(1);
    expect(count("SELECT COUNT(*) AS c FROM legal_party WHERE eid=?", g.id)).toBe(1);
  });
});
describe("S20-F nothing personal is left anywhere, in any table (sealed, hashed or clear), logs and analytics included", () => {
  for (const f of FORMATS) test(`[${f.key}] IDs, ticket ids, device ids, phone hashes and the waiting person's ID appear nowhere after the job, and the sweep sees them before`, async () => {
    const g = await newGame(f); const { last, pids } = await played(g, 6);
    const before = await everything(); expect(word(before, "P1000")).toBe(true); expect(word(before, "WAIT77")).toBe(true); // sanity: the sweep can see them
    const secrets: string[] = [...pids, ...q("SELECT phone_hash FROM participant WHERE eid=?", g.id).map((r: any) => r.phone_hash), ...q("SELECT dev FROM seat WHERE eid=? AND dev IS NOT NULL", g.id).map((r: any) => r.dev)].filter((x) => x && String(x).length >= 6);
    expect(secrets.length).toBeGreaterThan(6);
    await tickFor(last + 5 * MIN, 12); const end = endOf(g); await lifecycleTick(W.env as any, end + 21 * HOUR); await runTick(W.env as any, end + 22 * HOUR);
    const after = await everything();
    for (const id of ["P1000", "P1005", "WAIT77", "WAIT-77"]) expect([id, word(after, id)]).toEqual([id, false]);
    for (const s of secrets) expect([String(s).slice(0, 12), after.includes(String(s))]).toEqual([String(s).slice(0, 12), false]);
  });
  for (const f of FORMATS) test(`[${f.key}] the negative control: the same sweep FAILS on a game that was not erased (so a broken job cannot pass)`, async () => {
    const g = await newGame(f); const { last } = await played(g, 3); await tickFor(last + 5 * MIN, 12); const end = endOf(g);
    await lifecycleTick(W.env as any, end + 10 * HOUR); // far too early: nothing erased
    expect(personalLeft(g)).toBeGreaterThan(0); expect(word(await everything(), "P1000")).toBe(true);
    await lifecycleTick(W.env as any, end + 21 * HOUR); expect(personalLeft(g)).toBe(0);
  });
});
describe("S20-G the Organizer deletes at once (Delete in the console)", () => {
  for (const f of FORMATS) test(`[${f.key}] after the game: Delete erases everything personal at once and the organizer is told once`, async () => {
    const g = await newGame(f); const { last } = await played(g, 3); await tickFor(last + 5 * MIN, 12);
    const r = await call("POST", `/api/z/${g.id}/erase`, {}, g.h, last + 30 * MIN); expect(r.status).toBe(200);
    expect(personalLeft(g)).toBe(0);
    expect(provider.delivered.filter((m) => /deleted/i.test(m.subject) && m.text.includes(g.id)).length).toBe(1);
  });
});
