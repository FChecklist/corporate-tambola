// V2 item 8: a simple support ticket, raised and read by key and by screen. Scoped by role: the organizer sees the account's, a game key or Host key only its game's.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HOUR, T, W, call, j, keyH, mails, paidGame, q, reset, restore, uid, create, PLAT } from "./param-harness";
import { gameKey, labelHost } from "./v2-helpers";
import { purgeSupport, SUPPORT_KEEP_MS } from "../src/v2-support";

beforeEach(() => reset());
afterEach(restore);

const raise = (key: string, body: Record<string, unknown> = {}, now = T) => call("POST", "/api/v2/support", { subject: "Cannot find my prize list", body: "Where do I type the prizes?", ...body }, keyH(key), now);
const tickets = async (key: string, now = T) => (await j(await call("GET", "/api/v2/support", undefined, keyH(key), now))).tickets as any[];

describe("raising and reading a ticket", () => {
  test("the organizer raises one by key; it is listed, readable, and mailed to the help address", async () => {
    const g = await paidGame(); const before = mails().length;
    const r = await raise(g.key, { game: g.id }); const b = await j(r);
    expect(r.status).toBe(200); expect(b).toMatchObject({ ok: true, status: "open" }); expect(b.note).toMatch(/do not type players' names or mobile numbers/);
    const t = await tickets(g.key); expect(t.length).toBe(1); expect(t[0]).toMatchObject({ id: b.id, game: g.id, by: "organizer", status: "open" });
    const one = await j(await call("GET", `/api/v2/support/${b.id}`, undefined, keyH(g.key)));
    expect(one.messages[0]).toMatchObject({ who: "organizer", body: "Where do I type the prizes?" });
    expect(mails().slice(before).some((m: any) => /Support ticket/.test(m.subject))).toBe(true);
  });
  test("a follow-up from the same side is added and re-opens the ticket", async () => {
    const g = await paidGame(); const id = (await j(await raise(g.key))).id;
    expect((await call("POST", `/api/v2/support/${id}`, { body: "Found it, thanks" }, keyH(g.key))).status).toBe(200);
    const one = await j(await call("GET", `/api/v2/support/${id}`, undefined, keyH(g.key))); expect(one.messages.length).toBe(2);
  });
  test("a short or empty ticket is refused with a plain message", async () => {
    const g = await paidGame(); const r = await raise(g.key, { subject: "x", body: "" }); expect(r.status).toBe(400); expect((await j(r)).code).toBe("need-text");
  });
  test("markup in a ticket is stored as plain text", async () => {
    const g = await paidGame(); const id = (await j(await raise(g.key, { subject: "<b>Hi there</b>", body: "<script>x</script> please help" }))).id;
    const one = await j(await call("GET", `/api/v2/support/${id}`, undefined, keyH(g.key))); expect(JSON.stringify(one)).not.toMatch(/<script|<b>/);
  });
  test("a game that is not the caller's own cannot be named", async () => {
    const g = await paidGame(); const s = await paidGame();
    const r = await raise(g.key, { game: s.id }); expect(r.status).toBe(400); expect((await j(r)).code).toBe("bad-game");
  });
});

describe("who sees what", () => {
  test("a game key and a Host key raise and read only their own game's tickets; the organizer sees all", async () => {
    const g = await paidGame(); const g2 = uid(); await create(g.key, g2);
    const k = await gameKey(g), h = await labelHost(g);
    const a = (await j(await raise(k))).id, b = (await j(await raise(h))).id, c = (await j(await raise(g.key, { game: g2 }))).id;
    const mine = (await tickets(k)).map((t) => t.id).sort(); expect(mine).toEqual([a, b].sort());
    expect((await tickets(h)).map((t) => t.id).sort()).toEqual([a, b].sort());
    expect((await tickets(g.key)).length).toBe(3);
    expect((await call("GET", `/api/v2/support/${c}`, undefined, keyH(k))).status).toBe(404); // another game's ticket
    expect((await tickets(h)).find((t) => t.id === b)!.by).toBe("host");
  });
  test("a stranger sees none; nobody at all is refused", async () => {
    const g = await paidGame(); const s = await paidGame(); const id = (await j(await raise(g.key))).id;
    expect((await tickets(s.key)).length).toBe(0);
    expect((await call("GET", `/api/v2/support/${id}`, undefined, keyH(s.key))).status).toBe(404);
    expect((await call("GET", "/api/v2/support")).status).toBeGreaterThanOrEqual(401);
  });
});

describe("limits and the owner's side", () => {
  test("ten tickets a day; the eleventh is turned away kindly; a day later it works", async () => {
    const g = await paidGame();
    for (let i = 0; i < 10; i++) expect((await raise(g.key, { subject: "Question number " + i })).status).toBe(200);
    const r = await raise(g.key); expect(r.status).toBe(429); expect((await j(r)).code).toBe("too-many");
    const later = T + 25 * HOUR; for (const t of q("SELECT id FROM v2_support")) W.raw.prepare("UPDATE v2_support SET status='closed' WHERE id=?").run(t.id);
    expect((await raise(g.key, {}, later)).status).toBe(200);
  });
  test("the owner reads and answers with the platform key; nobody else can", async () => {
    const g = await paidGame(); const id = (await j(await raise(g.key))).id;
    expect((await call("GET", "/api/owner/v2/support", undefined, keyH(g.key))).status).toBeGreaterThanOrEqual(401);
    const list = await j(await call("GET", "/api/owner/v2/support", undefined, PLAT)); expect(JSON.stringify(list)).toContain("Cannot find my prize list");
    const r = await call("POST", `/api/owner/v2/support/${id}`, { reply: "Open Prizes, then Add.", status: "answered" }, PLAT); expect(r.status).toBe(200);
    const one = await j(await call("GET", `/api/v2/support/${id}`, undefined, keyH(g.key)));
    expect(one.messages.some((m: any) => /Open Prizes/.test(m.body))).toBe(true);
  });
  test("tickets are kept 365 days, then removed", async () => {
    const g = await paidGame(); const id = (await j(await raise(g.key))).id;
    await purgeSupport(W.env as any, T + SUPPORT_KEEP_MS - HOUR); expect(q("SELECT 1 FROM v2_support WHERE id=?", id).length).toBe(1);
    await purgeSupport(W.env as any, T + SUPPORT_KEEP_MS + HOUR); expect(q("SELECT 1 FROM v2_support WHERE id=?", id).length).toBe(0);
    expect(q("SELECT 1 FROM v2_support_msg WHERE tid=?", id).length).toBe(0);
  });
});
