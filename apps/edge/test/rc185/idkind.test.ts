// rc/tambola-1.8.5 idKind: the game's ONE ID criterion, "emp" (default, every older game) or "email". Real Worker. Test addresses: demoN@demo-test.invalid only.
// Run: bun test --isolate apps/edge/test/rc185
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { World, NEW_T, OLD_T, j } from "./helpers";
import { validateCfg, defaultCfg } from "../../../../packages/beacon/src/config";

let w: World;
beforeEach(() => { w = new World(); });
afterEach(() => { w.restore(); });
const KIND_BAD = "What the ID is: an employee ID or an Email ID.";
const patch = (at: number, key: string, body: unknown) => w.call(at, "PATCH", "/api/z/EMP-1/settings", body, key);

describe("idKind in the settings and /info", () => {
  test("default: a game with no idKind says idKind 'emp' in /info", async () => { await w.game(NEW_T); expect((await w.info(NEW_T)).idKind).toBe("emp"); });
  test("PATCH {idKind:'email'} -> 200 and /info has idKind 'email'", async () => { const m = await w.game(NEW_T); const r = await patch(NEW_T, m, { idKind: "email" }); expect(r.status).toBe(200); expect((await w.info(NEW_T)).idKind).toBe("email"); });
  test("PATCH {idKind:'emp'} removes it again", async () => { const m = await w.game(NEW_T, "EMP-1", { idKind: "email" }); expect((await w.info(NEW_T)).idKind).toBe("email"); expect((await patch(NEW_T, m, { idKind: "emp" })).status).toBe(200); expect((await w.info(NEW_T)).idKind).toBe("emp"); });
  test("an unknown kind is refused with the plain sentence, and nothing changes", async () => {
    const m = await w.game(NEW_T, "EMP-1", { idKind: "email" });
    for (const bad of ["x", "EMAIL", "mobile", "", 1, null, true]) { const r = await patch(NEW_T, m, { idKind: bad }); expect([bad, r.status]).toEqual([bad, 400]); expect((await j(r)).error).toBe(KIND_BAD); }
    expect((await w.info(NEW_T)).idKind).toBe("email");
  });
  test("a later save that does not mention idKind keeps it", async () => { const m = await w.game(NEW_T, "EMP-1", { idKind: "email" }); expect((await patch(NEW_T, m, { callSeconds: 9 })).status).toBe(200); expect((await patch(NEW_T, m, { verify: "id" })).status).toBe(200); expect((await w.info(NEW_T)).idKind).toBe("email"); });
  test("the join answer also carries idKind", async () => { const m = await w.game(NEW_T, "EMP-1", { idKind: "email" }); await w.add(NEW_T, m, [{ name: "A", empId: "demo1@demo-test.invalid" }]); expect((await j(await w.join(NEW_T, "demo1@demo-test.invalid", 1))).idKind).toBe("email"); });
  test("an OLD game can be switched to email by the organizer and still reports idClean:false (idKind is independent of the old/new employee-ID rule)", async () => {
    const m = await w.game(OLD_T); expect((await patch(OLD_T, m, { idKind: "email" })).status).toBe(200); const i = await w.info(OLD_T); expect(i.idKind).toBe("email"); expect(i.idClean).toBe(false);
  });
});

describe("validateCfg (engine config)", () => {
  const base = defaultCfg();
  test("'email' is kept, 'emp' deletes it, anything else is an error", () => {
    const a = validateCfg({ idKind: "email" } as any, base as any); expect(a.ok).toBe(true); expect((a as any).cfg.idKind).toBe("email");
    const b = validateCfg({ idKind: "emp" } as any, (a as any).cfg); expect(b.ok).toBe(true); expect((b as any).cfg.idKind).toBeUndefined();
    const c = validateCfg({ idKind: "phone" } as any, base as any); expect(c.ok).toBe(false); expect((c as any).error).toBe(KIND_BAD);
  });
  test("a save without idKind keeps the base's idKind", () => { const a = validateCfg({ idKind: "email" } as any, base as any) as any; const b = validateCfg({ callMode: "auto" } as any, a.cfg) as any; expect(b.ok).toBe(true); expect(b.cfg.idKind).toBe("email"); });
});

