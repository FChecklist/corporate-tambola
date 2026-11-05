// New organizer flow, step 2 (2026-10-29): three cards, how people are let in, size from the real pack list, and what is saved.
// FALSIFIED BY: flow-s2-card-family-off, flow-s2-system-enabled, flow-s2-size-not-from-ladder, flow-s2-saves-wrong-cap, flow-s2-money-rs
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

const src = ["zc-flow-game.js", "pack/zc-flow.js"].map((f) => readFileSync(join(import.meta.dir, "../public", f), "utf8")).join("\n");
const calls: any[] = [];
const PACKS = [{ upTo: 100, inr: 2399 }, { upTo: 250, inr: 3499 }, { upTo: 500, inr: 4699 }];
function page() {
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000) };
  const fakeFetch = async (url: string, o: any = {}) => { calls.push({ url, method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null }); return { ok: true, json: async () => (url.endsWith("ai-manifest") ? { packs: PACKS } : { ok: true }) }; };
  new Function("window", "document", "location", "fetch", src)(win, win.document, win.location, fakeFetch);
  win.ZFLOW.state.done[1] = true; win.ZFLOW.state.open = 2; win.ZFLOW.state.eid = "EABCDEF"; win.ZFLOW.draw();
  return win;
}
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test("the size list is the game's real pack list, with ₹ prices, smallest already chosen", async () => {
  calls.length = 0;
  const win = page(); await wait();
  const opts = [...win.document.querySelectorAll("#zf-size option")].map((o: any) => o.textContent);
  expect(opts).toEqual(["Up to 100 participants · ₹2,399", "Up to 250 participants · ₹3,499", "Up to 500 participants · ₹4,699"]);
  expect(win.document.getElementById("zf-size").value).toBe("100");
  expect(calls[0].url).toBe("/api/z/ai-manifest");
});

test("three cards; the list option is hidden (no coming soon), everybody waits for you", async () => {
  const win = page(); await wait();
  const d = win.document;
  expect([...d.querySelectorAll(".zf-card b")].map((b: any) => b.textContent)).toEqual(["Your people", "Your people and their families", "Extended family"]);
  expect(d.getElementById("zf-how-system")).toBe(null);
  expect(d.getElementById("zf-how").textContent).toContain("Everybody waits for you");
  expect(d.querySelector(".zf-opt .zf-soon")).toBe(null);
});

test("what each card saves; family cards let each person bring 4", () => {
  const F = page().ZFLOW;
  expect(F.audienceSettings("people", 100)).toEqual({ cap: 100, whoCanJoin: "list", callMode: "auto", demo: false, invites: { on: false, per: 4, cats: [] } });
  expect(F.audienceSettings("family", 250).invites).toEqual({ on: true, per: 4, cats: ["family"] });
  expect(F.audienceSettings("extended", 250).invites.cats).toEqual(["family", "colleagues"]);
  expect(F.whoProblems({ card: "x", upTo: 100 }, F.packChoices(PACKS))[0]).toContain("who");
  expect(F.whoProblems({ card: "people", upTo: 7 }, F.packChoices(PACKS))[0]).toContain("size");
});

test("Save and continue sends the card and the chosen size to the game, then step 3 opens", async () => {
  calls.length = 0;
  const win = page(); await wait();
  const d = win.document;
  d.querySelector('[data-card="family"]').click();
  const sel = d.getElementById("zf-size"); sel.value = "250"; sel.dispatchEvent(new win.Event("change"));
  d.getElementById("zf-save2").click(); await wait();
  const put = calls.find((c) => c.method === "PATCH");
  expect(put.url).toBe("/api/z/EABCDEF/settings");
  expect(put.body.cap).toBe(250);
  expect(put.body.invites.on).toBe(true);
  expect(win.ZFLOW.state.open).toBe(3);
});

test("words on this step follow the language guide", async () => {
  const win = page(); await wait();
  const text = win.document.getElementById("zf-sec2").textContent;
  expect(win.ZFLOW.badWords(text)).toEqual([]);
  expect(text).not.toContain("Rs");
});
