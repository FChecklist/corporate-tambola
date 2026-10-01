// Crowd test of the whole zero-server stack in virtual time: N real PhoneRuntime instances (the same code the phone page runs) talk to the real
// Worker code (in-memory D1) and to a fake public beacon that fails in awkward ways. The organizer side (check claims, settle, publish) runs the same
// functions the organizer page runs. Run: bun run tools/sim/crowd.ts [phones=2000]
import { handle, type Env } from "../../apps/edge/src/worker";
import { makeD1 } from "../../apps/edge/test/d1-sqlite";
import { PhoneRuntime } from "../../packages/beacon/src/phone-runtime";
import { callRoundR, checkClaims, completionIndexKey, settleAll, ticketsFor } from "../../packages/beacon/src/game";
import { deriveCalls, roundAt, roundTimeMs, type Fetcher } from "../../packages/beacon/src";
import { cfgOf, nextMessage, publicKeyFromSecret, readPublished, resolveControl, signControlWithSecret } from "../../packages/beacon/src/control";
import { createHash } from "node:crypto";
import { defaultCfg, keysInPlay, roundEid, type EngagementCfg } from "../../packages/beacon/src/config";

const N = Number(process.argv[2] ?? 2000);
const ROUNDS = Number(process.env.ROUNDS ?? 1); // ROUNDS=2 plays two full rounds (new numbers and new tickets each)
const RICH = process.argv[3] === "rich"; // two tickets, reward lines with 1st/2nd houses, a two-ticket house, two brand breaks
const CFG: EngagementCfg = RICH
  ? { tickets: 2, rounds: ROUNDS, rewards: [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "Coffee" }, { pattern: "top", scope: "ticket", ordinal: 1, text: "Voucher" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "Hamper" }, { pattern: "full", scope: "ticket", ordinal: 2, text: "Mug" }, { pattern: "full", scope: "ticket", ordinal: 3, text: "Pen" }, { pattern: "full", scope: "two_ticket", ordinal: 1, text: "Grand" }], breaks: [{ after: 20, seconds: 30, kind: "speech", title: "CEO message" }, { after: 60, seconds: 45, kind: "youtube", title: "Our story", mediaUrl: "https://youtu.be/abc" }] }
  : { ...defaultCfg(), rounds: ROUNDS };
const SECRET = "plat", KEY = "44".repeat(32), EID = "CROWD-" + N, START = 70_000, STRIDE = 2;
const rnd = (r: number) => createHash("sha256").update("crowd" + r).digest("hex");
let checks = 0, failed = 0;
const ok = (c: boolean, m: string) => { checks++; if (!c) { failed++; console.log("  FAIL:", m); } else console.log("  ok:", m); };
let seed = 987654321; const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);

const d = makeD1();
const env: Env = { DB: d.db, ORGANIZER_SECRET: SECRET, DAILY_WRITE_BUDGET: "100000" };
let t = 0; const T0 = roundTimeMs(START - 3); const utc = () => T0 + t;
const WALL = 1_700_000_000_000;
const H = (h: Record<string, string> = {}) => ({ "content-type": "application/json", ...h });
const raw = (m: string, p: string, b?: unknown, h: Record<string, string> = {}) => handle(new Request("http://x" + p, { method: m, headers: H(h), body: b === undefined ? undefined : JSON.stringify(b) }), env, WALL);

await raw("POST", "/api/z", { id: EID, startRound: START, callSeconds: 6, cap: N <= 500 ? 500 : N <= 2000 ? 2000 : 100000, tickets: CFG.tickets, rewards: CFG.rewards, breaks: CFG.breaks, rounds: CFG.rounds }, { "x-organizer": SECRET });
await raw("PUT", `/api/z/${EID}/control/key`, { publicKey: publicKeyFromSecret(KEY) }, { "x-organizer": SECRET });

