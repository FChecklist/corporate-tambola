// New organizer flow, step 5 (2026-10-29): read-back of steps 1 to 4, Host/Co-host explained (adding by email waits), the organizer's own contact, Publish.
// FALSIFIED BY: flow-s5-readback-no-prizes, flow-s5-phone-any, flow-s5-email-any, flow-s5-publish-no-open-dashboard, flow-s5-hosts-enabled, flow-s5-consent-ignored
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

const src = readFileSync(join(import.meta.dir, "../public/zc-flow.js"), "utf8");
const calls: any[] = [];
function page(withConsent = false) {
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES };
  if (withConsent) {
    const boxes: any = { K1: [] };
    win.CBConsent = { version: 3, html: () => '<label><input type="checkbox" data-box="A"> I agree</label>', all: (root: any) => [...root.querySelectorAll("input[data-box]")].every((i: any) => i.checked), payload: (root: any) => ({ v: 3, boxes: [...root.querySelectorAll("input[data-box]")].filter((i: any) => i.checked).map((i: any) => i.dataset.box) }), wire: (root: any, kind: string, store: any, btn: any) => { const r = () => { btn.disabled = !win.CBConsent.all(root); }; root.addEventListener("change", r); r(); } };
    void boxes;
  }
  const fakeFetch = async (url: string, o: any = {}) => { calls.push({ url, method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null }); return { ok: true, json: async () => ({ ok: true, paid: false, payUrl: "https://x/pay.html?e=EABCDEF", shareUrl: "https://x/z.html?e=EABCDEF" }) }; };
  new Function("window", "document", "location", "fetch", src)(win, win.document, win.location, fakeFetch);
  const F = win.ZFLOW, s = F.state;
  s.done[1] = s.done[2] = s.done[3] = s.done[4] = true; s.open = 5; s.eid = "EABCDEF";
  s.when = { ms: Date.now() + 3 * 86400000, zone: "Asia/Kolkata" }; F.form.occ = "Diwali party"; F.who.upTo = 100; F.prizes.sel = F.defaultPrizes(F.housesOf({ PRIZE_HOUSES }));
  F.draw();
  return win;
}
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const type = (win: any, id: string, v: string) => { const n = win.document.getElementById(id); n.value = v; n.dispatchEvent(new win.Event("input")); };

test("the read-back shows the game, who it is for, tickets, every ticked prize with its gift, company and breaks", () => {
  const win = page();
  const text = win.document.getElementById("zf-read").textContent;
  expect(text).toContain("Diwali party");
  expect(text).toContain("(India (IST))");
  expect(text).toContain("Up to 100 participants");
  expect(text).toContain("1 ticket for each participant");
  expect(text).toContain("Full House");
  expect(text).toContain("Gift voucher");
  expect(text).toContain("Not added");
});

test("a prize won several times reads back as such; Super Bumper House is named", () => {
  const win = page(); const F = win.ZFLOW;
  F.prizes.sel = F.defaultPrizes(F.housesOf({ PRIZE_HOUSES })); F.prizes.sel.full.n = 3; F.prizes.tix = 2; F.prizes.bumper.on = true; F.draw();
  const text = win.document.getElementById("zf-read").textContent;
  expect(text).toContain("won 3 times");
  expect(text).toContain("Super Bumper House");
});

test("Host and Co-host roles are explained; adding them waits (coming soon)", () => {
  const win = page();
  const text = win.document.getElementById("zf-sec5").textContent;
  expect(text).toContain("right hand");
  expect(text).toContain("up to 5");
  expect(text).toContain("cannot change the game");
  expect(text).toContain("Coming soon");
  expect(win.document.querySelectorAll("#zf-sec5 input[type=email]").length).toBe(1); // only the organizer's own contact
});

test("the organizer's own contact is checked in plain words", () => {
  const F = page().ZFLOW;
  expect(F.contactProblems("boss@acme.com", "98765 43210")).toEqual([]);
  expect(F.contactProblems("boss", "98765 43210")[0]).toContain("email ID");
  expect(F.contactProblems("boss@acme.com", "123")[0]).toContain("mobile");
});

test("Publish asks for the consent tick, then publishes and opens the Game dashboard", async () => {
  calls.length = 0;
  const win = page(true), d = win.document;
  type(win, "zf-pemail", "boss@acme.com"); type(win, "zf-pphone", "98765 43210");
  expect(d.getElementById("zf-publish").disabled).toBe(true); // not until the box is ticked
  const box = d.querySelector("#zf-consent input"); box.checked = true; box.dispatchEvent(new win.Event("change", { bubbles: true }));
  expect(d.getElementById("zf-publish").disabled).toBe(false);
  d.getElementById("zf-publish").click(); await wait();
  const post = calls.find((c) => c.method === "POST");
  expect(post.url).toBe("/api/z/EABCDEF/publish");
  expect(post.body).toEqual({ email: "boss@acme.com", phone: "98765 43210", consent: { v: 3, boxes: ["A"] } });
  expect(win.ZFLOW.dashboardOpen(win.ZFLOW.state.info)).toBe(true);
  expect(d.getElementById("zf-dash").hasAttribute("disabled")).toBe(false);
});

test("a wrong email or mobile stops Publish with a plain line and sends nothing", async () => {
  calls.length = 0;
  const win = page(), d = win.document;
  type(win, "zf-pemail", "nope"); d.getElementById("zf-publish").click(); await wait();
  expect(calls.length).toBe(0);
  expect(d.getElementById("zf-msg5").textContent).toContain("email ID");
});

test("words on this step follow the language guide", () => {
  const win = page();
  expect(win.ZFLOW.badWords(win.document.getElementById("zf-sec5").textContent)).toEqual([]);
});
