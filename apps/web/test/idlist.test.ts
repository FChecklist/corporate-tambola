import { describe, expect, test } from "bun:test";
// @ts-ignore plain browser script with a CommonJS tail
import Z from "../public/idlist.js";

describe("a pasted ID list is read in the browser", () => {
  test("1 column", () => { const r = Z.parse("e-1001\nE 1002\nE1003"); expect(r.columns).toBe(1); expect(r.ids).toEqual(["E1001", "E1002", "E1003"]); expect(r.idCol).toBe(1); expect(r.ask).toBe(false); });
  test("2 columns: serial + ID (tab-separated, as copied from Excel)", () => { const r = Z.parse("1\tE1001\n2\tE1002\n3\tE1003"); expect(r.idCol).toBe(2); expect(r.ids).toEqual(["E1001", "E1002", "E1003"]); expect(Z.describe(r).line).toBe("Found 2 columns: Serial, ID. Using column 2 as the ID."); });
  test("3 columns: serial + name + ID", () => { const r = Z.parse("1\tAsha Rao\tE1001\n2\tVikram Shah\tE1002\n3\tMeera Iyer\tE1003"); expect(r.idCol).toBe(3); expect(r.ids).toEqual(["E1001", "E1002", "E1003"]); expect(Z.describe(r).line).toBe("Found 3 columns: Serial, Name, ID. Using column 3 as the ID."); expect(Z.describe(r).preview).toBe("E1001, E1002, E1003"); });
  test("comma and semicolon lists", () => { expect(Z.parse("1,E1001\n2,E1002").ids).toEqual(["E1001", "E1002"]); expect(Z.parse("1;E1001\n2;E1002").ids).toEqual(["E1001", "E1002"]); });
  test("a header row names the ID column and is skipped", () => { const r = Z.parse("S.No\tName\tEmployee ID\n1\tAsha\t0042\n2\tVikram\t0043"); expect(r.header).toBe(true); expect(r.idCol).toBe(3); expect(r.ids).toEqual(["0042", "0043"]); });
  test("numeric IDs keep their leading zeros and are not taken for a serial number", () => { const r = Z.parse("1\t000123\n2\t004567\n3\t000890"); expect(r.idCol).toBe(2); expect(r.ids).toEqual(["000123", "004567", "000890"]); });
  test("blank rows and repeated IDs are counted", () => { const r = Z.parse("E1\n\nE2\n  \nE1\ne-1\nE3"); expect(r.ids).toEqual(["E1", "E2", "E3"]); expect(r.blank).toBe(2); expect(r.repeated).toBe(2); expect(Z.describe(r).counts).toBe("3 IDs ready, 2 blank rows skipped, 2 repeated IDs removed."); });
  test("a column of e-mail addresses is ignored and never saved; an ID with @ is rejected", () => {
    const r = Z.parse("E1001\tasha@acme.com\nE1002\tvik@acme.com"); expect(r.idCol).toBe(1); expect(r.ids).toEqual(["E1001", "E1002"]); expect(r.ignored.map((x: any) => x.kind)).toEqual(["email"]); expect(Z.describe(r).note).toBe("A column with e-mail addresses (or mobile numbers) was found. It is ignored and not saved. Only IDs are needed.");
    const m = Z.parse("asha@acme.com\nvik@acme.com"); expect(m.ids).toEqual([]); expect(Z.clean("asha@acme.com")).toEqual({ bad: "email" }); expect(Z.clean("asha＠acme.com").bad).toBe("email");
  });
  test("a column of mobile numbers is ignored", () => { const r = Z.parse("E1001\t9876543210\nE1002\t+919812345678"); expect(r.ignored.map((x: any) => x.kind)).toEqual(["mobile"]); expect(r.ids).toEqual(["E1001", "E1002"]); });
  test("when it cannot decide it asks, never guesses silently", () => { const r = Z.parse("E1001\tB2001\nE1002\tB2002"); expect(r.ask).toBe(true); const f = Z.parse("E1001\tB2001\nE1002\tB2002", 2); expect(f.ids).toEqual(["B2001", "B2002"]); });
  test("foreign digits and letters are refused, not converted", () => { const r = Z.parse("E١٠٠١\nE1002"); expect(r.ids).toEqual(["E1002"]); expect(r.invalid[0].why).toBe("english"); });
  test("a 31-character ID is not usable", () => { expect(Z.parse("A".repeat(31)).invalid.length).toBe(1); expect(Z.parse("A".repeat(30)).ids.length).toBe(1); });
  test("a 5000-row paste with three columns", () => { const t = Array.from({ length: 5000 }, (_, i) => `${i + 1}\tPerson ${String.fromCharCode(65 + (i % 26))}\tE${String(1000 + i)}`).join("\n"); const t0 = Date.now(); const r = Z.parse(t); expect(r.ready).toBe(5000); expect(r.idCol).toBe(3); expect(Date.now() - t0).toBeLessThan(2000); });
});
