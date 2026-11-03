// Shared helpers for the rc/tambola-1.8.5 tests (engine side). Test author only: nothing here touches product code.
// Test addresses are demoN@demo-test.invalid only. No personal data.
import { expect } from "bun:test";
import { handle } from "../with-terms";
import type { PayEnv } from "../../src/pay";
import { makeD1 } from "../d1-sqlite";
import { EMP_CLEAN_FROM_MS } from "../../src/empid";

export const NEW_T = Math.max(Date.UTC(2026, 10, 5, 10, 0, 0), EMP_CLEAN_FROM_MS + 86_400_000); // after the release instant: uniform rule
export const OLD_T = EMP_CLEAN_FROM_MS - 3 * 86_400_000; // before it: the old rule
export const GEN = 1692803367;
export const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
export const dev = (i: number) => (String(i).padStart(2, "0") + "b".repeat(32)).slice(0, 32);
export const j = async (r: Response) => (await r.json()) as any;

export class World {
  env!: PayEnv; ipN = 0; realFetch = globalThis.fetch;
  constructor() { this.reset(); }
  reset() { const d = makeD1(); this.env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt" } as any; (globalThis as any).fetch = async () => new Response("{}", { status: 404 }); }
  restore() { globalThis.fetch = this.realFetch; }
  call = (now: number, method: string, path: string, body?: unknown, key?: string) =>
    handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), this.env as any, now);
  /** A published, list-only game whose ID is checked (verify:"id"). `set` is merged into the settings PATCH (for example { idKind: "email" }). */
  async game(at: number, id = "EMP-1", set: Record<string, unknown> = {}, open = false) {
    const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.6.${++this.ipN}` }, body: JSON.stringify({ email: `demo${this.ipN}@demo-test.invalid` }) }), this.env as any, at));
    const master = st.token as string, start = roundAt(at) + 1200;
    await this.call(at, "POST", "/api/z", { id, startRound: start, callSeconds: 6, cap: 100, ...(open ? {} : { whoCanJoin: "list" }) }, master);
    await this.call(at, "POST", `/api/z/${id}/publish`, { email: "demo1@demo-test.invalid", phone: "98765 43210" }, master);
    const r = await this.call(at, "PATCH", `/api/z/${id}/settings`, open && !("verify" in set) ? set : { verify: "id", employeesOnly: true, ...set }, master);
    expect(r.status).toBe(200);
    return master;
  }
  add = (at: number, key: string, people: unknown[], id = "EMP-1") => this.call(at, "POST", `/api/z/${id}/people`, { people }, key);
  join = (at: number, empId: string, i: number, id = "EMP-1", extra: Record<string, unknown> = {}) => this.call(at, "POST", `/api/z/${id}/join`, { name: "G", empId, device: dev(i), ...extra });
  info = async (at: number, id = "EMP-1") => j(await this.call(at, "GET", `/api/z/${id}/info`));
}
