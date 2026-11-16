// 1.8.2: the NEW organizer screens are the default at /zc; ?flow=old opens the previous screens and is remembered; one link goes back and forth. Nothing of either console is touched: zc-mode.js only sets flow= in the address.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

setDefaultTimeout(60_000);
const PUB = join(import.meta.dir, "../public");
const NOW = Date.UTC(2026, 10, 5, 10, 0, 0);
const rd = (f: string) => readFileSync(join(PUB, f), "utf8").replace(/\r\n/g, "\n");
const SCRIPTS = ["zc-mode.js", "consent.js", "zgame.js", "control.js", "zc.js", "zc-flow-game.js", "pack/zc-flow.js", "zc-flow-roles.js", "zc-flow-tambola.js"]; // zc.html's own order
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

/** Runs zc-mode.js against a fake address bar and storage. */
const run = (search: string, stored: string | null, info?: unknown) => {
  const st: Record<string, string> = stored ? { "ctz-zcflow": stored } : {};
  const loc: any = { search, pathname: "/zc.html", hash: "" }; const hist: string[] = [];
  const win: any = {};
  const XHR = function (this: any) { this.open = () => {}; this.send = () => { if (info === undefined) throw new Error("no network"); this.status = info === null ? 500 : 200; this.responseText = JSON.stringify(info ?? {}); }; } as any;
  new Function("window", "location", "localStorage", "history", "URLSearchParams", "XMLHttpRequest", "Date", rd("zc-mode.js"))(win, loc, { getItem: (k: string) => st[k] ?? null, setItem: (k: string, v: string) => { st[k] = v; } }, { replaceState: (_a: any, _b: any, url: string) => { hist.push(url); loc.search = url.slice(url.indexOf("?")); } }, URLSearchParams, XHR, { now: () => NOW });
  return { forced: !!win.CT_ZCFORCED, flow: win.CT_ZCFLOW as string, url: hist[hist.length - 1] ?? null, stored: st["ctz-zcflow"] ?? null };
};

describe("which organizer screens open at /zc", () => {
  test("no choice yet: the new screens, written into the address with the other parameters kept", () => {
    expect(run("", null)).toEqual({ forced: false, flow: "new", url: "/zc.html?flow=new", stored: null });
    expect(run("?e=ABC-1&c=x", null)).toMatchObject({ flow: "new", url: "/zc.html?e=ABC-1&c=x&flow=new" });
  });
  test("?flow=old opens the previous screens and the browser remembers it; the next visit without a parameter stays old", () => {
    expect(run("?flow=old&e=ABC-1", null)).toEqual({ forced: false, flow: "old", url: null, stored: "old" });
    expect(run("?e=ABC-1", "old")).toMatchObject({ flow: "old", url: "/zc.html?e=ABC-1&flow=old" });
  });
  test("?flow=new switches back and is remembered", () => {
    expect(run("?flow=new", "old")).toEqual({ forced: false, flow: "new", url: null, stored: "new" });
    expect(run("", "new")).toMatchObject({ flow: "new" });
  });
  test("a page that cannot keep anything (no storage) still opens, as the new screens", () => {
    const loc: any = { search: "", pathname: "/zc.html", hash: "" }, win: any = {};
    new Function("window", "location", "localStorage", "history", "URLSearchParams", "XMLHttpRequest", "Date", rd("zc-mode.js"))(win, loc, { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } }, { replaceState: () => {} }, URLSearchParams, function () {}, { now: () => NOW });
    expect(win.CT_ZCFLOW).toBe("new");
  });
  test("zc.html loads the mode script first, shows one clear link 'Use the previous screens', and keeps no inline script", () => {
    const h = rd("zc.html"); const order = h.match(/<script src="([^"]+)"/g)!.map((x) => x.slice(13, -1));
    expect(order.indexOf("/zc-mode.js")).toBeGreaterThanOrEqual(0); expect(order.indexOf("/zc-mode.js")).toBeLessThan(order.indexOf("/consent.js")); expect(order.indexOf("/zc-mode.js")).toBeLessThan(order.indexOf("/zc.js")); expect(order.indexOf("/zc-mode.js")).toBeLessThan(order.indexOf("/pack/zc-flow.js"));
    expect(h).toContain('<a id="trynew" href="/zc.html?flow=old">Use the previous screens</a>'); expect(h).not.toMatch(/<script>[^<]/);
    const t = rd("trynew.js"); expect(t).toContain("Use the previous screens"); expect(t).toContain("Use the new organizer screens");
    expect(h.indexOf('id="trynewtop"')).toBeGreaterThan(0); expect(h.indexOf('id="trynewtop"')).toBeLessThan(h.indexOf('<main id="app"')); // a second link near the top, above the console
    expect(t).toContain('["trynew","trynewtop"]'); expect(t).toContain("CT_ZCFORCED"); // both links follow the mode; a link only the previous screens understand hides them
  });
  test("the guide names the link, the build ships the script and the offline set has it", () => {
    expect(rd("organizer-guide.html")).toContain("Use the previous screens");
    expect(readFileSync(join(import.meta.dir, "../../../pages/build.mjs"), "utf8")).toContain('"zc-mode.js"');
    expect(rd("zsw.js")).toContain("/zc-mode.js");
  });
});

