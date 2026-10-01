/**
 * Local development server for Corporate Tambola.
 * Stand-in for the Cloudflare Worker + GameRoom Durable Object: one in-memory EngagementEngine per engagement,
 * state persisted to SQLite, WebSocket push, timers instead of alarms. All rules live in @tambola/engine.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, normalize as pnorm } from "node:path";
import type { ServerWebSocket } from "bun";
import { CFG, EngagementEngine, makeRewardLines, type PublicEvent, type RewardLine } from "@tambola/engine";
import { PACKS, checkUpload, formatInternational, maskNumber, normalize, price, rewardName, type Currency, type PatternId } from "@tambola/shared";
import { openDb, sha256 } from "./db";

// ---------- config ----------
const PORT = Number(process.env.PORT ?? 8787);
const DEV = process.env.TAMBOLA_DEV !== "0";
const FAST = process.env.TAMBOLA_FAST === "1";
const DATA_DIR = process.env.TAMBOLA_DATA ?? join(import.meta.dir, "../../../data");
const WEB_DIR = join(import.meta.dir, "../../web/public");
const IP_LIMIT = Number(process.env.TAMBOLA_IP_LIMIT ?? 1000); // joins per IP per 10 min
if (process.env.TAMBOLA_GAP) CFG.AI_GAP = Number(process.env.TAMBOLA_GAP);
if (FAST) Object.assign(CFG, { AI_GAP: 120, MIN_HOST_GAP: 100, CLAIM_CHECK: 100, RESULT_SHOW: 120, RESUME_DELAY: 40 });

mkdirSync(join(DATA_DIR, "outbox"), { recursive: true });
const db = openDb(process.env.TAMBOLA_DB ?? join(DATA_DIR, "tambola.db"));
const now = () => Date.now();
const rid = (n = 8) => crypto.randomUUID().replace(/-/g, "").slice(0, n);
const FREE_MAIL = /@(gmail|yahoo|outlook|hotmail|rediffmail|icloud|proton(mail)?|aol)\./i;

// ---------- rooms ----------
type WSData = { code: string; kind: "org" | "p"; pid?: string; console: boolean };
class Room {
  sockets = new Set<ServerWebSocket<WSData>>();
  dirty = false;
  declined = new Set<string>();
  constructor(public code: string, public organizerId: string, public engine: EngagementEngine, public pack: number, public currency: Currency) {}
  send(filter: (d: WSData) => boolean, msg: unknown) {
    const s = JSON.stringify(msg);
    for (const ws of this.sockets) if (filter(ws.data)) ws.send(s);
  }
  touch(roster = false) {
    this.dirty = true;
    this.send((d) => d.console, { type: "refresh" });
    if (roster) this.send((d) => d.kind === "p", { type: "refresh", scope: "roster" });
  }
}
const rooms = new Map<string, Room>();

function mkEngine(room: { code: string; get: () => Room | undefined }, init: ConstructorParameters<typeof EngagementEngine>[0]) {
  return new EngagementEngine(init, { now, emit: (e) => route(room.get(), e) });
}
function route(room: Room | undefined, e: PublicEvent) {
  if (!room) return;
  room.dirty = true;
  if (e.to === "all") room.send(() => true, e);
  else room.send((d) => d.console, e);
}
function loadRooms() {
  const rows = db.query("SELECT * FROM engagements").all() as any[];
  for (const r of rows) {
    let room: Room;
    const engine = EngagementEngine.restore(r.state_json, { now, emit: (e) => route(room, e) });
    room = new Room(r.code, r.organizer_id, engine, r.pack, r.currency);
    rooms.set(r.code, room);
  }
}
function save(room: Room) {
  db.query("INSERT INTO engagements(code,organizer_id,pack,currency,state_json,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at, pack=excluded.pack")
    .run(room.code, room.organizerId, room.pack, room.currency, room.engine.snapshot(), now());
  room.dirty = false;
}
function createRoom(organizerId: string, pack: number, currency: Currency, init: any): Room {
  let room!: Room;
  const engine = mkEngine({ code: "", get: () => room }, init);
  room = new Room(engine.settings.code, organizerId, engine, pack, currency);
  rooms.set(room.code, room);
  save(room);
  return room;
}
loadRooms();

setInterval(() => {
  for (const room of rooms.values()) {
    const e = room.engine;
    if (e.status === "started") { const before = e.called.length + (e.paused?.type ?? ""); e.tick(); if (before !== e.called.length + (e.paused?.type ?? "")) room.touch(); }
    if (e.status === "ended" && e.endedAt && now() - e.endedAt > Number(process.env.TAMBOLA_PURGE_MS ?? 24 * 3600_000)) purgeRoom(room);
  }
}, 50);
setInterval(() => { for (const r of rooms.values()) if (r.dirty) save(r); }, 1000);

function purgeRoom(room: Room) {
  if (room.engine.purge()) return;
  db.query("INSERT OR REPLACE INTO summaries(code,organizer_id,json) VALUES(?,?,?)").run(room.code, room.organizerId, JSON.stringify(room.engine.summary));
  save(room);
  room.send(() => true, { type: "purged" });
}

// ---------- mail (dev outbox) ----------
function sendMail(to: string, subject: string, body: string) {
  const f = join(DATA_DIR, "outbox", `${now()}-${rid(4)}.txt`);
  writeFileSync(f, `To: ${to}\nSubject: ${subject}\n\n${body}\n`);
  console.log(`[mail] to=${to} subject=${subject}`);
}

// ---------- http helpers ----------
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
function fail(status: number, msg: string): never { throw new HttpError(status, msg); }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const body = async (req: Request): Promise<any> => { try { return await req.json(); } catch { return {}; } };
const deviceOf = (req: Request): string | null => { const d = req.headers.get("x-device"); return d && d.length >= 16 ? sha256(d) : null; };
const ipOf = (req: Request, server: any) => server.requestIP(req)?.address ?? "?";
const hits = new Map<string, number[]>();
function ipLimit(ip: string) {
  const t = now(), arr = (hits.get(ip) ?? []).filter((x) => t - x < 600_000);
  arr.push(t); hits.set(ip, arr);
  if (arr.length > IP_LIMIT) fail(429, "Too many attempts from this network. Try again in a few minutes.");
}
function orgOf(req: Request): string | null {
  const a = req.headers.get("authorization");
  if (!a?.startsWith("Bearer ")) return null;
  const r = db.query("SELECT organizer_id, expires_at FROM tokens WHERE hash=?").get(sha256(a.slice(7))) as any;
  return r && r.expires_at > now() ? r.organizer_id : null;
}
function getRoom(code: string): Room { return rooms.get(code) ?? fail(404, "This engagement link is not valid."); }

type Actor = { kind: "organizer" } | { kind: "host" | "team_lead" | "participant"; pid: string };
function actorOf(req: Request, room: Room): Actor | null {
  const org = orgOf(req);
  if (org && org === room.organizerId) return { kind: "organizer" };
  const dev = deviceOf(req);
  if (dev) {
    const p = room.engine.participants.find((x) => x.device === dev && x.status === "joined");
    if (p) return { kind: p.role === "host" ? "host" : p.role === "team_lead" ? "team_lead" : "participant", pid: p.id };
  }
  return null;
}
function needConsole(a: Actor | null): "organizer" | "host" {
  if (a?.kind === "organizer") return "organizer";
  if (a?.kind === "host") return "host";
  return fail(403, "Not allowed.");
}
function needOrganizer(a: Actor | null): void { if (a?.kind !== "organizer") fail(403, "Only the organizer can do this."); }
function orErr(err: unknown, ok: unknown = 0): void { if (typeof err === "string") fail(400, err); void ok; }

// ---------- views ----------
function origin(req: Request) { return new URL(req.url).origin; }
function consoleState(room: Room, a: Actor, req: Request) {
  const e = room.engine, s = e.settings, byId = new Map(e.participants.map((p) => [p.id, p]));
  const isOrg = a.kind === "organizer";
  const num = (n: string) => (isOrg ? formatInternational(n) : maskNumber(n));
  return {
    viewer: a.kind,
    engagement: { code: s.code, name: s.name, orgName: s.orgName, status: e.status, limit: s.limit, familyLimit: s.familyLimit, familyCanWin: s.familyCanWin,
      participantInvites: s.participantInvites, ticketMode: s.ticketMode, callMode: s.callMode, defaultCountry: s.defaultCountry, startsAt: s.startsAt, tz: s.tz,
      pack: room.pack, currency: room.currency, link: `${origin(req)}/e/${s.code}` },
    counts: { used: e.placesUsed, limit: s.limit, left: e.placesLeft, joined: e.participants.filter((p) => p.status === "joined").length,
      waiting: e.waiting.length, conflicts: e.conflicts.filter((c) => !c.done).length, called: e.called.length },
    participants: e.participants.map((p) => ({
      id: p.id, name: p.name, number: num(p.e164), e164: isOrg ? p.e164 : undefined, role: p.role, kind: p.kind, source: p.source, status: p.status,
      invitedBy: p.invitedBy ? byId.get(p.invitedBy)?.name ?? "" : "", cap: p.cap, colleaguesUsed: e.colleaguesUsed(p), familyUsed: e.familyUsed(p),
      roleLink: isOrg && p.roleLink ? `${origin(req)}/r/${p.roleLink}` : undefined,
      passLink: p.passCode ? `${origin(req)}/p/${p.passCode}` : undefined, ticketId: e.ticketId(p), notValid: p.notValid, blocked: p.blocked, tickets: p.tickets.length,
    })),
    waiting: e.waiting.map((w) => ({ id: w.id, name: w.name, info: w.info, number: num(w.e164), invitedBy: w.invitedBy ? byId.get(w.invitedBy)?.name ?? "" : "", at: w.at })),
    conflicts: e.conflicts.filter((c) => !c.done).map((c) => ({ id: c.id, name: byId.get(c.pid)?.name ?? "", number: num(byId.get(c.pid)?.e164 ?? ""), at: c.at })),
    rewards: s.rewards.map((l) => {
      const total = s.rewards.filter((x) => x.pattern === l.pattern && x.scope === l.scope).length;
      return { ...l, name: rewardName(l.pattern, l.scope, l.ordinal, total),
        winners: (e.winners.get(l.id) ?? []).map((w) => ({ ticketId: w.ticketId, name: byId.get(w.pid)?.name ?? "", share: w.share, number: w.number, callNo: w.callNo })) };
    }),
    breaks: s.breaks,
    live: { called: e.called.length, current: e.current, paused: e.paused ? { type: e.paused.type, reason: (e.paused as any).reason, title: (e.paused as any).brk?.title } : null, nextAt: e.nextAt },
    log: e.log.slice(0, 80),
    notValid: e.notValidLog.map((n) => ({ ticketId: n.ticketId, pattern: n.pattern, why: n.why, at: n.at })),
    packs: PACKS,
  };
}

function meState(room: Room, pid: string, req: Request) {
  const e = room.engine, s = e.settings, p = e.participants.find((x) => x.id === pid)!;
  const mine = e.participants.filter((x) => x.invitedBy === p.id);
  return {
    engagement: { code: s.code, name: s.name, orgName: s.orgName, status: e.status, startsAt: s.startsAt, tz: s.tz, ticketMode: s.ticketMode, callMode: s.callMode,
      familyLimit: s.familyLimit, participantInvites: s.participantInvites, familyCanWin: s.familyCanWin, breaks: s.breaks.map((b) => ({ after: b.after, title: b.title, kind: b.kind, seconds: b.seconds, mediaUrl: b.mediaUrl })), gapMs: CFG.AI_GAP },
    me: { name: p.name, role: p.role, kind: p.kind, tickets: p.tickets, ticketIds: { A: e.ticketId(p, "A"), B: e.ticketId(p, "B"), AB: e.ticketId(p, "AB") },
      notValid: p.notValid, blocked: p.blocked, status: p.status },
    quotas: {
      colleagues: p.role === "team_lead" ? { used: e.colleaguesUsed(p), cap: p.cap } : null,
      family: p.kind === "family" ? null : { used: e.familyUsed(p), limit: s.familyLimit },
      invites: p.kind || p.role !== "participant" ? null : { used: e.participantInvitesUsed(p), max: s.participantInvites },
    },
    invitees: mine.map((x) => ({ id: x.id, name: x.name, kind: x.kind, status: x.status, link: x.passCode && x.status !== "joined" ? `${origin(req)}/p/${x.passCode}` : null })),
    consoleLink: p.roleLink ? `${origin(req)}/r/${p.roleLink}` : null,
    state: e.publicState(),
    paused: e.paused ? { type: e.paused.type, reason: (e.paused as any).reason ?? null, brk: (e.paused as any).brk ? { title: (e.paused as any).brk.title, kind: (e.paused as any).brk.kind, seconds: (e.paused as any).brk.seconds, until: (e.paused as any).until } : null } : null,
    nextAt: e.nextAt,
  };
}

const maskName = (n: string) => (n ? n.split(/\s+/).map((w) => w[0] + "•".repeat(Math.min(4, w.length - 1))).join(" ") : "");
function publicInfo(room: Room) {
  const s = room.engine.settings;
  return { code: s.code, name: s.name, orgName: s.orgName, status: room.engine.status, startsAt: s.startsAt, tz: s.tz, defaultCountry: s.defaultCountry, ticketMode: s.ticketMode,
    open: room.engine.entryOpen };
}

// ---------- routes ----------
type Ctx = { req: Request; url: URL; m: RegExpMatchArray; server: any };
type Handler = (c: Ctx) => Promise<Response> | Response;
const routes: { method: string; re: RegExp; h: Handler }[] = [];
const route_ = (method: string, path: string, h: Handler) => routes.push({ method, re: new RegExp("^" + path.replace(/:(\w+)/g, "([^/]+)") + "$"), h });

route_("GET", "/api/health", () => json({ ok: true, dev: DEV, fast: FAST, rooms: rooms.size }));

// ----- checkout + organizer login -----
route_("POST", "/api/checkout", async ({ req }) => {
  const b = await body(req);
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, "Enter a valid work email.");
  if (!DEV && FREE_MAIL.test(email)) fail(400, "Please use your work email, not a free mail address.");
  const org = String(b.org ?? "").trim();
  if (org.length < 2) fail(400, "Enter your organization name.");
  const pack = Number(b.pack);
  if (!PACKS.some((p) => p[0] === pack)) fail(400, "Choose a pack.");
  const currency: Currency = b.currency === "INR" ? "INR" : "USD";
  if (currency === "INR" && !String(b.taxId ?? "").trim() && b.country === "IN") fail(400, "Enter your GSTIN.");
  let o = db.query("SELECT * FROM organizers WHERE email=?").get(email) as any;
  if (!o) { const id = rid(10); db.query("INSERT INTO organizers(id,email,org_name,country,tax_id,created_at) VALUES(?,?,?,?,?,?)").run(id, email, org, b.country ?? "IN", b.taxId ?? "", now()); o = { id }; }
  const pr = price(pack, currency);
  const room = createRoom(o.id, pack, currency, { orgName: org, limit: pack, defaultCountry: b.country ?? "IN", name: "My first engagement", startsAt: now() + 2 * 86400_000 });
  const orderId = "ord_" + rid(8);
  // fake payment gateway: always succeeds locally
  db.query("INSERT INTO orders(id,organizer_id,engagement_code,pack,currency,total,tax,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run(orderId, o.id, room.code, pack, currency, pr.total, pr.tax, "paid", now());
  sendMail(email, "Your Corporate Tambola order", `Order ${orderId} paid: ${currency} ${pr.total}. Open the console and log in with your work email.`);
  return json({ ok: true, orderId, engagementCode: room.code, total: pr.total, tax: pr.tax, currency });
});

route_("POST", "/api/auth/email", async ({ req }) => {
  const b = await body(req);
  const email = String(b.email ?? "").trim().toLowerCase();
  const o = db.query("SELECT id FROM organizers WHERE email=?").get(email);
  if (!o) fail(404, "We could not find an organizer with this email. Buy a pack first.");
  const recent = db.query("SELECT COUNT(*) c FROM email_codes WHERE email=? AND expires_at > ?").get(email, now()) as any;
  if (recent.c >= 5) fail(429, "Too many codes requested. Wait a few minutes.");
  const code = String(100000 + Math.floor(Math.random() * 900000));
  db.query("INSERT INTO email_codes(email,code_hash,expires_at) VALUES(?,?,?)").run(email, sha256(email + code), now() + 600_000);
  sendMail(email, "Your Corporate Tambola login code", `Your code is ${code}. It works for 10 minutes.`);
  return json({ ok: true, devCode: DEV ? code : undefined });
});

route_("POST", "/api/auth/verify", async ({ req }) => {
  const b = await body(req);
  const email = String(b.email ?? "").trim().toLowerCase(), code = String(b.code ?? "").trim();
  const row = db.query("SELECT rowid, * FROM email_codes WHERE email=? AND expires_at > ? ORDER BY rowid DESC LIMIT 1").get(email, now()) as any;
  if (!row) fail(400, "That code has expired. Ask for a new one.");
  if (row.tries >= 5) fail(429, "Too many wrong tries. Ask for a new code.");
  if (row.code_hash !== sha256(email + code)) { db.query("UPDATE email_codes SET tries=tries+1 WHERE rowid=?").run(row.rowid); fail(400, "That code is not right."); }
  db.query("DELETE FROM email_codes WHERE email=?").run(email);
  const o = db.query("SELECT id, org_name FROM organizers WHERE email=?").get(email) as any;
  db.query("UPDATE organizers SET verified_at=? WHERE id=?").run(now(), o.id);
  const token = rid(32) + rid(32);
  db.query("INSERT INTO tokens(hash,organizer_id,expires_at) VALUES(?,?,?)").run(sha256(token), o.id, now() + 12 * 3600_000);
  return json({ ok: true, token, org: o.org_name });
});

route_("GET", "/api/orgs/me", ({ req }) => {
  const id = orgOf(req) ?? fail(401, "Please log in.");
  const o = db.query("SELECT email, org_name FROM organizers WHERE id=?").get(id) as any;
  const list = [...rooms.values()].filter((r) => r.organizerId === id).map((r) => ({ code: r.code, name: r.engine.settings.name, status: r.engine.status, pack: r.pack, startsAt: r.engine.settings.startsAt, participants: r.engine.placesUsed }));
  return json({ email: o.email, org: o.org_name, engagements: list });
});

// ----- public engagement info + join -----
route_("GET", "/api/e/:code", ({ m }) => json(publicInfo(getRoom(m[1]!))));

route_("POST", "/api/e/:code/join", async ({ req, m, server }) => {
  const room = getRoom(m[1]!), b = await body(req);
  const dev = deviceOf(req) ?? fail(400, "Missing device.");
  ipLimit(ipOf(req, server));
  const n = normalize(b.raw, b.country || room.engine.settings.defaultCountry);
  if (!n.ok) return json({ t: "bad", reason: n.reason });
  const r = room.engine.joinByNumber(dev, n.e164);
  room.dirty = true;
  if (r.t === "consent") return json({ t: "consent", name: maskName(r.p.name), e164Display: maskNumber(n.e164) });
  if (r.t === "game") return json({ t: "game" });
  if (r.t === "wait") return json({ t: "wait" });
  if (r.t === "ask") return json({ t: "ask", display: maskNumber(n.e164) });
  if (r.k === "inuse") room.touch();
  return json({ t: "err", k: r.k });
});

route_("POST", "/api/e/:code/confirm", async ({ req, m }) => {
  const room = getRoom(m[1]!), b = await body(req);
  const dev = deviceOf(req) ?? fail(400, "Missing device.");
  if (!b.consent) fail(400, "Please tick the consent box.");
  const n = normalize(b.raw, b.country || room.engine.settings.defaultCountry);
  if (!n.ok) fail(400, n.reason);
  const p = room.engine.participants.find((x) => x.e164 === n.e164) ?? fail(404, "This number is not on the list.");
  orErr(room.engine.confirmJoin(dev, p.id), 0);
  room.touch(true);
  return json({ ok: true });
});

route_("POST", "/api/e/:code/request", async ({ req, m }) => {
  const room = getRoom(m[1]!), b = await body(req);
  const dev = deviceOf(req) ?? fail(400, "Missing device.");
  if (!b.consent) fail(400, "Please tick the consent box.");
  const n = normalize(b.raw, b.country || room.engine.settings.defaultCountry);
  if (!n.ok) fail(400, n.reason);
  const name = String(b.name ?? "").trim();
  if (name.length < 2) fail(400, "Enter your name.");
  orErr(room.engine.askToJoin(dev, { name, info: String(b.info ?? "").slice(0, 60), e164: n.e164 }), 0);
  room.touch();
  return json({ ok: true });
});

route_("GET", "/api/e/:code/status", ({ req, m }) => {
  const room = getRoom(m[1]!), dev = deviceOf(req) ?? fail(400, "Missing device.");
  const e = room.engine;
  if (e.participants.some((p) => p.device === dev)) return json({ state: "in" });
  if (e.waiting.some((w) => w.device === dev)) return json({ state: e.entryOpen ? "waiting" : "closed" });
  if (room.declined.has(dev)) return json({ state: "declined" });
  return json({ state: "none" });
});

route_("GET", "/api/e/:code/me", ({ req, m }) => {
  const room = getRoom(m[1]!), dev = deviceOf(req) ?? fail(400, "Missing device.");
  const p = room.engine.participants.find((x) => x.device === dev && x.status === "joined");
  if (!p) fail(401, "not_joined");
  return json(meState(room, p.id, req));
});

// ----- passes + role links -----
function findByPass(code: string) { for (const r of rooms.values()) { const p = r.engine.participants.find((x) => x.passCode === code); if (p) return { room: r, p }; } return null; }
function findByRole(code: string) { for (const r of rooms.values()) { const p = r.engine.participants.find((x) => x.roleLink === code); if (p) return { room: r, p }; } return null; }

route_("POST", "/api/p/:pass/open", ({ req, m, server }) => {
  const dev = deviceOf(req) ?? fail(400, "Missing device.");
  ipLimit(ipOf(req, server));
  const f = findByPass(m[1]!);
  if (!f) { for (const r of rooms.values()) { const x = r.engine.openPass(dev, m[1]!); if (x.t === "err" && x.k === "cancelled") return json({ t: "err", k: "cancelled" }); } return json({ t: "err", k: "badlink" }); }
  const r = f.room.engine.openPass(dev, m[1]!);
  if (r.t === "err") { f.room.touch(); return json({ t: "err", k: r.k, engagement: publicInfo(f.room) }); }
  if (r.t === "game") return json({ t: "game", engagement: publicInfo(f.room) });
  return json({ t: "pass", name: f.p.name, kind: f.p.kind, engagement: publicInfo(f.room) });
});
route_("POST", "/api/p/:pass/confirm", async ({ req, m }) => {
  const dev = deviceOf(req) ?? fail(400, "Missing device.");
  const b = await body(req);
  if (!b.consent) fail(400, "Please tick the consent box.");
  const f = findByPass(m[1]!) ?? fail(404, "This pass is not valid.");
  orErr(f.room.engine.confirmJoin(dev, f.p.id), 0);
  f.room.touch(true);
  return json({ ok: true, code: f.room.code });
});
route_("POST", "/api/r/:code/open", ({ req, m }) => {
  const dev = deviceOf(req) ?? fail(400, "Missing device.");
  const f = findByRole(m[1]!);
  if (!f) return json({ t: "err", k: "badlink" });
  if (f.p.status === "joined" && f.p.device !== dev) { f.room.engine.raiseConflict(f.p, dev); f.room.touch(); return json({ t: "err", k: "inuse" }); }
  if (f.p.status === "joined") return json({ t: "ok", code: f.room.code, role: f.p.role, name: f.p.name, engagement: publicInfo(f.room) });
  if (!f.room.engine.entryOpen) return json({ t: "err", k: "closed" });
  return json({ t: "role", name: f.p.name, role: f.p.role, engagement: publicInfo(f.room) });
});
route_("POST", "/api/r/:code/confirm", async ({ req, m }) => {
  const dev = deviceOf(req) ?? fail(400, "Missing device.");
  const b = await body(req);
  if (!b.consent) fail(400, "Please tick the consent box.");
  const f = findByRole(m[1]!) ?? fail(404, "This link is not valid.");
  orErr(f.room.engine.confirmJoin(dev, f.p.id), 0);
  f.room.touch(true);
  return json({ ok: true, code: f.room.code, role: f.p.role });
});

// participant-side passes and invites
route_("POST", "/api/e/:code/me/passes", async ({ req, m }) => {
  const room = getRoom(m[1]!), a = actorOf(req, room);
  if (!a || a.kind === "organizer") fail(403, "Not allowed.");
  const b = await body(req);
  const n = normalize(b.raw, b.country || room.engine.settings.defaultCountry);
  if (!n.ok) fail(400, n.reason);
  const r = room.engine.createPass((a as any).pid, { name: String(b.name ?? ""), e164: n.e164, kind: b.kind === "family" ? "family" : "colleague" });
  if (!r.ok) fail(400, r.reason);
  room.touch(true);
  return json({ ok: true, link: `${origin(req)}/p/${r.p.passCode}`, name: r.p.name });
});
route_("DELETE", "/api/e/:code/me/passes/:pid", ({ req, m }) => {
  const room = getRoom(m[1]!), a = actorOf(req, room);
  if (!a || a.kind === "organizer") fail(403, "Not allowed.");
  const t = room.engine.participants.find((x) => x.id === m[2]);
  if (!t || t.invitedBy !== (a as any).pid) fail(403, "Not your pass.");
  orErr(room.engine.cancelPass(t.id), 0); room.touch(true);
  return json({ ok: true });
});
route_("POST", "/api/e/:code/me/passes/:pid/reissue", ({ req, m }) => {
  const room = getRoom(m[1]!), a = actorOf(req, room);
  if (!a || a.kind === "organizer") fail(403, "Not allowed.");
  const t = room.engine.participants.find((x) => x.id === m[2]);
  if (!t || t.invitedBy !== (a as any).pid) fail(403, "Not your pass.");
  orErr(room.engine.reissuePass(t.id), 0); room.touch(true);
  return json({ ok: true, link: `${origin(req)}/p/${t.passCode}` });
});
route_("POST", "/api/e/:code/me/invite", async ({ req, m }) => {
  const room = getRoom(m[1]!), a = actorOf(req, room);
  if (!a || a.kind === "organizer") fail(403, "Not allowed.");
  const b = await body(req);
  const n = normalize(b.raw, b.country || room.engine.settings.defaultCountry);
  if (!n.ok) fail(400, n.reason);
  orErr(room.engine.askToJoin(null, { name: String(b.name ?? "").trim(), info: String(b.info ?? ""), e164: n.e164, invitedBy: (a as any).pid }), 0);
  room.touch();
  return json({ ok: true });
});

// ----- console (organizer / host) -----
route_("GET", "/api/e/:code/console", ({ req, m }) => {
  const room = getRoom(m[1]!), a = actorOf(req, room);
  needConsole(a);
  return json(consoleState(room, a!, req));
});

route_("PATCH", "/api/e/:code/settings", async ({ req, m }) => {
  const room = getRoom(m[1]!), who = needConsole(actorOf(req, room)), b = await body(req);
  const allowed = ["name", "limit", "familyLimit", "familyCanWin", "participantInvites", "ticketMode", "callMode", "defaultCountry", "startsAt", "tz", "orgName"];
  const patch: any = {};
  for (const k of allowed) if (k in b) patch[k] = b[k];
  orErr(room.engine.updateSettings(who, patch), 0);
  if (patch.limit && patch.limit > room.pack) fail(400, "To raise the limit, upgrade your pack.");
  room.touch(true);
  return json({ ok: true });
});

route_("PUT", "/api/e/:code/rewards", async ({ req, m }) => {
  const room = getRoom(m[1]!), a = actorOf(req, room); needOrganizer(a);
  const b = await body(req);
  let lines: RewardLine[];
  if (Array.isArray(b.spec)) lines = makeRewardLines(b.spec.map((s: any) => ({ pattern: s.pattern as PatternId, scope: s.scope === "two_ticket" ? "two_ticket" : "ticket", texts: (s.texts as string[]).map((t) => String(t)) })));
  else lines = b.lines;
  orErr(room.engine.setRewards("organizer", lines), 0);
  room.touch(true);
  return json({ ok: true });
});
route_("PUT", "/api/e/:code/breaks", async ({ req, m }) => {
  const room = getRoom(m[1]!), a = actorOf(req, room); needOrganizer(a);
  const b = await body(req);
  orErr(room.engine.setBreaks("organizer", b.breaks ?? []), 0);
  room.touch(true);
  return json({ ok: true });
});

route_("POST", "/api/e/:code/upload/check", async ({ req, m }) => {
  const room = getRoom(m[1]!), a = actorOf(req, room); needOrganizer(a);
  const b = await body(req);
  return json(checkUpload(String(b.text ?? ""), b.country || room.engine.settings.defaultCountry, (e) => !!room.engine.numberInEngagement(e)));
});
route_("POST", "/api/e/:code/upload/commit", async ({ req, m }) => {
  const room = getRoom(m[1]!), a = actorOf(req, room); needOrganizer(a);
  const b = await body(req);
  const items = (b.items ?? []) as { name?: string; e164: string }[];
  const r = room.engine.addParticipants(items);
  if (!r.ok) fail(400, r.reason);
  room.touch(true);
  return json({ ok: true, added: items.length });
});

route_("POST", "/api/e/:code/people/bulk", async ({ req, m }) => {
  const room = getRoom(m[1]!), who = needConsole(actorOf(req, room)), b = await body(req);
  const ids: string[] = b.ids ?? [];
  if (b.action === "role") {
    for (const id of ids) orErr(room.engine.setRole(who, id, b.role, b.cap), 0);
    room.touch(true);
    return json({ ok: true });
  }
  if (b.action === "remove") {
    const r = room.engine.removeParticipants(who, ids);
    if (typeof r === "string") fail(400, r);
    room.touch(true);
    return json({ ok: true, removed: r.removed.length });
  }
  fail(400, "Unknown action.");
  return json({});
});
route_("POST", "/api/e/:code/people/pass", async ({ req, m }) => {
  const room = getRoom(m[1]!), who = needConsole(actorOf(req, room)); void who;
  const b = await body(req);
  const n = normalize(b.raw, b.country || room.engine.settings.defaultCountry);
  if (!n.ok) fail(400, n.reason);
  const r = room.engine.createPass(String(b.senderId), { name: String(b.name ?? ""), e164: n.e164, kind: b.kind === "family" ? "family" : "colleague" });
  if (!r.ok) fail(400, r.reason);
  room.touch(true);
  return json({ ok: true, link: `${origin(req)}/p/${r.p.passCode}` });
});

route_("POST", "/api/e/:code/waiting/admit", async ({ req, m }) => {
  const room = getRoom(m[1]!); needConsole(actorOf(req, room));
  const b = await body(req);
  const ids: string[] = b.all ? room.engine.waiting.map((w) => w.id) : b.ids ?? [];
  orErr(room.engine.admit(ids), 0); room.touch(true);
  return json({ ok: true });
});
route_("POST", "/api/e/:code/waiting/decline", async ({ req, m }) => {
  const room = getRoom(m[1]!); needConsole(actorOf(req, room));
  const b = await body(req);
  const list = room.engine.decline(b.ids ?? []);
  list.forEach((w) => w.device && room.declined.add(w.device));
  room.touch();
  return json({ ok: true });
});
route_("POST", "/api/e/:code/conflicts/:cid/resolve", async ({ req, m }) => {
  const room = getRoom(m[1]!); needConsole(actorOf(req, room));
  const b = await body(req);
  orErr(room.engine.resolveConflict(m[2]!, b.res === "moved" ? "moved" : "kept"), 0);
  room.touch(true);
  return json({ ok: true });
});

route_("POST", "/api/e/:code/start", ({ req, m }) => {
  const room = getRoom(m[1]!); needOrganizer(actorOf(req, room));
  orErr(room.engine.start(), 0); room.touch(true);
  return json({ ok: true });
});
route_("POST", "/api/e/:code/end", ({ req, m }) => {
  const room = getRoom(m[1]!); needOrganizer(actorOf(req, room));
  room.engine.end(); room.touch(true);
  return json({ ok: true });
});
route_("POST", "/api/e/:code/draw", ({ req, m }) => {
  const room = getRoom(m[1]!), who = needConsole(actorOf(req, room));
  orErr(room.engine.hostDraw(who), 0); room.touch();
  return json({ ok: true });
});
route_("POST", "/api/e/:code/pause", async ({ req, m }) => {
  const room = getRoom(m[1]!); needConsole(actorOf(req, room));
  const b = await body(req);
  const reason = String(b.reason ?? "").trim();
  if (!reason) fail(400, "Choose a reason.");
  orErr(room.engine.emergency(reason), 0); room.touch();
  return json({ ok: true });
});
route_("POST", "/api/e/:code/resume", ({ req, m }) => { const room = getRoom(m[1]!); needConsole(actorOf(req, room)); room.engine.resume(); room.touch(); return json({ ok: true }); });
route_("POST", "/api/e/:code/endbreak", ({ req, m }) => { const room = getRoom(m[1]!); needConsole(actorOf(req, room)); room.engine.endBreak(); room.touch(); return json({ ok: true }); });

route_("POST", "/api/e/:code/raise-limit", async ({ req, m }) => {
  const room = getRoom(m[1]!); needOrganizer(actorOf(req, room));
  const b = await body(req), pack = Number(b.pack);
  if (!PACKS.some((p) => p[0] === pack) || pack <= room.pack) fail(400, "Choose a bigger pack.");
  const diff = price(pack, room.currency).total - price(room.pack, room.currency).total;
  db.query("INSERT INTO orders(id,organizer_id,engagement_code,pack,currency,total,tax,status,created_at,upgrade_of) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run("ord_" + rid(8), room.organizerId, room.code, pack, room.currency, diff, 0, "paid", now(), room.code);
  room.pack = pack;
  orErr(room.engine.updateSettings("organizer", { limit: pack }), 0);
  room.touch(true);
  return json({ ok: true, paid: diff, currency: room.currency });
});

route_("GET", "/api/e/:code/report", ({ req, m }) => {
  const room = getRoom(m[1]!); needOrganizer(actorOf(req, room));
  if (room.engine.status === "purged") return json({ purged: true, summary: room.engine.summary });
  return json(room.engine.report());
});

if (DEV) {
  route_("POST", "/api/dev/purge/:code", ({ m }) => { const room = getRoom(m[1]!); purgeRoom(room); return json({ ok: true, status: room.engine.status, summary: room.engine.summary }); });
  route_("GET", "/api/dev/outbox", () => json({ note: "see data/outbox" }));
}

// ---------- static ----------
const MIME: Record<string, string> = { html: "text/html; charset=utf-8", css: "text/css", js: "text/javascript", json: "application/json", svg: "image/svg+xml", png: "image/png", webp: "image/webp", ico: "image/x-icon", m4a: "audio/mp4", mp3: "audio/mpeg" };
function serveStatic(path: string): Response {
  let file = path === "/" ? "/index.html" : path;
  if (/^\/(e|p)\/[^/]+$/.test(file)) file = "/play.html";
  else if (/^\/r\/[^/]+$/.test(file) || file === "/console") file = "/console.html";
  const full = pnorm(join(WEB_DIR, file));
  if (!full.startsWith(WEB_DIR) || !existsSync(full) || file.includes("/_")) return new Response("Not found", { status: 404 });
  const ext = full.split(".").pop() ?? "";
  return new Response(Bun.file(full), { headers: { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "no-cache" } });
}

// ---------- server ----------
const server = Bun.serve<WSData>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const code = url.searchParams.get("e") ?? "", room = rooms.get(code);
      if (!room) return new Response("no engagement", { status: 404 });
      const t = url.searchParams.get("t"), d = url.searchParams.get("d");
      let data: WSData | null = null;
      if (t) {
        const r = db.query("SELECT organizer_id, expires_at FROM tokens WHERE hash=?").get(sha256(t)) as any;
        if (r && r.expires_at > now() && r.organizer_id === room.organizerId) data = { code, kind: "org", console: true };
      } else if (d && d.length >= 16) {
        const p = room.engine.participants.find((x) => x.device === sha256(d) && x.status === "joined");
        if (p) data = { code, kind: "p", pid: p.id, console: p.role === "host" };
      }
      if (!data) return new Response("unauthorized", { status: 401 });
      return server.upgrade(req, { data }) ? undefined : new Response("upgrade failed", { status: 400 });
    }
    if (url.pathname.startsWith("/api/")) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.re);
        if (!m) continue;
        try { return await r.h({ req, url, m, server }); }
        catch (e) {
          if (e instanceof HttpError) return json({ error: e.message }, e.status);
          console.error(e);
          return json({ error: "Something went wrong. Please try again." }, 500);
        }
      }
      return json({ error: "Not found" }, 404);
    }
    return serveStatic(url.pathname);
  },
  websocket: {
    open(ws) {
      const room = rooms.get(ws.data.code)!;
      room.sockets.add(ws);
      ws.send(JSON.stringify({ type: "state", ...room.engine.publicState() }));
    },
    message(ws, raw) {
      const room = rooms.get(ws.data.code);
      if (!room) return;
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      const e = room.engine;
      if (msg.type === "claim" && ws.data.kind === "p" && ws.data.pid) {
        const err = e.claim(ws.data.pid, { ticket: msg.ticket, pattern: msg.pattern, cut: Array.isArray(msg.cut) ? msg.cut.filter((n: unknown) => Number.isInteger(n)) : [] });
        ws.send(JSON.stringify({ type: "claimAck", error: err, pattern: msg.pattern, ticket: msg.ticket }));
        room.touch();
      } else if (msg.type === "talk" && ws.data.console) {
        room.send(() => true, { type: "talk", on: !!msg.on });
      } else if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
    },
    close(ws) { rooms.get(ws.data.code)?.sockets.delete(ws); },
  },
});

console.log(`Corporate Tambola local server on http://localhost:${server.port}  (dev=${DEV} fast=${FAST})  data=${DATA_DIR}`);
