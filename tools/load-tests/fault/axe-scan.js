// B11: axe-core accessibility scan of the public pages of a LOCAL replica, phone size, Chromium. read-only. env BASE, OUT
const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path");
const BASE = process.env.BASE || "http://localhost:8891", ROOT = path.resolve(__dirname, "../../..");
const axeSrc = fs.readFileSync(ROOT + "/node_modules/axe-core/axe.min.js", "utf8");
const pages = ["index", "pricing", "about", "contact", "terms", "privacy", "trust", "signin", "demo", "play", "z", "zc", "organizer-guide", "refund-policy", "subprocessors", "dpa", "legal", "partner", "paylink", "pay", "screen", "big", "board", "report", "confirm", "brochure"];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" }); const out = [];
  for (const p of pages) { const pg = await ctx.newPage(); try { const r = await pg.goto(`${BASE}/${p}.html`, { waitUntil: "load", timeout: 20000 }); await pg.waitForTimeout(800); await pg.evaluate(axeSrc);
    const res = await pg.evaluate(async () => { const x = await axe.run(document, { resultTypes: ["violations"] }); return x.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0] && v.nodes[0].target.join(" ").slice(0, 80) })); });
    out.push({ page: p, status: r && r.status(), violations: res }); console.log(p, r && r.status(), res.map((v) => `${v.id}(${v.impact},${v.nodes})`).join(" ") || "clean"); } catch (e) { out.push({ page: p, error: String(e.message).slice(0, 100) }); console.log(p, "error", String(e.message).slice(0, 80)); } await pg.close(); }
  await b.close(); fs.mkdirSync(ROOT + "/data", { recursive: true }); fs.writeFileSync(ROOT + `/data/axe-${process.env.OUT || "run"}.json`, JSON.stringify(out, null, 1));
})();
