/**
 * Shared billing for every product of SHOBHA KAMAL SOLUTIONS PRIVATE LIMITED.
 *   - one Razorpay account, one legal entity on every invoice
 *   - the BRAND is what the customer sees: checkout name, invoice title, invoice number series
 *   - GST invoices computed here, so every product issues them the same way
 * Pure functions + a thin Razorpay REST client (public API: https://razorpay.com/docs/api/). No secrets are stored here.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------- brands
export type BrandId = "corporate_tambola" | "dpdp" | "projexa" | "dewberry";
export interface Brand {
  id: BrandId;
  name: string; // shown on checkout and as the invoice title
  domain: string;
  invoicePrefix: string; // numbering series, per brand per financial year
  theme: string; // checkout colour
  line: string; // one-line description on the invoice
}
export const BRANDS: Record<BrandId, Brand> = {
  corporate_tambola: { id: "corporate_tambola", name: "CORPORATE TAMBOLA", domain: "corporate-tambola.example", invoicePrefix: "CT", theme: "#5A1426", line: "Live engagement software" },
  dpdp: { id: "dpdp", name: "dpdp.VERIDIAN-AIOS.COM", domain: "dpdp.veridian-aios.com", invoicePrefix: "DPDP", theme: "#0E7C6E", line: "Data protection compliance software" },
  projexa: { id: "projexa", name: "projexa-ai.com", domain: "projexa-ai.com", invoicePrefix: "PXA", theme: "#1C2B3A", line: "Project management software" },
  dewberry: { id: "dewberry", name: "dewberry.in", domain: "dewberry.in", invoicePrefix: "DEW", theme: "#5B3A8C", line: "Software solutions" },
};
export const brandOf = (id: string): Brand => BRANDS[id as BrandId] ?? BRANDS.corporate_tambola;

// ---------------------------------------------------------------- legal entity (filled from config/company.json, never guessed)
export interface Company {
  legalName: string; cin: string; pan: string; gstin: string; stateCode: string; stateName: string;
  addressLines: string[]; email: string; phone: string; sacCode: string; sacDescription: string;
  bank: { name: string; accountNumber: string; ifsc: string }; invoiceFooter: string;
}
export const DEFAULT_COMPANY: Company = {
  legalName: "SHOBHA KAMAL SOLUTIONS PRIVATE LIMITED", cin: "", pan: "", gstin: "", stateCode: "", stateName: "", addressLines: [], email: "", phone: "",
  sacCode: "", sacDescription: "Software solutions and products", bank: { name: "", accountNumber: "", ifsc: "" }, invoiceFooter: "This is a computer generated invoice.",
};
/** Which required details are still missing (a real tax invoice needs these). */
export function companyGaps(c: Company): string[] {
  const g: string[] = [];
  if (!c.gstin) g.push("GSTIN"); if (!c.stateCode) g.push("state code"); if (!c.addressLines.length) g.push("registered address"); if (!c.sacCode) g.push("SAC code");
  return g;
}

// ---------------------------------------------------------------- GST
export const GST_RATE = 0.18;
const r2 = (x: number) => Math.round(x * 100) / 100;
export interface TaxSplit { taxable: number; cgst: number; sgst: number; igst: number; total: number; mode: "intra" | "inter" | "export"; placeOfSupply: string }
/** Price is GST-inclusive for INR. Same state => CGST+SGST, different state => IGST. USD (export of services) => no GST here (CA to confirm LUT). */
export function splitGst(totalInclusive: number, currency: "INR" | "USD", supplierState: string, buyerGstin: string | undefined): TaxSplit {
  if (currency === "USD") return { taxable: totalInclusive, cgst: 0, sgst: 0, igst: 0, total: totalInclusive, mode: "export", placeOfSupply: "Outside India" };
  const taxable = r2(totalInclusive / (1 + GST_RATE));
  const tax = r2(totalInclusive - taxable);
  const buyerState = buyerGstin && /^\d{2}/.test(buyerGstin) ? buyerGstin.slice(0, 2) : "";
  const intra = !!supplierState && !!buyerState && supplierState === buyerState;
  if (intra) { const half = r2(tax / 2); return { taxable, cgst: half, sgst: r2(tax - half), igst: 0, total: totalInclusive, mode: "intra", placeOfSupply: buyerState }; }
  return { taxable, cgst: 0, sgst: 0, igst: tax, total: totalInclusive, mode: "inter", placeOfSupply: buyerState || "unknown" };
}

