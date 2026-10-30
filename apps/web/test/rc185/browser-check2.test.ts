// rc/tambola-1.8.5, second real-browser check (commit 8cac314): the seven fixes, each with its own test (and a deliberate break in tools/matrix/breaks/table.ts).
//  a  the refused ID-kind save is not silent in the new console     b  the 'This game link does not work' card reads in Retro and Modern (>= 4.5:1)
//  c  demo.html prize card text >= 4.5:1                              d  a 31-character employee ID on submit shows the too-long sentence
//  e  screen.html fsBtn / spkBtn >= 40 x 40                           f  console 'Jump to' buttons, partner links, '* mandatory without ...', EN button at 360 px
//  g  a fresh flow=new console without a session says 'Please sign in first'
// Colours and sizes are computed from the real CSS files with test/rc185/css.ts (a small cascade); the pages run in a DOM against the real Worker. Test addresses: demoN@demo-test.invalid only.
// Run: bun test --isolate apps/web/test/rc185/browser-check2.test.ts
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { handle as realHandle } from "../../../edge/src/worker";
import { PRIZE_HOUSES } from "../../../../packages/beacon/src/config";
import { PUB } from "../storage-scan";
import { organizer, published, phone, setVal, playView, realPid, roundAt, type O } from "./page";
import { boxSize, contrastOf, sheetsFor } from "./css";
import type { Page } from "../harness";

setDefaultTimeout(60_000);
const MIN_TEXT = 4.5, MIN_TAP = 40;
const src = (f: string) => readFileSync(join(PUB, f), "utf8");
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const LOCK_IDKIND = "You already have people listed. Start a new game to use a different kind of ID.";
const LOCK_VERIFY = "You already have people listed. Start a new game to use a different way of asking for IDs.";
let open: Page[] = [];
let wins: any[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; for (const w of wins) { try { await w.happyDOM.close(); } catch { /* closed */ } } wins = []; });

// ------------------------------------------------------------------------------------------------ the new console against the REAL Worker
/** The new organizer console (pack + game + Tambola scripts, and the guide) in a DOM; every call goes to the real Worker code. `token` is the organizer's key (absent: a visitor with no session). */
async function consoleAt(o: O, eid: string, opts: { token?: string; guide?: boolean; step?: number; query?: string; stub?: (method: string, url: string) => Response | null } = {}) {
  const win: any = new Window({ url: `http://localhost/zc.html?flow=new${eid ? "&e=" + eid : ""}${opts.query ?? ""}` }); wins.push(win);
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1, PRIZE_HOUSES };
  if (opts.token) win.sessionStorage.setItem("ctz-org", opts.token);
  const calls: { method: string; url: string; body: any; status?: number; reply?: any }[] = [];
  const f = async (url: string, init: any = {}) => {
    const rec: (typeof calls)[number] = { method: init.method || "GET", url, body: init.body ? JSON.parse(init.body) : null }; calls.push(rec);
    const r = opts.stub?.(rec.method, url) ?? (await realHandle(new Request(new URL(url, "http://localhost"), init), o.world.env, o.world.now));
    rec.status = r.status; rec.reply = await r.clone().json().catch(() => null);
    return r;
  };
  if (opts.guide) new Function("window", "document", "location", "navigator", "sessionStorage", "MutationObserver", src("guide.js"))(win, win.document, win.location, win.navigator, win.sessionStorage, win.MutationObserver);
  const code = ["zc-flow-game.js", "pack/zc-flow.js", "zc-flow-tambola.js"].map(src).join("\n"); // one scope, like the three scripts of the page
  const FixedDate = class extends Date { static now() { return o.world.now; } constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(o.world.now); } }; // the page reads the same fixed clock as the Worker
  new Function("window", "document", "location", "fetch", "MutationObserver", "sessionStorage", "Date", code)(win, win.document, win.location, f, win.MutationObserver, win.sessionStorage, FixedDate);
  const s = win.ZFLOW.state; if (eid) s.eid = eid;
  if (opts.step === 2) { s.done[1] = true; s.open = 2; }
  for (let i = 0; i < 3; i++) { win.ZFLOW.draw(); await tick(); }
  if (opts.step === 2) await until(win, () => !!win.document.getElementById("zt-idkind") || calls.some((c) => c.url.endsWith("/summary") && c.status !== 200));
  return { win, d: win.document, calls };
}
/** The guide (guide.js) on a page that does not load it in the test harness: the same script, run once in the window's scope. */
const loadGuide = (win: any) => { if (!win.CTG) new Function("window", "document", "location", "navigator", "sessionStorage", "MutationObserver", src("guide.js"))(win, win.document, win.location, win.navigator, win.sessionStorage, win.MutationObserver); return win.CTG; };
/** Draws again until `cond` holds (the Worker answers a moment after the page asks), at most ~4 s of real time; no fixed sleep decides a result. */
async function until(win: any, cond: () => boolean, ms = 4000) { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) { win.ZFLOW.draw(); await tick(40); } return cond(); }
/** Fills Step 1 with a day and time that are valid, so "Save and continue" really goes to the server. */
async function fillWhen(o: O, win: any, d: any) {
  win.ZFLOW.form.date = new Date(o.world.now + 10 * 86400_000).toISOString().slice(0, 10); win.ZFLOW.draw(); await tick();
  const t = [...d.querySelectorAll("#zf-time option")].find((x: any) => x.value && !x.disabled) as any; expect(t).toBeTruthy(); win.ZFLOW.form.time = t.value; win.ZFLOW.draw(); await tick();
}
const idOf = async (o: O, id: string) => o.json(await o.api("GET", `/api/z/${id}/info`, undefined, undefined, o.world.now));

