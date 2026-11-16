// CAPACITY check of the server side of a game (release 1.5.0). In-process against the real handler, a counting stand-in for D1 and a stand-in for the edge cache (honours s-maxage).
//   Phase 1  join storm: JOINS phones join within 120 simulated seconds
//   Phase 2  sustained play: PHONES phones, each doing what a real phone does (claim signal every 2 s, control every 60 s, seat list every ~21 s, with the claim number in the address)
//   Phase 3  claim burst: CLAIMS claims in one second, then every phone reads the new seat/claim list at once
// Prints one JSON line with: requests/s handled, handler time p50/p95/p99, errors, D1 queries per second (reads, writes), per game-hour totals, estimated Cloudflare cost for 1,000,000 requests.
// Run: bun test tools/load/capacity.test.ts        (env: PHONES=2000 JOINS=2000 CLAIMS=200 SECONDS=60)
import { describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(900_000);
import { withDevice } from "../../apps/edge/test/device";
import { handle } from "../../apps/edge/test/with-terms";
import { makeD1 } from "../../apps/edge/test/d1-sqlite";
import { callTimeMs } from "../../apps/edge/src/lifecycle";

const PHONES = Number(process.env.PHONES ?? 2000), JOINS = Number(process.env.JOINS ?? 2000), CLAIMS = Number(process.env.CLAIMS ?? 200), SECONDS = Number(process.env.SECONDS ?? 60);
const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))]! : 0; };

