// V2 item 2 (G18, O18): receipts and payment history, by key and by screen, for ONE game and across games. The e-mail receipts at payment time are already sent by pay.ts and are not touched.
// Payee on every row: IT SERVICES BY RAJAT AGARWAL via Razorpay. A Host (and an AI key) sees the history WITHOUT payment secrets: no payer e-mail, no gateway reference, no invoice link
// (an invoice link is a bearer link that opens the buyer's own details).
import { teamEmails } from "./credit";
import { sendMail, type PayEnv } from "./pay";
import { PAYEE, type V2Ctx } from "./v2-types";

const maskEmail = (e: string): string => { const [l = "", d = ""] = String(e).split("@"); return d ? `${l.slice(0, 1)}***@${d}` : ""; };
const rs = (n: number, cur: string) => (cur === "USD" ? "US$ " : "Rs ") + (Math.round(Number(n) * 100) / 100).toFixed(2);

type Row = { id: string; eid: string | null; pack: number; currency: string; amount: number; tax: number; status: string; created_ms: number; paid_ms: number | null; email: string; rzp: string | null; number: string | null; token: string | null; issued_ms: number | null };

async function rowsFor(c: V2Ctx, where: string, bind: unknown[]): Promise<{ pay: Row[]; notes: Record<string, { number: string; token: string }[]>; refunds: Record<string, { refund: number; status: string }> }> {
  const db = c.env.DB;
  const pay = ((await db.prepare(`SELECT p.id AS id, p.eid AS eid, p.pack AS pack, p.currency AS currency, p.amount AS amount, p.tax AS tax, p.status AS status, p.created_ms AS created_ms, p.paid_ms AS paid_ms, p.email AS email, p.rzp_payment_id AS rzp, i.number AS number, i.token AS token, i.issued_ms AS issued_ms FROM payment p LEFT JOIN invoice i ON i.payment_id=p.id WHERE ${where} ORDER BY p.created_ms DESC LIMIT 200`).bind(...bind).all<Row>()).results ?? []) as Row[];
  const notes: Record<string, { number: string; token: string }[]> = {}, refunds: Record<string, { refund: number; status: string }> = {};
  for (const r of pay) {
    try { notes[r.id] = ((await db.prepare("SELECT number, token FROM credit_note WHERE payment_id=? ORDER BY issued_ms").bind(r.id).all<any>()).results ?? []) as any; } catch { notes[r.id] = []; }
    try { const f = await db.prepare("SELECT refund, refund_status FROM refund WHERE payment_id=?").bind(r.id).first<any>(); if (f) refunds[r.id] = { refund: Number(f.refund), status: String(f.refund_status) }; } catch { /* no refund */ }
  }
  return { pay, notes, refunds };
}

function shape(c: V2Ctx, r: Row, notes: { number: string; token: string }[], refund: { refund: number; status: string } | undefined, full: boolean, gameName?: string) {
  const o = c.origin;
  const base: any = { payee: PAYEE, ...(full ? { paymentId: r.id } : {}), game: r.eid, ...(gameName ? { gameName } : {}), currency: r.currency, amount: r.amount, tax: r.tax, status: r.status === "paid" ? "paid" : r.status, createdMs: r.created_ms, paidMs: r.paid_ms, invoiceNumber: r.number, creditNotes: notes.map((n) => n.number), ...(refund ? { refund: { amount: refund.refund, status: refund.status } } : {}) };
  if (!full) return base; // a Host or an AI key: no secrets (and no payment id: anyone holding it can open the public receipt and invoice)
  return { ...base, payerEmailMasked: maskEmail(r.email), gatewayReference: r.rzp, invoiceUrl: r.token ? `${o}/api/invoice/${r.token}` : null, invoicePdfUrl: r.token ? `${o}/api/invoice/${r.token}.pdf` : null, creditNoteUrls: notes.map((n) => `${o}/api/invoice/${n.token}`) };
}

/** Who sees the full rows: the organizer's own key (the payer), a game master key, the platform. A Host, a Host key made without personal data and an AI key see them without secrets. */
const seesAll = (c: V2Ctx): boolean => c.a.plat || (c.a.kind === "master" && c.a.scopeKind !== "ga" && !c.req.headers.get("x-ai-model"));

