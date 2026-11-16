// Review finding 7 of the join-redesign WIP: the phone parser in z.js (window.CTPhone.parse) silently made a WRONG number out of "+44 (0)7911 123456" and "(+44) 7911 123456",
// refused numbers pasted with direction marks / typographic dashes / non-ASCII digits as "digits only", and kept the leading 1 of a US number typed as 1 555 ....
// The real block is taken out of z.js and run as it is (no DOM is needed).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "../public/z.js"), "utf8");
const from = src.indexOf("const CT_ROWS"), to = src.indexOf("window.CTPhone = CTPhone;");
if (from < 0 || to < from) throw new Error("the CTPhone block moved in z.js: update this test");
const CTPhone = new Function("const window = {};\n" + src.slice(from, to) + "\nreturn CTPhone;")() as { parse: (iso: string, t: string) => any; show: (p: any) => string };
const e164 = (iso: string, t: string) => { const p = CTPhone.parse(iso, t); return p.ok ? p.e164 : "REFUSED: " + p.why; };

describe("CTPhone.parse: what people really paste", () => {
  test("the ordinary cases still read exactly as before", () => {
    expect(e164("IN", "98765 43210")).toBe("+919876543210");
    expect(e164("IN", "+91 98765 43210")).toBe("+919876543210");
    expect(e164("IN", "09876543210")).toBe("+919876543210");
    expect(e164("GB", "07911 123456")).toBe("+447911123456");
    expect(e164("IN", "+44 7911 123456")).toBe("+447911123456");
    expect(e164("IN", "0044 7911 123456")).toBe("+447911123456");
    expect(e164("SG", "9123 4567")).toBe("+6591234567");
    expect(CTPhone.parse("IN", "12345").ok).toBe(false);
    expect(CTPhone.parse("IN", "5123456789").ok).toBe(false);
  });
  test("'+44 (0)7911 123456' and '(+44) 7911 123456' are the same number as '+44 7911 123456'", () => {
    expect(e164("IN", "+44 (0)7911 123456")).toBe("+447911123456");
    expect(e164("IN", "+44 (0) 7911 123456")).toBe("+447911123456");
    expect(e164("IN", "(+44) 7911 123456")).toBe("+447911123456");
    expect(e164("IN", "(0044) 7911 123456")).toBe("+447911123456");
  });
  test("direction marks, typographic dashes, non-breaking spaces and full-width plus do not turn a good number away", () => {
    expect(e164("IN", "‎+91 98765‑43210‏")).toBe("+919876543210");
    expect(e164("IN", "+91–98765—43210")).toBe("+919876543210");
    expect(e164("IN", "＋44 7911 123456")).toBe("+447911123456");
  });
  test("digits typed in Arabic-Indic, Persian, Devanagari or full-width script are read as digits", () => {
    expect(e164("IN", "٩٨٧٦٥٤٣٢١٠")).toBe("+919876543210");
    expect(e164("IN", "۹۸۷۶۵۴۳۲۱۰")).toBe("+919876543210");
    expect(e164("IN", "९८७६५४३२१०")).toBe("+919876543210");
    expect(e164("IN", "９８７６５４３２１０")).toBe("+919876543210");
  });
  test("a US number typed as 1 555 123 4567 is the same as 555 123 4567; letters are still refused", () => {
    expect(e164("US", "1 555 123 4567")).toBe("+15551234567");
    expect(e164("US", "(555) 123-4567")).toBe("+15551234567");
    expect(e164("US", "+1 555 123 4567")).toBe("+15551234567");
    expect(CTPhone.parse("IN", "98765 4321O").ok).toBe(false);
    expect(CTPhone.parse("IN", "call me").ok).toBe(false);
  });
});
