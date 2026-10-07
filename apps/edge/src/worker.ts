// Cloudflare-Workers-shaped store for the zero-server design. It keeps only what must outlive phones: who joined, which claims were made,
// and the settled results. It never draws numbers and never verifies BLS (a free Worker has ~10 ms CPU; one verify costs ~60 ms),
// so winners are never posted by a person: every phone works them out from the public numbers and reports them, and a result is accepted when several different phones agree (winners.ts).
// D1-compatible: env.DB only uses prepare/bind/run/all/first/batch.
//
// Who may do what:
//   platform key  (env.ORGANIZER_SECRET)  - us: issues organizer keys, runs the daily purge, and can act on any engagement (also single-tenant/local mode).
//   master key    - the organizer's own console: everything for that organizer's engagements, including publishing results, erasing, registering the pause key.
//   AI key        - the organizer's external AI assistant: everything a person could do in the console EXCEPT publishing results, erasing data and
//                   registering/using the pause signing key (pausing needs the organizer's own browser; the AI can only ask, see /control/request).
//                   So an AI can never decide who wins, and never change what the public beacon decides. Every AI call is written to an audit trail (winners.ts).
//   Winners: nobody posts them. Phones report what they worked out and a result is accepted when several different phones agree (winners.ts, quorumFor).
//   nobody        - phones: join, send claims, read results counts, read the engagement info and the signed control file.

import { GRACE_ROUNDS, brandMomentsFor, defaultCfg, validateCfg, type EngagementCfg } from "../../../packages/beacon/src/config";
import { openPii, openText, sealPii, sealText } from "./pii";
import { TERMS_VERSION } from "./brand";
import { LINK_MAIL_TTL_MS, aiLinkMail, coHostLinkMail, newUseAlertMail, signInMail } from "./mails";
import { acceptOver, acceptWon, endBoundMs, eraseEverything, erasePersonal, fullDeleteAt, lifecycleTick, personalDeleteAt, recordWinners, reportApi, reportLink } from "./lifecycle";
import { PAY_SCHEMA, payRoute, retryOutbox, sendMail, freeLaunch, payMode, FREE_CAP, MAX_DRAFTS, type PayEnv } from "./pay";
import { PACKS, price } from "../../../packages/shared/src/pricing";
import { PARTNER_SCHEMA, partnerRoute } from "./partners";
import { MODE_SCHEMA, modeRoute, orgIsTest, testFlag } from "./mode";
import { purgeTestData } from "./test-data";
import { frontDoorText, nextHint, GET_BODY_MAX, LINK_KEY, CONVERSATION, aiPaste, manualJson, manualText, type LinkRole } from "./ai-link";
import { factsText } from "./ai-facts";
import { mapJson, mapText } from "./ai-functions";
import { goScreen, screenJson, screenText } from "./ai-go";
import { AUDIT_SCHEMA, auditRequest, analyzeChain, loadRows, logAccess, setHold, toCsv, verifyChain, closeAuditFor, sweepAudit, type AuditEnv } from "./audit";
import { VISIT_SCHEMA, beaconRoute, linkVisitor, parseRange, recordFunnelForOrg, visitsJourney, visitsSummary, type VisitEnv } from "./visits";
import { WINNERS_SCHEMA, acceptVotes, auditAi, confirmPrize, listAiAudit, listPrizes, markGiven, myPrizes } from "./winners";
import { PAUSE_MAX_PARTICIPANTS, safetyForCap, publishControl, readPublished, registerKey, type KV } from "../../../packages/beacon/src/control";