describe("a: a refused ID-kind save is shown (message + guide card), the radio goes back, and Save and continue never swallows a 4xx", () => {
  const eid = "EKINDLK";
  /** A published game that asks for an ID, with one person already listed (so the kind is locked). */
  async function draft(set: Record<string, unknown> = { verify: "id" }) { // a game the organizer is still setting up (Step 2 is only drawn for a game that is not published yet)
    const o = await organizer();
    expect((await o.api("POST", "/api/z", { id: eid, startRound: roundAt(o.world.now) + 1200, callSeconds: 9, cap: 100 }, o.aiKey)).status).toBe(200);
    expect((await o.api("PATCH", `/api/z/${eid}/settings`, set, o.token)).status).toBe(200);
    return o;
  }
  async function locked(set: Record<string, unknown> = { verify: "id" }) {
    const o = await draft(set);
    const r = await o.api("POST", `/api/z/${eid}/people`, { people: [{ name: "Asha", empId: set.idKind === "email" ? "demo1@demo-test.invalid" : "1B678" }] }, o.token); expect(r.status).toBe(200);
    expect((o.world.raw.prepare("SELECT COUNT(*) c FROM person WHERE eid=?").get(eid) as { c: number }).c).toBe(1); // really listed
    return o;
  }
  const radio = (d: any, v: string) => d.querySelector(`input[name="zt-idkind"][value="${v}"]`);
  const pick = (win: any, d: any, v: string) => { const r = radio(d, v); r.checked = true; r.dispatchEvent(new win.Event("change")); };

  test("the server really refuses with 409 and the exact sentence (the console shows what the server says)", async () => {
    const o = await locked();
    const r = await o.api("PATCH", `/api/z/${eid}/settings`, { idKind: "email" }, o.token); const b = await o.json(r);
    expect([r.status, b.error]).toEqual([409, LOCK_IDKIND]); expect(typeof b.code).toBe("string");
    expect((await idOf(o, eid)).idKind).not.toBe("email"); // nothing was saved
  });
  test("choosing Email ID in Step 2 of a locked game: the message appears under the radios (role alert), with the guide card 'The kind of ID cannot change now', and the radio is back on the saved value", async () => {
    const o = await locked();
    const { win, d, calls } = await consoleAt(o, eid, { token: o.token, guide: true, step: 2 });
    expect(radio(d, "emp").checked || radio(d, "emp").hasAttribute("checked")).toBe(true);
    pick(win, d, "email"); await tick(200);
    const sent = calls.filter((c) => c.method === "PATCH" && c.body && "idKind" in c.body); expect(sent.length).toBe(1); expect(sent[0]!.status).toBe(409);
    const m = d.getElementById("zt-runmsg"); expect(m).toBeTruthy(); expect(m.getAttribute("role")).toBe("alert"); expect(m.textContent).toContain(LOCK_IDKIND);
    expect(m.textContent).toContain("The kind of ID cannot change now"); // the guide card (the title, what happened and the steps), in the same box as the message
    expect(m.textContent).toContain("People are already listed or have joined this game with their ID"); expect(m.textContent).toContain("To use a different kind of ID, start a new game.");
    expect(m.querySelectorAll("li").length).toBeGreaterThanOrEqual(2);
    expect(radio(d, "emp").checked).toBe(true); expect(radio(d, "email").checked).toBe(false); // back to what the game really holds
    expect(win.ZTAMBOLA.RUN.idKind).toBe("emp"); expect(win.ZTAMBOLA.RUN.idTouched).toBe(false); // and it is not sent again on the next Save
  });
  test("the same for the 'different way of asking for IDs' sentence (verify) and for a game already on Email ID: the radio returns to 'email'", async () => {
    const o = await locked({ verify: "id", idKind: "email" });
    const { win, d, calls } = await consoleAt(o, eid, { token: o.token, guide: true, step: 2 });
    expect(radio(d, "email").checked || radio(d, "email").hasAttribute("checked")).toBe(true); // the saved kind is what the page shows
    pick(win, d, "emp"); await tick(200);
    expect(calls.filter((c) => c.method === "PATCH" && c.body && c.body.idKind === "emp").map((c) => c.status)).toEqual([409]);
    expect(d.getElementById("zt-runmsg").textContent).toContain(LOCK_IDKIND);
    expect(radio(d, "email").checked).toBe(true); expect(radio(d, "emp").checked).toBe(false); expect(win.ZTAMBOLA.RUN.idKind).toBe("email");
  });
  test("the guide knows both sentences of the lock (kind of ID, way of asking for IDs) and gives each the same card", () => {
    const w: any = new Window({ url: "http://localhost/zc.html" }); wins.push(w); const G = loadGuide(w);
    for (const t of [LOCK_IDKIND, LOCK_VERIFY]) { const g = G.explain({ status: 409, message: t }); expect([t, g.title, g.kind]).toEqual([t, "The kind of ID cannot change now", "blocked"]); }
  });
  test("the message is plain text when the guide is not on the page, and it goes away after a save that works (no people listed)", async () => {
    const o = await draft(); // nobody listed yet: the change would be allowed
    const { win, d, calls } = await consoleAt(o, eid, { token: o.token, guide: false, step: 2 });
    // first make the game locked from outside, and see the plain message
    expect((await o.api("POST", `/api/z/${eid}/people`, { people: [{ name: "Asha", empId: "1B678" }] }, o.token)).status).toBe(200);
    pick(win, d, "email"); await tick(200);
    expect(d.getElementById("zt-runmsg").textContent).toBe(LOCK_IDKIND); expect(d.querySelector(".ctg-inline") === null).toBe(true); expect(radio(d, "emp").checked).toBe(true);
    expect(calls.filter((c) => c.method === "PATCH" && c.body && "idKind" in c.body).length).toBe(1);
  });
  test("a save that works clears an old refusal message (no stale red text)", async () => {
    const o = await draft();
    const { win, d } = await consoleAt(o, eid, { token: o.token, guide: true, step: 2 });
    pick(win, d, "email"); await tick(200);
    expect((await o.json(await o.api("GET", `/api/z/${eid}/summary`, undefined, o.token))).idKind).toBe("email"); const m = d.getElementById("zt-runmsg"); expect(!m || m.textContent === "").toBe(true);
  });
  for (const [status, error] of [[400, "Bad request."], [403, "Not allowed."], [409, LOCK_IDKIND], [422, "That cannot be saved."]] as const) {
    test(`Save and continue on Step 1 with the server answering ${status}: the server's words stay in the step, the button works again, and the console does not move on`, async () => {
      const o = await organizer(); // a new game: Step 1 is open and "Save and continue" creates it
      const { win, d, calls } = await consoleAt(o, "", { token: o.token, stub: (m, u) => (m === "POST" && u === "/api/z" ? new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } }) : null) });
      await fillWhen(o, win, d); const sv = d.getElementById("zf-save1"); expect(sv).toBeTruthy();
      sv.click(); await tick(300);
      expect(calls.filter((c) => c.method === "POST" && c.url === "/api/z" && c.status === status).length).toBeGreaterThan(0);
      const msg = d.getElementById("zf-msg1").textContent; expect(msg).not.toBe("Saving…"); expect(msg).toContain(error === "Not allowed." ? "" : error);
      expect(msg.length).toBeGreaterThan(5); expect(sv.disabled).toBe(false); expect(win.ZFLOW.state.done[1]).toBeFalsy(); expect(win.ZFLOW.state.open).toBe(1);
    });
  }
  test("Save and continue that works moves on (the control for the 4xx tests above): done[1] is set and the console opens Step 2", async () => {
    const o = await organizer();
    const { win, d } = await consoleAt(o, "", { token: o.token });
    await fillWhen(o, win, d); d.getElementById("zf-save1").click(); await tick(400);
    expect(win.ZFLOW.state.done[1]).toBe(true); expect(win.ZFLOW.state.open).toBe(2);
  });
  test("source: the refusal handler puts the radio back, resets idTouched, writes the message into #zt-runmsg and asks the guide for the card; savedRun is the only sender of idKind", () => {
    const t = src("zc-flow-tambola.js");
    expect(t).toContain('role: "alert"'); expect(t).toContain("CTG.inline(h, window.CTG.explain({ status: status || 409, message: text }), {})");
    expect(t).toContain("RUN.idKind = idSaved || \"emp\"; RUN.idTouched = false;"); expect(t).toContain("already have people listed");
    expect(t).toContain("runMsg(msg, e && e.status)");
  });
});

