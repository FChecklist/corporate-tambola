// The GAME LOG: the vital details of one game in plain words, for the Organizer and the Host (a Co-host sees their own part only). It is built live while the game runs (the console's "vital details"),
// and SAVED when the game ends (kv glog/<eid>) so it survives the 20-hour deletion of the players' details; it is deleted with the game, 365 days after it.
// NO names, mobile numbers, e-mail addresses or keys: people appear as TICKET NUMBERS only. The numbers called, with the time of each, are not stored: they are worked out by the page that shows the log from
// the schedule below, the Organizer's pause record and the public random-number feed, exactly as every phone does (so they can never differ from what the players saw).
import { cfgOf as controlCfg, readPublished, resolveControl, type KV } from "../../../packages/beacon/src/control";
import { hostGameOf } from "../../../packages/beacon/src/game";
import { PRIZE_HOUSES, keysInPlay, linesFor, type EngagementCfg, type PatternKey } from "../../../packages/beacon/src/config";
import { checkinRequired, presentCount } from "./checkin";
import { changesView, readChanges } from "./modes";
import type { D1 } from "./worker";

const GENESIS_S = 1692803367;
const roundMs = (r: number) => (GENESIS_S + (r - 1) * 3) * 1000;
const NAMES: Record<string, string> = Object.fromEntries(PRIZE_HOUSES.map((h) => [h.id, h.label]));
const ord = (n: number) => ["", "1st", "2nd", "3rd"][n] ?? `${n}th`;
const prizeName = (cfg: EngagementCfg, key: PatternKey, ordinal: number) => (linesFor(cfg.rewards, key).length > 1 ? ord(ordinal) + " " : "") + (NAMES[key] ?? key);

export interface GameLog {
  v: 1; id: string; name: string; saved: boolean; savedMs: number | null;
  mode: { start: "auto" | "manual"; call: "auto" | "host"; afterPrizes: "keep" | "end" };
  startsAtMs: number; firstNumberMs: number | null; endedAtMs: number | null; endReason: string | null; numbersCalled: number | null;
  people: { joined: number; late: number; waiting: number; present: number | null; most: number };
  /** when each ticket joined (ticket numbers only; the first 2,000) */
  joins: { ticket: number; atMs: number }[];
  prizes: { prize: string; text: string; ticket: number; callNo: number; atMs: number | null }[];
  /** every lucky draw the organizer chose, drawn or not */
  lucky: { title: string; winners: number; drawn: boolean; tickets: number[] }[];
  pauses: { by: string; fromMs: number; toMs: number | null }[];
  changes: { atMs: number; when: string; who: string; what: string }[];
  report: { state: string | null; sentMs: number | null };
  warnings: string[];
  /** what the page needs to work out every number called and its time */
  schedule: { startRound: number; callSeconds: number; rounds: number; breaks: unknown[]; manualStart: boolean; goRound: number | null; messages: unknown[]; pubKey: string; hostKeys: string[]; leadRounds: number; maxPauseRounds: number; callMode: "auto" | "host"; startOnly: boolean };
}

const key = (eid: string) => `glog/${eid}`;

