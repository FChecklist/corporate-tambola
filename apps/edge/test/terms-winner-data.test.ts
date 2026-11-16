// The Terms must say what the code does (owner ruling 14 Nov 2026): the people list is cleared about 20 hours after the game ends (PURGE_AFTER_MS), always inside the 24-hour promise, and a winner's details are kept 365 days.
// It reads the page that is really SERVED (apps/web/public/terms.html). It does NOT read tools/legal/terms.frag.html: that fragment is older than the page and its generator is switched off (tools/make-legal-pages.mjs, 1.6.7).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PURGE_AFTER_MS, fullDeleteAt } from "../src/lifecycle";
import { TERMS_VERSION } from "../src/brand";

const root = join(import.meta.dir, "..", "..", "..");
const raw = readFileSync(join(root, "apps", "web", "public", "terms.html"), "utf8");
const terms = raw.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

describe("the served Terms page matches the code", () => {
  test("the people list clears about 20 hours after the game, inside the 24-hour promise (page and code agree)", () => {
    expect(PURGE_AFTER_MS).toBe(20 * 3_600_000);
    expect(terms).toContain("All information about participants is deleted within 24 hours after the game. The automatic clearing runs about 20 hours after the game ends.");
    expect(terms).toMatch(/Participant data, codes, invitation records and requests Within 24 hours after the game ends \(cleared automatically about 20 hours after it ends\)/);
    expect(terms).toMatch(/Within 24 hours after it was meant to end/);
  });
  test("the page never says 23 hours (a wrong figure the old fragment carried)", () => {
    expect(terms).not.toMatch(/\b23 hours\b|\btwenty-three\b/i);
  });
  test("winner details: kept 365 days on the page, and 365 days is what the code keeps them for; the page does not claim a winner's e-mail is kept", () => {
    const end = Date.UTC(2026, 9, 1, 12, 0, 0), kept = (fullDeleteAt(end) - end) / 86_400_000;
    expect(kept).toBeGreaterThanOrEqual(365); expect(kept).toBeLessThan(366); // 00:00 IST at the end of the 365th day
    expect(terms).toMatch(/The winners' record: who won which prize place 365 days Auto-deleted/);
    expect(terms).toMatch(/Details a winner confirms to receive a prize \(Tambola, Bingo, Snakes and Ladders\) 365 days Auto-deleted/);
    expect(terms).not.toMatch(/e-mail address if available/i);
  });
  test("the page carries the one terms version (brand.ts), so people are asked to accept again when the words change", () => {
    expect(raw).toContain(`data-version="${TERMS_VERSION}"`);
    expect(terms).toContain(`Version ${TERMS_VERSION}`);
  });
  test("the page generator stays switched off, so nobody can overwrite the served page with the old fragment", () => {
    const gen = readFileSync(join(root, "tools", "make-legal-pages.mjs"), "utf8");
    expect(gen.split("\n").slice(0, 5).join("\n")).toContain("process.exit(1)");
  });
});
