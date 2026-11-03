// rc/tambola-1.8.5 fix round 1 (UC-5): an ACCOUNT email (sign-up, sign-in code, verify, adding a Host or Co-host) is never glued together.
// A space INSIDE is refused. (A participant's Email ID in a game is the other rule: inner spaces are removed. That is tested in cleaner.test.ts.)
// Test addresses: demoN@demo-test.invalid only.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { World, NEW_T, j } from "./helpers";

let w: World; let n = 0;
beforeEach(() => { w = new World(); });
afterEach(() => { w.restore(); });
const post = (path: string, body: unknown, key?: string) => w.call(NEW_T, "POST", path, body, key);
const WORK = "Please enter a valid work email.";

describe("UC-5: account sign-up and sign-in emails refuse an inner space", () => {
  test("/api/start, /api/auth/email and /api/auth/verify: 'demo1 x@demo-test.invalid' -> 400 'Please enter a valid work email.' (or the code message), never glued into another address", async () => {
    for (const bad of ["demo1 x@demo-test.invalid", "demo1@demo-test .invalid", "demo1 x@demo-test.invalid", "demo１ x＠demo-test.invalid"]) {
      for (const path of ["/api/start", "/api/auth/email"]) {
        const r = await post(path, { email: bad }); const b = await j(r);
        expect([bad, path, r.status, b.error]).toEqual([bad, path, 400, WORK]);
      }
      const v = await post("/api/auth/verify", { email: bad, code: "123456" });
      expect([bad, v.status]).toEqual([bad, 400]); // refused too: it must not find the glued address's pending code
    }
  });
  test("the same address without the inner space is accepted, and spaces at the two ends, capitals and the full-width at-sign are still tidied", async () => {
    for (const ok of ["demo1x@demo-test.invalid", "  Demo1X@Demo-Test.Invalid \n", "demo1x＠demo-test.invalid"]) {
      const r = await w.call(NEW_T, "POST", "/api/start", { email: ok }); const b = await j(r);
      expect([ok, r.status, b.error ?? null]).toEqual([ok, 200, null]);
    }
  });
  test("adding a Host with an inner space in the email is refused (400); the same address without it is taken", async () => {
    const m = await w.game(NEW_T, "ACC-1");
    const r = await w.call(NEW_T, "POST", "/api/org/host", { name: "H", email: "demo9 x@demo-test.invalid" }, m); const b = await j(r);
    expect([r.status, String(b.error)]).toEqual([400, "That e-mail address does not look right. Please check it."]);
    const ok = await w.call(NEW_T, "POST", "/api/org/host", { name: "H", email: "demo9x@demo-test.invalid" }, m);
    expect(ok.status).toBe(200);
  });
});
