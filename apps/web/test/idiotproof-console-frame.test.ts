// "Idiotproof" round, console frame (2026-10-26): the phone Steps tab, the Create button after a repeated failure, a Try again that finishes the job,
// a refresh blip that no longer overwrites "Saved.", game names on the home list, the two sign-in screens, the update check, and the plain words.
// The helpers below are copies of the ones in pages.test.ts (they cannot be imported from there).
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

setDefaultTimeout(30_000);
const PUB = join(import.meta.dir, "../public");
const START = roundAt(T) + 1200; // one hour after T
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer() {
  const w = newWorld();
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string, aiMessage: s.aiMessage as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const make = (o: O, id: string, over: Record<string, unknown> = {}) => o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, ...over }, o.aiKey);
const publish = (o: O, id: string) => o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token);
const ZC_SCRIPTS = ["zgame.js", "control.js", "zc.js"];
const withHouses = (hook?: (win: any, f: string) => void) => (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; hook?.(win, f); };
/** The console of game `eid` (or the home screen when eid is empty), signed in as the organizer. */
async function consolePage(o: O, eid: string, hook?: (win: any, f: string) => void) {
  const p = await openPage(o.world, { url: "http://localhost/zc" + (eid ? "?e=" + eid : ""), html: "zc.html", scripts: ZC_SCRIPTS, session: { "ctz-org": o.token, "ctz-aimsg": o.aiMessage, "ctz-email": "boss@acme.com" }, afterLoad: withHouses(hook) });
  open.push(p); return p;
}
const openStep = (p: Page, n: number) => p.click(`.zc-dot[data-open="${n}"]`);
const setField = (p: Page, sel: string, v: string) => { const el = p.$(sel) as any; el.value = v; el.dispatchEvent(new p.win.Event("input", { bubbles: true })); };
const until = async (pred: () => boolean, ms = 6000) => { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 30)); } };
/** Lets a test answer chosen requests itself (return a Response); everything else goes on to the real Worker. */
type Rule = (method: string, url: URL, body: any) => Response | undefined;
const rules = (fn: Rule) => (win: any, f: string) => {
  if (f !== "control.js") return;
  const real = win.fetch;
  win.fetch = async (input: any, init?: any) => {
    const u = new URL(String(input), "http://localhost");
    const r = fn((init?.method || "GET").toUpperCase(), u, init?.body ? JSON.parse(init.body) : undefined);
    return r ?? real(input, init);
  };
};
const reply = (status: number, body: unknown, type = "application/json") => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": type } });

