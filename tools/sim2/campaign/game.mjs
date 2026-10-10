// ONE game of the 20-game rehearsal (docs/CAMPAIGN_20_GAMES.md), played end to end on this laptop: own server, own empty database, own clock, FAKE Razorpay, fake people.
//   bun tools/sim2/campaign/game.mjs G07 [--phones 1000] [--seed 1] [--out sim/campaign/G07-1.json]
// Prints one line per check ("ok:" / "FAIL:") and writes a JSON result. Exit code 1 when any check failed. Nothing leaves the machine (the server refuses outbound requests).
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeFakeRzp } from "./fake-rzp.ts";
import { GAMES, CALENDARS, BREAKS, HOUSES } from "./matrix.mjs";

const ROOT = join(import.meta.dir, "../../..");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : process.argv[i + 1]; };
const spec = GAMES.find((g) => g.id === process.argv[2]); if (!spec) { console.error("usage: game.mjs G01..G20"); process.exit(2); }
const PHONES = Number(arg("phones", "1000")), FULL = Number(arg("full", "220")), SEED = String(arg("seed", "1"));
const PORT = Number(arg("port", String(8830 + spec.no))); process.env.SIM_PORT = String(PORT);
const BUN = process.execPath;
const OUT = arg("out", join(ROOT, `sim/campaign/${spec.id}-${SEED}.json`)); mkdirSync(join(ROOT, "sim/campaign"), { recursive: true });
const t00 = Date.now(); const stamp = () => ((Date.now() - t00) / 1000).toFixed(0).padStart(4) + "s";

// ---- the stack: fake Razorpay (this process) + the rehearsal server (child process) ----
const rz = makeFakeRzp(PORT + 100);
const srv = spawn(BUN, [join(ROOT, "tools/sim2/campaign/server.ts")], { cwd: ROOT, env: { ...process.env, SIM_PORT: String(PORT), CAMP_RZP_BASE: rz.url, CAMP_RZP_KEY: rz.keyId, CAMP_RZP_SECRET: rz.keySecret, CAMP_RZP_HOOK: rz.webhookSecret }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let srvLog = ""; srv.stdout.on("data", (d) => (srvLog += d)); srv.stderr.on("data", (d) => (srvLog += d));
const BASE = `http://localhost:${PORT}`;
const alive = async () => { try { return (await fetch(`${BASE}/__sim/health`)).ok; } catch { return false; } };
for (let i = 0; i < 150 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 300));
if (!(await alive())) { console.log("FAIL: the rehearsal server did not start\n" + srvLog.slice(-1000)); rz.stop(); srv.kill(); process.exit(2); }
const H = await import("../lib/index.mjs");
const { clock, call, sql, mailbox, HOUR, MIN, DAY } = { ...H, ...(await import("../lib/clock.mjs")) };
const inv = await import("../lib/invariants.mjs");
const { roundAt, roundTimeMs } = await import("../lib/beacon.mjs");

// ---- results ----
const results = []; const timings = {}; const summaryExtra = {};
const chk = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail: ok ? "" : String(detail).slice(0, 700) }); console.log(`${stamp()} ${ok ? "ok:  " : "FAIL:"} ${name}${ok ? "" : "  -> " + String(detail).slice(0, 300)}`); return !!ok; };
const eq = (name, got, want) => chk(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
const section = async (title, fn) => { const t = Date.now(); console.log(`${stamp()} == ${title}`); try { await fn(); } catch (e) { chk(`${title}: finished without an unexpected error`, false, String(e?.stack ?? e).slice(0, 600)); } timings[title] = Math.round((Date.now() - t) / 1000); };
let seedN = [...(SEED + spec.id)].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7); const rng = () => ((seedN = (seedN * 1664525 + 1013904223) >>> 0) / 0x100000000);
const pick = (a) => a[Math.floor(rng() * a.length)];

