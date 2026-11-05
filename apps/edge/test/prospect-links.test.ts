// One-time prospect links (src/prospect-links.ts): made from the owner's console with their own key, usable once by one account, ended by a date or by the owner's switch.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DAY, HOUR, T, call, create, j, keyH, one, organizer, publish, q, reset, restore, roundAt, startIn, uid } from "./param-harness";

beforeEach(() => reset({ OWNER_LINK_KEY: "lk-test-0123456789" } as any));
afterEach(restore);

const K = { "x-owner-link-key": "lk-test-0123456789" };
const make = async (body: Record<string, unknown> = {}, now = T) => j(await call("POST", "/api/owner/prospect-links", { action: "create", ...body }, K, now));
const list = async (now = T) => (await j(await call("GET", "/api/owner/prospect-links", undefined, K, now))).links as any[];
const tokOf = (link: string) => new URL(link).searchParams.get("pass")!;
const use = async (key: string, link: string, now = T) => call("POST", "/api/pass", { token: tokOf(link) }, keyH(key), now);

describe("who may make and switch links", () => {
  test("only the link key opens it; the platform key, no key, a wrong key and a missing configuration all get the plain 404", async () => {
    for (const h of [{}, { "x-organizer": "plat" }, { "x-owner-link-key": "wrong" }, { "x-owner-stats-key": "lk-test-0123456789" }]) {
      expect((await call("GET", "/api/owner/prospect-links", undefined, h as any)).status).toBe(404);
      expect((await call("POST", "/api/owner/prospect-links", { action: "create" }, h as any)).status).toBe(404);
    }
    expect((await call("GET", "/api/owner/prospect-links", undefined, K)).status).toBe(200);
    reset(); // no OWNER_LINK_KEY configured at all
    expect((await call("GET", "/api/owner/prospect-links", undefined, { "x-owner-link-key": "" })).status).toBe(404);
  });
});

describe("a prospect link", () => {
  test("is made for 100 people and 7 days by default, shows up active, and is clamped to 250 people and 30 days", async () => {
    const a = await make({ label: "Asha at Acme" });
    expect(a.ok).toBe(true); expect(a.cap).toBe(100); expect(a.days).toBe(7);
    expect(a.link).toMatch(/\/zc\.html\?pass=[0-9a-f]{32}$/);
    expect(Date.parse(a.expires) - T).toBe(7 * DAY);
    const l = (await list()).find((x) => x.id === a.id)!;
    expect(l.state).toBe("active"); expect(l.label).toBe("Asha at Acme"); expect(l.link).toBe(a.link);
    const big = await make({ cap: 5000, days: 99 }); expect(big.cap).toBe(250); expect(big.days).toBe(30);
  });
  test("gives the ONE account that opens it ONE free game; another account is told it is taken; the list says used", async () => {
    const link = (await make()).link; const a = await organizer(), b = await organizer();
    const r = await use(a.key, link); expect(r.status).toBe(200); expect(await j(r)).toEqual({ ok: true, cap: 100 });
    const id = uid(); expect((await create(a.key, id, { cap: 100 })).status).toBe(200);
    expect(one("SELECT pack FROM engagement WHERE id=?", id).pack).toBe(100); // a paid, published-able game, nothing bought
    expect((await publish(a.key, id)).status).toBe(200);
    const again = await use(b.key, link); expect(again.status).toBe(409); expect((await j(again)).code).toBe("pass-used");
    expect((await use(a.key, link)).status).toBe(200); // the same account may open it again, nothing more is given
    expect(one("SELECT COUNT(*) AS c FROM entitlement WHERE payment_id='demo-pass'").c).toBe(1);
    expect((await list())[0].state).toBe("used");
  });
  test("a link the owner switches off is refused with a plain sentence, and works again when switched on", async () => {
    const m = await make(); const o = await organizer();
    expect((await j(await call("POST", "/api/owner/prospect-links", { action: "disable", id: m.id }, K))).on).toBe(false);
    expect((await list())[0].state).toBe("off");
    const off = await use(o.key, m.link); expect(off.status).toBe(404); const b = await j(off); expect(b.code).toBe("pass-off"); expect(b.error).toContain("switched off");
    expect(one("SELECT COUNT(*) AS c FROM entitlement WHERE payment_id='demo-pass'").c).toBe(0);
    await call("POST", "/api/owner/prospect-links", { action: "enable", id: m.id }, K);
    expect((await use(o.key, m.link)).status).toBe(200);
  });
  test("a link past its date is refused, the day before it still works", async () => {
    const m = await make({ days: 7 }); const o = await organizer(), p = await organizer();
    const late = await use(o.key, m.link, T + 7 * DAY + 1000); expect(late.status).toBe(404); expect((await j(late)).code).toBe("pass-expired");
    expect((await list(T + 7 * DAY + 1000))[0].state).toBe("expired");
    expect((await use(p.key, m.link, T + 6 * DAY)).status).toBe(200);
  });
  test("a made-up secret is refused like any other unknown link", async () => {
    const o = await organizer(); const r = await call("POST", "/api/pass", { token: "deadbeef00000000deadbeef00000000" }, keyH(o.key));
    expect(r.status).toBe(404); expect((await j(r)).code).toBe("pass-invalid");
  });
  test("the sign-in e-mail path also keeps a prospect link for the person who signs in later", async () => {
    const m = await make();
    const em = `late${Math.floor(Math.random() * 1e6)}@acme.com`;
    const o = await organizer(em);
    const r = await call("POST", "/api/start", { email: em, pass: tokOf(m.link) }, { "cf-connecting-ip": "10.9.9.9" });
    expect([200, 202]).toContain(r.status); // the request is accepted; the held pass is only a gift and never blocks sign-in
    expect(o.key).toBeTruthy();
  });
});

