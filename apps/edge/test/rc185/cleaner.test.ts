// rc/tambola-1.8.5, TEST_HANDOFF part 2 (1.8.5): the pure cleaning functions. Each test fails when the named behaviour is broken.
// Run: bun test --isolate apps/edge/test/rc185   (from the repo root)
import { describe, expect, test } from "bun:test";
import { cleanEmpId, normEmpFor, normEmail, looksLikeEmail, normIdFor, empCleanOn, empBadMessage, badIdMessageFor, EMP_CLEAN_FROM_MS, EMP_MAX, EMP_BAD_NEW, EMP_LOOKS_LIKE_EMAIL, EMAIL_ID_BAD } from "../../src/empid";
import { NEW_T, OLD_T } from "./helpers";

const NEWG = { created_ms: NEW_T }, OLDG = { created_ms: OLD_T };
const ZW = "​‌‍⁠﻿";

describe("employee ID cleaner: cleanEmpId", () => {
  test("the five owner spellings all give 1B678", () => { for (const x of ["1B-678", "1b-678", "1B/678", "1B 678", "1b.678"]) expect(cleanEmpId(x)).toBe("1B678"); });
  test("uppercase: lower and mixed case give the upper-case ID", () => { expect(cleanEmpId("abc123")).toBe("ABC123"); expect(cleanEmpId("aBc1D")).toBe("ABC1D"); });
  test("keeps only A-Z and 0-9: underscore, hash, star, bang, tab, newline are dropped", () => {
    for (const x of ["1B_678", "#1B*678!", "1B\t678\n", "(1B)678", '"1B678"', "1B+678", "1B,678", "1B:678;"]) expect(cleanEmpId(x)).toBe("1B678");
  });
  test("accents, other alphabets, other digits and emoji are removed, never turned into A-Z", () => {
    expect(cleanEmpId("é1B678")).toBe("1B678"); expect(cleanEmpId("1Бя678")).toBe("1678"); expect(cleanEmpId("१B६७८")).toBe("B"); expect(cleanEmpId("1B🙂678")).toBe("1B678");
    expect(cleanEmpId("ß1")).toBe("1"); expect(cleanEmpId("ß1")).not.toContain("S"); expect(cleanEmpId("İ1")).toBe("1"); expect(cleanEmpId("ı1")).toBe("1");
  });
  test("zero-width characters and the byte-order mark are removed", () => { expect(cleanEmpId(`1B${ZW}678`)).toBe("1B678"); expect(cleanEmpId(`${ZW}1B678${ZW}`)).toBe("1B678"); });
  test("NFKC first: full-width letters and digits become plain ASCII", () => {
    expect(cleanEmpId("１Ｂ－６７８")).toBe("1B678"); expect(cleanEmpId("ｅｍｐ００１")).toBe("EMP001");
    expect(cleanEmpId("ſ1")).toBe("S1"); expect(cleanEmpId("K1")).toBe("K1"); // long s and the Kelvin sign are compatibility forms of plain letters: NFKC maps them, by design
    expect(cleanEmpId("ﬁ1")).toBe("FI1"); // the ligature fi is two letters after NFKC: proves NFKC runs before the filter
    expect(cleanEmpId("①")).toBe("1"); // circled one is a plain 1 after NFKC
  });
  test("always a string; nothing typed gives an empty string", () => { expect(cleanEmpId(null)).toBe(""); expect(cleanEmpId(undefined)).toBe(""); expect(cleanEmpId("")).toBe(""); expect(cleanEmpId("---")).toBe(""); expect(cleanEmpId(12345)).toBe("12345"); });
  test("idempotent: cleaning a cleaned ID changes nothing", () => { for (const x of ["1B-678", "ｅｍｐ００１", "a b c", "#9z"]) expect(cleanEmpId(cleanEmpId(x))).toBe(cleanEmpId(x)); });
});

describe("normEmpFor on a NEW game (created on or after EMP_CLEAN_FROM_MS)", () => {
  test("cleans", () => { expect(normEmpFor("1b.678", NEWG)).toBe("1B678"); expect(normEmpFor("1B-678", NEWG)).toBe("1B678"); });
  test("empty / spaces only = nothing typed ('')", () => { expect(normEmpFor("", NEWG)).toBe(""); expect(normEmpFor("   ", NEWG)).toBe(""); expect(normEmpFor(null, NEWG)).toBe(""); expect(normEmpFor("\t\n", NEWG)).toBe(""); });
  test("an ID with nothing left after cleaning is REFUSED (null)", () => { for (const x of ["---", "​", "🙂🙂", "...", "ßß", "१२३", "_/-"]) expect([x, normEmpFor(x, NEWG)]).toEqual([x, null]); });
  test("30 characters are allowed, 31 are refused", () => { expect(normEmpFor("A".repeat(EMP_MAX), NEWG)).toBe("A".repeat(30)); expect(normEmpFor("A".repeat(EMP_MAX + 1), NEWG)).toBe(null); expect(EMP_MAX).toBe(30); });
  test("the cap counts the CLEANED length: 'ab-' x16 is 32 once cleaned and is refused; 'a-' x15 is 30 and is allowed", () => { expect(normEmpFor("ab-".repeat(16), NEWG)).toBe(null); expect(normEmpFor("a-".repeat(15), NEWG)).toBe("A".repeat(15)); expect(normEmpFor("a-b-".repeat(8) + "c", NEWG)).toBe(("AB".repeat(8)) + "C"); });
  test("an email is refused, never turned into letters", () => {
    for (const x of ["demo1@demo-test.invalid", "demo1＠demo-test.invalid", "DEMO1@DEMO-TEST.INVALID", " demo1 @ demo-test.invalid "]) expect([x, normEmpFor(x, NEWG)]).toEqual([x, null]);
  });
});