// ------------------------------------------------------------------------------------------------ b, c: contrast of the player's cards in both looks
const PLAYER_CSS = ["fonts.css", "app.css", "z.css"];
const LOOKS = ["retro", "modern"] as const;
const lookDoc = (win: any, look: string) => win.document.documentElement.setAttribute("data-pt", look);

describe("b: the 'This game link does not work' card reads in Retro and Modern (text >= 4.5:1 on its own background)", () => {
  async function card(look: (typeof LOOKS)[number], how: "dialog" | "inline") {
    const o = await organizer(); const p = await phone(o, "/z?e=NOSUCHGAME", { patch: { phase: "missing" } }); open.push(p);
    const win = p.win; await p.waitFor((t) => /not valid|does not work/i.test(t), 10_000); loadGuide(win); lookDoc(win, look);
    const g = win.CTG.explain({ status: 404, message: "This engagement link is not valid." });
    expect(g.title).toBe("This game link does not work");
    if (how === "dialog") win.CTG.dialog(g, {}); else { const host = win.document.createElement("div"); win.document.querySelector(".zapp").prepend(host); win.CTG.inline(host, g, {}); }
    return { win, sheet: sheetsFor(win.document, PLAYER_CSS, 390), root: win.document.querySelector(how === "dialog" ? ".ctg-card" : ".ctg-inline") };
  }
  for (const look of LOOKS) for (const how of ["dialog", "inline"] as const) {
    test(`${look} look, ${how}: the title, the explanation, every step and every button read at >= 4.5:1`, async () => {
      const { sheet, root } = await card(look, how);
      expect(root).toBeTruthy();
      const els = [...root.querySelectorAll("h2, b, p, li, small, span, .ctg-btn")].filter((e: any) => (e.textContent || "").trim() && !e.querySelector("p,li,b,.ctg-btn")) as any[];
      expect(els.length).toBeGreaterThanOrEqual(3); // title, explanation, at least one step or button
      const rows = els.map((e) => { const c = contrastOf(e, sheet); return { t: (e.textContent || "").trim().slice(0, 36), tag: e.tagName.toLowerCase() + (e.className ? "." + e.className : ""), c }; });
      for (const r of rows) { expect([r.tag, r.t, r.c === null ? "unreadable" : r.c.ratio >= MIN_TEXT ? "ok" : `LOW ${r.c.ratio.toFixed(2)} ${r.c.fg} on ${r.c.bg}`]).toEqual([r.tag, r.t, "ok"]); }
    });
  }
  test("the contrast helper itself: white on white is 1:1, black on white is 21:1, #14213d on #FFF4EF is above 4.5 (so a failure above would be a real failure)", async () => {
    const { ratio, parseColor } = await import("./css");
    expect(ratio(parseColor("#fff")!, parseColor("#fff")!)).toBeCloseTo(1, 5); expect(ratio(parseColor("#000")!, parseColor("#fff")!)).toBeCloseTo(21, 3);
    expect(ratio(parseColor("#14213d")!, parseColor("#FFF4EF")!)).toBeGreaterThan(MIN_TEXT);
    expect(ratio(parseColor("#E0B872")!, parseColor("#FFF4EF")!)).toBeLessThan(MIN_TEXT); // the pale Retro ink on the card's cream is exactly what the fix removed
  });
});

