// 250-player game harness (no network, no real payments, never production).
// Runs the REAL Worker code (`handle()` from apps/edge/src/worker.ts) on an in-memory SQLite stand-in for D1, with 250 REAL PhoneRuntime instances (the same code the phone page runs)
// in VIRTUAL TIME (one tick = one 3-second public-beacon round) and a fake public beacon that cannot be forged or read ahead of time.
// Payments: none. The game is made by the owner's test account (demo1@xyz.in + RUNNER_KEY = the owner "test price" of Rs 0, see OWNER_TEST_FREE in worker.ts).
// Mail: no mail key is set, so every mail the Worker sends is kept in the `outbox` table, where the harness reads it.
import { createHash } from "node:crypto";
import { type Env, handle as realHandle } from "../../apps/edge/src/worker";
import { handle } from "../../apps/edge/test/with-terms";
import { makeD1 } from "../../apps/edge/test/d1-sqlite";
import { PhoneRuntime } from "../../packages/beacon/src/phone-runtime";
import { callRoundR, checkClaims, settleAll, ticketsFor, completionIndexKey } from "../../packages/beacon/src/game";
import { deriveCalls, roundAt, roundTimeMs, type Fetcher } from "../../packages/beacon/src";
import { cfgOf, nextMessage, publicKeyFromSecret, readPublished, resolveControl, signControlWithSecret, type KV } from "../../packages/beacon/src/control";
import { GRACE_ROUNDS, defaultCfg, keysInPlay, roundEid, type EngagementCfg } from "../../packages/beacon/src/config";
import { hostGameOf } from "../../packages/beacon/src/game";
import { countFromOf } from "../../packages/beacon/src/prize-engine";
import { storedHolds } from "../../apps/edge/src/claimhold";

export const RUNNER_KEY = "test-runner-key-test-runner-key-test0000";
export const T0 = Date.UTC(2026, 10, 20, 10, 0, 0); // 15:30 IST, 20 Nov 2026 (after every cut-over date in the code)
export const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
export const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export interface ReqStat { route: string; status: number; wallMs: number; cpuMs: number }
export type Json = any;

/** No game may open a network connection: any outbound fetch is refused and listed in the record. */
const G = globalThis as any;
if (!G.__g250) { G.__g250 = { blocked: [] as string[] }; G.fetch = async (u: any) => { G.__g250.blocked.push(String(u?.url ?? u).slice(0, 120)); throw new Error("outbound network is blocked in the 250x10 harness: " + String(u?.url ?? u)); }; }
export const blockedFetches = (): string[] => G.__g250.blocked;