/** The receipt rows of one game, shaped for the caller (full = with the payer's own links; otherwise without payment secrets). Used by the history screen and by the data export. */
export async function receiptRows(c: V2Ctx, eid: string, gameName: string, full: boolean): Promise<any[]> {
  const { pay, notes, refunds } = await rowsFor(c, "(p.eid=? OR p.id IN (SELECT payment_id FROM entitlement WHERE eid=?))", [eid, eid]);
  return pay.map((r) => shape(c, r, notes[r.id] ?? [], refunds[r.id], full, gameName));
}

export async function receiptsRoute(c: V2Ctx, eid: string, rest: string): Promise<Response> {
  const { a, req, env, now, json } = c;
  const e: any = await env.DB.prepare("SELECT id, org, config FROM engagement WHERE id=?").bind(eid).first();
  if (!e) return json({ error: "No such engagement." }, 404);
  if (!a.plat && !(a.org && a.org === e.org && (a.kind === "master" || a.kind === "host" || a.kind === "ai"))) return json({ error: "Receipts are for the organizer and the Hosts of this game.", code: "not-allowed" }, 403);
  let gameName = ""; try { gameName = String(JSON.parse(e.config ?? "{}").name ?? ""); } catch { /* the id is the name */ }
  const { pay, notes, refunds } = await rowsFor(c, "(p.eid=? OR p.id IN (SELECT payment_id FROM entitlement WHERE eid=?))", [eid, eid]);
  const full = seesAll(c);
  const rows = pay.map((r) => shape(c, r, notes[r.id] ?? [], refunds[r.id], full, gameName));
  if (req.method === "GET" && rest === "") return json({ game: eid, gameName, payee: PAYEE, secretsShown: full, receipts: rows, note: rows.length ? undefined : "No payment has been made for this game yet." });
  if (req.method === "POST" && rest === "send") { // the organizer asks for the receipt list by e-mail (the invoice itself was mailed when the payment was made)
    if (!full) return json({ error: "Only the organizer can have the receipts mailed.", code: "not-allowed" }, 403);
    if (!rows.length) return json({ error: "No payment has been made for this game yet, so there is nothing to send.", code: "no-payments" }, 404);
    if (!(await c.spend(2))) return c.busy();
    const to = (await teamEmails(env as PayEnv, e.org, eid)).organizer;
    if (!to) return json({ error: "We have no e-mail address for the organizer of this game.", code: "no-email" }, 409);
    const lines = rows.map((r: any) => `${r.invoiceNumber ?? "(invoice follows)"}  ${rs(r.amount, r.currency)}  ${r.status}${r.paidMs ? " on " + new Date(r.paidMs + 19_800_000).toISOString().slice(0, 10) : ""}${r.invoiceUrl ? "\n  " + r.invoiceUrl : ""}`);
    const sent = await sendMail(env as PayEnv, env.DB, to, `Receipts for your game ${gameName || eid}`, `Payment history for your game ${gameName ? gameName + " (" + eid + ")" : eid}.\n\nPaid to: ${PAYEE}\n\n${lines.join("\n")}\n`, now, { secret: true });
    return json({ ok: true, mailed: !!sent });
  }
  return json({ error: "Not found" }, 404);
}

/** GET /api/org/v2/receipts: payments across all of the organizer's games (full view: the organizer's own key only). */
export async function orgReceiptsRoute(c: V2Ctx): Promise<Response> {
  const { a, env, json } = c;
  if (a.scopeEid) return json({ error: "This key is for one game only; its receipts are at /api/z/{id}/v2/receipts.", code: "key-scope" }, 403);
  if (a.kind !== "master" || !a.org) return json({ error: "Receipts across games are for the organizer's own key.", code: "not-allowed" }, 403);
  const { pay, notes, refunds } = await rowsFor(c, "p.org=?", [a.org]);
  const names: Record<string, string> = {};
  for (const id of new Set(pay.map((r) => r.eid).filter(Boolean) as string[])) { try { const g = await env.DB.prepare("SELECT config FROM engagement WHERE id=?").bind(id).first<{ config: string | null }>(); names[id] = String(JSON.parse(g?.config ?? "{}").name ?? ""); } catch { names[id] = ""; } }
  const full = seesAll(c); // a call that says it is an AI gets the history without secrets
  return json({ payee: PAYEE, secretsShown: full, receipts: pay.map((r) => shape(c, r, notes[r.id] ?? [], refunds[r.id], full, r.eid ? names[r.eid] : undefined)) });
}
