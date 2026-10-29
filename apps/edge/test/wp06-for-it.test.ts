// WP-06 TA23 (gap plan 2026-10-29, IT reader): "Which domains to allow? No questionnaire, no notice period."
// The Trust page gets a "For IT" section: which addresses a phone and an organizer's browser contact, where it is hosted, how long data stays and what happens on a breach.
//  - the deletion timeline is generated from the lifecycle constants (boss ruling Q6: no retention window is changed, the wording is made consistent)
//  - every address our security policy (pages/build.mjs) allows is listed, so the page cannot drift from the real allow-list
//  - nothing is invented: no certificate, no hours for breach notice, no PAN/GST/bank facts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as TP from "../src/trust-page";
import { FACTS } from "../src/ai-facts";
import { PURGE_AFTER_MS, REPORT_LINK_MS, SETTINGS_KEEP_MS, MAX_AHEAD_MS } from "../src/lifecycle";

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n"); // the working copy may carry Windows line ends; the repository does not
const plain = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&middot;/g, "·").replace(/\s+/g, " ");
const HOUR = 3_600_000, DAY = 24 * HOUR;
const forIt = (TP as any).forItSection as ((r?: Record<string, number>) => string) | undefined;
const page = () => TP.trustHtml();

describe("TA23: the For IT section", () => {
  test("the Trust page has a For IT section, reachable from the top of the page", () => {
    const h = page();
    expect(h).toContain('id="for-it"'); expect(plain(h)).toMatch(/For IT/);
    expect(h).toContain('href="#for-it"');
  });
  test("the page is dated with the day it was re-checked", () => {
    expect(TP.TRUST_UPDATED).toBe("2026-10-29"); expect(page()).toContain("Last checked 2026-10-29");
  });
  test("the deletion timeline is generated from the lifecycle constants", () => {
    expect(typeof forIt).toBe("function");
    const t = plain(forIt!());
    expect(t).toContain(`${PURGE_AFTER_MS / HOUR} hours after the game ends`);
    expect(t).toContain(`${REPORT_LINK_MS / HOUR} hours after the end`);
    expect(t).toContain(`${SETTINGS_KEEP_MS / DAY} days`); expect(t).toContain(`${MAX_AHEAD_MS / DAY} days ahead`);
    expect(t).toContain("365 days"); // derived from fullDeleteAt (the end of day 365 India time)
    // and it really follows the numbers it is given, not a fixed text
    const other = plain(forIt!({ purgeHours: 7, reportHours: 6, settingsDays: 11, aheadDays: 12, keepDays: 400 }));
    expect(other).toContain("7 hours after the game ends"); expect(other).toContain("6 hours after the end"); expect(other).toContain("11 days"); expect(other).toContain("12 days ahead"); expect(other).toContain("400 days");
    expect(other).not.toContain("365 days");
  });
  test("the generated numbers agree with the ten facts (one set of retention facts)", () => {
    const f4 = FACTS.find((f) => f.n === 4)!.say;
    expect(f4).toContain(`the job runs at ${PURGE_AFTER_MS / HOUR} hours`); expect(f4).toContain(`${PURGE_AFTER_MS / HOUR} hours after the time it was meant to end`);
    expect(f4).toContain(`at most ${MAX_AHEAD_MS / DAY} days ahead`); expect(f4).toContain(`stay for ${SETTINGS_KEEP_MS / DAY} days`); expect(f4).toContain("Kept on purpose for 365 days");
  });
  test("every address our security policy allows is listed (so the list cannot drift from pages/build.mjs)", () => {
    const build = read("pages", "build.mjs");
    const urls = new Set([...build.matchAll(/https:\/\/[A-Za-z0-9.\-]+/g)].map((m) => new URL(m[0]).host).filter((h) => !/^(developers|www\.w3)\./.test(h)));
    expect(urls.size).toBeGreaterThanOrEqual(10);
    const t = plain(page());
    for (const host of urls) expect([host, t.includes(host)]).toEqual([host, true]);
    expect(t).toContain("housie.corporatetambola.com"); // the one address every guest needs
  });
  test("it says where the data is, who hosts it, who sends the e-mail and what a breach means, in the same words as the legal pages", () => {
    const t = plain(forIt!());
    expect(t).toMatch(/Cloudflare/); expect(t).toMatch(/Asia-Pacific/); expect(t).toMatch(/global network/);
    expect(t).toMatch(/hello@corporatetambola\.com/); expect(t).toMatch(/Resend/);
    expect(t).toMatch(/breach[^.]*without undue delay/i);
    expect(plain(read("apps/web/public/dpa.html"))).toMatch(/breach[^.]*without undue delay/i); // the data-processing terms say it first
    expect(plain(read("apps/web/public/subprocessors.html"))).toMatch(/Asia-Pacific/);
  });
  test("nothing is invented: no certificate, no breach hours, no tax or bank facts, no 'private', payee only as IT Services by Rajat Agarwal", () => {
    const t = plain(forIt!());
    expect(t).not.toMatch(/\bprivate\b/i); expect(t).not.toMatch(/\b(fully |is |are )?compliant\b|certified|ISO ?27001|SOC ?2 (Type|report)/i);
    expect(t).not.toMatch(/within \d+ hours? of (a |the )?breach|\d+ hours? (breach|notice)/i); // the only commitment in the terms is "without undue delay"
    expect(t).not.toMatch(/\bPAN\b|\bGSTIN?\b|IFSC|account number|bank/i);
    expect(t).not.toMatch(/Test a payment|Sales login/i);
  });
  test("the public files are exactly what the generator writes (tools/make-trust.ts), and llms.txt points to the section", () => {
    expect(read("apps", "web", "public", "trust.html")).toBe(TP.trustHtml());
    expect(read("apps", "web", "public", "llms.txt")).toBe(TP.llmsTxt());
    expect(TP.llmsTxt()).toContain("trust.html#for-it");
  });
});
