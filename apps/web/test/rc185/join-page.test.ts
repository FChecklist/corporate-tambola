// rc/tambola-1.8.5 / TEST_HANDOFF 1.8.4 group 2 (join chips, 'You are in!', ticket before the game) and 1.8.5 idKind on the join page (label, hint, refusals).
// The real player page (z.js) runs in a DOM against the real Worker. Test addresses: demoN@demo-test.invalid only.
// Run: bun test --isolate apps/web/test/rc185
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { organizer, published, phone, setVal, START, NEW_AT, roundAt, roundMs, wait, T } from "./page";
import type { Page } from "../harness";

setDefaultTimeout(90_000);
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });
const landing = async (o: any, id: string, url = `/z?e=${id}`) => { const p = await phone(o, url); open.push(p); await p.waitFor((t) => /Join the game|Join/.test(t) && !!p.$("#go"), 30_000); return p; };
const chips = (p: Page) => p.$("#joinchips") as any;

describe("join page chips (id joinchips)", () => {
  test("with a brand: company chip, day-and-time chip (India time) and 'Game ID <id>' chip", async () => {
    const o = await organizer(); await published(o, "RC-CHIP1", { brand: { name: "Acme India", color: "#0B3D91" } }); const p = await landing(o, "RC-CHIP1"); const c = chips(p);
    expect(c).toBeTruthy(); const items = [...c.querySelectorAll(".zjchip")].map((x: any) => x.textContent.trim());
    expect(items.length).toBe(3); expect(items[0]).toBe("Acme India"); expect(c.querySelector(".zjco")!.textContent).toBe("Acme India"); expect(items[2]).toBe("Game ID RC-CHIP1");
    const ist = new Date(roundMs(START)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).replace(/ (am|pm)$/i, (m) => m.toLowerCase());
    expect(items[1]).toContain(ist); expect(items[1]).toMatch(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun) /);
  });
  test("without a brand: no company chip, still the time and the Game ID", async () => {
    const o = await organizer(); await published(o, "RC-CHIP2"); const p = await landing(o, "RC-CHIP2"); const c = chips(p);
    expect(c.querySelector(".zjco")).toBeNull(); const items = [...c.querySelectorAll(".zjchip")].map((x: any) => x.textContent.trim()); expect(items.length).toBe(2); expect(items[1]).toBe("Game ID RC-CHIP2");
  });
  test("the chips sit under the title, before the form", async () => {
    const o = await organizer(); await published(o, "RC-CHIP3"); const p = await landing(o, "RC-CHIP3"); const h = p.html(); expect(h.indexOf('id="joinchips"')).toBeGreaterThan(-1); expect(h.indexOf('id="joinchips"')).toBeLessThan(h.indexOf('id="go"'));
  });
  test("not shown in the free demo (z.js draws no chips when DEMO is set): the chip function returns '' for a demo", () => {
    const z = readFileSync(join(import.meta.dir, "../../public/z.js"), "utf8"), a = z.indexOf("const joinChips = () => {"), b = z.indexOf("const joinView = (msg)");
    const make = (DEMO: unknown) => new Function("INFO", "EID", "DEMO", "ZG", "esc", z.slice(a, b) + "; return joinChips();");
    const INFO = { brand: { name: "Acme" }, startMs: Date.UTC(2026, 10, 1, 9, 30) }, ZG = { dayTimeIst: () => "Sun 3:00pm" }, esc = (s: any) => String(s);
    expect(make(null)(INFO, "G1", null, ZG, esc)).toContain("Game ID G1"); expect(make({})(INFO, "G1", { running: false }, ZG, esc)).toBe("");
  });
});

describe("before the game (check-in games)", () => {
  const joinNow = async (o: any, id: string) => {
    const p = await landing(o, id); (p.$("#ph") as any).value = "9812345678"; (p.$("#nm") as any).value = "Asha"; p.click("#go");
    await p.waitFor((t) => /You are in/.test(t) || /Your ticket/.test(t), 60_000); return p;
  };
  test("check-in closed: 'You are in! Game starts in <h m>.' above 'Check-in opens at ...'; the ticket is NOT shown (owner rule since 1.8.0)", async () => {
    const o = await organizer(NEW_AT); await published(o, "RC-PRE1"); const p = await joinNow(o, "RC-PRE1");
    await p.waitFor((t) => /Check-in opens at/.test(t), 30_000);
    const zin = p.$("#zin") as any; expect(zin).toBeTruthy(); expect(zin.textContent).toMatch(/^You are in! Game starts in .+\.$/); expect(zin.textContent).toMatch(/\d/);
    expect(p.html().indexOf('id="zin"')).toBeLessThan(p.html().indexOf("Check-in opens at"));
    expect(!!p.$(".zticket")).toBe(false); expect(p.text()).not.toMatch(/Your ticket/);
  });
  test("once check-in is open, 'You are in!' is gone and 'Mark yourself present' is asked; the ticket still waits for the check-in", async () => {
    const o = await organizer(NEW_AT); await published(o, "RC-PRE2"); const p = await joinNow(o, "RC-PRE2"); await p.waitFor((t) => /Check-in opens at/.test(t), 30_000);
    o.world.now = roundMs(roundAt(NEW_AT) + 1200) - 3 * 60_000; // inside the last 5 minutes
    await p.waitFor((t) => /Mark yourself present/.test(t), 90_000);
    expect(!!p.$("#zin")).toBe(false); expect(p.text()).not.toContain("You are in!"); expect(!!p.$(".zticket")).toBe(false);
  });
});