export class World {
  d = makeD1(); env: Env;
  /** virtual time since T0, in ms */
  t = 0;
  stats: ReqStat[] = [];
  errorSamples: { status: number; route: string; msg: string }[] = [];
  private chain: Promise<unknown> = Promise.resolve();
  rssPeak = 0; cpu0 = process.cpuUsage(); wall0 = performance.now();
  constructor(readonly seed: string, extra: Record<string, unknown> = {}) {
    // the same settings the live Worker has (apps/edge/wrangler.toml): 80,000 writes a day budget, 12-second numbers only
    this.env = { DB: this.d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY, DAILY_WRITE_BUDGET: "80000", ONLY_12S: "1", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt", DATA_KEY: "dk", ...extra } as any;
  }
  get raw() { return this.d.raw; }
  utc = () => T0 + this.t;
  now = () => this.utc();
  round = () => roundAt(this.utc());
  /** One request, one at a time (the Worker is single-threaded here), so wall and CPU time belong to exactly this request. */
  call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, at?: number): Promise<{ status: number; body: Json }> {
    const run = async () => {
      const req = new Request("http://x" + path, { method, headers: { "content-type": "application/json", "x-runner-key": RUNNER_KEY, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      const c0 = process.cpuUsage(), w0 = performance.now();
      const res = await handle(req, this.env, at ?? this.utc());
      const c1 = process.cpuUsage(c0), w1 = performance.now();
      const text = await res.text(); let j: Json = {}; try { j = text ? JSON.parse(text) : {}; } catch { j = { _raw: text.slice(0, 200) }; }
      const route = method + " " + path.replace(/\/z\/[A-Za-z0-9_-]+/, "/z/:id").replace(/\/(ctk|cth|cta)_[A-Za-z0-9]+/g, "/:key").replace(/[0-9a-f]{24,}/g, ":hex").replace(/\?.*/, "");
      this.stats.push({ route, status: res.status, wallMs: w1 - w0, cpuMs: (c1.user + c1.system) / 1000 });
      if (res.status >= 400 && this.errorSamples.length < 400) this.errorSamples.push({ status: res.status, route, msg: String(j?.error ?? j?._raw ?? "").slice(0, 160) });
      if ((this.stats.length & 255) === 0) this.rssPeak = Math.max(this.rssPeak, process.memoryUsage().rss);
      return { status: res.status, body: j };
    };
    const p = this.chain.then(run, run); this.chain = p.catch(() => {}); return p;
  }
  kv: KV = { get: async (k) => (this.raw.query("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} };
  /** the public control file, as a phone reads it */
  published = (eid: string) => readPublished(this.kv, eid);
  q = (sql: string, ...a: any[]) => this.raw.prepare(sql).all(...a) as any[];
  one = (sql: string, ...a: any[]) => this.raw.prepare(sql).get(...a) as any;
  outbox = () => this.q("SELECT * FROM outbox ORDER BY id");
  summary() {
    this.rssPeak = Math.max(this.rssPeak, process.memoryUsage().rss);
    const byStatus: Record<string, number> = {}; for (const s of this.stats) { const k = String(s.status); byStatus[k] = (byStatus[k] ?? 0) + 1; }
    const pct = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!; };
    const byRoute: Record<string, { n: number; p50: number; p95: number; max: number; cpuMax: number; over10: number }> = {};
    const groups = new Map<string, ReqStat[]>(); for (const s of this.stats) { const a = groups.get(s.route) ?? []; a.push(s); groups.set(s.route, a); }
    for (const [r, a] of groups) byRoute[r] = { n: a.length, p50: +pct(a.map((x) => x.cpuMs), 50).toFixed(2), p95: +pct(a.map((x) => x.cpuMs), 95).toFixed(2), max: +Math.max(...a.map((x) => x.wallMs)).toFixed(1), cpuMax: +Math.max(...a.map((x) => x.cpuMs)).toFixed(1), over10: a.filter((x) => x.cpuMs > 10).length };
    const cpu = process.cpuUsage(this.cpu0);
    const writes = (this.one("SELECT COALESCE(SUM(writes),0) w FROM usage") as any).w as number;
    return { requests: this.stats.length, byStatus, byRoute, cpuSec: +((cpu.user + cpu.system) / 1e6).toFixed(1), wallSec: +((performance.now() - this.wall0) / 1000).toFixed(1), rssPeakMB: Math.round(this.rssPeak / 1048576), heapMB: Math.round(process.memoryUsage().heapUsed / 1048576), storeWrites: writes, writeBudget: 80000, writeBudgetPct: +((writes / 80000) * 100).toFixed(1), reqOver10msCpu: this.stats.filter((s) => s.cpuMs > 10).length, reqOver50msCpu: this.stats.filter((s) => s.cpuMs > 50).length, maxReqCpuMs: +Math.max(0, ...this.stats.map((s) => s.cpuMs)).toFixed(1) };
  }
}

/* ------------------------------------------------------------------ the fake public beacon */
export const rndOf = (seed: string) => (r: number) => sha("g250|" + seed + "|" + r);

/* ------------------------------------------------------------------ people */
export interface PhoneOpts {
  joinAtMs?: number; /** the page is closed / the phone is offline while virtual time t is in [offFrom, offTo) (ms since T0) */ offFrom?: number; offTo?: number;
  liar?: boolean; blockedAll?: boolean; flaky?: number; cheater?: boolean; ip?: string; name?: string; phone?: string; empId?: string; email?: string;
  maxTries?: number; noClaim?: boolean; /** claims only these houses (a player who taps along but never presses Claim for the rest) */
}
export interface Phone {
  i: number; rt: PhoneRuntime; store: Map<string, string>; opts: PhoneOpts; phone: string; name: string; empId?: string; ip: string;
  joinedAt: number | null; joinTries: number; joinError: string | null; pageOpen: boolean; w: World; present: boolean; presentAt: number | null; nextCheckinTry: number; checkinError: string | null;
}
let phoneStepRef = { v: 0 };
export const stepNow = () => phoneStepRef.v;
export const setStep = (n: number) => { phoneStepRef.v = n; };

export function makePhone(w: World, eid: string, i: number, o: PhoneOpts, store = new Map<string, string>()): Phone {
  const rnd = rndOf(w.seed);
  const ph: Phone = { i, rt: null as any, store, opts: o, phone: o.phone ?? "9" + String(100000000 + i), name: o.name ?? "Player " + (i + 1), empId: o.empId, ip: o.ip ?? `10.${(i >> 8) & 255}.${i & 255}.${(i * 7) % 250 + 1}`, joinedAt: null, joinTries: 0, joinError: null, pageOpen: true, w, present: false, presentAt: null, nextCheckinTry: 0, checkinError: null };
  const isOff = () => (o.offFrom !== undefined && w.t >= o.offFrom && w.t < (o.offTo ?? 1e15)) || !ph.pageOpen;
  let rs = 12345 + i * 77; const rng = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 0x100000000);
  const fetcher: Fetcher = async (url) => {
    if (o.blockedAll || isOff()) throw new Error("blocked");
    const last = url.split("/").pop()!; const nowR = w.round(); const r = last === "latest" ? nowR : Number(last);
    if (r > nowR) return { ok: false, status: 404, json: async () => ({}) }; // a future round does not exist yet: nobody can read it ahead of time
    if (o.liar && url.includes("api2")) return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r + 7), signature: "aa" }) }; // a lying mirror
    return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) };
  };
  ph.rt = new PhoneRuntime(eid, {
    api: async (m, path, b) => {
      if (isOff() || (o.flaky && rng() < o.flaky)) throw new Error("offline");
      const r = await w.call(m, path, b, { "cf-connecting-ip": ph.ip });
      if (r.status >= 400) throw Object.assign(new Error(r.body?.error ?? "http " + r.status), { status: r.status, body: r.body });
      return r.body;
    },
    beacon: { fetcher, mirrors: ["https://api.t", "https://api2.t", "https://api3.t"], timeoutMs: 400 },
    mono: () => w.t, store: { get: (k) => store.get(k) ?? null, set: (k, v) => void store.set(k, v) },
    verify: (x) => x.signature === "aa" && x.randomness === rnd(x.round),
  });
  return ph;
}

