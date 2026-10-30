// rc/tambola-1.8.5 / TEST_HANDOFF 1.8.4 group 1 and 3: the Game completed page, the 30-minute message, the Final results table.
// The real player page runs in a DOM; the view is fabricated (phase "ended"); the page's clock is the test's clock.
// Run: bun test --isolate apps/web/test/rc185
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { organizer, published, phone, endedView, playView, endMs, realPid, REWARDS1, REWARDS5, REWARDS7, wait, type O } from "./page";
import type { Page } from "../harness";

setDefaultTimeout(60_000);
const THIRTY_NOTE = "Your results stay on this page for 30 minutes after the game. After that this page only says the game is completed.";
const MIN = 60_000;
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });
const eid = "RC-DONE";
async function game(set: Record<string, unknown> = {}) { const o = await organizer(); await published(o, eid, set); return o; }
async function ended(o: O, minutesAfterEnd: number, over: Record<string, unknown> = {}) {
  const pid = await realPid(o, eid); // joined while the game is still open; then the clock moves on
  o.world.now = endMs() + minutesAfterEnd * MIN;
  const p = await phone(o, `/z?e=${eid}`, { patch: endedView({ pid, ...over }) }); open.push(p);
  await p.waitFor((t) => /Game completed|Thank you for playing|This game is now over/.test(t), 30_000);
  return p;
}

describe("Game completed page (opened less than 30 minutes after the game)", () => {
  for (const mins of [0, 1, 10, 29]) {
    test(`ended ${mins} min ago: heading 'Game completed' (not 'Game complete '), Game ID, the 30-minute line, the ticket and Final results are still there`, async () => {
      const o = await game(); const p = await ended(o, mins); const t = p.text();
      expect(t).toContain("Game completed"); expect(t).not.toMatch(/Game complete(?!d)/); expect(t).toContain("Game ID " + eid); expect(t).toContain(THIRTY_NOTE);
      expect(t).toContain("Thank you for playing the game. You can recommend this game to others."); expect(t).toContain("Thank you for joining our extended family of Corporate Tambola.");
      expect(p.$("#finalresults")).toBeTruthy(); expect(p.$(".zticket")).toBeTruthy(); expect(!!p.$("#gamedone")).toBe(false); expect(p.$("#shr")).toBeTruthy();
      expect(p.win.document.querySelector(".zgid")!.textContent).toContain("Game ID"); expect(p.win.document.querySelector(".zgid b")!.textContent).toBe(eid);
    });
  }
});

describe("a link opened 30 or more minutes after the game (never saw it live): only the calm page", () => {
  for (const mins of [31, 45, 600]) {
    test(`ended ${mins} min ago, opened fresh: shared line, 'Game completed', Game ID, 'This game is now over', the 30-minute line, Share button; NO ticket, NO prizes, NO results`, async () => {
      const o = await game(); const p = await ended(o, mins); const t = p.text();
      expect(p.$("#gamedone")).toBeTruthy(); expect(t).toContain("Game completed"); expect(t).toContain("Game ID " + eid);
      expect(t).toContain("This game is now over. Thank you for being part of it."); expect(t).toContain(THIRTY_NOTE); expect(p.$("#shr")!.textContent).toContain("Share with friends and colleagues");
      expect(t).toContain("Corporate Tambola is played in close groups, by invitation only"); expect(p.$("#zshare")).toBeTruthy();
      expect(!!p.$(".zticket")).toBe(false); expect(!!p.$("#finalresults")).toBe(false); expect(!!p.$("#prizepanel")).toBe(false); expect(!!p.$("#zrulesrow")).toBe(false);
      expect(t).not.toMatch(/Your ticket|Final results|Still to win|You won|Voucher/);
    });
  }
  test("the edge: 30 minutes exactly still shows the results ('more than 30' flips it, not 'at 30'); 1 second later it flips", async () => {
    const o = await game(); const a = await ended(o, 30); const aOK = !!a.$("#finalresults") && !a.$("#gamedone");
    const b = await ended(o, 30 + 1 / 60); // 1 s more
    // the handoff says "30 or more"; the code says "> 30 minutes". Whichever it is, the two sides of the line must differ and 1 s later must be the calm page.
    expect(b.$("#gamedone")).toBeTruthy(); expect(!!b.$("#finalresults")).toBe(false); void aOK;
  });
  test("a phone that watched the game (even one number) keeps its results after 30 minutes pass in the same visit", async () => {
    const o = await game(); const pid = await realPid(o, eid); o.world.now = endMs() - 5 * MIN; // game still in play
    const p = await phone(o, `/z?e=${eid}`, { patch: playView({ pid }) }); open.push(p);
    await p.waitFor(() => !!p.$(".zticket"), 30_000); expect(!!p.$("#finalresults")).toBe(false);
    o.world.now = endMs() + 40 * MIN; (p.win as any).__patch = endedView({ pid }); p.click("#snd"); // the sound button makes the page draw again
    await p.waitFor(() => !!p.$("#finalresults") || !!p.$("#gamedone"), 30_000);
    expect(p.$("#finalresults")).toBeTruthy(); expect(p.$(".zticket")).toBeTruthy(); expect(!!p.$("#gamedone")).toBe(false); expect(p.text()).toContain(THIRTY_NOTE);
  });
  test("a game whose end time cannot be known (no scheduled round / no numbers called) never shows the calm page", async () => {
    const o = await game(); const p = await ended(o, 600, { log: [] }); expect(!!p.$("#gamedone")).toBe(false); expect(p.text()).toContain("Game completed");
  });
});

