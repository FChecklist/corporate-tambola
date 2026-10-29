// New organizer flow, late additions (2026-10-29): Game ID bar and the 11 statuses, the participant preview in step 5, Host / Co-host sign-in and pages (demo stub), A/B prize rows waiting, ₹ everywhere.
// FALSIFIED BY: flow-t-status-paid-after-start, flow-t-status-overdue-locked, flow-t-status-cancelled-refund, flow-t-status-deleted-first, flow-t-gameid-bar-missing, flow-t-demo-box-live, flow-t-preview-fake-tickets, flow-t-preview-two-tickets, flow-t-stub-live-host, flow-t-passcode-tries, flow-t-passcode-expiry, flow-t-cohost-sees-payment, flow-t-ab-enabled, flow-t-rs-sign
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";
import { ticketsFor } from "../../../packages/beacon/src/game";

const src = ["zc-flow-game.js", "pack/zc-flow.js"].map((f) => readFileSync(join(import.meta.dir, "../public", f), "utf8")).join("\n");
const calls: any[] = [];
let info: any = { unpaid: true, startMs: Date.now() + 3 * 86400000 };
function page(search = "?flow=new&e=EABCDEF", url = "http://localhost/zc.html") {
  const win: any = new Window({ url: url + search });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES, ticketsFor };
  win.sessionStorage.setItem("ctz-org", "ctk_" + "0".repeat(48));
  const fakeFetch = async (u: string, o: any = {}) => { calls.push({ url: u, method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null }); const j = u.endsWith("/info") ? info : u.endsWith("/waiting") ? { waiting: [] } : u.endsWith("/claims") ? { claims: [] } : { ok: true }; return { ok: true, json: async () => j }; };
  new Function("window", "document", "location", "fetch", "sessionStorage", src)(win, win.document, win.location, fakeFetch, win.sessionStorage);
  return win;
}
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const NOW = Date.UTC(2026, 9, 29, 6, 30), HOUR = 3600000;

test("all eleven statuses come out of the game's own answer", () => {
  const S = page().ZFLOW.statusOf;
  const base = { startMs: NOW + 5 * HOUR, gameMinutes: 60 };
  expect(S(null, {}, NOW)).toBe("draft");
  expect(S({ draft: true }, {}, NOW)).toBe("draft");
  expect(S({ ...base, unpaid: true }, {}, NOW)).toBe("pending");
  expect(S({ ...base }, {}, NOW)).toBe("paid");
  expect(S({ ...base, demo: true }, {}, NOW)).toBe("free");
  expect(S({ ...base, unpaid: true }, {}, NOW + 6 * HOUR)).toBe("overdue");
  expect(S({ ...base, unpaid: true, locked: true }, {}, NOW)).toBe("overdue");
  expect(S({ ...base }, {}, NOW + 5 * HOUR + 600000)).toBe("live");
  expect(S({ ...base }, { paused: true }, NOW + 5 * HOUR + 600000)).toBe("paused");
  expect(S({ ...base }, {}, NOW + 9 * HOUR)).toBe("completed");
  expect(S({ ...base }, { completed: true }, NOW)).toBe("completed");
  expect(S({ ...base, cancelled: true }, {}, NOW)).toBe("cancelled");
  expect(S({ ...base, cancelled: true }, { refund: true }, NOW)).toBe("refund");
  expect(S({ ...base }, { deleted: true }, NOW)).toBe("deleted");
});

test("each status has its pill words and colour, and a banner", () => {
  const F = page().ZFLOW;
  expect(Object.values(F.STATUSES).map((s: any) => s.label)).toEqual(["Draft", "Published, payment pending", "Published and paid", "Published, free game", "Payment pending, start time passed", "Live now", "Paused", "Completed", "Cancelled", "Cancelled, refund requested", "Data deleted"]);
  expect(F.STATUSES.overdue.tone).toBe("red"); expect(F.STATUSES.paid.tone).toBe("green"); expect(F.STATUSES.pending.tone).toBe("amber");
  for (const id of Object.keys(F.STATUSES)) { const b = F.statusBanner(id, "Sat 18:00"); expect(b.text.length).toBeGreaterThan(20); expect(F.badWords(b.text)).toEqual([]); }
  expect(F.statusBanner("free", "Sat 18:00").text).toContain("free game");
});

test("the Game ID bar shows the id with Copy and the status pill on every screen, once the game exists", async () => {
  info = { unpaid: true, startMs: Date.now() + 3 * 86400000 };
  const win = page(); await wait();
  const d = win.document;
  expect(d.getElementById("zf-gameid").textContent).toBe("EABCDEF");
  expect(d.getElementById("zf-copyid")).toBe(null); // the bar only shows the Game ID; the thing to copy is in the share card
  expect(d.getElementById("zf-status").textContent).toBe("Published, payment pending");
  d.querySelector('[data-step="2"]').click();
  expect(d.getElementById("zf-idbar")).not.toBe(null); // also on the steps
  const none = page("?flow=new", "http://localhost/zc.html");
  expect(none.document.getElementById("zf-idbar")).toBe(null); // no game yet
});

