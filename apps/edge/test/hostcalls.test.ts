// Host mode ("A Host presses a button for each number"): the Worker's part. The setting (callMode) is saved, shown to phones and locked with the rest once the game starts;
// host mode is refused above the pause size limit; the control address accepts a "next" press from the organizer's key and from a Host's registered console key, and from nobody else.
import { beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { NEXT_LEAD_ROUNDS, NEXT_REFUSALS, nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400; // two hours ahead
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const ORG = "11".repeat(32), HOST = "22".repeat(32), GUEST = "33".repeat(32);
const kv = (): KV => ({ get: async (k) => (raw.query("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} });

async function organizer() {
  const s = await j(await call("POST", "/api/start", { email: "boss@acme.com" }));
  return { token: s.token as string, ai: s.aiKey as string, h: { "x-organizer": s.token as string } };
}
async function host(o: { token: string }) {
  const r = await j(await call("POST", "/api/org/host", { label: "Priya", mobile: "9822200011", email: "host@acme.com" }, { "x-organizer": o.token }));
  raw.prepare("UPDATE host_state SET verified_ms=?, mobile_ok=1").run(T); // as if the Host had finished the first-open setup (that screen has its own tests)
  return { key: r.hostKey as string, h: { "x-organizer": r.hostKey as string } };
}
const make = (o: { token: string }, id: string, over: Record<string, unknown> = {}) => call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, ...over }, { "x-organizer": o.token });
const publish = (o: { token: string }, id: string) => call("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, { "x-organizer": o.token });
const signed = async (id: string, secret: string, now: number, a: Parameters<typeof nextMessage>[2]) => signControlWithSecret(secret, nextMessage((await readPublished(kv(), id))!, roundAt(now), a));
const post = async (id: string, msg: unknown, now = T) => { const r = await call("POST", `/api/z/${id}/control`, { message: msg }, {}, now); return { status: r.status, body: await j(r) }; };

beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" } as any; });

describe("the setting: who calls the numbers", () => {
  test("callMode is saved at creation or in the settings, read back by phones (info) and the summary, and defaults to auto", async () => {
    const o = await organizer();
    expect((await make(o, "HM-1")).status).toBe(200);
    const info = async (id: string) => j(await call("GET", `/api/z/${id}/info`, undefined, o.h)); // a draft's info is for its organizer
    expect((await info("HM-1")).callMode).toBe("auto");
    expect((await call("PATCH", "/api/z/HM-1/settings", { callMode: "host" }, o.h)).status).toBe(200);
    expect((await info("HM-1")).callMode).toBe("host");
    expect((await j(await call("GET", "/api/z/HM-1/summary", undefined, o.h))).callMode).toBe("host");
    expect((await j(await call("PATCH", "/api/z/HM-1/settings", { callMode: "auto" }, o.h))).callMode).toBe("auto");
    expect((await info("HM-1")).callMode).toBe("auto");
    expect((await make(o, "HM-2", { callMode: "host" })).status).toBe(200);
    expect((await info("HM-2")).callMode).toBe("host");
    await publish(o, "HM-2");
    expect((await j(await call("GET", "/api/z/HM-2/info"))).callMode).toBe("host"); // and every phone reads it once the game is published
    const bad = await call("PATCH", "/api/z/HM-1/settings", { callMode: "manual" }, o.h);
    expect(bad.status).toBe(400); expect((await j(bad)).error).toMatch(/Who calls the numbers/);
  });
  test("host mode is allowed up to 1,000 people and refused above it, at creation and when the size is raised later", async () => {
    const o = await organizer();
    const big = await make(o, "HM-BIG", { cap: 5000, callMode: "host" });
    expect(big.status).toBe(409); expect((await j(big)).error).toMatch(/Games above 1,000 people are called by the game itself/);
    expect((await make(o, "HM-OK", { cap: 1000, callMode: "host" })).status).toBe(200);
    const raise = await call("PATCH", "/api/z/HM-OK/settings", { cap: 1001 }, { "x-organizer": "plat" }); // (the platform key skips the pack check: only the host-mode rule can refuse)
    expect(raise.status).toBe(409); expect((await j(raise)).error).toMatch(/Games above 1,000 people are called by the game itself/);
    expect((await call("PATCH", "/api/z/HM-OK/settings", { cap: 1001, callMode: "auto" }, { "x-organizer": "plat" })).status).toBe(200);
    const flip = await call("PATCH", "/api/z/HM-OK/settings", { callMode: "host" }, { "x-organizer": "plat" });
    expect(flip.status).toBe(409);
  });
  test("like the speed, the setting is locked once the game has started", async () => {
    const o = await organizer(); await make(o, "HM-L", { callMode: "host" }); await publish(o, "HM-L");
    raw.prepare("UPDATE engagement SET pack=100 WHERE id='HM-L'").run();
    const later = T + 2 * 3_600_000 + 60_000;
    expect((await call("PATCH", "/api/z/HM-L/settings", { callMode: "auto" }, o.h, later)).status).toBe(409);
    expect((await j(await call("GET", "/api/z/HM-L/info", undefined, {}, later))).callMode).toBe("host");
  });
});

describe("the control address: a press is accepted from the organizer and a Host, never from a guest", () => {
  const live = async (id = "HM-C", o?: Awaited<ReturnType<typeof organizer>>) => {
    o = o ?? (await organizer());
    await make(o, id, { callMode: "host", callSeconds: 6 }); await publish(o, id); raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id);
    expect((await call("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret(ORG) }, o.h)).status).toBe(200);
    return o;
  };
  const during = T + 2 * 3_600_000 + 5 * 60_000; // the game is on
  test("the organizer's key presses; the same press twice is idempotent; a second press before the first number is out is refused kindly", async () => {
    await live();
    const m = await signed("HM-C", ORG, during, { action: "next" });
    expect(m.atBeaconRound - m.signedAtRound).toBe(NEXT_LEAD_ROUNDS);
    expect(await post("HM-C", m, during)).toEqual({ status: 200, body: { ok: true, seq: 1 } });
    expect((await post("HM-C", m, during)).body.duplicate).toBe(true);
    const again = await post("HM-C", await signed("HM-C", ORG, during + 1000, { action: "next" }), during + 1000);
    expect(again.status).toBe(422); expect(again.body.error).toBe(NEXT_REFUSALS.order);
    const later = await post("HM-C", await signed("HM-C", ORG, during + 9000, { action: "next" }), during + 9000);
    expect(later.status).toBe(200);
    const f = (await readPublished(kv(), "HM-C"))!;
    expect(f.messages.map((x) => x.action)).toEqual(["next", "next"]);
  });
  test("the organizer signed in on a second browser (or after clearing site data) adds that browser's key beside the first, then presses; the AI link and a guest still may not", async () => {
    const o = await live();
    const second = await call("PUT", "/api/z/HM-C/control/key", { publicKey: publicKeyFromSecret(HOST) }, o.h);
    expect(second.status).toBe(200); expect((await j(second)).host).toBe(true);
    const f = (await readPublished(kv(), "HM-C"))!;
    expect(f.pubKey).toBe(publicKeyFromSecret(ORG)); expect(f.hostKeys).toEqual([publicKeyFromSecret(HOST)]); // the first key stays the organizer's main key
    expect((await call("PUT", "/api/z/HM-C/control/key", { publicKey: publicKeyFromSecret(GUEST) }, { "x-organizer": o.ai })).status).toBe(403);
    expect((await call("PUT", "/api/z/HM-C/control/key", { publicKey: publicKeyFromSecret(GUEST) })).status).toBe(403);
  });
  test("a Host registers their own console key beside the organizer's (the organizer's stays), then presses; a guest's key is refused at registration and at the press", async () => {
    const o = await live();
    const h = await host(o);
    expect((await call("PUT", "/api/z/HM-C/control/key", { publicKey: publicKeyFromSecret(GUEST) })).status).toBe(403); // nobody signed in
    expect((await call("PUT", "/api/z/HM-C/control/key", { publicKey: publicKeyFromSecret(GUEST) }, { "x-organizer": o.ai })).status).toBe(403); // the AI link may not
    const reg = await call("PUT", "/api/z/HM-C/control/key", { publicKey: publicKeyFromSecret(HOST) }, h.h);
    expect(reg.status).toBe(200); expect((await j(reg)).host).toBe(true);
    const f = (await readPublished(kv(), "HM-C"))!;
    expect(f.pubKey).toBe(publicKeyFromSecret(ORG)); expect(f.hostKeys).toEqual([publicKeyFromSecret(HOST)]);
    expect((await j(await call("GET", "/api/z/HM-C/control"))).hostKeys).toEqual([publicKeyFromSecret(HOST)]); // phones read the Host key from the same file
    expect((await post("HM-C", await signed("HM-C", HOST, during, { action: "next" }), during)).status).toBe(200);
    const guest = await post("HM-C", await signed("HM-C", GUEST, during + 9000, { action: "next" }), during + 9000);
    expect(guest.status).toBe(403);
    expect((await post("HM-C", await signed("HM-C", ORG, during + 9000, { action: "next" }), during + 9000)).status).toBe(200); // and the organizer still can
    expect((await readPublished(kv(), "HM-C"))!.messages.length).toBe(2);
  });
  test("the press is checked against this game's own breaks: during a break it is refused; in an auto-mode game it is refused outright", async () => {
    const o = await organizer();
    await make(o, "HM-B", { callMode: "host", callSeconds: 6, breaks: [{ after: 1, seconds: 30, kind: "speech", title: "Hello all" }] }); await publish(o, "HM-B"); raw.prepare("UPDATE engagement SET pack=100 WHERE id='HM-B'").run();
    await call("PUT", "/api/z/HM-B/control/key", { publicKey: publicKeyFromSecret(ORG) }, o.h);
    expect((await post("HM-B", await signed("HM-B", ORG, during, { action: "next" }), during)).status).toBe(200);
    const inBreak = await post("HM-B", await signed("HM-B", ORG, during + 12_000, { action: "next" }), during + 12_000);
    expect(inBreak.status).toBe(422); expect(inBreak.body.error).toBe(NEXT_REFUSALS.gap);
    expect((await post("HM-B", await signed("HM-B", ORG, during + 40_000, { action: "next" }), during + 40_000)).status).toBe(200);
    await make(o, "HM-A", { callSeconds: 6 }); await publish(o, "HM-A"); raw.prepare("UPDATE engagement SET pack=100 WHERE id='HM-A'").run();
    await call("PUT", "/api/z/HM-A/control/key", { publicKey: publicKeyFromSecret(ORG) }, o.h);
    const auto = await post("HM-A", await signed("HM-A", ORG, during, { action: "next" }), during);
    expect(auto.status).toBe(422); expect(auto.body.error).toBe(NEXT_REFUSALS.auto);
  });
});
