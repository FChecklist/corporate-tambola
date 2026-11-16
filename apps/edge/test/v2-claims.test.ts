// V2 item 10: the Host sees each claim and approves or rejects it with a short reason that the player reads. Optional per game, OFF by default; with no Host action the game behaves as before.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { T, W, call, j, keyH, paidGame, q, reset, restore } from "./param-harness";
import { guests, labelHost, winner } from "./v2-helpers";

beforeEach(() => reset());
afterEach(restore);

const pidOf = (seat: number) => `${seat}x${"ab".repeat(6)}`;
async function claimGame() {
  const g = await paidGame(); const seats = await guests(g.id, 2);
  W.raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES(?,?,?,?,?,?)").run(g.id, pidOf(seats[0]!), "top", 1, 11, T);
  winner(g.id, "top", 1, seats[0]!);
  W.raw.prepare("INSERT INTO prize(eid,round,pattern,ordinal,seat) VALUES(?,?,?,?,?)").run(g.id, 1, "top", 1, seats[0]);
  return { g, seats };
}
const mode = (id: string, key: string, on: boolean) => call("POST", `/api/z/${id}/v2/claimreview/mode`, { on }, keyH(key));
const decide = (id: string, key: string, b: Record<string, unknown>) => call("POST", `/api/z/${id}/v2/claimreview`, { round: 1, pattern: "top", ...b }, keyH(key));
const given = (id: string, key: string, seat: number, v = true) => call("POST", `/api/z/${id}/prizegiven`, { round: 1, pattern: "top", ordinal: 1, seat, given: v }, keyH(key));
const note = async (id: string, seat: number) => j(await call("GET", `/api/z/${id}/v2/claimreview/note?pid=${pidOf(seat)}`));

describe("off by default: nothing changes", () => {
  test("review is off; a decision is refused with a plain message; the player has no notes; the prize can be handed over", async () => {
    const { g, seats } = await claimGame();
    expect(await j(await call("GET", `/api/z/${g.id}/v2/claimreview`, undefined, keyH(g.key)))).toMatchObject({ on: false });
    const r = await decide(g.id, g.key, { ticket: seats[0], decision: "reject", reason: "no" }); expect(r.status).toBe(409); expect((await j(r)).code).toBe("review-off");
    expect(await note(g.id, seats[0]!)).toEqual({ on: false, notes: [] });
    expect((await given(g.id, g.key, seats[0]!)).status).toBe(200);
  });
  test("even a stored rejection does not hold a prize when review is off (the switch decides)", async () => {
    const { g, seats } = await claimGame();
    W.raw.prepare("INSERT INTO v2_claim_review(eid,round,pattern,ticket,decision,reason,by,at_ms) VALUES(?,?,?,?,?,?,?,?)").run(g.id, 1, "top", seats[0], "reject", "x", "host", T);
    expect((await given(g.id, g.key, seats[0]!)).status).toBe(200);
  });
});

describe("switching it on and deciding", () => {
  test("only the organizer switches it; a Host, an AI and a stranger cannot", async () => {
    const { g } = await claimGame(); const s = await paidGame(); const h = await labelHost(g);
    for (const k of [h, g.ai, s.key]) expect((await mode(g.id, k, true)).status).toBe(403);
    expect(await j(await mode(g.id, g.key, true))).toMatchObject({ ok: true, on: true });
    expect((await j(await call("GET", `/api/z/${g.id}/v2/claimreview`, undefined, keyH(h)))).on).toBe(true);
  });
  test("the Host sees each claim with whether the software found it a winner, and what has been decided", async () => {
    const { g, seats } = await claimGame(); await mode(g.id, g.key, true); const h = await labelHost(g);
    const l = await j(await call("GET", `/api/z/${g.id}/v2/claimreview`, undefined, keyH(h)));
    expect(l.claims.length).toBe(1); expect(l.claims[0]).toMatchObject({ ticket: seats[0], pattern: "top", round: 1, number: 12, softwareWinner: true, review: null });
  });
  test("reject needs a short reason; the player reads it; approving later lifts it", async () => {
    const { g, seats } = await claimGame(); await mode(g.id, g.key, true); const h = await labelHost(g);
    const no = await decide(g.id, h, { ticket: seats[0], decision: "reject" }); expect(no.status).toBe(400); expect((await j(no)).code).toBe("need-reason");
    expect((await decide(g.id, h, { ticket: seats[0], decision: "reject", reason: "<b>Line was not complete</b>" })).status).toBe(200);
    const n = await note(g.id, seats[0]!); expect(n.on).toBe(true); expect(n.notes).toEqual([{ pattern: "top", round: 1, decision: "reject", reason: expect.stringMatching(/Line was not complete/) }]); expect(JSON.stringify(n)).not.toContain("<b>");
    expect((await decide(g.id, h, { ticket: seats[0], decision: "approve" })).status).toBe(200);
    const n2 = await note(g.id, seats[0]!); expect(n2.notes).toEqual([{ pattern: "top", round: 1, decision: "approve" }]); // an approval carries no reason
    expect(q("SELECT 1 FROM v2_claim_review WHERE eid=?", g.id).length).toBe(1); // one decision per claim; the later one replaces
  });
  test("a decision on a claim that does not exist, or a malformed one, is refused", async () => {
    const { g, seats } = await claimGame(); await mode(g.id, g.key, true);
    expect((await decide(g.id, g.key, { ticket: seats[1], decision: "approve" })).status).toBe(404);
    expect((await decide(g.id, g.key, { ticket: 0, decision: "approve" })).status).toBe(400);
    expect((await decide(g.id, g.key, { ticket: seats[0], decision: "maybe" })).status).toBe(400);
    expect((await decide(g.id, g.key, { ticket: seats[0], decision: "approve", pattern: "no spaces!" })).status).toBe(400);
  });
  test("an AI key cannot decide, a stranger cannot even see; a player's note needs a well-formed ticket id", async () => {
    const { g, seats } = await claimGame(); await mode(g.id, g.key, true); const s = await paidGame();
    expect((await decide(g.id, g.ai, { ticket: seats[0], decision: "approve" })).status).toBe(403);
    expect((await call("GET", `/api/z/${g.id}/v2/claimreview`, undefined, keyH(s.key))).status).toBe(403);
    expect((await call("GET", `/api/z/${g.id}/v2/claimreview/note?pid=nope`)).status).toBe(400);
  });
  test("a player sees only notes on their own ticket", async () => {
    const { g, seats } = await claimGame(); await mode(g.id, g.key, true); await decide(g.id, g.key, { ticket: seats[0], decision: "reject", reason: "Not complete" });
    expect((await note(g.id, seats[1]!)).notes).toEqual([]);
  });
});

