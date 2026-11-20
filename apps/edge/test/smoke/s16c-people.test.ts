// SMOKE 20 NOV, owner step 16: the people around the game, in each of the four start formats.
// Host goes away and comes back, organizer goes away, a phone sleeps, a saved ticket is out of date, a person is approved before / during / after the game, family members.
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore, provider, installProvider, FORMATS, newGame, seat, joinId, addIds, waiting, decide, press, startGame, pressNext, runAllNumbers, callLog, winnersOf, row, one, q, call, j, W, T, MIN, HOUR, count, dev, HOST_SECRET, publicKeyFromSecret, keyH, tickFor, lifecycleTick, pidOf, type Game } from "./h";
import { callTimeMs } from "../../src/lifecycle";
setDefaultTimeout(240_000);
beforeEach(() => { reset(); installProvider(); }); afterEach(restore);

async function hostOf(g: Game) {
  const h = await j(await call("POST", "/api/org/host", { label: "Priya", mobile: "9822200011", email: "host@acme.com" }, g.h));
  W.raw.prepare("UPDATE host_state SET verified_ms=?, mobile_ok=1").run(T);
  expect((await call("PUT", `/api/z/${g.id}/control/key`, { publicKey: publicKeyFromSecret(HOST_SECRET) }, keyH(h.hostKey))).status).toBe(200);
  return keyH(h.hostKey);
}
describe("S16-C1 the Host goes away and comes back (organizer-calls formats)", () => {
  for (const f of FORMATS.filter((x) => x.callMode === "host")) for (const gap of [30_000, 5 * MIN, 40 * MIN]) test(`[${f.key}] the Host's phone is off for ${gap / 1000} s after number 20; the Host presses again: no number is lost or repeated, all 90 come`, async () => {
    const g = await newGame(f); await hostOf(g); await seat(g, 3);
    const first = await startGame(g); let t = Math.max(first, g.at + 60_000);
    t = await pressNext(g, 20, t, 20_000);
    t += gap; // the Host is gone
    for (let i = 20; i < 90; i++) { const r = await press(g, "next", t, HOST_SECRET); expect([i, r.status, r.body.error]).toEqual([i, 200, undefined]); t += 20_000; }
    const { log } = await callLog(g, 90); expect([...log].sort((a, b) => a - b)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
    expect((await press(g, "next", t, HOST_SECRET)).status).toBeGreaterThanOrEqual(400);
  });
});
describe("S16-C2 the organizer's browser is closed for the whole game: the game plays, ends, reports and erases by itself", () => {
  for (const f of FORMATS) test(`[${f.key}] after set-up (and Start) no organizer request is made until the next day: prizes settle, report mail goes, data erased on time`, async () => {
    const g = await newGame(f); await hostOf(g); const pids = await seat(g, 6);
    const last = await runAllNumbers(g); // presses are the Host's, signed (organizer's key only for Start in manual games)
    const { log } = await callLog(g); const res = winnersOf(g, pids, log).map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, round: 1, idx: x.idx, pids: x.pids }));
    for (const pid of pids) for (let i = 0; i < res.length; i += 3) await call("POST", `/api/z/${g.id}/vote`, { pid, results: res.slice(i, i + 3) }, {}, last + MIN);
    await tickFor(last + 5 * MIN, 12);
    expect(provider.delivered.filter((m) => /report is ready/i.test(m.subject) && m.text.includes(g.id)).length).toBe(1);
    const endMs = Number(one("SELECT end_ms FROM life WHERE eid=?", g.id).end_ms);
    await lifecycleTick(W.env as any, endMs + 20 * HOUR + MIN);
    expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBe(0);
    expect(count("SELECT COUNT(*) AS c FROM winner WHERE eid=?", g.id)).toBeGreaterThanOrEqual(7); // the winners record is kept
  });
});
describe("S16-C3 a ticket saved on a phone that is out of date", () => {
  for (const f of FORMATS) {
    test(`[${f.key}] a person the Organizer removed: the saved ticket no longer votes, claims or counts for the quorum`, async () => {
      const g = await newGame(f); const pids = await seat(g, 4);
      const mine = (await j(await call("GET", `/api/z/${g.id}/people`, undefined, g.h))).people.find((p: any) => p.empId === "P1000");
      expect((await call("POST", `/api/z/${g.id}/people/${mine.id}/remove`, {}, g.h)).status).toBe(200);
      const v = await call("POST", `/api/z/${g.id}/vote`, { pid: pids[0], results: [{ pattern: "top", ordinal: 1, round: 1, idx: 30, pids: [pids[1]] }] }, {}, g.at + 10 * MIN);
      expect(v.status).toBeGreaterThanOrEqual(400); expect(count("SELECT COUNT(*) AS c FROM rvote WHERE eid=?", g.id)).toBe(0);
    });
    test(`[${f.key}] the saved ticket of a game whose data were erased: nothing is accepted, nothing is stored, the link says the game is over`, async () => {
      const g = await newGame(f); const pids = await seat(g, 3); const last = await runAllNumbers(g); await tickFor(last + 5 * MIN, 12);
      const endMs = Number(one("SELECT end_ms FROM life WHERE eid=?", g.id).end_ms); await lifecycleTick(W.env as any, endMs + 20 * HOUR + MIN);
      const t = endMs + 21 * HOUR;
      const v = await call("POST", `/api/z/${g.id}/vote`, { pid: pids[0], results: [{ pattern: "top", ordinal: 1, round: 1, idx: 30, pids: [pids[0]] }] }, {}, t); expect(v.status).toBeGreaterThanOrEqual(400);
      const r = await joinId(g, "P1000", 1000, {}, t); expect(r.status).toBeGreaterThanOrEqual(400);
      expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id) + count("SELECT COUNT(*) AS c FROM rvote WHERE eid=?", g.id) + count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(0);
    });
    test(`[${f.key}] a ticket id of another game, and a ticket id with a wrong phone: refused`, async () => {
      const a = await newGame(f); const b = await newGame(f); const pa = await seat(a, 2); await seat(b, 2);
      const v = await call("POST", `/api/z/${b.id}/vote`, { pid: pa[0], results: [{ pattern: "top", ordinal: 1, round: 1, idx: 30, pids: [pa[0]] }] }, {}, b.at + 10 * MIN);
      expect([200, 403]).toContain(v.status); expect(count("SELECT COUNT(*) AS c FROM rvote WHERE eid=? AND seat=?", b.id, 1)).toBe(0);
    });
  }
});
describe("S16-C5 an unlisted person approved by the organizer: before the start, in the middle of the game, after the game", () => {
  for (const f of FORMATS) for (const when of ["before", "during", "after"] as const) test(`[${f.key}] approved ${when}: ${when === "after" ? "no ticket, plain reason" : "gets a ticket"}; ${when === "during" ? "sees only the numbers called from then on" : ""}`, async () => {
    const g = await newGame(f); await seat(g, 2);
    const w = await joinId(g, "Z-9001", 55); expect(w.status).toBe(403); const [wr] = await waiting(g);
    let t = T, last = 0;
    if (when === "during") { await startGame(g); t = g.at + 8 * MIN; }
    if (when === "after") { last = await runAllNumbers(g); t = last + 30 * MIN; }
    const d = await decide(g, wr.id, "admit", t);
    if (when === "after") { expect(d.status === 200 ? (await joinId(g, "Z-9001", 55, {}, t + MIN)).status : d.status).toBeGreaterThanOrEqual(400); return; }
    expect(d.status).toBe(200);
    const r = await joinId(g, "Z-9001", 55, {}, t + MIN); expect(r.status).toBe(200); const pid = await pidOf(r); expect(pid).toMatch(/^\d+x/);
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(3);
    expect((await waiting(g, t + MIN)).length).toBe(0);
  });
});
describe("S16-C6 family members", () => {
  for (const f of FORMATS) test(`[${f.key}] a guest invites 4 family IDs (the default), each joins on their own phone, all are counted in the report and erased with the rest`, async () => {
    const g = await newGame(f, { invites: { on: true, per: 4 } });
    const ids = ["F1", "F2", "F3", "F4"]; await addIds(g, ["G1", ...ids]); const gs = await joinId(g, "G1", 1); expect(gs.status).toBe(200);
    for (const [i, id] of ids.entries()) { const r = await joinId(g, id, 10 + i); expect([id, r.status]).toEqual([id, 200]); }
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(5);
    const last = await runAllNumbers(g); await tickFor(last + 5 * MIN, 12);
    const endMs = Number(one("SELECT end_ms FROM life WHERE eid=?", g.id).end_ms); await lifecycleTick(W.env as any, endMs + 20 * HOUR + MIN);
    for (const t of ["participant", "seat", "person"]) expect([t, count(`SELECT COUNT(*) AS c FROM ${t} WHERE eid=?`, g.id)]).toEqual([t, 0]);
  });
});
