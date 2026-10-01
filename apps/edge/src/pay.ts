// Payments on the Worker (Razorpay), mirroring the original server's flow so nothing needs a server per organizer:
//   checkout  -> our payment row + a Razorpay Order (server side, amount in paise); the browser opens Razorpay Checkout
//   verify    -> checks Razorpay's signature AND asks Razorpay what really happened, then fulfils
//   webhook   -> same fulfilment when the buyer closed the tab (signature checked)
//   fulfil    -> idempotent: organizer (new or existing by e-mail) gets one ENTITLEMENT for the pack, an invoice is issued, mail is sent
// An entitlement is what lets an organizer create one engagement of up to `pack` participants; without one, creating is refused.
// Needs the `nodejs_compat` flag (billing uses node:crypto HMAC). Test mode (env.TEST_MODE = "1", never in production) fulfils without Razorpay.
import {
  BRANDS, DEFAULT_COMPANY, companyGaps, createOrder, fetchPayment, capturePayment, financialYear, formatInvoiceNumber, renderInvoiceHtml, renderInvoiceText, splitGst, toMinor,
  verifyPaymentSignature, verifyWebhookSignature, type Company, type InvoiceData, type RazorpayConfig,
} from "../../../packages/billing/src";
import { PACKS, price } from "../../../packages/shared/src/pricing";
import type { D1, Env } from "./worker";
import { partnerCode, phoneHashFor, recordCommission } from "./partners";

export interface PayEnv extends Env {
  RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string; RAZORPAY_WEBHOOK_SECRET?: string; RAZORPAY_BASE_URL?: string; RAZORPAY_INTERNATIONAL?: string;
  PARTNER_COMMISSION_RATE?: string; TEST_MODE?: string; COMPANY_JSON?: string; RESEND_API_KEY?: string; FREE_LAUNCH?: string; MAIL_FROM?: string; MAIL_REPLY_TO?: string; PUBLIC_ORIGIN?: string;
}

