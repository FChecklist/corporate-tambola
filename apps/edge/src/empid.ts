/* 1.8.5 UNIFORM EMPLOYEE ID (owner rule, 30 Oct 2026). ONE function cleans an employee ID everywhere: what a person types, what the organizer types, pastes or uploads.
   NFKC first (full-width letters and digits become plain ASCII), then everything that is not A-Z, a-z or 0-9 is removed (spaces, dashes, slashes, dots, underscores, symbols, accents,
   other alphabets, emoji, zero-width characters), then upper case. "1B-678", "1b-678", "1B/678", "1B 678" and "1b.678" all become 1B678.
   Games created before EMP_CLEAN_FROM_MS keep the old rule so the IDs already stored for them still match. */

/** The deploy instant (ms) from which NEW games use the uniform rule. The release session sets it to the exact deploy time right before deploy; a game created earlier keeps the old rule. */
export const EMP_CLEAN_FROM_MS = Date.UTC(2026, 9, 31, 0, 0, 0);
export const EMP_MAX = 30;

/** The one cleaning function: only A-Z and 0-9 are left, in upper case. Always a string (empty when nothing usable was typed). */
export const cleanEmpId = (raw: unknown): string => String(raw ?? "").normalize("NFKC").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** Does this game use the uniform rule? (created at or after the release instant) */
export const empCleanOn = (e: { created_ms?: number | null } | null | undefined): boolean => Number(e?.created_ms) >= EMP_CLEAN_FROM_MS;

/** The plain sentence shown when an ID cannot be used after cleaning. */
export const EMP_BAD_NEW = "An employee ID has letters and numbers only. The system ignores spaces, dashes and symbols, and the ID may be up to 30 characters once cleaned.";

/**
 * An employee ID as typed, by the rule of the game it is for. "" = nothing typed; null = not a usable ID.
 * New games: cleaned with cleanEmpId; refused when nothing is left after cleaning or more than 30 characters are left.
 * Older games: the original rule (spaces dropped, upper case, letters, digits and . _ - / allowed, 30 characters).
 */
/** An Email ID by ONE rule everywhere (1.8.5): NFKC (full-width "＠" becomes "@"), every space removed, lower case. Compare, store and hash only this form; upper and lower case are the same address. Never run cleanEmpId on an email. */
export const normEmail = (raw: unknown): string => String(raw ?? "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();

/** Does this text look like an email address? (an "@" after NFKC): an employee-ID box never turns one into letters and digits. */
export const looksLikeEmail = (raw: unknown): boolean => String(raw ?? "").normalize("NFKC").includes("@");
export const EMP_LOOKS_LIKE_EMAIL = "This looks like an email ID. This game asks for an employee ID: letters and numbers only.";
/** The refusal sentence for an ID that cannot be used, by the rule of the game it is for. */
export const empBadMessage = (raw: unknown, e: { created_ms?: number | null } | null | undefined, oldText: string): string => (!empCleanOn(e) ? oldText : looksLikeEmail(raw) ? EMP_LOOKS_LIKE_EMAIL : EMP_BAD_NEW);

export function normEmpFor(raw: unknown, e: { created_ms?: number | null } | null | undefined): string | null {
  if (!empCleanOn(e)) { const s = String(raw ?? "").replace(/\s+/g, "").toUpperCase(); if (!s) return ""; return /^[A-Z0-9][A-Z0-9._\-/]{0,29}$/.test(s) ? s : null; }
  if (String(raw ?? "").trim() === "") return "";
  if (looksLikeEmail(raw)) return null; // an email typed where an employee ID is asked is refused, never mangled into letters
  const c = cleanEmpId(raw);
  return c && c.length <= EMP_MAX ? c : null;
}
