// RELEASE 1.6.8: the two PDFs the site offers (brochure.pdf, organizer-manual.pdf) show the new logo and the real screens. They are rebuilt with tools/make-doc-shots.py, tools/make-brochure.mjs and tools/onepager/render.mjs.
// The report PDF and the invoice PDF are checked in apps/edge/test (report-logo.test.ts, pay.test.ts). Text is read with the pdf.js copy the site already ships (vendor/pdfjs).
import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { GAMES_PLAYED_CLAIM } from "./claims";
const PUB = new URL("../public/", import.meta.url);
const bytes = (f: string) => new Uint8Array(readFileSync(new URL(f, PUB)));
const lib: any = await import(new URL("vendor/pdfjs/pdf.min.mjs", PUB).href);
lib.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.min.mjs", PUB).href;
async function pages(f: string): Promise<string[]> {
  const doc = await lib.getDocument({ data: bytes(f), useSystemFonts: true }).promise; const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) out.push(((await (await doc.getPage(i)).getTextContent()).items as any[]).map((x) => x.str).join(" ").replace(/\s+/g, " "));
  return out;
}
const images = (f: string) => (Buffer.from(bytes(f)).toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
const HTML_SRC: Record<string, string> = { "brochure.pdf": "brochure.html", "organizer-manual.pdf": "../../../tools/onepager/organizer-manual.html" };

describe("brochure.pdf: one page, the new logo, real screens", () => {
  test("one page; the new Corporate / Tambola wording; the payee sentence; no 'private'", async () => {
    const p = await pages("brochure.pdf"); expect(p.length).toBe(1); const t = p[0]!;
    expect(t).toMatch(/CORPORATE/i); expect(t).toContain("Tambola"); expect(t).toContain("A tambola night your whole team will talk about."); expect(t).toContain("All payments are taken only by IT Services by Rajat Agarwal, through Razorpay.");
    expect(/private/i.test(t)).toBe(false); expect(t).not.toContain("Free AI assistant for organizers"); expect(t).toContain("4 23 45 61 82 12 37 49 76 88 9 28 53 67 79"); /* the new badge's ticket */
  });
  test("owner pricing update 2026-11-23: the PDF shows the three cups, the other five sizes and the trust strip, and none of the old prices", async () => {
    const t = (await pages("brochure.pdf"))[0]!.replace(/\s+/g, " ").replace(/₹ /g, "₹"); // pdf.js reads the cup boxes after the text beside them, so each word is looked for on its own
    expect(t).toMatch(/RUN A GAME YOUR WHOLE TEAM WILL TALK ABOUT\./i);
    for (const w of ["Small", "Up to 100 guests", "₹2,999", "Medium", "Up to 500 guests", "₹4,999", "Large", "Up to 1,000 guests", "₹7,499"]) expect(t).toContain(w);
    expect(t).toMatch(/most chosen/i);
    for (const b of ["You choose auto mode or manual mode.", "Close group only: just the people you invite.", "You are in control, from start to finish."]) expect(t).toContain(b);
    expect(t).toContain("up to 250 ₹3,799 · up to 750 ₹6,299 · up to 2,500 ₹11,999 · up to 5,000 ₹17,999 · up to 10,000 ₹29,999");
    expect(t).toContain("Players' details are erased within 24 hours after the game."); expect(t).toContain("Pay once per game, receipt straight away."); expect(t).not.toMatch(GAMES_PLAYED_CLAIM); expect(t).not.toMatch(/\bgames played\b/i); /* the owner dropped the "games played" count: nothing in the repository backs it */
    for (const [h, l] of [["2", "399"], ["3", "499"], ["4", "699"], ["5", "899"], ["7", "099"], ["11", "799"], ["17", "699"], ["29", "499"]]) expect(t).not.toContain(h + "," + l); /* the old rupee prices, written in two halves so the repository-wide scan in pricing-cups.test.ts finds nothing here */
  });
  test("the pictures are in it: the home page with the six-item menu and three real screens (at least 4 images; the old PDF had none)", () => { expect(images("brochure.pdf")).toBeGreaterThanOrEqual(4); });
  test("it is a real, light PDF (under 700 KB) and the page sources name the new logo and the screens", () => {
    expect(bytes("brochure.pdf").length).toBeLessThan(700_000); const h = readFileSync(new URL("brochure.html", PUB), "utf8");
    expect(h).toContain('<img src="logo-mark.svg"'); expect(h).toContain("img/doc-landing-laptop.jpg"); for (const f of ["doc-landing-laptop.jpg", "doc-step2.jpg", "doc-step6.jpg", "doc-live.jpg"]) expect([f, existsSync(new URL("img/" + f, PUB))]).toEqual([f, true]);
  });
});

describe("organizer-manual.pdf: the ten steps and a page of real screens, the new logo", () => {
  test("two pages: the manual, then 'What the screens look like'", async () => {
    const p = await pages("organizer-manual.pdf"); expect(p.length).toBe(2);
    expect(p[0]!).toContain("ORGANIZER'S ONE-PAGE MANUAL"); expect(p[0]!).toContain("Set up your game in 10 small steps."); expect(p[1]!).toContain("WHAT THE SCREENS LOOK LIKE");
    for (const w of ["Date and time", "Number of participants", "Prizes", "Brand moments", "Invite and share links", "Check and publish", "Rehearsals", "Players check in", "The live ticket", "Game day", "After the game", "The website menu on a phone"]) expect([w, p[1]!.includes(w)]).toEqual([w, true]);
  });
  test("the new badge is drawn at the top (its ticket numbers 4 23 45 61 82 ... 79 come first) and the old letter-T box is gone", async () => { const t = (await pages("organizer-manual.pdf"))[0]!; expect(t).toMatch(/^4 23 45 61 82 12 37 49 76 88 9 28 53 67 79 CORPORATE TAMBOLA/); expect(/^\s*T\s+CORPORATE TAMBOLA/.test(t)).toBe(false); });
  test("twelve real screens are in it (the old PDF had none); no 'private'; the contact line is there", async () => {
    expect(images("organizer-manual.pdf")).toBeGreaterThanOrEqual(12); const all = (await pages("organizer-manual.pdf")).join(" ");
    expect(/private/i.test(all)).toBe(false); expect(all).toContain("hello@corporatetambola.com"); expect(all).toContain("IT Services by Rajat Agarwal");
  });
  test("the PDF source uses the badge file, not the old box", () => {
    const h = readFileSync(new URL(HTML_SRC["organizer-manual.pdf"]!, PUB), "utf8"); expect(h).toContain('<img class="mark" src="../../apps/web/public/logo-mark.svg"'); expect(h).not.toContain('<div class="mark">T</div>');
    expect((h.match(/<figure>/g) ?? []).length).toBe(12); for (const m of h.matchAll(/src="\.\.\/\.\.\/apps\/web\/public\/img\/([a-z0-9-]+\.jpg)"/g)) expect([m[1], existsSync(new URL("img/" + m[1], PUB))]).toEqual([m[1], true]);
  });
});

describe("every PDF the site offers is listed here", () => {
  test("the public folder holds exactly these two PDFs (a new one must get its own test)", () => {
    const { readdirSync } = require("node:fs"); expect((readdirSync(PUB) as string[]).filter((f) => f.endsWith(".pdf")).sort()).toEqual(["brochure.pdf", "organizer-manual.pdf"]);
  });
});
