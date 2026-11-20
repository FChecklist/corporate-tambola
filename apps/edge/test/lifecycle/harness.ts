// Shared helper for the lifecycle suite (docs/LIFECYCLE_TESTS.md). Real Worker code (handle()), in-memory D1, a handed-in clock, the test Razorpay stand-in of param-harness
// and a stand-in for the public random beacon. No browser, no network, no real money.
import { expect } from "bun:test";
import { createHash } from "node:crypto";
import { W, T, GEN, HOUR, MIN, call, j, one, q, organizer, create, publish, checkout, capture, verify, roundAt, roundMs, startIn, keyH, dev, mob } from "../param-harness";
import { callTimeMs, cfgOfRow, endBoundMs, realEndMs } from "../../src/lifecycle";
import { GRACE_ROUNDS, HOUSE_ORDER, keysInPlay, linesFor } from "../../../../packages/beacon/src/config";
import { deriveCalls } from "../../../../packages/beacon/src";
import { ticketFor, settleAll as settleLog } from "../../../../packages/beacon/src/game";
import { nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../../packages/beacon/src/control";

export { W, T, GEN, HOUR, MIN, call, j, one, q, roundAt, roundMs, startIn, keyH, dev, mob };

/** The four ways a game can start and be called: how it starts x who calls the numbers. */
export interface Format { key: string; label: string; startMode: "auto" | "manual"; callMode: "auto" | "host" }
export const FORMATS: Format[] = [
  { key: "A-A", label: "auto-start + auto-numbers", startMode: "auto", callMode: "auto" },
  { key: "A-H", label: "auto-start + organizer-calls-numbers", startMode: "auto", callMode: "host" },
  { key: "M-A", label: "organizer-start + auto-numbers", startMode: "manual", callMode: "auto" },
  { key: "M-H", label: "organizer-start + organizer-calls-numbers", startMode: "manual", callMode: "host" },
];

export const ORG_SECRET = "11".repeat(32), HOST_SECRET = "22".repeat(32);
export const kv = (): KV => ({ get: async (k) => (one("SELECT v FROM kv WHERE k=?", k) as any)?.v ?? null, put: async () => {} });
export const row = (id: string) => one("SELECT * FROM engagement WHERE id=?", id);
export const count = (sql: string, ...a: any[]) => Number((one(sql, ...a) as any)?.c ?? 0);
export const AT = (startRound: number) => roundMs(startRound); // the scheduled moment

export interface Game { id: string; fmt: Format; key: string; h: Record<string, string>; startRound: number; startMs: number; at: number; org: Awaited<ReturnType<typeof organizer>> }
export interface Opts { org?: Awaited<ReturnType<typeof organizer>>; cap?: number; verify?: "id" | "mobile" | "either"; list?: boolean; invites?: { on: boolean; per: number; cats?: string[] }; pay?: boolean; sign?: boolean; extra?: Record<string, unknown>; over?: Record<string, unknown> }
let seq = 0;
/** create -> publish -> (pay with the test Razorpay stand-in) -> settings (ID list game) -> register the console's signing key. Everything an organizer does before the guests come. */
export async function newGame(fmt: Format, o: Opts = {}): Promise<Game> {
  const org = o.org ?? (await organizer());
  const id = `LC-${fmt.key}-${(++seq).toString(36)}`;
  const start = startIn(2 * HOUR);
  const body: Record<string, unknown> = { id, startRound: start, callSeconds: fmt.callMode === "host" ? 9 : 12, cap: o.cap ?? 100, startMode: fmt.startMode, callMode: fmt.callMode, verify: o.verify ?? "id", whoCanJoin: o.list === false ? "anyone" : "list", ...(o.over ?? {}) };
  const r = await call("POST", "/api/z", body, org.h as Record<string, string>); expect([id, r.status, r.status === 200 ? "" : JSON.stringify(await j(r.clone()))]).toEqual([id, 200, ""]);
  expect((await publish(org.key, id)).status).toBe(200);
  if (o.invites) { const s = await call("PATCH", `/api/z/${id}/settings`, { invites: { cats: ["family", "colleagues"], ...o.invites } }, org.h as Record<string, string>); expect([s.status, JSON.stringify(await j(s.clone()))].slice(0, 1)).toEqual([200]); }
  const g: Game = { id, fmt, key: org.key, h: org.h as Record<string, string>, startRound: start, startMs: roundMs(start), at: roundMs(start), org };
  if (o.pay !== false) await payGame(g);
  if (o.sign !== false) expect((await call("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret(ORG_SECRET) }, org.h as Record<string, string>)).status).toBe(200);
  return g;
}
/** the Razorpay stand-in: checkout -> captured -> verified. Returns the verify answer. */
export async function payGame(g: Game, now = T) {
  const c = await checkout(g.key, { eid: g.id, email: g.org.email }, now); expect(c.status).toBe(200);
  capture(c.body, "pay_" + g.id);
  const v = await verify(c.body, "pay_" + g.id, {}, now); expect(v.status).toBe(200);
  return j(v);
}
export const paid = (id: string) => row(id).pack !== null && row(id).pack !== 0 && row(id).pack !== undefined;

/** ID-list calls */
export const addIds = (g: Game, ids: string[], now = T) => call("POST", `/api/z/${g.id}/people`, { people: ids.map((empId) => ({ empId })) }, g.h, now);
export const joinId = (g: Game, empId: string, i: number, extra: Record<string, unknown> = {}, now = T) => call("POST", `/api/z/${g.id}/join`, { empId, device: dev(i), ...extra }, {}, now);
export const waiting = async (g: Game, now = T) => (await j(await call("GET", `/api/z/${g.id}/waiting`, undefined, g.h, now))).waiting as any[];
export const decide = (g: Game, wid: string, decision: "admit" | "decline", now = T, h = g.h) => call("POST", `/api/z/${g.id}/waiting/${wid}`, { decision }, h, now);
export const pidOf = async (r: Response) => (await j(r)).pid as string;

/** Join n listed people by ID; return their pids. */
export async function seat(g: Game, n: number, prefix = "P", from = 1000): Promise<string[]> {
  const ids = Array.from({ length: n }, (_, i) => `${prefix}${from + i}`);
  for (let i = 0; i < ids.length; i += 100) expect((await addIds(g, ids.slice(i, i + 100))).status).toBe(200);
  const pids: string[] = [];
  for (const [i, id] of ids.entries()) { const r = await joinId(g, id, from + i); expect([id, r.status]).toEqual([id, 200]); pids.push(await pidOf(r)); }
  return pids;
}

/** Signed buttons of the console (Start, Next number, Pause, Resume, Stop). */
export async function press(g: Game, action: "go" | "next" | "pause" | "resume" | "stop", now: number, secret = ORG_SECRET, extra: Record<string, unknown> = {}) {
  const msg = signControlWithSecret(secret, nextMessage((await readPublished(kv(), g.id))!, roundAt(now), { action, ...extra } as any));
  const r = await call("POST", `/api/z/${g.id}/control`, { message: msg }, {}, now);
  return { status: r.status, body: await j(r) };
}
export const control = async (g: Game, now = T) => j(await call("GET", `/api/z/${g.id}/control`, undefined, {}, now));
export const info = async (g: Game, now = T, h: Record<string, string> = {}) => j(await call("GET", `/api/z/${g.id}/info`, undefined, h, now));

/** The public random beacon, stood in for: round r has the randomness sha256("beacon|r"). Everyone (server, phones, tests) reads the same values. */
export const randOf = (round: number) => createHash("sha256").update("beacon|" + round).digest("hex");
/** The call log (90 numbers) of a game, as every phone derives it: for each call index its beacon round (from the Worker's own schedule, pauses and presses included), then that round's randomness. */
export async function callLog(g: Game, upto = 90): Promise<{ log: number[]; rounds: number[] }> {
  const e = row(g.id); const rounds: number[] = [];
  for (let k = 0; k < upto; k++) { const ms = await callTimeMs(W.env as any, e, 1, k); if (ms === null) break; rounds.push(Math.round((ms / 1000 - GEN) / 3) + 1); }
  return { log: deriveCalls(g.id, rounds.map(randOf)), rounds };
}
/** What a phone computes at the end: every winner of every house, from the public log and the seat list. */
export function winnersOf(g: Game, pids: string[], log: number[]) { return settleLog(g.id, pids, log, cfgOfRow(row(g.id))); }

/** The game's own start: automatic = the clock; by hand = the Organizer's Start press at/after the time. Returns the moment (ms) the first number is due, or null if it cannot run yet. */
export async function startGame(g: Game): Promise<number> {
  if (g.fmt.startMode === "manual") { const r = await press(g, "go", g.at + 60_000); expect([g.id, r.status]).toEqual([g.id, 200]); }
  const t = await callTimeMs(W.env as any, row(g.id), 1, 0);
  return t ?? (g.fmt.callMode === "host" ? g.at + 180_000 : g.at);
}
/** A Host-calls game has no numbers until Next is pressed: press `n` times, `gap` ms apart, from `t0`. Returns the time after the last press. */
export async function pressNext(g: Game, n: number, t0: number, gap = 20_000) { let t = t0; for (let i = 0; i < n; i++) { const r = await press(g, "next", t); expect([g.id, i, r.status]).toEqual([g.id, i, 200]); t += gap; } return t; }
/** Run a whole game's number schedule: starts it (by clock or by press) and, for Host calls, presses Next 90 times. Returns the time of the last call. */
export async function runAllNumbers(g: Game): Promise<number> {
  const first = await startGame(g);
  if (g.fmt.callMode === "host") return pressNext(g, 90, Math.max(first, g.at + 60_000));
  return (await callTimeMs(W.env as any, row(g.id), 1, 89))!;
}
export { endBoundMs, realEndMs, keysInPlay, linesFor, ticketFor, HOUSE_ORDER, GRACE_ROUNDS, publicKeyFromSecret, signControlWithSecret, nextMessage, readPublished };

/** An independent oracle (does not call settleAll): the call index (0-based) at which a ticket completes a house on `log`, or -1. */
import { ticketNumbers, isValidTicket, type Ticket } from "../../../../packages/shared/src/ticket";
export { ticketNumbers, isValidTicket };
export function oracleIdx(t: Ticket, house: "early5" | "top" | "mid" | "bot" | "corners" | "full", log: readonly number[]): number {
  const row = (r: number) => t[r]!.filter((v): v is number => v !== null);
  const need: number[] = house === "top" ? row(0) : house === "mid" ? row(1) : house === "bot" ? row(2) : house === "full" ? ticketNumbers(t) : house === "corners" ? [row(0)[0]!, row(0)[4]!, row(2)[0]!, row(2)[4]!] : [];
  if (house === "early5") { const all = new Set(ticketNumbers(t)); let c = 0; for (let i = 0; i < log.length; i++) if (all.has(log[i]!) && ++c === 5) return i; return -1; }
  let last = -1; for (const n of need) { const i = log.indexOf(n); if (i < 0) return -1; last = Math.max(last, i); }
  return last;
}
