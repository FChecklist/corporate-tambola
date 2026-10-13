// Not a test: captures REAL screens of the running app (local sim stack, same pages as the live site) for the user manuals.
// Run: node tools/sim2/scenarios/ui/run.mjs --file s99      Output: C:/ct/ct/tambola-manuals/shots/*.png
import { mkdirSync } from "node:fs";
import { H, openConsole, openStep, guestJoinUi, nextPhone, nextMail, cohostUrl, payOnPage, uiPublish, chip, tickKind } from "./kit.mjs";

const OUT = "C:/ct/ct/tambola-manuals/shots"; mkdirSync(OUT, { recursive: true });
const CSS = `.__hl{outline:4px solid #F5820A!important;outline-offset:3px!important;border-radius:6px}
.__bd{position:absolute;z-index:99999;width:30px;height:30px;border-radius:50%;background:#F5820A;color:#fff;font:700 17px/30px Arial;text-align:center;box-shadow:0 2px 6px #0007;pointer-events:none}`;
async function mark(page, hls) {
  await page.addStyleTag({ content: CSS }).catch(() => {});
  await page.evaluate((sels) => {
    document.querySelectorAll(".__bd").forEach((e) => e.remove()); document.querySelectorAll(".__hl").forEach((e) => e.classList.remove("__hl"));
    // hide the test-mode strip: it exists only in the test copy
    document.querySelectorAll("div,header").forEach((e) => { if (/^TEST MODE: nothing here is real/.test((e.textContent || "").trim()) && e.children.length < 3) e.style.display = "none"; });
    // show the live web address instead of the local test address (text only; nothing else is changed)
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (/localhost:\d+/.test(n.nodeValue)) { (window.__orig ||= []).push([n, n.nodeValue]); } if (/localhost:\d+/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/https?:\/\/localhost:\d+/g, "https://corporate-tambola.pages.dev").replace(/localhost:\d+/g, "corporate-tambola.pages.dev"); }
    sels.forEach((s, i) => { const el = document.querySelector(s); if (!el) return; el.classList.add("__hl");
      const r = el.getBoundingClientRect(); const b = document.createElement("div"); b.className = "__bd"; b.textContent = i + 1;
      b.style.left = Math.max(2, r.left + scrollX - 12) + "px"; b.style.top = Math.max(2, r.top + scrollY - 12) + "px"; document.body.appendChild(b); });
  }, hls).catch(() => {});
  await page.waitForTimeout(250);
}
const restore = (page) => page.evaluate(() => { (window.__orig || []).forEach(([n, v]) => { n.nodeValue = v; }); window.__orig = []; }).catch(() => {});
const seen = [];
/** viewport screenshot (or full page) with numbered orange highlights */
export async function snap(page, name, hls = [], { full = false, tall = false } = {}) {
  try {
    const vp = page.viewportSize();
    if (tall && vp) {
      for (let i = 0; i < 2; i++) { const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)); await page.setViewportSize({ width: vp.width, height: Math.min(4200, Math.max(vp.height, h)) }); await page.waitForTimeout(250); }
    }
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await mark(page, hls); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); await restore(page); seen.push(name); console.log("shot", name);
    if (tall && vp) await page.setViewportSize(vp);
  } catch (e) { console.log("FAIL shot", name, String(e).slice(0, 120)); }
}
/** screenshot of one element only (a console step), keeping the highlights inside it */
export async function el(page, name, sel, hls = []) {
  try { await mark(page, hls); await page.locator(sel).first().screenshot({ path: `${OUT}/${name}.png` }); await restore(page); seen.push(name); console.log("shot", name); } catch (e) { console.log("FAIL el", name, String(e).slice(0, 120)); }
}
const ok = async (label, fn) => { try { await fn(); } catch (e) { console.log("STEP FAILED", label, String(e).slice(0, 200)); } };

