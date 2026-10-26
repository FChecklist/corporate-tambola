// PROBE (temporary): what the join route does today in the ID modes when both an ID and a mobile number arrive, and when the list row has both.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
const START = roundAt(T) + 1200;
let env: PayEnv; let ipN = 0;
const realFetch = globalThis.fetch;
const call = (method: string, path: string, body?: unknown, key?: string, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env as Env, now);
const j = async (r: Response) => (await r.json()) as any;
const mob = (i: number) => "9" + String(100000000 + i);
const dev = (i: number) => (String(i).padStart(2, "0") + "b".repeat(32)).slice(0, 32);
const join = (id: string, body: Record<string, unknown>, now = T) => call("POST", `/api/z/${id}/join`, body, undefined, now);
const joinAs = (id: string, i: number, extra: Record<string, unknown> = {}) => join(id, { phone: mob(i), name: "G" + i, device: dev(i), ...extra });

async function setup(opts: { closed?: boolean; verify?: string; employeesOnly?: boolean } = {}) {
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.7.${++ipN}` }, body: JSON.stringify({ email: `o${ipN}@acme.com` }) }), env as Env, T));
  const master = st.token as string;
  await call("POST", "/api/z", { id: "PPL-1", startRound: START, callSeconds: 6, cap: 100, ...(opts.closed ? { whoCanJoin: "list" } : {}) }, master);
  await call("POST", "/api/z/PPL-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, master);
  const body = { ...(opts.verify ? { verify: opts.verify } : {}), ...(opts.employeesOnly !== undefined ? { employeesOnly: opts.employeesOnly } : {}) };
  if (Object.keys(body).length) expect((await call("PATCH", "/api/z/PPL-1/settings", body, master)).status).toBe(200);
  return { master };
}
const add = (key: string, people: unknown[]) => call("POST", "/api/z/PPL-1/people", { people }, key);
beforeEach(() => { const d = makeD1(); env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt" } as any; (globalThis as any).fetch = async () => new Response("{}"); });
afterEach(() => { globalThis.fetch = realFetch; });

const show = async (label: string, r: Response) => { const b = await j(r); console.log(label.padEnd(60), r.status, b.code ?? "", String(b.error ?? (b.pid ? "ticket " + b.pid : "")).slice(0, 110)); return b; };

describe("probe", () => {
  test("id mode, employees only, list row has ID + phone", async () => {
    const t = await setup({ verify: "id", employeesOnly: true });
    await add(t.master, [{ name: "Asha Rao", empId: "E101", phone: mob(1) }, { name: "Ravi", empId: "E102" }]);
    await show("ID only, row keyed by phone+ID", await joinAs("PPL-1", 21, { phone: undefined, empId: "E101", device: dev(50) }));
    await show("ID + the listed phone typed too", await joinAs("PPL-1", 1, { empId: "E101", device: dev(51) }));
    await show("ID of ID-only row + some phone typed", await joinAs("PPL-1", 33, { empId: "E102", device: dev(52) }));
    await show("ID-only row, ID alone", await joinAs("PPL-1", 34, { phone: undefined, empId: "E102", device: dev(53) }));
    await show("phone typed alone, listed", await joinAs("PPL-1", 1, { device: dev(54) }));
  });
  test("id mode, NOT employees only, outsider", async () => {
    const t = await setup({ verify: "id" });
    await add(t.master, [{ name: "Asha Rao", empId: "E101" }]);
    await show("ID listed alone", await joinAs("PPL-1", 21, { phone: undefined, empId: "E101", device: dev(50) }));
    await show("outsider phone only", await joinAs("PPL-1", 22, { device: dev(51) }));
    await show("outsider phone + ID not listed", await joinAs("PPL-1", 23, { empId: "E555", device: dev(52) }));
    await show("nothing", await joinAs("PPL-1", 24, { phone: undefined, device: dev(53) }));
  });
  test("both mode, not employees only", async () => {
    const t = await setup({ verify: "both" });
    await add(t.master, [{ name: "Asha Rao", empId: "E101", phone: mob(1) }]);
    await show("phone only (not employee)", await joinAs("PPL-1", 22, { device: dev(51) }));
    await show("phone+ID matching list", await joinAs("PPL-1", 1, { empId: "E101", device: dev(52) }));
    await show("phone+wrong ID", await joinAs("PPL-1", 23, { empId: "E555", device: dev(53) }));
  });
  test("international numbers", async () => {
    const t = await setup({});
    await show("+65 91234567 (8 digits)", await join("PPL-1", { phone: "+6591234567", name: "S", device: dev(60) }));
    await show("+682 12345 (Cook Islands, 8 digits total)", await join("PPL-1", { phone: "+68212345", name: "S", device: dev(61) }));
    await show("+44 7911 123456", await join("PPL-1", { phone: "+447911123456", name: "S", device: dev(62) }));
    await show("+91 98765 43210", await join("PPL-1", { phone: "+919876543210", name: "S", device: dev(63) }));
    await show("same person bare 9876543210 other device", await join("PPL-1", { phone: "9876543210", name: "S", device: dev(64) }));
    await show("UK 7911123456 vs Indian 7911123456 collision?", await join("PPL-1", { phone: "+917911123456", name: "S", device: dev(65) }));
    await show("UK +44 7911123456 again other device", await join("PPL-1", { phone: "+447911123456", name: "S", device: dev(66) }));
  });
});
