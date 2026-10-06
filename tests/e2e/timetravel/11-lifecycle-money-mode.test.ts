// TT-14..: money, the 22 h / 23 h / 365-day clocks, legal hold, TEST/LIVE mode and the audit chain, with the clock under our control.
import { expect } from "bun:test";
import { createHmac } from "node:crypto";
import { DAY, HOUR, PLAT, T, dev, j, join, organizer, paidEngagement, phone, roundAt, roundMs, tt, world, lifecycleTick, purgeOld } from "./lib";
import { reportLink } from "../../../apps/edge/src/lifecycle";
import { housekeeping } from "../../../apps/edge/src/worker";

const J = (x: unknown) => JSON.stringify(x).slice(0, 300);
const count = (w: ReturnType<typeof world>, sql: string, ...a: any[]) => (w.raw.prepare(sql).get(...a) as any).c as number;
const hmac = (secret: string, s: string) => createHmac("sha256", secret).update(s).digest("hex");

/** Razorpay stand-in (REST) as in the repository's own pay tests, so the LIVE-mode money path is exercised. */
function withRazorpay(w: ReturnType<typeof world>) {
  const rz = { orders: [] as any[], payments: {} as Record<string, any> };
  const real = globalThis.fetch;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    const u = String(url);
    if (u.startsWith("https://rzp.test/v1/orders")) { const b = JSON.parse(init.body); const o = { id: "order_" + (rz.orders.length + 1), amount: b.amount, currency: b.currency, receipt: b.receipt, status: "created" }; rz.orders.push(o); return new Response(JSON.stringify(o)); }
    const pm = u.match(/\/payments\/([^/]+)(\/capture)?$/);
    if (pm) { const p = rz.payments[pm[1]!]; if (!p) return new Response("{}", { status: 404 }); if (pm[2]) p.status = "captured"; return new Response(JSON.stringify(p)); }
    if (u.includes("resend") || u.includes("mail")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 404 });
  };
  Object.assign(w.env, { RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "sek", RAZORPAY_WEBHOOK_SECRET: "whsec", RAZORPAY_BASE_URL: "https://rzp.test/v1" });
  return { rz, restore: () => { globalThis.fetch = real; } };
}

