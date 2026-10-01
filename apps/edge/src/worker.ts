// Cloudflare-Workers-shaped store for the zero-server design. It keeps only what must outlive phones: who joined, which claims were made,
// and the settled results. It never draws numbers and never verifies BLS (a free Worker has ~10 ms CPU; one verify costs ~60 ms),
// so the organizer's own console verifies claims against the public log and posts the settled result.
// D1-compatible: env.DB only uses prepare/bind/run/all/first/batch.
//
// Who may do what:
//   platform key  (env.ORGANIZER_SECRET)  - us: issues organizer keys, runs the daily purge, and can act on any engagement (also single-tenant/local mode).
//   master key    - the organizer's own console: everything for that organizer's engagements, including publishing results, erasing, registering the pause key.
//   AI key        - the organizer's external AI assistant: everything a person could do in the console EXCEPT publishing results, erasing data and
//                   registering/using the pause signing key (pausing needs the organizer's own browser; the AI can only ask, see /control/request).
//                   So an AI can never decide who wins, and never change what the public beacon decides.
//   nobody        - phones: join, send claims, read results counts, read the engagement info and the signed control file.

import { defaultCfg, validateCfg, type EngagementCfg } from "../../../packages/beacon/src/config";
import { PAY_SCHEMA, payRoute, retryOutbox, sendMail, freeLaunch, payMode, FREE_CAP, MAX_DRAFTS, type PayEnv } from "./pay";
import { PACKS } from "../../../packages/shared/src/pricing";
import { PARTNER_SCHEMA, partnerRoute } from "./partners";
import { SAFETY_FAST, SAFETY_STANDARD, publishControl, readPublished, registerKey, type KV } from "../../../packages/beacon/src/control";

export interface D1Result<T = any> { results?: T[]; meta?: { changes?: number } }
export interface D1Stmt { bind(...v: unknown[]): D1Stmt; run(): Promise<D1Result>; all<T = any>(): Promise<D1Result<T>>; first<T = any>(): Promise<T | null> }
export interface D1 { prepare(sql: string): D1Stmt; batch(s: D1Stmt[]): Promise<D1Result[]> }
export interface R2Like { put(key: string, value: string, opts?: unknown): Promise<unknown>; delete(key: string): Promise<unknown> }
export interface Env {
  DB: D1; ORGANIZER_SECRET?: string; DAILY_WRITE_BUDGET?: string; PHONE_SALT?: string;
  /** Optional: a public R2 bucket behind a cached custom domain. Phones then read the pause file from the CDN and never invoke the Worker for it. */
  CONTROL_R2?: R2Like; CONTROL_BASE?: string;
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
const STARTS_PER_DAY = 5;
/** Largest page of participants one request returns, so a 10,000-person list never costs a free Worker its ~10 ms of CPU in one go. */
export const PAGE = 2000;
/** Claims are only a live cross-check (settlement never uses them), and 7 rows per phone would eat the free write allowance, so they are stored only for engagements this size or smaller. */
export const CLAIM_TRACKING_MAX_CAP = 500;
const tracks = (e: { cap: number }) => e.cap <= CLAIM_TRACKING_MAX_CAP;
/** The part of the settings every phone needs, public by design: how many tickets, what each house wins, and when the brand breaks are. */
const pub = (e: any) => { const c = cfgOf(e); return { tickets: c.tickets, rewards: c.rewards, breaks: c.breaks, rounds: c.rounds }; };
const cfgJson = (c: EngagementCfg) => JSON.stringify({ rewards: c.rewards, breaks: c.breaks, rounds: c.rounds });

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
];