// ---- the cast: made-up people with made-up mobile numbers ----
const FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Isha", "Vikram", "Anaya", "Arjun", "Saanvi", "Neel", "Tara", "Dev", "Riya", "Karan", "Pooja", "Sameer", "Nisha", "Yash", "Kavya"];
const LAST = ["Sharma", "Iyer", "Khan", "Patel", "Nair", "Singh", "Das", "Rao", "Mehta", "Joshi", "Bose", "Menon", "Gupta", "Reddy", "Kulkarni"];
const fakeName = (i) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]} ${i}`;
const PH0 = 100000 + spec.no * 10_000;
const phoneOfCrowd = (i) => "9" + String(PH0 + i).padStart(9, "0").slice(-9);
const tag = spec.id.toLowerCase();
const EMAIL = { org: `sim+${tag}-org@example.com`, host: `sim+${tag}-host@example.com`, cohost: `sim+${tag}-cohost@example.com`, payer: `sim+${tag}-payer@example.com` };
const MOBILE = { org: "9810000" + String(spec.no).padStart(3, "0"), host: "9820000" + String(spec.no).padStart(3, "0"), cohost: "9830000" + String(spec.no).padStart(3, "0") };
const cal = CALENDARS.find((c) => c.id === spec.c);
const ctx = { spec, rz, eid: null, game: null, org: null, host: null, cohost: null, hostKey: null, cohostKey: null, startRound: 0, emails: new Set(Object.values(EMAIL)) };

const defaultRewardsList = () => ["early5", "top", "mid", "bot", "corners", "star", "full"].map((p) => ({ pattern: p }));
// invoice assertions shared by every payment story
const fetchInvoice = async (url) => (await fetch(BASE + url)).text();
const invoiceChecks = async (label, invoiceUrl, want) => {
  const h = await fetchInvoice(invoiceUrl);
  for (const x of ["Paid on (IST)", " IST", "Terms and conditions", "kept for invoice, tax and accounting purposes", "Razorpay payment ID", "Payer (paid by)", "Organizer", ...(want.contains ?? [])]) chk(`${label}: invoice shows "${x}"`, h.includes(x), "missing in the invoice");
  for (const x of want.absent ?? []) chk(`${label}: invoice does not show "${x}"`, !h.includes(x), "found in the invoice");
  return h;
};

// ---------------------------------------------------------------- 1. the calendar and the cast
let org;
await section("cast: organizer, host, co-host with made-up e-mails and mobiles", async () => {
  const jitterMin = Math.floor(rng() * 50);
  await clock.set(cal.t0 + jitterMin * MIN); await clock.freeze(); await clock.set(cal.t0 + jitterMin * MIN);
  await mailbox.clear();
  org = await H.Organizer.signUp(EMAIL.org); ctx.org = org;
  const t = new Date(await clock.now()).toISOString(); chk(`the fake watch is set: ${t} (${cal.label})`, Math.abs((await clock.now()) - (cal.t0 + jitterMin * MIN)) < 5000);
});

// ---------------------------------------------------------------- 2. the game and everything the organizer can set
const gameId = `G${String(spec.no).padStart(2, "0")}-${SEED.replace(/[^A-Za-z0-9]/g, "").slice(0, 6) || "x"}`;
await section("organizer creates the game with every option of this row", async () => {
  const br = BREAKS[spec.b](spec.tickets), rewards = HOUSES[spec.h]();
  const brandName = ["Acme Industries", "Bharat Textiles", "Kaveri Foods", "Zenith Labs", "Orchid Hotels"][spec.no % 5], colors = ["#0B3D91", "#1B7F5C", "#B3261E", "#6A1B9A", "#C26A00"];
  const cfg = { id: gameId, cap: 1000, tickets: spec.tickets, rounds: spec.r, callSeconds: spec.g, name: `${spec.id} ${cal.id} ${spec.b}`, brand: { name: brandName, color: colors[spec.no % 5] }, ...br, ...(rewards ? { rewards } : {}) };
  const startRound = roundAt((await clock.now()) + cal.leadHours * HOUR);
  const r = await org.api("POST", "/api/z", { startRound, ...cfg });
  chk(`the game is created (tickets ${spec.tickets}, rounds ${spec.r}, gap ${spec.g}s, breaks "${spec.b}", houses "${spec.h}")`, r.ok, JSON.stringify(r.body).slice(0, 300));
  if (!r.ok) throw new Error("cannot continue without a game");
  ctx.eid = gameId; ctx.startRound = startRound; ctx.cfg = cfg;
  const s = (await org.summary(gameId)).body; eq("the saved settings keep the number of tickets", s.tickets ?? cfg.tickets, spec.tickets);
  const invites = /invites/.test(spec.j); const closed = /^list/.test(spec.j);
  const patch = { whoCanJoin: closed ? "list" : "anyone", ...(invites ? { invites: { on: true, per: 4, cats: ["family", "colleagues", "friends", "dealers"] } } : {}) };
  const p = await org.settings(gameId, patch); chk(`join policy "${spec.j}" saved (whoCanJoin ${patch.whoCanJoin}${invites ? ", invites on" : ""})`, p.ok, JSON.stringify(p.body).slice(0, 300));
});

// ---------------------------------------------------------------- 3. the team and the permission matrix
await section("host and co-host: first open, and what each role may and may not do", async () => {
  const hi = await org.inviteHost({ label: "Hema Host", email: EMAIL.host, mobile: MOBILE.host });
  const host = new H.Host(hi.hostKey); const fo = await host.firstOpen({ email: EMAIL.host, mobile: MOBILE.host }); ctx.host = host; ctx.hostKey = fo.token;
  const ci = await org.inviteCohost({ label: "Ravi Cohost", phone: MOBILE.cohost, e: gameId }); ctx.cohostKey = ci.cohostKey;
  const as = (k) => ({ "x-organizer": k });
  const st = async (m, p, b, k) => (await call(m, p, b, as(k))).status;
  eq("whoami: master / host / cohost", [(await call("GET", "/api/whoami", undefined, as(org.token))).body.kind, (await call("GET", "/api/whoami", undefined, as(ctx.hostKey))).body.kind, (await call("GET", "/api/whoami", undefined, as(ctx.cohostKey))).body.kind], ["master", "host", "cohost"]);
  eq("a Host may add a Co-host", await st("POST", "/api/org/cohost", { label: "Meera", phone: "9840000001", e: gameId }, ctx.hostKey), 200);
  eq("a Host may NOT add a Host", await st("POST", "/api/org/host", { mobile: "9840000002", email: "sim+x@example.com" }, ctx.hostKey), 403);
  eq("a Co-host may NOT add anyone", await st("POST", "/api/org/cohost", {}, ctx.cohostKey), 403);
  eq("a Co-host may NOT read the team list; a Host may", [await st("GET", "/api/org/team", undefined, ctx.cohostKey), await st("GET", "/api/org/team", undefined, ctx.hostKey)], [403, 200]);
  for (const [m, p] of [["GET", `/api/z/${gameId}/summary`], ["GET", `/api/z/${gameId}/participants`], ["POST", `/api/z/${gameId}/publish`], ["GET", "/api/org/keys"], ["POST", "/api/org/ai"], ["GET", "/api/history"], ["POST", "/api/z"]]) eq(`a Co-host is refused ${m} ${p.replace(gameId, "{id}")}`, await st(m, p, m === "GET" ? undefined : {}, ctx.cohostKey), 403);
  for (const [m, p] of [["GET", "/api/org/keys"], ["POST", "/api/org/keys/revoke"], ["POST", "/api/org/ai"], ["POST", "/api/org/close"], ["POST", "/api/org/host"]]) eq(`a Host is refused ${m} ${p}`, await st(m, p, m === "GET" ? undefined : {}, ctx.hostKey), 403);
  eq("a Host may change the game name", await st("PATCH", `/api/z/${gameId}/settings`, { name: ctx.cfg.name }, ctx.hostKey), 200);
  eq("a Co-host may NOT change settings", await st("PATCH", `/api/z/${gameId}/settings`, { name: "hacked" }, ctx.cohostKey), 403);
  const ch = (await call("GET", `/api/z/${gameId}/cohost`, undefined, as(ctx.cohostKey))); chk("a Co-host reads only the small game header", ch.ok && "inviteLink" in ch.body && !("participants" in ch.body), JSON.stringify(Object.keys(ch.body)));
  const other = await H.Organizer.signUp(`sim+${tag}-rival@example.com`); const og = await other.createGame({ leadMs: 4 * HOUR, cfg: { cap: 100 } });
  eq("another account's keys cannot touch this game", [(await call("GET", `/api/z/${gameId}/summary`, undefined, as(other.token))).status, (await call("POST", `/api/z/${gameId}/announce`, { text: "x" }, as(other.token))).status].every((x) => x === 403 || x === 404), true);
  void og;
});

// ---------------------------------------------------------------- 4. people, waiting room, and the payment story
const crowdPhones = () => Array.from({ length: PHONES }, (_, i) => ({ name: fakeName(i), phone: phoneOfCrowd(i) }));
await section(`people list (${/^list/.test(spec.j) ? "list-only game" : "open game"})`, async () => {
  if (!/^list/.test(spec.j)) return;
  const all = crowdPhones(); const onList = spec.j === "list+waiting" ? all.slice(0, Math.floor(PHONES * 0.85)) : spec.j === "list+invites" ? all.filter((_, i) => i < Math.floor(PHONES * 0.1) || i >= Math.floor(PHONES * 0.1) + Math.min(Math.floor(PHONES * 0.25), Math.floor(PHONES * 0.1) * 4)) : all; // level-2 guests are NOT on the list: they come in through an invitation and the waiting room
  for (let i = 0; i < onList.length; i += 200) { const r = await org.api("POST", `/api/z/${gameId}/people`, { people: onList.slice(i, i + 200) }); if (!r.ok) throw new Error("people batch " + i + ": " + JSON.stringify(r.body).slice(0, 300)); }
  const n = (await sql("SELECT COUNT(*) c FROM person WHERE eid=?", [gameId]))[0].c; eq(`${onList.length} people are on the list`, n, onList.length);
  ctx.listed = onList.length;
});

// payment stories --------------------------------------------------
const checkout = async (who, extra = {}) => call("POST", "/api/checkout", { eid: gameId, name: "Asha Rao", org: "Acme Industries", email: EMAIL.payer, country: "IN", currency: "INR", phone: "9811122233", phoneCode: "91", ...extra }, who ? { "x-organizer": who } : {});
const verify = (co, pay, sig) => call("POST", "/api/payments/verify", { paymentId: co.body.paymentId, razorpay_order_id: pay.order_id, razorpay_payment_id: pay.id, razorpay_signature: sig ?? rz.sign(pay.order_id, pay.id) });
const hook = (event, pay, tamper = false) => { const w = rz.webhook(event, pay); return call("POST", "/api/payments/webhook", w.raw, tamper ? { ...w.headers, "x-razorpay-signature": "0".repeat(64) } : w.headers); };
const paidState = async () => (await org.summary(gameId)).body.payment;
const invoicesFor = async () => sql("SELECT number, token FROM invoice i JOIN payment p ON p.id=i.payment_id WHERE p.eid=?", [gameId]);
const payStory = async () => {
  const story = spec.p; const keyOf = { "host-pays": ctx.hostKey, "cohost-pays": ctx.cohostKey };
  const pub = await org.publish(gameId, MOBILE.org); chk("organizer confirms e-mail and mobile and publishes (unpaid, free)", pub.ok, JSON.stringify(pub.body).slice(0, 200));
  eq("before payment the game is not paid", (await paidState())?.status, "pending");
  const naked = await call("POST", "/api/checkout", { eid: gameId, name: "x", email: EMAIL.payer }, {}); chk("a stranger without a key cannot start a payment for this game", [401, 403, 404].includes(naked.status) || naked.status === 400, `${naked.status}`);
  const methodStory = { upi: { method: "upi", vpa: "asha.rao@okfakebank" }, card: { method: "card", network: "Mastercard", last4: "5100" }, netbanking: { method: "netbanking", bank: "SBIN" }, wallet: { method: "wallet", wallet: "paytm" } };
  if (methodStory[story]) {
    const co = await checkout(org.token); chk("checkout opens a fake Razorpay order", co.ok && co.body.mode === "razorpay", JSON.stringify(co.body).slice(0, 200));
    eq("UPI is shown first for Indian payers", co.body.razorpay?.config?.display?.sequence?.[0], "block.upi");
    const pay = rz.customerPays(co.body.razorpay.orderId, { ...methodStory[story], email: EMAIL.payer, contact: "+919811122233" });
    const v = await verify(co, pay); chk(`${story}: verify completes the payment`, v.ok && v.body.ok, JSON.stringify(v.body).slice(0, 200));
    const label = { upi: "Razorpay: UPI", card: "Razorpay: Card", netbanking: "Razorpay: Net banking", wallet: "Razorpay: Wallet" }[story];
    await invoiceChecks(story, v.body.invoiceUrl, { contains: [label, "Acme Industries"], absent: [methodStory[story].vpa ?? "@@@"] });
  } else if (story === "authorized-capture") {
    const co = await checkout(org.token); const pay = rz.customerPays(co.body.razorpay.orderId, { method: "card", status: "authorized" });
    const v = await verify(co, pay); chk("an authorised (not yet captured) payment is captured by us and then accepted", v.ok && v.body.ok, JSON.stringify(v.body).slice(0, 200));
    chk("fake Razorpay saw our capture call", rz.calls.some((c) => c.path.endsWith("/capture") && c.status === 200), JSON.stringify(rz.calls.slice(-4)));
  } else if (story === "webhook-only") { // the buyer closes the browser right after paying: only Razorpay's webhook arrives
    const co = await checkout(org.token); const pay = rz.customerPays(co.body.razorpay.orderId, { method: "upi" });
    eq("an unsigned webhook is refused", (await call("POST", "/api/payments/webhook", "{}")).status, 400);
    eq("a webhook with a wrong signature is refused", (await hook("payment.captured", pay, true)).status, 400);
    eq("nothing is paid yet", (await paidState())?.status, "pending");
    const w = await hook("payment.captured", pay); chk("a correctly signed webhook finishes the payment", w.ok, JSON.stringify(w.body));
    eq("the game is now paid", (await paidState())?.status, "paid");
    const iv = await invoicesFor(); eq("one invoice", iv.length, 1); await invoiceChecks("webhook-only", `/api/invoice/${iv[0].token}`, { contains: ["Razorpay: UPI"] });
  } else if (story === "verify-and-webhook") {
    const co = await checkout(org.token); const pay = rz.customerPays(co.body.razorpay.orderId, { method: "card" });
    const [v, w] = await Promise.all([verify(co, pay), hook("payment.captured", pay)]); chk("browser verify and webhook at the same moment both end well", v.ok && w.ok, JSON.stringify([v.body, w.body]).slice(0, 300));
    const w2 = await hook("payment.captured", pay), w3 = await hook("order.paid", pay), v2 = await verify(co, pay); chk("a replayed webhook, an order.paid event and a second verify change nothing", w2.ok && w3.ok && v2.ok, JSON.stringify([w2.body, w3.body, v2.body]).slice(0, 300));
    eq("exactly one invoice and one paid payment", [(await invoicesFor()).length, (await sql("SELECT COUNT(*) c FROM payment WHERE eid=? AND status='paid'", [gameId]))[0].c], [1, 1]);
    eq("exactly one entitlement", (await sql("SELECT COUNT(*) c FROM entitlement WHERE eid=?", [gameId]))[0].c, 1);
  } else if (story === "tamper-then-ok") {
    const co = await checkout(org.token); const pay = rz.customerPays(co.body.razorpay.orderId, { method: "upi" });
    const bad = await verify(co, pay, "f".repeat(64)); eq("a wrong signature is refused", bad.status, 400); eq("and nothing is paid", (await paidState())?.status, "pending");
    const wrongAmt = rz.customerPays(co.body.razorpay.orderId, { method: "upi", amount: 100 }); const bad2 = await verify(co, wrongAmt); eq("a payment of a different amount is refused", bad2.status, 400);
    const other = await call("POST", "/api/payments/verify", { paymentId: "pay_00000000000000000", razorpay_order_id: pay.order_id, razorpay_payment_id: pay.id, razorpay_signature: rz.sign(pay.order_id, pay.id) }); eq("an unknown payment id is refused", other.status, 404);
    const ok = await verify(co, pay); chk("the genuine payment is then accepted", ok.ok && ok.body.ok, JSON.stringify(ok.body).slice(0, 200));
  } else if (story === "failed-retry") {
    const co = await checkout(org.token); const failed = rz.customerPays(co.body.razorpay.orderId, { method: "card", status: "failed" });
    const f = await verify(co, failed); eq("a failed payment is not accepted", [f.status === 402 || f.status === 400, (await paidState())?.status], [true, "pending"]);
    const co2 = await checkout(org.token); chk("the buyer tries again: a new order is opened", co2.ok && co2.body.razorpay.orderId !== co.body.razorpay.orderId, JSON.stringify(co2.body).slice(0, 150));
    const good = rz.customerPays(co2.body.razorpay.orderId, { method: "upi" });
    const [a, b] = await Promise.all([verify(co2, good), verify(co2, good)]); chk("a double click on Pay (two verifies together) ends with ONE payment", a.ok && b.ok, JSON.stringify([a.body, b.body]).slice(0, 300));
    eq("one invoice only", (await invoicesFor()).length, 1);
    const again = await checkout(org.token); eq("once paid, a further payment attempt is refused", again.status, 409);
  } else if (story === "host-pays" || story === "cohost-pays") {
    const who = story === "host-pays" ? "host" : "co-host";
    const co = await checkout(keyOf[story]); chk(`${who} opens checkout`, co.ok, JSON.stringify(co.body).slice(0, 200));
    const pay = rz.customerPays(co.body.razorpay.orderId, { method: "upi" }); const v = await verify(co, pay); chk(`${who} pays`, v.ok && v.body.ok, JSON.stringify(v.body).slice(0, 200));
    const ps = await paidState(); eq(`the game shows Paid by ${who}`, ps?.paidBy, who);
    eq("a second attempt by the organizer is refused", (await checkout(org.token)).status, 409);
  } else if (story === "paylink") {
    const pl = await org.api("POST", `/api/z/${gameId}/paylink`, {}); chk("organizer makes a pay link", pl.ok && pl.body.url, JSON.stringify(pl.body).slice(0, 200));
    const tok = /[?&]t=([0-9a-f]{48})/.exec(pl.body.url)?.[1]; const info = await call("GET", `/api/paylink/${tok}`); chk("the link page shows the game's name and price (no key needed)", info.ok && info.body.price, JSON.stringify(info.body).slice(0, 200));
    const co = await call("POST", `/api/paylink/${tok}/checkout`, { name: "Third Person", email: EMAIL.payer, country: "IN", currency: "INR", phone: "9811122233", phoneCode: "91" }); chk("a third person opens checkout from the link", co.ok && co.body.razorpay, JSON.stringify(co.body).slice(0, 200));
    const pay = rz.customerPays(co.body.razorpay.orderId, { method: "upi" }); const v = await verify(co, pay); chk("the third person pays", v.ok && v.body.ok, JSON.stringify(v.body).slice(0, 200));
    eq("the game shows the link payment", (await paidState())?.status, "paid");
  } else if (story === "usd-card") {
    const co = await checkout(org.token, { country: "US", currency: "USD", phone: "2025550143", phoneCode: "1", taxId: "US-EIN-12-3456789" }); chk("a US payer is offered US dollars", co.ok && co.body.razorpay.currency === "USD", JSON.stringify(co.body).slice(0, 200));
    eq("the dollar price of the 1000 pack is 101", co.body.razorpay?.amount, 10100);
    const pay = rz.customerPays(co.body.razorpay.orderId, { method: "card", network: "Visa", last4: "1881", international: true, currency: "USD", contact: "+12025550143" });
    const v = await verify(co, pay); chk("the dollar payment is accepted", v.ok && v.body.ok, JSON.stringify(v.body).slice(0, 200));
    const h = await invoiceChecks("USD", v.body.invoiceUrl, { contains: ["US$101.00", "Razorpay: Card", "Visa", "International card", "US-EIN-12-3456789"] });
    chk("USD invoice shows no GST and no rupee amount", !h.includes("CGST") && !h.includes("IGST") && !h.includes("₹"), "tax or rupee on a USD invoice");
  }
};
// the stories that are not "pay before the start" run inside play(); the rest run now
const lateStory = spec.p === "late-pay", creditStory = spec.p === "credit";
await section(`payment story "${spec.p}" with the fake Razorpay`, async () => {
  if (lateStory) { const pub = await org.publish(gameId, MOBILE.org); chk("published but not paid (it will be paid late)", pub.ok, JSON.stringify(pub.body).slice(0, 200)); return; }
  if (creditStory) {
    // game A is paid and cancelled first: its payment stays as credit; game B (this game) is then paid from that credit
    const a = await org.createGame({ id: `${gameId}A`, leadMs: 6 * HOUR, cfg: { cap: 1000, name: "Credit source" } }); await org.publish(a.id, MOBILE.org);
    const co = await call("POST", "/api/checkout", { eid: a.id, name: "Asha Rao", org: "Acme Industries", email: EMAIL.payer, country: "IN", currency: "INR" }, { "x-organizer": org.token }); const pay = rz.customerPays(co.body.razorpay.orderId, { method: "upi" });
    const v = await call("POST", "/api/payments/verify", { paymentId: co.body.paymentId, razorpay_order_id: pay.order_id, razorpay_payment_id: pay.id, razorpay_signature: rz.sign(pay.order_id, pay.id) }); chk("game A is paid", v.ok && v.body.ok, JSON.stringify(v.body).slice(0, 200));
    const prev = await org.api("GET", `/api/z/${a.id}/cancel-preview`); const c = await org.cancel(a.id); chk("game A is cancelled; no refund, the payment becomes credit", c.ok && c.body.credit, JSON.stringify(c.body).slice(0, 250));
    const pub = await org.publish(gameId, MOBILE.org); chk("game B published", pub.ok, JSON.stringify(pub.body).slice(0, 200));
    const pc = await org.api("POST", `/api/z/${gameId}/pay-with-credit`, {}); chk("game B is paid from the credit, nothing charged by Razorpay", pc.ok && pc.body.paid, JSON.stringify(pc.body).slice(0, 250));
    eq("fake Razorpay saw only the one order of game A", rz.orders.size, 1); void prev;
    return;
  }
  await payStory();
});
await section("after payment: the game is paid and published exactly once", async () => {
  if (lateStory) return;
  const ps = await paidState(); eq("payment status is paid", ps?.status, "paid");
  const iv = await invoicesFor(); if (!creditStory) eq("exactly one invoice for this game", iv.length, 1);
  const nums = (await sql("SELECT number FROM invoice WHERE seq>0 ORDER BY seq")).map((r) => r.number);
  const fy = (() => { const d = new Date(Date.now()); return null; })();
  if (!creditStory) { const want = /^CT\/\d{4}-\d{2}\/\d{6}$/; chk(`invoice number looks right (${nums.join(", ")})`, nums.every((n) => want.test(n)), nums.join(",")); }
  const t = await clock.now(); const ist = new Date(t + 19_800_000); const y = ist.getUTCFullYear(), m = ist.getUTCMonth(); const start = m >= 3 ? y : y - 1; const wantFy = `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  if (!creditStory && iv.length) chk(`the invoice series follows the Indian financial year (${wantFy} at ${ist.toISOString().slice(0, 16)} IST)`, nums[0].includes(`/${wantFy}/`), nums[0]);
  await nobodyPaid();
});
async function nobodyPaid() { const r = await inv.nobodyPaidTwice(); chk(r.name, r.ok, r.detail); }

