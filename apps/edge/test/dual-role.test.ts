// One e-mail, two roles (owner, 2026-10-23): a person who is an Organizer AND a Host signs in once and holds both keys; a Host can start their own games by making
// an Organizer account with the same e-mail (Terms box K2); a Host can sign in with the one-tap link as well as the code; whoami says which role a key is.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { setGoogleKeyProvider } from "../src/google";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 8, 10, 0, 0);
const FAR_START = Math.floor(((T + 2 * 86_400_000) / 1000 - 1692803367) / 3) + 1;
let env: PayEnv; let ip = 0;
const call = (method: string, path: string, body?: unknown, key?: string, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": `9.9.9.${++ip}`, ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env as Env, now);
const j = async (r: Response) => (await r.json()) as any;
beforeEach(() => { const d = makeD1({ strictHosts: true }); env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000", PUBLIC_ORIGIN: "http://x", TEST_MODE: "1" } as PayEnv; });
afterEach(() => setGoogleKeyProvider());

const organizer = async (email: string, gameId: string) => {
  const st = await j(await call("POST", "/api/start", { email }));
  await call("POST", "/api/z", { id: gameId, startRound: FAR_START, callSeconds: 9, cap: 100 }, st.token);
  return st.token as string;
};
/** Makes a Host with a confirmed e-mail and mobile number (the real routes). */
const confirmedHost = async (master: string, email: string) => {
  const h = await j(await call("POST", "/api/org/host", { label: "Priya", email }, master));
  const s = await j(await call("POST", "/api/host/setup/email", { email }, h.hostKey));
  const v = await j(await call("POST", "/api/host/setup/email/verify", { code: s.devCode }, h.hostKey));
  await call("POST", "/api/host/setup/mobile", { mobile: "9876500011" }, v.token);
  return v.token as string;
};
const signIn = async (email: string) => { const s = await j(await call("POST", "/api/auth/email", { email })); return { code: s.devCode as string, link: s.devToken as string }; };

describe("a Host signs in with the code or the one-tap link", () => {
  test("the link signs a Host in once (kind host, ready); a second use fails", async () => {
    const master = await organizer("boss@acme.com", "G-ONE"); await confirmedHost(master, "p@acme.com");
    const s = await signIn("p@acme.com");
    const r = await j(await call("POST", "/api/auth/link", { token: s.link }));
    expect(r).toMatchObject({ ok: true, kind: "host", roles: ["host"] }); expect(r.token).toMatch(/^cth_/); expect(r.alt).toBeUndefined();
    expect((await call("POST", "/api/auth/link", { token: s.link })).status).toBe(400);
    expect((await j(await call("GET", "/api/whoami", undefined, r.token))).kind).toBe("host");
  });
  test("an Organizer-only e-mail is told it is an Organizer (roles: organizer) and whoami says master", async () => {
    const master = await organizer("boss@acme.com", "G-TWO"); expect((await j(await call("GET", "/api/whoami", undefined, master))).kind).toBe("master");
    const s = await signIn("boss@acme.com"); const v = await j(await call("POST", "/api/auth/verify", { email: "boss@acme.com", code: s.code }));
    expect(v).toMatchObject({ ok: true, kind: "organizer", roles: ["organizer"] }); expect(v.alt).toBeUndefined(); expect(v.token).toMatch(/^ctk_/);
  });
});

describe("a Host who also wants to be an Organizer", () => {
  test("needs the Terms box; then the same e-mail is an Organizer too, and the next sign-in gives BOTH keys", async () => {
    const master = await organizer("boss@acme.com", "G-THREE"); const hostKey = await confirmedHost(master, "p@acme.com");
    const refused = await call("POST", "/api/host/become-organizer", {}, hostKey); expect(refused.status).toBe(400); // K2 not ticked
    const ok = await j(await call("POST", "/api/host/become-organizer", { consent: { v: (await import("../src/consent-text.json")).default.version, boxes: Object.keys((await import("../src/consent-text.json")).default.K2) } }, hostKey));
    expect(ok).toMatchObject({ ok: true, kind: "organizer" }); expect(ok.token).toMatch(/^ctk_/);
    expect((await j(await call("GET", "/api/whoami", undefined, ok.token))).kind).toBe("master");
    // the new Organizer account is the Host's OWN: a game made with it is not in the first organizer's list
    expect((await call("POST", "/api/z", { id: "OWN-1", startRound: FAR_START, callSeconds: 9, cap: 100 }, ok.token)).status).toBe(200);
    const mine = await j(await call("GET", "/api/history", undefined, ok.token)); expect(mine.engagements.map((e: any) => e.id)).toEqual(["OWN-1"]);
    const theirs = await j(await call("GET", "/api/history", undefined, master)); expect(theirs.engagements.map((e: any) => e.id)).not.toContain("OWN-1");
    // sign in again: one proof of the e-mail, two keys
    const s = await signIn("p@acme.com"); const v = await j(await call("POST", "/api/auth/verify", { email: "p@acme.com", code: s.code }));
    expect(v).toMatchObject({ ok: true, kind: "organizer", roles: ["organizer", "host"] }); expect(v.token).toMatch(/^ctk_/); expect(v.alt).toMatchObject({ kind: "host" }); expect(v.alt.token).toMatch(/^cth_/);
    expect((await j(await call("GET", "/api/whoami", undefined, v.token))).kind).toBe("master"); expect((await j(await call("GET", "/api/whoami", undefined, v.alt.token))).kind).toBe("host");
    // the Host view still lists the games of the org they host for; the Organizer view lists their own
    expect((await j(await call("GET", "/api/history", undefined, v.alt.token))).engagements.map((e: any) => e.id)).toEqual(["G-THREE"]);
    expect((await j(await call("GET", "/api/history", undefined, v.token))).engagements.map((e: any) => e.id)).toEqual(["OWN-1"]);
  });
  test("a second try is told they already have an Organizer account; a stranger or an Organizer key is refused", async () => {
    const master = await organizer("boss@acme.com", "G-FOUR"); const hostKey = await confirmedHost(master, "p@acme.com");
    const consent = { v: (await import("../src/consent-text.json")).default.version, boxes: Object.keys((await import("../src/consent-text.json")).default.K2) };
    expect((await call("POST", "/api/host/become-organizer", { consent }, hostKey)).status).toBe(200);
    expect((await call("POST", "/api/host/become-organizer", { consent }, hostKey)).status).toBe(409);
    expect((await call("POST", "/api/host/become-organizer", { consent }, master)).status).toBe(403);
    expect((await call("POST", "/api/host/become-organizer", { consent })).status).toBe(403);
  });
});