export const PAY_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS payment (id TEXT PRIMARY KEY, org TEXT, email TEXT NOT NULL, pack INTEGER NOT NULL, currency TEXT NOT NULL, amount REAL NOT NULL, tax REAL NOT NULL, rzp_order_id TEXT UNIQUE, rzp_payment_id TEXT, status TEXT NOT NULL, created_ms INTEGER NOT NULL, paid_ms INTEGER, meta TEXT NOT NULL, result TEXT, ref TEXT, buyer_phone_hash TEXT)`,
  `CREATE TABLE IF NOT EXISTS invoice (token TEXT PRIMARY KEY, payment_id TEXT UNIQUE NOT NULL, brand TEXT NOT NULL, fy TEXT NOT NULL, seq INTEGER NOT NULL, number TEXT NOT NULL, issued_ms INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE (brand, fy, seq))`,
  `CREATE TABLE IF NOT EXISTS entitlement (id TEXT PRIMARY KEY, org TEXT NOT NULL, pack INTEGER NOT NULL, payment_id TEXT NOT NULL, eid TEXT, created_ms INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS organizer_email (email_hash TEXT PRIMARY KEY, org TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, to_addr TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, at_ms INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0)`,
];

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("");
const randHex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
const brand = BRANDS.corporate_tambola;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

const company = (env: PayEnv): Company => { try { return { ...DEFAULT_COMPANY, ...(env.COMPANY_JSON ? JSON.parse(env.COMPANY_JSON) : {}) }; } catch { return DEFAULT_COMPANY; } };
const rzpOf = (env: PayEnv): (RazorpayConfig) | null => (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET ? { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET, baseUrl: env.RAZORPAY_BASE_URL } : null);
/** Optional switch (env FREE_LAUNCH="1"): small engagements (up to FREE_CAP participants) may be published without a purchase. Building a draft is always free. */
export const FREE_CAP = 100, MAX_DRAFTS = 10;
export const freeLaunch = (env: PayEnv) => env.FREE_LAUNCH === "1";
export const payMode = (env: PayEnv) => (rzpOf(env) ? "razorpay" : env.TEST_MODE === "1" ? "test" : "off");

async function body(req: Request, max = 4096): Promise<any | null> { const t = await req.text(); if (t.length > max) return null; try { const v = JSON.parse(t); return v && typeof v === "object" ? v : null; } catch { return null; } }

const KEYRE = /ctk_[0-9a-f]{48}/g;
/**
 * Mail goes out through Resend (the same account and verified sending domain DPDP already uses, so no extra cost). Only organizers, the people who bought,
 * are ever e-mailed; participants are reached by mobile number only. In production the mail body is never kept: a sent mail leaves no body behind, and a
 * mail that could not be sent is kept (with any organizer key blanked out) only so the daily job can try again, then it is dropped after 3 days.
 * Without RESEND_API_KEY (local/test) the mail simply stays in the outbox so it can be read.
 */
export async function sendMail(env: PayEnv, db: D1, to: string, subject: string, text: string, now: number) {
  if (!env.RESEND_API_KEY) { await db.prepare("INSERT INTO outbox(to_addr,subject,body,at_ms,sent) VALUES(?,?,?,?,0)").bind(to, subject, text, now).run(); return; }
  const ok = await resendSend(env, to, subject, text);
  await db.prepare("INSERT INTO outbox(to_addr,subject,body,at_ms,sent) VALUES(?,?,?,?,?)").bind(to, subject, ok ? "" : text.replace(KEYRE, "ctk_(blanked; use the key shown when you paid, or sign in with an e-mailed code)"), now, ok ? 1 : 0).run();
}
async function resendSend(env: PayEnv, to: string, subject: string, text: string): Promise<boolean> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM ?? "Corporate Tambola <tambola@veridian-aios.com>", to: [to], subject, text, ...(env.MAIL_REPLY_TO ? { reply_to: env.MAIL_REPLY_TO } : {}), headers: { "Auto-Submitted": "auto-generated" } }),
    });
    return r.ok;
  } catch { return false; }
}
/** Daily job: tries unsent mail once more (only mail with a body worth retrying), and forgets anything older than 3 days. */
export async function retryOutbox(env: PayEnv, now: number): Promise<{ retried: number; dropped: number }> {
  const db = env.DB; let retried = 0;
  if (env.RESEND_API_KEY) {
    const rows = (await db.prepare("SELECT id, to_addr, subject, body FROM outbox WHERE sent=0 AND body<>'' AND at_ms>?").bind(now - 3 * 86_400_000).all<any>()).results ?? [];
    for (const r of rows) if (await resendSend(env, r.to_addr, r.subject, r.body)) { await db.prepare("UPDATE outbox SET sent=1, body='' WHERE id=?").bind(r.id).run(); retried++; }
  }
  const old = await db.prepare("DELETE FROM outbox WHERE at_ms<?").bind(now - 3 * 86_400_000).run();
  return { retried, dropped: old.meta?.changes ?? 0 };
}

async function fulfil(env: PayEnv, paymentId: string, now: number, spend: (n: number) => Promise<boolean>) {
  const db = env.DB;
  const p = await db.prepare("SELECT * FROM payment WHERE id=?").bind(paymentId).first<any>();
  if (!p) return { error: "Unknown payment.", status: 404 };
  if (p.status === "paid") return { result: JSON.parse(p.result ?? "{}") };
  if (!(await spend(6))) return { error: "Busy day. Your payment is safe; this will complete shortly.", status: 503 };
  const meta = JSON.parse(p.meta);
  const eh = await sha("email|" + p.email.toLowerCase());
  let org = (await db.prepare("SELECT org FROM organizer_email WHERE email_hash=?").bind(eh).first<{ org: string }>())?.org ?? null;
  let organizerKey: string | null = null;
  if (!org) { // a first purchase makes the organizer; the key is shown once (and mailed)
    org = randHex(8); organizerKey = "ctk_" + randHex(24);
    await db.batch([
      db.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms) VALUES(?,?,?,0,?)").bind(await sha("key|" + organizerKey), org, "master", now),
      db.prepare("INSERT INTO organizer_email(email_hash,org) VALUES(?,?)").bind(eh, org),
    ]);
  }
  await db.prepare("INSERT OR IGNORE INTO entitlement(id,org,pack,payment_id,eid,created_ms) VALUES(?,?,?,?,NULL,?)").bind("ent_" + p.id, org, p.pack, p.id, now).run();
  // invoice: brand-wise numbering per financial year; the legal entity is always the supplier; missing supplier details => DRAFT, never a fake valid invoice
  const co = company(env);
  const fy = financialYear(new Date(now));
  const tax = splitGst(p.amount, p.currency, co.stateCode, meta.taxId);
  const token = "inv_" + randHex(16);
  const seq = ((await db.prepare("SELECT COALESCE(MAX(seq),0) AS m FROM invoice WHERE brand=? AND fy=?").bind(brand.id, fy).first<{ m: number }>())?.m ?? 0) + 1;
  const number = formatInvoiceNumber(brand, fy, seq);
  const data: InvoiceData = { number, issuedAt: now, brand, company: co, draft: companyGaps(co).length > 0, buyer: { name: meta.org, gstin: meta.taxId || undefined, email: p.email, country: meta.country }, currency: p.currency,
    lines: [{ description: `${brand.name}: up to ${p.pack} participants (one engagement)`, quantity: 1, amount: tax.taxable }], tax, paymentRef: p.rzp_payment_id ?? undefined, orderRef: p.id };
  await db.prepare("INSERT OR IGNORE INTO invoice(token,payment_id,brand,fy,seq,number,issued_ms,data) VALUES(?,?,?,?,?,?,?,?)").bind(token, p.id, brand.id, fy, seq, number, now, JSON.stringify(data)).run();
  const origin = env.PUBLIC_ORIGIN ?? meta.origin ?? "";
  const lines = [
    `Thank you. Your ${brand.name} engagement for up to ${p.pack} participants is ready to set up.`,
    organizerKey ? `Your organizer key (keep it private, it is shown only once): ${organizerKey}\nOpen ${origin}/zc.html and paste it to begin.` : `Use your existing organizer key at ${origin}/zc.html to create this engagement.`,
    `\nINVOICE\n${renderInvoiceText(data)}\nView or print it: ${origin}/api/invoice/${token}`,
  ];
  await sendMail(env, db, p.email, `${brand.name}: payment received, invoice ${number}`, lines.join("\n\n"), now);
  await recordCommission(env, p, tax.taxable, now); // refer & earn: a commission row for a referred, PAID purchase only
  const result = { ok: true, orderId: p.id, pack: p.pack, total: p.amount, tax: p.tax, currency: p.currency, invoiceUrl: `/api/invoice/${token}`, invoiceNumber: number, organizerKey, newOrganizer: !!organizerKey };
  await db.prepare("UPDATE payment SET status='paid', paid_ms=?, org=?, result=? WHERE id=?").bind(now, org, JSON.stringify(result), p.id).run();
  return { result };
}

/** Returns a Response for payment routes, or null when the path is not one of ours. */
export async function payRoute(req: Request, env: PayEnv, now: number, spend: (n: number) => Promise<boolean>): Promise<Response | null> {
  const url = new URL(req.url); const p = url.pathname; const db = env.DB;
  const rzp = rzpOf(env); const mode = payMode(env);
  const busy = () => json({ error: "Busy day. Please try again after midnight UTC." }, 503);

  if (req.method === "GET" && p === "/api/payments/status") { const co = company(env); return json({ mode, freeLaunch: freeLaunch(env), freeCap: FREE_CAP, brand: brand.name, legalEntity: co.legalName, missingCompanyDetails: companyGaps(co), international: env.RAZORPAY_INTERNATIONAL === "1" }); }

  if (req.method === "POST" && p === "/api/checkout") {
    if (mode === "off") return json({ error: "Payments are not switched on yet. Please try again later." }, 503);
    const b = await body(req);
    const pack = Number(b?.pack); const cur = b?.currency === "USD" ? "USD" : "INR";
    if (!b || !PACKS.some((x) => x[0] === pack)) return json({ error: "Choose a pack." }, 400);
    if (typeof b.email !== "string" || !EMAIL.test(b.email.trim())) return json({ error: "Enter a valid e-mail address." }, 400);
    if (typeof b.org !== "string" || b.org.trim().length < 2) return json({ error: "Enter your organisation's name." }, 400);
    if (cur === "USD" && rzp && env.RAZORPAY_INTERNATIONAL !== "1") return json({ error: "Payments in US dollars are not switched on yet. Please pay in Indian rupees or write to us." }, 400);
    if (!(await spend(2))) return busy();
    const pr = price(pack, cur);
    const id = "pay_" + randHex(8);
    const meta = { org: String(b.org).trim().slice(0, 120), country: typeof b.country === "string" ? b.country.slice(0, 2) : "IN", taxId: typeof b.taxId === "string" ? b.taxId.trim().slice(0, 20) : "", origin: env.PUBLIC_ORIGIN ?? url.origin };
    let order: any = null;
    if (rzp) {
      try { order = await createOrder(rzp, { amountMinor: toMinor(pr.total), currency: cur, receipt: id, notes: { brand: brand.name, product: "engagement", pack: String(pack), organization: meta.org.slice(0, 80), payment_ref: id } }); }
      catch (e: any) { return json({ error: `The payment service said: ${e.message}` }, 502); }
    }
    const ref = partnerCode(b.ref); // from the buyer's own browser (valid for 30 days after the link was opened); checked against real partners when the payment is fulfilled
    const bph = partnerCode(b.phone); // optional, only used to spot a partner buying through their own link
    await db.prepare("INSERT INTO payment(id,org,email,pack,currency,amount,tax,rzp_order_id,status,created_ms,meta,ref,buyer_phone_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, null, b.email.trim().toLowerCase(), pack, cur, pr.total, pr.tax, order?.id ?? null, "created", now, JSON.stringify(meta), ref, bph ? await phoneHashFor(env, bph) : null).run();
    if (!rzp) { const f = await fulfil(env, id, now, spend); return "result" in f ? json({ mode: "test", paymentId: id, result: f.result }) : json({ error: f.error }, f.status); }
    return json({ mode: "razorpay", paymentId: id, razorpay: { keyId: rzp.keyId, orderId: order.id, amount: toMinor(pr.total), currency: cur, name: brand.name, description: `Up to ${pack} participants`, prefill: { email: b.email.trim() }, notes: { brand: brand.name }, theme: { color: brand.theme } } });
  }

  if (req.method === "POST" && p === "/api/payments/verify") {
    if (!rzp) return json({ error: "Online payments are not switched on." }, 400);
    const b = await body(req);
    const row = b && typeof b.paymentId === "string" ? await db.prepare("SELECT * FROM payment WHERE id=?").bind(b.paymentId).first<any>() : null;
    if (!row || row.rzp_order_id !== b.razorpay_order_id) return json({ error: "We could not match this payment." }, 404);
    if (row.status === "paid") return json(JSON.parse(row.result));
    if (!verifyPaymentSignature(rzp.keySecret, String(b.razorpay_order_id), String(b.razorpay_payment_id), String(b.razorpay_signature)))
      return json({ error: "The payment could not be verified. If money was taken it will be refunded." }, 400);
    const pay = await fetchPayment(rzp, String(b.razorpay_payment_id)).catch(() => null);
    if (!pay || pay.order_id !== b.razorpay_order_id || Number(pay.amount) !== toMinor(row.amount)) return json({ error: "The payment details did not match the order." }, 400);
    if (pay.status === "authorized") await capturePayment(rzp, pay.id, toMinor(row.amount), row.currency).catch(() => null);
    else if (pay.status !== "captured") return json({ error: `The payment is ${pay.status}. Nothing was charged to your order.` }, 402);
    await db.prepare("UPDATE payment SET rzp_payment_id=? WHERE id=?").bind(String(b.razorpay_payment_id), row.id).run();
    const f = await fulfil(env, row.id, now, spend);
    return "result" in f ? json(f.result) : json({ error: f.error }, f.status);
  }

  if (req.method === "POST" && p === "/api/payments/webhook") {
    const raw = await req.text();
    if (!rzp?.webhookSecret) return json({ error: "Webhook secret is not set." }, 503);
    if (raw.length > 100_000 || !verifyWebhookSignature(rzp.webhookSecret, raw, req.headers.get("x-razorpay-signature") ?? "")) return json({ error: "Bad signature." }, 400);
    let ev: any; try { ev = JSON.parse(raw); } catch { return json({ error: "Bad body." }, 400); }
    const ent = ev?.payload?.payment?.entity, ord = ev?.payload?.order?.entity;
    const orderId = ent?.order_id ?? ord?.id;
    if (!["payment.captured", "order.paid"].includes(ev.event) || !orderId) return json({ ok: true, ignored: ev.event });
    const row = await db.prepare("SELECT * FROM payment WHERE rzp_order_id=?").bind(orderId).first<any>();
    if (!row) return json({ ok: true, ignored: "unknown order" });
    if (Number(ent?.amount ?? toMinor(row.amount)) !== toMinor(row.amount)) return json({ ok: true, ignored: "amount mismatch" }); // never fulfil an order that was paid a different amount
    if (ent?.id) await db.prepare("UPDATE payment SET rzp_payment_id=COALESCE(rzp_payment_id,?) WHERE id=?").bind(ent.id, row.id).run();
    const f = await fulfil(env, row.id, now, spend);
    return "result" in f ? json({ ok: true, fulfilled: row.id }) : json({ error: f.error }, f.status);
  }

  const im = p.match(/^\/api\/invoice\/(inv_[0-9a-f]{32})$/);
  if (req.method === "GET" && im) {
    const r = await db.prepare("SELECT data FROM invoice WHERE token=?").bind(im[1]).first<{ data: string }>();
    return r ? new Response(renderInvoiceHtml(JSON.parse(r.data)), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } }) : json({ error: "Not found" }, 404);
  }
  return null;
}