describe("console frame: nothing happens out of sight", () => {
  test("phone Steps tab: the sheet is scrolled to, the tab shows it is pressed, and Close puts it away", async () => {
    const o = await organizer(); await make(o, "FR-SHEET");
    const p = await consolePage(o, "FR-SHEET"); await p.waitFor((x) => /Hello/.test(x));
    const doc = p.win.document, getEl = doc.getElementById.bind(doc), seen: string[] = [];
    doc.getElementById = (id: string) => { const el = getEl(id); if (el && id === "zc-sheet") el.scrollIntoView = () => { seen.push(id); }; return el; };
    const tab = () => p.$('.zc-tab[data-act="sheet"]') as any;
    expect(tab().getAttribute("aria-pressed")).toBe("false");
    p.click('.zc-tab[data-act="sheet"]');
    expect(p.$("#zc-sheet")).toBeTruthy(); expect(seen).toEqual(["zc-sheet"]); // the page was asked to bring the sheet into view
    expect(tab().getAttribute("aria-pressed")).toBe("true"); expect(tab().className).toMatch(/\bon\b/);
    p.click('#zc-sheet [data-act="sheet"]'); expect(p.$("#zc-sheet")).toBeNull(); expect(tab().getAttribute("aria-pressed")).toBe("false");
    expect(readFileSync(join(PUB, "zc.css"), "utf8")).toMatch(/\.zc-tab\.on\{/);
  });

  test("Create a new game: after the same refusal twice the button is still usable (it was left grey for ever)", async () => {
    const o = await organizer(); await make(o, "FR-HAS1"); // an organizer with a game, so no first game is made by itself
    let posts = 0;
    const p = await consolePage(o, "", rules((m, u) => { if (m === "POST" && u.pathname === "/api/z") { posts++; return reply(429, { error: "Too many new engagements from this network today. Please try again tomorrow." }); } return undefined; }));
    await p.waitFor((x) => /Create a new game/.test(x));
    p.click("#mk"); await until(() => posts === 1); await p.waitFor((x) => /Too many new engagements/.test(x)); await until(() => !(p.$("#mk") as any).disabled);
    p.click("#mk"); await until(() => posts === 2); await new Promise((r) => setTimeout(r, 200));
    expect((p.$("#mk") as any).disabled).toBe(false); expect(p.$("#mk")!.textContent).toBe("Create a new game");
  });

  test("a pop-up's Try again runs the whole Save (the step moves on), and a bare 502 never shows 'http 502'", async () => {
    const o = await organizer(); await make(o, "FR-RETRY");
    const mode = { bad: true };
    const p = await consolePage(o, "FR-RETRY", rules((m, u) => (m === "PATCH" && u.pathname === "/api/z/FR-RETRY/settings" && mode.bad ? reply(502, "<html>Bad gateway</html>", "text/html") : undefined)));
    await p.waitFor((x) => /Hello/.test(x));
    let ctx: any = null; p.win.CTG = { wrap() { /* the guide is replaced by a stub here */ }, watch(_e: any, c: any) { ctx = c; } };
    p.click('[data-save="1"]'); await until(() => !!ctx);
    const t = await p.waitFor((x) => /Something went wrong on our side\. Please try again in a minute\./.test(x)); expect(t).not.toMatch(/http 502/);
    mode.bad = false; await ctx.retry(); // what the guide's Try again button calls
    await p.waitFor((x) => /1 of 10 done/.test(x)); expect(p.$("#sec2")!.className).toMatch(/open/); expect(p.$(".zc-toast-foot")).toBeNull();
  });

  test("a refresh that fails while the console is on screen leaves 'Saved.' alone; a 403 says what to press, without the word engagement", async () => {
    const o = await organizer(); await make(o, "FR-NOTE");
    const st = { fail: false, hits: 0 };
    const p = await consolePage(o, "FR-NOTE", rules((m, u) => { if (m === "GET" && u.pathname === "/api/z/FR-NOTE/info" && st.fail) { st.hits++; return reply(500, { error: "Something went wrong. Please try again." }); } return undefined; }));
    await p.waitFor((x) => /Hello/.test(x));
    st.fail = true; p.click('[data-save="1"]');
    await p.waitFor((x) => /1 of 10 done/.test(x)); await until(() => st.hits >= 1); await new Promise((r) => setTimeout(r, 150));
    expect(p.$("#zcnote")!.textContent).toBe("Saved."); expect(p.text()).not.toMatch(/Could not refresh/);
    const q = await consolePage(o, "FR-NOTE", rules((m, u) => (m === "GET" && u.pathname === "/api/z/FR-NOTE/info" ? reply(403, { error: "Forbidden" }) : undefined)));
    const t = await q.waitFor((x) => /Press All games/.test(x)); expect(t).not.toMatch(/engagement/i); expect(t).toMatch(/Sign out/);
  });

  test("home list: games show their names (the code stays small); Reuse the data opens the careful panel instead of building a game; the money sentence is true", async () => {
    const o = await organizer();
    await make(o, "FR-A", { name: "Draft game" }); o.world.now += 60_000; // the newest game is listed first
    await make(o, "FR-B", { name: "Diwali party" }); await publish(o, "FR-B");
    expect((await o.api("POST", "/api/z/FR-B/join", { phone: "9855555555", device: "1".repeat(32) })).status).toBe(200);
    let posts = 0;
    const p = await consolePage(o, "", rules((m, u) => { if (m === "POST" && u.pathname === "/api/z") posts++; return undefined; }));
    const t = await p.waitFor((x) => /Your games/.test(x) && /Diwali party/.test(x));
    expect(t).toMatch(/Draft game/); expect(t).toMatch(/\(code FR-B\)/); expect(t).toMatch(/Your last game was on/);
    expect(t).toMatch(/Publishing is free\. You pay before the game starts/); expect(t).not.toMatch(/You pay only when you publish/);
    expect(p.$("[data-reuse]")).toBeNull();
    p.click(".zc-lastbar [data-clonebtn]"); await until(() => !!p.$("#clonepanel"));
    expect(posts).toBe(0); // nothing was created by that tap
  });

  test("sign-in pages: the e-mail button page survives a reload and says plainly when the internet is down; the console sign-in box keeps her on the card", async () => {
    const w = newWorld();
    const s = await openPage(w.world, { url: "http://localhost/signin.html?t=abc&go=ai", html: "signin.html", scripts: ["google.js", "signin.js"] }); open.push(s);
    await s.waitFor((x) => /Sign me in/.test(x));
    expect(s.win.location.search).toBe(""); expect(s.win.history.state).toEqual({ t: "abc", go: "ai" }); // gone from the address bar, kept in this page's own history entry
    new Function("window", `with (window) { ${readFileSync(join(PUB, "signin.js"), "utf8")}\n}`).call(s.win, s.win); // the same page again, on the address without the token (a reload)
    await s.waitFor((x) => /Sign me in/.test(x)); expect(s.$("#go")).toBeTruthy(); expect(s.text()).not.toMatch(/lost your sign-in link/);
    s.win.fetch = async () => { throw new TypeError("Failed to fetch"); };
    s.click("#go"); const down = await s.waitFor((x) => /We could not reach the service/.test(x)); expect(down).not.toMatch(/Failed to fetch/); expect(s.$("#go")).toBeTruthy();
    const bare = await openPage(w.world, { url: "http://localhost/signin.html", html: "signin.html", scripts: ["google.js", "signin.js"] }); open.push(bare);
    const none = await bare.waitFor((x) => /lost your sign-in link/.test(x)); expect(none).not.toMatch(/Press the button to sign in/); expect(bare.$("#go")).toBeNull();
    const c = await openPage(w.world, { url: "http://localhost/zc", html: "zc.html", scripts: ZC_SCRIPTS, session: {}, afterLoad: withHouses() }); open.push(c);
    await c.waitFor((x) => /Type your e-mail and press Continue/.test(x));
    const err = () => c.$("#lerr") as any;
    c.click("#goLogin"); expect(err().style.display).toBe(""); expect(err().textContent).toMatch(/Type your e-mail address in the box above/);
    setField(c, "#lem", "boss@acme"); c.click("#goLogin"); expect(err().textContent).toMatch(/does not look like an e-mail address/);
    expect(c.win.location.hash).toBe(""); expect(c.win.sessionStorage.getItem("ctz-next")).toBeFalsy(); expect((c.$("#lem") as any).value).toBe("boss@acme"); // still on the card, and what she typed stays
  });

  test("update check: an older saved copy of the page notices at once that it is old; it waits while choices are unsaved; a local copy behaves as before", async () => {
    const run = async (built: string, dirty = false) => {
      const src = readFileSync(join(PUB, "autoupdate.js"), "utf8").replace('"__BUILT__"', JSON.stringify(built));
      const store: Record<string, string> = {}; let reloads = 0;
      const win: any = { addEventListener() {} }; if (dirty) win.__ctDirty = () => true;
      const doc: any = { activeElement: null, hidden: false, addEventListener() {} };
      const live = async () => ({ ok: true, json: async () => ({ commit: "c2", builtAt: "T2" }) });
      const sess = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
      const loc = { pathname: "/zc.html", reload: () => { reloads++; } };
      new Function("window", "document", "fetch", "sessionStorage", "location", "setInterval", src)(win, doc, live, sess, loc, () => 0);
      await new Promise((r) => setTimeout(r, 30)); // the first look at /version.json
      return { reloads: () => reloads, again: async () => { win.__ctAutoCheck(); await new Promise((r) => setTimeout(r, 30)); } };
    };
    const old = await run("c1|T1|"); expect(old.reloads()).toBe(1); await old.again(); expect(old.reloads()).toBe(1); // once for the same version, never in a loop
    expect((await run("c2|T2|")).reloads()).toBe(0); // built from the live version: nothing to do
    expect((await run("__BUILT__")).reloads()).toBe(0); // a local copy: the first look only records the live version
    const waiting = await run("c1|T1|", true); expect(waiting.reloads()).toBe(0); // unsaved choices: not now
  });

  test("plain words and ticks: Help and the progress line tell the truth, the About lines match the forms, a draft has no Continue on Publish, Game day or After the game, and unsaved taps are flagged", async () => {
    const o = await organizer(); await make(o, "FR-WORDS");
    const p = await consolePage(o, "FR-WORDS"); await p.waitFor((x) => /Hello/.test(x));
    expect(p.text()).toMatch(/Your progress/); expect(p.text()).not.toMatch(/Your progress\s*·\s*saved/);
    p.click('[data-act="help"]'); expect(p.text()).toMatch(/nothing is saved until you press it/); expect(p.text()).not.toMatch(/saves as you go/);
    openStep(p, 5); expect(p.$("#about5")!.textContent).toMatch(/Give a name and a mobile number or an e-mail/);
    openStep(p, 6); const a6 = p.$("#about6")!.textContent as string; expect(a6).toMatch(/uploading a PDF or a CSV/); expect(a6).not.toMatch(/pasting from Excel/);
    for (const n of [7, 9, 10]) { openStep(p, n); expect([n, p.$(`[data-save="${n}"]`)]).toEqual([n, null]); }
    openStep(p, 1); p.click('[data-ck="occ"][data-v="Team party"]'); // tapped, not saved
    expect((p.win as any).__ctDirty()).toBe(true);
    openStep(p, 7); expect(p.$("#unsaved1")).toBeTruthy(); expect(p.$('#unsaved1 [data-open="1"]')).toBeTruthy();
    openStep(p, 1); p.click('[data-save="1"]'); await p.waitFor((x) => /1 of 10 done/.test(x)); await until(() => !(p.win as any).__zc.saving);
    expect((p.win as any).__ctDirty()).toBe(false); openStep(p, 7); expect(p.$("#unsaved1")).toBeNull();
    await publish(o, "FR-WORDS"); const q = await consolePage(o, "FR-WORDS"); await q.waitFor((x) => /Your progress/.test(x)); openStep(q, 7);
    expect(q.$('[data-save="7"]')).toBeTruthy(); // a published game still has its Continue
  });
});
