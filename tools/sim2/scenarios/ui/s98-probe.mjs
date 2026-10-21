// A probe, not a test: opens the Organizer console in real Chrome and writes every step and every input, button and note it finds to sim/probe-console.json,
// so the guided-error catalog can point at the exact control. Run: node tools/sim2/scenarios/ui/run.mjs --only S98-01
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { H, openConsole, openStep, tickTerms } from "./kit.mjs";

const eidOf = (page) => new URL(page.url()).searchParams.get("e");
export default [
  {
    id: "S98-01", name: "Probe: list every step and control of the Organizer console",
    async run(t) {
      const org = await t.org("p");
      const g = await t.game(org);
      const x = await openConsole(t, org, g.id, { device: "laptop" });
      await x.page.waitForSelector(".zc-sech", { timeout: 15000 });
      const dlg = await x.page.evaluate(() => { const d = document.getElementById("ctg-dialog"); return d ? d.textContent.replace(/\s+/g, " ").slice(0, 300) : null; });
      t.note("dialog at load: " + dlg); console.log("DIALOG-AT-LOAD:", dlg);
      const mut = await x.page.evaluate(() => new Promise((res) => { let n = 0; const kinds = {}; const o = new MutationObserver((ms) => ms.forEach((m) => { n++; const k = m.type + ":" + (m.target.className || m.target.nodeName || "").toString().slice(0, 30); kinds[k] = (kinds[k] || 0) + 1; })); o.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true }); setTimeout(() => { o.disconnect(); res({ n, top: Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 4) }); }, 2000); }));
      console.log("MUTATIONS-IN-2S:", JSON.stringify(mut));
      const out = { steps: [] };
      const n = await x.page.$$eval("[id^=\"sec\"]", (els) => Math.max(0, ...els.map((e) => Number((/^sec(\d+)$/.exec(e.id) || [])[1] || 0))));
      for (let i = 1; i <= n; i++) {
        await openStep(x.page, i).catch(() => {});
        const info = await x.page.evaluate((i) => {
          const sec = document.getElementById("sec" + i); if (!sec) return null;
          const head = sec.querySelector(".zc-sech") || sec.previousElementSibling;
          const lab = (el) => { const l = el.id && document.querySelector(`label[for="${el.id}"]`); return (l && l.textContent.trim()) || el.getAttribute("aria-label") || el.getAttribute("placeholder") || ""; };
          return {
            n: i, title: head ? head.textContent.replace(/\s+/g, " ").trim().slice(0, 70) : "",
            fields: [...sec.querySelectorAll("input,select,textarea")].map((e) => ({ id: e.id, name: e.name, type: e.type, ck: e.getAttribute("data-ck"), label: lab(e).slice(0, 60) })).slice(0, 40),
            chips: [...new Set([...sec.querySelectorAll("[data-ck]")].map((e) => e.getAttribute("data-ck")))].slice(0, 40),
            buttons: [...sec.querySelectorAll("button")].map((e) => ({ id: e.id, save: e.getAttribute("data-save"), text: e.textContent.replace(/\s+/g, " ").trim().slice(0, 40) })).slice(0, 25),
            notes: [...sec.querySelectorAll(".zc-note,.zc-err,.zsmall,[role=alert],[role=status]")].map((e) => (e.id || e.className) + ":" + e.textContent.replace(/\s+/g, " ").trim().slice(0, 50)).slice(0, 12),
          };
        }, i);
        if (info) out.steps.push(info);
      }
      out.eid = eidOf(x.page);
      writeFileSync(join(H.ROOT, "sim", "probe-console.json"), JSON.stringify(out, null, 1));
      t.check("console probed: " + out.steps.length + " steps written to sim/probe-console.json", out.steps.length >= 8);
    },
  },
  {
    id: "S98-02", name: "Probe: the Publish button before anything is filled",
    async run(t) {
      const org = await t.org("pp");
      const g = await t.game(org, { publish: false });
      const x = await openConsole(t, org, g.id, { device: "laptop" });
      await openStep(x.page, 7); await x.page.click("#publishopen"); await x.page.waitForSelector("#pubEmail"); await x.page.waitForTimeout(600);
      const info = await x.page.evaluate(() => { const b = document.getElementById("pubgo"); const n = b && b.nextElementSibling; return { exists: !!b, disabled: b && b.disabled, ariaDisabled: b && b.getAttribute("aria-disabled"), cls: b && b.className, next: n ? n.tagName + "." + n.className + ": " + n.textContent.slice(0, 160) : null, boxes: [...document.querySelectorAll("#sec7 input[type=checkbox]")].map((c) => (c.getAttribute("data-box") || "") + ":" + c.checked + ":" + (c.offsetParent !== null)), inputs: [...document.querySelectorAll("#pubEmail,#pubPhone")].map((i) => i.id + ":" + i.required + ":" + i.value) }; });
      console.log("PUBLISH-BTN:", JSON.stringify(info)); t.check("probe done", true);
    },
  },
  {
    id: "S98-03", name: "Probe: a personal link with a wrong token, after pressing the button",
    async run(t) {
      const org = await t.org("pt"); const g = await t.game(org, { settings: { whoCanJoin: "list" }, pay: true });
      const x = await t.open({ device: "mobile" }); const P = x.page;
      await P.goto(H.SIM + "/z?e=" + g.id + "&t=notarealtoken123456"); await P.waitForSelector("#go", { timeout: 12000 });
      await tickTerms(t, P, { scope: "[data-cbc='K4']", btn: "#go", what: "Join" }).catch(() => {}); await P.click("#go"); await P.waitForTimeout(2500);
      console.log("TOKEN-PAGE:", (await P.innerText("#app")).replace(/\s+/g, " ").slice(0, 700), "| guide:", !!(await P.$(".ctg-inline,#ctg-dialog")));
      t.check("probe done", true);
    },
  },
  {
    id: "S98-04", name: "Probe: Refer and earn enrolment",
    async run(t) {
      const email = t.mail("hp"), phone = t.phone();
      const x = await t.open({ device: "mobile" });
      await x.page.goto(`${H.SIM}/partner`); await x.page.waitForSelector("#join");
      await x.page.fill("#ph", phone); await x.page.fill("#em", email); await x.page.fill("#nm", "Hema Helper");
      const ticked = await x.page.$$eval("input[type=checkbox]", (els) => els.map((e) => e.id + ":" + e.checked + ":" + (e.getAttribute("data-box") || "")));
      console.log("PARTNER-BOXES:", JSON.stringify(ticked));
      await x.page.check("#ok"); const net = []; x.page.on("response", (r) => { if (/partner|api/.test(r.url())) net.push(r.status() + " " + r.url().replace(/^.*localhost:\d+/, "")); });
      await x.page.click("#join"); await x.page.waitForTimeout(3000); console.log("PARTNER-NET:", JSON.stringify(net));
      console.log("PARTNER-AFTER:", (await x.page.innerText("body")).replace(/\s+/g, " ").slice(0, 600), "| guide:", !!(await x.page.$(".ctg-inline,#ctg-dialog")), "| #cd:", !!(await x.page.$("#cd")));
      t.check("probe done", true);
    },
  },
  {
    id: "S98-05", name: "Probe: how many enrolment calls one click makes, with and without the new scripts",
    async run(t) {
      for (const [label, block] of [["BASELINE (guide and recorder blocked)", ["**/guide.js", "**/blackbox.js"]], ["GUIDE ONLY blocked recorder", ["**/blackbox.js"]], ["RECORDER ONLY blocked guide", ["**/guide.js"]], ["BOTH ON", []]]) {
        const x = await t.open({ device: "mobile" });
        for (const b of block) await x.page.route(b, (r) => r.abort());
        await x.page.goto(`${H.SIM}/partner`); await x.page.waitForSelector("#join");
        await x.page.fill("#ph", t.phone()); await x.page.fill("#em", t.mail("pz")); await x.page.fill("#nm", "Hema Helper"); await x.page.check("#ok");
        const calls = []; x.page.on("request", (r) => { if (/api\/partner\/enroll/.test(r.url())) calls.push(r.method()); });
        await x.page.click("#join"); await x.page.waitForTimeout(2500);
        console.log("ENROLL-CALLS", label, JSON.stringify(calls));
        await x.ctx.close().catch(() => {});
      }
      t.check("probe done", true);
    },
  },
];
