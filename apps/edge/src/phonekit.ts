// Mobile numbers: how a typed number is cleaned (lists), kept (sealed with the person) and masked. No imports, so every part of the Worker can use it.
export type Cleaned = { ok: true; digits: string; last10: string } | { ok: false; why: string };
/**
 * Cleans one typed or pasted mobile number: spaces, dashes, brackets, +91, a leading 0 or 00 go away. A 10-digit Indian mobile must start with 6 to 9; a number with another
 * country code is accepted as it is (11 to 15 digits). The result always carries the country code (91 for India), which is what a wa.me link needs.
 */
export function cleanPhone(raw: unknown): Cleaned {
  const typed = String(raw ?? "").trim();
  if (/[^\d\s+\-()./]/.test(typed)) return { ok: false, why: "A number has only digits (and + - spaces or brackets). Please check it." }; // letters, symbols or emoji are a typing mistake, not a number
  let d = typed.replace(/\D/g, "");
  if (!d) return { ok: false, why: "There is no number." };
  const international = (typed.startsWith("+") || typed.startsWith("00")) && !d.replace(/^00/, "").startsWith("91"); // +65, +44 ...: kept as typed, never given an Indian 91
  if (international) { const n = d.replace(/^00/, ""); return n.length >= 8 && n.length <= 15 ? { ok: true, digits: n, last10: n.slice(-10) } : { ok: false, why: n.length < 8 ? "That is too short for a mobile number." : "That is too long for a mobile number." }; }
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  const indian = (ten: string): Cleaned => (/^[6-9]\d{9}$/.test(ten) ? { ok: true, digits: "91" + ten, last10: ten } : { ok: false, why: "An Indian mobile number starts with 6, 7, 8 or 9." });
  if (d.length === 10) return indian(d);
  if (d.length === 12 && d.startsWith("91")) return indian(d.slice(2));
  if (d.startsWith("91")) return { ok: false, why: "After +91 there must be 10 digits." };
  if (d.length >= 11 && d.length <= 15) return { ok: true, digits: d, last10: d.slice(-10) };
  return { ok: false, why: d.length < 10 ? "That is too short for a mobile number." : "That is too long for a mobile number." };
}
export const maskedPhone = (digits: string) => "******" + digits.slice(-4);
/**
 * A mobile number as it is KEPT (sealed with the person): an Indian one as 91 + 10 digits (the way lists always kept it), a number of any other country as +<country code><number>.
 * So a kept number never has to be guessed: "+65 91234567" is Singapore, "919876543210" is India. It is lenient on purpose (it reads what a phone sent at the door); the strict check is `cleanPhone`.
 */
export function keptPhone(raw: unknown): string {
  const s = String(raw ?? "").trim(), d = s.replace(/\D/g, "");
  if (!d) return "";
  if (/^\s*(\+|00)/.test(s)) { const n = d.replace(/^00/, ""); return n.startsWith("91") ? n : "+" + n; }
  if (d.length === 10) return "91" + d; // typed without a country code: the Indian number it has always been
  if (d.length === 11 && d[0] === "0") return "91" + d.slice(1);
  if (d.length === 12 && d.startsWith("91")) return d;
  return d.startsWith("91") ? d : "+" + d; // 11 to 15 digits without a plus: the country code is in them
}
/** The digits of a kept number, for a wa.me link or a last-digits mask. */
export const phoneDigits = (kept: string): string => String(kept ?? "").replace(/\D/g, "");
/** A cleaned list number (cleanPhone's digits) in the kept form. */
export const keptFromClean = (digits: string): string => (digits.length === 12 && digits.startsWith("91") ? digits : "+" + digits);
