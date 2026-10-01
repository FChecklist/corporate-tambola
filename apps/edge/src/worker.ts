// Cloudflare-Workers-shaped store for the zero-server design. It keeps only what must outlive phones: who joined, which claims were made,
// and the settled results. It never draws numbers and never verifies BLS (a free Worker has ~10 ms CPU; one verify costs ~60 ms),
// so the organizer's own console verifies claims against the public log and posts the settled result.
// D1-compatible: env.DB only uses prepare/bind/run/all/first/batch.

export interface D1Result<T = any> { results?: T[]; meta?: { changes?: number } }
export interface D1Stmt { bind(...v: unknown[]): D1Stmt; run(): Promise<D1Result>; all<T = any>(): Promise<D1Result<T>>; first<T = any>(): Promise<T | null> }
export interface D1 { prepare(sql: string): D1Stmt; batch(s: D1Stmt[]): Promise<D1Result[]> }
export interface Env { DB: D1; ORGANIZER_SECRET?: string; DAILY_WRITE_BUDGET?: string }

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS engagement (id TEXT PRIMARY KEY, start_round INTEGER NOT NULL, call_seconds INTEGER NOT NULL, cap INTEGER NOT NULL, created_ms INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS participant (eid TEXT NOT NULL, pid TEXT NOT NULL, phone_hash TEXT NOT NULL, name TEXT, joined_ms INTEGER NOT NULL, PRIMARY KEY (eid, pid))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS participant_phone ON participant (eid, phone_hash)`,
  `CREATE TABLE IF NOT EXISTS claim (eid TEXT NOT NULL, pid TEXT NOT NULL, pattern TEXT NOT NULL, idx INTEGER NOT NULL, at_ms INTEGER NOT NULL, PRIMARY KEY (eid, pid, pattern))`,
  `CREATE TABLE IF NOT EXISTS settled (eid TEXT NOT NULL, pattern TEXT NOT NULL, idx INTEGER NOT NULL, pids TEXT NOT NULL, PRIMARY KEY (eid, pattern))`,
  `CREATE TABLE IF NOT EXISTS usage (day TEXT PRIMARY KEY, writes INTEGER NOT NULL)`,
];

const PATTERNS = new Set(["early5", "top", "mid", "bot", "corners", "star", "full"]);
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("");
const MAX_BODY = 4096;

async function body(req: Request): Promise<any | null> {
  const t = await req.text();
  if (t.length > MAX_BODY) return null;
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

export async function handle(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const url = new URL(req.url);
  const isOrg = !!env.ORGANIZER_SECRET && req.headers.get("x-organizer") === env.ORGANIZER_SECRET;
  if (req.method === "POST" && url.pathname === "/api/e") {
    if (!isOrg) return json({ error: "Not allowed." }, 403);
    const b = await body(req);
    if (!b || !/^[A-Za-z0-9_-]{4,40}$/.test(b.id ?? "") || !Number.isInteger(b.startRound) || !Number.isInteger(b.callSeconds) || b.callSeconds % 3 || b.callSeconds < 6 || !Number.isInteger(b.cap) || b.cap < 1 || b.cap > 100000)
      return json({ error: "Check the engagement details." }, 400);
    if (!(await spend(env, now))) return json({ error: "Busy day. Please try again after midnight UTC." }, 503);
    await env.DB.prepare("INSERT OR IGNORE INTO engagement(id,start_round,call_seconds,cap,created_ms) VALUES(?,?,?,?,?)").bind(b.id, b.startRound, b.callSeconds, b.cap, now).run();
    return json({ ok: true });
  }
  const m = url.pathname.match(/^\/api\/e\/([A-Za-z0-9_-]{4,40})\/(join|claims|settle|results)$/);
  if (!m) return json({ error: "Not found" }, 404);
  const [, eid, action] = m;
  const e = await env.DB.prepare("SELECT * FROM engagement WHERE id=?").bind(eid).first<any>();
  if (!e) return json({ error: "No such engagement." }, 404);

  if (action === "join" && req.method === "POST") {
    const b = await body(req);
    const phone = String(b?.phone ?? "").replace(/\D/g, "");
    if (phone.length < 10 || phone.length > 15) return json({ error: "Enter a valid mobile number." }, 400);
    const ph = await sha(`${eid}|${phone}`);
    const name = typeof b?.name === "string" ? b.name.replace(/[<>`]/g, "").slice(0, 60) : null;
    const have = await env.DB.prepare("SELECT pid FROM participant WHERE eid=? AND phone_hash=?").bind(eid, ph).first<{ pid: string }>();
    if (have) return json({ pid: have.pid, startRound: e.start_round, callSeconds: e.call_seconds, again: true }); // same number twice = same participant, no extra write
    const n = await env.DB.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").bind(eid).first<{ c: number }>();
    if ((n?.c ?? 0) >= e.cap) return json({ error: "This engagement is full." }, 409);
    if (!(await spend(env, now))) return json({ error: "Busy day. Please try again after midnight UTC." }, 503);
    const pid = ph.slice(0, 16);
    await env.DB.prepare("INSERT OR IGNORE INTO participant(eid,pid,phone_hash,name,joined_ms) VALUES(?,?,?,?,?)").bind(eid, pid, ph, name, now).run();
    return json({ pid, startRound: e.start_round, callSeconds: e.call_seconds });
  }
  if (action === "claims" && req.method === "POST") {
    const b = await body(req);
    const list = Array.isArray(b?.claims) ? b.claims.slice(0, 7) : null;
    if (!b || typeof b.pid !== "string" || !list) return json({ error: "Bad claim." }, 400);
    const who = await env.DB.prepare("SELECT pid FROM participant WHERE eid=? AND pid=?").bind(eid, b.pid).first();
    if (!who) return json({ error: "Not a participant of this engagement." }, 403);
    let stored = 0;
    for (const c of list) {
      if (!PATTERNS.has(c?.pattern) || !Number.isInteger(c?.idx) || c.idx < 0 || c.idx > 89) continue;
      if (!(await spend(env, now))) return json({ error: "Busy day. Your claim is kept on your phone and will be sent again.", stored }, 503);
      const r = await env.DB.prepare("INSERT OR IGNORE INTO claim(eid,pid,pattern,idx,at_ms) VALUES(?,?,?,?,?)").bind(eid, b.pid, c.pattern, c.idx, now).run();
      stored += r.meta?.changes ?? 0; // a claim sent twice is stored once
    }
    return json({ ok: true, stored });
  }
  if (action === "claims" && req.method === "GET") {
    if (!isOrg) return json({ error: "Not allowed." }, 403);
    const r = await env.DB.prepare("SELECT pid,pattern,idx FROM claim WHERE eid=? ORDER BY idx,pid").bind(eid).all();
    return json({ claims: r.results ?? [] });
  }
  if (action === "settle" && req.method === "POST") {
    if (!isOrg) return json({ error: "Not allowed." }, 403);
    const b = await body(req);
    if (!b || !Array.isArray(b.results)) return json({ error: "Bad result." }, 400);
    for (const x of b.results) {
      if (!PATTERNS.has(x?.pattern) || !Number.isInteger(x?.idx) || !Array.isArray(x?.pids)) return json({ error: "Bad result." }, 400);
      if (!(await spend(env, now))) return json({ error: "Busy day." }, 503);
      await env.DB.prepare("INSERT INTO settled(eid,pattern,idx,pids) VALUES(?,?,?,?) ON CONFLICT(eid,pattern) DO UPDATE SET idx=excluded.idx, pids=excluded.pids").bind(eid, x.pattern, x.idx, JSON.stringify(x.pids.slice(0, 500))).run();
    }
    return json({ ok: true });
  }
  if (action === "results" && req.method === "GET") {
    const r = await env.DB.prepare("SELECT pattern,idx,pids FROM settled WHERE eid=?").bind(eid).all<any>();
    return json({ results: (r.results ?? []).map((x: any) => ({ pattern: x.pattern, idx: x.idx, count: JSON.parse(x.pids).length })) }); // public: counts only, no ids
  }
  return json({ error: "Not found" }, 404);
}

export default { fetch: (req: Request, env: Env) => handle(req, env) };
