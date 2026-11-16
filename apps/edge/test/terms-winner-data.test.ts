// The Terms must say what the code does (owner ruling 14 Nov 2026, PR 14): the people list is cleared about 20 hours after the game ends (PURGE_AFTER_MS),
// and a winner's details are kept 365 days. It reads tools/legal/terms.frag.html, the file the legal pages are generated from.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PURGE_AFTER_MS, fullDeleteAt } from "../src/lifecycle";

const terms = readFileSync(join(import.meta.dir, "..", "..", "..", "tools", "legal", "terms.frag.html"), "utf8").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const clause = (from: string, to: string) => { const a = terms.indexOf(from), b = terms.indexOf(to, a + 1); expect([from, a >= 0, b > a]).toEqual([from, true, true]); return terms.slice(a, b); };

describe("Terms clause 11.2 and 11.3(c) match the code", () => {
  test("11.2 names the 20-hour clearing of the people list that PURGE_AFTER_MS really does, inside the 24-hour promise", () => {
    expect(PURGE_AFTER_MS).toBe(20 * 3_600_000);
    const c = clause("11.2 24-hour auto-deletion.", "11.3 Limited exceptions");
    expect(c).toMatch(/people list \(the names, mobile numbers and e-mail addresses of its Participants\)/);
    expect(c).toMatch(new RegExp(`about ${PURGE_AFTER_MS / 3_600_000} hours after the Game ends`));
    expect(c).toMatch(/in every case within twenty-four \(24\) hours/);
    expect(c).toMatch(/details of a winner are the exception described in 11\.3\(c\)/i);
  });
  test("11.3(c) lists every winner field that is kept, and 365 days is what the code keeps them for", () => {
    const end = Date.UTC(2026, 9, 1, 12, 0, 0), kept = (fullDeleteAt(end) - end) / 86_400_000;
    expect(kept).toBeGreaterThanOrEqual(365); expect(kept).toBeLessThan(366); // 00:00 IST at the end of the 365th day
    const c = clause("(c) Details of a winner", "11.4");
    expect(c).toMatch(/\(name, mobile number, e-mail address if available, game id, ticket number and prize\)/);
    expect(c).toMatch(/kept for 365 days/);
  });
});
