// New organizer flow, Game dashboard (2026-10-29): one status banner (unpaid / paid), payment, game link and message, Waiting for you, Tickets claimed, Game board, 24-hour report note.
// FALSIFIED BY: flow-d-banner-role-status, flow-d-banner-unpaid-words, flow-d-banner-paid-words, flow-d-pay-when-paid, flow-d-decline-sent-as-admit, flow-d-bogey-counted, flow-d-letall-missing, flow-d-opens-when-published-game
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
  expect(d.querySelectorAll("#zf-wait li").length).toBe(2);
  d.querySelector('[data-wid="w1"] [data-decide="admit"]').click(); await wait();
  d.querySelector('[data-wid="w2"] [data-decide="decline"]').click(); await wait();
  const posts = calls.filter((c) => c.method === "POST");
  expect(posts[0]).toEqual({ url: "/api/z/EABCDEF/waiting/w1", method: "POST", body: { decision: "admit" } });
  expect(posts[1].body).toEqual({ decision: "decline" });
  calls.length = 0;
  d.getElementById("zf-letall").click(); await wait(100);
  expect(calls.filter((c) => c.method === "POST").map((c) => c.body.decision)).toEqual(["admit", "admit"]);
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
