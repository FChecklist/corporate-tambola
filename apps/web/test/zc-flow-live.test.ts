// New organizer flow, live-game parts (2026-10-29): Ready check, publish warning, prizes with winner details and the handed-over tick, What is happening, Online now,
// next-number control in two places with the 5-second lock, rehearsals (the real 1.6.0 API), Completed buttons, Lucky draw and Unlucky in More prizes.
// FALSIFIED BY: flow-l-ready-pay, flow-l-warn-30, flow-l-details-only-held, flow-l-given-post, flow-l-next-one-press, flow-l-next-cohost-button, flow-l-reh-locked-unpaid, flow-l-reh-no-limit, flow-l-erase-two-step, flow-l-copy-posts, flow-l-lucky-break, flow-l-lucky-cap, flow-l-presence-flag
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

const src = ["zc-flow-game.js", "pack/zc-flow.js"].map((f) => readFileSync(join(import.meta.dir, "../public", f), "utf8")).join("\n");
const START = Date.UTC(2099, 10, 1, 12, 30);
const calls: any[] = [];
let answers: Record<string, any> = {};
let info: any = {};
function page(search = "?flow=new&e=EABCDEF", extra: (w: any) => void = () => {}) {
  const win: any = new Window({ url: "http://localhost/zc.html" + search });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES };
  win.sessionStorage.setItem("ctz-org", "ctk_" + "0".repeat(48));
  win.TBControl = { publish: async (eid: string, o: any, what: string) => { calls.push({ url: "TBControl", what, eid }); return { status: 200, data: {} }; } };
  extra(win);
  const fakeFetch = async (u: string, o: any = {}) => {
    calls.push({ url: u, method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null });
    const key = Object.keys(answers).find((k) => u.endsWith(k));
    const j = u.endsWith("/info") ? info : key ? answers[key] : u.endsWith("/waiting") ? { waiting: [] } : u.endsWith("/claims") ? { claims: [] } : { ok: true };
    return { ok: true, json: async () => j };
  };
  new Function("window", "document", "location", "fetch", "sessionStorage", src)(win, win.document, win.location, fakeFetch, win.sessionStorage);
  return win;
}
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const reset = (i: any = {}, a: Record<string, any> = {}) => { calls.length = 0; info = { unpaid: false, startMs: START, rewards: [{ pattern: "full", ordinal: 1, text: "Gift voucher" }, { pattern: "top", ordinal: 1, text: "Smartphone" }], ...i }; answers = a; };

test("Ready check: link shared (a tick), payment, prizes chosen; optional Hosts and Rehearsal done; ready when the three are true", async () => {
  reset({ unpaid: true });
  const win = page(); await wait();
  const d = win.document;
  expect([...d.querySelectorAll("#zf-ready li")].map((n: any) => n.dataset.ready)).toEqual(["link", "pay", "prizes", "reh"]);
  expect(d.querySelector('[data-ready="pay"]').className).toBe("");           // unpaid: not done
  expect(d.querySelector('[data-ready="prizes"]').className).toBe("done");    // every prize has words
  expect(d.querySelector('[data-ready="hosts"]') === null).toBe(true);               // no Hosts row (owner rule D)
  const box = d.getElementById("zf-shared"); box.checked = true; box.dispatchEvent(new win.Event("change"));
  expect(d.querySelector('[data-ready="link"]').className).toBe("done");
  expect(d.getElementById("zf-ready").className).toContain("todo");           // payment is still pending
  const F = win.ZFLOW;
  expect(F.readyAll(F.readyItems({ shared: true, status: "paid", prizesOk: true, rehearsals: [] }))).toBe(true);
  expect(F.readyAll(F.readyItems({ shared: true, status: "pending", prizesOk: true, rehearsals: [] }))).toBe(false);
  expect(F.prizesNamed([{ text: "A" }, { text: " " }])).toBe(false);
});

