// SMOKE 20 NOV (owner steps 15 to 20): shared helpers for the permutation matrix in apps/edge/test/smoke/.
// Same rules as the lifecycle suite: real Worker code, in-memory D1, handed-in clock, no network, no real money, no real mail provider.
import { expect } from "bun:test";
import { W, T, HOUR, MIN, call, j, one, q, mails, reset, restore, organizer, create, publish, contact, checkout, capture, verify } from "../param-harness";
export * from "../lifecycle/harness";

export { mails, reset, restore, organizer, create, publish, contact, checkout, capture, verify };
export const DAY = 24 * HOUR;
/** IST midnight of the day after `ms` (the clock the console and the owner read). */
export const istMidnightAfter = (ms: number) => (Math.floor((ms + 19_800_000) / DAY) + 1) * DAY - 19_800_000;

/** A stand-in for the mail provider (Resend). `mode` is changed by a test: "ok" delivers, "down" answers 500, "throw" is a network failure, "flaky:N" fails the first N calls. A repeated idempotency key is delivered once, as the real provider does. */
export const provider = { mode: "ok" as string, delivered: [] as { to: string; subject: string; text: string; attachments: number; idem: string | null }[], calls: 0, seenIdem: new Set<string>(), failLeft: 0 };
export function installProvider(mode = "ok") {
  provider.mode = mode; provider.delivered = []; provider.calls = 0; provider.seenIdem = new Set(); provider.failLeft = mode.startsWith("flaky:") ? Number(mode.slice(6)) : 0;
  (W.env as any).RESEND_API_KEY = "re_test_key";
  const prev = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    if (!String(url).startsWith("https://api.resend.com/emails")) return prev(url, init);
    provider.calls++;
    if (provider.mode === "throw") throw new Error("network down");
    if (provider.mode === "down") return new Response("{}", { status: 500 });
    if (provider.failLeft > 0) { provider.failLeft--; return new Response("{}", { status: 503 }); }
    const b = JSON.parse(init.body); const idem = init.headers?.["idempotency-key"] ?? null;
    if (idem && provider.seenIdem.has(idem)) return new Response(JSON.stringify({ id: "dup" }), { status: 200 });
    if (idem) provider.seenIdem.add(idem);
    provider.delivered.push({ to: b.to[0], subject: b.subject, text: b.text, attachments: (b.attachments ?? []).length, idem });
    return new Response(JSON.stringify({ id: "m" + provider.delivered.length }), { status: 200 });
  }) as any;
}
/** Everything the organizer has been written to, wherever it went in this test run: the provider (when installed) or the outbox/report list (when not). */
export const outboxSubjects = (to?: string) => mails(to).map((m: any) => m.subject as string);
export const matrixNote: string[] = [];
export const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
export { expect };

import { FORMATS, newGame, seat, runAllNumbers, callLog, winnersOf, joinId, addIds, type Game, type Format } from "../lifecycle/harness";
import { lifecycleTick, reportLink } from "../../src/lifecycle";
/** Seat `n` listed people, play the whole game (by clock or by presses), and let the phones settle every prize (the same vote the real phones send). Returns the pids, the time of the last call and the settled results. */
export async function playGame(g: Game, n = 4, opts: { prefix?: string; from?: number } = {}) {
  const pids = await seat(g, n, opts.prefix ?? "P", opts.from ?? 1000);
  const last = await runAllNumbers(g);
  const { log } = await callLog(g);
  const res = winnersOf(g, pids, log).map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, round: 1, idx: x.idx, pids: x.pids }));
  for (const pid of pids) for (let i = 0; i < res.length; i += 3) await call("POST", `/api/z/${g.id}/vote`, { pid, results: res.slice(i, i + 3) }, {}, last + MIN);
  return { pids, last, res, log };
}
/** Run the cron once a minute from `t0` until `until(t)` says stop (the report is made in small steps). */
export async function tickFor(t0: number, minutes: number, step = MIN) { let t = t0; for (let i = 0; i < minutes; i++, t += step) await lifecycleTick(W.env as any, t); return t; }
export { FORMATS, newGame, lifecycleTick, reportLink, type Game, type Format };
