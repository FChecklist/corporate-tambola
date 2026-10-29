// New organizer flow, shell (2026-10-29): five-step bar, locked Game dashboard, step gating, top strip, and the current console standing aside.
// FALSIFIED BY: flow-gate-skip, flow-dashboard-open, flow-top-strip, flow-switch-off
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

const PUB = join(import.meta.dir, "../public");
const src = (f: string) => readFileSync(join(PUB, f), "utf8");
export const calls: any[] = [];
function page(search: string) {
  const win: any = new Window({ url: "http://localhost/zc.html" + search });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000) };
  const fakeFetch = async (url: string, o: any) => { calls.push({ url, method: o.method, body: o.body ? JSON.parse(o.body) : null }); return { ok: true, json: async () => ({ ok: true }) }; };
  new Function("window", "document", "location", "fetch", src("zc-flow.js"))(win, win.document, win.location, fakeFetch);
  return win;
}

test("flow=new draws five steps, the top strip and a locked Game dashboard", () => {
  const win = page("?flow=new");
  const d = win.document;
  expect(d.querySelector(".zf-top").textContent).toBe("No personal details needed. All game and participant information is deleted within 24 hours of the game.");
  expect([...d.querySelectorAll(".zf-bar [data-step]")].length).toBe(5);
  const dash = d.getElementById("zf-dash");
  expect(dash.hasAttribute("disabled")).toBe(true);
  expect(dash.textContent).toContain("Opens after you publish");
});

test("without flow=new the page is left alone", () => {
  const win = page("");
  expect(win.document.querySelector(".zf-bar")).toBe(null);
});

test("a step cannot be skipped, and the optional Brand & Breaks never blocks publishing", () => {
  const F = page("?flow=new").ZFLOW;
  expect(F.canOpen(1, {})).toBe(true);
  expect(F.canOpen(2, {})).toBe(false);
  expect(F.canOpen(3, { 1: true })).toBe(false);
  expect(F.canOpen(5, { 1: true, 2: true, 3: true })).toBe(true);
  expect(F.nextAfter(1, {})).toBe(2);
  expect(F.nextAfter(3, { 1: true, 2: true, 3: true })).toBe(4);
  expect(F.nextAfter(5, { 5: true })).toBe(0);
});

test("the Game dashboard opens only once the game is published", () => {
  const F = page("?flow=new").ZFLOW;
  expect(F.dashboardOpen(null)).toBe(false);
  expect(F.dashboardOpen({ published: false })).toBe(false);
  expect(F.dashboardOpen({ published: true })).toBe(true);
});

test("the current console (zc.js) stands aside for flow=new and the page loads the new files", () => {
  expect(src("zc.js")).toContain('get("flow") === "new") return;');
  expect(src("zc.html")).toContain("/zc-flow.js");
  expect(src("zc.html")).toContain("/zc-flow.css");
});

test("every word the organizer reads follows the language guide", () => {
  const F = page("?flow=new").ZFLOW;
  const all = [...Object.values(F.COPY), ...F.STEPS.map((s: any) => s.name)].join(" | ");
  expect(F.badWords(all)).toEqual([]);
  for (const bad of ["We invite you", "a private game", "Rs 2,399", "cash prize", "places left"]) expect(F.badWords(bad).length).toBeGreaterThan(0);
});