describe("normEmpFor on an OLD game keeps the old rule exactly", () => {
  test("dash and slash and dot stay; spaces go; upper case", () => { expect(normEmpFor("1B-678", OLDG)).toBe("1B-678"); expect(normEmpFor("1b 678", OLDG)).toBe("1B678"); expect(normEmpFor("1b/67.8_x", OLDG)).toBe("1B/67.8_X"); });
  test("old game: no NFKC (a full-width ID is refused), emoji refused, empty is nothing typed, 30 cap", () => {
    expect(normEmpFor("１Ｂ６７８", OLDG)).toBe(null); expect(normEmpFor("1B🙂678", OLDG)).toBe(null); expect(normEmpFor("---", OLDG)).toBe(null); expect(normEmpFor("", OLDG)).toBe("");
    expect(normEmpFor("A".repeat(30), OLDG)).toBe("A".repeat(30)); expect(normEmpFor("A".repeat(31), OLDG)).toBe(null); expect(normEmpFor("-1B", OLDG)).toBe(null); // must start with a letter or digit
  });
  test("old game: an email is refused (the @ is not allowed)", () => { expect(normEmpFor("demo1@demo-test.invalid", OLDG)).toBe(null); });
});

describe("EMP_CLEAN_FROM_MS boundary", () => {
  test("a game made 1 ms before the instant is OLD, at the instant is NEW", () => {
    expect(empCleanOn({ created_ms: EMP_CLEAN_FROM_MS - 1 })).toBe(false); expect(empCleanOn({ created_ms: EMP_CLEAN_FROM_MS })).toBe(true); expect(empCleanOn({ created_ms: EMP_CLEAN_FROM_MS + 1 })).toBe(true);
    expect(empCleanOn(null)).toBe(false); expect(empCleanOn(undefined)).toBe(false); expect(empCleanOn({})).toBe(false); expect(empCleanOn({ created_ms: null })).toBe(false);
  });
  test("the same text is read two ways on either side of the instant", () => {
    expect(normEmpFor("1B-678", { created_ms: EMP_CLEAN_FROM_MS - 1 })).toBe("1B-678"); expect(normEmpFor("1B-678", { created_ms: EMP_CLEAN_FROM_MS })).toBe("1B678");
  });
  test("until the release session fills it in, the constant is 2026-10-31 00:00 UTC or later (a real deploy instant)", () => { expect(EMP_CLEAN_FROM_MS).toBeGreaterThanOrEqual(Date.UTC(2026, 9, 31, 0, 0, 0)); expect(Number.isInteger(EMP_CLEAN_FROM_MS)).toBe(true); });
});

describe("Email ID cleaner: normEmail", () => {
  const BASE = "demo1@demo-test.invalid";
  test("trim, lower case", () => { expect(normEmail(" Demo1@Demo-Test.Invalid ")).toBe(BASE); expect(normEmail("DEMO1@DEMO-TEST.INVALID")).toBe(BASE); });
  test("every inner space, tab, new line and no-break space is removed", () => { for (const x of ["demo1 @ demo-test.invalid", "de mo1@demo-test.invalid", "\tdemo1@demo-test.invalid\n", "demo1@demo -test.invalid", "d e m o 1 @ d e m o - t e s t . i n v a l i d"]) expect([x, normEmail(x)]).toEqual([x, BASE]); });
  test("NFKC: the full-width at-sign, full stop, hyphen, letters and digits become plain", () => { expect(normEmail("demo1＠demo-test.invalid")).toBe(BASE); expect(normEmail("demo1@demo-test．invalid")).toBe(BASE); expect(normEmail("ｄｅｍｏ１＠ｄｅｍｏ－ｔｅｓｔ．ｉｎｖａｌｉｄ")).toBe(BASE); });
  test("zero-width characters are removed", () => { expect(normEmail(`demo1${ZW}@demo-test.invalid`)).toBe(BASE); });
  test("all 16 case variants of the address are one address", () => {
    const loc = "demo1", dom = "demo-test.invalid"; const vs = new Set<string>();
    for (let k = 0; k < 16; k++) { const s = (k & 1 ? loc.toUpperCase() : loc) + "@" + (k & 2 ? dom.toUpperCase() : dom); vs.add(s.split("").map((c, i) => (k & 4 && i % 2 ? c.toUpperCase() : k & 8 && i % 3 === 0 ? c.toUpperCase() : c)).join("")); }
    expect(vs.size).toBeGreaterThan(8); for (const v of vs) expect(normEmail(v)).toBe(BASE);
  });
  test("dashes, dots, plus and digits are KEPT (the employee-ID cleaner would delete them)", () => { expect(normEmail("Demo.1+x@Demo-Test.invalid")).toBe("demo.1+x@demo-test.invalid"); });
  test("the employee-ID cleaner is NOT the email cleaner: on an email it would give DEMO1DEMOTESTINVALID", () => { expect(cleanEmpId(BASE)).toBe("DEMO1DEMOTESTINVALID"); expect(normEmail(BASE)).not.toBe(cleanEmpId(BASE)); expect(normEmail(BASE)).toContain("@"); });
  test("always a string", () => { expect(normEmail(null)).toBe(""); expect(normEmail(undefined)).toBe(""); expect(normEmail("   ")).toBe(""); });
  test("looksLikeEmail: an @ after NFKC", () => { expect(looksLikeEmail(BASE)).toBe(true); expect(looksLikeEmail("demo1＠demo-test.invalid")).toBe(true); expect(looksLikeEmail("1B-678")).toBe(false); expect(looksLikeEmail("")).toBe(false); expect(looksLikeEmail(null)).toBe(false); });
});

