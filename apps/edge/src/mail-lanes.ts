// Mail lanes, warm-up, send counter, quota alert and the do-not-mail list (release 1.11.0, 20 Nov 2026).
//
// WHY: the live Resend account answered `429 monthly_quota_exceeded`; the domain is young (registered 15 Oct 2026) and has no sending history, so a burst of mail of any kind can
// hurt the mail that matters (invoice, payment, sign-in code). Two lanes keep them apart:
//   tx   (transactional) invoice, payment, receipt, game-start, sign-in code, AI/Host link, data request ... Never refused or delayed by anything in the bulk lane. This is the default.
//   bulk (marketing, invitations, reminders)  Has its OWN counter, its OWN daily ramp (warm-up) and may only use the part of every limit that the transactional lane does not keep for itself.
//        A bulk mail that is not allowed yet is WAITED for in `mail_bulk_queue` (24 hours, then dropped), never put in front of an invoice, never sent through Cloudflare Email
//        (its 200-a-day account allowance is the invoices' second route), and never retried by the transactional retry loop.
//
// The lane rules are the PURE function `bulkDecision` (no database): the numbers go in, "allowed" or a reason comes out. The functions that read and write the database are around it.
// This file imports only types, so pay.ts, admin.ts and worker.ts can all use it without a cycle.
import type { D1 } from "./worker";

export type MailLane = "tx" | "bulk";
export interface LaneEnv { MAIL_MONTHLY_QUOTA?: string; MAIL_DAILY_LIMIT?: string; MAIL_WARMUP_START?: string }

export const MAIL_LANES_SCHEMA: string[] = [
  // one counter per day, lane and provider: how many mails the provider ACCEPTED (not tries, not refusals). Kept 100 days.
  `CREATE TABLE IF NOT EXISTS mail_count (day TEXT NOT NULL, lane TEXT NOT NULL, provider TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, lane, provider))`,
  // one row per mail the provider took (ref = the provider's mail id) and the latest thing it told us about it. Hash of the address + subject, kept 3 days like the send log.
  `CREATE TABLE IF NOT EXISTS mail_track (ref TEXT PRIMARY KEY, at_ms INTEGER NOT NULL, to_hash TEXT NOT NULL, subject TEXT, lane TEXT NOT NULL, state TEXT NOT NULL, rank INTEGER NOT NULL, state_ms INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS mail_track_at ON mail_track (at_ms)`,
  // the do-not-mail list: a hard bounce or a complaint. One-way hash plus a masked form (j***@example.com). Kept 365 days.
  `CREATE TABLE IF NOT EXISTS mail_suppress (to_hash TEXT PRIMARY KEY, to_mask TEXT, reason TEXT NOT NULL, at_ms INTEGER NOT NULL, ref TEXT)`,
  // bulk mail that was not allowed yet (warm-up cap, shared limit) or that the provider did not take. Address and body: kept at most 24 hours.
  `CREATE TABLE IF NOT EXISTS mail_bulk_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, at_ms INTEGER NOT NULL, to_addr TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, html TEXT)`,
];

// ------------------------------------------------------------------------------------------------ the numbers
/** Resend's free plan: 3,000 mails a month and 100 a day. The owner sets MAIL_MONTHLY_QUOTA / MAIL_DAILY_LIMIT after upgrading the plan (0 for no daily limit). */
export const DEFAULT_MONTHLY_QUOTA = 3000;
export const DEFAULT_DAILY_LIMIT = 100;
/** Half of every limit (the day and the month) is kept for transactional mail: bulk mail can never take it. */
export const TX_RESERVE_SHARE = 0.5;
/** The warm-up of a young sending domain: the most BULK mails a day, by day since the first mail. Day 1 = transactional mail only. After the last day: BULK_AFTER_WARMUP. */
export const WARMUP_BULK_CAPS = [0, 20, 30, 40, 50, 75, 100, 125, 150, 175, 200, 250, 300, 400];
export const BULK_AFTER_WARMUP = 500;
/** A waiting bulk mail is dropped after this long (a reminder that is a day late is no reminder). */
export const BULK_QUEUE_KEEP_MS = 24 * 3_600_000;
export const MAIL_COUNT_KEEP_DAYS = 100;
export const MAIL_TRACK_KEEP_MS = 3 * 86_400_000;
export const SUPPRESS_KEEP_MS = 365 * 86_400_000;
/** The alert levels, in percent of the provider's monthly quota. */
export const ALERT_WARN_PCT = 80, ALERT_CRITICAL_PCT = 100;
/** The rank of what the provider told us: a later, lower rank never overwrites an earlier, higher one (webhook calls arrive in any order). */
export const STATE_RANK: Record<string, number> = { sent: 0, delayed: 1, delivered: 2, failed: 3, bounced: 4, complained: 5 };

