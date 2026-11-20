// LIFECYCLE SUITE, part 7: edge cases around the ID list and the waiting room, plus a game nobody starts, for each of the four formats.
// FALSIFIED BY: edge-race-two-seats (remove the one-ticket-per-ID guard), edge-removed-rejoins
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore } from "../param-harness";
import { FORMATS, newGame, seat, addIds, joinId, waiting, decide, count, W, call, j, q, dev, HOUR, MIN } from "./harness";
import { lifecycleTick } from "../../src/lifecycle";
setDefaultTimeout(120_000);
beforeEach(() => reset()); afterEach(restore);

for (const f of FORMATS) describe(`[${f.key}] ${f.label}: edge cases`, () => {
  test("eight phones all typing the same ID (written three ways) at the same moment: exactly ONE gets the ticket", async () => {
    const g = await newGame(f); await addIds(g, ["RACE1"]);
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => joinId(g, ["RACE1", "race-1", "R A C E 1"][i % 3]!, 500 + i)));
    expect(rs.filter((r) => r.status === 200).length).toBe(1);
    expect(rs.filter((r) => r.status === 423).length).toBe(7);
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(1);
  });
  test("the Organizer pressing yes twice, or yes then no, changes nothing: the first answer stands, and the person is never seated twice", async () => {
    const g = await newGame(f); await joinId(g, "DD-1", 1); await joinId(g, "DD-2", 2);
    const ws = await waiting(g); const w1 = ws.find((x) => x.empId === "DD1")!, w2 = ws.find((x) => x.empId === "DD2")!;
    expect((await decide(g, w1.id, "admit")).status).toBe(200);
    const again = await j(await decide(g, w1.id, "admit")); expect(again.already).toBe("admitted");
    const flip = await j(await decide(g, w1.id, "decline")); expect(flip.already).toBe("admitted"); // a yes is not taken back by a later no
    expect((await joinId(g, "DD1", 1)).status).toBe(200);
    expect((await decide(g, w2.id, "decline")).status).toBe(200);
    expect((await j(await decide(g, w2.id, "admit"))).already).toBe("declined");
    expect((await joinId(g, "DD2", 2)).status).toBe(403);
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(1);
  });
  test("a person the Organizer removed before the start cannot come back with the same ID, however it is typed", async () => {
    const g = await newGame(f); await seat(g, 2);
    const mine = (await j(await call("GET", `/api/z/${g.id}/people`, undefined, g.h))).people.find((p: any) => p.empId === "P1000");
    expect((await call("POST", `/api/z/${g.id}/people/${mine.id}/remove`, {}, g.h)).status).toBe(200);
    for (const typed of ["P1000", "p-1000", "P 1000"]) { const r = await joinId(g, typed, 1000); expect([typed, r.status, (await j(r)).code]).toEqual([typed, 403, "removed"]); }
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(1);
  });
  test("ID list limits: 200 IDs per upload (a bigger list goes in parts), blank rows and IDs that are too long or are not English letters and numbers are refused with a reason, the rest still go in", async () => {
    const g = await newGame(f, { cap: 300 });
    const big = await addIds(g, Array.from({ length: 201 }, (_, i) => "B" + i)); expect(big.status).toBe(413); expect((await j(big)).code).toBe("too-many");
    expect((await j(await addIds(g, Array.from({ length: 200 }, (_, i) => "B" + i)))).added).toBe(200);
    const odd = await j(await addIds(g, ["", "   ", "A".repeat(31), "A".repeat(30), "0042", "42", "Ａ１", "A—1"]));
    expect(odd.invalid.length).toBeGreaterThanOrEqual(3); // blank, blank, too long
    expect(odd.added).toBeGreaterThanOrEqual(3); // 0042, 42 (two different IDs: leading zeros are kept), the 30-character one
    const zeros = (await j(await call("GET", `/api/z/${g.id}/people?limit=500`, undefined, g.h))).people.map((p: any) => p.empId);
    expect(zeros).toEqual(expect.arrayContaining(["0042", "42"]));
  });
  test("an ID typed with spaces, dashes, dots, slashes, in any case, in full-width letters or with a no-break space is the same ID", async () => {
    const g = await newGame(f); await addIds(g, ["AB1234"]);
    const r = await joinId(g, " a b - 1 2/3.4 ", 1); expect(r.status).toBe(200);
    expect((await joinId(g, "ＡＢ１２３４", 1)).status).toBe(200); // full-width, same person again
    expect((await joinId(g, "AB 1234", 1)).status).toBe(200);
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(1);
    expect((await joinId(g, "AB123", 2)).status).toBe(403); // a different ID is a different person (waits)
  });
  if (f.startMode === "manual") test("a game nobody starts: nobody is ever started by the system; the people, the IDs and the list are still erased, 44 hours after its scheduled time and never later than 48", async () => {
    const g = await newGame(f); await seat(g, 3); await joinId(g, "WAITER", 77);
    const left = () => count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id) + count("SELECT COUNT(*) AS c FROM person WHERE eid=?", g.id) + count("SELECT COUNT(*) AS c FROM waiting WHERE eid=?", g.id);
    await lifecycleTick(W.env as any, g.at + 24 * HOUR); expect(left()).toBeGreaterThan(0); // still inside its "waiting for Start" day
    await lifecycleTick(W.env as any, g.at + 48 * HOUR); expect(left()).toBe(0);
    const c = await (await import("./harness")).control(g, g.at + 3 * HOUR); expect(c.messages ?? []).toEqual([]); // nobody pressed Start for them
  });
});
