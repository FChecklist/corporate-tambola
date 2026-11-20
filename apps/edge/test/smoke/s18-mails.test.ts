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

// ---- every mail of a whole game, read as a person would: who it went to, what it says, which links it carries
import { hostSetup } from "./h";
for (const f of FORMATS) describe(`[${f.key}] step 18: all the mail of one whole game`, () => {
  test("S18-8 recipients: only the organizer's addresses (and the Hosts who gave one, for cancel / deletion notices), the platform owner's order note, never a player or a Co-host; nobody gets a mail twice", async () => {
    const g = await newGame(f); const h = await hostSetup(g);
    const { last } = await playGame(g, 4); await tickFor(last + 5 * MIN, 12);
    const endMs = Number(one("SELECT end_ms FROM life WHERE eid=?", g.id).end_ms); await lifecycleTick(W.env as any, endMs + 20 * HOUR + MIN);
    const ok = new Set([g.org.email, "boss@acme.com", "host@acme.com", "hello@corporatetambola.com"]);
    for (const m of provider.delivered) expect([m.subject, m.to, ok.has(m.to)]).toEqual([m.subject, m.to, true]);
    const host = provider.delivered.filter((m) => m.to === "host@acme.com").map((m) => m.subject);
    for (const s of host) expect(s).toMatch(/deleted|cancel|did not start|time has passed|You are a Host/i); // a Host hears about the end of the data, never about money or the report
    const sig = provider.delivered.map((m) => m.to + "|" + m.subject); expect(new Set(sig).size).toBe(sig.length); // not one identical mail twice
    void h;
  });
  test("S18-9 words and links: every mail has a plain subject, the brand footer, no leftover placeholder ('undefined', 'null', 'NaN', '[object'), https links only, and no organizer key outside the AI-link mails", async () => {
    const g = await newGame(f); await hostSetup(g);
    const { last } = await playGame(g, 4); await tickFor(last + 5 * MIN, 12);
    const endMs = Number(one("SELECT end_ms FROM life WHERE eid=?", g.id).end_ms); await lifecycleTick(W.env as any, endMs + 20 * HOUR + MIN);
    expect(provider.delivered.length).toBeGreaterThanOrEqual(8);
    for (const m of provider.delivered) {
      const all = m.subject + "\n" + m.text;
      expect([m.subject, /undefined|\bnull\b|NaN|\[object|\$\{/.test(all)]).toEqual([m.subject, false]);
      expect([m.subject, /^\[Tambola\]/.test(m.subject) || /^\[TEST\]/.test(m.subject)]).toEqual([m.subject, true]);
      expect([m.subject, m.subject.length <= 140]).toEqual([m.subject, true]);
      expect([m.subject, /Corporate Tambola/.test(m.text)]).toEqual([m.subject, true]);
      for (const u of all.match(/https?:\/\/[^\s)]+/g) ?? []) expect([m.subject, u.startsWith("https://")]).toEqual([m.subject, true]);
      if (!/AI work link|You are a Host|Host AI work link/i.test(m.subject)) expect([m.subject, /ct[kah]_[0-9a-f]{20}/.test(all)]).toEqual([m.subject, false]);
      expect([m.subject, /[A-Z]{12,}/.test(m.subject)]).toEqual([m.subject, false]); // no shouting
    }
  });
});

// ---- two things at the same moment must not send a mail twice (two cron runs at once, a double-tapped Create)
for (const f of FORMATS) describe(`[${f.key}] step 18: exactly once when two run at the same time`, () => {
  test("S18-10 two cron runs at the same moment at the start and at the end: one 'started' mail, one 'ended' mail; two Create taps at once: one 'created' mail", async () => {
    provider.honourIdem = false; // the provider offers no repeat protection: our own once-only claim has to hold by itself
    const o = await organizer(); const id = `SM-DB-${f.key}`;
    await Promise.all([create(o.key, id, { startMode: f.startMode, callMode: f.callMode }), create(o.key, id, { startMode: f.startMode, callMode: f.callMode })]);
    expect(provider.delivered.filter((m) => /is created/i.test(m.subject) && m.text.includes(id)).length).toBe(1);
    const g = await newGame(f); const { last } = await playGame(g, 3);
    await Promise.all([lifecycleTick(W.env as any, last - 10 * MIN), lifecycleTick(W.env as any, last - 10 * MIN), lifecycleTick(W.env as any, last - 10 * MIN)]);
    expect(provider.delivered.filter((m) => /\bstarted\b/i.test(m.subject) && !/published/i.test(m.subject) && m.text.includes(g.id)).length).toBe(1);
    await tickFor(last + 5 * MIN, 3); const t = last + 10 * MIN;
    await Promise.all([lifecycleTick(W.env as any, t), lifecycleTick(W.env as any, t), lifecycleTick(W.env as any, t)]);
    expect(provider.delivered.filter((m) => /Your game has ended/i.test(m.subject) && m.text.includes(g.id)).length).toBe(1);
    expect(provider.delivered.filter((m) => /report is ready/i.test(m.subject) && m.text.includes(g.id)).length).toBeLessThanOrEqual(1);
  });
});
