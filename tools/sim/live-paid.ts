// Real-time check of the two money cases against a LOCAL server in test-payment mode (TEST_MODE=1: no real money) and the REAL public beacon.
//   A. pays before the start: the engagement begins on time and every phone shows the same numbers as the public reference.
//   B. does not pay: held at the start; then pays LATE: it begins about 3 minutes later for the phones that were waiting, with the same numbers for all.
// Run: TEST_MODE=1 PORT=8799 bun run zlocal   (another terminal)   then   BASE=http://localhost:8799 bun run tools/sim/live-paid.ts [phones=3]
import { PhoneRuntime } from "../../packages/beacon/src/phone-runtime";
import { fetchRound, deriveCalls } from "../../packages/beacon/src";

const BASE = process.env.BASE ?? "http://localhost:8799";
const N = Number(process.argv[2] ?? 3);
let checks = 0, failed = 0;
const ok = (c: boolean, m: string) => { checks++; if (!c) { failed++; console.log("  FAIL:", m); } else console.log("  ok:", m); };
const api = async (method: string, path: string, body?: unknown, key?: string) => {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j: any = await r.json().catch(() => ({})); return { status: r.status, j };
};
const mkPhones = (eid: string, n: number, base: number) => Array.from({ length: n }, (_, i) => {
  const mem = new Map<string, string>();
  const rt = new PhoneRuntime(eid, {
    api: async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: { "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error((j as any).error ?? "http"), { status: r.status }); return j; },
    beacon: {}, mono: () => performance.now(), store: { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) },
  });
  return { rt, phone: "98" + String(base + i * 7919) };
});
const pay = async (key: string, eid: string) => {
  const c = await api("POST", "/api/checkout", { eid, org: "Acme Ltd", email: "boss@example.com", country: "IN", taxId: "", currency: "INR" }, key);
  return c.status === 200 ? (c.j.result ?? c.j) : null;
};
const reference = async (eid: string, start: number, callSeconds: number, nowR: number) => {
  const stride = callSeconds / 3; const due = Math.max(0, Math.floor((nowR - start) / stride) + 1);
  const rs = await Promise.all(Array.from({ length: Math.min(due, 90) }, (_, k) => fetchRound(start + k * stride)));
  return rs.every(Boolean) ? deriveCalls(eid, rs.map((x) => x!.randomness)) : [];
};

const latest = await fetchRound("latest"); if (!latest) { console.log("Cannot reach the public beacon."); process.exit(2); }
const org = await api("POST", "/api/start", { email: `paid.${Date.now().toString(36)}@example.com` }, undefined);
ok(org.status === 200, "organizer signs up");
const key = org.j.token as string;

console.log("\nA. pays before the start");
const A = "PAIDA" + Date.now().toString(36).slice(-5).toUpperCase(), startA = latest.round + 16;
await api("POST", "/api/z", { id: A, startRound: startA, callSeconds: 6, cap: 100 }, key);
ok((await api("POST", `/api/z/${A}/publish`, { email: "boss@example.com", phone: "9876543210" }, key)).j.paid === false, "published, unpaid");
const phonesA = mkPhones(A, N, 30000000);
for (const p of phonesA) { await p.rt.boot(); await p.rt.join(p.phone, "A"); }
const paidA = await pay(key, A);
ok(!!paidA && paidA.published === true && paidA.restartedAtMs === null, "paid in time: published, the start does not move");

console.log("\nB. does not pay, then pays late");
const B = "PAIDB" + Date.now().toString(36).slice(-5).toUpperCase(), startB = latest.round + 16;
await api("POST", "/api/z", { id: B, startRound: startB, callSeconds: 6, cap: 100 }, key);
await api("POST", `/api/z/${B}/publish`, { email: "boss@example.com", phone: "9876543210" }, key);
const phonesB = mkPhones(B, N, 40000000);
for (const p of phonesB) { await p.rt.boot(); await p.rt.join(p.phone, "B"); }

let t0 = Date.now(), sawNumberB = false, paidLate: any = null, newStart = 0, doneA = false;
while (Date.now() - t0 < 9 * 60_000) {
  await Promise.all([...phonesA, ...phonesB].map((p) => p.rt.tick()));
  const vb = phonesB[0]!.rt.view(), va = phonesA[0]!.rt.view(); const nowR = va.nowRound ?? 0;
  if (!paidLate && nowR >= startB + 10) { // well past the start: it has been held; now the organizer pays
    ok(phonesB.every((p) => p.rt.view().locked && p.rt.view().log.length === 0), "B: held at the start, no number shown");
    paidLate = await pay(key, B); newStart = (paidLate.restartedAtMs ? Math.round((paidLate.restartedAtMs / 1000 - 1692803367) / 3) + 1 : 0);
    ok(!!paidLate && paidLate.restartedAtMs > Date.now() + 100_000 && paidLate.restartedAtMs < Date.now() + 200_000, "B: paid late, it begins in about 3 minutes");
  }
  if (paidLate && phonesB.some((p) => p.rt.view().log.length > 0)) sawNumberB = true;
  if (va.log.length >= 8) doneA = true;
  if (doneA && paidLate && vb.log.length >= 8) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const nowR = (phonesA[0]!.rt.view().nowRound ?? latest.round);
const refA = await reference(A, startA, 6, nowR), logsA = phonesA.map((p) => p.rt.view().log);
ok(logsA.every((l) => l.length > 0 && l.every((n, i) => n === refA[i])), `A: every phone shows the same numbers as the public reference (${logsA[0]!.length} calls)`);
ok(phonesA.every((p) => !p.rt.view().locked), "A: never held");
const refB = await reference(B, newStart, 6, nowR), logsB = phonesB.map((p) => p.rt.view().log);
ok(sawNumberB && logsB.every((l) => l.length > 0 && l.every((n, i) => n === refB[i])), `B: after the late payment every waiting phone shows the same numbers as the public reference (${logsB[0]!.length} calls)`);
ok(phonesB.every((p) => !p.rt.view().locked), "B: unlocked after payment");
console.log(`\n${checks - failed}/${checks} checks passed${failed ? ` — ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
