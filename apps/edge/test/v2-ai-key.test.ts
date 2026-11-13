// V2 audit round 1 (finding 1 and 3): a game key made for an AI (ga) is exactly as limited as the organizer's own AI key, and a Host key made without personal data (lh) never gets the report link
// or winners' names and numbers. These are the negative tests: every route below must refuse, strip, or show only ticket numbers.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { T, W, call, j, keyH, mob, paidGame, q, reset, restore } from "./param-harness";
import { endGame, gameKey, guests, labelHost, winner } from "./v2-helpers";

beforeEach(() => reset());
afterEach(restore);

const HOUR = 3600_000;
async function setup() {
  const g = await paidGame(); const seats = await guests(g.id, 2);
  const ai = await gameKey(g, { ai: true, label: "ChatGPT" }); const mk = await gameKey(g);
  return { g, seats, ai, mk };
}
const hit = (m: string, id: string, p: string, key: string, body?: unknown, now = T) => call(m, `/api/z/${id}/${p}`, body, keyH(key), now);

describe("a game key for an AI acts as an AI key, not a master", () => {
  test("the report link is never given to it, to read or to replace", async () => {
    const { g, ai, mk } = await setup();
    const get = await hit("GET", g.id, "reportlink", ai); const gb = await j(get);
    expect(gb.url ?? null).toBeNull();
    const salt0 = q("SELECT v FROM kv WHERE k=?", `rptsalt/${g.id}`).length;
    const post = await hit("POST", g.id, "reportlink", ai, {}); expect(post.status).toBe(403);
    expect(q("SELECT v FROM kv WHERE k=?", `rptsalt/${g.id}`).length).toBe(salt0);
    expect((await hit("POST", g.id, "reportlink", mk, {})).status).toBe(200); // the person's key still can
  });
  test("it cannot register a signing key, publish, or make a pay link", async () => {
    const { g, ai } = await setup();
    expect((await hit("PUT", g.id, "control/key", ai, { pub: "x" })).status).toBe(403);
    const before = JSON.stringify(q("SELECT * FROM engagement WHERE id=?", g.id));
    const pub = await hit("POST", g.id, "publish", ai, {}); // answered like the organizer's own AI key: a message, and nothing changes
    expect(pub.status === 403 || pub.status === 200).toBe(true);
    expect(JSON.stringify(q("SELECT * FROM engagement WHERE id=?", g.id))).toBe(before);
    expect((await hit("POST", g.id, "paylink", ai, {})).status).toBe(403);
  });
  test("it may not switch claim review on, nor approve or reject a claim", async () => {
    const { g, seats, ai, mk } = await setup();
    expect((await hit("POST", g.id, "v2/claimreview/mode", ai, { on: true })).status).toBe(403);
    expect((await hit("POST", g.id, "v2/claimreview/mode", mk, { on: true })).status).toBe(200);
    const d = await hit("POST", g.id, "v2/claimreview", ai, { round: 1, pattern: "top", ticket: seats[0], decision: "reject", reason: "not a full line" });
    expect(d.status).toBe(403);
    expect(q("SELECT 1 FROM v2_claim_review WHERE eid=?", g.id).length).toBe(0);
  });
  test("winners are shown by ticket number only: no name, no mobile", async () => {
    const { g, seats, ai } = await setup();
    winner(g.id, "top", 1, seats[0]!);
    W.raw.prepare("INSERT INTO prize(eid,round,pattern,ordinal,seat) VALUES(?,?,?,?,?)").run(g.id, 1, "top", 1, seats[0]);
    const r = await hit("GET", g.id, "prizes", ai); expect(r.status).toBe(200);
    const text = JSON.stringify(await j(r)); expect(text).not.toMatch(/Guest 1/); expect(text).not.toContain(mob(1));
  });
  test("it cannot start the people lists, make keys, or clone and erase after the end", async () => {
    const { g, ai } = await setup();
    expect((await hit("POST", g.id, "v2/keys", ai, {})).status).toBe(403);
    endGame(g.id, T + HOUR);
    const now = T + 2 * HOUR;
    const clone = await call("POST", `/api/z/${g.id}/clone`, {}, keyH(ai), now); expect(clone.status).toBe(403);
    expect((await j(clone)).error).toMatch(/organizer/i);
    expect((await call("POST", `/api/z/${g.id}/erase`, {}, keyH(ai), now)).status).toBe(403);
    expect((await call("GET", `/api/z/${g.id}/v2/status`, undefined, keyH(ai), now)).status).toBe(403);
  });
  test("it may still download the game's data and certificates, with no names", async () => {
    const { g, seats, ai } = await setup();
    winner(g.id, "top", 1, seats[0]!);
    for (const p of ["v2/export", "v2/certs", "v2/certs/csv"]) {
      const r = await hit("GET", g.id, p, ai); expect(r.status).toBe(200);
      const t = await r.text(); expect(t).not.toMatch(/Guest 1/); expect(t).not.toContain(mob(1));
    }
  });
});

describe("a Host key without personal data", () => {
  test("it does not get the report link and sees winners by ticket number only", async () => {
    const g = await paidGame(); const seats = await guests(g.id, 2); const lh = await labelHost(g);
    winner(g.id, "top", 1, seats[0]!);
    W.raw.prepare("INSERT INTO prize(eid,round,pattern,ordinal,seat) VALUES(?,?,?,?,?)").run(g.id, 1, "top", 1, seats[0]);
    for (const m of ["GET", "POST"]) { const r = await hit(m, g.id, "reportlink", lh, m === "POST" ? {} : undefined); expect(r.status).toBe(403); expect((await j(r)).code).toBe("host-limited"); }
    const r = await hit("GET", g.id, "prizes", lh); expect(r.status).toBe(200);
    const text = JSON.stringify(await j(r)); expect(text).not.toMatch(/Guest 1/); expect(text).not.toContain(mob(1));
  });
});

describe("a Host's reason never carries a mobile number", () => {
  test("a long run of digits is replaced before the reason is kept", async () => {
    const g = await paidGame(); const seats = await guests(g.id, 2); const host = await labelHost(g);
    W.raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES(?,?,?,?,?,?)").run(g.id, `${seats[0]}x${"ab".repeat(6)}`, "top", 1, 11, T);
    expect((await hit("POST", g.id, "v2/claimreview/mode", g.key, { on: true })).status).toBe(200);
    const d = await hit("POST", g.id, "v2/claimreview", host, { round: 1, pattern: "top", ticket: seats[0], decision: "reject", reason: "call 98765 43210 about it" });
    expect(d.status).toBe(200);
    const row = q("SELECT reason FROM v2_claim_review WHERE eid=?", g.id)[0] as { reason: string };
    expect(row.reason).not.toMatch(/\d{5}/); expect(row.reason).toMatch(/about it/);
  });
});