const PATTERNS = new Set(["early5", "top", "mid", "bot", "corners", "star", "full", "full2", "lucky"]);
/** What the organizer set for this engagement (tickets per participant, reward lines, brand breaks); plain defaults when nothing was set. */
const cfgOf = (e: { tickets?: number; config?: string | null }): EngagementCfg => {
  try { const j = e.config ? JSON.parse(e.config) : {}; const v = validateCfg({ tickets: e.tickets ?? 1, rewards: j.rewards, breaks: j.breaks, rounds: j.rounds }); if (v.ok) return v.cfg; } catch { /* fall through */ }
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
const BUSY = () => json({ error: "Busy day. Please try again after midnight UTC." }, 503);

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, x-organizer, x-partner, authorization", "access-control-allow-methods": "GET, POST, PUT, PATCH, OPTIONS", "access-control-max-age": "86400" };
/** Phones load the app from Pages and call this Worker from another origin, so every answer carries open CORS (no cookies are used anywhere). */
/** The message an organizer pastes into any AI chat. The key in it is the scoped AI key: it cannot publish, pay, erase or settle. */
export const aiMessage = (origin: string, key: string) =>
  `You are my Corporate Tambola assistant. Read the instructions at ${origin}/api/z/ai-manifest, then do what I ask using that API. Send this key in the x-organizer header on every call: ${key}. Keep the key private. Set up everything for me: create the engagement, set the rewards and brand breaks, load my participant list, schedule it. Ask me for anything you need, such as how many participants, the date and time, and which rewards I want. Tell me before you do anything that cannot be undone. When it is ready, give me the link the API returns: I will open it, confirm my email and mobile number, publish it (publishing is free) and pay before the start time, because without payment the engagement will not begin. Never try to publish or pay yourself. Help me with every step, and remind me about the payment before the start.`;
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
      if (at > now && at - now < 36 * 3_600_000) await nudge(env, x.id, "remind", now, `Payment due before ${istTime(at)}: your engagement ${x.id}`, `Your engagement ${x.id} starts ${istTime(at)}. Payment has not been received yet. If it is not paid before the start, the engagement will not begin and everyone you invited will be left waiting.\n\nPay now (about 2 minutes): ${(env as PayEnv).PUBLIC_ORIGIN ?? ""}/pay.html?e=${x.id}`);
    }
  } catch { /* try again on the next request */ }
}
export async function handle(req: Request, env: Env, now = Date.now(), waitUntil?: (p: Promise<unknown>) => void): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
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

interface Auth { plat: boolean; org: string | null; kind: "platform" | "master" | "ai" | null }
async function authOf(req: Request, env: Env): Promise<Auth> {
  const presented = req.headers.get("x-organizer") || (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!presented) return { plat: false, org: null, kind: null };
  if (env.ORGANIZER_SECRET && presented === env.ORGANIZER_SECRET) return { plat: true, org: null, kind: "platform" };
  const row = await env.DB.prepare("SELECT org, kind FROM organizer_key WHERE hash=? AND revoked=0").bind(await sha("key|" + presented)).first<{ org: string; kind: "master" | "ai" }>();
  return row ? { plat: false, org: row.org, kind: row.kind } : { plat: false, org: null, kind: null };
}
/** May this caller act on this engagement? `master` = needs the organizer's own key (or ours), not the AI's. */
const can = (a: Auth, e: { org: string | null }, master = false) => a.plat || (!!a.org && e.org === a.org && (!master || a.kind === "master"));
const deny = (a: Auth) => json({ error: a.kind === "ai" ? "Your AI assistant may not do this. Please do it yourself in the console." : "Not allowed." }, 403);

