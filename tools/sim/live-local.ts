// Real-time check against the local zero-server stack and the REAL public beacon (no fakes): phones run PhoneRuntime on wall-clock
// time, the organizer signs a real pause, and we check nobody saw a number during it and every phone ends with the same log.
// Needs: bun run zlocal (PORT=8799 ORGANIZER_SECRET=local-secret). Run: bun run tools/sim/live-local.ts [phones=5] [minutes=4]
import { PhoneRuntime } from "../../packages/beacon/src/phone-runtime";
import { fetchRound, roundAt, deriveCalls } from "../../packages/beacon/src";
import { nextMessage, publicKeyFromSecret, readPublished, resolveControl, cfgOf, scheduleWithControl, signControlWithSecret } from "../../packages/beacon/src/control";

const BASE = process.env.BASE ?? "http://localhost:8799";
const SECRET = process.env.ORGANIZER_SECRET ?? "local-secret";
const N = Number(process.argv[2] ?? 5);
const MIN = Number(process.argv[3] ?? 4);
const KEY = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
let checks = 0, failed = 0;
const ok = (c: boolean, m: string) => { checks++; if (!c) { failed++; console.log("  FAIL:", m); } else console.log("  ok:", m); };
const H = { "content-type": "application/json", "x-organizer": SECRET };
const api = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(BASE + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ?? "http " + r.status), { status: r.status });
  return j;
};

const latest = await fetchRound("latest");
if (!latest) { console.log("Cannot reach the public beacon from here."); process.exit(2); }
const EID = "LIVE-" + Date.now().toString(36);
const start = latest.round + 15; // first number ~45 s from now
await api("POST", "/api/z", { id: EID, startRound: start, callSeconds: 6, cap: 100 });
await api("PUT", `/api/z/${EID}/control/key`, { publicKey: publicKeyFromSecret(KEY) });
const kv = { get: async (k: string) => { const f = await fetch(`${BASE}/api/z/${EID}/control`).then((r) => (r.ok ? r.text() : null)); return f; }, put: async () => {} };
console.log(`engagement ${EID}: ${N} phones, start round ${start}, ${MIN} minutes of real time`);

const phones = Array.from({ length: N }, (_, i) => {
  const mem = new Map<string, string>();
  const rt = new PhoneRuntime(EID, {
    api: async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: { "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error((j as any).error ?? "http"), { status: r.status }); return j; },
    beacon: {}, mono: () => performance.now(), store: { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) },
  });
  return { rt, phone: "98" + String(10000000 + i * 7919) };
});
for (const p of phones) { await p.rt.boot(); await p.rt.join(p.phone, "P"); }
ok(phones.every((p) => p.rt.phase === "play"), `${N} phones joined`);

const sawDuring: number[] = [];
let pauseRounds: { start: number; end: number } | null = null;
let published = false;
const t0 = Date.now();
while (Date.now() - t0 < MIN * 60_000) {
  await Promise.all(phones.map((p) => p.rt.tick()));
  const v0 = phones[0]!.rt.view();
  const now = v0.nowRound ?? 0;
  if (!published && v0.log.length >= 4) { // pause after the 4th number: sign with the organizer key, publish
    const f = (await readPublished({ get: kv.get, put: kv.put }, EID))!;
    const msg = signControlWithSecret(KEY, nextMessage(f, roundAt(Date.now()), { action: "pause", pauseForRounds: 20 }));
    const res = await fetch(`${BASE}/api/z/${EID}/control`, { method: "POST", headers: H, body: JSON.stringify({ message: msg }) });
    ok(res.ok, "organizer pause accepted: " + (await res.text()).slice(0, 60));
    const f2 = (await readPublished({ get: kv.get, put: kv.put }, EID))!;
    pauseRounds = resolveControl(cfgOf(f2), f2.messages).intervals[0]!;
    published = true;
  }
  if (pauseRounds && now >= pauseRounds.start && now < pauseRounds.end) sawDuring.push(v0.log.length);
  await new Promise((r) => setTimeout(r, 1000));
  if (published && pauseRounds && now > pauseRounds.end + 30) break;
}
const logs = phones.map((p) => p.rt.view().log);
const f = (await readPublished({ get: kv.get, put: kv.put }, EID))!;
const st = resolveControl(cfgOf(f), f.messages);
const sched = scheduleWithControl(st, start, 2, 90);
const nowR = roundAt(Date.now());
const due = sched.filter((r) => r !== null && r <= nowR).length;
const rs = await Promise.all(sched.slice(0, due).map((r) => fetchRound(r!)));
const ref = deriveCalls(EID, rs.map((x) => x!.randomness));
ok(published && !!pauseRounds, "a pause was published and took effect");
ok(sawDuring.length > 0 && new Set(sawDuring).size === 1, `no number appeared during the pause (${sawDuring.length} ticks watched, log stayed at ${sawDuring[0]})`);
ok(logs.every((l) => l.length >= ref.length - 1 && l.every((n, i) => n === ref[i])), `all ${N} phones hold the same log as the public reference (${ref.length} calls)`);
ok(ref.length > (sawDuring[0] ?? 0), "calls resumed after the pause");
console.log(`\n${checks - failed}/${checks} checks passed${failed ? ` — ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
