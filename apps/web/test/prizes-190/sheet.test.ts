// R6: the prize sheet for the host at the end of the game (zc-flow-prizes.js): prize, winner numbers, each winner's share, organizer notes; amounts only here and in the console.
// FALSIFIED BY: tools/matrix/breaks/table.ts (P-series)
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { PRIZE_HOUSES } from "../../../../packages/beacon/src/config";

const PUB = join(import.meta.dir, "../../public");
const src = ["zc-flow-game.js", "pack/zc-flow.js", "prize-planner.js", "zc-flow-prizes.js"].map((f) => readFileSync(join(PUB, f), "utf8")).join("\n");
const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const prize = (id: string, amount: number, gift?: string) => ({ id, amount, ...(gift ? { gift } : {}) });
const won = (pattern: string, ordinal: number, seats: number[], who: Record<number, { empId?: string; name?: string; phone?: string }> = {}) => seats.map((seat) => ({ round: 1, pattern, ordinal, seat, ...(who[seat] || {}) }));

async function sheetFor(plan: any | null, prizes: any[], opts: { summaryFails?: boolean; prizesFail?: boolean } = {}) {
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" }); win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES };
  const urls: string[] = [];
  const f = async (u: string) => {
    urls.push(u);
    if (u.endsWith("/summary")) { if (opts.summaryFails) return { ok: false, status: 500, json: async () => ({}) }; return { ok: true, json: async () => ({ ...(plan ? { prizePlan: plan } : {}), tickets: 1 }) }; }
    if (u.endsWith("/prizes")) { if (opts.prizesFail) return { ok: false, status: 403, json: async () => ({ error: "no" }) }; return { ok: true, json: async () => ({ prizes }) }; }
    return { ok: true, json: async () => ({ ok: true }) };
  };
  new Function("window", "document", "location", "fetch", "confirm", "MutationObserver", src)(win, win.document, win.location, f, () => true, win.MutationObserver);
  win.ZFLOW.state.eid = "EABCDEF";
  const app = win.document.getElementById("app"); const d = win.document.createElement("div"); d.id = "zf-dashboard"; const c = win.document.createElement("div"); c.id = "zf-completed"; d.append(c); app.append(d);
  await wait(120);
  return { win, urls, rows: () => [...win.document.querySelectorAll("#zp-sheet-table tbody tr")].map((r: any) => [...r.querySelectorAll("td")].map((t: any) => t.textContent as string)), sheet: win.document.getElementById("zp-sheet") };
}

