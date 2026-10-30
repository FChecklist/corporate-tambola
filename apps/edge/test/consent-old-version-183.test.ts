// 1.8.3: the terms version moved (2026-10-15 -> 2026-10-30). Nobody who ALREADY accepted may be locked out because of a version string: a Co-host, a Host, an organizer, a player already in the game,
// payment and rehearsal all keep working with a consent recorded under the OLD version. Only a NEW acceptance sent by a cached page (the old version in the request) gets the "page is out of date, reload" answer.
// FALSIFIED BY: cohost-version-lockout (hasConsent without anyVersion), stale-answer-missing
import { beforeEach, describe, expect, test } from "bun:test";
import { handle, type Env } from "../src/worker";
import { CONSENT_VERSION, STALE_PAGE_MESSAGE, boxesOf, hasConsent, type ConsentKind } from "../src/consent";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 10, 5, 10, 0, 0), GEN = 1692803367; // after APPROVAL_RULES_FROM_MS
const START = Math.floor((T / 1000 - GEN) / 3) + 1200;
const OLD = "2026-10-15";
let env: Env; let raw: ReturnType<typeof makeD1>["raw"]; let ip = 0;
const call = (method: string, path: string, body?: unknown, key?: string, now = T, extra: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.8.${++ip % 200}`, ...(key ? { "x-organizer": key } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const ticks = (k: ConsentKind, v = CONSENT_VERSION) => ({ v, boxes: boxesOf(k) });
const dev = (i: number) => i.toString(16).padStart(4, "0").repeat(8);
const PUB = { email: "boss@acme.com", phone: "98765 43210" };
/** Pretends the acceptance was recorded before the version moved. */
const backdate = (kind: string) => raw.run("UPDATE consent_log SET version=? WHERE kind=?", [OLD, kind]);

beforeEach(() => {
  const d = makeD1({ strictHosts: true }); raw = d.raw; ip = 0;
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt", DATA_KEY: "k", TEST_MODE: "1", FREE_LAUNCH: "1" } as Env;
});
async function organizer(email = "boss@acme.com") { return (await j(await call("POST", "/api/start", { email, consent: ticks("K2") }))).token as string; }
async function game(key: string, id: string) {
  expect((await call("POST", "/api/z", { id, startRound: START, callSeconds: 6, cap: 100 }, key)).status).toBe(200);
  expect((await call("POST", `/api/z/${id}/publish`, { ...PUB, consent: ticks("K1") }, key)).status).toBe(200);
}

describe("accepted before the version moved: nobody is locked out", () => {
  test("a Co-host who accepted the role under the old version still works: people, payment actions, the Co-host view says roleAccepted", async () => {
    const key = await organizer(); await game(key, "OV-1");
    const co = (await j(await call("POST", "/api/org/cohost", { label: "Ravi", phone: "9876500001", e: "OV-1" }, key))).cohostKey as string;
    expect((await call("POST", "/api/org/role/accept", { consent: ticks("K5") }, co)).status).toBe(200);
    backdate("K5"); // the record now carries the OLD version
    expect(await hasConsent(env.DB, (raw.query("SELECT subject FROM consent_log WHERE kind='K5'").get() as any).subject, "K5")).toBe(false); // not the current version...
    expect(await hasConsent(env.DB, (raw.query("SELECT subject FROM consent_log WHERE kind='K5'").get() as any).subject, "K5", true)).toBe(true); // ...but accepted
    const people = await call("GET", "/api/z/OV-1/people", undefined, co); expect(people.status).toBe(200);
    const view = await j(await call("GET", "/api/z/OV-1/cohost", undefined, co)); expect(view.roleAccepted).toBe(true);
    const pay = await call("POST", "/api/checkout", { e: "OV-1", pack: 100, consent: ticks("K3") }, co); expect((await j(pay)).code).not.toBe("consent-required"); // the payment action is not refused for the old record (it may fail for another reason)
    const wait = await call("GET", "/api/z/OV-1/waiting", undefined, co); expect(wait.status).toBe(200);
  });
  test("a Co-host who NEVER accepted is still refused with the plain tick sentence (the box must be shown)", async () => {
    const key = await organizer(); await game(key, "OV-2");
    const co = (await j(await call("POST", "/api/org/cohost", { label: "Ravi", phone: "9876500001", e: "OV-2" }, key))).cohostKey as string;
    const r = await call("GET", "/api/z/OV-2/people", undefined, co); expect(r.status).toBe(400); expect((await j(r)).code).toBe("consent-required");
    expect((await j(await call("GET", "/api/z/OV-2/cohost", undefined, co))).roleAccepted).toBe(false);
  });
  test("a Host whose acceptance carries the old version keeps working (people list); an organizer whose account was made under the old version keeps working", async () => {
    const key = await organizer("old@acme.com"); await game(key, "OV-3");
    const host = (await j(await call("POST", "/api/org/host", { label: "Priya", email: "priya@acme.com" }, key))).hostKey as string;
    expect((await call("POST", "/api/host/setup/email", { email: "priya@acme.com", consent: ticks("K5") }, host)).status).toBe(200);
    backdate("K5"); backdate("K2"); backdate("K1");
    expect((await call("GET", "/api/z/OV-3/people", undefined, key)).status).toBe(200); // the organizer
    expect((await call("GET", "/api/z/OV-3/people", undefined, host)).status).toBe(200); // the Host
    expect((await call("GET", "/api/z/OV-3/info")).status).toBe(200);
    expect((await call("PATCH", "/api/z/OV-3/settings", { name: "Still mine" }, key)).status).toBeLessThan(400); // the organizer still edits
  });
  test("a player already in the game keeps their ticket: a rejoin carries no tick (old record) and is not asked again, even from a cached page that sends the old version", async () => {
    const key = await organizer(); await game(key, "OV-4");
    const body = { phone: "9811100401", name: "Asha", device: dev(1) };
    expect((await call("POST", "/api/z/OV-4/join", { ...body, consent: ticks("K4") })).status).toBe(200);
    backdate("K4");
    const again = await call("POST", "/api/z/OV-4/join", body); expect(again.status).toBe(200); expect((await j(again)).pid).toBeTruthy(); // no consent in the request at all
    const cached = await call("POST", "/api/z/OV-4/join", { ...body, consent: ticks("K4", OLD) }); expect(cached.status).toBe(200); // the cached page sends the old version
  });
  test("a NEW player on a cached page (old version in the request) gets the out-of-date answer, not the tick sentence; with the current version they join", async () => {
    const key = await organizer(); await game(key, "OV-5");
    const r = await call("POST", "/api/z/OV-5/join", { phone: "9811100501", device: dev(2), consent: ticks("K4", OLD) });
    expect(r.status).toBe(400); const b = await j(r); expect(b).toMatchObject({ code: "consent-required", stale: true, error: STALE_PAGE_MESSAGE });
    expect((await call("POST", "/api/z/OV-5/join", { phone: "9811100501", device: dev(2), consent: ticks("K4") })).status).toBe(200);
  });
  test("payment and publish from a cached page: the out-of-date answer (reload), and the current page goes through", async () => {
    const key = await organizer();
    expect((await call("POST", "/api/z", { id: "OV-6", startRound: START, callSeconds: 6, cap: 100 }, key)).status).toBe(200);
    const stale = await call("POST", "/api/z/OV-6/publish", { ...PUB, consent: ticks("K1", OLD) }, key); expect(stale.status).toBe(400); expect((await j(stale)).stale).toBe(true);
    expect((await call("POST", "/api/z/OV-6/publish", { ...PUB, consent: ticks("K1") }, key)).status).toBe(200);
    const pay = await call("POST", "/api/checkout", { e: "OV-6", pack: 100, consent: ticks("K3", OLD) }, key); expect([400, 402, 409]).toContain(pay.status); if (pay.status === 400) expect((await j(pay)).stale ?? (await j(pay)).code).toBeTruthy();
  });
  test("a rehearsal of a game made before the version moved starts for its organizer (no consent is asked on that path)", async () => {
    const key = await organizer(); await game(key, "OV-7"); backdate("K1"); backdate("K2");
    const r = await call("POST", "/api/z/OV-7/rehearsal", { n: 1 }, key); expect(r.status).not.toBe(400); expect((await j(r)).code).not.toBe("consent-required");
  });
});
