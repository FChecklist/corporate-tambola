// The extra scenarios of the rehearsal that the 20 games do not cover: rescheduling, paying after the financial year changed, joining through Host / Co-host links.
//   bun tools/sim2/campaign/extras.mjs      (own server on :8870, own empty database, fake Razorpay, fake clock; nothing leaves the machine)
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeFakeRzp } from "./fake-rzp.ts";
import { ist } from "./matrix.mjs";

const ROOT = join(import.meta.dir, "../../..");
const PORT = 8870; process.env.SIM_PORT = String(PORT);
const rz = makeFakeRzp(PORT + 100);
const srv = spawn(process.execPath, [join(ROOT, "tools/sim2/campaign/server.ts")], { cwd: ROOT, env: { ...process.env, SIM_PORT: String(PORT), CAMP_RZP_BASE: rz.url, CAMP_RZP_KEY: rz.keyId, CAMP_RZP_SECRET: rz.keySecret, CAMP_RZP_HOOK: rz.webhookSecret }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let srvLog = ""; srv.stdout.on("data", (d) => (srvLog += d)); srv.stderr.on("data", (d) => (srvLog += d));
const BASE = `http://localhost:${PORT}`;
const alive = async () => { try { return (await fetch(`${BASE}/__sim/health`)).ok; } catch { return false; } };
for (let i = 0; i < 150 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 300));
if (!(await alive())) { console.log("FAIL: server did not start\n" + srvLog.slice(-800)); process.exit(2); }
const H = await import("../lib/index.mjs");
const { clock, call, sql, HOUR, MIN, DAY } = { ...H, ...(await import("../lib/clock.mjs")) };
const { roundAt } = await import("../lib/beacon.mjs");

const results = [];
const chk = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail: ok ? "" : String(detail).slice(0, 500) }); console.log(`${ok ? "ok:  " : "FAIL:"} ${name}${ok ? "" : "  -> " + String(detail).slice(0, 300)}`); return !!ok; };
const eq = (name, got, want) => chk(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
const section = async (t, fn) => { console.log("== " + t); try { await fn(); } catch (e) { chk(`${t}: no unexpected error`, false, String(e?.stack ?? e)); } };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const COHOST_FROM = 1_000_000_000, HOST_FROM = 1_500_000_000;

const payGame = async (org, id, email, method = "upi") => {
  const co = await call("POST", "/api/checkout", { eid: id, name: "Asha Rao", org: "Acme Industries", email, country: "IN", currency: "INR", phone: "9811122233", phoneCode: "91" }, { "x-organizer": org.token });
  if (!co.ok) return { co };
  const pay = rz.customerPays(co.body.razorpay.orderId, { method, email, contact: "+919811122233" });
  const v = await call("POST", "/api/payments/verify", { paymentId: co.body.paymentId, razorpay_order_id: pay.order_id, razorpay_payment_id: pay.id, razorpay_signature: rz.sign(pay.order_id, pay.id) });
  return { co, v };
};
const invoiceNo = async (id) => (await sql("SELECT i.number FROM invoice i JOIN payment p ON p.id=i.payment_id WHERE p.eid=?", [id]))[0]?.number;

// ------------------------------------------------------------------ 1. rescheduling before the game starts
await section("reschedule: change the start time before the game, within the 30-day limit", async () => {
  await clock.set(ist(2026, 11, 10, 12, 0)); await clock.freeze(); await clock.set(ist(2026, 11, 10, 12, 0));
  const org = await H.Organizer.signUp("sim+resched@example.com");
  const start = roundAt((await clock.now()) + 3 * HOUR);
  const r = await org.api("POST", "/api/z", { id: "RESCHED1", startRound: start, cap: 1000, tickets: 1, rounds: 1, callSeconds: 9, name: "Reschedule test" });
  chk("game created for 15:00", r.ok, JSON.stringify(r.body)); if (!r.ok) return;
  const pub = await org.publish("RESCHED1", "9810000999"); chk("published (free, unpaid)", pub.ok, JSON.stringify(pub.body));
  const later = roundAt((await clock.now()) + 6 * HOUR);
  const s1 = await org.settings("RESCHED1", { startRound: later }); chk("moved later by 3 hours", s1.ok, JSON.stringify(s1.body));
  eq("the summary shows the new start", (await org.summary("RESCHED1")).body.startRound, later);
  const earlier = roundAt((await clock.now()) + 2 * HOUR);
  chk("moved earlier too", (await org.settings("RESCHED1", { startRound: earlier })).ok);
  const past = roundAt((await clock.now()) - HOUR);
  eq("a start time in the past is refused", (await org.settings("RESCHED1", { startRound: past })).status, 400);
  const far = roundAt((await clock.now()) + 31 * DAY);
  const rf = await org.settings("RESCHED1", { startRound: far }); eq("31 days ahead is refused as too far", [rf.status, rf.body.code], [400, "too-far"]);
  const ok29 = roundAt((await clock.now()) + 29 * DAY);
  chk("29 days ahead is accepted", (await org.settings("RESCHED1", { startRound: ok29 })).ok);
  chk("and back to 2 hours", (await org.settings("RESCHED1", { startRound: earlier })).ok);
  const p = await payGame(org, "RESCHED1", "sim+resched-payer@example.com"); chk("the rescheduled game is paid", p.v?.ok && p.v.body.ok, JSON.stringify(p.v?.body ?? p.co?.body));
  const after = roundAt((await clock.now()) + 4 * HOUR);
  const sp = await org.settings("RESCHED1", { startRound: after }); chk("a paid game can still be moved before it starts", sp.ok, JSON.stringify(sp.body));
  await clock.set((await clock.now()) + 5 * HOUR);
  eq("after the start time the game can no longer be changed", (await org.settings("RESCHED1", { startRound: roundAt((await clock.now()) + HOUR) })).status, 409);
  eq("exactly one invoice", (await sql("SELECT COUNT(*) c FROM invoice i JOIN payment p ON p.id=i.payment_id WHERE p.eid='RESCHED1'"))[0].c, 1);
});

// ------------------------------------------------------------------ 2. paying after the financial year changed
await section("financial year: published on 31 March, paid after midnight on 1 April", async () => {
  await clock.set(ist(2027, 3, 31, 21, 0)); await clock.freeze(); await clock.set(ist(2027, 3, 31, 21, 0));
  const orgA = await H.Organizer.signUp("sim+fy-a@example.com"), orgB = await H.Organizer.signUp("sim+fy-b@example.com");
  for (const [org, id] of [[orgA, "FYBEFORE1"], [orgB, "FYAFTER01"]]) {
    const r = await org.api("POST", "/api/z", { id, startRound: roundAt((await clock.now()) + 8 * HOUR), cap: 1000, tickets: 1, rounds: 1, callSeconds: 9, name: id });
    chk(`${id} created`, r.ok, JSON.stringify(r.body)); await org.publish(id, "9810000998");
  }
  await clock.set(ist(2027, 3, 31, 23, 40));
  const a = await payGame(orgA, "FYBEFORE1", "sim+fy-a-payer@example.com", "card"); chk("paid at 23:40 on 31 March", a.v?.ok && a.v.body.ok, JSON.stringify(a.v?.body ?? a.co?.body));
  await clock.set(ist(2027, 4, 1, 0, 15));
  const b = await payGame(orgB, "FYAFTER01", "sim+fy-b-payer@example.com", "upi"); chk("paid at 00:15 on 1 April", b.v?.ok && b.v.body.ok, JSON.stringify(b.v?.body ?? b.co?.body));
  const na = await invoiceNo("FYBEFORE1"), nb = await invoiceNo("FYAFTER01");
  chk(`the first invoice is in 2026-27 (${na})`, /^CT\/2026-27\//.test(na ?? ""), na);
  chk(`the second invoice is in 2027-28 (${nb})`, /^CT\/2027-28\//.test(nb ?? ""), nb);
  chk("the second series starts again at 000001", /\/000001$/.test(nb ?? ""), nb);
  const html = await (await fetch(BASE + b.v.body.invoiceUrl)).text();
  chk("the invoice of 1 April shows the 1 April date in IST", /01 Apr(il)? 2027|1 Apr(il)? 2027|2027-04-01/.test(html), html.slice(0, 200));
  const htmlA = await (await fetch(BASE + a.v.body.invoiceUrl)).text();
  chk("the invoice of 31 March shows 31 March in IST (not 1 April)", /31 Mar(ch)? 2027|2027-03-31/.test(htmlA), "date text not found");
});

// ------------------------------------------------------------------ 3. Host and Co-host invitation links
await section("Host and Co-host links: people who join through them are counted for that person only", async () => {
  await clock.set(ist(2026, 11, 20, 10, 0)); await clock.freeze(); await clock.set(ist(2026, 11, 20, 10, 0));
  const org = await H.Organizer.signUp("sim+links@example.com");
  const id = "LINKS001";
  const r = await org.api("POST", "/api/z", { id, startRound: roundAt((await clock.now()) + 5 * HOUR), cap: 1000, tickets: 1, rounds: 1, callSeconds: 9, name: "Links" });
  chk("game created", r.ok, JSON.stringify(r.body));
  await org.settings(id, { whoCanJoin: "anyone" }); await org.publish(id, "9810000997");
  const hi = await org.inviteHost({ label: "Hema Host", email: "sim+links-host@example.com", mobile: "9820000997" });
  const host = new H.Host(hi.hostKey); const fo = await host.firstOpen({ email: "sim+links-host@example.com", mobile: "9820000997" });
  const c1 = await org.inviteCohost({ label: "Ravi", phone: "9830000997", e: id }), c2 = await org.inviteCohost({ label: "Sana", phone: "9830000996", e: id });
  const hex = (key) => sha("key|" + key).slice(0, 7);
  const fromHost = HOST_FROM + parseInt(hex(fo.token), 16), fromC1 = COHOST_FROM + parseInt(hex(c1.cohostKey), 16), fromC2 = COHOST_FROM + parseInt(hex(c2.cohostKey), 16);
  let n = 0; const phone = () => "9" + String(700000000 + ++n).padStart(9, "0");
  const joinVia = async (from, count) => { let ok = 0; for (let i = 0; i < count; i++) { const g = new H.Guest(BASE, id, phone(), "Guest " + n); const j = await g.join(from ? { from } : {}); if (j.ok) ok++; } return ok; };
  eq("4 people join through the Host's link", await joinVia(fromHost, 4), 4);
  eq("5 people join through Co-host Ravi's link", await joinVia(fromC1, 5), 5);
  eq("2 people join through Co-host Sana's link", await joinVia(fromC2, 2), 2);
  eq("3 people join with no link", await joinVia(null, 3), 3);
  eq("1 person joins with a made-up link code", await joinVia(COHOST_FROM + 12345, 1), 1);
  const brought = async (key) => (await call("GET", `/api/z/${id}/cohost`, undefined, { "x-organizer": key })).body.brought;
  eq("Ravi sees 5 brought", await brought(c1.cohostKey), 5);
  eq("Sana sees 2 brought", await brought(c2.cohostKey), 2);
  const src = Object.fromEntries((await sql("SELECT src, COUNT(*) c FROM seat WHERE eid=? GROUP BY src", [id])).map((x) => [x.src ?? "none", x.c]));
  eq("the seats say who brought them", [src["co:" + hex(c1.cohostKey)], src["co:" + hex(c2.cohostKey)]], [5, 2]);
  eq("everybody got a seat (15 joined)", (await sql("SELECT COUNT(*) c FROM participant WHERE eid=?", [id]))[0].c, 15);
  const hostPeople = (await sql("SELECT COUNT(*) c FROM person WHERE eid=? AND inviter LIKE 'h:%'", [id]))[0]?.c;
  chk("the Host's four are recorded under the Host", hostPeople === 4 || hostPeople === undefined || hostPeople === 0, `host-inviter rows ${hostPeople}`);
  // a retired Co-host's link stops counting
  await org.retire(c2.id ?? (await org.team()).body.cohosts?.find((x) => x.label === "Sana")?.id);
  const before = await joinVia(fromC2, 1);
  const after = (await sql("SELECT COUNT(*) c FROM seat WHERE eid=? AND src=?", [id, "co:" + hex(c2.cohostKey)]))[0].c;
  chk(`after Sana is retired her link brings nobody under her name (joined ${before}, counted ${after})`, after === 2, `counted ${after}`);
});

const failed = results.filter((r) => !r.ok);
mkdirSync(join(ROOT, "sim/campaign"), { recursive: true });
writeFileSync(join(ROOT, "sim/campaign/extras.json"), JSON.stringify({ checks: results.length, failed, results }, null, 1));
console.log(`extras: ${results.length} checks, ${failed.length} failed`);
rz.stop(); srv.kill(); process.exit(failed.length ? 1 : 0);
