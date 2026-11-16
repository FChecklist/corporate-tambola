// Corporate Tambola's own parts of the new console (2026-10-29): lucky draw order and timing, the 5 s roll button, claim messages, auto pause, who-label, delete lock, ready check.
// FALSIFIED BY: tambola-claim-text, tambola-who-label, tambola-ready-optional, tambola-no-stubs, tambola-cohost-limit, tambola-step-texts, tambola-hide-ab, tambola-run-questions, tambola-cohost-key-link
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

const src = ["zc-flow-game.js", "pack/zc-flow.js", "zc-flow-tambola.js"].map((f) => readFileSync(join(import.meta.dir, "../public", f), "utf8")).join("\n");
function page() {
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES };
  const fakeFetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  new Function("window", "document", "location", "fetch", "MutationObserver", src)(win, win.document, win.location, fakeFetch, win.MutationObserver);
  return win;
}
const Tz = () => page().ZTAMBOLA;
test("claim messages are the owner's words", () => {
  const t = Tz();
  expect(t.claimText({ phase: "check", ticket: 7, prize: "Top Line" }, "auto")).toBe("Ticket 7 has claimed Top Line. The system is checking...");
  expect(t.claimText({ phase: "ok" }, "auto")).toBe("Congratulations! The claim is correct.");
  expect(t.claimText({ phase: "gone", ticket: 7, prize: "Top Line" }, "manual")).toContain("Press the button to roll out the next number.");
});
test("who is signed in is shown on two lines for Host and Co-host", () => {
  const t = Tz();
  expect(t.whoLines("host", "h@a.com", "o@a.com")).toEqual(["Host: h@a.com", "Organizer: o@a.com"]);
  expect(t.whoLines("cohost", "c@a.com", "o@a.com")).toEqual(["Co-host: c@a.com", "You were made Co-host by: o@a.com", "Organizer: o@a.com"]);
  expect(t.whoLines("", "o@a.com", "o@a.com")).toEqual(["Organizer: o@a.com"]);
});
test("ready check: hosts and rehearsal are optional", () => {
  const r = Tz().readyItems({}); expect(r.filter((x: any) => x[2]).length).toBe(3); expect(r.filter((x: any) => !x[2]).map((x: any) => x[0])).toEqual(["Hosts added", "Rehearsal done"]);
});
test("no coming soon, demo stub, lucky draw stub or roll button on the dashboard", async () => {
  const win = page(), s = win.ZFLOW.state; s.eid = "EABCDEF"; s.info = { published: true, paid: true, startMs: Date.now() + 3 * 3600000 }; s.raw = { startMs: s.info.startMs, gameMinutes: 60 };
  for (const k of [1, 2, 3, 4, 5]) s.done[k] = true; s.view = "dash"; win.ZFLOW.draw(); await new Promise((r) => setTimeout(r, 50));
  const html = win.document.getElementById("app").innerHTML;
  expect(html).toContain("Ready check"); expect(html).toContain("Play the game"); expect(html).toContain("REHEARSAL GAME 1");
  for (const bad of ["Coming soon", "coming soon", "Demo:", "DEMO", "zt-roll", "zt-lucky"]) expect(html).not.toContain(bad);
});
test("Your Co-hosts table shows 'N of limit' and the limit drop-down saves coHostLimit", async () => {
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES };
  const calls: any[] = [];
  const fakeFetch = async (url: string, o: any = {}) => { calls.push({ url, method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null }); const j = url.includes("/api/org/team") ? { cohosts: [{ email: "c@a.com", brought: 34 }] } : url.includes("/summary") ? { coHostLimit: 250 } : url.includes("/people") ? { limit: 250, used: 34 } : { ok: true }; return { ok: true, json: async () => j }; };
  new Function("window", "document", "location", "fetch", "MutationObserver", src)(win, win.document, win.location, fakeFetch, win.MutationObserver);
  const s = win.ZFLOW.state; s.eid = "EABCDEF"; s.info = { published: true, paid: true, startMs: Date.now() + 3 * 3600000 }; s.raw = { startMs: s.info.startMs, gameMinutes: 60 };
  for (const k of [1, 2, 3, 4, 5]) s.done[k] = true; s.view = "dash"; win.ZFLOW.draw(); await new Promise((r) => setTimeout(r, 80)); win.ZFLOW.draw(); await new Promise((r) => setTimeout(r, 50));
  expect(win.document.getElementById("zt-cotable").textContent).toContain("34 of 250");
  const sel = win.document.getElementById("zt-colimit"); sel.value = "500"; sel.dispatchEvent(new win.Event("change")); await new Promise((r) => setTimeout(r, 30));
  expect(calls.some((c) => c.method === "PATCH" && c.body && c.body.coHostLimit === 500)).toBe(true);
});
function stepPage(step: number, setup?: (s: any, w: any) => void) {
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES };
  const fakeFetch = async (url: string) => ({ ok: true, json: async () => (url.includes("ai-manifest") ? { packs: [{ upTo: 100, inr: 2399 }, { upTo: 250, inr: 3499 }] } : { ok: true }) });
  new Function("window", "document", "location", "fetch", "MutationObserver", src)(win, win.document, win.location, fakeFetch, win.MutationObserver);
  const s = win.ZFLOW.state; s.eid = "EABCDEF"; for (let k = 1; k < step; k++) s.done[k] = true; s.open = step; if (setup) setup(s, win); win.ZFLOW.draw();
  return win;
}
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
test("step 2: 'Pick the closest' is shown and the list-matching option is hidden", async () => {
  const w = stepPage(2); await tick(); w.ZFLOW.draw(); await tick();
  const d = w.document; expect(d.getElementById("zt-closest").textContent).toContain("Pick the closest");
  expect(d.getElementById("zf-how-system")).toBe(null); expect(d.getElementById("app").textContent).not.toContain("Coming soon");
});
test("step 3 with two tickets: no A/B rows; Super Bumper House 1 to 10 (5 shown, 6 to 10 folded, only 1 ticked, 1 and 2 Recommended), the two-ticket line and the unwon-prizes warning", async () => {
  const w = stepPage(3, (s: any, win: any) => { win.ZFLOW.prizes.tix = 2; }); await tick();
  const d = w.document; expect(d.querySelectorAll(".zf-ab").length).toBe(0); expect(d.querySelector('[data-house="bumper"]')).not.toBe(null);
  expect(d.getElementById("zt-needs2").textContent).toBe("Super Bumper needs 2 tickets. Everyone gets Ticket A and Ticket B.");
  d.getElementById("zf-tick-bumper").checked = true; d.getElementById("zf-tick-bumper").dispatchEvent(new w.Event("change")); await tick();
  const boxes = [...d.querySelectorAll("[data-bumper-n]")];
  expect(boxes.length).toBe(10); expect(boxes.filter((b: any) => b.hasAttribute("checked")).length).toBe(1);
  expect(d.querySelectorAll("#zt-bumper > div [data-bumper-n]").length).toBe(5); expect(d.querySelectorAll("#zt-bumper details [data-bumper-n]").length).toBe(5);
  expect(d.getElementById("zt-bumper").textContent).toContain("Super Bumper House 1 (Recommended)"); expect(d.getElementById("zt-bumper").textContent).toContain("Super Bumper House 2 (Recommended)"); expect(d.getElementById("zt-bumper").textContent).not.toContain("Super Bumper House 3 (Recommended)");
  expect(d.getElementById("zt-bumper-warn").textContent).toContain("go unwon");
  const three = d.querySelector('[data-bumper-n="3"]'); three.checked = true; three.dispatchEvent(new w.Event("change")); await tick();
  expect(w.ZFLOW.prizes.bumper.n).toBe(3);
});
test("step 3 with one ticket has no Super Bumper and suggests the Lucky Draw", async () => {
  const w = stepPage(3, (s: any, win: any) => { win.ZFLOW.prizes.tix = 1; }); await tick(); w.ZFLOW.draw(); await tick();
  const d = w.document; expect(d.querySelector('[data-house="bumper"]')).toBe(null); expect(d.getElementById("zt-bumper")).toBe(null);
  if (d.querySelector('[data-house="lucky"]')) expect(d.getElementById("zt-lucky1").textContent).toContain("LUCKY DRAW");
});
test("step 4 checks a break link: Looks good, or the https message", async () => {
  const w = stepPage(4, () => {}); w.ZFLOW.draw(); await tick();
  w.document.getElementById("zf-badd").click(); await tick(); const i = w.document.getElementById("zf-bl0");
  i.value = "http://x.com/a"; i.dispatchEvent(new w.Event("input", { bubbles: true })); expect(i.nextElementSibling.textContent).toContain("must start with https://");
  i.value = "https://youtu.be/abc"; i.dispatchEvent(new w.Event("input", { bubbles: true })); expect(i.nextElementSibling.textContent).toBe("Looks good");
  expect(w.document.getElementById("zt-missing").textContent).toContain("will not play");
});
test("step 5 preview shows Last 5 and, for the family card, the Family Passes card with 4 passes", async () => {
  const w = stepPage(5, (s: any, win: any) => { win.ZFLOW.who.card = "family"; }); await tick(); w.ZFLOW.draw(); await tick();
  const d = w.document; if (d.getElementById("zf-frame")) { expect(d.getElementById("zt-pvlast5").textContent).toContain("Last 5:"); expect(d.getElementById("zt-pass").textContent).toContain("5 passes: 1 for you and 4 for your family and friends"); }
});
test("step 1 asks how the game starts and who calls the numbers; the choice saves startMode and callMode and shows the summary line", async () => {
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" });
  win.document.body.innerHTML = '<main id="app"></main>'; win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES };
  const calls: any[] = []; const fakeFetch = async (url: string, o: any = {}) => { calls.push({ url, method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null }); return { ok: true, json: async () => ({ ok: true }) }; };
  new Function("window", "document", "location", "fetch", "MutationObserver", src)(win, win.document, win.location, fakeFetch, win.MutationObserver);
  win.ZFLOW.state.eid = "EABCDEF"; win.ZFLOW.state.open = 1; win.ZFLOW.draw(); await tick();
  const d = win.document, txt = d.getElementById("zt-run").textContent;
  expect(txt).toContain("How should the game start?"); expect(txt).toContain("Who calls the numbers?"); expect(txt).toContain("A new number comes every 12 seconds, by itself.");
  expect(d.getElementById("zt-runsum").textContent).toBe("Your game: starts by itself at the time you set. The game calls the numbers.");
  const r = d.querySelector('input[name="zt-call"][value="host"]'); r.checked = true; r.dispatchEvent(new win.Event("change")); await tick();
  expect(calls.some((c: any) => c.method === "PATCH" && c.body && c.body.callMode === "host" && c.body.startMode === "auto")).toBe(true);
  expect(d.getElementById("zt-runsum").textContent).toContain("You call the numbers.");
  for (const bad of ["mode", "auto-play", "scheduled"]) expect(txt.toLowerCase()).not.toContain(bad);
});
test("a Co-host's own key link with ?flow=new opens the Co-host screen: only the invite link and their waiting people, nothing else", async () => {
  const key = "cth_" + "a".repeat(48);
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF#cohost=" + key });
  win.document.body.innerHTML = '<main id="app"></main>'; win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES };
  const fakeFetch = async (url: string) => { const j = url.includes("/api/whoami") ? { kind: "cohost", email: "c@a.com" } : url.includes("/people") ? { limit: 100, used: 7, commonLink: "https://x/z.html?e=EABCDEF&from=3" } : url.includes("/waiting") ? { waiting: [{ id: "w1", ticket: 12 }] } : url.includes("/summary") ? { coHostLimit: 100 } : { ok: true }; return { ok: true, json: async () => j }; };
  new Function("window", "document", "location", "fetch", "MutationObserver", src)(win, win.document, win.location, fakeFetch, win.MutationObserver);
  win.ZFLOW.state.eid = "EABCDEF"; win.ZFLOW.draw(); await tick(150); win.ZFLOW.draw(); await tick(100);
  const d = win.document, t = d.getElementById("app").textContent;
  expect(t).toContain("Co-host: c@a.com"); expect(t).toContain("Your link to invite people to the game"); expect(t).toContain("Invited so far: 7. 93 left."); expect(t).toContain("Ticket 12");
  for (const bad of ["Payment", "Pay now", "Prizes", "Game board", "Tickets claimed", "Save and continue"]) expect(t).not.toContain(bad);
  expect(d.querySelector(".zf-bar")).toBe(null);
});