describe("Email-ID game (verify id, idKind email, list-only)", () => {
  const E1 = "demo1@demo-test.invalid", E2 = "demo2@demo-test.invalid";
  test("list rows are stored as the lower-case address; the three spellings of the owner are the same person; a second phone is 423 id-used", async () => {
    const m = await w.game(NEW_T, "EMP-1", { idKind: "email" });
    const a = await j(await w.add(NEW_T, m, [{ name: "A", empId: "Demo1@Demo-Test.invalid" }, { name: "B", empId: E2 }]));
    expect(a.added).toBe(2); expect(a.people.map((p: any) => p.empId).sort()).toEqual([E1, E2]);
    expect((await w.join(NEW_T, "DEMO1@demo-test.invalid", 1)).status).toBe(200);
    for (const [i, s] of [" demo1 @ demo-test.invalid ", "demo1＠demo-test.invalid", "Demo1@DEMO-TEST.INVALID", "\tdemo1@demo-test.invalid\n"].entries()) { const r = await w.join(NEW_T, s, 10 + i); expect([s, r.status]).toEqual([s, 423]); expect((await j(r)).code).toBe("id-used"); }
  });
  test("the second listed person is a different person and gets in", async () => { const m = await w.game(NEW_T, "EMP-1", { idKind: "email" }); await w.add(NEW_T, m, [{ name: "A", empId: E1 }, { name: "B", empId: E2 }]); expect((await w.join(NEW_T, E1, 1)).status).toBe(200); expect((await w.join(NEW_T, "DEMO2@demo-test.invalid", 2)).status).toBe(200); });
  test("an ID that is not an address is refused: 400 bad-id 'Please check your Email ID. It looks incomplete.'", async () => {
    await w.game(NEW_T, "EMP-1", { idKind: "email" }); let i = 0;
    for (const bad of ["demo1", "demo1@", "@demo-test.invalid", "demo1@demo", "1B-678"]) { const r = await w.join(NEW_T, bad, ++i); expect([bad, r.status]).toEqual([bad, 400]); const b = await j(r); expect(b.code).toBe("bad-id"); expect(b.error).toBe("Please check your Email ID. It looks incomplete."); }
  });
  test("upload: the same bad rows go to invalid with that text; two rows that differ only by case/spaces: the second is 'Same person after cleaning ... demo1@demo-test.invalid'", async () => {
    const m = await w.game(NEW_T, "EMP-1", { idKind: "email" });
    const r = await j(await w.add(NEW_T, m, [{ name: "A", empId: "Demo1@Demo-Test.invalid" }, { name: "B", empId: " demo1 @ demo-test.invalid" }, { name: "C", empId: "demo1" }, { name: "D", empId: "demo1@" }, { name: "E", empId: "@demo-test.invalid" }, { name: "F", empId: "demo1@demo" }]));
    expect(r.added).toBe(1); const by = Object.fromEntries(r.invalid.map((x: any) => [x.raw, x.why]));
    expect(by.B).toBe("Same person after cleaning: it reads as demo1@demo-test.invalid, like an earlier row.");
    for (const k of ["C", "D", "E", "F"]) expect([k, by[k]]).toEqual([k, "Please check your Email ID. It looks incomplete."]);
  });
  test("the employee-ID cleaner is never applied to an address: DEMO1DEMOTESTINVALID does not find the listed person and is never stored", async () => {
    const m = await w.game(NEW_T, "EMP-1", { idKind: "email" }); const r = await j(await w.add(NEW_T, m, [{ name: "A", empId: E1 }]));
    expect(JSON.stringify(r)).not.toContain("DEMO1DEMOTESTINVALID"); const x = await w.join(NEW_T, "DEMO1DEMOTESTINVALID", 1); expect(x.status).toBe(400);
  });
  test("an Email-ID game works in an OLD-era game too: the address is cleaned by normEmail on both sides", async () => {
    const m = await w.game(OLD_T, "EMP-1", { idKind: "email" }); await w.add(OLD_T, m, [{ name: "A", empId: "Demo1@Demo-Test.invalid" }]); expect((await w.join(OLD_T, " DEMO1@demo-test.invalid", 1)).status).toBe(200);
  });
});

describe("need-id messages follow the kind", () => {
  const msg = async (at: number, set: Record<string, unknown>) => { const wl = new World(); await wl.game(at, "EMP-1", set); const r = await wl.join(at, "", 1); const b = await j(r); wl.restore(); return { s: r.status, ...b }; };
  test("Email-ID game, verify id: 'Enter your Email ID.'", async () => { const b = await msg(NEW_T, { idKind: "email", verify: "id" }); expect(b.s).toBe(400); expect(b.code).toBe("need-id"); expect(b.error).toBe("Enter your Email ID."); });
  test("Email-ID game, verify both: 'Enter your Email ID and your mobile number.'", async () => { const b = await msg(NEW_T, { idKind: "email", verify: "both" }); expect(b.code).toBe("need-id"); expect(b.error).toBe("Enter your Email ID and your mobile number."); });
  test("Email-ID game, verify either: 'Enter your mobile number or your Email ID.'", async () => { const b = await msg(NEW_T, { idKind: "email", verify: "either" }); expect(b.code).toBe("need-id"); expect(b.error).toBe("Enter your mobile number or your Email ID."); });
  test("employee-ID game says 'employee ID' in the same three places", async () => {
    expect((await msg(NEW_T, { verify: "id" })).error).toBe("Enter your employee ID."); expect((await msg(NEW_T, { verify: "both" })).error).toBe("Enter your employee ID and your mobile number."); expect((await msg(NEW_T, { verify: "either" })).error).toBe("Enter your mobile number or your employee ID.");
  });
});

describe("an email typed in an employee-ID game (idKind absent)", () => {
  test("new game: 400 bad-id 'This looks like an Email ID...'; old game: 400 bad-id with the old text; neither contains the mangled letters", async () => {
    for (const at of [NEW_T, OLD_T]) {
      const wl = new World(); await wl.game(at); const r = await wl.join(at, "demo1@demo-test.invalid", 1); const b = await j(r); wl.restore();
      expect(r.status).toBe(400); expect(b.code).toBe("bad-id"); expect(JSON.stringify(b)).not.toContain("DEMO1DEMOTESTINVALID");
      if (at === NEW_T) expect(b.error).toContain("This looks like an Email ID. This game asks for an employee ID: letters and numbers only."); else { expect(b.error).toContain("letters and numbers only"); expect(b.error).not.toContain("looks like"); }
    }
  });
});
