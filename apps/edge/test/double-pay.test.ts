// F-04: two payments for one draft must not publish it twice. Independent of the time-travel suite.
// TEST mode: the second payment is refused (nothing was charged). LIVE mode: the money is taken and there are no refunds, so the second payment is kept as credit and buys no pack.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setMode } from "../src/mode";
import { T, W, call, capture, checkout, create, j, keyH, one, organizer, publish, q, reset, restore, uid, verify } from "./param-harness";

beforeEach(() => reset());
afterEach(restore);

const draft = async () => {
  const o = await organizer(); const id = uid("DBL");
  expect((await create(o.key, id, { cap: 100 })).status).toBe(200);
  expect((await publish(o.key, id)).status).toBe(200);
  return { ...o, id };
};

describe("LIVE: checkout", () => {
  test("two clicks on Pay (at once or later) open ONE order; a different payer gets their own", async () => {
    const g = await draft(); const ask = (email: string) => checkout(g.key, { eid: g.id, email, pack: 100 });
    const [a, b] = await Promise.all([ask(g.email), ask(g.email)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.paymentId).toBe(b.body.paymentId); expect(a.body.razorpay.orderId).toBe(b.body.razorpay.orderId);
    expect((await ask(g.email)).body.paymentId).toBe(a.body.paymentId);
    expect((await ask("cofounder@acme.com")).body.paymentId).not.toBe(a.body.paymentId);
    expect(one("SELECT COUNT(*) c FROM payment WHERE eid=? AND status='created' AND email=?", g.id, g.email).c).toBe(1);
  });
});

describe("LIVE: two paid orders for one draft", () => {
  test("both paid at the same moment: one pack is bought, the second payment is kept as credit", async () => {
    const g = await draft();
    const a = await checkout(g.key, { eid: g.id, email: g.email, pack: 100 }), b = await checkout(g.key, { eid: g.id, email: "cofounder@acme.com", pack: 100 }); // another payer: a second, separate order
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    capture(a.body, "pay_a"); capture(b.body, "pay_b");
    const [ra, rb] = await Promise.all([verify(a.body, "pay_a"), verify(b.body, "pay_b")]);
    expect([ra.status, rb.status]).toEqual([200, 200]); // the buyer paid both: neither is answered with an error
    const bodies = [await j(ra), await j(rb)];
    expect(bodies.filter((x) => x.published === true)).toHaveLength(1); // exactly one publishes the game
    expect(bodies.filter((x) => x.creditKept === true)).toHaveLength(1); // the other is credit
    expect(one("SELECT COUNT(*) c FROM entitlement WHERE eid IS NOT NULL").c).toBe(1);
    expect(one("SELECT COUNT(*) c FROM entitlement").c).toBe(1); // the credit buys no pack
    expect(one("SELECT COUNT(*) c FROM credit WHERE kind='late'").c).toBe(1);
    expect(q("SELECT pack FROM engagement WHERE id=?", g.id)[0].pack).toBe(100);
    expect(one("SELECT COUNT(*) c FROM payment WHERE status='paid'").c).toBe(2); // both are recorded as paid (the money is real)
  });
  test("a second payment arriving later (the first one already published the game) is kept as credit too", async () => {
    const g = await draft();
    const a = await checkout(g.key, { eid: g.id, email: g.email, pack: 100 }), b = await checkout(g.key, { eid: g.id, email: "cofounder@acme.com", pack: 100 }); // another payer: a second, separate order
    capture(a.body, "pay_a"); capture(b.body, "pay_b");
    expect((await j(await verify(a.body, "pay_a"))).published).toBe(true);
    const second = await j(await verify(b.body, "pay_b", {}, T + 60_000));
    expect(second.published).toBe(false); expect(second.creditKept).toBe(true);
    expect(one("SELECT COUNT(*) c FROM credit").c).toBe(1);
    expect(one("SELECT COUNT(*) c FROM entitlement").c).toBe(1);
    // the same payment delivered again (the webhook after the browser) changes nothing
    const again = await verify(b.body, "pay_b", {}, T + 120_000); expect(again.status).toBe(200);
    expect(one("SELECT COUNT(*) c FROM credit").c).toBe(1);
  });
  test("one payment verified twice at once still publishes once and makes one entitlement", async () => {
    const g = await draft();
    const a = await checkout(g.key, { eid: g.id, email: g.email, pack: 100 });
    capture(a.body, "pay_a");
    const rs = await Promise.all([verify(a.body, "pay_a"), verify(a.body, "pay_a")]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    expect(one("SELECT COUNT(*) c FROM entitlement").c).toBe(1);
    expect(one("SELECT COUNT(*) c FROM credit").c).toBe(0);
    expect(one("SELECT COUNT(*) c FROM invoice").c).toBe(1);
  });
});

describe("TEST mode: two payments for one draft", () => {
  test("started at the same moment: one is paid, the other refused (409), one entitlement", async () => {
    const g = await draft();
    await setMode(W.env as any, "TEST", "double-pay test", T);
    const body = { eid: g.id, email: g.email, org: "Dbl", country: "IN" };
    const rs = await Promise.all([call("POST", "/api/payments/test", body, keyH(g.key)), call("POST", "/api/payments/test", body, keyH(g.key))]);
    expect(rs.map((r) => r.status).sort(), JSON.stringify(await Promise.all(rs.map((r) => r.clone().json())))).toEqual([200, 409]);
    expect(one("SELECT COUNT(*) c FROM payment WHERE status='paid'").c).toBe(1);
    expect(one("SELECT COUNT(*) c FROM entitlement").c).toBe(1);
  });
});
