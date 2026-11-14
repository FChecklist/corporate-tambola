// V2 pages: the language mechanism (one person's own view, remembered on their device, English by default, a new language is just a new file), the organizer's "More tools" panel, and the public certificate check page.
import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";

const PUB = join(import.meta.dir, "../public");
const code = (f: string) => readFileSync(join(PUB, f), "utf8");
let open: Page[] = []; const wins: any[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; for (const w of wins.splice(0)) { try { await w.happyDOM.close(); } catch { /* closed */ } } });

/** A bare page with some text, the saved language choice (if any), then the language scripts as a browser runs them. Every network call is recorded. */
function langPage(saved: string | null, body: string, scripts = ["lang/ui.js", "lang/hi.js"], pre?: (w: any) => void) {
  const win: any = new Window({ url: "http://localhost/z.html" }); wins.push(win);
  const calls: string[] = []; win.fetch = async (u: any) => { calls.push(String(u)); return new Response("{}"); };
  win.document.write(`<html><body>${body}</body></html>`);
  if (saved) win.localStorage.setItem("ctz-lang", saved);
  win.location.reload = () => { win.__reloaded = true; };
  fill(win); pre?.(win);
  for (const f of scripts) new Function("window", `with (window) { ${code(f)}\n}`).call(win, win);
  return { win, calls, text: () => String(win.document.body.textContent).replace(/\s+/g, " ").trim() };
}
const BODY = '<h1>Ticket 12</h1><button id="c">Claim</button><p id="o">Unknown sentence stays.</p><input id="i" placeholder="Mobile number" value="Claim"><script id="s">Claim</script>';
/** Inside the page scope the DOM window shadows the real globals: fill in anything it does not provide (the same as the shared page harness does). */
function fill(win: any) { for (const k of ["Object", "Array", "RegExp", "String", "Number", "Boolean", "JSON", "Math", "Date", "Promise", "Set", "Map", "Error", "encodeURIComponent", "decodeURIComponent", "parseInt", "parseFloat", "isNaN"]) if (win[k] === undefined) win[k] = (globalThis as any)[k]; }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("language: per person, own view, English by default", () => {
  test("English chosen (or nothing chosen): the script does nothing at all", () => {
    const a = langPage(null, BODY), b = langPage("en", BODY);
    for (const p of [a, b]) { expect(p.text()).toContain("Ticket 12"); expect(p.win.document.getElementById("c").textContent).toBe("Claim"); expect(p.win.CTLang.current()).toBe("en"); expect(p.win.CTLang.t("Claim")).toBe("Claim"); }
  });
  test("a saved Hindi choice translates the words the file knows, in text and attributes, and leaves everything else alone", async () => {
    const p = langPage("hi", BODY); await wait(20);
    const d = p.win.document;
    expect(d.getElementById("c").textContent).toBe("दावा करें"); expect(d.querySelector("h1").textContent).toBe("टिकट 12");
    expect(d.getElementById("i").getAttribute("placeholder")).toBe("मोबाइल नंबर");
    expect(d.getElementById("o").textContent).toBe("Unknown sentence stays."); // no translation: stays English
    expect(d.getElementById("i").value).toBe("Claim"); expect(d.getElementById("s").textContent).toBe("Claim"); // what a person typed, and scripts, are never touched
    expect(d.documentElement.lang).toBe("hi"); expect(p.win.CTLang.current()).toBe("hi"); expect(p.win.CTLang.t("Claim")).toBe("दावा करें");
  });
  test("one person's choice cannot change another person's screen: each device keeps its own, and nothing is sent anywhere", async () => {
    const a = langPage("hi", BODY), b = langPage(null, BODY); await wait(20);
    expect(a.win.document.getElementById("c").textContent).toBe("दावा करें"); expect(b.win.document.getElementById("c").textContent).toBe("Claim");
    expect(a.win.localStorage).not.toBe(b.win.localStorage);
    expect(a.calls).toEqual([]); expect(b.calls).toEqual([]); // choosing and using a language makes no network call
  });
  test("words added to the page later are translated too", async () => {
    const p = langPage("hi", BODY); await wait(20);
    const n = p.win.document.createElement("button"); n.textContent = "Join"; p.win.document.body.appendChild(n); await wait(300);
    expect(n.textContent).toBe("शामिल हों");
  });
  test("an unknown saved language falls back to English", () => {
    const p = langPage("xx", BODY); expect(p.win.document.getElementById("c").textContent).toBe("Claim"); expect(p.win.CTLang.current()).toBe("en");
  });
  test("a new language is just a new file: it registers itself and shows in the list, no other code changes", async () => {
    const extra = 'CTLang.add("mr", "मराठी", { ui: { "Claim": "दावा" }, msg: { "generic": "x" } });';
    const win: any = new Window({ url: "http://localhost/z.html" }); wins.push(win); fill(win); win.document.write("<html><body><button id=c>Claim</button></body></html>"); win.localStorage.setItem("ctz-lang", "mr");
    for (const src of [code("lang/ui.js"), code("lang/hi.js"), extra]) new Function("window", `with (window) { ${src}\n}`).call(win, win);
    await wait(20);
    expect(win.document.getElementById("c").textContent).toBe("दावा"); expect(win.CTLang.languages().map((x: any) => x[0]).sort()).toEqual(["hi", "mr"]);
  });
  test("it joins the game's own language list and message tables when the game script is there", () => {
    const p = langPage(null, BODY, ["lang/ui.js", "lang/hi.js"], (w) => { w.ZG = { LANGS: { en: "English" }, TABLES: { en: { generic: "Something changed." } }, setLang: (c: string) => c }; });
    // the game script loaded first in a real page; here ui.js hooks setLang and hi.js adds to LANGS and TABLES
    expect(p.win.ZG.LANGS.hi).toBe("हिन्दी"); expect(p.win.ZG.TABLES.hi["claim.k"]).toContain("टिकट"); expect(p.win.ZG.TABLES.en.generic).toBe("Something changed.");
  });
  test("the pages load the language files right after the game script, and the app saves them for offline play", () => {
    for (const f of ["z.html", "zc.html", "big.html", "board.html"]) { const h = code(f); expect(h.indexOf('/zgame.js')).toBeGreaterThan(0); expect(h.indexOf('/lang/ui.js')).toBeGreaterThan(h.indexOf('/zgame.js')); expect(h.indexOf('/lang/hi.js')).toBeGreaterThan(h.indexOf('/lang/ui.js')); }
    const sw = code("zsw.js"); for (const f of ["/lang/ui.js", "/lang/hi.js", "/v2.js"]) expect(sw).toContain(`"${f}"`);
    expect(code("zc.html")).toContain('/v2.js');
  });
});

