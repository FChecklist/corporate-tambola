// New organizer flow, step 1 (2026-10-29): occasion, day, time, time zone, "time elsewhere", passed times disabled, and the save.
// FALSIFIED BY: flow-s1-zone-ignored, flow-s1-past-allowed, flow-s1-needs-name, flow-s1-no-elsewhere
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

const src = readFileSync(join(import.meta.dir, "../public/zc-flow.js"), "utf8");
const calls: any[] = [];
function page(search = "?flow=new") {
  const win: any = new Window({ url: "http://localhost/zc.html" + search });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000) };
  const fakeFetch = async (url: string, o: any) => { calls.push({ url, method: o.method, body: o.body ? JSON.parse(o.body) : null }); return { ok: true, json: async () => ({ ok: true }) }; };
  new Function("window", "document", "location", "fetch", src)(win, win.document, win.location, fakeFetch);
  return win;
}
const NOW = Date.UTC(2026, 9, 29, 6, 30); // 12:00 in India
const day = "2026-10-30";
const soon = () => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

test("a wall-clock time in a zone becomes the right moment", () => {
  const F = page().ZFLOW;
  expect(F.wallToMs(day, "18:00", "Asia/Kolkata")).toBe(Date.UTC(2026, 9, 30, 12, 30));
  expect(F.wallToMs(day, "18:00", "Europe/London")).toBe(Date.UTC(2026, 9, 30, 18, 0)); // clocks went back on 25 Oct
  expect(F.wallToMs(day, "09:00", "America/New_York")).toBe(Date.UTC(2026, 9, 30, 13, 0));
});

test("times that have passed in the chosen zone are disabled", () => {
  const F = page().ZFLOW;
  const today = F.todayIn(NOW, "Asia/Kolkata");
  expect(today).toBe("2026-10-29");
  const t = F.timeOptions(today, "Asia/Kolkata", NOW);
  expect(t.find((x: any) => x.t === "11:45").passed).toBe(true);
  expect(t.find((x: any) => x.t === "12:30").passed).toBe(false);
  // the same moment is already tomorrow evening in Sydney: its clock decides, not India's
  const sy = F.timeOptions("2026-10-29", "Australia/Sydney", NOW);
  expect(sy.find((x: any) => x.t === "17:00").passed).toBe(true);
});

test("the plain problems: name, day and time, past, too far", () => {
  const F = page().ZFLOW;
  const ok = { occ: "Team party", oname: "", date: day, time: "18:00", zone: "Asia/Kolkata", zoneOther: "" };
  expect(F.whenProblems(ok, NOW)).toEqual([]);
  expect(F.whenProblems({ ...ok, occ: "Other", oname: "  " }, NOW)[0]).toContain("name");
  expect(F.whenProblems({ ...ok, time: "" }, NOW)[0]).toContain("day and a time");
  expect(F.whenProblems({ ...ok, date: "2026-10-29", time: "09:00" }, NOW)[0]).toContain("already passed");
  expect(F.whenProblems({ ...ok, date: "2026-12-30" }, NOW)[0]).toContain("30 days");
  expect(F.whenProblems({ ...ok, zone: "other", zoneOther: "Mars/Base" }, NOW)[0]).toContain("time zone");
});

test("the same moment is shown on the clocks of other zones", () => {
  const F = page().ZFLOW;
  const lines = F.elsewhere(F.wallToMs(day, "18:00", "Asia/Kolkata"), "Asia/Kolkata");
  expect(lines.some((l: string) => l.startsWith("London") && l.includes("12:30"))).toBe(true);
  expect(lines.some((l: string) => l.startsWith("India"))).toBe(false);
});

test("Save and continue makes the draft once, then changes it; step 2 opens and the address keeps the game", async () => {
  calls.length = 0;
  const win = page();
  const d = win.document;
  const set = (id: string, v: string) => { const n = d.getElementById(id); n.value = v; n.dispatchEvent(new win.Event("change")); };
  set("zf-date", soon());
  set("zf-time", "18:00");
  d.getElementById("zf-save1").click();
  await new Promise((r) => setTimeout(r, 30));
  expect(calls.length).toBe(1);
  expect(calls[0].method).toBe("POST");
  expect(calls[0].body.name).toBe("Team party");
  expect(calls[0].body.startRound).toBe(Math.floor(win.ZFLOW.wallToMs(soon(), "18:00", "Asia/Kolkata") / 3000));
  expect(win.ZFLOW.state.open).toBe(2);
  expect(win.location.search).toContain("e=" + calls[0].body.id);
  // coming back to step 1 and saving again changes the same game
  d.querySelector('[data-step="1"]').click();
  d.getElementById("zf-save1").click();
  await new Promise((r) => setTimeout(r, 30));
  expect(calls[1].method).toBe("PATCH");
  expect(calls[1].url).toBe(`/api/z/${calls[0].body.id}/settings`);
});

test("Save is refused with a plain line when the time has passed", async () => {
  calls.length = 0;
  const win = page();
  const d = win.document;
  const set = (id: string, v: string) => { const n = d.getElementById(id); n.value = v; n.dispatchEvent(new win.Event("change")); };
  set("zf-date", "2020-01-01");
  d.getElementById("zf-time").value = "10:00";
  win.ZFLOW.form.time = "10:00";
  d.getElementById("zf-save1").click();
  await new Promise((r) => setTimeout(r, 20));
  expect(calls.length).toBe(0);
  expect(d.getElementById("zf-msg1").textContent).toContain("already passed");
});
