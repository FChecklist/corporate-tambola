// The ten games. Each one: build the game as the owner's test account, play it with N real phone runtimes in virtual time, then check the outcome and the fairness probes.
import { World, ownerTestOrganizer, createGame, registerKey, addHost, press, HOST_SECRET, ORG_SECRET, MIN, HOUR, DAY, T0, DEFAULT_REWARDS, ordinals, listParticipants, type Org, type GameSpec, type PhoneOpts } from "./lib";
import { newRec, check, phoneList, runLoop, outcome, fairnessProbes, enableLeakWatch, writeRec, type Ctx, type Rec } from "./engine";
import { signControlWithSecret, nextMessage } from "../../packages/beacon/src/control";
import { roundAt } from "../../packages/beacon/src";
import { cfgOfRow } from "../../apps/edge/src/lifecycle";
import { roundTimeMs } from "../../packages/beacon/src";
import { GRACE_ROUNDS } from "../../packages/beacon/src/config";
import { publicKeyFromSecret } from "../../packages/beacon/src/control";

export interface GameDef { title: string; run: (n: number, people: number) => Promise<void> }

/** Build the world, the organizer (owner test account), the game and the phones. */
export async function build(n: number, title: string, mode: string, people: number, spec: GameSpec, optFn: (i: number) => PhoneOpts, o: { key?: boolean; host?: boolean; envExtra?: Record<string, unknown> } = {}) {
  const w = new World("game" + n, o.envExtra ?? {});
  w.t = 0;
  const org = await ownerTestOrganizer(w);
  const rec = newRec(n, title, spec.id, mode, people);
  const { startRound, create } = await createGame(w, org, spec);
  rec.extra.createAnswer = { draft: create.draft, pack: create.pack };
  if (o.key !== false) { const r = await registerKey(w, spec.id, org.h); if (r.status !== 200) rec.notes.push("control key refused: " + r.status + " " + JSON.stringify(r.body).slice(0, 120)); }
  const row = w.one("SELECT * FROM engagement WHERE id=?", spec.id);
  const cfg = cfgOfRow(row);
  const phones = phoneList(w, spec.id, people, optFn);
  const c: Ctx = { w, org, spec, eid: spec.id, phones, rec, scheduledRound: startRound, stride: Number(row.call_seconds) / 3, cfg, firstNumberMs: 0, lastPressMs: 0, presses: 0, pressRefused: {}, goPressed: false, extraPhones: [], hostBot: { on: cfg.callMode === "host", everyMs: 12_000, secret: ORG_SECRET, who: "Organizer" }, stopHostBot: false, allEndedAt: null, refPhone: () => phones.find((p) => p.rt.pid && !p.opts.blockedAll && !p.opts.liar && p.opts.offFrom === undefined && (p.opts.joinAtMs ?? 0) < 3 * MIN) };
  if (o.host) { const h = await addHost(w, org); c.hostKey = h; const r = await w.call("PUT", `/api/z/${spec.id}/control/key`, { publicKey: publicKeyFromSecret(HOST_SECRET) }, h.h); if (r.status !== 200) rec.notes.push("host control key refused: " + r.status); c.hostBot.secret = HOST_SECRET; c.hostBot.who = "Host"; }
  enableLeakWatch(w, startRound + GRACE_ROUNDS);
  return c;
}