describe("the organizer's More tools panel", () => {
  test("opens from its button, shows receipts with the payee line, and moves between tabs, all through the real Worker", async () => {
    const w = newWorld(); const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" })); const token = s.token as string;
    expect((await w.api("POST", "/api/z", { id: "PNL-1", startRound: roundAt(T) + 1200, callSeconds: 6, cap: 100 }, token)).status).toBe(200);
    const p = await openPage(w.world as any, { url: "http://localhost/zc.html?e=PNL-1", html: "zc.html", scripts: ["lang/ui.js", "v2.js"], session: { "ctz-org": token } }); open.push(p);
    const btn = await waitForEl(p, "#ctv2btn"); expect(btn).toBeTruthy(); btn.click();
    await waitFor(() => /Paid to: IT SERVICES BY RAJAT AGARWAL via Razorpay/.test(dlg(p)));
    for (const t of ["Receipts and payments", "Certificates", "Download data", "Game keys", "Claim review", "Host hand-over", "Support"]) expect(dlg(p)).toContain(t);
    tab(p, "certs"); await waitFor(() => /Make certificates for the winners/.test(dlg(p)));
    tab(p, "support"); await waitFor(() => /do not type players' names or mobile numbers/.test(dlg(p)));
    tab(p, "keys"); await waitFor(() => /Make a game key/.test(dlg(p)) && /Make a Host key/.test(dlg(p)));
    expect(p.errors).toEqual([]);
  });
  test("without a signed-in key the button does not appear (nothing to show, nothing to fail)", async () => {
    const w = newWorld();
    const p = await openPage(w.world as any, { url: "http://localhost/zc.html?e=PNL-2", html: "zc.html", scripts: ["v2.js"] }); open.push(p);
    await wait(150); expect(p.win.document.getElementById("ctv2btn")).toBeNull();
  });
});

describe("the public certificate check page", () => {
  test("a real certificate number is confirmed with game, ticket and prize and nothing personal; a wrong one is not", async () => {
    const w = newWorld(); const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" })); const token = s.token as string;
    await w.api("POST", "/api/z", { id: "VER-1", startRound: roundAt(T) + 1200, callSeconds: 6, cap: 100 }, token);
    w.world.raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES('VER-1',1,'top',1,7,3,?,'test')").run(T);
    expect((await w.api("POST", "/api/z/VER-1/v2/certs/issue", {}, token)).status).toBe(200);
    const id = (await w.json(await w.api("GET", "/api/z/VER-1/v2/certs", undefined, token))).certificates[0].id as string;
    const p = await openPage(w.world as any, { url: `http://localhost/verify.html?c=${id}`, html: "verify.html", scripts: ["verify.js"] }); open.push(p);
    const out = () => String(p.win.document.getElementById("out").textContent).replace(/\s+/g, " ");
    await waitFor(() => /This certificate is real/.test(out()));
    expect(out()).toContain("Game VER-1"); expect(out()).toContain("Ticket No. 7"); expect(out()).toContain("Top Line"); expect(out()).toContain("record 1 of 1");
    p.win.document.getElementById("c").value = "0".repeat(20); p.win.document.getElementById("f").dispatchEvent(new p.win.Event("submit", { cancelable: true }));
    await waitFor(() => /could not be confirmed/.test(out()));
    p.win.document.getElementById("c").value = "!!"; p.win.document.getElementById("f").dispatchEvent(new p.win.Event("submit", { cancelable: true }));
    await waitFor(() => /type the certificate number as printed/.test(out()));
    expect(p.errors).toEqual([]);
  });
});

describe("the player's note from a Host who did not accept a claim", () => {
  test("shown only to the player who claimed, only when review is on, with the Host's reason; silent otherwise", async () => {
    const w = newWorld(); const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" })); const token = s.token as string;
    await w.api("POST", "/api/z", { id: "NOTE-1", startRound: roundAt(T) + 1200, callSeconds: 6, cap: 100 }, token);
    const pid = "5x" + "ab".repeat(6);
    w.world.raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES('NOTE-1',?,'top',1,11,?)").run(pid, T);
    w.world.raw.prepare("INSERT INTO v2_claim_review(eid,round,pattern,ticket,decision,reason,by,at_ms) VALUES('NOTE-1',1,'top',5,'reject','The line was not complete','host',?)").run(T);
    const mk = async (on: boolean, withClaim: boolean) => {
      w.world.raw.prepare("DELETE FROM v2_flag").run(); if (on) w.world.raw.prepare("INSERT INTO v2_flag(eid,k,v) VALUES('NOTE-1','claimreview','1')").run();
      const p = await openPage(w.world as any, { url: "http://localhost/z.html?e=NOTE-1", html: "z.html", scripts: ["claimnote.js"], afterLoad: (win: any, f: string) => { if (f === "keep.js") { const st = globalThis.setTimeout; win.setTimeout = (fn: any, ms?: number) => st(fn, Math.min(Number(ms) || 0, 60)); win.localStorage.setItem("ctz:NOTE-1:pid", pid); if (withClaim) win.localStorage.setItem("ctz:NOTE-1:claimed", JSON.stringify(["top"])); } } }); open.push(p);
      return p;
    };
    const p1 = await mk(true, true); await waitFor(() => /could not accept your claim for/.test(String(p1.win.document.body.textContent)), 12000);
    expect(String(p1.win.document.body.textContent)).toContain("The line was not complete");
    const p2 = await mk(false, true); await wait(600); expect(String(p2.win.document.body.textContent)).not.toContain("could not accept");
    const p3 = await mk(true, false); await wait(600); expect(String(p3.win.document.body.textContent)).not.toContain("could not accept");
  });
});

function dlg(p: Page): string { return String(p.win.document.querySelector('[role="dialog"]')?.textContent ?? "").replace(/\s+/g, " "); }
function tab(p: Page, t: string) { const b = p.win.document.querySelector(`[role="dialog"] [data-t="${t}"]`); if (!b) throw new Error("no tab " + t); b.click(); }
async function waitFor(pred: () => boolean, ms = 6000) { const t0 = Date.now(); for (;;) { if (pred()) return; if (Date.now() - t0 > ms) throw new Error("timed out waiting"); await wait(25); } }
async function waitForEl(p: Page, sel: string) { let el: any = null; await waitFor(() => !!(el = p.win.document.querySelector(sel))); return el; }
