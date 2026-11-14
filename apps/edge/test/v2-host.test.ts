// V2 items 7 and 11: a Host key made without personal data (limited, expires with the game), a Host who steps down, and a hand-over that happens only when the organizer approves.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HOUR, T, W, call, j, keyH, mails, one, paidGame, q, reset, restore, uid, create } from "./param-harness";

beforeEach(() => reset());
afterEach(restore);

const H24 = 24 * HOUR;
const endGame = (id: string, at: number) => W.raw.prepare("INSERT INTO life(eid,end_ms,end_src) VALUES(?,?,'phones') ON CONFLICT(eid) DO UPDATE SET end_ms=excluded.end_ms, end_src='phones'").run(id, at);
async function labelHost(g: { key: string; id: string }, label = "Priya") {
  const r = await call("POST", `/api/z/${g.id}/v2/host`, { label }, keyH(g.key)); const b = await j(r);
  expect(r.status).toBe(200); expect(b.hostKey).toMatch(/^cth_[0-9a-f]{48}$/); return b as { hostKey: string; id: string; link: string };
}

describe("item 7: a Host key without personal data", () => {
  test("made with only a label: no e-mail, no mobile, nobody to confirm; ready to use at once", async () => {
    const g = await paidGame(); const h = await labelHost(g);
    expect(h.link).toContain(`/zc.html?k=${h.hostKey}&e=${g.id}`);
    const row = one("SELECT * FROM organizer_key WHERE scope_eid=?", g.id);
    expect(row).toMatchObject({ kind: "host", scope_kind: "lh", label: "Priya" }); expect(row.email_sealed).toBeNull(); expect(row.pii).toBeNull();
    const st = one("SELECT * FROM host_state WHERE host_id=?", row.hash); expect(st.email_hash).toBeNull(); expect(st.pend_sealed).toBeNull(); expect(st.mobile_ok).toBe(1);
    const who = await j(await call("GET", "/api/whoami", undefined, keyH(h.hostKey)));
    expect(who).toMatchObject({ kind: "host", gameKey: true, game: g.id });
    expect(JSON.stringify(row)).not.toMatch(/@|\b[6-9]\d{9}\b/);
  });
  test("limited rights: it watches, tells everyone and hands over prizes; it cannot pay, cancel, erase, clone, publish or see the team", async () => {
    const g = await paidGame(); const h = (await labelHost(g)).hostKey;
    for (const p of ["summary", "participants", "results", "info", "prizes"]) expect((await call("GET", `/api/z/${g.id}/${p}`, undefined, keyH(h))).status).toBe(200);
    expect((await call("POST", `/api/z/${g.id}/announce`, { text: "Please join in!" }, keyH(h))).status).toBeLessThan(400);
    for (const [m, p] of [["POST", "erase"], ["POST", "clone"], ["POST", "publish"], ["PATCH", "settings"], ["POST", "cancel"], ["POST", "reuse"]] as const) {
      const r = await call(m, `/api/z/${g.id}/${p}`, {}, keyH(h)); expect(r.status).toBe(403); expect((await j(r)).code).toBe("host-limited");
    }
    for (const [m, p] of [["GET", "/api/org/games"], ["GET", "/api/org/team"], ["POST", "/api/checkout"], ["POST", "/api/org/host"]] as const) expect((await call(m, p, m === "POST" ? {} : undefined, keyH(h))).status).toBe(403);
    expect((await call("POST", `/api/z/${g.id}/v2/keys`, {}, keyH(h))).status).toBe(403); // cannot make keys
    expect((await call("POST", `/api/z/${g.id}/v2/host`, {}, keyH(h))).status).toBe(403); // cannot make another Host
  });
  test("it is for one game only", async () => {
    const g = await paidGame(); const other = uid(); await create(g.key, other); const h = (await labelHost(g)).hostKey;
    const r = await call("GET", `/api/z/${other}/summary`, undefined, keyH(h)); expect(r.status).toBe(403); expect((await j(r)).code).toBe("key-scope");
  });
  test("it stops 24 hours after the game ends", async () => {
    const g = await paidGame(); const h = (await labelHost(g)).hostKey; const end = T + HOUR; endGame(g.id, end);
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(h), end + 2 * HOUR)).status).toBe(200); // a Host key keeps its Host job until it expires
    const r = await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(h), end + H24); expect(r.status).toBe(401); expect((await j(r)).code).toBe("key-expired");
  });
  test("only the organizer (or their game key) makes one; an AI, a Host, a co-host or a stranger cannot", async () => {
    const g = await paidGame(); const h = await labelHost(g); const stranger = await paidGame();
    for (const k of [g.ai, h.hostKey, stranger.key]) expect([401, 403]).toContain((await call("POST", `/api/z/${g.id}/v2/host`, {}, keyH(k))).status);
    const gk = (await j(await call("POST", `/api/z/${g.id}/v2/keys`, {}, keyH(g.key)))).key as string;
    expect((await call("POST", `/api/z/${g.id}/v2/host`, { label: "via game key" }, keyH(gk))).status).toBe(200);
    const aik = (await j(await call("POST", `/api/z/${g.id}/v2/keys`, { ai: true }, keyH(g.key)))).key as string;
    expect((await call("POST", `/api/z/${g.id}/v2/host`, {}, keyH(aik))).status).toBe(403); // an AI game key cannot make a Host
  });
  test("up to five at a time, and none for a game that is over", async () => {
    const g = await paidGame();
    for (let i = 0; i < 5; i++) await labelHost(g, "H" + i);
    const r = await call("POST", `/api/z/${g.id}/v2/host`, {}, keyH(g.key)); expect(r.status).toBe(409); expect((await j(r)).code).toBe("too-many");
    // the game-only keys never use up the account's five Host places, and an old game's keys never block a new game
    const o = await call("GET", "/api/org/team", undefined, keyH(g.key)); expect(o.status).toBeLessThan(500);
    const g3 = await paidGame(); expect((await call("POST", `/api/z/${g3.id}/v2/host`, {}, keyH(g3.key))).status).toBe(200);
    const g2 = await paidGame(); endGame(g2.id, T + HOUR);
    const r2 = await call("POST", `/api/z/${g2.id}/v2/host`, {}, keyH(g2.key), T + 2 * HOUR); expect(r2.status).toBe(409); expect((await j(r2)).code).toBe("game-over");
  });
  test("the label is cleaned (no markup, short)", async () => {
    const g = await paidGame(); const b = await j(await call("POST", `/api/z/${g.id}/v2/host`, { label: "<b>Priya</b>".repeat(20) }, keyH(g.key)));
    expect(String(b.label).length).toBeLessThanOrEqual(40); expect(b.label).not.toContain("<");
  });
});

