// New organizer flow, Game dashboard (2026-10-29): one status banner (unpaid / paid), payment, game link and message, Waiting for you, Tickets claimed, Game board, 24-hour report note.
// FALSIFIED BY: flow-d2-order, flow-d2-share-id, flow-d2-pill, flow-d2-print-when-done, flow-d2-columns, flow-d2-notnow, flow-d2-letall, flow-d2-board-90, flow-d-banner-role-status, flow-d-banner-unpaid-words, flow-d-banner-paid-words, flow-d-pay-when-paid, flow-d-decline-sent-as-admit, flow-d-bogey-counted, flow-d-letall-missing, flow-d-opens-when-published-game
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

const src = ["zc-flow-game.js", "pack/zc-flow.js"].map((f) => readFileSync(join(import.meta.dir, "../public", f), "utf8")).join("\n");
const calls: any[] = [];
const START = Date.UTC(2099, 10, 1, 12, 30); // 18:00 in India, far ahead so the test never ages
let info: any = { unpaid: true, startMs: START }; // the real answer leaves "draft" out once the game is published
let waiting: any[] = [{ id: "w1", firstName: "Asha", last4: "4321" }, { id: "w2", firstName: "Ravi", last4: "9988" }];
let claims: any[] = [{ id: 1 }, { id: 2, bogey: true }, { id: 3 }];
function page(search = "?flow=new&e=EABCDEF") {
  const win: any = new Window({ url: "http://localhost/zc.html" + search });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000) };
  win.sessionStorage.setItem("ctz-org", "ctk_" + "0".repeat(48));
  const fakeFetch = async (url: string, o: any = {}) => {
    calls.push({ url, method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null });
    const j = url.endsWith("/info") ? info : url.endsWith("/waiting") ? { waiting } : url.endsWith("/claims") ? { claims } : { ok: true };
    return { ok: true, json: async () => j };
  };
  new Function("window", "document", "location", "fetch", "sessionStorage", src)(win, win.document, win.location, fakeFetch, win.sessionStorage);
  return win;
}
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

test("an unpaid published game opens on its dashboard with the Don't worry banner, Pay now and Copy payment link", async () => {
  info = { unpaid: true, startMs: START }; calls.length = 0;
  const win = page(); await wait();
  const d = win.document;
  expect(d.getElementById("zf-banner").textContent).toBe("Published, payment is pending. Don’t worry. The game will not start until the payment is done, and you can cancel it at any time.");
  expect(d.getElementById("zf-paynow").getAttribute("href")).toBe("http://localhost/pay.html?e=EABCDEF");
  expect(d.getElementById("zf-copypay")).not.toBe(null);
});

test("the status banner is not a role=status/alert line: the help pop-up (guide.js) would take 'payment is pending' for a payment failure", async () => {
  info = { unpaid: true, startMs: START };
  const win = page(); await wait();
  const b = win.document.getElementById("zf-banner");
  expect(b.getAttribute("role")).toBe(null);
  expect(b.closest("[role=status],[role=alert]")).toBe(null);
});

test("a paid game says Congratulations with the start time, and has no payment section", async () => {
  info = { unpaid: false, startMs: START };
  const win = page(); await wait();
  const d = win.document;
  expect(d.getElementById("zf-banner").textContent).toContain("Congratulations, your game is on! It will begin at ");
  expect(d.getElementById("zf-banner").textContent).toContain("postpone or change it up to 5 minutes before");
  expect(d.getElementById("zf-paynow")).toBe(null);
  expect(d.getElementById("zf-copypay")).toBe(null);
});

