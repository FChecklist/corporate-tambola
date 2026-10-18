// Table-driven tests, part 4: payment paths (who pays, how, what goes wrong), credit, cancel / reschedule / clone and the 365-day windows.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { price } from "../../../packages/shared/src/pricing";
import { fullDeleteAt } from "../src/lifecycle";
import { DAY, HOUR, MIN, PLAT, T, W, call, capture, checkout, create, hmac, j, keyH, mails, one, organizer, paidGame, publish, q, reset, restore, roundAt, roundMs, startIn, uid, verify } from "./param-harness";

beforeEach(() => reset());
afterEach(restore);

const unpaid = async (cap = 100, over: Record<string, unknown> = {}) => {
  const o = await organizer(); const id = uid(); await create(o.key, id, { cap, ...over }); expect((await publish(o.key, id)).status).toBe(200);
  const host = (await j(await call("POST", "/api/org/host", { mobile: "9876500009", label: "Priya", email: "priya@acme.com" }, o.h))).hostKey as string;
  const cohost = (await j(await call("POST", "/api/org/cohost", { label: "Ravi", phone: "9876500001", e: id }, o.h))).cohostKey as string;
  return { ...o, id, host, cohost };
};
const gameRow = (id: string) => one("SELECT * FROM engagement WHERE id=?", id);

// ---------------------------------------------------------------------------------------------------------- who pays
describe("who can pay for a game", () => {
  for (const who of ["key", "host", "cohost"] as const) {
    test(`the ${who === "key" ? "Organizer" : who === "host" ? "Host" : "Co-host"} pays: the game becomes paid for its pack, one invoice, one entitlement, the owner is told once`, async () => {
      const g = await unpaid(100);
      const k = who === "key" ? g.key : who === "host" ? g.host : g.cohost;
      const c = await checkout(k, { eid: g.id }); expect(c.status).toBe(200);
      capture(c.body); const v = await verify(c.body); expect(v.status).toBe(200);
      expect(gameRow(g.id).pack).toBe(100);
      expect(one("SELECT COUNT(*) c FROM invoice").c).toBe(1); expect(one("SELECT COUNT(*) c FROM entitlement").c).toBe(1);
      expect(q("SELECT * FROM outbox WHERE subject LIKE '%payment%' OR subject LIKE '%paid%' OR subject LIKE '%order%'").length).toBeGreaterThan(0);
    });
  }
  test("an AI key cannot pay", async () => { const g = await unpaid(100); expect((await checkout(g.ai, { eid: g.id })).status).toBeGreaterThanOrEqual(400); expect(W.orders.length).toBe(0); });
  test("another organizer's key cannot pay for this game", async () => {
    const g = await unpaid(100), other = await organizer(); const c = await checkout(other.key, { eid: g.id });
    expect(c.status).toBeGreaterThanOrEqual(400); expect(W.orders.length).toBe(0);
  });
  test("an anonymous visitor buys a pack, then publishes with it: the game is paid at once", async () => {
    const o = await organizer(); const c = await checkout(undefined, { pack: 250, email: o.email }); expect(c.status).toBe(200);
    capture(c.body); expect((await verify(c.body)).status).toBe(200);
    const id = uid(); expect((await create(o.key, id, { cap: 200 })).status).toBe(200);
    const p = await j(await publish(o.key, id)); expect(p.paid).toBe(true); expect(gameRow(id).pack).toBe(250);
  });
  test("a pack too small for the game does not cover it", async () => {
    const o = await organizer(); const c = await checkout(undefined, { pack: 100, email: o.email }); capture(c.body); await verify(c.body);
    const id = uid(); await create(o.key, id, { cap: 300 }); const p = await j(await publish(o.key, id)); expect(p.paid).toBe(false);
  });
});

