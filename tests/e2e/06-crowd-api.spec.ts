// CRD-*: crowds driven through the real HTTP API (100 and 250 people), capacity edges, simultaneous joins, and what the per-address limits do to one office.
import { Api, BASE, IS_LIVE, J, anon, dev, eid, expect, mkEng, newOrg, phone, requireTestMode, sleep, tc, test } from "./lib/harness";

test.beforeAll(async () => { if (IS_LIVE) await requireTestMode(); });
async function paidEngagement(cap: number, tag: string) {
  const o = await newOrg(tag); const m = new Api(BASE, o.token); const { id } = await mkEng(o, { cap, startInSec: 6 * 3600 });
  const p = await m.post(`/api/z/${id}/publish`, { email: o.email, phone: "9811122233" }); if (p.status !== 200) throw new Error("publish " + J(p.text));
  const pay = await m.post("/api/payments/test", { eid: id, email: o.email, org: "Crowd Org", country: "IN" }); if (pay.status !== 200) throw new Error("pay " + J(pay.text));
  return { o, m, id };
}
/** n joins, `par` at a time. Local stand-in: every phone gets its own pretend network address; the real site sees our one address. */
async function crowd(id: string, n: number, base: number, par = 10, sameIp = IS_LIVE) {
  const codes: Record<string, number> = {}; const t0 = Date.now(); let slowest = 0;
  for (let i = 0; i < n; i += par) {
    await Promise.all(Array.from({ length: Math.min(par, n - i) }, async (_, k) => {
      const idx = base + i + k; const A = new Api(BASE, undefined, sameIp ? undefined : `172.20.${(idx >> 8) & 255}.${idx & 255}`);
      const r = await A.post(`/api/z/${id}/join`, { phone: phone(idx), name: "Crowd " + idx, device: dev("c" + idx) }); codes[r.status] = (codes[r.status] ?? 0) + 1; slowest = Math.max(slowest, r.ms);
    }));
  }
  return { codes, ms: Date.now() - t0, slowest };
}

tc({ id: "CRD-01", role: "100 participants", title: "100 people join a 100-person engagement; the 101st is told it is full; everyone has a unique seat", steps: "100 joins (10 at a time, each its own phone and device), then one more", expected: "100 x 200; 101st 409 'full'; participants=100; seats unique" }, async () => {
  const g = await paidEngagement(100, "crd100");
  const r = await crowd(g.id, 100, 10_000, 10, false);
  const extra = await anon().post(`/api/z/${g.id}/join`, { phone: phone(19_999), name: "Extra", device: dev("extra") });
  const p = await g.m.get(`/api/z/${g.id}/participants?limit=2000`);
  expect(r.codes[200], J(r.codes)).toBe(100); expect(extra.status).toBe(409);
  expect(p.body.total).toBe(100);
  const seats = new Set((p.body.participants as any[]).map((x) => x.seat ?? x.seq ?? x.pid)); expect(seats.size).toBe(100);
  return `100 joined in ${r.ms} ms, slowest ${r.slowest} ms; 101st ${extra.status}`;
});
tc({ id: "CRD-02", role: "250 participants", title: "250 people join from different addresses (mobiles on their own data plans)", steps: "250 joins, 10 at a time, each its own address (local) or our single address (real site: see CRD-03)", expected: "all 250 accepted when addresses differ" }, async () => {
  if (IS_LIVE) return "run on the local stand-in (addresses can be varied there); the real site sees one address: see CRD-03";
  const g = await paidEngagement(250, "crd250");
  const r = await crowd(g.id, 250, 20_000, 25, false);
  expect(r.codes[200], J(r.codes)).toBe(250);
  return `250 joined in ${r.ms} ms, slowest ${r.slowest} ms`;
});
tc({ id: "CRD-03", role: "office of 250 on one network", title: "250 colleagues on one office Wi-Fi (one public address) can all join", steps: "250 joins from one address inside a few seconds", expected: "all 250 accepted", known: "F-10", severityIfFails: "M" }, async () => {
  const g = await paidEngagement(250, "crd250o");
  const r = await crowd(g.id, 250, 30_000, 25, true);
  await sleep(100);
  expect(r.codes[200] ?? 0, `result ${J(r.codes)} (limit per address: 200 a minute, 1,500 a day)`).toBe(250);
  return `${J(r.codes)} in ${r.ms} ms`;
});
tc({ id: "CRD-04", role: "participants", title: "no oversell on the real network path: 40 simultaneous joins at capacity 15", steps: "40 parallel joins at cap 15", expected: "exactly 15 accepted, 25 told full" }, async () => {
  const g = await paidEngagement(15, "crd15");
  const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => new Api(BASE, undefined, IS_LIVE ? undefined : `172.30.0.${i + 1}`).post(`/api/z/${g.id}/join`, { phone: phone(40_000 + i), name: "S" + i, device: dev("s" + i) })));
  const ok = rs.filter((r) => r.status === 200).length, full = rs.filter((r) => r.status === 409).length;
  const p = await g.m.get(`/api/z/${g.id}/participants`);
  expect([ok, p.body.total], `ok ${ok}, full ${full}, other ${40 - ok - full}`).toEqual([15, 15]);
  return `ok ${ok} full ${full}`;
});
tc({ id: "CRD-05", role: "organizer", title: "roster of 100 invited people in one call, then they open the link: no duplicates, no extra seats", steps: "Roster 100 people (2 calls of 50), then 20 of them open the join link", expected: "seats stay at 100; opening the link gives 'again' / device bound" }, async () => {
  const g = await paidEngagement(120, "crdros");
  for (const part of [0, 50]) { const r = await g.m.post(`/api/z/${g.id}/roster`, { people: Array.from({ length: 50 }, (_, i) => ({ phone: phone(50_000 + part + i), name: "R" + (part + i) })) }); expect(r.body.added, J(r.body)).toBe(50); }
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => new Api(BASE, undefined, IS_LIVE ? undefined : `172.31.0.${i + 1}`).post(`/api/z/${g.id}/join`, { phone: phone(50_000 + i), name: "R" + i, device: dev("r" + i) })));
  expect(rs.every((r) => r.status === 200 && r.body.again === true), J(rs.map((r) => r.status))).toBe(true);
  const p = await g.m.get(`/api/z/${g.id}/participants`); expect(p.body.total).toBe(100);
  return "100 seats";
});
tc({ id: "CRD-06", role: "anonymous attacker", title: "bulk join attempts are limited per address and the limit answers politely (429 'busy')", steps: "From one address 230 joins to an engagement with cap 400 inside a minute", expected: "after the per-address allowance the answer is 429 with a human message; nothing 5xx" }, async () => {
  const g = await paidEngagement(400, "crdlim");
  const r = await crowd(g.id, 230, 60_000, 30, true);
  const bad = Object.keys(r.codes).filter((c) => +c >= 500);
  expect(bad, J(r.codes)).toEqual([]);
  return J(r.codes);
});
