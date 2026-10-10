// CAMPAIGN COPY of tools/sim2/crowd.ts with: invite chains (level 1 phones, level 2 phones that join through a level-1 invite), timed mid-game actions (announce, pause ...), winners confirming their prize, ticket/phone details out.
// Extra args: invite:{l1,l2,per,cats,l2At}  actions:[{step,method,path,key,body,tag}]  confirm:N  (see the end of this file for what is printed)
// Phone crowd over HTTP, in virtual time, against the running sim server (bun).  N real PhoneRuntime instances (the code the phone page runs) talk to the sim server's
// real Worker through HTTP (one simulated address per phone), and to the fake beacon. The server clock is frozen and moved with the phones' virtual clock, so a whole
// 90-number game takes seconds. Winners come from the phones' own votes (the Worker accepts no organizer settlement), exactly as in production.
// Usage: bun tools/sim2/crowd.ts '{"eid":"SIM1","startRound":123,"phones":30,"seed":"sim","lateFrac":0.3,"offlineFrac":0.05,"maxSteps":420,"base":"http://localhost:8801"}'
// Prints one JSON line:  { ok, phones, joined, steps, seconds, reference:[..], groups:[{canon,count}], logsEqual, ended, results:[...first phone], failures:[..] }
import { PhoneRuntime } from "../../../packages/beacon/src/phone-runtime";
import { callRoundR } from "../../../packages/beacon/src/game";
import { deriveCalls } from "../../../packages/beacon/src";
import { PrizeEngine } from "../../../packages/beacon/src/prize-engine";
import { GRACE_ROUNDS, roundEid } from "../../../packages/beacon/src/config";
// @ts-ignore plain JS module shared with the node harness (no declaration file on purpose)
import { fakeFetcher, fakeVerify, randomnessOf, roundTimeMs } from "../lib/beacon.mjs";
import { createHash } from "node:crypto";

const a = JSON.parse(process.argv[2] ?? "{}");
const BASE: string = a.base ?? "http://localhost:8801", EID: string = a.eid, START: number = a.startRound, N: number = a.phones ?? 30, SEED: string = a.seed ?? "sim";
const LATE: number = a.lateFrac ?? 0.3, OFF: number = a.offlineFrac ?? 0.05, MAX: number = a.maxSteps ?? 420, PHONE0: number = a.phoneBase ?? 100000;
const FULL: number = Math.min(N, a.full ?? N), WAIT = a.waiting ?? null, INV = a.invite ?? null, ACTIONS: any[] = a.actions ?? [], CONFIRM: number = a.confirm ?? 0;
if (!EID || !START) { console.log(JSON.stringify({ ok: false, error: "eid and startRound needed" })); process.exit(2); }
let seedN = [...SEED].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7); const rng = () => ((seedN = (seedN * 1664525 + 1013904223) >>> 0) / 0x100000000);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const post = (p: string, body: unknown) => fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

const info = await (await fetch(`${BASE}/api/z/${EID}/info`)).json() as any;
if (!info || info.error) { console.log(JSON.stringify({ ok: false, error: "info: " + JSON.stringify(info) })); process.exit(2); }
const STRIDE = info.callSeconds / 3;
let t = 0; const T0 = roundTimeMs(START) - 100_000; const utc = () => T0 + t;
await post("/__sim/clock", { set: utc(), freeze: true });

