// LOAD SHAPE of the slot rhythm (1.5.2) at 10,000 phones in one game: requests per 100 ms, D1 reads per second, errors, handler time, and the delay from a claim to the moment each phone has read the new list.
// In-process against the real handler, a counting stand-in for D1 and a stand-in for the edge cache (honours s-maxage). Run: bun test tools/load/slots-load.test.ts   (env PHONES=10000 SECONDS=20)
import { describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(600_000);
import { withDevice } from "../../apps/edge/test/device";
import { handle } from "../../apps/edge/test/with-terms";
import { makeD1 } from "../../apps/edge/test/d1-sqlite";
import { beatOffsetMs, beatPeriodMs, followUpSpreadMs, msToNextBeat } from "../../packages/beacon/src/beat";

const PHONES = Number(process.env.PHONES ?? 10000), SECONDS = Number(process.env.SECONDS ?? 20), CAP = Number(process.env.CAP ?? 10000);
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]!; };
describe("10,000 phones", () => {
  test("flat request stream, D1 about one read per second per kind, the claim reaches every phone within a few seconds", async () => {
    const T = Date.UTC(2026, 9, 1, 10, 0, 0); let simNow = T; const store = new Map<string, { res: Response; until: number }>();
    (globalThis as any).caches = { default: { match: async (r: Request) => { const h = store.get(r.url); return h && h.until > simNow ? h.res.clone() : undefined; }, put: async (r: Request, res: Response) => { const m = /s-maxage=(\d+)/.exec(res.headers.get("cache-control") ?? ""); store.set(r.url, { res: res.clone(), until: simNow + Number(m?.[1] ?? 0) * 1000 }); } } };
    const d = makeD1(); let reads = 0; const readsPerSec = new Map<number, number>();
    const wrap = (sql: string, st: any): any => { const rd = /^\s*(select|with)/i.test(sql); return { bind: (...v: unknown[]) => wrap(sql, st.bind(...v)), run: async () => st.run(), all: async () => { if (rd) { reads++; const k = Math.floor((simNow - T) / 1000); readsPerSec.set(k, (readsPerSec.get(k) ?? 0) + 1); } return st.all(); }, first: async () => { if (rd) { reads++; const k = Math.floor((simNow - T) / 1000); readsPerSec.set(k, (readsPerSec.get(k) ?? 0) + 1); } return st.first(); } }; };
    const env: any = { DB: { prepare: (s: string) => wrap(s, d.db.prepare(s)), batch: async (xs: any[]) => Promise.all(xs.map((x) => x.run())) }, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" };
    const call = (p: string) => handle(new Request("http://x" + p, { method: "GET" }), env, simNow);
    const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
    expect((await handle(new Request("http://x/api/z", { method: "POST", headers: { "content-type": "application/json", "x-organizer": "plat" }, body: withDevice("POST", "/api/z", { id: "SLOT-1", startRound: roundAt(T) + 2400, callSeconds: 12, cap: 100000 }) }), env, T)).status).toBe(200);
    d.raw.prepare("UPDATE engagement SET pack=100000 WHERE id='SLOT-1'").run();
    const STEP = 100, period = beatPeriodMs(CAP), claimAt = T + 8000; let bumped = false, cvKnown = new Array(PHONES + 1).fill(-1);
    const perStep: number[] = [], lat: number[] = [], notice: number[] = []; let errors = 0, total = 0; const pendingSeats: { at: number; t: number; seen: number }[] = [];
    const readSeats = async (t: number, v: number) => { const r = await call(`/api/z/SLOT-1/seats?after=0&cafter=0&v=${v}`); if (r.status >= 500) errors++; total++; await r.text(); };
    for (let ms = 0; ms < SECONDS * 1000; ms += STEP) {
      simNow = T + ms; let n = 0;
      if (!bumped && simNow >= claimAt) { bumped = true; d.raw.prepare("INSERT INTO kv(k,v) VALUES('cv/SLOT-1','1') ON CONFLICT(k) DO UPDATE SET v=CAST(CAST(v AS INTEGER)+1 AS TEXT)").run(); }
      for (let t = 1; t <= PHONES; t++) if (msToNextBeat(simNow, t, CAP) < STEP) { // this phone's slot comes round inside this step
        const t0 = performance.now(); const r = await call("/api/z/SLOT-1/cv"); const v = Number(await r.text()); lat.push(performance.now() - t0); total++; n++; if (r.status >= 500) errors++;
        if (cvKnown[t]! >= 0 && v > cvKnown[t]!) pendingSeats.push({ at: simNow + followUpSpreadMs(t, CAP), t, seen: simNow }); cvKnown[t] = v;
      }
      for (let i = pendingSeats.length - 1; i >= 0; i--) if (pendingSeats[i]!.at <= simNow) { const p = pendingSeats.splice(i, 1)[0]!; await readSeats(p.t, 1); n++; notice.push(simNow - claimAt); }
      perStep.push(n);
    }
    const quiet = perStep.slice(0, 80), peakStep = Math.max(...perStep), steady = Math.max(...quiet);
    const rps = [...readsPerSec.values()];
    const out = { phones: PHONES, cap: CAP, periodMs: period, simulatedSeconds: SECONDS, requests: total, requestsPerSecondAvg: Math.round(total / SECONDS), peakRequestsPer100ms: peakStep, steadyPeakPer100ms: steady, d1ReadsTotal: reads, d1ReadsPerSecondMax: Math.max(...rps), d1ReadsPerSecondAvg: +(reads / SECONDS).toFixed(1), errors, handlerMsP50: +pct(lat, 0.5).toFixed(3), handlerMsP95: +pct(lat, 0.95).toFixed(3), handlerMsP99: +pct(lat, 0.99).toFixed(3), claimNoticeDelayMs: { phonesReached: notice.length, p50: pct(notice, 0.5), p95: pct(notice, 0.95), max: Math.max(...notice) }, before: { note: "1.5.1 phones asked on the once-a-second tick: two spikes per period", peakPer100msIfAllAtTicks: PHONES / 2 } };
    console.log("SLOTS_LOAD " + JSON.stringify(out));
    expect(errors).toBe(0); expect(steady).toBeLessThanOrEqual(Math.ceil(PHONES / (period / STEP)) * 1.3);
    expect(Math.max(...rps)).toBeLessThan(40); // the database: a handful of reads per second, however many phones
    expect(notice.length).toBeGreaterThan(PHONES * 0.99); expect(pct(notice, 0.95)).toBeLessThanOrEqual(period + 1000 + 1000 + STEP);
  });
});
