// New organizer flow, step 2 (2026-10-29): three cards, how people are let in, size from the real pack list, and what is saved.
// FALSIFIED BY: flow-s2-card-family-off, flow-s2-system-enabled, flow-s2-size-not-from-ladder, flow-s2-saves-wrong-cap, flow-s2-money-rs
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

const src = ["zc-flow-game.js", "pack/zc-flow.js"].map((f) => readFileSync(join(import.meta.dir, "../public", f), "utf8")).join("\n");
const calls: any[] = [];
const PACKS = [{ upTo: 100, inr: 2999 }, { upTo: 250, inr: 3799 }, { upTo: 500, inr: 4999 }];
function page(packs: any[] = PACKS) {
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000) };
  const fakeFetch = async (url: string, o: any = {}) => { calls.push({ url, method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null }); return { ok: true, json: async () => (url.endsWith("ai-manifest") ? { packs } : { ok: true }) }; };
  new Function("window", "document", "location", "fetch", src)(win, win.document, win.location, fakeFetch);
  win.ZFLOW.state.done[1] = true; win.ZFLOW.state.open = 2; win.ZFLOW.state.eid = "EABCDEF"; win.ZFLOW.draw();
  return win;
}
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test("the size list is the game's real pack list, with ₹ prices, smallest already chosen", async () => {
  calls.length = 0;
  const win = page(); await wait();
  const opts = [...win.document.querySelectorAll("#zf-size option")].map((o: any) => o.textContent);
  expect(opts).toEqual(["Up to 100 participants · ₹2,999", "Up to 250 participants · ₹3,799", "Up to 500 participants · ₹4,999"]);
  expect(win.document.getElementById("zf-size").value).toBe("100");
  expect(calls[0].url).toBe("/api/z/ai-manifest");
});

const ALL_PACKS = [[100, 2999], [250, 3799], [500, 4999], [750, 6299], [1000, 7499], [2500, 11999], [5000, 17999], [10000, 29999]].map(([upTo, inr]) => ({ upTo, inr }));
test("owner pricing update 2026-11-23: three cups (Small, Medium 'Most chosen', Large) first; the five other sizes only behind 'See more sizes'; the saved size is still the list's value", async () => {
  const win = page(ALL_PACKS); await wait();
  const d = win.document;
  expect([...d.querySelectorAll(".zf-cup b")].map((b: any) => b.textContent)).toEqual(["Small", "Medium · Most chosen", "Large"]);
  expect([...d.querySelectorAll(".zf-cup span")].map((b: any) => b.textContent)).toEqual(["Up to 100 participants · ₹2,999", "Up to 500 participants · ₹4,999", "Up to 1000 participants · ₹7,499"]);
  expect(d.querySelector(".zf-cup.on b").textContent).toBe("Small"); // the smallest is chosen for you
  const more = d.getElementById("zf-more"); expect(more.querySelector("summary").textContent).toBe("See more sizes"); expect(more.hasAttribute("open")).toBe(false);
  expect([...more.querySelectorAll("#zf-size option")].map((o: any) => o.value)).toEqual(["100", "250", "500", "750", "1000", "2500", "5000", "10000"]);
  d.querySelector('[data-cup="500"]').click(); await wait();
  expect(win.ZFLOW.who.upTo).toBe(500); expect(d.querySelector(".zf-cup.on b").textContent).toBe("Medium · Most chosen");
  const sel = d.getElementById("zf-size"); sel.value = "2500"; sel.dispatchEvent(new win.Event("change")); await wait();
  expect(d.querySelectorAll(".zf-cup.on").length).toBe(0); expect(d.getElementById("zf-more").hasAttribute("open")).toBe(true); // a size that is not a cup shows its own list open
});

test("three cards; the list option is hidden (no coming soon), everybody waits for you", async () => {
  const win = page(); await wait();
  const d = win.document;
  expect([...d.querySelectorAll(".zf-card b")].map((b: any) => b.textContent)).toEqual(["Your people", "Your people and their families", "Extended family"]);
  expect(d.getElementById("zf-how-system")).toBe(null);
  expect(d.getElementById("zf-how").textContent).toContain("waits for you");
  expect(d.querySelector(".zf-opt .zf-soon")).toBe(null);
});