/** A "ghost" phone: a real participant that joins through the real join call (own device, own address, invites, waiting room) but does not run the phone program. Used for the bulk of a 1000-person game so memory stays small; ~FULL phones run the real PhoneRuntime. */
export const ghostDevice = (phone: string) => sha("ghostdev|" + phone).slice(0, 32);
class Ghost {
  pid: string | null = null; phase: string = "boot"; error: string | null = null; lastTry = -99; deps: any = { beacon: {} };
  constructor(readonly phone: string, readonly ip: string) {}
  async boot() { this.phase = "join"; }
  async join(phone: string, name?: string, invite?: { from?: number; cat?: string }) {
    const r = await fetch(BASE + `/api/z/${EID}/join`, { method: "POST", headers: { "content-type": "application/json", "x-sim-ip": this.ip }, body: JSON.stringify({ phone, name, device: ghostDevice(phone), ...(invite?.from ? { from: invite.from } : {}), ...(invite?.cat ? { cat: invite.cat } : {}) }) });
    const j: any = await r.json().catch(() => ({}));
    if (r.ok && j.pid) { this.pid = j.pid; this.phase = "ended"; return true; } // "ended" = nothing more to do for a ghost
    this.error = j.error ?? "http " + r.status; this.phase = "join"; this.code = j.code ?? r.status; return false;
  }
  code: any = null;
  async tick() { return this.view(); }
  view(): any { return { phase: this.phase, pid: this.pid, won: [], results: [], log: [], cfg: null, late: null }; }
}
interface P { rt: PhoneRuntime; full: boolean; phone: string; joinAt: number; offFrom: number; offTo: number; failed: string[]; lvl: number; via: number | null; lastTry: number; cat?: string }
let allDoneAt = -1; const TAIL: number = a.tail ?? 100; let step = 0; const actionResults: any[] = []; const waitStats: any = { seen: 0, n: 0, admit: 0, decline: 0, errors: 0 };
const phones: P[] = Array.from({ length: N }, (_, i) => {
  const mem = new Map<string, string>(), phone = "9" + String(PHONE0 + i).padStart(9, "0").slice(-9), ip = `10.20.${(i >> 8) & 255}.${(i & 255) + 1}`;
  const offFrom = rng() < OFF ? 20 + Math.floor(rng() * 100) : -1;
  const lvl = INV ? (i < INV.l1 ? 1 : i < INV.l1 + INV.l2 ? 2 : 0) : 0; // level 1 = joined directly and may invite; level 2 = joined through a level-1 invite; 0 = ordinary
  const joinAt = lvl === 1 ? Math.floor(rng() * 6) : lvl === 2 ? (INV.l2At ?? 14) + Math.floor(rng() * 30) : rng() < LATE ? Math.floor(rng() * 150) : Math.floor(rng() * 8);
  const p: P = { rt: null as unknown as PhoneRuntime, full: true, phone, joinAt, offFrom: lvl ? -1 : offFrom, offTo: offFrom + 25, failed: [], lvl, via: null, lastTry: -99 };
  const isOff = () => offFrom >= 0 && step >= offFrom && step < p.offTo;
  p.full = FULL >= N || i % Math.ceil(N / FULL) === 0;
  if (!p.full) { p.rt = new Ghost(phone, ip) as unknown as PhoneRuntime; return p; }
  p.rt = new PhoneRuntime(EID, {
    api: async (m: string, path: string, b?: unknown) => {
      if (isOff()) throw new Error("offline");
      const r = await fetch(BASE + path, { method: m, headers: { "content-type": "application/json", "x-sim-ip": ip }, body: b === undefined ? undefined : JSON.stringify(b) });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error ?? "http " + r.status), { status: r.status, code: j.code, body: j });
      return j;
    },
    beacon: { fetcher: isOff() ? undefined : (fakeFetcher(utc, SEED) as any), mirrors: ["https://api.t", "https://api2.t", "https://api3.t"], timeoutMs: 400 },
    mono: () => t, store: { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v) },
    verify: fakeVerify(SEED) as any,
    getPublic: async (url: string) => { const r = await fetch(url); if (!r.ok) throw Object.assign(new Error("http " + r.status), { status: r.status }); return r.json(); },
  } as any);
  // the fetcher closure above must honour the offline window: wrap it
  const f = fakeFetcher(utc, SEED) as any; (p.rt.deps.beacon as any).fetcher = async (u: string, init: any) => { if (isOff()) throw new Error("offline"); return f(u, init); };
  return p;
});
const t0 = Date.now();
for (step = 0; step < MAX; step++) {
  t += 3000;
  await post("/__sim/clock", { set: utc() });
  for (const act of ACTIONS) if (act.step === step) { try { const r = await fetch(BASE + act.path, { method: act.method ?? "POST", headers: { "content-type": "application/json", ...(act.key ? { "x-organizer": act.key } : {}) }, body: act.body === undefined ? undefined : JSON.stringify(act.body) }); actionResults.push({ tag: act.tag, step, status: r.status, body: await r.json().catch(() => ({})) }); } catch (e: any) { actionResults.push({ tag: act.tag, step, status: 0, body: { error: String(e?.message ?? e) } }); } }
  if (WAIT && step >= WAIT.from && (step - WAIT.from) % WAIT.every === 0) { // the organizer works the waiting room: admit most, decline every Nth
    try {
      const wr = await (await fetch(`${BASE}/api/z/${EID}/waiting`, { headers: { "x-organizer": WAIT.key } })).json() as any;
      const entries: any[] = wr.waiting ?? wr.list ?? wr.entries ?? []; const pend = entries.filter((e) => (e.status ?? "pending") === "pending");
      waitStats.seen = Math.max(waitStats.seen, entries.length);
      for (const [k, e] of pend.entries()) { const d = (waitStats.n++ % WAIT.declineEvery === WAIT.declineEvery - 1) ? "decline" : "admit"; const r = await fetch(`${BASE}/api/z/${EID}/waiting/${e.id}`, { method: "POST", headers: { "content-type": "application/json", "x-organizer": WAIT.key }, body: JSON.stringify({ decision: d }) }); waitStats[r.ok ? d : "errors"]++; void k; }
      if (!entries.length && !waitStats.shape) waitStats.shape = Object.keys(wr).join(",");
    } catch (e: any) { waitStats.errors++; waitStats.lastError = String(e?.message ?? e); }
  }
  const batch: Promise<unknown>[] = [];
  for (const p of phones) {
    if (step < p.joinAt) continue;
    const ph = p.rt.phase;
    if (step === p.joinAt) {
      let inv: { from?: number; cat?: string } | undefined;
      if (p.lvl === 2) { // join through a level-1 phone's link: its seat number is the front of its participant id ("<seq>x<hash>")
        const l1s = phones.slice(0, INV.l1).filter((q) => q.rt.pid); const j = (phones.indexOf(p) - INV.l1) % Math.max(1, INV.l1);
        const owner = phones[j]?.rt.pid ? phones[j]! : l1s[0]; if (!owner) { p.joinAt++; continue; }
        p.via = Number(String(owner.rt.pid).split("x")[0]); p.cat = (INV.cats ?? ["colleagues"])[j % (INV.cats ?? ["colleagues"]).length]; inv = { from: p.via, cat: p.cat };
      }
      batch.push(p.rt.boot().then(() => p.rt.join(p.phone, "P" + p.phone.slice(-4), inv)).catch((e: any) => p.failed.push("join: " + (e?.message ?? e))));
    }
    else if (ph === "play" || ph === "ended") batch.push(p.rt.tick().catch((e: any) => p.failed.push("tick: " + (e?.message ?? e))));
    else if (ph === "join") { if (p.full || step - p.lastTry >= 6) { p.lastTry = step; batch.push(p.rt.join(p.phone, "P" + p.phone.slice(-4), p.lvl === 2 && p.via ? { from: p.via, cat: p.cat } : undefined).catch(() => {})); } }
    else if (ph === "boot") batch.push(p.rt.boot().catch(() => {}));
  }
  for (let i = 0; i < batch.length; i += 50) await Promise.all(batch.slice(i, i + 50));
  if (allDoneAt < 0 && step > 60 && ACTIONS.every((x) => x.step <= step) && phones.every((p) => step < p.joinAt || p.rt.phase === "ended" || p.rt.phase === "missing" || (WAIT && p.rt.phase === "join" && step > WAIT.from + 150))) allDoneAt = step; // every phone has its 90 numbers: keep the phones open a few more simulated minutes so their last votes (Full House, Unlucky) reach the server, as open phones do in real life
  if (allDoneAt >= 0 && step >= allDoneAt + TAIL) { step++; break; }
}
await post("/__sim/clock", { set: utc(), freeze: false });

