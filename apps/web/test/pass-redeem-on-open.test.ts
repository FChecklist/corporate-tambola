// A demo pass link (zc.html?pass=...) opened by an organizer who is taken straight back into her last game must still be used.
// Found with a real prospect (27 Oct 2026): she had made a 250 game first, then opened the 250 link and was still asked to pay, because the link was only used on the home screen.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "..", "public", "zc.js"), "utf8");

describe("demo pass is used when the console opens straight into a game", () => {
  test("init redeems the pass for an organizer BEFORE it restores the last game or opens one", () => {
    const init = src.indexOf("if (r === \"partner\") return redraw();");
    const redeem = src.indexOf("if (isOrg()) { await redeemPass();", init);
    const restore = src.indexOf("LAST && LAST.eid && LAST.role === r", init);
    const open = src.indexOf("if (eid) refreshEng();", init);
    expect(init).toBeGreaterThan(0);
    expect(redeem).toBeGreaterThan(init);
    expect(redeem).toBeLessThan(open);
    expect(restore).toBeGreaterThan(init);
  });
  test("a person with an existing game is told to press Publish, no payment needed", () => {
    expect(src).toContain("Your game is already made: open its last step and press Publish, no payment is needed.");
  });
  test("the home screen still redeems it too", () => {
    expect(src).toContain("if (isOrg()) await redeemPass(); // a demo pass link opened in this browser is used now");
  });
});
