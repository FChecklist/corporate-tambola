// 21 Nov 2026, audit 1 of PR #26, HIGH 1: the DEFAULT console (pack/zc-flow.js) must make an ID game by itself.
// The real pack code runs in a DOM and its fetch goes to the real Worker code (in-memory D1). There is NO manual PATCH of verify: the console's own create and step-2 save are all that runs.
// Before the fix the game came out as verify="mobile": "Paste a list" added 0 IDs ("There is no number.") and a join with an ID was refused ("Enter a valid mobile number.").
// FALSIFIED BY: flow-id-create-no-verify, flow-id-step2-no-verify, flow-id-paste-reason-thrown-away
import { expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { handle as handleWithTerms } from "../../edge/test/with-terms"; // ONLY for the sign-in, publish and join that this test does not drive through the pack
import { handle as realHandle } from "../../edge/src/worker"; // the pack's own calls: no helper adds the consent, so a missing K6 tick shows (audit 1 of 7bad139, HIGH 1)
import { makeD1 } from "../../edge/test/d1-sqlite";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

setDefaultTimeout(60_000);
const PUB = join(import.meta.dir, "../public");
const src = ["consent.js", "zc-flow-game.js", "pack/zc-flow.js"].map((f) => readFileSync(join(PUB, f), "utf8")).join("\n");
const GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

async function world() {
  const d = makeD1();
  const env: any = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" };
  const now = Date.now();
  const st: any = await (await handleWithTerms(new Request("http://localhost/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "7.7.7.1" }, body: JSON.stringify({ email: "boss@acme.com" }) }), env, now)).json();
  const api = (method: string, path: string, body?: unknown, key?: string) => handleWithTerms(new Request("http://localhost" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, now);
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new" });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt, PRIZE_HOUSES };
  win.sessionStorage.setItem("ctz-org", st.token);
  const fetchReal = async (u: string, o: any = {}) => realHandle(new Request(new URL(String(u), "http://localhost"), o), env, now); // the pack's own calls, straight to the real Worker
  for (const k of ["Uint8Array", "crypto", "Intl", "Date", "Math", "JSON", "Set", "Promise", "Number", "String", "Array", "Object", "URLSearchParams", "setTimeout"]) if ((win as any)[k] === undefined) (win as any)[k] = (globalThis as any)[k];
  new Function("window", "document", "location", "fetch", "sessionStorage", "crypto", src)(win, win.document, win.location, fetchReal, win.sessionStorage, (globalThis as any).crypto);
  return { win, api, env, now, token: st.token as string };
}
const setVal = (win: any, sel: string, v: string, ev = "change") => { const el = win.document.querySelector(sel); if (!el) throw new Error("no element " + sel); el.value = v; el.dispatchEvent(new win.Event(ev, { bubbles: true })); };
const click = (win: any, sel: string) => { const el = win.document.querySelector(sel); if (!el) throw new Error("no element " + sel); el.click(); };
const text = (win: any) => String(win.document.getElementById("app")?.textContent ?? "").replace(/\s+/g, " ");

/** The person's own clicks: pick a day three days ahead and 18:00, Save step 1. */
async function step1(w: Awaited<ReturnType<typeof world>>) {
  const { win } = w;
  await wait();
  const day = new Date(w.now + 3 * 86400000).toISOString().slice(0, 10);
  setVal(win, "#zf-date", day); await wait();
  setVal(win, "#zf-time", "18:00"); await wait();
  click(win, "#zf-save1");
  for (let i = 0; i < 60 && !/Invite people with just an ID/.test(text(win)); i++) await wait();
  return String(((await w.env.DB.prepare("SELECT id FROM engagement ORDER BY rowid DESC LIMIT 1").first()) as any)?.id || "");
}

test("the default console's own create makes an ID game: Paste a list adds the IDs and a join with an ID gets a ticket, with no manual PATCH", async () => {
  const w = await world();
  const eid = await step1(w);
  expect(eid.length).toBeGreaterThan(3);
  const row = await w.env.DB.prepare("SELECT config FROM engagement WHERE id=?").bind(eid).first() as any;
  expect(JSON.parse(row.config).verify).toBe("id"); // flow-id-create-no-verify
  // step 2, as the person does it: paste a list, choose the size, save
  await wait(); const { win } = w;
  click(win, "#zf-paste-open"); await wait();
  setVal(win, "#zf-paste", "A-1101\nB 2202", "input"); await wait();
  click(win, "#zf-paste-go");
  for (let i = 0; i < 60 && !/IDs were added|ID was added|There is no number/.test(text(win)); i++) await wait();
  expect(text(win)).toContain("2 IDs were added to your list."); // flow-id-paste-reason-thrown-away: never "0 IDs" with the reason hidden
  click(win, "#zf-save2"); await wait(200);
  const row2 = await w.env.DB.prepare("SELECT config FROM engagement WHERE id=?").bind(eid).first() as any;
  expect(JSON.parse(row2.config).verify).toBe("id"); // flow-id-step2-no-verify: the size/audience save keeps it
  expect((await w.api("POST", `/api/z/${eid}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, w.token)).status).toBe(200); // the console's last step
  const dev = "01" + "c".repeat(30);
  const j = await w.api("POST", `/api/z/${eid}/join`, { empId: "a 1101", device: dev });
  expect(j.status).toBe(200); // a listed ID in another spelling gets in; no "Enter a valid mobile number."
});

test("if the list cannot take an ID the console shows the server's reason, not '0 IDs were added'", async () => {
  const w = await world(); const { win } = w;
  const eid = await step1(w);
  expect(eid.length).toBeGreaterThan(3);
  click(win, "#zf-paste-open"); await wait();
  setVal(win, "#zf-paste", "someone@acme.com", "input"); await wait(); // an e-mail is not an ID: the server answers added 0 and a reason
  click(win, "#zf-paste-go");
  for (let i = 0; i < 60 && !/IDs were added/.test(text(win)); i++) await wait();
  expect(text(win)).toMatch(/0 IDs were added to your list\. .{10,}/); // the reason stays next to the count
});

test("a game made before this release (no ID rule stored) becomes an ID game when step 2 is saved", async () => {
  const w = await world(); const { win } = w;
  const eid = await step1(w);
  await w.env.DB.prepare("UPDATE engagement SET config=json_remove(config,'$.verify') WHERE id=?").bind(eid).run();
  click(win, "#zf-save2"); await wait(300);
  const row = await w.env.DB.prepare("SELECT config FROM engagement WHERE id=?").bind(eid).first() as any;
  expect(JSON.parse(row.config).verify).toBe("id");
});

// Audit 1 of PR #26 (7bad139), MEDIUM 2. FALSIFIED BY: flow-paste-not-in-parts (send the whole list in one call: the server answers 413 over 200 and the console shows its message)
test("a pasted list of more than 200 IDs is sent in parts of 200 and every ID is added", async () => {
  const w = await world(); const { win } = w;
  const eid = await step1(w);
  setVal(win, "#zf-size", "500"); await wait(); // the person picks "up to 500" first; the paste then saves that size, so the game can hold the list
  click(win, "#zf-paste-open"); await wait();
  const ids = Array.from({ length: 450 }, (_, i) => "EMP" + (1000 + i));
  setVal(win, "#zf-paste", ids.join("\n"), "input"); await wait();
  click(win, "#zf-paste-go");
  for (let i = 0; i < 200 && !/IDs were added|ID was added|out of date|tick the box|Send up to/.test(text(win)); i++) await wait(50);
  expect(text(win)).toContain("450 IDs were added to your list.");
  const n = await w.env.DB.prepare("SELECT COUNT(*) AS n FROM person WHERE eid=?").bind(eid).first() as any;
  expect(Number(n.n)).toBe(450);
});

test("IDs already on the list are counted as already there, not as a silent 0", async () => {
  const w = await world(); const { win } = w;
  await step1(w);
  click(win, "#zf-paste-open"); await wait();
  setVal(win, "#zf-paste", "A-1101", "input"); await wait();
  click(win, "#zf-paste-go");
  for (let i = 0; i < 60 && !/IDs were added|ID was added/.test(text(win)); i++) await wait();
  click(win, "#zf-paste-open"); await wait();
  setVal(win, "#zf-paste", "a 1101", "input"); await wait();
  click(win, "#zf-paste-go");
  for (let i = 0; i < 60 && !/0 IDs were added/.test(text(win)); i++) await wait();
  expect(text(win)).toContain("0 IDs were added to your list. 1 was already on your list.");
});