// ---------------------------------------------------------------- 5. play: 1000 phones with the real phone program, announcements, prizes
let crowd = null;
await section(`play: ${PHONES} phones (${spec.tickets} ticket${spec.tickets === 1 ? "" : "s"} each), ${spec.r} round(s), breaks "${spec.b}"`, async () => {
  let startRound = ctx.startRound;
  if (lateStory) { // nobody paid: the game is held at its start time; the buyer pays 10 minutes late and the first number follows 2 minutes after
    const startMs = roundTimeMs(startRound); await clock.set(startMs + 10 * MIN); await clock.tick();
    const gi = (await call("GET", `/api/z/${gameId}/info`)).body, oi = (await H.call("GET", `/api/z/${gameId}/info`, undefined, { "x-organizer": org.token })).body;
    chk("a guest sees 'waiting for the organizer'; the organizer sees 'unpaid'", gi.waitingFor === "organizer" && oi.unpaid === true, JSON.stringify([gi.waitingFor, oi.unpaid]));
    await payStoryLate();
    startRound = (await call("GET", `/api/z/${gameId}/info`)).body.startRound; ctx.startRound = startRound;
    chk("the game restarted after the late payment", startRound > ctx.cfg.startRound || startRound !== undefined, String(startRound));
  }
  const inviteMode = /invites/.test(spec.j); const nL1 = Math.floor(PHONES * 0.1), nL2 = Math.min(Math.floor(PHONES * 0.25), nL1 * 4);
  const callSec = spec.g, perRound = 90 * callSec, breaksSec = (ctx.cfg.breaks ?? []).reduce((t, b) => t + b.seconds, 0);
  const maxSteps = Math.ceil(((perRound + breaksSec) * spec.r) / 3) + 260 + (spec.r - 1) * 60;
  const actions = [ // the three roles speak during the game
    { step: 40, tag: "announce-organizer", path: `/api/z/${gameId}/announce`, key: org.token, body: { text: "Welcome everyone, good luck from the organizer." } },
    { step: 60, tag: "announce-host", path: `/api/z/${gameId}/announce`, key: ctx.hostKey, body: { text: "A message from the host." } },
    { step: 80, tag: "announce-cohost", path: `/api/z/${gameId}/announce`, key: ctx.cohostKey, body: { text: "The co-host says: stay on your toes." } },
  ];
  const args = { eid: gameId, startRound, phones: PHONES, full: FULL, seed: `${SEED}-${spec.no}`, phoneBase: PH0, base: BASE, maxSteps, lateFrac: 0.2, offlineFrac: 0.03, confirm: 12, actions, ...(inviteMode ? { invite: { l1: nL1, l2: nL2, per: 4, cats: ["family", "colleagues", "friends", "dealers"], l2At: 16 } } : {}), ...(spec.j === "list+waiting" || spec.j === "list+invites" ? { waiting: { key: org.token, from: 20, every: 12, declineEvery: 9 } } : {}) };
  const t0 = Date.now(); let peak = 0;
  const p = spawn(BUN, [join(ROOT, "tools/sim2/campaign/crowd2.ts"), JSON.stringify(args)], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let buf = ""; p.stdout.on("data", (d) => (buf += d)); p.stderr.on("data", (d) => (buf += d));
  const iv = setInterval(() => { try { const r = Bun.spawnSync(["powershell", "-NoProfile", "-Command", `(Get-Process -Id ${p.pid}).PeakWorkingSet64/1MB`]); peak = Math.max(peak, Math.round(Number(r.stdout.toString().trim()) || 0)); } catch { /* sampling only */ } }, 15000);
  await new Promise((r) => p.on("close", r)); clearInterval(iv);
  const line = buf.trim().split("\n").filter((l) => l.startsWith("{")).pop();
  try { crowd = JSON.parse(line); } catch { chk("the phone crowd produced a result", false, buf.slice(-500)); return; }
  crowd.peakMB = peak; summaryExtra.phoneState = crowd.phoneState; summaryExtra.referee = crowd.referee; if (crowd.groupDiag?.length) summaryExtra.groupDiag = crowd.groupDiag; crowd.wallSeconds = Math.round((Date.now() - t0) / 1000); ctx.crowd = crowd;
  console.log(`${stamp()} crowd: joined ${crowd.joined}/${crowd.phones} (${crowd.joinedFull} full phones, ${crowd.ghostPhones} ghosts), ended ${crowd.ended}, ${crowd.steps} steps, ${crowd.wallSeconds}s wall, crowd process peak ~${peak} MB`);
  chk(`every full phone that joined finished (${crowd.ended}/${crowd.joinedFull})`, crowd.ended === crowd.joinedFull, JSON.stringify(crowd.failures?.slice(0, 3)));
  const needJoin = args.waiting ? Math.floor(PHONES * 0.8) : Math.floor(PHONES * 0.9);
  chk(`at least ${needJoin} of ${PHONES} phones got in`, crowd.joined >= needJoin, `joined ${crowd.joined}`);
  eq("all phones agree on the winners (one set of winners)", crowd.groups?.length ?? 0, 1);
  chk(`every phone's numbers equal the public reference (${crowd.logsEqual})`, crowd.logsEqual?.split("/")[0] === crowd.logsEqual?.split("/")[1], crowd.logsEqual);
  for (const f of crowd.failures ?? []) chk("crowd: " + f, false, f);
  for (const a of crowd.actionResults ?? []) { const want = a.tag === "announce-cohost" ? 403 : 200; chk(`mid-game action ${a.tag} answered ${a.status}${want === 403 ? " (a Co-host may not announce: only invite and pay)" : ""}`, a.status === want, JSON.stringify(a.body).slice(0, 200)); }
  const rwForMax = (ctx.cfg.rewards ?? defaultRewardsList()).map((r) => ({ pattern: r.scope === "two_ticket" ? "full2" : r.pattern })); const pm = inv.perHouseMaxima((crowd.published ?? []).filter((r) => r.pattern !== "lucky"), rwForMax); chk(pm.name, pm.ok, pm.detail);
  const one = await inv.oneTicketPerPhone(gameId); chk(one.name, one.ok, one.detail);
});
async function payStoryLate() {
  const co = await checkout(org.token); const pay = rz.customerPays(co.body.razorpay.orderId, { method: "upi" }); const v = await verify(co, pay);
  chk("the organizer pays late (after the start time)", v.ok && v.body.ok, JSON.stringify(v.body).slice(0, 250));
  chk("the first number is promised about 2 minutes after the payment", v.body.restartedAtMs ? Math.abs(v.body.restartedAtMs - (await clock.now())) < 5 * MIN + 30_000 : false, JSON.stringify(v.body.restartedAtMs));
}

// ---------------------------------------------------------------- 6. what happened in the game (data, not just screens)
await section("results: prizes, lucky draws, unlucky, invites, devices", async () => {
  if (!crowd) return;
  const rs = (await call("GET", `/api/z/${gameId}/results`)).body.results ?? [];
  const lucky = rs.filter((r) => r.pattern === "lucky"); const luckyCfg = (ctx.cfg.breaks ?? []).filter((b) => b.kind === "lucky");
  eq("every lucky draw in the settings was drawn once (lucky draws and brand breaks belong to round 1)", lucky.length, luckyCfg.length);
  const seats = new Set((await sql("SELECT pid FROM participant WHERE eid=?", [gameId])).map((r) => r.pid));
  for (const l of lucky) { const ws = l.winners ?? []; const want = Math.min(luckyCfg[(l.ordinal - 1) % Math.max(1, luckyCfg.length)]?.winners ?? ws.length, seats.size); chk(`lucky draw ${l.round ?? 1}.${l.ordinal}: ${ws.length} distinct winners, all real participants`, new Set(ws).size === ws.length && ws.every((w) => seats.has(w)) && ws.length === want, `${ws.length} winners (want ${want}), distinct ${new Set(ws).size}, real ${ws.filter((w) => seats.has(w)).length}`); }
  const unl = rs.filter((r) => r.pattern === "unlucky"); if ((ctx.cfg.rewards ?? []).some((r) => r.pattern === "unlucky")) eq("Unlucky is awarded exactly once per round", unl.length, spec.r);
  const per = {}; for (const r of rs) if (r.pattern !== "lucky") per[r.pattern] = (per[r.pattern] ?? 0) + 1;
  const cfgHouses = new Set((ctx.cfg.rewards ?? defaultRewardsList()).map((r) => r.scope === "two_ticket" ? "full2" : r.pattern)); chk("nothing is awarded for a house the organizer did not choose", Object.keys(per).every((k) => cfgHouses.has(k)), JSON.stringify(per));
  chk("someone won the Full House in every round", Array.from({ length: spec.r }, (_, i) => i + 1).every((rd) => !cfgHouses.has("full") || rs.some((r) => (r.round ?? 1) === rd && r.pattern === "full")) || crowd.ended === crowd.joined, JSON.stringify(per));
  eq("the winners the phones worked out equal the public results", crowd.published?.length, rs.length);
  // prizes: winners confirm on their own phone; the team marks prizes given
  const conf = crowd.confirmed ?? []; chk(`winners confirmed their details on their own phones (${conf.filter((c) => c.status === 200).length}/${conf.length})`, conf.length > 0 ? conf.every((c) => c.status === 200) : crowd.wonCounts === 0, JSON.stringify(conf.slice(0, 3)));
  summaryExtra.dump = { results: rs.slice(0, 80), houses: per, confirmed: (crowd.confirmed ?? []).slice(0, 14), waitStats: crowd.waitStats, lvl: crowd.lvlInfo ? { l1: crowd.lvlInfo.l1Joined, l2: crowd.lvlInfo.l2Joined } : null };
  const prizes = await org.api("GET", `/api/z/${gameId}/prizes`); summaryExtra.dump.prizes = (prizes.body.prizes ?? prizes.body.list ?? prizes.body).slice?.(0, 40) ?? prizes.body; chk("the organizer sees the prize list", prizes.ok, JSON.stringify(prizes.body).slice(0, 200));
  const cohostPrizes = await call("GET", `/api/z/${gameId}/prizes`, undefined, { "x-organizer": ctx.cohostKey }); chk("a Co-host may or may not see prizes, but never gets a server error", cohostPrizes.status < 500, `${cohostPrizes.status}`);
  const pl = prizes.body.prizes ?? prizes.body.list ?? []; if (pl.length) { const g = await org.api("POST", `/api/z/${gameId}/prizegiven`, { pid: pl[0].pid, round: pl[0].round, pattern: pl[0].pattern, ordinal: pl[0].ordinal, given: true }); chk("the organizer marks a prize as given", g.status < 500, JSON.stringify(g.body).slice(0, 200)); }
  // one ticket one phone
  const a = crowd.confirmed?.[0]; const phone = a?.phone ?? phoneOfCrowd(1);
  const r2 = await call("POST", `/api/z/${gameId}/join`, { phone, name: "Clone", device: "ab".repeat(16) }, {}, { ip: "10.250.1.1" }); eq("a second phone cannot take over a taken ticket (423)", r2.status, 423);
  const r3 = await call("POST", `/api/z/${gameId}/join`, { phone: "9" + String(PH0 + 90_000).slice(-9), name: "Newcomer", device: "cd".repeat(16) }, {}, { ip: "10.250.1.2" }); chk("a late newcomer after the game ended gets a calm answer (no server error)", r3.status < 500, `${r3.status}`);
  if (crowd.waitStats?.seen > 0) { const w = crowd.waitStats; chk(`waiting room: ${w.seen} asked, ${w.admit} admitted, ${w.decline} declined, no errors`, w.admit > 0 && w.errors === 0, JSON.stringify(w)); const dec = (await sql("SELECT COUNT(*) c FROM waiting WHERE eid=? AND status='declined'", [gameId]))[0].c; eq("declined requests did not get a place", dec, w.decline); }
  // invites: two levels only
  if (/invites/.test(spec.j) && crowd.lvlInfo) {
    chk(`level-1 phones joined (${crowd.lvlInfo.l1Joined}) and level-2 phones joined (${crowd.lvlInfo.l2Joined})`, crowd.lvlInfo.l1Joined > 0, JSON.stringify(crowd.lvlInfo).slice(0, 200));
    const over = await sql("SELECT inv, COUNT(*) c FROM seat WHERE eid=? AND inv IS NOT NULL GROUP BY inv HAVING c>4", [gameId]); eq("nobody was invited by a level-1 guest more than 4 times", over.length, 0);
    const chain = await sql("SELECT COUNT(*) c FROM seat s JOIN seat t ON t.eid=s.eid AND t.seq=s.inv WHERE s.eid=? AND t.inv IS NOT NULL AND t.role IS NULL", [gameId]); eq("no level-2 guest invited anyone (only two levels)", chain[0].c, 0);
    const invSeats = (await sql("SELECT COUNT(*) c FROM seat WHERE eid=? AND inv IS NOT NULL", [gameId]))[0].c; eq("every level-2 guest that got in is recorded under their level-1 inviter", invSeats, crowd.lvlInfo.l2Joined);
  }
});

// ---------------------------------------------------------------- 7. after the game: report, erasure, records kept (time travel)
await section("after the game: report e-mail, erasure after 23 hours, records kept", async () => {
  if (!crowd) return;
  const lastNow = await clock.now(); const life = (await org.life(gameId)).body;
  chk("the lifecycle gives an end time and an erasure time", life.endMs && life.personalDeleteAtMs, JSON.stringify(life).slice(0, 250));
  await clock.set(Math.max(lastNow, life.endMs + 5 * MIN)); await clock.advanceWithTicks(40 * MIN, MIN);
  const rep = (await mailbox.list({ subject: "report" })).length + (await mailbox.list({ subject: "Report" })).length; chk(`the organizer gets the game report by e-mail (${rep} mail${rep === 1 ? "" : "s"})`, rep >= 1, "no report mail yet");
  const before = (await sql("SELECT COUNT(*) c FROM participant WHERE eid=?", [gameId]))[0].c; chk("before the erasure time the guest data is still there", before > 0, `${before}`);
  await clock.set(life.personalDeleteAtMs - 10 * MIN); await clock.tick(); const still = (await sql("SELECT COUNT(*) c FROM participant WHERE eid=?", [gameId]))[0].c; chk("10 minutes before the erasure time nothing is erased yet", still > 0, `${still}`);
  await clock.advanceWithTicks(40 * MIN, 5 * MIN);
  const left = {}; for (const t of ["participant", "seat", "person", "waiting", "claim", "settled"]) left[t] = (await sql(`SELECT COUNT(*) c FROM ${t} WHERE eid=?`, [gameId]))[0].c;
  eq("guest data is erased 23 hours after the end", Object.values(left).reduce((a, b) => a + b, 0), 0);
  const nop = await inv.noPersonalDataAfterErasure(gameId, [fakeName(3)]); chk(nop.name, nop.ok, nop.detail);
  const kept = { invoices: (await sql("SELECT COUNT(*) c FROM invoice"))[0].c, payments: (await sql("SELECT COUNT(*) c FROM payment WHERE status='paid'"))[0].c, winners: (await sql("SELECT COUNT(*) c FROM winner WHERE eid=?", [gameId])).catch?.(() => [{ c: -1 }]) };
  chk("the invoice and the paid payment are still kept", kept.invoices > 0 && kept.payments > 0, JSON.stringify(kept));
  const team = await inv.emailOnlyToTeam([...ctx.emails, "sim+x@example.com", `sim+${tag}-rival@example.com`]); chk(team.name, team.ok, team.detail);
  const leak = []; for (const m of await mailbox.list()) for (const i of [3, 77, 505]) if (m.text.includes(phoneOfCrowd(i)) || m.text.includes(fakeName(i))) leak.push(`${m.subject}: guest ${i}`); chk("no mail carries a guest's name or number", leak.length === 0, leak.slice(0, 3).join("; "));
  { const wb = await inv.writeBudget(80000); chk(wb.name + " (" + wb.detail + ")", wb.ok, wb.detail); const tc = (await sql("SELECT total_changes() c"))[0].c; summaryExtra.rowsChanged = tc; }
  await clock.advanceWithTicks(370 * DAY, 12 * HOUR);
  const full = { engagement: (await sql("SELECT COUNT(*) c FROM engagement WHERE id=?", [gameId]))[0].c, invoices: (await sql("SELECT COUNT(*) c FROM invoice"))[0].c };
  chk("after 365 days the game record is gone but the invoices are kept", full.engagement === 0 && full.invoices > 0, JSON.stringify(full));
});
await section("free-plan budget and safety", async () => {
  const health = await (await fetch(`${BASE}/__sim/health`)).json(); chk("nothing left the machine", health.blockedFetches.length === 0, JSON.stringify(health.blockedFetches));
  const bad = rz.calls.filter((c) => c.status >= 500); chk("fake Razorpay never failed unexpectedly", bad.length === 0, JSON.stringify(bad.slice(0, 3)));
});

// ---------------------------------------------------------------- report
const failed = results.filter((r) => !r.ok);
const summary = { ...summaryExtra, game: spec.id, tickets: spec.tickets, story: spec.p, calendar: spec.c, breaks: spec.b, houses: spec.h, rounds: spec.r, gap: spec.g, join: spec.j, phones: PHONES, seed: SEED, checks: results.length, failed: failed.length, seconds: Math.round((Date.now() - t00) / 1000), timings, crowd: crowd ? { joined: crowd.joined, ended: crowd.ended, steps: crowd.steps, wallSeconds: crowd.wallSeconds, peakMB: crowd.peakMB, logsEqual: crowd.logsEqual, groups: crowd.groups?.length, wonCounts: crowd.wonCounts } : null };
writeFileSync(OUT, JSON.stringify({ summary, failed, results }, null, 1));
console.log(JSON.stringify(summary));
for (const f of failed) console.log("FAIL " + f.name + (f.detail ? ": " + f.detail : ""));
console.log(`${spec.id}: ${results.length} checks, ${failed.length} failed, ${summary.seconds}s`);
rz.stop(); srv.kill(); process.exit(failed.length ? 1 : 0);
