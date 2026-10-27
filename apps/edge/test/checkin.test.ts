// Present check-in (owner decision 2026-10-23): the ticket opens only after the participant marks themselves present with the 4-digit code shown on their own ticket page.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CHECKIN_FROM_MS, checkinOpensMs, codeFor, perm10k, ticketId } from "../src/checkin";
import { callTimeMs, erasePersonal } from "../src/lifecycle";
import { HOUR, MIN, T, W, call, capture, checkout, create, dev, j, join as joinRaw, keyH, mob, one, organizer, publish, reset, restore, roundAt, roundMs, uid, verify } from "./param-harness";

const T2 = Date.UTC(2026, 9, 24, 10, 0, 0); // after CHECKIN_FROM_MS: games created now require the check-in
beforeEach(() => reset()); afterEach(restore);

/** A paid game made at T2, starting 2 hours later. */
async function game(over: Record<string, unknown> = {}, createdAt = T2, forcedId?: string, org?: Awaited<ReturnType<typeof organizer>>) {
  const o = org ?? await organizer(); const id = forcedId ?? uid("CK");
  const startRound = roundAt(createdAt + 2 * HOUR);
  expect((await create(o.key, id, { startRound, cap: 100, ...over }, createdAt)).status).toBe(200);
  expect((await publish(o.key, id, undefined, createdAt)).status).toBe(200);
  const c = await checkout(o.key, { eid: id, email: o.email }, createdAt); expect(c.status).toBe(200);
  capture(c.body, "pay_" + id); expect((await verify(c.body, "pay_" + id, {}, createdAt)).status).toBe(200);
  return { ...o, id, startMs: roundMs(startRound) };
}
// every phone proves it is the phone of its ticket: the device id it joined with (the test remembers it per participant id)
const deviceOf = new Map<string, string>();
const join = async (id: string, i: number, extra: Record<string, unknown> = {}, now: number = T) => { const r = await joinRaw(id, i, extra, now); const b = await r.clone().json().catch(() => null); if (b?.pid) deviceOf.set(b.pid, String((extra as any)?.device ?? dev(i))); return r; };
const ck = (id: string, pid: string, now: number, device: string | null = deviceOf.get(pid) ?? null) => call("GET", `/api/z/${id}/checkin?pid=${encodeURIComponent(pid)}${device ? `&device=${device}` : ""}`, undefined, {}, now);
const submit = (id: string, pid: string, body: Record<string, unknown>, now: number) => call("POST", `/api/z/${id}/checkin`, { pid, device: deviceOf.get(pid), confirmName: true, confirmMobile: true, ...body }, {}, now);
/** a moment inside the claim window of number idx 10: one second before number idx 11 is announced (the claim rule: a prize completed on number N can be claimed until N+1 is announced) */
const inWindow = async (id: string) => (await callTimeMs(W.env as any, W.raw.prepare("SELECT * FROM engagement WHERE id=?").get(id) as any, 1, 11))! - 1000;
const claim = (id: string, pid: string, now: number, device: string | null | undefined = deviceOf.get(pid)) => call("POST", `/api/z/${id}/claims`, { pid, ...(device ? { device } : {}), claims: [{ pattern: "early5", idx: 10 }] }, {}, now);

describe("the code: every participant of a game has a different 4-digit code", () => {
  test("the keyed permutation never repeats: all 10,000 inputs give 10,000 different 4-digit outputs", () => {
    const key = "ab".repeat(32); const seen = new Set<number>();
    for (let x = 0; x < 10000; x++) { const v = perm10k(key, x); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(10000); seen.add(v); }
    expect(seen.size).toBe(10000);
    const hex = (t: string) => Array.from(new Uint8Array(new Bun.CryptoHasher("sha256").update(t).digest()), (b) => b.toString(16).padStart(2, "0")).join("");
    let differ = 0; for (let x = 0; x < 200; x++) if (perm10k(hex("key-one"), x) !== perm10k(hex("key-two"), x)) differ++;
    expect(differ).toBeGreaterThan(180); // a different key maps (almost) every ticket to a different code
  });
  test("500 tickets of a game get 500 different codes, always 4 digits, and the code is the same every time it is asked", async () => {
    const codes = new Set<string>(); for (let s = 1; s <= 500; s++) { const c = await codeFor(W.env as any, "GAME-1", s); expect(c).toMatch(/^\d{4}$/); codes.add(c); }
    expect(codes.size).toBe(500); expect(await codeFor(W.env as any, "GAME-1", 7)).toBe(await codeFor(W.env as any, "GAME-1", 7));
    expect(await codeFor(W.env as any, "GAME-2", 7)).toBeDefined();
  });
});