test("Publish warning: a game that starts within 30 minutes says so, with the minutes; later games get no warning", () => {
  const F = page("?flow=new").ZFLOW, now = Date.now();
  expect(F.startWarning(now + 9 * 60000, now)).toContain("starts in 9 minutes");
  expect(F.startWarning(now + 29 * 60000, now)).not.toBe("");
  expect(F.startWarning(now + 31 * 60000, now)).toBe("");
  expect(F.startWarning(now - 60000, now)).toContain("has passed");
  const win = page("?flow=new");
  const s = win.ZFLOW.state; s.done[1] = s.done[2] = s.done[3] = s.done[4] = true; s.open = 5; s.eid = "E1"; s.when = { ms: Date.now() + 10 * 60000, zone: "Asia/Kolkata" }; win.ZFLOW.draw();
  expect(win.document.getElementById("zf-startwarn").textContent).toContain("Your participants need time to join");
  s.when = { ms: Date.now() + 5 * 3600000, zone: "Asia/Kolkata" }; win.ZFLOW.draw();
  expect(win.document.getElementById("zf-startwarn") === null).toBe(true);
});

test("Prizes: won and left, the winner's ticket number and only the details that are held, and a Prize handed over tick that tells the game", async () => {
  reset({}, { "/prizes": { prizes: [{ round: 1, pattern: "full", ordinal: 1, seat: 42, name: "Asha", email: "a@x.com", via: "boss@acme.com" }, { round: 1, pattern: "top", ordinal: 1, seat: 7, given: true }] } });
  const win = page(); await wait();
  const d = win.document;
  expect(d.getElementById("zf-prizecount").textContent).toBe("2 won, 0 left · 1 handed over");
  const rows = [...d.querySelectorAll("#zf-prizes li")];
  expect(rows[0].textContent).toContain("Full House");
  expect(rows[0].textContent).toContain("Ticket number 42");
  expect(rows[0].textContent).toContain("Name: Asha · Email ID: a@x.com · Referred by: boss@acme.com");
  expect(rows[0].textContent).not.toContain("Mobile");
  expect(rows[1].textContent).toContain("No other details were given");
  calls.length = 0;
  rows[0].querySelector("input").checked = true; rows[0].querySelector("input").dispatchEvent(new win.Event("change")); await wait();
  expect(calls.find((c) => c.method === "POST")).toEqual({ url: "/api/z/EABCDEF/prizegiven", method: "POST", body: { round: 1, pattern: "full", ordinal: 1, seat: 42, given: true } });
});

test("the pretend Host / Co-host sign-in is gone (owner rule D): ?team=1&demo=roles shows no sign-in and no Co-host page", async () => {
  reset({}, { "/prizes": { prizes: [{ round: 1, pattern: "full", ordinal: 1, seat: 42, name: "Asha" }] } });
  const win = page("?flow=new&e=EABCDEF&team=1&demo=roles"); await wait();
  expect(win.document.getElementById("zf-signin") === null).toBe(true); expect(win.document.getElementById("zf-demo") === null).toBe(true);
});

test("What is happening: lines from the game's own log, and Online now from the presence count", async () => {
  reset({}, { "/gamelog": { people: { joined: 30, waiting: 2 }, prizes: [{ prize: "Top Line", ticket: 9, atMs: 1 }], lucky: [], pauses: [{ by: "The organizer", fromMs: 1, toMs: 2 }], warnings: [] }, "/presence": { listening: 21 } });
  const win = page(); await wait();
  const t = win.document.getElementById("zf-feed").textContent;
  expect(t).toContain("30 joined, 2 waiting for you.");
  expect(t).toContain("Top Line won by Ticket number 9.");
  expect(t).toContain("Paused by the organizer.");
  expect(win.document.getElementById("zf-online").textContent).toBe("Online now: about 21");
});

