// The life of an engagement's personal data. When a game ends (as seen from the public schedule, or sooner when enough phones say so):
//   1. the organizer's report is built from the sealed records and e-mailed as PDF(s), in small steps because a free Worker has ~10 ms of CPU per call;
//   2. 22 hours after the end (we promise 24) every participant's name, number, seat, invite record and ticket link is deleted, the report's working copies too;
//   3. only the organizer / host / co-host details and the winners record (seat, prize, round, time) remain, until 00:00 IST at the end of the 365th day, then everything goes.
// Called by the scheduled job (and, as a fallback, by any outside timer with the platform key). Every call does a bounded amount of work and can be repeated safely.
import { GRACE_ROUNDS, INVITE_CATEGORIES, validateCfg, keysInPlay, linesFor, type EngagementCfg, type PatternKey } from "../../../packages/beacon/src/config";
import { callRoundR, luckyRound } from "../../../packages/beacon/src/game";
import { cfgOf as controlCfg, readPublished, resolveControl, type KV } from "../../../packages/beacon/src/control";
import { seatOfPid } from "../../../packages/beacon/src/unique-ticket";
import { openPii, openText, sealText, type PiiEnv } from "./pii";
import { layoutReport, layoutPeoplePart, istDate, istFull, emptyAgg, type Agg, type ReportData, type ReportPerson, type ReportPrize, type ReportWinner } from "./report-layout";
import { sendReportMail, type PayEnv } from "./pay";
import type { D1, Env } from "./worker";

export const GENESIS = 1692803367;
export const roundMs = (r: number) => (GENESIS + (r - 1) * 3) * 1000;
export const PURGE_AFTER_MS = 22 * 3_600_000;      // personal data goes this long after the game ended (the promise is 24 hours)
export const REPORT_AFTER_MS = 3 * 60_000;         // the report starts a few minutes after the end, so late wins have been recorded
export const BACKUP_DAYS = 7;
const IST = 5.5 * 3_600_000, DAY = 86_400_000;
const CHUNK = 250;                                  // people opened per call while preparing a report (keeps a call within a free Worker's CPU)
const PART = 1500;                                  // people per PDF; a bigger game is e-mailed as several parts
const NAMES: Record<string, string> = { early5: "Early Five", top: "Top Line", mid: "Middle Line", bot: "Bottom Line", corners: "Four Corners", star: "Star", full: "Full House", full2: "Full Two-Ticket House" };
const ord = (n: number) => ["", "1st", "2nd", "3rd"][n] ?? `${n}th`;

type LifeEnv = Env & PiiEnv & PayEnv;
const d1kv = (env: Env): KV => ({
  get: async (k) => (await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(k).first<{ v: string }>())?.v ?? null,
  put: async (k, v) => { await env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(k, v).run(); },
});
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** 00:00 IST at the end of the 365th day after the game ended: when everything about the engagement is deleted. */
export const fullDeleteAt = (endMs: number): number => { const t = endMs + 365 * DAY; const istDay = Math.floor((t + IST) / DAY); return (istDay + 1) * DAY - IST; };
export const personalDeleteAt = (endMs: number) => endMs + PURGE_AFTER_MS;

export function cfgOfRow(e: { tickets?: number; config?: string | null }): EngagementCfg {
  try { const j = e.config ? JSON.parse(e.config) : {}; const v = validateCfg({ tickets: e.tickets ?? 1, rewards: j.rewards, breaks: j.breaks, rounds: j.rounds, invites: j.invites }); if (v.ok) return v.cfg; } catch { /* plain defaults */ }
  return (validateCfg({}) as { ok: true; cfg: EngagementCfg }).cfg;
}

/** The engagement's calls on the clock: the organizer's pauses and stop applied, the brand breaks and rounds included. */
async function schedule(env: Env, e: any) {
  const f = await readPublished(d1kv(env), e.id);
  const st = f ? resolveControl(controlCfg(f), f.messages) : null;
  return { cfg: cfgOfRow(e), st, start: e.start_round + GRACE_ROUNDS, stride: e.call_seconds / 3 };
}
async function callTimeMs(env: Env, e: any, round: number, idx: number, sch?: Awaited<ReturnType<typeof schedule>>): Promise<number | null> {
  const s = sch ?? (await schedule(env, e));
  const r = callRoundR(s.st, s.start, s.stride, s.cfg.breaks, round, idx);
  return r === null ? null : roundMs(r);
}
/** When the game will have ended if nobody ends it sooner: the last call of the last round, or the organizer's stop. */
export async function endBoundMs(env: Env, e: any): Promise<number> {
  const s = await schedule(env, e);
  const last = callRoundR(s.st, s.start, s.stride, s.cfg.breaks, s.cfg.rounds, 89);
  if (last !== null) return roundMs(last) + 60_000;
  return roundMs(s.st?.stopRound ?? s.start) + 60_000;
}