describe("item 11: a Host steps down", () => {
  test("their key stops at once and the organizer is told (screen notice and e-mail)", async () => {
    const g = await paidGame(); const h = await labelHost(g, "Priya");
    const r = await call("POST", `/api/z/${g.id}/v2/host/stepdown`, {}, keyH(h.hostKey)); expect(r.status).toBe(200);
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(h.hostKey))).status).toBeGreaterThanOrEqual(401);
    const n = await j(await call("GET", "/api/org/v2/notices", undefined, keyH(g.key)));
    expect(n.notices.length).toBe(1); expect(n.notices[0]).toMatchObject({ game: g.id, kind: "stepdown" }); expect(n.notices[0].text).toContain("Priya");
    expect(mails().some((m: any) => /stepped down/.test(m.subject))).toBe(true);
  });
  test("an organizer cannot 'step down'; a stranger's Host cannot step down for another account", async () => {
    const g = await paidGame(); const o = await paidGame(); const ho = await labelHost(o);
    expect((await call("POST", `/api/z/${g.id}/v2/host/stepdown`, {}, keyH(g.key))).status).toBe(403);
    expect((await call("POST", `/api/z/${g.id}/v2/host/stepdown`, {}, keyH(ho.hostKey))).status).toBe(403);
    expect(one("SELECT revoked FROM organizer_key WHERE scope_eid=?", o.id).revoked).toBe(0);
  });
  test("the organizer's notices are private to the organizer", async () => {
    const g = await paidGame(); const h = await labelHost(g); await call("POST", `/api/z/${g.id}/v2/host/stepdown`, {}, keyH(h.hostKey));
    expect((await call("GET", "/api/org/v2/notices", undefined, keyH(h.hostKey))).status).toBe(403);
    const stranger = await paidGame(); expect((await j(await call("GET", "/api/org/v2/notices", undefined, keyH(stranger.key)))).notices).toEqual([]);
  });
});

