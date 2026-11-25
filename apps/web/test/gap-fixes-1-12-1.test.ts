// 1.12.1 (25 Nov 2026): the owner's gap list on top of the three-cups release. One test (or more) for each item: prices (one constant), wording, claim rules, prize presets behind "More options",
// the organizer's claims queue and wrong-claim view, the pause words, the AI manual (payee, credits, the AI may not pay), host -> co-organizer, no nickname.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { CUP_PRICES, CUPS, PACKS } from "../../../packages/shared/src/pricing";
import { PRIZE_HOUSES, claimLinesForPlayer } from "../../../packages/beacon/src/config";
import { claimsQueue } from "../../../packages/beacon/src/claims-view";
import { manualText } from "../../edge/src/ai-link";
import { PAYEE, PAYEE_NAME } from "../../edge/src/v2-types";

const pub = (f: string) => readFileSync(join(import.meta.dir, "../public", f), "utf8");
const text = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&#8377;/g, "₹").replace(/\s+/g, " ");
const MARKETING = ["index.html", "pricing.html", "brochure.html", "about.html", "partner.html"];

describe("PRICING: the owner's three prices live in ONE constant", () => {
  test("CUP_PRICES is 2,872 / 4,872 / 7,882 and the three cups read it", () => {
    expect(CUP_PRICES).toEqual({ small: 2872, medium: 4872, large: 7882 });
    for (const c of CUPS) expect(PACKS.find((p) => p[0] === c.upTo)![1]).toBe(CUP_PRICES[c.key]);
    expect(CUPS.find((c) => c.mostChosen)!.key).toBe("medium");
  });
  test("the browser copy (common.js) has the same constant and the same list", () => {
    const win: any = new Window({ url: "http://localhost/" }); new Function("window", "document", pub("common.js")).call(win, win, win.document);
    expect(JSON.parse(JSON.stringify(win.TB.CUP_PRICES))).toEqual(CUP_PRICES);
    expect(JSON.parse(JSON.stringify(win.TB.PACKS))).toEqual(PACKS.map((x) => [...x]));
  });
  test("the pages show the three prices, no GST, no money-back promise, never the old 'no data' claim", () => {
    const price = text(pub("pricing.html"));
    for (const n of ["2,872", "4,872", "7,882"]) { expect(price).toContain("₹" + n); expect(text(pub("index.html")) + text(pub("brochure.html"))).toContain(n); }
    for (const f of MARKETING) { const t = text(pub(f)); expect(t).not.toMatch(new RegExp(["money.back", "no data is " + "taken", "100% " + "secure"].join("|"), "i")); expect(t).not.toMatch(/\bGST (of|at|18)|incl(uding|usive of) GST/i); }
    expect(price).toContain("Players' details are erased within 24 hours");
  });
});

