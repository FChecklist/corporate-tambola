// V2 item 6: a game key (ctg_) belongs to ONE game and stops 24 hours after that game ends. While the game is on it is a master for that game only; after the game it may only delete data, download data,
// fetch the invoice, and make a new game cloned from it. Everything else is refused with a clear message. The organizer's own sign-in key (ctk_) is not changed.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HOUR, T, W, call, create, j, keyH, one, paidGame, q, reset, restore, uid } from "./param-harness";

beforeEach(() => reset());
afterEach(restore);

const H24 = 24 * HOUR;
const endGame = (id: string, at: number) => W.raw.prepare("INSERT INTO life(eid,end_ms,end_src) VALUES(?,?,'phones') ON CONFLICT(eid) DO UPDATE SET end_ms=excluded.end_ms, end_src='phones'").run(id, at);
async function gameKey(g: { key: string; id: string }, over: Record<string, unknown> = {}) {
  const r = await call("POST", `/api/z/${g.id}/v2/keys`, over, keyH(g.key));
  const b = await j(r); expect(r.status).toBe(200); expect(b.key).toMatch(/^ctg_[0-9a-f]{48}$/);
  return b.key as string;
}

describe("a game key works for its own game only", () => {
  test("the organizer makes one; it is shown once; it reads and changes its own game", async () => {
    const g = await paidGame();
    const k = await gameKey(g, { label: "Neha's helper" });
    const who = await j(await call("GET", "/api/whoami", undefined, keyH(k)));
    expect(who).toMatchObject({ kind: "master", gameKey: true, game: g.id, over: false, expiresMs: null });
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(k))).status).toBe(200);
    expect((await call("PATCH", `/api/z/${g.id}/settings`, { occasion: "Spring Party" }, keyH(k))).status).toBeLessThan(400);
    const list = await j(await call("GET", `/api/z/${g.id}/v2/keys`, undefined, keyH(g.key)));
    expect(list.keys.length).toBe(1); expect(list.keys[0]).toMatchObject({ label: "Neha's helper", kind: "master", retired: false });
    expect(JSON.stringify(list)).not.toContain(k); // only the organizer's console sees the key once, never again
    expect(one("SELECT COUNT(*) AS n FROM organizer_key WHERE hash=?", k).n).toBe(0); // and the server keeps only a hash of it
  });
  test("it also works with Authorization: Bearer", async () => {
    const g = await paidGame(); const k = await gameKey(g);
    const r = await call("GET", `/api/z/${g.id}/summary`, undefined, { authorization: "Bearer " + k });
    expect(r.status).toBe(200);
  });
  test("another game, the account, the team, keys and payments are refused with a clear message", async () => {
    const g = await paidGame(); const other = uid(); expect((await create(g.key, other)).status).toBe(200);
    const k = await gameKey(g);
    const r1 = await call("GET", `/api/z/${other}/summary`, undefined, keyH(k)); expect(r1.status).toBe(403);
    expect(await j(r1)).toMatchObject({ code: "key-scope" });
    for (const [m, p] of [["GET", "/api/org/games"], ["GET", "/api/org/team"], ["POST", "/api/org/host"], ["POST", "/api/checkout"], ["GET", "/api/org/v2/receipts"], ["POST", "/api/z"]] as const) {
      const r = await call(m, p, m === "POST" ? {} : undefined, keyH(k));
      expect([403]).toContain(r.status); expect((await j(r)).code).toBe("key-scope");
    }
  });
  test("a game key cannot make or retire game keys (only the organizer's own key can)", async () => {
    const g = await paidGame(); const k = await gameKey(g);
    const r = await call("POST", `/api/z/${g.id}/v2/keys`, {}, keyH(k)); expect(r.status).toBe(403);
    expect((await j(r)).code).toBe("not-allowed");
    const r2 = await call("POST", `/api/z/${g.id}/v2/keys/revoke`, { id: "0".repeat(10) }, keyH(k)); expect(r2.status).toBe(403);
  });
  test("at most five at a time; retiring one makes room, and a retired key stops at once", async () => {
    const g = await paidGame(); const ks: string[] = [];
    for (let i = 0; i < 5; i++) ks.push(await gameKey(g));
    const sixth = await call("POST", `/api/z/${g.id}/v2/keys`, {}, keyH(g.key)); expect(sixth.status).toBe(409); expect((await j(sixth)).code).toBe("too-many");
    const list = await j(await call("GET", `/api/z/${g.id}/v2/keys`, undefined, keyH(g.key)));
    expect((await call("POST", `/api/z/${g.id}/v2/keys/revoke`, { id: list.keys[0].id }, keyH(g.key))).status).toBe(200);
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(ks[0]!))).status).toBeGreaterThanOrEqual(401); // as any unknown key: refused
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(ks[1]!))).status).toBe(200);
    expect((await call("POST", `/api/z/${g.id}/v2/keys`, {}, keyH(g.key))).status).toBe(200);
  });
  test("a stranger's organizer key cannot make a key for this game", async () => {
    const g = await paidGame(); const h = await paidGame();
    expect((await call("POST", `/api/z/${g.id}/v2/keys`, {}, keyH(h.key))).status).toBe(403);
  });
});