/** Common closing: join / claim / prize numbers + the fairness battery. */
export async function wrapUp(c: Ctx, extra?: (r: Awaited<ReturnType<typeof outcome>>) => Promise<void> | void) {
  const { w, rec } = c;
  const joined = c.phones.filter((p) => p.rt.pid);
  const refused = c.phones.filter((p) => !p.rt.pid);
  const joinTimes = c.phones.filter((p) => p.joinedAt !== null).map((p) => p.joinedAt as number);
  rec.players = { ...rec.players, checkedIn: c.phones.filter((p) => p.present).length, firstJoinAtSimMin: +(Math.min(...joinTimes) / MIN).toFixed(1), lastJoinAtSimMin: +(Math.max(...joinTimes) / MIN).toFixed(1), target: c.phones.length, joined: joined.length, notJoined: refused.length, joinErrors: Object.entries(refused.reduce((m: Record<string, number>, p) => { const k = String(p.joinError ?? "never tried").slice(0, 100); m[k] = (m[k] ?? 0) + 1; return m; }, {})), joinRetries: c.phones.reduce((a, p) => a + Math.max(0, p.joinTries - 1), 0) };
  const out = await outcome(c);
  const { truth, people, pub, ref } = out;
  const claims = w.q("SELECT pattern, COUNT(*) n FROM claim WHERE eid=? GROUP BY pattern", c.eid) as any[];
  const bog = (w.one("SELECT COUNT(*) n FROM bogey WHERE eid=?", c.eid) as any).n;
  const tooLate = w.stats.filter((x) => x.route === "POST /api/z/:id/claims" && x.status === 409).length;
  rec.claims = { claimRequestsAnsweredTooLate409: tooLate, stored: claims.reduce((a, x) => a + x.n, 0), byPattern: Object.fromEntries(claims.map((x) => [x.pattern, x.n])), bogeys: bog, phonesPressedClaim: c.phones.filter((p) => p.rt.view().pressed.length).length };
  rec.prizes = pub.map((r: any) => ({ pattern: r.pattern, ordinal: r.ordinal, call: (r.idx ?? -1) + 1, round: r.round ?? 1, winners: r.count ?? (r.pids?.length ?? "?") }));
  rec.extra.groundTruthPrizes = truth.settled.map((s) => `${s.pattern}#${s.ordinal}@${s.idx + 1}x${s.pids.length}`);
  rec.extra.participantsInStore = people.length;
  const t = rec.timings as any;
  t.simulatedGameMinutes = +(((c.allEndedAt ?? w.t) - (c.firstNumberMs || 0)) / MIN).toFixed(1);
  t.firstNumberAtSimMin = +((c.firstNumberMs || 0) / MIN).toFixed(1);
  t.allPhonesEndedAtSimMin = c.allEndedAt === null ? null : +(c.allEndedAt / MIN).toFixed(1);
  t.numbersCalled = ref.length;
  await cpuProbe(c);
  await extra?.(out);
  return out;
}

export function stdChecks(c: Ctx, out: Awaited<ReturnType<typeof outcome>>, o: { minPrizes?: number } = {}) {
  const { rec } = c; const L = rec.checks; const { truth, people, pub } = out;
  const joined = c.phones.filter((p) => p.rt.pid).length;
  check(L, `players joined (${joined} of ${c.phones.length})`, joined === c.phones.length - c.phones.filter((p) => p.opts.blockedAll === undefined && false).length, `${joined}`);
  check(L, "the store holds exactly the people who joined (no duplicates)", people.length === joined, `${people.length} vs ${joined}`);
  void 0;
  check(L, "prizes were published", pub.length >= (o.minPrizes ?? 1), `${pub.length}`);
  const want = truth.settled.map((s) => `${s.pattern}#${s.ordinal}@${s.idx}`).sort().join(" ");
  const got = pub.map((r: any) => `${r.pattern}#${r.ordinal}@${r.idx}`).sort().join(" ");
  check(L, "published winners equal the winners worked out from the public numbers and tickets", want === got, `want ${want} / got ${got}`);
}

