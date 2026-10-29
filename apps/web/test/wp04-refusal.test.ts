// WP-04 TA25/T02: when the console refuses a game, the screen names the game and says who you are signed in as,
// so a person with two e-mails or two links can see at once why it is not opening. The real console script runs in a DOM against the real Worker code.
// NOTE: never put a DOM element in expect(): compare text and booleans only.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

setDefaultTimeout(30_000);
const START = roundAt(T) + 1200;
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function page(w: ReturnType<typeof newWorld>, eid: string, token: string, email: string) {
  const p = await openPage(w.world, {
    url: "http://localhost/zc?e=" + eid, html: "zc.html", scripts: "zgame.js control.js zc.js".split(" "), session: { "ctz-org": token, "ctz-email": email },
    afterLoad: (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; },
  });
  open.push(p); return p;
}

describe("TA25/T02: refusal screens say which game and who you are", () => {
  test("an organizer who opens another account's game is told the game and the e-mail they are signed in with", async () => {
    const w = newWorld();
    const a = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
    expect((await w.api("POST", "/api/z", { id: "REF-A", startRound: START, callSeconds: 9, cap: 100 }, a.aiKey)).status).toBe(200);
    const b = await w.json(await w.api("POST", "/api/start", { email: "other@rival.com" }, undefined));
    const p = await page(w, "REF-A", b.token, "other@rival.com");
    await p.waitFor((x) => /does not open with this sign-in/.test(x), 8000);
    const t = p.text();
    expect(t).toContain("REF-A");
    expect(t).toContain("You are signed in as other@rival.com");
  });
  test("a Co-host link made for one game, opened on another game: the page names both games", async () => {
    const w = newWorld();
    const a = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
    for (const id of ["REF-ONE", "REF-TWO"]) expect((await w.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100 }, a.aiKey)).status).toBe(200);
    const co = await w.json(await w.api("POST", "/api/org/cohost", { label: "Ravi", phone: "98765 00001", e: "REF-ONE" }, a.token));
    expect(typeof co.cohostKey).toBe("string");
    const p = await page(w, "REF-TWO", co.cohostKey, "boss@acme.com");
    await p.waitFor((x) => /Co-host link is for the game/.test(x), 8000);
    const t = p.text();
    expect(t).toContain("Your Co-host link is for the game REF-ONE, not REF-TWO. Open the game REF-ONE.");
  });
});
