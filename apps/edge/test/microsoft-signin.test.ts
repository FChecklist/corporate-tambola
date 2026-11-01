// "Continue with Microsoft" (docs/MICROSOFT_SIGNIN_SETUP.md). Microsoft is replaced by a fake signing key (google-fake.ts makeIdp): no test calls Microsoft.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { setMicrosoftKeyProvider, verifyMicrosoftIdToken } from "../src/microsoft";
import { makeD1 } from "./d1-sqlite";
import { makeIdp, type Idp } from "./google-fake";
import { readFileSync } from "node:fs";

const T = Date.UTC(2026, 10, 1, 10, 0, 0);
const MS_ID = "11111111-2222-3333-4444-555555555555", TID = "72f988bf-86f1-41af-91ab-2d7cd011db47", PERSONAL = "9188040d-6c67-4c5d-b112-36a304b66dad", NONCE = "n0nce-n0nce-n0nce-1234";
const tokenClaims = (email: string | undefined, over: Record<string, unknown> = {}) => ({
  iss: `https://login.microsoftonline.com/${TID}/v2.0`, aud: MS_ID, tid: TID, sub: "AAA-sub", oid: "oid-9", nonce: NONCE, name: "Secret Name", email,
  iat: Math.floor(T / 1000) - 5, nbf: Math.floor(T / 1000) - 5, exp: Math.floor(T / 1000) + 3000, ...over,
});
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"]; let idp: Idp; const realFetch = globalThis.fetch; let msCalls = 0;
const call = (method: string, path: string, body?: unknown, key?: string, now = T, ipAddr = "8.8.8.8") =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": ipAddr, ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env as any, now);
const j = async (r: Response) => (await r.json()) as any;
const ms = (credential: string, intent = "signup", extra: Record<string, unknown> = {}, ipAddr = "8.8.8.8") => call("POST", "/api/auth/microsoft", { credential, nonce: NONCE, intent, ...extra }, undefined, T, ipAddr);

beforeEach(async () => {
  const d = makeD1(); raw = d.raw; msCalls = 0; idp = await makeIdp();
  setMicrosoftKeyProvider(async () => [idp.jwk]);
  (globalThis as any).fetch = async (u: string) => { if (/microsoft/i.test(String(u))) msCalls++; return new Response("{}", { status: 404 }); };
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000", PUBLIC_ORIGIN: "http://x", MICROSOFT_CLIENT_ID: MS_ID } as PayEnv;
});
afterEach(() => { globalThis.fetch = realFetch; setMicrosoftKeyProvider(); });

describe("configuration: no client id, no button, no route", () => {
  test("/api/auth/config carries both ids (or null); POST /api/auth/microsoft answers 404 when none is set", async () => {
    expect(await j(await call("GET", "/api/auth/config"))).toEqual({ google: null, microsoft: MS_ID });
    delete env.MICROSOFT_CLIENT_ID;
    expect(await j(await call("GET", "/api/auth/config"))).toEqual({ google: null, microsoft: null });
    expect((await ms(await idp.sign(tokenClaims("a@acme.com")))).status).toBe(404);
    env.MICROSOFT_CLIENT_ID = "not-a-guid"; expect((await j(await call("GET", "/api/auth/config"))).microsoft).toBeNull();
  });
});