export default [
  {
    id: "S99-01", name: "manual screens: organizer",
    async run(t) {
      const email = "rajesh.kumar@sunriseindustries.in"; t.team.add(email);
      const x = await t.open({ device: "laptop" }); const p = x.page;
      await ok("home", async () => {
        await p.goto(H.SIM + "/"); await p.waitForTimeout(1500);
        await snap(p, "home-top", ["#payBtn"]);
        await snap(p, "home-full", [], { full: true });
        await p.click("#payBtn"); await p.waitForTimeout(500);
        await snap(p, "signup-form", ["#fMail", "#frGo"]);
        await p.fill("#fMail", email); await snap(p, "signup-filled", ["#fMail", "#frGo"]);
        await tickKind(p, "K2"); await p.click("#frGo"); await p.waitForURL(/\/zc/, { timeout: 15000 }); await p.waitForSelector("#mk"); await p.waitForTimeout(800);
        await snap(p, "org-console-empty", ["#mk"]);
        await p.click("#mk"); await p.waitForSelector(".zc-sech", { timeout: 15000 }); await p.waitForTimeout(1000);
        await snap(p, "org-console-new", [".zc-sech[data-open='1']", "#paypill"]);
      });
      for (let n = 1; n <= 7; n++) await ok("step" + n, async () => { await openStep(p, n); await p.waitForTimeout(500); await el(p, "org-step" + n, `#sec${n}`, [`#sec${n} [data-save="${n}"]`]); });
      // fill the basics through the real chips, save step 1
      await ok("save1", async () => { await openStep(p, 1); await p.click(`#sec1 [data-save="1"]`); await p.waitForTimeout(800); });
      await ok("add-host-ui", async () => {
        await openStep(p, 5); await p.waitForTimeout(400);
        await p.fill("#hostlabel", "Meena (HR Head)").catch(() => {});
        await p.fill("#hostphone", nextPhone()).catch(() => {});
        await p.fill("#hostemail", nextMail("host")).catch(() => {});
        await el(p, "org-step5-host-filled", "#sec5", ["#hostlabel", "#hostphone", "#hostemail"]);
      });
      // publish with real UI
      await ok("publish", async () => {
        await openStep(p, 7); await p.click("#publishopen"); await p.waitForSelector("#pubEmail"); await p.waitForTimeout(400);
        await p.fill("#pubEmail", email); await p.fill("#pubPhone", "9811122233");
        await el(p, "org-publish-dialog", "#sec7", ["#pubEmail", "#pubPhone", "#pubgo"]);
        await tickKind(p, "K1"); await p.click("#pubgo"); await p.waitForSelector("#cancelopen", { timeout: 15000 }); await p.waitForTimeout(800);
        await el(p, "org-published", "#sec7", ["#cancelopen"]);
        await snap(p, "org-console-published", ["#paypill"]);
      });
      await ok("link-step6", async () => { await openStep(p, 6); await p.waitForTimeout(600); await el(p, "org-step6-published", "#sec6", []); });
      // pay page
      await ok("pay", async () => {
        await openStep(p, 8); await p.waitForTimeout(500); await el(p, "org-step8", "#sec8", []);
        const a = p.locator("#sec8 a[href*='pay']").first();
        if (await a.count()) { await a.click(); } else { await p.goto(H.SIM + "/pay?e=" + new URL(p.url()).searchParams.get("e")); }
        await p.waitForSelector("#paygo", { timeout: 15000 }); await p.waitForTimeout(500);
        await snap(p, "pay-page", ["#nm", "#em"], { full: true });
        await p.fill("#nm", "Rajesh Kumar"); await p.fill("#em", email); if (await p.$("#org")) await p.fill("#org", "Sunrise Industries Pvt Ltd"); if (await p.$("#ph")) await p.fill("#ph", "9811122233");
        await snap(p, "pay-page-filled", ["#nm", "#em", "#org", "#paygo"], { full: true });
        await tickKind(p, "K3"); await p.click("#paygo"); await p.waitForTimeout(4000);
        await snap(p, "pay-done", [], { full: true });
      });
      await ok("back-console", async () => {
        const eid = new URL(p.url()).searchParams.get("e"); await p.goto(`${H.SIM}/zc?e=${eid}`); await p.waitForSelector(".zc-sech"); await p.waitForTimeout(1000);
        await snap(p, "org-console-paid", ["#paypill"]);
        await openStep(p, 9); await p.waitForTimeout(600); await el(p, "org-step9", "#sec9", []);
        await openStep(p, 10); await p.waitForTimeout(600); await el(p, "org-step10", "#sec10", []);
        await p.click(".zc-sech[data-acct='1']").catch(() => {}); await p.waitForTimeout(500);
        await snap(p, "org-account", [], { full: true });
      });
      await ok("static pages", async () => {
        for (const [n, u] of [["ai-link", "/ai-link"], ["guide", "/organizer-guide"], ["partner-page", "/partner"], ["demo", "/demo"]]) {
          await p.goto(H.SIM + u); await p.waitForTimeout(1500); await snap(p, "page-" + n, [], { full: true });
        }
      });
    },
  },
];
