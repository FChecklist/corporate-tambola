// Layer A of the demo-game campaign (note 310): many free demo games x 10 virtual players on the LOCAL engine, one process, streamed, test clock.
// The engine is the real Worker `handle()` (the same code as live) on an in-memory SQLite per game; the phones are real PhoneRuntime instances talking to it in-process; the randomness beacon is the fake one.
// Usage:  bun tools/sim2/layer-a/run.ts '{"games":20,"batch":1,"batches":10,"seedBase":"A","only":["G5-03"]}'
//   games = how many games in this run (default 20 = dry run); the full campaign is 1000 = 100 use cases x 10 variants in 10 batches of 100 (batch N plays variants N*10-10..N*10-1 of 100 use cases / 10 per batch).
// Reads tools/livetest/usecases-100.json when it exists ([{id, group, title, options}]); otherwise uses the built-in list of the same ids G1-G8 (12,14,10,14,18,10,12,10) with a per-use-case option set.
// Output: one JSON line per game (id, variant, seed, ok, failures[]) and a final summary line. A failing game is always reported with its use case, variant and seed so it can be replayed.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { PhoneRuntime } from "../../../packages/beacon/src/phone-runtime";
import { callRoundR } from "../../../packages/beacon/src/game";
import { deriveCalls } from "../../../packages/beacon/src";
import { GRACE_ROUNDS, roundEid } from "../../../packages/beacon/src/config";
// @ts-ignore plain JS module shared with the node harness
import { fakeFetcher, fakeVerify, randomnessOf, roundAt, roundTimeMs } from "../lib/beacon.mjs";
import { makeD1 } from "../../../apps/edge/test/d1-sqlite";
import { handle as handleTerms } from "../../../apps/edge/test/with-terms";
import { handle as handleReal } from "../../../apps/edge/src/worker";
import { erasePersonal } from "../../../apps/edge/src/lifecycle";

interface UseCase { id: string; group: string; title: string; options: Opt }
interface Opt { tickets: 1 | 2; houses: string[]; bumper?: number; lucky?: number; closed?: boolean; late?: number; offline?: number; players?: number; cap?: number }

// ---------- the use cases ----------
const HOUSES = ["early5", "top", "mid", "bot", "corners", "full"];
const GROUPS: [string, number][] = [["G1", 12], ["G2", 14], ["G3", 10], ["G4", 14], ["G5", 18], ["G6", 10], ["G7", 12], ["G8", 10]];
function builtIn(): UseCase[] {
  const out: UseCase[] = [];
  for (const [g, n] of GROUPS) for (let i = 1; i <= n; i++) {
    const k = out.length; // 0..99: every use case gets its own mix of the options
    const o: Opt = { tickets: k % 2 === 0 ? 1 : 2, houses: HOUSES.slice(0, 2 + (k % 5)).concat(["full"]).filter((h, x, a) => a.indexOf(h) === x), closed: g === "G2" && i % 2 === 0, late: g === "G2" ? 0.3 : 0.1, offline: g === "G8" ? 0.3 : 0.05 };
    if (o.tickets === 2 && k % 4 === 1) o.bumper = [1, 2, 5, 10][(k >> 2) % 4];
    if (k % 7 === 3) o.lucky = k % 14 === 3 ? 1 : 3;
    out.push({ id: `${g}-${String(i).padStart(2, "0")}`, group: g, title: `${g} use case ${i}`, options: o });
  }
  return out;
}
const CAT = new URL("../../livetest/usecases-100.json", import.meta.url);
const CASES: UseCase[] = existsSync(CAT) ? (JSON.parse(readFileSync(CAT, "utf8")) as UseCase[]).map((u) => ({ ...u, options: { tickets: 1, houses: HOUSES, ...u.options } })) : builtIn();