describe("the check-in flow", () => {
  test("a game made before the switch-over date is played the old way (no check-in, claims accepted at once)", async () => {
    const g = await game({}, T); // created 1 Oct: before CHECKIN_FROM_MS
    expect(T).toBeLessThan(CHECKIN_FROM_MS);
    const jn = await j(await join(g.id, 1, {}, T)); expect(jn.checkin).toBe(false);
    expect((await ck(g.id, jn.pid, T)).status).toBe(200); expect((await j(await ck(g.id, jn.pid, T))).required).toBe(false);
    expect((await claim(g.id, jn.pid, await inWindow(g.id))).status).toBe(200);
  });
  test("before it opens: the ids are shown but no code; 5 minutes before the start: the code appears", async () => {
    const g = await game(); const jn = await j(await join(g.id, 1, {}, T2)); expect(jn.checkin).toBe(true);
    const early = await j(await ck(g.id, jn.pid, g.startMs - 20 * MIN));
    expect(early).toMatchObject({ required: true, gameId: g.id, participantId: jn.pid, ticketId: ticketId(g.id, 1), open: false, present: false }); expect(early.code).toBeUndefined();
    expect(early.opensMs).toBe(checkinOpensMs(g.startMs));
    const open = await j(await ck(g.id, jn.pid, g.startMs - 4 * MIN)); expect(open.open).toBe(true); expect(open.code).toMatch(/^\d{4}$/);
    expect(open.name).toBe("Guest 1"); expect(open.mobile).toBe("******" + mob(1).slice(-4)); expect(JSON.stringify(open)).not.toContain(mob(1));
  });
  test("submit before it opens is refused; a wrong code is refused (5 tries, then a pause); the right code marks present and the ticket opens", async () => {
    const g = await game(); const jn = await j(await join(g.id, 1, {}, T2)); const now = g.startMs - 3 * MIN;
    expect((await submit(g.id, jn.pid, { code: "0000" }, g.startMs - 20 * MIN)).status).toBe(403);
    const code = (await j(await ck(g.id, jn.pid, now))).code as string, wrong = code === "1234" ? "4321" : "1234";
    expect((await submit(g.id, jn.pid, { code: wrong, confirmName: false }, now)).status).toBe(400); // the two confirmations are required
    for (let i = 0; i < 5; i++) { const r = await submit(g.id, jn.pid, { code: wrong }, now); expect(r.status).toBe(400); expect((await j(r)).code).toBe("wrong-code"); }
    const locked = await submit(g.id, jn.pid, { code }, now + 1000); expect(locked.status).toBe(429); // even the right code waits after 5 wrong ones
    const ok = await submit(g.id, jn.pid, { code }, now + 11 * MIN);
    expect(ok.status).toBe(200); expect((await j(ok)).present).toBe(true);
    const after = await j(await ck(g.id, jn.pid, now + 12 * MIN)); expect(after.present).toBe(true); expect(after.code).toBeUndefined(); // the code is not shown again
  });
  test("claims are refused until the person is present (403 not-present) and accepted after; wrong claims too", async () => {
    const g = await game(); const jn = await j(await join(g.id, 1, {}, T2)); const now = await inWindow(g.id);
    const r1 = await claim(g.id, jn.pid, now); expect(r1.status).toBe(403); expect((await j(r1)).code).toBe("not-present");
    expect((await call("POST", `/api/z/${g.id}/bogey`, { pid: jn.pid, pattern: "early5" }, {}, now)).status).toBe(403);
    const code = (await j(await ck(g.id, jn.pid, now))).code; expect((await submit(g.id, jn.pid, { code }, now)).status).toBe(200);
    expect((await claim(g.id, jn.pid, now + 500)).status).toBe(200);
  });
  test("name and mobile can be corrected at check-in (kept for the prize hand-over); a bad number is refused; the ticket identity does not change", async () => {
    const g = await game(); const jn = await j(await join(g.id, 1, {}, T2)); const now = g.startMs - 2 * MIN;
    const code = (await j(await ck(g.id, jn.pid, now))).code;
    expect((await submit(g.id, jn.pid, { code, mobile: "12345" }, now)).status).toBe(400);
    const ok = await j(await submit(g.id, jn.pid, { code, name: "Meera Iyer", mobile: "98111 00777" }, now)); expect(ok).toMatchObject({ ok: true, editedName: true, editedMobile: true });
    const me = await j(await ck(g.id, jn.pid, now + 1000)); expect(me.name).toBe("Meera Iyer"); expect(me.mobile).toBe("******0777"); expect(me.participantId).toBe(jn.pid); expect(me.ticketId).toBe(ticketId(g.id, 1));
  });
  test("each participant has their own code and their own ticket id; one person's code does not open another's check-in", async () => {
    const g = await game(); const a = await j(await join(g.id, 1, {}, T2)), b = await j(await join(g.id, 2, {}, T2)); const now = g.startMs - 1 * MIN;
    const ca = (await j(await ck(g.id, a.pid, now))).code, cb = (await j(await ck(g.id, b.pid, now))).code; expect(ca).not.toBe(cb);
    expect((await submit(g.id, b.pid, { code: ca }, now)).status).toBe(400); expect((await submit(g.id, b.pid, { code: cb }, now)).status).toBe(200);
    expect((await ck(g.id, "99x0000", now)).status).toBe(403); // not a participant
  });
  test("the participant id is not a secret: another person's phone, no device, or a wrong device sees nothing and changes nothing", async () => {
    const g = await game(); const a = await j(await join(g.id, 1, {}, T2)); await join(g.id, 2, {}, T2); const now = g.startMs - 1 * MIN;
    const mine = await j(await ck(g.id, a.pid, now)); expect(mine.code).toMatch(/^\d{4}$/);
    for (const device of [null, dev(2), "f".repeat(32)]) { const r = await ck(g.id, a.pid, now, device); expect(r.status).toBe(403); const body = await j(r); expect(body.code).toBe("other-phone"); expect(JSON.stringify(body)).not.toContain(mine.code); expect(JSON.stringify(body)).not.toContain("Guest 1"); }
    const forged = await call("POST", `/api/z/${g.id}/checkin`, { pid: a.pid, device: dev(2), code: mine.code, confirmName: true, confirmMobile: true, name: "Attacker", mobile: "9999999999" }, {}, now); expect(forged.status).toBe(403);
    const again = await j(await ck(g.id, a.pid, now)); expect(again.present).toBe(false); expect(again.name).toBe("Guest 1"); // still not present, name unchanged
  });
  test("erasing one game never touches another game's check-ins, even when the ids differ only by a letter that LIKE treats as a wildcard or as the same", async () => {
    const o = await organizer();
    const a = await game({}, T2, "WILD_1AB", o), b = await game({}, T2, "WILDX1AB", o), c2 = await game({}, T2, "wild_1ab", o);
    const now = a.startMs - 1 * MIN; const mine = [];
    for (const g of [b, c2]) { const jn = await j(await join(g.id, 1, {}, T2)); const code = (await j(await ck(g.id, jn.pid, now))).code; expect((await submit(g.id, jn.pid, { code }, now)).status).toBe(200); mine.push([g.id, jn.pid]); }
    await erasePersonal(W.env as any, a.id, now + 1000, "organizer");
    for (const [id, pid] of mine) expect((await j(await ck(id, pid!, now + 2000))).present).toBe(true);
  });
  test("claims and wrong-claim reports are accepted only from the ticket's own phone: somebody else's phone cannot knock a rival out or claim in their name", async () => {
    const g = await game(); const a = await j(await join(g.id, 1, {}, T2)); await join(g.id, 2, {}, T2); const now = g.startMs - 1 * MIN;
    const code = (await j(await ck(g.id, a.pid, now))).code; expect((await submit(g.id, a.pid, { code }, now)).status).toBe(200); // a is present
    for (const device of [null, dev(2), "e".repeat(32)]) { const r = await claim(g.id, a.pid, now, device); expect(r.status).toBe(403); expect((await j(r)).code).toBe("other-phone"); const bg = await call("POST", `/api/z/${g.id}/bogey`, { pid: a.pid, ...(device ? { device } : {}), pattern: "early5" }, {}, now); expect(bg.status).toBe(403); }
    expect(W.raw.prepare("SELECT COUNT(*) c FROM bogey WHERE eid=?").get(g.id).c).toBe(0);
    expect((await claim(g.id, a.pid, now)).status).not.toBe(403); // the real phone is not refused
  });
  test("the organizer sees how many are present", async () => {
    const g = await game(); const a = await j(await join(g.id, 1, {}, T2)); await j(await join(g.id, 2, {}, T2)); const now = g.startMs - 1 * MIN;
    expect((await submit(g.id, a.pid, { code: (await j(await ck(g.id, a.pid, now))).code }, now)).status).toBe(200);
    const pr = await j(await call("GET", `/api/z/${g.id}/presence`, undefined, keyH(g.key), now)); expect(pr).toMatchObject({ present: 1, total: 2 }); expect(pr.seats).toEqual([1]);
    expect((await call("GET", `/api/z/${g.id}/presence`, undefined, {}, now)).status).toBe(403); // not for a participant
  });
});

