// V2 item 4: the organizer downloads the game's results, winners, tickets and payments, by key and by screen. The 24-hour deletion promise is kept: names are in the file only while the game holds them,
// never for an AI-labelled call, and never after the deletion.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HOUR, T, W, call, j, keyH, paidGame, reset, restore } from "./param-harness";
import { erasePersonal } from "../src/lifecycle";
import { sealPii } from "../src/pii";
import { gameKey, guests, labelHost, winner } from "./v2-helpers";

beforeEach(() => reset());
afterEach(restore);

async function played() {
  const g = await paidGame(); const seats = await guests(g.id, 3);
  winner(g.id, "top", 1, seats[0]!); winner(g.id, "full", 1, seats[1]!);
  return { g, seats };
}
const get = (id: string, key: string, qs = "", extra: Record<string, string> = {}, now = T) => call("GET", `/api/z/${id}/v2/export${qs}`, undefined, { ...keyH(key), ...extra }, now);

describe("what the file holds", () => {
  test("everything by default: game, results, winners with names, tickets with names, payments with the payee", async () => {
    const { g, seats } = await played(); const r = await get(g.id, g.key); const b = await j(r);
    expect(r.status).toBe(200); expect(r.headers.get("content-disposition")).toMatch(/attachment; filename="tambola-.*-all\.json"/);
    expect(b.game.id).toBe(g.id); expect(b.personalDataIncluded).toBe(true); expect(b.personalDataDeleted).toBe(false);
    expect(b.results.map((x: any) => x.prize).sort()).toEqual(["Full House", "Top Line"]);
    expect(b.winners.find((w: any) => w.prize === "Top Line")).toMatchObject({ ticket: seats[0], name: "Guest 1" });
    expect(b.tickets.length).toBe(3); expect(b.tickets[0]).toMatchObject({ ticket: seats[0], name: "Guest 1" });
    expect(b.payments.length).toBe(1); expect(b.payments[0].payee).toBe("IT SERVICES BY RAJAT AGARWAL via Razorpay");
  });
  test("mobile numbers and e-mails are never in the file", async () => {
    const { g } = await played(); const t = await (await get(g.id, g.key)).text();
    expect(t).not.toMatch(/9100000\d{2}/); expect(t).not.toMatch(/"phone"|"mobile"/); expect(t).not.toContain("boss@acme.com"); expect(t).toContain("***@acme.com"); // only the payer's masked address, as on the receipt
  });
  test("one part at a time, as JSON or as a spreadsheet; a spreadsheet of everything is refused kindly", async () => {
    const { g } = await played();
    const w = await j(await get(g.id, g.key, "?part=winners")); expect(w.winners.length).toBe(2); expect(w.results).toBeUndefined(); expect(w.tickets).toBeUndefined();
    const csv = await get(g.id, g.key, "?part=tickets&format=csv"); expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    const lines = (await csv.text()).trim().split("\n"); expect(lines[0]).toContain("ticket"); expect(lines.length).toBe(4);
    const pay = (await (await get(g.id, g.key, "?part=payments&format=csv")).text()).split("\n"); expect(pay[0]).toContain("payee"); expect(pay[1]).toContain("IT SERVICES BY RAJAT AGARWAL via Razorpay");
    const all = await get(g.id, g.key, "?format=csv"); expect(all.status).toBe(400); expect((await j(all)).code).toBe("csv-one-part");
    expect((await get(g.id, g.key, "?part=secrets")).status).toBe(400); expect((await get(g.id, g.key, "?format=xml")).status).toBe(400);
  });
  test("a typed name that looks like a spreadsheet formula is made harmless", async () => {
    const { g, seats } = await played();
    const sealed = await sealPii(W.env as any, { phone: "9100000001", name: "=HYPERLINK(\"http://evil\",\"x\")", empId: null } as any);
    W.raw.prepare("UPDATE participant SET pii=? WHERE eid=? AND pid=(SELECT pid FROM seat WHERE eid=? AND seq=?)").run(sealed, g.id, g.id, seats[0]);
    const t = await (await get(g.id, g.key, "?part=winners&format=csv")).text();
    expect(t).not.toMatch(/(^|,)"?=HYPERLINK/m); expect(t).toContain("'=HYPERLINK");
  });
});

describe("who may download", () => {
  test("the organizer and their game key; not a Host, the AI key, a stranger or nobody", async () => {
    const { g } = await played(); const s = await paidGame();
    expect((await get(g.id, await gameKey(g))).status).toBe(200);
    for (const k of [await labelHost(g), g.ai, s.key]) { const r = await get(g.id, k); expect(r.status).toBe(403); expect((await j(r)).code).toBe("not-allowed"); }
    expect((await call("GET", `/api/z/${g.id}/v2/export`)).status).toBeGreaterThanOrEqual(401);
  });
  test("an AI game key, or a call that declares itself an AI, gets ticket numbers only", async () => {
    const { g } = await played(); const ga = await gameKey(g, { ai: true, label: "ChatGPT" });
    for (const r of [await get(g.id, ga), await get(g.id, g.key, "", { "x-ai-model": "AI: ChatGPT" })]) {
      const b = await j(r); expect(b.personalDataIncluded).toBe(false); expect(b.note).toMatch(/AI/);
      expect(JSON.stringify(b)).not.toContain("Guest "); expect(b.tickets.length).toBe(3); expect(b.winners.length).toBe(2);
      expect(b.payments[0].payerEmailMasked).toBeUndefined(); expect(b.payments[0].invoiceUrl).toBeUndefined(); // an AI never gets the payer's own links either
    }
  });
});

describe("the 24-hour promise", () => {
  test("after the deletion the file says so, the ticket list is empty, and results, winners by number and payments remain", async () => {
    const { g, seats } = await played(); await erasePersonal(W.env as any, g.id, T + 30 * HOUR, "test");
    const b = await j(await get(g.id, g.key, "", {}, T + 31 * HOUR));
    expect(b.personalDataDeleted).toBe(true); expect(b.personalDataIncluded).toBe(false); expect(b.note).toMatch(/deleted/);
    expect(b.tickets).toEqual([]); expect(b.results.length).toBe(2); expect(b.winners.length).toBe(2); expect(b.winners[0].name ?? "").toBe(""); expect(b.winners[0].ticket).toBeGreaterThan(0);
    expect(b.payments.length).toBe(1); expect(JSON.stringify(b)).not.toContain("Guest ");
    void seats;
  });
  test("a player removed by 'forget me' is not in the tickets list's names", async () => {
    const { g, seats } = await played();
    W.raw.prepare("UPDATE participant SET pii=NULL, name=NULL WHERE eid=? AND pid=(SELECT pid FROM seat WHERE eid=? AND seq=?)").run(g.id, g.id, seats[2]);
    const b = await j(await get(g.id, g.key)); expect(b.tickets.find((t: any) => t.ticket === seats[2])?.name ?? "").toBe("");
  });
});
