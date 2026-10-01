/**
 * Payments for CORPORATE TAMBOLA through Razorpay (public REST API), invoices brand-wise under one legal entity.
 *
 *   begin()     -> creates our payment row and a Razorpay Order (server side, amount in paise, brand in notes) -> the browser opens Razorpay Checkout
 *   verify()    -> checks the signature Razorpay returns (HMAC of order_id|payment_id) and the payment itself, then fulfils
 *   webhook()   -> same fulfilment when the buyer closed the tab (payment.captured / order.paid), signature checked
 *   fulfil()    -> idempotent: creates the engagement (or applies the upgrade), issues the invoice, sends the email
 * Local test mode (no keys, dev only) fulfils immediately and says so. Without keys in production nothing can be bought.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import {
  BRANDS, DEFAULT_COMPANY, companyGaps, createOrder, fetchPayment, capturePayment, financialYear, formatInvoiceNumber, renderInvoiceHtml, renderInvoiceText, splitGst, toMinor,
  verifyPaymentSignature, verifyWebhookSignature, type Company, type InvoiceData, type RazorpayConfig,
} from "@tambola/billing";

export interface PayDeps {
  db: Database; now: () => number; rid: (n?: number) => string; dev: boolean;
  createRoom: (organizerId: string, pack: number, currency: "INR" | "USD", init: any) => any;
  rooms: Map<string, any>;
  ai: { linkInfo: (org: string) => any; mint: (org: string, days: 1 | 7 | 30, level: "read" | "standard") => { token: string }; emailAbout: (o: any, link: string, x: any) => { subject: string; body: string }; sendEmail: (to: string, s: string, b: string, l: boolean) => void };
  sendMail: (to: string, subject: string, body: string) => void;
  price: (pack: number, cur: "INR" | "USD") => { total: number; base: number; tax: number };
  packs: ReadonlyArray<readonly [number, number, number]>;
  repoRoot: string;
}

export function loadCompany(root: string): Company {
  try {
    const f = process.env.TAMBOLA_COMPANY ?? join(root, "config/company.json");
    if (existsSync(f)) return { ...DEFAULT_COMPANY, ...JSON.parse(readFileSync(f, "utf8")) };
  } catch { /* fall through */ }
  return DEFAULT_COMPANY;
}
export function loadRazorpay(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID, keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET, baseUrl: process.env.RAZORPAY_BASE_URL };
}

