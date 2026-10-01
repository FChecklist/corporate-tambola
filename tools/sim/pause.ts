// Pause / resume / extend / stop simulation for the zero-server design.
// N simulated phones run the REAL control code (signature checks, log acceptance, the pure schedule function, the freshness rule)
// against a stand-in CDN with outages, lying edges, stale edges and a withholding edge. Time is the beacon round (1 tick = 1 round = 3 s);
// no phone clock is used for anything but its own polling timer, which is randomly wrong.
// Randomness per round is a stand-in hash (the BLS beacon itself is covered by phones.ts and packages/beacon tests).
// Run: bun run tools/sim/pause.ts [phones=300] [fast]
import {
  ControlTracker, SAFETY_FAST, SAFETY_STANDARD, cfgOf, describeControl, nextMessage, pickNumber, publishControl, readPublished, registerKey, resolveControl,
  publicKeyFromSecret, scheduleWithControl, signControlWithSecret, type ControlAction, type KV, type Safety,
} from "../../packages/beacon/src";

const N = Number(process.argv[2] ?? 300);
const FAST = process.argv.includes("fast");
const SAFE: Safety = FAST ? SAFETY_FAST : SAFETY_STANDARD;
const POLL_TICKS = FAST ? [2, 3] : [2, 3, 4]; // 6 s, 9 s, 12 s  (fast: 6 s, 9 s)
const ENG = "SIMPAUSE";
const S = 10_000, STRIDE = 2, CALLS = 90; // 6-second calls
const secret = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 255);
const secretHex = Array.from(secret, (b) => b.toString(16).padStart(2, "0")).join("");
const pubHex = publicKeyFromSecret(secretHex);
const rnd = (round: number) => new Bun.CryptoHasher("sha256").update(`SIMBEACON|${round}`).digest("hex");
let seed = 987654321;
const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rng() * a.length)]!;

let checks = 0, failed = 0;
const ok = (c: boolean, msg: string) => { checks++; if (!c) { failed++; console.log("  FAIL:", msg); } else console.log("  ok:", msg); };
const memKv = (): KV => { const m = new Map<string, string>(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) }; };

interface Act { tick: number; action: ControlAction; opts?: { pauseForRounds?: number; untilRound?: number; inRounds?: number } }
interface Scenario {
  name: string; maxPause?: number; acts: Act[];
  outages?: { from: number; to: number }[];          // the whole CDN is unreachable for everyone
  liarFrac?: number;                                 // phones whose primary edge returns forged messages
  withholdFrac?: number;                             // phones whose primary edge is stuck on an old (genuine) answer: a censoring CDN
  crossCheck?: boolean;                              // every poll reads BOTH mirrors and merges them (2x requests)
  slowEdges?: boolean;                               // edges are 2 ticks stale instead of 1 (worse than the design assumes)
  expect: "clean" | "blind-may-diverge" | "report";
  stopAfterTicks?: number;
}

