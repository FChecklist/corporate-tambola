// 1.13.0: the player page and the organizer screen know the claim time. Source-level checks (the default wording itself is pinned by claim-ui-pages.test.ts).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const pub = (f: string) => readFileSync(join(import.meta.dir, "../public", f), "utf8");
describe("claim time wording", () => {
  test("z.js: every 'before the next number' instruction on the player page goes through claimBy(), which only changes the words when the game's claimWindow is above 1", () => {
    const z = pub("z.js");
    expect(z).toContain("INFO.claimWindow = Number(r.claimWindow) > 1 ? Number(r.claimWindow) : 1;");
    expect(z).toContain("within ${w} numbers of the winning number");
    expect(z.split("claimBy(").length - 1).toBeGreaterThanOrEqual(3); // the three instructions
    expect(z).not.toMatch(/press <b>Claim<\/b> before the next number is called/);
  });
  test("zc.js: the organizer is asked, the answer is sent on create and on save, and the default answer is 'Right away'", () => {
    const zc = pub("zc.js");
    expect(zc.split("claimWindow: Number(f.cw) > 1 ? Number(f.cw) : 1").length - 1).toBe(2);
    expect(zc).toContain('radios("cw", "How much time does a guest have to press Claim?", CW_OPTS)');
    expect(zc).toContain('["1", "Right away"');
    expect(zc).toContain('cw: String(c.claimWindow || inf.claimWindow || 1)');
  });
  test("gamelog.js passes the game's claim time to the rule line", () => { expect(pub("gamelog.js")).toContain("ZG.claimRuleText(log.ties, log.claimWindow)"); });
});