const posInt = (v: unknown): number | null => { const n = Number(String(v ?? "").trim()); return String(v ?? "").trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null; };
export const monthlyQuotaOf = (env: LaneEnv): number => { const n = posInt(env.MAIL_MONTHLY_QUOTA); return n && n > 0 ? n : DEFAULT_MONTHLY_QUOTA; };
/** 0 = the plan has no daily limit. */
export const dailyLimitOf = (env: LaneEnv): number => { const n = posInt(env.MAIL_DAILY_LIMIT); return n === null ? DEFAULT_DAILY_LIMIT : n; };
export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const dayMs = (d: string): number => Date.parse(d + "T00:00:00Z");

// ------------------------------------------------------------------------------------------------ the rule (pure)
export interface Usage { txToday: number; bulkToday: number; txMonth: number; bulkMonth: number }
export interface Allowed { allow: boolean; why: string }
/** Today's cap of bulk mail by warm-up day (1 = the first day). */
export const bulkCapForDay = (warmDay: number): number => (warmDay >= 1 && warmDay <= WARMUP_BULK_CAPS.length ? WARMUP_BULK_CAPS[warmDay - 1]! : warmDay < 1 ? 0 : BULK_AFTER_WARMUP);
/**
 * May ONE more bulk mail go out now? Transactional mail never asks this question.
 * (1) warm-up day 1: no bulk at all; later days: the day's ramp cap.
 * (2) the day: bulk may never take the part of the daily limit that transactional mail keeps (half the limit, minus what transactional mail already used).
 * (3) the month: the same for the monthly quota.
 */
export function bulkDecision(u: Usage, warmDay: number, daily: number, monthly: number): Allowed {
  const cap = bulkCapForDay(warmDay);
  if (cap === 0) return { allow: false, why: "warmup day 1: transactional mail only" };
  if (u.bulkToday >= cap) return { allow: false, why: `warmup cap ${cap} a day reached` };
  const shared = (limit: number, tx: number, bulk: number) => limit > 0 && tx + bulk + 1 > limit - Math.max(0, Math.ceil(limit * TX_RESERVE_SHARE) - tx);
  if (shared(daily, u.txToday, u.bulkToday)) return { allow: false, why: "daily limit: the rest is kept for transactional mail" };
  if (shared(monthly, u.txMonth, u.bulkMonth)) return { allow: false, why: "monthly quota: the rest is kept for transactional mail" };
  return { allow: true, why: "" };
}

// ------------------------------------------------------------------------------------------------ the counter
export async function countSend(db: D1, now: number, lane: MailLane, provider: "resend" | "cloudflare"): Promise<void> {
  try { await db.prepare("INSERT INTO mail_count(day,lane,provider,n) VALUES(?,?,?,1) ON CONFLICT(day,lane,provider) DO UPDATE SET n=n+1").bind(dayOf(now), lane, provider).run(); } catch { /* a counter must never stop a mail */ }
}
export interface UsageFull extends Usage { cfToday: number; cfMonth: number }
export async function readUsage(db: D1, now: number): Promise<UsageFull> {
  const u: UsageFull = { txToday: 0, bulkToday: 0, txMonth: 0, bulkMonth: 0, cfToday: 0, cfMonth: 0 };
  const today = dayOf(now), month = today.slice(0, 7);
  let rows: { day: string; lane: string; provider: string; n: number }[] = [];
  try { rows = (await db.prepare("SELECT day, lane, provider, n FROM mail_count WHERE day>=?").bind(month + "-01").all<any>()).results ?? []; } catch { return u; }
  for (const r of rows) {
    if (!r.day.startsWith(month)) continue;
    const n = Number(r.n) || 0;
    if (r.provider === "cloudflare") { u.cfMonth += n; if (r.day === today) u.cfToday += n; continue; }
    if (r.lane === "bulk") { u.bulkMonth += n; if (r.day === today) u.bulkToday += n; } else { u.txMonth += n; if (r.day === today) u.txToday += n; }
  }
  return u;
}