test("a game whose time has passed unpaid is red, with Pay now, Change the date and Cancel", async () => {
  info = { unpaid: true, locked: true, startMs: Date.now() - HOUR };
  const win = page(); await wait();
  const d = win.document;
  expect(d.getElementById("zf-status").dataset.status).toBe("overdue");
  expect(d.getElementById("zf-banner").textContent).toContain("start time has passed");
  for (const id of ["zf-paynow", "zf-changedate", "zf-cancelgame"]) expect(d.getElementById(id)).not.toBe(null);
});

test("a cancelled game shows Make a copy waiting, and no game link; a deleted one shows only the banner", async () => {
  info = { cancelled: true, startMs: Date.now() + HOUR };
  const win = page(); await wait();
  const d = win.document;
  expect(d.getElementById("zf-status").dataset.status).toBe("cancelled");
  expect(d.getElementById("zf-copygame").hasAttribute("disabled")).toBe(true);
  expect(d.getElementById("zf-link")).toBe(null);
  info = { unpaid: true, startMs: Date.now() + 3 * 86400000 };
});

test("the Demo status box exists only in the demo on this computer", async () => {
  info = { startMs: Date.now() + HOUR };
  const plain = page(); await wait();
  expect(plain.document.getElementById("zf-demostatus")).toBe(null);
  const live = page("?flow=new&e=EABCDEF&demo=roles", "https://console.example.com/zc.html"); await wait();
  expect(live.document.getElementById("zf-demostatus")).toBe(null);
  const demo = page("?flow=new&e=EABCDEF&demo=roles"); await wait();
  const sel = demo.document.getElementById("zf-demostatus");
  expect(sel.options.length).toBe(12);
  sel.value = "paused"; sel.dispatchEvent(new demo.Event("change"));
  expect(demo.document.getElementById("zf-status").textContent).toBe("Paused");
  expect(demo.document.getElementById("zf-resume").hasAttribute("disabled")).toBe(true);
  info = { unpaid: true, startMs: Date.now() + 3 * 86400000 };
});

function toStep5(win: any) {
  const F = win.ZFLOW, s = F.state;
  s.done[1] = s.done[2] = s.done[3] = s.done[4] = true; s.open = 5; s.eid = "EABCDEF"; s.view = "steps"; s.when = { ms: Date.now() + 3 * 86400000, zone: "Asia/Kolkata" };
  F.who.upTo = 100; F.prizes.sel = F.defaultPrizes(F.housesOf({ PRIZE_HOUSES })); F.draw();
}

test("step 5 preview: the game's own ticket maker, mobile and laptop, sample words, prizes with Claim", async () => {
  const win = page("?flow=new"); toStep5(win);
  const d = win.document;
  expect(d.getElementById("zf-pvnote").textContent).toBe("These are sample numbers. Your participants see their own tickets.");
  expect(d.querySelectorAll("#zf-preview .zf-pvticket").length).toBe(1);
  const real = ticketsFor("EABCDEF", "sample-player", 1)[0].flat().filter((v: any) => v !== null).map(String);
  const shown = [...d.querySelectorAll("#zf-preview .zf-pvticket div:not(.e)")].map((n: any) => n.textContent);
  expect(shown).toEqual(real);
  expect(d.getElementById("zf-pvprizes").textContent).toContain("Full House: Gift voucher");
  expect(d.querySelector("#zf-pvprizes button").hasAttribute("disabled")).toBe(true);
  expect(d.getElementById("zf-discs")).toBe(null);
  d.querySelector('[data-pv="laptop"]').click();
  expect(d.getElementById("zf-discs").children.length).toBe(90);
  expect(d.querySelector(".zf-retro-title").textContent).toContain("HOUSIE");
  expect(d.getElementById("zf-frame").className).toContain("laptop");
});

test("step 5 preview with 2 tickets shows Ticket A and Ticket B", () => {
  const win = page("?flow=new"); toStep5(win);
  win.ZFLOW.prizes.tix = 2; win.ZFLOW.draw();
  const t = win.document.getElementById("zf-preview").textContent;
  expect(t).toContain("Ticket A"); expect(t).toContain("Ticket B");
  expect(win.document.querySelectorAll("#zf-preview .zf-pvticket").length).toBe(2);
});

