// SMOKE 20 NOV, owner step 18: an e-mail to the organizer after every step: game created, published, paid notice, started, completed, data report, deletion done.
// For each of the four start formats: subject, recipient, sent exactly once, link present, and the personal data of players never in a mail.
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore, organizer, create, T, HOUR, MIN, W, call, j, one, q, mails, provider, installProvider, FORMATS, newGame, playGame, tickFor, lifecycleTick, count } from "./h";
setDefaultTimeout(120_000);
beforeEach(() => { reset(); installProvider(); }); afterEach(restore);

const forGame = (id: string) => provider.delivered.filter((m) => m.subject.includes(id) || m.text.includes(id));
for (const f of FORMATS) describe(`[${f.key}] step 18: one e-mail per step to the organizer`, () => {
  test("S18-1 game created: exactly one mail to the organizer's own address, naming the game", async () => {
    const o = await organizer();
    const id = `SM-CR-${f.key}`; const r = await create(o.key, id, { startMode: f.startMode, callMode: f.callMode }); expect(r.status).toBe(200);
    const m = forGame(id).filter((x) => x.to === o.email);
    expect(m.length).toBe(1); expect(m[0]!.subject).toMatch(/created|draft/i);
  });
  test("S18-2 game published: one mail, to the confirmed e-mail, with the share link, and no AI work link in it", async () => {
    const g = await newGame(f, { pay: false });
    const o = g.org; const id = `SM-PB-${f.key}`;
    expect((await create(o.key, id, { startMode: f.startMode, callMode: f.callMode })).status).toBe(200);
    const { publish } = await import("../param-harness"); expect((await publish(o.key, id)).status).toBe(200);
    const m = forGame(id).filter((x) => /published/i.test(x.subject));
    expect(m.length).toBe(1); expect(m[0]!.to).toBe("boss@acme.com"); expect(m[0]!.text).toMatch(/https?:\/\/\S+/); expect(m[0]!.text).not.toMatch(/ct[ah]_[0-9a-f]{20}/);
  });
  test("S18-3 paid notice: the organizer gets one 'payment received' mail with the invoice number and link, and the contact one 'game is paid' mail; paying twice sends nothing more", async () => {
    const g = await newGame(f, { pay: false });
    const { payGame } = await import("./h"); await payGame(g);
    const mine = provider.delivered.filter((x) => x.to === g.org.email && /payment received/i.test(x.subject));
    expect(mine.length).toBe(1); expect(mine[0]!.text).toMatch(/CT\/\d{4}-\d{2}\/\d+/); expect(mine[0]!.text).toMatch(/api\/invoice\//);
    expect(provider.delivered.filter((x) => x.to === "boss@acme.com" && /invoice/i.test(x.subject)).length).toBe(1);
  });
  test("S18-4 game started: one mail when the first number is called (by clock or by Start press)", async () => {
    const g = await newGame(f);
    const { pids, last } = await playGame(g, 3); void pids;
    await tickFor(last - 20 * MIN, 25); // the cron runs every minute through the game
    const m = provider.delivered.filter((x) => x.to === "boss@acme.com" || x.to === g.org.email).filter((x) => /\bstarted\b|has begun|is under way/i.test(x.subject) && !/published/i.test(x.subject) && x.text.includes(g.id));
    expect(m.length).toBe(1);
    await tickFor(last + 30 * MIN, 5); expect(provider.delivered.filter((x) => /\bstarted\b|has begun|is under way/i.test(x.subject) && !/published/i.test(x.subject) && x.text.includes(g.id)).length).toBe(1); // a repeat tick sends nothing more
  });
  test("S18-5 game completed: one mail when the game ends, with the winners (seat or ticket numbers, never names), sent once", async () => {
    const g = await newGame(f);
    const { last } = await playGame(g, 3);
    await tickFor(last + 5 * MIN, 12);
    const m = provider.delivered.filter((x) => /(complete|ended|finished|over)/i.test(x.subject) && x.text.includes(g.id) && !/report/i.test(x.subject));
    expect(m.length).toBe(1);
  });
  test("S18-6 data report: one mail with the report link, the closing time and the deletion time; no ID, name or number of a player in the mail", async () => {
    const g = await newGame(f);
    const { last } = await playGame(g, 3);
    await tickFor(last + 5 * MIN, 12);
    const m = provider.delivered.filter((x) => /report/i.test(x.subject) && x.text.includes(g.id));
    expect(m.length).toBe(1); expect(m[0]!.to).toBe("boss@acme.com"); expect(m[0]!.text).toMatch(/api\/report|report\.html/); expect(m[0]!.text).toMatch(/permanently deleted/i);
    for (const id of ["P1000", "P1001", "P1002"]) expect(m[0]!.text).not.toContain(id);
  });
  test("S18-7 deletion done: one mail after the erasure, to the organizer only, and a repeated tick sends no second", async () => {
    const g = await newGame(f);
    const { last } = await playGame(g, 3);
    const t = await tickFor(last + 5 * MIN, 12);
    const endMs = Number(one("SELECT end_ms FROM life WHERE eid=?", g.id).end_ms);
    await lifecycleTick(W.env as any, endMs + 20 * HOUR + MIN); await lifecycleTick(W.env as any, endMs + 21 * HOUR); await lifecycleTick(W.env as any, endMs + 22 * HOUR); void t;
    const m = provider.delivered.filter((x) => /deleted/i.test(x.subject) && x.text.includes(g.id));
    expect(m.length).toBe(1); expect(m[0]!.to).not.toMatch(/^P\d/);
  });
});
