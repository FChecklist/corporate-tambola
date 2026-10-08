// Cancel a game, refund the money, and the e-mails around them (round 2 spec, docs/ROLES_AND_CONSOLE_SPEC_2.md items 1, 2 and 6).
//   - Only the Organizer and a Host may cancel (worker.ts checks the key; a Host's cancel also tells the Organizer). Unpaid: any time. Paid: only BEFORE the start time.
//   - A refund is the amount paid MINUS the payment-gateway charge (REFUND_FEE_RATE, default 2.36% = 2% + 18% GST on that 2%). One refund per payment (primary key = payment id),
//     so asking twice, or a retry, can never pay out twice. With Razorpay keys the refund goes back to the original payment method; with none it waits as 'requested' and the
//     platform owner is e-mailed to do it by hand. A test payment gets a labelled test refund and never touches Razorpay.
//   - A GST credit note (own number series, names the invoice it reduces) is issued with the refund, and the referring partner's commission on that sale is voided.
//   - The guests' names and numbers are erased 23 hours after the cancel time by the normal lifecycle tick (lifecycle.ts); a Co-host's name and number go at once.
// Nothing here may carry an AI link (mails.ts is the only place that builds those).
import { BRANDS, companyGaps, createRefund, financialYear, formatInvoiceNumber, splitGst, toMinor, type InvoiceData } from "../../../packages/billing/src";
import { openText } from "./pii";
import { company, payMode, sendMail, type PayEnv } from "./pay";
import { voidCommission } from "./partners";
import type { D1 } from "./worker";

/** The payment-gateway charge kept out of a refund: 2% plus 18% GST on that 2% = 2.36%. Override with env REFUND_FEE_RATE (a fraction, e.g. 0.0236). */
export const REFUND_FEE_RATE = 0.0236;
export const refundFeeRate = (env: { REFUND_FEE_RATE?: string }): number => { const v = Number(env.REFUND_FEE_RATE); return env.REFUND_FEE_RATE !== undefined && env.REFUND_FEE_RATE !== "" && Number.isFinite(v) && v >= 0 && v < 0.5 ? v : REFUND_FEE_RATE; };
const r2 = (x: number) => Math.round(x * 100) / 100;
const GENESIS = 1692803367;
const roundMs = (r: number) => (GENESIS + (r - 1) * 3) * 1000;
const randHex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
const istStamp = (ms: number) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) + " IST";
const mo = (n: number, cur: string) => (cur === "USD" ? "US$" : "Rs ") + n.toLocaleString(cur === "USD" ? "en-US" : "en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface RefundNumbers { paidInr: number; feeInr: number; refundInr: number; currency: string; feeNote: string }
/** The exact numbers shown in the preview and in the cancel e-mail. (The field names say Inr; `currency` says what they really are for the rare US-dollar payment.) */
export function refundNumbers(amount: number, rate: number, currency = "INR"): RefundNumbers {
  const fee = r2(amount * rate);
  return { paidInr: r2(amount), feeInr: fee, refundInr: r2(amount - fee), currency, feeNote: `The payment service keeps a charge of ${(rate * 100).toFixed(2)}% on every payment (2% plus 18% GST on that charge). We cannot get it back, so it is taken from the refund.` };
}

/** The paid payment of a game: the one made for it, or the earlier one whose pack it was published with. */
export async function paymentOfGame(db: D1, eid: string): Promise<any | null> {
  return (await db.prepare("SELECT * FROM payment WHERE status='paid' AND (eid=? OR id IN (SELECT payment_id FROM entitlement WHERE eid=?)) ORDER BY paid_ms DESC LIMIT 1").bind(eid, eid).first<any>()) ?? null;
}
/** What was recorded for a payment's refund, in the words of the API. */
export const refundView = (r: any) => r ? { refund_status: r.refund_status, status: r.refund_status, paidInr: r.paid, feeInr: r.fee, refundInr: r.refund, currency: r.currency, test: !!r.is_test, ...(r.is_test ? { label: "TEST refund: nothing was returned, nothing was charged." } : {}), requestedMs: r.requested_ms, updatedMs: r.updated_ms, ...(r.rzp_refund_id ? { refundId: r.rzp_refund_id } : {}) } : null;

/** Can this game be cancelled right now, and what would the refund be? (GET /api/z/{id}/cancel-preview) */
export async function cancelPreview(env: PayEnv, e: any, now: number): Promise<{ canCancel: boolean; reason?: string; paid: boolean; cancelled?: boolean; refund: (RefundNumbers & { status?: string; refund_status?: string; test?: boolean; label?: string }) | null }> {
  const paid = e.pack !== 0;
  const existing = e.cancelled_ms ? await env.DB.prepare("SELECT r.* FROM refund r WHERE r.eid=? LIMIT 1").bind(e.id).first<any>() : null;
  if (e.cancelled_ms) return { canCancel: false, reason: "This game is already cancelled.", paid, cancelled: true, refund: existing ? { ...refundNumbers(existing.paid, existing.paid ? existing.fee / existing.paid : 0, existing.currency), ...refundView(existing)! } : null };
  if (paid && roundMs(e.start_round) <= now) return { canCancel: false, reason: "The start time has passed and this game is paid, so it cannot be cancelled now. Please use End the game instead.", paid, refund: null };
  let refund: RefundNumbers | null = null;
  if (paid) { const p = await paymentOfGame(env.DB, e.id); if (p) refund = refundNumbers(p.amount, refundFeeRate(env), p.currency); }
  return { canCancel: true, paid, refund };
}

/** Every address that should hear about a game: the Organizer, then each Host who has an e-mail (nobody else ever has one). */
export async function teamEmails(env: PayEnv, org: string | null, eid: string): Promise<{ organizer: string | null; hosts: string[] }> {
  let organizer: string | null = null;
  try {
    if (org) organizer = await openText(env as any, (await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`orgmail/${org}`).first<{ v: string }>())?.v);
    if (!organizer) { const c = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`contact/${eid}`).first<{ v: string }>(); organizer = c ? (JSON.parse(c.v).email as string) : null; }
  } catch { /* no organizer address known */ }
  const hosts: string[] = [];
  if (org) for (const r of (await env.DB.prepare("SELECT email_sealed FROM organizer_key WHERE org=? AND kind='host' AND revoked=0 AND expires_ms IS NULL AND (host_id IS NULL OR host_id=hash) AND email_sealed IS NOT NULL").bind(org).all<{ email_sealed: string }>()).results ?? []) { const x = await openText(env as any, r.email_sealed); if (x) hosts.push(x); }
  return { organizer, hosts };
}