const views = phones.map((p) => ({ p, v: p.rt.view() }));
const joined = views.filter((x) => x.v.pid);
const joinedFull = joined.filter((x) => x.p.full); const ended = joinedFull.filter((x) => x.v.phase === "ended");
const cfg = (joinedFull[0]?.v.cfg ?? info) as any;
const rounds = cfg.rounds ?? 1;
const ref: number[][] = [];
for (let r = 1; r <= rounds; r++) ref.push(deriveCalls(roundEid(EID, r), Array.from({ length: 90 }, (_, k) => randomnessOf(callRoundR(null as any, START + GRACE_ROUNDS, STRIDE, cfg.breaks ?? [], r, k)!, SEED))));
// THE REFEREE: an independent recomputation of every round from the public numbers and the public seat list (one fresh engine per round, seats first, then the calls in order).
// Its answer must equal what the phones showed and what the server published. Printed per round as "pattern|ordinal|idx|count".
const referee: string[][] = []; { const rt0: any = joinedFull[0]?.p.rt; if (rt0?.seatList) for (let r = 1; r <= rounds; r++) {
  const eng = new PrizeEngine(roundEid(EID, r), cfg, r); eng.addSeats(rt0.seatList.map((x: any) => ({ pid: x.pid, countFrom: x.countFrom, ex: x.ex, blk: x.blk }))); eng.work(1e9);
  for (let k = 0; k < 90; k++) { const br = callRoundR(null as any, START + GRACE_ROUNDS, STRIDE, cfg.breaks ?? [], r, k)!; eng.feed(ref[r - 1]![k]!, br, randomnessOf(br, SEED)); }
  eng.setOver(true); referee.push(eng.results().map((q: any) => `${r}|${q.pattern}|${q.ordinal}|${q.idx}|${q.pids.length}`).sort()); } }