export class PayError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export function createPayments(d: PayDeps) {
  const { db, now, rid } = d;
  const company = loadCompany(d.repoRoot);
  const rzp = loadRazorpay();
  const brand = BRANDS.corporate_tambola;
  const international = process.env.RAZORPAY_INTERNATIONAL === "1";

  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, organizer_id TEXT NOT NULL, purpose TEXT NOT NULL, engagement_code TEXT, pack INTEGER, currency TEXT NOT NULL, amount REAL NOT NULL, tax REAL NOT NULL DEFAULT 0,
      brand TEXT NOT NULL, rzp_order_id TEXT UNIQUE, rzp_payment_id TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL, paid_at INTEGER, meta_json TEXT NOT NULL, result_json TEXT
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, organizer_id TEXT NOT NULL, payment_id TEXT UNIQUE NOT NULL, brand TEXT NOT NULL, fy TEXT NOT NULL, seq INTEGER NOT NULL,
      number TEXT NOT NULL, issued_at INTEGER NOT NULL, data_json TEXT NOT NULL, UNIQUE (brand, fy, seq)
    );
  `);

  const mode = () => (rzp ? "razorpay" : d.dev ? "test" : "off");

  /** Create the payment row (+ Razorpay order). Returns what the browser needs, or, in local test mode, fulfils at once. */
  async function begin(o: { organizerId: string; email: string; org: string; country: string; taxId: string; pack: number; currency: "INR" | "USD"; origin: string; purpose: "new_engagement" | "upgrade"; engagementCode?: string; amountOverride?: { total: number; tax: number } }) {
    if (mode() === "off") throw new PayError(503, "Payments are not switched on yet. Please try again later.");
    if (o.currency === "USD" && rzp && !international) throw new PayError(400, "Payments in US dollars are not switched on yet. Please pay in Indian rupees or write to us.");
    const pr = o.amountOverride ?? d.price(o.pack, o.currency);
    const id = "pay_" + rid(8);
    const meta = { email: o.email, org: o.org, country: o.country, taxId: o.taxId, origin: o.origin };
    let rzpOrder: any = null;
    if (rzp) {
      try {
        rzpOrder = await createOrder(rzp, { amountMinor: toMinor(pr.total), currency: o.currency, receipt: id,
          notes: { brand: brand.name, product: "engagement", purpose: o.purpose, pack: String(o.pack), organization: o.org.slice(0, 80), payment_ref: id } });
      } catch (e: any) { throw new PayError(502, `The payment service said: ${e.message}`); }
    }
    db.query("INSERT INTO payments(id,organizer_id,purpose,engagement_code,pack,currency,amount,tax,brand,rzp_order_id,status,created_at,meta_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, o.organizerId, o.purpose, o.engagementCode ?? null, o.pack, o.currency, pr.total, pr.tax, brand.id, rzpOrder?.id ?? null, "created", now(), JSON.stringify(meta));
    if (!rzp) return { mode: "test" as const, paymentId: id, result: await fulfil(id) };
    return { mode: "razorpay" as const, paymentId: id, razorpay: { keyId: rzp.keyId, orderId: rzpOrder.id, amount: toMinor(pr.total), currency: o.currency, name: brand.name,
      description: o.purpose === "upgrade" ? `Upgrade to up to ${o.pack} participants` : `Up to ${o.pack} participants`, prefill: { email: o.email }, notes: { brand: brand.name }, theme: { color: brand.theme } } };
  }

  /** Browser says it paid: check the signature AND ask Razorpay what really happened. */
  async function verify(paymentId: string, resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
    if (!rzp) throw new PayError(400, "Online payments are not switched on.");
    const p = db.query("SELECT * FROM payments WHERE id=?").get(paymentId) as any;
    if (!p || p.rzp_order_id !== resp.razorpay_order_id) throw new PayError(404, "We could not match this payment.");
    if (p.status === "paid") return JSON.parse(p.result_json);
    if (!verifyPaymentSignature(rzp.keySecret, resp.razorpay_order_id, resp.razorpay_payment_id, resp.razorpay_signature)) throw new PayError(400, "The payment could not be verified. If money was taken it will be refunded; write to us with this reference: " + paymentId);
    const pay = await fetchPayment(rzp, resp.razorpay_payment_id).catch(() => null);
    if (!pay || pay.order_id !== resp.razorpay_order_id || Number(pay.amount) !== toMinor(p.amount)) throw new PayError(400, "The payment details did not match the order.");
    if (pay.status === "authorized") await capturePayment(rzp, pay.id, toMinor(p.amount), p.currency).catch(() => null);
    else if (pay.status !== "captured") throw new PayError(402, `The payment is ${pay.status}. Nothing was charged to your order.`);
    db.query("UPDATE payments SET rzp_payment_id=? WHERE id=?").run(resp.razorpay_payment_id, paymentId);
    return fulfil(paymentId);
  }

  /** Razorpay calls us when a payment is captured (covers a closed browser tab). */
  async function webhook(raw: string, signature: string) {
    if (!rzp?.webhookSecret) throw new PayError(503, "Webhook secret is not set.");
    if (!verifyWebhookSignature(rzp.webhookSecret, raw, signature)) throw new PayError(400, "Bad signature.");
    const ev = JSON.parse(raw);
    const ent = ev?.payload?.payment?.entity, ord = ev?.payload?.order?.entity;
    const orderId = ent?.order_id ?? ord?.id;
    if (!["payment.captured", "order.paid"].includes(ev.event) || !orderId) return { ok: true, ignored: ev.event };
    const p = db.query("SELECT * FROM payments WHERE rzp_order_id=?").get(orderId) as any;
    if (!p) return { ok: true, ignored: "unknown order" };
    if (ent?.id) db.query("UPDATE payments SET rzp_payment_id=COALESCE(rzp_payment_id,?) WHERE id=?").run(ent.id, p.id);
    await fulfil(p.id);
    return { ok: true, fulfilled: p.id };
  }

  /** Idempotent. Creates the engagement (or applies the upgrade), issues the invoice, sends the email. */
  async function fulfil(paymentId: string) {
    const p = db.query("SELECT * FROM payments WHERE id=?").get(paymentId) as any;
    if (!p) throw new PayError(404, "Unknown payment.");
    if (p.status === "paid") return JSON.parse(p.result_json);
    const meta = JSON.parse(p.meta_json);
    const org = db.query("SELECT * FROM organizers WHERE id=?").get(p.organizer_id) as any;
    let result: any;
    if (p.purpose === "new_engagement") {
      const room = d.createRoom(p.organizer_id, p.pack, p.currency, { orgName: meta.org, limit: p.pack, defaultCountry: meta.country ?? "IN", name: "My first engagement", startsAt: now() + 2 * 86400_000 });
      db.query("INSERT INTO orders(id,organizer_id,engagement_code,pack,currency,total,tax,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run(p.id, p.organizer_id, room.code, p.pack, p.currency, p.amount, p.tax, "paid", now());
      db.query("UPDATE payments SET engagement_code=? WHERE id=?").run(room.code, p.id);
      const existing = d.ai.linkInfo(p.organizer_id);
      const minted = existing && existing.active ? null : d.ai.mint(p.organizer_id, 30, "standard");
      const inv = issueInvoice(p, meta, `${brand.name}: up to ${p.pack} participants (one engagement)`);
      const mail = d.ai.emailAbout({ email: meta.email, org: meta.org }, minted ? `${meta.origin}/ai/${minted.token}` : "", { origin: meta.origin, engagement: { code: room.code, link: `${meta.origin}/e/${room.code}` }, order: { id: p.id, pack: p.pack, currency: p.currency, total: p.amount, tax: p.tax } });
      d.ai.sendEmail(meta.email, mail.subject, `${mail.body}\n\nINVOICE\n${inv.text}\nView or print it: ${meta.origin}/invoice/${inv.token}\n`, !!minted);
      result = { ok: true, orderId: p.id, engagementCode: room.code, total: p.amount, tax: p.tax, currency: p.currency, invoiceUrl: `/invoice/${inv.token}`, invoiceNumber: inv.number, ...(d.dev && minted ? { devAiLink: `${meta.origin}/ai/${minted.token}` } : {}) };
    } else {
      const room = d.rooms.get(p.engagement_code);
      if (!room) throw new PayError(404, "Engagement not found.");
      room.pack = p.pack;
      const err = room.engine.updateSettings("organizer", { limit: p.pack });
      if (err) throw new PayError(400, err);
      db.query("INSERT INTO orders(id,organizer_id,engagement_code,pack,currency,total,tax,status,created_at,upgrade_of) VALUES(?,?,?,?,?,?,?,?,?,?)").run(p.id, p.organizer_id, room.code, p.pack, p.currency, p.amount, p.tax, "paid", now(), room.code);
      room.touch();
      const inv = issueInvoice(p, meta, `${brand.name}: upgrade to up to ${p.pack} participants`);
      d.sendMail(org.email, `Invoice ${inv.number}: engagement upgraded`, `Your engagement now allows up to ${p.pack} participants.\n\nINVOICE\n${inv.text}\nView or print it: ${meta.origin}/invoice/${inv.token}\n`);
      result = { ok: true, orderId: p.id, engagementCode: room.code, pack: p.pack, paid: p.amount, currency: p.currency, invoiceUrl: `/invoice/${inv.token}`, invoiceNumber: inv.number };
    }
    db.query("UPDATE payments SET status='paid', paid_at=?, result_json=? WHERE id=?").run(now(), JSON.stringify(result), p.id);
    return result;
  }

  /** Brand-wise numbering per financial year. The legal entity is always the supplier. Missing supplier details => DRAFT, never a fake valid invoice. */
  function issueInvoice(p: any, meta: any, description: string) {
    const t = now(), fy = financialYear(new Date(t));
    const tax = splitGst(p.amount, p.currency, company.stateCode, meta.taxId);
    const token = "inv_" + rid(16);
    let seq = 0, number = "";
    db.transaction(() => {
      seq = ((db.query("SELECT COALESCE(MAX(seq),0) m FROM invoices WHERE brand=? AND fy=?").get(p.brand, fy) as any).m as number) + 1;
      number = formatInvoiceNumber(BRANDS[p.brand as keyof typeof BRANDS], fy, seq);
      const data: InvoiceData = { number, issuedAt: t, brand: BRANDS[p.brand as keyof typeof BRANDS], company, draft: companyGaps(company).length > 0,
        buyer: { name: meta.org, gstin: meta.taxId || undefined, email: meta.email, country: meta.country }, currency: p.currency,
        lines: [{ description, quantity: 1, amount: tax.taxable }], tax, paymentRef: p.rzp_payment_id ?? undefined, orderRef: p.id };
      db.query("INSERT INTO invoices(id,token,organizer_id,payment_id,brand,fy,seq,number,issued_at,data_json) VALUES(?,?,?,?,?,?,?,?,?,?)").run("inv_" + rid(6), token, p.organizer_id, p.id, p.brand, fy, seq, number, t, JSON.stringify(data));
    })();
    const row = db.query("SELECT data_json FROM invoices WHERE token=?").get(token) as any;
    return { token, number, text: renderInvoiceText(JSON.parse(row.data_json)) };
  }

  function invoiceHtml(token: string): string | null {
    const r = db.query("SELECT data_json FROM invoices WHERE token=?").get(token) as any;
    return r ? renderInvoiceHtml(JSON.parse(r.data_json)) : null;
  }
  function invoicesOf(organizerId: string) {
    return (db.query("SELECT token, number, brand, issued_at, data_json FROM invoices WHERE organizer_id=? ORDER BY issued_at DESC").all(organizerId) as any[]).map((r) => {
      const dta = JSON.parse(r.data_json);
      return { number: r.number, brand: dta.brand.name, issuedAt: r.issued_at, total: dta.tax.total, currency: dta.currency, url: `/invoice/${r.token}`, draft: dta.draft };
    });
  }
  const status = () => ({ mode: mode(), brand: brand.name, legalEntity: company.legalName, missingCompanyDetails: companyGaps(company), international });

  return { begin, verify, webhook, fulfil, invoiceHtml, invoicesOf, status, mode };
}
