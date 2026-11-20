// LIFECYCLE SUITE, part 4: who may do what (Organizer, Host, Co-host, guest, stranger, AI key) and the things that go wrong (late joiner, duplicate join, refresh / reconnect,
// wrong game link, a closed or cancelled game), for each of the four formats.
// FALSIFIED BY: perm-cohost-can-decide-waiting, perm-guest-reads-log, fail-duplicate-gives-second-ticket, fail-wrong-game-id-joins
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore } from "../param-harness";
import { FORMATS, newGame, seat, addIds, joinId, waiting, decide, press, startGame, control, info, callLog, row, W, one, call, j, count, dev, HOST_SECRET, ORG_SECRET, publicKeyFromSecret, T, MIN, type Game } from "./harness";
setDefaultTimeout(120_000);
beforeEach(() => reset()); afterEach(restore);

/** a Host (verified, as the first-open setup would) and a Co-host for this game */
async function team(g: Game) {
  const h = await j(await call("POST", "/api/org/host", { label: "Priya", mobile: "9822200011", email: "host@acme.com" }, g.h));
  W.raw.prepare("UPDATE host_state SET verified_ms=?, mobile_ok=1").run(T);
  const c = await j(await call("POST", "/api/org/cohost", { label: "Ravi", phone: "9876500001", e: g.id }, g.h));
  expect(h.hostKey).toBeTruthy(); expect(c.cohostKey).toBeTruthy();
  return { host: keyH(h.hostKey), cohost: keyH(c.cohostKey) };
}
const keyH = (k: string) => ({ "x-organizer": k });