describe("join page by idKind (label, hint, refusals)", () => {
  test("employee-ID game (new): label 'Your employee ID', upper-case keyboard, hint 'The system will read this as 1B678' for 1b-678", async () => {
    const o = await organizer(NEW_AT); await published(o, "RC-ID1", { verify: "id", employeesOnly: true }); const p = await landing(o, "RC-ID1");
    expect(p.text()).toContain("Your employee ID"); expect(p.text()).not.toContain("Your Email ID"); const inp = p.$("#emp") as any;
    expect(inp.getAttribute("autocapitalize")).toBe("characters"); expect(inp.getAttribute("maxlength")).toBe("60");
    setVal(p, "#emp", "1b-678"); expect(p.$("#empread")!.textContent).toBe("The system will read this as 1B678");
    setVal(p, "#emp", "ｅｍｐ００１"); expect(p.$("#empread")!.textContent).toBe("The system will read this as EMP001");
    setVal(p, "#emp", ""); expect(p.$("#empread")!.textContent).toBe("");
  });
  test("Email-ID game: label 'Your Email ID', not upper-cased, 254 characters, hint shows the lower-case address", async () => {
    const o = await organizer(NEW_AT); await published(o, "RC-ID2", { verify: "id", employeesOnly: true, idKind: "email" }); const p = await landing(o, "RC-ID2");
    expect(p.text()).toContain("Your Email ID"); expect(p.text()).not.toContain("Your employee ID"); const inp = p.$("#emp") as any;
    expect(inp.getAttribute("autocapitalize")).toBe("none"); expect(inp.getAttribute("maxlength")).toBe("254"); expect(inp.getAttribute("inputmode")).toBe("email");
    setVal(p, "#emp", " DEMO1 @Demo-Test.invalid "); expect(p.$("#empread")!.textContent).toBe("The system will read this as demo1@demo-test.invalid");
    setVal(p, "#emp", "demo1＠demo-test.invalid"); expect(p.$("#empread")!.textContent).toBe("The system will read this as demo1@demo-test.invalid");
  });
  test("the welcome line names the right ID: 'type your Email ID.' / 'type your employee ID.'", async () => {
    const o = await organizer(NEW_AT); await published(o, "RC-ID3", { verify: "id", employeesOnly: true, idKind: "email" }); await published(o, "RC-ID4", { verify: "id", employeesOnly: true });
    const a = await landing(o, "RC-ID3"); expect(a.text()).toContain("To join, type your Email ID."); const b = await landing(o, "RC-ID4"); expect(b.text()).toContain("To join, type your employee ID.");
  });
  test("an incomplete Email ID is refused on the phone with 'Please check your Email ID. It looks incomplete.' (nothing is sent)", async () => {
    const o = await organizer(NEW_AT); await published(o, "RC-ID5", { verify: "id", employeesOnly: true, idKind: "email" }); const p = await landing(o, "RC-ID5");
    for (const bad of ["demo1", "demo1@", "@demo-test.invalid", "demo1@demo"]) { (p.$("#emp") as any).value = bad; (p.$("#nm") as any).value = "Asha"; p.click("#go"); await p.waitFor((t) => /Please check your Email ID\. It looks incomplete\./.test(t), 10_000); }
  });
  test("an email typed in an employee-ID game is refused on the phone: 'This looks like an Email ID...'", async () => {
    const o = await organizer(NEW_AT); await published(o, "RC-ID6", { verify: "id", employeesOnly: true }); const p = await landing(o, "RC-ID6");
    (p.$("#emp") as any).value = "demo1@demo-test.invalid"; (p.$("#nm") as any).value = "Asha"; p.click("#go");
    await p.waitFor((t) => /This looks like an Email ID\. This game asks for an employee ID: letters and numbers only\./.test(t), 10_000);
  });
  // PRODUCT BUG (reported in docs/TESTER_REPORT.md, bug B1): while the person types an email in the employee-ID box, the hint under the box says
  // "The system will read this as DEMO1DEMOTESTINVALID", the exact mangling the 1.8.5 rule forbids (an email is refused, never turned into letters).
  // This test is RED on rc/tambola-1.8.5 until z.js stops showing that hint for an address. It is kept red on purpose; do not "fix" it by editing the test.
  test("PRODUCT BUG B1: the hint under the employee-ID box never shows an email turned into letters", async () => {
    const o = await organizer(NEW_AT); await published(o, "RC-ID9", { verify: "id", employeesOnly: true }); const p = await landing(o, "RC-ID9");
    setVal(p, "#emp", "demo1@demo-test.invalid"); const hint = p.$("#empread")!.textContent; expect(hint).not.toContain("DEMO1DEMOTESTINVALID");
  });
  test("empty ID: 'Enter your Email ID.' / 'Enter your employee ID.'", async () => {
    for (const [id, set, want] of [["RC-ID7", { verify: "id", employeesOnly: true, idKind: "email" }, "Enter your Email ID."], ["RC-ID8", { verify: "id", employeesOnly: true }, "Enter your employee ID."]] as const) {
      const o = await organizer(NEW_AT); await published(o, id, set); const p = await landing(o, id); (p.$("#nm") as any).value = "Asha"; p.click("#go"); await p.waitFor((t) => t.includes(want), 10_000);
    }
  });
});
void wait; void T;