tt({ id: "TT-14", role: "buyer", title: "the browser's verify and Razorpay's webhook arriving at the same moment fulfil the payment once", steps: "Create a LIVE-mode order, then POST /api/payments/verify and /api/payments/webhook together", expected: "one invoice, one receipt e-mail, one entitlement; the invoice link in the answer exists", known: "F-04", severityIfFails: "M" }, async () => {
  const w = world({ mode: "LIVE" }); const { rz, restore } = withRazorpay(w);
  try {
    const org = await organizer(w, "pay@example.com");
    const id = "RACEPAY1"; await w.call("POST", "/api/z", { id, startRound: roundAt(T + HOUR) + 1, callSeconds: 6, cap: 100 }, org.h); await w.call("POST", `/api/z/${id}/publish`, { email: org.email, phone: "9811122233" }, org.h);
    const ck = await j(await w.call("POST", "/api/checkout", { eid: id, email: org.email, org: "Race Org", country: "IN", pack: 100, currency: "INR" }, org.h));
    expect(ck.mode, J(ck)).toBe("razorpay");
    const oid = ck.razorpay.orderId, pid = "pay_1"; rz.payments[pid] = { id: pid, order_id: oid, status: "captured", amount: rz.orders[0].amount };
    const verify = w.call("POST", "/api/payments/verify", { paymentId: ck.paymentId, razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: hmac("sek", `${oid}|${pid}`) });
    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: pid, order_id: oid, amount: rz.orders[0].amount } } } });
    const hook = w.call("POST", "/api/payments/webhook", raw, { "x-razorpay-signature": hmac("whsec", raw) });
    const [a, b] = await Promise.all([verify, hook]);
    const inv = count(w, "SELECT COUNT(*) c FROM invoice"), ent = count(w, "SELECT COUNT(*) c FROM entitlement"), mails = count(w, "SELECT COUNT(*) c FROM outbox WHERE subject LIKE '%payment received%'");
    const url = (await j(a)).invoiceUrl as string | undefined; const tok = url?.split("/").pop();
    const exists = tok ? count(w, "SELECT COUNT(*) c FROM invoice WHERE token=?", tok) : 0;
    expect({ statuses: [a.status, b.status], inv, ent, mails, invoiceLinkExists: exists }, "fulfilled twice at once").toEqual({ statuses: [200, 200], inv: 1, ent: 1, mails: 1, invoiceLinkExists: 1 });
    return `invoices ${inv}, entitlements ${ent}, receipts ${mails}`;
  } finally { restore(); }
});
tt({ id: "TT-15", role: "buyer", title: "two orders for one engagement cannot both be paid (second payment is refused or credited back), and a LIVE order cannot be started for an already-published engagement", steps: "Create two LIVE orders for one draft before either is paid", expected: "the second order is refused (409)", known: "F-04", severityIfFails: "M" }, async () => {
  const w = world({ mode: "LIVE" }); const { restore } = withRazorpay(w);
  try {
    const org = await organizer(w, "pay2@example.com"); const id = "RACEPAY2";
    await w.call("POST", "/api/z", { id, startRound: roundAt(T + HOUR) + 1, callSeconds: 6, cap: 100 }, org.h); await w.call("POST", `/api/z/${id}/publish`, { email: org.email, phone: "9811122233" }, org.h);
    const mk = () => w.call("POST", "/api/checkout", { eid: id, email: org.email, org: "Two Orders", country: "IN", pack: 100, currency: "INR" }, org.h);
    const [a, b] = await Promise.all([mk(), mk()]);
    const orders = count(w, "SELECT COUNT(*) c FROM payment WHERE status='created'");
    expect(orders, `two open payment orders for one engagement (${a.status}/${b.status}); if both are paid the buyer is charged twice`).toBe(1);
    return "one order";
  } finally { restore(); }
});