describe("after the game: delete, download, invoice, clone, and nothing else; gone 24 hours after the end", () => {
  test("a game master key keeps four things after the end", async () => {
    const g = await paidGame(); const k = await gameKey(g);
    const end = T + HOUR; endGame(g.id, end);
    const now = end + 2 * HOUR;
    const who = await j(await call("GET", "/api/whoami", undefined, keyH(k), now));
    expect(who).toMatchObject({ gameKey: true, over: true, expiresMs: end + H24 });
    // refused, with the plain message
    for (const [m, p, body] of [["GET", `/api/z/${g.id}/summary`], ["GET", `/api/z/${g.id}/participants`], ["PATCH", `/api/z/${g.id}/settings`, { occasion: "x" }], ["POST", `/api/z/${g.id}/publish`, {}], ["POST", `/api/z/${g.id}/announce`, { text: "hi" }]] as const) {
      const r = await call(m, p, body, keyH(k), now); expect(r.status).toBe(403);
      const b = await j(r); expect(b.code).toBe("game-over"); expect(b.error).toMatch(/only delete the game's data, download it, fetch the invoice, or make a new game like it/);
    }
    // allowed: download (results and export), the invoice, delete
    expect((await call("GET", `/api/z/${g.id}/results`, undefined, keyH(k), now)).status).not.toBe(403);
    const ex = await call("GET", `/api/z/${g.id}/v2/export?part=results`, undefined, keyH(k), now); expect(ex.status).toBe(200);
    const rc = await call("GET", `/api/z/${g.id}/v2/receipts`, undefined, keyH(k), now); expect(rc.status).toBe(200);
    expect((await call("GET", `/api/z/${g.id}/v2/status`, undefined, keyH(k), now)).status).toBe(200);
    const inv = await j(rc); expect(JSON.stringify(inv)).toContain("IT SERVICES BY RAJAT AGARWAL");
    const er = await call("POST", `/api/z/${g.id}/erase`, {}, keyH(k), now); expect(er.status).toBe(200);
  });
  test("the account key is not narrowed: the organizer can still see the game after the end", async () => {
    const g = await paidGame(); endGame(g.id, T + HOUR);
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(g.key), T + 3 * HOUR)).status).toBe(200);
  });
  test("clone through a game key makes a new game and a NEW key for it; the old game is untouched", async () => {
    const g = await paidGame(); const k = await gameKey(g); endGame(g.id, T + HOUR);
    const now = T + 2 * HOUR;
    const r = await call("POST", `/api/z/${g.id}/clone`, {}, keyH(k), now); const b = await j(r);
    expect(r.status).toBe(200); expect(b.id).toBeTruthy(); expect(b.gameKey).toMatch(/^ctg_/); expect(b.gameKey).not.toBe(k);
    // the new key belongs to the new game only
    expect((await call("GET", `/api/z/${b.id}/summary`, undefined, keyH(b.gameKey), now)).status).toBe(200);
    expect((await call("GET", `/api/z/${g.id}/results`, undefined, keyH(b.gameKey), now)).status).toBe(403);
    // the old key still cannot touch the new game
    expect((await call("GET", `/api/z/${b.id}/summary`, undefined, keyH(k), now)).status).toBe(403);
    const row = one("SELECT scope_eid, scope_src FROM organizer_key WHERE scope_eid=?", b.id); expect(row.scope_src).toBe(g.id);
  });
  test("a key made for an AI cannot make a new game: that is the organizer's to do", async () => {
    const g = await paidGame(); const k = await gameKey(g, { ai: true, label: "ChatGPT" }); endGame(g.id, T + HOUR);
    const r = await call("POST", `/api/z/${g.id}/clone`, {}, keyH(k), T + 2 * HOUR); expect(r.status).toBe(403);
    expect((await j(r)).error).toMatch(/organizer/i);
    expect(q("SELECT 1 FROM organizer_key WHERE scope_eid<>? AND scope_eid IS NOT NULL", g.id).length).toBe(0);
  });
  test("24 hours after the end the key is expired (401, with a plain message)", async () => {
    const g = await paidGame(); const k = await gameKey(g); const end = T + HOUR; endGame(g.id, end);
    const justBefore = await call("GET", `/api/z/${g.id}/results`, undefined, keyH(k), end + H24 - 1000); expect(justBefore.status).not.toBe(401);
    const r = await call("GET", `/api/z/${g.id}/results`, undefined, keyH(k), end + H24); expect(r.status).toBe(401);
    const b = await j(r); expect(b.code).toBe("key-expired"); expect(b.error).toMatch(/expired/);
    for (const p of [`/api/z/${g.id}/summary`, "/api/whoami", `/api/z/${g.id}/v2/export`]) expect((await call("GET", p, undefined, keyH(k), end + H24 + HOUR)).status).toBe(401);
    expect((await call("POST", `/api/z/${g.id}/clone`, {}, keyH(k), end + H24 + HOUR)).status).toBe(401);
  });
  test("no new key is made for a game that is over", async () => {
    const g = await paidGame(); endGame(g.id, T + HOUR);
    const r = await call("POST", `/api/z/${g.id}/v2/keys`, {}, keyH(g.key), T + 2 * HOUR); expect(r.status).toBe(409); expect((await j(r)).code).toBe("game-over");
  });
  test("a cancelled game counts as ended when it was cancelled", async () => {
    const g = await paidGame(); const k = await gameKey(g);
    W.raw.prepare("UPDATE engagement SET cancelled_ms=? WHERE id=?").run(T + HOUR, g.id);
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(k), T + 2 * HOUR)).status).toBe(403);
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(k), T + HOUR + H24)).status).toBe(401);
  });
  test("a game that was deleted entirely: its keys report expired", async () => {
    const g = await paidGame(); const k = await gameKey(g);
    W.raw.prepare("DELETE FROM engagement WHERE id=?").run(g.id);
    expect((await call("GET", `/api/z/${g.id}/summary`, undefined, keyH(k))).status).toBe(401);
  });
});

