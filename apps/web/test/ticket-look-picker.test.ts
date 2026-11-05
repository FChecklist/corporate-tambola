// (scaffold copied from join-retry.test.ts) Idiot-proof player pages (owner order of 26 Oct 2026: every player is told what went wrong and exactly what to do, next to the control used, and the game is never hampered).
// The real page scripts (z.js, big.js) run in a DOM and talk to the REAL Worker code with an in-memory database, as phone-guest.test.ts does. Only the public randomness is the test's own clock.
// (z.js and big.js are read from apps/web/public; the Worker wording comes straight from apps/edge/src. The runtime texts are tested in packages/beacon/test/phone-runtime.test.ts.)
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { newWorld, openPage, roundAt, roundMs, T, type Page } from "./harness";
import { GRACE_ROUNDS } from "../../../packages/beacon/src/config";
import { roundTimeMs, type Fetcher, type Round } from "../../../packages/beacon/src";

setDefaultTimeout(240_000);
const HOUR = 3_600_000;
const START = roundAt(T) + 1200; // one hour after T
const T2 = Date.UTC(2026, 9, 24, 10, 0, 0); // after the present check-in began (23 Oct 2026): a game made now needs it
const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer(at = T) {
  const w = newWorld(); w.world.now = at;
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const make = (o: O, id: string, over: Record<string, unknown> = {}) => o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, ...over }, o.aiKey);
const publish = (o: O, id: string) => o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token);
const published = async (o: O, id: string, set: Record<string, unknown> = {}) => { await make(o, id); if (Object.keys(set).length) expect((await o.api("PATCH", `/api/z/${id}/settings`, set, o.token)).status).toBe(200); await publish(o, id); };
const fakeBeacon = (nowMs: () => number) => { const fetcher: Fetcher = async (url) => { const last = url.split("/").pop()!, nowR = roundAt(nowMs()), r = last === "latest" ? nowR : Number(last); if (r > nowR) return { ok: false, status: 404, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" } as Round) }; }; return { fetcher, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }; };
const rtFake = (win: any, nowMs: () => number) => { // the phone's runtime with a fake public beacon (the real one is not reachable from a test)
  const Orig = win.ZG.PhoneRuntime;
  win.ZG.PhoneRuntime = class extends Orig { constructor(eid: string, deps: any) { super(eid, { ...deps, beacon: fakeBeacon(nowMs), verify: (x: any) => x.signature === "aa", mono: () => deps.mono() }); } };
};
/** `pre` runs before the page's own scripts (to preset storage or wrap fetch). */
async function phoneAt(o: O, url: string, pre?: (win: any) => void) {
  const p = await openPage(o.world, { url: "http://localhost" + url, html: "z.html", scripts: ["audio.js", "zgame.js", "z.js"], afterLoad: (win, f) => { if (f === "audio.js") pre?.(win); if (f === "zgame.js") rtFake(win, () => o.world.now); } });
  open.push(p); return p;
}
const typeJoin = async (p: Page, phone: string, name = "Asha") => { await p.waitFor((x) => /Join the game/.test(x)); (p.$("#ph") as any).value = phone; (p.$("#nm") as any).value = name; p.click("#go"); };
const setVal = (p: Page, sel: string, v: string) => { const el = p.$(sel) as any; el.value = v; el.dispatchEvent(new p.win.Event("input", { bubbles: true })); };
const SEEN = /Your ticket|What you can win|Starting in|Getting ready/;


describe("the player chooses the ticket look: Retro (the default) or Modern", () => {
  test("a joined player sees two radio buttons, Retro is checked, the ticket is the retro one; choosing Modern changes the ticket at once and is remembered; choosing Retro changes it back", async () => {
    const o = await organizer(); await published(o, "UI-LOOK");
    const p = await phoneAt(o, "/z?e=UI-LOOK");
    await typeJoin(p, "9812345678");
    await p.waitFor((x) => /Ticket look/.test(x), 60000);
    const radios = () => Array.from(p.win.document.querySelectorAll("input[name=zlook]")) as any[];
    expect(radios().map((r) => r.value)).toEqual(["retro", "modern"]);
    expect(radios().filter((r) => r.checked).map((r) => r.value)).toEqual(["retro"]); // exactly one, Retro by default
    expect(p.win.document.querySelector(".zticket.modern")).toBeNull();
    expect(/Retro look/.test(p.text())).toBe(true); expect(/Modern look/.test(p.text())).toBe(true);
    radios()[1].click(); radios()[1].dispatchEvent(new p.win.Event("change", { bubbles: true }));
    await p.waitFor(() => !!p.win.document.querySelector(".zticket.modern"), 5000);
    expect(radios().filter((r) => r.checked).map((r) => r.value)).toEqual(["modern"]);
    expect(p.win.localStorage.getItem("ctz-look")).toBe("modern");
    radios()[0].click(); radios()[0].dispatchEvent(new p.win.Event("change", { bubbles: true }));
    await p.waitFor(() => !p.win.document.querySelector(".zticket.modern"), 5000);
    expect(p.win.localStorage.getItem("ctz-look")).toBe("retro");
  });
});
