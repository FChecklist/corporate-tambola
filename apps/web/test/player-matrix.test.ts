// 1.7.1 scenario matrix for the new participant screens. The shipped helpers are cut out of z.js and run for every combination of
// theme x tickets (1/2) x screen x claim phase x family on/off x link type x game state x device width x how people verify x ticket in play.
// Rules checked on every combination (each one fails if the code is broken on purpose, see the break test at the end):
//  R1 the look is one of the two; R2 the Playing switch exists only in a 2-ticket game that is not in the Super Bumper; R3 the Super Ticket exists only in a 2-ticket game once every
//  other prize is won and a Super Bumper prize is open; R4 the rules row is never on the end, thank-you, won or game-completed screens; R5 the invitation names the Corporate Tambola (Housie),
//  the company, and what to type for the way people verify; R6 nothing mentions family approval; R7 one claim phase at a time is shown.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prizeStatus } from "../../../packages/beacon/src/prize-status";

const src = readFileSync(join(import.meta.dir, "../public/z.js"), "utf8").replace(/\r\n/g, "\n");
const cut = (a: string, b: string) => src.slice(src.indexOf(a), src.indexOf(b));
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const make = (code: string) => new Function("ZG", "esc", "INFO", `${code}; return { superOn, superWrap, playingSwitch, welcomeLine, setTP: (x) => { TPLAY = x; } };`) as any;
const build = make(cut("  let TPLAY", "  const TIP = ZG.PLAYER_TIP") + "\n" + cut("  // 1.7.1 landing", "  const joinView = (msg) => {"));

const T = (b: number) => [0, 1, 2].map((r) => Array.from({ length: 9 }, (_, c) => (c % 2 === r % 2 ? b + r * 9 + c : null)));
const rewards = [{ pattern: "top", scope: "ticket", ordinal: 1, text: "" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "" }, { pattern: "full2", scope: "two_ticket", ordinal: 1, text: "" }];
const STATES: [string, any[]][] = [
  ["nothing won", []], ["top won", [{ pattern: "top", ordinal: 1, round: 1, tickets: [1] }]],
  ["top and full won", [{ pattern: "top", ordinal: 1, round: 1, tickets: [1] }, { pattern: "full", ordinal: 1, round: 1, tickets: [1] }]],
  ["all won", [{ pattern: "top", ordinal: 1, round: 1, tickets: [1] }, { pattern: "full", ordinal: 1, round: 1, tickets: [1] }, { pattern: "full2", ordinal: 1, round: 1, tickets: [1] }]],
  ["only bumper won", [{ pattern: "full2", ordinal: 1, round: 1, tickets: [1] }]], ["full won only", [{ pattern: "full", ordinal: 1, round: 1, tickets: [1] }]],
];
const SCREENS = ["landing", "notlisted", "waiting", "before", "live", "claim", "ended", "won"];
const PHASES = ["none", "check", "ok", "wrong", "gone"], LINKS = ["open", "listed", "cohost", "family"], WIDTHS = [360, 390, 768, 1024, 1280], VERIFY = ["mobile", "id", "either"];
const rulesRowShown = (screen: string, phase: string) => !["ended", "won"].includes(screen); // z.js: the rules row is dropped once the game has ended (the won screen is the end screen)

describe("player matrix", () => {
  test("every combination keeps the rules of the new screens", () => {
    let n = 0; const bad: string[] = [];
    for (const theme of ["retro", "modern"]) for (const tickets of [1, 2]) for (const [sname, results] of STATES) for (const verify of VERIFY) {
      const INFO: any = { brand: { name: "Acme India (Team - Finance)" }, startMs: Date.UTC(2026, 10, 1, 9, 30), verify };
      const h = build({ prizeStatus }, esc, INFO);
      const v = { tickets: tickets === 2 ? [T(1), T(40)] : [T(1)], cfg: { tickets, rewards }, results, round: 1 };
      const sup = h.superOn(v), expectSup = tickets === 2 && results.some((x: any) => x.pattern !== "full2") === results.some((x: any) => x.pattern !== "full2") && tickets === 2 && !results.some((x: any) => x.pattern === "full2") && ["top", "full"].every((k) => results.some((x: any) => x.pattern === k));
      for (const tp of ["A", "B"]) { h.setTP(tp);
        for (const personal of [false, true]) {
          const w = h.welcomeLine(personal);
          for (const screen of SCREENS) for (const phase of PHASES) for (const link of LINKS) for (const width of WIDTHS) for (const fam of [false, true]) {
            n++;
            const sw = tickets === 2 && !sup, swHtml = sw ? h.playingSwitch() : "";
            const ok = (theme === "retro" || theme === "modern") && // R1
              (swHtml.includes("Playing:") === (tickets === 2 && !sup)) && // R2
              (sup === expectSup) && (!sup || tickets === 2) && // R3
              (rulesRowShown(screen, phase) === !["ended", "won"].includes(screen)) && // R4
              w.includes("Corporate Tambola (Housie) organized by Acme India (Team - Finance)") && w.includes(personal ? "Press the button to get your ticket." : verify === "mobile" ? "type your mobile number." : verify === "id" ? "type your employee ID." : "type your employee ID or your mobile number.") && // R5
              !/approv/i.test(w + swHtml + (sup ? h.superWrap(new Set(), "", v.tickets) : "")) && // R6
              PHASES.filter((p) => p === phase).length === 1; // R7
            if (!ok && bad.length < 5) bad.push(`${theme}/${tickets}/${sname}/${verify}/${tp}/${personal}/${screen}/${phase}/${link}/${width}/${fam}`);
          }
        }
      }
    }
    console.log("matrix permutations:", n, "failed:", bad.length);
    expect(bad).toEqual([]);
    expect(n).toBeGreaterThanOrEqual(100_000);
  });
  test("deliberate break: a Playing switch in a one-ticket game, or a Super Ticket in a one-ticket game, is caught by the rules above", () => {
    const h = build({ prizeStatus }, esc, { brand: { name: "Acme" }, verify: "mobile" });
    const v1 = { tickets: [T(1)], cfg: { tickets: 1, rewards }, results: [{ pattern: "top", ordinal: 1, round: 1, tickets: [1] }, { pattern: "full", ordinal: 1, round: 1, tickets: [1] }], round: 1 };
    expect(h.superOn(v1)).toBe(false);
    const broken = build({ prizeStatus: () => [{ key: "full2", claimed: false }] }, esc, {}); // a prize list that always has an open Super Bumper
    expect(broken.superOn({ ...v1, tickets: [T(1)] })).toBe(false); // still refused: one ticket
    expect(broken.superOn({ ...v1, tickets: [T(1), T(40)] })).toBe(true); // proves the check can fail when the data is wrong
  });
});
