import { describe, expect, test } from "bun:test";
import { makeD1 } from "./d1-sqlite";
import { publicClaims } from "../src/worker";

// A big game: more claims than one page, then one Bogey after them. A phone moves its cursor to the newest time it received, so a page must never contain a later row while an earlier one is still missing.
describe("the public claims page", () => {
  test("a full page of claims is not followed by a later Bogey: nothing between them is skipped, and following the cursor delivers everything", async () => {
    const { db, raw } = makeD1();
    for (let i = 0; i < 700; i++) raw.run("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES('G1',?,?,1,?,?)", [`p${i}`, "early5", i, 1000 + i]);
    raw.run("INSERT INTO bogey(eid,pid,pattern,round,at_ms) VALUES('G1','b1','full',1,1000 + 650 + 0.5)");
    const seen: string[] = []; let after = 0, pages = 0;
    while (pages++ < 10) {
      const page = await publicClaims(db, "G1", after);
      expect(page.length).toBeGreaterThan(0);
      for (const x of page) seen.push((x.bogey ? "B:" : "C:") + x.pid);
      const top = Math.max(...page.map((x) => x.atMs));
      if (top === after && page.length < 500) break;
      if (page.length < 500 && top >= 1000 + 699) break;
      after = top;
    }
    expect(new Set(seen).size).toBe(701); // 700 claims and the Bogey, every one delivered at least once
    const first = await publicClaims(db, "G1", 0);
    expect(first.some((x) => x.bogey)).toBe(false); // the Bogey belongs after claim 650, beyond the 500th claim, so the first page stops at the 500th claim
  });
});