// ------------------------------------------------------------------------------------------------ winners record
const lineLabel = (cfg: EngagementCfg, key: PatternKey, ordinal: number) => (linesFor(cfg.rewards, key).length > 1 ? ord(ordinal) + " " : "") + (NAMES[key] ?? key);

/** Called when the organizer's console publishes results: the winners record gets one row per winning seat (never a name or a number). */
export async function recordWinners(env: Env, e: any, eid: string, results: { pattern: string; ordinal?: number; round?: number; idx: number; pids: string[] }[], now: number): Promise<void> {
  try {
    const sch = await schedule(env, e);
    for (const x of results) {
      const round = x.round ?? 1, ordinal = x.ordinal ?? 1;
      let at: number | null;
      if (x.pattern === "lucky") { const b = sch.cfg.breaks.filter((k) => k.kind === "lucky")[ordinal - 1]; const r = b ? luckyRound(sch.st, sch.start, sch.stride, sch.cfg.breaks, b) : null; at = r === null ? null : roundMs(r); }
      else at = await callTimeMs(env, e, round, x.idx, sch);
      const seats = x.pids.slice(0, 100).map(seatOfPid).filter((s): s is number => s !== null);
      for (const seat of seats) await env.DB.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES(?,?,?,?,?,?,?,'console') ON CONFLICT(eid,round,pattern,ordinal,seat) DO UPDATE SET idx=excluded.idx, at_ms=excluded.at_ms, src='console'").bind(eid, round, x.pattern, ordinal, seat, x.idx, at).run();
      // a later result for the same prize replaces an earlier one: seats that no longer win it are removed
      const keep = seats.length ? seats.map(() => "?").join(",") : "-1";
      await env.DB.prepare(`DELETE FROM winner WHERE eid=? AND round=? AND pattern=? AND ordinal=? AND src='console' AND seat NOT IN (${keep})`).bind(eid, round, x.pattern, ordinal, ...seats).run();
    }
  } catch { /* the winners record is best effort here: phones report their own wins too */ }
}

/** A phone reporting a win of its own (so a game without an open console still has a winners record). Console-checked results always win over these. */
export async function acceptWon(env: Env, e: any, eid: string, b: any, now: number, jsonFn: (o: unknown, s?: number) => Response, spend: (env: Env, now: number, n?: number) => Promise<boolean>): Promise<Response> {
  const seat = typeof b?.pid === "string" ? seatOfPid(b.pid) : null;
  if (!b || seat === null || !Array.isArray(b.wins) || b.wins.length < 1 || b.wins.length > 12) return jsonFn({ error: "Bad report." }, 400);
  const who = await env.DB.prepare("SELECT 1 AS x FROM participant WHERE eid=? AND pid=?").bind(eid, b.pid).first();
  if (!who) return jsonFn({ error: "Not a participant of this engagement." }, 403);
  const cfg = cfgOfRow(e), valid = new Set(keysInPlay(cfg.rewards));
  const sch = await schedule(env, e);
  if (!(await spend(env, now, b.wins.length))) return jsonFn({ error: "Busy day. Please try again after midnight UTC." }, 503);
  let stored = 0;
  for (const w of b.wins) {
    if (!valid.has(w?.pattern) || !Number.isInteger(w?.ordinal) || w.ordinal < 1 || w.ordinal > 5 || !Number.isInteger(w?.round) || w.round < 1 || w.round > cfg.rounds || !Number.isInteger(w?.idx) || w.idx < 0 || w.idx > 89) continue;
    if (await env.DB.prepare("SELECT 1 AS x FROM winner WHERE eid=? AND round=? AND pattern=? AND ordinal=? AND src='console' LIMIT 1").bind(eid, w.round, w.pattern, w.ordinal).first()) continue; // the console's checked result stands
    const at = await callTimeMs(env, e, w.round, w.idx, sch);
    const r = await env.DB.prepare("INSERT OR IGNORE INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES(?,?,?,?,?,?,?,'phone')").bind(eid, w.round, w.pattern, w.ordinal, seat, w.idx, at).run();
    stored += r.meta?.changes ?? 0;
  }
  return jsonFn({ ok: true, stored });
}

