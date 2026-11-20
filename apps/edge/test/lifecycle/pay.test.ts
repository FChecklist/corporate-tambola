// LIFECYCLE SUITE, part 6: "the game only starts when paid", for each of the four formats. Money is the test Razorpay stand-in and the credit ledger (no real money, no live service).
// The console's signed 'paid' notice (corporate-console docs/PAY_STEP.md, route POST /api/console/paid, act `paid`) is NOT built in this repo yet: see the todo at the end and docs/STATE.md.
// What the notice must do (once per order, repeatable, only for the organizer's own game and size) is already true of the existing pay routes, and is tested here as the contract.
// FALSIFIED BY: pay-unpaid-plays (remove the lock), pay-bad-signature-pays, pay-twice-two-entitlements
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore, organizer, checkout, capture, verify, one, q, mails } from "../param-harness";
import { W, FORMATS, newGame, payGame, addIds, joinId, info, control, row, call, j, count, T, MIN, HOUR, type Game } from "./harness";
setDefaultTimeout(120_000);
beforeEach(() => reset()); afterEach(restore);

for (const f of FORMATS) describe(`[${f.key}] ${f.label}: only a paid game starts`, () => {
  test("not paid at its start time: phones are told to hold (control file 'locked'), a new person is turned away, the organizer is told the game waits for payment; paying opens everything", async () => {
    const g = await newGame(f, { pay: false });
    await addIds(g, ["A1"]);
    const late = g.at + 3 * MIN;
    expect((await control(g, late)).locked).toBe(true);
    const i = await info(g, late, g.h); expect([i.locked, i.unpaid, i.waitingFor]).toEqual([true, true, "organizer"]);
    const out = await joinId(g, "A1", 1, {}, late); expect(out.status).toBe(403); expect((await j(out)).code).toBe("locked");
    expect(count("SELECT COUNT(*) AS c FROM seat WHERE eid=?", g.id)).toBe(0);
    await payGame(g, late);
    expect((await control(g, late + 5000)).locked).toBeFalsy();
    expect((await joinId(g, "A1", 1, {}, late + 5000)).status).toBe(200);
  });
  test("a payment that is not genuine does not pay: a wrong signature, a wrong order and a payment the gateway says failed leave the game unpaid", async () => {
    const g = await newGame(f, { pay: false });
    const c = await checkout(g.key, { eid: g.id, email: g.org.email }, T); expect(c.status).toBe(200);
    capture(c.body, "pay_x");
    expect((await verify(c.body, "pay_x", { razorpay_signature: "0".repeat(64) })).status).toBeGreaterThanOrEqual(400);
    expect((await verify(c.body, "pay_x", { razorpay_order_id: "order_other" })).status).toBeGreaterThanOrEqual(400);
    expect(row(g.id).pack).toBeFalsy(); // still 0 / null: unpaid
    const c2 = await checkout(g.key, { eid: g.id, email: "second@acme.com" }, T);
    capture(c2.body, "pay_y", { status: "failed" }); // the gateway says the payment failed
    const nv = await verify(c2.body, "pay_y"); expect(nv.status === 200 ? (await j(nv)).published : false).toBeFalsy();
    expect(row(g.id).pack).toBeFalsy();
    expect((await control(g, g.at + 3 * MIN)).locked).toBe(true);
  });
  test("paying is repeatable and safe: the same payment confirmed twice (browser, then the gateway's notice) is still ONE pack and ONE entitlement", async () => {
    const g = await newGame(f, { pay: false });
    const c = await checkout(g.key, { eid: g.id, email: g.org.email }, T); capture(c.body, "pay_once");
    const a = await verify(c.body, "pay_once"), b = await verify(c.body, "pay_once", {}, T + 60_000);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(count("SELECT COUNT(*) AS c FROM entitlement WHERE eid=?", g.id)).toBe(1);
    expect(row(g.id).pack).toBeGreaterThan(0);
    expect(count("SELECT COUNT(*) AS c FROM invoice")).toBe(1);
  });
  test("only the organizer's own game: another account cannot pay for (or claim) this game's id", async () => {
    const g = await newGame(f, { pay: false });
    const stranger = await organizer();
    const c = await checkout(stranger.key, { eid: g.id, email: stranger.email }, T);
    expect(c.status).toBeGreaterThanOrEqual(400);
    expect(row(g.id).pack).toBeFalsy();
  });
  test("pay with credit: a cancelled paid game leaves credit; the next game of the same organizer is paid from it with no new order", async () => {
    const a = await newGame(f);
    expect(row(a.id).pack).toBeGreaterThan(0);
    expect((await call("POST", `/api/z/${a.id}/cancel`, { confirmations: 3 }, a.h)).status).toBe(200);
    const b = await newGame(f, { org: a.org, pay: false });
    const credit = await j(await call("GET", "/api/org/credit", undefined, a.h)); expect(credit.activeTotalInr).toBeGreaterThan(0);
    const before = W.orders.length;
    const r = await j(await call("POST", `/api/z/${b.id}/pay-with-credit`, {}, a.h));
    expect(r.ok).toBe(true); expect(r.paid).toBe(true); expect(r.toPayInr).toBe(0);
    expect(row(b.id).pack).toBeGreaterThan(0);
    expect(W.orders.length).toBe(before); // no gateway order was made
    const sm = await j(await call("GET", `/api/z/${b.id}/summary`, undefined, a.h)); expect(sm.payment).toMatchObject({ status: "paid", paidVia: "credit" });
    // a second use of the same credit finds nothing left for another game of the same size
    const c3 = await newGame(f, { org: a.org, pay: false });
    const again = await j(await call("POST", `/api/z/${c3.id}/pay-with-credit`, {}, a.h));
    expect(again.paid).not.toBe(true);
    expect(row(c3.id).pack).toBeFalsy();
  });
  test("a paid game still starts as the format says: the paid state does not change who starts it or who calls the numbers", async () => {
    const g = await newGame(f);
    const i = await info(g, T, g.h); expect([i.startMode, i.callMode, i.unpaid]).toEqual([f.startMode, f.callMode, undefined]);
  });
});
test.todo("console signed 'paid' notice (POST /api/console/paid, act `paid`, 60 s, one use; markPaid repeatable, organizer's own game and size only): not built in this repo; build it, then replace this todo with the same checks as the tests above");
