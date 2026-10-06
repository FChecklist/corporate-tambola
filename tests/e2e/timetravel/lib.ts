// Time-travel harness (bun test): the REAL Worker code (apps/edge/src/worker.ts) on an in-memory SQLite stand-in for D1, with the clock handed to `handle(req, env, now)`.
// This is how hours and days pass without waiting: the 22-hour report link, the 23-hour shred, the 365-day deletion, the 45-second unpaid lock.
import { test } from "bun:test";
import { appendFileSync, mkdirSync } from "node:fs";
import { join as pjoin } from "node:path";
import { handle, purgeOld, type Env } from "../../../apps/edge/src/worker";
import type { PayEnv } from "../../../apps/edge/src/pay";
import { lifecycleTick } from "../../../apps/edge/src/lifecycle";
import { makeD1 } from "../../../apps/edge/test/d1-sqlite";
import { createHash } from "node:crypto";

export const HOUR = 3_600_000, DAY = 86_400_000, GEN = 1692803367;
export const T = Date.UTC(2026, 9, 6, 10, 0, 0);
export const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
export const roundMs = (r: number) => (GEN + (r - 1) * 3) * 1000;
export const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const dev = (s: string | number) => sha("dev|" + s).slice(0, 32);
export const phone = (i: number) => "98" + String(10000000 + i).slice(-8);
export const j = async (r: Response) => ((await r.json().catch(() => ({}))) as any);

export interface World { env: PayEnv; raw: ReturnType<typeof makeD1>["raw"]; call: (m: string, p: string, b?: unknown, h?: Record<string, string>, now?: number) => Promise<Response>; ip: number; budget: string }
export function world(opts: { budget?: string; mode?: "TEST" | "LIVE" } = {}): World {
  const d = makeD1();
  const env: PayEnv = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: opts.budget ?? "10000000", PUBLIC_ORIGIN: "https://tambola.test", DATA_KEY: "tt-data-key-0123456789abcdef0123456789", PHONE_SALT: "tt-salt", CRON_KEY: "tt-cron-key-0123456789" } as any;
  if (opts.mode) d.raw.run("UPDATE mode SET mode=?, changed_ms=?, reason=? WHERE id=1", [opts.mode, T, "tt"]);
  const w: World = { env, raw: d.raw, ip: 0, budget: opts.budget ?? "10000000", call: (method, path, body, headers = {}, now = T) =>
    handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(headers["cf-connecting-ip"] ? {} : { "cf-connecting-ip": `10.9.${(w.ip++ >> 8) & 255}.${w.ip & 255}` }), ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }), env as Env, now) };
  return w;
}
export const PLAT = { "x-organizer": "plat" };
export async function organizer(w: World, email: string, now = T) {
  const r = await j(await w.call("POST", "/api/start", { email }, {}, now));
  return { email, h: { "x-organizer": r.token as string }, ai: { "x-organizer": r.aiKey as string }, token: r.token as string, aiKey: r.aiKey as string };
}
/** A published, PAID engagement starting `leadMs` after T (TEST-mode payment). */
export async function paidEngagement(w: World, o: { id?: string; cap?: number; leadMs?: number; rewards?: unknown[]; email?: string } = {}) {
  w.raw.run("UPDATE mode SET mode='TEST', changed_ms=?, reason='tt' WHERE id=1", [T]);
  const org = await organizer(w, o.email ?? `org${Math.random().toString(36).slice(2, 8)}@example.com`);
  const id = o.id ?? "TT" + Math.random().toString(36).slice(2, 8).toUpperCase();
  const start = roundAt(T + (o.leadMs ?? HOUR)) + 1;
  const c = await w.call("POST", "/api/z", { id, startRound: start, callSeconds: 6, cap: o.cap ?? 100, ...(o.rewards ? { rewards: o.rewards } : {}) }, org.h);
  if (c.status !== 200) throw new Error("create " + (await c.text()));
  const p = await w.call("POST", `/api/z/${id}/publish`, { email: org.email, phone: "9811122233" }, org.h);
  if (p.status !== 200) throw new Error("publish " + (await p.text()));
  const pay = await w.call("POST", "/api/payments/test", { eid: id, email: org.email, org: "TT Org", country: "IN" }, org.h);
  if (pay.status !== 200) throw new Error("pay " + (await pay.text()));
  return { org, id, start, startMs: roundMs(start) };
}
export async function join(w: World, id: string, i: number, now = T, ip?: string) {
  const r = await w.call("POST", `/api/z/${id}/join`, { phone: phone(i), name: "P" + i, device: dev("p" + i) }, ip ? { "cf-connecting-ip": ip } : {}, now);
  return { status: r.status, body: await j(r) };
}

const OUT = pjoin(process.env.E2E_RESULTS_DIR ?? pjoin(import.meta.dir, "..", "results"), `${process.env.E2E_RUN_LABEL ?? "timetravel"}.jsonl`);
export interface Meta { id: string; role: string; title: string; steps: string; expected: string; known?: string; severityIfFails?: string }
export function tt(meta: Meta, fn: () => Promise<string | void>, timeout = 60_000) {
  test(`${meta.id} ${meta.title}`, async () => {
    const t0 = Date.now(); const rec = (result: string, evidence: string) => { try { mkdirSync(pjoin(OUT, ".."), { recursive: true }); appendFileSync(OUT, JSON.stringify({ ...meta, target: "time-travel", base: "in-process Worker + SQLite", result, evidence: evidence.replace(/\b(ctk|cta|cth|ctp|rpt)_[0-9a-f]{8,}/g, "$1_<key>").slice(0, 700), ms: Date.now() - t0, at: new Date().toISOString() }) + "\n"); } catch { /* best effort */ } };
    try { const ev = await fn(); rec("pass", String(ev ?? "")); } catch (e: any) { rec("fail", String(e?.message ?? e)); throw e; }
  }, timeout);
}
export { handle, purgeOld, lifecycleTick };
