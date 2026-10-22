// The DEMO GAME on the screens (real page scripts in a DOM, talking to the real Worker): the console badge and the "Make this a real game" block, the ticket watermark
// on the phone, the number screen and the board badge, and the pay page that turns a demo into a real game of a chosen size. The server side is in apps/edge/test/demo.test.ts.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

setDefaultTimeout(30_000);
const START = roundAt(T) + 1200; // one hour after T
const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer(extra: Record<string, string> = {}) {
  const w = newWorld(extra);
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string, aiMessage: s.aiMessage as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const make = async (o: O, id: string, over: Record<string, unknown> = {}) => o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 10, demo: true, ...over }, o.aiKey);
const publish = (o: O, id: string) => o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token);
const ZC_SCRIPTS = "zgame.js control.js zc.js".split(" ");
async function page(o: O, url: string, html: string, scripts: string[], session: Record<string, string> = {}, extra: Partial<Parameters<typeof openPage>[1]> = {}) {
  if (scripts.includes("zc.js")) { const inner = extra.afterLoad; extra = { ...extra, afterLoad: (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; inner?.(win, f); } }; }
  const p = await openPage(o.world, { url: "http://localhost" + url, html, scripts, session, ...extra }); open.push(p); return p;
}
const consolePage = (o: O, eid: string) => page(o, `/zc?e=${eid}`, "zc.html", ZC_SCRIPTS, { "ctz-org": o.token, "ctz-aimsg": o.aiMessage, "ctz-email": "boss@acme.com" });
const openStep = (p: Page, n: number) => p.click(`.zc-dot[data-open="${n}"]`);
const row = (o: O, id: string) => o.world.raw.prepare("SELECT cap, pack, config FROM engagement WHERE id=?").get(id) as any;
const rtFake = (win: any, nowMs: () => number) => { // the phone's runtime with a fake public beacon (the real one is not reachable from a test)
  const Orig = win.ZG.PhoneRuntime;
  win.ZG.PhoneRuntime = class extends Orig {
    constructor(eid: string, deps: any) {
      super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(nowMs()) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: any) => x.signature === "aa", mono: () => deps.mono() });
    }
  };
};
const phone = (o: O, eid: string) => page(o, `/z?e=${eid}`, "z.html", ["audio.js", "zgame.js", "z.js"], {}, { afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, () => o.world.now); } });
const joinOn = async (p: Page, ph = "9822222222") => { await p.waitFor((x) => /Join the engagement/.test(x)); (p.$("#ph") as any).value = ph; (p.$("#nm") as any).value = "Asha"; p.click("#go"); };