/** A Co-host's name and mobile number, and their key, go away (at the 23-hour erasure of the game's participant data, or at cancel). */
export const eraseCohostsSql = "UPDATE organizer_key SET revoked=1, label=NULL, pii=NULL WHERE eid=? AND kind='cohost'";

async function mailOwner(env: PayEnv, subject: string, text: string, now: number): Promise<void> {
  const to = (env.OWNER_EMAIL ?? "").trim();
  if (to) await sendMail(env, env.DB, to, subject, text, now);
}

/** Issues the GST credit note for a refund (idempotent: one per payment). Test payments get a negative sequence and a TEST- number, like their invoices. Returns its public token. */
async function issueCreditNote(env: PayEnv, p: any, amount: number, eid: string | null, now: number, test: boolean): Promise<string> {
  const db = env.DB;
  const old = await db.prepare("SELECT token FROM credit_note WHERE payment_id=?").bind(p.id).first<{ token: string }>();
  if (old) return old.token;
  const brand = BRANDS.corporate_tambola, co = company(env), meta = JSON.parse(p.meta ?? "{}");
  const fy = financialYear(new Date(now));
  const seq = test
    ? -(((await db.prepare("SELECT COUNT(*) AS c FROM credit_note WHERE brand=? AND fy=? AND seq<0").bind(brand.id, fy).first<{ c: number }>())?.c ?? 0) + 1)
    : ((await db.prepare("SELECT COALESCE(MAX(seq),0) AS m FROM credit_note WHERE brand=? AND fy=? AND seq>0").bind(brand.id, fy).first<{ m: number }>())?.m ?? 0) + 1;
  const number = test ? `TEST-CN-${fy}-${-seq}` : formatInvoiceNumber({ ...brand, invoicePrefix: brand.invoicePrefix + "-CN" }, fy, seq);
  const orig = await db.prepare("SELECT number FROM invoice WHERE payment_id=?").bind(p.id).first<{ number: string }>();
  const tax = splitGst(amount, p.currency, co.stateCode, meta.taxId);
  const data: InvoiceData = { kind: "credit_note", originalNumber: orig?.number, number, issuedAt: now, brand, company: co, draft: test || companyGaps(co).length > 0, buyer: { name: meta.org || meta.name || "", gstin: meta.taxId || undefined, email: p.email, country: meta.country }, currency: p.currency,
    lines: [{ description: `${brand.name}: refund for the cancelled game${eid ? " " + eid : ""} (amount paid less the payment-gateway charge)`, quantity: 1, amount: tax.taxable }], tax, orderRef: p.id };
  const token = "cn_" + randHex(16);
  await db.prepare("INSERT OR IGNORE INTO credit_note(token,payment_id,brand,fy,seq,number,issued_ms,data) VALUES(?,?,?,?,?,?,?,?)").bind(token, p.id, brand.id, fy, seq, number, now, JSON.stringify(data)).run();
  return (await db.prepare("SELECT token FROM credit_note WHERE payment_id=?").bind(p.id).first<{ token: string }>())?.token ?? token;
}

