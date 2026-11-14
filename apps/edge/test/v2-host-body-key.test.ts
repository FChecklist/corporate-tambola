// V2 audit round 7: a Host key made for one game (no personal data) must never turn into a lasting account key, by ANY route: not through Google sign-in (the key travels in the request body, not a header), not through the first-open e-mail steps.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { T, W, call, j, keyH, paidGame, q, reset, restore } from "./param-harness";
import { labelHost } from "./v2-helpers";
import { CLIENT_ID, claims, makeIdp, trust } from "./google-fake";

beforeEach(() => reset());
afterEach(restore);

describe("a game-only Host key cannot be made lasting", () => {
  test("Google sign-in with the key in the body is refused, and no new key appears", async () => {
    const g = await paidGame(); const lh = await labelHost(g);
    (W.env as any).GOOGLE_CLIENT_ID = CLIENT_ID; const idp = await makeIdp(); trust(idp);
    const before = (q("SELECT COUNT(*) AS c FROM organizer_key", )[0] as { c: number }).c;
    const r = await call("POST", "/api/auth/google", { credential: await idp.sign(claims("attacker@evil.com", T)), intent: "host", hostKey: lh, consent: { K5: true } });
    expect(r.status).toBe(400); expect((await j(r)).code).toBe("host-link-gone");
    expect((q("SELECT COUNT(*) AS c FROM organizer_key")[0] as { c: number }).c).toBe(before);
    expect(q("SELECT 1 FROM host_login").length).toBe(0);
    expect((await call("GET", "/api/org/team", undefined, keyH(lh))).status).toBe(403); // and the key is still only a game key
  });
  test("the first-open e-mail steps are refused for it", async () => {
    const g = await paidGame(); const lh = await labelHost(g);
    for (const p of ["/api/host/setup/email", "/api/host/setup/email/verify", "/api/host/setup/mobile"]) {
      const r = await call("POST", p, { email: "x@y.com", code: "123456", mobile: "9876543210" }, keyH(lh)); expect([401, 403, 404]).toContain(r.status);
    }
    expect(q("SELECT 1 FROM host_login").length).toBe(0);
  });
  test("a key copied by the device-key step keeps its game scope", async () => {
    const g = await paidGame(); const lh = await labelHost(g);
    const { mintDeviceKey } = await import("../src/hostsetup");
    const hid = (q("SELECT hash FROM organizer_key WHERE scope_kind='lh'")[0] as { hash: string }).hash;
    await mintDeviceKey(W.env as any, hid, "cth_" + "a".repeat(48), T);
    const copies = q("SELECT scope_eid, scope_kind FROM organizer_key WHERE host_id=? AND hash<>?", hid, hid) as any[];
    expect(copies.length).toBe(1); expect(copies[0].scope_eid).toBe(g.id); expect(copies[0].scope_kind).toBe("lh");
    void lh;
  });
});