describe("normIdFor: the ID by what the game asks for (idKind)", () => {
  test("kind 'emp' = normEmpFor", () => { for (const x of ["1b.678", "", "---", "demo1@demo-test.invalid"]) { expect(normIdFor(x, "emp", NEWG)).toBe(normEmpFor(x, NEWG)); expect(normIdFor(x, "emp", OLDG)).toBe(normEmpFor(x, OLDG)); } });
  test("kind 'email': cleaned with normEmail, on a NEW and on an OLD game alike", () => {
    for (const g of [NEWG, OLDG]) { expect(normIdFor(" DEMO1 @Demo-Test.invalid ", "email", g)).toBe("demo1@demo-test.invalid"); expect(normIdFor("demo1＠demo-test.invalid", "email", g)).toBe("demo1@demo-test.invalid"); }
  });
  test("kind 'email': nothing typed is '', an address without a usable domain is refused", () => {
    expect(normIdFor("", "email", NEWG)).toBe(""); expect(normIdFor("   ", "email", NEWG)).toBe("");
    for (const x of ["demo1", "demo1@", "@demo-test.invalid", "demo1@demo", "demo1@demo.", "demo1@@demo-test.invalid", "demo1@demo-test.i", "a@b@c.com"]) expect([x, normIdFor(x, "email", NEWG)]).toEqual([x, null]);
  });
  test("kind 'email': 254 characters at most", () => { const ok = "a".repeat(64) + "@" + "b".repeat(180) + ".com", long = "a".repeat(64) + "@" + "b".repeat(190) + ".com"; expect(ok.length).toBeLessThanOrEqual(254); expect(normIdFor(ok, "email", NEWG)).toBe(ok); expect(long.length).toBeGreaterThan(254); expect(normIdFor(long, "email", NEWG)).toBe(null); });
  test("kind 'email': an employee ID such as 1B-678 is not an address", () => { expect(normIdFor("1B-678", "email", NEWG)).toBe(null); });
});

describe("refusal sentences", () => {
  const OLDTXT = "old text";
  test("new employee-ID game: the letters-and-numbers sentence; an @ gets the 'looks like an Email ID' sentence", () => {
    expect(empBadMessage("---", NEWG, OLDTXT)).toBe(EMP_BAD_NEW); expect(EMP_BAD_NEW).toContain("letters and numbers only"); expect(EMP_BAD_NEW).toContain("30 characters");
    expect(empBadMessage("demo1@demo-test.invalid", NEWG, OLDTXT)).toBe(EMP_LOOKS_LIKE_EMAIL); expect(EMP_LOOKS_LIKE_EMAIL).toContain("This looks like an Email ID. This game asks for an employee ID: letters and numbers only.");
    expect(empBadMessage("demo1＠demo-test.invalid", NEWG, OLDTXT)).toBe(EMP_LOOKS_LIKE_EMAIL);
  });
  test("old game: always the old text, even for an @", () => { expect(empBadMessage("---", OLDG, OLDTXT)).toBe(OLDTXT); expect(empBadMessage("demo1@demo-test.invalid", OLDG, OLDTXT)).toBe(OLDTXT); });
  test("Email-ID game: 'Please check your Email ID. It looks incomplete.'", () => { expect(badIdMessageFor("demo1", "email", NEWG, OLDTXT)).toBe("Please check your Email ID. It looks incomplete."); expect(EMAIL_ID_BAD).toBe("Please check your Email ID. It looks incomplete."); expect(badIdMessageFor("---", "emp", NEWG, OLDTXT)).toBe(EMP_BAD_NEW); });
  test("no sentence contains the mangled address", () => { for (const m of [EMP_BAD_NEW, EMP_LOOKS_LIKE_EMAIL, EMAIL_ID_BAD]) expect(m).not.toContain("DEMO1DEMOTESTINVALID"); });
});
