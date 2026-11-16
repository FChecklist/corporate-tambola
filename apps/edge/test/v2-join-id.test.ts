// V2 item 12 (G13): players join with an Employee/Associate/Vendor/Member ID only: no mobile number asked, none stored, no e-mail, and the privacy promise stands (all participant data deleted within 24 hours after the game).
// This is already how a game set to "ID" works; these tests pin it so it cannot drift, and prove nothing in V2 asks for more.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HOUR, T, W, call, j, keyH, paidGame, q, reset, restore, dev } from "./param-harness";
import { erasePersonal } from "../src/lifecycle";
import { openPii } from "../src/pii";

beforeEach(() => reset());
afterEach(restore);

const idJoin = (id: string, i: number, extra: Record<string, unknown> = {}) => call("POST", `/api/z/${id}/join`, { empId: "E" + (1000 + i), device: dev(i), ...extra });
/** The organizer's guest list holds IDs only (no mobile numbers); then those people join with their ID alone. */
async function idGame(n = 5) {
  const g = await paidGame({ over: { verify: "id", whoCanJoin: "list" } });
  const r = await call("POST", `/api/z/${g.id}/people`, { people: Array.from({ length: n }, (_, i) => ({ name: "Guest " + (i + 1), empId: "E" + (1001 + i) })) }, keyH(g.key));
  expect(r.status).toBeLessThan(300); return g;
}

describe("join with an ID only", () => {
  test("no mobile number and no e-mail is asked for, sent or stored; a ticket is given", async () => {
    const g = await idGame();
    const info = await j(await call("GET", `/api/z/${g.id}/info`, undefined, keyH(g.key))); expect(info.verify).toBe("id");
    const r = await idJoin(g.id, 1); const b = await j(r); expect(r.status).toBe(200); expect(b.error).toBeUndefined();
    const t = JSON.stringify(b); expect(t).not.toMatch(/mobile|phone|e-?mail/i);
    const p: any = q("SELECT * FROM participant WHERE eid=?", g.id)[0]; expect(p).toBeTruthy();
    const pi = await openPii(W.env as any, p.pii);
    expect(String(pi?.phone ?? "")).not.toMatch(/\d{10}/); expect(JSON.stringify(pi)).not.toContain("@");
    expect(String(pi?.empId ?? "").toUpperCase()).toBe("E1001");
    expect(p.name).toBeNull(); // the readable columns carry no name either: everything personal is in the sealed copy that is deleted at 24 hours
  });
  test("the same ID cannot take two tickets; a different person's ID gets their own", async () => {
    const g = await idGame();
    const a = await j(await idJoin(g.id, 3)); const a2r = await idJoin(g.id, 3); const a2 = await j(a2r); const b = await idJoin(g.id, 4);
    expect(a.error).toBeUndefined(); expect(a2r.status).toBe(200); expect(a2.pid).toBe(a.pid); expect(a.pid).toBeTruthy(); expect(b.status).toBe(200); // the same person coming back gets the SAME ticket, never a second one
    expect(q("SELECT COUNT(*) AS n FROM seat WHERE eid=?", g.id)[0].n).toBe(2);
  });
  test("an ID game asks for no mobile in its own words: the page text says ID", async () => {
    const g = await idGame();
    const r = await call("GET", `/api/z/${g.id}/info`); const b = await j(r);
    expect(b.verify).toBe("id"); expect(JSON.stringify(b)).not.toMatch(/Type your mobile/i);
  });
  test("everything about the player is deleted within 24 hours after the game", async () => {
    const g = await idGame(); await idJoin(g.id, 5);
    expect(q("SELECT COUNT(*) AS n FROM participant WHERE eid=?", g.id)[0].n).toBe(1);
    await erasePersonal(W.env as any, g.id, T + 20 * HOUR, "retention");
    for (const t of ["participant", "seat", "person"]) expect(q(`SELECT COUNT(*) AS n FROM ${t} WHERE eid=?`, g.id)[0].n, t).toBe(0);
  });
});

describe("V2 adds no personal data to a game", () => {
  test("the V2 tables hold no name, mobile or e-mail column", () => {
    const cols = ["v2_cert", "v2_claim_review", "v2_flag", "v2_handover", "v2_notice"].flatMap((t) => (W.raw.prepare(`PRAGMA table_info(${t})`).all() as any[]).map((c) => `${t}.${c.name}`));
    for (const c of cols) expect(c, c).not.toMatch(/name$|mobile|phone|email|\.pii/); // handover has a 'label', claim review a reason: neither is a person's contact detail
  });
});