/** A phone saying "the game is over for me". Several different phones must say so, and not before the game could plausibly be over, so one person cannot trigger the report and the deletion. */
export async function acceptOver(env: Env, e: any, eid: string, b: any, now: number, jsonFn: (o: unknown, s?: number) => Response, spend: (env: Env, now: number, n?: number) => Promise<boolean>): Promise<Response> {
  const seat = typeof b?.pid === "string" ? seatOfPid(b.pid) : null;
  if (!b || seat === null) return jsonFn({ error: "Bad report." }, 400);
  const who = await env.DB.prepare("SELECT 1 AS x FROM participant WHERE eid=? AND pid=?").bind(eid, b.pid).first();
  if (!who) return jsonFn({ error: "Not a participant of this engagement." }, 403);
  const earliest = roundMs(e.start_round + GRACE_ROUNDS) + 20 * e.call_seconds * 1000; // no game ends before 20 numbers
  if (now < earliest) return jsonFn({ ok: true, counted: false });
  if (!(await spend(env, now, 1))) return jsonFn({ error: "Busy day. Please try again after midnight UTC." }, 503);
  await env.DB.prepare("INSERT OR IGNORE INTO overvote(eid,seat,at_ms) VALUES(?,?,?)").bind(eid, seat, now).run();
  const votes = (await env.DB.prepare("SELECT COUNT(*) AS c FROM overvote WHERE eid=?").bind(eid).first<{ c: number }>())?.c ?? 0;
  const people = (await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>())?.c ?? 1;
  if (votes >= Math.min(3, Math.max(1, Math.ceil(people / 2)))) {
    const bound = await endBoundMs(env, e);
    const end = Math.min(now, bound);
    await env.DB.prepare("INSERT INTO life(eid,end_ms,end_src) VALUES(?,?,'phones') ON CONFLICT(eid) DO UPDATE SET end_ms=excluded.end_ms, end_src='phones' WHERE life.end_src<>'phones' AND life.purged_ms IS NULL").bind(eid, end).run();
  }
  return jsonFn({ ok: true, counted: true });
}

// ------------------------------------------------------------------------------------------------ deletion
/** Deletes every participant's name, number, seat, invite record, ticket link and working copy of the report. The winners record, the organizer's details and the engagement itself stay. */
export async function erasePersonal(env: Env, eid: string, now: number, by: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM claim WHERE eid=?").bind(eid), env.DB.prepare("DELETE FROM settled WHERE eid=?").bind(eid),
    env.DB.prepare("DELETE FROM participant WHERE eid=?").bind(eid), env.DB.prepare("DELETE FROM seat WHERE eid=?").bind(eid), env.DB.prepare("DELETE FROM overvote WHERE eid=?").bind(eid),
    env.DB.prepare("DELETE FROM kv WHERE k=? OR k=? OR k LIKE ?").bind(`seats-base/${eid}`, `rpt/${eid}`, `rptc/${eid}/%`),
    env.DB.prepare("INSERT INTO life(eid,end_ms,end_src,purged_ms,report_state) VALUES(?,?, 'organizer', ?, ?) ON CONFLICT(eid) DO UPDATE SET purged_ms=?, report_state=COALESCE(life.report_state, ?)").bind(eid, now, now, by, now, by),
  ]);
}
/** Everything about an engagement, at the end of its 365 days (or for a draft nobody published). */
export async function eraseEverything(env: Env, id: string): Promise<void> {
  await erasePersonal(env, id, Date.now(), "retention");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM winner WHERE eid=?").bind(id), env.DB.prepare("DELETE FROM life WHERE eid=?").bind(id), env.DB.prepare("DELETE FROM ctl_request WHERE eid=?").bind(id),
    env.DB.prepare("DELETE FROM kv WHERE k=?").bind(`control/${id}.json`), env.DB.prepare("DELETE FROM kv WHERE k=?").bind(`contact/${id}`), env.DB.prepare("DELETE FROM kv WHERE k IN (?,?,?,?)").bind(`pub/${id}`, `lockmail/${id}`, `remind/${id}`, `ann/${id}`),
    env.DB.prepare("DELETE FROM engagement WHERE id=?").bind(id),
  ]);
}

// ------------------------------------------------------------------------------------------------ the report
interface RptState { agg: Agg; inv: Record<number, number>; stage: "prep" | "send" | "done"; next: number; total: number; chunks: number; sentParts: number; tl: { callNo: number; atMs: number; present: number; late: number }[]; started: number }