describe("c: demo.html prize card: the card title and 'Demo prize: Four corners' read at >= 4.5:1 in Retro and Modern", () => {
  test("demo.html loads the same z.css as the game page and has no colour rules of its own that could change that", () => {
    const h = src("demo.html"); expect(h).toContain('href="/z.css"'); expect(h).toContain('href="/app.css"'); expect(h).toContain('src="/z.js"');
    expect(h).not.toMatch(/<style[^>]*>[^<]*\.(zps|zpl|zcard)/);
  });
  for (const look of LOOKS) {
    test(`${look} look: prize card heading and the open and the won prize rows`, async () => {
      const o = await organizer(); await published(o, "RC-DEMOP");
      const cfg = { tickets: 1, ties: "next", rewards: [{ pattern: "corners", scope: "ticket", ordinal: 1, text: "Demo prize: Four corners" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "" }], breaks: [], rounds: 1 };
      const pid = await realPid(o, "RC-DEMOP");
      const p = await phone(o, "/z?e=RC-DEMOP", { patch: playView({ pid, cfg, results: [{ pattern: "full", ordinal: 1, round: 1, tickets: [7] }] }) }); open.push(p);
      await p.waitFor(() => !!p.$("#prizepanel"), 30_000); lookDoc(p.win, look);
      const sheet = sheetsFor(p.win.document, PLAYER_CSS, 390), panel = p.$("#prizepanel");
      expect(panel.textContent).toContain("Demo prize: Four corners");
      const targets: [string, any][] = [["heading", panel.querySelector("h2")], ["open row name", panel.querySelector("li.open .znm b")], ["open row text", panel.querySelector("li.open .znm")], ["won row", panel.querySelector("li.done .znm s")], ["won-by line", panel.querySelector("li.done .zwonby")], ["to-win tag", panel.querySelector("li.open .ztag")]];
      for (const [n, e] of targets) { expect([n, !!e]).toEqual([n, true]); const c = contrastOf(e, sheet); expect([n, c === null ? "unreadable" : c.ratio >= MIN_TEXT ? "ok" : `LOW ${c.ratio.toFixed(2)} ${c.fg} on ${c.bg}`]).toEqual([n, "ok"]); }
    });
  }
});

