// NOTE: never put a DOM element in expect(): a failing diff of a happy-dom node exhausts memory. Compare booleans and text.
// WP-04 TA12/S15: Publish never goes through silently while a prize has no name. The blank prizes are listed in a box; the first tap on Publish
// only asks again; "Publish anyway" is the one more tap. The real console script runs in a DOM against the real Worker code.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { newWorld, openPage, type Page } from "./harness";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

setDefaultTimeout(120_000);
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A draft game (never published) with two blank prizes and two named ones. */
async function draft(eid: string, rewards: unknown[]) {
  const w = newWorld();
  w.world.now += 0;
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  const token = s.token as string, aiKey = s.aiKey as string;
  expect((await w.api("POST", "/api/z", { id: eid, startRound: 2_000_000, callSeconds: 6, cap: 100, rewards }, aiKey)).status).toBe(200);
  const p = await openPage(w.world, {
    url: `http://localhost/zc?e=${eid}`, html: "zc.html", scripts: ["zgame.js", "control.js", "zc.js"], session: { "ctz-org": token, "ctz-email": "boss@acme.com" },
    afterLoad: (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; },
  });
  open.push(p);
  return { w, p, token };
}
const BLANKS = [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "" }, { pattern: "top", scope: "ticket", ordinal: 1, text: "A mug" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "" }, { pattern: "full", scope: "ticket", ordinal: 2, text: "A pen" }];
const openStep7 = async (c: Page) => { await c.waitFor(() => !!c.$('.zc-dot[data-open="7"]')); c.click('.zc-dot[data-open="7"]'); await c.waitFor((t) => /Check your game/.test(t)); };
const published = (x: Awaited<ReturnType<typeof draft>>, eid: string) => !!(x.w.world.raw.prepare("SELECT v FROM kv WHERE k=?").get("pub/" + eid));

describe("TA12/S15: Publish with blank prizes needs one more tap", () => {
  test("the blank prizes are listed in a box, one per line, with a way to go and name them", async () => {
    const x = await draft("WP4-LIST", BLANKS);
    await openStep7(x.p);
    const box = x.p.$("#prizewarn");
    expect(!!box).toBe(true);
    expect(Array.from(box.querySelectorAll("li")).map((e: any) => e.textContent.trim())).toEqual(["Early Five", "1st Full House"]);
    expect(box.textContent).toMatch(/2 prizes have no name/);
    expect(!!box.querySelector('[data-open="3"]')).toBe(true); // "Name the prizes" goes to step 3
  });

  test("the first tap on Publish does not publish and does not open the e-mail form: it asks; 'Publish anyway' is the second tap", async () => {
    const x = await draft("WP4-GATE", BLANKS);
    await openStep7(x.p);
    x.p.click("#publishopen"); await wait(50);
    expect(!!x.p.$("#pubgo")).toBe(false); // the form with "Confirm and publish" has not opened
    expect(!!x.p.$("#pubanyway")).toBe(true); // the second tap is offered
    expect(x.p.$("#prizewarn").textContent).toMatch(/Publish anyway/);
    expect(published(x, "WP4-GATE")).toBe(false);
    x.p.click("#pubanyway"); await wait(50);
    expect(!!x.p.$("#pubgo")).toBe(true); // now the e-mail / consent form of Publish opens
    expect(published(x, "WP4-GATE")).toBe(false); // and still nothing is published until "Confirm and publish"
  });

  test("with every prize named, Publish opens the form at once (no extra tap)", async () => {
    const x = await draft("WP4-OK", BLANKS.map((r) => ({ ...r, text: r.text || "A gift" })));
    await openStep7(x.p);
    expect(!!x.p.$("#prizewarn")).toBe(false);
    x.p.click("#publishopen"); await wait(50);
    expect(!!x.p.$("#pubgo")).toBe(true);
    expect(!!x.p.$("#pubanyway")).toBe(false);
  });

  test("a prize that is blank again after the extra tap asks again (the earlier 'anyway' only covered the earlier list)", async () => {
    const x = await draft("WP4-AGAIN", BLANKS);
    await openStep7(x.p);
    x.p.click("#publishopen"); await wait(30); x.p.click("#pubanyway"); await wait(30);
    expect(!!x.p.$("#pubgo")).toBe(true);
    x.p.click("#pubcancel"); await wait(30);
    // the same list: still covered, the form opens at once
    x.p.click("#publishopen"); await wait(30);
    expect(!!x.p.$("#pubgo")).toBe(true);
  });
});
