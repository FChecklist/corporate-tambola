// The common game loop and the checks every one of the ten 250-player games gets (see tools/game250/run.ts for the games themselves).
import { mkdirSync, writeFileSync } from "node:fs";
import { World, blockedFetches, makePhone, phoneJoin, groundTruth, listParticipants, press, ORG_SECRET, HOST_SECRET, logAgreement, rndOf, MIN, T0, type Org, type Phone, type PhoneOpts, type GameSpec, type Truth } from "./lib";
import { GRACE_ROUNDS, type EngagementCfg } from "../../packages/beacon/src/config";
import { roundAt, roundTimeMs } from "../../packages/beacon/src";
import { cfgOf, nextMessage, signControlWithSecret, publicKeyFromSecret } from "../../packages/beacon/src/control";

export interface Check { name: string; ok: boolean; detail: string }
export interface Rec {
  game: number; title: string; id: string; mode: string; target: number;
  players: Record<string, unknown>; claims: Record<string, unknown>; prizes: any[]; timings: Record<string, unknown>; errors: Record<string, unknown>; limits: Record<string, unknown>;
  fairness: Check[]; checks: Check[]; notes: string[]; extra: Record<string, unknown>;
}
export const newRec = (game: number, title: string, id: string, mode: string, target: number): Rec => ({ game, title, id, mode, target, players: {}, claims: {}, prizes: [], timings: {}, errors: {}, limits: {}, fairness: [], checks: [], notes: [], extra: {} });
export const check = (list: Check[], name: string, ok: boolean, detail = "") => { list.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) }); console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + String(detail).slice(0, 200)}`); return !!ok; };

export interface Ctx {
  w: World; org: Org; spec: GameSpec; eid: string; phones: Phone[]; rec: Rec; scheduledRound: number; stride: number; cfg: EngagementCfg;
  hostKey?: { key: string; h: Record<string, string> }; hostSecret?: string; wait?: Set<string>;
  /** called once per loop iteration, after the phones have moved */ onTick?: (c: Ctx) => Promise<void>;
  firstNumberMs: number; lastPressMs: number; presses: number; pressRefused: Record<string, number>; goPressed: boolean; extraPhones: Phone[];
  hostBot: { on: boolean; everyMs: number; secret: string; who: string }; stopHostBot: boolean; allEndedAt: number | null; refPhone: () => Phone | undefined;
}

export const phoneList = (w: World, eid: string, n: number, opt: (i: number) => PhoneOpts): Phone[] => Array.from({ length: n }, (_, i) => makePhone(w, eid, i, opt(i)));

/** One phone's move in one loop iteration. */
async function move(p: Phone, w: World) {
  const o = p.opts, rt = p.rt;
  if (!p.pageOpen) return;
  const jt = o.joinAtMs ?? 0;
  if (w.t < jt) return;
  if (rt.phase === "boot" && !rt.pid) { await rt.boot(); if ((rt.phase as string) === "join" || (rt.phase as string) === "boot") return; }
  if (rt.phase === "join" && !rt.pid) { if (p.joinTries >= (o.maxTries ?? 1e9)) return; await phoneJoin(p); return; }
  if (rt.phase === "boot") { await rt.boot(); return; }
  if (rt.pid && !p.present && w.utc() >= p.nextCheckinTry) { await doCheckin(p, w); }
  if (rt.phase === "play" || rt.phase === "ended") { await rt.tick(); await rt.playAlong(o.noClaim ? { claim: false } : {}); }
}

/** What the ticket page does: once check-in is open (5 minutes before the start), read the 4-digit code on the ticket page, confirm name and number, press Submit. */
async function doCheckin(p: Phone, w: World) {
  const rt = p.rt as any, pid = rt.pid as string, device = rt.device() as string;
  try {
    const g = await w.call("GET", `/api/z/${p.rt.eid}/checkin?pid=${encodeURIComponent(pid)}&device=${encodeURIComponent(device)}`, undefined, { "cf-connecting-ip": p.ip });
    if (g.status !== 200) { p.checkinError = g.status + " " + (g.body?.error ?? ""); p.nextCheckinTry = w.utc() + 60_000; return; }
    if (g.body.required === false || g.body.present) { p.present = true; return; }
    if (!g.body.open || !g.body.code) { p.nextCheckinTry = w.utc() + 30_000; return; }
    const r = await w.call("POST", `/api/z/${p.rt.eid}/checkin`, { pid, device, code: g.body.code, confirmName: true, confirmMobile: true }, { "cf-connecting-ip": p.ip });
    if (r.status === 200 && r.body.present) { p.present = true; p.presentAt = w.t; p.checkinError = null; } else { p.checkinError = r.status + " " + (r.body?.error ?? ""); p.nextCheckinTry = w.utc() + 30_000; }
  } catch (e: any) { p.nextCheckinTry = w.utc() + 20_000; }
}

export async function runLoop(c: Ctx, o: { maxMinutes?: number; endWhen?: (c: Ctx) => boolean; noPostEnd?: boolean } = {}) {
  const { w, phones } = c; const startMs = roundTimeMs(c.scheduledRound + GRACE_ROUNDS);
  const maxT = w.t + (o.maxMinutes ?? 150) * MIN;
  let iter = 0; const t0 = performance.now();
  while (w.t < maxT) {
    const toStart = startMs - w.utc();
    const dt = toStart > 60_000 ? 18_000 : toStart > -6 * 60_000 || !c.allEndedAt ? 3_000 : 12_000; // coarse before the start, one round (3 s) while playing, coarse again after the end
    w.t += dt; iter++;
    const batch = phones.concat(c.extraPhones);
    for (let i = 0; i < batch.length; i += 250) await Promise.all(batch.slice(i, i + 250).map((p) => move(p, w).catch((e) => { c.rec.notes.length < 20 && c.rec.notes.push("phone error " + p.phone + ": " + String(e?.message ?? e).slice(0, 120)); })));
    if (c.hostBot.on && !c.stopHostBot) await hostBotStep(c);
    if (c.onTick) await c.onTick(c);
    const ref = c.refPhone();
    if (ref && c.firstNumberMs === 0 && ref.rt.view().log.length > 0) c.firstNumberMs = w.t;
    const joined = phones.filter((p) => p.rt.pid && p.pageOpen);
    const allEnded = joined.length > 0 && joined.every((p) => p.opts.blockedAll || p.rt.phase === "ended" || (p.opts.offFrom !== undefined && w.t >= p.opts.offFrom && w.t < (p.opts.offTo ?? 1e15)));
    if (allEnded && c.allEndedAt === null) c.allEndedAt = w.t;
    if (o.endWhen?.(c)) break;
    if (c.allEndedAt !== null && !o.noPostEnd) { // after the end the phones still send the last claims and vote on the winners; give them up to 12 minutes
      const pub = await w.call("GET", `/api/z/${c.eid}/results`); const n = pub.body?.results?.length ?? 0;
      if ((n > 0 && n >= ((c.rec.extra.expectedPrizes as number) ?? c.cfg.rewards.length * c.cfg.rounds)) || w.t - c.allEndedAt > 12 * MIN) break;
    }
    if (iter % 40 === 0) process.stdout.write(`    t+${((w.t) / 60000).toFixed(1)}m  refLog=${c.refPhone()?.rt.view().log.length ?? "-"}  joined=${joined.length}  reqs=${w.stats.length}  wall=${((performance.now() - t0) / 1000).toFixed(0)}s\r`);
  }
  process.stdout.write("\n");
}

/** The Host (or the Organizer) pressing Next number every `everyMs` while the game is running. */
async function hostBotStep(c: Ctx) {
  const { w } = c; const b = c.hostBot;
  const f = await w.published(c.eid); if (!f) return;
  const cfg = c.cfg; if (cfg.callMode !== "host") return;
  const ref = c.refPhone(); if (ref && ref.rt.view().phase === "ended") { c.stopHostBot = true; return; }
  if (cfg.startMode === "manual" && !c.goPressed) return;
  if (w.utc() < roundTimeMs(c.scheduledRound)) return;
  if (w.utc() - c.lastPressMs < b.everyMs) return;
  const r = await press(w, c.eid, b.secret, "next");
  c.lastPressMs = w.utc();
  if (r.status === 200) c.presses++; else { const k = r.status + " " + String(r.body?.error ?? "").slice(0, 90); c.pressRefused[k] = (c.pressRefused[k] ?? 0) + 1; }
}

/* ------------------------------------------------------------------ the outcome checks every game gets */
export async function outcome(c: Ctx, expectedWin?: (t: Truth) => void) {
  const { w, rec } = c;
  const truth = await groundTruth(w, c.eid, c.cfg as any, c.scheduledRound, c.stride);
  const nRounds = c.cfg.rounds; const ref = truth.refs[nRounds]!;
  rec.extra.calledNumbers = ref.length;
  const ag = logAgreement(c.phones, ref, truth.callRounds[nRounds]!);
  rec.extra.logAgreement = ag;
  check(rec.fairness, "every phone's number log equals the log re-derived from the public beacon alone", ag.wrong === 0, `${ag.exact} exact, ${ag.shorter} shorter (offline at the end), ${ag.wrong} wrong ${ag.bad.join("; ")}`);
  const people = await listParticipants(w, c.eid);
  const pub = (await w.call("GET", `/api/z/${c.eid}/results`)).body.results ?? [];
  rec.extra.publicResults = pub;
  return { truth, people, pub, ref };
}

/** The fairness probes: could anybody predict the numbers before they were called, or alter them? Run against the live world after (or during) a game. */
export async function fairnessProbes(c: Ctx, o: { forge: boolean }) {
  const { w, rec } = c; const eid = c.eid; const L = rec.fairness;
  // 1. before the first number, no response of the store held any number of the game (the store never knows them: they come from the beacon)
  const truth = await groundTruth(w, eid, c.cfg as any, c.scheduledRound, c.stride);
  const ref = truth.refs[1]!;
  const seq = (n: number) => ref.slice(0, n);
  const leaks = (w as any).preStartBodies as string[] | undefined;
  if (leaks) {
    const hit = leaks.filter((b) => { const s = seq(6); const flat = b.replace(/\s/g, ""); return flat.includes(s.join(",")) || flat.includes(s.join('","')) || ref.length >= 6 && s.every((n) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(b)) && /"log"|"numbers"|"called"|"calls"/.test(b); });
    check(L, `before the first number, none of the ${leaks.length} store answers held the game's numbers`, hit.length === 0, `${hit.length} answers matched`);
  }
  // 2. the whole database holds no copy of the call sequence (nothing to read ahead, nothing to edit)
  const tables = w.q("SELECT name FROM sqlite_master WHERE type='table'").map((x: any) => x.name as string);
  const first = seq(8); const needles = [first.join(","), first.join(", "), JSON.stringify(first).slice(1, -1), first.join(" ")];
  let found: string[] = [];
  for (const tname of tables) { try { const rows = w.q(`SELECT * FROM "${tname}"`); for (const row of rows) { const s = JSON.stringify(row); if (needles.some((nd) => s.includes(nd))) { found.push(tname); break; } } } catch { /* a virtual table */ } }
  check(L, `the store keeps no copy of the numbers (${tables.length} tables searched for the first 8 called numbers in order)`, found.length === 0, found.join(","));
  if (!o.forge) return;
  // 3. nobody can alter or steer the numbers: forged / replayed / early / non-signer messages are refused
  const f = await w.published(eid);
  if (!f) { check(L, "a signed control file exists for the forgery probes", false, "no key registered"); return; }
  const nowR = roundAt(w.utc());
  const before = JSON.stringify((await w.call("GET", `/api/z/${eid}/control`)).body.messages ?? []);
  const wrongKey = signControlWithSecret("99".repeat(32), nextMessage(f, nowR, { action: "pause", pauseForRounds: 5 }));
  const r1 = await w.call("POST", `/api/z/${eid}/control`, { message: wrongKey });
  check(L, "a pause signed with a key the game does not know is refused", r1.status >= 400, `${r1.status}`);
  const okMsg = nextMessage(f, nowR, { action: "pause", pauseForRounds: 5 });
  const tampered = signControlWithSecret(ORG_SECRET, { ...okMsg, untilRound: (okMsg.untilRound ?? 0) + 1 });
  const goodSig = signControlWithSecret(ORG_SECRET, okMsg);
  const tamp = { ...goodSig, atBeaconRound: (goodSig as any).atBeaconRound + 5 };
  const r2 = await w.call("POST", `/api/z/${eid}/control`, { message: tamp });
  check(L, "a signed message whose round was changed afterwards is refused", r2.status >= 400, `${r2.status}`);
  const r3 = await w.call("POST", `/api/z/${eid}/control`, { message: { engagementId: eid, seq: 1, action: "stop", atBeaconRound: nowR + 9, signedAtRound: nowR, signature: "00".repeat(64) } });
  check(L, "a message with a made-up signature is refused", r3.status >= 400, `${r3.status}`);
  const after = JSON.stringify((await w.call("GET", `/api/z/${eid}/control`)).body.messages ?? []);
  check(L, "the signed control file was not changed by any of the forgeries", before === after, "");
  // a player (no key) cannot call, draw, set or edit numbers, results or schedule
  const paths = [["POST", "numbers"], ["POST", "call"], ["POST", "draw"], ["PUT", "numbers"], ["PATCH", "numbers"], ["POST", "log"], ["POST", "calls"], ["POST", "seed"], ["POST", "rig"]] as const;
  let writable = 0; const hits: string[] = [];
  for (const [m, p] of paths) { const r = await w.call(m, `/api/z/${eid}/${p}`, { numbers: [1, 2, 3], n: 7 }); if (r.status < 400) { writable++; hits.push(`${m} ${p} ${r.status}`); } }
  check(L, "there is no route to write, draw or set a number (9 probes)", writable === 0, hits.join(","));
  const r4 = await w.call("PATCH", `/api/z/${eid}/settings`, { callSeconds: 6, startRound: c.scheduledRound + 5 }, { "x-organizer": "wrong-key" });
  check(L, "a stranger cannot change the game's settings", r4.status >= 400, `${r4.status}`);
  const r5 = await w.call("POST", `/api/z/${eid}/control`, { message: { action: "next" } });
  check(L, "an unsigned press is refused", r5.status >= 400, `${r5.status}`);
  void tampered;
}