// ------------------------------------------------------------------------------------------------ the warm-up clock
/** The first day of the warm-up: MAIL_WARMUP_START (a date the owner sets) or the day the first mail was handled by this code (kept in kv). */
export async function warmupStart(db: D1, env: LaneEnv, now: number, create = false): Promise<string | null> {
  const set = String(env.MAIL_WARMUP_START ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(set) && Number.isFinite(dayMs(set)) && dayMs(set) <= dayMs(dayOf(now))) return set;
  try {
    const r = await db.prepare("SELECT v FROM kv WHERE k='mail/warmup_start'").first<{ v: string }>();
    if (r?.v) return r.v;
    if (create) { await db.prepare("INSERT OR IGNORE INTO kv(k,v) VALUES('mail/warmup_start',?)").bind(dayOf(now)).run(); return dayOf(now); }
  } catch { /* unknown: day 1 */ }
  return null;
}
/** 1 on the first day, 2 on the second ... */
export async function warmupDay(db: D1, env: LaneEnv, now: number, create = false): Promise<number> {
  const s = await warmupStart(db, env, now, create);
  return s ? Math.max(1, Math.floor((dayMs(dayOf(now)) - dayMs(s)) / 86_400_000) + 1) : 1;
}

/** May one more bulk mail go out now? Reads the counters, the warm-up clock and the provider pause (the provider said "quota used up"). */
export async function bulkAllowed(db: D1, env: LaneEnv, now: number, create = true): Promise<Allowed> {
  const warmDay = await warmupDay(db, env, now, create);
  let paused = false;
  try { paused = Number((await db.prepare("SELECT v FROM kv WHERE k='mail_resend_pause_until'").first<{ v: string }>())?.v ?? 0) > now; } catch { /* not paused */ }
  if (paused) return { allow: false, why: "the provider said its quota is used up" };
  return bulkDecision(await readUsage(db, now), warmDay, dailyLimitOf(env), monthlyQuotaOf(env));
}

// ------------------------------------------------------------------------------------------------ the quota alert
/** The level the month is at: ok below 80 %, warn from 80 %, critical from 100 %. */
export const levelOf = (pct: number): "ok" | "warn" | "critical" => (pct >= ALERT_CRITICAL_PCT ? "critical" : pct >= ALERT_WARN_PCT ? "warn" : "ok");
/**
 * Called after every mail the provider took. The first time a month reaches 80 % (and 100 %) of the monthly quota: ONE log line `[mail-alert] ...` (numbers only, no address, no secret)
 * and one kv row `mailalert/<level>/<month>` that the status address (`GET /api/status/mail`) shows as `alert`.
 */
export async function checkQuotaAlert(db: D1, env: LaneEnv, now: number): Promise<void> {
  try {
    const u = await readUsage(db, now), quota = monthlyQuotaOf(env), sent = u.txMonth + u.bulkMonth, pct = Math.floor((sent * 100) / quota), month = dayOf(now).slice(0, 7);
    for (const [lvl, at] of [["critical", ALERT_CRITICAL_PCT], ["warn", ALERT_WARN_PCT]] as const) {
      if (pct < at) continue;
      const claim = await db.prepare("INSERT OR IGNORE INTO kv(k,v) VALUES(?,?)").bind(`mailalert/${lvl}/${month}`, JSON.stringify({ at: new Date(now).toISOString(), sent, quota, pct })).run();
      if ((claim.meta?.changes ?? 0) > 0) console.warn(`[mail-alert] ${lvl.toUpperCase()}: ${sent} of ${quota} mails of the month sent (${pct} %, transactional ${u.txMonth}, bulk ${u.bulkMonth}). BOSS: upgrade the mail plan or add the Cloudflare route (docs/MAIL-DELIVERABILITY-OWNER-STEPS.md).`);
    }
  } catch { /* an alert must never stop a mail */ }
}

