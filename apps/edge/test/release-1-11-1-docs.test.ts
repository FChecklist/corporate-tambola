// Release 1.11.1 (21 Nov 2026): what the second round of audits of 1.11.0 asked for, checked from the words in the repository.
//   L2 (audit 2): releases.json said "reminders and invitations are bulk mail", "marketed ... not mailed again" for every lane, and "many sign-ups cannot use up the month's mail allowance". None of it is true.
//   The docs and code comments said the same "reminders and invitations". Only the DRAFT REMINDER is bulk; the Help Desk invitation (it carries a live link) is transactional.
//   L7 (audit 2): older docs held the owner's personal mailbox addresses. They are masked (`j***@example.com`, the form the code itself uses).
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import RELEASES from "../src/releases.json";

const ROOT = join(import.meta.dir, "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const rel = RELEASES as { version: string; date: string; title: string; changes: string[] }[];
const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(join(ROOT, dir))) {
    if (n === "node_modules" || n === ".git") continue;
    const p = join(dir, n);
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

describe("1.11.1: the version rule (a change after a deploy is a new version)", () => {
  test("releases.json, CHANGELOG, the knowledge page and its index all say 1.11.1, and 1.11.0 (the deployed release) is still listed right under it", () => {
    expect(rel[0]!.version).toBe("1.11.1"); expect(rel[1]!.version).toBe("1.11.0");
    expect(rel[0]!.date).toMatch(/^2026-11-2\d$/); expect(rel[0]!.changes.length).toBeGreaterThan(3);
    expect(read("CHANGELOG.md")).toMatch(/^## 1\.11\.1 - 2026-11-2\d$/m);
    expect(read("CHANGELOG.md").indexOf("## 1.11.1")).toBeLessThan(read("CHANGELOG.md").indexOf("## 1.11.0"));
    expect(existsSync(join(ROOT, "docs/KNOWLEDGE/10-RELEASE-1.11.1.md"))).toBe(true);
    expect(read("docs/KNOWLEDGE/10-RELEASE-1.11.1.md")).toMatch(/^# Release 1\.11\.1/);
    expect(read("docs/KNOWLEDGE/README.md")).toContain("10-RELEASE-1.11.1.md");
  });
  test("the page footer stamp comes from releases.json (the build writes it), so the stamped version is 1.11.1", () => {
    // the real build is tested in apps/web/test/version-stamp.test.ts; here only the source of the stamp is pinned
    expect(rel[0]!.version).toBe(JSON.parse(read("apps/edge/src/releases.json"))[0].version);
  });
});

describe("1.11.1 L2: the release lines are true", () => {
  const all = (): string[] => rel.slice(0, 2).flatMap((r) => r.changes);
  test("no line says reminders AND invitations are bulk mail: only the draft reminder is", () => {
    for (const c of all()) expect(c).not.toMatch(/reminders and invitations|invitations and reminders|reminders, invitations/i);
  });
  test("no line says an address that bounced or complained is never mailed again, without saying that only reminders are held back", () => {
    for (const c of all()) if (/not mailed again|never mailed again/i.test(c)) expect(c).toMatch(/reminders? (only|are)|only (the )?reminders?|reminder mail/i);
  });
  test("no line promises that sign-ups cannot use up the month's mail allowance", () => {
    for (const c of all()) expect(c).not.toMatch(/cannot use up|can not use up|can never use up/i);
  });
});

describe("1.11.1 docs: 'reminders and invitations' is gone from the docs and code comments that describe the lanes", () => {
  const files = ["apps/edge/src/mail-lanes.ts", "apps/edge/src/pay.ts", "docs/RETENTION.md", "apps/edge/test/mail-lanes.test.ts", "docs/KNOWLEDGE/08-MAIL-DELIVERABILITY.md", "docs/KNOWLEDGE/09-RELEASE-1.11.0.md", "docs/MAIL-DELIVERABILITY-OWNER-STEPS.md", "docs/OWNER_DESK.md"];
  test.each(files)("%s does not list invitations as bulk mail", (f) => {
    const t = read(f);
    expect(t).not.toMatch(/reminders and invitations|invitations and reminders|reminders, invitations|invitations, reminders|marketing, invitations/i);
    expect(t).not.toMatch(/which mails are bulk: the draft reminder and the Help Desk invitation/);
  });
});

describe("1.11.1 L7: personal e-mail addresses are masked in the docs and in the markdown at the top of the repository", () => {
  const PERSONAL = /([A-Za-z0-9._%+-]+)@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|proton|protonmail|rediffmail)\.(com|in|me)\b/gi;
  const docs = [...walk("docs"), ...readdirSync(ROOT).filter((n) => n.endsWith(".md"))].filter((p) => /\.(md|txt|json)$/.test(p));
  test("no file under docs/ or a top-level .md holds an unmasked address of a personal mail provider (the mask is one letter and ***)", () => {
    const bad: string[] = [];
    for (const f of docs) { const t = readFileSync(join(ROOT, f), "utf8"); for (const m of t.matchAll(PERSONAL)) if (!/^[A-Za-z0-9]\*\*\*$/.test(m[1]!)) bad.push(`${relative(".", f)}: ${m[1]!.slice(0, 1)}***@${m[2]}.${m[3]}`); }
    expect(bad).toEqual([]);
  });
  test("a plus-address form without its domain (name+tag) is not left in the older docs either", () => {
    const bad: string[] = [];
    for (const f of docs) { const t = readFileSync(join(ROOT, f), "utf8"); if (/\b[a-z]+\.[a-z]+\+(demonew|livetest|tamb-)\w*/i.test(t)) bad.push(f); }
    expect(bad).toEqual([]);
  });
});
