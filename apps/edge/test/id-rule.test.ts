// Owner rule 1 Nov 2026: ONE format for an ID. Everything that is not an English letter or digit is dropped, upper case, leading zeros kept, at most 30 characters.
// A letter or digit of another script (Arabic-Indic digits, accents) is refused with a gentle message, never converted.
import { describe, expect, test } from "bun:test";
import { cleanEmpId, normEmpFor, hasForeignChars, empBadMessage, EMP_ENGLISH, EMP_CLEAN_FROM_MS, EMP_MAX } from "../src/empid";

const NEW = { created_ms: EMP_CLEAN_FROM_MS + 86_400_000 };
describe("the one ID format", () => {
  test("e-1001, E 1001 and e1001 are the same ID", () => { for (const x of ["e-1001", "E 1001", "e1001", "E_1001", "E.1001", "E/1001"]) expect(normEmpFor(x, NEW)).toBe("E1001"); });
  test("leading zeros are kept", () => { expect(normEmpFor("00-12", NEW)).toBe("0012"); expect(normEmpFor(" 007 ", NEW)).toBe("007"); });
  test("Arabic-Indic digits and non-English letters are refused, not converted or dropped", () => {
    for (const x of ["E١٠٠١", "١٢٣", "Éa1", "ΑΒ12", "员工1"]) { expect(hasForeignChars(x)).toBe(true); expect(normEmpFor(x, NEW)).toBeNull(); expect(empBadMessage(x, NEW, "old")).toBe(EMP_ENGLISH); }
    expect(EMP_ENGLISH).toBe("Please use English letters and numbers only.");
  });
  test("full-width English letters and digits are plain ones (NFKC)", () => { expect(normEmpFor("Ｅ－１００１", NEW)).toBe("E1001"); });
  test("30 characters are allowed, 31 are refused", () => { expect(normEmpFor("A".repeat(EMP_MAX), NEW)).toBe("A".repeat(30)); expect(normEmpFor("A".repeat(31), NEW)).toBeNull(); expect(normEmpFor("A-".repeat(30), NEW)).toBe("A".repeat(30)); });
  test("nothing left after cleaning is refused; nothing typed is nothing", () => { expect(normEmpFor("- _ .", NEW)).toBeNull(); expect(normEmpFor("   ", NEW)).toBe(""); });
  test("the same cleaning is used for a hash and a duplicate check", () => { expect(cleanEmpId("e-1001")).toBe(cleanEmpId("E 1001")); });
});