export function enableLeakWatch(w: World, untilRound: number) {
  (w as any).preStartBodies = [] as string[];
  const orig = w.call.bind(w);
  (w as any).call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, at?: number) => {
    const r = await orig(method, path, body, headers, at);
    if (w.round() < untilRound && method === "GET") (w as any).preStartBodies.push(JSON.stringify(r.body));
    return r;
  };
}

export function writeRec(rec: Rec, w?: World) {
  mkdirSync("docs/250x10/data", { recursive: true });
  if (w) { const s = w.summary(); rec.limits = { ...s, ...rec.limits, outboundNetworkRequests: blockedFetches().length, requests: s.requests, byStatus: s.byStatus, byRoute: s.byRoute, reqOver10msCpu: s.reqOver10msCpu, reqOver50msCpu: s.reqOver50msCpu, maxReqCpuMs: s.maxReqCpuMs }; rec.errors = { ...rec.errors, byStatus: s.byStatus, samples: dedupe(w.errorSamples) }; }
  writeFileSync(`docs/250x10/data/game${String(rec.game).padStart(2, "0")}.json`, JSON.stringify(rec, null, 2));
}
const dedupe = (xs: { status: number; route: string; msg: string }[]) => { const m = new Map<string, { status: number; route: string; msg: string; n: number }>(); for (const x of xs) { const k = x.status + x.route + x.msg; const e = m.get(k); if (e) e.n++; else m.set(k, { ...x, n: 1 }); } return [...m.values()].slice(0, 30); };
void rndOf; void cfgOf; void publicKeyFromSecret; void T0; void HOST_SECRET; void roundAt;
