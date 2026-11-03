// rc/tambola-1.8.5 part 2: the employee-ID and Email-ID rules on the REAL Worker (in-memory database). Test addresses: demoN@demo-test.invalid only.
// Run: bun test --isolate apps/edge/test/rc185
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { World, NEW_T, OLD_T, j } from "./helpers";
import { EMP_CLEAN_FROM_MS } from "../../src/empid";
import { cleanEmail } from "../../src/approvals";
import { emailHashOf } from "../../src/hostsetup";

let w: World;
beforeEach(() => { w = new World(); });
afterEach(() => { w.restore(); });

describe("NEW employee-ID game (list-only, verify id)", () => {
  test("a listed '1B-678' is found however the person types it; a second phone with another spelling is the same person (423 id-used)", async () => {
    const m = await w.game(NEW_T); expect((await w.add(NEW_T, m, [{ name: "Asha", empId: "1B-678" }])).status).toBe(200);
    const first = await w.join(NEW_T, "1b.678", 1); expect(first.status).toBe(200); expect((await j(first)).pid).toBeTruthy();
    for (const [i, spelling] of ["1B/678", "1B 678", "１Ｂ－６７８", "1b_678", "#1B678"].entries()) { const again = await w.join(NEW_T, spelling, 10 + i); expect([spelling, again.status]).toEqual([spelling, 423]); expect((await j(again)).code).toBe("id-used"); }
  });
  test("a person who is not on the list waits (403), after cleaning too", async () => {
    const m = await w.game(NEW_T); await w.add(NEW_T, m, [{ name: "Asha", empId: "1B-678" }]);
    const r = await w.join(NEW_T, "9Z-999", 1); expect(r.status).toBe(403);
  });
  test("the list side is cleaned: a listed 'ab 12' is stored as AB12 and is found by 'ab-12'", async () => {
    const m = await w.game(NEW_T); const r = await j(await w.add(NEW_T, m, [{ name: "A", empId: "ab 12" }]));
    expect(r.added).toBe(1); expect(r.people[0].empId).toBe("AB12");
    expect((await w.join(NEW_T, "ab-12", 1)).status).toBe(200);
  });
  test("an upload [1B-678, 1B/678, 1B-678, ---, 2c 9]: added 2, 'Same person after cleaning' for the second, letters-and-numbers message for ---, 1 plain duplicate", async () => {
    const m = await w.game(NEW_T);
    const r = await j(await w.add(NEW_T, m, [{ name: "A", empId: "1B-678" }, { name: "B", empId: "1B/678" }, { name: "C", empId: "1B-678" }, { name: "D", empId: "---" }, { name: "E", empId: "2c 9" }]));
    expect(r.added).toBe(2); expect(r.duplicates).toBe(1);
    const byRaw = Object.fromEntries(r.invalid.map((x: any) => [x.raw, x.why]));
    expect(byRaw.B).toBe("Same person after cleaning: it reads as 1B678, like an earlier row."); expect(byRaw.D).toMatch(/letters and numbers only/);
    expect(r.invalid.length).toBe(2); expect(r.people.map((p: any) => p.empId).sort()).toEqual(["1B678", "2C9"]);
  });
  test("the first of two same-after-cleaning rows is kept (order matters), the later one is flagged", async () => {
    const m = await w.game(NEW_T); const r = await j(await w.add(NEW_T, m, [{ name: "First", empId: "x/1" }, { name: "Second", empId: "X-1" }]));
    expect(r.added).toBe(1); expect(r.people[0].name).toBe("First"); expect(r.invalid[0].raw).toBe("Second");
  });
  test("an exact repeat (same raw text) is a plain duplicate, not 'Same person after cleaning'", async () => {
    const m = await w.game(NEW_T); const r = await j(await w.add(NEW_T, m, [{ name: "A", empId: "1B-678" }, { name: "A", empId: "1B-678" }]));
    expect(r.added).toBe(1); expect(r.duplicates).toBe(1); expect(r.invalid.length).toBe(0);
  });
  test("an ID with nothing left (---, zero-width, emoji) is refused at the door: 400 bad-id with the plain message", async () => {
    await w.game(NEW_T); let i = 0;
    for (const bad of ["---", "​​", "🙂", "ßß"]) { const r = await w.join(NEW_T, bad, ++i); expect(r.status).toBe(400); const b = await j(r); expect(b.code).toBe("bad-id"); expect(b.error).toContain("letters and numbers only"); }
  });
  test("31 characters once cleaned are refused, 30 are accepted as a person (not on list -> waits, not refused)", async () => {
    await w.game(NEW_T); const r31 = await w.join(NEW_T, "A".repeat(31), 1); expect(r31.status).toBe(400); expect((await j(r31)).code).toBe("bad-id");
    const r30 = await w.join(NEW_T, "A".repeat(30), 2); expect(r30.status).not.toBe(400);
  });
  test("an empty ID is 'nothing typed' (need-id), not a bad-id", async () => { await w.game(NEW_T); const r = await w.join(NEW_T, "   ", 1); expect(r.status).toBe(400); expect((await j(r)).code).toBe("need-id"); });
  test("an email typed in the ID box: 400 bad-id, 'looks like an Email ID', never turned into letters (also with a full-width @)", async () => {
    const m = await w.game(NEW_T); await w.add(NEW_T, m, [{ name: "Ghost", empId: "DEMO1DEMOTESTINVALID" }]); // the mangled form IS on the list: it must still not match
    for (const [i, x] of ["demo1@demo-test.invalid", "DEMO1@DEMO-TEST.INVALID", "demo1＠demo-test.invalid"].entries()) {
      const r = await w.join(NEW_T, x, i + 1); expect(r.status).toBe(400); const b = await j(r); expect(b.code).toBe("bad-id"); expect(b.error).toContain("This looks like an Email ID. This game asks for an employee ID: letters and numbers only."); expect(JSON.stringify(b)).not.toContain("DEMO1DEMOTESTINVALID");
    }
  });
  test("an email in the uploaded list is refused too (in invalid), not added as letters", async () => {
    const m = await w.game(NEW_T); const r = await j(await w.add(NEW_T, m, [{ name: "A", empId: "demo1@demo-test.invalid" }]));
    expect(r.added).toBe(0); expect(r.invalid[0].why).toContain("Email ID"); expect(JSON.stringify(r)).not.toContain("DEMO1DEMOTESTINVALID");
  });
  test("/info says idClean:true and idKind 'emp' (default)", async () => { await w.game(NEW_T); const i = await w.info(NEW_T); expect(i.idClean).toBe(true); expect(i.idKind).toBe("emp"); });
});

