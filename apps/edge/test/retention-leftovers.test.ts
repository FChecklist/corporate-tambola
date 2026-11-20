// 250x10 games 1 to 10 (docs/250x10/RESULTS.md): 365 days after a game every row of it must be gone, except the records kept on purpose.
// Two small things were left behind for ever: the claim-signal counter `cv/<game>` (a kv row) and the "phones listening" counters (`presence`). Neither holds a name or number,
// but the privacy page promises the game is forgotten, and the presence counters were "auto-deleted after a day" only when somebody opened the console.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DAY, HOUR, MIN, T, W, one, paidGame, q, reset, restore } from "./param-harness";
import { eraseEverything, lifecycleTick } from "../src/lifecycle";
import { reportPresence } from "../src/presence";

beforeEach(() => reset());
afterEach(restore);

describe("what the 365-day deletion leaves behind", () => {
  test("the claim-signal counter and the listening counters of a deleted game are deleted with it", async () => {
    const g = await paidGame({ id: "RET-1" });
    W.raw.prepare("INSERT INTO kv(k,v) VALUES(?,?)").run("cv/RET-1", "7");
    await reportPresence(W.env.DB as any, "RET-1", 100, 1, T);
    await reportPresence(W.env.DB as any, "RET-1", 100, 1, T + MIN);
    expect(one("SELECT COUNT(*) n FROM presence WHERE eid=?", "RET-1").n).toBe(2);
    await eraseEverything(W.env as any, "RET-1", T + 400 * DAY);
    expect(one("SELECT COUNT(*) n FROM engagement WHERE id=?", "RET-1").n).toBe(0);
    expect(one("SELECT COUNT(*) n FROM presence WHERE eid=?", "RET-1").n).toBe(0);
    expect(q("SELECT k FROM kv WHERE k LIKE ?", "%RET-1%").map((x) => x.k)).toEqual([]);
    void g;
  });
  test("erasing a game that never had a listening counter still works (the table is made by the first report)", async () => {
    await paidGame({ id: "RET-2" });
    W.raw.prepare("DROP TABLE IF EXISTS presence").run();
    await eraseEverything(W.env as any, "RET-2", T + 400 * DAY);
    expect(one("SELECT COUNT(*) n FROM engagement WHERE id=?", "RET-2").n).toBe(0);
  });
  test("the housekeeping job forgets listening counters older than a day, whether or not anybody opens the console; a running game keeps today's", async () => {
    await paidGame({ id: "RET-3" });
    await reportPresence(W.env.DB as any, "RET-3", 100, 1, T - 2 * DAY);
    await reportPresence(W.env.DB as any, "RET-3", 100, 1, T - 30 * HOUR);
    await reportPresence(W.env.DB as any, "RET-3", 100, 1, T - 10 * MIN);
    await lifecycleTick(W.env as any, T);
    expect(q("SELECT minute FROM presence WHERE eid=?", "RET-3").map((r) => r.minute)).toEqual([Math.floor((T - 10 * MIN) / 60_000)]);
  });
});
