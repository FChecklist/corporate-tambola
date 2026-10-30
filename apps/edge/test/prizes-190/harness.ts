// Shared helpers for the 1.9.0 prizes edge tests (test author only; no product code touched).
import { expect } from "bun:test";
import { withDevice } from "../device";
import type { Env } from "../../src/worker";
import { handle } from "../with-terms";
import { makeD1 } from "../d1-sqlite";
import { PRIZES_FROM_MS } from "../../src/approvals";

export const FROM = PRIZES_FROM_MS;
export const GEN = 1692803367;
export const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
export const P = { "x-organizer": "plat" };
export const j = async (r: Response) => (await r.json()) as any;
export class Site {
  env!: Env; raw!: ReturnType<typeof makeD1>["raw"];
  constructor() { this.reset(); }
  reset() { const d = makeD1(); this.raw = d.raw; this.env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" } as any; }
  call = (now: number, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), this.env, now);
  /** A published game made at `at` (the platform key), starting 2 hours later, with `extra` merged into the create body. Returns the start time. */
  async make(id: string, at: number, extra: Record<string, unknown> = {}, paid = true) {
    const start = roundAt(at) + 2400;
    const r = await this.call(at, "POST", "/api/z", { id, startRound: start, callSeconds: 9, cap: 100, ...extra }, P);
    if (r.status !== 200) throw new Error(`create ${id} -> ${r.status} ${JSON.stringify(await r.json())}`);
    if (paid) this.raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id);
    return at + 2 * 3_600_000;
  }
  patch = (now: number, id: string, body: unknown) => this.call(now, "PATCH", `/api/z/${id}/settings`, body, P);
  summary = async (now: number, id: string) => j(await this.call(now, "GET", `/api/z/${id}/summary`, undefined, P));
  info = async (now: number, id: string) => this.call(now, "GET", `/api/z/${id}/info`);
}
export const lines2 = [
  { pattern: "top", scope: "ticket_1", ordinal: 1, text: "" }, { pattern: "top", scope: "ticket_2", ordinal: 1, text: "" },
  { pattern: "early5", scope: "ticket_1", ordinal: 1, text: "" }, { pattern: "full", scope: "ticket_1", ordinal: 1, text: "" }, { pattern: "full", scope: "ticket_2", ordinal: 1, text: "" },
  { pattern: "full", scope: "two_ticket", ordinal: 1, text: "" },
];
export const plan2 = (o: Record<string, unknown> = {}) => ({ mode: "auto", currency: "INR", budget: 7654321, count: 6, prizes: [
  { id: "1:top:1", amount: 1111111, gift: "SECRETGIFT-ALPHA" }, { id: "2:top:1", amount: 1222222 }, { id: "1:early5:1", amount: 1333333, gift: "SECRETGIFT-BETA" },
  { id: "1:full:1", amount: 1444444 }, { id: "2:full:1", amount: 1555555 }, { id: "0:full2:1", amount: 1020000 }], ...o });
export const body2 = (o: Record<string, unknown> = {}) => ({ tickets: 2, ties: "share", rewards: lines2, prizePlan: plan2(), ...o });
export { expect };