/**
 * Refunds one payment, once. A second call (a retry, a double tap, two people cancelling at once) finds the first refund row and returns it unchanged.
 * Order matters for safety: the refund row is written FIRST (so a crash cannot lead to a second payout), then the credit note and commission void, then the gateway.
 */
export async function refundPayment(env: PayEnv, p: any, eid: string | null, org: string | null, now: number): Promise<{ row: any; created: boolean; creditNote: string | null }> {
  const db = env.DB;
  const have = await db.prepare("SELECT * FROM refund WHERE payment_id=?").bind(p.id).first<any>();
  if (have) return { row: have, created: false, creditNote: null };
  const n = refundNumbers(p.amount, refundFeeRate(env), p.currency);
  const rzp = env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET ? { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET, baseUrl: env.RAZORPAY_BASE_URL } : null;
  const test = !!p.is_test || (!p.rzp_payment_id && payMode(env) === "test");
  const ins = await db.prepare("INSERT OR IGNORE INTO refund(payment_id,eid,org,currency,paid,fee,refund,refund_status,rzp_refund_id,is_test,note,requested_ms,updated_ms) VALUES(?,?,?,?,?,?,?,'requested',NULL,?,NULL,?,?)").bind(p.id, eid, org, p.currency, n.paidInr, n.feeInr, n.refundInr, test ? 1 : 0, now, now).run();
  if ((ins.meta?.changes ?? 0) === 0) return { row: await db.prepare("SELECT * FROM refund WHERE payment_id=?").bind(p.id).first<any>(), created: false, creditNote: null };
  const creditNote = await issueCreditNote(env, p, n.refundInr, eid, now, test);
  await voidCommission(db, p.id, "refund");
  const set = (status: string, extra: { id?: string; note?: string } = {}) => db.prepare("UPDATE refund SET refund_status=?, rzp_refund_id=?, note=?, updated_ms=? WHERE payment_id=?").bind(status, extra.id ?? null, extra.note ?? null, now, p.id).run();
  if (test) await set("processed", { id: "test_" + randHex(6), note: "TEST refund: nothing was returned." });
  else if (rzp && p.rzp_payment_id) {
    try {
      const r = await createRefund(rzp, p.rzp_payment_id, { amountMinor: toMinor(n.refundInr), receipt: "rf_" + p.id, notes: { reason: "game cancelled before the start", payment_ref: p.id, game: eid ?? "" } });
      await set(r.status === "processed" ? "processed" : r.status === "failed" ? "failed" : "requested", { id: r.id });
      if (r.status === "failed") await mailOwner(env, `Refund FAILED for payment ${p.id}`, `Razorpay marked the refund of ${mo(n.refundInr, p.currency)} for payment ${p.id} (game ${eid ?? "-"}) as failed. Please process it in the Razorpay dashboard.`, now);
    } catch (e: any) {
      await set("failed", { note: String(e?.message ?? e).slice(0, 200) });
      await mailOwner(env, `Refund FAILED for payment ${p.id}`, `The refund of ${mo(n.refundInr, p.currency)} for payment ${p.id} (game ${eid ?? "-"}) could not be sent to Razorpay (${String(e?.message ?? e).slice(0, 120)}). Please process it in the Razorpay dashboard. Record: refund_status = failed.`, now);
    }
  } else await mailOwner(env, `Refund to process: payment ${p.id}`, `A paid game was cancelled before its start. Please refund ${mo(n.refundInr, p.currency)} (paid ${mo(n.paidInr, p.currency)} less the gateway charge ${mo(n.feeInr, p.currency)}) for payment ${p.id}${p.rzp_payment_id ? ` (Razorpay payment ${p.rzp_payment_id})` : ""} in the Razorpay dashboard. Record: refund_status = requested.`, now); // no gateway keys here: done by hand
  return { row: await db.prepare("SELECT * FROM refund WHERE payment_id=?").bind(p.id).first<any>(), created: true, creditNote };
}

/**
 * The cancel itself. The caller has already checked who is asking and that the body said confirmations: 3. Returns the HTTP status and body.
 * `by` is the key kind that cancelled (master, host or platform).
 */
