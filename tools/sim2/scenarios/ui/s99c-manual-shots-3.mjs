// Not a test: third batch of manual screens (partner / refer and earn, sales team material). See s99-manual-shots.mjs.
import { H, nextPhone, nextMail, tickKind } from "./kit.mjs";
import { snap, el } from "./s99-manual-shots.mjs";
const ok = async (label, fn) => { try { await fn(); } catch (e) { console.log("STEP FAILED", label, String(e).slice(0, 240)); } };

export default [
  {
    id: "S99-04", name: "manual screens: partner enrol, dashboard, referred sale; sales material",
    async run(t) {
      const email = t.mail("partner"); const phone = nextPhone();
      const x = await t.open({ device: "laptop" }); const p = x.page; let code = null;
      await ok("home sections", async () => {
        await p.goto(H.SIM + "/"); await p.waitForTimeout(1500);
        await p.locator("#pricing").scrollIntoViewIfNeeded(); await el(p, "home-pricing", "#pricing", []);
        await el(p, "home-how", "#how", []); await el(p, "home-benefits", "#benefits", []); await el(p, "home-faq", "#faq", []);
        await el(p, "home-aihost", "#ai-host", []);
      });
      await ok("partner-enrol", async () => {
        await p.goto(H.SIM + "/partner"); await p.waitForTimeout(1500);
        await p.fill("#ph", phone); await p.fill("#em", email); await p.fill("#nm", "Anita Desai"); await p.evaluate(() => { document.getElementById("ok").checked = true; });
        await snap(p, "partner-form-filled", ["#ph", "#em", "#nm", "#ok", "#join"], { full: false });
        await p.locator("#join").first().scrollIntoViewIfNeeded(); await snap(p, "partner-form-filled2", ["#ph", "#em", "#nm", "#ok", "#join"], { tall: true });
        await p.evaluate(() => { document.getElementById("ok").checked = true; document.getElementById("join").click(); }); await p.waitForTimeout(2500); console.log("AFTER JOIN:", await p.evaluate(() => [...document.querySelectorAll(".zbanner,.zmsg,.zerr,.err,[role=alert]")].map((e) => e.innerText).join(" | "))); await p.waitForSelector("#cd", { timeout: 15000 }); await p.waitForTimeout(500);
        const m = await H.mailbox.waitFor({ to: email, timeout: 8000 }); const c = H.mailbox.code(m); await p.fill("#cd", c);
        await snap(p, "partner-code", ["#cd", "#cdgo"], { tall: true });
        await p.click("#cdgo"); await p.waitForTimeout(2500);
        await snap(p, "partner-dashboard-new", [], { tall: true });
        code = (await p.evaluate(() => (document.getElementById("mylink") || {}).textContent || "")).trim(); console.log("MYLINK", code);
      });
      await ok("referred sale", async () => {
        const ref = /ref=([A-Z2-9]{8})/.exec(code || "")?.[1]; if (!ref) throw new Error("no ref code");
        const b = await t.open({ device: "laptop" }); const bp = b.page;
        await bp.goto(`${H.SIM}/?ref=${ref}`); await bp.waitForTimeout(1200);
        const buyer = "hr@brightpath.example.com"; t.team.add(buyer);
        await bp.click("#payBtn"); await bp.fill("#fMail", buyer); await tickKind(bp, "K2"); await bp.click("#frGo"); await bp.waitForURL(/\/zc/, { timeout: 15000 }); await bp.waitForSelector("#mk");
        await bp.click("#mk"); await bp.waitForSelector(".zc-sech"); await bp.waitForTimeout(800);
        const key = await bp.evaluate(() => sessionStorage.getItem("ctz-org")); const eid = new URL(bp.url()).searchParams.get("e");
        const o = new H.Organizer(buyer, key);
        const r = await o.publish(eid); console.log("publish", r.ok);
        await bp.goto(`${H.SIM}/pay?e=${eid}`); await bp.waitForSelector("#paygo", { timeout: 15000 });
        await bp.fill("#nm", "Neha Gupta"); await bp.fill("#em", buyer); if (await bp.$("#org")) await bp.fill("#org", "Brightpath Services"); await tickKind(bp, "K3"); await bp.click("#paygo"); await bp.waitForTimeout(4000);
        await p.reload(); await p.waitForTimeout(2500); await snap(p, "partner-dashboard-sale", [], { tall: true });
      });
    },
  },
];
