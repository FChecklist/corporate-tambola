// The organizer's e-mail after every step of a game (owner order, 20 Nov 2026, step 18): game created, published, paid, STARTED, COMPLETED, report, deletion done.
// Published, paid and report already had their mails (worker.ts publish, pay.ts, lifecycle.ts report step, cancel.ts mailDataDeleted). This file adds the ones that were missing:
// created, started, completed, "the report could not be sent", and (from worker.ts) "deleted" after the organizer's own Delete.
// Rules for every mail here: to the organizer only (never a Host, never a player), ticket numbers only (no name, no ID, no number of a person), sent EXACTLY ONCE per game (a marker row claimed before sending),
// and never lost while the mail service is down: sendMail keeps the body of a failed mail and the daily job tries again (pay.ts retryOutbox).
import { sendMail, type PayEnv } from "./pay";
import { teamEmails } from "./credit";
import type { D1 } from "./worker";

const istStamp = (ms: number) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) + " IST";
const nameOf = (e: { id: string; config?: string | null }) => { try { return JSON.parse(e.config ?? "{}").name || e.id; } catch { return e.id; } };
export type StepKind = "created" | "started" | "completed" | "reportmissed";
export const stepKey = (eid: string, kind: StepKind) => `stepmail/${eid}/${kind}`;

/** Claims the right to send this step's mail (one row per game and step) and runs `send`. A second caller at the same time, or a later tick, finds the row and sends nothing. If `send` throws, the claim is given back so the next tick tries again. */
export async function stepOnce(db: D1, eid: string, kind: StepKind, now: number, send: () => Promise<unknown>): Promise<boolean> {
  const claim = await db.prepare("INSERT OR IGNORE INTO kv(k,v) VALUES(?,?)").bind(stepKey(eid, kind), String(now)).run();
  if ((claim.meta?.changes ?? 0) < 1) return false;
  try { await send(); return true; } catch (err) { try { await db.prepare("DELETE FROM kv WHERE k=?").bind(stepKey(eid, kind)).run(); } catch { /* the next tick finds the claim and stays quiet: a mail is a courtesy */ } throw err; }
}
/** The organizer's address for a game: the e-mail confirmed at Publish (the one the report goes to), else the account's own. */
export async function organizerAddress(env: PayEnv, e: { id: string; org: string | null }): Promise<string | null> {
  try {
    const c = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`contact/${e.id}`).first<{ v: string }>();
    const confirmed = c ? (JSON.parse(c.v).email as string | undefined) : undefined;
    if (confirmed) return confirmed;
  } catch { /* fall back to the account address */ }
  return (await teamEmails(env, e.org, e.id)).organizer;
}
const origin = (env: PayEnv) => (env.PUBLIC_ORIGIN ?? "").replace(/\/$/, "");

/** A new game was made (a draft: nobody can see or join it yet). */
export async function mailCreated(env: PayEnv, e: { id: string; org: string | null; config?: string | null; start_round: number }, startMs: number, now: number): Promise<void> {
  const to = await organizerAddress(env, e); if (!to) return;
  const name = nameOf(e);
  await stepOnce(env.DB, e.id, "created", now, () => sendMail(env, env.DB, to, `Your game ${name} (${e.id}) is created: nobody can join yet`,
    [`Your game "${name}" (${e.id}) is created as a draft. It is set to start on ${istStamp(startMs)}.`, `Nobody can see or join it until you publish it. Open it in your console to finish the set-up and publish: ${origin(env)}/zc.html?e=${e.id}`, "Nothing is charged by creating a game."].join("\n\n"), now, { idem: `step-${e.id}-created` }));
}
/** The game has started: by the clock, or because the organizer pressed Start. */
export async function mailStarted(env: PayEnv, e: { id: string; org: string | null; config?: string | null }, startedMs: number, manual: boolean, hostCalls: boolean, now: number): Promise<void> {
  const to = await organizerAddress(env, e); if (!to) return;
  const name = nameOf(e);
  await stepOnce(env.DB, e.id, "started", now, () => sendMail(env, env.DB, to, `Your game has started: ${name} (${e.id})`,
    [`Your game "${name}" (${e.id}) ${manual ? "was started with the Start button" : "started by itself"} at ${istStamp(startedMs)}.`,
      hostCalls ? "A Host presses Next for every number. Players see each number on their own phone." : "The game calls the numbers by itself. Players see each number on their own phone.",
      `You can watch it on the big screen: ${origin(env)}/big.html?e=${e.id}`, "We will write to you again when the game ends."].join("\n\n"), now, { idem: `step-${e.id}-started` }));
}
/** The game is over. `report`: a report e-mail with the people's list follows (somebody joined). */
export async function mailCompleted(env: PayEnv, e: { id: string; org: string | null; config?: string | null }, f: { endMs: number; numbers: number; prizes: number; players: number; deleteAtMs: number; endReason: string | null }, now: number): Promise<void> {
  const to = await organizerAddress(env, e); if (!to) return;
  const name = nameOf(e);
  await stepOnce(env.DB, e.id, "completed", now, () => sendMail(env, env.DB, to, `Your game has ended: ${name} (${e.id})`,
    [`Your game "${name}" (${e.id}) ended at ${istStamp(f.endMs)}.${f.endReason ? " " + f.endReason : ""}`,
      `Numbers called: ${f.numbers}. Prizes awarded: ${f.prizes}. Players: ${f.players}.`,
      f.players > 0 ? "Your report, with every prize, every winner's ticket and the list of people, follows in a separate e-mail within a few minutes. Please open it and save the PDF: it is the only copy of the list of people." : "Nobody joined this game, so there is no list of people to report.",
      `The players' names, mobile numbers and IDs are permanently deleted by ${istStamp(f.deleteAtMs)}, within 24 hours of the end. The winners record and your own details stay for 365 days.`].join("\n\n"), now, { idem: `step-${e.id}-completed` }));
}
/** The report could not be e-mailed before the people's data had to go (the mail service stayed down). Said once, in plain words, with what we still hold (no names, no IDs). */
export async function mailReportMissed(env: PayEnv, e: { id: string; org: string | null; config?: string | null }, deletedMs: number, summary: string[], now: number): Promise<void> {
  const to = await organizerAddress(env, e); if (!to) return;
  const name = nameOf(e);
  await stepOnce(env.DB, e.id, "reportmissed", now, () => sendMail(env, env.DB, to, `We could not send the report of your game ${name} (${e.id})`,
    [`We could not e-mail the report of your game "${name}" (${e.id}) before the players' data had to be deleted. Our mail service did not accept it, however many times we tried. We are sorry.`,
      `The players' names, mobile numbers and IDs were permanently deleted at ${istStamp(deletedMs)}, as promised, so the list of people can no longer be sent.`,
      "What we still hold, and send you here:", ...summary,
      "The winners record (ticket number, prize, time) and the game log stay for 365 days. Write to us if you need anything from them."].join("\n\n"), now, { idem: `step-${e.id}-reportmissed` }));
}
