// One-time prospect links (src/prospect-links.ts): made from the owner's console with their own key, usable once by one account, ended by a date or by the owner's switch.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DAY, T, call, create, j, keyH, one, organizer, publish, reset, restore, uid } from "./param-harness";

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