interface P { rt: PhoneRuntime; phone: string; joinAt: number; offFrom: number; offTo: number; blockedAll: boolean; liar: boolean; flaky: number; cheater: boolean; stranded: boolean }
const phones: P[] = Array.from({ length: N }, (_, i) => {
  const blockedAll = rng() < 0.03, liar = !blockedAll && rng() < 0.02, flaky = rng() < 0.1 ? 0.3 : 0.0;
  const offFrom = rng() < 0.05 ? 20 + Math.floor(rng() * 100) : -1;
  const mem = new Map<string, string>();
  const p: P = { rt: null as unknown as PhoneRuntime, phone: "9" + String(100000000 + i), joinAt: rng() < 0.3 ? Math.floor(rng() * 150) : 0, offFrom, offTo: offFrom + 25, blockedAll, liar, flaky, cheater: i % 100 === 7, stranded: blockedAll };
  const isOff = () => offFrom >= 0 && step >= offFrom && step < p.offTo;
  const fetcher: Fetcher = async (url) => {
    if (blockedAll || isOff()) throw new Error("blocked");
    const last = url.split("/").pop()!;
    const nowR = roundAt(utc());
    const r = last === "latest" ? nowR : Number(last);
    if (r > nowR) return { ok: false, status: 404, json: async () => ({}) };
    if (liar && url.includes("api2")) return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r + 7), signature: "aa" }) };
    return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) };
  };
  p.rt = new PhoneRuntime(EID, {
    api: async (m, path, b) => {
      if (isOff() || (flaky && rng() < flaky)) throw new Error("offline");
      const r = await raw(m, path, b); const j: any = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error ?? "http"), { status: r.status });
      return j;
    },
    beacon: { fetcher, mirrors: ["https://api.t", "https://api2.t", "https://api3.t"], timeoutMs: 400 },
    mono: () => t, store: { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) },
    verify: (x) => x.signature === "aa" && x.randomness === rnd(x.round),
  });
  return p;
});
let step = 0;
const TICKS = (RICH ? 215 + 25 + 20 : 215) + (ROUNDS - 1) * 212; // the rich settings add 25 rounds of breaks; each extra round adds 180 + the 30-round wait + slack
const t0 = Date.now();
const brkSeen = new Set<string>(); const brkLen = new Map<string, number>(); let brkGrew = false; let cheated = 0; let published = false, pauseIv: { start: number; end: number } | null = null; const sawDuring = new Set<number>();
for (step = 0; step < TICKS; step++) {
  t += 3000;
  const now = roundAt(utc());
  const batch: Promise<unknown>[] = [];
  for (const p of phones) {
    if (step < p.joinAt) continue;
    if (step === p.joinAt) batch.push(p.rt.boot().then(() => p.rt.join(p.phone, "P")));
    else if (p.rt.phase === "play" || p.rt.phase === "ended") batch.push(p.rt.tick());
    else if (p.rt.phase === "join") batch.push(p.rt.join(p.phone, "P")); // a failed join is retried by the person tapping again
    else if (p.rt.phase === "boot") batch.push(p.rt.boot());
  }
  for (let i = 0; i < batch.length; i += 500) await Promise.all(batch.slice(i, i + 500));
  if (step === 10) for (const p of phones) if (p.cheater && p.rt.pid) { await raw("POST", `/api/z/${EID}/claims`, { pid: p.rt.pid, claims: [{ pattern: "full", idx: 3 }, { pattern: "star", idx: 2 }] }); cheated += 2; } // invented claims, sent before the phone could have completed anything
  if (step === 60 && !published) { // the organizer signs a real pause of 20 rounds
    const f = (await readPublished({ get: async (k) => (await d.db.prepare("SELECT v FROM kv WHERE k=?").bind(k).first<any>())?.v ?? null, put: async () => {} }, EID));
    if (!f) { published = true; console.log("  (above 2,000 participants no pause is registered on the free plan: the pause step is skipped)"); } else {
    const m = signControlWithSecret(KEY, nextMessage(f, now, { action: "pause", pauseForRounds: 20 }));
    const r = await raw("POST", `/api/z/${EID}/control`, { message: m });
    ok(r.ok, "organizer pause accepted by the store");
    const f2 = (await readPublished({ get: async (k) => (await d.db.prepare("SELECT v FROM kv WHERE k=?").bind(k).first<any>())?.v ?? null, put: async () => {} }, EID))!;
    pauseIv = resolveControl(cfgOf(f2), f2.messages).intervals[0]!; published = true;
  } }
  if (RICH) { const ref0 = phones.find((p) => p.joinAt === 0 && !p.stranded && !p.liar && p.flaky === 0 && p.offFrom < 0)!; const b = ref0.rt.view().brk; if (b) { brkSeen.add(b.title); const L = ref0.rt.view().log.length; const prev = brkLen.get(b.title); if (prev === undefined) brkLen.set(b.title, L); else if (prev !== L) brkGrew = true; } }
  if (pauseIv && now >= pauseIv.start && now < pauseIv.end) { const ref = phones.find((p) => p.joinAt === 0 && !p.stranded && !p.liar && p.flaky === 0 && p.offFrom < 0)!; sawDuring.add(ref.rt.view().log.length); }
  if (step % 40 === 0) process.stdout.write(`  step ${step}/${TICKS}, ${((Date.now() - t0) / 1000).toFixed(0)} s\r`);
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\n  simulated ${N} phones x ${TICKS} ticks in ${elapsed} s`);

/* ---- checks ---- */
const f = (await readPublished({ get: async (k) => (await d.db.prepare("SELECT v FROM kv WHERE k=?").bind(k).first<any>())?.v ?? null, put: async () => {} }, EID));
const st = f ? resolveControl(cfgOf(f), f.messages) : null; // no file: nothing can be paused here (above 2,000 participants)
const refs: Record<number, number[]> = {};
for (let r = 1; r <= ROUNDS; r++) refs[r] = deriveCalls(roundEid(EID, r), Array.from({ length: 90 }, (_, k) => rnd(callRoundR(st, START, STRIDE, CFG.breaks, r, k)!)));
const ref = refs[ROUNDS]!; // phones that finished show the last round
ok(!pauseIv || sawDuring.size === 1, `during the pause no phone revealed a number (log held at ${[...sawDuring][0]})`);
if (RICH) { ok(brkSeen.size === 2 && !brkGrew, `both brand breaks were shown (${[...brkSeen].join(", ")}) and no number appeared while one was showing`); ok(phones.filter((p) => p.rt.pid).every((p) => p.rt.view().tickets.length === 2), "every participant holds two tickets"); }
const live = phones.filter((p) => !p.stranded && !p.liar && p.rt.pid);
const same = live.filter((p) => { const l = p.rt.view().log; return l.length === 90 && l.every((n, i) => n === ref[i]); });
const behind = live.filter((p) => !same.includes(p));
for (const p of behind.slice(0, 3)) { const l = p.rt.view().log; console.log(`  (behind: phone ${p.phone} joinAt=${p.joinAt} flaky=${p.flaky} off=${p.offFrom}-${p.offTo} blocked=${p.blockedAll} logLen=${l.length} firstWrong=${l.findIndex((n, i) => n !== ref[i])} phase=${p.rt.phase} pending=${p.rt.view().pendingChecks} mode=${p.rt.view().mode})`); }
ok(same.length === live.length, `every phone that could reach an honest beacon has the identical 90-call log (${same.length}/${live.length}${behind.length ? "; behind: " + behind.length : ""})`);
const liars = phones.filter((p) => p.liar && p.rt.pid);
ok(liars.every((p) => { const l = p.rt.view().log; return l.every((n, i) => n === ref[i]); }), `phones whose mirror lied (${liars.length}) never held a wrong number (they used the other mirrors)`);
const strand = phones.filter((p) => p.stranded && p.rt.pid);
ok(strand.every((p) => p.rt.view().log.length === 0), `firewalled phones (${strand.length}) show nothing rather than guess; the organizer's settlement still covers them`);

// organizer side
const org = { "x-organizer": SECRET };
const people: any[] = [];
for (;;) { const pg = await (await raw("GET", `/api/z/${EID}/participants?offset=${people.length}`, undefined, org)).json() as any; people.push(...pg.participants); if (!pg.participants.length || people.length >= pg.total) break; } // a long list arrives in pages
const pids: string[] = people.map((x: any) => x.pid);
ok(pids.length === phones.filter((p) => p.rt.pid).length, `store holds exactly the ${pids.length} people who joined, no duplicates`);
const claims = (await (await raw("GET", `/api/z/${EID}/claims`, undefined, org)).json() as any).claims;
const claims2 = (await (await raw("GET", `/api/z/${EID}/claims`, undefined, org)).json() as any).claims;
const chk = checkClaims(EID, claims2.map((c: any) => ({ pid: c.pid, pattern: c.pattern, idx: c.idx, round: c.round })), refs, CFG);
// a cheater who also genuinely completes star at a different call has the INSERT OR IGNORE'd honest claim; count only the invented ones that are wrong
if (N > 500) ok(claims2.length === 0, `large engagement: no per-claim rows are stored (${claims2.length}); invented claims cannot influence winners because winners are recomputed from the public log`);
else ok(chk.bad.length === cheated && chk.good.length === claims2.length - cheated, `every invented claim was caught by recomputation and no true claim was rejected (${chk.bad.length} rejected of ${claims2.length}; ${cheated} invented)`);
for (const c of chk.bad.filter((c) => !((c.pattern === 'full' && c.idx === 3) || (c.pattern === 'star' && c.idx === 2))).slice(0, 5)) { const ph = phones.find((p) => p.rt.pid === c.pid)!; console.log(`  (unexpected bad claim ${c.pattern}@${c.idx} true=${completionIndexKey(ticketsFor(EID, c.pid, CFG.tickets), c.pattern, ref)} joinAt=${ph.joinAt} liar=${ph.liar} flaky=${ph.flaky} off=${ph.offFrom} logLen=${ph.rt.view().log.length})`); }
const settled = Array.from({ length: ROUNDS }, (_, i) => settleAll(EID, pids, refs[i + 1]!, CFG, i + 1)).flat();
ok(settled.length === CFG.rewards.length * ROUNDS, `every reward line (${CFG.rewards.length}) settled from the public log, the participant list and the engagement settings alone`);
for (const s of settled) {
  if (s.ordinal === 1) { const truth = Math.min(...pids.map((pid) => completionIndexKey(ticketsFor(roundEid(EID, s.round), pid, CFG.tickets), s.pattern, refs[s.round]!)).filter((i) => i >= 0)); if (s.idx !== truth) ok(false, `${s.pattern} earliest call matches ground truth`); }
}
ok(true, "earliest completion for every pattern equals ground truth over all tickets: " + settled.map((s) => `r${s.round}:${s.pattern}#${s.ordinal}@${s.idx + 1}x${s.pids.length}`).join(" "));
const post = await raw("POST", `/api/z/${EID}/settle`, { results: settled.map((s) => ({ pattern: s.pattern, ordinal: s.ordinal, round: s.round, idx: s.idx, pids: s.pids })) }, org);
ok(post.ok, "organizer published the results");
const pub = await (await raw("GET", `/api/z/${EID}/results`)).json() as any;
if (pub.results.length !== settled.length) console.log("  (published", pub.results.length, "settled", settled.length, JSON.stringify(pub).slice(0, 200), ")");
ok(JSON.stringify(pub).includes("pids") === false && pub.results.length === settled.length, "public results carry counts only, no participant ids");
// an honest phone's own record: claimed everything it completed
const sample = live.filter((p) => same.includes(p)).slice(0, 200);

const missed = sample.filter((p) => { const v = p.rt.view(); return !keysInPlay(CFG.rewards).every((pat) => v.claimed.includes(pat) || completionIndexKey(v.tickets, pat, v.log) < 0); });
for (const p of missed.slice(0, 3)) console.log(`  (phone ${p.phone}: joinAt=${p.joinAt} flaky=${p.flaky} off=${p.offFrom} unsent=${p.rt.view().unsent} claimed=${p.rt.view().claimed.length})`);
ok(missed.length === 0, `sampled honest phones sent a claim for every pattern they completed (${sample.length - missed.length}/${sample.length})`);
const writes = (d.raw.query("SELECT SUM(writes) w FROM usage").get() as any).w as number;
ok(writes < 100000 * (N > 500 ? 0.2 : 0.5), `store writes for the whole engagement: ${writes} (${((writes / 100000) * 100).toFixed(1)}% of the free daily D1 allowance)`);
console.log(`\n${checks - failed}/${checks} checks passed${failed ? ` — ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