describe("capacity", () => {
  test("join storm, sustained play at about 2x the target rate, claim burst", async () => {
    let simNow = T; const store = new Map<string, { res: Response; until: number }>(); let cacheHits = 0, cacheMiss = 0;
    if (!process.env.NOCACHE) (globalThis as any).caches = { default: { match: async (r: Request) => { const h = store.get(r.url); if (h && h.until > simNow) { cacheHits++; return h.res.clone(); } cacheMiss++; return undefined; }, put: async (r: Request, res: Response) => { const m = /s-maxage=(\d+)/.exec(res.headers.get("cache-control") ?? ""); store.set(r.url, { res: res.clone(), until: simNow + Number(m?.[1] ?? 0) * 1000 }); } } };
    const d = makeD1(); const perSec = new Map<string, { r: number; w: number }>(); let phase = "join"; let phaseStart = T;
    const ops: Record<string, { r: number; w: number }> = { join: { r: 0, w: 0 }, play: { r: 0, w: 0 }, burst: { r: 0, w: 0 } };
    const note = (isRead: boolean) => { const s = phase + ":" + Math.floor((simNow - phaseStart) / 1000); const a = perSec.get(s) ?? { r: 0, w: 0 }; perSec.set(s, a); if (isRead) { a.r++; ops[phase]!.r++; } else { a.w++; ops[phase]!.w++; } };
    const wrap = (sql: string, st: any): any => { const rd = /^\s*(select|with)/i.test(sql); return { bind: (...v: unknown[]) => wrap(sql, st.bind(...v)), run: async () => { note(rd); return st.run(); }, all: async () => { note(rd); return st.all(); }, first: async () => { note(rd); return st.first(); } }; };
    const db: any = { prepare: (sql: string) => wrap(sql, d.db.prepare(sql)), batch: async (xs: any[]) => Promise.all(xs.map((x) => x.run())) };
    const env: any = { DB: db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" };
    const lat: Record<string, number[]> = {}; let errors = 0, total = 0;
    const call = async (kind: string, method: string, path: string, body?: unknown, h: Record<string, string> = {}) => {
      const t0 = performance.now(); const r = await handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...h }, body: withDevice(method, path, body) }), env, simNow); const txt = await r.text(); (lat[kind] ??= []).push(performance.now() - t0); total++; if (r.status >= 500) errors++; return { r, txt };
    };
    const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
    const id = "CAP-1";
    expect((await call("setup", "POST", "/api/z", { id, startRound: roundAt(T) + 2400, callSeconds: 12, cap: 100000 }, { "x-organizer": "plat" })).r.status).toBe(200);
    d.raw.prepare("UPDATE engagement SET pack=100000 WHERE id=?").run(id);
    // ---- phase 1: join storm
    const pids: string[] = []; const joinWall0 = performance.now();
    for (let i = 0; i < JOINS; i++) { simNow = T + Math.floor((i * 120_000) / JOINS); const { r, txt } = await call("join", "POST", `/api/z/${id}/join`, { phone: "9" + String(100000000 + i), name: "P" + i }); if (r.status === 200) pids.push(JSON.parse(txt).pid); }
    const joinWallMs = performance.now() - joinWall0;
    expect(pids.length).toBeGreaterThan(JOINS * 0.99);
    // ---- phase 2: sustained play
    phase = "play"; const play0 = T + 10 * 60_000; phaseStart = play0; const N = Math.min(PHONES, pids.length);
    const phase0 = Array.from({ length: N }, (_, i) => (i * 7919) % 2000), phaseSeat = Array.from({ length: N }, (_, i) => (i * 104729) % 21000), phaseCtl = Array.from({ length: N }, (_, i) => (i * 15485863) % 60000);
    let cv = 0; const playWall0 = performance.now(); let playReq = 0;
    for (let ms = 0; ms < SECONDS * 1000; ms += 1000) {
      simNow = play0 + ms;
      for (let i = 0; i < N; i++) {
        const tt = ms - 0; // each phone's own ask moments within this second
        if (((tt + phase0[i]!) % 2000) < 1000) { await call("cv", "GET", `/api/z/${id}/cv`); playReq++; }
        if (((tt + phaseSeat[i]!) % 21000) < 1000) { await call("seats", "GET", `/api/z/${id}/seats?after=0&cafter=0&v=${cv}`); playReq++; }
        if (((tt + phaseCtl[i]!) % 60000) < 1000) { await call("control", "GET", `/api/z/${id}/control`); playReq++; }
      }
    }
    const playWallMs = performance.now() - playWall0;
    // ---- phase 3: claim burst
    phase = "burst"; const e = d.raw.query("SELECT * FROM engagement WHERE id=?").get(id) as any; simNow = (await callTimeMs(env, e, 1, 0))! + 1000; phaseStart = simNow; const burst0 = performance.now(); // one second after the first number: claims for it are in time
    const HOUSES = ["early5", "top", "mid", "bot", "corners", "star", "full"]; let claimOk = 0, claimLate = 0;
    for (let i = 0; i < Math.min(CLAIMS, pids.length); i++) { const { r } = await call("claim", "POST", `/api/z/${id}/claims`, { pid: pids[i], device: "0".repeat(32), claims: [{ pattern: HOUSES[i % HOUSES.length], idx: 0 }] }); if (r.status === 200) claimOk++; else if (r.status === 409) claimLate++; else errors++; }
    cv = Number((await call("cv", "GET", `/api/z/${id}/cv`)).txt); const readsBeforeFanout = ops.burst!.r;
    for (let i = 0; i < N; i++) await call("seats", "GET", `/api/z/${id}/seats?after=0&cafter=0&v=${cv}`); // every phone reads the new list at once
    const fanoutReads = ops.burst!.r - readsBeforeFanout; const burstWallMs = performance.now() - burst0;
    // ---- report
    const all = Object.entries(lat).flatMap(([, v]) => v), maxPerSec = (ph: string) => { let r = 0, w = 0, q = 0; for (const [k, a] of perSec) if (k.startsWith(ph + ":")) { r = Math.max(r, a.r); w = Math.max(w, a.w); q = Math.max(q, a.r + a.w); } return { maxReadsPerSec: r, maxWritesPerSec: w, maxQueriesPerSec: q }; };
    const perPhaseLat = Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, { n: v.length, p50ms: +pct(v, 0.5).toFixed(3), p95ms: +pct(v, 0.95).toFixed(3), p99ms: +pct(v, 0.99).toFixed(3) }]));
    const cpuMsTotal = all.reduce((a, b) => a + b, 0), avgCpu = cpuMsTotal / all.length;
    const out = {
      phones: N, joins: pids.length, simulatedSecondsOfPlay: SECONDS,
      join: { total: pids.length, over: "120 s", perSecond: +(pids.length / 120).toFixed(1), handlerMsAvg: +(joinWallMs / pids.length).toFixed(2), d1ReadsPerJoin: +(ops.join!.r / pids.length).toFixed(1), d1WritesPerJoin: +(ops.join!.w / pids.length).toFixed(1), ...maxPerSec("join") },
      play: { requests: playReq, requestsPerSecond: +(playReq / SECONDS).toFixed(0), handlerThroughputPerSecondOneThread: +(playReq / (playWallMs / 1000)).toFixed(0), d1Reads: ops.play!.r, d1Writes: ops.play!.w, d1ReadsPerSecond: +(ops.play!.r / SECONDS).toFixed(1), ...maxPerSec("play") },
      claimBurst: { claims: CLAIMS, accepted: claimOk, late: claimLate, writes: ops.burst!.w, readsForAllPhonesToReadTheNewList: fanoutReads, phonesReading: N, handlerWallMs: +burstWallMs.toFixed(0) },
      latencyByRoute: perPhaseLat, errors, total,
      edgeCache: { hits: cacheHits, misses: cacheMiss },
      handlerMsAvgAllRoutes: +avgCpu.toFixed(3),
      costFor1MillionRequests: { cpuMs: Math.round(avgCpu * 1_000_000), cpuCostUsd: +((avgCpu * 1_000_000 / 1_000_000) * 0.02).toFixed(3), requestsCostUsdIfOverIncluded: 0.30, note: "Workers Paid: 10M requests and 30M CPU-ms per month included, then $0.30 per million requests and $0.02 per million CPU-ms; D1 rows read/written priced per million rows (a few cents here)" },
    };
    console.log("CAPACITY " + JSON.stringify(out));
    expect(errors).toBe(0);
    expect(out.play.d1ReadsPerSecond).toBeLessThan(80); // the edge cache keeps the database about as quiet as one phone's worth of asks per few seconds
  });
});