/** The log as it stands now. `end` (from the report builder) fills in how the game ended. */
export async function buildGameLog(env: { DB: D1 }, kvOf: KV, e: any, cfg: EngagementCfg, now: number, end?: { endMs: number; endReason: string; numbersCalled: number; firstNumberMs: number | null }): Promise<GameLog> {
  const eid = e.id as string, db = env.DB;
  const f = await readPublished(kvOf, eid);
  const st = f ? resolveControl(controlCfg(f, hostGameOf(cfg, e.start_round)), f.messages) : null;
  const by = (() => { return db.prepare("SELECT v FROM kv WHERE k=?").bind(`ctlby/${eid}`).first<{ v: string }>().then((r) => { try { const a = r ? JSON.parse(r.v) : []; return Array.isArray(a) ? a : []; } catch { return []; } }).catch(() => []); })();
  const byArr: string[] = await by;
  const cnt = async (sql: string, ...b: unknown[]) => Number((await db.prepare(sql).bind(...b).first<{ c: number }>())?.c ?? 0);
  const joined = await cnt("SELECT COUNT(*) AS c FROM participant WHERE eid=?", eid);
  const late = await cnt("SELECT COUNT(*) AS c FROM seat WHERE eid=? AND jr>0", eid).catch(() => 0);
  const waiting = await cnt("SELECT COUNT(*) AS c FROM waiting WHERE eid=? AND status='waiting'", eid).catch(() => 0);
  const present = checkinRequired(e) ? await presentCount(db, eid).catch(() => 0) : null;
  const joins = ((await db.prepare("SELECT s.seq AS t, p.joined_ms AS at FROM participant p JOIN seat s ON s.eid=p.eid AND s.pid=p.pid WHERE p.eid=? ORDER BY p.joined_ms, s.seq LIMIT 2000").bind(eid).all<any>().catch(() => ({ results: [] }))).results ?? []).map((x: any) => ({ ticket: Number(x.t), atMs: Number(x.at) })).filter((x: { ticket: number; atMs: number }) => Number.isFinite(x.ticket) && Number.isFinite(x.atMs));
  const wrows = (await db.prepare("SELECT round, pattern, ordinal, seat, idx, at_ms FROM winner WHERE eid=? ORDER BY round, at_ms, pattern, ordinal, seat").bind(eid).all<any>().catch(() => ({ results: [] }))).results ?? [];
  const lucky = cfg.breaks.filter((b) => b.kind === "lucky");
  const prizes = wrows.map((w: any) => {
    const text = (linesFor(cfg.rewards, w.pattern as PatternKey).find((l) => l.ordinal === w.ordinal)?.text ?? "") as string;
    const name = w.pattern === "lucky" ? (lucky[w.ordinal - 1]?.title ?? "Lucky draw") : prizeName(cfg, w.pattern as PatternKey, w.ordinal);
    return { prize: (cfg.rounds > 1 ? `Game ${w.round}: ` : "") + name, text, ticket: Number(w.seat), callNo: Number(w.idx ?? -1) + 1, atMs: w.at_ms ?? null };
  });
  const luckyList = lucky.map((b, i) => { const rows = wrows.filter((w: any) => w.pattern === "lucky" && w.ordinal === i + 1); return { title: b.title || "Lucky draw", winners: Number((b as any).winners ?? rows.length) || rows.length, drawn: rows.length > 0, tickets: rows.map((w: any) => Number(w.seat)).slice(0, 100) }; });
  const pauses: GameLog["pauses"] = [];
  if (st && f) for (const iv of st.intervals) {
    const m = f.messages.find((x) => x.action === "pause" && x.atBeaconRound === iv.start);
    pauses.push({ by: m && byArr[m.seq - 1] === "Host" ? "A Host" : "The Organizer", fromMs: roundMs(iv.start), toMs: Number.isFinite(iv.end) ? roundMs(iv.end) : null });
  }
  const chg = await readChanges(db, eid).catch(() => []);
  const life = await db.prepare("SELECT end_ms, report_ms, report_state FROM life WHERE eid=?").bind(eid).first<{ end_ms: number; report_ms: number | null; report_state: string | null }>().catch(() => null);
  const warnings: string[] = [];
  const nowRound = Math.floor((now / 1000 - GENESIS_S) / 3) + 1;
  if (cfg.startMode === "manual" && st && st.goRound === null && nowRound >= e.start_round) warnings.push("Nobody has pressed Start yet. Press Start, or change the start time.");
  if (st && st.intervals.some((i) => nowRound >= i.start && nowRound < i.end)) warnings.push("The game is paused. The numbers are stopped for everybody.");
  if (e.pack === 0 && roundMs(e.start_round) <= now) warnings.push("The game is waiting for payment.");
  return {
    v: 1, id: eid, name: cfg.name || eid, saved: false, savedMs: null,
    mode: { start: cfg.startMode === "manual" ? "manual" : "auto", call: cfg.callMode === "host" ? "host" : "auto", afterPrizes: cfg.keepCalling ? "keep" : "end" },
    startsAtMs: roundMs(e.start_round), firstNumberMs: end?.firstNumberMs ?? null, endedAtMs: end?.endMs ?? (life?.end_ms ?? null), endReason: end?.endReason ?? null, numbersCalled: end?.numbersCalled ?? null,
    people: { joined, late, waiting, present, most: joined }, joins,
    prizes, lucky: luckyList, pauses, changes: changesView(chg).map((c) => ({ atMs: c.at, when: c.when, who: c.who, what: c.what })).reverse(),
    report: { state: life?.report_state ?? null, sentMs: life?.report_ms ?? null }, warnings,
    schedule: { startRound: e.start_round, callSeconds: e.call_seconds, rounds: cfg.rounds, breaks: cfg.breaks, manualStart: cfg.startMode === "manual", goRound: st?.goRound ?? null, messages: f?.messages ?? [], pubKey: f?.pubKey ?? "", hostKeys: f?.hostKeys ?? [], leadRounds: f?.leadRounds ?? 0, maxPauseRounds: f?.maxPauseRounds ?? 600, callMode: cfg.callMode === "host" ? "host" : "auto", startOnly: !!f?.startOnly },
  };
}

/** Saves the log when the game has ended (once per call; later calls refresh the report line). Never throws into the caller's work. */
export async function saveGameLog(env: { DB: D1 }, kvOf: KV, e: any, cfg: EngagementCfg, now: number, end: { endMs: number; endReason: string; numbersCalled: number; firstNumberMs: number | null }): Promise<void> {
  try {
    const log = await buildGameLog(env, kvOf, e, cfg, now, end);
    log.saved = true; log.savedMs = now; log.warnings = [];
    await env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(key(e.id), JSON.stringify(log)).run();
  } catch { /* best effort: the next pass writes it again */ }
}
export async function readSavedGameLog(env: { DB: D1 }, eid: string): Promise<GameLog | null> {
  try { const r = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(key(eid)).first<{ v: string }>(); return r ? (JSON.parse(r.v) as GameLog) : null; } catch { return null; }
}
/** After the report e-mail has gone out: the log says so. */
export async function noteReportSent(env: { DB: D1 }, eid: string, sentMs: number): Promise<void> {
  try { const g = await readSavedGameLog(env, eid); if (!g) return; g.report = { state: "sent", sentMs }; await env.DB.prepare("UPDATE kv SET v=? WHERE k=?").bind(JSON.stringify(g), key(eid)).run(); } catch { /* best effort */ }
}