test("Host / Co-host sign-in: only on this computer with demo=roles; an unknown email is told plainly", async () => {
  const F = page().ZFLOW;
  expect(F.stubOn("?demo=roles", "localhost")).toBe(true);
  expect(F.stubOn("?demo=roles", "console.corporatetambola.com")).toBe(false);
  expect(F.stubOn("", "localhost")).toBe(false);
  const live = page("?flow=new&e=EABCDEF&team=1&demo=roles", "https://console.example.com/zc.html"); await wait();
  expect(live.document.getElementById("zf-signin")).toBe(null);
  const win = page("?flow=new&e=EABCDEF&team=1&demo=roles"); await wait();
  const d = win.document;
  expect(d.getElementById("zf-demo").textContent).toContain("DEMO ONLY");
  const em = d.getElementById("zf-temail"); em.value = "nobody@x.com"; em.dispatchEvent(new win.Event("input"));
  d.getElementById("zf-tgo").click();
  expect(d.getElementById("zf-tmsg").textContent).toBe("This email ID is not on the list. Please ask the organizer to add you, or join the game as a participant.");
});

test("the passcode works for 10 minutes and 5 wrong tries", () => {
  const F = page().ZFLOW;
  const att = { tries: 0, sentMs: NOW };
  expect(F.passcodeCheck(att, "000000", NOW + 1000).msg).toContain("4 tries left");
  for (let i = 0; i < 4; i++) F.passcodeCheck(att, "111111", NOW + 2000);
  expect(F.passcodeCheck(att, "123456", NOW + 3000).reason).toBe("locked"); // the right one is refused after 5 wrong
  expect(F.passcodeCheck({ tries: 0, sentMs: NOW }, "123456", NOW + 11 * 60000).reason).toBe("expired");
  expect(F.passcodeCheck({ tries: 0, sentMs: NOW }, "123456", NOW + 9 * 60000).ok).toBe(true);
});

function signIn(win: any, email: string) {
  const d = win.document;
  const em = d.getElementById("zf-temail"); em.value = email; em.dispatchEvent(new win.Event("input"));
  d.getElementById("zf-tgo").click();
  [..."123456"].forEach((c, i) => { d.getElementById("zf-pc" + i).value = c; });
  d.getElementById("zf-pcgo").click();
}

test("a Host lands on the Game dashboard with every step open and a role bar with Sign out", async () => {
  const win = page("?flow=new&e=EABCDEF&team=1&demo=roles"); await wait();
  signIn(win, "host@acme.com"); await wait();
  const d = win.document;
  expect(d.getElementById("zf-rolebar").textContent).toContain("You are a Host of this game");
  expect(d.getElementById("zf-hd").textContent).toBe("Game dashboard");
  expect(d.querySelectorAll(".zf-bar [data-step]:not([disabled])").length).toBe(5);
  d.getElementById("zf-signout").click();
  expect(d.getElementById("zf-signin")).not.toBe(null);
});

test("a Co-host sees only Your Co-host page: link and message, Waiting for you, Tickets claimed; no steps, no payment, no cancel", async () => {
  info = { unpaid: true, startMs: Date.now() + 3 * 86400000 };
  const win = page("?flow=new&e=EABCDEF&team=1&demo=roles"); await wait();
  signIn(win, "cohost@acme.com"); await wait();
  const d = win.document;
  expect(d.getElementById("zf-rolebar").textContent).toContain("cannot change the game or pay");
  expect(d.getElementById("zf-hd").textContent).toBe("Your Co-host page");
  expect(d.querySelector(".zf-bar")).toBe(null);
  expect(d.getElementById("zf-link")).not.toBe(null);
  expect(d.getElementById("zf-claimed")).not.toBe(null);
  for (const id of ["zf-pay", "zf-paynow", "zf-copypay", "zf-letall", "zf-board", "zf-banner", "zf-cancelgame"]) expect(d.getElementById(id)).toBe(null);
  expect(d.getElementById("zf-sharecard")).not.toBe(null); // the same share card and board, read-only
  expect(d.getElementById("zf-retro")).not.toBe(null);
});

test("step 3 shows the Ticket A and Ticket B prize rows, waiting (coming soon), with 2 tickets", () => {
  const win = page("?flow=new"); const F = win.ZFLOW; F.state.open = 3; F.state.done[1] = F.state.done[2] = true; F.prizes.tix = 2; F.draw();
  const rows = [...win.document.querySelectorAll(".zf-ab")];
  expect(rows.length).toBe(2);
  for (const r of rows) { expect(r.querySelector("input").hasAttribute("disabled")).toBe(true); expect(r.textContent).toContain("Coming soon"); }
});

test("the money sign is ₹ on every step: no 'Rs' anywhere on the screens", () => {
  const win = page("?flow=new"); const F = win.ZFLOW;
  F.state.done[1] = F.state.done[2] = F.state.done[3] = F.state.done[4] = true; F.who.upTo = 100; F.prizes.sel = F.defaultPrizes(F.housesOf({ PRIZE_HOUSES }));
  F.state.packs = [{ upTo: 100, inr: 2399 }];
  let all = "";
  for (let n = 1; n <= 5; n++) { F.state.open = n; F.state.eid = "EABCDEF"; F.draw(); all += win.document.getElementById("app").textContent + " "; }
  expect(/\bRs\b/.test(all)).toBe(false);
  expect(all).toContain("₹2,399");
});