describe("the token is really checked", () => {
  test("a good token verifies, from a work tenant or a personal account, and returns the lower-cased e-mail only", async () => {
    expect(await verifyMicrosoftIdToken(env, await idp.sign(tokenClaims("Sam@Acme.COM")), NONCE, T)).toEqual({ ok: true, email: "sam@acme.com" });
    const personal = tokenClaims("p@outlook.com", { tid: PERSONAL, iss: `https://login.microsoftonline.com/${PERSONAL}/v2.0` });
    expect(await verifyMicrosoftIdToken(env, await idp.sign(personal), NONCE, T)).toEqual({ ok: true, email: "p@outlook.com" });
  });
  test("with no email claim, preferred_username is used only when it looks like an e-mail address", async () => {
    expect(await verifyMicrosoftIdToken(env, await idp.sign(tokenClaims(undefined, { preferred_username: "Kim@Contoso.com" })), NONCE, T)).toEqual({ ok: true, email: "kim@contoso.com" });
    for (const name of ["kim", "kim contoso", "k@x", ""]) expect((await verifyMicrosoftIdToken(env, await idp.sign(tokenClaims(undefined, { preferred_username: name })), NONCE, T)).ok).toBe(false);
  });
  test("every way a token can be wrong is refused", async () => {
    const other = await makeIdp("fake-kid-1");
    const good = await idp.sign(tokenClaims("a@acme.com"));
    const [h, p, s] = good.split("."); const forged = Buffer.from(JSON.stringify(tokenClaims("boss@bigco.com"))).toString("base64url");
    const cases: Array<[string, string, string]> = [
      ["tampered payload", `${h}.${forged}.${s}`, "signature"], ["signed by another key", await other.sign(tokenClaims("a@acme.com")), "signature"],
      ["unknown key id", await idp.sign(tokenClaims("a@acme.com"), { kid: "nope" }), "key"],
      ["wrong audience", await idp.sign(tokenClaims("a@acme.com", { aud: "99999999-2222-3333-4444-555555555555" })), "claims"],
      ["issuer of another tenant", await idp.sign(tokenClaims("a@acme.com", { iss: `https://login.microsoftonline.com/${PERSONAL}/v2.0` })), "claims"],
      ["issuer not Microsoft", await idp.sign(tokenClaims("a@acme.com", { iss: "https://evil.example/" + TID + "/v2.0" })), "claims"],
      ["tenant id not a guid", await idp.sign(tokenClaims("a@acme.com", { tid: "common", iss: "https://login.microsoftonline.com/common/v2.0" })), "claims"],
      ["expired", await idp.sign(tokenClaims("a@acme.com", { exp: Math.floor(T / 1000) - 1 })), "expired"],
      ["not yet valid (nbf)", await idp.sign(tokenClaims("a@acme.com", { nbf: Math.floor(T / 1000) + 3600 })), "claims"],
      ["issued in the future", await idp.sign(tokenClaims("a@acme.com", { iat: Math.floor(T / 1000) + 3600 })), "claims"],
      ["wrong nonce", await idp.sign(tokenClaims("a@acme.com", { nonce: "someone-elses-nonce-12345" })), "nonce"],
      ["no nonce in the token", await idp.sign(tokenClaims("a@acme.com", { nonce: undefined })), "nonce"],
      ["no usable e-mail", await idp.sign(tokenClaims(undefined)), "claims"],
      ["alg none", `${Buffer.from(JSON.stringify({ alg: "none", kid: idp.kid })).toString("base64url")}.${p}.`, "format"], ["alg HS256", await idp.sign(tokenClaims("a@acme.com"), { alg: "HS256" }), "format"],
      ["garbage", "not.a.token!", "format"], ["empty", "", "format"],
    ];
    for (const [why, token, reason] of cases) { const v = await verifyMicrosoftIdToken(env, token, NONCE, T); expect([why, v.ok, (v as any).why]).toEqual([why, false, reason]); }
    expect(await verifyMicrosoftIdToken(env, 12345, NONCE, T)).toEqual({ ok: false, why: "format" });
    expect(await verifyMicrosoftIdToken(env, good, "short", T)).toEqual({ ok: false, why: "nonce" });
    expect(await verifyMicrosoftIdToken(env, good, undefined, T)).toEqual({ ok: false, why: "nonce" });
  });
  test("the signing keys are fetched once and kept; an unknown key id does not make the Worker hammer Microsoft", async () => {
    let asked = 0; setMicrosoftKeyProvider(async () => { asked++; return [idp.jwk]; });
    for (let i = 0; i < 3; i++) expect((await verifyMicrosoftIdToken(env, await idp.sign(tokenClaims("a@acme.com")), NONCE, T + i)).ok).toBe(true);
    expect(asked).toBe(1);
    for (let i = 0; i < 4; i++) await verifyMicrosoftIdToken(env, await idp.sign(tokenClaims("a@acme.com"), { kid: "other" + i }), NONCE, T + 10_000 + i);
    expect(asked).toBe(1);
  });
});