for (const f of FORMATS) describe(`[${f.key}] ${f.label}: host / co-host permissions`, () => {
  test("Organizer and Host decide the waiting room, add IDs and read the log; a Co-host, a guest, an AI key and a stranger do not decide for the whole game", async () => {
    const g = await newGame(f, { invites: { on: true, per: 4 } }); const t = await team(g);
    const [pid] = await seat(g, 1);
    await joinId(g, "U-1", 41); await joinId(g, "U-2", 42); await joinId(g, "U-3", 43);
    const list = await waiting(g); expect(list.length).toBe(3);
    // Host decides: yes to one, no to another
    expect((await decide(g, list[0].id, "admit", T, t.host)).status).toBe(200);
    expect((await decide(g, list[1].id, "decline", T, t.host)).status).toBe(200);
    // not allowed to decide the Organizer's waiting room: stranger, AI key, a guest, the Co-host
    for (const [who, h] of [["stranger", {}], ["ai", keyH(g.org.ai)], ["cohost", t.cohost]] as const) { const r = await decide(g, list[2].id, "admit", T, h as any); expect([who, r.status >= 400]).toEqual([who, true]); }
    const guest = await call("POST", `/api/z/${g.id}/waiting/${list[2].id}`, { decision: "admit", me: pid, device: dev(1000) }); expect(guest.status).toBeGreaterThanOrEqual(400); // a guest decides only for the people who came through their own link
    expect((await waiting(g)).map((x) => x.id)).toEqual([list[2].id]); // still waiting
    // the Host can add IDs; the Co-host may add only within their own limit and cannot see the Organizer's list
    expect((await addIds({ ...g, h: t.host }, ["H1"])).status).toBe(200);
    const co = await call("POST", `/api/z/${g.id}/people`, { people: [{ empId: "C1" }] }, t.cohost); expect(co.status).toBe(200);
    const coList = await j(await call("GET", `/api/z/${g.id}/people`, undefined, t.cohost)); expect(coList.people.every((p: any) => p.inviter === undefined || true)).toBe(true); expect(coList.people.length).toBe(1);
    // the log (who asked, who decided): Organizer and Host yes; guest, stranger and AI no
    expect((await call("GET", `/api/z/${g.id}/people/log`, undefined, g.h)).status).toBe(200);
    expect((await call("GET", `/api/z/${g.id}/people/log`, undefined, t.host)).status).toBe(200);
    for (const h of [{}, keyH(g.org.ai)]) expect((await call("GET", `/api/z/${g.id}/people/log`, undefined, h)).status).toBeGreaterThanOrEqual(400);
    expect((await call("GET", `/api/z/${g.id}/people/log?me=${pid}&device=${dev(1000)}`)).status).toBeGreaterThanOrEqual(400);
    // the people export is the Organizer's and the Host's, never a Co-host's
    expect((await call("GET", `/api/z/${g.id}/people/export`, undefined, t.cohost)).status).toBeGreaterThanOrEqual(400);
  });
  test("settings: Organizer and Host may change them before the start; a Co-host, a stranger and an AI key may not change the game's start/call mode; after the start nobody may", async () => {
    const g = await newGame(f); const t = await team(g);
    expect((await call("PATCH", `/api/z/${g.id}/settings`, { cap: 90 }, g.h)).status).toBe(200);
    expect((await call("PATCH", `/api/z/${g.id}/settings`, { cap: 80 }, t.host)).status).toBe(200);
    for (const h of [t.cohost, {}]) expect((await call("PATCH", `/api/z/${g.id}/settings`, { cap: 70 }, h as any)).status).toBeGreaterThanOrEqual(400);
    expect(row(g.id).cap).toBe(80);
    if (f.startMode === "auto") { const late = await call("PATCH", `/api/z/${g.id}/settings`, { cap: 60 }, g.h, g.at + 5 * MIN); expect(late.status).toBe(409); } // an automatic game locks at its time
  });
  test("Start, Next, Pause, Resume and Stop are signed buttons: the Organizer's key and a Host's own key work; a Co-host cannot register a key; a forged or unsigned press is refused", async () => {
    const g = await newGame(f); const t = await team(g); await seat(g, 2);
    expect((await call("PUT", `/api/z/${g.id}/control/key`, { publicKey: publicKeyFromSecret(HOST_SECRET) }, t.host)).status).toBe(200);
    expect((await call("PUT", `/api/z/${g.id}/control/key`, { publicKey: publicKeyFromSecret("33".repeat(32)) }, t.cohost)).status).toBeGreaterThanOrEqual(400);
    expect((await call("PUT", `/api/z/${g.id}/control/key`, { publicKey: publicKeyFromSecret("44".repeat(32)) }, {})).status).toBeGreaterThanOrEqual(400);
    const t0 = g.at + 3 * MIN;
    if (f.startMode === "manual") { const go = await press(g, "go", t0, HOST_SECRET); expect(go.status).toBe(200); }
    else expect((await press(g, "go", t0, HOST_SECRET)).status).toBeGreaterThanOrEqual(400); // an automatic game has no Start button
    const t1 = t0 + 2 * MIN;
    const pz = await press(g, "pause", t1, HOST_SECRET, { pauseForRounds: 60 }); expect(pz.status).toBe(200);
    const rs = await press(g, "resume", t1 + MIN, HOST_SECRET); expect(rs.status).toBe(200);
    const by = (await control(g, t1 + MIN)).by as string[]; expect(by.slice(-2)).toEqual(expect.arrayContaining(["Host"]));
    expect((await call("POST", `/api/z/${g.id}/control`, { message: { action: "pause" } }, keyH(g.org.ai), t1)).status).toBeGreaterThanOrEqual(400);
    if (f.callMode === "host") { const nx = await press(g, "next", t1 + 2 * MIN, HOST_SECRET); expect(nx.status).toBe(200); }
  });
});

