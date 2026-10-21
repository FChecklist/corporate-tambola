// Probe: the pay link page as a stranger sees it (which agreement boxes, which fields).
import { H } from "./kit.mjs";
export default [
  {
    id: "S98-07", name: "Probe: the pay link page",
    async run(t) {
      const org = await t.org("pl"); const g = await t.game(org, { pay: false });
      const lk = await org.api("POST", `/api/z/${g.id}/paylink`, {}); const url = lk.body.url.replace(/^https?:\/\/[^/]+/, H.SIM);
      const x = await t.open({ device: "mobile" }); const P = x.page; await P.goto(url); await P.waitForTimeout(2500);
      console.log("PAYLINK:", JSON.stringify(await P.evaluate(() => ({ kinds: [...document.querySelectorAll("[data-cbc]")].map((e) => e.getAttribute("data-cbc")), boxes: [...document.querySelectorAll("input[type=checkbox]")].map((e) => e.id + "|" + (e.getAttribute("data-box") || "") + "|" + e.checked), fields: [...document.querySelectorAll("input:not([type=checkbox])")].map((e) => e.id + ":" + e.type), btn: (document.getElementById("paygo") || {}).outerHTML ? document.getElementById("paygo").outerHTML.slice(0, 200) : null, hint: (document.querySelector(".ctg-needs") || {}).textContent || null }))));
      t.check("probe done", true);
    },
  },
];
