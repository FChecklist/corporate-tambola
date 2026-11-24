// OWNER PRICING UPDATE 2026-11-23: three cups for every game and console, one list of prices, the same words everywhere.
//   Small up to 100 = Rs 2,999 | Medium up to 500 = Rs 4,999 ("Most chosen") | Large up to 1,000 = Rs 7,499
//   behind "See more sizes": 250 = 3,799 | 750 = 6,299 | 2,500 = 11,999 | 5,000 = 17,999 | 10,000 = 29,999. No GST shown, no money-back promise.
// The expected prices are written out LITERALLY here (not read from pricing.ts), so changing a price in only one place turns a test red.
// What each test checks, and how it was proven red: see the pull request comment of this release (break one thing, see it fail, restore).
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CUPS, PACKS, PRICING_COPY } from "../../../packages/shared/src/pricing";
import { newWorld, openPage, type Page } from "./harness";

setDefaultTimeout(30_000);
const ROOT = join(import.meta.dir, "..", "..", "..");
const PUB = join(ROOT, "apps/web/public");
const read = (f: string) => readFileSync(join(PUB, f), "utf8");
const textOf = (html: string) => html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&#8377;/g, "₹").replace(/&middot;/g, "·").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, " ");

const NEW_INR = [2999, 3799, 4999, 6299, 7499, 11999, 17999, 29999];
const SIZES = [100, 250, 500, 750, 1000, 2500, 5000, 10000];
const USD = [34, 51, 67, 84, 101, 169, 253, 421];
const nf = (n: number) => n.toLocaleString("en-IN");
const COPY = {
  headline: "Run a game your whole team will talk about.",
  benefits: ["You choose auto mode or manual mode.", "Close group only: just the people you invite.", "You are in control, from start to finish."],
  trust: ["Players' details are erased within 24 hours after the game.", "Over 200 games played.", "Pay once per game, receipt straight away."],
};

describe("one list of prices", () => {
  test("PACKS: the new rupee prices for the eight sizes; the US dollar column did not change", () => {
    expect(PACKS.map((p) => p[0])).toEqual(SIZES);
    expect(PACKS.map((p) => p[1])).toEqual(NEW_INR);
    expect(PACKS.map((p) => p[2])).toEqual(USD);
  });
  test("CUPS: Small 100, Medium 500 (the only 'Most chosen'), Large 1,000; every other size is behind 'See more sizes'", () => {
    expect(CUPS.map((c) => [c.key, c.name, c.upTo, c.mostChosen])).toEqual([["small", "Small", 100, false], ["medium", "Medium", 500, true], ["large", "Large", 1000, false]]);
    expect(PACKS.filter((p) => !CUPS.some((c) => c.upTo === p[0])).map((p) => [p[0], p[1]])).toEqual([[250, 3799], [750, 6299], [2500, 11999], [5000, 17999], [10000, 29999]]);
  });
  test("the page copy constant holds the owner's words, word for word", () => {
    expect(PRICING_COPY.headline).toBe(COPY.headline); expect([...PRICING_COPY.benefits]).toEqual(COPY.benefits); expect([...PRICING_COPY.trust]).toEqual(COPY.trust);
    expect(PRICING_COPY.mostChosen).toBe("Most chosen"); expect(PRICING_COPY.moreSizes).toBe("See more sizes");
  });
  test("common.js (the browser copy) is equal to pricing.ts: PACKS, CUPS and the words", async () => {
    const w = newWorld({ DATA_KEY: "k" });
    const p = await openPage(w.world, { url: "http://localhost/pricing.html", html: "pricing.html", scripts: ["common.js"] });
    try {
      expect(JSON.parse(JSON.stringify(p.win.TB.PACKS))).toEqual(PACKS.map((x) => [...x]));
      expect(JSON.parse(JSON.stringify(p.win.TB.CUPS))).toEqual(CUPS.map((c) => ({ ...c })));
      expect(JSON.parse(JSON.stringify(p.win.TB.PRICING_COPY))).toEqual(JSON.parse(JSON.stringify(PRICING_COPY)));
    } finally { await p.close(); }
  });
  test("the console files name the same three cups and, if the size list cannot be loaded, fall back to the same prices", () => {
    const zc = read("zc.js"), flow = read("pack/zc-flow.js");
    expect(zc).toContain('const CUP_SIZES = [[100, "Small", false], [500, "Medium", true], [1000, "Large", false]];');
    expect(flow).toContain('const CUP_NAMES = { 100: "Small", 500: "Medium", 1000: "Large" }, CUP_MOST_CHOSEN = 500;');
    const fb = (src: string, re: RegExp) => [...(src.match(re)![1]!.matchAll(/upTo: (\d+), inr: (\d+)/g))].map((m) => [Number(m[1]), Number(m[2])]);
    expect(fb(zc, /\(S\.packs \|\| \[\]\)\.length \? S\.packs : \[([^\]]*)\]/)).toEqual([[100, 2999], [500, 4999], [1000, 7499]]);
    expect(fb(flow, /const FALLBACK_PACKS = \[([^\]]*)\]/)).toEqual(SIZES.map((n, i) => [n, NEW_INR[i]!]));
  });
});

