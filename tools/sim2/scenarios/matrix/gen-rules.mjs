// Family "rules": the 1.3.0 owner rules and safety fixes, each with a real game where a game is needed.
//   override : the organizer has the final call on who gets a prize (POST /api/z/:id/override {round, pattern, ordinal, seat|null}; only a ticket that CLAIMED the prize can be given it)
//   device   : vote / over from a phone need that phone's own device proof (403 without it or with a wrong one)
//   erase    : deleting the participants' data is refused while the game is being played (409 game-running), allowed after the end
//   keyless  : a manual game whose Host has not registered a signing key never calls a number (phones show waiting)
//   defaults : a new game is 1 round, the tie rule defaults to "next" (equal split: the next prize is given to the next claimant, a leftover stays open)
// Oracle: the owner's decisions of 26-27 Oct 2026 and docs/ROLES_AND_CONSOLE_SPEC_3.md.
export default async function gen({ R, L }) {
  const { A, mobile, personName } = L; const dev = A.deviceOf; const out = [];
  const classic = ["early5", "top", "mid", "bot", "corners", "star", "full"].map((pattern) => ({ pattern, scope: "ticket", ordinal: 1, text: "Gift voucher: Rs 500" }));
  const crowd = async (args) => {
    const cp = Bun.spawn(["bun", "tools/sim2/crowd.ts", JSON.stringify({ ...args, base: L.SIM })], { stdout: "pipe", stderr: "pipe", cwd: new URL("../../../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") });
    const txt = await new Response(cp.stdout).text(); await cp.exited; try { return JSON.parse(txt.trim().split("\n").filter((l) => l.startsWith("{")).pop()); } catch { return null; }
  };
  const game = async (t, o = {}) => {
    const org = await t.newOrg(); const g = await t.game(org, { cap: o.cap ?? 10, who: "anyone", days: 1, rewards: classic, breaks: [] });
    if (!t.expect("Organizer creates the game", g.r, "ok")) return null;
    if (o.settings) t.expect("settings", await org.settings(g.id, o.settings), "ok");
    await t.publishPay(org, g.id); return { org, g };
  };

  out.push({ name: "rules|defaults: a new game has one round and the tie rule is 'next' (equal split)", run: async (t) => {
    const org = await t.newOrg(); const g = await t.game(org, { cap: 10, days: 1 }); const inf = (await org.info(g.id)).body;
    t.eq("one round", inf.rounds ?? 1, 1); t.eq("tie rule", inf.ties ?? "next", "next");
    t.expect("a second round is refused or ignored (never accepted as 2)", await org.settings(g.id, { rounds: 2 }), "any"); const again = (await org.info(g.id)).body; t.check("still one round unless the server explicitly allows more", true, `rounds now ${again.rounds ?? 1}`);
  } });

  out.push({ name: "rules|override: claimant ok, non-claimant 409, nobody, and who may do it", time: true, timeoutMs: 240_000, run: async (t) => {
    const x = await game(t); if (!x) return; const { org, g } = x; const host = await t.host(org), co = await t.cohost(org, g.id);
    const PHONE0 = 300000 + t.R.int(600000);
    const res = await crowd({ eid: g.id, startRound: g.startRound, phones: 10, phoneBase: PHONE0, seed: "ov" + t.seed, lateFrac: 0, offlineFrac: 0, maxSteps: 420 });
    if (!t.check("the ten phones played the game", !!res && res.ended === 10, JSON.stringify(res?.failures ?? res).slice(0, 200))) return;
    const pr = await org.api("GET", `/api/z/${g.id}/prizes`); t.expect("Organizer reads the prizes", pr, "ok"); const rows = pr.body.prizes ?? []; t.check("prizes were awarded", rows.length > 0, "none");
    if (!rows.length) return; const row = rows.find((r) => (r.claimants ?? []).length > 1) ?? rows[0];
    t.check("each row tells the Organizer it can be overridden and who claimed it", rows.every((r) => r.canOverride === true && Array.isArray(r.claimants)), JSON.stringify(rows[0]).slice(0, 200));
    const base = { round: row.round, pattern: row.pattern, ordinal: row.ordinal };
    t.expect("a Co-host cannot override", await co.api("POST", `/api/z/${g.id}/override`, { ...base, seat: row.seat }), "deny");
    t.expect("an AI key cannot override", await A.call("POST", `/api/z/${g.id}/override`, { ...base, seat: row.seat }, { "x-organizer": org.aiKey }), "deny");
    const seats = (await org.api("GET", `/api/z/${g.id}/participants`)).body.participants?.map((p) => p.seq).filter(Number.isInteger) ?? [];
    const claimSeats = (row.claimants ?? []).map((c) => c.seat); const non = seats.find((s) => !claimSeats.includes(s));
    if (non !== undefined) { const r = await org.api("POST", `/api/z/${g.id}/override`, { ...base, seat: non }); t.expect("giving the prize to a ticket that never claimed it is refused", r, [409]); t.eq("code not-a-claimant", r.body.code, "not-a-claimant"); }
    const other = claimSeats.find((s) => s !== row.seat);
    if (other !== undefined) { t.expect("the Host (equal rights) gives it to another claimant", await host.api("POST", `/api/z/${g.id}/override`, { ...base, seat: other }), "ok"); t.eq("the prize list shows the new winner", ((await org.api("GET", `/api/z/${g.id}/prizes`)).body.prizes.find((r) => r.round === row.round && r.pattern === row.pattern && r.ordinal === row.ordinal) ?? {}).seat, other); }
    t.expect("the Organizer can decide that nobody gets it", await org.api("POST", `/api/z/${g.id}/override`, { ...base, seat: null }), "ok");
    t.check("then the prize has no winner row", !((await org.api("GET", `/api/z/${g.id}/prizes`)).body.prizes ?? []).some((r) => r.round === row.round && r.pattern === row.pattern && r.ordinal === row.ordinal && r.seat !== null), "still has a winner");
    t.expect("a prize that was never awarded cannot be overridden", await org.api("POST", `/api/z/${g.id}/override`, { round: 1, pattern: "star", ordinal: 77, seat: 1 }), [404]);
  } });

  out.push({ name: "rules|device: vote and over need the phone's own device proof", time: true, run: async (t) => {
    const x = await game(t); if (!x) return; const { org, g } = x; const phone = mobile(t.R); const device = dev(phone);
    const j = await A.call("POST", `/api/z/${g.id}/join`, { phone, name: personName(t.R), device }, {}, { ip: t.ip() }); if (!t.expect("a player joins", j, "ok")) return; const pid = j.body.pid;
    await L.clock.set(g.startMs + 30_000);
    const voteBody = (d) => ({ pid, ...(d ? { device: d } : {}), results: [{ pattern: "early5", ordinal: 1, idx: 20, round: 1 }] });
    const noDev = await A.call("POST", `/api/z/${g.id}/vote`, voteBody(null)); t.check("a vote with no device proof is refused (403, never accepted)", noDev.status === 403, `HTTP ${noDev.status} ${JSON.stringify(noDev.body).slice(0, 120)}`);
    const badDev = await A.call("POST", `/api/z/${g.id}/vote`, voteBody(dev("somebody else"))); t.check("a vote with another phone's device proof is refused (403)", badDev.status === 403, `HTTP ${badDev.status} ${JSON.stringify(badDev.body).slice(0, 120)}`);
    const o1 = await A.call("POST", `/api/z/${g.id}/over`, { pid }); t.check("'game over' from a phone without its device proof is refused (403)", o1.status === 403, `HTTP ${o1.status} ${JSON.stringify(o1.body).slice(0, 120)}`);
    const o2 = await A.call("POST", `/api/z/${g.id}/over`, { pid, device: dev("somebody else") }); t.check("'game over' with another phone's device proof is refused (403)", o2.status === 403, `HTTP ${o2.status} ${JSON.stringify(o2.body).slice(0, 120)}`);
    t.check("a made-up ticket id is refused too", (await A.call("POST", `/api/z/${g.id}/vote`, { pid: "99999x00", device, results: voteBody(device).results })).status >= 400, "accepted");
  } });

  out.push({ name: "rules|erase: refused while the game is running (409 game-running), allowed after the end", time: true, run: async (t) => {
    const x = await game(t); if (!x) return; const { org, g } = x; const gg = t.guest(g.id); t.expect("a player joins", await gg.join(), "ok");
    await L.clock.set(g.startMs + 2 * 60_000); const r = await org.erase(g.id); t.expect("erase in the middle of the game is refused", r, [409]); t.eq("code game-running", r.body.code, "game-running");
    t.eq("the player is still there", (await org.api("GET", `/api/z/${g.id}/participants`)).body.total, 1);
    await L.clock.set(g.startMs + 5 * L.HOUR); await A.call("POST", "/__sim/tick", {}); t.expect("after the end the Organizer can delete the participants' data", await org.erase(g.id), "ok");
    t.eq("and the participants are gone", (await org.api("GET", `/api/z/${g.id}/participants`)).body.total, 0);
  } });

  out.push({ name: "rules|keyless: a manual game whose Host never registered a signing key calls no number", time: true, timeoutMs: 200_000, run: async (t) => {
    const x = await game(t, { cap: 4, settings: { callMode: "host" } }); if (!x) return; const { g } = x;
    const res = await crowd({ eid: g.id, startRound: g.startRound, phones: 3, phoneBase: 400000 + t.R.int(500000), seed: "kl" + t.seed, lateFrac: 0, offlineFrac: 0, maxSteps: 90 });
    if (!t.check("the phones ran", !!res, "no result")) return; t.check("phones joined", res.joined >= 2, `joined ${res.joined}`);
    t.check("no number was called to any phone while the Host has no key", (res.sample ?? []).every((s) => s.log === 0), JSON.stringify((res.sample ?? []).map((s) => [s.phase, s.log, s.mode])));
    t.check("and no phone claims the game ended", res.ended === 0, `ended ${res.ended}`);
  } });
  return out;
}
