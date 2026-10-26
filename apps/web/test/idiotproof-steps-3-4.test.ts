// Steps 3 and 4 made idiot-proof (owner order, 2026-10-26): every refusal says which moment and what to do, nothing is cut or changed without a word,
// and work that is not saved yet is flagged. The pages run as a browser runs them: the real page scripts in a DOM, the real Worker code, an in-memory database.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

setDefaultTimeout(60_000);
const START = roundAt(T) + 1200; // one hour after T
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer() {
  const w = newWorld();
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string, aiMessage: s.aiMessage as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const make = (o: O, id: string) => o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100 }, o.aiKey);
const summaryOf = async (o: O, id: string) => o.json(await o.api("GET", `/api/z/${id}/summary`, undefined, o.aiKey));
const infoOf = async (o: O, id: string) => o.json(await o.api("GET", `/api/z/${id}/info`, undefined, o.token));
/** Records every settings save the page sends, so a test can see that a refused Save sent nothing. */
const spy = () => {
  const patches: any[] = [];
  const hook = (win: any, f: string) => {
    if (f !== "control.js") return;
    const real = win.fetch;
    win.fetch = async (input: any, init?: any) => { const u = new URL(String(input), "http://localhost"); if ((init?.method || "GET").toUpperCase() === "PATCH" && /\/settings$/.test(u.pathname)) patches.push(JSON.parse(init.body)); return real(input, init); };
  };
  return { patches, hook };
};
async function consoleOf(o: O, eid: string, hook?: (win: any, f: string) => void) {
  const p = await openPage(o.world, { url: `http://localhost/zc?e=${eid}`, html: "zc.html", scripts: ["zgame.js", "control.js", "zc.js"], session: { "ctz-org": o.token, "ctz-aimsg": o.aiMessage, "ctz-email": "boss@acme.com" }, afterLoad: (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; hook?.(win, f); } });
  open.push(p); await p.waitFor((x) => /Hello|Last step|Your game/i.test(x)); return p;
}
const openStep = (p: Page, n: number) => p.click(`.zc-dot[data-open="${n}"]`);
const setField = (p: Page, sel: string, v: string) => { const el = p.$(sel) as any; el.value = v; el.dispatchEvent(new p.win.Event("input", { bubbles: true })); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Records which element the page scrolls to (the test DOM has no layout, so nothing really scrolls). */
const scrolls = (p: Page) => { const seen: string[] = []; for (const c of [p.win.Element, p.win.HTMLElement]) c.prototype.scrollIntoView = function (this: any) { seen.push(this.id); }; return seen; };
/** Presses a link without letting the test DOM follow it. */
const press = (p: Page, sel: string) => { const el = p.$(sel) as any; el.addEventListener("click", (e: any) => e.preventDefault(), { once: true }); el.dispatchEvent(new p.win.MouseEvent("click", { bubbles: true, cancelable: true })); };

describe("steps 3 and 4: every refusal names the thing to fix, and nothing is changed without a word", () => {
  test("YouTube: a link copied from a phone (m.youtube.com) saves as a YouTube moment; a look-alike address is refused naming the moment, before anything is sent", async () => {
    const o = await organizer(); await make(o, "IP-YT"); const w = spy(); const p = await consoleOf(o, "IP-YT", w.hook); openStep(p, 4);
    p.click('[data-ck="midN"][data-v="1"]'); p.click('[data-ck="mid.0.k"][data-v="yt"]');
    setField(p, "#f-mid-0-v", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ");
    p.click('[data-save="4"]'); await p.waitFor((x) => /Moment 1 during the game: that is not a YouTube video link/.test(x));
    expect(w.patches.length).toBe(0); // refused here: nothing was sent
    setField(p, "#f-mid-0-v", "https://m.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(p.$('[data-lk="mid.0"]')!.textContent).toMatch(/YouTube link: plays inside the game/); // the green tick is true now: the server accepts it
    p.click('[data-save="4"]'); await p.waitFor((x) => /Saved\./.test(x));
    expect((await summaryOf(o, "IP-YT")).breaks[0]).toMatchObject({ kind: "youtube", mediaUrl: "https://m.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(p.errors).toEqual([]);
  });

  test("a video file pasted on the YouTube box is saved as a video file, and a link typed as www.youtube.com/... gets https:// added; neither is refused", async () => {
    const o = await organizer(); await make(o, "IP-YT2"); const p = await consoleOf(o, "IP-YT2"); openStep(p, 4);
    p.click('[data-ck="midN"][data-v="2"]'); p.click('[data-ck="mid.0.k"][data-v="yt"]'); p.click('[data-ck="mid.1.k"][data-v="vid"]');
    setField(p, "#f-mid-0-v", "https://cdn.example.com/a.mp4"); setField(p, "#f-mid-1-v", "www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(p.$('[data-lk="mid.1"]')!.textContent).toMatch(/YouTube link: plays inside the game/); // the note and Save agree
    p.click('[data-save="4"]'); await p.waitFor((x) => /Saved\./.test(x));
    expect((await summaryOf(o, "IP-YT2")).breaks.map((b: any) => [b.kind, b.mediaUrl])).toEqual([["file", "https://cdn.example.com/a.mp4"], ["youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"]]);
  });

  test("a link that does not start with https:// is refused beside the Save button, naming the moment, and the page scrolls to it; an empty link box is saved as a message and the person is told", async () => {
    const o = await organizer(); await make(o, "IP-LINK"); const w = spy(); const p = await consoleOf(o, "IP-LINK", w.hook); openStep(p, 4); const seen = scrolls(p);
    p.click('[data-ck="opN"][data-v="1"]'); p.click('[data-ck="op.0.k"][data-v="vid"]'); setField(p, "#f-op-0-t", "Welcome"); setField(p, "#f-op-0-v", "http://acme.com/a.mp4");
    p.click('[data-save="4"]'); await p.waitFor((x) => /Moment 1 before the game: the link must start with https:\/\/ and have no spaces/.test(x)); await sleep(100);
    expect(p.$("#footmsg")!.textContent).toMatch(/Moment 1 before the game/); expect(w.patches.length).toBe(0); expect(seen.at(-1)).toBe("footmsg");
    setField(p, "#f-op-0-v", ""); // no link at all: not a dead end, the moment is saved as a plain message
    p.click('[data-save="4"]'); await p.waitFor((x) => /Moment 1 before the game had no link, so it shows your message only/.test(x)); await sleep(100);
    expect(w.patches.length).toBe(1); expect(w.patches[0].opening[0]).toMatchObject({ kind: "speech", title: "Welcome" }); expect(w.patches[0].opening[0].mediaUrl).toBeUndefined();
    expect(seen.at(-1)).toBe("zcnote"); // the note is scrolled into view
  });

  test("How long: 40 is saved as 39 and the person is told; 700 is refused naming the moment; moments and lucky draws share the three places during the game", async () => {
    const o = await organizer(); await make(o, "IP-SEC"); const w = spy(); const p = await consoleOf(o, "IP-SEC", w.hook); openStep(p, 4);
    p.click('[data-ck="opN"][data-v="1"]'); setField(p, "#f-op-0-t", "Welcome"); setField(p, "#f-op-0-s", "40");
    p.click('[data-save="4"]'); await p.waitFor((x) => /lasts 39 seconds/.test(x));
    expect(w.patches[0].opening[0].seconds).toBe(39);
    openStep(p, 4); p.click('[data-ck="midN"][data-v="1"]'); setField(p, "#f-mid-0-t", "Break"); setField(p, "#f-mid-0-s", "700");
    p.click('[data-save="4"]'); await p.waitFor((x) => /Moment 1 during the game: how long must be from 15 to 600 seconds/.test(x)); expect(w.patches.length).toBe(1);
    setField(p, "#f-mid-0-s", ""); p.click('[data-ck="midN"][data-v="3"]'); setField(p, "#f-mid-1-t", "Second"); p.click("[data-luckyadd]");
    expect(p.$("[data-luckyadd]")).toBeNull(); expect(p.text()).toMatch(/All 3 places during the game are used/); // two moments and a lucky draw fill the three places
    setField(p, "#f-mid-2-t", "Third"); p.click('[data-save="4"]');
    await p.waitFor((x) => /During the game you can have 3 things in all, moments and lucky draws together\. You have 4\. Remove 1/.test(x)); expect(w.patches.length).toBe(1);
  });

  test("a logo or colour without a company name: the hint shows beside the name box at once and goes when the name is typed; tapping the colour again takes it off; the calm note is scrolled into view after Save", async () => {
    const o = await organizer(); await make(o, "IP-HINT"); const w = spy(); const p = await consoleOf(o, "IP-HINT", w.hook); openStep(p, 4); const seen = scrolls(p);
    expect(p.$("#brandhint")).toBeNull();
    p.click('[data-ck="brand.color"][data-v="#AD1457"]'); expect(p.$("#brandhint")!.textContent).toMatch(/Type your company name above\. Without it, your colour will not show on the tickets/);
    setField(p, "#f-brand-name", "Acme"); expect(p.$("#brandhint")).toBeNull();
    setField(p, "#f-brand-name", ""); expect(p.$("#brandhint")).toBeTruthy();
    p.click('[data-ck="brand.color"][data-v="#AD1457"]'); expect(p.$("#brandhint")).toBeNull(); expect(p.$('[data-ck="brand.color"][data-v="#AD1457"]')!.getAttribute("aria-pressed")).toBe("false");
    p.click('[data-ck="brand.color"][data-v="#AD1457"]');
    p.click('[data-save="4"]'); await p.waitFor((x) => /is not on the tickets yet, because there is no company name/.test(x)); await sleep(100);
    expect(w.patches[0].brand).toEqual({}); expect(seen.at(-1)).toBe("zcnote");
  });

  test("work that is not saved yet is flagged beside the Save button and to the page's own updater; saving clears it", async () => {
    const o = await organizer(); await make(o, "IP-DIRTY"); const p = await consoleOf(o, "IP-DIRTY"); const dirty = () => (p.win as any).__ctDirty();
    expect(dirty()).toBe(false); openStep(p, 4); expect(p.$("#unsavednote")).toBeNull();
    setField(p, "#f-brand-name", "Acme"); expect(p.$("#unsavednote")!.textContent).toMatch(/Not saved yet/); expect(dirty()).toBe(true);
    p.click('[data-save="4"]'); await p.waitFor((x) => /Saved\./.test(x)); expect(dirty()).toBe(false);
    openStep(p, 4); expect(p.$("#unsavednote")).toBeNull();
    expect(readFileSync(join(import.meta.dir, "../public/autoupdate.js"), "utf8")).toMatch(/__ctDirty/); // the updater waits while something is not saved
  });

  test("text boxes tell the truth: & and an apostrophe in the company name are written as and and a typographic apostrophe, and the person is told; a prize detail stops where the whole line fits the ticket; the cash box takes digits only", async () => {
    const o = await organizer(); await make(o, "IP-TXT"); const w = spy(); const p = await consoleOf(o, "IP-TXT", w.hook); openStep(p, 4);
    setField(p, "#f-brand-name", "Johnson & Johnson"); p.click('[data-save="4"]'); await p.waitFor((x) => /will read .Johnson and Johnson. on the tickets/.test(x));
    expect(w.patches[0].brand.name).toBe("Johnson and Johnson"); expect((await infoOf(o, "IP-TXT")).brand.name).toBe("Johnson and Johnson");
    openStep(p, 4); expect((p.$("#f-brand-name") as any).value).toBe("Johnson and Johnson"); // the box shows what was saved
    setField(p, "#f-brand-name", "Dr. Reddy's Labs"); p.click('[data-save="4"]'); await p.waitFor((x) => /will read .Dr\. Reddy.s Labs. on the tickets/.test(x));
    expect(w.patches[1].brand.name).toBe("Dr. Reddy" + String.fromCharCode(8217) + "s Labs");
    openStep(p, 3); p.click('[data-ck="hs.early5.pt"][data-v="holiday"]'); expect(p.$("#f-hs-early5-pd")!.getAttribute("maxlength")).toBe("55"); // "Holiday or weekend stay: " leaves 55 of the 80 characters of a prize line
    p.click('[data-ck="hs.early5.pt"][data-v="other"]'); expect(p.$("#f-hs-early5-pd")!.getAttribute("maxlength")).toBe("80");
    p.click('[data-ck="hs.early5.pt"][data-v="cash"]'); setField(p, "#f-hs-early5-pd-amt", "50k"); expect((p.$("#f-hs-early5-pd-amt") as any).value).toBe("50");
  });

  test("See what guests see says it shows the saved game and warns beside the button when something is not saved; Test it with an empty box answers beside the box; a link typed without https:// is completed; a pasted http:// link is named on the test page", async () => {
    const o = await organizer(); await make(o, "IP-PRV"); const p = await consoleOf(o, "IP-PRV"); openStep(p, 4);
    expect(p.text()).toMatch(/Shows your game as it is saved/);
    press(p, "#seeguests"); expect(p.$("#previewnote")!.hasAttribute("hidden")).toBe(true); // nothing typed yet: no warning
    setField(p, "#f-brand-name", "Acme"); press(p, "#seeguests");
    expect(p.$("#previewnote")!.textContent).toMatch(/changes that are not saved yet/); expect(p.$("#previewnote")!.hasAttribute("hidden")).toBe(false);
    p.click('[data-ck="midN"][data-v="1"]'); p.click('[data-ck="mid.0.k"][data-v="yt"]'); const opened: string[] = []; (p.win as any).open = (u: string) => { opened.push(u); return null; };
    p.click('[data-test="mid.0"]'); expect(opened.length).toBe(0); expect(p.$('[data-lk="mid.0"]')!.textContent).toMatch(/Paste your link in the box above first/);
    setField(p, "#f-mid-0-v", "www.youtube.com/watch?v=dQw4w9WgXcQ"); p.click('[data-test="mid.0"]');
    const h = new URLSearchParams(opened[0]!.split("#")[1]); expect([h.get("u"), h.get("k")]).toEqual(["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"]);
    const v = await openPage(o.world, { url: "http://localhost/preview.html#w=break&k=file&t=Hi&u=" + encodeURIComponent("http://acme.com/a.mp4"), html: "preview.html", scripts: ["preview.js"] }); open.push(v);
    await v.waitFor((x) => /A short break/.test(x)); expect(v.text()).toMatch(/The link you pasted was not used/); expect(v.text()).not.toMatch(/guests see your message only/);
  });
});
