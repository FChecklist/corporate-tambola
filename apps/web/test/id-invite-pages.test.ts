// 20 Nov 2026 (owner): "Invite people with just an ID". The real console (zc.js) and the real join page (z.js) run in a DOM against the real Worker code.
// Console: the owner's four sentences are on the invite screen; no Name and no Mobile box; list input is one ID per line with a visible "Paste a list" button (PDF and CSV upload stay);
// "Anyone with the link" is not offered. Join page: one box, "Enter your ID". Pasting A-1101, A 1101 and A/1101 adds ONE person.
// NOTE: never put a DOM element in expect(): a failing diff of a happy-dom node exhausts memory. Compare booleans and text.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

setDefaultTimeout(60_000);
const START = roundAt(T) + 1200;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

const OWNER_TEXT = [
  "Invite people with just an ID",
  "No names or personal details are needed.",
  "Just upload or paste the IDs of the people you want to invite: employee ID, associate ID, vendor ID or customer ID, whichever you use.",
  "Your invitee opens the game link and enters their ID. If it is on your list, they join and play. If it is not, you get a request to approve or decline.",
  "The list and all IDs are deleted within 24 hours after the game ends.",
];
async function idGame(eid: string) {
  const w = newWorld();
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  const o = { ...w, token: s.token as string, aiKey: s.aiKey as string, aiMessage: s.aiMessage as string };
  expect((await o.api("POST", "/api/z", { id: eid, startRound: START, callSeconds: 9, cap: 100, whoCanJoin: "list" }, o.aiKey)).status).toBe(200);
  expect((await o.api("POST", `/api/z/${eid}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token)).status).toBe(200);
  expect((await o.api("PATCH", `/api/z/${eid}/settings`, { verify: "id" }, o.token)).status).toBe(200);
  return o;
}
type O = Awaited<ReturnType<typeof idGame>>;
async function consolePage(o: O, eid: string) {
  const p = await openPage(o.world, {
    url: "http://localhost/zc?e=" + eid, html: "zc.html", scripts: "zgame.js control.js idlist.js zc.js".split(" "), session: { "ctz-org": o.token, "ctz-aimsg": o.aiMessage, "ctz-email": "boss@acme.com" },
    afterLoad: (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; },
  });
  open.push(p); await p.waitFor((x) => /Hello|Last step|Your game|Hi\./i.test(x)); return p;
}
const openStep = async (p: Page, n: number, re: RegExp) => { await p.waitFor(() => !!p.$(`.zc-dot[data-open="${n}"]`)); p.click(`.zc-dot[data-open="${n}"]`); await p.waitFor((x) => re.test(x)); };
const setVal = (p: Page, sel: string, v: string) => { const el = p.$(sel) as any; el.value = v; el.dispatchEvent(new p.win.Event("input", { bubbles: true })); };

describe("the people screen of an ID game", () => {
  test("shows the owner's text word for word, no Name and no Mobile box, a visible Paste a list button, and keeps PDF and CSV upload", async () => {
    const o = await idGame("IDP-1"); const p = await consolePage(o, "IDP-1");
    await openStep(p, 6, /(people are|person is) on your list/);
    const box = String((p.$("#mypeople #idinvite") as any)?.textContent ?? "");
    for (const line of OWNER_TEXT) expect(box.includes(line)).toBe(true);
    const chips = Array.from(p.win.document.querySelectorAll("#mypeople [data-mode]")).map((e: any) => e.textContent.trim());
    expect(chips).toEqual(["Paste a list", "Upload a PDF", "Upload a CSV"]); // no "Add one person", no contacts
    expect(!!p.$("#rosterTxt")).toBe(true); expect(!!p.$("#gname")).toBe(false); expect(!!p.$("#gphone")).toBe(false); expect(!!p.$('[data-cols]')).toBe(false);
    expect(/Name, Mobile|mobile number and employee|Name and mobile/i.test(String((p.$("#mypeople") as any)?.textContent ?? "").replace(/No name, mobile number or e-mail address is asked for\./, ""))).toBe(false);
    p.click('[data-mode="file"]'); await wait(50); expect(!!p.$("#gfile")).toBe(true); expect(String((p.$("#mypeople") as any).textContent)).toMatch(/Employee ID|ID/); expect(p.errors).toEqual([]);
    p.click('[data-mode="pdf"]'); await wait(50); expect(!!p.$("#gpdf")).toBe(true);
  });
  test("pasting A-1101, A 1101 and A/1101 on three lines adds one person; the row shows the ID, not a name or a number", async () => {
    const o = await idGame("IDP-2"); const p = await consolePage(o, "IDP-2");
    await openStep(p, 6, /(people are|person is) on your list/);
    setVal(p, "#rosterTxt", "A-1101\nA 1101\nA/1101\nB2202"); await wait(50); p.click("#rosterGo");
    await p.waitFor((x) => /2 people are on your list/.test(x));
    const rows = Array.from(p.win.document.querySelectorAll("#mypeople .zc-prow")).map((e: any) => e.querySelector("b").textContent.trim()).sort();
    expect(rows).toEqual(["A1101", "B2202"]);
    expect(p.errors).toEqual([]);
  });
  test("an ID that asked to come in is listed under People asking to join with the ID alone; letting it in and declining another both appear in the log", async () => {
    const o = await idGame("IDP-3");
    for (const [i, x] of ["Z 9001", "Z-9002"].entries()) { const r = await o.api("POST", "/api/z/IDP-3/join", { empId: x, device: (String(i) + "d").padEnd(32, "d") }); expect(r.status).toBe(403); }
    const p = await consolePage(o, "IDP-3"); await openStep(p, 6, /People asking to join: 2/);
    const w = String((p.$("#waitpanel") as any).textContent);
    expect(/Z9001/.test(w) && /Z9002/.test(w)).toBe(true); expect(/ - /.test(w.replace(/Asking through[^C]*/g, ""))).toBe(false); // the ID only: no name part
    p.click('#waitpanel [data-decide="admit"]'); await wait(300);
    p.click("#logtoggle"); await p.waitFor(() => !!p.$("#invitelogrows"));
    const log = String((p.$("#invitelogrows") as any).textContent);
    expect(/Z9001|Z9002/.test(log)).toBe(true); expect(/through/.test(log)).toBe(true); expect(/let in by/.test(log)).toBe(true); expect(/asked/.test(log)).toBe(true);
  });
});

describe("Who is this game for? has no Anyone-with-the-link choice", () => {
  test("step 2 offers only the lists; the audience text is the owner's; the family switch is visible with 1 to 10 and 4 as the default", async () => {
    const o = await idGame("IDP-4"); const p = await consolePage(o, "IDP-4");
    await openStep(p, 2, /Invite people with just an ID/);
    const aud = Array.from(p.win.document.querySelectorAll('[data-ck="aud"]')).map((e: any) => e.textContent.trim());
    expect(aud.length).toBe(4); expect(aud.some((x: string) => /Anyone with the link/i.test(x))).toBe(false);
    expect(!!p.$("#familyswitch")).toBe(true);
    p.click("#familyswitch [data-bool]"); await wait(80);
    const per = Array.from(p.win.document.querySelectorAll('[data-ck="per"]')).map((e: any) => e.textContent.trim());
    expect(per).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    const on = Array.from(p.win.document.querySelectorAll('[data-ck="per"].on')).map((e: any) => e.textContent.trim()); expect(on).toEqual(["4"]);
    expect(p.errors).toEqual([]);
  });
});

describe("the join page of an ID game", () => {
  test("has one box, Enter your ID: no name, no location, no mobile number, no e-mail", async () => {
    const o = await idGame("IDJ-1");
    const p = await openPage(o.world, { url: "http://localhost/z?e=IDJ-1", html: "z.html", scripts: ["audio.js", "zgame.js", "guide.js", "z.js"] }); open.push(p);
    await p.waitFor((x) => /Join the game/.test(x));
    expect(!!p.$("#emp")).toBe(true); expect(!!p.$("#nm")).toBe(false); expect(!!p.$("#loc")).toBe(false); expect(!!p.$("#ph")).toBe(false); expect(!!p.$("#mail")).toBe(false);
    expect(/Enter your ID/.test(p.text())).toBe(true);
    expect(p.win.document.querySelectorAll("#app input:not([type=checkbox]), .zjoin input:not([type=checkbox])").length).toBe(1);
  });
});
