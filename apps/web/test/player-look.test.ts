// 1.7.1 (owner 30 Oct, approved mock): the participant page in two looks (Retro | Modern), the invitation text on the first screen, Ticket A | Ticket B with the other one greyed,
// a cross on a crossed number, and the thank-you strip. Display only: the join, the marks and the claims are the old code. What the engine cannot do is not drawn.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pub = (f: string) => readFileSync(join(import.meta.dir, "../public", f), "utf8").replace(/\r\n/g, "\n");
const z = pub("z.js"), css = pub("z.css");

describe("player look 1.7.1", () => {
  test("the whole page follows the chosen look: html[data-pt] is set at start and when the player switches", () => {
    expect(z).toContain('document.documentElement.setAttribute("data-pt", LOOK)');
    expect(z.match(/setAttribute\("data-pt", LOOK\)/g)!.length).toBe(2);
    for (const t of ["retro", "modern"]) expect(css).toContain(`html[data-pt=${t}] body`);
  });
  test("the first screen says who invites you and what to type (exact words)", () => {
    expect(z).toContain("You are invited to join the Corporate Tambola (Housie) organized by ");
    expect(z).toContain('"To join, type " + what + "."');
    expect(z).toContain("your employee ID or your mobile number");
    expect(z).toContain("Press the button to get your ticket.");
    expect(z).toContain("${welcomeLine(personal)}");
  });
  test("Ticket A | Ticket B: a Playing switch, the other ticket greyed, both keep marking; no switch in the Super Bumper or with one ticket", () => {
    expect(z).toContain('Playing: <button type="button" class="zpl" data-tpbtn="A"');
    expect(z).toContain('v.tickets.length === 2 && !superOn(v) ? playingSwitch() : ""');
    expect(css).toMatch(/\.ztkwrap\.zdim\{opacity:\.6/);
  });
  test("a crossed number keeps its number and gets a thin cross, in both looks; numbers are smaller", () => {
    expect(css).toContain("html[data-pt=modern] .zticket>div.m::after{background:#FF6FAE}");
    expect(css).toMatch(/html\[data-pt\] \.zticket>div\{font-size:16px/);
  });
  test("audit fixes: a winning cell stays gold, Danger and Cancel buttons keep their look, the A/B buttons are 44 px", () => {
    expect(css).toContain("html[data-pt] .zticket>div.m.w{background:linear-gradient(135deg,#FFE08A,#FFB703)");
    expect(css).toContain("html[data-pt] .zbtn.zdanger{background:#b3261e;color:#fff}");
    expect(css).toContain("html[data-pt] .zbtn.alt{background:transparent;border:2px solid var(--golddt)");
    expect(css).toMatch(/\.zpl\{[^}]*min-height:44px/);
    expect(css.indexOf("div.m.w{")).toBeGreaterThan(css.indexOf("html[data-pt=modern] .zticket>div.m::before")); // after the rules it must beat
  });
  test("end of game: the thank-you strip with the share and WhatsApp buttons comes first; rules are not shown there", () => {
    expect(z).toContain("Thank you for playing the game. You can recommend this game to others.");
    expect(z.indexOf(`id="zshare">Thank you for playing`)).toBeGreaterThan(-1);
    expect(z.indexOf(`id="zshare">Thank you for playing`)).toBeLessThan(z.indexOf("<h2>Game completed${demoTag()}"));
    expect(z).toContain('${v.phase === "ended" ? "" : \'<details class="zrulesrow" id="zrulesrow"><summary>Rules</summary><ol class="zrules"');
  });
  test("hidden because the engine cannot do it: no 'Game completed' page after 30 minutes (the view carries no end time)", () => {
    expect(z).not.toMatch(/Game completed \(Game/);
    // 1.8.0: the engine now has family approval (approvals.ts), so those screens exist; see participant-180.test.ts
  });
});
