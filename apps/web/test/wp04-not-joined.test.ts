// WP-04 TA14/S18: in step 6 the organizer sees who has NOT joined yet, with one reminder text to copy (for a group chat) and a list to download,
// instead of pressing WhatsApp for each person. The real console script runs in a DOM against the real Worker code.
// NOTE: never put a DOM element in expect(): a failing diff of a happy-dom node exhausts memory. Compare booleans and text.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

setDefaultTimeout(30_000);
const START = roundAt(T) + 1200; // one hour after T
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer() {
  const w = newWorld();
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string, aiMessage: s.aiMessage as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
async function consolePage(o: O, eid: string) {
  const p = await openPage(o.world, {
    url: "http://localhost/zc?e=" + eid, html: "zc.html", scripts: "zgame.js control.js zc.js".split(" "), session: { "ctz-org": o.token, "ctz-aimsg": o.aiMessage, "ctz-email": "boss@acme.com" },
    afterLoad: (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; },
  });
  open.push(p); await p.waitFor((x) => /Hello|Last step|Your game|Hi\./i.test(x)); return p;
}
/** A published game with four invited people; two of them have joined. */
async function game(eid: string, publish = true) {
  const o = await organizer();
  expect((await o.api("POST", "/api/z", { id: eid, startRound: START, callSeconds: 9, cap: 100 }, o.aiKey)).status).toBe(200);
  if (publish) expect((await o.api("POST", `/api/z/${eid}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token)).status).toBe(200);
  for (const [n, ph] of [["Asha Rao", "9810000001"], ["Bala Iyer", "9810000002"], ["Chitra Nair", "9810000003"], ["Dev Shah", "9810000004"]]) {
    const r = await o.json(await o.api("POST", `/api/z/${eid}/people`, { people: [{ name: n, phone: ph }] }, o.token)); expect(r.added).toBe(1);
  }
  return o;
}
const openList = async (p: Page) => { await p.waitFor(() => !!p.$('.zc-dot[data-open="6"]')); p.click('.zc-dot[data-open="6"]'); await p.waitFor((x) => /My people/.test(x) && /people are on my list|person is on my list/.test(x)); };
const rows = (p: Page) => Array.from(p.win.document.querySelectorAll("#mypeople .zc-prow")).map((e: any) => e.querySelector("b").textContent.trim());

describe("TA14/S18: the not-joined list", () => {
  test("the box counts the people who have not joined, and a tap shows only them", async () => {
    const o = await game("NJ-1");
    const ids = (o.world.raw.prepare("SELECT id FROM person WHERE eid='NJ-1' AND role IS NULL ORDER BY id").all() as any[]).map((r) => r.id);
    expect(ids.length).toBe(4);
    o.world.raw.prepare("UPDATE person SET status='joined' WHERE eid='NJ-1' AND id IN (?,?)").run(ids[0], ids[1]);
    const p = await consolePage(o, "NJ-1"); await openList(p);
    const box = p.$("#notjoined");
    expect(!!box).toBe(true);
    expect(box.textContent).toMatch(/Not joined yet: 2/);
    expect(rows(p).length).toBe(4);
    p.click("#onlynot"); await new Promise((r) => setTimeout(r, 50));
    expect(rows(p).length).toBe(2);
    p.click("#onlynot"); await new Promise((r) => setTimeout(r, 50));
    expect(rows(p).length).toBe(4); // a second tap shows everyone again
  });
  test("the reminder text carries the game link and the start time, in plain words, and says nothing about 'private'", async () => {
    const o = await game("NJ-2");
    const p = await consolePage(o, "NJ-2"); await openList(p);
    const t = p.$("#remindtext").textContent as string;
    expect(t).toContain("/z.html?e=NJ-2");
    expect(t).toMatch(/Reminder/); expect(t).toMatch(/starts/);
    expect(t).not.toMatch(/private/i);
    expect(!!p.$("#copyremind")).toBe(true);
  });
  test("the not-joined list downloads as a CSV of the people who have not joined (name, masked mobile, WhatsApp link)", async () => {
    const o = await game("NJ-3");
    const ids = (o.world.raw.prepare("SELECT id FROM person WHERE eid='NJ-3' AND role IS NULL ORDER BY id").all() as any[]).map((r) => r.id);
    o.world.raw.prepare("UPDATE person SET status='joined' WHERE eid='NJ-3' AND id IN (?,?,?)").run(ids[0], ids[1], ids[2]);
    const p = await consolePage(o, "NJ-3"); await openList(p);
    let blob: any = null;
    (p.win.URL as any).createObjectURL = (b: any) => { blob = b; return "blob:x"; };
    p.click("#dlnotjoined"); await new Promise((r) => setTimeout(r, 100));
    expect(!!blob).toBe(true);
    const text = await blob.text() as string;
    const lines = text.trim().split(/\r?\n/);
    expect(lines.length).toBe(2); // the header and the one person who has not joined
    expect(lines[0]).toMatch(/^Name,Mobile/);
  });
  test("nothing is shown when everyone has joined, and nothing for a draft (their links do not work yet)", async () => {
    const o = await game("NJ-4");
    o.world.raw.prepare("UPDATE person SET status='joined' WHERE eid='NJ-4'").run();
    const p = await consolePage(o, "NJ-4"); await openList(p);
    expect(!!p.$("#notjoined")).toBe(false);
    const d = await game("NJ-5", false);
    const q = await consolePage(d, "NJ-5"); await openList(q);
    expect(!!q.$("#notjoined")).toBe(false);
  });
});