describe("links only the previous screens understand open the previous screens, and the choice is not stored", () => {
  const OLD_ONLY = ["demo=1", "pass=abc123", "quick=1", "quickform=1", "new=1", "cap=50", "do=publish&e=ABC-1", "k=KEYKEY&e=ABC-1", "api=1"];
  test("each such parameter, with or without an earlier choice, gives the previous screens and stores nothing", () => {
    for (const q of OLD_ONLY) for (const stored of [null, "new", "old"]) {
      const r = run("?" + q, stored); expect([q, stored, r.flow, r.forced, r.stored]).toEqual([q, stored, "old", true, stored]); // the stored choice is left as it was
    }
  });
  test("an explicit ?flow=new on such a link is the person's own choice and is honoured", () => { expect(run("?demo=1&flow=new", null)).toMatchObject({ flow: "new", stored: "new" }); });
  test("every link to /zc in the shipped pages, scripts and server mails resolves the way its parameters say (and 15+ pages and scripts link to the demo game)", () => {
    const { readdirSync } = require("node:fs");
    const files: string[] = [...readdirSync(PUB).filter((f: string) => /\.(html|js)$/.test(f)).map((f: string) => join(PUB, f)), ...readdirSync(join(import.meta.dir, "../../edge/src")).filter((f: string) => f.endsWith(".ts")).map((f: string) => join(import.meta.dir, "../../edge/src", f))];
    const seen = new Set<string>(), demoPages = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/\/zc(?:\.html)?\?([A-Za-z0-9_=&%.\-${}]*)/g)) {
      const query = m[1]!.replace(/\$\{[^}]*\}/g, "X").replace(/\{[a-zA-Z]+\}/g, "X"); if (/^flow=/.test(query)) continue; seen.add(query);
      if (/\bdemo=1\b/.test(query)) demoPages.add(f);
      const names = [...new URLSearchParams(query).keys()];
      const oldOnly = names.some((k) => ["demo", "pass", "quick", "quickform", "new", "cap", "do", "k", "api"].includes(k));
      const r = run("?" + query, null); expect([f, query, r.flow]).toEqual([f, query, oldOnly ? "old" : "new"]);
    }
    expect(seen.size).toBeGreaterThanOrEqual(8); expect(demoPages.size).toBeGreaterThanOrEqual(15);
  });
});

describe("an existing game the new screens cannot run opens the previous screens", () => {
  const info = (over: Record<string, unknown>) => ({ startMs: NOW + 3 * 3600_000, startMode: "auto", callMode: "auto", ...over });
  test("manual start and host-called numbers (they need the Start / roll / pause controls) keep the previous screens; a plain game opens the new ones", () => {
    expect(run("?e=ABC-1", null, info({ startMode: "manual" }))).toMatchObject({ flow: "old", forced: true, stored: null });
    expect(run("?e=ABC-1", null, info({ callMode: "host" }))).toMatchObject({ flow: "old", forced: true, stored: null });
    expect(run("?e=ABC-1", "new", info({ startMode: "manual" }))).toMatchObject({ flow: "old", forced: true, stored: "new" });
    expect(run("?e=ABC-1", null, info({}))).toMatchObject({ flow: "new", forced: false });
  });
  test("a game that is live now (from 15 minutes before the start to 4 hours after) keeps the previous screens (Pause and Stop); before and after, the new ones", () => {
    for (const d of [-14 * 60_000, 0, 3 * 3600_000, 4 * 3600_000]) expect([d, run("?e=ABC-1", null, info({ startMs: NOW - d })).flow]).toEqual([d, "old"]);
    for (const d of [-16 * 60_000, 4 * 3600_000 + 60_000]) expect([d, run("?e=ABC-1", null, info({ startMs: NOW - d })).flow]).toEqual([d, "new"]);
  });
  test("no answer, an error answer, or a game id that is not a game id: the new screens", () => {
    expect(run("?e=ABC-1", null, undefined).flow).toBe("new"); expect(run("?e=ABC-1", null, null).flow).toBe("new"); expect(run("?e=a/b", null, info({ startMode: "manual" })).flow).toBe("new");
  });
});