describe("the owner puts a person's free pack on their unpaid game", () => {
  test("applies the unused pack to the held game once, refuses when there is no pack, and the platform key alone cannot do it", async () => {
    const m = await make(); const o = await organizer(), p = await organizer();
    const id = uid(); expect((await create(o.key, id, { cap: 100 })).status).toBe(200); await publish(o.key, id);
    expect(one("SELECT pack FROM engagement WHERE id=?", id).pack).toBe(0);
    const none = await call("POST", "/api/owner/prospect-links", { action: "apply", eid: id }, K); expect(none.status).toBe(409); // no pack yet
    expect((await use(o.key, m.link)).status).toBe(200);
    expect((await call("POST", "/api/owner/prospect-links", { action: "apply", eid: id }, { "x-organizer": "plat" })).status).toBe(404);
    const ok = await call("POST", "/api/owner/prospect-links", { action: "apply", eid: id }, K); expect(ok.status).toBe(200); expect((await j(ok)).pack).toBe(100);
    expect(one("SELECT pack FROM engagement WHERE id=?", id).pack).toBe(100);
    expect(one("SELECT eid FROM entitlement WHERE payment_id='demo-pass'").eid).toBe(id);
    expect((await j(await call("POST", "/api/owner/prospect-links", { action: "apply", eid: id }, K))).again).toBe(true);
    expect((await call("POST", "/api/owner/prospect-links", { action: "apply", eid: "NOSUCHGAME" }, K)).status).toBe(404);
    void p;
  });
});