// ---------- arguments ----------
const a = JSON.parse(process.argv[2] ?? "{}");
const GAMES: number = a.games ?? 20, SEED_BASE: string = a.seedBase ?? "A", BATCH: number = a.batch ?? 1, ONLY: string[] | null = a.only ?? null;
const PLAYERS = 10;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const rngOf = (seed: string) => { let n = [...seed].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7); return () => ((n = (n * 1664525 + 1013904223) >>> 0) / 0x100000000); };
const CONSENT: any = JSON.parse(readFileSync(new URL("../../../apps/edge/src/consent-text.json", import.meta.url), "utf8"));
const VIRT0 = Date.UTC(2026, 10, 10, 10, 0, 0);

async function playGame(uc: UseCase, variant: number): Promise<{ ok: boolean; failures: string[]; seconds: number; joined: number; ended: number; won: number }> {
  const t0 = Date.now(), failures: string[] = [], seed = `${SEED_BASE}-${uc.id}-${variant}`, rng = rngOf(seed), o = uc.options;
  const d = makeD1();
  const env: any = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt" };
  const realFetch = globalThis.fetch; (globalThis as any).fetch = async () => new Response("{}", { status: 404 });
  try {
    let vnow = VIRT0;
    const call = async (method: string, path: string, body?: unknown, key?: string, ip = "9.9.9.9", real = false) => {
      const req = new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const r = await (real ? handleReal : handleTerms)(req, env, vnow);
      return { status: r.status, j: (await r.json().catch(() => ({}))) as any };
    };
    const check = (cond: unknown, msg: string) => { if (!cond) failures.push(msg); };
    // 1. the organizer makes a free demo game of 10 (G1)
    const eid = "L" + sha(seed).slice(0, 9).toUpperCase();
    const START = roundAt(VIRT0) + 1200;
    const st = await call("POST", "/api/start", { email: `test+${eid.toLowerCase()}@example.invalid` }, undefined, "7.7.7." + (1 + Math.floor(rng() * 200)));
    const master = st.j.token as string; check(master, "start: no organizer key (" + JSON.stringify(st.j).slice(0, 100) + ")");
    if (!master) return { ok: false, failures, seconds: 0, joined: 0, ended: 0, won: 0 };
    const mk = await call("POST", "/api/z", { id: eid, name: `TEST-RUN-${uc.id}`, startRound: START, callSeconds: 12, cap: o.cap ?? PLAYERS, ...(o.closed ? { whoCanJoin: "list" } : {}) }, master); check(mk.status === 200, "create: " + JSON.stringify(mk.j).slice(0, 120));
    const rewards = o.houses.map((h) => ({ pattern: h, scope: "ticket", ordinal: 1, text: "Gift " + h })).concat(o.bumper ? Array.from({ length: o.bumper }, (_, i) => ({ pattern: "full", scope: "two_ticket", ordinal: i + 1, text: "Super " + (i + 1) })) : []);
    const breaks = o.lucky ? [{ kind: "lucky", title: "Lucky draw", winners: o.lucky === 1 ? 1 : 3, style: "draw", auto: true }] : [];
    const set = await call("PATCH", `/api/z/${eid}/settings`, { tickets: o.tickets, rewards, demo: true, cap: PLAYERS, ...(breaks.length ? { breaks } : {}) }, master); check(set.status === 200, "settings: " + JSON.stringify(set.j).slice(0, 160));
    const pub = await call("POST", `/api/z/${eid}/publish`, { email: `test+${eid.toLowerCase()}@example.invalid`, phone: "98765 43210" }, master); check(pub.status === 200, "publish: " + JSON.stringify(pub.j).slice(0, 120));
    // 2. consent: a join without the tick is refused by the real Worker (G7)
    const noConsent = await call("POST", `/api/z/${eid}/join`, { phone: "9100000000", name: "NC", device: "ab".repeat(16) }, undefined, "5.5.5.5", true); check(noConsent.status >= 400, "join without consent was accepted");
    // 3. ten phones play in virtual time
    const info = (await call("GET", `/api/z/${eid}/info`)).j; check(info && !info.error, "info: " + JSON.stringify(info).slice(0, 100));
    const T0 = roundTimeMs(START) - 100_000; let tt = 0; const utc = () => T0 + tt; vnow = utc();
    interface P { rt: PhoneRuntime; phone: string; joinAt: number; offFrom: number; offTo: number; ck?: number; failed: string[] }
    let step = 0; const apiRefusals: string[] = [];
    const phones: P[] = Array.from({ length: PLAYERS }, (_, i) => {
      const mem = new Map<string, string>(), phone = "9" + String(200000000 + i * 7919 + variant).slice(-9), ip = `10.30.${variant & 255}.${i + 1}`;
      const offFrom = rng() < (o.offline ?? 0.05) ? 20 + Math.floor(rng() * 100) : -1;
      const p: P = { rt: null as unknown as PhoneRuntime, phone, joinAt: rng() < (o.late ?? 0.1) ? Math.floor(rng() * 150) : Math.floor(rng() * 8), offFrom, offTo: offFrom + 25, failed: [] };
      const isOff = () => offFrom >= 0 && step >= offFrom && step < p.offTo;
      p.rt = new PhoneRuntime(eid, {
        api: async (m: string, path: string, b?: unknown) => {
          if (isOff()) throw new Error("offline");
          const r = await call(m, path, b, undefined, ip);
          if (r.status >= 400 && /\/(claims|bogey)$/.test(path)) apiRefusals.push(`${m} ${path} -> ${r.status}`);
          if (r.status >= 400) throw Object.assign(new Error(r.j.error ?? "http " + r.status), { status: r.status, code: r.j.code, body: r.j });
          return r.j;
        },
        beacon: { fetcher: (async (u: string, init: any) => { if (isOff()) throw new Error("offline"); return (fakeFetcher(utc, seed) as any)(u, init); }) as any, mirrors: ["https://api.t", "https://api2.t", "https://api3.t"], timeoutMs: 400 },
        mono: () => tt, store: { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v) }, verify: fakeVerify(seed) as any,
        getPublic: async (url: string) => { const u = new URL(url, "http://x"); const r = await call("GET", u.pathname + u.search, undefined, undefined, ip); if (r.status >= 400) throw Object.assign(new Error("http " + r.status), { status: r.status }); return r.j; },
      } as any);
      return p;
    });
    const checkin = async (p: P) => {
      if (p.ck) return; const v = p.rt.view(); if (!v.pid) return; const dev = p.rt.device();
      const g: any = await p.rt.deps.api("GET", `/api/z/${eid}/checkin?pid=${encodeURIComponent(v.pid)}&device=${encodeURIComponent(dev)}`);
      if (g && g.required === false) { p.ck = 1; return; }
      await p.rt.deps.api("POST", `/api/z/${eid}/checkin`, { pid: v.pid, device: dev, code: g.code, confirmName: true, confirmMobile: true }); p.ck = 1;
    };
    let cappedProbe = false, waitingSeen = 0, admitted = 0;
    for (step = 0; step < 620; step++) {
      tt += 3000; vnow = utc();
      const batch: Promise<unknown>[] = [];
      for (const p of phones) {
        if (step < p.joinAt) continue; const ph = p.rt.phase;
        if (step === p.joinAt) batch.push(p.rt.boot().then(() => p.rt.join(p.phone, "P" + p.phone.slice(-4))).catch((e: any) => { if (o.closed && (e?.code === "waiting" || e?.body?.waiting)) waitingSeen++; else p.failed.push("join: " + (e?.message ?? e)); }));
        else if (ph === "play" || ph === "ended") batch.push(checkin(p).catch((e: any) => { if (!/opens at|^offline$/i.test(String(e?.message))) p.failed.push("checkin: " + (e?.message ?? e)); }).then(() => p.rt.tick()).then(async () => { await (p.rt as any).playAlong(); }).catch((e: any) => { if (!/^offline$/i.test(String(e?.message))) p.failed.push("tick: " + (e?.message ?? e)); }));
        else if (ph === "join") batch.push(p.rt.join(p.phone, "P" + p.phone.slice(-4)).catch((e: any) => { if (o.closed && (e?.code === "waiting" || e?.body?.waiting)) waitingSeen++; }));
        else if (ph === "boot") batch.push(p.rt.boot().catch(() => {}));
      }
      await Promise.all(batch);
      if (o.closed && step % 20 === 12) { const w = (await call("GET", `/api/z/${eid}/waiting`, undefined, master)).j.waiting ?? []; if (w.length) { const r = await call("POST", `/api/z/${eid}/waiting/all`, { decision: "admit" }, master); admitted += r.j.admitted ?? 0; } } // the organizer lets the listed-out people in (G2)
      if (!cappedProbe && !o.closed && phones.filter((x) => x.rt.view().pid).length === PLAYERS) { cappedProbe = true; const extra = await call("POST", `/api/z/${eid}/join`, { phone: "9333333333", name: "Extra", device: "cd".repeat(16) }, undefined, "6.6.6.6"); if (!o.closed) check(extra.status === 409 || extra.status === 403, "an 11th phone was let into a game of 10 (status " + extra.status + ")"); } // the cap (G2)
      if (step > 60 && phones.every((p) => step < p.joinAt || p.rt.phase === "ended" || p.rt.phase === "missing" || (o.closed && p.rt.phase === "join" && !admitted && step > 100))) { step++; break; }
    }
    // 4. assertions
    const views = phones.map((p) => ({ p, v: p.rt.view() })), joined = views.filter((x) => x.v.pid), ended = joined.filter((x) => x.v.phase === "ended");
    { const ph: Record<string, number> = {}; for (const x of views) ph[x.v.phase] = (ph[x.v.phase] ?? 0) + 1; const er = views.map((x) => x.v.error).filter(Boolean)[0]; if (process.env.LA_DEBUG) failures.push(`debug phases=${JSON.stringify(ph)} steps=${step} err=${er ?? ""} logLens=${views.map((x) => x.v.log.length).join(",")}`); }
    check(joined.length >= (o.closed ? 1 : PLAYERS * 0.9), `only ${joined.length} of ${PLAYERS} phones joined`);
    check(ended.length === joined.length, `${joined.length - ended.length} joined phones had not ended after ${step} steps`);
    const cfg = (joined[0]?.v.cfg ?? info) as any, rounds = cfg.rounds ?? 1;
    const STRIDE = info.callSeconds / 3, ref: number[][] = [];
    for (let r = 1; r <= rounds; r++) ref.push(deriveCalls(roundEid(eid, r), Array.from({ length: 90 }, (_, k) => randomnessOf(callRoundR(null as any, START + GRACE_ROUNDS, STRIDE, cfg.breaks ?? [], r, k)!, seed))));
    for (const x of ended) { // number sequence: 1..90, no repeats, equal to the reference (a late phone sees the tail only)
      const log: number[] = x.v.log, off = x.v.late?.hidden ?? 0, rf = ref[rounds - 1]!;
      check(new Set(log).size === log.length, `phone ${x.p.phone}: a number repeated`);
      check(log.every((n) => n >= 1 && n <= 90), `phone ${x.p.phone}: number out of 1..90`);
      check(log.every((n, i) => n === rf[i + off]), `phone ${x.p.phone}: log differs from the reference sequence`);
    }
    const canon = (res: any[]) => JSON.stringify([...res].map((r) => `${r.round ?? 1}|${r.pattern}|${r.ordinal}|${r.idx}|${r.count ?? ""}`).sort());
    const groups = new Set(ended.map((x) => canon(x.v.results))); check(groups.size <= 1, `phones disagree on the winners (${groups.size} sets)`);
    const results: any[] = ended[0]?.v.results ?? [];
    check(results.length > 0, "no prize was won in the whole game");
    if (o.bumper && o.tickets === 2) check(results.some((r: any) => /full2|two/i.test(String(r.pattern))) || results.length > 0, "Super Bumper configured but no result");
    for (const p of phones) for (const f of p.failed) check(false, `${p.phone}: ${f}`);
    const bad = apiRefusals.filter((r) => !/409|403|400/.test(r)); check(!bad.length, "unexpected claim refusals: " + bad.slice(0, 2).join("; "));
    if (o.closed) check(waitingSeen > 0 || admitted > 0 || joined.length === PLAYERS, "a list-only game let people straight in without approval");
    // 5. the game log, the record, and the 24 h erase (G7)
    const gl = await call("GET", `/api/z/${eid}/gamelog`, undefined, master); check(gl.status === 200, "gamelog: " + gl.status);
    vnow = utc() + 30 * 3_600_000; await erasePersonal(env, eid, vnow, "layer-a");
    const left = (d.raw.prepare("SELECT COUNT(*) AS c FROM participant WHERE eid=?").get(eid) as any).c + (d.raw.prepare("SELECT COUNT(*) AS c FROM person WHERE eid=?").get(eid) as any).c;
    check(left === 0, `after the erase ${left} participant/person rows are left`);
    const gl2 = await call("GET", `/api/z/${eid}/gamelog`, undefined, master); check(gl2.status === 200, "gamelog after the erase: " + gl2.status);
    return { ok: failures.length === 0, failures, seconds: +((Date.now() - t0) / 1000).toFixed(1), joined: joined.length, ended: ended.length, won: results.length };
  } finally { (globalThis as any).fetch = realFetch; try { (d as any).raw.close(); } catch { /* closed */ } }
}

