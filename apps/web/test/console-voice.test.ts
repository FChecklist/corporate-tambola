// 20 Nov 2026 (owner rule, CONSOLE voice): the organizer console speaks TO the organizer and Host as "you". Never "I", "my", "me" or "myself" in organizer-facing copy.
// The new screens (zc-flow-*.js, pack/zc-flow.js) must have none. The previous screens (zc.js) still carry old wording: that number may only go down (a ratchet), and
// the lines the owner approved in the ID-invite build must stay clean. See docs/CONSOLE_VOICE.md.
// FALSIFIED BY: voice-i-in-new-screens, voice-my-in-new-screens, voice-old-screens-grow
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pub = (f: string) => readFileSync(join(import.meta.dir, "../public", f), "utf8").replace(/\r\n/g, "\n");
/** The text of every "double-quoted", 'single-quoted' and `template` string in a file (comment-only lines are skipped). */
function strings(src: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  src.split("\n").forEach((ln, i) => {
    const t = ln.trim(); if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) return;
    const code = ln.replace(/\s\/\/ .*$/, "");
    for (const m of code.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) out.push({ line: i + 1, text: m[1] ?? m[2] ?? "" });
  });
  return out;
}
const FIRST = /(^|[\s>(“"'])(I|I'm|I'll|I've|I'd|my|My|me|Me|myself|mine)($|[\s.,?!:;)<"'”’])/;
const html = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\$\{[^}]*\}/g, " ");
const hits = (f: string) => strings(pub(f)).filter((s) => !/^[a-z_.\-/#:[\]=\s]*$/.test(s.text) && FIRST.test(html(s.text)));

describe("console voice: you, never I", () => {
  for (const f of ["zc-flow-game.js", "zc-flow-prizes.js", "zc-flow-roles.js", "zc-flow-tambola.js", "pack/zc-flow.js"]) {
    test(`${f}: organizer-facing text has no I, my, me or myself`, () => {
      expect(hits(f).map((h) => `${f}:${h.line} ${h.text.slice(0, 80)}`)).toEqual([]);
    });
  }
  test("the previous screens (zc.js): the count of first-person strings only goes down", () => {
    const n = hits("zc.js").length;
    console.log("zc.js first-person strings still to rewrite:", n);
    expect(n).toBeLessThanOrEqual(BASELINE_ZC);
  });
  test("the approved start and call wording is in the console, in 'you' voice", () => {
    for (const f of ["zc.js", "zc-flow-tambola.js"]) {
      const s = pub(f);
      for (const t of ["The game starts by itself", "The game begins at the time you set. You do nothing.", "You start the game", "The game waits for you. Press Start when you are ready.", "Numbers come by themselves", "A new random number appears every 12 seconds.", "You call the numbers", "Press Next whenever you want a new random number."]) expect([f, s.includes(t)]).toEqual([f, true]);
    }
  });
  test("the voice test itself can fail: a string with ' I ' or 'my ' is caught", () => {
    expect(FIRST.test("Pick from my contacts")).toBe(true); expect(FIRST.test("What if I choose Host?")).toBe(true); expect(FIRST.test("You choose each prize")).toBe(false); expect(FIRST.test("Invite people with just an ID")).toBe(false);
  });
});
const BASELINE_ZC = 89; // 20 Nov 2026: the count when the rule was written; lower it whenever strings are rewritten (docs/CONSOLE_VOICE.md lists them)
