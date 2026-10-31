// rc/tambola-1.8.5 audit fixes, engine side: A (Host first-open e-mail), D (idKind locked once people exist), G (endedAtMs in the public info). Real Worker, in-memory database.
// Run: bun test --isolate apps/edge/test/rc185/audit-fixes.test.ts      Test addresses: demoN@demo-test.invalid only.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { World, NEW_T, OLD_T, GEN, roundAt, dev, j } from "./helpers";
import { emailHashOf } from "../../src/hostsetup";
import { normAccountEmail, normEmail } from "../../src/empid";
import { endBoundMs, lifecycleTick } from "../../src/lifecycle";
import { sealText } from "../../src/pii";

let w: World;
beforeEach(() => { w = new World(true); });
afterEach(() => { w.restore(); });
const count = (sql: string, ...v: string[]) => (w.raw.prepare(sql).get(...v) as { c: number }).c;
const roundMs = (r: number) => (GEN + (r - 1) * 3) * 1000;

// ------------------------------------------------------------------------------------------------ A
describe("A: POST /api/host/setup/email (the Host's first open) reads the address like every other account e-mail", () => {
  const WRONG = "Please enter a valid e-mail address.";
  /** A game, and a Host added by mobile only (so any e-mail may be typed), returns the Host's personal link key. */
  const host = async (extra: Record<string, unknown> = { mobile: "9876500002" }) => {
    const m = await w.game(NEW_T, "ACC-1");
    const h = await j(await w.call(NEW_T, "POST", "/api/org/host", { label: "Hema", ...extra }, m));
    expect(typeof h.hostKey).toBe("string");
    return h.hostKey as string;
  };
  const setup = (key: string, email: string) => w.call(NEW_T, "POST", "/api/host/setup/email", { email }, key);
  const codes = () => count("SELECT COUNT(*) c FROM login_code");

  test("an inner space is refused with the plain sentence, and no code is made or sent", async () => {
    const k = await host(); const before = codes();
    for (const bad of ["john doe@acme.com", "john doe＠acme.com", "john@acme .com", "jo hn@acme.com", " john doe@acme.com ", "john\tdoe@acme.com", "john doe@acme.com"]) {
      const r = await setup(k, bad); const b = await j(r);
      expect([bad, r.status, b.error]).toEqual([bad, 400, WRONG]);
    }
    expect(codes()).toBe(before);
    expect(count("SELECT COUNT(*) c FROM outbox WHERE to_addr LIKE '%acme.com%'")).toBe(0);
  });
  test("the same address without the inner space is accepted and gets exactly one code mail", async () => {
    const k = await host(); const r = await setup(k, "johndoe@acme.com");
    expect([r.status, (await j(r)).error ?? null]).toEqual([200, null]);
    expect(count("SELECT COUNT(*) c FROM outbox WHERE to_addr='johndoe@acme.com'")).toBe(1);
  });
  test("spaces at the two ends, capitals and the full-width at-sign are tidied, as for sign-up", async () => {
    for (const ok of ["  johndoe@acme.com \n", "JohnDoe@ACME.com", "johndoe＠acme.com", "  JOHNDOE＠Acme.Com\t"]) {
      w.reset(); const k = await host(); const r = await setup(k, ok);
      expect([ok, r.status, (await j(r)).error ?? null]).toEqual([ok, 200, null]);
      expect([ok, count("SELECT COUNT(*) c FROM outbox WHERE to_addr='johndoe@acme.com'")]).toEqual([ok, 1]);
    }
  });
  test("an address on file is compared in the same form as the typed one: capitals, end spaces and the full-width at-sign match; an inner space is refused as invalid, not as 'another address'", async () => {
    const k = await host({ email: "jane.roe@acme.com", mobile: "9876500002" });
    // an address kept in another form (a Host added before this fix, or by hand): the stored text is read in the account form too
    w.raw.prepare("UPDATE organizer_key SET email_sealed=? WHERE kind='host'").run(await sealText(w.env as any, "  Jane.Roe＠ACME.com "));
    const ok = await setup(k, "  JANE.ROE＠Acme.com "); expect([ok.status, (await j(ok)).error ?? null]).toEqual([200, null]);
    const bad = await setup(k, "jane. roe@acme.com"); expect([bad.status, (await j(bad)).error]).toEqual([400, WRONG]);
    const other = await setup(k, "mallory@acme.com"); expect([other.status, (await j(other)).code]).toEqual([409, "email-mismatch"]);
  });
  test("the code is stored under the same hash the login routes use for that address (emailHashOf = normAccountEmail form)", async () => {
    const k = await host(); await setup(k, "  JohnDoe＠ACME.com ");
    const hash = await emailHashOf("johndoe@acme.com");
    expect(count("SELECT COUNT(*) c FROM login_code WHERE email_hash=?", hash)).toBe(1);
    expect(await emailHashOf("johndoe@acme.com")).toBe(await emailHashOf("  JohnDoe＠ACME.com "));
    expect(await emailHashOf("john doe@acme.com")).not.toBe(await emailHashOf("johndoe@acme.com")); // an inner space is never glued
  });
  test("an account e-mail with an inner space is refused (never repaired); a participant's Email ID still REMOVES inner spaces", async () => {
    expect(normAccountEmail(" John Doe@Acme.com ")).toBe(""); // an inner space is REFUSED (empty), never repaired
    expect(normEmail(" John Doe@Acme.com ")).toBe("johndoe@acme.com");
    // the same difference through the real Worker: a person listed as demo5x@... is the person who types 'demo5 x@...' in an Email-ID game
    const m = await w.game(NEW_T, "EML-1", { idKind: "email" });
    await w.add(NEW_T, m, [{ name: "E", empId: "demo5x@demo-test.invalid" }], "EML-1");
    const r = await w.join(NEW_T, " DEMO5 x＠Demo-Test.invalid ", 1, "EML-1");
    expect([r.status, (await j(r)).code ?? null]).toEqual([200, null]);
  });
});