// ------------------------------------------------------------------------------------------------ d: a 31-character employee ID on submit
describe("d: a 31-character employee ID shows the too-long sentence on submit as well as in the hint", () => {
  const TOO_LONG = "This ID is too long. An employee ID may be up to 30 characters once cleaned.";
  const eid = "RC-LONGID";
  async function join(idLen: number, kind?: "email") {
    const o = await organizer(NEW_AT_LOCAL); await published(o, eid, { verify: "id", ...(kind ? { idKind: kind } : {}) });
    const p = await phone(o, `/z?e=${eid}`); open.push(p); await p.waitFor(() => !!p.$("#emp"), 30_000);
    return { o, p, id: "A1".repeat(Math.ceil(idLen / 2)).slice(0, idLen) };
  }
  const NEW_AT_LOCAL = Date.UTC(2026, 10, 5, 10, 0, 0);
  const banner = (p: Page) => [...p.win.document.querySelectorAll('.zbanner[role="alert"], [role="alert"]')].map((e: any) => e.textContent.trim()).join(" | ");
  const submit = async (p: Page) => { const btn = [...p.win.document.querySelectorAll("button")].find((b: any) => /get my ticket|join|continue/i.test(b.textContent)) as any; expect(btn).toBeTruthy(); btn.click(); await tick(300); };
  test("PRODUCT BUG (rc 8cac314): 31 cleaned characters: the hint says 'too long' AND the message shown after pressing the button (the alert banner, not the hint) says it too, and nothing is sent to the server", async () => {
    const { o, p, id } = await join(31); expect(id.length).toBe(31);
    const before = (o.world.raw.prepare("SELECT COUNT(*) c FROM participant").get() as { c: number }).c;
    setVal(p, "#emp", id); expect(p.$("#empread").textContent).toBe(TOO_LONG); // the hint
    await submit(p);
    expect(banner(p)).toBe(TOO_LONG); // the submit message
    expect((o.world.raw.prepare("SELECT COUNT(*) c FROM participant").get() as { c: number }).c).toBe(before);
  });
  test("the control for the submit message above: an empty-after-cleaning ID is refused on submit with the letters-and-numbers sentence in the same alert banner (so the banner is the right place to look)", async () => {
    const { p } = await join(31); setVal(p, "#emp", "---");
    await submit(p); expect(banner(p)).toBe("An employee ID has letters and numbers only.");
  });
  test("31 characters that clean to 31 (dashes and spaces do not count): same sentence; 30 characters: no such sentence", async () => {
    const { p } = await join(31); setVal(p, "#emp", ("A1".repeat(16)).slice(0, 31).replace(/(.{4})/g, "$1-"));
    expect(p.$("#empread").textContent).toBe(TOO_LONG);
    setVal(p, "#emp", "A1".repeat(15)); expect(p.$("#empread").textContent).toBe("The system will read this as " + "A1".repeat(15)); expect(p.text()).not.toContain(TOO_LONG);
  });
  test("the server's own refusal of a 31-character ID carries the same words, and the guide has a card for it ('That employee ID is too long')", async () => {
    const o = await organizer(NEW_AT_LOCAL); await published(o, eid, { verify: "id" });
    const r = await o.api("POST", `/api/z/${eid}/join`, { empId: "A1".repeat(16).slice(0, 31), phone: "", name: "Asha", device: "0a" + "b".repeat(30) });
    const b = await o.json(r); expect(r.status).toBe(400); expect(b.error).toContain("up to 30 characters once cleaned");
    const w: any = new Window({ url: "http://localhost/z.html" }); wins.push(w);
    const g = loadGuide(w).explain({ status: 400, message: b.error }); expect(g.title).toBe("That employee ID is too long"); expect(g.kind).toBe("field");
  });
});

