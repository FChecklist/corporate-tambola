// TT-01..: game integrity and free-plan protection, with the clock under our control (no waiting).
import { expect } from "bun:test";
import { HOUR, T, dev, j, join, organizer, paidEngagement, phone, roundAt, roundMs, tt, world } from "./lib";

const J = (x: unknown) => JSON.stringify(x).slice(0, 300);
async function seatsOf(w: ReturnType<typeof world>, id: string, now: number) { const r = await j(await w.call("GET", `/api/z/${id}/seats`, undefined, {}, now)); return (r.seats ?? []) as [number, string, number][]; }
const usage = (w: ReturnType<typeof world>) => ((w.raw.prepare("SELECT COALESCE(SUM(writes),0) AS c FROM usage").get() as any).c as number);

tt({ id: "TT-01", role: "participant (one phone)", title: "one phone cannot forge the winners: votes must come from different phones, not from different public ticket ids", steps: "12 people join; after the game began one participant reads the public seat list and posts votes as 3 other ticket ids for a 'full house' result naming itself", expected: "the forged result is NOT accepted (no results, no prize row for the forger)", known: "F-01", severityIfFails: "H" }, async () => {
  const w = world(); const g = await paidEngagement(w, { cap: 100 });
  for (let i = 1; i <= 12; i++) expect((await join(w, g.id, i)).status).toBe(200);
  const now = g.startMs + 4 * 60_000; // after the 2-minute setup, the seat list is public
  const seats = await seatsOf(w, g.id, now); expect(seats.length).toBe(12);
  const attacker = seats[11]![1], voters = seats.slice(0, 3).map((s) => s[1]);
  const out: any[] = [];
  for (const p of voters) out.push(await j(await w.call("POST", `/api/z/${g.id}/vote`, { pid: p, results: [{ pattern: "full", ordinal: 1, round: 1, idx: 30, pids: [attacker] }] }, {}, now)));
  const res = await j(await w.call("GET", `/api/z/${g.id}/results`, undefined, {}, now));
  const prizes = (w.raw.prepare("SELECT seat FROM prize WHERE eid=?").all(g.id) as any[]).length;
  expect(res.results, `votes answered ${J(out)}; results ${J(res.results)}; prize rows for the forger: ${prizes}`).toEqual([]);
  return "forged result rejected";
});
tt({ id: "TT-02", role: "participant (one phone)", title: "a forged result cannot be corrected once it is accepted (first accepted result stands)", steps: "After TT-01's forgery, honest phones report the true winner", expected: "the honest result replaces or flags the forged one", known: "F-01", severityIfFails: "H" }, async () => {
  const w = world(); const g = await paidEngagement(w, { cap: 100 });
  for (let i = 1; i <= 12; i++) await join(w, g.id, i);
  const now = g.startMs + 4 * 60_000, seats = await seatsOf(w, g.id, now), attacker = seats[11]![1];
  for (const s of seats.slice(0, 3)) await w.call("POST", `/api/z/${g.id}/vote`, { pid: s[1], results: [{ pattern: "full", ordinal: 1, round: 1, idx: 30, pids: [attacker] }] }, {}, now);
  const honest = seats[5]![1]; // the real winner
  for (const s of seats.slice(3, 10)) await w.call("POST", `/api/z/${g.id}/vote`, { pid: s[1], results: [{ pattern: "full", ordinal: 1, round: 1, idx: 62, pids: [honest] }] }, {}, now + 60_000);
  const row = w.raw.prepare("SELECT pids FROM settled WHERE eid=? AND pattern='full'").get(g.id) as any;
  expect(row ? JSON.parse(row.pids) : [], "settled winners for 'full'").toEqual([honest]);
  return "honest result stands";
});
tt({ id: "TT-03", role: "participant (one phone)", title: "repeating the same vote does not use up the shared daily write allowance", steps: "One phone posts the same vote 300 times; measure the daily write counter", expected: "duplicates are free or capped per phone (counter grows by < 30)", known: "F-03", severityIfFails: "H" }, async () => {
  const w = world(); const g = await paidEngagement(w, { cap: 100 });
  for (let i = 1; i <= 12; i++) await join(w, g.id, i);
  const now = g.startMs + 4 * 60_000, seats = await seatsOf(w, g.id, now);
  const before = usage(w);
  for (let k = 0; k < 300; k++) await w.call("POST", `/api/z/${g.id}/vote`, { pid: seats[0]![1], results: [{ pattern: "full", ordinal: 1, round: 1, idx: 30, pids: [seats[0]![1]] }] }, { "cf-connecting-ip": "203.0.113.7" }, now);
  const used = usage(w) - before;
  expect(used, `300 identical votes from one address burned ${used} of the shared daily writes`).toBeLessThan(30);
  return `${used} writes for 300 duplicate votes`;
});
tt({ id: "TT-04", role: "anonymous attacker", title: "repeating claims and 'game over' reports does not drain the daily allowance either", steps: "300 duplicate claim posts and 300 duplicate 'over' posts from one address", expected: "counter grows by < 60 in total", known: "F-03", severityIfFails: "H" }, async () => {
  const w = world(); const g = await paidEngagement(w, { cap: 100 });
  for (let i = 1; i <= 12; i++) await join(w, g.id, i);
  const now = g.startMs + 10 * 60_000, seats = await seatsOf(w, g.id, now), pid = seats[0]![1];
  const before = usage(w);
  for (let k = 0; k < 300; k++) { await w.call("POST", `/api/z/${g.id}/claims`, { pid, claims: Array.from({ length: 7 }, () => ({ round: 1, pattern: "full", idx: 40 })) }, { "cf-connecting-ip": "203.0.113.8" }, now); await w.call("POST", `/api/z/${g.id}/over`, { pid }, { "cf-connecting-ip": "203.0.113.8" }, now); }
  const used = usage(w) - before;
  expect(used, `600 duplicate calls burned ${used} writes`).toBeLessThan(60);
  return `${used} writes`;
});
tt({ id: "TT-05", role: "anonymous attacker", title: "when the daily allowance is gone, honest phones can still report winners (one address cannot switch the game off for everybody)", steps: "Set a tiny budget, exhaust it with duplicate votes, then an honest phone votes", expected: "honest vote still accepted", known: "F-03", severityIfFails: "H" }, async () => {
  const w = world({ budget: "400" }); const g = await paidEngagement(w, { cap: 100 });
  for (let i = 1; i <= 12; i++) await join(w, g.id, i);
  const now = g.startMs + 4 * 60_000, seats = await seatsOf(w, g.id, now);
  for (let k = 0; k < 400; k++) await w.call("POST", `/api/z/${g.id}/vote`, { pid: seats[0]![1], results: [{ pattern: "full", ordinal: 1, round: 1, idx: 30, pids: [seats[0]![1]] }] }, {}, now);
  const honest = await w.call("POST", `/api/z/${g.id}/vote`, { pid: seats[1]![1], results: [{ pattern: "top", ordinal: 1, round: 1, idx: 20, pids: [seats[2]![1]] }] }, {}, now + 1000);
  expect(honest.status, "an honest phone's vote after the allowance was used up by one address").toBe(200);
  return "honest vote still accepted";
});
tt({ id: "TT-06", role: "office crowd", title: "250 colleagues behind one office network address can all join within a minute", steps: "250 joins from the same address in the same minute (cap 250)", expected: "all 250 succeed", known: "F-10", severityIfFails: "M" }, async () => {
  const w = world(); const g = await paidEngagement(w, { cap: 250 });
  let ok = 0, busy = 0; const codes: Record<string, number> = {};
  for (let i = 1; i <= 250; i++) { const r = await join(w, g.id, i, T, "198.51.100.77"); if (r.status === 200) ok++; else { busy++; codes[r.status] = (codes[r.status] ?? 0) + 1; } }
  expect(ok, `${ok} joined, ${busy} refused ${J(codes)} (per-address limit is 200 a minute and 1,500 a day)`).toBe(250);
  return "250/250";
}, 120_000);
tt({ id: "TT-07", role: "participants", title: "no oversell: 60 simultaneous joins at capacity 20 give exactly 20 seats", steps: "Promise.all of 60 joins (different phones, devices, addresses) at cap 20", expected: "20 x 200, 40 x 409; participants=20; seat numbers unique 1..20" }, async () => {
  const w = world(); const g = await paidEngagement(w, { cap: 20 });
  const rs = await Promise.all(Array.from({ length: 60 }, (_, i) => join(w, g.id, 1000 + i)));
  const ok = rs.filter((r) => r.status === 200).length, full = rs.filter((r) => r.status === 409).length;
  const n = (w.raw.prepare("SELECT COUNT(*) c FROM participant WHERE eid=?").get(g.id) as any).c, seqs = (w.raw.prepare("SELECT seq FROM seat WHERE eid=? ORDER BY seq").all(g.id) as any[]).map((x) => x.seq);
  expect([ok, n, seqs.length], `ok ${ok} full ${full} participants ${n}`).toEqual([20, 20, 20]);
  expect(new Set(seqs).size).toBe(20);
  return `ok=${ok} full=${full} seats=${seqs.length}`;
});
tt({ id: "TT-08", role: "participant (two devices)", title: "the same mobile number on two phones at the same instant gives one ticket", steps: "Promise.all of two joins for one number from two devices", expected: "one 200, one 423; one seat" }, async () => {
  const w = world(); const g = await paidEngagement(w, { cap: 50 });
  const mk = (d: string) => w.call("POST", `/api/z/${g.id}/join`, { phone: phone(77), name: "Twin", device: dev(d) }, {}, T);
  const [a, b] = await Promise.all([mk("A"), mk("B")]);
  const seats = (w.raw.prepare("SELECT COUNT(*) c FROM seat WHERE eid=?").get(g.id) as any).c;
  expect([a.status, b.status].sort(), `seats=${seats}`).toEqual([200, 423]);
  expect(seats).toBe(1);
  return "one ticket";
});
tt({ id: "TT-09", role: "organizer", title: "double payment: two payments for one engagement started at the same moment charge once", steps: "Publish unpaid; Promise.all of two /api/payments/test for the same engagement", expected: "exactly one payment fulfilled; the other refused (409)", known: "F-04", severityIfFails: "H" }, async () => {
  const w = world({ mode: "TEST" });
  const org = await organizer(w, "dbl@example.com");
  const id = "DBLPAY1", start = roundAt(T + HOUR) + 1;
  await w.call("POST", "/api/z", { id, startRound: start, callSeconds: 6, cap: 50 }, org.h);
  await w.call("POST", `/api/z/${id}/publish`, { email: org.email, phone: "9811122233" }, org.h);
  const body = { eid: id, email: org.email, org: "Dbl", country: "IN" };
  const rs = await Promise.all([w.call("POST", "/api/payments/test", body, org.h), w.call("POST", "/api/payments/test", body, org.h)]);
  const st = rs.map((r) => r.status).sort();
  const paid = (w.raw.prepare("SELECT COUNT(*) c FROM payment WHERE status='paid'").get() as any).c;
  expect(paid, `statuses ${st}; paid payments ${paid}`).toBe(1);
  return `statuses ${st}`;
});
tt({ id: "TT-10", role: "organizer", title: "double publish: two publish clicks at once leave one clean published engagement", steps: "Promise.all of two publishes", expected: "both answer 200 (one 'already'); a single pub marker" }, async () => {
  const w = world({ mode: "TEST" }); const org = await organizer(w, "dp@example.com"); const id = "DBLPUB1";
  await w.call("POST", "/api/z", { id, startRound: roundAt(T + HOUR) + 1, callSeconds: 6, cap: 50 }, org.h);
  const b = { email: org.email, phone: "9811122233" };
  const rs = await Promise.all([w.call("POST", `/api/z/${id}/publish`, b, org.h), w.call("POST", `/api/z/${id}/publish`, b, org.h)]);
  expect(rs.map((r) => r.status)).toEqual([200, 200]);
  expect((w.raw.prepare("SELECT COUNT(*) c FROM kv WHERE k=?").get(`pub/${id}`) as any).c).toBe(1);
  return "ok";
});
tt({ id: "TT-11", role: "organizer", title: "settings are frozen at the start; cap cannot exceed the paid pack or fall below joined people", steps: "PATCH settings after start; cap above pack; cap below participants", expected: "409 after start; 402 above pack; 409 below people" }, async () => {
  const w = world(); const g = await paidEngagement(w, { cap: 100 });
  for (let i = 1; i <= 5; i++) await join(w, g.id, i);
  const s1 = await w.call("PATCH", `/api/z/${g.id}/settings`, { cap: 500 }, g.org.h, T), s2 = await w.call("PATCH", `/api/z/${g.id}/settings`, { cap: 3 }, g.org.h, T), s3 = await w.call("PATCH", `/api/z/${g.id}/settings`, { cap: 90 }, g.org.h, g.startMs + 1000);
  expect([s1.status, s2.status, s3.status]).toEqual([402, 409, 409]);
  return "402/409/409";
});
tt({ id: "TT-12", role: "organizer", title: "unpaid hold: a published, unpaid engagement is held at start minus 45 seconds; phones see nothing", steps: "Publish without paying; read info and control at start-60s, start-30s and start+1min", expected: "not locked at -60s; locked at -30s and later; control says locked" }, async () => {
  const w = world({ mode: "TEST" }); const org = await organizer(w, "hold@example.com"); const id = "HOLD1", start = roundAt(T + HOUR) + 1, sm = roundMs(start);
  await w.call("POST", "/api/z", { id, startRound: start, callSeconds: 6, cap: 50 }, org.h);
  await w.call("POST", `/api/z/${id}/publish`, { email: org.email, phone: "9811122233" }, org.h);
  expect((await join(w, id, 1)).status).toBe(200);
  const info = async (t: number) => j(await w.call("GET", `/api/z/${id}/info`, undefined, {}, t)), ctl = async (t: number) => j(await w.call("GET", `/api/z/${id}/control`, undefined, {}, t));
  const a = await info(sm - 60_000), b = await info(sm - 30_000), c = await info(sm + 60_000), cc = await ctl(sm - 30_000);
  expect([a.locked, b.locked, c.locked, cc.locked]).toEqual([false, true, true, true]);
  return "unlocked -60s; locked -30s/+60s; control says locked";
});
tt({ id: "TT-13", role: "organizer", title: "late payment restarts the held game about 3 minutes later for everyone waiting, seats kept", steps: "Pay 10 minutes after the start time; read info; check seats", expected: "restart time returned; unlocked; same participants" }, async () => {
  const w = world({ mode: "TEST" }); const org = await organizer(w, "late@example.com"); const id = "LATE1", start = roundAt(T + HOUR) + 1, sm = roundMs(start);
  await w.call("POST", "/api/z", { id, startRound: start, callSeconds: 6, cap: 50 }, org.h);
  await w.call("POST", `/api/z/${id}/publish`, { email: org.email, phone: "9811122233" }, org.h);
  for (let i = 1; i <= 4; i++) await join(w, id, i);
  const payAt = sm + 10 * 60_000;
  const pay = await j(await w.call("POST", "/api/payments/test", { eid: id, email: org.email, org: "Late", country: "IN" }, org.h, payAt));
  const info = await j(await w.call("GET", `/api/z/${id}/info`, undefined, {}, payAt + 5000));
  const n = (w.raw.prepare("SELECT COUNT(*) c FROM participant WHERE eid=?").get(id) as any).c;
  expect(pay.result?.restartedAtMs, J(pay)).toBeGreaterThan(payAt); expect(pay.result.restartedAtMs - payAt).toBeLessThan(6 * 60_000);
  expect(info.locked ?? false).toBe(false); expect(n).toBe(4);
  return `restart ${(pay.result.restartedAtMs - payAt) / 1000}s after payment; ${n} seats kept`;
});