/** The last check of every game: 365 days after the game, the housekeeping job has deleted everything of it except the records kept on purpose (the game's settings record, the payment record the law keeps, the append-only audit certificates). Destroys the game, so it is always last. */
export async function retentionCheck(c: Ctx) {
  const { w, rec } = c; const id = c.eid;
  snapLimits(c); // the usage counters of the day go with the 365-day clean-up: read them first
  const { endBoundMs, fullDeleteAt } = await import("../../apps/edge/src/lifecycle");
  const eg = w.one("SELECT * FROM engagement WHERE id=?", id); if (!eg) return;
  const life = w.one("SELECT end_ms FROM life WHERE eid=?", id);
  const end = life?.end_ms ?? await endBoundMs(w.env as any, eg);
  const due = fullDeleteAt(end);
  // two minutes before the 365th day ends nothing may be gone yet; five minutes after it everything must be
  w.t = due - T0 - 5 * MIN; await w.call("POST", "/api/lifecycle/tick", {}, { "x-organizer": "plat" }); await w.call("POST", "/api/purge", {}, { "x-organizer": "plat" });
  const early = w.one("SELECT COUNT(*) n FROM engagement WHERE id=?", id).n;
  w.t = due - T0 + 5 * MIN; await w.call("POST", "/api/lifecycle/tick", {}, { "x-organizer": "plat" }); await w.call("POST", "/api/purge", {}, { "x-organizer": "plat" });
  // the real scheduled tick (worker.ts runTick) also runs adminTick every time; it is what forgets the per-mail state `mail_track` (3 days, mail-lanes.ts lanesTick), so the test clock runs it too
  const { adminTick } = await import("../../apps/edge/src/admin"); await adminTick(w.env.DB as any, w.utc());
  const { bad: detail, kept } = leftovers(w, id);
  const bad = Object.keys(detail);
  rec.extra.retention = { endMs: end, deletedAtIST: new Date(due + 5.5 * HOUR).toISOString().replace("Z", " IST"), stillThere5MinBefore: early === 1, leftoverRows: detail, keptOnPurpose: kept, leftoverKvKeys: bad.includes("kv") ? w.q("SELECT k FROM kv WHERE k LIKE ?", "%" + id + "%").map((x: any) => x.k) : [] };
  check(rec.checks, "365 days later: the game is kept until 00:00 IST of its last day and then everything of it is deleted, except the records kept on purpose", early === 1 && w.one("SELECT COUNT(*) n FROM engagement WHERE id=?", id).n === 0 && bad.length === 0, `before=${early} leftovers=${JSON.stringify(detail)} ${JSON.stringify((rec.extra.retention as any).leftoverKvKeys)}`);
}

/** Every table row that still mentions the game, split into "kept on purpose" (settings record, payment record the law keeps, append-only audit certificates, the Organizer's own consent rows, mail log and per-mail mail state younger than 3 days) and "should be gone". */
export function leftovers(w: World, id: string) {
  const bad: Record<string, number> = {}, kept: Record<string, number> = {};
  const KEEP = new Set(["game_record", "entitlement", "audit_cert", "audit_stats"]);
  for (const t of w.q("SELECT name FROM sqlite_master WHERE type='table'").map((x: any) => x.name as string)) {
    try {
      let nb = 0, nk = 0;
      for (const row of w.q(`SELECT * FROM "${t}"`)) {
        if (!JSON.stringify(row).includes(id)) continue;
        const keep = KEEP.has(t) || (t === "consent_log" && row.kind !== "K4") || (t === "outbox" && Number(row.at_ms) > w.utc() - 3 * DAY) || (t === "mail_track" && (Number(row.at_ms) > w.utc() - 3 * DAY || Number(row.at_ms) > Date.now() - 3 * DAY)); // mail_track (per-mail state, 3 days): a mail sent by a path that has no clock argument (the report mail) is stamped with the REAL clock, which in this test is later than the virtual clock, so it is "young" by the real clock; in production the two are the same
        if (keep) nk++; else nb++;
      }
      if (nb) bad[t] = nb; if (nk) kept[t] = nk;
    } catch { /* a virtual table */ }
  }
  return { bad, kept };
}