describe("POST /api/auth/microsoft does what the e-mail code does", () => {
  test("sign up with a new e-mail makes the Organizer account; the console key works", async () => {
    const r = await ms(await idp.sign(tokenClaims("new@acme.com")));
    expect(r.status).toBe(200); const b = await j(r);
    expect(b).toMatchObject({ ok: true, created: true }); expect(b.token).toMatch(/^ctk_[0-9a-f]{48}$/);
    expect((await j(await call("GET", "/api/whoami", undefined, b.token))).kind).toBe("master");
    expect((raw.prepare("SELECT COUNT(*) AS c FROM organizer_email").get() as any).c).toBe(1);
  });
  test("an existing account signs in with either intent: a fresh key, no second account", async () => {
    const first = await j(await ms(await idp.sign(tokenClaims("old@acme.com"))));
    for (const intent of ["signin", "signup"]) {
      const r = await j(await ms(await idp.sign(tokenClaims("OLD@acme.com")), intent));
      expect(r).toMatchObject({ ok: true, created: false }); expect(r.token).not.toBe(first.token); expect(r.aiKey).toBeUndefined();
    }
    expect((raw.prepare("SELECT COUNT(*) AS c FROM organizer_email").get() as any).c).toBe(1);
  });
  test("sign in with an e-mail that has no account is a calm 404 naming Microsoft; makes nothing", async () => {
    const r = await ms(await idp.sign(tokenClaims("nobody@acme.com")), "signin");
    expect(r.status).toBe(404); const b = await j(r); expect(b.code).toBe("no-account"); expect(b.error).toContain("Microsoft e-mail");
    expect((raw.prepare("SELECT COUNT(*) AS c FROM organizer_email").get() as any).c).toBe(0);
  });
  test("a bad token answers 400 'microsoft-failed'; a wrong nonce too; an unknown intent is refused", async () => {
    const r = await ms(await idp.sign(tokenClaims("x@acme.com", { aud: "99999999-2222-3333-4444-555555555555" })));
    expect(r.status).toBe(400); expect((await j(r)).code).toBe("microsoft-failed");
    expect((await call("POST", "/api/auth/microsoft", { credential: await idp.sign(tokenClaims("x@acme.com")), nonce: "another-nonce-1234567", intent: "signup" })).status).toBe(400);
    expect((await ms(await idp.sign(tokenClaims("x@acme.com")), "admin")).status).toBe(400);
    expect((raw.prepare("SELECT COUNT(*) AS c FROM organizer_key").get() as any).c).toBe(0);
  });
  test("the same limits as the e-mail sign-in: 20 failures from one network then 429", async () => {
    for (let i = 0; i < 20; i++) expect((await ms("a.b.c", "signin", {}, "6.6.6.6")).status).toBe(400);
    expect((await ms(await idp.sign(tokenClaims("ok@acme.com")), "signup", {}, "6.6.6.6")).status).toBe(429);
    expect((await ms(await idp.sign(tokenClaims("ok@acme.com")), "signup", {}, "6.6.6.7")).status).toBe(200);
  });
  test("it stores only the e-mail: no name, object id, tenant id or sub is kept, and Microsoft is never called", async () => {
    await ms(await idp.sign(tokenClaims("kept@acme.com", { name: "Secret Name", sub: "SUB-999", oid: "OID-777", given_name: "Secret" })));
    const all = JSON.stringify([raw.prepare("SELECT * FROM kv").all(), raw.prepare("SELECT * FROM organizer_key").all(), raw.prepare("SELECT * FROM organizer_email").all()]);
    for (const leak of ["Secret", "SUB-999", "OID-777", TID, "AAA-sub"]) expect(all).not.toContain(leak);
    expect(msCalls).toBe(0);
  });
  test("a Google route still answers 404 when only Microsoft is set up, and the other way round", async () => {
    expect((await call("POST", "/api/auth/google", { credential: "a.b.c", intent: "signin" })).status).toBe(404);
  });
});

describe("the pages and the security rules", () => {
  const read = (p: string) => readFileSync(new URL("../../../" + p, import.meta.url), "utf8");
  test("the sign-in script uses PKCE, a state and a nonce, holds no secret, and only talks to login.microsoftonline.com and our own API", () => {
    const js = read("apps/web/public/google.js");
    expect(js).toContain("code_challenge_method: \"S256\""); expect(js).toContain("code_verifier"); expect(js).toContain("state"); expect(js).toContain("nonce");
    expect(js).not.toMatch(/client_secret/i);
    expect(js).toContain("e.origin !== location.origin"); // the code comes only from our own callback page
    expect(read("apps/web/public/ms-callback.js")).toContain("location.origin"); // posted to our own origin only
  });
  test("login.microsoftonline.com is allowed only in the sign-in pages' connect rule (signin, index, zc), never anywhere else", () => {
    const b = read("pages/build.mjs");
    const defs = b.split("\n").filter((l) => /^const (CSP|PAYCSP|GAMECSP|PLAINCSP|GOOGLECSP) /.test(l));
    for (const l of defs) { const has = l.includes("login.microsoftonline.com"); expect([l.slice(0, 14), has]).toEqual([l.slice(0, 14), l.startsWith("const GOOGLECSP")]); }
    expect(b).toContain('["/ms-callback", PLAINCSP, true]');
  });
});
