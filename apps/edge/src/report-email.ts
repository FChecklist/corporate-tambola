// The branded customer e-mail (1.6.1): OUR logo and the customer's logo and colour at the top, simple summary tiles, the prizes table, the complete claim and event log, "More games from Corporate Tambola",
// and a footer with who we are and how long we keep things. Plain English, ticket numbers only (names and numbers are never put in an e-mail). A plain-text part is built from the same facts.
import { BRAND } from "./brand";
import { MORE_GAMES } from "../../../packages/beacon/src/more-games";
import { claimRuleText } from "../../../packages/beacon/src/config";
import type { GameLog } from "./gamelog";

const IST = 5.5 * 3_600_000, MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], p2 = (n: number) => String(n).padStart(2, "0");
const day = (ms: number) => { const d = new Date(ms + IST); return `${p2(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const hms = (ms: number | null | undefined) => { if (!ms) return "-"; const d = new Date(ms + IST); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`; };
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const NL = String.fromCharCode(10);
export const REPORT_CLAIM_ROWS = 200; // the e-mail shows this many claim rows; the PDF and the game log hold every one

export interface ReportMailIn { log: GameLog; gameName: string; brand?: { name?: string; color?: string; logo?: string } | null; origin: string; link: string; keptUntilMs: number; deleteAtMs: number; organizerEmail: string; rehearsal?: number | null; dataNotes?: string[] }
export const outcomeWords = (c: GameLog["claims"][number]) => c.outcome === "accepted" ? "accepted" : c.outcome === "wrong" ? "wrong (a Bogey)" : c.outcome === "too late" ? "too late, refused" : `Prize already taken: this claim came at number ${c.afterNumber}, after the prize was already awarded at number ${c.takenAtNumber}.`;

export function claimCounts(log: GameLog) {
  const k = { accepted: 0, wrong: 0, late: 0, taken: 0 };
  for (const c of log.claims) { if (c.outcome === "accepted") k.accepted++; else if (c.outcome === "wrong") k.wrong++; else if (c.outcome === "too late") k.late++; else k.taken++; }
  return k;
}
export function tilesOf(log: GameLog): [string, string][] {
  const k = claimCounts(log);
  return [
    ["Game started", log.firstNumberMs ? `${day(log.firstNumberMs)}, ${hms(log.firstNumberMs)}` : "Did not start"],
    ["Completed", log.endedAtMs ? hms(log.endedAtMs) : "Not ended"],
    ["Players", String(log.people.joined)],
    ["Numbers called", String(log.numbersCalled ?? 0)],
    ["Prizes awarded", String(log.prizes.length)],
    ["Claims", `${log.claims.length} (${k.accepted + k.taken} in time, ${k.wrong} wrong, ${k.late} too late)`],
  ];
}
export function eventsOf(log: GameLog): { atMs: number; what: string }[] {
  return [
    ...log.pauses.map((p) => ({ atMs: p.fromMs, what: `Paused by ${p.by}${p.toMs ? ", resumed at " + hms(p.toMs) : ""}` })),
    ...log.changes.map((c) => ({ atMs: c.atMs, what: `${c.who}: ${c.what}` })),
  ].sort((a, b) => a.atMs - b.atMs);
}

