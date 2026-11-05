// The simpler organizer console: rarely used controls are only HIDDEN (never removed), the prize counts are capped by hiding, and the result panel lets the organizer change a winner.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newWorld, openPage, roundAt, roundMs, T, type Page } from "./harness";

setDefaultTimeout(60_000);
const START = roundAt(T) + 1200;
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer() {
  const w = newWorld();
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string, aiMessage: s.aiMessage as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const make = (o: O, id: string) => o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100 }, o.aiKey);
async function consoleOf(o: O, eid: string, afterLoad?: (win: any, f: string) => void) {
  const p = await openPage(o.world, { url: `http://localhost/zc?e=${eid}`, html: "zc.html", scripts: ["zgame.js", "control.js", "zc.js"], session: { "ctz-org": o.token, "ctz-aimsg": o.aiMessage }, afterLoad } as any);
  open.push(p); await p.waitFor((x) => /Hello|Last step|Your game/i.test(x)); return p;
}
const openStep = (p: Page, n: number) => p.click(`.zc-dot[data-open="${n}"]`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** true when the element is inside a hidden wrapper (the one CSS class the console uses to hide) */
const hidden = (el: any) => !!el && !!el.closest("[data-hidden]");
const visibleChips = (p: Page, path: string) => [...p.win.document.querySelectorAll(`[data-ck="${path}"]`)].filter((e: any) => !hidden(e)).map((e: any) => e.dataset.v);

describe("simpler organizer console", () => {
  test("the limits live in one place at the top of zc.js", () => {
    const src = readFileSync(join(import.meta.dir, "../public/zc.js"), "utf8");
    expect(src).toMatch(/const PRIZE_MAX = \{ line: 5, other: 5, house: 10, bumper: 10 \}/);
    expect(src).toMatch(/const HIDE_ADVANCED = true/);
    expect(src).toMatch(/const prizeClassOf = /);
  });

  test("step 2: only round 1 is offered, the other round choices stay hidden, and the stored value is 1", async () => {
    const o = await organizer(); await make(o, "SC-RND"); const p = await consoleOf(o, "SC-RND"); openStep(p, 2);
    expect(!!p.$('[data-ck="rnd"][data-v="1"]')).toBe(true); // the control still exists (hidden, not removed)
    expect(!!p.$('[data-ck="rnd"][data-v="2"]')).toBe(false); // only round 1 is rendered
    expect(hidden(p.$('[data-ck="rnd"][data-v="1"]'))).toBe(true);
    expect((p.win as any).__zc.f.rnd).toBe("1");
  });

  test("step 3: the tie question is hidden and the stored value stays 'next'; prize counts are capped by class", async () => {
    const o = await organizer(); await make(o, "SC-TIE"); const p = await consoleOf(o, "SC-TIE"); openStep(p, 3);
    expect(hidden(p.$('[data-ck="ties"][data-v="next"]'))).toBe(true);
    expect((p.win as any).__zc.f.ties).toBe("next");
    // open every prize so its count chips are drawn
    const f = (p.win as any).__zc.f;
    for (const [k, cap] of [["top", 5], ["early5", 5], ["full", 10]] as const) {
      f.ph = k; f.hs[k].on = true; (p.win as any).__zcMode((p.win as any).__zc.mode);
      const shown = visibleChips(p, `hs.${k}.n`).map(Number);
      expect(Math.max(...shown)).toBe(cap);
      expect(shown.includes(20)).toBe(false);
      expect(hidden(p.$(`#f-hs-${k}-n`))).toBe(true); // the typed "how many" box is hidden too
    }
  });
});

describe("step 9 (game day): the result is the software's, the organizer has the final say", () => {
  let rows: any[] = [];
  async function dayPage(r: any[]) {
    rows = r;
    const o = await organizer(); await make(o, "SC-OV"); o.world.now = roundMs(START) + 120_000;
    const posts: any[] = [];
    const p = await consoleOf(o, "SC-OV", (win: any, f: string) => {
      if (f !== "control.js") return; const real = win.fetch;
      win.fetch = async (input: any, init?: any) => {
        const u = new URL(String(input), "http://localhost"), m = (init?.method || "GET").toUpperCase();
        if (m === "GET" && /\/prizes$/.test(u.pathname)) return new Response(JSON.stringify({ prizes: rows }), { status: 200, headers: { "content-type": "application/json" } });
        if (m === "POST" && /\/override$/.test(u.pathname)) { posts.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }); }
        return real(input, init);
      };
    });
    openStep(p, 9); await sleep(300);
    const z = (p.win as any).__zc; z.started = true; z.draft = false; z.prizes = rows; (p.win as any).__zcMode(z.mode); await sleep(50);
    return { p, posts };
  }
  const row = (extra: any) => ({ round: 1, pattern: "top", ordinal: 1, seat: 3, name: "Asha", phone: "9", ...extra });

  test("the plain-words line shows under the list; 'Change winner' shows only when the server says canOverride:true", async () => {
    const { p } = await dayPage([row({ canOverride: true, claimants: [{ seat: 3, label: "Asha" }, { seat: 7, label: "Ravi" }] }), row({ ordinal: 2, seat: 5, name: "Meena" })]);
    expect(p.text()).toMatch(/This is the result the software worked out\. You have the final say: you can change who gets a prize\./);
    expect(p.win.document.querySelectorAll("[data-ovopen]").length).toBe(1); // only the row that said canOverride
  });

  test("without the field the button never shows", async () => {
    const { p } = await dayPage([row({})]);
    expect(p.win.document.querySelectorAll("[data-ovopen]").length).toBe(0);
  });

  test("tapping a claimant, or Nobody, posts the override", async () => {
    const { p, posts } = await dayPage([row({ canOverride: true, claimants: [{ seat: 3, label: "Asha" }, { seat: 7, label: "Ravi" }] })]);
    p.click("[data-ovopen]"); await sleep(30);
    expect(p.win.document.querySelectorAll("[data-ov]").length).toBe(3); // two claimants and Nobody
    p.click('[data-ov="0"][data-ovj="1"]'); await sleep(100);
    expect(posts[0]).toEqual({ round: 1, pattern: "top", ordinal: 1, seat: 7 });
    await sleep(400); { const z = (p.win as any).__zc; z.started = true; z.draft = false; z.prizes = rows; (p.win as any).__zcMode(z.mode); } p.click("[data-ovopen]"); await sleep(30); p.click('[data-ov="0"][data-ovj="-1"]'); await sleep(100);
    expect(posts[1]).toEqual({ round: 1, pattern: "top", ordinal: 1, seat: null });
  });
});
