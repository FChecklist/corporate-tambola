// Table-driven tests, part 2: every role against every route. One shared world (built once); each row is its own named test.
// "allowed" means the request got past the door (any answer except 401/403/404, so a 400 for a thin body still counts as reaching the handler).
// "denied" means a stranger's door: 401, 403 or 404, and never a 2xx. Derived from docs/dev/05-ROLES-AND-PERMISSIONS.md and checked against the code.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PLAT, W, call, contact, create, j, keyH, organizer, publish, reset, restore, startIn, HOUR, T, one, q } from "./param-harness";

type Actor = "master" | "ai" | "host" | "cohost" | "otherMaster" | "otherCohost" | "platform" | "partnerKey" | "anonymous" | "wrongKey";
const ACTORS: Actor[] = ["master", "ai", "host", "cohost", "otherMaster", "otherCohost", "platform", "partnerKey", "anonymous", "wrongKey"];
const GID = "MATRIX-1", OTHER = "MATRIX-2";
let keys: Record<Actor, Record<string, string>>;

beforeAll(async () => {
  reset();
  const m = await organizer("matrix@acme.com"), other = await organizer("other@acme.com");
  expect((await create(m.key, GID, { cap: 100 })).status).toBe(200);
  expect((await create(other.key, OTHER, { cap: 100 })).status).toBe(200);
  expect((await publish(m.key, GID)).status).toBe(200);
  const host = (await j(await call("POST", "/api/org/host", { mobile: "9876500009", label: "Priya", email: "priya@acme.com" }, m.h))).hostKey as string;
  const cohost = (await j(await call("POST", "/api/org/cohost", { label: "Ravi", phone: "9876500001", e: GID }, m.h))).cohostKey as string;
  const otherCohost = (await j(await call("POST", "/api/org/cohost", { label: "Zed", phone: "9876500002", e: OTHER }, other.h))).cohostKey as string;
  expect(host).toMatch(/^cth_/); expect(cohost).toMatch(/^ctc_/);
  keys = {
    master: keyH(m.key), ai: keyH(m.ai), host: keyH(host), cohost: keyH(cohost), otherMaster: keyH(other.key), otherCohost: keyH(otherCohost), platform: PLAT,
    partnerKey: { "x-partner": "ctp_" + "a".repeat(40) }, anonymous: {}, wrongKey: keyH("ctk_" + "0".repeat(48)),
  };
});
afterAll(restore);

interface Row { name: string; method: string; path: string; body?: unknown; allowed: Actor[] }
const ROWS: Row[] = [
  { name: "read a game's summary", method: "GET", path: `/api/z/${GID}/summary`, allowed: ["master", "ai", "host", "platform"] },
  { name: "change a game's settings", method: "PATCH", path: `/api/z/${GID}/settings`, body: { name: "Team night" }, allowed: ["master", "ai", "host", "platform"] },
  { name: "post an announcement", method: "POST", path: `/api/z/${GID}/announce`, body: { text: "Hello all" }, allowed: ["master", "ai", "host", "platform"] },
  { name: "list participants", method: "GET", path: `/api/z/${GID}/participants`, allowed: ["master", "ai", "host", "platform"] },
  { name: "open names of participants", method: "GET", path: `/api/z/${GID}/names?pids=abc`, allowed: ["master", "host", "platform"] },
  { name: "read the cancel preview", method: "GET", path: `/api/z/${GID}/cancel-preview`, allowed: ["master", "host", "platform"] },
  { name: "read the life clock", method: "GET", path: `/api/z/${GID}/life`, allowed: ["master", "ai", "host", "platform"] },
  { name: "clone a game", method: "POST", path: `/api/z/${GID}/clone`, body: {}, allowed: ["master", "host", "platform"] },
  { name: "see the people list", method: "GET", path: `/api/z/${GID}/people`, allowed: ["master", "host", "cohost", "platform"] },
  { name: "export the people list", method: "GET", path: `/api/z/${GID}/people/export`, allowed: ["master", "host", "platform"] },
  { name: "make a pay link", method: "POST", path: `/api/z/${GID}/paylink`, body: {}, allowed: ["master", "host", "cohost"] },
  { name: "read the Co-host page of a game", method: "GET", path: `/api/z/${GID}/cohost`, allowed: ["master", "ai", "host", "cohost", "platform"] },
  { name: "create a game", method: "POST", path: "/api/z", body: { id: "MATRIX-NEW", startRound: startIn(2 * HOUR), callSeconds: 6, cap: 100 }, allowed: ["master", "ai", "platform"] },
  { name: "add a Host", method: "POST", path: "/api/org/host", body: { mobile: "9876500077", label: "X" }, allowed: ["master"] },
  { name: "add a Co-host", method: "POST", path: "/api/org/cohost", body: { label: "New", phone: "9876500055", e: GID }, allowed: ["master", "host"] },
  { name: "read the team list", method: "GET", path: "/api/org/team", allowed: ["master", "ai", "host"] },
  { name: "read the key list", method: "GET", path: "/api/org/keys", allowed: ["master"] },
  { name: "read the credit", method: "GET", path: "/api/org/credit", allowed: ["master", "host"] },
  { name: "close the organizer account (without confirming)", method: "POST", path: "/api/org/close", body: {}, allowed: ["master"] },
  { name: "read the game history", method: "GET", path: "/api/history", allowed: ["master", "ai", "host", "platform"] },
  { name: "ask who am I", method: "GET", path: "/api/whoami", allowed: ["master", "ai", "host", "cohost", "otherMaster", "otherCohost", "platform"] },
  { name: "read the owner's mode switch", method: "GET", path: "/api/owner/mode", allowed: ["platform"] },
  { name: "read the owner's visits summary", method: "GET", path: "/api/owner/visits/summary", allowed: ["platform"] },
  { name: "read the owner's data-request queue", method: "GET", path: "/api/owner/data-requests", allowed: ["platform"] },
  { name: "run the lifecycle tick", method: "POST", path: "/api/lifecycle/tick", body: {}, allowed: ["platform"] },
  { name: "run the purge", method: "POST", path: "/api/purge", body: {}, allowed: ["platform"] },
  { name: "publish notices", method: "POST", path: "/api/notices", body: { notices: [] }, allowed: ["platform"] },
];
// An other organizer's key (or Co-host of another game) is a stranger to GID's routes, but is a valid key for account-level routes.
const ACCOUNT_LEVEL = new Set(["/api/z", "/api/org/host", "/api/org/cohost", "/api/org/team", "/api/org/keys", "/api/org/credit", "/api/org/close", "/api/history", "/api/whoami", "/api/notices"]);

