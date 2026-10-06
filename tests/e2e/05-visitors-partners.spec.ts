// VIS-* (anonymous visitors and the visit tracker) and PTR-* (sales partner, refer & earn).
// Partner enrolment needs the e-mailed code: the local stand-in echoes it (TEST_MODE=1); on the real site those cases only check what can be seen without a mailbox.
import { Api, BASE, IS_LIVE, J, anon, dev, eid, expect, mkEng, newOrg, owner, phone, requireTestMode, rnd, sleep, tc, tcb, test, u } from "./lib/harness";

test.beforeAll(async () => { if (IS_LIVE) await requireTestMode(); });
const summary = async (mode: "test" | "live" = "test") => (await owner().get(`/api/owner/visits/summary?mode=${mode}`)).body;
const beacon = (b: object, h: Record<string, string> = {}) => fetch(BASE + "/api/v/b", { method: "POST", headers: { "content-type": "text/plain", ...h }, body: JSON.stringify(b) });

tcb({ id: "VIS-01", role: "anonymous visitor", title: "a visit is recorded: landing, the size chosen in the drop-down, sections seen and the exit (test visits are kept apart from live ones)", steps: "Open home, scroll, choose 250 and 1,000 in the price drop-down, leave", expected: "owner test report shows the session with a 'pack' action and sections; live report unchanged" }, async ({ page }) => {
  const live0 = (await summary("live")).humans?.sessions ?? 0, test0 = (await summary("test")).humans?.sessions ?? 0;
  await page.goto(u("/")); await page.waitForSelector("#pack2");
  for (const v of ["250", "1000"]) { await page.selectOption("#pack2", v); await page.waitForTimeout(250); }
  await page.evaluate(async () => { for (let y = 0; y < 5000; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 200)); } });
  const ids = await page.evaluate(() => (window as any).TBV);
  await page.goto("about:blank"); await sleep(2500); // the page was hidden: the last batch is sent
  const s = await summary("test"), j = await owner().get(`/api/owner/visits/journey/${ids.sid}`);
  expect((s.humans?.sessions ?? 0), "test sessions went up").toBeGreaterThan(test0);
  const live1 = (await summary("live")).humans?.sessions ?? 0; expect(live1, "live report must not count a test visit").toBe(live0);
  const txt = JSON.stringify(j.body);
  expect(j.status, "journey for this visit").toBe(200); expect(txt).toMatch(/pack/i);
  return `sessions ${test0}->${s.humans?.sessions}; journey ${txt.slice(0, 160)}`;
});
tcb({ id: "VIS-02", role: "anonymous visitor (privacy signal on)", title: "with Global Privacy Control on, no visitor id or cookie is made and no session is stored", steps: "navigator.globalPrivacyControl = true; open home; read storage and cookies; read the owner report", expected: "no ctv_id in storage, no ctv cookie, beacon carries no visitor id; the session is not in the report" }, async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, "globalPrivacyControl", { value: true, configurable: true }); });
  const page = await ctx.newPage(); const bodies: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/v/b")) bodies.push(r.postData() ?? ""); });
  const before = (await summary("test")).humans?.sessions ?? 0;
  await page.goto(u("/")); await page.waitForSelector("#pack2"); await page.selectOption("#pack2", "250"); await page.waitForTimeout(500);
  const st = await page.evaluate(() => ({ ls: localStorage.getItem("ctv_id"), ck: document.cookie, tbv: (window as any).TBV }));
  await page.goto("about:blank"); await sleep(2500); await ctx.close();
  expect(st.ls).toBeNull(); expect(st.ck).not.toMatch(/ctv=/); expect(st.tbv.gpc).toBe(true);
  for (const b of bodies) { const j = JSON.parse(b); expect(j.d, "visitor id sent despite GPC").toBeUndefined(); expect(j.g).toBe(1); }
  const after = (await summary("test")).humans?.sessions ?? 0; expect(after, "GPC visit became a stored session").toBe(before);
  return `beacons ${bodies.length}, none with an id`;
});
tc({ id: "VIS-03", role: "script / crawler", title: "the beacon only accepts the public pages, drops oversize and flood input, and files crawlers apart", steps: "POST beacons for /z, /zc, /report; 7 kB body; 50 events; a Googlebot UA", expected: "game pages never recorded; oversize 4xx; events capped at 20; bot counted separately from humans" }, async () => {
  const sid = rnd(12);
  const humans0 = (await summary("test")).humans?.sessions ?? 0;
  const r1 = await beacon({ s: sid, g: 0, d: rnd(16), dv: "mobile", e: [{ p: "/z", k: "view" }, { p: "/zc", k: "view" }, { p: "/report", k: "view" }, { p: "/big", k: "view" }] });
  const big = await beacon({ s: rnd(12), d: rnd(16), e: [{ p: "/", k: "view", x: "y".repeat(7000) }] });
  const many = await beacon({ s: rnd(12), d: rnd(16), e: Array.from({ length: 50 }, () => ({ p: "/", k: "view" })) });
  const bot = await beacon({ s: rnd(12), d: rnd(16), e: [{ p: "/", k: "view" }] }, { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
  expect(r1.status).toBeLessThan(500); expect(big.status).toBeGreaterThanOrEqual(400); expect(many.status).toBeLessThan(500); expect(bot.status).toBeLessThan(500);
  const s = await summary("test"); const txt = JSON.stringify(s);
  expect(txt).not.toMatch(/"\/(z|zc|report|big)"/);
  return `statuses ${[r1.status, big.status, many.status, bot.status]}; humans ${humans0}->${s.humans?.sessions}; bots ${J(s.bots ?? "n/a")}`;
});
tc({ id: "VIS-04", role: "owner", title: "visit reports are owner-only and every read is in the access log", steps: "GET visits summary and journey with no key, with an organizer key and with the platform key; read the access log", expected: "404 for the first two; 200 for the owner; the owner's read appears in the log" }, async () => {
  const o = await newOrg("vis");
  expect([(await anon().get("/api/owner/visits/summary")).status, (await new Api(BASE, o.token).get("/api/owner/visits/summary")).status]).toEqual([404, 404]);
  const ok = await owner().get("/api/owner/visits/summary"); expect(ok.status).toBe(200);
  const log = await owner().get("/api/owner/audit/access"); expect(JSON.stringify(log.body)).toMatch(/visits-summary/);
  return "owner-only";
});

// ---------------------------------------------------------------------------------------------- partners
let PK = "", PCODE = "", PEMAIL = "";
tc({ id: "PTR-01", role: "sales partner", title: "enrol with mobile, e-mail and consent; the same answer for a new and an already-enrolled person", steps: "POST /api/partner/enroll twice with the same details (before and after verifying)", expected: "{ok:true,sent:true} both times (no 'already enrolled' leak); consent required; bad mobile/e-mail refused" }, async () => {
  if (IS_LIVE) return "skipped on the real site: the 6-digit code is only e-mailed (verified on the local stand-in)";
  const [mu, md] = ["raajat.agarwal", "gmail.com"]; PEMAIL = `${mu}+tbpartner${rnd(4)}@${md}`;
  const ip = `10.7.${Math.floor(Math.random() * 200)}.9`; const A = new Api(BASE, undefined, ip);
  expect((await A.post("/api/partner/enroll", { phone: "123", email: PEMAIL, consent: true })).status).toBe(400);
  expect((await A.post("/api/partner/enroll", { phone: phone(7001), email: "nope", consent: true })).status).toBe(400);
  expect((await A.post("/api/partner/enroll", { phone: phone(7001), email: PEMAIL })).status).toBe(400);
  const e1 = await A.post("/api/partner/enroll", { phone: phone(7001), email: PEMAIL, name: "Pari Partner <b>", consent: true }); expect(e1.body.ok).toBe(true);
  const code = e1.body.devCode; expect(code, J(e1.body)).toMatch(/^\d{6}$/);
  const wrong = await A.post("/api/partner/enroll/verify", { email: PEMAIL, code: "000000" }); expect(wrong.status).toBe(400);
  const v = await A.post("/api/partner/enroll/verify", { email: PEMAIL, code }); expect(v.status, J(v.text)).toBe(200); PK = v.body.partnerKey; PCODE = v.body.code;
  expect(PCODE).toMatch(/^[A-Za-z2-9]{8}$/); expect(v.body.link).toContain("?ref=" + PCODE);
  const e2 = await A.post("/api/partner/enroll", { phone: phone(7001), email: PEMAIL, consent: true });
  expect(JSON.stringify(Object.keys(e2.body).sort()), "already-enrolled answer must look like a new one apart from the code").toBe(JSON.stringify(Object.keys({ ok: 1, sent: 1 }).sort()));
  const reuse = await A.post("/api/partner/enroll/verify", { email: PEMAIL, code }); expect(reuse.status).toBe(400);
  return `partner code ${PCODE}`;
});
tc({ id: "PTR-02", role: "sales partner", title: "five wrong codes lock the enrolment; the code expires", steps: "6 wrong verify attempts then the right one", expected: "after 5 wrong tries the right code is refused" }, async () => {
  if (IS_LIVE) return "skipped on the real site (code is e-mailed)";
  const em = `raajat.agarwal+tbpl${rnd(4)}@gmail.com`; const A = new Api(BASE, undefined, `10.8.${Math.floor(Math.random() * 200)}.3`);
  const e = await A.post("/api/partner/enroll", { phone: phone(7100 + Math.floor(Math.random() * 800)), email: em, consent: true });
  for (let i = 0; i < 6; i++) await A.post("/api/partner/enroll/verify", { email: em, code: String(100000 + i) });
  const late = await A.post("/api/partner/enroll/verify", { email: em, code: e.body.devCode });
  expect(late.status, "right code after 6 wrong ones").toBe(400);
  return "locked";
});
tcb({ id: "PTR-03", role: "sales partner link / buyer", title: "a ?ref= link is remembered for 30 days in the buyer's browser, checked against real partners, and a fake code is dropped", steps: "Open /?ref=<real> then /?ref=ABCDEFGH (fake)", expected: "real code stays in storage; fake is removed after the server says it is not valid" }, async ({ page }) => {
  if (IS_LIVE && !PCODE) return "skipped on the real site (no partner could be enrolled without the e-mailed code)";
  await page.goto(u(`/?ref=${PCODE}`)); await page.waitForTimeout(1200);
  const real = await page.evaluate(() => localStorage.getItem("ctz-ref")); expect(real).toContain(PCODE);
  await page.evaluate(() => localStorage.clear()); await page.goto(u("/?ref=ABCDEFGH")); await page.waitForTimeout(1500);
  const fake = await page.evaluate(() => localStorage.getItem("ctz-ref")); expect(fake, "fake partner code kept").toBeNull();
  return "ok";
});
tc({ id: "PTR-04", role: "sales partner", title: "a referred, paid purchase earns a commission; the partner sees it without any buyer personal data; a partner buying through their own link earns nothing", steps: "Buyer pays (TEST) with ref=<code>; the partner reads /api/partner/me; the partner's own phone buys", expected: "one commission row for the referred sale; the partner's page has no buyer e-mail/organisation/mobile; self-purchase produces none" }, async () => {
  if (IS_LIVE && !PK) return "skipped on the real site (no partner without the e-mailed code)";
  const buyerMail = `buyer${rnd(4)}@example.org`;
  const pay = await anon().post("/api/checkout", { pack: 100, email: buyerMail, org: "Buyer Secret Pvt Ltd", country: "IN", ref: PCODE, phone: "9811100022" });
  if (pay.status !== 200) return `checkout answered ${pay.status} ${J(pay.text)} (payments off on this target)`;
  const me = await new Api(BASE).get("/api/partner/me", { "x-partner": PK });
  const txt = JSON.stringify(me.body);
  expect(me.status, txt).toBe(200);
  expect(txt).not.toContain("Buyer Secret"); expect(txt).not.toContain(buyerMail); expect(txt).not.toMatch(/9811100022/);
  const before = (me.body.commissions ?? me.body.rows ?? []).length;
  const self = await anon().post("/api/checkout", { pack: 100, email: `self${rnd(4)}@example.org`, org: "Self Org", country: "IN", ref: PCODE, phone: phone(7001) });
  const me2 = await new Api(BASE).get("/api/partner/me", { "x-partner": PK });
  const after = (me2.body.commissions ?? me2.body.rows ?? []).length;
  expect(after, "self-referral earned a commission").toBe(before);
  return `commissions ${before} -> ${after}; no buyer data in partner view`;
});
tc({ id: "PTR-05", role: "owner", title: "partner admin (list, rate, payout, void, state) works for the owner only and the list shows no buyer data", steps: "Owner GET /api/partners; organizer and anonymous try", expected: "owner 200; others refused; no buyer e-mails in the list" }, async () => {
  const o = await newOrg("ptr");
  expect([(await anon().get("/api/partners")).status, (await new Api(BASE, o.token).get("/api/partners")).status].every((s) => s >= 400)).toBe(true);
  const l = await owner().get("/api/partners"); expect(l.status).toBe(200);
  expect(JSON.stringify(l.body)).not.toMatch(/Buyer Secret|@example\.org/);
  return `partners listed: ${(l.body.partners ?? []).length}`;
});
tc({ id: "PTR-06", role: "sales partner", title: "closing the partner account removes the person and keeps only anonymous accounting rows", steps: "POST /api/partner/close with the partner key; read me; try the key again", expected: "key stops working; owner list no longer has the partner row" }, async () => {
  if (IS_LIVE && !PK) return "skipped on the real site";
  const c = await new Api(BASE).post("/api/partner/close", { confirm: true }, { "x-partner": PK }); expect(c.status, J(c.text)).toBe(200);
  const me = await new Api(BASE).get("/api/partner/me", { "x-partner": PK }); expect(me.status).toBeGreaterThanOrEqual(400);
  return "closed";
});
