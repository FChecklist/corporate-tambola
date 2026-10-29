// Corporate Tambola's own parts of the new console (2026-10-29): lucky draw order and timing, the 5 s roll button, claim messages, auto pause, who-label, delete lock, ready check.
// FALSIFIED BY: tambola-lucky-order, tambola-lucky-timing, tambola-roll-lock, tambola-claim-text, tambola-auto-pause, tambola-who-label, tambola-delete-lock, tambola-ready-optional
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
test("lucky draws: lowest value first, highest last, ties keep entered order", () => {
  const o = Tz().luckyOrder([{ value: "500", prize: "a" }, { value: "100", prize: "b" }, { value: "100", prize: "c" }, { value: "", prize: "d" }]);
  expect(o.map((d: any) => d.prize)).toEqual(["d", "b", "c", "a"]);
  expect(o[0].label).toBe("Lucky Draw 1");
});
test("lucky draws happen at the end, middle+end, or thirds+end", () => {
  const t = Tz(); expect(t.luckyAt(1)).toEqual([90]); expect(t.luckyAt(2)).toEqual([45, 90]); expect(t.luckyAt(3)).toEqual([30, 60, 90]);
});
test("manual roll: green, then grey for 5 seconds, green again; disabled while a claim is open", () => {
  const t = Tz();
  expect(t.rollState(0, 1000, false).ready).toBe(true);
  expect(t.rollState(1000, 2000, false)).toMatchObject({ ready: false, secs: 4 });
  expect(t.rollState(1000, 6000, false).ready).toBe(true);
  expect(t.rollState(1000, 9000, true)).toMatchObject({ ready: false, label: "Claim in progress" });
});
test("claim messages are the owner's words", () => {
  const t = Tz();
  expect(t.claimText({ phase: "check", ticket: 7, prize: "Top Line" }, "auto")).toBe("Ticket 7 has claimed Top Line. The system is checking...");
  expect(t.claimText({ phase: "ok" }, "auto")).toBe("Congratulations! The claim is correct.");
  expect(t.claimText({ phase: "gone", ticket: 7, prize: "Top Line" }, "manual")).toContain("Press the button to roll out the next number.");
});
test("auto mode pauses during a claim and resumes by itself; manual mode does not auto-pause", () => {
  const t = Tz();
  expect(t.autoPaused("auto", { phase: "check" }, false)).toBe(true);
  expect(t.autoPaused("auto", { phase: "gone" }, false)).toBe(false);
  expect(t.autoPaused("manual", { phase: "check" }, false)).toBe(false);
});
test("who is signed in is shown on two lines for Host and Co-host", () => {
  const t = Tz();
  expect(t.whoLines("host", "h@a.com", "o@a.com")).toEqual(["Host: h@a.com", "Organizer: o@a.com"]);
  expect(t.whoLines("cohost", "c@a.com", "o@a.com")).toEqual(["Co-host: c@a.com", "Organizer: o@a.com"]);
  expect(t.whoLines("", "o@a.com", "o@a.com")).toEqual(["Organizer: o@a.com"]);
});
test("delete-all unlocks 24 hours after the game", () => {
  const t = Tz(); expect(t.deleteReady(1000, 1000 + 24 * 3600000 - 1)).toBe(false); expect(t.deleteReady(1000, 1000 + 24 * 3600000)).toBe(true);
});
test("ready check: hosts and rehearsal are optional", () => {
  const r = Tz().readyItems({}); expect(r.filter((x: any) => x[2]).length).toBe(3); expect(r.filter((x: any) => !x[2]).map((x: any) => x[0])).toEqual(["Hosts added", "Rehearsal done"]);
});
