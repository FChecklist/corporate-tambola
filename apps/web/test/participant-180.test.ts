// 1.8.0 participant side (owner 30 Oct): the open-game form takes an optional Email ID, the family host card and the family member screen, and polite 30-minute messages.
// The engine API they use is in apps/edge/src/approvals.ts (1.8.0): GET /api/z/<id>/waiting, POST /api/z/<id>/waiting/<wid> {decision}, join {email}.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rd = (f: string) => readFileSync(join(import.meta.dir, f), "utf8").replace(/\r\n/g, "\n");
const css = rd("../public/z.css"), z = rd("../public/z.js"), rt = rd("../../../packages/beacon/src/phone-runtime.ts"), guide = rd("../public/guide.js");

describe("participant side 1.8.0", () => {
  test("the join carries an optional email (runtime and page), asked only in a game where people type their mobile number", () => {
    expect(rt).toContain("empId?: string, email?: string): Promise<boolean>");
    expect(rt).toContain("...(email ? { email } : {})");
    expect(z).toContain("rt.join(J.e164 || J.phone, J.name, inviteOf(), J.emp, J.email)");
    expect(z).toContain('Your email ID <span class="zopt">(optional)</span>');
    expect(z).toContain('INFO.open === true && (INFO.verify || "mobile") === "mobile" && !INFO.empOnly');
    expect(readFileSync(join(import.meta.dir, "../public/zgame.js"), "utf8")).toContain("email:"); // the built runtime has it
  });
  test("family host card: passes, notification, approval until 15 minutes before the game; approve and Not now use the engine's waiting API", () => {
    expect(z).toContain("You have ${iv.per + 1} passes: 1 for you and ${iv.per} for your family and friends.");
    expect(z).toContain("You get a notification here and can approve their entry up to 15 minutes before the game begins. They play on the phone or laptop they click the link from.");
    expect(z).toContain("`/api/z/${EID}/waiting?me=");
    expect(z).toContain("`/api/z/${EID}/waiting/${encodeURIComponent(wid)}`, { decision, me: v.pid");
    expect(z).toContain('data-fam="admit"'); expect(z).toContain('data-fam="decline"'); expect(z).toContain(">Not now</button>");
  });
  test("family member: waits for the family host; waits that run out or are declined get the polite words", () => {
    expect(z).toContain("You asked to join through a family pass. Please wait while your family host approves your entry.");
    expect(z).toContain("approves your entry. You can come in as soon as they say yes.\" : J.note"); // the family sentence replaces the server note, so the text reads once
    expect(z).not.toContain("Your request waited 30 minutes"); // the 30-minute words come from the server (a request can also lapse because the game ended)
    expect(z).toContain("J.endNote = String(r.message || \"\").slice(0, 300)");
    expect(z).toContain("${J.endNote ? esc(J.endNote) :");
  });
  test("the family card is readable in both looks: its link box follows the look", () => {
    expect(css).toContain("html[data-pt] .zlink{background:rgba(255,255,255,.08);color:var(--ink)");
  });
  test("every new server message has a guide entry", () => {
    for (const m of ["Please check your email ID", "This email ID already holds a ticket", "waited more than 30 minutes", "Family approvals closed"]) expect([m, guide.includes(m)]).toEqual([m, true]);
  });
});