const SCENARIOS: Scenario[] = [
  { name: "A. no control messages at all (the layer must be invisible)", acts: [], expect: "clean" },
  { name: "B. pause for ~2 minutes, then resume (spans many calls)", acts: [{ tick: S + 60, action: "pause" }, { tick: S + 100, action: "resume" }], expect: "clean" },
  { name: "C. timed 3-min break, extended by 2 min, a second pause, then Stop at about call 70", maxPause: 200, acts: [
      { tick: S + 30, action: "pause", opts: { pauseForRounds: 60 } }, { tick: S + 60, action: "extend", opts: { untilRound: S + 30 + 13 + 100 } },
      { tick: S + 200, action: "pause" }, { tick: S + 215, action: "resume" }, { tick: S + 250, action: "stop" }], expect: "clean" },
  { name: "D. organizer pauses and vanishes: the pause ends by itself after maxPause (60 rounds here)", maxPause: 60, acts: [{ tick: S + 50, action: "pause" }], expect: "clean" },
  { name: "E. CDN outage of 2 min with a pause published during it (shorter than give-up: phones hold, never guess)", acts: [{ tick: S + 80, action: "pause" }, { tick: S + 130, action: "resume" }], outages: [{ from: S + 78, to: S + 118 }], expect: "clean" },
  { name: "F. LONG CDN outage (4 min, longer than give-up) with a pause inside it", acts: [{ tick: S + 80, action: "pause" }, { tick: S + 120, action: "resume" }], outages: [{ from: S + 78, to: S + 160 }], expect: "blind-may-diverge" },
  { name: "G. 10% of phones sit behind an edge that returns FORGED messages (they must fail over to the second mirror)", acts: [{ tick: S + 60, action: "pause" }, { tick: S + 100, action: "resume" }, { tick: S + 160, action: "pause", opts: { pauseForRounds: 30 } }], liarFrac: 0.1, expect: "clean" },
  { name: "H. edges 2 ticks stale (worse than the 1 tick the lead is designed for), pause + resume + stop", acts: [{ tick: S + 40, action: "pause" }, { tick: S + 70, action: "resume" }, { tick: S + 140, action: "stop" }], slowEdges: true, expect: "clean" },
  { name: "I. LIMIT: a censoring edge withholds a pause from 5% of phones (genuine but old answers)", acts: [{ tick: S + 60, action: "pause" }, { tick: S + 100, action: "resume" }], withholdFrac: 0.05, expect: "report" },
  { name: "J. same censoring edge, but every poll reads both mirrors and merges them", acts: [{ tick: S + 60, action: "pause" }, { tick: S + 100, action: "resume" }], withholdFrac: 0.05, crossCheck: true, expect: "clean" },
];

interface Phone {
  id: number; colo: number; joinTick: number; lag: number; timerScale: number; flake: number; liar: boolean; withhold: boolean;
  online: boolean; offUntil: number; nextPoll: number; tracker?: ControlTracker; revealed: { round: number; number: number }[]; polls: number; blindTicks: number; heldTicks: number; sawBlind: boolean;
}