describe("the owner makes one game free", () => {
  test("a game with no pack at all becomes a paid-up game of its own size, once, with the reason logged; nobody else can do it", async () => {
    const o = await organizer(); const id = uid(); expect((await create(o.key, id, { cap: 250 })).status).toBe(200);
    expect(one("SELECT pack FROM engagement WHERE id=?", id).pack).toBe(0);
    expect((await call("POST", "/api/owner/prospect-links", { action: "free", eid: id }, { "x-organizer": "plat" })).status).toBe(404);
    expect(one("SELECT pack FROM engagement WHERE id=?", id).pack).toBe(0);
    const r = await call("POST", "/api/owner/prospect-links", { action: "free", eid: id, reason: "prospect asked for a demo" }, K); expect(r.status).toBe(200); expect((await j(r)).pack).toBe(250);
    expect(one("SELECT pack FROM engagement WHERE id=?", id).pack).toBe(250);
    expect(one("SELECT eid, pack FROM entitlement WHERE payment_id='owner-free'")).toEqual({ eid: id, pack: 250 });
    expect((await j(await call("POST", "/api/owner/prospect-links", { action: "free", eid: id }, K))).again).toBe(true); // pressing it twice gives nothing twice
    expect(one("SELECT COUNT(*) AS c FROM entitlement WHERE payment_id='owner-free'").c).toBe(1);
    expect(one("SELECT COUNT(*) AS c FROM audit_access WHERE action='owner-free-game'").c).toBe(1);
    expect((await call("POST", "/api/owner/prospect-links", { action: "free", eid: "NOSUCHGAME" }, K)).status).toBe(404);
  });
});