// ------------------------------------------------------------------------------------------------ the provider says "quota used up" (21 Nov 2026: Resend 429 monthly_quota_exceeded)
/** How long a provider's "quota used up" answer counts as current when nothing else is sent (the status address and the organizer note use it). */
export const QUOTA_SEEN_MS = 2 * 3_600_000;
/**
 * Called when Resend answers 429 with a quota name. Our own counter only knows the mails sent since this code ran, so it can be far below Resend's real number for the month: the provider's own word is the
 * truth. It (1) remembers when it was said (kv `mail_quota_seen`, shown by the status address) and (2) writes the CRITICAL alert line once for the month, even when our counter is under 80 %.
 */
export async function noteProviderQuota(db: D1, now: number): Promise<void> {
  try {
    await db.prepare("INSERT INTO kv(k,v) VALUES('mail_quota_seen',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(now)).run();
    const month = dayOf(now).slice(0, 7), claim = await db.prepare("INSERT OR IGNORE INTO kv(k,v) VALUES(?,?)").bind(`mailalert/critical/${month}`, JSON.stringify({ at: new Date(now).toISOString(), by: "provider" })).run();
    if ((claim.meta?.changes ?? 0) > 0) console.warn(`[mail-alert] CRITICAL: the mail provider answered that its monthly quota is used up (our own counter may show less: it counts only since this code ran). Transactional mail goes by the Cloudflare route when it is set; bulk mail waits.`);
  } catch { /* an alert must never stop a mail */ }
}
/** The words an organizer sees on the payment-done screens when the main mail service cannot take mail. Plain, true, no provider name, no numbers. */
export const ORGANIZER_NOTE_BACKUP = "Our main e-mail service has reached its monthly limit, so your e-mails now go by our backup route. They can arrive a few minutes later than usual and may land in Spam, so please look there too. Your payment is not affected.";
export const ORGANIZER_NOTE_LATE = "Our e-mail service has reached its monthly limit and our backup route is not switched on, so your invoice e-mail can arrive late. We keep trying every few minutes. Please keep the organizer key shown on this screen: an e-mail that has to wait does not carry the key. You can always sign in later with an e-mailed code. Your payment is not affected.";

// ------------------------------------------------------------------------------------------------ what the provider tells us, per mail
export async function recordSent(db: D1, now: number, ref: string, toHash: string, subject: string, lane: MailLane): Promise<void> {
  if (!ref) return;
  try {
    await db.prepare("INSERT INTO mail_track(ref,at_ms,to_hash,subject,lane,state,rank,state_ms) VALUES(?,?,?,?,?,'sent',0,?) ON CONFLICT(ref) DO UPDATE SET lane=excluded.lane, at_ms=excluded.at_ms, subject=COALESCE(mail_track.subject,excluded.subject) WHERE mail_track.lane='unknown'")
      .bind(ref.slice(0, 100), now, toHash, String(subject).slice(0, 120), lane, now).run();
  } catch { /* the log is best effort */ }
}
/** Sets the state of one mail if it is "later" than the state we know (delayed < delivered < failed < bounced < complained). Returns true when the state changed. A repeat changes nothing. */
export async function recordState(db: D1, now: number, ref: string, toHash: string, subject: string | null, state: string): Promise<boolean> {
  const rank = STATE_RANK[state]; if (!ref || rank === undefined) return false;
  const r = await db.prepare("INSERT INTO mail_track(ref,at_ms,to_hash,subject,lane,state,rank,state_ms) VALUES(?,?,?,?,'unknown',?,?,?) ON CONFLICT(ref) DO UPDATE SET state=excluded.state, rank=excluded.rank, state_ms=excluded.state_ms WHERE mail_track.rank<excluded.rank")
    .bind(ref.slice(0, 100), now, toHash, subject, state, rank, now).run();
  return (r.meta?.changes ?? 0) > 0;
}

// ------------------------------------------------------------------------------------------------ the do-not-mail list
/** The do-not-mail list key: the EXACT address (lower case, no spaces), the +tag part kept. A bounce of `john+typo@co.com` must never stop mail to `john@co.com`. */
export const suppressKey = async (to: string): Promise<string> => {
  const n = String(to ?? "").normalize("NFKC").trim().toLowerCase();
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("suppress|" + n))), (b) => b.toString(16).padStart(2, "0")).join("");
};
/** The send-log / provider-tracking hash (plus part removed, so the log is one row per person). NOT the do-not-mail key: see `suppressKey`. */
export const hashMail = async (to: string): Promise<string> => {
  const v = String(to ?? "").normalize("NFKC").trim().toLowerCase(), i = v.lastIndexOf("@"), n = i < 1 ? v : v.slice(0, i).split("+")[0] + v.slice(i); // the same address form the send log uses (plus part removed)
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(n))), (b) => b.toString(16).padStart(2, "0")).join("");
};
/** The do-not-mail list is read by the BULK lane only (reminders, invitations): invoices, sign-in codes, organizer-key mail, reports and owner notes are never held back by it. A lookup that fails means "not on the list". */
export async function isSuppressed(db: D1, to: string): Promise<boolean> {
  try { return !!(await db.prepare("SELECT 1 AS x FROM mail_suppress WHERE to_hash=?").bind(await suppressKey(to)).first()); } catch { return false; }
}
/** Puts an address on the list (hash, not the address). Idempotent; the first reason stays. */
export async function suppress(db: D1, now: number, toHash: string, mask: string, reason: string, ref: string | null): Promise<boolean> {
  const r = await db.prepare("INSERT OR IGNORE INTO mail_suppress(to_hash,to_mask,reason,at_ms,ref) VALUES(?,?,?,?,?)").bind(toHash, mask, reason, now, ref).run();
  return (r.meta?.changes ?? 0) > 0;
}
/** A bounce that means "this address does not exist": the provider calls it Permanent. A full mailbox or a busy server (Transient) and the unknown (Undetermined) are not. */
export const isHardBounce = (type: unknown): boolean => typeof type === "string" && type.trim().toLowerCase() === "permanent";

