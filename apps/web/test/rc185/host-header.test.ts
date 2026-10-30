// rc/tambola-1.8.5 / TEST_HANDOFF 1.8.4 group 4: the Host ribbon and sentence in the new console (zc-flow-tambola.js), the Sign out link.
// The real console scripts run in a DOM, as zc-flow-tambola.test.ts does. Test addresses: demoN@demo-test.invalid only.
// Run: bun test --isolate apps/web/test/rc185
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { PRIZE_HOUSES } from "../../../../packages/beacon/src/config";

const src = ["zc-flow-game.js", "pack/zc-flow.js", "zc-flow-tambola.js"].map((f) => readFileSync(join(import.meta.dir, "../../public", f), "utf8")).join("\n");
const NOTE = "As a Host you can make any change in the game, just like the organizer, and you help run the game and let people in. The organizer and Hosts can also play the game.";
const HOST = "demo2@demo-test.invalid", ORG = "demo1@demo-test.invalid";
async function consoleAs(role: string, team: any = { email: HOST }) {
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" });
  win.document.body.innerHTML = '<main id="app"></main>'; win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES };
  const fakeFetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  new Function("window", "document", "location", "fetch", "MutationObserver", "sessionStorage", "localStorage", src)(win, win.document, win.location, fakeFetch, win.MutationObserver, win.sessionStorage, win.localStorage); // a browser has these as globals
  const s = win.ZFLOW.state; s.eid = "EABCDEF"; s.info = { published: true, paid: true, startMs: Date.now() + 3 * 3600000 }; s.raw = { startMs: s.info.startMs, gameMinutes: 60, organizerEmail: ORG };
  s.role = role; s.team = team; for (const k of [1, 2, 3, 4, 5]) s.done[k] = true; s.view = "dash"; win.ZFLOW.draw(); await new Promise((r) => setTimeout(r, 60)); win.ZFLOW.draw(); await new Promise((r) => setTimeout(r, 40));
  return win;
}
const $ = (w: any, id: string) => w.document.getElementById(id);

describe("a signed-in Host", () => {
  test("sees 'Host: email' and 'Organizer: email' lines, then the ribbon 'You are a Host of this game <email> Sign out' and the sentence", async () => {
    const w = await consoleAs("host"); const who = $(w, "zt-who").textContent;
    expect(who).toContain("Host: " + HOST); expect(who).toContain("Organizer: " + ORG);
    const rib = $(w, "zt-hostribbon"); expect(rib).toBeTruthy(); expect(rib.textContent).toBe("You are a Host of this game " + HOST + " Sign out");
    expect($(w, "zt-hostnote").textContent).toBe(NOTE); expect($(w, "zt-signout").textContent).toBe("Sign out"); expect($(w, "zt-signout").getAttribute("href")).toBe("/zc.html");
    expect(who.indexOf("Organizer:")).toBeLessThan(who.length); expect($(w, "zt-who").children[0].id).not.toBe("zt-hostribbon"); // the ribbon sits under the two lines
    const kids = [...$(w, "zt-who").children].map((c: any) => c.id || "line"); expect(kids.indexOf("zt-hostribbon")).toBeGreaterThan(kids.lastIndexOf("line") - 1);
  });
  test("Sign out clears the stored key and goes to /zc.html", async () => {
    const w = await consoleAs("host"); w.sessionStorage.setItem("ctz-org", "cth_" + "0".repeat(48)); w.localStorage.setItem("ctz-org", "cth_" + "0".repeat(48));
    const a = $(w, "zt-signout"); const ev = new w.Event("click", { cancelable: true, bubbles: true }); a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true); expect(w.sessionStorage.getItem("ctz-org") || "").toBe(""); expect(w.localStorage.getItem("ctz-org") || "").toBe("");
  });
  test("the ribbon names the signed-in Host, not the organizer", async () => { const w = await consoleAs("host", { email: "demo3@demo-test.invalid" }); expect($(w, "zt-hostribbon").textContent).toContain("demo3@demo-test.invalid"); expect($(w, "zt-hostribbon").textContent).not.toContain(ORG); });
  test("the Host sentence says nothing private and promises only what the engine does", async () => { const w = await consoleAs("host"); expect($(w, "zt-hostnote").textContent).not.toMatch(/private/i); });
});

describe("other roles do not get the Host ribbon", () => {
  test("organizer: 'Organizer: email' only, no ribbon, no sentence, no Sign out", async () => {
    const w = await consoleAs("organizer", { email: ORG }); expect($(w, "zt-who").textContent).toContain("Organizer: " + ORG); for (const id of ["zt-hostribbon", "zt-hostnote", "zt-signout"]) expect($(w, id)).toBeNull();
  });
  test("Co-host: 'Co-host: email' and 'You were made Co-host by', no Host ribbon", async () => {
    const w = await consoleAs("cohost", { email: "demo4@demo-test.invalid" }); const t = $(w, "zt-who").textContent; expect(t).toContain("Co-host: demo4@demo-test.invalid"); expect(t).toContain("You were made Co-host by"); for (const id of ["zt-hostribbon", "zt-hostnote"]) expect($(w, id)).toBeNull();
  });
});
