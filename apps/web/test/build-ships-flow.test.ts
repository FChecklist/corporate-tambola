// 1.7.0: the opt-in console (?flow=new) loads these files from the live site. If the build forgets any, the page links 404 for real users.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const SHIPPED = ["zc-flow-game.js", "zc-flow-roles.js", "zc-flow-tambola.js", "zc-flow-tambola.css", "pack/zc-flow.js", "pack/zc-flow.css", "pack/MANIFEST.json", "trynew.js", "zc-mode.js"];

describe("1.7.0: the build ships everything the new console loads", () => {
  test("every file zc.html links for ?flow=new is in pages/public after a build, and pack files are byte-equal to the source", () => {
    const r = Bun.spawnSync([process.execPath, "pages/build.mjs"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode).toBe(0);
    for (const f of SHIPPED) expect([f, existsSync(join(ROOT, "pages/public", f))]).toEqual([f, true]);
    const html = readFileSync(join(ROOT, "pages/public/zc.html"), "utf8");
    for (const m of html.matchAll(/(?:src|href)="\/((?:pack\/)?zc-flow[^"?]*)"/g)) expect([m[1], existsSync(join(ROOT, "pages/public", m[1]!))]).toEqual([m[1], true]);
    for (const f of readdirSync(join(ROOT, "pages/public/pack")).filter((x) => x.endsWith(".js"))) { const t = readFileSync(join(ROOT, "pages/public/pack", f), "utf8"); expect([f, t.startsWith("/*! Corporate Tambola")]).toEqual([f, true]); expect([f, /\/\*[\s\S]*?\*\/(?!\s*$)/.test(t.slice(300))]).toEqual([f, false]); } // owner notice on top, design notes (comments) gone
    expect(existsSync(join(ROOT, "pages/public/pack/gamelog.html"))).toBe(false); // the pack page points at a file that does not exist, and has no security headers
    expect(readFileSync(join(ROOT, "apps/web/public/zc.html"), "utf8")).not.toMatch(/<script>[^<]/); // an inline script is blocked by the page rules; it lives in trynew.js
  });
});
