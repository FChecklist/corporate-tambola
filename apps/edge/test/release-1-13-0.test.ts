// Release 1.13.0 (25 Nov 2026): the game-alert button, built and switched OFF. The version rule: a change after a deploy is a new version, and every place that names the version says
// the same one: releases.json (it feeds the footer, /version.json and the owner's release page), every package.json, the lock file, CHANGELOG and the knowledge pages. 1.12.0 (the pricing update,
// PR 39) may sit right under it or not be merged yet: the tests below accept both.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import RELEASES from "../src/releases.json";

const ROOT = join(import.meta.dir, "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const rel = RELEASES as { version: string; date: string; title: string; changes: string[] }[];
const packageJsons = (dir = "."): string[] => readdirSync(join(ROOT, dir)).flatMap((e) => {
  if (e === "node_modules" || e === ".git" || e === "public" || e === "reference") return [];
  const p = dir === "." ? e : dir + "/" + e;
  if (statSync(join(ROOT, p)).isDirectory()) return dir.split("/").length < 3 ? packageJsons(p) : [];
  return e === "package.json" ? [p] : [];
});

describe("1.13.0: the version rule for the game-alert release", () => {
  test("releases.json says 1.13.0 on top, with 1.12.0 (if merged) and 1.11.2, 1.11.1, 1.11.0 right under it; the notes are plain", () => {
    expect(rel[0]!.version).toBe("1.13.0");
    expect(["1.12.0", "1.11.2"]).toContain(rel[1]!.version);
    const i2 = rel.findIndex((r) => r.version === "1.11.2"); expect(i2).toBeGreaterThan(0);
    expect(rel.slice(i2, i2 + 3).map((r) => r.version)).toEqual(["1.11.2", "1.11.1", "1.11.0"]);
    expect(rel[0]!.date).toBe("2026-11-25"); expect(rel[0]!.changes.length).toBeGreaterThan(4);
    for (const c of rel[0]!.changes) { expect(c).not.toMatch(/`|\.ts\b|\.js\b|DATAREQ_|PUSH_|kv\b/); expect(c.length).toBeLessThan(520); }
    const all = rel[0]!.changes.join(" ");
    expect(all).toContain("Yes, notify me when this game begins"); expect(all).toContain("only a browser address is kept, not a name, e-mail or phone"); // the notes say what is kept
  });
  test("every package.json that has a version says 1.13.0, and so does the lock file's list of our own packages", () => {
    const files = packageJsons(); expect(files.length).toBeGreaterThanOrEqual(9); expect(files).toContain("package.json"); expect(files).toContain("apps/edge/package.json");
    const versions = files.map((f) => [f, JSON.parse(read(f)).version]).filter((x) => x[1] !== undefined);
    expect(versions.length).toBeGreaterThanOrEqual(9); // the root and eight packages
    expect(versions.filter((x) => x[1] !== rel[0]!.version)).toEqual([]);
    const lock = read("bun.lock"); const ours = [...lock.matchAll(/"name": "(?:@tambola\/[a-z]+)",\s*"version": "([^"]+)"/g)].map((m) => m[1]);
    expect(ours.length).toBe(8); expect(ours.every((v) => v === rel[0]!.version)).toBe(true);
  });
  test("CHANGELOG, the knowledge page, its index and the open-items list all say 1.13.0, newest first", () => {
    const log = read("CHANGELOG.md");
    expect(log).toMatch(/^## 1\.13\.0 - 2026-11-25$/m); expect(log.indexOf("## 1.13.0")).toBeLessThan(log.indexOf("## 1.11.2"));
    expect(existsSync(join(ROOT, "docs/KNOWLEDGE/13-RELEASE-1.13.0.md"))).toBe(true);
    expect(read("docs/KNOWLEDGE/13-RELEASE-1.13.0.md")).toMatch(/^# Release 1\.13\.0/);
    expect(read("docs/KNOWLEDGE/README.md")).toContain("13-RELEASE-1.13.0.md");
    expect(read("docs/KNOWLEDGE/05-OPEN-ITEMS.md")).toContain("## Release 1.13.0");
  });
  test("the saved copies on phones are renewed (the cache name moved past 1.12.0's v48), because z.html, z.js and zsw.js changed", () => {
    const m = read("apps/web/public/zsw.js").match(/const CACHE = "ct-game-v(\d+)"/); expect(Number(m![1])).toBeGreaterThanOrEqual(49);
  });
  test("the changelog says what it did NOT change and why, and names the owner's decision about where the privacy words live", () => {
    const log = read("CHANGELOG.md").split("## 1.11.2")[0]!;
    expect(log).toContain("### Not changed on purpose"); expect(log).toContain("terms.html"); expect(log).toMatch(/owner's decision/);
    expect(read("docs/KNOWLEDGE/13-RELEASE-1.13.0.md")).toContain("## Open (owner / BOSS)");
  });
  test("the two new settings are named in the settings list, with no value", () => {
    const names = read("config/SECRETS_NAMES.md");
    expect(names).toContain("PUSH_URL"); expect(names).toContain("PUSH_ADMIN_KEY");
    expect(read("docs/KNOWLEDGE/13-RELEASE-1.13.0.md")).not.toMatch(/https:\/\/[a-z0-9-]+\.(workers\.dev|pages\.dev)/); // no real service address in a public page
  });
});