// ------------------------------------------------------------------------------------------------ D
describe("D: PATCH settings idKind is locked once people exist", () => {
  const LOCK = "You already have people listed. Start a new game to use a different kind of ID.";
  const patch = (at: number, key: string, body: unknown) => w.call(at, "PATCH", "/api/z/EMP-1/settings", body, key);
  const kindOf = async (at: number) => (await w.info(at)).idKind;

  test("nobody listed or joined: the kind can be changed both ways", async () => {
    const m = await w.game(NEW_T);
    expect((await patch(NEW_T, m, { idKind: "email" })).status).toBe(200); expect(await kindOf(NEW_T)).toBe("email");
    expect((await patch(NEW_T, m, { idKind: "emp" })).status).toBe(200); expect(await kindOf(NEW_T)).toBe("emp");
  });
  test("a person has JOINED: changing the kind either way is refused (409 id-kind-locked, the plain sentence) and nothing changes", async () => {
    const m = await w.game(NEW_T); await w.add(NEW_T, m, [{ name: "A", empId: "1B678" }]);
    expect((await w.join(NEW_T, "1B678", 1)).status).toBe(200);
    const r = await patch(NEW_T, m, { idKind: "email" }); const b = await j(r);
    expect([r.status, b.error, b.code]).toEqual([409, LOCK, "id-kind-locked"]);
    expect(await kindOf(NEW_T)).toBe("emp");
    // and the other way round
    w.reset(); const m2 = await w.game(NEW_T, "EMP-1", { idKind: "email" }); await w.add(NEW_T, m2, [{ name: "A", empId: "demo1@demo-test.invalid" }]);
    expect((await w.join(NEW_T, "demo1@demo-test.invalid", 1)).status).toBe(200);
    const r2 = await patch(NEW_T, m2, { idKind: "emp" }); expect([r2.status, (await j(r2)).code]).toEqual([409, "id-kind-locked"]);
    expect(await kindOf(NEW_T)).toBe("email");
  });
  test("sending the SAME kind again is allowed once people exist, and so is any other setting", async () => {
    const m = await w.game(NEW_T); await w.add(NEW_T, m, [{ name: "A", empId: "1B678" }]); await w.join(NEW_T, "1B678", 1);
    expect((await patch(NEW_T, m, { idKind: "emp" })).status).toBe(200);
    expect((await patch(NEW_T, m, { callSeconds: 9 })).status).toBe(200);
    expect(await kindOf(NEW_T)).toBe("emp");
  });
  test("an OLD game (created before EMP_CLEAN_FROM_MS) cannot be switched to email once people exist, and can before", async () => {
    const m = await w.game(OLD_T); await w.add(OLD_T, m, [{ name: "A", empId: "1B-678" }]); expect((await w.join(OLD_T, "1B-678", 1)).status).toBe(200);
    const r = await patch(OLD_T, m, { idKind: "email" }); expect([r.status, (await j(r)).code]).toEqual([409, "id-kind-locked"]);
    expect((await w.info(OLD_T)).idClean).toBe(false);
    w.reset(); const m2 = await w.game(OLD_T);
    expect((await patch(OLD_T, m2, { idKind: "email" })).status).toBe(200);
  });
  test("an open game: a person who joined by mobile number only holds no ID hash, so the kind can still be changed (owner rule: the lock is for ID-hash holders)", async () => {
    const m = await w.game(NEW_T, "EMP-1", {}, true);
    expect((await w.call(NEW_T, "POST", "/api/z/EMP-1/join", { name: "G", phone: "9876543210", device: dev(1) })).status).toBe(200);
    const r = await patch(NEW_T, m, { idKind: "email" }); expect(r.status).toBe(200);
  });
  test("PRODUCT BUG D1: a person who is only LISTED (not joined yet) must lock the kind too: the sentence says 'people listed', and the stored list IDs were cleaned for the old kind", async () => {
    const m = await w.game(NEW_T); await w.add(NEW_T, m, [{ name: "A", empId: "1B678" }]);
    expect(count("SELECT COUNT(*) c FROM person")).toBe(1); expect(count("SELECT COUNT(*) c FROM participant")).toBe(0);
    const r = await patch(NEW_T, m, { idKind: "email" });
    expect([r.status, (await j(r)).code ?? null]).toEqual([409, "id-kind-locked"]);
  });
});

