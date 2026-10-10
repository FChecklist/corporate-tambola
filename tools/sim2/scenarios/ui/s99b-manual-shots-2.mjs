// Not a test: second batch of manual screens (host, co-host, guests, game day, partner). See s99-manual-shots.mjs.
import { H, openConsole, openStep, guestJoinUi, nextPhone, cohostUrl, waSend, clickWa } from "./kit.mjs";
import { snap, el } from "./s99-manual-shots.mjs";

const closeExcept = async (t, keep = []) => { for (const x of [...t.pages]) if (!keep.some((k) => k.page === x.page)) { await x.close().catch(() => {}); t.pages.splice(t.pages.indexOf(x), 1); } };
const ok = async (label, fn) => { try { await fn(); } catch (e) { console.log("STEP FAILED", label, String(e).slice(0, 240)); } };

export default [
  {
    id: "S99-02", name: "manual screens: host, co-host, guests, game day",
    async run(t) {
      const email = "priya.sharma@acmeindustries.in"; t.team.add(email);
      const org = await H.Organizer.signUp(email, { ip: t.ip() }); org.email = email;
      const INV = { on: true, per: 4, cats: ["family", "colleagues"] };
      const ALL_RW = ["early5", "top", "mid", "bot", "corners", "star", "full"].map((p) => ({ pattern: p, scope: "ticket", ordinal: 1, text: "" }));
      const g = await t.game(org, { lead: 12 * H.MIN, cfg: { rewards: ALL_RW }, settings: { whoCanJoin: "list", invites: INV }, pay: true });
      const hostMail = t.mail("meena"); t.team.add(hostMail);
      const inv = await org.inviteHost({ label: "Meena Iyer (HR)", email: hostMail, mobile: nextPhone() });
      const co = await org.inviteCohost({ label: "Chandra (Finance)", phone: nextPhone(), e: g.id });
      const names = ["Ritu Kapoor", "Anil Mehta", "Sunita Rao", "Vikram Shah", "Kavita Nair", "Rohit Verma"]; const nums = names.map(() => nextPhone());
      await org.addPeople(g.id, names.map((n, i) => ({ name: n, phone: nums[i] })));

      await ok("host", async () => {
        const h = await t.open({ device: "mobile" }); const p = h.page;
        await p.goto(inv.link); await p.waitForSelector("#finishsetup", { timeout: 15000 }); await p.waitForTimeout(600);
        await snap(p, "host-setup-1", ["#setupemail", "#setupsend"]);
        await p.fill("#setupemail", hostMail); await p.click("#setupsend"); await p.waitForSelector("#setupcode");
        const m = await H.mailbox.waitFor({ to: hostMail, timeout: 8000 }); await p.fill("#setupcode", H.mailbox.code(m));
        await snap(p, "host-setup-2", ["#setupcode", "#setupverify"]);
        await p.click("#setupverify"); await p.waitForFunction(() => !document.getElementById("setupcode"), null, { timeout: 15000 });
        if (await p.$("#setupmobile")) { await p.fill("#setupmobile", "9820011223"); await snap(p, "host-setup-3", ["#setupmobile", "#setupmobilego"]); await p.click("#setupmobilego"); }
        await p.waitForSelector(".zc-sech, #mk, .zc-main", { timeout: 15000 }); await p.waitForTimeout(1200);
        await snap(p, "host-console-first", []);
        const key = await p.evaluate(() => sessionStorage.getItem("ctz-org"));
        const hd = await t.open({ device: "laptop", token: key }); await hd.page.goto(`${H.SIM}/zc?e=${g.id}`); await hd.page.waitForSelector(".zc-sech"); await hd.page.waitForTimeout(1200);
        await snap(hd.page, "host-console", ["#paypill"]);
        await openStep(hd.page, 9).catch(() => {}); await hd.page.waitForTimeout(500); await el(hd.page, "host-gameday", "#sec9", []);
        await openStep(hd.page, 5).catch(() => {}); await hd.page.waitForTimeout(500); await el(hd.page, "host-step5", "#sec5", []);
      });
      await ok("cohost", async () => {
        const c = await t.open({ device: "mobile" }); const p = c.page;
        await p.goto(cohostUrl(g.id, co)); await p.waitForSelector(".zc-sech", { timeout: 15000 }); await p.waitForTimeout(1200);
        await snap(p, "cohost-console", []);
        await openStep(p, 1); await p.waitForTimeout(400); await el(p, "cohost-step1", "#sec1", []);
        await openStep(p, 2); await p.waitForTimeout(600);
        await p.fill("#gname", "Deepak Joshi"); await p.fill("#gphone", nextPhone());
        await el(p, "cohost-step2", "#sec2", ["#gname", "#gphone", "#gadd"]);
        await p.click("#gadd"); await p.waitForTimeout(1200); await el(p, "cohost-step2-added", "#sec2", []);
        await openStep(p, 3); await p.waitForTimeout(500); await el(p, "cohost-step3", "#sec3", []);
      });
      await ok("org-people", async () => {
        const o = await openConsole(t, org, g.id, { device: "laptop" }); const p = o.page;
        await openStep(p, 6); await p.waitForSelector("#sec6 #gcount", { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(800);
        await el(p, "org-step6-people", "#sec6", ["#gname", "#gphone", "#gadd"]);
        const st = await t.open({ device: "mobile" }); await guestJoinUi(st.page, g.id, nextPhone(), "Naveen Pillai"); await st.page.waitForTimeout(2500);
        await snap(st.page, "guest-waiting", []);
        await p.reload(); await p.waitForSelector(".zc-sech"); await openStep(p, 6); await p.waitForTimeout(1500);
        await el(p, "org-step6-waiting", "#sec6", []);
      });
      await closeExcept(t);
      const l1 = await t.open({ device: "mobile" }); const l1p = l1.page;
      let friend = null;
      await ok("guest-l1", async () => {
        await l1p.goto(`${H.SIM}/z?e=${g.id}`); await l1p.waitForSelector("#ph"); await l1p.waitForTimeout(700);
        await snap(l1p, "guest-join-form", []);
        await l1p.fill("#ph", nums[0]); await l1p.fill("#nm", names[0]); await snap(l1p, "guest-join-filled", ["#ph", "#nm", "#go"]);
        await l1p.click("#go"); await l1p.waitForTimeout(3500);
        await snap(l1p, "guest-l1-ticket-wait", [], { tall: true }); await snap(l1p, "guest-l1-full", [], { tall: true });
        if (await l1p.$("#mi-add")) {
          friend = nextPhone(); await l1p.fill("#mi-name", "Sneha Kapoor"); await l1p.fill("#mi-phone", friend);
          await snap(l1p, "guest-l1-invite-card", ["#mi-name", "#mi-phone", "#mi-add"], { tall: true });
          await l1p.click("#mi-add"); await l1p.waitForTimeout(1500); await snap(l1p, "guest-l1-invited", [], { tall: true });
        }
      });
      let l2 = null;
      await ok("guest-l2", async () => {
        if (!friend) throw new Error("no friend invited");
        const wa = l1p.locator("a[href*='wa.me'], a[href*='whatsapp']").first();
        const wp = await clickWa(l1p, wa, { send: false }); await wp.waitForLoadState("load");
        await snap(wp, "whatsapp-invite-message", []);
        await waSend(wp); const msg = await H.wa.waitFor(friend, { match: "/j/" });
        l2 = await H.openLinkAsRecipient(t.shared.open, friend, msg); t.pages.push({ ...l2, label: "friend" });
        await l2.page.waitForTimeout(1500); await snap(l2.page, "guest-l2-link", ["#go"]);
        if (await l2.page.$("#go")) { await l2.page.click("#go"); await l2.page.waitForTimeout(3000); }
        await snap(l2.page, "guest-l2-ticket", [], { tall: true }); await snap(l2.page, "guest-l2-full", [], { tall: true });
      });
      await closeExcept(t, [l1, l2].filter(Boolean));
      await ok("play", async () => {
        const track = t.shared.track; const ps = [l1];
        for (const i of [1, 2]) { const x = await t.open({ device: "mobile" }); await guestJoinUi(x.page, g.id, nums[i], names[i]); ps.push(x); }
        if (l2?.ctx) ps.push(l2);
        const now = await H.clock.now(); const wait = g.startMs - 2 * H.MIN - now;
        if (wait > 0) { await H.clock.advance(wait); await track.refresh(); await H.advanceBrowsers(ps.map((o) => o.ctx), wait, { run: false }); }
        await Promise.all(ps.map((q) => q.page.waitForFunction(() => window.__rt && window.__rt.phase === "play", null, { timeout: 25000 }).catch(() => {})));
        await snap(l1p, "guest-countdown", [], { tall: true });
        let hur = false, view = false; const stepAll = async (n) => { for (let i = 0; i < n; i++) { await H.clock.advance(3000); track.bump(3000); for (const o of ps) await o.ctx.clock.runFor(3000); await new Promise((r) => setTimeout(r, 50)); if (!hur && (await l1p.getByText("Hurray").count().catch(() => 0))) { hur = true; await snap(l1p, "guest-hurray", []); } if (!view && i > 20 && (await l1p.locator(".zc-dummy").count()) === 0 && i % 7 === 0 && !hur) { view = true; await snap(l1p, "guest-play-view", []); } } };
        await stepAll(100); await snap(l1p, "guest-play-early", [], { tall: true }); await snap(l1p, "guest-play-early-full", [], { tall: true });
        const b = await t.open({ device: "laptop" }); await b.page.goto(`${H.SIM}/big?e=${g.id}`); await b.page.waitForTimeout(2000); await snap(b.page, "big-screen", []);
        const o = await openConsole(t, org, g.id, { device: "laptop" }); await openStep(o.page, 9); await o.page.waitForTimeout(1200); await el(o.page, "org-gameday-live", "#sec9", []); await snap(o.page, "org-console-live", []);
        await stepAll(60); await snap(l1p, "guest-play-mid", [], { tall: true });
        await H.playBrowserGame(ps, { track, maxSteps: 500 }).catch(() => {});
        await snap(l1p, "guest-end", [], { tall: true }); await l1p.getByText("Wonderful").first().click({ timeout: 2000 }).catch(() => {}); await l1p.waitForTimeout(600); await snap(l1p, "guest-end-after", [], { tall: true }); await snap(l1p, "guest-end-full", [], { tall: true });
        await o.page.reload(); await o.page.waitForSelector(".zc-sech"); await openStep(o.page, 9).catch(() => {}); await o.page.waitForTimeout(1000);
        await el(o.page, "org-gameday-end", "#sec9", []);
        await openStep(o.page, 10).catch(() => {}); await o.page.waitForTimeout(1000); await el(o.page, "org-after-game", "#sec10", []);
      });
    },
  },
  {
    id: "S99-03", name: "manual screens: partner (refer and earn)",
    async run(t) {
      const x = await t.open({ device: "laptop" }); const p = x.page;
      await ok("partner", async () => {
        await p.goto(H.SIM + "/partner"); await p.waitForTimeout(1500); await snap(p, "partner-top", []);
        await snap(p, "partner-full", [], { tall: true });
        console.log("PARTNER BUTTONS", JSON.stringify(await p.$$eval("button, a.zbtn, a.rbtn", (e) => e.map((b) => (b.id || "") + "|" + (b.textContent || "").trim().slice(0, 40)))));
        console.log("PARTNER INPUTS", JSON.stringify(await p.$$eval("input", (e) => e.map((b) => b.id + ":" + b.type))));
      });
    },
  },
];