export interface D1Result<T = any> { results?: T[]; meta?: { changes?: number } }
export interface D1Stmt { bind(...v: unknown[]): D1Stmt; run(): Promise<D1Result>; all<T = any>(): Promise<D1Result<T>>; first<T = any>(): Promise<T | null> }
export interface D1 { prepare(sql: string): D1Stmt; batch(s: D1Stmt[]): Promise<D1Result[]> }
export interface R2Like { put(key: string, value: string, opts?: unknown): Promise<unknown>; delete(key: string): Promise<unknown> }
export interface Env {
  DB: D1; ORGANIZER_SECRET?: string; DAILY_WRITE_BUDGET?: string; PHONE_SALT?: string;
  /** The secret that seals names and mobile numbers at rest (AES-256-GCM). Never stored in the database. */
  DATA_KEY?: string;
  /** Optional: the key that hashes network addresses for the public-page visit tracking (visits.ts); when absent it is derived from DATA_KEY. VISIT_DAILY_WRITES caps that tracking's share of the daily write allowance (default 20,000). */
  VISIT_KEY?: string; VISIT_DAILY_WRITES?: string;
  /** Shared secret of the mail service's inbound webhook (e-mail to us asking for a deletion). */
  INBOUND_SECRET?: string;
  /** The scheduled job's own key (it can call only the lifecycle tick, nothing else). */
  CRON_KEY?: string;
  /** "1" on the live site: the Worker refuses every request (503) unless every secret below is set, so a missing key can never fall back to a built-in constant. */
  STRICT_KEYS?: string;
  /** Optional: a public R2 bucket behind a cached custom domain. Phones then read the pause file from the CDN and never invoke the Worker for it. */
  CONTROL_R2?: R2Like; CONTROL_BASE?: string;
  /** Optional: an OpenAI-compatible chat endpoint the OWNER's 'analyze' route may send MASKED aggregates to (never IPs, device ids or names). */
  ANALYZE_AI_URL?: string; ANALYZE_AI_KEY?: string; ANALYZE_AI_MODEL?: string;
}
const controlKey = (id: string) => `c/${id}.json`;
const controlUrl = (env: Env, id: string) => (env.CONTROL_BASE && env.CONTROL_R2 ? `${env.CONTROL_BASE.replace(/\/$/, "")}/${controlKey(id)}` : null);
/** Keeps the static copy in step with the stored file. Best effort: the Worker's own /control answer stays correct if this fails. */
async function mirrorControl(env: Env, id: string) {
  if (!env.CONTROL_R2) return;
  try { const f = await readPublished(d1kv(env), id); if (f) await env.CONTROL_R2.put(controlKey(id), JSON.stringify(f), { httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=3" } }); } catch { /* the Worker route still serves it */ }
}
export const RETENTION_DAYS = 365;
/** An engagement that was never published is forgotten after this many days. */
export const DRAFT_DAYS = 30;
/** New organizer accounts one network address may open in a day (a free-plan guard, not a security wall). */
const STARTS_PER_DAY = 10;
/** Largest page of participants one request returns, so a 10,000-person list never costs a free Worker its ~10 ms of CPU in one go. */
export const PAGE = 2000;
/** Claims are only a live cross-check (settlement never uses them), and 7 rows per phone would eat the free write allowance, so they are stored only for engagements this size or smaller. */
export const CLAIM_TRACKING_MAX_CAP = 500;
const tracks = (e: { cap: number }) => e.cap <= CLAIM_TRACKING_MAX_CAP;
/** The part of the settings every phone needs, public by design: how many tickets, what each house wins, and when the brand breaks are. */
const pub = (e: any) => { const c = cfgOf(e); return { tickets: c.tickets, rewards: c.rewards, breaks: c.breaks, rounds: c.rounds, invites: c.invites, opening: c.opening, closing: c.closing, ...(c.name ? { name: c.name } : {}) }; };
const cfgJson = (c: EngagementCfg) => JSON.stringify({ rewards: c.rewards, breaks: c.breaks, rounds: c.rounds, invites: c.invites, opening: c.opening, closing: c.closing, ...(c.name ? { name: c.name } : {}) });

/** Privacy and lifecycle: sealed personal data, the role / inviter / invite kind / source of a seat, when each game ended, the winners record that outlives the personal data, and the votes that tell us a game is over. */
export const PRIVACY_SCHEMA: string[] = [
  `ALTER TABLE participant ADD COLUMN pii TEXT`,
  `ALTER TABLE seat ADD COLUMN role TEXT`,
  `ALTER TABLE seat ADD COLUMN inv INTEGER`,
  `ALTER TABLE seat ADD COLUMN cat TEXT`,
  `ALTER TABLE seat ADD COLUMN src TEXT`,
  `CREATE TABLE IF NOT EXISTS life (eid TEXT PRIMARY KEY, end_ms INTEGER NOT NULL, end_src TEXT NOT NULL, report_ms INTEGER, report_state TEXT, purged_ms INTEGER, tries INTEGER NOT NULL DEFAULT 0, notified INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS winner (eid TEXT NOT NULL, round INTEGER NOT NULL, pattern TEXT NOT NULL, ordinal INTEGER NOT NULL, seat INTEGER NOT NULL, idx INTEGER, at_ms INTEGER, src TEXT NOT NULL, PRIMARY KEY (eid, round, pattern, ordinal, seat))`,
  `CREATE TABLE IF NOT EXISTS overvote (eid TEXT NOT NULL, seat INTEGER NOT NULL, at_ms INTEGER NOT NULL, PRIMARY KEY (eid, seat))`,
];

export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS engagement (id TEXT PRIMARY KEY, start_round INTEGER NOT NULL, call_seconds INTEGER NOT NULL, cap INTEGER NOT NULL, created_ms INTEGER NOT NULL, org TEXT, closed INTEGER NOT NULL DEFAULT 0, pack INTEGER, tickets INTEGER NOT NULL DEFAULT 1, config TEXT)`,
  `CREATE TABLE IF NOT EXISTS participant (eid TEXT NOT NULL, pid TEXT NOT NULL, phone_hash TEXT NOT NULL, name TEXT, joined_ms INTEGER NOT NULL, PRIMARY KEY (eid, pid))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS participant_phone ON participant (eid, phone_hash)`,
  `CREATE TABLE IF NOT EXISTS claim (eid TEXT NOT NULL, pid TEXT NOT NULL, pattern TEXT NOT NULL, round INTEGER NOT NULL DEFAULT 1, idx INTEGER NOT NULL, at_ms INTEGER NOT NULL, PRIMARY KEY (eid, pid, pattern, round))`,
  `CREATE TABLE IF NOT EXISTS settled (eid TEXT NOT NULL, pattern TEXT NOT NULL, ordinal INTEGER NOT NULL DEFAULT 1, round INTEGER NOT NULL DEFAULT 1, idx INTEGER NOT NULL, pids TEXT NOT NULL, PRIMARY KEY (eid, pattern, ordinal, round))`,
  `CREATE TABLE IF NOT EXISTS usage (day TEXT PRIMARY KEY, writes INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS organizer_key (hash TEXT PRIMARY KEY, org TEXT NOT NULL, kind TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_ms INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ctl_request (id INTEGER PRIMARY KEY AUTOINCREMENT, eid TEXT NOT NULL, action TEXT NOT NULL, note TEXT, at_ms INTEGER NOT NULL, open INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS suggestion (id INTEGER PRIMARY KEY AUTOINCREMENT, org TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', note TEXT, votes INTEGER NOT NULL DEFAULT 1, created_ms INTEGER NOT NULL, title_hash TEXT NOT NULL, UNIQUE (org, title_hash))`,
  `CREATE TABLE IF NOT EXISTS suggestion_vote (sid INTEGER NOT NULL, org TEXT NOT NULL, PRIMARY KEY (sid, org))`,
  `CREATE TABLE IF NOT EXISTS login_code (email_hash TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_ms INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, win_start INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0)`,
  ...PAY_SCHEMA,
  ...PARTNER_SCHEMA,
  // a seat is a participant's place in the engagement: its number makes the ticket collision-free, and `dev` ties the ticket to the one device that joined
  `CREATE TABLE IF NOT EXISTS seat (eid TEXT NOT NULL, seq INTEGER NOT NULL, pid TEXT NOT NULL, ph TEXT NOT NULL, dev TEXT, PRIMARY KEY (eid, seq))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS seat_phone ON seat (eid, ph)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS seat_pid ON seat (eid, pid)`,
  // the beacon round a seat joined in, when that was after the game began (0 = joined in time): every phone counts that person's numbers from there
  `ALTER TABLE seat ADD COLUMN jr INTEGER`,
  ...PRIVACY_SCHEMA,
  ...WINNERS_SCHEMA,
  // a key made only for an e-mail lives 24 hours: after expires_ms it is treated like an unknown key (null = never expires, as before)
  `ALTER TABLE organizer_key ADD COLUMN expires_ms INTEGER`,
  // the one-click sign-in link in the sign-in e-mail: only its hash is kept, single use, same expiry as the 6-digit code
  `ALTER TABLE login_code ADD COLUMN link_hash TEXT`,
  // the version of the Terms an organizer accepted by continuing (create engagement, sign in)
  `CREATE TABLE IF NOT EXISTS organizer_terms (org TEXT NOT NULL, version TEXT NOT NULL, at_ms INTEGER NOT NULL, via TEXT NOT NULL, PRIMARY KEY (org, version))`,
  // partner codes are random; the partner's mobile number and e-mail are kept only as salted hashes
  `ALTER TABLE partner ADD COLUMN phone_hash TEXT`,
  `ALTER TABLE partner ADD COLUMN email_hash TEXT`,
  // the internal audit log (append-only, hash-chained, sealed), the owner's access log, deletion certificates and anonymous statistics, legal holds
  ...AUDIT_SCHEMA,
  // first-party visitor-journey tracking of the public pages, and its anonymous per-day totals
  ...VISIT_SCHEMA,
  // TEST / LIVE mode (mode.ts): the mode row, the owner's e-mail allow-list, the mail event log and the is_test flags
  ...MODE_SCHEMA,
];

const PATTERNS = new Set(["early5", "top", "mid", "bot", "corners", "star", "full", "full2", "lucky"]);
/** What the organizer set for this engagement (tickets per participant, reward lines, brand breaks); plain defaults when nothing was set. */
const cfgOf = (e: { tickets?: number; config?: string | null }): EngagementCfg => {
  try { const j = e.config ? JSON.parse(e.config) : {}; const v = validateCfg({ tickets: e.tickets ?? 1, rewards: j.rewards, breaks: j.breaks, rounds: j.rounds, invites: j.invites, opening: j.opening, closing: j.closing, name: j.name }); if (v.ok) return v.cfg; } catch { /* fall through */ }
  return defaultCfg();
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("");
const randHex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
const MAX_BODY = 4096;
const ID = /^[A-Za-z0-9_-]{4,40}$/;
const GENESIS = 1692803367; // drand quicknet; round r is published at GENESIS + (r-1)*3 s (UTC)
const roundMs = (r: number) => (GENESIS + (r - 1) * 3) * 1000;
/** An unpaid engagement is held from this long BEFORE its start, so every phone (they check every few seconds) knows before the first number would be shown. */
const LOCK_LEAD_MS = 45_000;
const roundOfMs = (ms: number) => Math.floor((ms / 1000 - GENESIS) / 3) + 1;
/** A published engagement is open to participants even before it is paid for; a draft is not. Paid engagements are always published. */
async function isPublished(env: Env, e: { id: string; pack: number | null }): Promise<boolean> {
  if (e.pack !== 0) return true;
  return !!(await env.DB.prepare("SELECT 1 AS x FROM kv WHERE k=?").bind(`pub/${e.id}`).first());
}
const istTime = (ms: number) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) + " IST";
/** The organizer is e-mailed once, and only about their own engagement. A mail is a nudge, never a requirement. */
async function nudge(env: Env, id: string, flag: string, now: number, subject: string, text: string): Promise<void> {
  try {
    if (await env.DB.prepare("SELECT 1 AS x FROM kv WHERE k=?").bind(`${flag}/${id}`).first()) return;
    const c = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`contact/${id}`).first<{ v: string }>();
    if (!c) return;
    await env.DB.prepare("INSERT OR IGNORE INTO kv(k,v) VALUES(?,?)").bind(`${flag}/${id}`, String(now)).run();
    await sendMail(env as PayEnv, env.DB, JSON.parse(c.v).email, subject, text, now);
  } catch { /* never block a request on a nudge */ }
}

async function body(req: Request, max = MAX_BODY): Promise<any | null> {
  const t = await req.text();
  if (t.length > max) return null;
  try { const v = JSON.parse(t); return v && typeof v === "object" ? v : null; } catch { return null; }
}

/** Free-plan guard: refuse politely before the daily write cap is hit, so a busy day never turns into a surprise failure or a bill. */
async function spend(env: Env, now: number, n = 1): Promise<boolean> {
  const budget = Number(env.DAILY_WRITE_BUDGET ?? 80_000); // D1 free cap is 100,000 rows written per day; keep a 20% margin
  const d = day(now);
  const row = await env.DB.prepare("SELECT writes FROM usage WHERE day=?").bind(d).first<{ writes: number }>();
  if ((row?.writes ?? 0) + n > budget) return false;
  await env.DB.prepare("INSERT INTO usage(day,writes) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET writes=writes+?").bind(d, n, n).run();
  return true;
}
/** An AI key (or a co-host) never receives or sends names and mobile numbers: the organizer loads the list in the console. */
const CONSOLE_ONLY = () => json({ error: "Names and mobile numbers are handled by the owner in the console, not by the AI. Ask the owner to paste the list in the Participants card. You can set the limit with settings and refer to people by ticket number." }, 403);
/** One network address may open only so many NEW seats a day (an office behind one address is far below this): protects the shared daily write budget from a script. */
const JOIN_PER_IP_DAY = 1500, JOIN_PER_IP_MINUTE = 200;
async function joinOverLimit(env: Env, req: Request, now: number): Promise<boolean> {
  try {
    const ip = (await sha("jip|" + (req.headers.get("cf-connecting-ip") ?? "local"))).slice(0, 16), perDay = Number((env as any).JOIN_PER_IP_DAY ?? JOIN_PER_IP_DAY), perMin = Number((env as any).JOIN_PER_IP_MINUTE ?? JOIN_PER_IP_MINUTE);
    const bump = async (k: string, max: number) => { const n = Number((await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(k).first<{ v: string }>())?.v ?? 0); if (n >= max) return true; await env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=?").bind(k, String(n + 1), String(n + 1)).run(); return false; };
    const iso = new Date(now).toISOString();
    return (await bump(`jbm/${iso.slice(0, 16)}/${ip}`, perMin)) || (await bump(`jlim/${iso.slice(0, 10)}/${ip}`, perDay));
  } catch { return false; }
}
const BUSY = () => json({ error: "It is very busy right now. Please try again in a few minutes." }, 503);

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, x-organizer, x-partner, authorization, x-ct-vid, x-ct-vs", "access-control-allow-methods": "GET, POST, PUT, PATCH, OPTIONS", "access-control-max-age": "86400" };
/** Phones load the app from Pages and call this Worker from another origin, so every answer carries open CORS (no cookies are used anywhere). */
/** The message an organizer pastes into any AI chat: two short lines and the short link (/ai/<key>), which opens the complete manual. The key is only inside the link. The AI key cannot pay, publish, erase, pause or settle. */
export const aiMessage = (origin: string, key: string) => aiPaste(origin, key);
/** Records that this organizer continued under the current Terms (no tick box: continuing is the acceptance). One row per organizer and version. */
async function recordTerms(env: Env, org: string, now: number, via: string): Promise<void> {
  try { await env.DB.prepare("INSERT OR IGNORE INTO organizer_terms(org,version,at_ms,via) VALUES(?,?,?,?)").bind(org, TERMS_VERSION, now, via).run(); } catch { /* never block a request on this */ }
}
/** The organizer's e-mail address for the dedicated AI-link mails (the one used at sign-up), kept sealed; older accounts fall back to the address confirmed at their latest publish. null when unknown. */
async function orgEmail(env: Env, org: string): Promise<string | null> {
  try {
    const sealed = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`orgmail/${org}`).first<{ v: string }>();
    const e = await openText(env as any, sealed?.v);
    if (e) return e;
    const c = await env.DB.prepare("SELECT v FROM kv WHERE k LIKE 'contact/%' AND substr(k,9) IN (SELECT id FROM engagement WHERE org=? ORDER BY created_ms DESC) LIMIT 1").bind(org).first<{ v: string }>();
    return c ? (JSON.parse(c.v).email as string) : null;
  } catch { return null; }
}
/** Mints a key that works for 24 hours only and e-mails it in the dedicated mail: the only way an AI link ever travels by e-mail. The lasting key never leaves the console. Returns mailed:false (and the paste, so it is not lost) when no address is known or the mail failed. */
async function mailTempLink(env: Env, req: Request, org: string, kind: "ai" | "host", why: "start" | "replace" | "fresh", now: number, knownEmail?: string): Promise<{ mailed: boolean; expiresMs: number; aiMessage?: string }> {
  const key = (kind === "ai" ? "cta_" : "cth_") + randHex(24), expiresMs = now + LINK_MAIL_TTL_MS;
  await env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms,expires_ms,is_test) VALUES(?,?,?,0,?,?,COALESCE((SELECT MAX(k2.is_test) FROM organizer_key k2 WHERE k2.org=?),0))").bind(await sha("key|" + key), org, kind, now, expiresMs, org).run(); // a key of a test account is a test key too
  const origin = (env as PayEnv).PUBLIC_ORIGIN ?? new URL(req.url).origin;
  const to = knownEmail ?? (await orgEmail(env, org));
  let mailed = false;
  if (to) { const m = kind === "ai" ? aiLinkMail(origin, key, why, expiresMs) : coHostLinkMail(origin, key, to, expiresMs); mailed = await sendMail(env as PayEnv, env.DB, to, m.subject, m.text, now, { html: m.html, secret: true }); }
  return { mailed, expiresMs, ...(mailed ? {} : { aiMessage: aiMessage(origin, key) }) };
}
/** Replaces the organizer's AI work link: every AI key (lasting and 24-hour) stops at once, a new lasting key is made for the console, and a fresh 24-hour key goes out in the dedicated mail. */
async function replaceAiLink(env: Env, req: Request, org: string, now: number): Promise<{ aiKey: string; aiMessage: string; mailed: boolean }> {
  await env.DB.prepare("UPDATE organizer_key SET revoked=1 WHERE org=? AND kind='ai'").bind(org).run();
  const key = "cta_" + randHex(24);
  await env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms,is_test) VALUES(?,?,?,0,?,COALESCE((SELECT MAX(k2.is_test) FROM organizer_key k2 WHERE k2.org=?),0))").bind(await sha("key|" + key), org, "ai", now, org).run();
  await env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(`aikey/${org}`, await sealText(env as any, key)).run();
  const origin = (env as PayEnv).PUBLIC_ORIGIN ?? new URL(req.url).origin;
  const t = await mailTempLink(env, req, org, "ai", "replace", now);
  return { aiKey: key, aiMessage: aiMessage(origin, key), mailed: t.mailed };
}
/** Alert (once per key per 24 h): an AI or co-host key was used from a country, network prefix or program this key has not been seen from. The very first use sets the baseline and never alerts. The alert carries no link and no key. */
async function noteUse(env: Env, org: string, kind: "ai" | "host", keyId: string, req: Request, now: number): Promise<void> {
  try {
    const country = (req.headers.get("cf-ipcountry") ?? "").toUpperCase().slice(0, 4);
    const ip = req.headers.get("cf-connecting-ip") ?? "";
    const prefix = ip.includes(":") ? ip.split(":").slice(0, 3).join(":") : ip.split(".").slice(0, 3).join(".");
    const ua = (req.headers.get("user-agent") ?? "").trim(); const fam = (ua.split(/[\/\s(;]/)[0] ?? "").toLowerCase().slice(0, 40);
    const row = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`seen/${keyId}`).first<{ v: string }>();
    const seen: { c: string[]; p: string[]; u: string[] } = row ? JSON.parse(row.v) : { c: [], p: [], u: [] };
    const fresh = { c: !!country && !seen.c.includes(country), p: !!prefix && !seen.p.includes(prefix), u: !!fam && !seen.u.includes(fam) };
    if (row && !fresh.c && !fresh.p && !fresh.u) return;
    const add = (arr: string[], v: string) => { if (v && !arr.includes(v)) arr.push(v); if (arr.length > 40) arr.shift(); };
    add(seen.c, country); add(seen.p, prefix); add(seen.u, fam);
    await env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(`seen/${keyId}`, JSON.stringify(seen)).run();
    if (!row) return; // first use of this key: the baseline
    const last = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`alert/${keyId}`).first<{ v: string }>();
    if (last && now - Number(last.v) < 86_400_000) return;
    const to = await orgEmail(env, org);
    if (!to) return;
    await env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(`alert/${keyId}`, String(now)).run();
    const m = newUseAlertMail({ when: istTime(now), country, program: ua.slice(0, 60), kind: kind === "ai" ? "AI" : "co-host", origin: (env as PayEnv).PUBLIC_ORIGIN });
    await sendMail(env as PayEnv, env.DB, to, m.subject, m.text, now, { html: m.html });
  } catch { /* an alert must never break the work */ }
}
/** Runs the daily clean-up (365-day purge, one more try for unsent mail) the first time an organizer-side request arrives each UTC day. Never slows or fails the request. */
export async function housekeeping(env: Env, now: number): Promise<void> {
  try {
    const d = day(now);
    const last = await env.DB.prepare("SELECT v FROM kv WHERE k='housekeeping_day'").first<{ v: string }>();
    if (last?.v === d) return;
    await env.DB.prepare("INSERT INTO kv(k,v) VALUES('housekeeping_day',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(d).run(); // claim the day first so two requests do not both run it
    await purgeOld(env, now);
    await retryOutbox(env as PayEnv, now);
    // published but unpaid, starting within 36 hours: one reminder to the organizer
    const due = await env.DB.prepare("SELECT e.id, e.start_round FROM engagement e WHERE e.pack=0 AND EXISTS (SELECT 1 FROM kv WHERE k='pub/'||e.id)").all<{ id: string; start_round: number }>();
    for (const x of due.results ?? []) {
      const at = roundMs(x.start_round);
      if (at > now && at - now < 36 * 3_600_000) await nudge(env, x.id, "remind", now, `Payment due before ${istTime(at)}: your engagement ${x.id}`, `Your engagement ${x.id} starts ${istTime(at)}. It is not paid yet, so it will not begin.\n\nPay now (about 2 minutes): ${(env as PayEnv).PUBLIC_ORIGIN ?? ""}/pay.html?e=${x.id}`);
    }
  } catch { /* try again on the next request */ }
}
/** Safety net while the scheduled job is not running: an organizer-side request, or a phone saying the game is over, also nudges the lifecycle (at most once a minute per Worker instance). The scheduled job is the real clock. */
let lastNudge = 0;
/** The names of the secrets this Worker needs in production (STRICT_KEYS=1) and does not have. Empty when strict mode is off (local runs and tests). */
export const missingKeys = (env: Env): string[] => (env.STRICT_KEYS === "1" ? ["DATA_KEY", "PHONE_SALT", "ORGANIZER_SECRET", "CRON_KEY", "INBOUND_SECRET"].filter((k) => !String((env as any)[k] ?? "").trim()) : []);
const keysMissing = (env: Env) => missingKeys(env).length > 0;
export async function handle(req: Request, env: Env, now = Date.now(), waitUntil?: (p: Promise<unknown>) => void): Promise<Response> {
  if (keysMissing(env)) return new Response(JSON.stringify({ error: "The service is not configured. Please try again later." }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  const pn = new URL(req.url).pathname;
  if (pn === "/ai" || pn.startsWith("/ai/")) return aiLink(req, env, now, waitUntil);
  return handle0(req, env, now, waitUntil);
}

const LINK_HEADERS = { "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const linkText = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/plain; charset=utf-8", ...LINK_HEADERS } });
/** Same answer for a mistyped, unknown, revoked or wrong-kind key: nothing to learn from it. */
const linkGone = () => linkText("Not found.", 404);
/**
 * The short AI work link: /ai/<key> is the complete manual for that key's role, and /ai/<key>/<api path> is the normal /api/<api path> route with the key
 * taken from the address instead of a header (so a chat AI that can only open web addresses can work). Only organizer-AI (cta_) and co-host (cth_) keys work here:
 * an organizer's own sign-in key and the platform key are never accepted in an address. For browse-only AIs, GET plus _method=POST|PATCH and _body=<URL-encoded JSON> performs that action.
 * The rewritten request carries the key in x-organizer, so the audit trail records it like any other AI call, with the /api path and no key in the path.
 */
async function aiLink(req: Request, env: Env, now: number, waitUntil?: (p: Promise<unknown>) => void): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...CORS, ...LINK_HEADERS } });
  const m = url.pathname.match(/^\/ai\/([^/]+)(?:\/(.*))?$/s);
  if (!m || !LINK_KEY.test(m[1]!)) return linkGone();
  const key = m[1]!;
  const a = await authOfKey(env, key, now);
  if (a.plat || !a.org || (a.kind !== "ai" && a.kind !== "host")) return linkGone();
  const origin = (env as PayEnv).PUBLIC_ORIGIN ?? url.origin;
  const role: LinkRole = a.kind;
  const rest = (m[2] ?? "").replace(/^api\//, "");
  if (rest === "") {
    if (req.method !== "GET" && req.method !== "HEAD") return linkText("This address is read with GET.", 405);
    const keyId = (await sha("key|" + key)).slice(0, 10);
    const work = auditAi(env.DB, a.org, new Request(origin + "/ai/manual", { method: "GET", headers: req.headers }), keyId, 200, now);
    if (waitUntil) waitUntil(work); else await work;
    await noteUse(env, a.org, role === "ai" ? "ai" : "host", keyId, req, now);
    const h = new Headers({ ...CORS, ...LINK_HEADERS });
    if (url.searchParams.get("format") === "json") { h.set("content-type", "application/json; charset=utf-8"); return new Response(req.method === "HEAD" ? null : JSON.stringify(manualJson(origin, key, role, now)), { headers: h }); }
    h.set("content-type", "text/plain; charset=utf-8");
    return new Response(req.method === "HEAD" ? null : manualText(origin, key, role, now), { headers: h });
  }
  if (rest === "start" || rest === "map" || rest === "facts" || rest === "go" || rest.startsWith("go/")) { // the front door, the list of functions, the facts, and the guided step links
    if (req.method !== "GET" && req.method !== "HEAD") return linkText("These addresses are read with GET.", 405);
    const kind = rest === "start" || rest === "map" || rest === "facts" ? rest : "go";
    const keyId = (await sha("key|" + key)).slice(0, 10);
    const work = auditAi(env.DB, a.org, new Request(origin + "/ai/" + kind, { method: "GET", headers: req.headers }), keyId, 200, now);
    if (waitUntil) waitUntil(work); else await work;
    await noteUse(env, a.org, role === "ai" ? "ai" : "host", keyId, req, now);
    const hh = new Headers({ ...CORS, ...LINK_HEADERS }); const asJson = url.searchParams.get("format") === "json";
    hh.set("content-type", asJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8");
    const base = `${origin}/ai/${key}`, put = (t: string, j?: unknown) => new Response(req.method === "HEAD" ? null : asJson ? JSON.stringify(j ?? { text: t }) : t, { headers: hh });
    if (rest === "start") return put(frontDoorText(origin, key, role));
    if (role !== "ai") return linkText("This is for the organizer's AI link. A co-host's AI link reads the game and messages guests (see the instructions at the main address).", 403);
    if (rest === "map") return put(mapText(base, origin), mapJson(base, origin));
    if (rest === "facts") return put(factsText(`${origin}/trust.html`), { facts: (await import("./ai-facts")).FACTS });
    const apiAs = async (method: string, path: string, body?: unknown) => {
      const gh = new Headers({ "content-type": "application/json", "x-organizer": key, "x-ct-link": "1" });
      for (const k of ["cf-connecting-ip", "user-agent", "cf-ipcountry", "cf-ray", "x-request-id", "x-ai-model", "x-ai-version", "x-ai-session", "x-ai-machine"]) { const v = req.headers.get(k); if (v) gh.set(k, v); }
      const rr = await handle0(new Request(`${url.origin}/api/${path}`, { method, headers: gh, body: body === undefined ? undefined : JSON.stringify(body) }), env, now, waitUntil);
      let jj: any = null; try { jj = await rr.json(); } catch { /* an empty answer */ }
      if (rr.status >= 400 && jj && typeof jj.error === "string" && !jj.next) jj.next = nextHint(rr.status, jj.error, base, origin, path);
      return { status: rr.status, json: jj };
    };
    const screen = await goScreen({ base, origin, now, api: apiAs }, rest === "go" ? "" : rest.slice(3), url.searchParams);
    return put(screenText(screen), screenJson(screen));
  }
  // the API call: same route, key in x-organizer
  let method = req.method === "HEAD" ? "GET" : req.method, payload: string | null = null;
  const q = new URLSearchParams(url.search);
  const asked = q.get("_method"), asBody = q.get("_body");
  q.delete("_method"); q.delete("_body");
  if (req.method === "GET" && asked !== null) {
    const mm = asked.toUpperCase();
    if (mm !== "POST" && mm !== "PATCH") return linkText("_method must be POST or PATCH.", 400);
    if (asBody !== null && asBody.length > GET_BODY_MAX) return linkText(`_body is too long (at most ${GET_BODY_MAX} characters). Send less per call: about 20 people for a roster.`, 413);
    if (asBody !== null) { try { JSON.parse(asBody); } catch { return linkText("_body is not valid JSON after decoding. Write the JSON compactly and URL-encode it (encodeURIComponent), for example _body=%7B%22cap%22%3A120%7D .", 400); } }
    method = mm; payload = asBody ?? "{}";
  } else if (req.method !== "GET" && req.method !== "HEAD") payload = await req.text();
  const h = new Headers({ "content-type": "application/json", "x-organizer": key, "x-ct-link": "1" });
  for (const k of ["cf-connecting-ip", "user-agent", "cf-ipcountry", "cf-ray", "x-request-id", "x-ct-tz", "x-ct-client-ms", "x-ai-model", "x-ai-version", "x-ai-session", "x-ai-machine"]) { const v = req.headers.get(k); if (v) h.set(k, v); }
  { const asn = (req as any).cf?.asn; if (asn) h.set("x-ct-asn", String(asn)); } // the real network number the Worker saw, passed on to the audit log
  const qs = q.toString();
  const inner = new Request(`${url.origin}/api/${rest}${qs ? "?" + qs : ""}`, { method, headers: h, body: payload });
  const r = await handle0(inner, env, now, waitUntil);
  const out = new Headers(r.headers);
  for (const [k, v] of Object.entries(LINK_HEADERS)) out.set(k, v);
  if (role === "ai" && r.status >= 400 && (r.headers.get("content-type") || "").includes("json")) { // a refusal also says what to do next, so the AI does not retry blindly
    const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* not JSON */ }
    if (j && typeof j.error === "string" && !j.next) { j.next = nextHint(r.status, j.error, `${origin}/ai/${key}`, origin, rest); out.delete("content-length"); return new Response(req.method === "HEAD" ? null : JSON.stringify(j), { status: r.status, headers: out }); }
    return new Response(req.method === "HEAD" ? null : t, { status: r.status, headers: out });
  }
  return new Response(req.method === "HEAD" ? null : r.body, { status: r.status, headers: out });
}
async function handle0(req: Request, env: Env, now: number, waitUntil?: (p: Promise<unknown>) => void): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (waitUntil && now - lastNudge > 60_000 && (req.headers.has("x-organizer") || /\/over$/.test(new URL(req.url).pathname))) { lastNudge = now; waitUntil(lifecycleTick(env as any, now).then(() => undefined, () => undefined)); }
  if ((req.method === "POST" && new URL(req.url).pathname === "/api/z") || new URL(req.url).pathname === "/api/history") { const h = housekeeping(env, now); if (waitUntil) waitUntil(h); else await h; }
  const r = await route(req, env, now);
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  return new Response(r.body, { status: r.status, headers: h });
}