describe("the prize sheet", () => {
  const plan1 = { mode: "auto", currency: "INR", budget: 100000, count: 6, prizes: [prize("0:top:1", 15000), prize("0:mid:1", 15000), prize("0:bot:1", 15000), prize("0:corners:1", 10000), prize("0:full:1", 30000, "Smart watch"), prize("0:full:2", 15000)] };
  test("columns, one row per prize, winner ticket numbers, each winner's share, notes; 'Not won' for an unwon prize", async () => {
    const s = await sheetFor(plan1, [...won("top", 1, [3]), ...won("full", 1, [7, 9]), ...won("corners", 1, [4])]);
    expect(s.sheet).toBeTruthy(); expect([...s.win.document.querySelectorAll("#zp-sheet-table thead th")].map((h: any) => h.textContent)).toEqual(["Prize", "Winner (ticket, ID, name, mobile)", "Each winner's share", "Organizer notes"]);
    const r = s.rows(); expect(r.length).toBe(6);
    const by = Object.fromEntries(r.map((x) => [x[0], x]));
    expect(r[0][1]).toBe("Ticket 3"); expect(r[0][2]).toBe("₹ 15,000"); expect(r[0][3]).toBe("");
    const fh = r[4]; expect(fh[1]).toBe("Ticket 7; Ticket 9"); expect(fh[2]).toBe("₹ 15,000 each (shared by 2)"); expect(fh[3]).toBe("Smart watch");
    expect(r[5][1]).toBe("Not won (stays with you)"); expect(r[5][2]).toBe("–");
    expect(r[3][1]).toBe("Ticket 4"); expect(by).toBeTruthy();
  });
  test("the share is floored and the leftover stays with the organizer: 30,000 between 7 winners = 4,285 each; 3 winners of 10,000 = 3,333", async () => {
    const s = await sheetFor({ ...plan1, prizes: [prize("0:full:1", 30000), prize("0:corners:1", 10000)] }, [...won("full", 1, [1, 2, 3, 4, 5, 6, 7]), ...won("corners", 1, [8, 9, 10])]);
    expect(s.rows().map((x) => x[2])).toEqual(["₹ 4,285 each (shared by 7)", "₹ 3,333 each (shared by 3)"]);
  });
  test("a prize with more winners than rupees: share 0, still listed as shared", async () => {
    const s = await sheetFor({ ...plan1, prizes: [prize("0:top:1", 2)] }, won("top", 1, [1, 2, 3])); expect(s.rows()[0][2]).toBe("₹ 0 each (shared by 3)");
  });
  test("a winner is listed once even if the host's list holds the seat twice; seats are numbers as the host knows them", async () => {
    const s = await sheetFor({ ...plan1, prizes: [prize("0:top:1", 100)] }, [...won("top", 1, [5]), ...won("top", 1, [5])]); expect(s.rows()[0][1]).toBe("Ticket 5"); expect(s.rows()[0][2]).toBe("₹ 100");
  });
  test("2 tickets: Ticket 1 and Ticket 2 Line 1 are different rows with their own winners; Early 5 is Ticket 1; Super Bumper reads the full2 key", async () => {
    const plan2 = { mode: "auto", currency: "USD", budget: 1000, count: 5, prizes: [prize("1:top:1", 100), prize("2:top:1", 100), prize("1:early5:1", 50), prize("1:full:1", 80), prize("0:full2:1", 300, "Trip")] };
    const s = await sheetFor(plan2, [...won("top@1", 1, [2]), ...won("top@2", 1, [6, 8]), ...won("early5@1", 1, [3]), ...won("full2", 1, [9])]);
    const r = s.rows(); expect(r.map((x) => x[0])).toEqual(["Ticket 1: Line 1", "Ticket 2: Line 1", "Ticket 1: Early 5", "Ticket 1: Full House", "Super Bumper"]); // P-7 fixed: single-position prizes carry no "1st"
    expect(r.map((x) => x[1])).toEqual(["Ticket 2", "Ticket 6; Ticket 8", "Ticket 3", "Not won (stays with you)", "Ticket 9"]); expect(r[1][2]).toBe("$ 50 each (shared by 2)"); expect(r[4][3]).toBe("Trip"); expect(r[4][2]).toBe("$ 300");
  });
  test("a prize won in round 2 or by another key is not mixed in (the Ticket 1 row does not take Ticket 2's winner)", async () => {
    const plan2 = { mode: "auto", currency: "INR", budget: 200, count: 2, prizes: [prize("1:top:1", 100), prize("2:top:1", 100)] };
    const s = await sheetFor(plan2, won("top@2", 1, [4])); expect(s.rows().map((x) => x[1])).toEqual(["Not won (stays with you)", "Ticket 4"]);
  });
  test("no plan (an old game): no sheet; a failing summary or prizes answer does not break the page", async () => {
    expect((await sheetFor(null, [])).sheet).toBeNull(); expect((await sheetFor(plan1, [], { summaryFails: true })).sheet).toBeNull();
    const s = await sheetFor(plan1, [], { prizesFail: true }); expect(s.sheet).toBeTruthy(); expect(s.rows().every((x) => x[1] === "Not won (stays with you)")).toBe(true);
  });
  test("the sheet is built once, asks the organizer routes only, has a Print button and the 'For you only' note", async () => {
    const s = await sheetFor(plan1, []); const doc = s.win.document;
    expect(doc.querySelectorAll("#zp-sheet").length).toBe(1); expect(doc.querySelector("#zp-print").textContent).toBe("Print the prize sheet");
    expect(doc.querySelector("#zp-sheet .zf-small").textContent).toBe("For you only. Corporate Tambola shows and records the prizes; it never pays anybody. You give the prizes in your own way and time.");
    expect(s.urls.filter((u) => u.endsWith("/summary")).length).toBe(1); expect(s.urls.filter((u) => u.endsWith("/prizes")).length).toBe(1);
    expect(s.urls.every((u) => u.startsWith("/api/z/EABCDEF/"))).toBe(true);
  });
  test("P-7 (fixed): labels on the sheet match the labels in the console table: the count of positions comes from the plan ('Line 1', 'Corners', 'Super Bumper' for one position; '1st Full House' for several)", async () => {
    const P = (await import("node:module")).createRequire(import.meta.url)("../../public/prize-planner.js");
    for (const [t, c] of [[1, 6], [1, 10], [2, 14], [2, 20]] as const) {
      const rows = P.plan(t, c, 100000).prizes; const s = await sheetFor({ mode: "auto", currency: "INR", budget: 100000, count: c, prizes: rows.map((r: any) => prize(r.id, r.amount)) }, []);
      expect([t, c, s.rows().map((x) => x[0])]).toEqual([t, c, rows.map((r: any) => r.label)]);
    }
  });

  test("P-7 (fixed): a plan where a prize has 2 positions says '1st'/'2nd'; the same prize with only the 1st in the plan says no ordinal", async () => {
    const two = await sheetFor({ ...plan1, prizes: [prize("0:full:1", 300), prize("0:full:2", 100), prize("0:corners:1", 50), prize("0:full2:1", 9)] }, []);
    expect(two.rows().map((x) => x[0])).toEqual(["1st Full House", "2nd Full House", "Corners", "Super Bumper"]);
    const one = await sheetFor({ ...plan1, prizes: [prize("0:full:1", 300), prize("0:corners:1", 50)] }, []); expect(one.rows().map((x) => x[0])).toEqual(["Full House", "Corners"]);
  });
});