const attach = (name: string, bytes: Uint8Array) => ({ filename: name, content: bytes });

/** One bounded step of the report. Returns true when the whole report has been sent. */
async function reportStep(env: LifeEnv, e: any, life: { end_ms: number }, now: number): Promise<boolean> {
  const eid = e.id as string, stKey = `rpt/${eid}`;
  const contact = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`contact/${eid}`).first<{ v: string }>();
  const email = contact ? (JSON.parse(contact.v).email as string) : null;
  if (!email) { await env.DB.prepare("UPDATE life SET report_state='no-email' WHERE eid=?").bind(eid).run(); return true; }
  const sch = await schedule(env, e);
  let st: RptState = JSON.parse((await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(stKey).first<{ v: string }>())?.v ?? "null") ?? { stage: "prep", next: 0, total: (await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>())!.c, chunks: 0, sentParts: 0, started: now, tl: [], agg: emptyAgg(), inv: {} };
  const save = () => env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(stKey, JSON.stringify(st)).run();
  const ckey = (i: number) => `rptc/${eid}/${i}`;

  if (st.stage === "prep") {
    if (!st.tl.length) { // the call numbers at which we count people present
      const nums = [0, 10, 20, 30, 40, 50, 60, 70, 80, 89];
      for (const callNo of nums) st.tl.push({ callNo, atMs: (await callTimeMs(env, e, 1, callNo, sch)) ?? 0, present: 0, late: 0 });
    }
    if (st.next < st.total) {
      const rows = (await env.DB.prepare("SELECT p.pid AS pid, p.pii AS pii, p.joined_ms AS joined_ms, s.seq AS seq, COALESCE(s.jr,0) AS jr, s.role AS role, s.inv AS inv, s.dev AS dev, s.src AS src FROM participant p LEFT JOIN seat s ON s.eid=p.eid AND s.pid=p.pid WHERE p.eid=? ORDER BY COALESCE(s.seq, 1000000), p.pid LIMIT ? OFFSET ?").bind(eid, CHUNK, st.next).all<any>()).results ?? [];
      const people: ReportPerson[] = [];
      for (const r of rows) {
        const o = await openPii(env, r.pii);
        const joined = r.seq === null || r.dev !== null;
        people.push({ seat: r.seq ?? null, name: o?.name ?? null, phone: o?.phone ?? null, joinedMs: r.joined_ms ?? null, late: r.jr > 0, role: r.role ?? null, invitedBy: r.inv ?? null, onRoster: r.src === "roster" || r.src === "reuse", joined });
        if (joined) for (const t of st.tl) if ((r.joined_ms ?? 0) <= t.atMs) { t.present++; if (r.jr > 0) t.late++; }
        const g = st.agg; // totals for the summary, kept as we go so a big game's summary needs no second look at the people
        if (joined) { g.joined++; if (r.jr > 0) g.late++; else { g.joinedInTime++; if (r.joined_ms && (g.firstJoinMs === null || r.joined_ms < g.firstJoinMs)) g.firstJoinMs = r.joined_ms; } }
        if (r.src === "roster" || r.src === "reuse") { g.onRoster++; if (!joined) g.notJoined++; }
        if (r.inv) { g.viaInvite++; st.inv[r.inv] = (st.inv[r.inv] ?? 0) + 1; }
        if (r.role) g.roles++;
      }
      await env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(ckey(st.chunks), await sealText(env, JSON.stringify(people))).run();
      st.chunks++; st.next += rows.length;
      { const ks = Object.entries(st.inv); st.agg.inviters = ks.length; const top = ks.sort((x, y) => y[1] - x[1])[0]; st.agg.topInviter = top ? [Number(top[0]), top[1]] : null; }
      if (!rows.length) st.next = st.total; // the list shrank: nothing more to read
      await save();
      return false;
    }
    st.stage = "send"; await save();
  }

  if (st.stage === "send") {
    const people: ReportPerson[] = [];
    const parts = Math.max(1, Math.ceil(st.total / PART));
    const cfg = sch.cfg;
    const endMs = life.end_ms, first = roundMs(sch.start);
    const open = async (from: number, to: number) => { const out: ReportPerson[] = []; for (let i = from; i < to; i++) { const t = await openText(env, (await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(ckey(i)).first<{ v: string }>())?.v); if (t) out.push(...(JSON.parse(t) as ReportPerson[])); } return out; };
    const perChunk = PART / CHUNK;
    const total = parts + (parts > 1 ? 1 : 0); // the main report, plus one people part per 1,500 people when there are more than 1,500
    const nowSent = now;
    const base = await baseData(env, e, cfg, sch, st, email, nowSent, endMs, first);
    let bytes: Uint8Array, name: string;
    if (parts === 1) { people.push(...(await open(0, st.chunks))); await attachNames(env, base, people); bytes = layoutReport({ ...base, people }); name = `tambola-report-${eid}.pdf`; }
    else if (st.sentParts === 0) { bytes = layoutReport({ ...base, people: [], omitPeople: true, totalPeople: st.total }); name = `tambola-report-${eid}-part-1-of-${total}-summary.pdf`; }
    else { const k = st.sentParts - 1; const slice = await open(k * perChunk, Math.min(st.chunks, (k + 1) * perChunk)); bytes = layoutPeoplePart(base, slice, k + 1, parts); name = `tambola-report-${eid}-part-${st.sentParts + 1}-of-${total}-people.pdf`; }
    const ok = await sendReportMail(env, email, subjectFor(eid, st.sentParts, total), bodyFor(eid, base, st.sentParts, total), [attach(name, bytes)]);
    if (!ok) return false; // try again at the next call
    st.sentParts++;
    if (st.sentParts >= (parts === 1 ? 1 : total)) { st.stage = "done"; await save(); return true; }
    await save(); return false;
  }
  return st.stage === "done";
}

