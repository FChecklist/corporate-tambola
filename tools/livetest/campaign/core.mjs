// Helpers shared by every case implementation (impl/g*.mjs): the tagged demo game, players that join through the real page, consoles, role keys, checks.
import { chromium, makeApi, roundAt, sleep } from "./lib.mjs";
import { tagOf, register } from "./tags.mjs";
export { chromium, makeApi, roundAt, sleep };
export const PHONE = { width: 390, height: 844 };
export const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

export async function launch() { return chromium.launch({ channel: "chrome" }).catch(() => chromium.launch()); }

/** Creates the tagged demo game through the API (the organizer's own requests), registers it for cleanup, returns { tag, key }. */
export async function createGame(api, runId, caseId, o = {}) {
  const tag = tagOf(runId, caseId);
  const st = await api("POST", "/api/start", { email: tag.email });
  if (!st.ok) throw new Error("start refused: " + JSON.stringify(st.body).slice(0, 200));
  const key = st.body.token;
  register({ id: tag.id, run: runId, case: caseId, key, email: tag.email });
  const startRound = roundAt(Date.now() + (o.startInSec ?? 150) * 1000);
  const mk = await api("POST", "/api/z", { id: tag.id, startRound, callSeconds: o.callSeconds ?? 6, cap: o.cap ?? 10, demo: true, name: tag.name }, key);
  if (!mk.ok) throw new Error("create refused: " + JSON.stringify(mk.body).slice(0, 200));
  const rewards = o.rewards ?? [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "Mug" }, { pattern: "top", scope: "ticket", ordinal: 1, text: "Voucher" }];
  await api("PATCH", `/api/z/${tag.id}/settings`, { rewards, whoCanJoin: "anyone", ...(o.settings || {}) }, key);
  const pub = await api("POST", `/api/z/${tag.id}/publish`, { email: tag.email, phone: tag.phone }, key);
  if (!pub.ok) throw new Error("publish refused: " + JSON.stringify(pub.body).slice(0, 200));
  return { tag, key, startMs: Date.now() + (o.startInSec ?? 150) * 1000 };
}

export async function newContext(browser, base, meter, extra = {}) {
  const ctx = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true, ...extra });
  if (meter) await meter.watch(ctx); // every request of this phone counts
  return ctx;
}

/** A player joins through the real page: tick the boxes, type the number, press the button. Returns { page, ctx, text() }. */
export async function joinPlayer(browser, base, meter, id, phone, { checkin = true, name, emp, mail, query = "", routes } = {}) {
  const ctx = await newContext(browser, base, meter); const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  if (routes) await routes(page);
  await page.goto(`${base}/z.html?e=${id}${query}`, { waitUntil: "load" });
  await page.waitForSelector("[data-cbc='K4'] input[data-box]", { timeout: 25000 });
  const bx = page.locator("[data-cbc='K4'] input[data-box]"); for (let i = 0; i < await bx.count(); i++) await bx.nth(i).check({ force: true }).catch(() => {});
  if (phone && (await page.$("#ph"))) await page.fill("#ph", phone); if (emp && (await page.$("#emp"))) await page.fill("#emp", emp); if (mail && (await page.$("#mail"))) await page.fill("#mail", mail); if (name && (await page.$("#nm"))) await page.fill("#nm", name);
  await page.click("#go");
  const p = { page, ctx, errs, text: async () => (await page.locator("body").innerText()).replace(/\s+/g, " "), joined: false };
  await Promise.race([page.waitForFunction(() => window.__rt && window.__rt.pid, null, { timeout: 25000 }).then(() => { p.joined = true; }), sleep(25000)]).catch(() => {});
  if (p.joined && checkin) { // check-in is required for new games and opens 5 minutes before the start
    await page.waitForSelector("#ckokn", { timeout: 20000 }).catch(() => {});
    if (await page.$("#ckokn")) { await page.check("#ckokn", { force: true }); await page.check("#ckokm", { force: true }); await page.fill("#ckcode", (await page.textContent("#ckshow")).trim()); await page.click("#cksubmit"); await sleep(1500); }
  }
  return p;
}

export const mkChecks = () => { const checks = []; return { checks, ck: (n, ok, d = "") => { checks.push({ n, ok: !!ok, d: String(d).slice(0, 240) }); return !!ok; } }; };


let phoneSeq = 0;
/** A fake mobile number nobody owns (9 + 9 digits), unique inside this process. */
export const fakePhone = () => String(9000000000 + ((Date.now() % 100000) * 100 + (phoneSeq++ % 100)));
export const text = async (p) => (await p.page.locator("body").innerText()).replace(/\s+/g, " ");
export const hasTicket = (p) => p.page.evaluate(() => !!(window.__rt && window.__rt.pid)).catch(() => false);
export const closeAll = (ps) => Promise.all(ps.map((p) => p && p.ctx && p.ctx.close().catch(() => {})));
/** Adds people to the organizer's list (the K6 box is added by the client). */
export const addPeople = (api, g, people) => api("POST", `/api/z/${g.tag.id}/people`, { people }, g.key);
/** Opens the organizer or Host/Co-host console on a page (flow=old keeps the previous screens, which the role tests read). */
export async function openConsole(env, g, key, { flow = "old", extra = "" } = {}) {
  const ctx = await newContext(env.browser, env.base, env.meter); await ctx.addInitScript((t) => { try { sessionStorage.setItem("ctz-org", t); localStorage.setItem("ctz-org", t); } catch {} }, key);
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  await page.goto(`${env.base}/zc.html?e=${g.tag.id}&flow=${flow}${extra}`, { waitUntil: "load" }); await sleep(2500);
  return { page, ctx, errs, text: async () => (await page.locator("body").innerText()).replace(/\s+/g, " ") };
}
/** A Host or a Co-host of this game: the organizer adds them, they accept the role. Returns the key. */
export async function addRole(api, g, kind, label = "Role") {
  const r = kind === "host" ? await api("POST", "/api/org/host", { label, email: `test+${g.tag.id.toLowerCase()}-h@example.invalid`, e: g.tag.id }, g.key) : await api("POST", "/api/org/cohost", { label, phone: fakePhone(), e: g.tag.id }, g.key);
  const key = r.body.hostKey || r.body.cohostKey; if (!key) throw new Error(kind + " not added: " + JSON.stringify(r.body).slice(0, 160));
  return key;
}
export const acceptRole = (api, key) => api("POST", "/api/org/role/accept", {}, key);
/** The fast setting: the shortest gap the engine allows (6 s) and a short lead. Real-time otherwise; see README. */
export const FAST = { callSeconds: 6, startInSec: 45 };