// R6 winner column (fix round 1): "Ticket N - <Employee ID or Email ID>, <name>, <mobile>", only the parts that exist. The data comes from the organizer-only GET /api/z/<id>/prizes; the public pages never get it (edge/test/prizes-190/winner-column.test.ts).
// NOTE: the product joins the parts with an EN DASH (" – "), the task text writes a hyphen (" - "). Pinned as the product has it.
describe("the prize sheet: the winner column (R6)", () => {
  const plan = { mode: "auto", currency: "INR", budget: 1000, count: 4, prizes: [prize("0:top:1", 100), prize("0:mid:1", 100), prize("0:full:1", 300), prize("0:full:2", 200)] };
  const cell = async (w: Record<number, any>, seats = [3]) => (await sheetFor(plan, won("top", 1, seats, w))).rows()[0][1];
  test("all parts: ticket, Employee ID, name, mobile", async () => { expect(await cell({ 3: { empId: "E1001", name: "Asha Rao", phone: "9876543210" } })).toBe("Ticket 3 – E1001, Asha Rao, 9876543210"); });
  test("an Email ID game: the Email ID takes the place of the Employee ID (same field)", async () => { expect(await cell({ 3: { empId: "asha@acme.com", name: "Asha Rao", phone: "9876543210" } })).toBe("Ticket 3 – asha@acme.com, Asha Rao, 9876543210"); });
  test("only the parts that exist are shown: no ID; no name; no mobile; only a name; nothing at all", async () => {
    expect(await cell({ 3: { name: "Asha Rao", phone: "9876543210" } })).toBe("Ticket 3 – Asha Rao, 9876543210");
    expect(await cell({ 3: { empId: "E1001", phone: "9876543210" } })).toBe("Ticket 3 – E1001, 9876543210");
    expect(await cell({ 3: { empId: "E1001", name: "Asha Rao" } })).toBe("Ticket 3 – E1001, Asha Rao");
    expect(await cell({ 3: { name: "Asha Rao" } })).toBe("Ticket 3 – Asha Rao");
    expect(await cell({ 3: {} })).toBe("Ticket 3");
    expect(await cell({ 3: { empId: "", name: "  ", phone: "" } })).toBe("Ticket 3");
  });
  test("several winners of one prize: one 'Ticket N – ...' per winner, in the order given, separated by '; ' and each with its own person", async () => {
    const s = await sheetFor(plan, won("full", 1, [7, 9, 11], { 7: { empId: "E7", name: "Ravi", phone: "111" }, 9: { name: "Meena" }, 11: { empId: "E11" } }));
    expect(s.rows()[2][1]).toBe("Ticket 7 – E7, Ravi, 111; Ticket 9 – Meena; Ticket 11 – E11"); expect(s.rows()[2][2]).toBe("₹ 100 each (shared by 3)");
  });
  test("the person belongs to the right prize: 1st and 2nd Full House and a per-ticket prize each show their own winner's details", async () => {
    const s = await sheetFor({ mode: "auto", currency: "INR", budget: 400, count: 3, prizes: [prize("1:top:1", 100), prize("2:top:1", 100), prize("1:full:1", 200)] }, [...won("top@1", 1, [2], { 2: { empId: "A", name: "Ann" } }), ...won("top@2", 1, [5], { 5: { empId: "B", name: "Bob" } }), ...won("full@1", 1, [6], { 6: { empId: "C", name: "Cy" } })]);
    expect(s.rows().map((x) => x[1])).toEqual(["Ticket 2 – A, Ann", "Ticket 5 – B, Bob", "Ticket 6 – C, Cy"]);
  });
  test("a seat listed twice (two rows of the same winner) shows the person once; the details come from the row of that seat", async () => {
    const s = await sheetFor(plan, [...won("top", 1, [3], { 3: { empId: "E1", name: "Asha" } }), ...won("top", 1, [3], { 3: { empId: "E1", name: "Asha" } })]); expect(s.rows()[0][1]).toBe("Ticket 3 – E1, Asha"); expect(s.rows()[0][2]).toBe("₹ 100");
  });
  test("text is placed as text, not as HTML (a name with markup cannot add elements to the sheet)", async () => {
    const s = await sheetFor(plan, won("top", 1, [3], { 3: { name: "<img src=x onerror=alert(1)>", empId: "<b>E</b>" } })); const t = s.win.document.querySelector("#zp-sheet-table"); expect(t.querySelector("img")).toBeNull(); expect(t.querySelector("b")).toBeNull(); expect(s.rows()[0][1]).toContain("<img src=x onerror=alert(1)>");
  });
  test("an unwon prize still says 'Not won (stays with you)' and shows no person", async () => { const s = await sheetFor(plan, won("top", 1, [3], { 3: { empId: "E1", name: "Asha" } })); expect(s.rows()[1][1]).toBe("Not won (stays with you)"); expect(s.rows()[1][2]).toBe("–"); });
  test("the sheet reads only the organizer-only /prizes route and /summary (never /info or a results route)", async () => {
    const s = await sheetFor(plan, won("top", 1, [3], { 3: { empId: "E1" } })); expect(s.urls.sort()).toEqual(["/api/z/EABCDEF/prizes", "/api/z/EABCDEF/summary"]);
  });
});
