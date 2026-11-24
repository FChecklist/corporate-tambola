// A returning visitor can hold an OLD cached common.js (the service worker serves /common.js stale-while-revalidate) next to a NEW site.js or paykit.js.
// Written from the rule, not from the code: a script that uses a helper added to common.js in 1.11.0 (TB.mailNote) must still finish its screen when the helper is missing.
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
    expect(body).toContain("Your engagement is ready");
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

  test("the service worker cache name moved on from v45, so every phone saves the common.js that has the helper", () => {
    const sw = read("zsw.js");
    expect(sw).toMatch(/const CACHE = "ct-game-v(\d+)"/);
    expect(Number(/const CACHE = "ct-game-v(\d+)"/.exec(sw)![1])).toBeGreaterThanOrEqual(46);
    expect(sw).toContain('"/common.js"');
  });
});