const subjectFor = (eid: string, i: number, n: number) => `Your Corporate Tambola engagement report ${eid}${n > 1 ? ` (part ${i + 1} of ${n})` : ""}: complete data attached`;
const bodyFor = (eid: string, d: ReportData, i: number, n: number) => [
  `Hello,`, ``,
  `Your engagement ${eid} has ended. Attached${n > 1 ? ` (part ${i + 1} of ${n})` : ""} is the complete report: when the game started, how many people took part at each stage, every prize and who won it (name and mobile number), the invite tree, all statistics, and the name and mobile number of every participant.`, ``,
  `This is everything we hold about the people in your engagement. We have given you all of it.`, ``,
  `What happens to the data:`,
  `- By ${istFull(d.personalDeleteAtMs)} (within 24 hours of the game ending) we permanently delete every participant's name, mobile number, seat, join record and invite record from our systems.`,
  `- For 365 days we keep only: the organizer, host and co-host details (the law requires us to hold these), and the winners record (which prize, which round, what time, which seat; no names or numbers).`,
  `- Everything about this engagement is permanently deleted at 00:00 hours IST on ${istDate(d.fullDeleteAtMs)} (the end of the 365th day).`,
  `- Backups of our database roll off within ${d.backupDays} days of any deletion.`, ``,
  `Please keep the attached PDF safe: it is the only copy of this personal data once ours is deleted. For your next game you can reuse the people list until it is deleted, or upload your list again from this report.`, ``,
  `You can ask us to delete everything sooner: press Erase in your console, ask your AI assistant to request it (you confirm in your console), or reply to this e-mail from your registered address.`, ``,
  `Sent on ${istFull(d.sentAtMs)} to ${d.organizerEmail}.`, `Corporate Tambola`,
].join("\n");

async function attachNames(_env: LifeEnv, _d: ReportData, _people: ReportPerson[]) { /* names are already inside the sealed chunks */ }

