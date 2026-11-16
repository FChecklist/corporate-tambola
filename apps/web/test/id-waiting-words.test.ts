// D1 (live test, 3 Nov 2026): the join page of an ID game says "No mobile number or e-mail address is needed", but a person whose ID was not on the list ended on a waiting
// screen that said "Please ask the Organizer to add your mobile number. Then open your link again." (the server's note began "This game is by invitation", which the guide
// answers that way). An ID game's waiting screen now says only: "Your request is with the Organizer. You can come in as soon as they say yes."
// The real page scripts (z.js with the guide) run in a DOM and talk to the REAL Worker code, as phone-guest.test.ts does.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";

setDefaultTimeout(120_000);
const START = roundAt(T) + 1200; // one hour after T
const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SOFT = "Your request is with the Organizer. You can come in as soon as they say yes.";
const OLD_NOTE = "This game is by invitation. Your request is with the organizer. You can come in as soon as they say yes.";
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function idGame(id: string) {
  const w = newWorld();
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  const o = { ...w, token: s.token as string };
  expect((await o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, verify: "id", whoCanJoin: "list" }, o.token)).status).toBe(200);
  expect((await o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token)).status).toBe(200);
  return o;
}
type O = Awaited<ReturnType<typeof idGame>>;
const rtFake = (win: any, nowMs: () => number) => { // the phone's runtime with a fake public beacon (the real one is not reachable from a test)
  const Orig = win.ZG.PhoneRuntime;
  win.ZG.PhoneRuntime = class extends Orig {
    constructor(eid: string, deps: any) {
      super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(nowMs()) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: any) => x.signature === "aa", mono: () => deps.mono() });
    }
  };
};
async function phone(o: O, id: string, pre?: (win: any) => void) {
  const p = await openPage(o.world, { url: `http://localhost/z?e=${id}`, html: "z.html", scripts: ["audio.js", "zgame.js", "guide.js", "z.js"], afterLoad: (win, f) => { if (f === "audio.js") pre?.(win); if (f === "zgame.js") rtFake(win, () => o.world.now); } });
  open.push(p); return p;
}
const setVal = (p: Page, sel: string, v: string) => { const el = p.$(sel) as any; el.value = v; el.dispatchEvent(new p.win.Event("input", { bubbles: true })); };
/** What the person sees on the waiting card, after the guide has had its chance to rebuild any message it knows. */
async function waitingCard(p: Page) {
  await p.waitFor((x) => /Please wait a moment/.test(x));
  await wait(400); // the guide looks at new screen text 60 ms after it appears
  return { card: String((p.$(".zwait") as any)?.textContent ?? ""), again: String((p.$("#again") as any)?.textContent ?? ""), guided: !!p.$(".ctg-inline") || !!p.$("#ctg-dialog") };
}

describe("D1: an ID game's waiting screen never asks for a mobile number", () => {
  test("an ID not on the list: name and location, then the request waits with the soft Organizer sentence; no guide card about a mobile number", async () => {
    const o = await idGame("IDW-1");
    const p = await phone(o, "IDW-1");
    await p.waitFor((x) => /Join the game/.test(x));
    expect(p.text()).toMatch(/No mobile number or e-mail address is needed/);
    setVal(p, "#emp", "E9001"); p.click("#go");
    await p.waitFor((x) => /Your Employee ID is not on the list yet/.test(x)); // step 2: name and location (the legal wording calls it the Employee ID)
    setVal(p, "#nm", "Asha Rao"); setVal(p, "#loc", "Pune"); p.click("#go");
    const w = await waitingCard(p);
    expect(w.card).toContain(SOFT);
    expect(w.card).not.toMatch(/mobile|by invitation/i);
    expect(w.again).toBe("Wrong Employee ID? Type it again");
    expect(w.guided).toBe(false);
    expect(p.text()).not.toMatch(/add your mobile number/i);
    expect(p.errors).toEqual([]);
  });
  test("a phone that was already waiting with the older words (saved before the update) shows the new sentence too, never the guide's mobile-number card", async () => {
    const o = await idGame("IDW-2");
    const r = await o.json(await o.api("POST", "/api/z/IDW-2/join", { empId: "E9002", name: "Ravi · Delhi", device: "02" + "b".repeat(30) }));
    expect(r.waiting).toBe(true);
    const saved = JSON.stringify({ wid: r.wid, who: "the organizer", note: OLD_NOTE, phone: "", cc: "IN", e164: "", emp: "E9002", name: "Ravi · Delhi", at: o.world.now }); // (the page's clock is the test's clock)
    const p = await phone(o, "IDW-2", (win) => win.localStorage.setItem("ctz-wait-IDW-2", saved));
    const w = await waitingCard(p);
    expect(w.card).toContain(SOFT);
    expect(w.card).not.toMatch(/mobile|by invitation/i);
    expect(w.guided).toBe(false);
    expect(p.text()).not.toMatch(/add your mobile number/i);
  });
});