test("game link, a ready message, tickets claimed (practice rows left out), game board, report note", async () => {
  info = { unpaid: false, startMs: START };
  const win = page(); await wait();
  const d = win.document;
  expect(d.getElementById("zf-link").value).toBe("http://localhost/z.html?e=EABCDEF");
  expect(d.getElementById("zf-sharemsg").textContent).toContain("http://localhost/z.html?e=EABCDEF");
  expect(d.getElementById("zf-claimed").textContent).toBe("2");
  expect(d.getElementById("zf-board").getAttribute("href")).toBe("http://localhost/board.html?e=EABCDEF");
  expect(d.getElementById("zf-report").textContent).toContain("within 24 hours");
  expect(win.ZFLOW.badWords(d.getElementById("zf-dashboard").textContent)).toEqual([]);
});

test("Waiting for you: Let in sends admit, Not now sends decline, Let everyone in lets all in", async () => {
  info = { unpaid: false, startMs: START }; calls.length = 0;
  const win = page(); await wait();
  const d = win.document;
  expect(d.querySelectorAll("#zf-wait tbody tr").length).toBe(2);
  d.querySelector('[data-wid="w1"] [data-decide="admit"]').click(); await wait();
  d.querySelector('[data-wid="w2"] [data-decide="decline"]').click(); await wait();
  const posts = calls.filter((c) => c.method === "POST");
  expect(posts[0]).toEqual({ url: "/api/z/EABCDEF/waiting/w1", method: "POST", body: { decision: "admit" } });
  expect(posts[1].body).toEqual({ decision: "decline" });
  calls.length = 0;
  d.getElementById("zf-letall").click(); await wait(100);
  const all = calls.filter((c) => c.method === "POST");
  expect(all.length).toBe(1);
  expect(all[0]).toEqual({ url: "/api/z/EABCDEF/waiting/all", method: "POST", body: { decision: "admit" } });
});

test("nobody waiting says so in plain words", async () => {
  info = { unpaid: false, startMs: START }; waiting = [];
  const win = page(); await wait();
  expect(win.document.getElementById("zf-nowait").textContent).toBe("Nobody is waiting right now.");
  waiting = [{ id: "w1", firstName: "Asha", last4: "4321" }, { id: "w2", firstName: "Ravi", last4: "9988" }];
});

test("a draft stays on the steps (the dashboard stays locked)", async () => {
  info = { draft: true, unpaid: true, startMs: START };
  const win = page(); await wait();
  expect(win.document.getElementById("zf-dashboard")).toBe(null);
  expect(win.document.getElementById("zf-dash").hasAttribute("disabled")).toBe(true);
});