export const AI_MANIFEST = {
  name: "Corporate Tambola organizer API",
  how: "Send your organizer AI key in the x-organizer header (or Authorization: Bearer). Every call is JSON. The numbers are drawn from public randomness on participants' phones; you cannot change them.",
  you_can: [
    { do: "List engagements and head-counts", call: "GET /api/history" },
    { do: "Create an engagement. It is saved as a free draft that participants cannot see yet; nothing is paid at this step", call: "POST /api/z {id, startRound, callSeconds (6|9|12|15), cap, closed?}  -> {ok, draft, openUrl}" },
    { do: "When everything is set up, tell the organizer it is ready. Publishing is free but only the organizer can do it (they confirm their email and mobile number), and payment is due before the start time or the engagement will not begin. This returns a link: give it to the organizer and help them through every step, but never try to publish or pay yourself", call: "POST /api/z/{id}/publish -> {published:false, needsOrganizer:true, payUrl}" },
    { do: "Change start time, speed, cap, invite-only, tickets per participant (1 or 2), reward lines and brand breaks (up to 3) and rounds (1 to 5 games, each with new numbers and new tickets) before the first number", call: "PATCH /api/z/{id}/settings {startRound?, callSeconds?, cap?, closed?, tickets?, rounds?, rewards?: [{pattern: early5|top|mid|bot|corners|star|full, scope?: ticket|two_ticket, ordinal?: 1-5, text}], breaks?: [{after: 1-89 numbers called, seconds: 15-600 in steps of 3, kind: file|youtube|slides|speech, title, mediaUrl?: https link}]}" },
    { do: "Load participants (invite list)", call: "POST /api/z/{id}/roster {people:[{phone,name}]} up to 100 per call" },
    { do: "Reuse an earlier engagement's people", call: "POST /api/z/{id}/reuse {from}" },
    { do: "See who joined (names and ids only, never phone numbers)", call: "GET /api/z/{id}/participants" },
    { do: "See claims received", call: "GET /api/z/{id}/claims" },
    { do: "See published results", call: "GET /api/z/{id}/results" },
    { do: "Ask the organizer to pause, resume or stop (they approve in their console)", call: "POST /api/z/{id}/control/request {action: pause|resume|stop, note}" },
    { do: "Read the current pause status", call: "GET /api/z/{id}/control" },
    { do: "Suggest a feature, improvement or report we should build (shared with every organizer's AI, reviewed by us)", call: "POST /api/z/suggestions {kind: feature|improvement|report|bug|other, title, body}" },
    { do: "See everyone's suggestions and what we decided, and add your support to one", call: "GET /api/z/suggestions ; POST /api/z/suggestions/{id}/vote" },
  ],
  suggestions_rules: "Describe the need and the benefit, not code. Never include names, phone numbers, e-mail addresses or anything about specific people. Suggestions are visible to all organizers' AI assistants without saying who wrote them. We review them and mark each one new, under_review, planned, shipped or declined.",
  you_cannot: [
    "Publish results or decide winners (the organizer's console recomputes them from the public numbers)",
    "Erase participant data (the organizer does that)",
    "Sign or send a pause yourself (only the organizer's own browser holds that key)",
    "Change the rules, the reward patterns, the numbers or anyone's ticket",
    "Write or run code on the platform",
  ],
};

