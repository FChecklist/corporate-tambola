// rc/tambola-1.8.5 / TEST_HANDOFF 1.8.4 group 3: the Rules row during play and the prize rows on the game screen.
// Note (handoff): the flat prize rows with a grey CLAIM are NOT built yet (restyle open); these tests pin the CURRENT rows (open row with the 'To win' tag, done row crossed out with 'Won by Ticket N', 'You').
// Run: bun test --isolate apps/web/test/rc185
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { organizer, published, phone, playView, endedView, endMs, realPid, REWARDS5 } from "./page";
import type { Page } from "../harness";

setDefaultTimeout(60_000);
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });
const eid = "RC-PLAY";
async function inPlay(over: Record<string, unknown> = {}, ended = false) {
  const o = await organizer(); await published(o, eid); const pid = await realPid(o, eid); o.world.now = endMs() - 5 * 60_000;
  const p = await phone(o, `/z?e=${eid}`, { patch: (ended ? endedView : playView)({ pid, cfg: { tickets: 1, ties: "next", rewards: REWARDS5, breaks: [], rounds: 1 }, ...over }) }); open.push(p);
  await p.waitFor(() => !!p.$(".zticket"), 30_000); return p;
}
const rows = (p: Page) => [...p.win.document.querySelectorAll("#prizepanel li")] as any[];

describe("Rules row (details #zrulesrow, list #zrules)", () => {
  test("in play: one collapsed 'Rules' row holds the three rules; the list keeps id zrules", async () => {
    const p = await inPlay(); const d = p.$("#zrulesrow") as any; expect(d).toBeTruthy(); expect(d.tagName).toBe("DETAILS"); expect(d.hasAttribute("open")).toBe(false);
    expect(d.querySelector("summary")!.textContent).toBe("Rules"); const l = p.$("#zrules") as any; expect(l).toBeTruthy(); expect(l.tagName).toBe("OL"); expect(l.querySelectorAll("li").length).toBe(3);
    const t = l.textContent; expect(t).toContain("This game works like the real one."); expect(t).toContain("tap it on your ticket to cross it out"); expect(t).toContain("press Claim before the next number is called");
    expect(d.contains(l)).toBe(true); expect(p.win.document.querySelectorAll("#zrulesrow").length).toBe(1); expect(p.win.document.querySelectorAll("#zrules").length).toBe(1);
  });
  test("the rules sit at the end of the page (after the ticket and the prizes)", async () => { const p = await inPlay(); const h = p.html(); expect(h.indexOf('id="zrulesrow"')).toBeGreaterThan(h.indexOf('class="zcard ztk')); expect(h.indexOf('id="zrulesrow"')).toBeGreaterThan(h.indexOf('id="prizepanel"')); });
  test("after the game: no Rules row, no zrules list", async () => { const p = await inPlay({}, true); expect(p.$("#zrulesrow")).toBeNull(); expect(p.$("#zrules")).toBeNull(); expect(p.$("#finalresults")).toBeTruthy(); });
});

describe("prize rows on the game screen", () => {
  test("every prize is a row; open ones carry the 'To win' tag and the heading counts them", async () => {
    const p = await inPlay(); expect(rows(p).length).toBe(5); expect(rows(p).every((r) => r.classList.contains("open"))).toBe(true);
    for (const r of rows(p)) expect(r.querySelector(".ztag")!.textContent).toBe("To win"); expect(p.$("#prizepanel h2")!.textContent).toBe("Prizes still to win · 5");
    expect(rows(p).map((r) => r.querySelector("b").textContent)).toEqual(["Early Five", "Top Line", "Middle Line", "Bottom Line", "Full House"]);
  });
  test("a won prize becomes a done row, crossed out, 'Won by Ticket N', and moves below the open ones", async () => {
    const p = await inPlay({ results: [{ pattern: "top", ordinal: 1, round: 1, tickets: [12] }] }); const r = rows(p);
    expect(r.length).toBe(5); expect(r.filter((x) => x.classList.contains("done")).length).toBe(1); expect(r[4].classList.contains("done")).toBe(true); expect(r[4].querySelector("s")).toBeTruthy(); expect(r[4].textContent).toContain("Won by Ticket 12");
    expect(p.$("#prizepanel h2")!.textContent).toBe("Prizes still to win · 4"); expect(r[4].querySelector(".zme")).toBeNull();
  });
  test("'You' appears only on the done row this phone won", async () => {
    const p = await inPlay({ results: [{ pattern: "top", ordinal: 1, round: 1, tickets: [12] }, { pattern: "bot", ordinal: 1, round: 1, tickets: [1] }], won: [{ pattern: "bot", ordinal: 1, round: 1, cells: [] }] });
    const me = p.win.document.querySelectorAll("#prizepanel .zme"); expect(me.length).toBe(1); expect((me[0] as any).parentElement.textContent).toContain("Bottom Line");
  });
  test("all prizes won: the heading says 'all won' and there is no 'To win' tag", async () => {
    const results = REWARDS5.map((r) => ({ pattern: r.pattern, ordinal: 1, round: 1, tickets: [5] })); const p = await inPlay({ results });
    expect(p.$("#prizepanel h2")!.textContent).toBe("Prizes · all won"); expect(p.win.document.querySelectorAll("#prizepanel .ztag").length).toBe(0); expect(rows(p).every((r) => r.classList.contains("done"))).toBe(true);
  });
  test("a prize with the organizer's own text shows it after the name", async () => {
    const p = await inPlay({ cfg: { tickets: 1, ties: "next", rewards: [{ pattern: "full", scope: "ticket", ordinal: 1, text: "Voucher 5000" }], breaks: [], rounds: 1 } }); expect(rows(p)[0].querySelector("b").parentElement.textContent).toContain(": Voucher 5000");
  });
});