// ------------------------------------------------------------------------------------------------ G
describe("G: GET /api/z/<id>/info carries endedAtMs once the game has ended", () => {
  const START = (id = "EMP-1") => w.raw.prepare("SELECT start_round r FROM engagement WHERE id=?").get(id) as { r: number };
  /** A game with one joined person, paid (pack set), a Host-free auto game. Returns the key, the pid and the start time. */
  const played = async (set: Record<string, unknown> = {}) => {
    const m = await w.game(NEW_T, "EMP-1", set); w.raw.prepare("UPDATE engagement SET pack=100 WHERE id='EMP-1'").run();
    await w.add(NEW_T, m, [{ name: "A", empId: "1B678" }]);
    const jr = await j(await w.join(NEW_T, "1B678", 1)); expect(typeof jr.pid).toBe("string");
    const start = roundMs(START().r);
    return { m, pid: jr.pid as string, start };
  };
  const over = (at: number, pid: string) => w.call(at, "POST", "/api/z/EMP-1/over", { pid, device: dev(1) });

  test("a fresh game has no endedAtMs; the field is a number only after the end", async () => {
    await played();
    expect(await w.info(NEW_T)).not.toHaveProperty("endedAtMs");
  });
  test("ended by the phones' vote: endedAtMs is the moment of the vote, one number, and it never changes afterwards (later votes, ticks, a later look)", async () => {
    const { start, pid } = await played();
    const at = start + 8 * 60_000; // after 20 numbers, before the scheduled end (the end is the vote time or the scheduled end, whichever is first)
    expect((await j(await over(at, pid))).counted).toBe(true);
    const a = (await w.info(at + 1000)).endedAtMs;
    expect(typeof a).toBe("number"); expect(a).toBe(at);
    await over(at + 60_000, pid); await lifecycleTick(w.env as any, at + 90_000); await lifecycleTick(w.env as any, at + 3_600_000);
    expect((await w.info(at + 3_700_000)).endedAtMs).toBe(a);
  });
  test("ended by the schedule (nobody voted): endedAtMs is the scheduled end, read after the tick that sees the game over, and stays", async () => {
    const { start } = await played();
    const late = start + 2 * 3_600_000;
    await lifecycleTick(w.env as any, late);
    const row = w.raw.prepare("SELECT end_ms, end_src FROM life WHERE eid='EMP-1'").get() as { end_ms: number; end_src: string };
    expect(row.end_src).toBe("schedule");
    const a = (await w.info(late + 1000)).endedAtMs;
    expect(a).toBe(row.end_ms); expect(a).toBeLessThan(late);
    await lifecycleTick(w.env as any, late + 5 * 60_000);
    expect((await w.info(late + 6 * 60_000)).endedAtMs).toBe(a);
  });
  test("R-end: an erase of the participants' data is NOT a game end: endedAtMs is the recomputed scheduled bound (not the erase moment), and a second erase does not move it", async () => {
    const { m, start } = await played();
    const row = () => w.raw.prepare("SELECT * FROM engagement WHERE id='EMP-1'").get();
    const bound = await endBoundMs(w.env as any, row());
    expect(bound).toBeGreaterThan(start);
    const at = bound + 30 * 60_000; // erased half an hour after the scheduled end
    expect((await w.call(at, "POST", "/api/z/EMP-1/erase", {}, m)).status).toBe(200);
    const life = w.raw.prepare("SELECT end_src FROM life WHERE eid='EMP-1'").get() as { end_src: string };
    expect(life.end_src).toBe("purge"); // the purge row is not an end record
    const a = (await w.info(at + 1000)).endedAtMs; expect(a).toBe(bound); expect(a).not.toBe(at);
    await w.call(at + 120_000, "POST", "/api/z/EMP-1/erase", {}, m); await lifecycleTick(w.env as any, at + 180_000);
    expect((await w.info(at + 200_000)).endedAtMs).toBe(a);
  });
  test("R-end: a scheduled end is returned only once now >= the recomputed bound; absent one second before, present at the bound, and it never moves afterwards", async () => {
    const { start } = await played();
    const bound = await endBoundMs(w.env as any, w.raw.prepare("SELECT * FROM engagement WHERE id='EMP-1'").get());
    expect(await w.info(bound - 1000)).not.toHaveProperty("endedAtMs");
    expect((await w.info(bound)).endedAtMs).toBe(bound);
    expect((await w.info(bound + 5 * 3_600_000)).endedAtMs).toBe(bound);
    expect(bound).toBeGreaterThan(start);
  });
  test("a cancelled game never carries endedAtMs", async () => {
    const { m, start } = await played();
    const c = await w.call(start - 600_000, "POST", "/api/z/EMP-1/cancel", { confirmations: 3 }, m); expect(c.status).toBe(200);
    await lifecycleTick(w.env as any, start - 500_000);
    const i = await w.info(start - 400_000); expect(i.cancelled).toBe(true); expect(i).not.toHaveProperty("endedAtMs");
    const bound = await endBoundMs(w.env as any, w.raw.prepare("SELECT * FROM engagement WHERE id='EMP-1'").get());
    for (const at of [bound - 1000, bound, bound + 3_600_000, bound + 48 * 3_600_000]) await lifecycleTick(w.env as any, at); // R-end: 'cancel' is not an end, even after the time the game would have ended
    for (const at of [bound, bound + 3_600_000, bound + 48 * 3_600_000]) { const late = await w.info(at); expect(late.cancelled).toBe(true); expect(late).not.toHaveProperty("endedAtMs"); }
  });
  test("the payload adds one number and no names or amounts: nothing about people, e-mail, mobile or money", async () => {
    const { start, pid } = await played(); const at = start + 8 * 60_000;
    const before = await w.info(start - 1000); await over(at, pid); const after = await w.info(at + 1000);
    const added = Object.keys(after).filter((k) => !(k in before)).sort();
    expect(added.filter((k) => k !== "erasureMs")).toEqual(["endedAtMs"]);
    const text = JSON.stringify(after);
    expect(text).not.toMatch(/1B678|demo\d@|98765|"name":"A"/);
    expect(Object.keys(after).filter((k) => /amount|price|total|paid|payment|email|phone|mobile|pid|participant|people|winner/i.test(k))).toEqual([]);
    expect(Number.isInteger(after.endedAtMs) && after.endedAtMs > 1.7e12 && after.endedAtMs < 2.5e12).toBe(true);
  });
  test("PRODUCT BUG G1: before the game has ended endedAtMs must be absent even after the lifecycle tick has run, and a break added later must not create or move it", async () => {
    const { m, start } = await played();
    await lifecycleTick(w.env as any, NEW_T + 1000); // the tick runs every minute and writes the SCHEDULED end into the same life row (end_src 'schedule'), long before the game
    const early = await w.info(NEW_T + 2000);
    expect([early.endedAtMs ?? null, "game starts at", start > NEW_T]).toEqual([null, "game starts at", true]);
    const p = await w.call(NEW_T + 3000, "PATCH", "/api/z/EMP-1/settings", { breaks: [{ kind: "speech", title: "Short talk", text: "hello", after: 3, seconds: 60 }] }, m);
    expect(p.status).toBe(200);
    await lifecycleTick(w.env as any, NEW_T + 4000);
    expect(((await w.info(NEW_T + 5000)).endedAtMs ?? null)).toBe(null);
  });
});
