// New organizer flow, step 3 (2026-10-29): prizes listed from the game's real houses, tags, gifts (no cash), worth-up-to with a sticky currency, 1 or 2 tickets, Super Bumper House 1-10.
// FALSIFIED BY: flow-s3-cash-offered, flow-s3-tags-order, flow-s3-bumper-on-one-ticket, flow-s3-currency-not-sticky, flow-s3-houses-not-real, flow-s3-needs-one-prize, flow-s3-count-ignored
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

const src = ["zc-flow-game.js", "pack/zc-flow.js"].map((f) => readFileSync(join(import.meta.dir, "../public", f), "utf8")).join("\n");
const calls: any[] = [];
function page() {
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES };
  const fakeFetch = async (url: string, o: any = {}) => { calls.push({ url, method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null }); return { ok: true, json: async () => ({ ok: true }) }; };
  new Function("window", "document", "location", "fetch", src)(win, win.document, win.location, fakeFetch);
  const s = win.ZFLOW.state; s.done[1] = true; s.done[2] = true; s.open = 3; s.eid = "EABCDEF"; win.ZFLOW.draw();
  return win;
}
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const change = (win: any, id: string, v: string) => { const n = win.document.getElementById(id); n.value = v; n.dispatchEvent(new win.Event("change")); };

test("the prize list is the game's real houses (Super Bumper has its own place), the usual ones already ticked", () => {
  const win = page();
  const ids = [...win.document.querySelectorAll("#zf-sec3 [data-house]")].map((n: any) => n.dataset.house);
  const real = PRIZE_HOUSES.filter((h) => h.id !== "full2").map((h) => h.id);
  // Unlucky sits under "More prizes", after the others, and the Lucky draw comes last
  expect(ids).toEqual([...real.filter((x) => x !== "unlucky"), "unlucky", "lucky"]);
  expect(win.document.getElementById("zf-tick-full").checked).toBe(true);
  expect(win.document.getElementById("zf-tick-plus").checked).toBe(false);
});

test("tags read (Popular) before (Recommended)", () => {
  const F = page().ZFLOW;
  expect(F.tagsOf("full")).toEqual(["(Popular)", "(Recommended)"]);
  expect(F.tagsOf("mid")).toEqual(["(Recommended)"]);
  expect(F.tagsOf("plus")).toEqual([]);
});

test("gifts only: no cash anywhere in the list, and 'Other' lets the organizer write one", () => {
  const win = page();
  const opts = [...win.document.querySelectorAll("#zf-g-full option")].map((o: any) => o.textContent);
  expect(opts.some((o: string) => /cash/i.test(o))).toBe(false);
  expect(opts[0]).toBe("Gift voucher");
  expect(opts[opts.length - 1]).toBe("Other");
  change(win, "zf-g-full", "Other");
  expect(win.document.getElementById("zf-o-full")).not.toBe(null);
});

test("'Worth up to' keeps the currency chosen once, for every prize", () => {
  const F = page().ZFLOW;
  expect(F.prizeLine("Gift voucher", "", "1000", "INR")).toBe("Gift voucher (worth up to ₹1,000)");
  expect(F.prizeLine("Smartphone", "", "", "INR")).toBe("Smartphone");
  expect(F.prizeLine("Other", "  A  trip ", "50", "USD")).toBe("A trip (worth up to $50)");
  const win = page();
  change(win, "zf-cur", "USD");
  win.document.getElementById("zf-w-full").value = "40"; win.document.getElementById("zf-w-full").dispatchEvent(new win.Event("input"));
  win.document.getElementById("zf-w-top").value = "20"; win.document.getElementById("zf-w-top").dispatchEvent(new win.Event("input"));
  const r = win.ZFLOW.buildRewards(win.ZFLOW.prizes.sel, win.ZFLOW.prizes.bumper, 1, win.ZFLOW.prizes.cur);
  expect(r.find((x: any) => x.pattern === "full").text).toBe("Gift voucher (worth up to $40)");
  expect(r.find((x: any) => x.pattern === "top").text).toBe("Gift voucher (worth up to $20)");
  expect(win.document.querySelector("#zf-sec3 .zf-money").textContent).toContain("$");
});

test("a prize can be won 1 to 5 times: one line per winner place", () => {
  const win = page();
  change(win, "zf-n-full", "3");
  const r = win.ZFLOW.buildRewards(win.ZFLOW.prizes.sel, win.ZFLOW.prizes.bumper, 1, "INR").filter((x: any) => x.pattern === "full");
  expect(r.map((x: any) => x.ordinal)).toEqual([1, 2, 3]);
  expect([...win.document.querySelectorAll("#zf-n-full option")].map((o: any) => o.value)).toEqual(["1", "2", "3", "4", "5"]);
});

test("Super Bumper House appears with 2 tickets only, up to 10 winners; Ticket A/B prizes are hidden", () => {
  const win = page();
  expect(win.document.querySelector('[data-house="bumper"]')).toBe(null);
  win.document.querySelector('[data-tix="2"]').click();
  expect(win.document.querySelector('[data-house="bumper"]')).not.toBe(null);
  expect(win.document.getElementById("zf-sec3").textContent).not.toContain("Coming soon");
  win.document.getElementById("zf-tick-bumper").checked = true; win.document.getElementById("zf-tick-bumper").dispatchEvent(new win.Event("change"));
  expect([...win.document.querySelectorAll("#zf-n-bumper option")].length).toBe(10);
  change(win, "zf-n-bumper", "10");
  const F = win.ZFLOW, p = F.prizes;
  expect(F.buildRewards(p.sel, p.bumper, 2, "INR").filter((x: any) => x.scope === "two_ticket").length).toBe(10);
  expect(F.buildRewards(p.sel, p.bumper, 1, "INR").filter((x: any) => x.scope === "two_ticket").length).toBe(0); // one ticket: no Super Bumper
});

test("at least one prize must be ticked, and 'Other' needs the words", () => {
  const F = page().ZFLOW, houses = F.housesOf({ PRIZE_HOUSES });
  const none = F.defaultPrizes(houses); for (const k of Object.keys(none)) none[k].on = false;
  expect(F.prizeProblems(none, F.defaultBumper(), 1, houses)[0]).toContain("Tick at least one");
  const blank = F.defaultPrizes(houses); blank.full.gift = "Other";
  expect(F.prizeProblems(blank, F.defaultBumper(), 1, houses)[0]).toContain("Full House");
});

test("Save and continue sends tickets and prizes to the game; step 4 opens", async () => {
  calls.length = 0;
  const win = page();
  win.document.getElementById("zf-save3").click(); await wait();
  const put = calls.find((c) => c.method === "PATCH");
  expect(put.url).toBe("/api/z/EABCDEF/settings");
  expect(put.body.tickets).toBe(1);
  expect(put.body.rewards.length).toBe(5);
  expect(put.body.rewards[0]).toEqual({ pattern: "early5", scope: "ticket", ordinal: 1, text: "Gift voucher" });
  expect(win.ZFLOW.state.open).toBe(4);
});

test("words on this step follow the language guide", () => {
  const win = page();
  const text = win.document.getElementById("zf-sec3").textContent;
  expect(win.ZFLOW.badWords(text.replace(/Unlucky[^.]*\./, ""))).toEqual([]);
});
