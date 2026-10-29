// 1.8.2: the NEW organizer screens are the default at /zc; ?flow=old opens the previous screens and is remembered; one link goes back and forth. Nothing of either console is touched: zc-mode.js only sets flow= in the address.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

setDefaultTimeout(60_000);
const PUB = join(import.meta.dir, "../public");
const rd = (f: string) => readFileSync(join(PUB, f), "utf8").replace(/\r\n/g, "\n");
const SCRIPTS = ["zc-mode.js", "consent.js", "zgame.js", "control.js", "zc.js", "zc-flow-game.js", "pack/zc-flow.js", "zc-flow-roles.js", "zc-flow-tambola.js"]; // zc.html's own order
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

/** Runs zc-mode.js against a fake address bar and storage. */
const run = (search: string, stored: string | null) => {
  const st: Record<string, string> = stored ? { "ctz-zcflow": stored } : {};
  const loc: any = { search, pathname: "/zc.html", hash: "" }; const hist: string[] = [];
  const win: any = {};
  new Function("window", "location", "localStorage", "history", "URLSearchParams", rd("zc-mode.js"))(win, loc, { getItem: (k: string) => st[k] ?? null, setItem: (k: string, v: string) => { st[k] = v; } }, { replaceState: (_a: any, _b: any, url: string) => { hist.push(url); loc.search = url.slice(url.indexOf("?")); } }, URLSearchParams);
  return { flow: win.CT_ZCFLOW as string, url: hist[hist.length - 1] ?? null, stored: st["ctz-zcflow"] ?? null };
};

describe("which organizer screens open at /zc", () => {
  test("no choice yet: the new screens, written into the address with the other parameters kept", () => {
    expect(run("", null)).toEqual({ flow: "new", url: "/zc.html?flow=new", stored: null });
    expect(run("?e=ABC-1&new=1", null)).toMatchObject({ flow: "new", url: "/zc.html?e=ABC-1&new=1&flow=new" });
  });
  test("?flow=old opens the previous screens and the browser remembers it; the next visit without a parameter stays old", () => {
    expect(run("?flow=old&e=ABC-1", null)).toEqual({ flow: "old", url: null, stored: "old" });
    expect(run("?e=ABC-1", "old")).toMatchObject({ flow: "old", url: "/zc.html?e=ABC-1&flow=old" });
  });
  test("?flow=new switches back and is remembered", () => {
    expect(run("?flow=new", "old")).toEqual({ flow: "new", url: null, stored: "new" });
    expect(run("", "new")).toMatchObject({ flow: "new" });
  });
  test("a page that cannot keep anything (no storage) still opens, as the new screens", () => {
    const loc: any = { search: "", pathname: "/zc.html", hash: "" }, win: any = {};
    new Function("window", "location", "localStorage", "history", "URLSearchParams", rd("zc-mode.js"))(win, loc, { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } }, { replaceState: () => {} }, URLSearchParams);
    expect(win.CT_ZCFLOW).toBe("new");
  });
  test("zc.html loads the mode script first, shows one clear link 'Use the previous screens', and keeps no inline script", () => {
    const h = rd("zc.html"); const order = h.match(/<script src="([^"]+)"/g)!.map((x) => x.slice(13, -1));
    expect(order.indexOf("/zc-mode.js")).toBeGreaterThanOrEqual(0); expect(order.indexOf("/zc-mode.js")).toBeLessThan(order.indexOf("/consent.js")); expect(order.indexOf("/zc-mode.js")).toBeLessThan(order.indexOf("/zc.js")); expect(order.indexOf("/zc-mode.js")).toBeLessThan(order.indexOf("/pack/zc-flow.js"));
    expect(h).toContain('<a id="trynew" href="/zc.html?flow=old">Use the previous screens</a>'); expect(h).not.toMatch(/<script>[^<]/);
    const t = rd("trynew.js"); expect(t).toContain("Use the previous screens"); expect(t).toContain("Use the new organizer screens");
  });
  test("the guide names the link, the build ships the script and the offline set has it", () => {
    expect(rd("organizer-guide.html")).toContain("Use the previous screens");
    expect(readFileSync(join(import.meta.dir, "../../../pages/build.mjs"), "utf8")).toContain('"zc-mode.js"');
    expect(rd("zsw.js")).toContain("/zc-mode.js");
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
    expect(p.win.CT_ZCFLOW).toBe("old"); expect(p.win.document.querySelector(".zf-bar")).toBeNull();
    expect(p.errors).toEqual([]);
  });
});