describe("the home page: three cups", () => {
  let open: Page[] = [];
  afterEach(async () => { for (const p of open) await p.close(); open = []; });
  async function home() {
    const w = newWorld({ DATA_KEY: "k" });
    const p = await openPage(w.world, { url: "http://localhost/", html: "index.html", scripts: ["common.js", "site.js"] }); open.push(p);
    return p;
  }
  const cupText = (c: any) => c.textContent.replace(/\s+/g, " ");
  test("three cups: Small, Medium (the highlighted 'Most chosen' one) and Large, with their rupee prices; Medium is the size chosen to start with", async () => {
    const p = await home(), d = p.win.document;
    d.querySelector('[data-c="INR"]')!.click();
    const cups = [...d.querySelectorAll("#packs .cup")];
    expect(cups.length).toBe(3);
    expect(cups.map((c: any) => c.querySelector("h3").textContent)).toEqual(["Small", "Medium", "Large"]);
    expect(cups.map((c: any) => c.querySelector(".cup-price").textContent)).toEqual(["₹2,999", "₹4,999", "₹7,499"]);
    expect(cups.map((c: any) => c.querySelector(".cup-up").textContent)).toEqual(["Up to 100 participants", "Up to 500 participants", "Up to 1,000 participants"]);
    const pop = [...d.querySelectorAll("#packs .cup-pop")]; expect(pop.length).toBe(1); expect(pop[0]!.querySelector("h3")!.textContent).toBe("Medium");
    expect([...d.querySelectorAll("#packs .cup-tag")].map((t: any) => t.textContent)).toEqual(["Most chosen"]);
    expect(d.getElementById("pack")!.value).toBe("500"); // the hero list starts on the Medium cup
  });
  test("three benefit lines under each cup (auto or manual mode; close group only; you are in control), in the owner's words", async () => {
    const p = await home(), d = p.win.document;
    for (const c of [...d.querySelectorAll("#packs .cup")]) expect([...c.querySelectorAll(".cup-b li")].map((l: any) => l.textContent)).toEqual(COPY.benefits);
  });
  test("'See more sizes' holds the five other sizes with their prices, and only those; each has its own Create button", async () => {
    const p = await home(), d = p.win.document;
    d.querySelector('[data-c="INR"]')!.click();
    const more = d.querySelector("#packs details.cup-more")!; expect(more.querySelector("summary")!.textContent).toBe("See more sizes");
    const rows = [...more.querySelectorAll("tbody tr")].map((r: any) => [r.children[0].textContent, r.children[1].textContent, Number(r.querySelector("[data-buy]").dataset.buy)]);
    expect(rows).toEqual([["Up to 250 participants", "₹3,799", 250], ["Up to 750 participants", "₹6,299", 750], ["Up to 2,500 participants", "₹11,999", 2500], ["Up to 5,000 participants", "₹17,999", 5000], ["Up to 10,000 participants", "₹29,999", 10000]]);
    expect(more.hasAttribute("open")).toBe(false); // closed while a cup is the chosen size
  });
  test("the trust strip, then Terms and Privacy as plain links: no tick box, no GST line, no money-back promise, none of the forbidden claims", async () => {
    const p = await home(), d = p.win.document;
    const box = d.querySelector("#packs")!;
    expect([...box.querySelectorAll(".cup-trust li")].map((l: any) => l.textContent)).toEqual(COPY.trust);
    expect([...box.querySelectorAll(".cup-legal a")].map((a: any) => [a.textContent, a.getAttribute("href")])).toEqual([["Terms", "/terms.html"], ["Privacy", "/privacy.html"]]);
    expect(box.querySelectorAll('input[type="checkbox"], input[type="radio"]').length).toBe(0); expect(box.querySelectorAll(".tick").length).toBe(0);
    const t = cupText(box);
    expect(t).not.toMatch(/GST/i); expect(t).not.toMatch(/money.?back|refund|guarantee/i);
    expect(t).not.toMatch(/no data is taken|100% secure|major companies/i);
  });
  test("the section headline is the owner's; the currency button switches the cups to US dollars (the dollar column is unchanged)", async () => {
    const p = await home(), d = p.win.document;
    expect(d.getElementById("ph")!.textContent).toBe(COPY.headline);
    d.querySelector('[data-c="USD"]')!.click();
    expect([...d.querySelectorAll("#packs .cup-price")].map((x: any) => x.textContent)).toEqual(["US$34", "US$67", "US$101"]);
    expect([...d.querySelectorAll("#packs details.cup-more tbody td:nth-child(2)")].map((x: any) => x.textContent)).toEqual(["US$51", "US$84", "US$169", "US$253", "US$421"]);
  });
  test("choosing a size that is not a cup (from the hero list) opens 'See more sizes' and the demo game still has its own card", async () => {
    const p = await home(), d = p.win.document;
    const sel = d.getElementById("pack")!; sel.value = "2500"; sel.dispatchEvent(new p.win.Event("change", { bubbles: true }));
    expect(d.querySelector("#packs details.cup-more")!.hasAttribute("open")).toBe(true);
    sel.value = "demo"; sel.dispatchEvent(new p.win.Event("change", { bubbles: true }));
    expect(d.querySelectorAll("#packs .cup").length).toBe(0); expect(d.querySelector("#packs [data-demo]")).toBeTruthy();
  });
});

