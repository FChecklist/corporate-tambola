// Join by ID (1 Nov 2026): a person not on the list asks with ID + name + location; the Organizer confirms; the record of the approval holds a role/id reference and a time, never a name or the raw ID; at +24 h the participant data is gone.
import { beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { erasePersonal } from "../src/lifecycle";

const T = Date.UTC(2026, 10, 5, 10, 0, 0), GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
let env: any, raw: any;
const call = (method: string, path: string, body?: unknown, key?: string) => handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, T);
const j = async (r: Response) => (await r.json()) as any;
beforeEach(() => { const d: any = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt" }; });

describe("join by ID: the approval chain", () => {
  test("ID + name + location, confirmed by the Organizer: the log lines hold no name and no raw ID, and the personal rows go at +24 h", async () => {
    const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "7.7.9.1" }, body: JSON.stringify({ email: "boss@acme.com" }) }), env, T)); const master = st.token as string;
    await call("POST", "/api/z", { id: "CHN-1", startRound: roundAt(T) + 1200, callSeconds: 6, cap: 100, verify: "id", whoCanJoin: "list" }, master);
    await call("POST", "/api/z/CHN-1/publish", { email: "demo1@demo-test.invalid", phone: "98765 43210" }, master);
    const r = await j(await call("POST", "/api/z/CHN-1/join", { empId: "E9001", name: "Asha Rao · Pune", device: "01" + "b".repeat(30) }));
    expect(r.waiting).toBe(true);
    const w = (await j(await call("GET", "/api/z/CHN-1/waiting", undefined, master))).waiting; expect(w).toHaveLength(1);
    expect(String(w[0].empId || "").toUpperCase()).toBe("E9001"); expect(String(w[0].name)).toContain("Pune");
    const d = await j(await call("POST", `/api/z/CHN-1/waiting/${encodeURIComponent(w[0].id)}`, { decision: "admit" }, master)); expect(d.error).toBeUndefined();
    const dump = JSON.stringify([raw.prepare("SELECT approved_by, approved_ms FROM person").all(), raw.prepare("SELECT decided_by, decided_ms FROM waiting").all()]);
    expect(dump).not.toMatch(/asha|rao|pune|e9001/i);
    expect(dump).toMatch(/approved_ms":\d{10,}|decided_ms":\d{10,}/);
    await erasePersonal(env, "CHN-1", T + 25 * 3_600_000, "retention");
    expect(raw.prepare("SELECT COUNT(*) AS c FROM person WHERE eid='CHN-1'").get()).toEqual({ c: 0 });
    expect(raw.prepare("SELECT COUNT(*) AS c FROM waiting WHERE eid='CHN-1'").get()).toEqual({ c: 0 });
  });
});