export async function cancelGame(env: PayEnv, e: any, now: number, by: string): Promise<{ status: number; body: any }> {
  const db = env.DB;
  const pre = await cancelPreview(env, e, now);
  if (e.cancelled_ms) { const r = await db.prepare("SELECT * FROM refund WHERE eid=? LIMIT 1").bind(e.id).first<any>(); return { status: 200, body: { ok: true, cancelled: true, already: true, refund: r ? { ...refundNumbers(r.paid, r.paid ? r.fee / r.paid : 0, r.currency), ...refundView(r)! } : null } }; }
  if (!pre.canCancel) return { status: 409, body: { error: pre.reason, canCancel: false } };
  const up = await db.prepare("UPDATE engagement SET cancelled_ms=?, cancelled_by=? WHERE id=? AND cancelled_ms IS NULL").bind(now, by, e.id).run();
  if ((up.meta?.changes ?? 0) === 0) return { status: 200, body: { ok: true, cancelled: true, already: true, refund: null } }; // someone cancelled at the same moment
  await db.prepare(eraseCohostsSql).bind(e.id).run(); // Co-hosts of this game: name, mobile and key go now
  await db.prepare("DELETE FROM kv WHERE k=?").bind(`ann/${e.id}`).run();
  const p = e.pack !== 0 ? await paymentOfGame(db, e.id) : null;
  const rf = p ? await refundPayment(env, p, e.id, e.org, now) : null;
  const refund = rf ? { ...refundNumbers(rf.row.paid, rf.row.paid ? rf.row.fee / rf.row.paid : 0, rf.row.currency), ...refundView(rf.row)! } : null;
  // "game cancelled" e-mail: the Organizer, each Host with an e-mail, and the payer
  let name = e.id; try { name = JSON.parse(e.config ?? "{}").name || e.id; } catch { /* the id */ }
  const origin = env.PUBLIC_ORIGIN ?? "";
  const who = by === "host" ? "a Host" : by === "master" ? "the Organizer" : "the platform owner";
  const cn = rf?.creditNote ? `${origin}/api/credit-note/${rf.creditNote}` : null;
  const lines = [
    `The game "${name}" (${e.id}) was cancelled by ${who} on ${istStamp(now)}. It was due to start on ${istStamp(roundMs(e.start_round))}.`,
    "Guests who open the link are told: This game was cancelled by the organizer. Their names and mobile numbers are deleted within 24 hours.",
    refund
      ? [`Refund: you paid ${mo(refund.paidInr, refund.currency)}. The payment-gateway charge is ${mo(refund.feeInr, refund.currency)}. The refund is ${mo(refund.refundInr, refund.currency)}${refund.test ? " (this is a TEST game: nothing was really paid or returned)" : ""}.`,
         refund.feeNote,
         refund.refund_status === "processed" ? "It has been sent back to the original payment method." : refund.refund_status === "failed" ? "We could not send it automatically. We have been told and will process it by hand." : "We will send it back to the original payment method. It can take 5 to 7 working days to show in the account.",
         ...(cn ? [`Your GST credit note: ${cn}`] : [])].join("\n")
      : e.pack !== 0 ? "No money is due back for this game: it was not paid for through this service." : "The game had not been paid for, so no money is involved.",
  ];
  const tos = await teamEmails(env, e.org, e.id);
  const seen = new Set<string>();
  const send = async (to: string | null | undefined) => { const t = (to ?? "").trim().toLowerCase(); if (!t || seen.has(t)) return; seen.add(t); await sendMail(env, db, t, `Game cancelled: ${name}`, lines.join("\n\n"), now); };
  await send(tos.organizer); for (const h of tos.hosts) await send(h); await send(p?.email);
  return { status: 200, body: { ok: true, cancelled: true, refund } };
}

/** "Your guests' personal data has been deleted": to the Organizer and the Host(s), at the automatic deletion, with the exact time (IST). Best effort; never blocks the deletion. */
export async function mailDataDeleted(env: PayEnv, e: { id: string; org: string | null; config?: string | null }, now: number): Promise<void> {
  try {
    let name = e.id; try { name = JSON.parse(e.config ?? "{}").name || e.id; } catch { /* the id */ }
    const text = [`Your guests' personal data has been deleted.`, `For the game "${name}" (${e.id}), every guest's name and mobile number was permanently deleted on ${istStamp(now)}, as promised.`, "Nothing more is needed from you. The winners record (ticket number, prize, time) stays for your records, as explained in your Terms."].join("\n\n");
    const tos = await teamEmails(env, e.org, e.id);
    const seen = new Set<string>();
    for (const to of [tos.organizer, ...tos.hosts]) { const t = (to ?? "").trim().toLowerCase(); if (!t || seen.has(t)) continue; seen.add(t); await sendMail(env, env.DB, t, `Your guests' personal data has been deleted: ${name}`, text, now); }
  } catch { /* the deletion already happened; a mail is a courtesy */ }
}