describe("both screens load from the same page without a script error", () => {
  const load = async (search: string) => {
    const w = newWorld({ FREE_LAUNCH: "1" });
    const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
    const p = await openPage(w.world, { url: "http://localhost/zc.html" + search, html: "zc.html", scripts: SCRIPTS, session: { "ctz-org": s.token as string, "ctz-aimsg": s.aiMessage as string, "ctz-email": "boss@acme.com" },
      afterLoad: (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; } });
    open.push(p); return p;
  };
  test("by default the new screens draw (five steps, top strip), the link offers the previous ones, no errors", async () => {
    const p = await load(""); await p.waitFor(() => !!p.win.document.querySelector(".zf-bar"), 20_000);
    expect(p.win.CT_ZCFLOW).toBe("new"); expect(p.win.location.search).toContain("flow=new");
    expect(p.win.document.querySelector(".zf-top")?.textContent).toContain("No personal details needed");
    expect(p.errors).toEqual([]);
  });
  test("?flow=old still loads the previous screens (no new bar), the link offers the new ones, no errors", async () => {
    const p = await load("?flow=old"); await p.waitFor((x) => /Hello|Last step|Your game|Hi\.|Let's|Start/i.test(x), 20_000);
    expect(p.win.CT_ZCFLOW).toBe("old"); expect(!!p.win.document.querySelector(".zf-bar")).toBe(false);
    expect(p.errors).toEqual([]);
  });
});
describe("an existing game made in the previous console opens in the new screens (real engine)", () => {
  const START = roundAt(T) + 1200; // one hour after T
  const make = async (free: boolean, publish: boolean, settings: Record<string, unknown> = {}, search = "?e=EX-1") => {
    const w = newWorld(free ? { FREE_LAUNCH: "1" } : {}); const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
    await w.api("POST", "/api/z", { id: "EX-1", startRound: START, callSeconds: 9, cap: 100, name: "Old console game" }, s.aiKey);
    if (Object.keys(settings).length) await w.api("PATCH", "/api/z/EX-1/settings", settings, s.aiKey);
    if (publish) expect((await w.api("POST", "/api/z/EX-1/publish", { email: "boss@acme.com", phone: "98765 43210" }, s.token)).status).toBe(200);
    const p = await openPage(w.world, { url: "http://localhost/zc.html" + search, html: "zc.html", scripts: SCRIPTS, session: { "ctz-org": s.token as string, "ctz-aimsg": s.aiMessage as string, "ctz-email": "boss@acme.com" }, afterLoad: (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; } });
    open.push(p); return p;
  };
  test("an UNPAID draft resumes: the five steps, Draft, the dashboard locked until publish, step 1 filled in", async () => {
    const p = await make(false, false); await p.waitFor((x) => /Game ID EX-1 Draft/.test(x), 20_000);
    const t = p.text(); expect(t).toMatch(/Opens after you publish/); expect(t).toMatch(/1\. Date and time/); expect(t).toMatch(/5 Check and publish/); expect(p.errors).toEqual([]);
  });
  test("a published and paid game shows the dashboard: share link, payment done, prizes, rehearsal cards, waiting list, claims, what is happening", async () => {
    const p = await make(true, true); const t = await p.waitFor((x) => /Waiting for you to let them in/.test(x) && /Tickets claimed/.test(x), 25_000);
    for (const w of [/Share this game link/, /z\.html\?e=EX-1/, /Payment\s*Done/, /Practice before the real game/, /Start this rehearsal/, /Nobody is waiting right now/, /Tickets claimed/, /What is happening/, /Prizes/, /game report/i]) expect([String(w), w.test(t)]).toEqual([String(w), true]);
    expect(p.errors).toEqual([]);
  });
  test("the same game with MANUAL start and host-called numbers: the new screens have no Start, roll or Pause control, and the previous screens do (so the page keeps the previous ones for it)", async () => {
    const n = await make(true, true, { startMode: "manual", callMode: "host" }); const nt = await n.waitFor((x) => /Tickets claimed/.test(x), 25_000);
    expect(/Start the game|Start now|Press to Roll Out/i.test(nt)).toBe(false); // what the new screens cannot do
    const o = await make(true, true, { startMode: "manual", callMode: "host" }, "?e=EX-1&flow=old"); const ot = await o.waitFor((x) => /Your progress/.test(x), 25_000);
    expect(ot).toMatch(/Your game at a glance/); expect(!!o.win.document.querySelector(".zf-bar")).toBe(false); expect(!!o.win.document.querySelector("#startgame, [data-open]")).toBe(true); expect(o.errors).toEqual([]); // the previous console is the one that carries the Start block (a signed control key)
  });
});
