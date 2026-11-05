// 1.7.0: the new console may say only what the engine does. Co-host approval, family approval and a 15-minute cutoff are NOT in the engine, so no shipped console file may promise them.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pub = (f: string) => readFileSync(join(import.meta.dir, "../public", f), "utf8");
const words = (f: string) => pub(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$|\s\/\/ .*$/gm, ""); // what a person can read: the code comments are not shown
const BANNED = [/Co-host\.?\s*A family host/i, /can also be let in by that Co-host/i, /family host approves/i, /Share your family link/i, /15 minutes before the game/i, /approve[sd]? by (the|a) Co-host/i];

describe("the new console promises nothing the engine cannot do", () => {
  test("no hidden-feature words in the console files", () => {
    for (const f of ["zc-flow-roles.js", "zc-flow-tambola.js", "zc-flow-game.js", "zc-flow-tambola.css"]) for (const re of BANNED) expect([f, re.source, re.test(words(f))]).toEqual([f, re.source, false]);
  });
  test("what each role reads about who lets people in is only the truthful part", () => {
    const w: any = {}; new Function("window", pub("zc-flow-roles.js"))(w);
    for (const r of ["cohost", "host", "organizer"]) expect(/Co-host can|family/i.test(w.ZROLES.approvalText(r))).toBe(false);
    expect(w.ZROLES.approvalText("organizer")).toContain("wait for you or a Host");
  });
});
