import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  BRANDS, DEFAULT_COMPANY, companyGaps, createOrder, financialYear, formatInvoiceNumber, renderInvoiceHtml, renderInvoiceText, splitGst, toMinor,
  verifyPaymentSignature, verifyWebhookSignature, type InvoiceData,
} from "../src";

describe("brands", () => {
  test("four brands, each with its own invoice series and name exactly as given", () => {
    expect(Object.values(BRANDS).map((b) => b.name)).toEqual(["CORPORATE TAMBOLA", "dpdp.VERIDIAN-AIOS.COM", "projexa-ai.com", "dewberry.in"]);
    expect(new Set(Object.values(BRANDS).map((b) => b.invoicePrefix)).size).toBe(4);
  });
  test("one legal entity on every invoice", () => { expect(DEFAULT_COMPANY.legalName).toBe("SHOBHA KAMAL SOLUTIONS PRIVATE LIMITED"); });
});

describe("GST", () => {
  test("same state: CGST + SGST 9% each; amounts add back to the total", () => {
    const t = splitGst(2000, "INR", "27", "27ABCDE1234F1Z5");
    expect(t.mode).toBe("intra");
    expect(t.cgst).toBe(t.sgst);
    expect(Math.abs(t.taxable + t.cgst + t.sgst - 2000)).toBeLessThan(0.011);
  });
  test("different state: IGST 18%", () => {
    const t = splitGst(1180, "INR", "27", "29ABCDE1234F1Z5");
    expect(t).toMatchObject({ mode: "inter", taxable: 1000, igst: 180, cgst: 0 });
  });
  test("supplier state unknown: never claims CGST/SGST", () => { expect(splitGst(1180, "INR", "", "27ABCDE1234F1Z5").mode).toBe("inter"); });
  test("US dollar sale (export of services): no GST charged", () => { expect(splitGst(399, "USD", "27", undefined)).toMatchObject({ mode: "export", igst: 0, total: 399 }); });
});

describe("invoice numbers", () => {
  test("Indian financial year runs April to March", () => {
    expect(financialYear(new Date("2026-10-01T00:00:00Z"))).toBe("2026-27");
    expect(financialYear(new Date("2027-03-31T23:00:00Z"))).toBe("2026-27");
    expect(financialYear(new Date("2027-04-01T00:00:00Z"))).toBe("2027-28");
    expect(financialYear(new Date("2026-01-15T00:00:00Z"))).toBe("2025-26");
  });
  test("numbers are brand-wise", () => {
    expect(formatInvoiceNumber(BRANDS.corporate_tambola, "2026-27", 1)).toBe("CT/2026-27/000001");
    expect(formatInvoiceNumber(BRANDS.projexa, "2026-27", 42)).toBe("PXA/2026-27/000042");
    expect(formatInvoiceNumber(BRANDS.dpdp, "2026-27", 7)).toBe("DPDP/2026-27/000007");
    expect(formatInvoiceNumber(BRANDS.dewberry, "2026-27", 7)).toBe("DEW/2026-27/000007");
  });
});

const invoice = (draft: boolean, company = DEFAULT_COMPANY): InvoiceData => ({
  number: "CT/2026-27/000001", issuedAt: Date.UTC(2026, 9, 1), brand: BRANDS.corporate_tambola, company, draft,
  buyer: { name: "Acme <script>alert(1)</script> Industries", gstin: "27ABCDE1234F1Z5", email: "hr@acme.com" }, currency: "INR",
  lines: [{ description: "Corporate Tambola, up to 250 participants", quantity: 1, amount: 847.46 }], tax: splitGst(1000, "INR", "27", "27ABCDE1234F1Z5"), paymentRef: "pay_123",
});