async function baseData(env: LifeEnv, e: any, cfg: EngagementCfg, sch: Awaited<ReturnType<typeof schedule>>, st: RptState, email: string, sentAt: number, endMs: number, first: number): Promise<ReportData> {
  const eid = e.id as string;
  const wrows = (await env.DB.prepare("SELECT round, pattern, ordinal, seat, idx, at_ms, src FROM winner WHERE eid=? ORDER BY round, pattern, ordinal, seat").bind(eid).all<any>()).results ?? [];
  const seatInfo = new Map<number, { name: string | null; phone: string | null; role: string | null }>();
  for (const sNo of new Set(wrows.map((w: any) => w.seat as number))) {
    const r = await env.DB.prepare("SELECT p.pii AS pii, s.role AS role FROM seat s JOIN participant p ON p.eid=s.eid AND p.pid=s.pid WHERE s.eid=? AND s.seq=?").bind(eid, sNo).first<{ pii: string | null; role: string | null }>();
    const o = await openPii(env, r?.pii); seatInfo.set(sNo, { name: o?.name ?? null, phone: o?.phone ?? null, role: r?.role ?? null });
  }
  const winnerOf = (w: any): ReportWinner => { const i = seatInfo.get(w.seat); return { seat: w.seat, name: i?.name ?? null, phone: i?.phone ?? null, role: i?.role ?? null, verified: w.src === "console", callNo: w.idx === null ? null : w.idx + 1, atMs: w.at_ms }; };
  const prizes: ReportPrize[] = [];
  for (let round = 1; round <= cfg.rounds; round++) for (const key of keysInPlay(cfg.rewards)) for (const line of linesFor(cfg.rewards, key)) prizes.push({ round, label: lineLabel(cfg, key, line.ordinal), text: line.text, winners: wrows.filter((w: any) => w.round === round && w.pattern === key && w.ordinal === line.ordinal).map(winnerOf) });
  const lucky = cfg.breaks.filter((b) => b.kind === "lucky").map((b, i) => ({ title: b.title, winners: wrows.filter((w: any) => w.pattern === "lucky" && w.ordinal === i + 1).map(winnerOf) }));
  const held = e.pack === 0;
  const early = !held && endMs < (await endBoundMs(env, e)) - 5 * 60_000;
  return {
    engagementId: eid, organizerEmail: email, sentAtMs: sentAt, scheduledMs: roundMs(e.start_round), firstNumberMs: first, endMs, wasHeld: held,
    endReason: held ? "The game did not start." : early ? "Every prize was awarded, so the game ended early." : "All numbers were called (or the organizer ended the game).",
    rounds: cfg.rounds, callSeconds: e.call_seconds, ticketsPerPerson: cfg.tickets, cap: e.cap, inviteOnly: !!e.closed, numbersCalled: early ? Math.max(1, ...wrows.map((w: any) => (w.idx ?? 0) + 1)) : 90,
    agg: st.agg, people: [], prizes, lucky, timeline: st.tl, breaks: cfg.breaks.map((b) => ({ after: b.after, kind: b.kind, title: b.title })),
    personalDeleteAtMs: personalDeleteAt(endMs), fullDeleteAtMs: fullDeleteAt(endMs), backupDays: BACKUP_DAYS,
  };
}

// ------------------------------------------------------------------------------------------------ the scheduled tick
/** Runs the lifecycle for engagements that still hold personal data. Bounded: at most 25 engagements, one report step each. */
export async function lifecycleTick(env: LifeEnv, now: number): Promise<{ checked: number; reportSteps: number; reportsDone: number; purged: number }> {
  const out = { checked: 0, reportSteps: 0, reportsDone: 0, purged: 0 };
  const rows = (await env.DB.prepare("SELECT e.* FROM engagement e LEFT JOIN life l ON l.eid=e.id WHERE l.purged_ms IS NULL AND EXISTS (SELECT 1 FROM participant p WHERE p.eid=e.id) ORDER BY e.start_round LIMIT 25").all<any>()).results ?? [];
  for (const e of rows) {
    out.checked++;
    try {
      let life = await env.DB.prepare("SELECT * FROM life WHERE eid=?").bind(e.id).first<any>();
      if (!life || life.end_src !== "phones") { // until phones confirm the end, the scheduled end (with the organizer's pauses) is the end, and is re-read each time
        const end = await endBoundMs(env, e);
        await env.DB.prepare("INSERT INTO life(eid,end_ms,end_src) VALUES(?,?,'schedule') ON CONFLICT(eid) DO UPDATE SET end_ms=excluded.end_ms WHERE life.end_src='schedule' AND life.purged_ms IS NULL").bind(e.id, end).run();
        life = await env.DB.prepare("SELECT * FROM life WHERE eid=?").bind(e.id).first<any>();
      }
      if (!life || now < life.end_ms + REPORT_AFTER_MS) continue; // still being played
      if (!life.report_ms && life.report_state !== "no-email") {
        out.reportSteps++;
        if (await reportStep(env, e, life, now)) { await env.DB.prepare("UPDATE life SET report_ms=?, report_state=COALESCE(report_state,'sent') WHERE eid=?").bind(now, e.id).run(); out.reportsDone++; }
        else await env.DB.prepare("UPDATE life SET tries=tries+1 WHERE eid=?").bind(e.id).run();
      }
      if (now >= personalDeleteAt(life.end_ms)) { await erasePersonal(env, e.id, now, "auto"); out.purged++; }
    } catch { /* this engagement is tried again at the next tick; the others still run */ }
  }
  return out;
}

export { INVITE_CATEGORIES };