export function brandedReportMail(i: ReportMailIn): { subject: string; text: string; html: string } {
  const { log } = i, color = /^#[0-9A-F]{6}$/i.test(i.brand?.color ?? "") ? (i.brand!.color as string) : BRAND.wine, cname = i.brand?.name || i.gameName;
  const tiles = tilesOf(log), claims = log.claims.slice(0, REPORT_CLAIM_ROWS), events = eventsOf(log);
  const subject = `Your game report is ready: ${i.gameName} (${log.id}), ${day(log.firstNumberMs ?? log.startsAtMs)}`;
  const text = [
    `${BRAND.name} | ${cname}`, ``,
    `Your game report`, ``,
    ...tiles.map(([k, v]) => `${k}: ${v}`), ``,
    `Prizes`, ...(log.prizes.length ? log.prizes.map((p) => `- ${p.prize}${p.text ? " (" + p.text + ")" : ""}: Ticket ${p.ticket}, after number ${p.callNo}, awarded ${hms(p.atMs)}`) : ["- No prize was won."]), ``,
    `Every claim (${log.claims.length})`, ...(claims.length ? claims.map((c) => `- ${hms(c.atMs)}  Ticket ${c.ticket} claimed ${c.prize}${c.afterNumber ? " after number " + c.afterNumber : ""}: ${outcomeWords(c)}`) : ["- No claim."]),
    ...(log.claims.length > claims.length ? [`... and ${log.claims.length - claims.length} more in the full report`] : []), ``,
    `What happened during the game`, ...(events.length ? events.map((e) => `- ${hms(e.atMs)}  ${e.what}`) : ["- Nothing was paused or changed."]), ``,
    `Open your complete report (with every person, the invite tree and all statistics) here:`, i.link, ``,
    `The report PDF is built on your own computer or phone from this link, so names and mobile numbers never travel by e-mail: this e-mail has ticket numbers only. The link works until ${day(i.keptUntilMs)}. The people's names and mobile numbers are permanently deleted at ${day(i.deleteAtMs)}, as promised: please open the report and save the PDF before then.`, ``,
    ...(i.dataNotes ?? []), ``,
    claimRuleText(log.ties), ``,
    `More games from ${BRAND.name}`, ...MORE_GAMES.map((g) => `- ${g.name}: ${g.line} ${g.url}`), ``,
    `${BRAND.name} | ${BRAND.support} | We keep your game records for 365 days. Sent to ${i.organizerEmail}.`,
  ].join(NL);
  const cell = "padding:10px 12px;border:1px solid #D9E1F0;vertical-align:top";
  const th = `padding:8px 10px;background:${esc(color)};color:#fff;text-align:left;font-size:13px`;
  const logoOurs = `<img src="${esc(i.origin)}/logo-512.png" alt="${esc(BRAND.name)}" width="44" height="44" style="display:block;border:0;border-radius:8px">`;
  const logoTheirs = i.brand?.logo ? `<img src="${esc(i.origin)}/api/z/${esc(log.id)}/logo" alt="${esc(cname)}" height="44" style="display:block;border:0;max-height:44px;max-width:160px;background:#fff;border-radius:8px;padding:2px">` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F4F7FC;font-family:Arial,Helvetica,sans-serif;color:#1a2233">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border:1px solid #D9E1F0;border-radius:12px">
<tr><td style="background:${esc(color)};padding:14px 16px;border-radius:12px 12px 0 0"><table role="presentation" width="100%"><tr><td width="56">${logoOurs}</td><td style="color:#fff"><div style="font-size:18px;font-weight:bold">${esc(cname)}</div><div style="font-size:12px;opacity:.9">Game report, with ${esc(BRAND.name)}</div></td><td align="right">${logoTheirs}</td></tr></table></td></tr>
${i.rehearsal ? `<tr><td style="padding:10px 16px;background:#b3261e;color:#fff;font-weight:bold">REHEARSAL GAME ${i.rehearsal}: practice only. This game is for rehearsal only; the real game has a different link and a different game.</td></tr>` : ""}
<tr><td style="padding:16px"><h1 style="margin:0 0 12px;font-size:20px">Your game report is ready</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>${tiles.map(([k, v], n) => `<td style="${cell};background:#F4F7FC;border-radius:8px;width:33%"><div style="font-size:12px;color:#5b6577">${esc(k)}</div><div style="font-size:16px;font-weight:bold">${esc(v)}</div></td>${n === 2 ? "</tr><tr>" : ""}`).join("")}</tr></table>
<h2 style="font-size:16px;margin:18px 0 6px">Prizes</h2>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px"><tr><th style="${th}">Prize</th><th style="${th}">Ticket</th><th style="${th}">After number</th><th style="${th}">Awarded</th></tr>${log.prizes.length ? log.prizes.map((p) => `<tr><td style="${cell}">${esc(p.prize)}${p.text ? `<br><span style="color:#5b6577">${esc(p.text)}</span>` : ""}</td><td style="${cell}">${p.ticket}</td><td style="${cell}">${p.callNo}</td><td style="${cell}">${esc(hms(p.atMs))}</td></tr>`).join("") : `<tr><td style="${cell}" colspan="4">No prize was won.</td></tr>`}</table>
<h2 style="font-size:16px;margin:18px 0 6px">Every claim (${log.claims.length})</h2>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px"><tr><th style="${th}">Time</th><th style="${th}">Ticket</th><th style="${th}">Prize</th><th style="${th}">What came of it</th></tr>${claims.length ? claims.map((c) => `<tr><td style="${cell}">${esc(hms(c.atMs))}</td><td style="${cell}">${c.ticket}</td><td style="${cell}">${esc(c.prize)}${c.afterNumber ? ` after number ${c.afterNumber}` : ""}</td><td style="${cell}">${esc(outcomeWords(c))}</td></tr>`).join("") : `<tr><td style="${cell}" colspan="4">No claim.</td></tr>`}</table>${log.claims.length > claims.length ? `<p style="font-size:12px;color:#5b6577">... and ${log.claims.length - claims.length} more in the full report.</p>` : ""}
<p style="font-size:12px;color:#5b6577">${esc(claimRuleText(log.ties))}</p>
<h2 style="font-size:16px;margin:18px 0 6px">What happened during the game</h2>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">${events.length ? events.map((e) => `<tr><td style="${cell};width:90px">${esc(hms(e.atMs))}</td><td style="${cell}">${esc(e.what)}</td></tr>`).join("") : `<tr><td style="${cell}">Nothing was paused or changed.</td></tr>`}</table>
<p style="margin:18px 0"><a href="${esc(i.link)}" style="background:${esc(color)};color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Open your complete report</a></p>
<p style="font-size:12px;color:#5b6577">The report PDF is built on your own computer or phone from this link, so names and mobile numbers never travel by e-mail: this e-mail has ticket numbers only. The link works until ${esc(day(i.keptUntilMs))}. The people's names and mobile numbers are permanently deleted at ${esc(day(i.deleteAtMs))}: open the report and save the PDF before then.</p>
${(i.dataNotes ?? []).length ? `<h2 style="font-size:16px;margin:18px 0 6px">What happens to the data</h2>${(i.dataNotes ?? []).filter((x) => x.trim()).map((x) => `<p style="font-size:12px;color:#5b6577;margin:4px 0">${esc(x)}</p>`).join("")}` : ""}
<h2 style="font-size:16px;margin:18px 0 6px">More games from ${esc(BRAND.name)}</h2>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">${MORE_GAMES.map((g) => `<tr><td style="${cell}"><a href="${esc(g.url)}" style="color:${esc(color)};font-weight:bold">${esc(g.name)}</a><br><span style="color:#5b6577">${esc(g.line)}</span></td></tr>`).join("")}</table>
</td></tr>
<tr><td style="padding:12px 16px;background:#F4F7FC;border-radius:0 0 12px 12px;font-size:12px;color:#5b6577">${esc(BRAND.name)} | <a href="mailto:${esc(BRAND.support)}" style="color:#5b6577">${esc(BRAND.support)}</a> | We keep your game records for 365 days. Sent to ${esc(i.organizerEmail)}.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