// ---- Game dashboard v2 (owner, 29 Oct night) ----
test("v2 order: the share card is at the very top, then the banner, then Payment, Waiting, Tickets claimed, the retro board", async () => {
  info = { unpaid: true, startMs: START };
  const win = page(); await wait();
  const ids = [...win.document.getElementById("zf-dashboard").children].map((n: any) => n.id || n.tagName);
  const order = ["zf-sharecard", "zf-banner", "zf-pay", "zf-waitsec", "H3", "zf-claimed", "zf-retro"].map((x) => ids.indexOf(x));
  expect(order.every((n: number) => n >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(ids.indexOf("zf-sharecard")).toBe(1);
});

test("the share card: Game ID, game link, Copy game link, Copy a message to share, Share on WhatsApp, and the message carries the Game ID", async () => {
  info = { unpaid: false, startMs: START };
  const win = page(); await wait();
  const d = win.document;
  expect(d.getElementById("zf-sh").textContent).toBe("Share this game link with your participants.");
  expect(d.getElementById("zf-shareid").textContent).toBe("EABCDEF");
  expect([...d.querySelectorAll("#zf-sharecard button, #zf-sharecard a")].map((n: any) => n.textContent)).toEqual(["Copy game link", "Copy a message to share", "Share on WhatsApp"]);
  expect(d.getElementById("zf-sharemsg").textContent).toContain("Game ID: EABCDEF");
  expect(decodeURIComponent(d.getElementById("zf-whatsapp").getAttribute("href").split("text=")[1])).toBe(d.getElementById("zf-sharemsg").textContent);
  expect(d.getElementById("zf-sharecard").textContent).toContain("Hosts and Co-hosts use this same link.");
});

test("Payment has a pill (Pending amber, Done green, Free game) and the small print only while it is pending", async () => {
  const pill = async (i: any) => { info = i; const w = page(); await wait(); return [w.document.getElementById("zf-paypill").textContent, w.document.getElementById("zf-paypill").className, !!w.document.getElementById("zf-payprint")]; };
  expect(await pill({ unpaid: true, startMs: START })).toEqual(["Pending", "zf-pillstatus amber", true]);
  expect(await pill({ unpaid: false, startMs: START })).toEqual(["Done", "zf-pillstatus green", false]);
  expect(await pill({ unpaid: false, demo: true, startMs: START })).toEqual(["Free game", "zf-pillstatus green", false]);
  info = { unpaid: true, startMs: START };
  const w = page(); await wait();
  expect(w.document.getElementById("zf-payprint").textContent).toContain("claim it back (recommended)");
  expect(w.document.getElementById("zf-payprint").textContent).toContain("works for 7 days");
});

test("Copy payment link asks the game for its own payment link (the 7-day one) and copies that", async () => {
  info = { unpaid: true, startMs: START }; calls.length = 0;
  const win = page(); await wait();
  win.document.getElementById("zf-copypay").click(); await wait();
  expect(calls.find((c) => c.method === "POST").url).toBe("/api/z/EABCDEF/paylink");
});

test("the waiting table: Ticket number always, the other columns only when somebody gave them, amber; Not now moves a person to the grey list where Let in still works", async () => {
  info = { unpaid: false, startMs: START };
  waiting = [{ id: "w1", firstName: "Asha", last4: "4321", via: "boss@acme.com" }, { id: "w2" }]; calls.length = 0;
  const win = page(); await wait();
  const d = win.document;
  expect([...d.querySelectorAll("#zf-wait thead th")].map((n: any) => n.textContent).filter(Boolean)).toEqual(["Ticket number", "Name", "Mobile", "Referred by"]);
  expect(d.getElementById("zf-wait").className).toContain("amber");
  expect(d.querySelector('[data-wid="w1"]').textContent).toContain("ends 4321");
  d.querySelector('[data-wid="w1"] [data-decide="decline"]').click(); await wait();
  expect(d.querySelector("#zf-notnow")).not.toBe(null);
  expect(d.querySelector('#zf-notnow [data-decide="admit"]')).not.toBe(null);
  expect(d.getElementById("zf-notnow").className).toContain("grey");
  waiting = [];
  d.querySelector('#zf-notnow [data-decide="admit"]').click(); await wait();
  expect(d.getElementById("zf-ingame").className).toContain("green");
  expect(d.getElementById("zf-notnow")).toBe(null);
  waiting = [{ id: "w1", firstName: "Asha", last4: "4321" }, { id: "w2", firstName: "Ravi", last4: "9988" }];
});

test("the retro Housie board: HOUSIE title, a gold ball, 90 round discs in 10 columns, stamped ones red", async () => {
  info = { unpaid: false, startMs: START };
  const win = page(); await wait();
  const d = win.document;
  expect(d.querySelector(".zf-retro-title").textContent).toContain("HOUSIE");
  expect(d.getElementById("zf-discs").children.length).toBe(90);
  expect(d.getElementById("zf-discs").getAttribute("style")).toContain("repeat(10, 1fr)");
  expect(d.getElementById("zf-ball")).not.toBe(null);
  expect(d.querySelectorAll(".zf-disc.called").length).toBe(0);
  win.ZFLOW.dash.called = [5, 17]; win.ZFLOW.draw();
  expect([...d.querySelectorAll(".zf-disc.called")].map((n: any) => n.textContent)).toEqual(["5", "17"]);
  expect(d.getElementById("zf-ball").textContent).toBe("17");
});
