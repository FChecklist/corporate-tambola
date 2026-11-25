// Game alerts (1.13.0): the server half of "Yes, notify me when this game begins". The notification service is a separate private repository (corporate-push, spec pinned at f1e93f5);
// here it is a stand-in that records every call: globalThis.fetch is wrapped, so no real network is touched. What is proven, each against the real Worker code and the in-memory D1:
//   * DARK: with PUSH_URL or PUSH_ADMIN_KEY missing (or the address not a real https one) not one request is made, nothing is written, and the lifecycle works exactly as before;
//   * ONE alert per game, at the moment it really starts (a manual-start game waits for its Host), with the exact message and the key only in the Authorization header;
//   * the flag on the game row is claimed before sending, so two ticks at the same moment send once; a failed first send is tried again for 10 minutes, then given up; a game that began
//     more than 30 minutes ago is never announced as "begins"; many browsers are sent in pages of the service's own size;
//   * a PURGE goes out whenever the game's participant data is deleted (the organizer's delete, the 20-hour job, a cancelled game, a game nobody paid for, the 365-day clean-up);
//     a purge that fails is written down and tried again, then left to the service's own 24-hour limit;
//   * the admin key never reaches the database, the answers or the log.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DAY, HOUR, MIN, PLAT, T, W, call, create, j, join, one, organizer, paidGame, publish, q, reset, restore, roundAt, roundMs, uid } from "./param-harness";
import { callTimeMs, endBoundMs, eraseEverything, erasePersonal, lifecycleTick } from "../src/lifecycle";
import { ALERT_BODY, ALERT_TITLE, PURGE_RETRY_MS, PUSH_SCHEMA, RETRY_MS, STALE_MS, purgeGameAlerts, pushService, pushTick } from "../src/push";
import { nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";

const BASE = "https://push.test";
const KEY = "test-push-admin-key-" + "q".repeat(24); // a made-up value for the stand-in service only
const DARK = { sent: 0, games: 0, skipped: 0, purgeRetried: 0 };

interface Hit { path: string; method: string; auth: string | null; type: string | null; body: any }
let hits: Hit[] = [];
const okAnswer = (json: unknown = {}) => new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
const refused = (status = 500) => new Response("{}", { status });
/** Puts a stand-in for the notification service in front of whatever fetch the harness installed (the payment gateway stand-in). Every call to BASE is recorded. */
function fakePush(h: { send?: (body: any, n: number) => Response; purge?: (body: any, n: number) => Response } = {}) {
  const inner = globalThis.fetch;
  let nSend = 0, nPurge = 0;
  hits = [];
  (globalThis as any).fetch = async (url: any, init?: any) => {
    const u = String(url);
    if (!u.startsWith(BASE + "/")) return inner(url, init);
    const path = u.slice(BASE.length), headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    hits.push({ path, method: String(init?.method ?? "GET"), auth: headers.get("authorization"), type: headers.get("content-type"), body });
    if (path === "/send") return (h.send ?? (() => okAnswer({ ok: true, sent: 3 })))(body, ++nSend);
    if (path === "/purge") return (h.purge ?? (() => okAnswer({ ok: true, removed: 3 })))(body, ++nPurge);
    return refused(404);
  };
}
/** Switches the feature ON for this test: both settings set. */
const on = (extra: Record<string, unknown> = {}) => { Object.assign(W.env as any, { PUSH_URL: BASE, PUSH_ADMIN_KEY: KEY, ...extra }); };
const sends = () => hits.filter((h) => h.path === "/send");
const purges = () => hits.filter((h) => h.path === "/purge");
const startOf = (e: any) => callTimeMs(W.env as any, e, 1, 0);
const tick = (now: number) => pushTick(W.env as any, now, startOf);
const flag = (id: string): number | null => one("SELECT push_sent_ms AS f FROM engagement WHERE id=?", id).f;
const row = (id: string) => one("SELECT * FROM engagement WHERE id=?", id);
const waitingPurges = () => q("SELECT k, v FROM kv WHERE k LIKE 'pushpurge/%' ORDER BY k");
/** A paid game with three players; `at` is the time of its first number. */
async function started(over: Record<string, unknown> = {}) {
  const g = await paidGame({ cap: 20, over });
  for (let i = 1; i <= 3; i++) expect((await join(g.id, i)).status).toBe(200);
  const at = (await startOf(row(g.id)))!;
  expect(Number.isFinite(at)).toBe(true);
  expect(at).toBeGreaterThan(roundMs(row(g.id).start_round) - 1);
  return { ...g, at };
}

beforeEach(() => { reset(); hits = []; });
afterEach(restore);

describe("the game row has the flag, and the service settings are the one switch", () => {
  test("engagement.push_sent_ms exists, empty for a new game, and the schema line is the migration's", () => {
    expect(q("PRAGMA table_info(engagement)").map((c) => c.name)).toContain("push_sent_ms");
    expect(PUSH_SCHEMA).toEqual(["ALTER TABLE engagement ADD COLUMN push_sent_ms INTEGER"]);
  });
  test("pushService: only a real https address AND a key switch it on; a closing slash is dropped", () => {
    expect(pushService({ PUSH_URL: BASE + "/", PUSH_ADMIN_KEY: KEY })).toEqual({ base: BASE, key: KEY });
    expect(pushService({ PUSH_URL: "https://push.test:8443", PUSH_ADMIN_KEY: KEY })).toEqual({ base: "https://push.test:8443", key: KEY });
    for (const env of [{}, { PUSH_URL: BASE }, { PUSH_ADMIN_KEY: KEY }, { PUSH_URL: BASE, PUSH_ADMIN_KEY: "" }, { PUSH_URL: BASE, PUSH_ADMIN_KEY: "   " }, { PUSH_URL: "", PUSH_ADMIN_KEY: KEY },
      { PUSH_URL: "http://push.test", PUSH_ADMIN_KEY: KEY }, { PUSH_URL: "push.test", PUSH_ADMIN_KEY: KEY }, { PUSH_URL: "https://push", PUSH_ADMIN_KEY: KEY }, { PUSH_URL: "https://push.test/send", PUSH_ADMIN_KEY: KEY },
      { PUSH_URL: "https://push.test/x y", PUSH_ADMIN_KEY: KEY }, { PUSH_URL: "javascript:alert(1)", PUSH_ADMIN_KEY: KEY }]) expect(pushService(env as any)).toBeNull();
  });
});

describe("DARK: nothing is requested, written or changed unless both settings are set", () => {
  for (const [label, extra] of [
    ["neither setting", {}], ["the address only", { PUSH_URL: BASE }], ["the key only", { PUSH_ADMIN_KEY: KEY }], ["an empty key", { PUSH_URL: BASE, PUSH_ADMIN_KEY: "  " }],
    ["an address that is not https", { PUSH_URL: "http://push.test", PUSH_ADMIN_KEY: KEY }], ["an address that is not a real host name", { PUSH_URL: "https://push", PUSH_ADMIN_KEY: KEY }],
  ] as [string, Record<string, unknown>][]) {
    test(`${label}: the tick, the scheduled job and a delete of the game's data make no request and write nothing`, async () => {
      Object.assign(W.env as any, extra);
      fakePush();
      const g = await started();
      expect(await tick(g.at + 1000)).toEqual(DARK);
      const viaJob = await call("POST", "/api/lifecycle/tick", {}, PLAT, g.at + 1000);
      expect(viaJob.status).toBe(200);
      expect(flag(g.id)).toBeNull(); // not even the flag is touched
      expect(await purgeGameAlerts(W.env as any, g.id, g.at)).toBe(true);
      await erasePersonal(W.env as any, g.id, g.at + 2000, "test");
      const erased = await call("POST", `/api/z/${g.id}/erase`, {}, g.h, (await endBoundMs(W.env as any, row(g.id))) + 1000);
      expect(erased.status).toBe(200);
      expect(hits).toEqual([]);
      expect(waitingPurges()).toEqual([]);
    });
  }
});

describe("one alert per game, when the game really starts", () => {
  test("nothing before the first number; at the start exactly one send with the exact message, the key only in Authorization", async () => {
    on(); fakePush();
    const g = await started();
    expect(await tick(roundMs(row(g.id).start_round) - HOUR)).toEqual(DARK);
    expect(await tick(g.at - 1000)).toEqual(DARK); // the game is open but its first number has not come
    expect(hits).toEqual([]); expect(flag(g.id)).toBeNull();
    const r = await tick(g.at + 1000);
    expect(r).toEqual({ sent: 3, games: 1, skipped: 0, purgeRetried: 0 });
    expect(sends()).toHaveLength(1);
    const h = sends()[0]!;
    expect(h.method).toBe("POST"); expect(h.auth).toBe("Bearer " + KEY); expect(h.type).toBe("application/json");
    expect(h.body).toEqual({ scope: "game:" + g.id, kind: "game_begins", title: ALERT_TITLE, body: ALERT_BODY, url: `https://tambola.test/z.html?e=${g.id}` });
    expect(JSON.stringify(h.body)).not.toContain(KEY);
    expect(flag(g.id)).toBe(g.at + 1000);
  });
  test("later ticks (the same second, a minute on, an hour on, the scheduled job) send nothing more: ONE alert per game", async () => {
    on(); fakePush();
    const g = await started();
    await tick(g.at + 1000);
    for (const dt of [1000, 3000, MIN, 9 * MIN, 2 * HOUR]) expect((await tick(g.at + dt)).games).toBe(0);
    expect((await call("POST", "/api/lifecycle/tick", {}, PLAT, g.at + 5 * MIN)).status).toBe(200);
    expect(sends()).toHaveLength(1);
    expect(flag(g.id)).toBe(g.at + 1000);
  });
  test("the scheduled job (POST /api/lifecycle/tick) itself sends the alert: the tick is wired in", async () => {
    on(); fakePush();
    const g = await started();
    expect((await call("POST", "/api/lifecycle/tick", {}, PLAT, g.at + 2000)).status).toBe(200);
    expect(sends()).toHaveLength(1);
    expect(sends()[0]!.body.scope).toBe("game:" + g.id);
    expect(flag(g.id)).toBe(g.at + 2000);
  });
  test("two ticks at the very same moment send once (the flag is claimed before the first send)", async () => {
    on(); fakePush();
    const g = await started();
    const [a, b] = await Promise.all([tick(g.at + 1000), tick(g.at + 1000)]);
    expect(a.games + b.games).toBe(1);
    expect(sends()).toHaveLength(1);
  });
  test("a game that began more than 30 minutes ago is never announced as 'begins': marked as none, nothing sent, nothing later", async () => {
    on(); fakePush();
    const g = await started();
    expect(await tick(g.at + STALE_MS + 1)).toEqual({ sent: 0, games: 0, skipped: 1, purgeRetried: 0 });
    expect(hits).toEqual([]); expect(flag(g.id)).toBe(-1);
    expect(await tick(g.at + STALE_MS + MIN)).toEqual(DARK);
    expect(hits).toEqual([]);
  });
  test("exactly 30 minutes after the first number is still on time", async () => {
    on(); fakePush();
    const g = await started();
    expect((await tick(g.at + STALE_MS)).games).toBe(1);
    expect(sends()).toHaveLength(1);
  });
  test("a link is only ever to this site: with no PUBLIC_ORIGIN, or one that is not https, nothing is sent and the flag stays empty", async () => {
    on(); fakePush();
    const g = await started();
    for (const origin of ["", "http://tambola.test", "tambola.test"]) {
      (W.env as any).PUBLIC_ORIGIN = origin;
      expect(await tick(g.at + 1000)).toEqual(DARK);
    }
    expect(hits).toEqual([]); expect(flag(g.id)).toBeNull();
    (W.env as any).PUBLIC_ORIGIN = "https://tambola.test"; // once it is set the same game is announced
    expect((await tick(g.at + 2000)).games).toBe(1);
  });
  test("a draft nobody paid for, a cancelled game and a game whose data is already deleted get no alert", async () => {
    on(); fakePush();
    const o = await organizer(); const draftId = uid("DR");
    expect((await create(o.key, draftId)).status).toBe(200);
    expect(row(draftId).pack).toBe(0);
    const draftAt = (await startOf(row(draftId)))!;
    const c = await started(); W.raw.prepare("UPDATE engagement SET cancelled_ms=? WHERE id=?").run(c.at - HOUR, c.id);
    const d = await started(); W.raw.prepare("INSERT INTO life(eid,end_ms,end_src,purged_ms) VALUES(?,?, 'purge', ?)").run(d.id, d.at, d.at);
    expect(await tick(Math.max(draftAt, c.at, d.at) + 1000)).toEqual(DARK);
    expect(hits).toEqual([]);
    for (const id of [draftId, c.id, d.id]) expect(flag(id)).toBeNull();
  });
  test("a manual-start game waits for its Host's Start: nothing while it is not started, one alert once it is", async () => {
    on(); fakePush();
    const SECRET = "11".repeat(32), id = uid("MAN"), AT = T + 2 * HOUR;
    const kvr = (): KV => ({ get: async (k) => (one("SELECT v FROM kv WHERE k=?", k) as any)?.v ?? null, put: async () => {} });
    expect((await call("POST", "/api/z", { id, startRound: roundAt(T) + 2400, callSeconds: 12, cap: 100, startMode: "manual" }, PLAT)).status).toBe(200);
    W.raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id);
    expect((await call("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret(SECRET) }, PLAT)).status).toBe(200);
    expect(await startOf(row(id))).toBeNull(); // nobody pressed Start
    expect(await tick(AT + 10 * MIN)).toEqual(DARK); expect(await tick(AT + 5 * HOUR)).toEqual(DARK);
    expect(hits).toEqual([]); expect(flag(id)).toBeNull();
    const goAt = AT + 20 * MIN;
    const msg = signControlWithSecret(SECRET, nextMessage((await readPublished(kvr(), id))!, roundAt(goAt), { action: "go" } as any));
    expect((await call("POST", `/api/z/${id}/control`, { message: msg }, {}, goAt)).status).toBe(200);
    const at = (await startOf(row(id)))!;
    expect(Number.isFinite(at)).toBe(true); expect(at).toBeGreaterThanOrEqual(goAt - 3000); // the first number comes in the round Start named
    expect(await tick(at - 1000)).toEqual(DARK);
    expect((await tick(at + 1000)).games).toBe(1);
    expect(sends()).toHaveLength(1); expect(sends()[0]!.body.scope).toBe("game:" + id);
  });
});

describe("a failed send, and many browsers", () => {
  test("the service refuses the first try: the flag is released, the next tick tries again, and then it is one", async () => {
    on(); fakePush({ send: (_b, n) => (n === 1 ? refused(500) : okAnswer({ ok: true, sent: 5 })) });
    const g = await started();
    expect(await tick(g.at + 1000)).toEqual({ sent: 0, games: 1, skipped: 0, purgeRetried: 0 });
    expect(flag(g.id)).toBeNull();
    expect((await tick(g.at + MIN)).sent).toBe(5);
    expect(flag(g.id)).toBe(g.at + MIN);
    expect((await tick(g.at + 2 * MIN)).games).toBe(0);
    expect(sends()).toHaveLength(2);
  });
  test("the service cannot be reached (the connection is lost): the same, and nothing is thrown out of the tick", async () => {
    on(); fakePush({ send: (_b, n) => { if (n === 1) throw new Error("offline"); return okAnswer({ ok: true, sent: 1 }); } });
    const g = await started();
    await expect(tick(g.at + 1000)).resolves.toMatchObject({ games: 1, sent: 0 });
    expect(flag(g.id)).toBeNull();
    expect((await tick(g.at + 2 * MIN)).sent).toBe(1);
    expect(sends()).toHaveLength(2);
  });
  test("a service that never answers well: tried again for 10 minutes after the start, then given up for good (never a late 'begins')", async () => {
    on(); fakePush({ send: () => refused(503) });
    const g = await started();
    await tick(g.at + RETRY_MS);
    expect(flag(g.id)).toBeNull(); expect(sends()).toHaveLength(1);
    await tick(g.at + RETRY_MS + 1);
    expect(flag(g.id)).toBe(-1); expect(sends()).toHaveLength(2);
    await tick(g.at + RETRY_MS + MIN); await tick(g.at + HOUR);
    expect(sends()).toHaveLength(2);
  });
  test("more browsers than one call holds: the service's next_after_id is followed, page after page, and each page is sent once", async () => {
    on(); fakePush({ send: (_b, n) => (n === 1 ? okAnswer({ ok: true, sent: 40, next_after_id: "c-40" }) : n === 2 ? okAnswer({ ok: true, sent: 40, next_after_id: "c-80" }) : okAnswer({ ok: true, sent: 7 })) });
    const g = await started();
    expect(await tick(g.at + 1000)).toEqual({ sent: 87, games: 1, skipped: 0, purgeRetried: 0 });
    expect(sends().map((h) => h.body.after_id)).toEqual([undefined, "c-40", "c-80"]);
    for (const h of sends()) { expect(h.body.scope).toBe("game:" + g.id); expect(h.body.kind).toBe("game_begins"); }
    await tick(g.at + MIN); expect(sends()).toHaveLength(3);
  });
  test("a service that always says there is more: stops at 20 pages, and the next tick does not start again", async () => {
    on(); fakePush({ send: (_b, n) => okAnswer({ ok: true, sent: 40, next_after_id: n * 40 }) });
    const g = await started();
    expect((await tick(g.at + 1000)).sent).toBe(800);
    expect(sends()).toHaveLength(20);
    await tick(g.at + MIN); expect(sends()).toHaveLength(20);
  });
  test("page 2 fails: the first page is NOT sent again (some browsers already have the alert), and the game is not announced twice", async () => {
    on(); fakePush({ send: (_b, n) => (n === 1 ? okAnswer({ ok: true, sent: 40, next_after_id: "c-40" }) : refused(500)) });
    const g = await started();
    expect((await tick(g.at + 1000)).sent).toBe(40);
    await tick(g.at + 2 * MIN);
    expect(sends()).toHaveLength(2);
    expect(flag(g.id)).toBe(g.at + 1000);
  });
});

describe("a purge goes out whenever the game's participant data is deleted", () => {
  const expectPurge = (id: string, n = 1) => {
    expect(purges()).toHaveLength(n);
    for (const h of purges()) { expect(h.method).toBe("POST"); expect(h.auth).toBe("Bearer " + KEY); expect(h.body).toEqual({ scope: "game:" + id }); }
  };
  test("erasePersonal itself (every deletion path goes through it): one purge with the exact scope; nothing written when the service says yes", async () => {
    on(); fakePush();
    const g = await started();
    await erasePersonal(W.env as any, g.id, g.at, "test");
    expectPurge(g.id);
    expect(waitingPurges()).toEqual([]);
  });
  test("the organizer's own delete (POST /api/z/<id>/erase): the players' data goes and the service is told, once", async () => {
    on(); fakePush();
    const g = await started();
    const now = (await endBoundMs(W.env as any, row(g.id))) + 1000;
    const r = await call("POST", `/api/z/${g.id}/erase`, {}, g.h, now);
    expect(r.status).toBe(200);
    const body = await j(r);
    expect(body.erased).toBe(3);
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(one("SELECT COUNT(*) AS n FROM participant WHERE eid=?", g.id).n).toBe(0);
    expectPurge(g.id);
  });
  test("a game still being played refuses the delete, and then NO purge goes out (the alerts stay until the data really goes)", async () => {
    on(); fakePush();
    const g = await started();
    const r = await call("POST", `/api/z/${g.id}/erase`, {}, g.h, g.at + 5 * MIN);
    expect(r.status).toBe(409);
    expect(purges()).toEqual([]);
    expect(one("SELECT COUNT(*) AS n FROM participant WHERE eid=?", g.id).n).toBe(3);
  });
  test("the 20-hour job: nothing before it, one purge when the players' data is deleted, and none again afterwards", async () => {
    on(); fakePush();
    const g = await started();
    const end = await endBoundMs(W.env as any, row(g.id));
    await lifecycleTick(W.env as any, end + 5 * MIN);
    expect(purges()).toEqual([]);
    await lifecycleTick(W.env as any, end + 21 * HOUR);
    expect(one("SELECT COUNT(*) AS n FROM participant WHERE eid=?", g.id).n).toBe(0);
    expectPurge(g.id);
    await lifecycleTick(W.env as any, end + 22 * HOUR);
    expect(purges()).toHaveLength(1);
  });
  test("a cancelled game: 20 hours after the cancel, the players' data and the alerts go together", async () => {
    on(); fakePush();
    const g = await started();
    expect((await call("POST", `/api/z/${g.id}/cancel`, { confirmations: 3 }, g.h)).status).toBe(200);
    await lifecycleTick(W.env as any, T + 20 * HOUR - MIN); expect(purges()).toEqual([]);
    await lifecycleTick(W.env as any, T + 20 * HOUR + MIN);
    expect(one("SELECT COUNT(*) AS n FROM participant WHERE eid=?", g.id).n).toBe(0);
    expectPurge(g.id);
  });
  test("a game nobody paid for that never started: its guests and its alerts go 20 hours after it was meant to end", async () => {
    on(); fakePush();
    const o = await organizer(); const id = uid();
    await create(o.key, id, { cap: 100 }); await publish(o.key, id); await join(id, 1);
    const end = await endBoundMs(W.env as any, row(id));
    await lifecycleTick(W.env as any, end + 20 * HOUR - 5 * MIN); expect(purges()).toEqual([]);
    await lifecycleTick(W.env as any, end + 20 * HOUR + 5 * MIN);
    expect(one("SELECT COUNT(*) AS n FROM participant WHERE eid=?", id).n).toBe(0);
    expectPurge(id);
  });
  test("the 365-day clean-up of the whole game purges too", async () => {
    on(); fakePush();
    const g = await started();
    await eraseEverything(W.env as any, g.id, T + 400 * DAY);
    expect(one("SELECT COUNT(*) AS n FROM engagement WHERE id=?", g.id).n).toBe(0);
    expectPurge(g.id);
  });
  test("an id that could never be a game's is not sent to the service", async () => {
    on(); fakePush();
    expect(await purgeGameAlerts(W.env as any, "bad id/..", T)).toBe(true);
    expect(await purgeGameAlerts(W.env as any, "", T)).toBe(true);
    expect(hits).toEqual([]); expect(waitingPurges()).toEqual([]);
  });
});

describe("a purge the service did not take is written down and tried again", () => {
  test("refused: a row is kept, every tick tries again, the row goes the moment the service says yes, and then it is quiet", async () => {
    on(); fakePush({ purge: () => refused(500) });
    const g = await started();
    expect(await purgeGameAlerts(W.env as any, g.id, T)).toBe(false);
    expect(waitingPurges()).toEqual([{ k: "pushpurge/" + g.id, v: String(T) }]);
    expect(await tick(T + MIN)).toEqual(DARK); // still refused: the row stays
    expect(purges()).toHaveLength(2); expect(waitingPurges()).toHaveLength(1);
    fakePush(); // the service is back
    expect(await tick(T + 2 * MIN)).toEqual({ ...DARK, purgeRetried: 1 });
    expect(purges()).toHaveLength(1); expect(purges()[0]!.body).toEqual({ scope: "game:" + g.id });
    expect(waitingPurges()).toEqual([]);
    await tick(T + 3 * MIN); expect(purges()).toHaveLength(1);
  });
  test("the connection is lost: the same, and erasePersonal still finishes (the players' data is gone whatever the service does)", async () => {
    on(); fakePush({ purge: () => { throw new Error("offline"); } });
    const g = await started();
    await erasePersonal(W.env as any, g.id, T, "test");
    expect(one("SELECT COUNT(*) AS n FROM participant WHERE eid=?", g.id).n).toBe(0);
    expect(waitingPurges()).toHaveLength(1);
  });
  test("after 3 days it is no longer tried (the service's own 24-hour limit ends it), and a row with a bad id is dropped without a request", async () => {
    on(); fakePush();
    W.raw.prepare("INSERT INTO kv(k,v) VALUES(?,?)").run("pushpurge/OLD-GAME", String(T));
    W.raw.prepare("INSERT INTO kv(k,v) VALUES(?,?)").run("pushpurge/bad id!", String(T + PURGE_RETRY_MS));
    expect(await tick(T + PURGE_RETRY_MS + 1)).toEqual(DARK);
    expect(hits).toEqual([]); expect(waitingPurges()).toEqual([]);
  });
  test("a row still inside its 3 days is tried with the exact scope", async () => {
    on(); fakePush();
    W.raw.prepare("INSERT INTO kv(k,v) VALUES(?,?)").run("pushpurge/OLD-GAME", String(T));
    expect(await tick(T + PURGE_RETRY_MS)).toEqual({ ...DARK, purgeRetried: 1 });
    expect(purges()).toHaveLength(1); expect(purges()[0]!.body).toEqual({ scope: "game:OLD-GAME" });
  });
  test("with the service settings removed again the waiting rows are left alone and no request is made (dark means dark)", async () => {
    fakePush();
    W.raw.prepare("INSERT INTO kv(k,v) VALUES(?,?)").run("pushpurge/OLD-GAME", String(T));
    expect(await tick(T + MIN)).toEqual(DARK);
    expect(hits).toEqual([]); expect(waitingPurges()).toHaveLength(1);
  });
});

describe("the admin key stays out of the database, the answers and the log", () => {
  test("a whole game's life with failures on the way: no table, no answer and no log line holds the key", async () => {
    const logged: string[] = [];
    const saved: Record<string, any> = {};
    for (const m of ["log", "info", "warn", "error", "debug"]) { saved[m] = (console as any)[m]; (console as any)[m] = (...a: unknown[]) => { logged.push(a.map((x) => (x instanceof Error ? x.message + (x.stack ?? "") : String(x))).join(" ")); }; }
    try {
      on(); fakePush({ send: (_b, n) => (n === 1 ? refused(500) : okAnswer({ ok: true, sent: 2 })), purge: (_b, n) => { if (n === 1) throw new Error("offline " + BASE); return okAnswer({ ok: true }); } });
      const g = await started();
      const answers: string[] = [];
      await tick(g.at + 1000); await tick(g.at + MIN);
      const now = (await endBoundMs(W.env as any, row(g.id))) + 1000;
      answers.push(JSON.stringify(await j(await call("POST", `/api/z/${g.id}/erase`, {}, g.h, now))));
      answers.push(JSON.stringify(await j(await call("POST", "/api/lifecycle/tick", {}, PLAT, now + MIN))));
      await tick(now + 2 * MIN);
      expect(sends()).toHaveLength(2); expect(purges().length).toBeGreaterThanOrEqual(2);
      for (const h of hits) expect(h.auth).toBe("Bearer " + KEY); // the key is used ...
      for (const h of hits) expect(JSON.stringify(h.body)).not.toContain(KEY); // ... only there
      for (const a of answers) expect(a).not.toContain(KEY);
      for (const t of q("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name as string)) expect([t, JSON.stringify(q(`SELECT * FROM "${t}"`)).includes(KEY)]).toEqual([t, false]);
    } finally { for (const m of Object.keys(saved)) (console as any)[m] = saved[m]; }
    expect(logged.filter((l) => l.includes(KEY))).toEqual([]);
  });
});
