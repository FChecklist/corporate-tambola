// Steps 5 and 6 of the organizer console, made idiot-proof (owner order, 2026-10-26): every mistake says what it is and how to correct it, next to the control that was used,
// and nothing typed has to be typed twice. Real page scripts in a DOM talking to the real Worker code (see harness.ts).
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
const make = (o: O, id: string, over: Record<string, unknown> = {}) => o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, ...over }, o.aiKey);
const publish = (o: O, id: string) => o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token);
const ZC_SCRIPTS = "zgame.js control.js zc.js".split(" ");
async function consolePage(o: O, eid: string, hook?: (win: any, f: string) => void) {
  const p = await openPage(o.world, {
    url: "http://localhost/zc?e=" + eid, html: "zc.html", scripts: ZC_SCRIPTS, session: { "ctz-org": o.token, "ctz-aimsg": o.aiMessage, "ctz-email": "boss@acme.com" },
    afterLoad: (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; hook?.(win, f); },
  });
  open.push(p); await p.waitFor((x) => /Hello|Last step|Your game|Hi\./i.test(x)); return p;
}
const openStep = (p: Page, n: number) => p.click(`.zc-dot[data-open="${n}"]`);
const setField = (p: Page, sel: string, v: string) => { const el = p.$(sel) as any; el.value = v; el.dispatchEvent(new p.win.Event("input", { bubbles: true })); };
const listOf = async (o: O, id: string) => o.json(await o.api("GET", `/api/z/${id}/people`, undefined, o.token));
/** Chooses a file in a file box the way the existing My people tests do (the DOM cannot open a picker). */
const chooseFile = (p: Page, sel: string, name: string, text: string) => {
  const inp = p.$(sel) as any;
  Object.defineProperty(inp, "files", { value: [{ name, size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer }], configurable: true });
  inp.dispatchEvent(new p.win.Event("change", { bubbles: true }));
};
const until = async (pred: () => boolean, ms = 6000) => { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 30)); } };
const peopleReady = (p: Page) => p.waitFor((x) => /My people/.test(x) && /people are on my list|person is on my list/.test(x));

