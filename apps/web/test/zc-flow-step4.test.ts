// New organizer flow, step 4 (2026-10-29): Brand & Breaks. Optional. Company name made safe, colour, logo, message breaks (1-ticket max 3, 2-ticket max 5), each one public link.
// FALSIFIED BY: flow-s4-break-max-wrong, flow-s4-link-any, flow-s4-name-unsafe, flow-s4-skip-saves, flow-s4-logo-without-name, flow-s4-youtube-missed
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

const src = readFileSync(join(import.meta.dir, "../public/zc-flow.js"), "utf8");
const calls: any[] = [];
function page(tix = 1) {
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000) };
  const fakeFetch = async (url: string, o: any = {}) => { calls.push({ url, method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null }); return { ok: true, json: async () => ({ ok: true }) }; };
  new Function("window", "document", "location", "fetch", src)(win, win.document, win.location, fakeFetch);
  const s = win.ZFLOW.state; s.done[1] = s.done[2] = s.done[3] = true; s.open = 4; s.eid = "EABCDEF"; win.ZFLOW.prizes.tix = tix; win.ZFLOW.draw();
  return win;
}
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const type = (win: any, id: string, v: string) => { const n = win.document.getElementById(id); n.value = v; n.dispatchEvent(new win.Event("input")); };

test("a link is YouTube (best), a direct video or audio file, or refused", () => {
  const F = page().ZFLOW;
  expect(F.linkKind("https://www.youtube.com/watch?v=abc123")).toBe("youtube");
  expect(F.linkKind("youtu.be/abc123")).toBe("youtube");
  expect(F.linkKind("https://cdn.example.com/hello.mp4")).toBe("file");
  expect(F.linkKind("https://example.com/page")).toBe(null);
  expect(F.linkKind("javascript:alert(1)")).toBe(null);
  expect(F.linkKind("")).toBe(null);
});

test("message breaks: 3 for a 1-ticket game, 5 for a 2-ticket game; the Add button goes away at the limit", () => {
  const win1 = page(1), F = win1.ZFLOW;
  expect(F.breakMax(1)).toBe(3); expect(F.breakMax(2)).toBe(5);
  for (let i = 0; i < 3; i++) win1.document.getElementById("zf-badd").click();
  expect(win1.document.querySelectorAll("[data-break]").length).toBe(3);
  expect(win1.document.getElementById("zf-badd")).toBe(null);
  const win2 = page(2);
  for (let i = 0; i < 5; i++) win2.document.getElementById("zf-badd").click();
  expect(win2.document.querySelectorAll("[data-break]").length).toBe(5);
  expect(win2.document.getElementById("zf-badd")).toBe(null);
  expect(F.breakProblems([{ link: "https://youtu.be/a" }, {}, {}, {}].map((b: any) => ({ link: "https://youtu.be/a", ...b })), 1)[0]).toContain("up to 3");
});

test("each break needs one public link, and the line says which break", () => {
  const F = page().ZFLOW;
  expect(F.breakProblems([{ link: "https://youtu.be/abc" }, { link: "hello" }], 1)[0]).toContain("Message break 2");
  expect(F.breakProblems([{ link: "https://youtu.be/abc" }], 1)).toEqual([]);
});

test("the company name is made safe for a ticket; a logo needs a name", () => {
  const F = page().ZFLOW;
  expect(F.brandNameClean("  Tom & Jerry's  \"Co\" ")).toBe("Tom and Jerry’s Co");
  expect(F.brandProblems({ name: "", logo: "data:image/png;base64,AAAA" })[0]).toContain("needs a company name");
  expect(F.brandProblems({ name: "Acme", logo: "data:..." })).toEqual([]);
});

test("Save sends the strip and the breaks; the opening and closing are left empty", async () => {
  calls.length = 0;
  const win = page(1), d = win.document;
  type(win, "zf-bname", "Acme & Sons");
  d.querySelector('[data-color="#1A7A46"]').click();
  d.getElementById("zf-badd").click();
  type(win, "zf-bt0", "Thank you"); type(win, "zf-bl0", "www.youtube.com/watch?v=abc123");
  d.getElementById("zf-save4").click(); await wait();
  const put = calls.find((c) => c.method === "PATCH");
  expect(put.body.brand).toEqual({ name: "Acme and Sons", color: "#1A7A46" });
  expect(put.body.breaks).toEqual([{ kind: "youtube", title: "Thank you", mediaUrl: "https://www.youtube.com/watch?v=abc123" }]);
  expect(put.body.opening).toEqual([]); expect(put.body.closing).toEqual([]); expect(put.body.tickets).toBe(1);
  expect(win.ZFLOW.state.open).toBe(5);
});

test("Skip this step sends nothing and still opens step 5", async () => {
  calls.length = 0;
  const win = page(1);
  win.document.getElementById("zf-skip4").click(); await wait();
  expect(calls.length).toBe(0);
  expect(win.ZFLOW.state.open).toBe(5);
});

test("words on this step follow the language guide", () => {
  const win = page(1);
  expect(win.ZFLOW.badWords(win.document.getElementById("zf-sec4").textContent)).toEqual([]);
});