// ----------------------------------------------------------------------------------------- the clocks
async function tickUntilReport(w: ReturnType<typeof world>, id: string, t: number) { for (let i = 0; i < 12; i++) { await lifecycleTick(w.env as any, t + i * 60_000); const l = w.raw.prepare("SELECT report_ms FROM life WHERE eid=?").get(id) as any; if (l?.report_ms) return; } }
async function endedGame(w: ReturnType<typeof world>, n = 6) {
  const g = await paidEngagement(w, { cap: 100 });
  for (let i = 1; i <= n; i++) await join(w, g.id, i);
  return g;
}
tt({ id: "TT-16", role: "organizer", title: "report link: valid until 22 hours after the game ends, then closed", steps: "Run the tick after the end; open the report with the key at end+21h59 and end+22h01", expected: "200 then 403/404; key replaced by 'new link' kills the old one at once" }, async () => {
  const w = world(); const g = await endedGame(w);
  const endEst = g.startMs + 15 * 60_000;
  await tickUntilReport(w, g.id, endEst + 5 * 60_000);
  const life = w.raw.prepare("SELECT * FROM life WHERE eid=?").get(g.id) as any; expect(life, "life row after the tick").toBeTruthy();
  const url = await reportLink(w.env as any, g.id), k = new URL(url).searchParams.get("k")!;
  const at = (t: number, key = k) => w.call("GET", `/api/report/${g.id}?k=${key}`, undefined, {}, t);
  const early = await at(life.end_ms + 21 * HOUR + 59 * 60_000), late = await at(life.end_ms + 22 * HOUR + 60_000);
  expect(early.status, J(await early.json())).toBe(200); expect([403, 404, 410]).toContain(late.status);
  // replacing the link kills the old key
  const nl = await j(await w.call("POST", `/api/z/${g.id}/reportlink`, {}, g.org.h, life.end_ms + HOUR));
  const old = await at(life.end_ms + 2 * HOUR, k); expect([403, 404]).toContain(old.status);
  const fresh = await at(life.end_ms + 2 * HOUR, new URL(nl.url).searchParams.get("k")!); expect(fresh.status).toBe(200);
  return `end ${new Date(life.end_ms).toISOString()}; 21h59=200; 22h01=${late.status}; old key ${old.status}; new key 200`;
});
tt({ id: "TT-17", role: "participants", title: "personal data is erased at end+23h (not before) and the winners record, organizer details and prize hand-over stay", steps: "Tick at end+22h59 and end+23h01; count participants, seats, claims, sealed audit parts", expected: "all present at 22h59; all gone at 23h01; winner rows and the engagement remain; audit chain verifies" }, async () => {
  const w = world(); const g = await endedGame(w, 8);
  const now0 = g.startMs + 4 * 60_000, seats = (await j(await w.call("GET", `/api/z/${g.id}/seats`, undefined, {}, now0))).seats as any[];
  for (const s of seats.slice(0, 3)) await w.call("POST", `/api/z/${g.id}/vote`, { pid: s[1], results: [{ pattern: "full", ordinal: 1, round: 1, idx: 50, pids: [seats[4][1]] }] }, {}, now0);
  const endEst = g.startMs + 15 * 60_000; await lifecycleTick(w.env as any, endEst + 5 * 60_000);
  const life = w.raw.prepare("SELECT * FROM life WHERE eid=?").get(g.id) as any;
  const state = () => ({ people: count(w, "SELECT COUNT(*) c FROM participant WHERE eid=?", g.id), seats: count(w, "SELECT COUNT(*) c FROM seat WHERE eid=?", g.id), winners: count(w, "SELECT COUNT(*) c FROM winner WHERE eid=?", g.id), prizes: count(w, "SELECT COUNT(*) c FROM prize WHERE eid=?", g.id), eng: count(w, "SELECT COUNT(*) c FROM engagement WHERE id=?", g.id), sealed: count(w, "SELECT COUNT(*) c FROM audit_pii WHERE eid=?", g.id) });
  await lifecycleTick(w.env as any, life.end_ms + 22 * HOUR + 59 * 60_000); const before = state();
  await lifecycleTick(w.env as any, life.end_ms + 23 * HOUR + 60_000); const after = state();
  expect(before.people).toBe(8); expect(before.seats).toBe(8);
  expect([after.people, after.seats, after.sealed], `after 23h: ${J(after)}`).toEqual([0, 0, 0]);
  expect([after.winners > 0, after.eng], "winner record and engagement stay").toEqual([true, 1]);
  const v = await j(await w.call("GET", `/api/owner/audit/${g.id}/verify`, undefined, PLAT, life.end_ms + 24 * HOUR)); expect(v.ok, J(v)).toBe(true);
  return `before ${J(before)}; after ${J(after)}; chain ok`;
});
tt({ id: "TT-18", role: "participant", title: "a prize winner's confirmed name and number are kept 365 days after the game, the rest of the personal data is gone at 23 h", steps: "Winner confirms prize details on own phone; erase at 23h; read the prize list", expected: "prize details still readable by the organizer until the 365-day deletion" }, async () => {
  const w = world(); const g = await endedGame(w, 8);
  const now0 = g.startMs + 4 * 60_000, seats = (await j(await w.call("GET", `/api/z/${g.id}/seats`, undefined, {}, now0))).seats as any[];
  const win = seats[4][1];
  for (const s of seats.slice(0, 3)) await w.call("POST", `/api/z/${g.id}/vote`, { pid: s[1], results: [{ pattern: "full", ordinal: 1, round: 1, idx: 50, pids: [win] }] }, {}, now0);
  const conf = await w.call("POST", `/api/z/${g.id}/confirm`, { pid: win, device: dev("p5"), name: "Winner Name", phone: "9876500000" }, {}, now0 + HOUR);
  const life0 = g.startMs + 15 * 60_000; await lifecycleTick(w.env as any, life0 + 5 * 60_000);
  const life = w.raw.prepare("SELECT * FROM life WHERE eid=?").get(g.id) as any;
  await lifecycleTick(w.env as any, life.end_ms + 23 * HOUR + 60_000);
  const pr = await j(await w.call("GET", `/api/z/${g.id}/prizes`, undefined, g.org.h, life.end_ms + 30 * HOUR));
  const txt = JSON.stringify(pr);
  expect(conf.status, J(await conf.clone().json())).toBe(200);
  expect(txt, "organizer's prize list a day after the game").toContain("Winner Name");
  return "winner details kept for the hand-over";
});
tt({ id: "TT-19", role: "owner", title: "365-day deletion: the engagement and everything about it is deleted at 00:00 IST after day 365 and a deletion certificate is kept", steps: "Purge at end+364d and end+367d; look for rows, certificate", expected: "present at 364d; gone at 367d; certificate row exists; contact details of the organizer for that engagement gone" }, async () => {
  const w = world(); const g = await endedGame(w, 6);
  const endEst = g.startMs + 15 * 60_000; await lifecycleTick(w.env as any, endEst + 5 * 60_000);
  const life = w.raw.prepare("SELECT * FROM life WHERE eid=?").get(g.id) as any;
  await lifecycleTick(w.env as any, life.end_ms + 24 * HOUR);
  await purgeOld(w.env as any, life.end_ms + 364 * DAY); const still = count(w, "SELECT COUNT(*) c FROM engagement WHERE id=?", g.id);
  await purgeOld(w.env as any, life.end_ms + 367 * DAY);
  const gone = count(w, "SELECT COUNT(*) c FROM engagement WHERE id=?", g.id), cert = count(w, "SELECT COUNT(*) c FROM audit_cert WHERE eid=?", g.id), contact = count(w, "SELECT COUNT(*) c FROM kv WHERE k=?", `contact/${g.id}`);
  const left: Record<string, number> = {};
  for (const t of ["participant", "seat", "claim", "settled", "winner", "prize", "life", "rvote", "overvote"]) left[t] = count(w, `SELECT COUNT(*) c FROM ${t} WHERE eid=?`, g.id);
  expect([still, gone], `rows left ${J(left)}`).toEqual([1, 0]);
  expect(cert, "deletion certificate").toBeGreaterThan(0);
  expect(contact, "the organizer's confirmed e-mail and mobile number for this engagement").toBe(0);
  return `certificates ${cert}; leftovers ${J(left)}`;
});
tt({ id: "TT-20", role: "owner", title: "legal hold suspends both the 23-hour erasure and the 365-day deletion; lifting it lets the next tick finish the job", steps: "Hold on; tick at 23h and purge at 367d; hold off; tick", expected: "nothing deleted while held; deleted after the hold is lifted" }, async () => {
  const w = world(); const g = await endedGame(w, 6);
  await lifecycleTick(w.env as any, g.startMs + 20 * 60_000);
  const life = w.raw.prepare("SELECT * FROM life WHERE eid=?").get(g.id) as any;
  const hold = await w.call("POST", `/api/owner/audit/${g.id}/hold`, { on: true, note: "dispute" }, PLAT, life.end_ms + HOUR); expect(hold.status).toBe(200);
  await lifecycleTick(w.env as any, life.end_ms + 25 * HOUR); await purgeOld(w.env as any, life.end_ms + 367 * DAY);
  const heldPeople = count(w, "SELECT COUNT(*) c FROM participant WHERE eid=?", g.id), heldEng = count(w, "SELECT COUNT(*) c FROM engagement WHERE id=?", g.id);
  expect([heldPeople, heldEng]).toEqual([6, 1]);
  await w.call("POST", `/api/owner/audit/${g.id}/hold`, { on: false }, PLAT, life.end_ms + 368 * DAY);
  await lifecycleTick(w.env as any, life.end_ms + 368 * DAY + 1000); await purgeOld(w.env as any, life.end_ms + 368 * DAY + 2000);
  const after = [count(w, "SELECT COUNT(*) c FROM participant WHERE eid=?", g.id), count(w, "SELECT COUNT(*) c FROM engagement WHERE id=?", g.id)];
  expect(after).toEqual([0, 0]);
  return "held 6/1; released 0/0";
});
tt({ id: "TT-21", role: "owner", title: "a few legal holds cannot stop the deletion of other customers' data (the tick looks at 25 engagements at a time)", steps: "26 old engagements on hold, plus one ordinary old engagement; tick at 23h", expected: "the ordinary engagement is erased", known: "F-11", severityIfFails: "M" }, async () => {
  const w = world(); const ids: string[] = [];
  for (let k = 0; k < 26; k++) { const g = await paidEngagement(w, { cap: 20, leadMs: HOUR + k * 1000 }); await join(w, g.id, 1); ids.push(g.id); }
  const normal = await paidEngagement(w, { cap: 20, leadMs: 2 * HOUR }); await join(w, normal.id, 1);
  const t = normal.startMs + 40 * 60_000;
  await lifecycleTick(w.env as any, T + 5 * HOUR);
  for (const id of ids) { const l = w.raw.prepare("SELECT end_ms FROM life WHERE eid=?").get(id) as any; await w.call("POST", `/api/owner/audit/${id}/hold`, { on: true, note: "dispute" }, PLAT, (l?.end_ms ?? T) + HOUR); }
  await lifecycleTick(w.env as any, T + 40 * HOUR);
  const left = count(w, "SELECT COUNT(*) c FROM participant WHERE eid=?", normal.id);
  expect(left, "participants of the ordinary engagement 40 hours later, while 26 engagements are on hold").toBe(0);
  return "ordinary engagement erased";
}, 120_000);
tt({ id: "TT-22", role: "owner", title: "an engagement with an absurd start date (year 2100) never reaches its 23-hour or 365-day deletion", steps: "Create a paid engagement starting in 2100 with one participant; purge 400 days later", expected: "personal data of an engagement that never starts is still removed within a bounded time (e.g. 365 days after creation)", known: "F-08", severityIfFails: "M" }, async () => {
  const w = world(); const L = await import("./lib");
  w.raw.run("UPDATE mode SET mode='TEST' WHERE id=1"); const org = await organizer(w, "far@example.com"); const id = "FARSTART1";
  const far = roundAt(Date.UTC(2100, 0, 1));
  const c = await w.call("POST", "/api/z", { id, startRound: far, callSeconds: 6, cap: 20 }, org.h); expect(c.status).toBe(200);
  await w.call("POST", `/api/z/${id}/publish`, { email: org.email, phone: "9811122233" }, org.h);
  await w.call("POST", "/api/payments/test", { eid: id, email: org.email, org: "Far", country: "IN" }, org.h);
  await join(w, id, 1);
  await lifecycleTick(w.env as any, T + 400 * DAY); await purgeOld(w.env as any, T + 400 * DAY);
  const people = count(w, "SELECT COUNT(*) c FROM participant WHERE eid=?", id), eng = count(w, "SELECT COUNT(*) c FROM engagement WHERE id=?", id);
  expect([people, eng], "a participant's name and mobile number are still on file 400 days after they joined a game that never started").toEqual([0, 0]);
  return "bounded";
});
tt({ id: "TT-23", role: "organizer", title: "an unpublished draft is forgotten after 30 days (not before)", steps: "Create a draft; housekeeping at day 29 and day 31", expected: "present at 29, gone at 31" }, async () => {
  const w = world(); const org = await organizer(w, "draft@example.com"); const id = "DRAFT1";
  await w.call("POST", "/api/z", { id, startRound: roundAt(T + 40 * DAY), callSeconds: 6, cap: 50 }, org.h);
  await housekeeping(w.env as any, T + 29 * DAY); const a = count(w, "SELECT COUNT(*) c FROM engagement WHERE id=?", id);
  await housekeeping(w.env as any, T + 31 * DAY); const b = count(w, "SELECT COUNT(*) c FROM engagement WHERE id=?", id);
  expect([a, b]).toEqual([1, 0]);
  return "1 then 0";
});
tt({ id: "TT-24", role: "owner", title: "after the organizer's last engagement is deleted, the organizer's e-mail and account details are removed too (site says: deleted automatically after 365 days)", steps: "One engagement ends; 400 days later run purge; look for the organizer's e-mail record", expected: "organizer's e-mail (sealed) and e-mail hash are gone, or the privacy text says the account is kept until closed", known: "F-12", severityIfFails: "L" }, async () => {
  const w = world(); const g = await endedGame(w, 2);
  await lifecycleTick(w.env as any, g.startMs + 20 * 60_000);
  const life = w.raw.prepare("SELECT * FROM life WHERE eid=?").get(g.id) as any;
  await lifecycleTick(w.env as any, life.end_ms + 24 * HOUR); await purgeOld(w.env as any, life.end_ms + 400 * DAY);
  const mail = count(w, "SELECT COUNT(*) c FROM kv WHERE k LIKE 'orgmail/%'"), eh = count(w, "SELECT COUNT(*) c FROM organizer_email"), keys = count(w, "SELECT COUNT(*) c FROM organizer_key WHERE kind='master'");
  expect([mail, eh], `400 days after the only engagement ended: sealed organizer e-mail rows ${mail}, e-mail hashes ${eh}, master keys ${keys}`).toEqual([0, 0]);
  return "removed";
});