const canon = (res: any[]) => JSON.stringify([...res].map((r) => `${r.round ?? 1}|${r.pattern}|${r.ordinal}|${r.idx}|${r.count ?? ""}`).sort());
const groups = new Map<string, number>(); for (const x of ended) groups.set(canon(x.v.results), (groups.get(canon(x.v.results)) ?? 0) + 1);
const full = ended.filter((x) => x.v.log.every((n: number, i: number) => n === ref[rounds - 1]![i + (x.v.late?.hidden ?? 0)])); // a game may end early when every prize is awarded: the log is then a prefix of the 90
const failures: string[] = [];
if (joined.length < N * 0.9) failures.push(`only ${joined.length} of ${N} phones joined`);
if (ended.length < joinedFull.length) failures.push(`${joinedFull.length - ended.length} joined full phones had not ended after ${step} steps`);
if (groups.size > 1) failures.push(`phones disagree on the winners (${groups.size} different sets)`);
const badDetail: any[] = [];
for (const x of ended.filter((x) => !full.includes(x)).slice(0, 5)) { const off = x.v.late?.hidden ?? 0, rf = ref[rounds - 1]!; const fm = x.v.log.findIndex((n: number, i: number) => n !== rf[i + off]); badDetail.push({ phone: x.p.phone, joinAt: x.p.joinAt, offFrom: x.p.offFrom, hidden: off, logLen: x.v.log.length, firstMismatch: fm, got: x.v.log.slice(Math.max(0, fm - 1), fm + 4), want: rf.slice(Math.max(0, fm - 1) + off, fm + 4 + off), late: x.v.late }); failures.push(`phone ${x.p.phone} has a wrong number log (joinAt ${x.p.joinAt}, offline from ${x.p.offFrom}, first mismatch at call ${fm})`); }
// diagnostics for a disagreement: the two biggest groups, what differs, and what kind of phones are in the small one
const groupDiag: any[] = []; if (groups.size > 1) { const gl = [...groups].sort((a, b) => b[1] - a[1]); const ref = new Set(JSON.parse(gl[0]![0]) as string[]);
  for (const [c, n] of gl.slice(1, 4)) { const mine = new Set(JSON.parse(c) as string[]); const members = ended.filter((x) => canon(x.v.results) === c); groupDiag.push({ count: n, onlyHere: [...mine].filter((x) => !ref.has(x)).slice(0, 8), missingHere: [...ref].filter((x) => !mine.has(x)).slice(0, 8), phones: members.slice(0, 6).map((x) => ({ phone: x.p.phone, joinAt: x.p.joinAt, offFrom: x.p.offFrom, lvl: x.p.lvl, late: x.v.late, logLen: x.v.log.length, pid: x.v.pid })) }); }
  const dive = (x: any) => { const rt: any = x.p.rt; const out: any = { phone: x.p.phone, seatList: rt.seatList?.length, pids: {} }; for (const [r, e] of rt.engines ?? []) for (const q of e.results()) if (q.pattern === "early5") { out.pids[`${r}:${q.pattern}#${q.ordinal}@${q.idx}`] = [...q.pids].sort(); out.seats = [...q.pids].map((pid: string) => rt.seatList.find((s: any) => s.pid === pid)); } return out; };
  const minority = ended.find((x) => canon(x.v.results) === gl[1]![0]), majority = ended.find((x) => canon(x.v.results) === gl[0]![0]);
  groupDiag.push({ diveMajority: majority ? dive(majority) : null, diveMinority: minority ? dive(minority) : null });
  groupDiag.unshift({ biggest: gl[0]![1], results: [...ref].slice(0, 40) }); }