export async function phoneJoin(p: Phone): Promise<boolean> {
  p.joinTries++;
  if (p.rt.phase === "boot") await p.rt.boot();
  const ok = await p.rt.join(p.opts.empId !== undefined || p.empId ? (p.opts.phone ?? "") : p.phone, p.name, undefined, p.empId, p.opts.email);
  if (ok) { if (p.joinedAt === null) p.joinedAt = p.w.t; p.joinError = null; } else p.joinError = p.rt.view().error;
  return ok;
}

/* ------------------------------------------------------------------ organizer, hosts */
export interface Org { token: string; email: string; h: Record<string, string> }
/** The owner's test account (demo1@xyz.in, fixed test code, Rs 0 packs up to 1,000 people; needs RUNNER_KEY). */
export async function ownerTestOrganizer(w: World, ip = "9.9.9.9"): Promise<Org> {
  const r = await w.call("POST", "/api/auth/verify", { email: "demo1@xyz.in", code: "123456" }, { "cf-connecting-ip": ip });
  if (r.status !== 200 || !r.body.token) throw new Error("owner test sign-in failed: " + r.status + " " + JSON.stringify(r.body).slice(0, 200));
  return { token: r.body.token, email: "demo1@xyz.in", h: { "x-organizer": r.body.token } };
}
export async function newOrganizer(w: World, email: string, ip = "9.9.9.8"): Promise<Org> {
  const r = await w.call("POST", "/api/start", { email }, { "cf-connecting-ip": ip });
  if (r.status !== 200) throw new Error("start failed " + JSON.stringify(r.body).slice(0, 200));
  return { token: r.body.token, email, h: { "x-organizer": r.body.token } };
}
export const ORG_SECRET = "11".repeat(32), HOST_SECRET = "22".repeat(32);

export interface GameSpec {
  id: string; startInRounds: number; cap?: number; startMode?: "auto" | "manual"; callMode?: "auto" | "host"; verify?: "number" | "id" | "both" | "either"; employeesOnly?: boolean; whoCanJoin?: "anyone" | "list";
  tickets?: 1 | 2; rewards?: any[]; ties?: "share" | "next"; afterPrizes?: "end" | "keep"; name?: string; rounds?: number; extra?: Record<string, unknown>;
}
export const ordinals = (pattern: string, n: number, text = "") => Array.from({ length: n }, (_, k) => ({ pattern, scope: "ticket", ordinal: k + 1, text: text || pattern }));
export const DEFAULT_REWARDS = [
  { pattern: "early5", scope: "ticket", ordinal: 1, text: "Mug" }, { pattern: "top", scope: "ticket", ordinal: 1, text: "Voucher" }, { pattern: "mid", scope: "ticket", ordinal: 1, text: "Pen" },
  { pattern: "bot", scope: "ticket", ordinal: 1, text: "Cap" }, { pattern: "corners", scope: "ticket", ordinal: 1, text: "Bag" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "Hamper" }, { pattern: "full", scope: "ticket", ordinal: 2, text: "Hamper 2" },
];