async function route(req: Request, env: Env, now: number): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  const a = await authOf(req, env);

  if (req.method === "GET" && p === "/api/z/ai-manifest") return json(AI_MANIFEST);
  const paid = await payRoute(req, env as PayEnv, now, (n) => spend(env, now, n));
  if (paid) return paid;
  const partnered = await partnerRoute(req, env as PayEnv, now, (n) => spend(env, now, n), a.plat);
  if (partnered) return partnered;

  /* ---- sign in with an e-mailed code (no passwords): also how an organizer who lost their key gets a fresh one ---- */
  /* ---- start: a new organizer enters a work email and the console opens at once (no mail is sent). An email that already has an account is
     asked for the e-mailed code instead, so nobody can open someone else's console by typing their address. ---- */
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
    const org = randHex(8), token = "ctk_" + randHex(24), aiKey = "cta_" + randHex(24);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms) VALUES(?,?,?,0,?)").bind(await sha("key|" + token), org, "master", now),
      env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms) VALUES(?,?,?,0,?)").bind(await sha("key|" + aiKey), org, "ai", now),
      env.DB.prepare("INSERT INTO organizer_email(email_hash,org) VALUES(?,?)").bind(eh, org),
      env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=?").bind(ipk, String(used + 1), String(used + 1)),
    ]);
    return json({ ok: true, token, aiKey, aiMessage: aiMessage((env as PayEnv).PUBLIC_ORIGIN ?? new URL(req.url).origin, aiKey) });
  }
  if (req.method === "POST" && p === "/api/auth/email") {
    const b = await body(req);
    const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email)) return json({ error: "Please enter a valid work email." }, 400);
    const eh = await sha("email|" + email);
    const acct = await env.DB.prepare("SELECT org FROM organizer_email WHERE email_hash=?").bind(eh).first<{ org: string }>();
    const test = (env as PayEnv).TEST_MODE === "1";
    let devCode: string | undefined;
    if (acct) { // an unknown address gets the same answer, so nobody can find out who has an account
      const row = await env.DB.prepare("SELECT win_start, sent FROM login_code WHERE email_hash=?").bind(eh).first<{ win_start: number; sent: number }>();
      const fresh = !row || now - row.win_start > 3_600_000;
      if (!fresh && row!.sent >= 5) return json({ error: "Too many codes requested. Please try again in an hour." }, 429);
      if (!(await spend(env, now, 2))) return BUSY();
      const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000));
      await env.DB.prepare("INSERT INTO login_code(email_hash,code_hash,expires_ms,attempts,win_start,sent) VALUES(?,?,?,0,?,1) ON CONFLICT(email_hash) DO UPDATE SET code_hash=excluded.code_hash, expires_ms=excluded.expires_ms, attempts=0, win_start=?, sent=?").bind(eh, await sha("code|" + eh + "|" + code), now + 600_000, fresh ? now : row!.win_start, fresh ? now : row!.win_start, fresh ? 1 : row!.sent + 1).run();
      await sendMail(env as PayEnv, env.DB, email, "Your Corporate Tambola sign-in code", `Your sign-in code is ${code}. It works for 10 minutes. If you did not ask for it, ignore this message.`, now);
      if (test) devCode = code;
    }
    return json({ ok: true, ...(devCode ? { devCode } : {}) });
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
    const token = "ctk_" + randHex(24); // a fresh organizer key; the old ones keep working until the organizer retires them
    await env.DB.batch([
      env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms) VALUES(?,?,?,0,?)").bind(await sha("key|" + token), acct.org, "master", now),
      env.DB.prepare("DELETE FROM login_code WHERE email_hash=?").bind(eh),
    ]);
    return json({ ok: true, token });
  }

  /* ---- organizers and their keys ---- */
  if (req.method === "POST" && p === "/api/org") { // platform: a new organizer (called after payment / sign-up); the key is shown once
    if (!a.plat) return deny(a);
    if (!(await spend(env, now))) return BUSY();
    const org = randHex(8), key = "ctk_" + randHex(24);
    await env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms) VALUES(?,?,?,0,?)").bind(await sha("key|" + key), org, "master", now).run();
    return json({ ok: true, organizerKey: key });
  }
  if (req.method === "POST" && p === "/api/org/ai") { // the organizer's own key mints the AI key; a new one replaces the old one
    if (a.kind !== "master" || !a.org) return deny(a);
    if (!(await spend(env, now, 2))) return BUSY();
    await env.DB.prepare("UPDATE organizer_key SET revoked=1 WHERE org=? AND kind='ai'").bind(a.org).run();
    const key = "cta_" + randHex(24);
    await env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms) VALUES(?,?,?,0,?)").bind(await sha("key|" + key), a.org, "ai", now).run();
    return json({ ok: true, aiKey: key, aiMessage: aiMessage((env as PayEnv).PUBLIC_ORIGIN ?? new URL(req.url).origin, key) });
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
  if (req.method === "POST" && p === "/api/org/ai/revoke") {
    if (a.kind !== "master" || !a.org) return deny(a);
    if (!(await spend(env, now))) return BUSY();
    const r = await env.DB.prepare("UPDATE organizer_key SET revoked=1 WHERE org=? AND kind='ai' AND revoked=0").bind(a.org).run();
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
      if (ge && ge.pack === 0 && roundMs(ge.start_round) <= now && (await isPublished(env, ge))) // published, unpaid, start time reached: phones hold, nothing is shown
        return new Response(JSON.stringify({ ...(f ?? {}), locked: true }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=3" } });
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
    const ce = await env.DB.prepare("SELECT id, org FROM engagement WHERE id=?").bind(cid).first<{ id: string; org: string | null }>();
    if (!ce) return json({ error: "No such engagement." }, 404);
    if (sub === "/key" && req.method === "PUT") { // only the organizer's own console registers the key that signs pauses
      if (!can(a, ce, true)) return deny(a);
      const b = await body(req);
      if (!b || typeof b.publicKey !== "string") return json({ error: "Bad key." }, 400);
      if (!(await spend(env, now))) return BUSY();
      const r = await registerKey(kv, cid!, b.publicKey, b.profile === "fast" ? SAFETY_FAST : SAFETY_STANDARD);
      if (r.ok) await mirrorControl(env, cid!);
      return r.ok ? json({ ok: true }) : json({ error: r.error }, 409);
    }
    if (sub === "/request" && req.method === "POST") { // the AI (or organizer) asks; the organizer's browser approves by signing
      if (!can(a, ce)) return deny(a);
      const b = await body(req);
      if (!b || !["pause", "resume", "stop"].includes(b.action)) return json({ error: "Ask for pause, resume or stop." }, 400);
      if (!(await spend(env, now))) return BUSY();
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
    const b = await body(req);
    if (!b || !ID.test(b.id ?? "") || !Number.isInteger(b.startRound) || !Number.isInteger(b.callSeconds) || b.callSeconds % 3 || b.callSeconds < 6 || !Number.isInteger(b.cap) || b.cap < 1 || b.cap > 100000)
      return json({ error: "Check the engagement details." }, 400);
    const vc = validateCfg({ tickets: b.tickets, rewards: b.rewards, breaks: b.breaks, rounds: b.rounds });
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
      if (n >= MAX_DRAFTS) return json({ error: `You have ${MAX_DRAFTS} unpublished drafts. Publish or delete one first.` }, 409);
    }
    if (!(await spend(env, now, 2))) return BUSY();
    await env.DB.prepare("INSERT OR IGNORE INTO engagement(id,start_round,call_seconds,cap,created_ms,org,closed,pack,tickets,config) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(b.id, b.startRound, b.callSeconds, b.cap, now, a.org, b.closed ? 1 : 0, draft ? 0 : ent?.pack ?? b.cap, vc.cfg.tickets, cfgJson(vc.cfg)).run();
    if (ent) await env.DB.prepare("UPDATE entitlement SET eid=? WHERE id=? AND eid IS NULL").bind(b.id, ent.id).run();
    return json({ ok: true, draft, openUrl: `${(env as PayEnv).PUBLIC_ORIGIN ?? ""}/zc.html?e=${b.id}` });
  }
  if (req.method === "GET" && p === "/api/history") {
    if (!a.plat && !a.org) return deny(a);
    const q = a.plat
      ? env.DB.prepare("SELECT e.id, e.created_ms, e.call_seconds, e.closed, (e.pack=0) AS draft, (SELECT COUNT(*) FROM participant p WHERE p.eid=e.id) AS participants FROM engagement e ORDER BY e.created_ms DESC LIMIT 50")
      : env.DB.prepare("SELECT e.id, e.created_ms, e.call_seconds, e.closed, (e.pack=0) AS draft, (SELECT COUNT(*) FROM participant p WHERE p.eid=e.id) AS participants FROM engagement e WHERE e.org=? ORDER BY e.created_ms DESC LIMIT 50").bind(a.org);
    const r = await q.all<any>();
    return json({ engagements: r.results ?? [], retentionDays: RETENTION_DAYS });
  }
  if (req.method === "POST" && p === "/api/purge") { // run daily (Cron trigger) or by hand: removes everything older than the retention period
    if (!a.plat) return deny(a);
    return json({ ok: true, purged: await purgeOld(env, now) });
  }
  const m = p.match(/^\/api\/z\/([A-Za-z0-9_-]{4,40})\/(join|claims|settle|results|info|participants|erase|reuse|roster|settings|publish)$/);
  if (!m) return json({ error: "Not found" }, 404);
  const [, eid, action] = m;
  const e = await env.DB.prepare("SELECT * FROM engagement WHERE id=?").bind(eid).first<any>();
  if (!e) return json({ error: "No such engagement." }, 404);
  const phoneHash = async (raw: unknown): Promise<string | null> => {
    const d = String(raw ?? "").replace(/\D/g, "");
    if (d.length < 10 || d.length > 15) return null;
    return sha(`${env.PHONE_SALT ?? env.ORGANIZER_SECRET ?? "ct"}|${d.slice(-10)}`); // +91 98765 43210, 098765 43210 and 9876543210 are the same person; one hash in every engagement so a roster can be reused without storing the number
  };
  const pidOf = async (ph: string) => (await sha(`${eid}|${ph}`)).slice(0, 16);
  const cleanName = (n: unknown) => (typeof n === "string" ? n.replace(/[<>`]/g, "").slice(0, 60) : null);

  const unpaid = e.pack === 0;
  const isDraft = unpaid && !(await isPublished(env, e));
  const locked = unpaid && !isDraft && roundMs(e.start_round) <= now; // published but not paid by its start time: it does not begin
  if (isDraft && ((action === "join" && req.method === "POST") || (action === "info" && !can(a, e)))) return json({ error: "This engagement is not open yet." }, 403);
  if (locked && !can(a, e) && (action === "info" || action === "join")) await nudge(env, e.id, "lockmail", now, `Your engagement ${e.id} could not begin: payment is due`, `Your participants opened your link, but your engagement ${e.id} could not begin because payment has not been received.\n\nPay now and it starts in about 3 minutes, for everyone already waiting: ${(env as PayEnv).PUBLIC_ORIGIN ?? ""}/pay.html?e=${e.id}`);
  if (action === "join" && req.method === "POST") {
    const b = await body(req);
    const ph = await phoneHash(b?.phone);
    if (!ph) return json({ error: "Enter a valid mobile number." }, 400);
    const have = await env.DB.prepare("SELECT pid FROM participant WHERE eid=? AND phone_hash=?").bind(eid, ph).first<{ pid: string }>();
    if (have) return json({ pid: have.pid, startRound: e.start_round, callSeconds: e.call_seconds, trackClaims: tracks(e), ...pub(e), again: true }); // same number twice = same participant, no extra write
    if (e.closed) return json({ error: "This engagement is by invitation. Ask your organizer to add your number." }, 403);
    const n = await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>();
    if ((n?.c ?? 0) >= e.cap) return json({ error: "This engagement is full." }, 409);
    if (!(await spend(env, now))) return BUSY();
    const pid = await pidOf(ph);
    await env.DB.prepare("INSERT OR IGNORE INTO participant(eid,pid,phone_hash,name,joined_ms) VALUES(?,?,?,?,?)").bind(eid, pid, ph, cleanName(b?.name), now).run();
    return json({ pid, startRound: e.start_round, callSeconds: e.call_seconds, trackClaims: tracks(e), ...pub(e) });
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
  if (action === "info" && req.method === "GET") return json({ ...(isDraft ? { draft: true } : {}), ...(unpaid && !isDraft ? { unpaid: true, locked } : {}), startMs: roundMs(e.start_round), cap: e.cap, startRound: e.start_round, callSeconds: e.call_seconds, trackClaims: tracks(e), controlUrl: controlUrl(env, e.id), ...pub(e) });

  // everything below is for the organizer (or their AI, where allowed)
  if (action === "publish" && req.method === "POST") { // free: the organizer confirms their details, shares the link, and pays before the start (or it will not begin)
    const origin = (env as PayEnv).PUBLIC_ORIGIN ?? new URL(req.url).origin;
    const payUrl = `${origin}/pay.html?e=${eid}`, shareUrl = `${origin}/z.html?e=${eid}`;
    if (a.kind === "ai" && can(a, e)) return json({ ok: true, published: !isDraft, needsOrganizer: isDraft, payUrl: isDraft ? `${origin}/zc.html?e=${eid}` : payUrl, shareUrl: isDraft ? undefined : shareUrl, message: isDraft
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
    if (!paid) await sendMail(env as PayEnv, env.DB, cEmail, `Your engagement ${eid} is published: pay before ${istTime(startMs)}`,
      `Your engagement ${eid} is published and open to your participants.\n\nShare this link with them:\n${shareUrl}\n\nIMPORTANT: payment is due before the start (${istTime(startMs)}). If it is not paid by then, the engagement will not begin and everyone you invited will be left waiting. You can pay any time before the start, and it takes about 2 minutes:\n${payUrl}\n\nYou can also open the big screen for the room: ${origin}/big.html?e=${eid}`, now);
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
    const r = await env.DB.prepare("SELECT pid, name FROM participant WHERE eid=? ORDER BY joined_ms, pid LIMIT ? OFFSET ?").bind(eid, limit, offset).all<any>();
    const total = (await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>())?.c ?? 0;
    return json({ participants: r.results ?? [], total, offset, limit, closed: !!e.closed, cap: e.cap, ...pub(e) });
  }
  if (action === "settle" && req.method === "POST") { // only the organizer's own console (which recomputed it from the public log), never the AI
    if (!can(a, e, true)) return deny(a);
    const b = await body(req, 65_536);
    if (!b || !Array.isArray(b.results) || b.results.length > 40) return json({ error: "Bad result." }, 400);
    for (const x of b.results) if (!PATTERNS.has(x?.pattern) || !Number.isInteger(x?.idx) || !Array.isArray(x?.pids) || (x.ordinal !== undefined && (!Number.isInteger(x.ordinal) || x.ordinal < 1 || x.ordinal > 5)) || (x.round !== undefined && (!Number.isInteger(x.round) || x.round < 1 || x.round > cfgOf(e).rounds)) || (x.pattern === "lucky" && (x.round ?? 1) !== 1)) return json({ error: "Bad result." }, 400);
    const luckyCount = cfgOf(e).breaks.filter((x) => x.kind === "lucky").length;
    for (const x of b.results) if (x.pattern === "lucky" && ((x.ordinal ?? 1) > luckyCount || x.pids.length > 10 || x.pids.some((p: unknown) => typeof p !== "string"))) return json({ error: "That lucky draw does not exist in this engagement." }, 400);
    if (!(await spend(env, now, b.results.length))) return BUSY();
    for (const x of b.results) await env.DB.prepare("INSERT INTO settled(eid,pattern,ordinal,round,idx,pids) VALUES(?,?,?,?,?,?) ON CONFLICT(eid,pattern,ordinal,round) DO UPDATE SET idx=excluded.idx, pids=excluded.pids").bind(eid, x.pattern, x.ordinal ?? 1, x.round ?? 1, x.idx, JSON.stringify(x.pids.slice(0, 500))).run();
    return json({ ok: true });
  }
  if (action === "erase" && req.method === "POST") { // right to erasure: everything about the people of this engagement, nothing else
    if (!can(a, e, true)) return deny(a);
    const n = await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>();
    if (!(await spend(env, now, (n?.c ?? 0) + 1))) return BUSY();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM claim WHERE eid=?").bind(eid), env.DB.prepare("DELETE FROM settled WHERE eid=?").bind(eid),
      env.DB.prepare("DELETE FROM participant WHERE eid=?").bind(eid),
    ]);
    return json({ ok: true, erased: n?.c ?? 0 });
  }
  if (action === "reuse" && req.method === "POST") { // copy the people of an earlier engagement into this one (their phones get a new participant id)
    if (!can(a, e)) return deny(a);
    const b = await body(req);
    if (!b || !ID.test(b.from ?? "") || b.from === eid) return json({ error: "Pick an earlier engagement." }, 400);
    const src = await env.DB.prepare("SELECT org FROM engagement WHERE id=?").bind(b.from).first<{ org: string | null }>();
    if (!src || !can(a, src)) return json({ error: "Pick an earlier engagement." }, 400); // someone else's roster is never reachable
    const old = await env.DB.prepare("SELECT phone_hash, name FROM participant WHERE eid=?").bind(b.from).all<any>();
    const rows = old.results ?? [];
    if (rows.length > e.cap) return json({ error: "This engagement is smaller than the earlier roster." }, 409);
    if (!(await spend(env, now, rows.length))) return BUSY();
    let copied = 0;
    for (const r of rows) {
      const x = await env.DB.prepare("INSERT OR IGNORE INTO participant(eid,pid,phone_hash,name,joined_ms) VALUES(?,?,?,?,?)").bind(eid, await pidOf(r.phone_hash), r.phone_hash, r.name, now).run();
      copied += x.meta?.changes ?? 0;
    }
    return json({ ok: true, copied });
  }
  if (action === "roster" && req.method === "POST") { // an invite list: these people are on the engagement before they open the link
    if (!can(a, e)) return deny(a);
    const b = await body(req, 32_768);
    if (!b || !Array.isArray(b.people) || b.people.length < 1 || b.people.length > 100) return json({ error: "Send between 1 and 100 people at a time." }, 400);
    const have = await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>();
    let room = e.cap - (have?.c ?? 0);
    const todo: { ph: string; name: string | null }[] = []; let invalid = 0;
    for (const x of b.people) { const ph = await phoneHash(x?.phone); if (!ph) { invalid++; continue; } todo.push({ ph, name: cleanName(x?.name) }); }
    if (!(await spend(env, now, todo.length))) return BUSY();
    let added = 0, skipped = 0;
    for (const t of todo) {
      if (room <= 0) { skipped++; continue; }
      const r = await env.DB.prepare("INSERT OR IGNORE INTO participant(eid,pid,phone_hash,name,joined_ms) VALUES(?,?,?,?,?)").bind(eid, await pidOf(t.ph), t.ph, t.name, now).run();
      if (r.meta?.changes) { added++; room--; } else skipped++;
    }
    return json({ ok: true, added, skipped, invalid });
  }
  if (action === "settings" && (req.method === "PATCH" || req.method === "POST")) { // only before the first number can possibly have been called
    if (!can(a, e)) return deny(a);
    if (!unpaid && roundMs(e.start_round) <= now) return json({ error: "The engagement has already started, so it can no longer be changed." }, 409);
    const b = await body(req);
    if (!b) return json({ error: "Check the details." }, 400);
    const vc = validateCfg({ tickets: b.tickets, rewards: b.rewards, breaks: b.breaks, rounds: b.rounds }, cfgOf(e));
    if (!vc.ok) return json({ error: vc.error }, 400);
    const next = { start_round: b.startRound ?? e.start_round, call_seconds: b.callSeconds ?? e.call_seconds, cap: b.cap ?? e.cap, closed: b.closed === undefined ? e.closed : b.closed ? 1 : 0 };
    if (!Number.isInteger(next.start_round) || !Number.isInteger(next.call_seconds) || next.call_seconds % 3 || next.call_seconds < 6 || !Number.isInteger(next.cap) || next.cap < 1 || next.cap > 100000) return json({ error: "Check the details." }, 400);
    if (roundMs(next.start_round) <= now) return json({ error: "Pick a start time in the future." }, 400);
    const have = await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>();
    if (!a.plat && e.pack !== 0 && next.cap > (e.pack ?? e.cap)) return json({ error: `Your pack allows up to ${e.pack ?? e.cap} participants. Buy a bigger pack to raise the limit.` }, 402);
    if (next.cap < (have?.c ?? 0)) return json({ error: "The limit cannot be lower than the people already on the list." }, 409);
    if (!(await spend(env, now))) return BUSY();
    await env.DB.prepare("UPDATE engagement SET start_round=?, call_seconds=?, cap=?, closed=?, tickets=?, config=? WHERE id=?").bind(next.start_round, next.call_seconds, next.cap, next.closed, vc.cfg.tickets, cfgJson(vc.cfg), eid).run();
    return json({ ok: true, startRound: next.start_round, callSeconds: next.call_seconds, cap: next.cap, closed: !!next.closed, tickets: vc.cfg.tickets, rewards: vc.cfg.rewards, breaks: vc.cfg.breaks, rounds: vc.cfg.rounds });
  }
  return json({ error: "Not found" }, 404);
}

/** Deletes engagements (and their people, claims and results) older than the 365-day retention period. */
export async function purgeOld(env: Env, now: number): Promise<number> {
  const cutoff = now - RETENTION_DAYS * 86_400_000;
  const old = await env.DB.prepare("SELECT id FROM engagement WHERE created_ms < ? OR (pack=0 AND created_ms < ?)").bind(cutoff, now - DRAFT_DAYS * 86_400_000).all<{ id: string }>();
  let n = 0;
  for (const { id } of old.results ?? []) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM claim WHERE eid=?").bind(id), env.DB.prepare("DELETE FROM settled WHERE eid=?").bind(id),
      env.DB.prepare("DELETE FROM participant WHERE eid=?").bind(id), env.DB.prepare("DELETE FROM ctl_request WHERE eid=?").bind(id),
      env.DB.prepare("DELETE FROM kv WHERE k=?").bind(`control/${id}.json`), env.DB.prepare("DELETE FROM kv WHERE k=?").bind(`contact/${id}`), env.DB.prepare("DELETE FROM kv WHERE k IN (?,?,?)").bind(`pub/${id}`, `lockmail/${id}`, `remind/${id}`), env.DB.prepare("DELETE FROM engagement WHERE id=?").bind(id),
    ]);
    try { await env.CONTROL_R2?.delete(controlKey(id)); } catch { /* the object expires with its engagement anyway */ }
    n++;
  }
  return n;
}

export default { fetch: (req: Request, env: Env) => handle(req, env), scheduled: async (_e: unknown, env: Env) => { await purgeOld(env, Date.now()); await retryOutbox(env as PayEnv, Date.now()); } };
