// SMOKE 20 NOV, owner step 18 (second half): the mail provider fails. Retry, sent exactly once, no mail lost while the provider is down, for each way it can fail.
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore, provider, installProvider, FORMATS, newGame, playGame, tickFor, lifecycleTick, one, q, W, HOUR, MIN, DAY, publish, create, organizer, mails, count } from "./h";
setDefaultTimeout(120_000);
beforeEach(() => { reset(); installProvider(); }); afterEach(restore);

for (const f of FORMATS) for (const failure of ["down", "throw"]) describe(`[${f.key}] provider ${failure}`, () => {
  test(`S18-R1 published mail: provider ${failure} at Publish -> the organizer's publish still works, the mail is kept, and the next daily retry delivers it exactly once`, async () => {
    const o = await organizer(); const id = `SM-R1-${f.key}-${failure}`;
    expect((await create(o.key, id, { startMode: f.startMode, callMode: f.callMode })).status).toBe(200);
    installProvider(failure);
    expect((await publish(o.key, id)).status).toBe(200);
    expect(provider.delivered.filter((m) => /published/i.test(m.subject)).length).toBe(0);
    const row = q("SELECT * FROM outbox WHERE subject LIKE '%published%'"); expect(row.length).toBe(1); expect(row[0].sent).toBe(0); expect(row[0].body).not.toBe(""); // kept for the retry
    installProvider("ok");
    await lifecycleTick(W.env as any, 1_000 + Date.now() * 0 + (row[0].at_ms as number) + 2 * HOUR); // the daily job
    expect(provider.delivered.filter((m) => /published/i.test(m.subject) && m.to === "boss@acme.com").length).toBe(1);
    await lifecycleTick(W.env as any, row[0].at_ms + 2 * HOUR + DAY + MIN); await lifecycleTick(W.env as any, row[0].at_ms + 2 * HOUR + DAY + 5 * MIN); // later days: nothing again
    expect(provider.delivered.filter((m) => /published/i.test(m.subject) && m.to === "boss@acme.com").length).toBe(1);
  });
  test(`S18-R2 report mail: provider ${failure} for three hours after the end, then back -> the report is sent once at the first tick after, not lost, not twice`, async () => {
    const g = await newGame(f); const { last } = await playGame(g, 3);
    installProvider(failure);
    let t = await tickFor(last + 5 * MIN, 180); // three hours of ticks (once a minute) with the provider down
    expect(provider.delivered.filter((m) => /report/i.test(m.subject)).length).toBe(0);
    installProvider("ok"); t = await tickFor(t, 5);
    expect(provider.delivered.filter((m) => /report is ready/i.test(m.subject) && m.text.includes(g.id)).length).toBe(1);
    await tickFor(t, 10); expect(provider.delivered.filter((m) => /report is ready/i.test(m.subject) && m.text.includes(g.id)).length).toBe(1);
  });
  test(`S18-R3 deletion-done mail: provider ${failure} at the erasure -> the data IS deleted on time and the mail follows exactly once when the provider is back`, async () => {
    const g = await newGame(f); const { last } = await playGame(g, 3);
    await tickFor(last + 5 * MIN, 12);
    const endMs = Number(one("SELECT end_ms FROM life WHERE eid=?", g.id).end_ms);
    installProvider(failure);
    await lifecycleTick(W.env as any, endMs + 20 * HOUR + MIN);
    expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBe(0); // deletion never waits for a mail
    expect(provider.delivered.filter((m) => /deleted/i.test(m.subject)).length).toBe(0);
    installProvider("ok");
    await lifecycleTick(W.env as any, endMs + 20 * HOUR + 2 * MIN); await lifecycleTick(W.env as any, endMs + 44 * HOUR); await lifecycleTick(W.env as any, endMs + 45 * HOUR);
    expect(provider.delivered.filter((m) => /Your guests' personal data has been deleted/i.test(m.subject) && m.text.includes(g.id)).length).toBe(1);
  });
});
describe("provider outage longer than the mail log is kept", () => {
  for (const f of FORMATS) test(`S18-R4 [${f.key}] the report mail when the provider is down for the whole 19 hours its link is open: the organizer must still be told, before the data goes`, async () => {
    const g = await newGame(f); const { last } = await playGame(g, 3);
    installProvider("down");
    const endMs = (await tickFor(last + 5 * MIN, 5), Number(one("SELECT end_ms FROM life WHERE eid=?", g.id).end_ms));
    for (let h = 1; h <= 20; h++) await lifecycleTick(W.env as any, endMs + h * HOUR + MIN); // hourly ticks, provider down all the time
    expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBe(0); // the data was deleted on time (the promise to the players)
    installProvider("ok");
    await lifecycleTick(W.env as any, endMs + 21 * HOUR); await lifecycleTick(W.env as any, endMs + 21 * HOUR + DAY); // the daily job tries the unsent mail again, once a day, for 3 days
    // the organizer must hear of the loss somewhere: any mail naming the game that says the report could not be sent
    const told = provider.delivered.filter((m) => m.text.includes(g.id) && /could not|not be sent|did not reach|missed/i.test(m.text + m.subject));
    expect(told.length).toBeGreaterThanOrEqual(1);
  });
});