describe("item 11: a hand-over happens only when the organizer approves", () => {
  test("the Host asks, keeps working meanwhile; the organizer approves; the old key stops and a new limited key is shown once", async () => {
    const g = await paidGame(); const h = await labelHost(g, "Priya");
    const ask = await call("POST", `/api/z/${g.id}/v2/host/handover`, { note: "I have a meeting" }, keyH(h.hostKey)); expect(ask.status).toBe(200); expect((await j(ask)).state).toBe("pending");
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(h.hostKey))).status).toBe(200); // still the Host during a live game
    expect((await call("POST", `/api/z/${g.id}/v2/host/handover`, {}, keyH(h.hostKey))).status).toBe(409); // not twice
    const list = await j(await call("GET", `/api/z/${g.id}/v2/host/requests`, undefined, keyH(g.key)));
    expect(list.requests.length).toBe(1); expect(list.requests[0]).toMatchObject({ host: "Priya", note: "I have a meeting", state: "pending" });
    expect(list.notices.some((n: any) => n.kind === "handover")).toBe(true);
    // the Host cannot decide for themselves, and a Host sees only their own request
    expect((await call("POST", `/api/z/${g.id}/v2/host/requests/${list.requests[0].id}`, { approve: true }, keyH(h.hostKey))).status).toBe(403);
    const own = await j(await call("GET", `/api/z/${g.id}/v2/host/requests`, undefined, keyH(h.hostKey))); expect(own.requests.length).toBe(1); expect(own.notices).toEqual([]);
    const ok = await call("POST", `/api/z/${g.id}/v2/host/requests/${list.requests[0].id}`, { approve: true, label: "Ravi" }, keyH(g.key)); const b = await j(ok);
    expect(ok.status).toBe(200); expect(b.state).toBe("approved"); expect(b.hostKey).toMatch(/^cth_/); expect(b.hostKey).not.toBe(h.hostKey);
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(h.hostKey))).status).toBeGreaterThanOrEqual(401);
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(b.hostKey))).status).toBe(200);
    expect((await call("POST", `/api/z/${g.id}/erase`, {}, keyH(b.hostKey))).status).toBe(403);
    expect((await call("POST", `/api/z/${g.id}/v2/host/requests/${list.requests[0].id}`, { approve: true }, keyH(g.key))).status).toBe(409); // decided once
  });
  test("declined: the Host keeps their key", async () => {
    const g = await paidGame(); const h = await labelHost(g);
    await call("POST", `/api/z/${g.id}/v2/host/handover`, {}, keyH(h.hostKey));
    const id = (await j(await call("GET", `/api/z/${g.id}/v2/host/requests`, undefined, keyH(g.key)))).requests[0].id;
    const r = await call("POST", `/api/z/${g.id}/v2/host/requests/${id}`, { approve: false }, keyH(g.key)); expect((await j(r)).state).toBe("declined");
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(h.hostKey))).status).toBe(200);
  });
  test("after the game ended there is nothing to hand over", async () => {
    const g = await paidGame(); const h = await labelHost(g); await call("POST", `/api/z/${g.id}/v2/host/handover`, {}, keyH(h.hostKey));
    const id = (await j(await call("GET", `/api/z/${g.id}/v2/host/requests`, undefined, keyH(g.key)))).requests[0].id;
    endGame(g.id, T + HOUR);
    const r = await call("POST", `/api/z/${g.id}/v2/host/requests/${id}`, { approve: true }, keyH(g.key), T + 2 * HOUR); expect(r.status).toBe(409); expect((await j(r)).code).toBe("game-over");
  });
  test("the organizer can assign someone else at any time before the end: a new key, then retire the old one by its id", async () => {
    const g = await paidGame(); const h = await labelHost(g, "Priya"); const h2 = await labelHost(g, "Ravi");
    expect(h.hostKey).not.toBe(h2.hostKey);
    const list = await j(await call("GET", `/api/z/${g.id}/v2/keys`, undefined, keyH(g.key)));
    expect(list.keys.filter((k: any) => k.kind === "host").length).toBe(2);
    expect((await call("POST", `/api/z/${g.id}/v2/keys/revoke`, { id: h.id }, keyH(g.key))).status).toBe(200);
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(h.hostKey))).status).toBeGreaterThanOrEqual(401);
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(h2.hostKey))).status).toBe(200);
  });
});
