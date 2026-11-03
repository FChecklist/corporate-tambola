// R5: what players see. The rules paragraph 'About the prizes', the winner popup sentences, 'shared with N other player(s)', per-ticket prize names, and NO amount, budget, currency or gift name anywhere on the player pages.
// The strings are pinned as the product sends them (apps/web/public/z.js); TEST_HANDOFF.md says 'frozen text' without quoting it and handover 370 is not in the repo, so the wording itself is the coder's.
// FALSIFIED BY: tools/matrix/breaks/table.ts (P-series, W-series)
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { organizer, published, phone, playView, endedView, endMs, realPid, grid } from "../rc185/page";
import type { Page } from "../harness";
import { lines2, plan2 } from "../../../edge/test/prizes-190/harness";

setDefaultTimeout(60_000);
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });
export const ABOUT = "About the prizes. Every prize in this game is chosen and given by your organizer, as a gift of thanks to the team. It may come as cash, a voucher or a gift, entirely as your organizer prefers. Corporate Tambola only runs the game and keeps the record. It plays no part in choosing, valuing or giving the prizes.";
const SECRET = /7654321|1111111|1222222|1333333|1444444|1555555|1020000|SECRETGIFT|₹|\bRs\.?\s?\d|\bINR\b|\bUSD\b|budget|prizePlan/i;
const eid = "PZ-PLAY";
const cfg2 = { tickets: 2, ties: "share", rewards: lines2, breaks: [], rounds: 1 };
const win = (pattern: string, ordinal = 1, shared = 0) => ({ round: 1, pattern, ordinal, text: "", cells: [1, 2, 3, 4, 5], idx: 5, shared });

/** A published game made at 1 Oct (no check-in screen in the way). A new game would carry the plan; the settings route refuses a plan on a game this old, so the plan and the per-ticket lines are written straight into the stored game (what a new game holds). */
async function seeded(o: any, id: string) {
  await published(o, id); const row = o.world.raw.query("SELECT config FROM engagement WHERE id=?").get(id) as any; const c = JSON.parse(row.config);
  c.prizePlan = plan2(); c.rewards = lines2; c.ties = "share"; o.world.raw.prepare("UPDATE engagement SET config=?, tickets=2 WHERE id=?").run(JSON.stringify(c), id);
}
async function inGame(over: Record<string, unknown> = {}, ended = false, plan = true) {
  const o = await organizer(); if (plan) await seeded(o, eid); else await published(o, eid);
  const pid = await realPid(o, eid); o.world.now = endMs() - 5 * 60_000;
  const p = await phone(o, `/z?e=${eid}`, { patch: (ended ? endedView : playView)({ pid, cfg: cfg2, tickets: [grid(1), grid(40)], ...over }) }); open.push(p);
  await p.waitFor(() => !!p.$(".zticket"), 30_000); return { p, o, pid };
}

describe("the rules paragraph 'About the prizes'", () => {
  test("during play the Rules row holds the frozen paragraph word for word, after the three rules, inside the collapsed row", async () => {
    const { p } = await inGame(); const row = p.$("#zrulesrow") as any; expect(row.hasAttribute("open")).toBe(false);
    const para = row.querySelector(".zprizes"); expect(para).toBeTruthy(); expect(para.textContent.replace(/\s+/g, " ").trim()).toBe(ABOUT);
    expect(row.querySelector("#zrules").textContent).not.toContain("About the prizes"); expect(row.querySelectorAll(".zprizes").length).toBe(1);
    expect(row.innerHTML.indexOf("zrules")).toBeLessThan(row.innerHTML.indexOf("zprizes"));
  });
  test("it is there for a game without a plan too (old games), and gone after the game", async () => {
    const { p } = await inGame({}, false, false); expect((p.$("#zrulesrow .zprizes") as any).textContent).toContain("About the prizes.");
    const e = await inGame({}, true); expect(!!e.p.$("#zrulesrow")).toBe(false); expect(e.p.text()).not.toContain("Every prize in this game is chosen and given by your organizer");
  });
  test("the paragraph carries no amount, currency or number", async () => { expect(ABOUT).not.toMatch(/\d|₹|\$|€|£|rupee|dollar/i); });
});