test("what each card saves; family cards let each person bring 1 to 10 (4 unless the organizer chooses)", () => {
  const F = page().ZFLOW;
  expect(F.audienceSettings("people", 100)).toEqual({ cap: 100, whoCanJoin: "list", verify: "id", callMode: "auto", demo: false, invites: { on: false, per: 4, cats: [] } });
  expect(F.audienceSettings("family", 250).invites).toEqual({ on: true, per: 4, cats: ["family"] });
  expect(F.audienceSettings("extended", 250).invites.cats).toEqual(["family", "colleagues"]);
  expect(F.audienceSettings("family", 250, 10).invites.per).toBe(10); expect(F.audienceSettings("family", 250, 1).invites.per).toBe(1);
  expect(F.audienceSettings("family", 250, 99).invites.per).toBe(10); expect(F.audienceSettings("family", 250, 0).invites.per).toBe(4);
  expect(F.whoProblems({ card: "x", upTo: 100 }, F.packChoices(PACKS))[0]).toContain("who");
  expect(F.whoProblems({ card: "people", upTo: 7 }, F.packChoices(PACKS))[0]).toContain("size");
});

test("Save and continue sends the card and the chosen size to the game, then step 3 opens", async () => {
  calls.length = 0;
  const win = page(); await wait();
  const d = win.document;
  d.querySelector('[data-card="family"]').click();
  const sel = d.getElementById("zf-size"); sel.value = "250"; sel.dispatchEvent(new win.Event("change"));
  d.getElementById("zf-save2").click(); await wait();
  const put = calls.find((c) => c.method === "PATCH");
  expect(put.url).toBe("/api/z/EABCDEF/settings");
  expect(put.body.cap).toBe(250);
  expect(put.body.invites.on).toBe(true);
  expect(win.ZFLOW.state.open).toBe(3);
});

test("words on this step follow the language guide", async () => {
  const win = page(); await wait();
  const text = win.document.getElementById("zf-sec2").textContent;
  expect(win.ZFLOW.badWords(text)).toEqual([]);
  expect(text).not.toContain("Rs");
});

// 20 Nov 2026 (owner): "Invite people with just an ID". The owner's text word for word; a visible Paste a list button; one ID per line; no Name or Mobile; family 1 to 10 (default 4).
test("the owner's ID-invite text is on step 2 word for word; Paste a list sends IDs only; family picks 1 to 10", async () => {
  calls.length = 0;
  const win = page(); await wait();
  const d = win.document, box = d.getElementById("zf-idinvite").textContent;
  for (const line of ["Invite people with just an ID", "No names or personal details are needed.", "Just upload or paste the IDs of the people you want to invite: employee ID, associate ID, vendor ID or customer ID, whichever you use.", "Your invitee opens the game link and enters their ID. If it is on your list, they join and play. If it is not, you get a request to approve or decline.", "The list and all IDs are deleted within 24 hours after the game ends."]) expect(box.includes(line)).toBe(true);
  expect(d.getElementById("zf-per")).toBe(null); // "Your people" has no family
  d.querySelector('[data-card="family"]').click();
  const per = [...d.querySelectorAll("#zf-per option")].map((o: any) => o.textContent); expect(per).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]); expect(d.getElementById("zf-per").value).toBe("4");
  const t = d.getElementById("zf-sec2").textContent; expect(/Name|Mobile|mobile number|Anyone with the link/.test(t.replace("No names or personal details are needed.", ""))).toBe(false);
  d.getElementById("zf-paste-open").click(); const ta = d.getElementById("zf-paste"); expect(!!ta).toBe(true);
  ta.value = "A-1101\nA 1101\nB2202"; ta.dispatchEvent(new win.Event("input"));
  d.getElementById("zf-paste-go").click(); await wait(60);
  const post = calls.find((c) => c.method === "POST" && c.url === "/api/z/EABCDEF/people");
  expect(post.body.people).toEqual([{ empId: "A-1101" }, { empId: "A 1101" }, { empId: "B2202" }]); // the game turns all three spellings of A1101 into one person
  expect(JSON.stringify(post.body)).not.toMatch(/name|phone|mobile/i);
});