/** Create, set up and publish one game as the owner's test account (no payment). Returns the start round. */
export async function createGame(w: World, org: Org, s: GameSpec, publish = true) {
  const startRound = w.round() + s.startInRounds;
  const body: any = { id: s.id, startRound, callSeconds: s.callMode === "host" ? undefined : 12, cap: s.cap ?? 250, name: s.name ?? "Game " + s.id, tickets: s.tickets ?? 1, rewards: s.rewards ?? DEFAULT_REWARDS, ties: s.ties ?? "share", ...(s.startMode ? { startMode: s.startMode } : {}), ...(s.callMode ? { callMode: s.callMode } : {}), ...(s.afterPrizes ? { afterPrizes: s.afterPrizes } : {}), ...(s.rounds ? { rounds: s.rounds } : {}), ...(s.verify ? { verify: s.verify } : {}), ...(s.employeesOnly !== undefined ? { employeesOnly: s.employeesOnly } : {}), ...(s.whoCanJoin === "list" ? { whoCanJoin: "list" } : {}), ...(s.extra ?? {}) };
  const c = await w.call("POST", "/api/z", body, org.h);
  if (c.status !== 200) throw new Error("create failed: " + c.status + " " + JSON.stringify(c.body).slice(0, 300));
  if (c.body.draft) throw new Error("game is a draft (the owner test price did not apply): " + JSON.stringify(c.body).slice(0, 200));
  if (publish) {
    const p = await w.call("POST", `/api/z/${s.id}/publish`, { email: org.email === "demo1@xyz.in" ? "demo1@xyz.in" : org.email, phone: "98765 43210" }, org.h);
    if (p.status !== 200) throw new Error("publish failed: " + p.status + " " + JSON.stringify(p.body).slice(0, 300));
  }
  return { startRound, create: c.body };
}
export async function registerKey(w: World, eid: string, h: Record<string, string>, secret = ORG_SECRET) {
  return w.call("PUT", `/api/z/${eid}/control/key`, { publicKey: publicKeyFromSecret(secret) }, h);
}
/** Sign and post a control message (pause / resume / next / go / stop / extend) at the virtual time `at` (default now). */
export async function press(w: World, eid: string, secret: string, action: any, extra: Record<string, unknown> = {}, at = w.utc()) {
  const f = await w.published(eid); if (!f) return { status: 0, body: { error: "no control file" } };
  const msg = signControlWithSecret(secret, nextMessage(f, roundAt(at), { action, ...extra }));
  return w.call("POST", `/api/z/${eid}/control`, { message: msg }, {}, at);
}
/** A hand-made control message (for the tests that must be refused: too early, wrong lead, wrong signer). */
export async function rawPress(w: World, eid: string, secret: string, m: { action: string; atBeaconRound: number; signedAtRound?: number; untilRound?: number; seq?: number }, at = w.utc()) {
  const f = await w.published(eid); if (!f) return { status: 0, body: { error: "no control file" } };
  const msg = signControlWithSecret(secret, { engagementId: eid, seq: m.seq ?? f.messages.length + 1, action: m.action as any, atBeaconRound: m.atBeaconRound, signedAtRound: m.signedAtRound ?? roundAt(at), ...(m.untilRound !== undefined ? { untilRound: m.untilRound } : {}) });
  return w.call("POST", `/api/z/${eid}/control`, { message: msg }, {}, at);
}
export async function addHost(w: World, org: Org, label = "Priya", mobile = "9822200011", email = "host@acme.com") {
  const r = await w.call("POST", "/api/org/host", { label, mobile, email }, org.h);
  if (r.status !== 200) throw new Error("add host failed " + r.status + JSON.stringify(r.body).slice(0, 200));
  w.raw.prepare("UPDATE host_state SET verified_ms=?, mobile_ok=1").run(w.utc()); // as if the Host finished the first-open setup (screen has its own tests)
  return { key: r.body.hostKey as string, h: { "x-organizer": r.body.hostKey as string } as Record<string, string> };
}