describe("invoice rendering", () => {
  test("brand is the title and the legal entity is named as the supplier", () => {
    const html = renderInvoiceHtml(invoice(false));
    expect(html).toContain("<h1>CORPORATE TAMBOLA</h1>");
    expect(html).toContain("A product of <b>SHOBHA KAMAL SOLUTIONS PRIVATE LIMITED</b>");
    expect(html).toContain("CT/2026-27/000001");
  });
  test("buyer text is escaped", () => { expect(renderInvoiceHtml(invoice(false))).not.toContain("<script>"); });
  test("an invoice with missing supplier details says DRAFT instead of pretending to be valid", () => {
    expect(companyGaps(DEFAULT_COMPANY)).toEqual(["GSTIN", "state code", "registered address", "SAC code"]);
    expect(renderInvoiceHtml(invoice(true))).toContain("DRAFT");
    expect(renderInvoiceText(invoice(true))).toContain("DRAFT - TAX INVOICE");
    expect(companyGaps({ ...DEFAULT_COMPANY, gstin: "x", stateCode: "27", addressLines: ["a"], sacCode: "998314" })).toEqual([]);
  });
  test("text invoice shows CGST/SGST for the same state", () => {
    const t = renderInvoiceText(invoice(false));
    expect(t).toContain("CGST 9%");
    expect(t).toContain("SGST 9%");
    expect(t).toContain("pay_123");
  });
});

describe("Razorpay signatures (the checkout and webhook rules from the public docs)", () => {
  const secret = "test_secret_value";
  test("payment signature = HMAC_SHA256(order_id|payment_id)", () => {
    const sig = createHmac("sha256", secret).update("order_ABC|pay_XYZ").digest("hex");
    expect(verifyPaymentSignature(secret, "order_ABC", "pay_XYZ", sig)).toBe(true);
    expect(verifyPaymentSignature(secret, "order_ABC", "pay_OTHER", sig)).toBe(false);
    expect(verifyPaymentSignature("wrong", "order_ABC", "pay_XYZ", sig)).toBe(false);
    expect(verifyPaymentSignature(secret, "order_ABC", "pay_XYZ", "")).toBe(false);
  });
  test("webhook signature = HMAC_SHA256(raw body)", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    const sig = createHmac("sha256", "whsec").update(body).digest("hex");
    expect(verifyWebhookSignature("whsec", body, sig)).toBe(true);
    expect(verifyWebhookSignature("whsec", body + " ", sig)).toBe(false);
  });
  test("amounts are sent in paise", () => { expect(toMinor(1000)).toBe(100000); expect(toMinor(847.46)).toBe(84746); });
});

describe("Orders API client (against a local stand-in for api.razorpay.com)", () => {
  test("sends Basic auth, paise, the brand in notes; surfaces Razorpay's own error text", async () => {
    let seen: any = null;
    const srv = Bun.serve({ port: 0, async fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/v1/orders") {
        seen = { auth: req.headers.get("authorization"), body: await req.json() };
        if (seen.body.amount === 1) return new Response(JSON.stringify({ error: { description: "Order amount less than minimum amount allowed" } }), { status: 400 });
        return new Response(JSON.stringify({ id: "order_TEST1", amount: seen.body.amount, currency: seen.body.currency, receipt: seen.body.receipt, status: "created" }));
      }
      return new Response("no", { status: 404 });
    } });
    try {
      const cfg = { keyId: "rzp_test_abc", keySecret: "sec", baseUrl: `http://localhost:${srv.port}/v1` };
      const o = await createOrder(cfg, { amountMinor: 100000, currency: "INR", receipt: "ord_1", notes: { brand: "CORPORATE TAMBOLA", product: "engagement" } });
      expect(o.id).toBe("order_TEST1");
      expect(seen.auth).toBe("Basic " + Buffer.from("rzp_test_abc:sec").toString("base64"));
      expect(seen.body).toMatchObject({ amount: 100000, currency: "INR", notes: { brand: "CORPORATE TAMBOLA" } });
      await expect(createOrder(cfg, { amountMinor: 1, currency: "INR", receipt: "r", notes: {} })).rejects.toThrow("minimum amount");
    } finally { srv.stop(true); }
  });
});