describe("what a rejection does, and what it does not", () => {
  test("the prize hand-over is held while the claim is rejected, with the reason; approving frees it", async () => {
    const { g, seats } = await claimGame(); await mode(g.id, g.key, true);
    await decide(g.id, g.key, { ticket: seats[0], decision: "reject", reason: "Please show the line" });
    const r = await given(g.id, g.key, seats[0]!); expect(r.status).toBe(409); const b = await j(r); expect(b.code).toBe("claim-rejected"); expect(b.error).toContain("Please show the line");
    expect(q("SELECT given_ms FROM prize WHERE eid=?", g.id)[0].given_ms).toBeNull();
    await decide(g.id, g.key, { ticket: seats[0], decision: "approve" });
    expect((await given(g.id, g.key, seats[0]!)).status).toBe(200);
  });
  test("taking a hand-over back ('not given') is never held", async () => {
    const { g, seats } = await claimGame(); await mode(g.id, g.key, true); await given(g.id, g.key, seats[0]!);
    await decide(g.id, g.key, { ticket: seats[0], decision: "reject", reason: "Mistake found" });
    expect((await given(g.id, g.key, seats[0]!, false)).status).toBe(200);
  });
  test("the software's winners are untouched by a review: the winner row and the claim stay as they were", async () => {
    const { g, seats } = await claimGame(); await mode(g.id, g.key, true);
    const before = JSON.stringify([q("SELECT * FROM winner WHERE eid=?", g.id), q("SELECT * FROM claim WHERE eid=?", g.id), q("SELECT * FROM settled WHERE eid=?", g.id)]);
    await decide(g.id, g.key, { ticket: seats[0], decision: "reject", reason: "Not accepted" });
    expect(JSON.stringify([q("SELECT * FROM winner WHERE eid=?", g.id), q("SELECT * FROM claim WHERE eid=?", g.id), q("SELECT * FROM settled WHERE eid=?", g.id)])).toBe(before);
  });
  test("the review reasons go with the players' data; the decision (a ticket number and a word) stays so a rejected claim is never rewarded later", async () => {
    const { g, seats } = await claimGame(); await mode(g.id, g.key, true); await decide(g.id, g.key, { ticket: seats[0], decision: "reject", reason: "Not accepted" });
    const { erasePersonal } = await import("../src/lifecycle"); await erasePersonal(W.env as any, g.id, T + 30 * 3_600_000, "test");
    const rows = q("SELECT decision, reason FROM v2_claim_review WHERE eid=?", g.id) as any[]; expect(rows.length).toBe(1); expect(rows[0].decision).toBe("reject"); expect(rows[0].reason).toBeNull();
  });
  test("a long body cannot slip past the prize hold", async () => {
    const { g, seats } = await claimGame(); await mode(g.id, g.key, true); await decide(g.id, g.key, { ticket: seats[0], decision: "reject", reason: "Not accepted" });
    const pad = (await call("POST", `/api/z/${g.id}/prizegiven`, { round: 1, pattern: "top", ordinal: 1, seat: seats[0], given: true, pad: "x".repeat(1500) }, keyH(g.key)));
    expect(pad.status).toBe(409); expect((await j(pad)).code).toBe("claim-rejected");
    expect(q("SELECT given_ms FROM prize WHERE eid=?", g.id).every((r: any) => r.given_ms == null)).toBe(true);
  });
  test("a certificate is never made for a claim a Host rejected, even after the reasons are erased", async () => {
    const { g, seats } = await claimGame(); await mode(g.id, g.key, true); await decide(g.id, g.key, { ticket: seats[0], decision: "reject", reason: "Not accepted" });
    const { erasePersonal } = await import("../src/lifecycle"); await erasePersonal(W.env as any, g.id, T + 30 * 3_600_000, "test");
    const r = await call("POST", `/api/z/${g.id}/v2/certs/issue`, {}, keyH(g.key), T + 31 * 3_600_000);
    expect(JSON.stringify(await j(r))).not.toMatch(/"issued":[1-9]/);
    expect(q("SELECT 1 FROM v2_cert WHERE eid=?", g.id).length).toBe(0);    // control: the same game with no rejection does get its certificate after the erase, so the test above proves the rejection is what holds it back
    const c = await claimGame(); await erasePersonal(W.env as any, c.g.id, T + 30 * 3_600_000, "test"); await call("POST", `/api/z/${c.g.id}/v2/certs/issue`, {}, keyH(c.g.key), T + 31 * 3_600_000);
    expect(q("SELECT 1 FROM v2_cert WHERE eid=?", c.g.id).length).toBe(1);
  });
});