// ------------------------------------------------------------------------------------------------ e, f: tap sizes and layout (CSS rules)
const doc = (html: string) => { const w: any = new Window({ url: "http://localhost/x.html" }); wins.push(w); w.document.body.innerHTML = html; return w; };

describe("e: screen.html full-screen and speak buttons are at least 40 x 40", () => {
  test("fsBtn and spkBtn both carry class fs, and .fs is >= 40 x 40 in the real CSS at phone and desktop widths (nothing later makes it smaller)", () => {
    const h = src("screen.html"); expect(h).toMatch(/id="fsBtn" class="fs"/); expect(h).toMatch(/id="spkBtn" class="fs"/); expect(h).toContain('href="/screen.css"');
    for (const vw of [360, 1280, 1920]) {
      const w = doc('<button id="fsBtn" class="fs"></button><button id="spkBtn" class="fs"></button>'); const sheet = sheetsFor(w.document, ["screen.css"], vw);
      for (const id of ["fsBtn", "spkBtn"]) { const s = boxSize(w.document.getElementById(id), sheet); expect([id, vw, s.w! >= MIN_TAP, s.h! >= MIN_TAP]).toEqual([id, vw, true, true]); }
    }
  });
});

describe("f: console, partner page and player page polish", () => {
  test("console 'Jump to' step buttons (.zc-dot) are >= 40 x 40 at 360 and 1280 px", () => {
    const z = src("zc.js"); expect(z).toContain('class="zc-dot"'); expect(z).toContain("Jump to");
    for (const vw of [360, 1280]) { const w = doc('<div class="zc-jump"><span>Jump to</span><button type="button" class="zc-dot" data-open="1"></button></div>'); const s = boxSize(w.document.querySelector(".zc-dot"), sheetsFor(w.document, ["zc.css"], vw)); expect([vw, s.w! >= MIN_TAP, s.h! >= MIN_TAP]).toEqual([vw, true, true]); }
  });
  test("partner.html: header, nav and footer links have a tap area of at least 40 px (block-level box with a 40px line)", () => {
    const h = src("partner.html"); expect(h).toContain("partner.css");
    const w = doc('<header><a href="/">Home</a></header><nav><a href="/x">Pricing</a></nav><footer><a href="/y">Terms</a></footer><div class="rfoot"><a href="/z">Privacy</a></div>');
    const sheet = sheetsFor(w.document, ["app.css", "partner.css"], 360);
    for (const a of [...w.document.querySelectorAll("a")] as any[]) { const s = boxSize(a, sheet); expect([a.textContent, s.h! >= MIN_TAP, s.display]).toEqual([a.textContent, true, "inline-block"]); }
  });
  async function reqLabels() {
    const o = await organizer(); await published(o, "RC-REQ", { verify: "either" });
    const p = await phone(o, "/z?e=RC-REQ"); open.push(p); await p.waitFor(() => !!p.$("#emp"), 30_000);
    const alt = [...p.win.document.querySelectorAll(".zreq")].filter((m: any) => /mandatory without/.test(m.textContent)) as any[]; expect(alt.length).toBeGreaterThan(0);
    expect(alt.some((m) => /mandatory without (an )?employee ID/i.test(m.textContent))).toBe(true);
    return { p, alt };
  }
  const verdict = (look: string, m: any, c: ReturnType<typeof contrastOf>) => [look, m.textContent.trim(), c === null ? "unreadable" : c.ratio >= MIN_TEXT ? "ok" : `LOW ${c.ratio.toFixed(2)} ${c.fg} on ${c.bg}`];
  test("the '* mandatory without an employee ID' label: 13px, and #9C1C14 reads (>= 4.5:1) on the light page (no look chosen yet)", async () => {
    const { p, alt } = await reqLabels(); p.win.document.documentElement.removeAttribute("data-pt");
    const sheet = sheetsFor(p.win.document, PLAYER_CSS, 360), fs = (sheet as any[]).filter((r) => r.sel === ".zreq").flatMap((r) => r.decls).filter((d: any) => d.prop === "font-size").pop();
    expect(fs.val).toBe("13px");
    for (const m of alt) { const c = contrastOf(m, sheet); expect(verdict("light", m, c)).toEqual(["light", m.textContent.trim(), "ok"]); }
  });
  test("PRODUCT BUG (rc 8cac314): the same label must also read at >= 4.5:1 in Retro (the default look) and Modern, where the page behind it is dark", async () => {
    const { p, alt } = await reqLabels();
    for (const look of LOOKS) { lookDoc(p.win, look); const sheet = sheetsFor(p.win.document, PLAYER_CSS, 360);
      for (const m of alt) { const c = contrastOf(m, sheet); expect(verdict(look, m, c)).toEqual([look, m.textContent.trim(), "ok"]); } }
  });
  test("EN (language) button at 360 px: it is fixed at the top (top + its 40px height), and the page reserves a strip at least that tall above the brand banner, so the two cannot overlap", () => {
    const z = src("z.js"), m = z.match(/btn\.id = "langsel";[\s\S]*?btn\.style\.cssText = "([^"]*)"/); expect(m).toBeTruthy();
    const css = m![1], num = (re: RegExp) => Number((css.match(re) ?? [])[1]);
    expect(css).toContain("position:fixed"); const bottom = num(/top:(\d+)px/) + num(/min-height:(\d+)px/); expect(bottom).toBeGreaterThan(0);
    const w = doc('<main class="zapp" id="app"><div class="zbrand">brand</div></main><main class="zapp zc"></main>'); const app = w.document.getElementById("app");
    const padTop = (vw: number, el: any) => { let v: string | undefined; for (const r of sheetsFor(w.document, ["app.css", "z.css"], vw) as any[]) { let ok = false; try { ok = el.matches(r.sel); } catch { /* */ } if (ok) for (const d of r.decls) if (d.prop === "padding-top") v = d.val; } return v ? Number(v.replace("px", "")) : 0; };
    for (const vw of [320, 360, 414, 480]) expect([vw, padTop(vw, app) >= bottom]).toEqual([vw, true]); // 52px strip >= 6 + 40
    expect(padTop(1280, app)).toBeLessThan(52); // no extra strip on a wide screen (the button then sits beside the content)
  });
});