// ---------------------------------------------------------------- invoice numbers: brand-wise, per Indian financial year (Apr-Mar)
export function financialYear(d: Date): string {
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const start = m >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
export const formatInvoiceNumber = (brand: Brand, fy: string, seq: number) => `${brand.invoicePrefix}/${fy}/${String(seq).padStart(6, "0")}`;

// ---------------------------------------------------------------- invoice
export interface InvoiceData {
  number: string; issuedAt: number; brand: Brand; company: Company; draft: boolean;
  buyer: { name: string; gstin?: string; email?: string; country?: string };
  currency: "INR" | "USD"; lines: { description: string; quantity: number; amount: number }[]; tax: TaxSplit; paymentRef?: string; orderRef?: string;
}
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: number, cur: string) => (cur === "INR" ? "₹" : "US$") + n.toLocaleString(cur === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function renderInvoiceText(i: InvoiceData): string {
  const c = i.company, t = i.tax;
  const rows = i.lines.map((l) => `  ${l.description} x ${l.quantity}: ${money(l.amount, i.currency)}`).join("\n");
  return `${i.draft ? "DRAFT - " : ""}TAX INVOICE
${i.brand.name}
A product of ${c.legalName}
${c.addressLines.join(", ")}${c.gstin ? `\nGSTIN: ${c.gstin}` : ""}${c.cin ? `  CIN: ${c.cin}` : ""}${c.pan ? `  PAN: ${c.pan}` : ""}

Invoice number: ${i.number}
Date: ${new Date(i.issuedAt).toISOString().slice(0, 10)}
Billed to: ${i.buyer.name}${i.buyer.gstin ? `  GSTIN: ${i.buyer.gstin}` : ""}

${rows}
  Taxable value: ${money(t.taxable, i.currency)}
${t.mode === "intra" ? `  CGST 9%: ${money(t.cgst, i.currency)}\n  SGST 9%: ${money(t.sgst, i.currency)}` : t.mode === "inter" ? `  IGST 18%: ${money(t.igst, i.currency)}` : "  GST: not charged (export of services)"}
  TOTAL: ${money(t.total, i.currency)}
${i.paymentRef ? `Paid via Razorpay, payment ${i.paymentRef}` : ""}
${c.sacCode ? `SAC ${c.sacCode} - ${c.sacDescription}` : c.sacDescription}
${c.invoiceFooter}`;
}

export function renderInvoiceHtml(i: InvoiceData): string {
  const c = i.company, t = i.tax, b = i.brand;
  const taxRows = t.mode === "intra"
    ? `<tr><td>CGST 9%</td><td class="r">${money(t.cgst, i.currency)}</td></tr><tr><td>SGST 9%</td><td class="r">${money(t.sgst, i.currency)}</td></tr>`
    : t.mode === "inter" ? `<tr><td>IGST 18%</td><td class="r">${money(t.igst, i.currency)}</td></tr>` : `<tr><td>GST</td><td class="r">Not charged (export of services)</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(b.name)} invoice ${esc(i.number)}</title>
<style>body{font:15px/1.5 Inter,system-ui,sans-serif;color:#1c1a18;margin:0;background:#f4efe6}.sheet{max-width:780px;margin:24px auto;background:#fff;padding:36px;border-radius:12px;box-shadow:0 2px 14px #0002}
h1{font:700 26px/1.1 Georgia,serif;margin:0;color:${esc(b.theme)};letter-spacing:.02em}.sub{color:#6b6258;font-size:13px}.top{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;border-bottom:3px solid ${esc(b.theme)};padding-bottom:16px}
.draft{background:#fff3cd;border:1px solid #e0c36a;padding:8px 12px;border-radius:8px;margin:12px 0;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:18px}td,th{padding:9px 6px;border-bottom:1px solid #e7e0d4;text-align:left}th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b6258}.r{text-align:right}tfoot td{font-weight:700;border-bottom:0}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:18px}.foot{margin-top:22px;font-size:12px;color:#6b6258}@media print{body{background:#fff}.sheet{box-shadow:none;margin:0}}@media(max-width:560px){.meta{grid-template-columns:1fr}}</style></head><body><div class="sheet">
<div class="top"><div><h1>${esc(b.name)}</h1><div class="sub">${esc(b.line)}<br>A product of <b>${esc(c.legalName)}</b></div></div><div class="sub r" style="text-align:right"><b>TAX INVOICE</b><br>${esc(i.number)}<br>${new Date(i.issuedAt).toISOString().slice(0, 10)}</div></div>
${i.draft ? `<div class="draft">DRAFT: the supplier's registration details are not complete yet, so this is not yet a valid tax invoice.</div>` : ""}
<div class="meta"><div><b>Supplier</b><br>${esc(c.legalName)}<br>${c.addressLines.map(esc).join("<br>")}${c.gstin ? `<br>GSTIN: ${esc(c.gstin)}` : ""}${c.cin ? `<br>CIN: ${esc(c.cin)}` : ""}${c.pan ? `<br>PAN: ${esc(c.pan)}` : ""}</div>
<div><b>Billed to</b><br>${esc(i.buyer.name)}${i.buyer.gstin ? `<br>GSTIN: ${esc(i.buyer.gstin)}` : ""}${i.buyer.email ? `<br>${esc(i.buyer.email)}` : ""}<br>Place of supply: ${esc(t.placeOfSupply)}</div></div>
<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead><tbody>${i.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="r">${l.quantity}</td><td class="r">${money(l.amount, i.currency)}</td></tr>`).join("")}</tbody>
<tfoot><tr><td colspan="2">Taxable value</td><td class="r">${money(t.taxable, i.currency)}</td></tr>${taxRows.replace(/<tr><td>/g, '<tr><td colspan="2">').replace(/<td class="r">/g, '<td class="r">')}<tr><td colspan="2">TOTAL</td><td class="r">${money(t.total, i.currency)}</td></tr></tfoot></table>
<div class="foot">${i.paymentRef ? `Paid online via Razorpay. Payment reference: ${esc(i.paymentRef)}.<br>` : ""}${c.sacCode ? `SAC ${esc(c.sacCode)}: ` : ""}${esc(c.sacDescription)}.${c.bank.accountNumber ? `<br>Bank: ${esc(c.bank.name)}, A/c ${esc(c.bank.accountNumber)}, IFSC ${esc(c.bank.ifsc)}` : ""}<br>${esc(c.invoiceFooter)}</div></div></body></html>`;
}

// ---------------------------------------------------------------- Razorpay (public REST API)
export interface RazorpayConfig { keyId: string; keySecret: string; webhookSecret?: string; baseUrl?: string }
const basic = (c: RazorpayConfig) => "Basic " + Buffer.from(`${c.keyId}:${c.keySecret}`).toString("base64");
const base = (c: RazorpayConfig) => c.baseUrl ?? "https://api.razorpay.com/v1";

export interface CreatedOrder { id: string; amount: number; currency: string; receipt: string; status: string }
/** Amount is in the currency's smallest unit (paise). Notes carry the brand so every payment in the dashboard shows which product it was for. */
export async function createOrder(cfg: RazorpayConfig, o: { amountMinor: number; currency: "INR" | "USD"; receipt: string; notes: Record<string, string> }): Promise<CreatedOrder> {
  const r = await fetch(`${base(cfg)}/orders`, { method: "POST", headers: { authorization: basic(cfg), "content-type": "application/json" }, body: JSON.stringify({ amount: o.amountMinor, currency: o.currency, receipt: o.receipt.slice(0, 40), notes: o.notes }) });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.description ?? `Razorpay refused the order (${r.status})`);
  return data;
}
export async function fetchPayment(cfg: RazorpayConfig, paymentId: string): Promise<any> {
  const r = await fetch(`${base(cfg)}/payments/${encodeURIComponent(paymentId)}`, { headers: { authorization: basic(cfg) } });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.description ?? `Razorpay payment lookup failed (${r.status})`);
  return data;
}
/** If the account captures manually, the payment is only "authorized" until we capture exactly the order amount. */
export async function capturePayment(cfg: RazorpayConfig, paymentId: string, amountMinor: number, currency: string): Promise<any> {
  const r = await fetch(`${base(cfg)}/payments/${encodeURIComponent(paymentId)}/capture`, { method: "POST", headers: { authorization: basic(cfg), "content-type": "application/json" }, body: JSON.stringify({ amount: amountMinor, currency }) });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.description ?? `Razorpay capture failed (${r.status})`);
  return data;
}
const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
/** Checkout returns razorpay_payment_id and razorpay_signature = HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyPaymentSignature(secret: string, orderId: string, paymentId: string, signature: string): boolean {
  return safeEq(createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex"), String(signature ?? ""));
}
/** Webhook header X-Razorpay-Signature = HMAC_SHA256(raw body, webhook secret). */
export function verifyWebhookSignature(secret: string, rawBody: string, signature: string): boolean {
  return safeEq(createHmac("sha256", secret).update(rawBody).digest("hex"), String(signature ?? ""));
}
export const toMinor = (amount: number) => Math.round(amount * 100);