/** Honest per-request CPU: the same routes, one at a time on a quiet process (the figures taken during the crowd include the 250 phones' own work running between awaits). Warm: 10 warm-up calls, then 40 measured. */
export function snapLimits(c: Ctx) { const rec = c.rec as any; if (rec._snapped) return; rec.limits = { ...rec.limits, ...c.w.summary() }; rec._snapped = true; }
export async function cpuProbe(c: Ctx) {
  const { w, rec } = c; const id = c.eid; snapLimits(c); const n0 = w.stats.length, e0 = w.errorSamples.length; // the probe's own requests are not part of the game's figures: they are taken out again at the end
  const p = c.phones.find((x) => x.rt.pid && !x.opts.blockedAll && !x.opts.cheater && x.rt.view().claimed.length > 0 && x.rt.view().phase === "ended") ?? c.phones.find((x) => x.rt.pid && !x.opts.blockedAll)!; const pid = p.rt.pid!, device = (p.rt as any).device() as string;
  const cv = p.rt.view(); const cPat = cv.claimed[0]; const cIdx = cPat ? (cv.myIdx as Record<string, number>)[cPat] : undefined; // a claim this phone really made: asking again is the normal repeat (no Bogey)
  const hdr = { "cf-connecting-ip": p.ip };
  const f = await w.published(id);
  const wrong = f ? signControlWithSecret("99".repeat(32), nextMessage(f, roundAt(w.utc()), { action: "pause", pauseForRounds: 5 })) : null;
  const goodSig = f ? signControlWithSecret(ORG_SECRET, nextMessage(f, roundAt(w.utc()), { action: "pause", pauseForRounds: 5 })) : null; // a real signature, refused later because the game is over: the cost of checking a signature is paid first
  const probes: [string, () => Promise<unknown>][] = [
    ["GET /api/z/:id/info", () => w.call("GET", `/api/z/${id}/info`, undefined, hdr)],
    ["GET /api/z/:id/control", () => w.call("GET", `/api/z/${id}/control`, undefined, hdr)],
    ["GET /api/z/:id/seats", () => w.call("GET", `/api/z/${id}/seats`, undefined, hdr)],
    ["GET /api/z/:id/results", () => w.call("GET", `/api/z/${id}/results`, undefined, hdr)],
    ["GET /api/z/:id/cv", () => w.call("GET", `/api/z/${id}/cv`, undefined, hdr)],
    ["POST /api/z/:id/join (already joined)", () => w.call("POST", `/api/z/${id}/join`, { phone: p.phone, name: p.name, device, ...(p.empId ? { empId: p.empId } : {}) }, hdr)],
    ...(cPat && cIdx !== undefined && cIdx >= 0 ? [["POST /api/z/:id/claims (a repeat of a true claim)", () => w.call("POST", `/api/z/${id}/claims`, { pid, device, claims: [{ pattern: cPat, idx: cIdx }] }, hdr)] as [string, () => Promise<unknown>]] : []),
    ["POST /api/z/:id/presence", () => w.call("POST", `/api/z/${id}/presence`, { k: 1 }, hdr)],
    ...(wrong ? [["POST /api/z/:id/control (signature of a stranger)", () => w.call("POST", `/api/z/${id}/control`, { message: wrong })] as [string, () => Promise<unknown>]] : []),
    ...(goodSig ? [["POST /api/z/:id/control (a real signature)", () => w.call("POST", `/api/z/${id}/control`, { message: goodSig })] as [string, () => Promise<unknown>]] : []),
  ];
  const out: Record<string, { p50: number; p95: number; max: number }> = {};
  for (const [name, fn] of probes) {
    for (let i = 0; i < 10; i++) await fn();
    const xs: number[] = [];
    for (let i = 0; i < 40; i++) { const c0 = process.cpuUsage(); await fn(); const d = process.cpuUsage(c0); xs.push((d.user + d.system) / 1000); }
    xs.sort((a, b) => a - b); out[name] = { p50: +xs[20]!.toFixed(2), p95: +xs[37]!.toFixed(2), max: +xs[39]!.toFixed(2) };
  }
  rec.limits = { ...rec.limits, isolatedCpuMs: out };
  w.stats.splice(n0); w.errorSamples.splice(e0);
}