describe("console steps 5 and 6: idiot-proof", () => {
  test("Send a new link: the page opens no pop-up by itself; the row gets a real Send on WhatsApp button with the new link and says the old one has stopped", async () => {
    const o = await organizer(); await make(o, "IP-RS"); await publish(o, "IP-RS");
    await o.api("POST", "/api/z/IP-RS/people", { people: [{ name: "Asha Verma", phone: "9876543210" }] }, o.token);
    const first = (await listOf(o, "IP-RS")).people[0];
    const p = await consolePage(o, "IP-RS"); openStep(p, 6); await peopleReady(p);
    (p.$("a[data-wa]") as any).click(); await p.waitFor((x) => /Sent on WhatsApp/.test(x) && /Send a new link/.test(x));
    expect(p.$("a[data-wa]")).toBeNull();
    let opened = 0; p.win.open = () => { opened++; return null; };
    p.click("[data-resend]"); await p.waitFor(() => !!p.$("a[data-wa]"));
    const again = p.$("a[data-wa]") as any;
    expect(again.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/); expect(again.getAttribute("href")).not.toBe(first.waLink); // a new personal link, offered as a real button
    expect(opened).toBe(0); expect(p.text()).toMatch(/A new link is ready\. The old one has stopped/);
    expect(p.errors).toEqual([]);
  });

  test("Add one person: a refusal says what to fix and keeps what was typed; a good add empties the boxes", async () => {
    const o = await organizer(); await make(o, "IP-ADD"); await publish(o, "IP-ADD");
    const p = await consolePage(o, "IP-ADD"); openStep(p, 6); await p.waitFor((x) => /0 people are on my list/.test(x));
    setField(p, "#gname", "Asha Rao"); p.click("#gadd");
    await p.waitFor((x) => /There is no mobile number\. Fix it and press Add again\./.test(x));
    expect((p.$("#gname") as any).value).toBe("Asha Rao"); // nothing to type twice
    setField(p, "#gphone", "98765 43210"); p.click("#gadd");
    await p.waitFor((x) => /1 good, 0 duplicates removed, 0 look wrong/.test(x));
    expect((p.$("#gname") as any).value).toBe(""); expect((p.$("#gphone") as any).value).toBe("");
    expect((await listOf(o, "IP-ADD")).people.map((x: any) => x.name)).toEqual(["Asha Rao"]);
    expect(p.errors).toEqual([]);
  });

  test("A CSV: a quoted \"Rao, Asha\" is one name, brackets are fine, and a row that is left out is named with its reason", async () => {
    const o = await organizer(); await make(o, "IP-CSV"); await publish(o, "IP-CSV");
    const p = await consolePage(o, "IP-CSV"); openStep(p, 6); await peopleReady(p);
    p.click('[data-mode="file"]');
    chooseFile(p, "#gfile", "people.csv", 'Name,Mobile\n"Rao, Asha",9876543214\nBala (Finance),9876543215\nChitra#1,9876543216\n');
    await p.waitFor((x) => /2 good, 0 duplicates removed, 0 look wrong/.test(x));
    expect((await listOf(o, "IP-CSV")).people.map((x: any) => x.name).sort()).toEqual(["Bala (Finance)", "Rao Asha"]);
    expect(p.text()).toMatch(/1 row was left out: Chitra#1 \(The name can have letters, numbers/);
  });

  test("The columns offered fit the game: a mobile-number game has no employee-ID chip and says where to change it; an employee-ID game offers all three", async () => {
    const o = await organizer(); await make(o, "IP-COL"); await make(o, "IP-COL2");
    await o.api("PATCH", "/api/z/IP-COL2/settings", { whoCanJoin: "list", employeesOnly: true, verify: "id" }, o.aiKey);
    const p = await consolePage(o, "IP-COL"); openStep(p, 6); await peopleReady(p);
    expect(p.win.document.querySelectorAll("[data-cols]").length).toBe(0); expect(p.$("#colsnote")).toBeTruthy(); expect(p.$('#colsnote [data-open="2"]')).toBeTruthy();
    expect(p.text()).toMatch(/choose Only my employees in step 2/);
    const q = await consolePage(o, "IP-COL2"); openStep(q, 6); await peopleReady(q);
    expect(q.win.document.querySelectorAll("[data-cols]").length).toBe(3); expect((q.$('[data-cols="id"]') as any).getAttribute("aria-pressed")).toBe("true");
  });

  test("A guest's own data: the answer shows right under the buttons that were pressed, and the typed number stays in its box", async () => {
    const o = await organizer(); await make(o, "IP-GT"); await publish(o, "IP-GT");
    expect((await o.api("POST", "/api/z/IP-GT/join", { phone: "9855555555", name: "Guest Kumar", device: "1".repeat(32) })).status).toBe(200);
    const p = await consolePage(o, "IP-GT"); openStep(p, 6); await p.waitFor((x) => /Change of phone/.test(x));
    setField(p, "#pdph", "98555 55555"); p.click("#pdsee");
    await p.waitFor((x) => /Ticket \d+/.test(x));
    const note = p.$("#gtnote") as any; expect(note.textContent).toMatch(/We hold only their name and number/);
    expect(!!(p.$("#pdsee").compareDocumentPosition(note) & 4)).toBe(true); expect(p.$("#zcnote")).toBeNull(); // it follows the buttons; nothing was written at the top of the page
    expect((p.$("#pdph") as any).value).toBe("98555 55555");
    expect((await o.api("POST", "/api/z/IP-GT/join", { phone: "9855555555", name: "Guest Kumar", device: "2".repeat(32) })).status).toBe(423);
    setField(p, "#ubph", "98555 55555"); p.click("#unbind");
    await p.waitFor((x) => /next phone they join with keeps their ticket/i.test(x));
    expect((p.$("#unbind") as any).closest(".zc-inline").nextElementSibling.id).toBe("gtnote");
    expect((await o.api("POST", "/api/z/IP-GT/join", { phone: "9855555555", name: "Guest Kumar", device: "2".repeat(32) })).status).toBe(200);
  }, 60_000);

  test("Your team: a refusal shows right under the Add button, and a Co-host gets a Send on WhatsApp button for the private link", async () => {
    const o = await organizer(); await make(o, "IP-TEAM");
    const p = await consolePage(o, "IP-TEAM"); openStep(p, 5); await p.waitFor((x) => /Your Co-hosts: 0 \(no limit\)/.test(x));
    p.click("#cohostadd"); await p.waitFor((x) => /Please type the Co-host's name/.test(x));
    const foot = (p.$("#cohostadd") as any).closest(".zc-inline").nextElementSibling;
    expect(foot.textContent).toMatch(/Please type the Co-host's name/); expect(foot.getAttribute("role")).toBe("alert");
    setField(p, "#cohostlabel", "Ravi One"); setField(p, "#cohostphone", "98111 00012"); p.click("#cohostadd");
    await p.waitFor((x) => /Your Co-hosts: 1 \(no limit\)/.test(x));
    const a = p.$("a[data-hostwa]") as any, href = decodeURIComponent(a.getAttribute("href"));
    expect(a.getAttribute("href").startsWith("https://wa.me/919811100012?text=")).toBe(true); expect(href).toMatch(/you are a Co-host for Corporate Tambola/); expect(href).toMatch(/#cohost=ctc_[0-9a-f]{48}/);
    expect((p.$("#cohostadd") as any).closest(".zc-inline").nextElementSibling.textContent).toMatch(/Co-host added\. Send their link on WhatsApp/);
    expect(p.errors).toEqual([]);
  });

  test("The blank list is blank: the downloaded file holds only the heading row, no sample people", async () => {
    const o = await organizer(); await make(o, "IP-TPL"); await publish(o, "IP-TPL");
    const p = await consolePage(o, "IP-TPL"); openStep(p, 6); await peopleReady(p);
    p.click('[data-mode="file"]');
    let blob: any = null; p.win.URL.createObjectURL = (b: any) => { blob = b; return "blob:x"; };
    p.click("#gtemplate");
    expect(String(await blob.text()).replace(/^﻿/, "")).toBe("Name,Mobile\r\n"); // the heading row only: no Asha Rao, no Ravi Shah
  });

  test("People waiting to be let in are shown on every step, with a button to the waiting list", async () => {
    const o = await organizer(); await make(o, "IP-WB", { whoCanJoin: "list" }); await publish(o, "IP-WB");
    const j = await o.api("POST", "/api/z/IP-WB/join", { phone: "9876510001", name: "Guest1 Kumar", device: "01" + "d".repeat(30) });
    expect(j.status).toBe(403); // not on the list: "Please wait"
    const p = await consolePage(o, "IP-WB"); // an unpaid published game opens on step 8
    await p.waitFor((x) => /1 person is waiting to come in/.test(x));
    p.click('#waitbanner [data-open="6"]'); await p.waitFor((x) => /Waiting to come in: 1/.test(x));
    expect(p.$("#waitbanner")).toBeNull(); // the list itself is on screen now
  });
  test("a row with an employee ID but no mobile number: Fix and add keeps the ID, so an employees-only game takes the person instead of refusing them again", async () => {
    const o = await organizer(); await make(o, "IP-EMPID"); await publish(o, "IP-EMPID");
    await o.api("PATCH", "/api/z/IP-EMPID/settings", { whoCanJoin: "list", employeesOnly: true, verify: "both" }, o.aiKey);
    const p = await consolePage(o, "IP-EMPID"); openStep(p, 6); await peopleReady(p);
    p.click('[data-mode="file"]');
    chooseFile(p, "#gfile", "people.csv", "Name,Employee ID\nAsha Rao,E101\n");
    await p.waitFor((x) => /These need a mobile number\. Type it and press Fix and add\./.test(x));
    expect(p.$("#wronglist")!.textContent).toMatch(/employee ID E101/); // the ID from the file is shown, so the person can see it is kept
    setField(p, "#fixin0", "98765 43210"); p.click("[data-fix='0']");
    await p.waitFor((x) => /1 good, 0 duplicates removed, 0 look wrong/.test(x));
    expect(!!p.$("#wronglist")).toBe(false);
    const list = (await listOf(o, "IP-EMPID")).people; expect(list.map((x: any) => [x.name, x.empId])).toEqual([["Asha Rao", "E101"]]); // saved with the ID
    expect(p.errors).toEqual([]);
  });

  test("a row the server itself refuses keeps its employee ID in the Fix and add list", async () => {
    const o = await organizer(); await make(o, "IP-SRV"); await publish(o, "IP-SRV");
    await o.api("PATCH", "/api/z/IP-SRV/settings", { verify: "both" }, o.aiKey);
    const hook = (win: any, f: string) => {
      if (f !== "control.js") return;
      const real = win.fetch;
      win.fetch = async (input: any, init?: any) => { const u = new URL(String(input), "http://localhost"); if ((init?.method || "GET").toUpperCase() === "POST" && /\/people$/.test(u.pathname)) return new Response(JSON.stringify({ added: 0, duplicates: 0, invalid: [{ raw: "Asha Rao +919876543210", why: "That number cannot be used." }], people: [] }), { status: 200, headers: { "content-type": "application/json" } }); return real(input, init); };
    };
    const p = await consolePage(o, "IP-SRV", hook); openStep(p, 6); await peopleReady(p);
    p.click('[data-mode="file"]'); chooseFile(p, "#gfile", "people.csv", "Name,Mobile,Employee ID\nAsha Rao,9876543210,E101\n");
    await p.waitFor((x) => /1 looks wrong/.test(x));
    expect(p.$("#wronglist")!.textContent).toMatch(/Asha Rao[\s\S]*employee ID E101[\s\S]*That number cannot be used\./);
  });

  test("a second add while one is running says so: the typed number stays in the Fix box and the second file is not taken for added", async () => {
    const o = await organizer(); await make(o, "IP-BUSY"); await publish(o, "IP-BUSY");
    let hold: Promise<void> | null = null, release!: () => void, posts = 0;
    const hook = (win: any, f: string) => {
      if (f !== "control.js") return;
      const real = win.fetch;
      win.fetch = async (input: any, init?: any) => { const u = new URL(String(input), "http://localhost"); if ((init?.method || "GET").toUpperCase() === "POST" && /\/people$/.test(u.pathname)) { posts++; if (hold) await hold; } return real(input, init); };
    };
    const p = await consolePage(o, "IP-BUSY", hook); openStep(p, 6); await peopleReady(p);
    p.click('[data-mode="file"]'); chooseFile(p, "#gfile", "a.csv", "Name,Mobile\nAsha,9876543210\nBala,12345\n");
    await p.waitFor((x) => /1 good, 0 duplicates removed, 1 looks wrong/.test(x)); // Bala's number is wrong: he is in the Fix and add list
    hold = new Promise<void>((r) => (release = r));
    p.click('[data-mode="type"]'); setField(p, "#gname", "Chitra"); setField(p, "#gphone", "98765 43211"); p.click("#gadd");
    await p.waitFor(() => posts === 2); // this add is on its way and waits
    setField(p, "#fixin0", "98765 43212"); p.click("[data-fix='0']"); // Fix and add pressed meanwhile
    expect(p.text()).toMatch(/Still adding the last list/); expect((p.$("#fixin0") as any).value).toBe("98765 43212"); expect(posts).toBe(2);
    p.click('[data-mode="file"]'); chooseFile(p, "#gfile", "b.csv", "Name,Mobile\nDev,9876543219\n"); // a second file meanwhile
    expect(p.$("#csvnote")!.textContent).toMatch(/Still adding the last list/); expect(posts).toBe(2);
    release(); await p.waitFor(() => !(p.win as any).__zc.pp.adding, 10_000);
    expect((await listOf(o, "IP-BUSY")).people.map((x: any) => x.name).sort()).toEqual(["Asha", "Chitra"]); // only what was really added is on the list
  });

  test("Send a new link: after the same failure twice the button is usable again (it stayed grey)", async () => {
    const o = await organizer(); await make(o, "IP-RSF"); await publish(o, "IP-RSF");
    await o.api("POST", "/api/z/IP-RSF/people", { people: [{ name: "Asha Verma", phone: "9876543210" }] }, o.token);
    let hits = 0;
    const hook = (win: any, f: string) => {
      if (f !== "control.js") return;
      const real = win.fetch;
      win.fetch = async (input: any, init?: any) => { const u = new URL(String(input), "http://localhost"); if ((init?.method || "GET").toUpperCase() === "POST" && /\/resend$/.test(u.pathname)) { hits++; return new Response(JSON.stringify({ error: "The service is busy. Please try again." }), { status: 503, headers: { "content-type": "application/json" } }); } return real(input, init); };
    };
    const p = await consolePage(o, "IP-RSF", hook); openStep(p, 6); await peopleReady(p);
    (p.$("a[data-wa]") as any).click(); await p.waitFor((x) => /Send a new link/.test(x));
    p.click("[data-resend]"); await p.waitFor(() => hits === 1); await p.waitFor((x) => /The service is busy/.test(x));
    await until(() => !!p.$("[data-resend]") && !(p.$("[data-resend]") as any).disabled); // the first failure: the page changed, the button is new
    p.click("[data-resend]"); await p.waitFor(() => hits === 2); // the same words again: the page looks the same
    await until(() => !!p.$("[data-resend]") && !(p.$("[data-resend]") as any).disabled, 3000);
  });

  test("Remove (Host or Co-host) and Delete their data ask in the page, not in the browser's own box, which can be blocked and then leaves the red button dead", async () => {
    const o = await organizer(); await make(o, "IP-ASK"); await publish(o, "IP-ASK");
    await o.api("POST", "/api/org/cohost", { label: "Ravi", phone: "9811100099", eid: "IP-ASK" }, o.token);
    expect((await o.api("POST", "/api/z/IP-ASK/join", { phone: "9855555555", name: "Guest Kumar", device: "1".repeat(32) })).status).toBe(200);
    const p = await consolePage(o, "IP-ASK"); (p.win as any).confirm = () => false; // a browser that has stopped the page's question boxes
    openStep(p, 5); await p.waitFor((x) => /Your Co-hosts: 1/.test(x));
    p.click('[data-retire][data-kind="cohost"]'); expect(!!p.$("#zcsure")).toBe(true); // the question is in the page
    p.click("#zcsure [data-n]"); expect(!!p.$("#zcsure")).toBe(false); expect((await o.json(await o.api("GET", "/api/org/team", undefined, o.token))).cohosts.length).toBe(1); // No keeps them
    p.click('[data-retire][data-kind="cohost"]'); p.click("#zcsure [data-y]");
    await p.waitFor((x) => /Removed\. Their link has stopped\./.test(x)); expect((await o.json(await o.api("GET", "/api/org/team", undefined, o.token))).cohosts.length).toBe(0);
    openStep(p, 6); await p.waitFor((x) => /Change of phone/.test(x));
    setField(p, "#pdph", "98555 55555"); p.click("#pddel"); expect(!!p.$("#zcsure")).toBe(true);
    p.click("#zcsure [data-n]"); expect(p.text()).not.toMatch(/Their data is deleted/);
    expect((await o.api("POST", "/api/z/IP-ASK/join", { phone: "9855555555", name: "Guest Kumar", device: "2".repeat(32) })).status).toBe(423); // still bound to the first phone: nothing was deleted
    setField(p, "#pdph", "98555 55555"); p.click("#pddel"); p.click("#zcsure [data-y]"); await p.waitFor((x) => /Done\. Their data is deleted\./.test(x));
    expect((await o.api("POST", "/api/z/IP-ASK/join", { phone: "9855555555", name: "Guest Kumar", device: "2".repeat(32) })).status).toBe(200); // the seat is gone: another phone can join
  }, 60_000);
});