function d1kv(env: Env): KV { return {
  get: async (k) => (await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(k).first<{ v: string }>())?.v ?? null,
  put: async (k, v) => { await env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(k, v).run(); },
}; }

interface Auth { plat: boolean; org: string | null; kind: "platform" | "master" | "ai" | "host" | null }
async function authOf(req: Request, env: Env, now: number): Promise<Auth> {
  return authOfKey(env, req.headers.get("x-organizer") || (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""), now);
}
async function authOfKey(env: Env, presented: string, now: number): Promise<Auth> {
  if (!presented) return { plat: false, org: null, kind: null };
  if (env.ORGANIZER_SECRET && presented === env.ORGANIZER_SECRET) return { plat: true, org: null, kind: "platform" };
  const row = await env.DB.prepare("SELECT org, kind FROM organizer_key WHERE hash=? AND revoked=0 AND (expires_ms IS NULL OR expires_ms>?)").bind(await sha("key|" + presented), now).first<{ org: string; kind: "master" | "ai" | "host" }>();
  return row ? { plat: false, org: row.org, kind: row.kind } : { plat: false, org: null, kind: null };
}
/** May this caller act on this engagement? `master` = needs the organizer's own key (or ours), not the AI's. */
const can = (a: Auth, e: { org: string | null }, master = false) => a.plat || (!!a.org && e.org === a.org && (!master || a.kind === "master"));
/** The organizer's own key, their AI's key, or ours: for what an organizer may do that a co-host may not. */
const canAi = (a: Auth, e: { org: string | null }) => a.plat || (!!a.org && e.org === a.org && (a.kind === "master" || a.kind === "ai"));
const deny = (a: Auth) => json({ error: a.kind === "ai" ? "Your AI assistant may not do this. It is for the organizer to do themselves in their console: tell them plainly what needs doing and where (your instructions say how)." : a.kind === "host" ? "Only the organizer can do this. A co-host can watch the engagement and send messages to everyone." : "Not allowed." }, 403);
/** What a co-host may touch: watching, and messages to everyone. Nothing that changes the engagement, the money or anyone's data. */
const HOST_ACTIONS = new Set(["participants", "summary", "results", "info", "announce", "prizes", "prizegiven", "reportlink", "life"]);
const MAX_HOSTS = 5;

export const AI_MANIFEST = {
  name: "Corporate Tambola organizer API",
  how: "Send your organizer AI key in the x-organizer header (or Authorization: Bearer). Easier for chat AIs: the same key in the address, https://<site>/ai/<key>, returns the full manual with ready-made addresses, and https://<site>/ai/<key>/z/{id}/summary works like /api/z/{id}/summary (GET-only tools add _method=POST|PATCH&_body=<URL-encoded JSON>). Every call is JSON. The numbers are drawn from public randomness on participants' phones; you cannot change them. Every call you make is recorded (time, which key, what was asked, and where it came from) in an audit trail the organizer can read.",
  your_role: "You are the organizer's event planner. Talk with them in plain, friendly words, never in API terms. Work through the steps in `conversation` IN ORDER, ONE question at a time, offering 2 to 4 clear options with a recommended default, and wait for their answer before moving on. Never invent details for them. They can watch everything you create appear live in their console (the openUrl returned when you create the engagement).",
  conversation: CONVERSATION.map((t) => t.replace(/\{api\}/g, "/api")),
  packs: PACKS.map(([n]) => ({ upTo: n, inr_including_gst: price(n, "INR").total, usd: price(n, "USD").total })),
  choices: { call_seconds: [6, 9, 12, 15], tickets: [1, 2], rewards: ["early5", "top", "mid", "bot", "corners", "star", "full", "full2 (two tickets)"], winners_per_reward: "1 to 5", break_kinds: ["file", "youtube", "slides", "speech", "lucky (1, 3, 5 or 10 winners)"], rounds: "1 to 5" },
  you_can: [
    { do: "Turn the organizer's chosen date and time into the startRound the engagement needs, and check it is in the future", call: "GET /api/z/schedule?at=2026-10-03T16:00:00+05:30 -> {startRound, startMs, startsInMinutes, startsAtIST}" },
    { do: "Read back everything saved for one engagement (start time in the organizer's time, speed, limit, tickets, every reward, every break, rounds, head-count, and whether it is a draft, published or paid). Use it to confirm the details with the organizer after every change", call: "GET /api/z/{id}/summary" },
    { do: "List engagements and head-counts", call: "GET /api/history" },
    { do: "Create an engagement. It is saved as a free draft that participants cannot see yet; nothing is paid at this step", call: "POST /api/z {id, startRound, callSeconds (6|9|12|15), cap, closed?}  -> {ok, draft, openUrl}" },
    { do: "When everything is set up, tell the organizer it is ready. Publishing is free but only the organizer can do it (they confirm their email and mobile number), and payment is due before the start time or the engagement will not begin. This returns a link: give it to the organizer and help them through every step, but never try to publish or pay yourself", call: "POST /api/z/{id}/publish -> {published:false, needsOrganizer:true, consoleUrl} (the organizer opens consoleUrl, confirms their details and presses Publish; afterwards the same call returns payUrl, the payment page, and shareUrl, the link for guests)" },
    { do: "Change start time, speed, cap, invite-only, tickets per participant (1 or 2), reward lines and brand moments (5 per ticket: opening, during the game, closing; 1 ticket = 5, 2 tickets = 10) and rounds (1 to 5 games, each with new numbers and new tickets) before the first number", call: "PATCH /api/z/{id}/settings {startRound?, callSeconds?, cap?, closed?, tickets?, rounds?, rewards?: [{pattern: early5|top|mid|bot|corners|star|full, scope?: ticket|two_ticket, ordinal?: 1-5, text}], breaks?: [{after?: 1-89 numbers called (leave it out: the software spreads them evenly), seconds?: 15-600 in steps of 3 (default 60), kind: file|youtube|slides|speech|lucky, title, mediaUrl?: https link (not for lucky), winners?: 1|3|5|10 (lucky only, default 3), style?: draw|scratch (lucky only; scratch shows a scratch card on phones, the winners are drawn the same fair way)}], opening?: [{kind: file|youtube|slides|speech, title, mediaUrl?, seconds?: 15-120}], closing?: [{kind: file|youtube|slides|speech, title, mediaUrl?}]}. IMPORTANT: rewards, breaks and every list you send REPLACE what was saved, they are not merged, so always send the complete list (to change one reward, read the summary, change it, send them all). A media link must be https; for kind youtube it must be a YouTube link; for file it must be a direct link the phones can open (a video, audio, image or PDF file), which we cannot check for you. A reward line is ONE winner of ONE house: for three winners of the full house send three lines with ordinal 1, 2 and 3. For the two-ticket full house use pattern full with scope two_ticket (ordinal 1-5). Names for the organizer: early5 = Early Five, top = Top line, mid = Middle line, bot = Bottom line, corners = Four corners, star = Star, full = Full house. A lucky draw is a break: {after: 60, seconds: 60, kind: lucky, title: Lucky draw, winners: 3}. Worked example: PATCH /api/z/{id}/settings {startRound: 33146812, callSeconds: 9, cap: 250, tickets: 2, rounds: 1, rewards: [{pattern: early5, ordinal: 1, text: Gift hamper}, {pattern: full, ordinal: 1, text: Voucher 5000}, {pattern: full, ordinal: 2, text: Voucher 3000}, {pattern: full, scope: two_ticket, ordinal: 1, text: iPad}], breaks: [{after: 30, seconds: 90, kind: youtube, title: Anniversary film, mediaUrl: https://www.youtube.com/watch?v=...}, {after: 60, seconds: 60, kind: lucky, title: Lucky draw, winners: 3}]}" },
    { do: "Participants: the OWNER loads the invite list in the Participants card of their console. Names and mobile numbers never pass through the AI (a roster call from an AI key answers 403). Set the limit with settings.", call: "(owner, in the console)" },
    { do: "Reuse an earlier engagement's people", call: "POST /api/z/{id}/reuse {from}" },
    { do: "See who joined (names and ids only, never phone numbers)", call: "GET /api/z/{id}/participants" },
    { do: "See claims received", call: "GET /api/z/{id}/claims" },
    { do: "See published results", call: "GET /api/z/{id}/results" },
    { do: "Ask the organizer to pause, resume or stop (they approve in their console)", call: "POST /api/z/{id}/control/request {action: pause|resume|stop, note}" },
    { do: "Ask for ALL participant names and mobile numbers of this engagement to be deleted (nothing is deleted until the organizer confirms in their console)", call: "POST /api/z/{id}/control/request {action: 'erase', note}" },
    { do: "Read the current pause status", call: "GET /api/z/{id}/control" },
    { do: "Send a message to every guest's phone and the big screen (160 characters; empty text clears it; once published)", call: "POST /api/z/{id}/announce {text}" },
    { do: "See the winners to hand rewards to, by ticket number (names and numbers stay in the console), and tick a reward as given", call: "GET /api/z/{id}/prizes ; POST /api/z/{id}/prizegiven {round, pattern, ordinal, seat, given}" },
    { do: "Change of phone: let one person move their ticket to a new phone", call: "POST /api/z/{id}/unbind {seat} (the ticket number; the console takes a mobile number, an AI never does)" },
    { do: "Flag a seat as organizer, host or co-host", call: "POST /api/z/{id}/mark {seat, role: organizer|host|co-host|none} (the ticket number; an AI never names a mobile number)" },
    { do: "Invitations: settle how many people each guest may invite and which kinds of guests, before the start", call: "PATCH /api/z/{id}/settings {invites: {on, per: 1-4, cats}}" },
    { do: "Create a co-host key (watch, announce, tick rewards as given; up to 5)", call: "POST /api/org/host -> {hostKey, manualUrl}" },
    { do: "Read the audit trail of AI calls, when the game ends, and whether the report is ready (the report address itself goes only to the organizer)", call: "GET /api/org/ai/audit ; GET /api/z/{id}/life ; GET /api/z/{id}/reportlink" },
    { do: "Suggest a feature, improvement or report we should build (shared with every organizer's AI, reviewed by us)", call: "POST /api/z/suggestions {kind: feature|improvement|report|bug|other, title, body}" },
    { do: "See everyone's suggestions and what we decided, and add your support to one", call: "GET /api/z/suggestions ; POST /api/z/suggestions/{id}/vote" },
  ],
  payment_faq: [
    "Building and publishing are free. Only the organizer publishes (they confirm their email and mobile number), and only the organizer pays; you never do either.",
    "Price is per engagement, by size: the smallest pack that covers the limit (see `packs`, prices include GST in India). The limit does not have to match a pack size; people beyond the limit cannot join.",
    "The organizer pays on the payment page, any time before the start time, online through Razorpay (the page shows the methods available). It takes about 2 minutes, and a GST invoice is emailed.",
    "If it is not paid by the start time the engagement does not begin: the guests who already joined see a waiting screen and nothing is shown to them. Nothing is charged and there is no penalty.",
    "If the organizer pays late, even hours later, the engagement starts about 3 minutes after the payment, for everyone already waiting, and they can also choose a new start time first.",
    "If they never pay, nothing is owed. They can create a new engagement whenever they like. Unpaid engagements are forgotten after 30 days.",
    "Unused places are not refunded once an engagement is paid. Rules and privacy are at /legal.html.",
  ],
  suggestions_rules: "Describe the need and the benefit, not code. Never include names, phone numbers, e-mail addresses or anything about specific people. Suggestions are visible to all organizers' AI assistants without saying who wrote them. We review them and mark each one new, under_review, planned, shipped or declined.",
  you_cannot: [
    "Pay. Payment is always the organizer's own act on the payment page (payUrl in the summary).",
    "Publish: the organizer confirms their own e-mail and mobile number and presses Publish. You prepare everything and hand over consoleUrl.",
    "Choose, publish, change or remove winners, numbers, tickets or anyone's reward (nobody can, not even the organizer: the software decides, and a result stands only when several different phones report exactly the same winners)",
    "Erase participant data (you may ASK; the organizer confirms)",
    "Pause, resume or stop a running game (you may ASK; only the organizer's own browser holds that signing key)",
    "Create or retire the organizer's own sign-in keys, change their e-mail or delete the account",
    "Write or run code on the platform",
  ],
};

