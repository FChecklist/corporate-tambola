// The engagement report the organizer receives by e-mail: one PDF with everything we hold about the game and its people, and a plain statement of what
// is deleted and when. This file only lays data out; it knows nothing about the database (see lifecycle.ts for where the data comes from).
import { GOLD, NAVY, PdfDoc, WHITE, type Column } from "./pdf";

export interface ReportPerson { seat: number | null; name: string | null; phone: string | null; joinedMs: number | null; late: boolean; role: string | null; invitedBy: number | null; onRoster: boolean; joined: boolean }
export interface ReportWinner { seat: number | null; name: string | null; phone: string | null; role: string | null; verified: boolean; callNo: number | null; atMs: number | null }
export interface ReportPrize { round: number; label: string; text: string; winners: ReportWinner[] }
export interface ReportData {
  engagementId: string; organizerEmail: string; sentAtMs: number;
  scheduledMs: number; firstNumberMs: number; endMs: number; endReason: string; wasHeld: boolean;
  rounds: number; callSeconds: number; ticketsPerPerson: number; cap: number; inviteOnly: boolean; numbersCalled: number;
  people: ReportPerson[];
  prizes: ReportPrize[];
  lucky: { title: string; winners: ReportWinner[] }[];
  /** Participants present at chosen call numbers of round 1. */
  timeline: { callNo: number; atMs: number; present: number; late: number }[];
  breaks: { after: number; kind: string; title: string }[];
  personalDeleteAtMs: number; fullDeleteAtMs: number; backupDays: number;
}

const IST = 5.5 * 3_600_000;
const p2 = (n: number) => String(n).padStart(2, "0");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Sat 03 Oct 2026, 21:14:05 IST" */
export const istFull = (ms: number) => { const d = new Date(ms + IST); return `${DOW[d.getUTCDay()]} ${p2(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} IST`; };
/** "Mon 04 Oct 2027" */
export const istDate = (ms: number) => { const d = new Date(ms + IST); return `${DOW[d.getUTCDay()]} ${p2(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const utcFull = (ms: number) => { const d = new Date(ms); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} UTC`; };
const hm = (ms: number) => { const d = new Date(ms + IST); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`; };
const dur = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 3600)} h ${p2(Math.floor((s % 3600) / 60))} min`; };
const mob = (p: string | null) => (p ? p.replace(/^(\d{5})(\d{5})$/, "$1 $2") : "-");
const who = (w: { name: string | null; phone: string | null }) => `${w.name || "(no name)"}, ${mob(w.phone)}`;