// ------------------------------------------------------------------------------------------------ mail anybody can trigger without signing in
/** The hour key `YYYY-MM-DDTHH`. */
export const hourOf = (ms: number): string => new Date(ms).toISOString().slice(0, 13);
export const DEFAULT_ANON_MAIL_PER_HOUR = 60;
/**
 * A cap on ALL mail that an anonymous visitor can trigger for any address (the Refer & earn code), counted over the whole site for the hour. The per-address and per-network caps stay; this one stops many addresses
 * from many networks from using up the month's quota that the invoices need (audit 2, M4). Counts the call and answers whether it may send. A database hiccup answers "yes": the cap must never block by accident.
 * Env `ANON_MAIL_PER_HOUR` (0 = no cap). Not a CAPTCHA: a bot check on these endpoints needs the owner's Turnstile keys (docs/MAIL-DELIVERABILITY-OWNER-STEPS.md).
 */
export async function anonMailAllowed(db: D1, env: { ANON_MAIL_PER_HOUR?: string }, now: number): Promise<boolean> {
  const cap = posInt(env.ANON_MAIL_PER_HOUR) ?? DEFAULT_ANON_MAIL_PER_HOUR; if (cap === 0) return true;
  try {
    const k = `anonmail/${hourOf(now)}`;
    await db.prepare("INSERT INTO kv(k,v) VALUES(?,'1') ON CONFLICT(k) DO UPDATE SET v=CAST(CAST(v AS INTEGER)+1 AS TEXT)").bind(k).run();
    const n = Number((await db.prepare("SELECT v FROM kv WHERE k=?").bind(k).first<{ v: string }>())?.v ?? 0);
    if (n === cap + 1) console.warn(`[mail-alert] anonymous-triggered mail passed ${cap} in one hour: the rest of the hour is not mailed (numbers only).`);
    return n <= cap;
  } catch { return true; }
}

// ------------------------------------------------------------------------------------------------ the bulk queue
export async function queueBulk(db: D1, now: number, to: string, subject: string, body: string, html: string | undefined): Promise<void> {
  await db.prepare("INSERT INTO mail_bulk_queue(at_ms,to_addr,subject,body,html) VALUES(?,?,?,?,?)").bind(now, to, subject, body, html ?? null).run();
}
/**
 * The scheduled tick: sends waiting bulk mail, oldest first, at most `max` a tick, each one only if `bulkAllowed` still says yes. `send` is injected (pay.ts) so this file has no cycle.
 * Does NOTHING while a transactional mail is waiting for its retry: the invoice goes first, always. A mail older than 24 hours is dropped; an address that went on the do-not-mail list meanwhile is dropped.
 */