describe("(a) WORDING: game and player, Pay now and credits, no gateway name on marketing pages", () => {
  test("marketing pages and the Housie pages say game / player, never engagement / participant", () => {
    for (const f of [...MARKETING, "zc.js", "pack/zc-flow.js", "play.js", "console.js"]) {
      const t = f.endsWith(".html") ? text(pub(f)) : pub(f).replace(/^\s*(\/\/|\/\*).*$/gm, "").replace(/["'`](participants?|engagements?)["'`]/g, ""); // a quoted single word is a code value (a role, a type, a group name), not text
      const bad = [...t.matchAll(/[^\n"'`<>]{0,30}\b(engagements?|participants?)\b[^\n"'`<>]{0,20}/gi)].map((m) => m[0]).filter((s) => !/\.(engagements?|participants?)\b|[.\w]\s*(engagement|participants?)\b\s*[:(=,.]|\.participants|participants?[A-Z_]|participants\)|\/participants|data-|S\.|r\.participants|pr\.|["'] ?participants?["']|api\//i.test(s));
      expect({ f, bad: bad.slice(0, 3) }).toEqual({ f, bad: [] });
    }
  });
  test("never Razorpay on a marketing page; payments are named once: IT Services by Rajat Agarwal through Moneypenny credits", () => {
    for (const f of MARKETING) { const t = text(pub(f)); expect(t).not.toMatch(/razorpay/i); }
    expect(text(pub("pricing.html"))).toContain("IT Services by Rajat Agarwal, through Moneypenny credits");
    expect(text(pub("index.html"))).toContain("through Moneypenny credits");
    expect(pub("site.js")).toContain("Pay now"); expect(pub("site.js")).not.toContain("Pay securely with Razorpay");
  });
  test("the payee wording is the payee record's own name", () => { expect(PAYEE.toLowerCase().startsWith(PAYEE_NAME.toLowerCase())).toBe(true); });
});

describe("(b) CLAIM RULES for players", () => {
  test("short lines: one claim is one prize, a wrong claim is shown and the game goes on, ties follow the real setting", () => {
    for (const ties of ["next", "share", undefined]) {
      const l = claimLinesForPlayer(ties); expect(l.length).toBe(3);
      expect(l[0]).toContain("One Claim is for one prize"); expect(l[1]).toContain("wrong"); expect(l[1]).toContain("the game goes on");
      expect(l.join(" ")).not.toMatch(/\b(your|my|mine|yours)\b/i);
    }
    expect(claimLinesForPlayer("next")[2]).toContain("one after the other"); expect(claimLinesForPlayer("share")[2]).toContain("share that prize");
    expect(claimLinesForPlayer("share")[2]).not.toContain("one after the other");
  });
  test("the phone page shows them from the shared function, and the shared bundle carries it", () => {
    expect(pub("z.js")).toContain('id="claimrules"'); expect(pub("z.js")).toContain("ZG.claimLinesForPlayer"); expect(pub("zgame.js")).toContain("One Claim is for one prize");
  });
});

describe("(c) PRIZE HOUSES: presets first, the rest behind More options (nothing removed)", () => {
  const src = ["zc-flow-game.js", "pack/zc-flow.js"].map((f) => pub(f)).join("\n");
  function page() {
    const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" }); win.document.body.innerHTML = '<main id="app"></main>';
    win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES };
    new Function("window", "document", "location", "fetch", src)(win, win.document, win.location, async () => ({ ok: true, json: async () => ({ ok: true }) }));
    const s = win.ZFLOW.state; s.done[1] = true; s.done[2] = true; s.open = 3; s.eid = "EABCDEF"; win.ZFLOW.draw(); return win;
  }
  test("the five recommended houses are shown; every other house is inside 'More options'; all of them are still there", () => {
    const d = page().document;
    const outside = [...d.querySelectorAll("#zf-sec3 [data-house]")].filter((n: any) => !n.closest("#zf-more-houses")).map((n: any) => n.dataset.house);
    const inside = [...d.querySelectorAll("#zf-more-houses [data-house]")].map((n: any) => n.dataset.house);
    expect(outside.slice(0, 5)).toEqual(["early5", "top", "mid", "bot", "full"]);
    expect(d.querySelector("#zf-more-houses summary")!.textContent).toBe("More options");
    expect(inside.length).toBeGreaterThanOrEqual(10);
    const all = new Set([...outside, ...inside]); for (const h of PRIZE_HOUSES.filter((x) => x.id !== "full2")) expect(all.has(h.id)).toBe(true);
    expect(d.getElementById("zf-more-houses")!.hasAttribute("open")).toBe(false);
  });
  test("a house ticked from the list opens 'More options' when the step is drawn again", () => {
    const win = page(); win.ZFLOW.prizes.sel.plus.on = true; win.ZFLOW.draw();
    expect(win.document.getElementById("zf-more-houses")!.hasAttribute("open")).toBe(true);
  });
});

describe("(d) ORGANIZER: claims queue, wrong-claim view, pause words", () => {
  const C = (t: number, pattern: string, idx: number, atMs: number, bogey = false) => ({ pid: `${t}x0123456789ab`, pattern, round: 1, idx, atMs, bogey });
  test("the queue is oldest first with what came of each claim; wrong claims are counted per ticket and prize, two put it out", () => {
    const claims = [C(7, "top", 20, 2000), C(3, "top", 20, 1000), C(9, "full", 80, 3000), C(5, "top", -1, 1500, true), C(5, "top", -1, 1800, true), C(6, "mid", -1, 900, true)];
    const r = claimsQueue(claims, [{ pattern: "top", round: 1, ordinal: 1, count: 1, tickets: [3] }], 2);
    expect(r.queue.map((x) => [x.ticket, x.status])).toEqual([[3, "won"], [7, "not-a-winner"], [9, "being-checked"]]);
    expect(r.waiting).toBe(1);
    expect(r.wrong.map((x) => [x.ticket, x.pattern, x.times, x.out])).toEqual([[5, "top", 2, true], [6, "mid", 1, false]]);
    expect(claimsQueue([], [], 2)).toEqual({ queue: [], wrong: [], waiting: 0 });
  });
  test("the game-day screen has the queue and the wrong-claim block, and the bundle carries the function", () => {
    const z = pub("zc.js"); expect(z).toContain('id="claimsqueue"'); expect(z).toContain('id="wrongclaims"'); expect(z).toContain("claimsQueueBlock() + rewardsBlock()"); expect(pub("zgame.js")).toContain("being-checked");
  });
  test("pause: phones show Paused as soon as they get it, and the page says plainly what happens after 30 minutes (only what the code does)", () => {
    const z = pub("zc.js");
    expect(z).toContain('Phones show "Paused" as soon as they receive it'); expect(z).toContain("This is the fastest the design allows");
    expect(z).toContain("the pause ends by itself after 30 minutes and the numbers start again");
  });
});

describe("(e) AI help names the payee and credits, and says what the AI may and may not do", () => {
  const man = manualText("https://x.example", "cta_" + "a".repeat(48), "ai", Date.UTC(2026, 10, 25));
  test("the manual: payee, Moneypenny credits, pre-game and winner messages allowed, paying not allowed, cta_ refused at checkout", () => {
    expect(man).toContain(PAYEE_NAME); expect(man).toContain("Moneypenny credits"); expect(man).toContain("pre-game message and the winner messages");
    expect(man).toContain("You may NOT pay"); expect(man).toContain("checkout accepts only organizer and co-organizer keys"); expect(man).toContain("cta_");
    expect(man.split("\n").filter((l) => l.includes("Moneypenny")).join(" ")).not.toMatch(/razorpay/i);
  });
  test("llms.txt and the AI page say the same", () => {
    for (const t of [pub("llms.txt"), text(pub("ai-prompt.html"))]) { expect(t).toContain("Moneypenny credits"); expect(t).toContain("IT Services by Rajat Agarwal"); expect(t).toContain("cta_"); expect(t).toMatch(/pre-game/); expect(t).toMatch(/cannot pay|may not pay/); }
  });
});

describe("(f) co-organizer, no nickname", () => {
  test("player and organizer pages say Co-organizer for the helper role (never 'a Host') and carry no nickname", () => {
    for (const f of ["zc.js", "pack/zc-flow.js", "console.js", "play.js", "zc-flow-roles.js", "claimnote.js", "index.html"]) {
      const t = pub(f); expect(t).not.toMatch(/\b(a|the|your|make|and) Hosts?\b(?![-\w])/);
    }
    expect(pub("claimnote.js")).toContain("The Co-organizer could not accept");
    for (const f of [...MARKETING, "zc.js", "pack/zc-flow.js", "console.js", "play.js", "z.js"]) expect(pub(f)).not.toMatch(/nick ?name/i);
  });
});