describe("the winner popup", () => {
  const popup = async (wins: unknown[]) => { const { p } = await inGame({ won: wins }); await p.waitFor(() => !!p.$("#hurray"), 20_000); return (p.$("#hurray") as any).textContent as string; };
  test("one prize, not shared: 'You won <prize>. Your organizer will give you your prize.' and no 'shared' sentence", async () => {
    const t = await popup([win("top@1")]);
    expect(t).toContain("You won Ticket 1: Top line. Your organizer will give you your prize."); expect(t).not.toMatch(/shared with/);
  });
  test("P-9 (fixed): the line is said once: no 'Congratulations, you won <prize>' above 'You won <prize>. Your organizer ...'; the card is Hurray!, the prize name once in a sentence, the button", async () => {
    const t = await popup([win("top@1")]); expect(t).not.toContain("Congratulations"); expect((t.match(/You won/g) || []).length).toBe(1); expect((t.match(/Top line/g) || []).length).toBe(1);
    expect(t.startsWith("Hurray!")).toBe(true); expect(t.endsWith("Wonderful")).toBe(true);
    const two = await popup([win("top@1"), win("early5@1")]); expect((two.match(/You won/g) || []).length).toBe(1);
  });
  test("shared with 1: 'is shared with 1 other player.' (singular); with 3: '3 other players.'", async () => {
    expect(await popup([win("top@2", 1, 1)])).toContain("Ticket 2: Top line is shared with 1 other player.");
    const t = await popup([win("top@2", 1, 3)]); expect(t).toContain("Ticket 2: Top line is shared with 3 other players."); expect(t).not.toContain("3 other player.");
  });
  test("two prizes at once: both named in the sentence, the shared sentence only for the shared one", async () => {
    const t = await popup([win("top@1", 1, 0), win("early5@1", 1, 2)]);
    expect(t).toContain("You won Ticket 1: Top line, Ticket 1: Early Five. Your organizer will give you your prize."); expect(t).toContain("Ticket 1: Early Five is shared with 2 other players."); expect(t).not.toContain("Ticket 1: Top line is shared");
  });
  test("a plain prize of an old game reads the same way", async () => {
    const { p } = await inGame({ won: [{ ...win("full"), ordinal: 1 }], cfg: { tickets: 1, ties: "next", rewards: [{ pattern: "full", scope: "ticket", ordinal: 1, text: "" }], breaks: [], rounds: 1 }, tickets: [grid(1)] });
    await p.waitFor(() => !!p.$("#hurray"), 20_000); expect((p.$("#hurray") as any).textContent).toContain("You won Full house. Your organizer will give you your prize.");
  });
  test("the popup never shows an amount, currency or gift name, even when the organizer saved them", async () => {
    const t = await popup([win("top@1", 1, 1), win("full2")]); expect(t).not.toMatch(SECRET); expect(t).not.toMatch(/\d{3,}/);
  });
});

describe("prize names on the player's page: per-ticket prizes are separate, names only", () => {
  test("Ticket 1 and Ticket 2 prizes are listed as different rows; Early Five only for Ticket 1; Super Bumper by its name", async () => {
    const { p } = await inGame(); const t = (p.$("#prizepanel") as any).textContent as string;
    for (const n of ["Ticket 1: Top Line", "Ticket 2: Top Line", "Ticket 1: Early Five", "Ticket 1: Full House", "Ticket 2: Full House", "Super Bumper"]) expect([n, t.includes(n)]).toEqual([n, true]);
    expect(t).not.toContain("Ticket 2: Early Five");
    expect([...(p.win.document.querySelectorAll("#prizepanel li") as any)].length).toBe(6);
  });
});

describe("no amount, budget, currency or gift name on any player page (the plan holds ₹ and gifts)", () => {
  test("play page, finished page and the join page of a game that has a saved plan", async () => {
    const play = await inGame(); for (const x of [play.p.text(), play.p.html()]) expect(x).not.toMatch(SECRET);
    const end = await inGame({ results: [{ pattern: "top@1", ordinal: 1, idx: 5, count: 1, round: 1, tickets: [1] }], won: [win("top@1")] }, true); for (const x of [end.p.text(), end.p.html()]) expect(x).not.toMatch(SECRET);
    const o = await organizer(); await seeded(o, "PZ-JOIN");
    const j = await phone(o, `/z?e=PZ-JOIN`, {}); open.push(j); await j.waitFor((x) => /Join the game|Your ticket|setting up|You are in/.test(x), 30_000);
    for (const x of [j.text(), j.html()]) expect(x).not.toMatch(SECRET);
  });
});

describe("prize names with several winner positions in a 2-ticket game", () => {
  test("P-9 (fixed): a per-ticket prize with 2 positions reads 'Ticket 1: 1st Full house' (the planner's own wording), not '1st Ticket 1: Full house'", async () => {
    const lines = [1, 2].map((o) => ({ pattern: "full", scope: "ticket_1", ordinal: o, text: "" }));
    const { p } = await inGame({ cfg: { tickets: 2, ties: "share", rewards: lines, breaks: [], rounds: 1 }, won: [win("full@1", 1, 0)] });
    await p.waitFor(() => !!p.$("#hurray"), 20_000); const t = (p.$("#hurray") as any).textContent as string;
    expect(t).toContain("You won Ticket 1: 1st Full house.");
  });
  test("P-9 (fixed): the 2nd position of the same prize reads 'Ticket 1: 2nd Full house', and the wrong order is nowhere", async () => {
    const lines = [1, 2].map((o) => ({ pattern: "full", scope: "ticket_1", ordinal: o, text: "" }));
    const { p } = await inGame({ cfg: { tickets: 2, ties: "share", rewards: lines, breaks: [], rounds: 1 }, won: [win("full@1", 2, 0)] });
    await p.waitFor(() => !!p.$("#hurray"), 20_000); const t = (p.$("#hurray") as any).textContent as string;
    expect(t).toContain("You won Ticket 1: 2nd Full house."); expect(t).not.toMatch(/(1st|2nd) Ticket/);
  });
});