for (const row of ROWS) {
  for (const actor of ACTORS) {
    // account-level routes act on the caller's own account, so another organizer's master key is "allowed" there (it is their own account)
    const own = ACCOUNT_LEVEL.has(row.path.split("?")[0]!);
    const allowed = row.allowed.includes(actor) || (own && actor === "otherMaster" && row.allowed.includes("master"));
    test(`${actor} ${allowed ? "may" : "may not"} ${row.name} (${row.method} ${row.path.replace(GID, "{id}")})`, async () => {
      const path = row.path === "/api/z" ? row.path : row.path;
      const body = row.path === "/api/z" ? { ...(row.body as object), id: "MX-" + actor + Math.floor(Math.random() * 1e6).toString(36) } : row.body;
      const r = await call(row.method, path, body, keys[actor]);
      if (allowed) expect([401, 403, 404]).not.toContain(r.status);
      else { expect([401, 403, 404]).toContain(r.status); }
      expect(r.status).toBeLessThan(500);
      if (!allowed) { const text = JSON.stringify(await j(r)); expect(text).not.toMatch(/ctk_|cta_|cth_|ctc_/); } // a refusal never leaks a key
    });
  }
}

describe("the doors that need more than a key", () => {
  test("a Co-host key bound to another game cannot read this game's Co-host page", async () => {
    expect([403, 404]).toContain((await call("GET", `/api/z/${GID}/cohost`, undefined, keys.otherCohost)).status);
  });
  test("a stranger's master key is refused on a game that exists and on one that does not, and neither answer carries any game data (the id's existence is observable, by design: ids hold no personal data)", async () => {
    const a = await call("GET", `/api/z/${GID}/summary`, undefined, keys.otherMaster), b = await call("GET", `/api/z/NO-SUCH-GAME/summary`, undefined, keys.otherMaster);
    expect([403, 404]).toContain(a.status); expect([403, 404]).toContain(b.status);
    const ta = JSON.stringify(await j(a)); expect(ta).not.toMatch(/startMs|cap|participants|boss@|matrix@/);
  });
  test("a key placed in the Authorization header works like the x-organizer header", async () => {
    const k = Object.values(keys.master)[0]!;
    expect((await call("GET", `/api/z/${GID}/summary`, undefined, { authorization: "Bearer " + k })).status).toBe(200);
  });
  test("a revoked key stops working at once", async () => {
    const o = await organizer(); const k2 = (await j(await call("POST", "/api/auth/email", { email: o.email }))).ok;
    expect(k2).toBe(true);
    const list = await j(await call("GET", "/api/org/keys", undefined, o.h));
    const other = list.keys.find((x: any) => !x.thisOne && x.kind === "ai");
    expect(other).toBeTruthy();
    expect((await call("POST", "/api/org/keys/revoke", { id: other.id }, o.h)).status).toBe(200);
    expect((await call("GET", "/api/whoami", undefined, o.aiH)).status).toBe(403);
  });
  test("the platform key never appears in any answer a normal user can read", async () => {
    const text = JSON.stringify(await j(await call("GET", `/api/z/${GID}/summary`, undefined, keys.master)));
    expect(text).not.toContain("plat\"");
  });
});