export function layoutReport(d: ReportData): Uint8Array {
  const pdf = new PdfDoc();
  pdf.footer = `Corporate Tambola  |  Engagement ${d.engagementId}  |  sent ${istFull(d.sentAtMs)}`;

  // ---- title band
  pdf.rect(0, pdf.H, pdf.W, 92, NAVY); pdf.rect(0, pdf.H - 92, pdf.W, 3, GOLD);
  pdf.y = pdf.H - 28;
  pdf.para("Corporate Tambola", { font: "F2", size: 11, color: GOLD, gap: 2 });
  pdf.para("Complete engagement report", { font: "F2", size: 22, color: WHITE, gap: 2 });
  pdf.para(`Engagement ${d.engagementId}   |   ${d.people.length} people   |   ${d.prizes.reduce((n, p) => n + p.winners.length, 0)} prize wins`, { size: 9.5, color: WHITE });
  pdf.y = pdf.H - 92 - 16;

  pdf.box("Sent to you", [
    `E-mail address: ${d.organizerEmail}`,
    `Sent on: ${istFull(d.sentAtMs)}  (${utcFull(d.sentAtMs)})`,
    "This PDF is the complete record of your engagement, including the names and mobile numbers of everyone who took part. Please keep it safe: it is the only copy of this personal data that exists once we delete ours.",
  ], [0.93, 0.96, 1], NAVY);

  pdf.box("What we keep, and what we delete", [
    `We have given you ALL the data we hold about the people in this engagement. Within 24 hours of the game ending, and no later than ${istFull(d.personalDeleteAtMs)}, we permanently delete from our systems every participant's name, mobile number, join record, ticket assignment and invite link record. After that nobody at Corporate Tambola, and nothing in our software or database, holds them.`,
    "We keep, for 365 days, only: (1) the details of the organizer, host and co-hosts (name, e-mail, mobile number), because the law requires us to hold these; and (2) the winners record: which prize, which round, at what time, and the ticket seat number. The winners record does not contain names or mobile numbers.",
    `Everything about this engagement, including those two records, is permanently deleted at 00:00 hours (IST) on ${istDate(d.fullDeleteAtMs)}, which is the end of the 365th day.`,
    `Backups of our database roll off within ${d.backupDays} days, so any copy of deleted data in a backup is gone within ${d.backupDays} days of the deletion.`,
    "For your next game you can reuse the people list until it is deleted (the reuse button in your console), or upload your own list again afterwards from this report.",
  ]);

  // ---- 1 summary
  pdf.h1("1. The game");
  pdf.table([{ head: "Item", width: 32 }, { head: "Detail", width: 78 }], [
    ["Scheduled time you gave", istFull(d.scheduledMs)],
    ["First number called", d.wasHeld ? "The game did not start (see note below)" : istFull(d.firstNumberMs) + "  (2 minutes after the scheduled time)"],
    ["Game ended", `${istFull(d.endMs)}`],
    ["How it ended", d.endReason],
    ["Playing time", d.wasHeld ? "-" : dur(d.endMs - d.firstNumberMs)],
    ["Rounds", String(d.rounds)],
    ["Numbers called in the last round", String(d.numbersCalled)],
    ["Call speed", `one number every ${d.callSeconds} seconds`],
    ["Tickets per person", String(d.ticketsPerPerson)],
    ["Participant limit", `${d.cap}${d.inviteOnly ? "  (invitation only)" : ""}`],
  ]);
  if (d.wasHeld) pdf.para("Note: this game was not started (for example it was not paid for by its start time), so no numbers were called.", { size: 9 });
  if (d.breaks.length) { pdf.h2("Brand breaks"); pdf.table([{ head: "After number", width: 13, align: "r" }, { head: "Kind", width: 10 }, { head: "Title", width: 60 }], d.breaks.map((b) => [String(b.after), b.kind, b.title])); }

  // ---- 2 participants over time
  pdf.h1("2. How many people were in the game");
  pdf.para("Counted at chosen numbers of round 1. 'Late' are people who joined after the first number was called: they see only the numbers called from 90 seconds after they joined, and prizes already awarded are gone for them.", { size: 9, gap: 4 });
  pdf.table([{ head: "At number", width: 10, align: "r" }, { head: "Time (IST)", width: 12 }, { head: "People", width: 8, align: "r" }, { head: "Of them late", width: 12, align: "r" }], d.timeline.map((t) => [String(t.callNo), hm(t.atMs), String(t.present), String(t.late)]), { zebra: true });

  // ---- 3 prizes and winners
  pdf.h1("3. Prizes and winners");
  const total = d.prizes.length, won = d.prizes.filter((p) => p.winners.length).length;
  pdf.para(`${total} prize lines were set up; ${won} were won (${total - won} not won).`, { size: 9.5, gap: 4 });
  for (const pr of d.prizes) {
    pdf.h2(`${d.rounds > 1 ? `Round ${pr.round}  |  ` : ""}${pr.label}${pr.text ? `   -   ${pr.text}` : ""}`);
    if (!pr.winners.length) { pdf.para("Not won.", { size: 9, color: [0.4, 0.43, 0.48] }); continue; }
    pdf.table([{ head: "Seat", width: 5, align: "r" }, { head: "Name", width: 24 }, { head: "Mobile", width: 12 }, { head: "At call", width: 7, align: "r" }, { head: "Time", width: 9 }, { head: "Role", width: 12 }, { head: "Checked", width: 10 }],
      pr.winners.map((w) => [w.seat === null ? "-" : String(w.seat), w.name || "(no name)", mob(w.phone), w.callNo === null ? "-" : String(w.callNo), w.atMs ? hm(w.atMs) : "-", w.role || "participant", w.verified ? "by console" : "by phone"]));
  }
  for (const l of d.lucky) {
    pdf.h2(`Lucky draw  -  ${l.title}`);
    pdf.table([{ head: "Seat", width: 5, align: "r" }, { head: "Name", width: 24 }, { head: "Mobile", width: 12 }], l.winners.map((w) => [w.seat === null ? "-" : String(w.seat), w.name || "(no name)", mob(w.phone)]));
  }
  pdf.para("'Checked: by console' means your console recomputed the result from the public numbers; 'by phone' means the winner's own phone reported it. Both come from the same public numbers; the second has not been double-checked by your console.", { size: 8.5 });

  // ---- 4 statistics
  pdf.h1("4. Statistics");
  const joined = d.people.filter((p) => p.joined), onRoster = d.people.filter((p) => p.onRoster);
  const late = joined.filter((p) => p.late), inv = new Map<number, number>();
  for (const p of d.people) if (p.invitedBy) inv.set(p.invitedBy, (inv.get(p.invitedBy) ?? 0) + 1);
  const top = [...inv.entries()].sort((a, b) => b[1] - a[1])[0];
  const roles = d.people.filter((p) => p.role);
  pdf.table([{ head: "Measure", width: 52 }, { head: "Value", width: 48 }], [
    ["People who took part (joined)", String(joined.length)],
    ["On your invitation list", String(onRoster.length)],
    ["Invited but never joined", String(d.people.filter((p) => p.onRoster && !p.joined).length)],
    ["Joined after the first number (late)", String(late.length)],
    ["Joined through someone's invite link", String(d.people.filter((p) => p.invitedBy).length)],
    ["People who invited at least one person", String(inv.size)],
    ["Most invites by one person", top ? `${top[1]} (seat ${top[0]})` : "0"],
    ["Organizer / host / co-host with a ticket", String(roles.length)],
    ["Prize lines won / not won", `${won} / ${total - won}`],
    ["Total prize wins (a tie shares a prize)", String(d.prizes.reduce((n, p) => n + p.winners.length, 0))],
    ["Prize wins by organizer / host / co-host", String(d.prizes.reduce((n, p) => n + p.winners.filter((w) => w.role).length, 0))],
    ["Average join rate before the start", joined.length ? `${(joined.filter((p) => !p.late).length / Math.max(1, (d.firstNumberMs - Math.min(...joined.map((p) => p.joinedMs ?? d.firstNumberMs))) / 60000)).toFixed(1)} people per minute` : "-"],
  ]);

  // ---- 5 the invite tree
  pdf.h1("5. Who invited whom");
  pdf.para("Each person's share link records who sent it. 'Direct' means they came through the organizer's own link or list.", { size: 9, gap: 4 });
  const bySeat = new Map<number, ReportPerson>(); for (const p of d.people) if (p.seat !== null) bySeat.set(p.seat, p);
  const kids = new Map<number | null, ReportPerson[]>();
  for (const p of d.people) { const k = p.invitedBy && bySeat.has(p.invitedBy) ? p.invitedBy : null; (kids.get(k) ?? kids.set(k, []).get(k)!).push(p); }
  const lines: string[] = []; const seen = new Set<number>();
  const walk = (k: number | null, depth: number) => { for (const c of kids.get(k) ?? []) { if (lines.length >= 4000) return; if (c.seat !== null) { if (seen.has(c.seat)) continue; seen.add(c.seat); } lines.push(`${"    ".repeat(Math.min(depth, 12))}${depth ? "+- " : ""}${c.name || "(no name)"}  seat ${c.seat ?? "-"}  ${mob(c.phone)}${c.role ? "  [" + c.role + "]" : ""}`); if (c.seat !== null) walk(c.seat, depth + 1); } };
  walk(null, 0);
  if (!lines.length) pdf.para("Nobody shared an invite link in this game.", { size: 9 });
  else { for (const l of lines) pdf.pre(l); if (lines.length >= 4000) pdf.para("(The list is cut at 4,000 lines.)", { size: 8.5 }); }

  // ---- 6 everybody
  pdf.h1("6. Everyone, with name and mobile number");
  pdf.para(`${d.people.length} people. 'Joined' is the time they opened the link (IST). Names in scripts other than Latin letters print as ? in this PDF.`, { size: 9, gap: 4 });
  const cols: Column[] = [{ head: "Seat", width: 5, align: "r" }, { head: "Name", width: 24 }, { head: "Mobile", width: 12 }, { head: "Joined", width: 8 }, { head: "Late", width: 4 }, { head: "Role", width: 9 }, { head: "By", width: 5, align: "r" }, { head: "List", width: 4 }];
  pdf.table(cols, [...d.people].sort((a, b) => (a.seat ?? 1e9) - (b.seat ?? 1e9)).map((p) => [p.seat === null ? "-" : String(p.seat), p.name || "(no name)", mob(p.phone), p.joinedMs ? hm(p.joinedMs) : "-", p.late ? "yes" : "", p.role || "", p.invitedBy ? String(p.invitedBy) : "", p.onRoster ? "yes" : ""]), { zebra: true });

  pdf.h1("7. When your data is deleted");
  pdf.table([{ head: "Data", width: 62 }, { head: "Deleted by", width: 48 }], [
    ["Participants' names and mobile numbers, seats, invite links", istFull(d.personalDeleteAtMs)],
    ["Backups holding any of the above", `within ${d.backupDays} days after that`],
    ["Organizer / host / co-host details and the winners record", `00:00 hours IST, ${istDate(d.fullDeleteAtMs)}`],
  ]);
  pdf.para("You can ask us to delete everything sooner: press 'Erase' in your console, ask your AI assistant to request it (you confirm in your console), or e-mail us from your registered address.", { size: 9 });
  return pdf.build();
}