/** Every call made with an organizer's AI key is written to an audit trail (when, which key, what was asked, the answer, and where it came from). */
async function route(req: Request, env: Env, now: number): Promise<Response> {
  const a = await authOf(req, env, now);
  const peek = req.method === "GET" || req.method === "HEAD" ? null : req.clone(); // the internal audit log reads the body from this copy; the route reads the original
  const r = await route0(req, env, now, a);
  let kidForLog: string | null = null;
  if (a.org && (a.kind === "ai" || (a.kind === "host" && req.headers.get("x-ct-link") === "1"))) { // a co-host's calls are recorded too, when they come through a work link
    const presented = req.headers.get("x-organizer") || (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const kid = (await sha("key|" + presented)).slice(0, 10);
    kidForLog = kid;
    await auditAi(env.DB, a.org, req, kid, r.status, now);
    if (r.status !== 403) await noteUse(env, a.org, a.kind === "ai" ? "ai" : "host", kid, req, now);
  } else if (a.org && a.kind) kidForLog = (await sha("key|" + (req.headers.get("x-organizer") || (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")))).slice(0, 10);
  await auditRequest(env as AuditEnv, req, peek, a, r.status, now, kidForLog);
  return r;
}
async function route0(req: Request, env: Env, now: number, a: Auth): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;

  if (req.method === "GET" && p === "/api/z/ai-manifest") return json(AI_MANIFEST);
  { const mr = await modeRoute(req, env as any, now, a.plat && req.headers.get("x-ct-link") !== "1", (n) => purgeTestData(env, n)); if (mr) return mr; } // TEST/LIVE switch, allow-list, purge (mode.ts): owner only, except the public read of the word TEST or LIVE
  if (p === "/api/v/b") return beaconRoute(req, env as VisitEnv, now, (n) => spend(env, now, n)); // public-page visit tracking (visits.ts); never the live game
  { // OWNER ONLY (platform key, never through an AI work link): visitor-journey reports. Every read is written to the access log; anybody else gets the same 404 as an unknown address.
    const vm = p.match(/^\/api\/owner\/visits\/(summary|journey\/([A-Za-z0-9_]{32,40}))$/);
    if (vm) {
      const ownerOk = a.plat && req.headers.get("x-ct-link") !== "1", what = vm[1] === "summary" ? "visits-summary" : "visits-journey";
      if (!ownerOk || req.method !== "GET") { await logAccess(env.DB, now, "denied:" + what, null, null, 0, false, a.kind ?? "anonymous"); return json({ error: "Not found" }, 404); }
      if (what === "visits-summary") { const { from, to } = parseRange(url.searchParams, now); const out = await visitsSummary(env as VisitEnv, from, to, url.searchParams.get("mode") === "test"); await logAccess(env.DB, now, what, null, null, out.humans.sessions + out.bots.sessions); return json(out); }
      const out = await visitsJourney(env as VisitEnv, vm[2]!);
      await logAccess(env.DB, now, what, null, null, out?.visits ?? 0, !!out);
      return out ? json(out) : json({ error: "Not found" }, 404);
    }
  }
  { const rm = p.match(/^\/api\/report\/([A-Za-z0-9_-]{4,40})$/); if (rm && req.method === "GET") return reportApi(env as any, rm[1]!, url, now); } // the report page; the key in the link is the only credential
  const paid = await payRoute(req, env as PayEnv, now, (n) => spend(env, now, n));
  if (paid) return paid;
  const partnered = await partnerRoute(req, env as PayEnv, now, (n) => spend(env, now, n), a.plat);
  if (partnered) return partnered;

  /* ---- sign in with an e-mailed code (no passwords): also how an organizer who lost their key gets a fresh one ---- */
  /* ---- start: a new organizer enters a work email and the console opens at once (no mail is sent). An email that already has an account is
     asked for the e-mailed code instead, so nobody can open someone else's console by typing their address. ---- */
  if (req.method === "GET" && p === "/api/z/schedule") { // a helper for the organizer's AI: a date and time becomes a start round
    const at = Date.parse(url.searchParams.get("at") ?? "");
    if (!Number.isFinite(at)) return json({ error: "Give a date and time with a time zone, like at=2026-10-03T16:00:00+05:30." }, 400);
    const startRound = roundOfMs(at);
    return json({ ok: at > now, startRound, startMs: roundMs(startRound), startsInMinutes: Math.round((roundMs(startRound) - now) / 60_000), startsAtIST: istTime(roundMs(startRound)), ...(at > now ? {} : { error: "That time has already passed. Pick a time in the future." }) });
  }
  if (req.method === "POST" && p === "/api/start") {
    const b = await body(req);
    const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email)) return json({ error: "Please enter a valid work email." }, 400);
    const eh = await sha("email|" + email);
    if (await env.DB.prepare("SELECT org FROM organizer_email WHERE email_hash=?").bind(eh).first()) return json({ ok: true, exists: true });
    const ipk = `start/${day(now)}/${(await sha("ip|" + (req.headers.get("cf-connecting-ip") ?? "local"))).slice(0, 16)}`;
    const used = Number((await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(ipk).first<{ v: string }>())?.v ?? 0);
    if (used >= STARTS_PER_DAY) return json({ error: "Too many new engagements from this network today. Please try again tomorrow." }, 429);
    if (!(await spend(env, now, 6))) return BUSY();
    const org = randHex(8), token = "ctk_" + randHex(24), aiKey = "cta_" + randHex(24), test = await testFlag(env); // an account made in TEST mode is flagged is_test
    await env.DB.batch([
      env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms,is_test) VALUES(?,?,?,0,?,?)").bind(await sha("key|" + token), org, "master", now, test),
      env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms,is_test) VALUES(?,?,?,0,?,?)").bind(await sha("key|" + aiKey), org, "ai", now, test),
      env.DB.prepare("INSERT INTO organizer_email(email_hash,org,is_test) VALUES(?,?,?)").bind(eh, org, test),
      env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(`orgmail/${org}`, await sealText(env as any, email)),
      env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(`aikey/${org}`, await sealText(env as any, aiKey)), // so the signed-in organizer can read their lasting link again (never mailed)
      env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=?").bind(ipk, String(used + 1), String(used + 1)),
    ]);
    await recordTerms(env, org, now, "start");
    await linkVisitor(env as VisitEnv, req, org, "start", now, email); // ties the visitor's earlier visits to this new organizer (no-op when nothing was tracked)
    const origin0 = (env as PayEnv).PUBLIC_ORIGIN ?? new URL(req.url).origin, startMsg = aiMessage(origin0, aiKey); // aiKey is the lasting key, shown only in the console
    await mailTempLink(env, req, org, "ai", "start", now, email); // the dedicated mail carries a separate key that expires in 24 hours
    return json({ ok: true, token, aiKey, aiMessage: startMsg });
  }
  if (req.method === "POST" && p === "/api/auth/email") {
    const b = await body(req);
    const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email)) return json({ error: "Please enter a valid work email." }, 400);
    const eh = await sha("email|" + email);
    const acct = await env.DB.prepare("SELECT org FROM organizer_email WHERE email_hash=?").bind(eh).first<{ org: string }>();
    const test = (env as PayEnv).TEST_MODE === "1";
    let devCode: string | undefined, devToken: string | undefined;
    if (acct) { // an unknown address gets the same answer, so nobody can find out who has an account
      const row = await env.DB.prepare("SELECT win_start, sent FROM login_code WHERE email_hash=?").bind(eh).first<{ win_start: number; sent: number }>();
      const fresh = !row || now - row.win_start > 3_600_000;
      if (!fresh && row!.sent >= 5) return json({ error: "Too many codes requested. Please try again in an hour." }, 429);
      if (!(await spend(env, now, 2))) return BUSY();
      const linkToken = randHex(24), code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000));
      await env.DB.prepare("INSERT INTO login_code(email_hash,code_hash,expires_ms,attempts,win_start,sent,link_hash) VALUES(?,?,?,0,?,1,?) ON CONFLICT(email_hash) DO UPDATE SET code_hash=excluded.code_hash, expires_ms=excluded.expires_ms, attempts=0, win_start=?, sent=?, link_hash=excluded.link_hash").bind(eh, await sha("code|" + eh + "|" + code), now + 600_000, fresh ? now : row!.win_start, await sha("link|" + linkToken), fresh ? now : row!.win_start, fresh ? 1 : row!.sent + 1).run();
      const sm = signInMail((env as PayEnv).PUBLIC_ORIGIN ?? new URL(req.url).origin, code, linkToken); // no AI key or paste here: the buttons lead to the signed-in page
      await sendMail(env as PayEnv, env.DB, email, sm.subject, sm.text, now, { html: sm.html, secret: true });
      if (test) { devCode = code; devToken = linkToken; }
    }
    return json({ ok: true, ...(devCode ? { devCode, devToken } : {}) });
  }
  if (req.method === "POST" && p === "/api/auth/link") { // the confirm page POSTs here; opening the link (GET, a mail scanner) consumes nothing
    const b = await body(req);
    const t = typeof b?.token === "string" && /^[0-9a-f]{48}$/.test(b.token) ? b.token : "";
    const fk = `linkfail/${day(now)}/${(await sha("ip|" + (req.headers.get("cf-connecting-ip") ?? "local"))).slice(0, 16)}`;
    const fails = Number((await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(fk).first<{ v: string }>())?.v ?? 0);
    if (fails >= 20) return json({ error: "Too many tries from this network. Please use the 6-digit code, or try again tomorrow." }, 429);
    const bad = async () => { await env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=?").bind(fk, String(fails + 1), String(fails + 1)).run(); return json({ error: "This sign-in link is not valid any more. Please ask for a new one from the sign-in page." }, 400); };
    if (!t) return bad();
    const lh = await sha("link|" + t);
    const row = await env.DB.prepare("SELECT email_hash, expires_ms FROM login_code WHERE link_hash=?").bind(lh).first<{ email_hash: string; expires_ms: number }>();
    if (!row || row.expires_ms < now) return bad();
    const acct = await env.DB.prepare("SELECT org FROM organizer_email WHERE email_hash=?").bind(row.email_hash).first<{ org: string }>();
    if (!acct || !(await spend(env, now, 2))) return acct ? BUSY() : bad();
    const used = await env.DB.prepare("DELETE FROM login_code WHERE link_hash=? AND expires_ms>=?").bind(lh, now).run(); // single use: the first POST wins, the code dies with it
    if ((used.meta?.changes ?? 0) !== 1) return bad();
    await recordTerms(env, acct.org, now, "signin-link");
    await linkVisitor(env as VisitEnv, req, acct.org, "signin", now);
    const token = "ctk_" + randHex(24); // the same kind of session key the 6-digit code creates
    await env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms,is_test) VALUES(?,?,?,0,?,COALESCE((SELECT MAX(k2.is_test) FROM organizer_key k2 WHERE k2.org=?),0))").bind(await sha("key|" + token), acct.org, "master", now, acct.org).run();
    return json({ ok: true, token });
  }
  if (req.method === "POST" && p === "/api/auth/verify") {
    const b = await body(req);
    const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
    const code = typeof b?.code === "string" ? b.code.replace(/\D/g, "") : "";
    if (!email || code.length !== 6) return json({ error: "Enter the 6-digit code." }, 400);
    const eh = await sha("email|" + email);
    const row = await env.DB.prepare("SELECT code_hash, expires_ms, attempts FROM login_code WHERE email_hash=?").bind(eh).first<{ code_hash: string; expires_ms: number; attempts: number }>();
    const bad = () => json({ error: "That code is not right or has expired. Please ask for a new one." }, 400);
    if (!row || row.expires_ms < now || row.attempts >= 5) return bad();
    if (row.code_hash !== (await sha("code|" + eh + "|" + code))) { await env.DB.prepare("UPDATE login_code SET attempts=attempts+1 WHERE email_hash=?").bind(eh).run(); return bad(); }
    const acct = await env.DB.prepare("SELECT org FROM organizer_email WHERE email_hash=?").bind(eh).first<{ org: string }>();
    if (!acct || !(await spend(env, now, 2))) return acct ? BUSY() : bad();
    await recordTerms(env, acct.org, now, "signin-code");
    await linkVisitor(env as VisitEnv, req, acct.org, "signin", now, email);
    const token = "ctk_" + randHex(24); // a fresh organizer key; the old ones keep working until the organizer retires them
    await env.DB.batch([
      env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms,is_test) VALUES(?,?,?,0,?,COALESCE((SELECT MAX(k2.is_test) FROM organizer_key k2 WHERE k2.org=?),0))").bind(await sha("key|" + token), acct.org, "master", now, acct.org),
      env.DB.prepare("DELETE FROM login_code WHERE email_hash=?").bind(eh),
    ]);
    return json({ ok: true, token });
  }

  /* ---- organizers and their keys ---- */
  if (req.method === "POST" && p === "/api/org") { // platform: a new organizer (called after payment / sign-up); the key is shown once
    if (!a.plat) return deny(a);
    if (!(await spend(env, now))) return BUSY();
    const org = randHex(8), key = "ctk_" + randHex(24);
    await env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms,is_test) VALUES(?,?,?,0,?,?)").bind(await sha("key|" + key), org, "master", now, await testFlag(env)).run();
    return json({ ok: true, organizerKey: key });
  }
  if (req.method === "POST" && (p === "/api/org/ai" || p === "/api/org/ai/replace")) { // signed-in organizer only (an AI key can never mint or replace its own link); the old AI link dies at once
    if (a.kind !== "master" || !a.org) return deny(a);
    if (!(await spend(env, now, 3))) return BUSY();
    const r = await replaceAiLink(env, req, a.org, now);
    const presented = req.headers.get("x-organizer") || (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    await auditAi(env.DB, a.org, new Request(new URL(req.url).origin + "/api/org/ai/replace", { method: "POST", headers: req.headers }), (await sha("key|" + presented)).slice(0, 10), 200, now);
    return json({ ok: true, ...r });
  }
  if (req.method === "GET" && p === "/api/org/ai/link") { // the signed-in organizer reads their lasting AI link again (the page "Show my AI work link"); never an AI key, never in a mail
    if (a.kind !== "master" || !a.org) return deny(a);
    const sealed = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`aikey/${a.org}`).first<{ v: string }>();
    const key = await openText(env as any, sealed?.v);
    const live = key ? await env.DB.prepare("SELECT 1 AS x FROM organizer_key WHERE hash=? AND revoked=0").bind(await sha("key|" + key)).first() : null;
    return json({ ok: true, aiMessage: key && live ? aiMessage((env as PayEnv).PUBLIC_ORIGIN ?? new URL(req.url).origin, key) : null });
  }
  if (req.method === "POST" && p === "/api/org/ai/fresh") { // "Get a fresh AI link": a new 24-hour key, e-mailed to the organizer; the lasting key and other links are untouched
    if (a.kind !== "master" || !a.org) return deny(a);
    const live = (await env.DB.prepare("SELECT COUNT(*) AS c FROM organizer_key WHERE org=? AND kind='ai' AND revoked=0 AND expires_ms>?").bind(a.org, now).first<{ c: number }>())?.c ?? 0;
    if (live >= 5) return json({ error: "You already asked for several fresh links today. Use the latest e-mail, or press Replace my AI link." }, 429);
    if (!(await spend(env, now, 3))) return BUSY();
    return json({ ok: true, ...(await mailTempLink(env, req, a.org, "ai", "fresh", now)) });
  }
  if (req.method === "GET" && p === "/api/org/keys") { // the organizer sees their own sign-in keys (never the keys themselves) and can retire old ones
    if (a.kind !== "master" || !a.org) return deny(a);
    const me = await sha("key|" + (req.headers.get("x-organizer") || (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")));
    const r = await env.DB.prepare("SELECT hash, kind, revoked, created_ms FROM organizer_key WHERE org=? ORDER BY created_ms DESC").bind(a.org).all<any>();
    return json({ keys: (r.results ?? []).map((k: any) => ({ id: k.hash.slice(0, 10), kind: k.kind, revoked: !!k.revoked, created_ms: k.created_ms, thisOne: k.hash === me })) });
  }
  if (req.method === "POST" && p === "/api/org/keys/revoke") {
    if (a.kind !== "master" || !a.org) return deny(a);
    const b = await body(req);
    const id = typeof b?.id === "string" && /^[0-9a-f]{10}$/.test(b.id) ? b.id : "";
    if (!id) return json({ error: "Pick a key from the list." }, 400);
    const me = await sha("key|" + (req.headers.get("x-organizer") || (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")));
    if (me.startsWith(id)) return json({ error: "That is the key you are using right now. Sign in with another key first." }, 409);
    if (!(await spend(env, now))) return BUSY();
    const r = await env.DB.prepare("UPDATE organizer_key SET revoked=1 WHERE org=? AND substr(hash,1,10)=? AND revoked=0").bind(a.org, id).run();
    return json({ ok: true, revoked: r.meta?.changes ?? 0 });
  }
  if (req.method === "GET" && p === "/api/whoami") return a.kind ? json({ kind: a.kind }) : deny(a); // the console uses this to show the right screen
  if (req.method === "POST" && p === "/api/org/host") { // the organizer (or their AI) invites a co-host: a key that can watch, send messages to everyone and tick prizes, and nothing else
    if ((a.kind !== "master" && a.kind !== "ai") || !a.org) return deny(a);
    const n = (await env.DB.prepare("SELECT COUNT(*) AS c FROM organizer_key WHERE org=? AND kind='host' AND revoked=0 AND expires_ms IS NULL").bind(a.org).first<{ c: number }>())?.c ?? 0;
    if (n >= MAX_HOSTS) return json({ error: `You can have up to ${MAX_HOSTS} co-hosts at a time. Retire one first.` }, 409);
    if (!(await spend(env, now, 2))) return BUSY();
    const key = "cth_" + randHex(24);
    await env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms,is_test) VALUES(?,?,?,0,?,COALESCE((SELECT MAX(k2.is_test) FROM organizer_key k2 WHERE k2.org=?),0))").bind(await sha("key|" + key), a.org, "host", now, a.org).run();
    const hOrigin = (env as PayEnv).PUBLIC_ORIGIN ?? new URL(req.url).origin;
    const hm = await mailTempLink(env, req, a.org, "host", "start", now); // dedicated mail to the organizer only, with a separate 24-hour co-host key
    return json({ ok: true, hostKey: key, manualUrl: `${hOrigin}/ai/${key}`, mailed: hm.mailed });
  }
  if (req.method === "GET" && p === "/api/org/ai/audit") { // the organizer sees every call their external AI made; we can see all (the AI may read its own trail)
    if (a.kind !== "master" && a.kind !== "ai" && !a.plat) return deny(a);
    return listAiAudit(env.DB, a.plat ? null : a.org, json);
  }
  { // OWNER ONLY (platform key, never through an AI work link): the internal audit log. No organizer, co-host, participant or AI route reads it. Every use is written to the access log.
    const om = p.match(/^\/api\/owner\/audit\/(access|(sys|org:[0-9a-f]{16}|[A-Za-z0-9_-]{4,40}))(?:\/(verify|analyze|hold))?$/);
    if (om) {
      const what = om[1] === "access" ? "access" : om[3] ?? "download", chain = om[2] ?? "", ownerOk = a.plat && req.headers.get("x-ct-link") !== "1";
      if (!ownerOk) { await logAccess(env.DB, now, "denied:" + what, chain || null, null, 0, false, a.kind ?? "anonymous"); return json({ error: "Not found" }, 404); }
      const aenv = env as AuditEnv;
      if (what === "access") { const r = await env.DB.prepare("SELECT at_ms, action, eid, fmt, row_count, ok, note FROM audit_access ORDER BY id DESC LIMIT 500").all<any>(); await logAccess(env.DB, now, "read-access-log", null, null, (r.results ?? []).length); return json({ access: r.results ?? [] }); }
      if (what === "verify" && req.method === "GET") { const v = await verifyChain(env.DB, chain); await logAccess(env.DB, now, "verify", chain, null, v.rows, v.ok); return json(v); }
      if (what === "analyze" && req.method === "POST") { const out = await analyzeChain(aenv, chain); await logAccess(env.DB, now, "analyze", chain, out.summarizedBy, out.aggregate.rows); return json(out); }
      if (what === "hold" && req.method === "POST") { const b = await body(req); await setHold(env.DB, chain, b?.on === true, now, typeof b?.note === "string" ? b.note : null); await logAccess(env.DB, now, b?.on === true ? "hold-on" : "hold-off", chain, null, 0); return json({ ok: true, held: b?.on === true }); }
      if (what === "download" && req.method === "GET") {
        const fmt = url.searchParams.get("format") === "csv" ? "csv" : "json", limit = Math.min(5000, Math.max(1, Number(url.searchParams.get("limit")) || 5000)), offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
        const rows = await loadRows(aenv, chain, limit, offset);
        await logAccess(env.DB, now, "download", chain, fmt, rows.length);
        return fmt === "csv" ? new Response(toCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "content-disposition": `attachment; filename="audit-${chain.replace(/[^A-Za-z0-9_-]/g, "_")}.csv"` } }) : json({ chain, rows });
      }
      return json({ error: "Not found" }, 404);
    }
  }
  if (req.method === "POST" && p === "/api/org/close") { // "Close my organizer account": only the organizer's own sign-in key, never an AI key. Deletes the account and every engagement; payment and invoice records stay because the law requires them.
    if (a.kind !== "master" || !a.org) return deny(a);
    const b = await body(req);
    if (b?.confirm !== true) return json({ error: "Please confirm in your console." }, 400);
    const engs = (await env.DB.prepare("SELECT * FROM engagement WHERE org=?").bind(a.org).all<any>()).results ?? [];
    for (const g of engs) if (now >= roundMs(g.start_round) && now < (await endBoundMs(env as any, g))) return json({ error: "A game is running. Close the account after it ends." }, 409);
    if (!(await spend(env, now, 8 + engs.length * 4))) return BUSY();
    for (const g of engs) await eraseEverything(env as any, g.id);
    const keys = (await env.DB.prepare("SELECT hash FROM organizer_key WHERE org=?").bind(a.org).all<{ hash: string }>()).results ?? [];
    for (const k of keys) await env.DB.prepare("DELETE FROM kv WHERE k=? OR k=?").bind(`seen/${k.hash.slice(0, 10)}`, `alert/${k.hash.slice(0, 10)}`).run();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM kv WHERE k=? OR k=?").bind(`orgmail/${a.org}`, `aikey/${a.org}`), env.DB.prepare("DELETE FROM organizer_email WHERE org=?").bind(a.org),
      env.DB.prepare("DELETE FROM organizer_terms WHERE org=?").bind(a.org), env.DB.prepare("DELETE FROM ai_audit WHERE org=?").bind(a.org), env.DB.prepare("DELETE FROM audit_log WHERE chain=?").bind("org:" + a.org), env.DB.prepare("DELETE FROM organizer_key WHERE org=?").bind(a.org),
    ]);
    return json({ ok: true, closed: true, engagementsDeleted: engs.length });
  }
  if (req.method === "POST" && p === "/api/org/ai/revoke") {
    if (a.kind !== "master" || !a.org) return deny(a);
    if (!(await spend(env, now))) return BUSY();
    const r = await env.DB.prepare("UPDATE organizer_key SET revoked=1 WHERE org=? AND kind='ai' AND revoked=0").bind(a.org).run();
    await env.DB.prepare("DELETE FROM kv WHERE k=?").bind(`aikey/${a.org}`).run();
    return json({ ok: true, revoked: r.meta?.changes ?? 0 });
  }

  /* ---- signed pause / resume / extend / stop: the signature is the authorisation, the Worker just stores and serves one small file ---- */
  const cm = p.match(/^\/api\/z\/([A-Za-z0-9_-]{3,40})\/control(\/key|\/request|\/request\/clear)?$/);
  if (cm) {
    const [, cid, sub] = cm;
    const kv = d1kv(env);
    if (!sub && req.method === "GET") {
      const f = await readPublished(kv, cid!);
      const ge = await env.DB.prepare("SELECT id, pack, start_round FROM engagement WHERE id=?").bind(cid).first<{ id: string; pack: number | null; start_round: number }>();
      if (ge && ge.pack === 0 && roundMs(ge.start_round) - LOCK_LEAD_MS <= now && (await isPublished(env, ge))) // published, unpaid, start time reached: phones hold, nothing is shown
        return new Response(JSON.stringify({ ...(f ?? {}), locked: true }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=3" } });
      if (f) { // the organizer's latest message rides along with the pause file phones already ask for, so it costs no extra requests
        const an = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`ann/${cid}`).first<{ v: string }>();
        if (an) { const x = JSON.parse(an.v); return new Response(JSON.stringify({ ...f, ann: { id: x.id, text: x.text } }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=3" } }); }
      }
      return f ? new Response(JSON.stringify(f), { headers: { "content-type": "application/json", "cache-control": "public, max-age=3" } }) : json({ registered: false }, 404);
    }
    if (!sub && req.method === "POST") {
      const b = await body(req);
      if (!b) return json({ error: "Bad message." }, 400);
      if (!(await spend(env, now))) return BUSY();
      const r = await publishControl(kv, cid!, b.message);
      if (r.ok && !(r as any).duplicate) await mirrorControl(env, cid!);
      return r.ok ? json(r) : json({ error: r.error }, r.status);
    }
    const ce = await env.DB.prepare("SELECT id, org, cap FROM engagement WHERE id=?").bind(cid).first<{ id: string; org: string | null; cap: number }>();
    if (!ce) return json({ error: "No such engagement." }, 404);
    if (sub === "/key" && req.method === "PUT") { // only the organizer's own console registers the key that signs pauses
      if (!can(a, ce, true)) return deny(a);
      const b = await body(req);
      if (!b || typeof b.publicKey !== "string") return json({ error: "Bad key." }, 400);
      if (!(await spend(env, now))) return BUSY();
      const safety = safetyForCap(ce.cap, b.profile === "fast");
      if (!safety) return json({ error: `Pause is available for engagements of up to ${PAUSE_MAX_PARTICIPANTS.toLocaleString("en-IN")} participants. Larger ones run without it, which keeps every phone's traffic off the free plan's daily allowance.` }, 409);
      const r = await registerKey(kv, cid!, b.publicKey, safety);
      if (r.ok) await mirrorControl(env, cid!);
      return r.ok ? json({ ok: true }) : json({ error: r.error }, 409);
    }
    if (sub === "/request" && req.method === "POST") { // the AI (or organizer) asks; the organizer's browser approves by signing
      if (!can(a, ce)) return deny(a);
      const b = await body(req);
      if (!b || !["pause", "resume", "stop", "erase"].includes(b.action)) return json({ error: "Ask for pause, resume, stop or erase." }, 400);
      if (!(await spend(env, now))) return BUSY();
      if (b.action === "erase") { // the AI may ASK to delete all participant data; only the organizer's own confirmation in their console does it
        await nudge(env, cid!, `delreq-${day(now)}`, now, `Your AI assistant asked to delete all participant data: engagement ${cid}`, `Your AI assistant asked to delete all participant data for ${cid}. Nothing is deleted yet.\n\nTo confirm, press Confirm in your console: ${(env as PayEnv).PUBLIC_ORIGIN ?? ""}/zc.html?e=${cid}\n\nNot you? Press Dismiss.`);
        await env.DB.prepare("INSERT INTO ctl_request(eid,action,note,at_ms,open) VALUES(?,?,?,?,1)").bind(cid, "erase", typeof b.note === "string" ? b.note.replace(/[<>`]/g, "").slice(0, 200) : null, now).run();
        return json({ ok: true, message: "Nothing has been deleted yet. The organizer has been asked and must confirm in their console (we also e-mailed them). Tell them to open the console and press Confirm." });
      }
      await env.DB.prepare("INSERT INTO ctl_request(eid,action,note,at_ms,open) VALUES(?,?,?,?,1)").bind(cid, b.action, typeof b.note === "string" ? b.note.replace(/[<>`]/g, "").slice(0, 200) : null, now).run();
      return json({ ok: true, message: "The organizer has been asked and must approve it in their console." });
    }
    if (sub === "/request" && req.method === "GET") {
      if (!can(a, ce)) return deny(a);
      const r = await env.DB.prepare("SELECT id, action, note, at_ms FROM ctl_request WHERE eid=? AND open=1 ORDER BY id").bind(cid).all<any>();
      return json({ requests: r.results ?? [] });
    }
    if (sub === "/request/clear" && req.method === "POST") {
      if (!can(a, ce, true)) return deny(a);
      await env.DB.prepare("UPDATE ctl_request SET open=0 WHERE eid=?").bind(cid).run();
      return json({ ok: true });
    }
    return json({ error: "Not found" }, 404);
  }

  /* ---- suggestions: one shared board for every organizer's AI; we (platform) decide what to build ---- */
  if (p === "/api/z/suggestions" || /^\/api\/z\/suggestions\/\d{1,9}\/(vote|status)$/.test(p)) {
    const KINDS = ["feature", "improvement", "report", "bug", "other"], STATUSES = ["new", "under_review", "planned", "shipped", "declined"];
    if (!a.plat && !a.org) return deny(a);
    if (req.method === "GET" && p === "/api/z/suggestions") {
      const st = url.searchParams.get("status");
      const q = st && STATUSES.includes(st) ? env.DB.prepare("SELECT id, kind, title, body, status, note, votes, created_ms, org FROM suggestion WHERE status=? ORDER BY votes DESC, id DESC LIMIT 200").bind(st) : env.DB.prepare("SELECT id, kind, title, body, status, note, votes, created_ms, org FROM suggestion ORDER BY votes DESC, id DESC LIMIT 200");
      const rows = (await q.all<any>()).results ?? [];
      const mine = a.org ? new Set(((await env.DB.prepare("SELECT sid FROM suggestion_vote WHERE org=?").bind(a.org).all<any>()).results ?? []).map((r: any) => r.sid)) : new Set();
      return json({ suggestions: rows.map((r: any) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, status: r.status, note: r.note, votes: r.votes, created_ms: r.created_ms, yours: !!a.org && r.org === a.org, youSupported: mine.has(r.id), ...(a.plat ? { org: r.org } : {}) })) }); // authors are never shown to other organizers
    }
    if (req.method === "POST" && p === "/api/z/suggestions") {
      if (!a.org) return deny(a); // platform has its own tools; this is for organizers and their AI
      const b = await body(req, 8192);
      const title = typeof b?.title === "string" ? b.title.replace(/[<>`]/g, "").trim() : "";
      const text = typeof b?.body === "string" ? b.body.replace(/[<>`]/g, "").trim() : "";
      if (!b || !KINDS.includes(b.kind) || title.length < 4 || title.length > 120 || text.length < 10 || text.length > 2000) return json({ error: "Give a kind (feature, improvement, report, bug or other), a short title (4 to 120 characters) and a description (10 to 2000 characters)." }, 400);
      if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(title + " " + text) || /(?:\d[\s-]?){10,}/.test(title + " " + text)) return json({ error: "Please do not include e-mail addresses or phone numbers, or anything about specific people. Describe the need in general terms." }, 400);
      const today = (await env.DB.prepare("SELECT COUNT(*) AS c FROM suggestion WHERE org=? AND created_ms>?").bind(a.org, now - 86_400_000).first<{ c: number }>())?.c ?? 0;
      if (today >= 20) return json({ error: "That is plenty for today. Please try again tomorrow." }, 429);
      const th = await sha("title|" + title.toLowerCase().replace(/\s+/g, " "));
      const dup = await env.DB.prepare("SELECT id FROM suggestion WHERE org=? AND title_hash=?").bind(a.org, th).first<{ id: number }>();
      if (dup) return json({ ok: true, id: dup.id, duplicate: true });
      if (!(await spend(env, now, 2))) return BUSY();
      const r = await env.DB.prepare("INSERT INTO suggestion(org,kind,title,body,status,votes,created_ms,title_hash) VALUES(?,?,?,?, 'new', 1, ?, ?)").bind(a.org, b.kind, title, text, now, th).run();
      const id = (await env.DB.prepare("SELECT id FROM suggestion WHERE org=? AND title_hash=?").bind(a.org, th).first<{ id: number }>())!.id;
      await env.DB.prepare("INSERT OR IGNORE INTO suggestion_vote(sid,org) VALUES(?,?)").bind(id, a.org).run();
      return json({ ok: true, id, stored: r.meta?.changes ?? 0 });
    }
    const sm = p.match(/^\/api\/z\/suggestions\/(\d+)\/(vote|status)$/);
    if (sm && req.method === "POST") {
      const sid = Number(sm[1]);
      const row = await env.DB.prepare("SELECT id FROM suggestion WHERE id=?").bind(sid).first();
      if (!row) return json({ error: "No such suggestion." }, 404);
      if (sm[2] === "vote") {
        if (!a.org) return deny(a);
        if (!(await spend(env, now, 2))) return BUSY();
        const r = await env.DB.prepare("INSERT OR IGNORE INTO suggestion_vote(sid,org) VALUES(?,?)").bind(sid, a.org).run();
        if (r.meta?.changes) await env.DB.prepare("UPDATE suggestion SET votes=votes+1 WHERE id=?").bind(sid).run();
        return json({ ok: true, counted: !!r.meta?.changes });
      }
      if (!a.plat) return deny(a); // only we decide status
      const b = await body(req);
      if (!b || !STATUSES.includes(b.status)) return json({ error: "Pick a status." }, 400);
      await env.DB.prepare("UPDATE suggestion SET status=?, note=? WHERE id=?").bind(b.status, typeof b.note === "string" ? b.note.replace(/[<>`]/g, "").slice(0, 300) : null, sid).run();
      return json({ ok: true });
    }
    return json({ error: "Not found" }, 404);
  }

  /* ---- engagements ---- */
  if (req.method === "POST" && p === "/api/z") {
    if (!a.plat && !a.org) return deny(a);
    if (a.kind === "host") return deny(a);
    const b = await body(req);
    if (!b || !ID.test(b.id ?? "") || !Number.isInteger(b.startRound) || !Number.isInteger(b.callSeconds) || b.callSeconds % 3 || b.callSeconds < 6 || !Number.isInteger(b.cap) || b.cap < 1 || b.cap > 100000)
      return json({ error: "Check the engagement details." }, 400);
    const vc = validateCfg({ tickets: b.tickets, rewards: b.rewards, breaks: b.breaks, rounds: b.rounds, opening: b.opening, closing: b.closing, name: b.name });
    if (!vc.ok) return json({ error: vc.error }, 400);
    const have = await env.DB.prepare("SELECT org FROM engagement WHERE id=?").bind(b.id).first<{ org: string | null }>();
    if (have) return json({ ok: true, existed: true }); // creating twice never overwrites (and never reveals whose it is)
    // an organizer needs a purchased engagement (entitlement) big enough for the limit they ask for; we (platform) do not
    const ent = a.plat ? null : await env.DB.prepare("SELECT id, pack FROM entitlement WHERE org=? AND eid IS NULL AND pack>=? ORDER BY pack, created_ms LIMIT 1").bind(a.org, b.cap).first<{ id: string; pack: number }>();
    // no payment is needed to BUILD an engagement: without a purchased pack it is saved as a draft (pack 0) that participants cannot see or join;
    // payment is asked only when the organizer publishes it (POST /api/z/:id/publish)
    const draft = !a.plat && !ent;
    if (draft) {
      const n = (await env.DB.prepare("SELECT COUNT(*) AS c FROM engagement WHERE org=? AND pack=0").bind(a.org).first<{ c: number }>())?.c ?? 0;
      if (n >= MAX_DRAFTS) return json({ error: `You have ${MAX_DRAFTS} unpublished drafts. Publish one, or let one lapse: an unpublished draft is forgotten after ${DRAFT_DAYS} days, and closing your organizer account deletes them all.` }, 409);
    }
    if (!(await spend(env, now, 2))) return BUSY();
    const isTestEng = (await testFlag(env)) === 1 || (await orgIsTest(env, a.org)) ? 1 : 0; // made in TEST mode, or by a test account
    await env.DB.prepare("INSERT OR IGNORE INTO engagement(id,start_round,call_seconds,cap,created_ms,org,closed,pack,tickets,config,is_test) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(b.id, b.startRound, b.callSeconds, b.cap, now, a.org, b.closed ? 1 : 0, draft ? 0 : ent?.pack ?? b.cap, vc.cfg.tickets, cfgJson(vc.cfg), isTestEng).run();
    if (ent) await env.DB.prepare("UPDATE entitlement SET eid=? WHERE id=? AND eid IS NULL").bind(b.id, ent.id).run();
    if (a.org) await recordTerms(env, a.org, now, "engagement");
    return json({ ok: true, draft, openUrl: `${(env as PayEnv).PUBLIC_ORIGIN ?? ""}/zc.html?e=${b.id}` });
  }
  if (req.method === "GET" && p === "/api/history") {
    if (!a.plat && !a.org) return deny(a);
    const q = a.plat
      ? env.DB.prepare("SELECT e.id, e.created_ms, e.start_round, e.call_seconds, e.closed, (e.pack=0) AS draft, (SELECT COUNT(*) FROM participant p WHERE p.eid=e.id) AS participants FROM engagement e WHERE e.is_test=? ORDER BY e.created_ms DESC LIMIT 50").bind(url.searchParams.get("mode") === "test" ? 1 : 0) // the owner's list shows real engagements unless the test ones are asked for
      : env.DB.prepare("SELECT e.id, e.created_ms, e.start_round, e.call_seconds, e.closed, (e.pack=0) AS draft, (SELECT COUNT(*) FROM participant p WHERE p.eid=e.id) AS participants FROM engagement e WHERE e.org=? ORDER BY e.created_ms DESC LIMIT 50").bind(a.org);
    const r = await q.all<any>();
    return json({ engagements: (r.results ?? []).map((x: any) => ({ ...x, startsAtIST: istTime(roundMs(x.start_round)) })), retentionDays: RETENTION_DAYS });
  }
  if (req.method === "POST" && p === "/api/inbound-email") { // the mail service forwards e-mail sent to our address; a deletion request counts only from the organizer's registered address
    if (!(env.INBOUND_SECRET ?? "").trim() || (req.headers.get("x-inbound-secret") ?? "").trim() !== (env.INBOUND_SECRET ?? "").trim()) return deny(a);
    const b = await body(req, 200_000);
    const from = String(b?.from ?? "").toLowerCase().match(/[^\s<>"',;]+@[^\s<>"',;]+/)?.[0];
    const text = `${b?.subject ?? ""}\n${b?.text ?? ""}`;
    if (!from || !/\bdelete\b|\berase\b/i.test(text)) return json({ ok: true, action: "none" });
    // The sender field of an e-mail can be forged, so it is never enough: the first mail only makes us send a 6-digit code to the registered address; the deletion happens when a reply carrying that code arrives.
    const done: string[] = [], asked: string[] = [];
    const codes = [...new Set(text.match(/\b\d{6}\b/g) ?? [])].slice(0, 5);
    for (const tok of [...new Set(text.match(/[A-Za-z0-9_-]{4,40}/g) ?? [])].slice(0, 80)) {
      const c = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`contact/${tok}`).first<{ v: string }>();
      if (!c || String(JSON.parse(c.v).email ?? "").toLowerCase() !== from) continue;
      const registered = String(JSON.parse(c.v).email);
      const pend = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`delreq/${tok}`).first<{ v: string }>();
      const pv = pend ? JSON.parse(pend.v) : null;
      let confirmed = false;
      if (pv && pv.x > now) for (const cd of codes) if ((await sha(`delcode|${tok}|${cd}`)) === pv.c) confirmed = true;
      if (confirmed) { await erasePersonal(env, tok, now, "email"); await env.DB.prepare("DELETE FROM kv WHERE k=?").bind(`delreq/${tok}`).run(); done.push(tok); continue; }
      if (pv && pv.x > now && now - pv.t < 300_000) continue; // a code was sent a moment ago: do not send another
      const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000));
      await env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(`delreq/${tok}`, JSON.stringify({ c: await sha(`delcode|${tok}|${code}`), x: now + 1_800_000, t: now })).run();
      await sendMail(env as PayEnv, env.DB, registered, `Confirm the deletion of participant data: ${tok}`, `We got a request to delete all participant data for ${tok}. Nothing is deleted yet.\n\nTo confirm, reply to the e-mail you sent with this code: ${code}\n\nIt works for 30 minutes. Not you? Ignore this e-mail.`, now);
      asked.push(tok);
    }
    if (done.length) await sendMail(env as PayEnv, env.DB, from, `Deleted: participant data of ${done.join(", ")}`, `Done. We deleted all participant data for: ${done.join(", ")}.\n\nWe keep the winners record (seat, prize, round, time) and winners' prize hand-over details for up to 365 days. We also keep your organizer details.`, now);
    return json({ ok: true, action: done.length ? "deleted" : asked.length ? "confirm-sent" : "no-match", engagements: done });
  }
  if (req.method === "GET" && p === "/api/notices") { // our public news list: the same for everyone, nothing about the reader is stored or asked
    const raw = (await env.DB.prepare("SELECT v FROM kv WHERE k='notices'").first<{ v: string }>())?.v ?? "[]";
    return new Response(JSON.stringify({ notices: (JSON.parse(raw) as any[]).filter((n) => now - (n.at ?? 0) < 30 * 86_400_000).slice(-10) }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
  }
  if (req.method === "POST" && p === "/api/notices") { // only we can publish news (platform key): up to 10 current items, each shown once per device
    if (!a.plat) return deny(a);
    const b = await body(req, 8192);
    const items = Array.isArray(b?.notices) ? b.notices : null;
    if (!items || items.length > 10 || items.some((n: any) => typeof n?.id !== "string" || !/^[A-Za-z0-9_-]{2,40}$/.test(n.id) || typeof n.title !== "string" || n.title.length < 1 || n.title.length > 80 || typeof n.body !== "string" || n.body.length > 200 || (n.url !== undefined && !(typeof n.url === "string" && /^\/[^\s]*$/.test(n.url)))))
      return json({ error: "Send up to 10 notices: {id, title (max 80), body (max 200), url (a path on this site, optional)}." }, 400);
    await env.DB.prepare("INSERT INTO kv(k,v) VALUES('notices',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify(items.map((n: any) => ({ id: n.id, title: n.title, body: n.body, ...(n.url ? { url: n.url } : {}), at: now })))).run();
    return json({ ok: true, count: items.length });
  }
  if (req.method === "POST" && p === "/api/lifecycle/tick") { // run every minute by the scheduled job: reports, deletions, reminders. Idempotent and bounded per call.
    const jobKey = req.headers.get("x-cron-key") ?? "";
    const jobSecret = (env.CRON_KEY ?? "").trim(); // a secret pasted in with a trailing line break still matches
    if (!a.plat && !(jobSecret.length >= 16 && jobKey.trim() === jobSecret)) return deny(a);
    return json({ ok: true, ...(await lifecycleTick(env as any, now)), purged: await purgeOld(env, now) });
  }
  if (req.method === "POST" && p === "/api/purge") { // run daily (Cron trigger) or by hand: removes everything older than the retention period
    if (!a.plat) return deny(a);
    return json({ ok: true, purged: await purgeOld(env, now) });
  }
  const m = p.match(/^\/api\/z\/([A-Za-z0-9_-]{4,40})\/(join|claims|settle|results|info|participants|erase|reuse|roster|settings|publish|summary|announce|unbind|seats|names|mark|won|over|invites|life|vote|confirm|prizes|prizegiven|myprizes|reportlink|person|forget)$/);
  if (!m) return json({ error: "Not found", hint: "Read the list of what you can do at /api/z/ai-manifest. Engagement routes look like /api/z/{id}/summary, /settings, /roster, /participants, /results, /publish." }, 404);
  const [, eid, action] = m;
  const e = await env.DB.prepare("SELECT * FROM engagement WHERE id=?").bind(eid).first<any>();
  if (!e) return json({ error: "No such engagement." }, 404);
  const digitsOf = (raw: unknown): string | null => { const d = String(raw ?? "").replace(/\D/g, ""); return d.length < 10 || d.length > 15 ? null : d; };
  const phoneHash = async (raw: unknown): Promise<string | null> => {
    const d = digitsOf(raw);
    if (!d) return null;
    return sha(`${env.PHONE_SALT ?? env.ORGANIZER_SECRET ?? "unset"}|${d.slice(-10)}`); // +91 98765 43210, 098765 43210 and 9876543210 are the same person; one hash in every engagement so a roster can be reused without storing the number
  };
  const pidOf = async (ph: string) => (await sha(`${eid}|${ph}`)).slice(0, 16);
  const lateNow = () => { const nr = roundOfMs(now); return nr > e.start_round + GRACE_ROUNDS ? nr : 0; }; // joined after the first number: that round, else 0
  /** Gives a person a seat (and so a collision-free ticket) and a sealed record of their name and number. Both rows go in together, with the head-count (and, for an invited person, the inviter's quota) checked inside the insert, so a crowd arriving at the same instant can never pass a limit or share a seat. */
  const addSeat = async (ph: string, pii: string, dev: string | null, jr: number, o: { inv?: number | null; cat?: string | null; src: string; invLimit?: number | null; joinedMs?: number }) => {
    const tail = (await pidOf(ph)).slice(0, 12);
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO seat(eid,seq,pid,ph,dev,jr,inv,cat,src) SELECT ?, s, s || 'x' || ?, ?, ?, ?, ?, ?, ? FROM (SELECT COALESCE(MAX(seq),0)+1 AS s FROM seat WHERE eid=?) WHERE (SELECT COUNT(*) FROM participant WHERE eid=?) < ? AND (? IS NULL OR (SELECT COUNT(*) FROM seat WHERE eid=? AND inv=?) < ?) AND (? IS NULL OR NOT EXISTS (SELECT 1 FROM seat WHERE eid=? AND dev=?))")
        .bind(eid, tail, ph, dev, jr, o.inv ?? null, o.cat ?? null, o.src, eid, eid, e.cap, o.invLimit ?? null, eid, o.inv ?? null, o.invLimit ?? 0, dev, eid, dev),
      env.DB.prepare("INSERT OR IGNORE INTO participant(eid,pid,phone_hash,name,pii,joined_ms) SELECT eid, pid, ph, NULL, ?, ? FROM seat WHERE eid=? AND ph=?").bind(pii, o.joinedMs ?? now, eid, ph),
    ]);
  };
  const cleanName = (n: unknown) => (typeof n === "string" ? n.replace(/[<>`]/g, "").slice(0, 60) : null);

  if (a.kind === "host" && !HOST_ACTIONS.has(action!)) return deny(a);
  const unpaid = e.pack === 0;
  const isDraft = unpaid && !(await isPublished(env, e));
  const locked = unpaid && !isDraft && roundMs(e.start_round) - LOCK_LEAD_MS <= now; // published but not paid by its start time: it does not begin
  if (isDraft && ((action === "join" && req.method === "POST") || (action === "info" && !can(a, e)))) return json({ error: "This engagement is not open yet." }, 403);
  if (locked && !can(a, e) && (action === "info" || action === "join")) await nudge(env, e.id, "lockmail", now, `Your engagement ${e.id} could not begin: payment is due`, `Your engagement ${e.id} could not begin: payment is due.\n\nPay now and it starts in about 3 minutes: ${(env as PayEnv).PUBLIC_ORIGIN ?? ""}/pay.html?e=${e.id}`);
  if (action === "join" && req.method === "POST") {
    const b = await body(req);
    const digits = digitsOf(b?.phone), ph = await phoneHash(b?.phone);
    if (!ph || !digits) return json({ error: "Enter a valid mobile number." }, 400);
    const dev = typeof b?.device === "string" && /^[0-9a-f]{16,64}$/.test(b.device) ? (await sha(`dev|${eid}|${b.device}`)).slice(0, 32) : null; // one ticket, one device: the phone's own random id, only its hash is kept
    const reply = (pid: string, extra: object = {}) => json({ pid, startRound: e.start_round, callSeconds: e.call_seconds, trackClaims: tracks(e), ...pub(e), ...extra });
    const lateRound = lateNow();
    const have = await env.DB.prepare("SELECT p.pid AS pid, s.dev AS dev, s.pid AS seat, s.jr AS jr FROM participant p LEFT JOIN seat s ON s.eid=p.eid AND s.pid=p.pid WHERE p.eid=? AND p.phone_hash=?").bind(eid, ph).first<{ pid: string; dev: string | null; seat: string | null; jr: number | null }>();
    if (have) {
      if (have.seat && have.dev && have.dev !== dev) return json({ error: "This ticket is already on another phone. A ticket plays on one device only. Ask your organizer if you need to move it.", code: "other-phone" }, 423);
      if (have.seat && !have.dev && dev && (await env.DB.prepare("SELECT 1 AS x FROM seat WHERE eid=? AND dev=?").bind(eid, dev).first())) return json({ error: "This phone already holds a ticket in this engagement. One phone, one ticket. Ask the person to open the link on their own phone.", code: "device-used" }, 409);
      if (have.seat && !have.dev && dev) { // first device to open the link of someone who was on the list (or whom the organizer let move) keeps the ticket
        if (!(await spend(env, now, 2))) return BUSY();
        await env.DB.batch([env.DB.prepare("UPDATE seat SET dev=? WHERE eid=? AND pid=? AND dev IS NULL").bind(dev, eid, have.pid), env.DB.prepare("UPDATE participant SET joined_ms=? WHERE eid=? AND pid=? AND joined_ms<?").bind(now, eid, have.pid, now)]);
        const nm = cleanName(b?.name);
        if (nm) { const old = await env.DB.prepare("SELECT pii FROM participant WHERE eid=? AND pid=?").bind(eid, have.pid).first<{ pii: string | null }>(); const o = await openPii(env, old?.pii); if (o && !o.name) await env.DB.prepare("UPDATE participant SET pii=? WHERE eid=? AND pid=?").bind(await sealPii(env, { phone: o.phone, name: nm }), eid, have.pid).run(); }
      }
      return reply(have.pid, { again: true, jr: have.jr ?? 0 }); // same number twice = same participant
    }
    if (e.closed) return json({ error: "This engagement is by invitation. Ask your organizer to add your number." }, 403);
    if (!dev) return json({ error: "Please refresh this page and try again." }, 400);
    if (await env.DB.prepare("SELECT 1 AS x FROM seat WHERE eid=? AND dev=?").bind(eid, dev).first()) return json({ error: "This phone already holds a ticket in this engagement. One phone, one ticket. Others can join from their own phones, using your invitation link if the organizer allowed it.", code: "device-used" }, 409);
    const n = await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>();
    if ((n?.c ?? 0) >= e.cap) return json({ error: "This engagement is full." }, 409);
    // invited through someone's link? Only when the organizer has switched invitations on, only for the kinds of guests they allowed, and only up to the inviter's quota (organizer, hosts and co-hosts: no quota)
    const inviteCfg = cfgOf(e).invites;
    let inv: number | null = null, cat: string | null = null, invLimit: number | null = null;
    if (inviteCfg?.on && Number.isInteger(b?.from) && b.from >= 1) {
      const inviter = await env.DB.prepare("SELECT seq, role FROM seat WHERE eid=? AND seq=?").bind(eid, b.from).first<{ seq: number; role: string | null }>();
      if (inviter) {
        inv = inviter.seq; cat = typeof b?.cat === "string" && inviteCfg.cats.includes(b.cat) ? b.cat : null;
        if (!inviter.role) {
          invLimit = inviteCfg.per;
          const used = (await env.DB.prepare("SELECT COUNT(*) AS c FROM seat WHERE eid=? AND inv=?").bind(eid, inv).first<{ c: number }>())?.c ?? 0;
          if (used >= inviteCfg.per) return json({ error: `This invitation has already been used by ${inviteCfg.per} people, which is the most one person can invite. Please ask your organizer for the main link.`, code: "invite-full" }, 409);
        }
      }
    }
    if (await joinOverLimit(env, req, now)) return json({ error: "It is busy right now. Please try again in a few minutes.", code: "busy" }, 429);
    if (!(await spend(env, now, 2))) return json({ error: "It is very busy right now. Please try again in a few minutes.", code: "busy" }, 503);
    await addSeat(ph, await sealPii(env, { phone: digits, name: cleanName(b?.name) }), dev, lateRound, { inv, cat, src: "link", invLimit });
    const row = await env.DB.prepare("SELECT p.pid AS pid, s.dev AS dev, s.jr AS jr FROM participant p LEFT JOIN seat s ON s.eid=p.eid AND s.pid=p.pid WHERE p.eid=? AND p.phone_hash=?").bind(eid, ph).first<{ pid: string; dev: string | null; jr: number | null }>();
    if (!row) return (await env.DB.prepare("SELECT 1 AS x FROM seat WHERE eid=? AND dev=?").bind(eid, dev).first()) ? json({ error: "This phone already holds a ticket in this engagement. One phone, one ticket.", code: "device-used" }, 409) : invLimit !== null ? json({ error: `This invitation has already been used by ${inviteCfg!.per} people, which is the most one person can invite. Please ask your organizer for the main link.`, code: "invite-full" }, 409) : json({ error: "This engagement is full." }, 409); // lost a race for the last place
    if (row.dev && row.dev !== dev) return json({ error: "This ticket is already on another phone. A ticket plays on one device only. Ask your organizer if you need to move it.", code: "other-phone" }, 423);
    return reply(row.pid, { jr: row.jr ?? 0 });
  }
  if (action === "seats" && req.method === "GET") {
    // Public: seat number, participant id and join round of everyone who joined (no names, no phone numbers). Every phone reads this to work out the winners itself.
    // The first answer after the game began is saved once as one stored text (so 10,000 phones read one row, not 10,000), and later joiners come as a small tail.
    if (isDraft) return json({ error: "This engagement is not open yet." }, 403);
    if (now < roundMs(e.start_round + GRACE_ROUNDS)) return json({ ready: false });
    const after = Math.max(0, Math.floor(Number(url.searchParams.get("after")) || 0));
    const key = `seats-base/${eid}`;
    let base = (await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(key).first<{ v: string }>())?.v ?? null;
    let n = base ? Number(base.slice(base.lastIndexOf('"upto":') + 7, -1)) : 0;
    if (!base) {
      const rows = (await env.DB.prepare("SELECT seq, pid, COALESCE(jr,0) AS jr FROM seat WHERE eid=? ORDER BY seq").bind(eid).all<{ seq: number; pid: string; jr: number }>()).results ?? [];
      n = rows.length ? rows[rows.length - 1]!.seq : 0;
      base = `{"ready":true,"seats":[${rows.map((r) => `[${r.seq},"${r.pid}",${r.jr}]`).join(",")}],"upto":${n}}`;
      if (await spend(env, now)) await env.DB.prepare("INSERT OR IGNORE INTO kv(k,v) VALUES(?,?)").bind(key, base).run();
    }
    if (after < n) return new Response(base, { headers: { "content-type": "application/json", "cache-control": "public, max-age=20" } }); // the saved text as it is: nothing to parse
    const rows = (await env.DB.prepare("SELECT seq, pid, COALESCE(jr,0) AS jr FROM seat WHERE eid=? AND seq>? ORDER BY seq LIMIT 2000").bind(eid, after).all<{ seq: number; pid: string; jr: number }>()).results ?? [];
    return json({ ready: true, seats: rows.map((r) => [r.seq, r.pid, r.jr]), upto: rows.length ? rows[rows.length - 1]!.seq : after });
  }
  if ((action === "person" || action === "forget") && req.method === "POST") { // a participant asks the organizer to see, or to delete, their own data: the organizer does it in the console (never an AI)
    if (!can(a, e, true)) return deny(a);
    const b = await body(req);
    const ph = await phoneHash(b?.phone);
    if (!ph) return json({ error: "Enter a valid mobile number." }, 400);
    const seat = await env.DB.prepare("SELECT seq, pid, role FROM seat WHERE eid=? AND ph=?").bind(eid, ph).first<{ seq: number; pid: string; role: string | null }>();
    if (!seat) return json({ error: "That number has not joined this engagement." }, 404);
    if (action === "person") {
      const row = await env.DB.prepare("SELECT pii FROM participant WHERE eid=? AND pid=?").bind(eid, seat.pid).first<{ pii: string | null }>();
      const who = await openPii(env as any, row?.pii);
      return json({ ok: true, seat: seat.seq, name: who?.name ?? "", role: seat.role ?? "" });
    }
    const running = now >= roundMs(e.start_round) && now < (await endBoundMs(env as any, e));
    if (running) return json({ error: "The game is running. Please delete this person after it ends." }, 409);
    if (!(await spend(env, now, 4))) return BUSY();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM participant WHERE eid=? AND pid=?").bind(eid, seat.pid), env.DB.prepare("DELETE FROM seat WHERE eid=? AND seq=?").bind(eid, seat.seq),
      env.DB.prepare("DELETE FROM claim WHERE eid=? AND pid=?").bind(eid, seat.pid),
      env.DB.prepare("UPDATE prize SET pii=NULL, orig=NULL, trail=NULL WHERE eid=? AND seat=?").bind(eid, seat.seq), // the prize record keeps no identity once the person asks
    ]);
    return json({ ok: true, deleted: true });
  }
  if (action === "unbind" && req.method === "POST") { // the organizer (or their AI) lets one person move their ticket to a new phone: the first device that comes back keeps it
    if (!canAi(a, e)) return deny(a);
    const b = await body(req);
    const seatNo = Number.isInteger(b?.seat) && b.seat > 0 ? (b.seat as number) : 0;
    if (a.kind === "ai" && !seatNo) return CONSOLE_ONLY(); // an AI names the ticket by its number, never by a mobile number
    const ph = seatNo ? "" : await phoneHash(b?.phone);
    if (!seatNo && !ph) return json({ error: "Enter a valid mobile number." }, 400);
    if (!(await spend(env, now))) return BUSY();
    const r = seatNo ? await env.DB.prepare("UPDATE seat SET dev=NULL WHERE eid=? AND seq=?").bind(eid, seatNo).run() : await env.DB.prepare("UPDATE seat SET dev=NULL WHERE eid=? AND ph=?").bind(eid, ph).run();
    return (r.meta?.changes ?? 0) > 0 ? json({ ok: true }) : json({ error: "That number has not joined this engagement." }, 404);
  }
  if (action === "claims" && req.method === "POST") {
    const b = await body(req);
    const list = Array.isArray(b?.claims) ? b.claims.slice(0, 7) : null;
    if (!b || typeof b.pid !== "string" || !list) return json({ error: "Bad claim." }, 400);
    const who = await env.DB.prepare("SELECT pid FROM participant WHERE eid=? AND pid=?").bind(eid, b.pid).first();
    if (!who) return json({ error: "Not a participant of this engagement." }, 403);
    if (!tracks(e)) return json({ ok: true, stored: 0, tracked: false }); // large engagement: winners are worked out from the public numbers, nothing is stored per claim
    let stored = 0;
    const maxRound = cfgOf(e).rounds;
    for (const c of list) {
      const round = c?.round === undefined ? 1 : c.round;
      if (!PATTERNS.has(c?.pattern) || !Number.isInteger(c?.idx) || c.idx < 0 || c.idx > 89 || !Number.isInteger(round) || round < 1 || round > maxRound) continue;
      if (!(await spend(env, now))) return json({ error: "Busy day. Your claim is kept on your phone and will be sent again.", stored }, 503);
      const r = await env.DB.prepare("INSERT OR IGNORE INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES(?,?,?,?,?,?)").bind(eid, b.pid, c.pattern, round, c.idx, now).run();
      stored += r.meta?.changes ?? 0; // a claim sent twice is stored once
    }
    return json({ ok: true, stored });
  }
  if (action === "results" && req.method === "GET") {
    const r = await env.DB.prepare("SELECT pattern,ordinal,round,idx,pids FROM settled WHERE eid=? ORDER BY round, pattern, ordinal").bind(eid).all<any>();
    // public: counts only, no ids. The one exception is a lucky draw, whose winners are shown by their opaque ticket ids so each phone can tell whether it won
    return json({ results: (r.results ?? []).map((x: any) => ({ pattern: x.pattern, ordinal: x.ordinal, round: x.round, idx: x.idx, count: JSON.parse(x.pids).length, ...(x.pattern === "lucky" ? { winners: JSON.parse(x.pids) } : {}) })) });
  }
  if (action === "info" && req.method === "GET") return json({ ...(isDraft ? { draft: true } : {}), ...(unpaid && !isDraft ? { ...(can(a, e) ? { unpaid: true } : {}), locked } : {}), startMs: roundMs(e.start_round), cap: e.cap, startRound: e.start_round, callSeconds: e.call_seconds, trackClaims: tracks(e), controlUrl: controlUrl(env, e.id), ...pub(e) });

  // everything below is for the organizer (or their AI, where allowed)
  if (action === "announce" && req.method === "POST") { // a message to every phone and the big screen. Organizer, their AI or a co-host; never a stranger
    if (!can(a, e)) return deny(a);
    if (isDraft) return json({ error: "Publish the engagement first. Nobody can see a draft." }, 400);
    const b = await body(req, 2_048);
    const text = typeof b?.text === "string" ? b.text.replace(/[<>`]/g, "").replace(/\s+/g, " ").trim().slice(0, 160) : null;
    if (text === null) return json({ error: "Write the message to send." }, 400);
    const last = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`ann/${eid}`).first<{ v: string }>();
    if (last && now - (JSON.parse(last.v).at ?? 0) < 5_000) return json({ error: "Please wait a few seconds before sending another message." }, 429);
    if (!(await spend(env, now))) return BUSY();
    if (!text) { await env.DB.prepare("DELETE FROM kv WHERE k=?").bind(`ann/${eid}`).run(); return json({ ok: true, cleared: true }); }
    const ann = { id: randHex(4), text, at: now };
    await env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(`ann/${eid}`, JSON.stringify(ann)).run();
    return json({ ok: true, sent: ann, reachesPhonesWithin: "about a minute, on engagements with pause available" });
  }
  if (action === "summary" && req.method === "GET") { // one read-back of everything saved, so the organizer's AI can confirm it with them
    if (!can(a, e)) return deny(a);
    const n = (await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>())?.c ?? 0;
    const c = cfgOf(e), origin = (env as PayEnv).PUBLIC_ORIGIN ?? new URL(req.url).origin;
    const links = { console: `${origin}/zc.html?e=${e.id}`, ...(isDraft ? { publishHandover: `${origin}/zc.html?e=${e.id}&do=publish` } : { guest: `${origin}/z.html?e=${e.id}`, bigScreen: `${origin}/big.html?e=${e.id}` }), ...(unpaid && !isDraft ? { pay: `${origin}/pay.html?e=${e.id}` } : {}), testBrandMoment: `${origin}/preview.html`, demo: `${origin}/demo.html` };
    const nextSteps = [
      { step: "Name the prizes", who: "the organizer, or the AI if told what each prize is", done: c.rewards.some((r) => r.text.length > 0) },
      { step: "Publish (free): the organizer confirms their e-mail and mobile and taps once", who: "the organizer", done: !isDraft, ...(isDraft ? { link: `${origin}/zc.html?e=${e.id}&do=publish` } : {}) },
      { step: "Pay before the start time", who: "the organizer only", done: !isDraft && !unpaid, ...(unpaid && !isDraft ? { link: links.pay, deadline: istTime(roundMs(e.start_round)) } : {}) },
      { step: "Share the guest link and load the guest list", who: "the organizer", done: n > 0 },
    ];
    return json({ id: e.id, status: isDraft ? "draft" : unpaid ? (locked ? "published, NOT PAID, held because the start time passed" : "published, payment due before the start") : "published and paid",
      startsAtIST: istTime(roundMs(e.start_round)), startMs: roundMs(e.start_round), startRound: e.start_round, callSeconds: e.call_seconds, limit: e.cap, closed: !!e.closed,
      tickets: c.tickets, rounds: c.rounds, rewards: c.rewards, breaks: c.breaks, opening: c.opening, closing: c.closing, invites: c.invites, brandMomentsAllowed: brandMomentsFor(c.tickets), participants: n, ...(c.name ? { name: c.name } : {}),
      paid: !unpaid, ...(unpaid ? { pack: PACKS.find((x) => x[0] >= e.cap)?.[0] ?? null, priceInrIncludingGst: PACKS.find((x) => x[0] >= e.cap) ? price(PACKS.find((x) => x[0] >= e.cap)![0], "INR").total : null, payBefore: istTime(roundMs(e.start_round)) } : { pack: e.pack }),
      gameMinutes: Math.round((90 * e.call_seconds * c.rounds + c.breaks.reduce((t: number, b: any) => t + b.seconds, 0) + (c.rounds - 1) * 90) / 60),
      links, nextSteps, consoleUrl: `${origin}/zc.html?e=${e.id}`, ...(isDraft ? {} : { shareUrl: `${origin}/z.html?e=${e.id}` }), ...(unpaid && !isDraft ? { payUrl: `${origin}/pay.html?e=${e.id}` } : {}) });
  }
  if (action === "publish" && req.method === "POST") { // free: the organizer confirms their details, shares the link, and pays before the start (or it will not begin)
    const origin = (env as PayEnv).PUBLIC_ORIGIN ?? new URL(req.url).origin;
    const payUrl = `${origin}/pay.html?e=${eid}`, shareUrl = `${origin}/z.html?e=${eid}`;
    if (a.kind === "ai" && can(a, e)) return json({ ok: true, published: !isDraft, needsOrganizer: isDraft, ...(isDraft ? { consoleUrl: `${origin}/zc.html?e=${eid}` } : { payUrl, shareUrl }), message: isDraft
      ? "Everything is ready. Please give this link to the organizer: they open it, confirm their email and mobile number and press Publish. Publishing is free. After that they must pay before the start time or the engagement will not begin. The organizer does both themself: the AI never publishes or pays."
      : unpaid ? "It is published. Payment is still due before the start time, otherwise the engagement will not begin. Give the organizer this link to pay: they do it themself." : "Already published and paid." });
    if (!can(a, e, true)) return deny(a);
    if (!isDraft) return json({ ok: true, published: true, already: true, paid: !unpaid, startMs: roundMs(e.start_round), payUrl, shareUrl });
    // the organizer confirms (and may correct) their email and mobile number
    const pb = await body(req);
    const cEmail = typeof pb?.email === "string" ? pb.email.trim() : "", cPhone = String(pb?.phone ?? "").replace(/\D/g, "");
    if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(cEmail)) return json({ error: "Please confirm a valid email address." }, 400);
    if (cPhone.length < 10 || cPhone.length > 15) return json({ error: "Please confirm a valid mobile number." }, 400);
    if (roundMs(e.start_round) <= now) return json({ error: "The start time has passed. Please choose a new start time first." }, 400);
    const ent = await env.DB.prepare("SELECT id, pack FROM entitlement WHERE org=? AND eid IS NULL AND pack>=? ORDER BY pack, created_ms LIMIT 1").bind(e.org, e.cap).first<{ id: string; pack: number }>();
    const free = !ent && freeLaunch(env as PayEnv) && e.cap <= FREE_CAP; // optional switch: small engagements free while the gateway is off
    if (!(await spend(env, now, 4))) return BUSY();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(`contact/${eid}`, JSON.stringify({ email: cEmail, phone: cPhone.slice(-10) })),
      env.DB.prepare("INSERT OR IGNORE INTO kv(k,v) VALUES(?,?)").bind(`pub/${eid}`, String(now)),
      ...(ent || free ? [env.DB.prepare("UPDATE engagement SET pack=? WHERE id=? AND pack=0").bind(ent?.pack ?? e.cap, eid)] : []),
      ...(ent ? [env.DB.prepare("UPDATE entitlement SET eid=? WHERE id=? AND eid IS NULL").bind(eid, ent.id)] : []),
    ]);
    const paid = !!(ent || free), startMs = roundMs(e.start_round);
    await recordFunnelForOrg(env as VisitEnv, e.org, "published", now);
    await sendMail(env as PayEnv, env.DB, cEmail, paid ? `Your engagement ${eid} is published and paid` : `Your engagement ${eid} is published: pay before ${istTime(startMs)}`,
      `Your engagement ${eid} is live.\n\nShare this link: ${shareUrl}\n\n${paid ? "" : `Pay before ${istTime(startMs)} or it will not begin (about 2 minutes): ${payUrl}\n\n`}Big screen for the room: ${origin}/big.html?e=${eid}`, now);
    return json({ ok: true, published: true, paid, startMs, payUrl, shareUrl, confirmed: { email: cEmail, phone: cPhone.slice(-10) } });
  }
  if (action === "claims" && req.method === "GET") {
    if (!can(a, e)) return deny(a);
    const r = await env.DB.prepare("SELECT pid,pattern,round,idx FROM claim WHERE eid=? ORDER BY round,idx,pid").bind(eid).all();
    return json({ claims: r.results ?? [] });
  }
  if (action === "participants" && req.method === "GET") {
    if (!can(a, e)) return deny(a);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || PAGE, 1), PAGE), offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
    const r = await env.DB.prepare("SELECT p.pid AS pid, COALESCE(s.jr,0) AS jr, s.role AS role, s.inv AS inv, s.cat AS cat FROM participant p LEFT JOIN seat s ON s.eid=p.eid AND s.pid=p.pid WHERE p.eid=? ORDER BY p.joined_ms, p.pid LIMIT ? OFFSET ?").bind(eid, limit, offset).all<any>(); // ids only: names are sealed and are opened one small batch at a time (see /names)
    const total = (await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>())?.c ?? 0;
    return json({ participants: r.results ?? [], total, offset, limit, closed: !!e.closed, cap: e.cap, ...pub(e) });
  }
  if (action === "names" && req.method === "GET") { // the organizer's console asks for the names of a few people (winners); never a whole list in one request
    if (!can(a, e, true)) return deny(a);
    const ids = (url.searchParams.get("pids") ?? "").split(",").filter((x) => /^[0-9a-z]{3,40}$/.test(x)).slice(0, 60);
    const out: Record<string, string> = {};
    for (const id of ids) { const r = await env.DB.prepare("SELECT pii FROM participant WHERE eid=? AND pid=?").bind(eid, id).first<{ pii: string | null }>(); const o = await openPii(env, r?.pii); if (o?.name) out[id] = o.name; }
    return json({ names: out });
  }
  if (action === "mark" && req.method === "POST") { // the organizer says which seat is the organizer's, a host's or a co-host's: they may play, are flagged in the report, stay out of lucky draws and may invite without a limit
    if (!canAi(a, e)) return deny(a);
    const b = await body(req);
    const seatNo = Number.isInteger(b?.seat) && b.seat > 0 ? (b.seat as number) : 0;
    if (a.kind === "ai" && !seatNo) return CONSOLE_ONLY();
    const ph = seatNo ? "" : await phoneHash(b?.phone);
    const role = b?.role === "none" ? null : ["organizer", "host", "co-host"].includes(b?.role) ? b.role : undefined;
    if ((!ph && !seatNo) || role === undefined) return json({ error: "Give the ticket number (or the mobile number) and a role (organizer, host, co-host or none)." }, 400);
    if (!(await spend(env, now))) return BUSY();
    const r = seatNo ? await env.DB.prepare("UPDATE seat SET role=? WHERE eid=? AND seq=?").bind(role, eid, seatNo).run() : await env.DB.prepare("UPDATE seat SET role=? WHERE eid=? AND ph=?").bind(role, eid, ph).run();
    return (r.meta?.changes ?? 0) > 0 ? json({ ok: true }) : json({ error: "That number has not joined yet. Ask them to open the game link first." }, 404);
  }
  if (action === "invites" && req.method === "GET") { // how many people this participant has invited so far (their own id is the key to ask)
    const pid = url.searchParams.get("pid") ?? "";
    const me = await env.DB.prepare("SELECT seq, role FROM seat WHERE eid=? AND pid=?").bind(eid, pid).first<{ seq: number; role: string | null }>();
    if (!me) return json({ error: "Not a participant of this engagement." }, 403);
    const c = cfgOf(e).invites;
    const used = (await env.DB.prepare("SELECT COUNT(*) AS c FROM seat WHERE eid=? AND inv=?").bind(eid, me.seq).first<{ c: number }>())?.c ?? 0;
    return json({ on: !!c?.on, per: c?.per ?? 0, used, unlimited: !!me.role, seat: me.seq, cats: c?.cats ?? [] });
  }
  if (action === "life" && req.method === "GET") { // the organizer's view of when the game ends and when each kind of data is deleted
    if (!can(a, e)) return deny(a);
    const l = await env.DB.prepare("SELECT * FROM life WHERE eid=?").bind(eid).first<any>();
    const end = l && l.end_src === "phones" ? l.end_ms : await endBoundMs(env, e);
    return json({ endMs: end, endSrc: l?.end_src ?? "schedule", reportSent: !!l?.report_ms, reportState: l?.report_state ?? null, purged: !!l?.purged_ms, personalDeleteAtMs: personalDeleteAt(end), fullDeleteAtMs: fullDeleteAt(end), backupDays: 7, started: now >= roundMs(e.start_round + GRACE_ROUNDS) });
  }
  if (action === "won" && req.method === "POST") return acceptWon(env, e, eid!, await body(req), now, json, spend);
  if (action === "over" && req.method === "POST") return acceptOver(env, e, eid!, await body(req), now, json, spend);
  if (action === "settle" && req.method === "POST") return json({ error: "Winners are decided by the software, from the public numbers, when several phones agree. Nobody can post or change them." }, 403);
  if (action === "reportlink" && req.method === "POST") { // the organizer replaces the report link (lost it, shared it by mistake): the old link stops at once. Never an AI or a co-host.
    if (!can(a, e, true)) return deny(a);
    if (!(await spend(env, now, 2))) return BUSY();
    await env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(`rptsalt/${eid}`, randHex(12)).run();
    return json({ ok: true, url: await reportLink(env as any, eid!) });
  }
  if (action === "reportlink" && req.method === "GET") { // the organizer's / co-host's way to the report page (the PDF is made on their own device)
    if (!can(a, e)) return deny(a);
    const life = await env.DB.prepare("SELECT report_ms FROM life WHERE eid=?").bind(eid).first<{ report_ms: number | null }>();
    const st = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`rpt/${eid}`).first<{ v: string }>();
    const stage = st ? (JSON.parse(st.v).stage as string) : null;
    const ready = stage === "send" || stage === "done";
    if (a.kind === "ai") return json({ ready, sent: !!life?.report_ms, url: null, note: "The report holds every participant's name and number, so its address goes only to the organizer (it is e-mailed to them). Tell them to open their e-mail or their console." }); // the address is a key to personal data: it never travels through an outside AI
    return json({ ready, sent: !!life?.report_ms, url: ready ? await reportLink(env as any, eid!) : null });
  }
  if (action === "vote" && req.method === "POST") return acceptVotes(env as any, e, eid!, await body(req, 65_536), now, json, spend);
  if (action === "confirm" && req.method === "POST") return confirmPrize(env as any, eid!, await body(req), now, json, spend);
  if (action === "myprizes" && req.method === "GET") return myPrizes(env as any, eid!, url, json);
  if (action === "prizes" && req.method === "GET") { if (!can(a, e)) return deny(a); return listPrizes(env as any, eid!, json, a.kind === "ai" || (a.kind === "host" && req.headers.get("x-ct-link") === "1")); } // an AI (or a co-host's AI link) sees ticket numbers only
  if (action === "prizegiven" && req.method === "POST") { if (!can(a, e)) return deny(a); return markGiven(env, eid!, await body(req), a.kind, now, json, spend); }
  if (action === "erase" && req.method === "POST") { // right to erasure: every name, number, seat and invite of this engagement's people. The winners record and the organizer's own details stay, as the report says.
    if (!can(a, e, true)) return deny(a);
    const n = await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>();
    if (!(await spend(env, now, (n?.c ?? 0) + 1))) return BUSY();
    await erasePersonal(env, eid!, now, "organizer");
    return json({ ok: true, erased: n?.c ?? 0 });
  }
  if (action === "reuse" && req.method === "POST") { // copy the people of an earlier engagement into this one (while that list still exists); the sealed records are copied as they are
    if (!can(a, e)) return deny(a);
    const b = await body(req);
    if (!b || !ID.test(b.from ?? "") || b.from === eid) return json({ error: "Pick an earlier engagement." }, 400);
    const src = await env.DB.prepare("SELECT org FROM engagement WHERE id=?").bind(b.from).first<{ org: string | null }>();
    if (!src || !can(a, src)) return json({ error: "Pick an earlier engagement." }, 400); // someone else's roster is never reachable
    const old = await env.DB.prepare("SELECT phone_hash, pii FROM participant WHERE eid=? ORDER BY joined_ms, pid").bind(b.from).all<any>();
    const rows = old.results ?? [];
    if (!rows.length) return json({ error: "That engagement's people list has already been deleted (personal data is deleted within 24 hours of a game ending). Upload your list again.", code: "gone" }, 410);
    if (rows.length > e.cap) return json({ error: "This engagement is smaller than the earlier roster." }, 409);
    if (!(await spend(env, now, rows.length * 2))) return BUSY();
    let copied = 0; const jr = lateNow();
    for (const r of rows) {
      if (await env.DB.prepare("SELECT 1 AS x FROM participant WHERE eid=? AND phone_hash=?").bind(eid, r.phone_hash).first()) continue;
      await addSeat(r.phone_hash, r.pii, null, jr, { src: "reuse" });
      copied++;
    }
    return json({ ok: true, copied });
  }
  if (action === "roster" && req.method === "POST") { // an invite list: these people are on the engagement before they open the link
    if (!can(a, e)) return deny(a);
    if (a.kind === "ai") return CONSOLE_ONLY();
    const b = await body(req, 32_768);
    if (!b || !Array.isArray(b.people) || b.people.length < 1 || b.people.length > 100) return json({ error: "Send between 1 and 100 people at a time." }, 400);
    const have = await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>();
    let room = e.cap - (have?.c ?? 0);
    const todo: { ph: string; digits: string; name: string | null }[] = []; let invalid = 0;
    for (const x of b.people) { const ph = await phoneHash(x?.phone), digits = digitsOf(x?.phone); if (!ph || !digits) { invalid++; continue; } todo.push({ ph, digits, name: cleanName(x?.name) }); }
    if (!(await spend(env, now, todo.length * 2))) return BUSY();
    let added = 0, skipped = 0; const jr = lateNow();
    for (const t of todo) {
      if (room <= 0) { skipped++; continue; }
      if (await env.DB.prepare("SELECT 1 AS x FROM participant WHERE eid=? AND phone_hash=?").bind(eid, t.ph).first()) { skipped++; continue; }
      await addSeat(t.ph, await sealPii(env, { phone: t.digits, name: t.name }), null, jr, { src: "roster" });
      added++; room--;
    }
    return json({ ok: true, added, skipped, invalid });
  }
  if (action === "settings" && (req.method === "PATCH" || req.method === "POST")) { // only before the first number can possibly have been called
    if (!can(a, e)) return deny(a);
    if (!unpaid && roundMs(e.start_round) <= now) return json({ error: "The engagement has already started, so it can no longer be changed." }, 409);
    const b = await body(req);
    if (!b) return json({ error: "Check the details." }, 400);
    const vc = validateCfg({ tickets: b.tickets, rewards: b.rewards, breaks: b.breaks, rounds: b.rounds, invites: b.invites, opening: b.opening, closing: b.closing, name: b.name }, cfgOf(e));
    if (!vc.ok) return json({ error: vc.error }, 400);
    const next = { start_round: b.startRound ?? e.start_round, call_seconds: b.callSeconds ?? e.call_seconds, cap: b.cap ?? e.cap, closed: b.closed === undefined ? e.closed : b.closed ? 1 : 0 };
    if (!Number.isInteger(next.start_round) || !Number.isInteger(next.call_seconds) || next.call_seconds % 3 || next.call_seconds < 6 || !Number.isInteger(next.cap) || next.cap < 1 || next.cap > 100000) return json({ error: "Check the details." }, 400);
    if (roundMs(next.start_round) <= now) return json({ error: "Pick a start time in the future." }, 400);
    const have = await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>();
    if (!a.plat && e.pack !== 0 && next.cap > (e.pack ?? e.cap)) return json({ error: `Your pack allows up to ${e.pack ?? e.cap} participants. Buy a bigger pack to raise the limit.` }, 402);
    if (next.cap < (have?.c ?? 0)) return json({ error: "The limit cannot be lower than the people already on the list." }, 409);
    if (!(await spend(env, now))) return BUSY();
    await env.DB.prepare("UPDATE engagement SET start_round=?, call_seconds=?, cap=?, closed=?, tickets=?, config=? WHERE id=?").bind(next.start_round, next.call_seconds, next.cap, next.closed, vc.cfg.tickets, cfgJson(vc.cfg), eid).run();
    { // the pause profile depends on the size: if no pause has been sent yet and the size moved to another profile, forget the unused key so the console registers the right one
      const f = await readPublished(d1kv(env), eid!);
      const sf = safetyForCap(next.cap);
      if (f && f.messages.length === 0 && (!sf || sf.leadRounds !== f.leadRounds)) {
        await env.DB.prepare("DELETE FROM kv WHERE k=?").bind(`control/${eid}.json`).run();
        try { await env.CONTROL_R2?.delete(controlKey(eid!)); } catch { /* the object expires with its engagement anyway */ }
      }
    }
    return json({ ok: true, startRound: next.start_round, callSeconds: next.call_seconds, cap: next.cap, closed: !!next.closed, tickets: vc.cfg.tickets, rewards: vc.cfg.rewards, breaks: vc.cfg.breaks, opening: vc.cfg.opening, closing: vc.cfg.closing, ...(vc.cfg.name ? { name: vc.cfg.name } : {}), rounds: vc.cfg.rounds, invites: vc.cfg.invites });
  }
  return json({ error: "Not found" }, 404);
}