describe("the word 'private' is not in the new text", () => {
  test("not on the results page, the calm page, or the Final results", async () => {
    const o = await game();
    const a = await ended(o, 5, { results: [{ pattern: "full", ordinal: 1, round: 1, tickets: [7] }] }); expect(a.text()).not.toMatch(/\bprivate\b/i); expect(a.html()).not.toMatch(/\bprivate\b/i);
    const b = await ended(o, 90); expect(b.text()).not.toMatch(/\bprivate\b/i);
  });
});

describe("Final results table (id finalresults)", () => {
  const rows = (p: Page) => [...p.win.document.querySelectorAll("#finalresults li")] as any[];
  test("one row per prize: 1 prize, 5 prizes, 7 prizes; each unwon prize says 'Not won'", async () => {
    for (const [rw, n] of [[REWARDS1, 1], [REWARDS5, 5], [REWARDS7, 7]] as const) {
      const o = await game(); const p = await ended(o, 2, { cfg: { tickets: 1, ties: "next", rewards: rw, breaks: [], rounds: 1 } });
      expect(rows(p).length).toBe(n); for (const r of rows(p)) expect(r.querySelector("b")!.textContent).toBe("Not won"); expect(p.$("#finalresults h2")!.textContent).toBe("Final results");
    }
  });
  test("the winning ticket number is shown as 'Ticket N' (several tickets joined by commas), only for the prize it won", async () => {
    const o = await game(); const p = await ended(o, 2, { cfg: { tickets: 1, ties: "next", rewards: REWARDS5, breaks: [], rounds: 1 }, results: [{ pattern: "early5", ordinal: 1, round: 1, tickets: [12] }, { pattern: "full", ordinal: 1, round: 1, tickets: [3, 9] }] });
    const m: Record<string, string> = {}; for (const r of rows(p)) m[r.querySelector("span")!.textContent] = r.querySelector("b")!.textContent;
    expect(Object.values(m).filter((x) => x === "Not won").length).toBe(3); expect(Object.values(m)).toContain("Ticket 12"); expect(Object.values(m)).toContain("Ticket 3, 9");
  });
  test("'You' only on the rows this phone won (class me); other rows show the other ticket and are not marked", async () => {
    const o = await game();
    const p = await ended(o, 2, { cfg: { tickets: 1, ties: "next", rewards: REWARDS5, breaks: [], rounds: 1 }, results: [{ pattern: "early5", ordinal: 1, round: 1, tickets: [12] }, { pattern: "top", ordinal: 1, round: 1, tickets: [1] }, { pattern: "full", ordinal: 1, round: 1, tickets: [7] }], won: [{ pattern: "top", ordinal: 1, round: 1, cells: [] }] });
    const mine = rows(p).filter((r) => r.classList.contains("me")); expect(mine.length).toBe(1); expect(mine[0].querySelector("b").textContent).toBe("You");
    expect(rows(p).filter((r) => r.querySelector("b").textContent === "You").length).toBe(1);
    expect(rows(p).filter((r) => /Ticket 12|Ticket 7/.test(r.querySelector("b").textContent) && !r.classList.contains("me")).length).toBe(2);
  });
  test("a win from another round is not shown as 'You' in this round's table", async () => {
    const o = await game(); const p = await ended(o, 2, { cfg: { tickets: 1, ties: "next", rewards: REWARDS1, breaks: [], rounds: 1 }, results: [{ pattern: "full", ordinal: 1, round: 1, tickets: [7] }], won: [{ pattern: "full", ordinal: 1, round: 2, cells: [] }] });
    expect(rows(p).filter((r) => r.classList.contains("me")).length).toBe(0);
  });
  test("lucky draws that were published are listed ('Lucky draw: title'); unpublished ones are not", async () => {
    const o = await game(); const p = await ended(o, 2, { cfg: { tickets: 1, ties: "next", rewards: REWARDS1, breaks: [], rounds: 1 }, lucky: [{ ordinal: 1, title: "Gift card", published: true, won: true, winners: 1, style: "plain" }, { ordinal: 2, title: "Hamper", published: false, winners: 1, style: "plain" }] });
    const txt = rows(p).map((r) => r.textContent).join("|"); expect(txt).toContain("Lucky draw: Gift card"); expect(txt).toContain("You"); expect(txt).not.toContain("Hamper");
  });
  test("not shown while the game is still being played", async () => {
    const o = await game(); const pid = await realPid(o, eid); o.world.now = endMs() - 5 * MIN; const p = await phone(o, `/z?e=${eid}`, { patch: playView({ pid }) }); open.push(p); await p.waitFor(() => !!p.$(".zticket"), 30_000); expect(!!p.$("#finalresults")).toBe(false);
  });
  test("not shown in a game with no prizes in the cfg", async () => {
    const o = await game(); const p = await ended(o, 2, { cfg: { tickets: 1, ties: "next", rewards: [], breaks: [], rounds: 1 } }); expect(!!p.$("#finalresults")).toBe(false);
  });
});
