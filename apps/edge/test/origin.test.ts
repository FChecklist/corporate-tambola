// RELEASE 1.6.4: housie.corporatetambola.com is the game's own address. Every default, link and public page uses it; the mailbox domain, the other games' addresses and the Terms' brand line stay as they are.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { BRAND } from "../src/brand";
import { HOME, MORE_GAMES } from "../../../packages/beacon/src/more-games";

const PUB = new URL("../../web/public/", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, PUB), "utf8");
describe("the game's own address", () => {
  test("the default origin of every link, e-mail and PDF is housie.; the mailbox stays on the main domain", () => {
    expect(BRAND.defaultOrigin).toBe("https://housie.corporatetambola.com");
    expect(BRAND.support).toBe("hello@corporatetambola.com");
  });
  test("the games bar: Tambola is housie., the home link is home., the other games keep their own addresses", () => {
    const g = read("gamesbar.js");
    expect(g).toContain('"https://housie.corporatetambola.com/", true'); expect(g).toContain("https://home.corporatetambola.com/?from=tambola");
    for (const h of ["bingo", "tictactoe", "snakes", "luck"]) expect(g).toContain(`https://${h}.corporatetambola.com/`);
    expect(g).not.toContain('"https://corporatetambola.com/"');
  });
  test("More games: Housie is housie., the hub is home.", () => {
    expect(MORE_GAMES.find((x) => x.id === "housie")!.url).toBe("https://housie.corporatetambola.com/"); expect(HOME).toBe("https://home.corporatetambola.com");
  });
  test("no public page, sitemap, robots or llms.txt points at the bare main domain (canonical, og, sitemap, sign-in texts); only the Terms' brand line (corporatetambola.com) stays", () => {
    const bare = /(?<![.@\w-])corporatetambola\.com/g, bad: string[] = [];
    for (const f of readdirSync(PUB)) if (/\.(html|txt|xml|js)$/.test(f) && !/^(control|zgame|reportgen|zc|z)\.js$|\.min\./.test(f)) {
      const t = read(f); for (const m of t.matchAll(bare)) { if (t[m.index! - 1] === "(" && t[m.index! + m[0].length] === ")") continue; bad.push(f + ": " + t.slice(Math.max(0, m.index! - 25), m.index! + 35).replace(/\s+/g, " ")); }
    }
    expect(bad).toEqual([]);
  });
  test("the hero is the owner's question; its sub line says close group online engagement of employees and associates; the word 'private' is not in the hero", () => {
    const h = read("index.html"), hero = h.slice(h.indexOf('<h1 id="h1">'), h.indexOf('class="acts"'));
    expect(hero.replace(/<[^>]+>/g, "")).toContain("This week, which teams will you engage with a close group online Housie?");
    expect(hero.replace(/<[^>]+>/g, "")).toContain("Close group online engagement of employees and associates.");
    expect(/private/i.test(hero)).toBe(false);
    expect(h).not.toContain("Engage your company");
  });
});