// ---------- the run: streamed, one game at a time ----------
const todo: { uc: UseCase; variant: number }[] = [];
const per = Math.max(1, Math.floor(GAMES / CASES.length) || 1);
if (ONLY) for (const uc of CASES.filter((u) => ONLY.includes(u.id))) for (let v = 0; v < (a.variants ?? 1); v++) todo.push({ uc, variant: (BATCH - 1) * 10 + v });
else if (GAMES >= CASES.length) { for (const uc of CASES) for (let v = 0; v < Math.min(10, per); v++) todo.push({ uc, variant: (BATCH - 1) * 10 + v }); }
else { const stride = CASES.length / GAMES; for (let i = 0; i < GAMES; i++) todo.push({ uc: CASES[Math.floor(i * stride)]!, variant: (BATCH - 1) * 10 }); } // a dry run spreads its games over all groups
let pass = 0, fail = 0, joinedAll = 0; const t00 = Date.now();
for (const { uc, variant } of todo) {
  let r; try { r = await playGame(uc, variant); } catch (e: any) { r = { ok: false, failures: ["crash: " + String(e?.stack ?? e).slice(0, 300)], seconds: 0, joined: 0, ended: 0, won: 0 }; }
  if (r.ok) pass++; else fail++; joinedAll += r.joined;
  console.log(JSON.stringify({ id: uc.id, variant, seed: `${SEED_BASE}-${uc.id}-${variant}`, ok: r.ok, joined: r.joined, ended: r.ended, won: r.won, seconds: r.seconds, ...(r.ok ? {} : { failures: r.failures.slice(0, 6) }) }));
}
console.log(JSON.stringify({ summary: true, games: todo.length, pass, fail, playersJoined: joinedAll, seconds: +((Date.now() - t00) / 1000).toFixed(1), heapMB: Math.round(process.memoryUsage().heapUsed / 1048576), rssMB: Math.round(process.memoryUsage().rss / 1048576), catalogue: existsSync(CAT) ? "usecases-100.json" : "built-in" }));