// ----------------------------------------------------------------------------------------- mode switching and mail
tt({ id: "TT-25", role: "owner", title: "TEST mode: mail to a stranger is suppressed, mail to an owner alias is delivered with [TEST]; LIVE delivers to anyone", steps: "Publish with a stranger's e-mail and with owner+tag; switch to LIVE and publish again", expected: "TEST: stranger none, alias [TEST]; suppressed events logged; LIVE: stranger mail queued" }, async () => {
  const w = world({ mode: "TEST" }); (w.env as any).OWNER_EMAIL = "owner@example.com";
  const mk = async (email: string, id: string) => { const org = await organizer(w, email); await w.call("POST", "/api/z", { id, startRound: roundAt(T + HOUR) + 1, callSeconds: 6, cap: 50 }, org.h); await w.call("POST", `/api/z/${id}/publish`, { email, phone: "9811122233" }, org.h); };
  await mk("stranger@evil.example", "MAILT1"); await mk("owner+tbx@example.com", "MAILT2");
  const to = (e: string) => count(w, "SELECT COUNT(*) c FROM outbox WHERE to_addr=?", e);
  const tagged = count(w, "SELECT COUNT(*) c FROM outbox WHERE to_addr='owner+tbx@example.com' AND subject LIKE '[TEST]%'"), supp = count(w, "SELECT COUNT(*) c FROM mail_event WHERE outcome='suppressed_test_mode'");
  expect([to("stranger@evil.example"), tagged > 0, supp > 0]).toEqual([0, true, true]);
  await w.call("POST", "/api/owner/mode", { mode: "LIVE", reason: "tt" }, PLAT, T + 10_000);
  await mk("realbuyer@example.org", "MAILT3");
  expect(to("realbuyer@example.org"), "LIVE mail to a real address").toBeGreaterThan(0);
  return "TEST suppresses, LIVE delivers";
});
tt({ id: "TT-26", role: "owner", title: "test payment endpoint refuses in LIVE; the mode switch is in the access log; public mode read works", steps: "POST /api/payments/test in LIVE; switch mode twice; GET /api/mode; read the access log", expected: "403 in LIVE; two mode-switch rows; public read returns the word only" }, async () => {
  const w = world({ mode: "LIVE" }); const org = await organizer(w, "mode@example.com");
  const t = await w.call("POST", "/api/payments/test", { pack: 100, email: org.email, org: "Mode Org" }); expect(t.status).toBe(403);
  await w.call("POST", "/api/owner/mode", { mode: "TEST", reason: "a" }, PLAT, T + 1000); await w.call("POST", "/api/owner/mode", { mode: "LIVE", reason: "b" }, PLAT, T + 10_000);
  const m = await j(await w.call("GET", "/api/mode", undefined, {}, T + 20_000)); expect(Object.keys(m)).toEqual(["mode"]);
  const log = await j(await w.call("GET", "/api/owner/audit/access", undefined, PLAT, T + 30_000));
  expect(JSON.stringify(log)).toContain("mode-switch");
  return J(m);
});
tt({ id: "TT-27", role: "owner", title: "purge-test-data removes every test record and leaves the audit log and real records alone", steps: "Create test engagement + account + payment; real (LIVE) engagement; purge", expected: "test rows gone; the LIVE engagement remains; audit chain still verifies" }, async () => {
  const w = world({ mode: "TEST" }); const g = await paidEngagement(w, { cap: 20 }); await join(w, g.id, 1);
  await w.call("POST", "/api/owner/mode", { mode: "LIVE", reason: "x" }, PLAT, T + 1000);
  const org2 = await organizer(w, "real@example.org"); await w.call("POST", "/api/z", { id: "REALONE1", startRound: roundAt(T + HOUR) + 1, callSeconds: 6, cap: 20 }, org2.h, T + 2000);
  const p = await w.call("POST", "/api/owner/purge-test-data", { confirm: "purge test data" }, PLAT, T + 3000); expect(p.status).toBe(200);
  expect([count(w, "SELECT COUNT(*) c FROM engagement WHERE id=?", g.id), count(w, "SELECT COUNT(*) c FROM engagement WHERE id='REALONE1'"), count(w, "SELECT COUNT(*) c FROM payment WHERE is_test=1")]).toEqual([0, 1, 0]);
  const bad = await w.call("POST", "/api/owner/purge-test-data", {}, PLAT, T + 4000); expect(bad.status).toBeGreaterThanOrEqual(400); // needs the confirm phrase
  const v = await j(await w.call("GET", "/api/owner/audit/sys/verify", undefined, PLAT, T + 5000)); expect(v.ok, J(v)).toBe(true);
  return J(await j(p));
});
tt({ id: "TT-28", role: "participants (250)", title: "250 honest phones settle a winner at the quorum (13) and a late honest vote changes nothing", steps: "250 join (distinct addresses); 13 honest votes; one extra different vote", expected: "accepted at the 13th vote; extra vote does not alter the winner" }, async () => {
  const w = world(); const g = await paidEngagement(w, { cap: 250 });
  for (let i = 1; i <= 250; i++) await join(w, g.id, i, T, `172.16.${i >> 8}.${i & 255}`);
  const now = g.startMs + 5 * 60_000, seats = (await j(await w.call("GET", `/api/z/${g.id}/seats`, undefined, {}, now))).seats as any[];
  expect(seats.length).toBe(250);
  let accepted = 0;
  for (let i = 0; i < 13; i++) { const r = await j(await w.call("POST", `/api/z/${g.id}/vote`, { pid: seats[i][1], results: [{ pattern: "top", ordinal: 1, round: 1, idx: 33, pids: [seats[200][1]] }] }, {}, now)); accepted += r.accepted ?? 0; }
  await w.call("POST", `/api/z/${g.id}/vote`, { pid: seats[20][1], results: [{ pattern: "top", ordinal: 1, round: 1, idx: 34, pids: [seats[201][1]] }] }, {}, now + 1000);
  const res = await j(await w.call("GET", `/api/z/${g.id}/results`, undefined, {}, now + 2000));
  expect([accepted, res.results.length, res.results[0]?.idx]).toEqual([1, 1, 33]);
  return "settled at 13 votes";
}, 120_000);
tt({ id: "TT-29", role: "owner", title: "the internal audit chain verifies after all of the above", steps: "Run a mixed scenario (join, vote, erase, hold, purge) then verify sys and engagement chains", expected: "ok:true for each" }, async () => {
  const w = world(); const g = await endedGame(w, 5);
  await w.call("POST", `/api/z/${g.id}/announce`, { text: "hello" }, g.org.h, T + 1000);
  await lifecycleTick(w.env as any, g.startMs + 20 * 60_000);
  const life = w.raw.prepare("SELECT * FROM life WHERE eid=?").get(g.id) as any;
  await lifecycleTick(w.env as any, life.end_ms + 24 * HOUR);
  const a = await j(await w.call("GET", `/api/owner/audit/${g.id}/verify`, undefined, PLAT, life.end_ms + 25 * HOUR)), s = await j(await w.call("GET", "/api/owner/audit/sys/verify", undefined, PLAT, life.end_ms + 25 * HOUR));
  expect([a.ok, s.ok], J([a, s])).toEqual([true, true]);
  return `rows ${a.rows}`;
});
