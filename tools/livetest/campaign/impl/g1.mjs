// G1 Organizer setup (as the engine and the player pages show it). Implemented: 02 (manual start does not start by itself), 03 (host-called numbers do not come by themselves), 04 (open join, 10 different tickets),
// 05 (list game: listed join, unlisted waits), 07 (two tickets each), 12 (rehearsals in order). Not implemented: 06 (a played game with four prizes), 08 09 (Lucky Draw), 10 (Super Bumper runs), 11 (breaks and brand): the settings shapes are exercised by layer A.
// UC-G1-01 is in s0.mjs. The Start press of UC-G1-02 and the roll press of UC-G1-03 need the signed control key and are NOT driven: the checks say so.
import { createGame, joinPlayer, mkChecks, addPeople, closeAll, fakePhone, speed, now, sleep, text } from "../core.mjs";

const view = (p) => p.page.evaluate(() => { const v = window.__rt.view(); return { log: v.log.length, tickets: v.tickets.length, first: JSON.stringify(v.tickets[0] || null) }; }).catch(() => ({ log: -1, tickets: 0, first: null }));
const unstarted = (what, settings) => async (c, env) => {
  const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env; const SP = speed();
  const g = await createGame(api, runId, c.id, { startInSec: 30, settings });
  const a = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: true }), b = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: true });
  try {
    ck("both players joined and checked in", a.joined && b.joined);
    await sleep(Math.max(0, (g.startMs - now() + 40_000) / SP)); // 40 game seconds after the planned start
    const va = await view(a), vb = await view(b);
    ck(`${what}: no number came by itself 40 seconds after the start time (not driven: ${what === "manual start" ? "the Start press" : "the roll press"}, a signed control key)`, va.log === 0 && vb.log === 0, `${va.log}/${vb.log}`);
    ck("the phones say the game is waiting, not over", !/Game over|Game complete/.test(await text(a)));
  } finally { await closeAll([a, b]); }
  return { checks, game: g.tag.id };
};
export const IMPL = {
  "UC-G1-02": unstarted("manual start", { startMode: "manual" }),
  "UC-G1-03": unstarted("host-called numbers", { callMode: "host", startMode: "auto" }),
  /** Open join: nine players join with the common link, nobody is asked for approval, everybody holds a different ticket. */
  async "UC-G1-04"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env; const g = await createGame(api, runId, c.id, { startInSec: 900 }); const ps = [];
    try {
      for (let i = 0; i < 9; i++) ps.push(await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false }));
      ck("all 9 joined without approval", ps.every((p) => p.joined), ps.map((p) => p.joined).join(""));
      const vs = await Promise.all(ps.map(view)); ck("each player holds one ticket and the tickets are all different", vs.every((v) => v.tickets === 1) && new Set(vs.map((v) => v.first)).size === 9, vs.map((v) => v.tickets).join(""));
      ck("no phone had a script error", ps.every((p) => p.errs.length === 0), ps.flatMap((p) => p.errs).join(";"));
    } finally { await closeAll(ps); }
    return { checks, game: g.tag.id };
  },
  /** List game with listed mobile numbers: the listed join directly, an unlisted number waits. */
  async "UC-G1-05"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env; const g = await createGame(api, runId, c.id, { startInSec: 900, settings: { whoCanJoin: "list" } });
    const phones = Array.from({ length: 5 }, fakePhone); await addPeople(api, g, phones.map((p, i) => ({ name: "Staff " + (i + 1), phone: p }))); const ps = [];
    try {
      for (const ph of phones) ps.push(await joinPlayer(browser, base, meter, g.tag.id, ph, { checkin: false }));
      ck("the five listed people joined directly", ps.every((p) => p.joined), ps.map((p) => p.joined).join(""));
      const un = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false }); ps.push(un);
      ck("an unlisted number waits (no ticket, the wait screen)", !un.joined && /Please wait/i.test(await text(un)));
    } finally { await closeAll(ps); }
    return { checks, game: g.tag.id };
  },
  /** Two tickets each: every player holds two different tickets. */
  async "UC-G1-07"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env; const g = await createGame(api, runId, c.id, { startInSec: 900, settings: { tickets: 2 } }); const ps = [];
    try {
      for (let i = 0; i < 3; i++) ps.push(await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false }));
      const vs = await Promise.all(ps.map(async (p) => p.page.evaluate(() => { const t = window.__rt.view().tickets; return { n: t.length, a: JSON.stringify(t[0]), b: JSON.stringify(t[1]) }; }).catch(() => ({ n: 0 }))));
      ck("every player holds two tickets", vs.every((v) => v.n === 2), vs.map((v) => v.n).join(""));
      ck("Ticket A and Ticket B of a player are different", vs.every((v) => v.a !== v.b));
      ck("all six tickets are different from each other", new Set(vs.flatMap((v) => [v.a, v.b])).size === 6);
    } finally { await closeAll(ps); }
    return { checks, game: g.tag.id };
  },
  /** Rehearsals on a free demo game: the engine keeps them LOCKED until the game is paid (rehearsal.test.ts: "a demo game is not a paid game"). The campaign never pays, so this case proves the locked answer; the three running rehearsals are proven by the engine test. */
  async "UC-G1-12"(c, env) {
    const { ck, checks } = mkChecks(); const { api, runId } = env; const g = await createGame(api, runId, c.id, { startInSec: 900 });
    const cards = await api("GET", `/api/z/${g.tag.id}/rehearsals`, undefined, g.key);
    ck("three rehearsal cards are offered (API)", cards.ok && Array.isArray(cards.body.cards) && cards.body.cards.length === 3, JSON.stringify(cards.body).slice(0, 140));
    ck("on a free demo game all three are locked with the pay-first words", cards.ok && cards.body.paid === false && cards.body.cards.every((x) => x.state === "locked" && /pay/i.test(x.reason || "")), JSON.stringify(cards.body).slice(0, 200));
    const r1 = await api("POST", `/api/z/${g.tag.id}/rehearsal`, { n: 1 }, g.key); ck("starting rehearsal 1 is refused with 402 not-paid (no payment is made by the campaign)", r1.status === 402 && r1.body.code === "not-paid", r1.status + " " + JSON.stringify(r1.body).slice(0, 120));
    return { checks, game: g.tag.id, note: "Rehearsals 1 to 3 running in order need a paid game: proven by apps/edge/test/rehearsal.test.ts, not by the campaign." };
  },
};
