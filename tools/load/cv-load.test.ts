// Local load check of the claim signal (1.5.0): 250 phones ask GET /cv every 2 s for a minute of simulated time while claims happen.
// It counts database reads (with a stand-in for the edge cache), bytes per answer, and the delay from a claim to the first phone ask that sees it.
// Run:  bun test tools/load/cv-load.test.ts
import { describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(180_000);
import { withDevice } from "../../apps/edge/test/device";
import { handle } from "../../apps/edge/test/with-terms";
import { makeD1 } from "../../apps/edge/test/d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0), PHONES = 250, EVERY = 2000, SECONDS = 60;
describe("claim signal load, 250 phones", () => {
  test("database reads stay about one per second with the edge cache; answers are a few bytes; a claim is seen by every phone within one ask period plus the cache second", async () => {
    // a stand-in for Cloudflare's edge cache: keeps an answer for its s-maxage
    let simNow = T; const store = new Map<string, { res: Response; until: number }>();
    (globalThis as any).caches = { default: { match: async (r: Request) => { const h = store.get(r.url); return h && h.until > simNow ? h.res.clone() : undefined; }, put: async (r: Request, res: Response) => { const m = /s-maxage=(\d+)/.exec(res.headers.get("cache-control") ?? ""); store.set(r.url, { res: res.clone(), until: simNow + Number(m?.[1] ?? 0) * 1000 }); } } };
    const d = makeD1(); let reads = 0;
    const db = { ...d.db, prepare: (sql: string) => { const st: any = d.db.prepare(sql); const b = st.bind.bind(st); st.bind = (...a: any[]) => { if (/^cv\//.test(String(a[0]))) reads++; return b(...a); }; return st; } } as any;
    const env: any = { DB: db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" };
    const call = (method: string, path: string, body?: unknown, h: Record<string, string> = {}) => handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...h }, body: withDevice(method, path, body) }), env, simNow);
    const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
    expect((await call("POST", "/api/z", { id: "LOAD-1", startRound: roundAt(T) + 2400, callSeconds: 12, cap: 300 }, { "x-organizer": "plat" })).status).toBe(200);
    const phase = Array.from({ length: PHONES }, (_, i) => ((i * 7919) % 20) * 100); // spread over the 2 s
    const seenAt: (number | null)[] = Array(PHONES).fill(null); const known = Array(PHONES).fill(0);
    let bytes = 0, asks = 0; const claimAt = T + 30_000; let bumped = false;
    reads = 0;
    for (let t = 0; t < SECONDS * 1000; t += 100) { // 100 ms steps of simulated time
      simNow = T + t;
      if (!bumped && simNow >= claimAt) { bumped = true; await d.db.prepare("INSERT INTO kv(k,v) VALUES('cv/LOAD-1','1') ON CONFLICT(k) DO UPDATE SET v=CAST(CAST(v AS INTEGER)+1 AS TEXT)").run(); } // what the claim handler does
      for (let i = 0; i < PHONES; i++) if ((t - phase[i]!) >= 0 && (t - phase[i]!) % EVERY === 0) {
        const r = await call("GET", "/api/z/LOAD-1/cv"); const txt = await r.text(); bytes += txt.length; asks++;
        const n = Number(txt); if (n > known[i]! && seenAt[i] === null && bumped) seenAt[i] = simNow - claimAt; known[i] = n;
      }
    }
    const delays = seenAt.filter((x): x is number => x !== null).sort((a, b) => a - b);
    const p95 = delays[Math.floor(delays.length * 0.95)]!;
    console.log(JSON.stringify({ phones: PHONES, seconds: SECONDS, asks, dbReads: reads, dbReadsPerSecond: +(reads / SECONDS).toFixed(2), bytesPerAnswer: +(bytes / asks).toFixed(2), requestsPerPhonePerHour: 3600 / (EVERY / 1000), seenBy: delays.length, medianDelayMs: delays[Math.floor(delays.length / 2)], p95DelayMs: p95, maxDelayMs: delays[delays.length - 1] }));
    expect(delays.length).toBe(PHONES); // every phone heard it
    expect(reads / SECONDS).toBeLessThan(2.5); // the database is asked about once a second at most, however many phones
    expect(bytes / asks).toBeLessThan(4);
    expect(p95).toBeLessThanOrEqual(3000); // ask period 2 s + cache 1 s
  });
});