async function run(sc: Scenario) {
  console.log(`\n${sc.name}`);
  const origin = memKv(), mirror2 = memKv();
  await registerKey(origin, ENG, pubHex, SAFE, sc.maxPause ?? 600);
  await registerKey(mirror2, ENG, pubHex, SAFE, sc.maxPause ?? 600);
  const cfg = cfgOf((await readPublished(origin, ENG))!);
  let mirror2Pending: { tick: number; msg: any }[] = [];
  const COLOS = 8, edge: (string | null)[] = Array(COLOS).fill(null), edge2: (string | null)[] = Array(COLOS).fill(null);
  const edgeHist: string[][] = Array.from({ length: COLOS }, () => []);
  const staleTicks = sc.slowEdges ? 2 : 1;
  const frozen = (await bodyOf(origin)); // what a censoring edge keeps serving: the log as it was before any message

  const phones: Phone[] = Array.from({ length: N }, (_, id) => ({
    id, colo: id % COLOS, joinTick: rng() < 0.3 ? S + Math.floor(rng() * 200) : S - 30, lag: Math.floor(rng() * 2), timerScale: 0.9 + rng() * 0.2, flake: rng() * 0.05,
    liar: rng() < (sc.liarFrac ?? 0), withhold: rng() < (sc.withholdFrac ?? 0), online: true, offUntil: 0, nextPoll: 0, revealed: [], polls: 0, blindTicks: 0, heldTicks: 0, sawBlind: false,
  }));
  const outage = (t: number) => (sc.outages ?? []).some((o) => t >= o.from && t < o.to);
  let publishErrors: string[] = [];

  // the truth: what the organizer actually published
  const endTickGuess = S + 700;
  let lastActTick = 0;
  for (let t = S - 40; t < endTickGuess; t++) {
    // edges refresh from the origin at the start of the tick
    const b = JSON.stringify(await bodyOf(origin)), b2 = JSON.stringify(await bodyOf(mirror2));
    for (let c = 0; c < COLOS; c++) { edgeHist[c]!.push(b); edge[c] = edgeHist[c]![Math.max(0, edgeHist[c]!.length - staleTicks)]!; edge2[c] = b2; }
    // organizer console
    for (const a of sc.acts.filter((x) => x.tick === t)) {
      const f = (await readPublished(origin, ENG))!;
      const m = signControlWithSecret(secretHex, nextMessage(f, t, { action: a.action, ...a.opts }));
      const r = await publishControl(origin, ENG, m);
      if (!r.ok) publishErrors.push(`${a.action}@${t}: ${r.error}`); else { mirror2Pending.push({ tick: t + 1, msg: m }); lastActTick = t; }
    }
    for (const p of mirror2Pending.filter((x) => x.tick <= t)) await publishControl(mirror2, ENG, p.msg);
    mirror2Pending = mirror2Pending.filter((x) => x.tick > t);

    for (const p of phones) {
      if (t < p.joinTick) continue;
      if (!p.tracker) p.tracker = new ControlTracker(cfg, ENG, SAFE, t - p.lag);
      // drops: phones lose connectivity for a while and come back
      if (p.online && rng() < 0.004) { p.online = false; p.offUntil = t + 2 + Math.floor(rng() * 20); }
      if (!p.online) { if (t >= p.offUntil) { p.online = true; p.nextPoll = t; } else continue; }
      const now = t - p.lag; // the phone's view of the beacon round (mirror lag), never its own clock
      if (t >= p.nextPoll) {
        p.polls++;
        p.nextPoll = t + Math.max(1, Math.round(pick(POLL_TICKS) * p.timerScale)); // device timers are a little fast/slow (wrong CLOCKS do not matter, nothing reads them)
        // primary first; on a bad answer, the second mirror
        let good = false;
        for (const src of [0, 1]) {
          if (outage(t) || rng() < p.flake) continue;
          let body: any;
          if (src === 0) {
            const raw = p.withhold ? JSON.stringify(frozen) : edge[p.colo]!;
            body = JSON.parse(raw);
            if (p.liar && body.messages.length) body = { ...body, messages: body.messages.map((m: any, i: number) => (i === 0 ? { ...m, atBeaconRound: m.atBeaconRound + 1 } : m)) };
            else if (p.liar) body = { ...body, messages: [{ ...(sc.acts.length ? {} : {}), engagementId: ENG, seq: 1, action: "stop", atBeaconRound: t, signedAtRound: t - 40, sig: "ab".repeat(64) }] };
          } else body = JSON.parse(edge2[p.colo]!);
          if (await p.tracker.ingest(now, body)) { good = true; if (!sc.crossCheck) break; }
        }
        if (!good) p.tracker.failed(now);
      }
      // reveal new calls while the freshness rule allows
      const mode = p.tracker.mode(now);
      if (mode === "hold") p.heldTicks++;
      if (mode === "blind") { p.blindTicks++; p.sawBlind = true; }
      if (mode !== "hold") {
        for (;;) {
          const k = p.revealed.length;
          if (k >= CALLS) break;
          const ar = p.tracker.callRound(S, STRIDE, k);
          if (ar === null || ar > now) break;
          p.revealed.push({ round: ar, number: pickNumber(ENG, k, rnd(ar), p.revealed.map((x) => x.number)) });
        }
      }
    }
  }

  // ---- final truth and final sweep ----
  const file = (await readPublished(origin, ENG))!;
  const truth = resolveControl(cfgOf(file), file.messages);
  const refRounds = scheduleWithControl(truth, S, STRIDE, CALLS);
  const ref: { round: number; number: number }[] = [];
  for (let k = 0; k < CALLS; k++) { const r = refRounds[k]; if (r === null || r === undefined) break; ref.push({ round: r, number: pickNumber(ENG, k, rnd(r), ref.map((x) => x.number)) }); }
  const finalBody = await bodyOf(origin);
  for (const p of phones) await p.tracker!.ingest(t_end(), JSON.parse(JSON.stringify(finalBody)));
  function t_end() { return endTickGuess; }
  const canonical = (p: Phone) => { const out: number[] = []; const rs = scheduleWithControl(p.tracker!.state, S, STRIDE, CALLS); for (let k = 0; k < CALLS; k++) { const r = rs[k]; if (r == null) break; out.push(pickNumber(ENG, k, rnd(r), out)); } return out; };
  const refNums = ref.map((x) => x.number);
  const canonOk = phones.filter((p) => { const c = canonical(p); return c.length === refNums.length && c.every((n, i) => n === refNums[i]); }).length;
  ok(canonOk === phones.length, `after one good fetch every phone (${phones.length}, incl. late joiners and dropped phones) computes the identical ${ref.length}-number call log (${canonOk}/${phones.length})`);

  const diverged = phones.filter((p) => p.revealed.some((x, i) => !ref[i] || ref[i]!.round !== x.round || ref[i]!.number !== x.number));
  const blindDiv = diverged.filter((p) => p.sawBlind), liveDiv = diverged.filter((p) => !p.sawBlind);
  const held = phones.filter((p) => p.heldTicks > 0).length, blind = phones.filter((p) => p.sawBlind).length;
  if (sc.expect === "clean") {
    ok(diverged.length === 0, `no phone ever showed a number that the final log contradicts (${diverged.length} of ${phones.length} did)`);
    if (sc.liarFrac) ok(phones.filter((p) => p.liar).length > 0, `the forging edge really was in play (${phones.filter((p) => p.liar).length} phones behind it) and none of them accepted a forged message`);
    if (sc.outages) ok(held > 0, `the outage was real: ${held} phones held their numbers instead of guessing`);
    ok(blind === 0, `no phone had to carry on blind (${blind}); ${held} phones paused themselves briefly while the control file was unreachable/lying`);
  } else if (sc.expect === "blind-may-diverge") {
    ok(liveDiv.length === 0, `phones that stayed in live/hold never showed a contradicted number (${liveDiv.length})`);
    console.log(`  note: ${blind} phones were silent from the control file for longer than give-up and carried on blind; ${blindDiv.length} of them showed numbers the pause later contradicted. They re-derive the true log on their first good fetch (checked above).`);
  } else {
    console.log(`  report: ${diverged.length} of ${phones.length} phones (${(100 * diverged.length / phones.length).toFixed(1)}%) showed a contradicted number; ${phones.filter((p) => p.withhold).length} sat behind the censoring edge. All converge on the true log afterwards. This is the case the freshness rule cannot see (see design doc, risks).`);
  }
  ok(refNums.length === new Set(refNums).size, "the reference log uses each number once");
  if (truth.stopRound !== null) ok(ref.length < CALLS && ref.every((x) => x.round < truth.stopRound!), `Stop honoured: ${ref.length} numbers called, none at or after the stop round`);
  ok(ref.every((x) => truth.intervals.every((i) => x.round < i.start || x.round >= i.end)), `no call round falls inside any pause (${truth.intervals.length} pause interval${truth.intervals.length === 1 ? "" : "s"}, ${truth.intervals.reduce((s, i) => s + i.end - i.start, 0) * 3} s paused in total)`);
  ok(ref.every((x, i) => i === 0 || (x.round - ref[i - 1]!.round) % STRIDE === 0 || truth.intervals.some((v) => ref[i - 1]!.round < v.start && x.round >= v.end)), "call spacing stays a multiple of the 3 s round (6 s calls) except across a pause");
  if (publishErrors.length) console.log("  organizer console rejections (shown to the organizer immediately):", publishErrors.join("; "));
  const polls = phones.reduce((s, p) => s + p.polls, 0);
  void lastActTick; void describeControl;
  return { polls, phones: phones.length, last: Math.max(...phones.map((p) => p.joinTick)) };
}

async function bodyOf(kv: KV) { const f = await readPublished(kv, ENG); return { engagementId: ENG, messages: f?.messages ?? [] }; }

console.log(`Pause simulation: ${N} phones, ${FAST ? "FAST" : "STANDARD"} profile (hold after ${SAFE.holdAfterRounds * 3} s, pause lead ${SAFE.leadRounds * 3} s, give up after ${SAFE.giveUpRounds * 3} s, poll ${POLL_TICKS.map((x) => x * 3).join("/")} s)`);
const t0 = Date.now();
let totalPolls = 0;
for (const sc of SCENARIOS) { const r = await run(sc); totalPolls += r.polls; }
console.log(`\n  control-file requests in the whole run: ${totalPolls} (to a static CDN file; our server: 0). Simulated in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
console.log(`\n${checks - failed}/${checks} checks passed${failed ? ` — ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