describe("OLD employee-ID game keeps the old behaviour (created before EMP_CLEAN_FROM_MS)", () => {
  test("list 1B-678 and 1B678 are two people; 1b-678 -> the dashed one, 1b 678 -> the other, 1B.678 -> 403 waiting", async () => {
    const m = await w.game(OLD_T); expect((await w.add(OLD_T, m, [{ name: "Asha", empId: "1B-678" }, { name: "Ben", empId: "1B678" }])).status).toBe(200);
    expect((await w.join(OLD_T, "1b-678", 1)).status).toBe(200); expect((await w.join(OLD_T, "1b 678", 2)).status).toBe(200); expect((await w.join(OLD_T, "1B.678", 3)).status).toBe(403);
  });
  test("old upload: 1B-678 and 1B/678 are NOT merged (no 'Same person after cleaning')", async () => {
    const m = await w.game(OLD_T); const r = await j(await w.add(OLD_T, m, [{ name: "A", empId: "1B-678" }, { name: "B", empId: "1B/678" }]));
    expect(r.added).toBe(2); expect(JSON.stringify(r.invalid)).not.toContain("Same person after cleaning"); expect(r.people.map((p: any) => p.empId).sort()).toEqual(["1B-678", "1B/678"]);
  });
  test("old game: an email is refused with the OLD text (not the 'Email ID' sentence), never mangled", async () => {
    await w.game(OLD_T); const r = await w.join(OLD_T, "demo1@demo-test.invalid", 1); expect(r.status).toBe(400); const b = await j(r); expect(b.code).toBe("bad-id");
    expect(b.error).not.toContain("Email ID"); expect(b.error).not.toContain("looks like"); expect(JSON.stringify(b)).not.toContain("DEMO1DEMOTESTINVALID");
  });
  test("old game: /info says idClean:false and idKind 'emp'", async () => { await w.game(OLD_T); const i = await w.info(OLD_T); expect(i.idClean).toBe(false); expect(i.idKind).toBe("emp"); });
});