export async function drainBulkQueue(db: D1, env: LaneEnv, now: number, txWaiting: () => Promise<boolean>, send: (row: { id: number; to_addr: string; subject: string; body: string; html: string | null }) => Promise<boolean>, max = 2): Promise<{ sent: number; waiting: number; dropped: number }> {
  let sent = 0, dropped = 0;
  try { dropped += (await db.prepare("DELETE FROM mail_bulk_queue WHERE at_ms<?").bind(now - BULK_QUEUE_KEEP_MS).run()).meta?.changes ?? 0; } catch { return { sent, waiting: 0, dropped }; }
  if (dropped > 0) console.warn(`[mail-queue] ${dropped} waiting bulk mail(s) were older than 24 hours and were dropped, not sent (numbers only).`); // a drop is never silent
  const count = async () => Number((await db.prepare("SELECT COUNT(*) AS c FROM mail_bulk_queue").first<{ c: number }>())?.c ?? 0);
  if (await txWaiting()) return { sent, waiting: await count(), dropped };
  const rows = (await db.prepare("SELECT id, to_addr, subject, body, html FROM mail_bulk_queue ORDER BY id LIMIT ?").bind(Math.max(1, max) * 3).all<any>()).results ?? [];
  for (const r of rows) {
    if (sent >= max) break;
    if (await isSuppressed(db, r.to_addr)) { await db.prepare("DELETE FROM mail_bulk_queue WHERE id=?").bind(r.id).run(); dropped++; continue; }
    if (!(await bulkAllowed(db, env, now)).allow) break; // the same rule for every waiting mail: the rest wait
    if (await send(r)) { await db.prepare("DELETE FROM mail_bulk_queue WHERE id=?").bind(r.id).run(); sent++; }
    else break; // the provider did not take it: the rest would not be taken either; the next tick tries again
  }
  return { sent, waiting: await count(), dropped };
}

/** The housekeeping the hourly tick does for these tables. */
export async function lanesTick(db: D1, now: number): Promise<void> {
  try {
    await db.prepare("DELETE FROM mail_track WHERE at_ms<?").bind(now - MAIL_TRACK_KEEP_MS).run();
    await db.prepare("DELETE FROM mail_suppress WHERE at_ms<?").bind(now - SUPPRESS_KEEP_MS).run();
    await db.prepare("DELETE FROM mail_count WHERE day<?").bind(dayOf(now - MAIL_COUNT_KEEP_DAYS * 86_400_000)).run();
    await db.prepare("DELETE FROM mail_bulk_queue WHERE at_ms<?").bind(now - BULK_QUEUE_KEEP_MS).run();
    await db.prepare("DELETE FROM kv WHERE k LIKE 'anonmail/%' AND k<?").bind(`anonmail/${hourOf(now - 48 * 3_600_000)}`).run();
  } catch { /* best effort */ }
}