const phoneState = (() => { const x = joinedFull[0]; if (!x) return null; const v: any = x.v; return { round: v.round, rounds: v.rounds, logLen: v.log.length, allAwarded: v.allAwarded, endedByPrizes: v.endedByPrizes, intermission: v.intermission, phase: v.phase, results: v.results.map((r: any) => `${r.round ?? 1}|${r.pattern}|${r.ordinal}|${r.idx}|${r.count ?? ""}`), past: v.past, nowRound: v.nowRound, startRound: v.startRound }; })();
const resultsFinal = await (await fetch(`${BASE}/api/z/${EID}/results`)).json() as any;
const confirmed: any[] = [];
for (const x of joined.filter((x) => x.v.won?.length).slice(0, CONFIRM)) { // a winner confirms name and mobile on their own phone (device proof)
  const r = await fetch(`${BASE}/api/z/${EID}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pid: x.v.pid, device: (x.p.rt as any).device(), name: "Winner " + x.p.phone.slice(-4), phone: x.p.phone }) });
  confirmed.push({ phone: x.p.phone, pid: x.v.pid, status: r.status, won: x.v.won.length });
}
const wonCounts = joined.reduce((n: number, x) => n + (x.v.won?.length ?? 0), 0);
const lvlInfo = INV ? { l1Joined: phones.filter((q) => q.lvl === 1 && q.rt.pid).length, l2Joined: phones.filter((q) => q.lvl === 2 && q.rt.pid).length, l2Via: phones.filter((q) => q.lvl === 2 && q.via !== null).map((q) => ({ phone: q.phone, from: q.via })).slice(0, 2000) } : null;
console.log(JSON.stringify({ referee, phoneState, groupDiag, fullPhones: phones.filter((q) => q.full).length, ghostPhones: phones.filter((q) => !q.full).length, joinedFull: joinedFull.length, waitStats, actionResults, confirmed, wonCounts, lvlInfo, offlineCount: phones.filter((q) => q.offFrom >= 0).length, ok: !failures.length, phones: N, joined: joined.length, ended: ended.length, steps: step, seconds: +((Date.now() - t0) / 1000).toFixed(1), logsEqual: `${full.length}/${ended.length}`, groups: [...groups].map(([c, n]) => ({ count: n, results: JSON.parse(c).length })), results: ended[0]?.v.results ?? [], published: resultsFinal.results ?? [], reference: ref[rounds - 1], perPhone: ended.slice(0, 400).map((x) => ({ phone: x.p.phone, canon: sha(canon(x.v.results)).slice(0, 8) })), failures, badDetail, phases: views.reduce((m: any, x) => (m[x.v.phase] = (m[x.v.phase] ?? 0) + 1, m), {}), sample: views.slice(0, 3).map((x) => ({ firstMismatch: x.v.log.findIndex((n: number, i: number) => n !== ref[rounds - 1]![i + (x.v.late?.hidden ?? 0)]), logHead: x.v.log.slice(0, 6), refHead: ref[rounds - 1]!.slice(0, 6), phone: x.p.phone, phase: x.v.phase, error: x.v.error, log: x.v.log.length, nowRound: x.v.nowRound, startRound: x.v.startRound, mode: x.v.mode, locked: x.v.locked, late: x.v.late })), phoneErrors: phones.flatMap((p) => p.failed).slice(0, 5) }));
