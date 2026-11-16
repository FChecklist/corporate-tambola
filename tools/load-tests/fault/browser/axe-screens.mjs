// B11 part 2: axe scan of the organizer console after sign-in (steps open one by one) and the player's join page, Chromium phone size, LOCAL replica. env SITE, OUT
import { createRequire } from "node:module"; import { readFileSync, writeFileSync } from "node:fs"; import { fileURLToPath } from "node:url";
import { launch, signIn, sleep } from "./ui-lib.mjs";
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url)), SITE = process.env.SITE || "http://localhost:8893", axeSrc = readFileSync(ROOT + "node_modules/axe-core/axe.min.js", "utf8");
const scan = async (p, label, out) => { await p.evaluate(axeSrc); const v = await p.evaluate(async () => (await axe.run(document, { resultTypes: ["violations"] })).violations.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, sample: x.nodes[0] && x.nodes[0].target.join(" ").slice(0, 70) }))); out.push({ screen: label, violations: v }); console.log(label, v.map((x) => `${x.id}(${x.impact},${x.nodes})`).join(" ") || "clean"); };
const b = await launch("chromium"), out = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage();
await signIn(p, SITE, "demo2@xyz.in"); if (await p.$("#mk")) await p.click("#mk"); await p.waitForSelector('[data-ck="occ"]', { timeout: 40000 }); await sleep(800);
await scan(p, "console: step 1 open", out);
for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10]) { try { await p.locator(`.zc-dot[data-open="${n}"], [data-open="${n}"]`).first().click({ timeout: 4000 }); await sleep(700); await scan(p, `console: step ${n} open`, out); } catch (e) { console.log("step", n, "skipped", String(e.message).slice(0, 60)); } }
const game = new URL(p.url()).searchParams.get("e"); const pp = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); await pp.goto(`${SITE}/z.html?e=${game}`, { waitUntil: "load" }); await sleep(2500); await scan(pp, "player: join page (draft game)", out);
writeFileSync(ROOT + `data/axe-screens-${process.env.OUT || "run"}.json`, JSON.stringify(out, null, 1)); await b.close();
