// C03 (gap plan 2026-10-29): an employee ID typed with a space (or a tab, or a no-break space from a pasted message) is the same ID as the listed one.
// Verified against the real Worker: the ID is normalised the same way on the list and at the door (apps/edge/src/people.ts normEmp).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
const START = roundAt(T) + 1200;
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"]; let ipN = 0;
const realFetch = globalThis.fetch;
const call = (method: string, path: string, body?: unknown, key?: string, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env as Env, now);
const j = async (r: Response) => (await r.json()) as any;
const mob = (i: number) => "9" + String(100000000 + i);
const dev = (i: number) => (String(i).padStart(2, "0") + "b".repeat(32)).slice(0, 32);
const join = (body: Record<string, unknown>) => call("POST", "/api/z/PPL-1/join", { name: "G", ...body }, undefined, T);
const rowsOf = (sql: string, ...v: unknown[]) => raw.prepare(sql).all(...(v as any[])) as any[];

async function setup(opts: { closed?: boolean; verify?: "mobile" | "id" | "both" | "either"; employeesOnly?: boolean } = {}) {
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.7.${++ipN}` }, body: JSON.stringify({ email: `o${ipN}@acme.com` }) }), env as Env, T));
  const master = st.token as string;
  await call("POST", "/api/z", { id: "PPL-1", startRound: START, callSeconds: 6, cap: 100, ...(opts.closed ? { whoCanJoin: "list" } : {}) }, master);
  await call("POST", "/api/z/PPL-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, master);
  const body = { ...(opts.verify ? { verify: opts.verify } : {}), ...(opts.employeesOnly !== undefined ? { employeesOnly: opts.employeesOnly } : {}) };
  if (Object.keys(body).length) expect((await call("PATCH", "/api/z/PPL-1/settings", body, master)).status).toBe(200);
  return { master };
}
const add = (key: string, people: unknown[]) => call("POST", "/api/z/PPL-1/people", { people }, key);
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt" } as any; (globalThis as any).fetch = async () => new Response("{}", { status: 404 }); });
afterEach(() => { globalThis.fetch = realFetch; });
const ticket = async (r: Response) => { expect(r.status).toBe(200); const b = await j(r); expect(b.pid).toBeTruthy(); return b; };
const waits = async (r: Response) => { expect(r.status).toBe(403); expect((await j(r)).code).toBe("waiting"); };
const listed = ["EMP001", "Ab 77", "N-12/3"];
describe("C03: spaces inside an employee ID", () => {
  test("a listed ID is found however the player spaces it; the same person cannot get a second ticket by spacing it differently", async () => {
    const t = await setup({ verify: "id", employeesOnly: true });
    expect((await add(t.master, listed.map((empId, i) => ({ name: "P" + i, empId })))).status).toBe(200);
    const a = await ticket(await join({ empId: "EMP 001", device: dev(1) })); // "EMP001" is on the list, typed with a space
    expect(a.pid).toBeTruthy();
    const again = await join({ empId: "emp 001 ", device: dev(2) }); // a second phone, no-break space, trailing space, lower case: the same ID, already taken
    expect(again.status).toBe(423); expect((await j(again)).code).toBe("id-used");
    await ticket(await join({ empId: "AB77", device: dev(3) })); // listed WITH a space ("Ab 77"), typed without
    await ticket(await join({ empId: "n - 12 / 3", device: dev(4) })); // spaces around the dash and the slash
    expect(rowsOf("SELECT COUNT(*) c FROM seat")[0].c).toBe(3);
  });
  test("an ID that is not on the list still waits, spaces or not (the space does not open the door)", async () => {
    const t = await setup({ verify: "id", employeesOnly: true });
    await add(t.master, [{ name: "Asha", empId: "EMP001" }]);
    await waits(await join({ empId: "EMP 002", device: dev(1) }));
    expect(rowsOf("SELECT COUNT(*) c FROM seat")[0].c).toBe(0);
  });
});