describe("the owner makes the next game for a prospect whose game went badly", () => {
  const PEOPLE = ["Asha", "Ben", "Chitra", "Dev", "Esha", "Farid"].map((name, i) => ({ name, phone: `98765432${10 + i}` }));
  const PRIZES = [{ pattern: "early5", text: "Gift hamper" }, { pattern: "plus", text: "Movie tickets: 2" }, { pattern: "full", text: "Holiday or weekend stay: Andaman" }];
  /** her old game: 100 people, a 9 s gap, list only, named, prize texts, six people on the list */
  const oldGame = async (over: Record<string, unknown> = {}) => {
    const o = await organizer(); const id = uid();
    expect((await create(o.key, id, { cap: 100, callSeconds: 9, name: "KPI Anniversary celebrations!", rewards: PRIZES, whoCanJoin: "list", ...over })).status).toBe(200);
    expect((await publish(o.key, id)).status).toBe(200);
    expect((await call("POST", `/api/z/${id}/people`, { people: PEOPLE }, o.h)).status).toBe(200);
    return { o, id };
  };
  const clone = (body: Record<string, unknown>, now = T) => call("POST", "/api/owner/prospect-links", { action: "clone", ...body }, K, now);
  const START = startIn(20 * HOUR);

  test("only the link key may do it: the platform key, no key and a wrong key get the plain 404 and nothing is made", async () => {
    const { id } = await oldGame();
    for (const h of [{}, { "x-organizer": "plat" }, { "x-owner-link-key": "wrong" }, { "x-owner-stats-key": "lk-test-0123456789" }]) {
      expect((await call("POST", "/api/owner/prospect-links", { action: "clone", from: id, startRound: START }, h as any)).status).toBe(404);
    }
    expect(one("SELECT COUNT(*) AS c FROM engagement").c).toBe(1);
    expect(one("SELECT COUNT(*) AS c FROM entitlement WHERE payment_id='owner-free'").c).toBe(0);
  }, 30_000);

  test("a new draft with the same settings, prizes and people, a 12 s gap, her start time, a free pack waiting; her Publish press then uses the pack; nothing is published for her", async () => {
    const { o, id } = await oldGame(); const before = one("SELECT * FROM engagement WHERE id=?", id);
    const r = await clone({ from: id, startRound: START, reason: "first game went wrong" }); expect(r.status).toBe(200);
    const b = await j(r); expect(b).toMatchObject({ ok: true, from: id, peopleCopied: 6, startRound: START, callSeconds: 12, cap: 100, freePack: 100, published: false, openUrl: `https://tambola.test/zc.html?e=${b.id}` });
    expect(b.id.startsWith(`${id}-`)).toBe(true);
    expect(b.startMs).toBe(T + 20 * HOUR); expect(b.startsAtIST).toBe("Fri, 2 Oct, 11:30 am IST"); // T is 15:30 IST on 1 Oct: +20 h = 11:30 IST on 2 Oct
    const n = one("SELECT * FROM engagement WHERE id=?", b.id);
    expect(n).toMatchObject({ org: before.org, cap: 100, call_seconds: 12, tickets: before.tickets, closed: 1, pack: 0, start_round: START, cancelled_ms: null, unplayed_ms: null });
    expect(JSON.parse(n.config)).toEqual(JSON.parse(before.config));
    expect(JSON.parse(n.config).name).toBe("KPI Anniversary celebrations!");
    expect(JSON.parse(n.config).rewards.map((x: any) => x.text)).toEqual(expect.arrayContaining(["Gift hamper", "Movie tickets: 2", "Holiday or weekend stay: Andaman"]));
    expect(one("SELECT * FROM engagement WHERE id=?", id)).toEqual(before); // the old game is untouched (still 9 s)
    expect(before.call_seconds).toBe(9);
    // her people: six invitations with new personal links, still sealed
    const rows = q("SELECT status, tok_hash, pii FROM person WHERE eid=?", b.id); const old = q("SELECT tok_hash FROM person WHERE eid=?", id).map((x) => x.tok_hash);
    expect(rows).toHaveLength(6); expect(rows.every((x) => x.status === "invited" && !old.includes(x.tok_hash))).toBe(true);
    expect(rows.every((x) => x.pii.startsWith("v1.") && !x.pii.includes("98765432"))).toBe(true); // names and numbers stay sealed (random cipher text can contain a short name by chance, so no name pattern here)
    const list = await j(await call("GET", `/api/z/${b.id}/people`, undefined, o.h));
    expect(list.people.map((x: any) => x.name).sort()).toEqual(PEOPLE.map((x) => x.name).sort());
    expect(list.people.every((x: any) => x.link.startsWith("https://tambola.test/j/") && x.status === "invited")).toBe(true);
    // free pack waiting, game not published, no start pending, no contact, nothing logged as sent
    expect(q("SELECT org, pack, eid FROM entitlement WHERE payment_id='owner-free'")).toEqual([{ org: before.org, pack: 100, eid: null }]);
    expect(one("SELECT COUNT(*) AS c FROM kv WHERE k IN (?,?,?)", `pub/${b.id}`, `contact/${b.id}`, `startpending/${b.id}`).c).toBe(0);
    const s = await j(await call("GET", `/api/z/${b.id}/summary`, undefined, o.h)); expect(s.status).toBe("draft"); expect(s.callSeconds).toBe(12); expect(s.limit).toBe(100);
    expect(one("SELECT note, eid FROM audit_access WHERE action='owner-clone-game'")).toEqual({ eid: id, note: `${b.id}: first game went wrong` });
    // she presses Publish herself: her own e-mail, mobile and Terms box; the waiting free pack goes on the game
    const p = await publish(o.key, b.id); expect(p.status).toBe(200); expect(await j(p)).toMatchObject({ published: true, paid: true });
    expect(one("SELECT pack FROM engagement WHERE id=?", b.id).pack).toBe(100);
    expect(one("SELECT eid FROM entitlement WHERE payment_id='owner-free'").eid).toBe(b.id);
    expect(one("SELECT COUNT(*) AS c FROM kv WHERE k=?", `pub/${b.id}`).c).toBe(1);
    expect(one("SELECT COUNT(*) AS c FROM consent_log WHERE ref=? AND kind='K1'", b.id).c).toBe(1); // the tick is hers, recorded when she pressed Publish
  }, 30_000);

  test("pressing it twice gives the same new game and no second free pack; another source game is its own", async () => {
    const a = await oldGame(), c = await oldGame();
    const first = await j(await clone({ from: a.id, startRound: START })); const two = await j(await clone({ from: a.id, startRound: START }));
    expect(two).toMatchObject({ ok: true, again: true, id: first.id }); expect(two.openUrl).toBe(first.openUrl);
    expect(one("SELECT COUNT(*) AS c FROM engagement WHERE id LIKE ?", `${a.id}-%`).c).toBe(1);
    expect(one("SELECT COUNT(*) AS c FROM entitlement WHERE payment_id='owner-free'").c).toBe(1);
    expect(one("SELECT COUNT(*) AS c FROM person WHERE eid=?", first.id).c).toBe(6);
    const other = await j(await clone({ from: c.id, startRound: START })); expect(other.ok).toBe(true); expect(other.id).not.toBe(first.id);
    expect(one("SELECT COUNT(*) AS c FROM entitlement WHERE payment_id='owner-free'").c).toBe(2);
  }, 30_000);

  test("a refused request leaves nothing behind and does not block the right one: no start, a start in the past, more than 30 days away, a gap the product does not have, an unknown game, a game with no account", async () => {
    const { id } = await oldGame();
    const left = () => [one("SELECT COUNT(*) AS c FROM engagement").c, one("SELECT COUNT(*) AS c FROM entitlement WHERE payment_id='owner-free'").c, one("SELECT COUNT(*) AS c FROM kv WHERE k LIKE 'ownerclone/%'").c];
    expect((await clone({ from: id })).status).toBe(400);
    expect((await clone({ from: id, startRound: "tomorrow" })).status).toBe(400);
    expect((await clone({ from: id, startRound: roundAt(T - HOUR) })).status).toBe(400);
    expect((await clone({ from: id, startRound: roundAt(T + 31 * DAY) })).status).toBe(400);
    expect((await clone({ from: id, startRound: START, callSeconds: 7 })).status).toBe(400);
    expect((await clone({ from: id, startRound: START, callSeconds: "12" })).status).toBe(400);
    expect((await clone({ from: "NOSUCHGAME", startRound: START })).status).toBe(404);
    const plat = uid(); expect((await create(undefined, plat, { cap: 100 })).status).toBe(200); // made with the platform key: no account behind it
    expect((await clone({ from: plat, startRound: START })).status).toBe(404);
    expect(left()).toEqual([2, 0, 0]); // the old game and the platform game only
    const ok = await clone({ from: id, startRound: START }); expect(ok.status).toBe(200);
    expect(left()).toEqual([3, 1, 1]);
  }, 30_000);

  test("the start can be given as a time (what the console sends): 10:30 IST tomorrow lands on the same round, and a time in the past or not a number is refused", async () => {
    const { id } = await oldGame();
    const at = Date.UTC(2026, 9, 2, 5, 0, 0); // 10:30 IST on 2 Oct 2026 (05:00 UTC)
    expect((await clone({ from: id, startMs: T - HOUR })).status).toBe(400);
    expect((await clone({ from: id, startMs: "soon" })).status).toBe(400);
    const b = await j(await clone({ from: id, startMs: at }));
    expect(b.ok).toBe(true); expect(b.startRound).toBe(roundAt(at)); expect(b.startMs).toBe(at); expect(b.startsAtIST).toBe("Fri, 2 Oct, 10:30 am IST");
    expect(one("SELECT start_round FROM engagement WHERE id=?", b.id).start_round).toBe(roundAt(at));
  }, 30_000);

  test("the gap can be named: 9 s is kept when asked for; the copy carries no guests and no payment", async () => {
    const { id } = await oldGame();
    const b = await j(await clone({ from: id, startRound: START, callSeconds: 9 }));
    expect(one("SELECT call_seconds, pack FROM engagement WHERE id=?", b.id)).toEqual({ call_seconds: 9, pack: 0 });
    expect(one("SELECT COUNT(*) AS c FROM participant WHERE eid=?", b.id).c).toBe(0);
    expect(one("SELECT COUNT(*) AS c FROM payment WHERE eid=?", b.id).c).toBe(0);
  }, 30_000);
});
