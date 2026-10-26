// Gaps found by reading the join code (docs/flow/01-join-verify-approval.md, section 5), fixed in worker.ts and pinned here, each by a test that fails on the old code:
// GAP-06 a NEW person could join after the game was over; GAP-07 a game that could not begin (unpaid, past its lock time) still seated new people;
// GAP-03 a person the organizer ADMITTED in mode "both" was asked for the (wrong) ID again for ever and stayed in "waiting";
// GAP-01 an unbound ticket (organizer pressed "send link again") was handed to a request that sent no device at all.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HOUR, T, W, call, create, dev, j, join, keyH, mob, organizer, paidGame, publish, reset, restore, roundMs, startIn, uid } from "./param-harness";

beforeEach(() => reset());
afterEach(restore);
const DAY30 = 30 * 24 * HOUR;

describe("join gaps", () => {
  test("GAP-06: after the game is over a new person is refused (403 ended), and a person who already holds a ticket still gets it back", async () => {
    const g = await paidGame({ cap: 20 });
    expect((await join(g.id, 1)).status).toBe(200);
    const late = await join(g.id, 2, {}, T + DAY30);
    expect(late.status).toBe(403); expect((await j(late)).code).toBe("ended");
    const again = await join(g.id, 1, {}, T + DAY30);
    expect(again.status).toBe(200); expect((await j(again)).again).toBe(true);
  });
  test("GAP-07: an unpaid game at its lock time seats no new person (403 locked); before the lock the same join works", async () => {
    const o = await organizer(), id = uid();
    expect((await create(o.key, id, { cap: 20 })).status).toBe(200);
    expect((await publish(o.key, id)).status).toBe(200);
    expect((await join(id, 1)).status).toBe(200);
    const locked = await join(id, 2, {}, roundMs(startIn(2 * HOUR)) - 10_000);
    expect(locked.status).toBe(403); expect((await j(locked)).code).toBe("locked");
  });
  test("GAP-03: in mode 'both' a person admitted by the organizer gets in with the ID they typed, instead of waiting for ever", async () => {
    const g = await paidGame({ cap: 20, over: { whoCanJoin: "list" } });
    expect((await call("PATCH", `/api/z/${g.id}/settings`, { verify: "both", employeesOnly: true }, keyH(g.key))).status).toBe(200);
    expect((await call("POST", `/api/z/${g.id}/people`, { people: [{ name: "Asha Rao", empId: "E1", phone: mob(1) }] }, keyH(g.key))).status).toBe(200);
    const first = await join(g.id, 1, { empId: "E2" }); // listed number, wrong ID: the organizer decides
    expect(first.status).toBe(403); expect((await j(first)).waiting).toBe(true);
    const row = (await j(await call("GET", `/api/z/${g.id}/waiting`, undefined, keyH(g.key)))).waiting[0];
    expect(row).toBeTruthy();
    expect((await call("POST", `/api/z/${g.id}/waiting/${row.id}`, { decision: "admit" }, keyH(g.key))).status).toBe(200);
    const again = await join(g.id, 1, { empId: "E2" }); // the phone sends the same request again after the yes
    expect(again.status).toBe(200); expect((await j(again)).pid).toBeTruthy();
  });
  test("GAP-J1: an Indian number that cannot be a mobile (first digit 5) is refused on join like it is in a list; real Indian and foreign numbers still join", async () => {
    const g = await paidGame({ cap: 30 });
    for (const bad of ["5876543210", "+91 5876543210", "915876543210", "05876543210"]) {
      const r = await join(g.id, 1, { phone: bad, device: dev(1) }); expect([bad, r.status]).toEqual([bad, 400]);
    }
    let i = 10;
    for (const good of ["9876543210", "+91 98765 43211", "919876543212", "09876543213", "+6591234567", "+44 7911 123456", "+2547123456789"]) {
      const r = await join(g.id, ++i, { phone: good, device: dev(i) }); expect([good, r.status]).toEqual([good, 200]);
    }
  });
  test("GAP-01: an unbound ticket is handed back only to a phone that sends its device proof (400 without it, 200 with it)", async () => {
    const g = await paidGame({ cap: 20 });
    expect((await join(g.id, 1)).status).toBe(200);
    W.raw.prepare("UPDATE seat SET dev=NULL WHERE eid=?").run(g.id); // what 'send link again' does
    const noDev = await join(g.id, 1, { device: undefined });
    expect(noDev.status).toBe(400);
    const withDev = await join(g.id, 1, { device: dev(1) });
    expect(withDev.status).toBe(200); expect((await j(withDev)).again).toBe(true);
  });
});