// ------------------------------------------------------------------------------------------------ the status read (public: numbers only)
export interface MailStatus {
  ok: boolean; level: "ok" | "warn" | "critical"; alert: string | null; month: string; at: string;
  quota: { monthly: number; sent: number; pct: number; dailyLimit: number; providerSaysUsedUp: boolean };
  lanes: { tx: { today: number; month: number; reservedMonth: number }; bulk: { today: number; month: number; todayCap: number; allowedNow: boolean; why: string; waiting: number } };
  cloudflare: { today: number; month: number; configured: boolean };
  warmup: { day: number; startedOn: string | null; bulkCapToday: number; transactionalOnly: boolean };
  doNotMail: { addresses: number };
  /** What an organizer should be told: `none` (nothing to say), `backup` (main service used up, mail goes by the Cloudflare route), `late` (used up, no backup route: mail is late). `note` is the plain-words text, or null. */
  organizer: { degraded: "none" | "backup" | "late"; note: string | null };
}
/** What the PUBLIC address shows: no counters, no plan size, no route settings. Only what an organizer screen needs, and whether all is well. The full read is the owner's (`GET /api/owner/mail-status`). */
export const publicMailStatus = (s: MailStatus): { ok: boolean; level: MailStatus["level"]; at: string; organizer: MailStatus["organizer"] } => ({ ok: s.ok, level: s.level, at: s.at, organizer: s.organizer });
const statusMemo = new WeakMap<object, { at: number; s: MailStatus }>();
/** The status, read from the database at most once every 30 seconds per worker: a script that loops on the public address, and every payment-done screen, share one read (audit 2, M3). */
export const STATUS_TTL_MS = 30_000;
export async function mailStatusCached(db: D1, env: LaneEnv & { CF_EMAIL_TOKEN?: string; CF_ACCOUNT_ID?: string }, now: number): Promise<MailStatus> {
  const c = statusMemo.get(db);
  if (c && now >= c.at && now - c.at < STATUS_TTL_MS) return c.s;
  const s = await mailStatus(db, env, now); statusMemo.set(db, { at: now, s }); return s;
}
export async function mailStatus(db: D1, env: LaneEnv & { CF_EMAIL_TOKEN?: string; CF_ACCOUNT_ID?: string }, now: number): Promise<MailStatus> {
  const u = await readUsage(db, now), quota = monthlyQuotaOf(env), daily = dailyLimitOf(env), sent = u.txMonth + u.bulkMonth, pct = Math.floor((sent * 100) / quota), month = dayOf(now).slice(0, 7);
  const warmDay = await warmupDay(db, env, now, false), start = await warmupStart(db, env, now, false), allowed = await bulkAllowed(db, env, now, false).catch(() => ({ allow: false, why: "unknown" }));
  const one = async <T>(sql: string, ...a: unknown[]): Promise<T | null> => { try { return await db.prepare(sql).bind(...a).first<T>(); } catch { return null; } };
  const lvl = levelOf(pct), alertRow = await one<{ k: string }>("SELECT k FROM kv WHERE k IN (?,?) ORDER BY k", `mailalert/critical/${month}`, `mailalert/warn/${month}`);
  const paused = Number((await one<{ v: string }>("SELECT v FROM kv WHERE k='mail_resend_pause_until'"))?.v ?? 0) > now;
  const seen = Number((await one<{ v: string }>("SELECT v FROM kv WHERE k='mail_quota_seen'"))?.v ?? 0), usedUp = paused || (seen > 0 && now - seen < QUOTA_SEEN_MS) || pct >= ALERT_CRITICAL_PCT;
  const cfOn = !!(env.CF_EMAIL_TOKEN && env.CF_ACCOUNT_ID), degraded = !usedUp ? "none" : cfOn ? "backup" : "late";
  const waiting = Number((await one<{ c: number }>("SELECT COUNT(*) AS c FROM mail_bulk_queue"))?.c ?? 0), suppressed = Number((await one<{ c: number }>("SELECT COUNT(*) AS c FROM mail_suppress"))?.c ?? 0);
  return {
    ok: lvl === "ok" && !usedUp, level: lvl, alert: alertRow ? alertRow.k.split("/")[1]! : null, month, at: new Date(now).toISOString(),
    quota: { monthly: quota, sent, pct, dailyLimit: daily, providerSaysUsedUp: usedUp },
    lanes: { tx: { today: u.txToday, month: u.txMonth, reservedMonth: Math.ceil(quota * TX_RESERVE_SHARE) }, bulk: { today: u.bulkToday, month: u.bulkMonth, todayCap: bulkCapForDay(warmDay), allowedNow: allowed.allow, why: allowed.why, waiting } },
    cloudflare: { today: u.cfToday, month: u.cfMonth, configured: !!(env.CF_EMAIL_TOKEN && env.CF_ACCOUNT_ID) },
    warmup: { day: warmDay, startedOn: start, bulkCapToday: bulkCapForDay(warmDay), transactionalOnly: bulkCapForDay(warmDay) === 0 },
    doNotMail: { addresses: suppressed },
    organizer: { degraded, note: degraded === "backup" ? ORGANIZER_NOTE_BACKUP : degraded === "late" ? ORGANIZER_NOTE_LATE : null },
  };
}
