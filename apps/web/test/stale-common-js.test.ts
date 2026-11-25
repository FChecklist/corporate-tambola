// A returning visitor can hold an OLD cached common.js (the service worker serves /common.js stale-while-revalidate) next to a NEW site.js or paykit.js.
// Written from the rule, not from the code: a script that uses a helper added to common.js in 1.11.0 (TB.mailNote) must still finish its screen when the helper is missing.
// 1.12.0 adds TB.CUPS and TB.PRICING_COPY (the three cups): site.js must not leave the price section empty or show the OLD price list when they are missing.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { newWorld, openPage } from "./harness";

const PUB = new URL("../public/", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, PUB), "utf8");

describe("old cached common.js beside new site.js / paykit.js", () => {
  test("the payment-done screen of site.js still shows the key and the Open my console button when TB.mailNote does not exist", async () => {
    const w = newWorld();
    const p = await openPage(w, { url: "http://localhost/", html: "index.html", scripts: ["keep.js", "common.js", "google.js"], afterLoad: (win, f) => { if (f === "common.js") delete win.TB.mailNote; } }); // the OLD common.js: no mailNote
    expect(p.win.TB.mailNote).toBeUndefined();
    // the paid path of site.js is switched off on the live site (free launch); turn it on for this test only, and show a finished order
    const code = read("site.js").replace("const FREE = { on: true,", "const FREE = { on: false,");
    expect(code).toContain("const FREE = { on: false,");
    new Function("window", `with (window) { ${code}\n}`).call(p.win, p.win);
    p.win.fetch = async (input: any) => {
      const u = String(input);
      if (u.endsWith("/api/checkout")) return new Response(JSON.stringify({ mode: "test", result: { orderId: "ord_1", total: 3799, currency: "INR", pack: 250, invoiceNumber: "INV-1", invoiceUrl: "/inv", organizerKey: "ctk_" + "a".repeat(48) } }), { headers: { "content-type": "application/json" } });
      return new Response("{}", { headers: { "content-type": "application/json" } });
    };
    p.click('[data-buy="250"]');
    p.win.document.getElementById("oName").value = "Acme";
    p.win.document.getElementById("oMail").value = "boss@example.com";
    const go = p.win.document.getElementById("payGo"); go.disabled = false;
    p.win.document.getElementById("coForm").dispatchEvent(new p.win.Event("submit", { cancelable: true }));
    await new Promise((r) => setTimeout(r, 300));
    const body = p.win.document.body.textContent as string;
    expect(body).toContain("Your game is ready");
    expect(body).not.toMatch(/mailNote is not a function|not a function/);
    expect(p.win.document.getElementById("fErr")?.textContent ?? "").toBe(""); // no raw error on the done screen
    expect(p.win.document.getElementById("cpKey")).not.toBeNull(); // the key and its copy button are there
    // the "Open my console" listener was wired (it is the last line of done(), after the guarded call)
    let went = ""; Object.defineProperty(p.win.location, "href", { set: (v: string) => { went = v; }, get: () => "http://localhost/", configurable: true });
    p.win.document.getElementById("toLogin").click();
    expect(went).toBe("/zc.html");
    await p.close();
  });

  test("source rule: site.js and paykit.js call TB.mailNote only behind a check (every new TB.* helper of the release is guarded)", () => {
    for (const f of ["site.js", "paykit.js"]) {
      const calls = [...read(f).matchAll(/^.*TB\.mailNote\(.*$/gm)].map((m) => m[0]);
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) expect(c).toMatch(/typeof TB\.mailNote === "function"|TB\.mailNote\)/);
    }
  });

  // The OLD common.js holds the OLD price list (written in two halves so the repository-wide old-price scan in pricing-cups.test.ts finds nothing here).
  const OLD_LIST: [number, number, number][] = [[100, Number("2" + "399"), 34], [250, Number("3" + "499"), 51], [500, Number("4" + "699"), 67], [750, Number("5" + "899"), 84], [1000, Number("7" + "099"), 101], [2500, Number("11" + "799"), 169], [5000, Number("17" + "699"), 253], [10000, Number("29" + "499"), 421]];
  test("1.12.0: an OLD common.js (no TB.CUPS, no TB.PRICING_COPY, the old price list) beside the NEW site.js: no error, no price anywhere, no Create button, a reload note, the pay button off", async () => {
    const w = newWorld();
    const p = await openPage(w, { url: "http://localhost/", html: "index.html", scripts: ["keep.js", "common.js", "google.js", "site.js"], afterLoad: (win, f) => { if (f === "common.js") { delete win.TB.CUPS; delete win.TB.PRICING_COPY; win.TB.PACKS = OLD_LIST; } } });
    try {
      const d = p.win.document;
      expect(p.errors).toEqual([]); // no script error while the page loads with the old common.js
      expect(p.win.TB.CUPS).toBeUndefined(); expect(p.win.TB.PRICING_COPY).toBeUndefined();
      expect(d.querySelectorAll("#packs .cup").length).toBe(0); expect(d.querySelectorAll("#packs [data-buy]").length).toBe(0);
      expect(d.getElementById("packs")!.textContent).toContain("Please reload the page");
      const shown = (d.getElementById("packs")!.textContent + " " + (d.getElementById("heroBrk")?.textContent ?? "") + " " + d.getElementById("priceNote")!.textContent) as string;
      expect(shown).not.toMatch(/₹\s?\d|US\$\s?\d|Rs\.?\s?\d/); // not one price of the old list (and none at all)
      for (const [, inr] of OLD_LIST) expect(d.body.textContent).not.toContain(inr.toLocaleString("en-IN"));
      expect((d.getElementById("payBtn") as any).disabled).toBe(true);
      expect(d.querySelectorAll("#packs button[data-reload]").length).toBe(1); // the one way forward: reload the page (the next load brings the new common.js)
    } finally { await p.close(); }
  });

  test("source rule: site.js reads TB.CUPS and TB.PRICING_COPY only after the guard that checks both", () => {
    const code = read("site.js"), guard = code.indexOf("if (!TB.CUPS || !TB.PRICING_COPY)");
    expect(guard).toBeGreaterThan(0);
    expect(code.search(/TB\.(CUPS|PRICING_COPY)\b/)).toBe(guard + "if (!".length); // the very first mention is the guard itself
    expect(code).toMatch(/if \(!TB\.CUPS \|\| !TB\.PRICING_COPY\) \{[^}]*\breturn;\s*\}/); // the guard block ends with a return, so nothing below it runs
  });

  test("the service worker cache name moved on from v45, so every phone saves the common.js that has the helper", () => {
    const sw = read("zsw.js");
    expect(sw).toMatch(/const CACHE = "ct-game-v(\d+)"/);
    expect(Number(/const CACHE = "ct-game-v(\d+)"/.exec(sw)![1])).toBeGreaterThanOrEqual(46);
    expect(sw).toContain('"/common.js"');
  });
});
