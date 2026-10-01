// Real-time check of Case 1 against a running stack and the REAL public beacon: an organizer signs up, builds, publishes (free), guests join,
// nobody pays, and when the start time arrives the engagement must NOT begin: every phone holds, shows no number, and says it is waiting.
// Run: BASE=https://corporate-tambola.pages.dev CONTACT=you@example.com bun run tools/sim/live-unpaid.ts [phones=3] [secondsAfterStart=40]
import { PhoneRuntime } from "../../packages/beacon/src/phone-runtime";
import { fetchRound } from "../../packages/beacon/src";

const BASE = process.env.BASE ?? "http://localhost:8799";
const CONTACT = process.env.CONTACT ?? "owner.test@example.com";
const N = Number(process.argv[2] ?? 3), AFTER = Number(process.argv[3] ?? 40);
let checks = 0, failed = 0;
const ok = (c: boolean, m: string) => { checks++; if (!c) { failed++; console.log("  FAIL:", m); } else console.log("  ok:", m); };
const api = async (method: string, path: string, body?: unknown, key?: string) => {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j: any = await r.json().catch(() => ({})); return { status: r.status, j };
};

const latest = await fetchRound("latest");
if (!latest) { console.log("Cannot reach the public beacon from here."); process.exit(2); }
const email = `live.unpaid.${Date.now().toString(36)}@example.com`;
const s = await api("POST", "/api/start", { email });
ok(s.status === 200 && !!s.j.token && !!s.j.aiKey, "a new organizer gets a console and an AI work link at once");
const EID = "UNPD" + Date.now().toString(36).slice(-6).toUpperCase();
const start = latest.round + 14; // about 42 s from now
ok((await api("POST", "/api/z", { id: EID, startRound: start, callSeconds: 6, cap: 100 }, s.j.aiKey)).status === 200, "the organizer's AI builds the engagement (a draft)");
ok((await api("POST", `/api/z/${EID}/join`, { phone: "9876500001" })).status === 403, "a guest cannot join a draft");
const pub = await api("POST", `/api/z/${EID}/publish`, { email: CONTACT, phone: "98765 43210" }, s.j.token);
ok(pub.status === 200 && pub.j.published === true && pub.j.paid === false, "the organizer publishes it for free; it is unpaid");

const phones = Array.from({ length: N }, (_, i) => {
  const mem = new Map<string, string>();
  const rt = new PhoneRuntime(EID, {
    api: async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: { "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error((j as any).error ?? "http"), { status: r.status }); return j; },
    beacon: {}, mono: () => performance.now(), store: { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) },
  });
  return { rt, phone: "98" + String(20000000 + i * 7919) };
});
for (const p of phones) { await p.rt.boot(); await p.rt.join(p.phone, "G"); }
ok(phones.every((p) => p.rt.phase === "play"), `${N} guests joined the unpaid, published engagement`);

const t0 = Date.now(); let sawLocked = 0, sawNumber = false, nowR = latest.round;
while (nowR < start + Math.ceil(AFTER / 3)) {
  await Promise.all(phones.map((p) => p.rt.tick()));
  const v = phones[0]!.rt.view(); nowR = v.nowRound ?? nowR;
  if (nowR >= start && v.locked) sawLocked++;
  if (phones.some((p) => p.rt.view().log.length > 0)) sawNumber = true;
  await new Promise((r) => setTimeout(r, 1000));
  if (Date.now() - t0 > 4 * 60_000) break;
}
const views = phones.map((p) => p.rt.view());
ok(nowR >= start, `the start time arrived (round ${nowR} >= ${start})`);
ok(views.every((v) => v.locked && v.mode === "hold"), "every phone is held and told it is waiting");
ok(!sawNumber && views.every((v) => v.log.length === 0), "not a single number was shown to anyone");
ok(sawLocked > 0, `the hold began exactly at the start (${sawLocked} ticks watched)`);
const sum = await api("GET", `/api/z/${EID}/summary`, undefined, s.j.aiKey);
ok(/NOT PAID/.test(sum.j.status ?? ""), "the organizer's AI reads back: " + sum.j.status);
const info = await api("GET", `/api/z/${EID}/info`);
ok(info.j.unpaid === undefined && info.j.locked === true, "guests are told nothing about money, only that it is held");
const again = await api("POST", "/api/z", { id: EID + "B", startRound: nowR + 1200, callSeconds: 6, cap: 100 }, s.j.aiKey);
ok(again.status === 200, "Case 1: no loss, the organizer can create a new engagement straight away");
console.log(`\n${checks - failed}/${checks} checks passed${failed ? ` — ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
