// A FAKE Razorpay for the 20-game rehearsal. It lives in the scenario's own process (bun) and listens on localhost only; the sim server's Worker talks to it through
// RAZORPAY_BASE_URL exactly as the real Worker talks to https://api.razorpay.com/v1. It follows Razorpay's public documentation for the calls our code makes:
//   POST /v1/orders (amount in paise, currency, receipt, notes)  GET /v1/payments/:id  POST /v1/payments/:id/capture {amount, currency}  basic auth key_id:key_secret
// and gives the scenario the CUSTOMER side: customerPays() makes a payment object the way Razorpay would hold it after the buyer used UPI / card / net banking / wallet,
// sign() makes the checkout signature (HMAC_SHA256(order_id|payment_id, key_secret)), webhook() makes a signed webhook request body + header.
// It cannot prove Razorpay's real review, real UPI apps or real banks. Nothing here ever uses a real key.
import { createHmac, randomBytes } from "node:crypto";

export type Method = "upi" | "card" | "netbanking" | "wallet";
export type PayStatus = "created" | "authorized" | "captured" | "failed";
export interface PayOpts { method?: Method; status?: PayStatus; amount?: number; vpa?: string; network?: string; cardType?: string; last4?: string; international?: boolean; bank?: string; wallet?: string; email?: string; contact?: string; currency?: string }

export function makeFakeRzp(port: number, o: { keyId?: string; keySecret?: string; webhookSecret?: string } = {}) {
  const keyId = o.keyId ?? "rzp_test_FAKEKEY00000001", keySecret = o.keySecret ?? "fake-secret-" + randomBytes(8).toString("hex"), webhookSecret = o.webhookSecret ?? "fake-webhook-" + randomBytes(8).toString("hex");
  const orders = new Map<string, any>(), payments = new Map<string, any>(); const calls: { method: string; path: string; status: number; body?: any }[] = [];
  const rid = (p: string) => p + randomBytes(7).toString("hex").slice(0, 14).toUpperCase();
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  const authOk = (req: Request) => req.headers.get("authorization") === "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const failNext: { orders: number; captures: number } = { orders: 0, captures: 0 }; // make the next N order / capture calls fail (Razorpay down)
  const server = Bun.serve({
    port, hostname: "127.0.0.1",
    async fetch(req) {
      const u = new URL(req.url), p = u.pathname; let status = 200, out: any;
      if (!authOk(req)) { status = 401; out = { error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } }; }
      else if (req.method === "POST" && p === "/v1/orders") {
        const b: any = await req.json().catch(() => ({}));
        if (failNext.orders > 0) { failNext.orders--; status = 502; out = { error: { code: "SERVER_ERROR", description: "Razorpay is having a problem" } }; }
        else if (!Number.isInteger(b.amount) || b.amount < 100) { status = 400; out = { error: { code: "BAD_REQUEST_ERROR", description: "Order amount less than minimum amount allowed" } }; }
        else if (!["INR", "USD"].includes(b.currency)) { status = 400; out = { error: { code: "BAD_REQUEST_ERROR", description: "The currency is invalid" } }; }
        else { const id = rid("order_"); out = { id, entity: "order", amount: b.amount, amount_paid: 0, amount_due: b.amount, currency: b.currency, receipt: b.receipt ?? null, status: "created", notes: b.notes ?? {}, created_at: Math.floor(Date.now() / 1000) }; orders.set(id, out); }
      } else if (req.method === "GET" && /^\/v1\/payments\/[^/]+$/.test(p)) {
        const pay = payments.get(p.split("/")[3]!); if (!pay) { status = 404; out = { error: { code: "BAD_REQUEST_ERROR", description: "The id provided does not exist" } }; } else out = pay;
      } else if (req.method === "POST" && /^\/v1\/payments\/[^/]+\/capture$/.test(p)) {
        const pay = payments.get(p.split("/")[3]!); const b: any = await req.json().catch(() => ({}));
        if (failNext.captures > 0) { failNext.captures--; status = 502; out = { error: { code: "SERVER_ERROR", description: "Capture failed" } }; }
        else if (!pay) { status = 404; out = { error: { code: "BAD_REQUEST_ERROR", description: "The id provided does not exist" } }; }
        else if (pay.status !== "authorized") { status = 400; out = { error: { code: "BAD_REQUEST_ERROR", description: "This payment has already been captured" } }; }
        else if (b.amount !== pay.amount || b.currency !== pay.currency) { status = 400; out = { error: { code: "BAD_REQUEST_ERROR", description: "Capture amount must be equal to the amount authorized" } }; }
        else { pay.status = "captured"; pay.captured = true; const ord = orders.get(pay.order_id); if (ord) { ord.status = "paid"; ord.amount_paid = ord.amount; ord.amount_due = 0; } out = pay; }
      } else { status = 404; out = { error: { code: "BAD_REQUEST_ERROR", description: "The requested URL was not found on the server." } }; }
      calls.push({ method: req.method, path: p, status });
      return json(out, status);
    },
  });
  const sign = (orderId: string, paymentId: string) => createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  /** The buyer pays an order. Returns the payment entity Razorpay would hold. */
  function customerPays(orderId: string, po: PayOpts = {}) {
    const ord = orders.get(orderId); if (!ord) throw new Error("fake rzp: no order " + orderId);
    const method = po.method ?? "upi", status = po.status ?? "captured", id = rid("pay_");
    const pay: any = {
      id, entity: "payment", amount: po.amount ?? ord.amount, currency: po.currency ?? ord.currency, status, order_id: orderId, method, captured: status === "captured", international: po.international ?? ord.currency !== "INR",
      email: po.email ?? "buyer@example.com", contact: po.contact ?? "+919800000001", created_at: Math.floor(Date.now() / 1000), notes: ord.notes, fee: Math.round(ord.amount * 0.02), tax: Math.round(ord.amount * 0.0036),
      acquirer_data: method === "upi" ? { rrn: String(Math.floor(1e11 + Math.random() * 9e11)), upi_transaction_id: rid("UTX") } : { rrn: String(Math.floor(1e11 + Math.random() * 9e11)), auth_code: String(Math.floor(1e5 + Math.random() * 9e5)) },
    };
    if (method === "upi") pay.vpa = po.vpa ?? "fakebuyer@okfakebank";
    if (method === "card") pay.card = { network: po.network ?? "Visa", type: po.cardType ?? "credit", last4: po.last4 ?? "4242", international: !!pay.international };
    if (method === "netbanking") pay.bank = po.bank ?? "HDFC";
    if (method === "wallet") pay.wallet = po.wallet ?? "freecharge";
    if (status === "failed") { pay.error_code = "BAD_REQUEST_ERROR"; pay.error_description = "Payment failed (fake)"; }
    if (status === "captured") { ord.status = "paid"; ord.amount_paid = pay.amount; ord.amount_due = 0; }
    payments.set(id, pay); return pay;
  }
  const webhook = (event: string, pay: any) => { const raw = JSON.stringify({ entity: "event", event, payload: { payment: { entity: pay }, order: { entity: orders.get(pay.order_id) } }, created_at: Math.floor(Date.now() / 1000) }); return { raw, headers: { "content-type": "application/json", "x-razorpay-signature": createHmac("sha256", webhookSecret).update(raw).digest("hex") } }; };
  return { port, url: `http://127.0.0.1:${port}/v1`, keyId, keySecret, webhookSecret, orders, payments, calls, failNext, sign, customerPays, webhook, stop: () => server.stop(true) };
}
export type FakeRzp = ReturnType<typeof makeFakeRzp>;
