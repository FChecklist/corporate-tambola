/* 1.8.0 approvals (additive): the rules of note 300 sections 28-31, kept as small pure functions so they can be tested to the last case.
   - a waiting request lapses after 30 minutes (nobody is refused harshly: the person is told to ask again);
   - a family host (a guest with "s:" list) can approve only up to 15 minutes before the game begins;
   - an open game also keeps an Email ID, checked for shape, and the same mobile or the same email gets the same ticket. */

export const WAIT_LIMIT_MS = 30 * 60_000;
export const FAMILY_CUTOFF_MS = 15 * 60_000;
const GENESIS = 1692803367;
export const roundStartMs = (round: number) => (GENESIS + (round - 1) * 3) * 1000;

export const waitingLapsed = (atMs: number, now: number) => now - atMs >= WAIT_LIMIT_MS;
/** The earliest time a waiting request (made at atMs) may still be decided. */
export const waitingValidUntil = (atMs: number) => atMs + WAIT_LIMIT_MS;
/** Family approval is closed from 15 minutes before the start. */
export const familyCutoffPassed = (startMs: number, now: number) => now >= startMs - FAMILY_CUTOFF_MS;
/** Who may decide a request: by the list it sits on. Organizer and Hosts: all. A Co-host: the requests from their own link. A family host (guest): their own family only. */
export const mayDecide = (who: { all: boolean; id: string }, chain: string) => who.all || String(chain).includes(`,${who.id},`);

export const LAPSED_MESSAGE = "Your request waited 30 minutes and nobody answered. Please open the game link and ask again, or talk to whoever shared it with you.";
export const FAMILY_CLOSED_MESSAGE = "Family approvals closed 15 minutes before the game began. Please ask your family host or the organizer.";
export const DECLINED_MESSAGE = "Thank you for asking. This game could not add you this time. Please talk to whoever shared the link with you.";

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
/** An email ID in its plain form, or null when it is not one. */
export const cleanEmail = (raw: unknown): string | null => { const s = String(raw ?? "").trim().toLowerCase(); return s.length <= 120 && EMAIL.test(s) ? s : null; };

/** 1.8.0 audit: the 30-minute lapse, the family cutoff and the Email ID apply only to games CREATED from this date on. Every game made before the release behaves exactly as in 1.7.1. */
export const APPROVAL_RULES_FROM_MS = Date.UTC(2026, 9, 31, 0, 0, 0);
export const approvalRulesOn = (e: { created_ms?: number | null } | null | undefined): boolean => Number(e?.created_ms) >= APPROVAL_RULES_FROM_MS;
/** The same sentence whether the email is held by someone else or not usable: nobody can find out who holds an email. */
export const EMAIL_UNUSABLE_MESSAGE = "The system could not use this email ID for this game. Please check it, or open your ticket from the phone you first used.";
/** The earliest request time that can still be answered: 30 minutes back for a game under the new rules, 0 (no limit) for an older game. */
export const waitSince = (e: { created_ms?: number | null }, now: number): number => (approvalRulesOn(e) ? now - WAIT_LIMIT_MS : 0);

/** The Email ID of an open game. OFF in 1.8.0: while this is false the server ignores an email completely (nothing is sealed, no key is claimed, no refusal is sent), because the page does not yet show a consent notice for it. Turned on in 1.8.1 together with the notice. */
export const EMAIL_ENABLED = false;