test("Next number in TWO places in Manual mode; one press calls once, locks both for 5 seconds, a second press only says so; Auto mode shows how numbers come", async () => {
  reset({ callMode: "host", startMs: Date.now() - 600000, gameMinutes: 60 });
  const win = page(); await wait();
  const d = win.document;
  expect(d.getElementById("zf-next-top").textContent).toBe("Press to Roll Out the Next Number");
  expect(d.getElementById("zf-next-bottom").textContent).toBe("Press to Roll Out the Next Number");
  expect(d.querySelector(".zf-lastline").textContent).toContain("Last number called");
  calls.length = 0;
  d.getElementById("zf-next-top").click(); await wait();
  expect(calls.filter((c) => c.url === "TBControl").length).toBe(1);
  expect(d.getElementById("zf-next-top").hasAttribute("disabled")).toBe(true);
  expect(d.getElementById("zf-next-bottom").hasAttribute("disabled")).toBe(true);
  expect(d.getElementById("zf-next-bottom").textContent).toMatch(/^Wait [1-5] s$/);
  win.ZFLOW.dash.lockUntil = Date.now() + 3000;
  await win.ZFLOW.pressNext();
  expect(calls.filter((c) => c.url === "TBControl").length).toBe(1);          // the second press did not call again
  expect(d.getElementById("zf-dashnote").textContent).toBe("Already called. Please wait a few seconds before the next number.");
  reset({ callMode: "auto", startMs: Date.now() - 600000, gameMinutes: 60 });
  const auto = page(); await wait();
  expect(auto.document.getElementById("zf-next-top").tagName).toBe("SPAN");
  expect(auto.document.querySelector(".zf-nextnum") === null).toBe(true);
});

test("Rehearsals: three cards from the game's own API, locked until paid, never the people limit; Start asks first, then tells the game", async () => {
  reset({ unpaid: true }, { "/rehearsals": { cards: [{ n: 1, state: "locked", reason: "First publish your game and pay. This unlocks your 3 rehearsals." }, { n: 2, state: "locked" }, { n: 3, state: "locked" }] } });
  const locked = page(); await wait();
  expect(locked.document.getElementById("zf-rehh").textContent).toBe("Practice before the real game");
  expect(locked.document.querySelectorAll(".zf-rehcard.grey").length).toBe(3);
  expect(locked.document.querySelector("[data-reh-start]") === null).toBe(true);
  reset({ unpaid: false }, { "/rehearsals": { cards: [{ n: 1, state: "ready" }, { n: 2, state: "locked" }, { n: 3, state: "locked" }] } });
  const win = page(); await wait();
  const d = win.document;
  expect(/\b20\b/.test(d.getElementById("zf-reh").textContent)).toBe(false);
  calls.length = 0;
  d.querySelector("[data-reh-start]").click();
  expect(calls.filter((c) => c.method === "POST").length).toBe(0);           // asks first
  d.querySelector("[data-reh-go]").click(); await wait();
  expect(calls.find((c) => c.method === "POST")).toEqual({ url: "/api/z/EABCDEF/rehearsal", method: "POST", body: { people: "published" } });
});

test("Rehearsal states: running has Open and Close; done has See what happened", async () => {
  reset({}, { "/rehearsals": { cards: [{ n: 1, state: "done", id: "EABCDEF-R1", dateMs: 1 }, { n: 2, state: "running", id: "EABCDEF-R2" }, { n: 3, state: "locked" }] } });
  const win = page(); await wait();
  const d = win.document;
  expect(d.querySelector('[data-reh="1"]').textContent).toContain("See what happened");
  expect(d.querySelector('[data-reh="2"]').textContent).toContain("Rehearsal 2 is on.");
  calls.length = 0;
  d.querySelector("[data-reh-close]").click(); await wait();
  expect(calls.find((c) => c.method === "POST").url).toBe("/api/z/EABCDEF-R2/rehearsalclose");
});

