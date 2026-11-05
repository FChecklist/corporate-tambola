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
beforeEach(() => { const d: any = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt" }; });

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
  test("D1: an ID game never suggests a mobile number: the waiting answer is the soft 'with the Organizer' sentence; a mobile-number game keeps its own words", async () => {
    const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "7.7.9.2" }, body: JSON.stringify({ email: "boss@acme.com" }) }), env, T)); const master = st.token as string;
    await call("POST", "/api/z", { id: "CHN-ID", startRound: roundAt(T) + 1200, callSeconds: 6, cap: 100, verify: "id", whoCanJoin: "list" }, master);
    await call("POST", "/api/z/CHN-ID/publish", { email: "demo1@demo-test.invalid", phone: "98765 43210" }, master);
    const r = await call("POST", "/api/z/CHN-ID/join", { empId: "E9002", name: "Ravi · Delhi", device: "02" + "b".repeat(30) });
    expect(r.status).toBe(403); const b = await j(r);
    expect(b).toMatchObject({ code: "waiting", waiting: true, error: "Your request is with the Organizer. You can come in as soon as they say yes." });
    expect(b.error).not.toMatch(/mobile|number|by invitation/i); // "This game is by invitation" is what the page's guide answers with "ask them to add your mobile number"
    // the same question again (a reload) gets the same calm answer
    expect((await j(await call("POST", "/api/z/CHN-ID/join", { empId: "E9002", name: "Ravi · Delhi", device: "02" + "b".repeat(30) }))).error).toBe("Your request is with the Organizer. You can come in as soon as they say yes.");
    // a game that asks for mobile numbers keeps its own words
    await call("POST", "/api/z", { id: "CHN-MB", startRound: roundAt(T) + 1200, callSeconds: 6, cap: 100, whoCanJoin: "list" }, master);
    await call("POST", "/api/z/CHN-MB/publish", { email: "demo1@demo-test.invalid", phone: "98765 43210" }, master);
    const m = await j(await call("POST", "/api/z/CHN-MB/join", { phone: "9822233333", name: "Ravi", device: "03" + "b".repeat(30) }));
    expect(m.error).toBe("This game is by invitation. Your request is with the organizer. You can come in as soon as they say yes.");
  });
});