describe("the console of a demo game", () => {
  test("a published demo: the DEMO GAME badge in the header, no payment pending, step 2 says it is a demo (no switch back), step 7 and 8 say free, step 8 offers Make this a real game with the packs", async () => {
    const o = await organizer(); await make(o, "UI-DEMO"); await publish(o, "UI-DEMO");
    const p = await consolePage(o, "UI-DEMO");
    const t = await p.waitFor((x) => /DEMO GAME/.test(x) && /Your game at a glance/.test(x));
    expect(p.$("#demopill")!.textContent).toBe("DEMO GAME"); expect(p.$("#paypill")!.textContent).toMatch(/DEMO GAME/); expect(p.$("#paypill")!.className).toMatch(/zc-pill-demo/);
    expect(t).not.toMatch(/Payment pending|payment is pending|Pay now/); expect(p.$("#paynote")).toBeNull();
    openStep(p, 2); await p.waitFor((x) => /This is a DEMO GAME/.test(x));
    expect(p.$("#demonote")).toBeTruthy(); expect(p.$('[data-ck="demo"]')).toBeNull(); // a published demo is made real by paying, not by a chip
    expect(p.$('[data-ck="cap"][data-v="10"]')).toBeTruthy(); expect(p.$('[data-ck="cap"][data-v="250"]')).toBeNull(); // at most 10 people
    openStep(p, 7); expect(await p.waitFor((x) => /Published · DEMO GAME/.test(x))).toMatch(/Nothing to pay/);
    openStep(p, 8); const t8 = await p.waitFor((x) => /Make this a real game/.test(x));
    expect(t8).toMatch(/DEMO GAME · free/); expect(t8).toMatch(/Up to 100 people · Rs 2,399\.00/); expect(t8).toMatch(/Up to 250 people/);
    expect((p.$("#makerealgo") as any).getAttribute("href")).toBe("/pay.html?e=UI-DEMO&pack=100"); expect(p.$("#pricerow")).toBeNull(); expect(p.$("#copypaylink")).toBeNull();
    p.click('[data-realpack="250"]'); await p.waitFor((x) => /Choose 250 people and pay/.test(x));
    expect((p.$("#makerealgo") as any).getAttribute("href")).toBe("/pay.html?e=UI-DEMO&pack=250");
    expect(p.errors).toEqual([]);
  });
  test("a demo draft: step 2 has the demo chip on and only demo sizes; step 7 says publishing a demo needs no payment; saving 12 people is refused in place with the guide's words", async () => {
    const o = await organizer(); await make(o, "UI-DEMOD", { cap: 6 });
    const p = await consolePage(o, "UI-DEMOD");
    await p.waitFor((x) => /Your game at a glance/.test(x));
    openStep(p, 2); await p.waitFor((x) => /Is this a free demo game/.test(x));
    expect(p.$('[data-ck="demo"][data-v="1"]')!.className).toMatch(/\bon\b/); expect(p.$('[data-ck="cap"][data-v="10"]')).toBeTruthy(); expect(p.$('[data-ck="cap"][data-v="100"]')).toBeNull();
    const cap = p.$("#f-cap") as any; cap.value = "12"; cap.dispatchEvent(new p.win.Event("input", { bubbles: true }));
    p.click('#sec2 [data-save="2"]'); await p.waitFor((x) => /A demo game is for up to 10 people/.test(x));
    expect(row(o, "UI-DEMOD").cap).toBe(6);
    openStep(p, 7); expect(await p.waitFor((x) => /Publish \(free\)/.test(x))).toMatch(/DEMO GAME.*nothing to pay/);
    openStep(p, 2); await p.waitFor((x) => /Is this a free demo game/.test(x));
    p.click('[data-ck="demo"][data-v="0"]'); // a draft may become a real game before publishing
    await p.waitFor((x) => !/A demo game costs nothing/.test(x));
    expect(p.$('[data-ck="demo"][data-v="0"]')!.className).toMatch(/\bon\b/); expect(p.$('[data-ck="cap"][data-v="250"]')).toBeTruthy();
    expect(p.errors).toEqual([]);
  });
  test("a real game shows no demo badge or demo block", async () => {
    const o = await organizer(); await make(o, "UI-REAL", { demo: false, cap: 100 }); await publish(o, "UI-REAL");
    const p = await consolePage(o, "UI-REAL"); await p.waitFor((x) => /Your game at a glance/.test(x));
    expect(p.$("#demopill")).toBeNull(); expect(p.$("#paypill")!.textContent).toBe("Payment pending for this game");
    openStep(p, 8); await p.waitFor((x) => /Pay/.test(x)); expect(p.$("#makereal")).toBeNull();
  });
});