describe("the EMP_CLEAN_FROM_MS boundary decides by the game's creation time", () => {
  test("a game created 1 ms before the instant is old, at the instant it is new", async () => {
    const wOld = new World(), wNew = new World();
    const mo = await wOld.game(EMP_CLEAN_FROM_MS - 1); await wOld.add(EMP_CLEAN_FROM_MS - 1, mo, [{ name: "A", empId: "1B-678" }]);
    const mn = await wNew.game(EMP_CLEAN_FROM_MS); await wNew.add(EMP_CLEAN_FROM_MS, mn, [{ name: "A", empId: "1B-678" }]);
    expect((await wOld.info(EMP_CLEAN_FROM_MS - 1)).idClean).toBe(false); expect((await wNew.info(EMP_CLEAN_FROM_MS)).idClean).toBe(true);
    expect((await wOld.join(EMP_CLEAN_FROM_MS - 1, "1B678", 1)).status).toBe(403); // old: 1B678 is not 1B-678
    expect((await wNew.join(EMP_CLEAN_FROM_MS, "1B678", 1)).status).toBe(200); // new: it is
    wOld.restore(); wNew.restore();
  });
  test("a game that already exists keeps its rule when the clock moves later (the rule follows the game's creation, not 'now')", async () => {
    const made = EMP_CLEAN_FROM_MS - 5000, later = EMP_CLEAN_FROM_MS + 60_000; // made just before the instant, asked just after it (the start is an hour after creation)
    const m = await w.game(made); await w.add(made, m, [{ name: "A", empId: "1B-678" }]);
    expect((await w.join(later, "1B678", 1)).status).toBe(403); // asked in the new era, still the old rule
    expect((await w.join(later, "1b-678", 2)).status).toBe(200);
  });
});

describe("Email paths: the Email cleaner everywhere, case-insensitive, same hash", () => {
  const BASE = "demo1@demo-test.invalid";
  const variants = Array.from({ length: 16 }, (_, k) => { const loc = "demo1", dom = "demo-test.invalid"; return `${k & 1 ? loc.toUpperCase() : loc}@${k & 2 ? dom.toUpperCase() : dom}`.split("").map((c, i) => (k & 4 && i % 2 ? c.toUpperCase() : k & 8 && i % 3 === 0 ? c.toUpperCase() : c)).join(""); });
  test("all 16 case variants: same cleanEmail and same hash", async () => { for (const v of variants) { expect(cleanEmail(v)).toBe(BASE); expect(await emailHashOf(v)).toBe(await emailHashOf(BASE)); } });
  test("spaces around/inside, tab, new line, full-width @ and letters: same address, same hash", async () => {
    // a participant's Email ID: every space removed, so the inner-space spellings are the same address. The hash is the ACCOUNT form (Host and sign-in e-mails): a space INSIDE is never glued, so it is a different hash.
    const allSpellings = [" demo1@demo-test.invalid ", "\tdemo1@demo-test.invalid\n", "demo1＠demo-test.invalid", "ｄｅｍｏ１＠ｄｅｍｏ－ｔｅｓｔ．ｉｎｖａｌｉｄ", "demo1 @ demo-test.invalid", "DEMO1 @Demo-Test.Invalid"];
    for (const v of allSpellings) { expect(cleanEmail(v)).toBe(BASE); }
    for (const v of [" demo1@demo-test.invalid ", "\tdemo1@demo-test.invalid\n", "demo1＠demo-test.invalid", "ｄｅｍｏ１＠ｄｅｍｏ－ｔｅｓｔ．ｉｎｖａｌｉｄ"]) expect(await emailHashOf(v)).toBe(await emailHashOf(BASE));
    for (const v of ["demo1 @ demo-test.invalid", "DEMO1 @Demo-Test.Invalid"]) expect(await emailHashOf(v)).not.toBe(await emailHashOf(BASE));
  });
  test("a different address has a different hash; incomplete or empty gives null", async () => { expect(await emailHashOf("demo2@demo-test.invalid")).not.toBe(await emailHashOf(BASE)); expect(cleanEmail("demo1@")).toBe(null); expect(cleanEmail("")).toBe(null); expect(cleanEmail("de mo3@demo-test.invalid")).toBe("demo3@demo-test.invalid"); });
  test("open game join with an email: one ticket per address however it is spelled (1.8.1 email key)", async () => {
    const m = await w.game(NEW_T, "OPEN-1", {}, true);
    const a = await w.call(NEW_T, "POST", "/api/z/OPEN-1/join", { name: "A", phone: "9811111111", email: "Demo1@Demo-Test.invalid", device: "0a" + "b".repeat(30) }); expect(a.status).toBe(200);
    const b = await w.call(NEW_T, "POST", "/api/z/OPEN-1/join", { name: "B", phone: "9822222222", email: " DEMO1 @demo-test.invalid ", device: "0c" + "b".repeat(30) });
    expect(b.status).toBe(409); expect((await j(b)).code).toBe("email-unusable"); void m; // the same address under another spelling does not get a second ticket
  });
});