/* ------------------------------------------------------------------ ground truth from public data */
export interface Truth { refs: Record<number, number[]>; callRounds: Record<number, number[]>; st: ReturnType<typeof resolveControl> | null; settled: ReturnType<typeof settleAll>; settledAllClaimed: ReturnType<typeof settleAll>; pids: string[]; cfg: EngagementCfg }
export async function groundTruth(w: World, eid: string, cfg: EngagementCfg, scheduledRound: number, stride: number): Promise<Truth> {
  const f = await w.published(eid);
  const st = f ? resolveControl(cfgOf(f, hostGameOf(cfg, scheduledRound)), f.messages, await storedHolds(w.env as any, eid)) : null;
  const rnd = rndOf(w.seed); const nowR = w.round();
  const refs: Record<number, number[]> = {}; const callRounds: Record<number, number[]> = {};
  for (let r = 1; r <= cfg.rounds; r++) {
    const rr: string[] = []; const crs: number[] = [];
    for (let k = 0; k < 90; k++) { const cr = callRoundR(st, scheduledRound + GRACE_ROUNDS, stride, cfg.breaks, r, k); if (cr === null || !Number.isFinite(cr) || cr > nowR) break; rr.push(rnd(cr)); crs.push(cr); }
    callRounds[r] = crs;
    refs[r] = deriveCalls(roundEid(eid, r), rr);
  }
  const people = await listParticipants(w, eid); const pids = people.map((x: any) => x.pid);
  const claimsBody = (await w.call("GET", `/api/z/${eid}/claims`, undefined, { "x-organizer": "plat" })).body;
  const claims = (claimsBody.claims ?? []).map((x: any) => ({ pid: x.pid, pattern: x.pattern, round: x.round ?? 1, idx: x.idx, atMs: x.atMs, ...(x.bogey ? { bogey: true as const } : {}) }));
  const countFrom = new Map<string, number>(); for (const x of people) { const cf = countFromOf(Number(x.jr) || 0); if (cf) countFrom.set(x.pid, cf); }
  // who WON is whoever completed a house AND claimed it in time (the owner's rule), a late joiner counts from their own round: exactly what the organizer's console works out
  const settled = Array.from({ length: cfg.rounds }, (_, i) => settleAll(eid, pids, refs[i + 1]!, cfg, i + 1, { countFrom, callRounds: callRounds[i + 1]! }, undefined, { claims, callRounds: callRounds[i + 1]! })).flat();
  const settledAllClaimed = Array.from({ length: cfg.rounds }, (_, i) => settleAll(eid, pids, refs[i + 1]!, cfg, i + 1, { countFrom, callRounds: callRounds[i + 1]! })).flat();
  return { refs, callRounds, st, settled, settledAllClaimed, pids, cfg };
}
export async function listParticipants(w: World, eid: string, h: Record<string, string> = { "x-organizer": "plat" }) {
  const out: any[] = [];
  for (;;) { const pg = await w.call("GET", `/api/z/${eid}/participants?offset=${out.length}`, undefined, h); if (pg.status !== 200) break; out.push(...(pg.body.participants ?? [])); if (!pg.body.participants?.length || out.length >= pg.body.total) break; }
  return out;
}

/** Every phone's log must equal the ground-truth log; a phone that joined after the first number counts only from its own count-from round, so it is compared with that part of the log. */
export function logAgreement(phones: Phone[], ref: number[], callRounds: number[]) {
  const live = phones.filter((p) => p.rt.pid && !p.opts.blockedAll && !p.opts.liar);
  let exact = 0, shorter = 0, wrong = 0; const bad: string[] = [];
  for (const p of live) {
    const l = p.rt.view().log; const cf = countFromOf((p.rt as any).myJr);
    const e = cf ? ref.filter((_, k) => (callRounds[k] ?? Infinity) >= cf) : ref;
    const prefixOk = l.length <= e.length && l.every((n, i) => n === e[i]);
    if (l.length === e.length && prefixOk) exact++; else if (prefixOk) shorter++; else { wrong++; if (bad.length < 5) bad.push(`${p.phone}: len ${l.length} of ${e.length} firstWrong ${l.findIndex((n, i) => n !== e[i])} offline=${p.opts.offFrom !== undefined}`); }
  }
  return { live: live.length, exact, shorter, wrong, bad };
}

export { PhoneRuntime, ticketsFor, completionIndexKey, checkClaims, settleAll, roundAt, roundTimeMs, nextMessage, signControlWithSecret, publicKeyFromSecret, readPublished, resolveControl, cfgOf, callRoundR, deriveCalls, defaultCfg, keysInPlay, roundEid, GRACE_ROUNDS, realHandle };
export type { EngagementCfg, Env };