test("Completed: Make a copy makes a new draft with this game's prizes and opens step 1; Delete all participant data asks twice", async () => {
  reset({ startMs: Date.now() - 5 * 3600000, gameMinutes: 30, name: "Diwali party", cap: 100, tickets: 1, callSeconds: 12 });
  const win = page(); await wait();
  const d = win.document;
  expect(d.getElementById("zf-status").dataset.status).toBe("completed");
  expect(d.getElementById("zf-completed").textContent).toContain("within 24 hours");
  expect(d.getElementById("zf-erase") === null).toBe(true);   // the pack has no delete button; Corporate Tambola's own part adds one
  calls.length = 0;
  d.getElementById("zf-copygame").click(); await wait();
  const post = calls.find((c) => c.method === "POST" && c.url === "/api/z");
  expect(post.body.rewards.length).toBe(2); expect(post.body.cap).toBe(100); expect(post.body.name).toBe("Diwali party");
  expect(win.ZFLOW.state.eid).toBe(post.body.id); expect(win.ZFLOW.state.eid).not.toBe("EABCDEF");
  expect(win.ZFLOW.state.open).toBe(1);
});

test("More prizes holds Unlucky and the Lucky draw; the Lucky draw is saved as a break of kind lucky and takes one of the break places", async () => {
  reset();
  const win = page("?flow=new"); const F = win.ZFLOW, d = win.document;
  F.state.done[1] = F.state.done[2] = true; F.state.open = 3; F.state.eid = "EABCDEF"; F.draw();
  const heads = [...d.querySelectorAll("#zf-sec3 h3")].map((n: any) => n.textContent);
  expect(heads).toContain("More prizes");
  const order = [...d.querySelectorAll("#zf-sec3 [data-house]")].map((n: any) => n.dataset.house);
  expect(order.indexOf("unlucky")).toBeGreaterThan(order.indexOf("full")); // Unlucky sits under More prizes
  expect(order[order.length - 1]).toBe("lucky");
  d.getElementById("zf-tick-lucky").checked = true; d.getElementById("zf-tick-lucky").dispatchEvent(new win.Event("change"));
  const n = d.getElementById("zf-n-lucky"); n.value = "3"; n.dispatchEvent(new win.Event("change"));
  expect(F.luckyBreaks()).toEqual([{ kind: "lucky", title: "Gift voucher", winners: 3 }]);
  calls.length = 0;
  d.getElementById("zf-save3").click(); await wait();
  const put = calls.find((c) => c.method === "PATCH");
  expect(put.body.breaks).toEqual([{ kind: "lucky", title: "Gift voucher", winners: 3 }]);
  expect(F.breakMax(1, true)).toBe(2); expect(F.breakMax(2, true)).toBe(4); expect(F.breakMax(1, false)).toBe(3);
  expect(F.breakProblems([{ link: "https://youtu.be/a" }, { link: "https://youtu.be/a" }, { link: "https://youtu.be/a" }], 1, true)[0]).toContain("up to 2");
});

test("a game that says it has none of these (no flags) shows none of them", async () => {
  reset({}, { "/rehearsals": { cards: [] } });
  const win = page("?flow=new&e=EABCDEF", (w: any) => { /* the descriptor of this game runs first inside the page; override it after */ }); await wait();
  const bare = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" }) as any;
  bare.document.body.innerHTML = '<main id="app"></main>'; bare.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES }; bare.sessionStorage.setItem("ctz-org", "x");
  const packOnly = readFileSync(join(import.meta.dir, "../public/pack/zc-flow.js"), "utf8");
  new Function("window", "document", "location", "fetch", "sessionStorage", "window.ZFLOW_GAME = { tickets: [1] };\n" + packOnly)(bare, bare.document, bare.location, async (u: string) => ({ ok: true, json: async () => (u.endsWith("/info") ? { unpaid: false, startMs: START } : { ok: true }) }), bare.sessionStorage);
  await wait();
  const d = bare.document;
  const present = ["zf-reh", "zf-feed", "zf-online"].filter((id) => d.getElementById(id) !== null); expect(present.join(",")).toBe("");
  // the bottom row itself is always drawn (Big screen and Play the game links); what a no-flag game must not show is the next-number control in it
  expect(d.querySelector("#zf-bottomrow .zf-nextnum") === null).toBe(true);
  expect(d.querySelector('[data-house="lucky"]') === null).toBe(true);
  expect(win.document.getElementById("zf-reh") !== null).toBe(true); // while Tambola, which has them, does
});
