// Corporate Tambola's own parts of the new console (2026-10-29): lucky draw order and timing, the 5 s roll button, claim messages, auto pause, who-label, delete lock, ready check.
// FALSIFIED BY: tambola-claim-text, tambola-who-label, tambola-ready-optional, tambola-no-stubs
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

const src = ["zc-flow-game.js", "pack/zc-flow.js", "zc-flow-tambola.js"].map((f) => readFileSync(join(import.meta.dir, "../public", f), "utf8")).join("\n");
function page() {
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES };
  const fakeFetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  new Function("window", "document", "location", "fetch", "MutationObserver", src)(win, win.document, win.location, fakeFetch, win.MutationObserver);
  return win;
}
const Tz = () => page().ZTAMBOLA;
test("claim messages are the owner's words", () => {
  const t = Tz();
  expect(t.claimText({ phase: "check", ticket: 7, prize: "Top Line" }, "auto")).toBe("Ticket 7 has claimed Top Line. The system is checking...");
  expect(t.claimText({ phase: "ok" }, "auto")).toBe("Congratulations! The claim is correct.");
  expect(t.claimText({ phase: "gone", ticket: 7, prize: "Top Line" }, "manual")).toContain("Press the button to roll out the next number.");
});
test("who is signed in is shown on two lines for Host and Co-host", () => {
  const t = Tz();
  expect(t.whoLines("host", "h@a.com", "o@a.com")).toEqual(["Host: h@a.com", "Organizer: o@a.com"]);
  expect(t.whoLines("cohost", "c@a.com", "o@a.com")).toEqual(["Co-host: c@a.com", "Organizer: o@a.com"]);
  expect(t.whoLines("", "o@a.com", "o@a.com")).toEqual(["Organizer: o@a.com"]);
});
test("ready check: hosts and rehearsal are optional", () => {
  const r = Tz().readyItems({}); expect(r.filter((x: any) => x[2]).length).toBe(3); expect(r.filter((x: any) => !x[2]).map((x: any) => x[0])).toEqual(["Hosts added", "Rehearsal done"]);
});
test("no coming soon, demo stub, lucky draw stub or roll button on the dashboard", async () => {
  const win = page(), s = win.ZFLOW.state; s.eid = "EABCDEF"; s.info = { published: true, paid: true, startMs: Date.now() + 3 * 3600000 }; s.raw = { startMs: s.info.startMs, gameMinutes: 60 };
  for (const k of [1, 2, 3, 4, 5]) s.done[k] = true; s.view = "dash"; win.ZFLOW.draw(); await new Promise((r) => setTimeout(r, 50));
  const html = win.document.getElementById("app").innerHTML;
  expect(html).toContain("Ready check"); expect(html).toContain("Play the game"); expect(html).toContain("REHEARSAL GAME 1");
  for (const bad of ["Coming soon", "coming soon", "Demo:", "DEMO", "zt-roll", "zt-lucky"]) expect(html).not.toContain(bad);
});
