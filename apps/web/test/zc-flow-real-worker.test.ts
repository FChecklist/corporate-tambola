// 20 Nov 2026, audit round 2 of the ID invite (PR 26), HIGH 1: the DEFAULT console (pack/zc-flow.js) never made an ID game, so "Paste a list" added 0 people.
// This test drives the real default console in a DOM against the REAL Worker code (in-memory database), with NO hand-made settings change: step 1 saves, step 2 pastes a list and saves.
// Then people join through the real join API by ID only.
// FALSIFIED BY: idflow-create-without-verify-id, idflow-step2-without-verify-id, idflow-paste-reason-thrown-away
import { expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { newWorld } from "./harness";
import { handle as realHandle } from "../../edge/src/worker";

setDefaultTimeout(60_000);
const src = ["zc-flow-game.js", "pack/zc-flow.js"].map((f) => readFileSync(join(import.meta.dir, "../public", f), "utf8")).join("\n");
const GEN = 1692803367;
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const soon = () => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const dev = (i: number) => (String(i).padStart(2, "0") + "e".repeat(32)).slice(0, 32);

async function consolePage() {
  const w = newWorld();
  const st = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  const token = st.token as string;
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new" });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.sessionStorage.setItem("ctz-org", token);
  win.ZG = { roundAt: (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1 };
  const fakeFetch = async (url: string, o: any = {}) => realHandle(new Request(new URL(String(url), "http://localhost"), o), w.world.env, Date.now()); // the page talks to the real Worker at the real clock
  new Function("window", "document", readFileSync(join(import.meta.dir, "../public/consent.js"), "utf8"))(win, win.document); // the real agreement notice: the page asks it for the K6 line and sends its payload
  new Function("window", "document", "location", "fetch", "sessionStorage", src)(win, win.document, win.location, fakeFetch, win.sessionStorage);
  return { w, win, token };
}
const setVal = (win: any, id: string, v: string, ev = "change") => { const n = win.document.getElementById(id); n.value = v; n.dispatchEvent(new win.Event(ev)); };

test("the default console makes an ID game by itself: Paste a list adds the IDs, and a listed ID joins with no mobile number", async () => {
  const { w, win, token } = await consolePage();
  const d = win.document;
  // step 1: the day and time, Save and continue (this creates the game)
  setVal(win, "zf-date", soon()); setVal(win, "zf-time", "18:00");
  d.getElementById("zf-save1").click(); await wait(300);
  const eid = win.ZFLOW.state.eid as string;
  expect(eid.length).toBeGreaterThan(3); expect(win.ZFLOW.state.open).toBe(2);
  expect((await w.api("POST", `/api/z/${eid}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, token)).status).toBe(200);
  const cfg = async () => JSON.parse(String(((await w.world.env.DB.prepare("SELECT config FROM engagement WHERE id=?").bind(eid).first()) as any)?.config ?? "{}"));
  expect((await cfg()).verify).toBe("id"); // made as an ID game at creation, so the list can be pasted before step 2 is saved
  // step 2: paste a list (one ID per line, in three spellings of the same ID), then Save and continue
  d.getElementById("zf-paste-open").click(); await wait();
  const ta = d.getElementById("zf-paste"); ta.value = "A-1101\nA 1101\nB-2202\n"; ta.dispatchEvent(new win.Event("input"));
  d.getElementById("zf-paste-go").click(); await wait(300);
  expect(d.getElementById("zf-paste-msg").textContent).toContain("2 IDs were added to your list.");
  d.getElementById("zf-save2").click(); await wait(300);
  expect(win.ZFLOW.state.done[2]).toBe(true);
  expect((await cfg()).verify).toBe("id"); // and still an ID game after step 2 saved its settings
  const people = await w.json(await w.api("GET", `/api/z/${eid}/people`, undefined, token));
  expect((people.people ?? []).length).toBe(2);
  // a listed person joins with the ID alone; a stranger's ID waits; a mobile-number-only join is not how this game takes people
  const ok = await w.api("POST", `/api/z/${eid}/join`, { empId: "a/1101", device: dev(1) });
  expect(ok.status).toBe(200); expect(typeof (await w.json(ok)).pid).toBe("string");
  const stranger = await w.api("POST", `/api/z/${eid}/join`, { empId: "Z-9999", device: dev(2) });
  expect(stranger.status).toBe(403); expect((await w.json(stranger)).waiting).toBe(true);
});

test("when the Worker refuses some pasted lines, the console says why instead of only 'added'", async () => {
  const { w, win, token } = await consolePage();
  const d = win.document;
  setVal(win, "zf-date", soon()); setVal(win, "zf-time", "18:00");
  d.getElementById("zf-save1").click(); await wait(300);
  const eid = win.ZFLOW.state.eid as string;
  expect((await w.api("POST", `/api/z/${eid}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, token)).status).toBe(200);
  d.getElementById("zf-paste-open").click(); await wait();
  const ta = d.getElementById("zf-paste"); ta.value = "OK-1\n" + "X".repeat(40) + "\nOK-2\n"; ta.dispatchEvent(new win.Event("input"));
  d.getElementById("zf-paste-go").click(); await wait(300);
  const t = d.getElementById("zf-paste-msg").textContent as string;
  expect(t).toContain("2 IDs were added to your list.");
  expect(t).toContain("Some were not added:");
});

test("a draft made earlier (no ID setting yet) becomes an ID game when step 2 is saved", async () => {
  const { w, win, token } = await consolePage();
  const START = Math.floor((Date.now() / 1000 - GEN) / 3) + 1 + 28_800;
  await win.ZFLOW.call("POST", "/api/z", { id: "EOLDDRAFT", name: "Old draft", startRound: START, callSeconds: 6, cap: 10 }); // made without the ID setting, as before this release
  const cfg = async () => JSON.parse(String(((await w.world.env.DB.prepare("SELECT config FROM engagement WHERE id=?").bind("EOLDDRAFT").first()) as any)?.config ?? "{}"));
  expect((await cfg()).verify).toBeUndefined();
  win.ZFLOW.state.eid = "EOLDDRAFT"; win.ZFLOW.state.done[1] = true; win.ZFLOW.state.open = 2; win.ZFLOW.draw(); await wait(100);
  win.document.getElementById("zf-save2").click(); await wait(300);
  expect(win.ZFLOW.state.done[2]).toBe(true);
  expect((await cfg()).verify).toBe("id");
});