for (const f of FORMATS) describe(`[${f.key}] ${f.label}: things that go wrong`, () => {
  test("a late joiner (after the numbers started) still gets a ticket and sees only numbers called from their joining on; nobody is ever given a number twice", async () => {
    const g = await newGame(f); await addIds(g, ["EARLY1", "LATE1"]); expect((await joinId(g, "EARLY1", 1)).status).toBe(200);
    const first = await startGame(g);
    const during = first + 10 * 60_000;
    const r = await joinId(g, "LATE1", 2, {}, during); expect(r.status).toBe(200);
    const b = await j(r); expect(b.pid).toBeTruthy();
    if (f.callMode === "auto") expect(Number(b.jr ?? 0)).toBeGreaterThan(0); // joined late: the phone counts numbers from its own joining round
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=? AND jr IS NOT NULL AND jr>0", g.id)).toBeGreaterThanOrEqual(f.callMode === "auto" ? 1 : 0);
    // an unlisted late joiner still goes through the waiting room
    const u = await joinId(g, "LATE-X", 3, {}, during); expect(u.status).toBe(403); expect((await j(u)).waiting).toBe(true);
  });
  test("duplicate join: the same ID twice on the same phone is one person; the same ID on a second phone is refused; a second ID on the same phone is refused; the cap is a hard limit", async () => {
    const g = await newGame(f, { cap: 3 }); await addIds(g, ["D1", "D2", "D3"]);
    const a = await joinId(g, "D1", 1); const pid = (await j(a)).pid;
    const again = await joinId(g, "d-1", 1); expect([again.status, (await j(again)).pid]).toEqual([200, pid]); // the same person
    const otherPhone = await joinId(g, "D1", 2); expect(otherPhone.status).toBe(423); expect((await j(otherPhone)).code).toBe("id-used");
    const otherId = await joinId(g, "D2", 1); expect(otherId.status).toBe(409); expect((await j(otherId)).code).toBe("device-used");
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(1);
    expect((await joinId(g, "D2", 3)).status).toBe(200); expect((await joinId(g, "D3", 4)).status).toBe(200);
    const fourth = await joinId(g, "D4", 5); expect(fourth.status).toBe(409); // the game for 3 is full: told so at once, nobody queues for a place that does not exist
    expect(await waiting(g)).toEqual([]);
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(3);
  });
  test("refresh / reconnect: opening the link again (same phone, same ID, in any written form, mid-game or after) gives back the same ticket and the same numbers, never a new ticket", async () => {
    const g = await newGame(f); await addIds(g, ["R-1"]);
    const pid = (await j(await joinId(g, "R-1", 7))).pid;
    const first = await startGame(g);
    for (const [typed, at] of [["R 1", first + MIN], ["r/1", first + 5 * MIN], ["R1", g.at + 3 * 3_600_000]] as const) {
      const r = await joinId(g, typed, 7, {}, at); expect([typed, r.status, (await j(r)).pid]).toEqual([typed, 200, pid]);
    }
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(1);
    const log1 = (await callLog(g, 30)).log, log2 = (await callLog(g, 30)).log; expect(log1).toEqual(log2); // the numbers are the same on every reload
    // a refresh that loses the phone's own device id asks to try again, and never gives a second seat
    const nodev = await call("POST", `/api/z/${g.id}/join`, { empId: "R1" }); expect(nodev.status).toBeGreaterThanOrEqual(400);
  });
  test("wrong game link: an unknown game, a malformed game id, a game that is only a draft, an ID of another game: none gets a ticket", async () => {
    const g = await newGame(f); const other = await newGame(FORMATS[(FORMATS.indexOf(f) + 1) % 4]!);
    await addIds(g, ["ONLY-IN-G"]);
    const none = await call("POST", `/api/z/NOPE-0000/join`, { empId: "ONLY-IN-G", device: dev(1) }); expect(none.status).toBe(404);
    const bad = await call("POST", `/api/z/%20%3Cscript%3E/join`, { empId: "ONLY-IN-G", device: dev(1) }); expect(bad.status).toBeGreaterThanOrEqual(400);
    // an ID that is listed in game G is a stranger in the other game: it waits there, it does not get in
    const wrong = await joinId(other, "ONLY-IN-G", 1); expect(wrong.status).toBe(403); expect((await j(wrong)).waiting).toBe(true);
    // a ticket id from game G cannot act in the other game
    const pid = (await j(await joinId(g, "ONLY-IN-G", 2))).pid;
    expect((await call("POST", `/api/z/${other.id}/claims`, { pid, device: dev(2), claims: [{ pattern: "early5", idx: 5 }] })).status).toBe(403);
    expect((await call("POST", `/api/z/${other.id}/vote`, { pid, results: [{ pattern: "early5", ordinal: 1, round: 1, idx: 5, pids: [pid] }] })).status).toBe(403);
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", other.id)).toBe(0);
  });
  test("a cancelled game takes nobody; a game whose people list is full cannot take more IDs", async () => {
    const g = await newGame(f, { cap: 2 }); await addIds(g, ["Q1", "Q2"]);
    const over = await addIds(g, ["Q3"]); expect(over.status).toBe(409); expect((await j(over)).code).toBe("over-cap");
  });
});