describe("a game key for an AI never reaches people lists", () => {
  test("roster, people, names and forget are refused for an AI game key, allowed for a person's", async () => {
    const g = await paidGame(); const ai = await gameKey(g, { ai: true, label: "ChatGPT" }); const mk = await gameKey(g);
    for (const a of ["roster", "people", "waiting", "names"]) {
      const r = await call("GET", `/api/z/${g.id}/${a}`, undefined, keyH(ai)); expect(r.status).toBe(403); expect((await j(r)).code).toBe("ai-people");
      expect((await j(await call("GET", `/api/z/${g.id}/${a}`, undefined, keyH(mk)))).code).not.toBe("ai-people");
    }
  });
  test("reuse brings people only from the game the key's game was made from", async () => {
    const g = await paidGame(); const other = await paidGame();
    const k = await gameKey(g);
    const r = await call("POST", `/api/z/${g.id}/reuse`, { from: other.id }, keyH(k)); expect(r.status).toBe(403); expect((await j(r)).code).toBe("key-scope");
    const r0 = await call("POST", `/api/z/${g.id}/reuse`, {}, keyH(k)); expect(r0.status).toBe(403);
    expect(q("SELECT 1 FROM organizer_key WHERE scope_eid=?", g.id).length).toBe(1);
  });
});