describe("the written pages", () => {
  test("pricing.html: the headline, three cups with their prices and benefit lines, 'See more sizes' with the other five, the trust strip, Terms and Privacy links", () => {
    const html = read("pricing.html"), t = textOf(html);
    expect(t).toContain(COPY.headline);
    const cups = [...html.matchAll(/<article class="cup([^"]*)">([\s\S]*?)<\/article>/g)];
    expect(cups.length).toBe(3);
    expect(cups.map((m) => textOf(m[2]!).trim().match(/^(Most chosen )?(Small|Medium|Large) Up to ([\d,]+) participants (₹[\d,]+)/)!.slice(1, 5))).toEqual([[undefined, "Small", "100", "₹2,999"], ["Most chosen ", "Medium", "500", "₹4,999"], [undefined, "Large", "1,000", "₹7,499"]]);
    expect(cups.map((m) => m[1]!.includes("cup-pop"))).toEqual([false, true, false]);
    for (const m of cups) expect([...m[2]!.matchAll(/<li>([^<]*)<\/li>/g)].map((x) => x[1])).toEqual(COPY.benefits);
    const more = html.match(/<details class="cup-more"><summary>See more sizes<\/summary>([\s\S]*?)<\/details>/)!; expect(more).toBeTruthy();
    expect([...more[1]!.matchAll(/<td>Up to ([\d,]+) participants<\/td><td class="num">(₹[\d,]+)<\/td><td class="num">US\$ (\d+)<\/td>/g)].map((m) => [m[1], m[2], m[3]])).toEqual([["250", "₹3,799", "51"], ["750", "₹6,299", "84"], ["2,500", "₹11,999", "169"], ["5,000", "₹17,999", "253"], ["10,000", "₹29,999", "421"]]);
    expect([...html.match(/<ul class="cup-trust">([\s\S]*?)<\/ul>/)![1]!.matchAll(/<li>([^<]*)<\/li>/g)].map((x) => x[1])).toEqual(COPY.trust);
    expect(html).toContain('<p class="cup-legal"><a href="/terms.html">Terms</a> &middot; <a href="/privacy.html">Privacy</a></p>');
    expect(html).toContain('href="/cups.css'); expect(existsSync(join(PUB, "cups.css"))).toBe(true);
    const section = html.slice(html.indexOf('<section class="cups"'), html.indexOf("</section>", html.indexOf('<section class="cups"')));
    expect(section).not.toMatch(/type="checkbox"|GST|money.?back|refund/i);
  });
  test("the build ships cups.css", () => { expect(readFileSync(join(ROOT, "pages/build.mjs"), "utf8")).toContain('"cups.css"'); });
  test("brochure.html: the same headline, the three cups, the five other sizes and the trust strip", () => {
    const t = textOf(read("brochure.html"));
    expect(t).toContain(COPY.headline);
    expect(t).toMatch(/Small Up to 100 guests ₹2,999 Most chosen Medium Up to 500 guests ₹4,999 Large Up to 1,000 guests ₹7,499/i);
    for (const b of COPY.benefits) expect(t).toContain(b);
    expect(t).toContain("More sizes: up to 250 ₹3,799 · up to 750 ₹6,299 · up to 2,500 ₹11,999 · up to 5,000 ₹17,999 · up to 10,000 ₹29,999.");
    expect(t).toContain(COPY.trust.join(" "));
  });
  test("the home page's structured data and the Refer & earn example follow the list (lowest 2,999, highest 29,999, eight sizes; half of 2,999 is 1,499.50)", () => {
    const idx = read("index.html"); expect(idx).toContain('"lowPrice":"2999","highPrice":"29999","offerCount":"8"');
    expect(textOf(read("partner.html"))).toContain("a pack for 100 people is ₹2,999: you earn ₹1,499.50 on the first purchase and ₹1,499.50 on each repeat");
  });
});

