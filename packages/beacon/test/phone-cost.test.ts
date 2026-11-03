// Cost of every call a phone makes to OUR server during a game (release 1.5.0 edge check): for each route, how many calls per phone per minute, CPU ms, D1 reads and writes (and rows),
// response bytes. 40 phones play 4 minutes of a 12 s game in-process against the real handler and a counting stand-in for D1. The public beacon (drand) is not ours and is counted apart.
// Run: bun test packages/beacon/test/phone-cost.test.ts   (prints the table as JSON)
import { describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(300_000);
import { bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import { type Env } from "../../../apps/edge/src/worker";
import { handle } from "../../../apps/edge/test/with-terms";
import { makeD1 } from "../../../apps/edge/test/d1-sqlite";
import { PhoneRuntime, type PhoneDeps } from "../src/phone-runtime";
import { GRACE_ROUNDS } from "../src/config";
import { roundAt, roundTimeMs, type Fetcher, type Round } from "../src";

const SECRET = "org", EID = "COST-1", START = 50_000, PHONES = 40, MINUTES = 4;
const rnd = (r: number) => bytesToHex(sha256(new TextEncoder().encode("fake" + r)));
type Acc = { calls: number; cpuMs: number; reads: number; writes: number; rows: number; bytes: number };
const acc = new Map<string, Acc>();
let cur: Acc | null = null;
const countingDb = (inner: any) => {
  const wrap = (sql: string, st: any): any => {
    const isRead = /^\s*(select|with)/i.test(sql);
    const tick = (rows: number) => { if (!cur) return; if (isRead) { cur.reads++; cur.rows += rows; } else { cur.writes++; cur.rows += rows; } };
    return { bind: (...v: unknown[]) => wrap(sql, st.bind(...v)), run: async () => { const r = await st.run(); tick(r?.meta?.changes ?? 1); return r; }, all: async () => { const r = await st.all(); tick(r.results.length); return r; }, first: async () => { const r = await st.first(); tick(r ? 1 : 0); return r; } };
  };
  return { prepare: (sql: string) => wrap(sql, inner.prepare(sql)), batch: async (xs: any[]) => Promise.all(xs.map((x) => x.run())) };
};
const route = (method: string, path: string) => method + " " + path.replace(/^\/api\/z\/[^/]+/, "/api/z/:id").replace(/\?.*$/, "").replace(/\/[0-9a-f]{20,}$/, "/:hash");

describe("what each call of a phone costs", () => {
  test("per-route cost table (calls per phone per minute, CPU, D1 reads/writes, bytes)", async () => {
    const d = makeD1(); const env = { DB: countingDb(d.db), ORGANIZER_SECRET: SECRET, DAILY_WRITE_BUDGET: "1000000000" } as unknown as Env;
    const T0 = roundTimeMs(START - 3); let t = 0;
    const call = async (method: string, path: string, body?: unknown, h: Record<string, string> = {}) => {
      const key = route(method, path); const a = acc.get(key) ?? { calls: 0, cpuMs: 0, reads: 0, writes: 0, rows: 0, bytes: 0 }; acc.set(key, a); cur = a;
      const c0 = performance.now();
      const r = await handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...h }, body: body === undefined ? undefined : JSON.stringify(body) }), env, T0 + t);
      const txt = await r.clone().text(); a.cpuMs += performance.now() - c0; a.calls++; a.bytes += txt.length; cur = null; return r;
    };
    const api: PhoneDeps["api"] = async (method, path, body) => { const r = await call(method, path, body); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error((j as any).error ?? "http " + r.status), { status: r.status }); return j; };
    let beaconCalls = 0;
    const fetcher: Fetcher = async (url) => { beaconCalls++; const last = url.split("/").pop()!; const nowR = roundAt(T0 + t); const r = last === "latest" ? nowR : Number(last); if (r > nowR) return { ok: false, status: 404, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" } as Round) }; };
    await call("POST", "/api/z", { id: EID, startRound: START - GRACE_ROUNDS, callSeconds: 12, cap: 2000 }, { "x-organizer": SECRET });
    const phones = Array.from({ length: PHONES }, (_, n) => { const mem = new Map<string, string>(); const rt = new PhoneRuntime(EID, { noEarlyEnd: true, api, mono: () => t, store: { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) }, beacon: { fetcher, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x) => x.signature === "aa" && x.randomness === rnd(x.round) }); return { rt, phone: "9" + String(100000000 + n) }; });
    for (const p of phones) { await p.rt.boot(); expect(await p.rt.join(p.phone, "P")).toBe(true); }
    t += 0; const joinKeys = new Set(acc.keys());
    const snapshot = new Map([...acc].map(([k, v]) => [k, { ...v }]));
    beaconCalls = 0;
    const steps = MINUTES * 60;
    for (let i = 0; i < steps; i++) { t += 1000; for (const p of phones) await p.rt.tick(); for (const p of phones) await p.rt.playAlong(undefined as any); }
    const table: Record<string, unknown> = {};
    for (const [k, v] of acc) { const s0 = snapshot.get(k); const calls = v.calls - (s0?.calls ?? 0); if (!calls && !joinKeys.has(k)) continue; const during = { calls: v.calls - (s0?.calls ?? 0), cpu: v.cpuMs - (s0?.cpuMs ?? 0), reads: v.reads - (s0?.reads ?? 0), writes: v.writes - (s0?.writes ?? 0), rows: v.rows - (s0?.rows ?? 0), bytes: v.bytes - (s0?.bytes ?? 0) };
      const n = during.calls || v.calls; const src: any = during.calls ? { ...during, cpuMs: during.cpu } : v;
      table[k] = { callsPerPhonePerMinute: +(during.calls / PHONES / MINUTES).toFixed(2), cpuMsPerCall: +(src.cpuMs / n).toFixed(3), d1ReadsPerCall: +(src.reads / n).toFixed(2), d1WritesPerCall: +(src.writes / n).toFixed(2), rowsPerCall: +(src.rows / n).toFixed(1), bytesPerCall: Math.round(src.bytes / n), totalCalls: v.calls }; }
    table["PUBLIC BEACON (drand, not our server) calls per phone per minute"] = +(beaconCalls / PHONES / MINUTES).toFixed(2);
    console.log("COST_TABLE " + JSON.stringify(table, null, 1));
    const total = [...acc].reduce((s, [k, v]) => s + (v.calls - (snapshot.get(k)?.calls ?? 0)), 0);
    console.log("OUR_SERVER_CALLS_PER_PHONE_PER_MINUTE " + (total / PHONES / MINUTES).toFixed(2));
    expect(total).toBeGreaterThan(0);
  });
});
