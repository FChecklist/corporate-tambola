/**
 * Razorpay integration test WITHOUT real keys: a stand-in for api.razorpay.com (same endpoints, same auth, same signature rules from the
 * public docs) plus a real Tambola server pointed at it. Run: bun run tools/sim/payments.ts
 * Real keys are an owner step; with Razorpay TEST keys the same flow runs against the real test mode.
 */
import { createHmac } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { BRANDS, financialYear } from "@tambola/billing";

const KEY_ID = "rzp_test_standin", KEY_SECRET = "standin_secret", WH_SECRET = "standin_webhook_secret";
const results: { ok: boolean; name: string; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push({ ok, name, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sig = (secret: string, text: string) => createHmac("sha256", secret).update(text).digest("hex");

// ---------- stand-in for api.razorpay.com ----------
const orders = new Map<string, any>(), payments = new Map<string, any>();
let n = 0;
const rzp = Bun.serve({ port: 0, async fetch(req) {
  const u = new URL(req.url);
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64")) return new Response(JSON.stringify({ error: { description: "Authentication failed" } }), { status: 401 });
  if (req.method === "POST" && u.pathname === "/v1/orders") {
    const b: any = await req.json(); const id = "order_T" + ++n;
    const o = { id, amount: b.amount, currency: b.currency, receipt: b.receipt, notes: b.notes, status: "created" }; orders.set(id, o); return Response.json(o);
  }
  const m = u.pathname.match(/^\/v1\/payments\/([^/]+)(\/capture)?$/);
  if (m) {
    const p = payments.get(m[1]!); if (!p) return new Response(JSON.stringify({ error: { description: "not found" } }), { status: 404 });
    if (m[2]) { const b: any = await req.json(); if (b.amount !== p.amount) return new Response(JSON.stringify({ error: { description: "amount mismatch" } }), { status: 400 }); p.status = "captured"; }
    return Response.json(p);
  }
  return new Response("no", { status: 404 });
} });
const pay = (orderId: string, status = "captured", amountOverride?: number) => {
  const id = "pay_T" + ++n; const o = orders.get(orderId);
  payments.set(id, { id, order_id: orderId, amount: amountOverride ?? o.amount, currency: o.currency, status });
  return { id, signature: sig(KEY_SECRET, `${orderId}|${id}`) };
};

// ---------- a real Tambola server pointed at it ----------
const DATA = process.env.DATA_DIR ?? "C:/ct/tambola/data-pay"; rmSync(DATA, { recursive: true, force: true }); mkdirSync(DATA, { recursive: true });
const PORT = Number(process.env.PAY_PORT ?? 8791), BASE = `http://localhost:${PORT}`;
const server = Bun.spawn(["bun", "run", "apps/server/src/index.ts"], { cwd: "C:/ct/tambola", stdout: "ignore", stderr: "inherit",
  env: { ...process.env, PORT: String(PORT), TAMBOLA_DATA: DATA, RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: WH_SECRET, RAZORPAY_BASE_URL: `http://localhost:${rzp.port}/v1`, TAMBOLA_COMPANY: "C:/ct/tambola/data-pay/none.json" } });
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch { /* starting */ } await sleep(100); }

async function http(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, raw?: string) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const t = await r.text(); let data: any = t; try { data = JSON.parse(t); } catch { /* html */ }
  return { status: r.status, data };
}
const buyer = { org: "Acme Industries", email: `hr.${Date.now() % 100000}@acme-industries.com`, country: "IN", taxId: "27ABCDE1234F1Z5", pack: 250, currency: "INR" };
const rooms = async () => (await http("GET", "/api/health")).data.rooms as number;
const FY = financialYear(new Date());

try {
  console.log("Razorpay integration test (stand-in for api.razorpay.com)\n");
  const st = await http("GET", "/api/payments/status");
  check("payments mode is razorpay; brand and seller are right; with GST off nothing is missing", st.data.mode === "razorpay" && st.data.brand === "CORPORATE TAMBOLA" && st.data.legalEntity === "IT Services by Rajat Agarwal" && st.data.missingCompanyDetails.length === 0, JSON.stringify(st.data.missingCompanyDetails));

  // 1. checkout creates an order, nothing is delivered before payment
  const co = await http("POST", "/api/checkout", buyer);
  const rz = co.data.razorpay;
  check("checkout creates a Razorpay order in paise with the BRAND as the checkout name; nothing is delivered before payment", co.data.mode === "razorpay" && rz.keyId === KEY_ID && rz.amount === 100000 && rz.currency === "INR" && rz.name === "CORPORATE TAMBOLA" && (await rooms()) === 0, JSON.stringify({ amount: rz?.amount, name: rz?.name }));
  check("the order carries the brand in Razorpay notes (so every payment in the dashboard shows the product)", orders.get(rz.orderId).notes.brand === "CORPORATE TAMBOLA" && orders.get(rz.orderId).notes.product === "engagement");

  // 2. bad / tampered payments are refused and deliver nothing
  const p1 = pay(rz.orderId);
  const badSig = await http("POST", "/api/payments/verify", { paymentId: co.data.paymentId, razorpay_order_id: rz.orderId, razorpay_payment_id: p1.id, razorpay_signature: "0".repeat(64) });
  check("a wrong signature is refused", badSig.status === 400 && (await rooms()) === 0);
  const pLow = pay(rz.orderId, "captured", 100);
  const lowAmt = await http("POST", "/api/payments/verify", { paymentId: co.data.paymentId, razorpay_order_id: rz.orderId, razorpay_payment_id: pLow.id, razorpay_signature: pLow.signature });
  check("a payment for the wrong amount is refused even with a valid signature", lowAmt.status === 400 && (await rooms()) === 0, lowAmt.data.error);
  const pFail = pay(rz.orderId, "failed");
  const failed = await http("POST", "/api/payments/verify", { paymentId: co.data.paymentId, razorpay_order_id: rz.orderId, razorpay_payment_id: pFail.id, razorpay_signature: pFail.signature });
  check("a failed payment delivers nothing", failed.status === 402 && (await rooms()) === 0, failed.data.error);
  const otherOrder = await http("POST", "/api/payments/verify", { paymentId: co.data.paymentId, razorpay_order_id: "order_OTHER", razorpay_payment_id: p1.id, razorpay_signature: sig(KEY_SECRET, `order_OTHER|${p1.id}`) });
  check("a payment cannot be used for a different order", otherOrder.status === 404);

  // 3. the real payment
  const ok = await http("POST", "/api/payments/verify", { paymentId: co.data.paymentId, razorpay_order_id: rz.orderId, razorpay_payment_id: p1.id, razorpay_signature: p1.signature });
  const num1 = `CT/${FY}/000001`;
  check("a verified payment creates the engagement and brand-wise invoice number CT/<FY>/000001", ok.status === 200 && ok.data.engagementCode?.length === 7 && ok.data.invoiceNumber === num1 && (await rooms()) === 1, JSON.stringify({ code: ok.data.engagementCode, inv: ok.data.invoiceNumber }));
  const again = await http("POST", "/api/payments/verify", { paymentId: co.data.paymentId, razorpay_order_id: rz.orderId, razorpay_payment_id: p1.id, razorpay_signature: p1.signature });
  check("verifying again is safe: same engagement, no second engagement, no second invoice", again.data.engagementCode === ok.data.engagementCode && (await rooms()) === 1 && again.data.invoiceNumber === num1);

  const inv = await http("GET", ok.data.invoiceUrl);
  check("invoice page: BRAND is the title, the seller is named, no GST rows", typeof inv.data === "string" && inv.data.includes("<h1>CORPORATE TAMBOLA</h1>") && inv.data.includes("IT Services by Rajat Agarwal") && inv.data.includes(num1) && !/IGST|CGST|SGST/.test(inv.data));
  check("with GST off the invoice is not a draft and never calls itself a tax invoice", !inv.data.includes("DRAFT") && !inv.data.includes("TAX INVOICE"));
  const unknownInv = await http("GET", "/invoice/inv_doesnotexist");
  check("an invoice cannot be guessed", unknownInv.status === 404);
  await sleep(300);
  const mails = readdirSync(DATA + "/outbox").map((f) => readFileSync(DATA + "/outbox/" + f, "utf8")).filter((t) => t.includes(buyer.email));
  check("the order email contains the invoice and a link to print it", mails.some((t) => t.includes("INVOICE") && !t.includes("TAX INVOICE") && t.includes(num1) && t.includes("/invoice/inv_") && t.includes("Seller: IT Services by Rajat Agarwal")));

  // 4. second purchase paid but the browser is closed: the webhook delivers
  const co2 = await http("POST", "/api/checkout", { ...buyer, pack: 500 });
  const p2 = pay(co2.data.razorpay.orderId);
  const evt = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: p2.id, order_id: co2.data.razorpay.orderId } } } });
  const badHook = await http("POST", "/api/webhooks/razorpay", undefined, { "x-razorpay-signature": "bad" }, evt);
  check("a webhook with a bad signature is refused and delivers nothing", badHook.status === 400 && (await rooms()) === 1);
  const hook = await http("POST", "/api/webhooks/razorpay", undefined, { "x-razorpay-signature": sig(WH_SECRET, evt) }, evt);
  check("a signed webhook delivers the purchase when the buyer closed the tab", hook.status === 200 && hook.data.fulfilled === co2.data.paymentId && (await rooms()) === 2);
  const hook2 = await http("POST", "/api/webhooks/razorpay", undefined, { "x-razorpay-signature": sig(WH_SECRET, evt) }, evt);
  check("the same webhook again changes nothing", hook2.status === 200 && (await rooms()) === 2);
  const unrelated = JSON.stringify({ event: "payment.failed", payload: { payment: { entity: { id: "x", order_id: co2.data.razorpay.orderId } } } });
  const ign = await http("POST", "/api/webhooks/razorpay", undefined, { "x-razorpay-signature": sig(WH_SECRET, unrelated) }, unrelated);
  check("other webhook events are acknowledged and ignored", ign.status === 200 && ign.data.ignored === "payment.failed");

  // 5. an account that captures manually: payment is only 'authorized'; the server captures exactly the order amount
  const co3 = await http("POST", "/api/checkout", { ...buyer, pack: 100 });
  const p3 = pay(co3.data.razorpay.orderId, "authorized");
  const cap = await http("POST", "/api/payments/verify", { paymentId: co3.data.paymentId, razorpay_order_id: co3.data.razorpay.orderId, razorpay_payment_id: p3.id, razorpay_signature: p3.signature });
  check("an authorized payment is captured by the server (exact amount) and then delivered", cap.status === 200 && payments.get(p3.id).status === "captured" && (await rooms()) === 3);

  // 6. brand-wise numbering continues per brand and financial year
  const invList = async (token: string) => (await http("GET", "/api/orgs/me/invoices", undefined, { authorization: `Bearer ${token}` })).data.invoices;
  const ae = await http("POST", "/api/auth/email", { email: buyer.email });
  const av = await http("POST", "/api/auth/verify", { email: buyer.email, code: ae.data.devCode });
  const tok = av.data.token as string;
  const list = await invList(tok);
  check("invoices are numbered CT/<FY>/000001, 000002, 000003 in order", list.map((x: any) => x.number).sort().join() === [1, 2, 3].map((i) => `CT/${FY}/00000${i}`).join() && list.every((x: any) => x.brand === "CORPORATE TAMBOLA"), list.map((x: any) => x.number).join());

  // 7. upgrade pays only the difference, through Razorpay, and is invoiced
  const code = ok.data.engagementCode;
  const up = await http("POST", `/api/e/${code}/raise-limit`, { pack: 500 }, { authorization: `Bearer ${tok}` });
  const upAmt = up.data.razorpay?.amount;
  check("raise limit creates a Razorpay order for the DIFFERENCE only (500 pack minus 250 pack)", up.data.mode === "razorpay" && upAmt === (150000 - 100000), `${upAmt}`);
  const before = (await http("GET", `/api/e/${code}/console`, undefined, { authorization: `Bearer ${tok}` })).data.engagement.limit;
  const pu = pay(up.data.razorpay.orderId);
  const upOk = await http("POST", "/api/payments/verify", { paymentId: up.data.paymentId, razorpay_order_id: up.data.razorpay.orderId, razorpay_payment_id: pu.id, razorpay_signature: pu.signature });
  const after = (await http("GET", `/api/e/${code}/console`, undefined, { authorization: `Bearer ${tok}` })).data.engagement.limit;
  check("after the verified upgrade payment the limit is raised and an invoice for the difference is issued", before === 250 && after === 500 && upOk.data.invoiceNumber === `CT/${FY}/000004`, `${before} -> ${after}, ${upOk.data.invoiceNumber}`);

  // 8. dollars are not switched on until international payments are enabled on the account
  const usd = await http("POST", "/api/checkout", { ...buyer, currency: "USD", country: "AE", taxId: "" });
  check("dollar purchases are refused with a clear message until international payments are enabled", usd.status === 400 && /dollar/i.test(usd.data.error), usd.data.error);
} finally {
  server.kill(); rzp.stop(true);
}

// ---------- production without keys: nothing can be bought ----------
const DATA2 = "C:/ct/tambola/data-pay2"; rmSync(DATA2, { recursive: true, force: true }); mkdirSync(DATA2, { recursive: true });
const prod = Bun.spawn(["bun", "run", "apps/server/src/index.ts"], { cwd: "C:/ct/tambola", stdout: "ignore", stderr: "inherit", env: { ...process.env, PORT: "8792", TAMBOLA_DEV: "0", TAMBOLA_DATA: DATA2, RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "" } });
for (let i = 0; i < 50; i++) { try { if ((await fetch("http://localhost:8792/api/health")).ok) break; } catch { /* starting */ } await sleep(100); }
const off = await fetch("http://localhost:8792/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...buyer, email: "hr@acme-industries.com" }) });
check("production mode without Razorpay keys: nothing can be bought (503), no fake payment", off.status === 503, `${off.status}`);
prod.kill();

const fails = results.filter((x) => !x.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) { console.log("FAILED:"); fails.forEach((f) => console.log(" -", f.name, f.detail)); }
await sleep(500); for (const d of [DATA, DATA2]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* still locked by the stopped server; harmless */ } }
process.exit(fails.length ? 1 : 0);