// ------------------------------------------------------------------------------------------------ g: a console without a session
describe("g: a fresh flow=new console without a session says 'Please sign in first', with the sign-in link, not 'Not allowed.'", () => {
  async function save1(o: O, withGuide: boolean) {
    const c = await consoleAt(o, "", { guide: withGuide }); const { win, d } = c;
    await fillWhen(o, win, d); d.getElementById("zf-save1").click();
    const t0 = Date.now(); while (Date.now() - t0 < 2000 && !/Not allowed|sign in first/.test(d.getElementById("zf-msg1")?.textContent ?? "")) await tick(30); // the Worker's answer arrives; nothing redraws the page by hand
    await tick(300); // time for anything the console does on its own after the message appears (its observers)
    return c;
  }
  const SIGN_IN = "sign in with your e-mail, then come back to this step.";
  for (const withGuide of [false, true]) {
    test(`PRODUCT BUG (rc 8cac314): Step 1 with no session (${withGuide ? "guide on the page" : "no guide"}): the Worker answers 403 'Not allowed.' and the console, on its own, shows 'Please sign in first.' with the link to the organizer sign-in; 'Not allowed.' is not left on the screen`, async () => {
      const o = await organizer(); const { d, calls } = await save1(o, withGuide);
      const post = calls.find((c) => c.method === "POST" && c.url === "/api/z"); expect(post).toBeTruthy(); expect([post!.status, post!.reply?.error]).toEqual([403, "Not allowed."]);
      const msg = d.getElementById("zf-msg1")!.textContent;
      expect(msg).toContain("Please sign in first."); expect(msg).not.toContain("Not allowed.");
      const a = d.getElementById("zt-signin"); expect(a).toBeTruthy(); expect(a.getAttribute("href")).toBe("/zc.html"); expect(a.textContent).toBe("Open the organizer sign-in");
      expect(msg).toContain(SIGN_IN);
    });
    test(`the conversion itself works (${withGuide ? "guide on the page" : "no guide"}): once the console paints, 'Not allowed.' becomes 'Please sign in first.' + link (so the defect above is WHEN it runs, not what it writes)`, async () => {
      const o = await organizer(); const { win, d } = await save1(o, withGuide);
      d.getElementById("app").append(d.createElement("i")); await tick(100); // any change of the page's direct children is what its observer reacts to
      const msg = d.getElementById("zf-msg1")?.textContent ?? "";
      expect(msg).toContain("Please sign in first."); expect(msg).toContain(SIGN_IN); expect(msg).not.toContain("Not allowed."); expect(d.getElementById("zt-signin").getAttribute("href")).toBe("/zc.html"); void win;
    });
  }
  test("a signed-in organizer is never shown this message, and another refusal ('No such engagement.') is left as the server wrote it", async () => {
    const o = await organizer(); const { win, d } = await consoleAt(o, "", { token: o.token, stub: (m, u) => (m === "POST" && u === "/api/z" ? new Response(JSON.stringify({ error: "No such engagement." }), { status: 404, headers: { "content-type": "application/json" } }) : null) });
    await fillWhen(o, win, d);
    d.getElementById("zf-save1").click(); await tick(300); d.getElementById("app").append(d.createElement("i")); await tick(100); // even after the console paints
    expect(d.getElementById("zf-msg1").textContent).toBe("No such engagement."); expect(d.getElementById("zt-signin") === null).toBe(true);
  });
});