/** Deletes engagements (and their people, claims and results) older than the 365-day retention period. */
/**
 * Housekeeping for everything that is not an engagement (see docs/RETENTION.md for the schedule). Runs with the daily purge. Never throws.
 * network-address hashes (start/, linkfail/, plim/): 2 days; sign-in codes: 1 day after they expire; partner sign-up codes (penr/): 1 day;
 * "new place" records (seen/, alert/): when their key is no longer live; e-mailed 24-hour keys: 7 days after they expire; retired keys: 90 days; daily counters: 90 days.
 */
export async function retentionSweep(env: Env, now: number): Promise<void> {
  const DAY = 86_400_000, db = env.DB;
  const safe = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* one failing step must not stop the others */ } };
  const cutoff = new Date(now - 2 * DAY).toISOString().slice(0, 10);
  await safe(async () => {
    const r = await db.prepare("SELECT k FROM kv WHERE k LIKE 'start/%' OR k LIKE 'linkfail/%' OR k LIKE 'plim/%' OR k LIKE 'jlim/%' OR k LIKE 'jbm/%' LIMIT 2000").all<{ k: string }>();
    for (const x of r.results ?? []) { const d = x.k.match(/\d{4}-\d{2}-\d{2}/)?.[0]; if (d && d < cutoff) await db.prepare("DELETE FROM kv WHERE k=?").bind(x.k).run(); }
  });
  await safe(() => db.prepare("DELETE FROM login_code WHERE expires_ms < ?").bind(now - DAY).run());
  await safe(async () => {
    const r = await db.prepare("SELECT k, v FROM kv WHERE k LIKE 'penr/%' OR k LIKE 'delreq/%' LIMIT 2000").all<{ k: string; v: string }>();
    for (const x of r.results ?? []) { let t = 0; try { t = JSON.parse(x.v).t ?? 0; } catch { /* unreadable: drop it */ } if (now - t > DAY) await db.prepare("DELETE FROM kv WHERE k=?").bind(x.k).run(); }
  });
  await safe(() => db.prepare("DELETE FROM kv WHERE (k LIKE 'seen/%' OR k LIKE 'alert/%') AND substr(k, instr(k, '/') + 1) NOT IN (SELECT substr(hash, 1, 10) FROM organizer_key WHERE revoked=0 AND (expires_ms IS NULL OR expires_ms > ?))").bind(now).run());
  await safe(() => db.prepare("DELETE FROM organizer_key WHERE expires_ms IS NOT NULL AND expires_ms < ?").bind(now - 7 * DAY).run());
  await safe(() => db.prepare("DELETE FROM organizer_key WHERE revoked=1 AND created_ms < ?").bind(now - 90 * DAY).run());
  await safe(() => db.prepare("DELETE FROM usage WHERE day < ?").bind(new Date(now - 90 * DAY).toISOString().slice(0, 10)).run());
}
export async function purgeOld(env: Env, now: number): Promise<number> {
  await retentionSweep(env, now);
  // an engagement goes at 00:00 IST at the end of the 365th day after its game ended (created + 365 days if it never ran), and a draft nobody published after DRAFT_DAYS
  const loose = now - (RETENTION_DAYS - 2) * 86_400_000;
  const old = await env.DB.prepare("SELECT e.id AS id, e.created_ms AS created_ms, e.pack AS pack, l.end_ms AS end_ms FROM engagement e LEFT JOIN life l ON l.eid=e.id WHERE e.created_ms < ? OR (e.pack=0 AND e.created_ms < ?)").bind(loose, now - DRAFT_DAYS * 86_400_000).all<{ id: string; created_ms: number; pack: number; end_ms: number | null }>();
  await env.DB.prepare("DELETE FROM ai_audit WHERE at_ms < ?").bind(now - RETENTION_DAYS * 86_400_000).run().catch(() => undefined);
  await sweepAudit(env.DB, now, RETENTION_DAYS); // the AI's audit trail is kept as long as the organizer's own details
  let n = 0;
  for (const x of old.results ?? []) {
    const due = x.end_ms != null ? now >= fullDeleteAt(x.end_ms) : x.created_ms < now - RETENTION_DAYS * 86_400_000 || (x.pack === 0 && x.created_ms < now - DRAFT_DAYS * 86_400_000);
    if (!due) continue;
    await eraseEverything(env, x.id, now);
    try { await env.CONTROL_R2?.delete(controlKey(x.id)); } catch { /* the object expires with its engagement anyway */ }
    n++;
  }
  return n;
}

export default { fetch: (req: Request, env: Env) => handle(req, env), scheduled: async (_e: unknown, env: Env) => { await lifecycleTick(env as any, Date.now()); await purgeOld(env, Date.now()); await retryOutbox(env as PayEnv, Date.now()); } };