describe("what is kept and what is deleted", () => {
  test("the check-in records of everybody are deleted with the personal data; a winner's evidence (when they checked in) is kept with the winners record", async () => {
    const g = await game(); const a = await j(await join(g.id, 1, {}, T2)); const b = await j(await join(g.id, 2, {}, T2)); const now = g.startMs - 1 * MIN;
    for (const p of [a, b]) expect((await submit(g.id, p.pid, { code: (await j(await ck(g.id, p.pid, now))).code }, now)).status).toBe(200);
    expect(one("SELECT COUNT(*) c FROM kv WHERE k LIKE ?", `present/${g.id}/%`).c).toBe(2);
    const { keepWinnerEvidence } = await import("../src/checkin"); await keepWinnerEvidence(W.env as any, g.id, [1]); // seat 1 won something
    await erasePersonal(W.env as any, g.id, now + 30 * HOUR, "test");
    expect(one("SELECT COUNT(*) c FROM kv WHERE k LIKE ?", `present/${g.id}/%`).c).toBe(0);
    expect(one("SELECT COUNT(*) c FROM kv WHERE k LIKE ?", `ckfail/${g.id}/%`).c).toBe(0);
    expect(one("SELECT COUNT(*) c FROM kv WHERE k=?", `wev/${g.id}/1`).c).toBe(1); expect(one("SELECT COUNT(*) c FROM kv WHERE k=?", `wev/${g.id}/2`).c).toBe(0);
  });
});