describe("the phone, the number screen and the board", () => {
  test("the ticket carries a DEMO GAME watermark and tag; the page says it is a demo game; the aria label says so", async () => {
    const o = await organizer(); await make(o, "UI-DEMOT"); await publish(o, "UI-DEMOT");
    const p = await phone(o, "UI-DEMOT"); await joinOn(p);
    const t = await p.waitFor((x) => /Your ticket/.test(x) && /DEMO GAME/.test(x));
    expect(p.$(".zticket.zdemogame")).toBeTruthy(); expect(p.$(".zticket")!.getAttribute("aria-label")).toBe("Your ticket (demo game)");
    expect(p.$("#demogame")!.textContent).toMatch(/This is a demo game for up to 10 people/); expect(p.$(".zcard h2 .zdemotag")!.textContent).toBe("DEMO GAME");
    expect(t).not.toMatch(/pay|unpaid|invoice/i);
    expect(p.errors).toEqual([]);
  });
  test("a real game's ticket has no watermark", async () => {
    const o = await organizer(); await make(o, "UI-REALT", { demo: false, cap: 100 }); await publish(o, "UI-REALT");
    const p = await phone(o, "UI-REALT"); await joinOn(p); await p.waitFor((x) => /Your ticket/.test(x));
    expect(p.$(".zticket.zdemogame")).toBeNull(); expect(p.$("#demogame")).toBeNull(); expect(p.text()).not.toMatch(/DEMO GAME/);
  });
  test("the number screen and the organizer's board show the DEMO GAME badge beside the brand", async () => {
    const o = await organizer(); await make(o, "UI-DEMOB"); await publish(o, "UI-DEMOB");
    const big = await page(o, "/big?e=UI-DEMOB", "big.html", ["zgame.js", "big.js"]);
    await big.waitFor((x) => /The engagement starts in/.test(x) && /DEMO GAME/.test(x)); expect(big.$("#demogame")!.textContent).toBe("DEMO GAME");
    const board = await page(o, "/board?e=UI-DEMOB", "board.html", ["zgame.js", "board.js"], { "ctz-board-UI-DEMOB": o.token });
    await board.waitFor((x) => /The engagement starts in/.test(x) && /DEMO GAME/.test(x)); expect(board.$("#demogame")!.textContent).toBe("DEMO GAME");
  });
  test("the watermark goes on the next read once the demo is a real game", async () => {
    const o = await organizer({ TEST_MODE: "1" }); await make(o, "UI-DEMOW"); await publish(o, "UI-DEMOW");
    const p = await phone(o, "UI-DEMOW"); await joinOn(p); await p.waitFor((x) => /DEMO GAME/.test(x));
    const r = await o.json(await o.api("POST", "/api/checkout", { eid: "UI-DEMOW", pack: 100, name: "Boss", email: "boss@acme.com", country: "IN", currency: "INR" }, o.token)); expect(r.result.converted).toBe(true);
    const q = await phone(o, "UI-DEMOW"); await joinOn(q, "9822222223"); const t = await q.waitFor((x) => /Your ticket/.test(x)); // the next phone to open the game sees no mark
    expect(t).not.toMatch(/DEMO GAME/); expect(q.$(".zticket.zdemogame")).toBeNull();
  });
});

describe("the pay page makes a demo a real game", () => {
  const payPage = (o: O, eid: string, pack?: number) => page(o, `/pay?e=${eid}${pack ? "&pack=" + pack : ""}`, "pay.html", ["common.js", "pay.js"], { "ctz-org": o.token, "ctz-email": "boss@acme.com", "ctz-phone": "98765 43210" });
  test("the pack from the console is chosen; another pack can be picked; paying clears the demo and raises the size; the page then says it is paid", async () => {
    const o = await organizer({ TEST_MODE: "1" }); await make(o, "UI-DEMOP"); await publish(o, "UI-DEMOP");
    const p = await payPage(o, "UI-DEMOP", 250);
    const t = await p.waitFor((x) => /Make this a real game/.test(x));
    expect(t).toMatch(/free demo game for up to 10 people/); expect(t).not.toMatch(/already paid and published|Payment pending/);
    expect(p.$('[data-pack="250"]')!.getAttribute("aria-pressed")).toBe("true"); expect(t).toMatch(/Up to 250/); expect(t).toMatch(/3,499/);
    p.click('[data-pack="500"]'); await p.waitFor((x) => /Pay ₹4,699 securely/.test(x));
    expect(p.$('[data-pack="500"]')!.getAttribute("aria-pressed")).toBe("true"); expect(p.text()).toMatch(/Up to 500/);
    (p.$("#nm") as any).value = "Asha Rao"; p.click("#paygo");
    const d = await p.waitFor((x) => /Payment received/i.test(x));
    expect(d).toMatch(/Your demo game is now a real game/); expect(d).toMatch(/up to 500 participants/); expect(d).toMatch(/DEMO GAME mark goes away/);
    const r = row(o, "UI-DEMOP"); expect(r.pack).toBe(500); expect(r.cap).toBe(500); expect(JSON.parse(r.config).demo).toBeUndefined();
    const again = await payPage(o, "UI-DEMOP"); await again.waitFor((x) => /already paid and published/i.test(x));
    expect(p.errors).toEqual([]);
  });
  test("without a pack in the address the smallest pack is offered first", async () => {
    const o = await organizer({ TEST_MODE: "1" }); await make(o, "UI-DEMOQ"); await publish(o, "UI-DEMOQ");
    const p = await payPage(o, "UI-DEMOQ"); await p.waitFor((x) => /Make this a real game/.test(x));
    expect(p.$('[data-pack="100"]')!.getAttribute("aria-pressed")).toBe("true"); expect(p.text()).toMatch(/Pay ₹2,399 securely/);
  });
});
