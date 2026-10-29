import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { layoutReport, type ReportData } from "../src/report-layout";
import { readPng } from "../../web/test/png-pixels";

// The organizer's logo and company name are printed on the report PDF (owner order 2026-10-09: "visible in the ticket and all the places, documents").
const base = (extra: Partial<ReportData> = {}): ReportData => ({
  engagementId: "LOGO-1", organizerEmail: "boss@acme.com", sentAtMs: 1_800_000_000_000, scheduledMs: 1_799_990_000_000, firstNumberMs: 1_799_990_100_000, endMs: 1_799_995_000_000, endReason: "All numbers were called.", wasHeld: false,
  rounds: 1, callSeconds: 9, ticketsPerPerson: 1, cap: 100, inviteOnly: false, numbersCalled: 90, people: [], prizes: [], lucky: [], timeline: [], breaks: [], personalDeleteAtMs: 1_800_050_000_000, fullDeleteAtMs: 1_830_000_000_000, ...extra,
});
const text = (b: Uint8Array) => Buffer.from(b).toString("latin1");
describe("report PDF prints a foreign mobile number in full", () => {
  test("+971, +44 and a 15-digit number are not cut in the winners, lucky-draw and everyone tables", () => {
    const nums = ["+971501234567", "+447911123456", "+123456789012345"];
    const people = nums.map((phone, i) => ({ seat: i + 1, name: "P" + i, phone, joinedMs: 1_799_990_000_000, late: false, role: null, invitedBy: null, onRoster: false, joined: true }));
    const w = (phone: string, i: number) => ({ seat: i + 1, name: "P" + i, phone, role: null, callNo: 5, atMs: 1_799_990_500_000, verified: true, given: null });
    const t = text(layoutReport(base({ people, prizes: [{ round: 1, label: "Full house", text: "Full house", winners: nums.map(w) }] as any, lucky: [{ label: "Lucky", winners: nums.map(w) }] as any })));
    for (const n of nums) { expect(t.split(n).length - 1).toBeGreaterThanOrEqual(3); expect(t).not.toContain(n.slice(0, 11) + ".."); }
  });
});
describe("report PDF carries the organizer's brand", () => {
  test("with a logo: the picture is embedded and the company name is in the band", () => {
    const px = { w: 2, h: 2, hex: "ff0000" + "00ff00" + "0000ff" + "ffffff" };
    const t = text(layoutReport(base({ brand: { name: "Acme Ltd" }, logoPix: px })));
    expect(t).toContain("/Subtype /Image"); expect(t).toContain("/Im1 Do"); expect(t).toContain("/XObject << /Im1"); expect(t).toContain("ff000000ff000000ffffffff"); expect(t).toContain("Acme Ltd | Corporate Tambola");
  });
  test("without a logo: no picture, and our own name stays in writing", () => {
    const t = text(layoutReport(base()));
    expect(t).not.toContain("/Subtype /Image"); expect(t).toContain("(Corporate Tambola)");
  });
  test("our own logo and the organizer's logo are both embedded (two pictures), ours alone is one", () => {
    const ours = { w: 1, h: 2, hex: "112233" + "445566" }, theirs = { w: 2, h: 1, hex: "aabbcc" + "ddeeff" };
    const both = text(layoutReport(base({ ourLogoPix: ours, logoPix: theirs })));
    expect(both).toContain("/Im1 Do"); expect(both).toContain("/Im2 Do"); expect(both).toContain("/XObject << /Im1"); expect(both).toContain("/Im2 "); expect(both).toContain("112233445566"); expect(both).toContain("aabbccddeeff");
    const only = text(layoutReport(base({ ourLogoPix: ours })));
    expect(only).toContain("/Im1 Do"); expect(only).not.toContain("/Im2 Do");
  });
  test("a damaged logo (wrong number of pixels) is ignored, not embedded", () => {
    expect(text(layoutReport(base({ logoPix: { w: 4, h: 4, hex: "ff00ff" } })))).not.toContain("/Subtype /Image");
  });
});

// 1.6.8: the report page draws /logo-512.png on the PDF (small, on white). The PDF must carry the red Corporate Tambola badge, not any older picture.
describe("report PDF carries the new Corporate Tambola badge as our own logo", () => {
  const ours = () => { // what report.js does in the browser, here with the file itself: 32 x 32 samples of logo-512.png on white
    const p = readPng(new Uint8Array(readFileSync(new URL("../../web/public/logo-512.png", import.meta.url)))); let hex = "";
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const [r, g, b, a] = p.px(x * 16 + 8, y * 16 + 8); const f = (c: number) => Math.round((c * a + 255 * (255 - a)) / 255).toString(16).padStart(2, "0"); hex += f(r) + f(g) + f(b); }
    return { w: 32, h: 32, hex };
  };
  test("with our logo from the real file: one picture, and the badge red (e23e57) is in it; white corners from the rounded edge", () => {
    const px = ours(); expect(px.hex.slice(0, 6)).toBe("ffffff"); expect(px.hex).toContain("e23e57");
    const t = text(layoutReport(base({ ourLogoPix: px })));
    expect(t).toContain("/Subtype /Image"); expect(t).toContain("e23e57"); expect(t).toContain("(Corporate Tambola)");
  });
});