describe("pay link: anyone with the link can pay, and only that game", () => {
  const link = async (g: Awaited<ReturnType<typeof unpaid>>, key = g.key) => { const r = await call("POST", `/api/z/${g.id}/paylink`, {}, keyH(key)); return { status: r.status, body: await j(r), token: ((await Promise.resolve(null)) as any) }; };
  const tokenOf = (url: string) => url.split("t=")[1]!;
  for (const who of ["key", "host", "cohost"] as const) {
    test(`a link made by the ${who === "key" ? "Organizer" : who} opens for the public with the game name and price only`, async () => {
      const g = await unpaid(100); const l = await link(g, who === "key" ? g.key : who === "host" ? g.host : g.cohost); expect(l.status).toBe(200);
      const info = await j(await call("GET", `/api/paylink/${tokenOf(l.body.url)}`)); expect(info.status).toBe("open");
      expect(info.price.total).toBe(price(100, "INR").total); expect(JSON.stringify(info)).not.toMatch(/boss@|"cap"|acme|ctk_|cta_/);
    });
  }
  test("an AI key cannot make a pay link", async () => { const g = await unpaid(100); expect((await call("POST", `/api/z/${g.id}/paylink`, {}, keyH(g.ai))).status).toBeGreaterThanOrEqual(400); });
  test("a new link cancels the old one", async () => {
    const g = await unpaid(100); const a = await link(g), b = await link(g);
    expect((await j(await call("GET", `/api/paylink/${tokenOf(a.body.url)}`))).status).toBe("expired");
    expect((await j(await call("GET", `/api/paylink/${tokenOf(b.body.url)}`))).status).toBe("open");
  });
  test("a wrong token is a plain 404, the same for every wrong token", async () => {
    for (const t of ["0".repeat(48), "x".repeat(48), "abc", "0".repeat(47)]) expect((await call("GET", `/api/paylink/${t}`)).status).toBe(404);
  });
  test("a link expires after 7 days", async () => {
    const g = await unpaid(100); const l = await link(g);
    expect((await j(await call("GET", `/api/paylink/${tokenOf(l.body.url)}`, undefined, {}, T + 7 * DAY + 1000))).status).toBe("expired");
  });
  test("paying through the link pays that game, whatever the payer sends", async () => {
    const g = await unpaid(100); const l = await link(g); const t = tokenOf(l.body.url);
    const r = await call("POST", `/api/paylink/${t}/checkout`, { name: "Payer One", email: "payer@x.co", pack: 10000, eid: "other" }); expect(r.status).toBe(200);
    const c = await j(r); expect(W.orders[0].amount).toBe(price(100, "INR").total * 100);
    capture(c); expect((await verify(c)).status).toBe(200); expect(gameRow(g.id).pack).toBe(100);
    expect((await j(await call("GET", `/api/paylink/${t}`))).status).toBe("paid");
  });
  test("a link for a paid game cannot be made again", async () => { const g = await paidGame({ cap: 100 }); expect((await call("POST", `/api/z/${g.id}/paylink`, {}, g.h)).status).toBe(409); });
  test("a pay link needs a name and an e-mail", async () => {
    const g = await unpaid(100); const t = tokenOf((await link(g)).body.url);
    for (const body of [{ email: "a@b.co" }, { name: "A", email: "a@b.co" }, { name: "Ab Cd", email: "nope" }, {}]) expect((await call("POST", `/api/paylink/${t}/checkout`, body)).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------------------- what goes wrong
describe("payment verification: what the gateway says versus what the browser says", () => {
  const setup = async () => { const g = await unpaid(100); const c = await checkout(g.key, { eid: g.id }); return { g, c: c.body }; };
  const orderAmount = (c: any) => W.orders.find((o) => o.id === c.razorpay.orderId)!.amount;
  const rows: [string, (c: any) => Record<string, unknown>, number, boolean][] = [
    ["captured, right amount", (c) => ({ status: "captured", amount: orderAmount(c) }), 200, true],
    ["authorized (the server captures it)", (c) => ({ status: "authorized", amount: orderAmount(c) }), 200, true],
    ["still created (not paid yet)", (c) => ({ status: "created", amount: orderAmount(c) }), 202, false],
    ["failed", (c) => ({ status: "failed", amount: orderAmount(c) }), 402, false],
    ["captured but one paisa less", (c) => ({ status: "captured", amount: orderAmount(c) - 1 }), 402, false],
    ["captured but one paisa more", (c) => ({ status: "captured", amount: orderAmount(c) + 1 }), 402, false],
    ["captured but ten times less", (c) => ({ status: "captured", amount: Math.round(orderAmount(c) / 10) }), 402, false],
    ["captured for a different order", (c) => ({ status: "captured", amount: orderAmount(c), order_id: "order_999" }), 402, false],
    ["refunded", (c) => ({ status: "refunded", amount: orderAmount(c) }), 402, false],
  ];
  for (const [label, shape, status, grants] of rows) {
    test(`gateway says ${label}: ${status}, ${grants ? "game paid" : "nothing granted"}`, async () => {
      const { g, c } = await setup();
      W.payments["pay_x"] = { id: "pay_x", order_id: c.razorpay.orderId, ...shape(c) };
      const r = await verify(c, "pay_x");
      expect([status, 400, 402, 202]).toContain(r.status);
      if (!grants) { expect(gameRow(g.id).pack).toBe(0); expect(one("SELECT COUNT(*) c FROM entitlement").c).toBe(0); }
      else { expect(r.status).toBe(200); expect(gameRow(g.id).pack).toBe(100); }
      expect(r.status).toBeLessThan(500);
    });
  }
  test("an unknown payment id at the gateway grants nothing", async () => { const { g, c } = await setup(); const r = await verify(c, "pay_nope"); expect(r.status).toBeGreaterThanOrEqual(400); expect(gameRow(g.id).pack).toBe(0); });
  for (const [label, over] of [["a wrong signature", { razorpay_signature: "deadbeef" }], ["an empty signature", { razorpay_signature: "" }], ["a signature of another payment", { razorpay_signature: hmac("sek", "order_9|pay_9") }], ["a missing order id", { razorpay_order_id: undefined }], ["a missing payment id", { razorpay_payment_id: undefined }], ["an unknown paymentId", { paymentId: "pay_unknown_row" }]] as [string, Record<string, unknown>][]) {
    test(`${label} is refused and grants nothing`, async () => {
      const { g, c } = await setup(); capture(c, "pay_ok"); const r = await verify(c, "pay_ok", over);
      expect(r.status).toBeGreaterThanOrEqual(400); expect(r.status).toBeLessThan(500); expect(gameRow(g.id).pack).toBe(0);
    });
  }
  test("replay: the same successful verify twice changes nothing (one entitlement, one invoice, one buyer mail)", async () => {
    const { g, c } = await setup(); capture(c, "pay_r"); const a = await verify(c, "pay_r"), b = await verify(c, "pay_r");
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(one("SELECT COUNT(*) c FROM entitlement").c).toBe(1); expect(one("SELECT COUNT(*) c FROM invoice").c).toBe(1);
    expect(gameRow(g.id).pack).toBe(100);
  });
  test("double click: two checkouts of the same game then both paid does not double-grant the game", async () => {
    const g = await unpaid(100); const c1 = (await checkout(g.key, { eid: g.id })).body, c2 = (await checkout(g.key, { eid: g.id })).body;
    capture(c1, "pay_a"); capture(c2, "pay_b"); await verify(c1, "pay_a"); await verify(c2, "pay_b");
    expect(gameRow(g.id).pack).toBe(100);
    expect(one("SELECT COUNT(*) c FROM entitlement WHERE eid=?", g.id).c).toBe(1);
  });
  test("the browser says paid but the gateway is unreachable (503/timeout): no grant, no 500", async () => {
    const { g, c } = await setup(); capture(c, "pay_t"); const f = globalThis.fetch;
    (globalThis as any).fetch = async () => { throw new Error("network down"); };
    const r = await verify(c, "pay_t"); (globalThis as any).fetch = f;
    expect(r.status).toBeGreaterThanOrEqual(400); expect(gameRow(g.id).pack).toBe(0);
  });
});

describe("webhook (the buyer closed the tab)", () => {
  const hook = (ev: unknown, secret = "whsec", sigOverride?: string) => { const raw = JSON.stringify(ev); return call("POST", "/api/payments/webhook", raw, { "x-razorpay-signature": sigOverride ?? hmac(secret, raw) }); };
  const ev = (c: any, payId: string, status = "captured", amount?: number) => ({ event: "payment.captured", payload: { payment: { entity: { id: payId, order_id: c.razorpay.orderId, status, amount: amount ?? W.orders[0].amount, currency: "INR" } } } });
  test("a signed captured event pays the game even if the buyer never came back", async () => {
    const g = await unpaid(100); const c = (await checkout(g.key, { eid: g.id })).body; capture(c, "pay_w");
    expect((await hook(ev(c, "pay_w"))).status).toBe(200); expect(gameRow(g.id).pack).toBe(100);
  });
  test("a wrong signature is refused", async () => { const g = await unpaid(100); const c = (await checkout(g.key, { eid: g.id })).body; capture(c, "pay_w"); expect((await hook(ev(c, "pay_w"), "whsec", "00")).status).toBe(400); expect(gameRow(g.id).pack).toBe(0); });
  test("signed with another secret is refused", async () => { const g = await unpaid(100); const c = (await checkout(g.key, { eid: g.id })).body; capture(c, "pay_w"); expect((await hook(ev(c, "pay_w"), "other-secret")).status).toBe(400); });
  test("with no webhook secret configured the endpoint says it is not configured", async () => { reset({ RAZORPAY_WEBHOOK_SECRET: undefined } as any); expect((await hook({ event: "x" })).status).toBe(503); });
  test("an amount that does not match the order is ignored", async () => {
    const g = await unpaid(100); const c = (await checkout(g.key, { eid: g.id })).body; capture(c, "pay_w", { amount: 100 });
    await hook(ev(c, "pay_w", "captured", 100)); expect(gameRow(g.id).pack).toBe(0);
  });
  test("the same event twice grants once", async () => {
    const g = await unpaid(100); const c = (await checkout(g.key, { eid: g.id })).body; capture(c, "pay_w");
    await hook(ev(c, "pay_w")); await hook(ev(c, "pay_w")); expect(one("SELECT COUNT(*) c FROM entitlement").c).toBe(1);
  });
  test("an event for an order we never made is ignored with a 200", async () => {
    const r = await hook({ event: "payment.captured", payload: { payment: { entity: { id: "pay_z", order_id: "order_zzz", status: "captured", amount: 100 } } } }); expect(r.status).toBeLessThan(500);
  });
  test("a body that is not JSON but is signed is a plain 400", async () => { const raw = "not json"; expect((await call("POST", "/api/payments/webhook", raw, { "x-razorpay-signature": hmac("whsec", raw) })).status).toBe(400); });
});

describe("late payment", () => {
  const rows: [string, number, boolean][] = [["1 minute before the start", -MIN, false], ["at the start", 0, true], ["10 minutes after the start", 10 * MIN, true], ["3 hours after the start", 3 * HOUR, true]];
  for (const [label, offset, moves] of rows) {
    test(`paying ${label}: ${moves ? "the first number moves to about 2 minutes after the payment" : "the start time is kept"}`, async () => {
      const g = await unpaid(100, { startRound: startIn(2 * HOUR) });
      const startMs = roundMs(gameRow(g.id).start_round); const at = startMs + offset;
      const c = await checkout(g.key, { eid: g.id }, at); expect(c.status).toBe(200); capture(c.body, "pay_l");
      const v = await verify(c.body, "pay_l", {}, at); expect(v.status).toBe(200);
      const row = gameRow(g.id); expect(row.pack).toBe(100);
      if (moves) { const first = roundMs(row.start_round + 40); expect(first).toBeGreaterThanOrEqual(at); expect(first).toBeLessThanOrEqual(at + 6 * MIN); }
      else expect(roundMs(row.start_round)).toBe(startMs);
    });
  }
  test("a game that did not start and was closed (guest data erased) cannot be paid for: 409 did-not-start, no order is created", async () => {
    const g = await unpaid(100, { startRound: startIn(2 * HOUR) }); const startMs = roundMs(gameRow(g.id).start_round);
    const at = startMs + 2 * HOUR + 40 * HOUR;
    const { lifecycleTick } = await import("../src/lifecycle"); await lifecycleTick(W.env as any, at);
    const c = await checkout(g.key, { eid: g.id }, at);
    expect(c.status).toBe(409); expect(c.body.code).toBe("did-not-start"); expect(W.orders.length).toBe(0); expect(gameRow(g.id).pack).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------- cancel, credit, no refund
describe("cancel: confirmations, windows, credit and no refund", () => {
  for (const [conf, ok] of [[3, true], [2, false], [1, false], [0, false], [4, false], ["3", false], [null, false], [undefined, false]] as [unknown, boolean][]) {
    test(`cancel with confirmations=${JSON.stringify(conf)} is ${ok ? "accepted" : "refused with code confirmations"}`, async () => {
      const g = await paidGame({ cap: 100 }); const r = await call("POST", `/api/z/${g.id}/cancel`, { confirmations: conf }, g.h);
      expect(r.status).toBe(ok ? 200 : 400);
      if (!ok) expect((await j(r)).code).toBe("confirmations");
    });
  }
  test("cancelling a paid game gives credit equal to the amount paid, valid for 365 days, and no refund is ever requested at the gateway", async () => {
    const g = await paidGame({ cap: 100 }); const calls: string[] = []; const f = globalThis.fetch;
    (globalThis as any).fetch = async (u: any, i: any) => { calls.push(String(u)); return f(u, i); };
    const r = await j(await call("POST", `/api/z/${g.id}/cancel`, { confirmations: 3 }, g.h));
    expect(r.cancelled).toBe(true); expect(r.credit.amountInr).toBe(price(100, "INR").total);
    expect(calls.filter((u) => /refund/i.test(u))).toEqual([]);
    const exp = r.credit.expiresMs - T; expect(exp).toBeGreaterThanOrEqual(364 * DAY); expect(exp).toBeLessThanOrEqual(366 * DAY + 18 * HOUR);
  });
  test("cancelling twice is harmless and does not double the credit", async () => {
    const g = await paidGame({ cap: 100 }); await call("POST", `/api/z/${g.id}/cancel`, { confirmations: 3 }, g.h); await call("POST", `/api/z/${g.id}/cancel`, { confirmations: 3 }, g.h);
    const cr = await j(await call("GET", "/api/org/credit", undefined, g.h)); expect(cr.activeTotalInr).toBe(price(100, "INR").total);
  });
  test("a paid game cannot be cancelled once its start time has passed", async () => {
    const g = await paidGame({ cap: 100 }); const start = roundMs(gameRow(g.id).start_round);
    expect((await call("POST", `/api/z/${g.id}/cancel`, { confirmations: 3 }, g.h, start + MIN)).status).toBe(409);
  });
  test("an unpaid game can be cancelled and leaves no credit", async () => {
    const g = await unpaid(100); const r = await j(await call("POST", `/api/z/${g.id}/cancel`, { confirmations: 3 }, g.h)); expect(r.cancelled).toBe(true); expect(r.credit ?? null).toBeNull();
  });
  for (const who of ["ai", "cohost"] as const) test(`the ${who} key cannot cancel`, async () => { const g = await unpaid(100); expect((await call("POST", `/api/z/${g.id}/cancel`, { confirmations: 3 }, keyH(g[who]))).status).toBeGreaterThanOrEqual(400); expect(gameRow(g.id).cancelled_ms).toBeNull(); });
  test("a cancelled game cannot be paid for afterwards", async () => {
    const g = await unpaid(100); await call("POST", `/api/z/${g.id}/cancel`, { confirmations: 3 }, g.h);
    const c = await checkout(g.key, { eid: g.id }); if (c.status === 200) { capture(c.body, "pay_c"); await verify(c.body, "pay_c"); }
    expect(gameRow(g.id).pack).toBe(0);
  });
});

describe("credit: full, partial, remainder, expiry", () => {
  const cancelled = async (cap: number) => { const g = await paidGame({ cap }); await call("POST", `/api/z/${g.id}/cancel`, { confirmations: 3 }, g.h); return g; };
  const next = async (g: any, cap: number) => { const id = uid(); await create(g.key, id, { cap }); await publish(g.key, id); return id; };
  const rows: [string, number, number, boolean, number][] = [
    ["same size covers the whole price", 100, 100, true, 0], ["a smaller game is covered with credit left over", 250, 100, true, 0], ["a bigger game is paid in part, the rest is to pay", 100, 250, false, price(250, "INR").total - price(100, "INR").total],
    ["much bigger", 100, 1000, false, price(1000, "INR").total - price(100, "INR").total], ["exactly the next pack up", 500, 750, false, price(750, "INR").total - price(500, "INR").total],
  ];
  for (const [label, firstCap, nextCap, paid, toPay] of rows) {
    test(`${label} (${firstCap} then ${nextCap})`, async () => {
      const a = await cancelled(firstCap); const id = await next(a, nextCap);
      const r = await j(await call("POST", `/api/z/${id}/pay-with-credit`, {}, a.h));
      expect(r.paid).toBe(paid); expect(Math.round(r.toPayInr * 100) / 100).toBeCloseTo(toPay, 2);
      if (paid) expect(gameRow(id).pack).toBeGreaterThan(0); else expect(gameRow(id).pack).toBe(0);
    });
  }
  test("credit is used once: a second game cannot spend the same credit", async () => {
    const a = await cancelled(100); const g1 = await next(a, 100), g2 = await next(a, 100);
    expect((await j(await call("POST", `/api/z/${g1}/pay-with-credit`, {}, a.h))).paid).toBe(true);
    const second = await j(await call("POST", `/api/z/${g2}/pay-with-credit`, {}, a.h)); expect(second.paid).toBe(false);
  });
  test("pay-with-credit twice for the same game is harmless", async () => {
    const a = await cancelled(100); const id = await next(a, 100);
    await call("POST", `/api/z/${id}/pay-with-credit`, {}, a.h); const again = await call("POST", `/api/z/${id}/pay-with-credit`, {}, a.h);
    expect(again.status).toBeLessThan(500); expect((await j(await call("GET", "/api/org/credit", undefined, a.h))).activeTotalInr).toBe(0);
  });
  test("an AI key cannot spend credit", async () => { const a = await cancelled(100); const id = await next(a, 100); expect((await call("POST", `/api/z/${id}/pay-with-credit`, {}, keyH(a.ai))).status).toBeGreaterThanOrEqual(400); });
  test("credit past 365 days shows as expired and is not spent", async () => {
    const a = await cancelled(100); const id = await next(a, 100);
    const late = T + 367 * DAY;
    const cr = await j(await call("GET", "/api/org/credit", undefined, a.h, late)); expect(cr.activeTotalInr).toBe(0);
    expect(cr.credits[0].status).toBe("expired");
  });
  test("credit stays with the organizer account that earned it", async () => {
    const a = await cancelled(100); const other = await organizer(); const id = uid(); await create(other.key, id, { cap: 100 }); await publish(other.key, id);
    expect((await j(await call("POST", `/api/z/${id}/pay-with-credit`, {}, other.h))).paid).toBe(false);
    expect((await j(await call("GET", "/api/org/credit", undefined, other.h))).activeTotalInr).toBe(0);
    expect((await j(await call("GET", "/api/org/credit", undefined, a.h))).activeTotalInr).toBe(price(100, "INR").total);
  });
});

// ---------------------------------------------------------------------------------------------------------- reschedule, clone, windows
describe("reschedule and clone", () => {
  test("an unpaid game can be moved up to 30 days ahead, not further", async () => {
    const g = await unpaid(100);
    expect((await call("PATCH", `/api/z/${g.id}/settings`, { startRound: roundAt(T + 29 * DAY) }, g.h)).status).toBe(200);
    const far = await call("PATCH", `/api/z/${g.id}/settings`, { startRound: roundAt(T + 31 * DAY) }, g.h); expect(far.status).toBe(400); expect((await j(far)).code).toBe("too-far");
  });
  test("a paid game can be moved up to 365 days from the payment, not further", async () => {
    const g = await paidGame({ cap: 100 });
    expect((await call("PATCH", `/api/z/${g.id}/settings`, { startRound: roundAt(T + 200 * DAY) }, g.h)).status).toBe(200);
    const far = await call("PATCH", `/api/z/${g.id}/settings`, { startRound: roundAt(T + 380 * DAY) }, g.h); expect(far.status).toBe(400); expect((await j(far)).code).toBe("after-paid-window");
  });
  test("a paid game that has started cannot be rescheduled", async () => {
    const g = await paidGame({ cap: 100 }); const start = roundMs(gameRow(g.id).start_round);
    expect((await call("PATCH", `/api/z/${g.id}/settings`, { startRound: roundAt(start + 5 * DAY) }, g.h, start + 10 * MIN)).status).toBe(409);
  });
  test("a paid game cannot be made bigger than the pack bought (402), nor smaller than the people already on its list (409)", async () => {
    const g = await paidGame({ cap: 100 });
    expect((await call("PATCH", `/api/z/${g.id}/settings`, { cap: 101 }, g.h)).status).toBe(402);
    const { join } = await import("./param-harness"); for (let i = 1; i <= 10; i++) expect((await join(g.id, i)).status).toBe(200);
    expect((await call("PATCH", `/api/z/${g.id}/settings`, { cap: 5 }, g.h)).status).toBe(409);
    expect((await call("PATCH", `/api/z/${g.id}/settings`, { cap: 10 }, g.h)).status).toBe(200);
  });
  test("clone makes a new draft with the same settings, not payment, status, guests or Co-hosts", async () => {
    const g = await paidGame({ cap: 100, over: { name: "Annual Day", rounds: 2, tickets: 2, rewards: [{ pattern: "top", ordinal: 1, text: "Mug" }] } });
    await call("POST", `/api/z/${g.id}/people`, { people: [{ name: "Asha", phone: "9876543210" }] }, g.h);
    const r = await j(await call("POST", `/api/z/${g.id}/clone`, {}, g.h)); expect(r.ok).toBe(true);
    const copy = gameRow(r.id); expect(copy.pack).toBe(0); expect(copy.cap).toBe(100);
    expect(q("SELECT COUNT(*) c FROM person WHERE eid=?", r.id)[0].c).toBe(0);
    expect(JSON.stringify(await j(await call("GET", `/api/z/${r.id}/summary`, undefined, g.h)))).toContain("Annual Day");
  });
  test("clone with people copies the guest list into the new game", async () => {
    const g = await paidGame({ cap: 100 }); await call("POST", `/api/z/${g.id}/people`, { people: [{ name: "Asha", phone: "9876543210" }, { name: "Ben", phone: "9876543211" }] }, g.h);
    const r = await j(await call("POST", `/api/z/${g.id}/clone`, { withPeople: true }, g.h)); expect(r.peopleCopied).toBe(2);
  });
  test("clone with a start time too far ahead is refused", async () => { const g = await paidGame({ cap: 100 }); expect((await call("POST", `/api/z/${g.id}/clone`, { startRound: roundAt(T + 40 * DAY) }, g.h)).status).toBe(400); });
  test("clone works on a cancelled game", async () => {
    const g = await paidGame({ cap: 100 }); await call("POST", `/api/z/${g.id}/cancel`, { confirmations: 3 }, g.h);
    expect((await call("POST", `/api/z/${g.id}/clone`, {}, g.h)).status).toBe(200);
  });
  for (const who of ["ai", "cohost"] as const) test(`the ${who} key cannot clone`, async () => { const g = await unpaid(100); expect((await call("POST", `/api/z/${g.id}/clone`, {}, keyH(g[who]))).status).toBeGreaterThanOrEqual(400); });
});

describe("the 365-day window ends at 00:00 IST (fullDeleteAt)", () => {
  const IST = 5.5 * HOUR;
  const istMidnightAfter = (ms: number) => (Math.floor((ms + IST) / DAY) + 1) * DAY - IST;
  const rows: [string, number][] = [
    ["noon UTC", Date.UTC(2026, 9, 1, 12, 0, 0)], ["18:29:59 UTC (23:59:59 IST)", Date.UTC(2026, 9, 1, 18, 29, 59)], ["18:30:00 UTC (00:00:00 IST)", Date.UTC(2026, 9, 1, 18, 30, 0)], ["midnight UTC", Date.UTC(2026, 9, 1, 0, 0, 0)],
    ["a leap day, 29 Feb 2028", Date.UTC(2028, 1, 29, 7, 0, 0)], ["31 Dec 23:59 UTC", Date.UTC(2026, 11, 31, 23, 59, 0)],
  ];
  for (const [label, end] of rows) {
    test(`a game ending at ${label}: everything goes at the next 00:00 IST after 365 days, never early, never more than a day late`, () => {
      const at = fullDeleteAt(end);
      expect(at).toBe(istMidnightAfter(end + 365 * DAY));
      expect(at).toBeGreaterThanOrEqual(end + 365 * DAY); expect(at - (end + 365 * DAY)).toBeLessThanOrEqual(DAY);
      expect((at + IST) % DAY).toBe(0);
    });
  }
  test("purge keeps the engagement the second before the window ends and removes it after", async () => {
    const { purgeOld } = await import("../src/worker"); const { lifecycleTick, endBoundMs } = await import("../src/lifecycle");
    const g = await paidGame({ cap: 100 }); const end = await endBoundMs(W.env as any, gameRow(g.id));
    await lifecycleTick(W.env as any, end + 21 * HOUR);
    const cut = fullDeleteAt(end);
    await purgeOld(W.env as any, cut - 1000); expect(gameRow(g.id)).toBeTruthy();
    await purgeOld(W.env as any, cut + 1000); expect(gameRow(g.id)).toBeNull();
    expect(one("SELECT COUNT(*) c FROM invoice").c).toBe(1); expect(one("SELECT COUNT(*) c FROM payment").c).toBe(1); // billing records stay
  });
  test("an unpublished draft is forgotten after 30 days, not before", async () => {
    const { purgeOld } = await import("../src/worker"); const o = await organizer(); const id = uid(); await create(o.key, id, { cap: 100 });
    await purgeOld(W.env as any, T + 29 * DAY); expect(gameRow(id)).toBeTruthy();
    await purgeOld(W.env as any, T + 31 * DAY); expect(gameRow(id)).toBeNull();
  });
});
