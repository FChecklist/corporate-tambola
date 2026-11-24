// Release 1.12.0 (24 Nov 2026): the owner's pricing update (three cups). The version rule: a changed price is a new version, and every place that names the
// version says the same one: releases.json (it feeds the footer, /version.json and the owner's release page), every package.json, the lock file, CHANGELOG and the knowledge pages.
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

describe("1.12.0: the version rule for the pricing update", () => {
  test("releases.json says 1.12.0 on top, with 1.11.2, 1.11.1 and 1.11.0 right under it; the notes are plain", () => {
    expect(rel.slice(0, 4).map((r) => r.version)).toEqual(["1.12.0", "1.11.2", "1.11.1", "1.11.0"]);
    expect(rel[0]!.date).toBe("2026-11-24"); expect(rel[0]!.changes.length).toBeGreaterThan(4);
    for (const c of rel[0]!.changes) { expect(c).not.toMatch(/`|\.ts\b|\.js\b|DATAREQ_|kv\b/); expect(c.length).toBeLessThan(520); }
    expect(rel[0]!.changes.join(" ")).toContain("Rs 2,999"); expect(rel[0]!.changes.join(" ")).toContain("Most chosen");
  });
  test("every package.json that has a version says 1.12.0, and so does the lock file's list of our own packages", () => {
    const files = packageJsons(); expect(files.length).toBeGreaterThanOrEqual(9); expect(files).toContain("package.json"); expect(files).toContain("apps/edge/package.json");
    const versions = files.map((f) => [f, JSON.parse(read(f)).version]).filter((x) => x[1] !== undefined);
    expect(versions.length).toBeGreaterThanOrEqual(9); // the root and eight packages
    expect(versions.filter((x) => x[1] !== rel[0]!.version)).toEqual([]);
    const lock = read("bun.lock"); const ours = [...lock.matchAll(/"name": "(?:@tambola\/[a-z]+)",\s*"version": "([^"]+)"/g)].map((m) => m[1]);
    expect(ours.length).toBe(8); expect(ours.every((v) => v === rel[0]!.version)).toBe(true);
  });
  test("CHANGELOG, the knowledge page, its index and the open-items list all say 1.12.0, newest first", () => {
    const log = read("CHANGELOG.md");
    expect(log).toMatch(/^## 1\.12\.0 - 2026-11-24$/m); expect(log.indexOf("## 1.12.0")).toBeLessThan(log.indexOf("## 1.11.2"));
    expect(existsSync(join(ROOT, "docs/KNOWLEDGE/12-RELEASE-1.12.0.md"))).toBe(true);
    expect(read("docs/KNOWLEDGE/12-RELEASE-1.12.0.md")).toMatch(/^# Release 1\.12\.0/);
    expect(read("docs/KNOWLEDGE/README.md")).toContain("12-RELEASE-1.12.0.md");
    expect(read("docs/KNOWLEDGE/05-OPEN-ITEMS.md")).toContain("## Release 1.12.0");
  });
  test("the saved copies on phones are renewed (zsw.js cache moved from v47), because common.js, zc.js and zc-flow.js changed", () => {
    const m = read("apps/web/public/zsw.js").match(/const CACHE = "ct-game-v(\d+)"/); expect(Number(m![1])).toBeGreaterThanOrEqual(48);
  });
  test("the changelog says what it did NOT change and why, and names the two decisions for the owner", () => {
    const log = read("CHANGELOG.md").split("## 1.11.2")[0]!;
    expect(log).toContain("### Not changed on purpose"); expect(log).toContain("### Decisions the owner should look at"); expect(log).toMatch(/Money flags/); expect(log).toMatch(/\*\*The word "erased"\.\*\*/);
  });
});
