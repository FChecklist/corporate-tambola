// rc/tambola-1.8.5 matrix: the RULE written out a second time, character by character, from docs/TEST_HANDOFF.md. It shares no code with the product.
const isDigit = (c: string) => c >= "0" && c <= "9", isUp = (c: string) => c >= "A" && c <= "Z", isLow = (c: string) => c >= "a" && c <= "z";
const isSpace = (c: string) => /\s/.test(c);
export const oracleEmpNew = (raw: unknown): string | null => {
  const t = String(raw ?? ""); if (t.trim() === "") return "";
  const n = t.normalize("NFKC"); let out = ""; for (const ch of n) { if (isDigit(ch) || isUp(ch)) out += ch; else if (isLow(ch)) out += String.fromCharCode(ch.charCodeAt(0) - 32); }
  if (n.indexOf("@") >= 0) return null; if (out.length === 0 || out.length > 30) return null; return out;
};
export const oracleEmpOld = (raw: unknown): string | null => {
  let s = ""; for (const ch of String(raw ?? "")) if (!isSpace(ch)) s += ch; s = s.toUpperCase(); if (s === "") return "";
  if (s.length > 30) return null; const f = s[0]!; if (!(isDigit(f) || isUp(f))) return null;
  for (const ch of s) if (!(isDigit(ch) || isUp(ch) || ch === "." || ch === "_" || ch === "-" || ch === "/")) return null;
  return s;
};
export const oracleEmail = (raw: unknown): string => {
  let out = ""; for (const ch of String(raw ?? "").normalize("NFKC")) { if (isSpace(ch) || "​‌‍⁠﻿".includes(ch)) continue; out += ch.toLowerCase(); } return out;
};
/** An Email ID game: "" nothing typed, null not an address. */
export const oracleEmailId = (raw: unknown): string | null => {
  const k = oracleEmail(raw); if (k === "") return ""; const p = k.split("@"); if (p.length !== 2) return null; const [l, d] = p as [string, string];
  if (l.length < 1 || l.length > 64 || d.length < 1) return null; if (k.length > 254) return null;
  for (const ch of k) if (isSpace(ch)) return null;
  let ok = false; for (let i = 1; i < d.length && i <= 255; i++) if (d[i] === "." && d.length - i - 1 >= 2) { ok = true; break; } // some dot with at least 2 characters after it
  if (!ok || d.length > 255 + 1 + 64) return null; return k;
};
export const oracleId = (raw: unknown, kind: "emp" | "email", era: "new" | "old") => (kind === "email" ? oracleEmailId(raw) : era === "new" ? oracleEmpNew(raw) : oracleEmpOld(raw));