// ---- the whole repository: the old prices are gone, and the forbidden claims are not written anywhere ----
const OLD = ["2399", "3499", "4699", "5899", "7099", "11799", "17699", "29499"];
const OLD_PAISE = OLD.map((x) => x + "00");
const SKIP_DIRS = new Set(["node_modules", ".git", "results", "vendor", "fonts", "img", "reference"]);
const TEXT = /\.(ts|js|mjs|html|css|md|json|txt|toml|yml|yaml|webmanifest)$/;
const HISTORY = new Set(["CHANGELOG.md", "apps/edge/src/releases.json", "packages/shared/src/pricing.ts"]); // they name the old prices on purpose: "before 2026-11-23 the prices were ..."
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const f = join(dir, e), s = statSync(f);
    if (s.isDirectory()) walk(f, out); else if (TEXT.test(e) && s.size < 3_000_000) out.push(f);
  }
  return out;
}
const FILES = walk(ROOT).map((f) => relative(ROOT, f).split("\\").join("/")).filter((f) => f !== "apps/web/public/zgame.js" && !f.startsWith("docs/KNOWLEDGE/") && !HISTORY.has(f) && !/pricing-cups\.test\.ts$/.test(f) && !f.startsWith("pages/public/"));
describe("the whole repository", () => {
  test("scanned files exist (so the scan below cannot pass by finding nothing)", () => { expect(FILES.length).toBeGreaterThan(500); expect(FILES).toContain("apps/web/public/common.js"); expect(FILES).toContain("apps/web/public/brochure.html"); });
  test("none of the old prices (Rs 2,399 / 3,499 / 4,699 / 5,899 / 7,099 / 11,799 / 17,699 / 29,499, with or without commas, or in paise) is written anywhere but the release history", () => {
    const re = new RegExp(`(?<![0-9A-Za-z.])(${[...OLD, ...OLD_PAISE, ...OLD.map((x) => x.length === 4 ? x[0] + "," + x.slice(1) : x.slice(0, 2) + "," + x.slice(2))].join("|")})(?![0-9A-Za-z])`, "g");
    const hits: string[] = [];
    for (const f of FILES) { const s = readFileSync(join(ROOT, f), "utf8"); for (const m of s.matchAll(re)) hits.push(`${f}: ${s.slice(Math.max(0, m.index! - 30), m.index! + 20).replace(/\s+/g, " ")}`); }
    expect(hits).toEqual([]);
  });
  test("nothing the owner forbade is written in a page, a script or the code: 'no data is taken', '100% secure', 'played by major companies'", () => {
    const re = /no data is taken|100\s?% secure|played by major compan/gi;
    const hits: string[] = [];
    for (const f of FILES.filter((x) => /^(apps|packages|pages|tools)\//.test(x) || x.startsWith("docs/AI_"))) { const s = readFileSync(join(ROOT, f), "utf8"); for (const m of s.matchAll(re)) hits.push(`${f}: ${m[0]}`); }
    expect(hits).toEqual([]);
  });
});
