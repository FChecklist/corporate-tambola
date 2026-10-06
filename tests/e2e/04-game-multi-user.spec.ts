// GM-*: one whole engagement played by several people at once, each in their own browser context (their own phone): join, second device, offline and back, a skewed phone clock,
// a late joiner, invitations (quota 4), announcements, the real public randomness beacon, winners that every phone works out by itself, prize confirmation on the winner's own phone,
// "prize given" ticks by the organizer, the report page. Runs against E2E_TARGET (live = real site in TEST mode, or the local stand-in).
import { Api, BASE, IS_LIVE, J, anon, dev, eid, expect, newOrg, owner, phone, requireTestMode, sleep, startIn, tc, tcb, test, u, type Org } from "./lib/harness";
import { devices, type BrowserContext, type Page } from "@playwright/test";

test.describe.configure({ timeout: 15 * 60_000 });
const LEAD = IS_LIVE ? 110 : 80; // seconds from setup to the start time given
let org: Org, m: Api, ID = "", startMs = 0, ready = false;
const P: Record<string, { ctx: BrowserContext; page: Page; errs: string[]; pid?: string }> = {};
let consoleP: Page | null = null;

const view = (p: Page) => p.evaluate(() => { const rt = (window as any).__rt; if (!rt) return null; const v = rt.view(); return { phase: v.phase, log: v.log.length, late: v.late, results: v.results.map((x: any) => `${x.pattern}:${x.ordinal}:${x.idx}:${x.count}`).sort(), won: v.won.map((w: any) => `${w.pattern}:${w.ordinal}`).sort(), endedByPrizes: v.endedByPrizes, local: v.localWinners, pid: v.pid }; });
const text = (p: Page) => p.evaluate(() => (document.getElementById("app") ?? document.body).innerText.replace(/\s+/g, " "));
const dev2 = (name: string) => { const d = { ...(devices[name] as any) }; delete d.defaultBrowserType; return d; };
const SKEW = 7 * 60_000;

async function phoneCtx(browser: any, who: string, device: string, opts: { skewMs?: number } = {}) {
  const ctx: BrowserContext = await browser.newContext({ ...dev2(device), reducedMotion: "reduce" });
  if (opts.skewMs) await ctx.addInitScript((off) => { const n = Date.now.bind(Date), D = Date; (Date as any).now = () => n() + off; (globalThis as any).Date = new Proxy(D, { construct(t, a: any[]) { return a.length ? new (t as any)(...a) : new (t as any)(n() + off); }, apply() { return new D(n() + off).toString(); } }); }, opts.skewMs);
  const page = await ctx.newPage(); const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  page.on("console", (c) => { if (c.type() === "error" && !/telemetry|favicon|rum/i.test(c.text())) errs.push(c.text().slice(0, 160)); });
  P[who] = { ctx, page, errs };
  return P[who]!;
}
async function joinUi(who: string, ph: string, name: string) {
  const { page } = P[who]!;
  await page.goto(u(`/z?e=${ID}`)); await page.waitForSelector("#ph", { timeout: 30_000 });
  await page.fill("#ph", ph); await page.fill("#nm", name); await page.click("#go");
  await page.waitForFunction(() => (window as any).__rt && (window as any).__rt.phase === "play", null, { timeout: 30_000 });
  P[who]!.pid = (await view(page))!.pid;
}

test.beforeAll(async () => {
  if (IS_LIVE) await requireTestMode();
  org = await newOrg("game"); m = new Api(BASE, org.token);
  ID = eid("G");
  const c = await m.post("/api/z", { id: ID, startRound: startIn(LEAD), callSeconds: 6, cap: 40 });
  if (c.status !== 200) throw new Error("create " + J(c.text));
  const s = await m.patch(`/api/z/${ID}/settings`, {
    rewards: [{ pattern: "early5", ordinal: 1, text: "Gift hamper" }, { pattern: "top", ordinal: 1, text: "Movie tickets" }, { pattern: "mid", ordinal: 1, text: "Coffee voucher" }, { pattern: "bot", ordinal: 1, text: "Lunch for two" }],
    breaks: [{ after: 8, seconds: 15, kind: "file", title: "Company video", mediaUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" }, { after: 14, seconds: 15, kind: "lucky", title: "Lucky draw", winners: 1, style: "draw" }],
    invites: { on: true, per: 4, cats: ["family", "colleagues"] }, startRound: startIn(LEAD),
  });
  if (s.status !== 200) throw new Error("settings " + J(s.text));
  startMs = s.body.startRound ? (1692803367 + (s.body.startRound - 1) * 3) * 1000 : 0;
  const p = await m.post(`/api/z/${ID}/publish`, { email: org.email, phone: "9811122233" }); if (p.status !== 200) throw new Error("publish " + J(p.text));
  const pay = await m.post("/api/payments/test", { eid: ID, email: org.email, org: "GM Test Org", country: "IN" }); if (pay.status !== 200) throw new Error("pay " + J(pay.text));
  ready = true;
});
test.afterAll(async () => { for (const k of Object.keys(P)) await P[k]!.ctx.close().catch(() => {}); });

tcb({ id: "GM-01", role: "organizer", title: "organizer console opens with the key, shows the engagement, and (in TEST mode) the TEST notice appears only here", steps: "Open /zc, paste the organizer key, open the engagement", expected: "console lists the engagement; announce box present; participants count 0; notice only in console" }, async ({ browser }) => {
  expect(ready, "setup").toBe(true);
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 }, reducedMotion: "reduce" }); P.console = { ctx, page: await ctx.newPage(), errs: [] }; consoleP = P.console.page;
  await consoleP.goto(u("/zc")); await consoleP.waitForSelector("#sec"); await consoleP.fill("#sec", org.token); await consoleP.click("#in");
  await consoleP.goto(u(`/zc?e=${ID}`)); await consoleP.waitForTimeout(2500);
  const t = await consoleP.locator("body").innerText();
  expect(t).toContain(ID);
  const mode = (await anon().get("/api/mode")).body.mode;
  expect(/TEST MODE/i.test(t)).toBe(mode === "TEST");
  return `console shows ${ID}; mode ${mode}`;
});
tcb({ id: "GM-02", role: "6 participants", title: "six people join from six separate phones (different device profiles, names with emoji / right-to-left) and each gets a ticket", steps: "Six contexts open the game link, enter number + name, press Get my ticket", expected: "all six reach the play screen with a 3x9 ticket; no page errors; six different seat numbers" }, async ({ browser }) => {
  expect(ready).toBe(true);
  const people: [string, string, string, string][] = [["A", "iPhone 13", phone(9001), "Asha 🎉"], ["B", "Pixel 7", phone(9002), "بلال"], ["C", "Galaxy S9+", phone(9003), "Chandra"], ["D", "iPhone SE", phone(9004), "Deepak <b>x</b>"], ["E", "Pixel 5", phone(9005), "Esha"], ["F", "iPhone 12", phone(9006), "Farhan"]];
  for (const [who, device, ph, name] of people) { await phoneCtx(browser, who, device, who === "F" ? { skewMs: SKEW } : {}); await joinUi(who, ph, name); }
  const seats = Object.values(P).filter((x) => x.pid).map((x) => x.pid!.split("x")[0]);
  expect(new Set(seats).size).toBe(6);
  for (const who of ["A", "B", "C", "D", "E", "F"]) expect(P[who]!.errs, `${who} page errors`).toEqual([]);
  const tk = await P.A!.page.locator("body").innerText(); expect(tk.length).toBeGreaterThan(40);
  return `seats ${seats.join(",")}`;
});
tcb({ id: "GM-03", role: "participant (second device)", title: "the same number on a second phone is refused with a clear message; the first phone keeps its ticket", steps: "A new context (fresh device id) joins with A's number", expected: "message 'already on another phone'; A still playing" }, async ({ browser }) => {
  expect(P.A).toBeTruthy();
  const second = await browser.newContext({ ...dev2("Pixel 7"), reducedMotion: "reduce" }); const pg = await second.newPage();
  await pg.goto(u(`/z?e=${ID}`)); await pg.waitForSelector("#ph"); await pg.fill("#ph", phone(9001)); await pg.fill("#nm", "Asha again"); await pg.click("#go");
  await pg.waitForTimeout(2500);
  const t = await pg.locator("body").innerText(); await second.close();
  expect(t).toMatch(/already on another phone|one device only|another phone/i);
  expect((await view(P.A!.page))!.phase).toBe("play");
  return t.replace(/\s+/g, " ").slice(0, 160);
});
tcb({ id: "GM-04", role: "participant", title: "closing and reopening the page on the same phone returns the same ticket", steps: "Reload B's page", expected: "same pid and seat" }, async () => {
  const before = (await view(P.B!.page))!.pid; await P.B!.page.reload(); await P.B!.page.waitForFunction(() => (window as any).__rt?.view()?.pid, null, { timeout: 30_000 });
  const after = (await view(P.B!.page))!.pid; expect(after).toBe(before);
  return `pid kept (${String(after).split("x")[0]})`;
});
tc({ id: "GM-05", role: "participant + invited friends", title: "invitations: one person can bring 4 friends, the 5th invite is refused", steps: "Friends join with ?from=<A's seat> via the invite link API; a 5th friend tries", expected: "4 accepted, 5th refused with invite-full" }, async () => {
  const seat = Number(P.A!.pid!.split("x")[0]);
  const out: number[] = [];
  for (let i = 0; i < 5; i++) { const r = await anon().post(`/api/z/${ID}/join`, { phone: phone(9100 + i), name: "Friend " + i, device: dev("fr" + i), from: seat, cat: "family" }); out.push(r.status); if (i === 4) expect(r.body.code).toBe("invite-full"); }
  expect(out.slice(0, 4)).toEqual([200, 200, 200, 200]); expect(out[4]).toBeGreaterThanOrEqual(400);
  const inv = await anon().get(`/api/z/${ID}/invites?pid=${P.A!.pid}`); expect(inv.body.used).toBe(4);
  return out.join(",");
});
tcb({ id: "GM-06", role: "participant", title: "countdown is right, and at the start time the phone says the game is setting up and waits 2 minutes for everyone", steps: "Read the countdown at start-60 s, then at the start time", expected: "'Starting in hh:mm:ss' within 3 s of the real time; then 'Your game is setting up ... waiting 2 minutes more'" }, async () => {
  const pg = P.C!.page; let sawCountdown = "", drift = 99;
  for (let i = 0; i < 80; i++) { const t = await text(pg); const mm = /Starting in\s*(\d\d):(\d\d):(\d\d)/i.exec(t); if (mm) { const shown = (+mm[1]! * 3600 + +mm[2]! * 60 + +mm[3]!) * 1000, real = startMs - Date.now(); drift = Math.abs(shown - real); sawCountdown = mm[0]; break; } await sleep(1000); }
  expect(sawCountdown, "countdown text").toBeTruthy(); expect(drift, `countdown drift ${drift} ms`).toBeLessThan(5000);
  for (let i = 0; i < 90 && !/Your game is setting up/i.test(await text(pg)); i++) await sleep(2000);
  const t1 = await text(pg); expect(t1).toMatch(/Your game is setting up/i); expect(t1).toMatch(/waiting 2 minutes more for everyone to join/i);
  return `${sawCountdown} drift ${drift} ms`;
});
tcb({ id: "GM-07", role: "participant (organizer announcement)", title: "an announcement from the organizer reaches every phone (needs the organizer's console open: it registers the key that signs messages)", steps: "POST announce with the console open; wait up to 90 s", expected: "the text appears on A, C and the big screen", known: "G4" }, async ({ browser }) => {
  const a = await m.post(`/api/z/${ID}/announce`, { text: "Welcome everyone! Numbers start in two minutes." }); expect(a.status, J(a.text)).toBe(200);
  let ok = false;
  for (let i = 0; i < 45 && !ok; i++) { const [ta, tc2] = await Promise.all([text(P.A!.page), text(P.C!.page)]); ok = /Welcome everyone/.test(ta) && /Welcome everyone/.test(tc2); if (!ok) await sleep(2000); }
  expect(ok, "announcement did not reach the phones within 90 s").toBe(true);
  return "delivered";
});
tcb({ id: "GM-08", role: "participants", title: "numbers start about 2 minutes after the time given, all phones show the same numbers (phone F's clock is 7 minutes fast)", steps: "Wait for first numbers; sample all phones 3 times", expected: "numbers called per phone differ by at most 1; the skewed phone is not ahead" }, async () => {
  for (let i = 0; i < 80 && (await view(P.A!.page))!.log < 5; i++) await sleep(2000);
  const spread: string[] = [];
  for (let k = 0; k < 3; k++) {
    const logs = await Promise.all(["A", "B", "C", "D", "E", "F"].map(async (w) => (await view(P[w]!.page))!.log));
    spread.push(logs.join("/")); expect(Math.max(...logs) - Math.min(...logs), `logs ${logs}`).toBeLessThanOrEqual(2);
    await sleep(6000);
  }
  return spread.join(" | ");
});
tcb({ id: "GM-09", role: "participant (offline)", title: "a phone that loses the network for 30 seconds mid-game catches up on return", steps: "E goes offline for 30 s then back", expected: "within 30 s of reconnecting E shows the same numbers as the others (no gap, no duplicates)" }, async () => {
  await P.E!.ctx.setOffline(true); await sleep(30_000); await P.E!.ctx.setOffline(false);
  let ok = false, last = "";
  for (let i = 0; i < 30 && !ok; i++) { const [e, a] = await Promise.all([view(P.E!.page), view(P.A!.page)]); last = `${e!.log} vs ${a!.log}`; ok = Math.abs(e!.log - a!.log) <= 1; if (!ok) await sleep(2000); }
  expect(ok, `E vs A numbers called: ${last}`).toBe(true);
  return last;
});
tcb({ id: "GM-10", role: "participant (late joiner)", title: "a person who joins after the first number is told so and sees no old numbers", steps: "A seventh phone joins mid-game", expected: "message 'You joined after the game began ... Numbers called before you joined are gone'" }, async ({ browser }) => {
  await phoneCtx(browser, "L", "Pixel 5"); await joinUi("L", phone(9007), "Late Lata");
  let t = ""; for (let i = 0; i < 10 && !/You joined after the game began/i.test(t); i++) { await sleep(1000); t = await text(P.L!.page); }
  const v = await view(P.L!.page);
  expect(t).toMatch(/You joined after the game began/i); expect(t).toMatch(/Numbers called before you joined are gone/i); expect(v!.log).toBeLessThanOrEqual(1);
  return `log ${v!.log}`;
});
tcb({ id: "GM-11", role: "participants", title: "a brand break (video link) and the lucky draw run on the phones without errors", steps: "Watch for the break and the draw screens on A", expected: "break screen shows its title; no CSP/media errors in the console; the lucky draw announces a ticket", known: "G5" }, async () => {
  let sawBreak = false, sawLucky = false;
  for (let i = 0; i < 120 && !(sawBreak && sawLucky); i++) { const t = await text(P.A!.page); if (/Company video/i.test(t)) sawBreak = true; if (/Lucky draw/i.test(t)) sawLucky = true; if ((await view(P.A!.page))!.phase === "ended") break; await sleep(3000); }
  const bad = P.A!.errs.filter((e) => /Content Security Policy|Refused to|media|CSP/i.test(e));
  expect(bad, "media/CSP errors on phone A").toEqual([]);
  expect({ sawBreak, sawLucky }).toEqual({ sawBreak: true, sawLucky: true });
  return `break ${sawBreak} lucky ${sawLucky}`;
});
tcb({ id: "GM-12", role: "participants", title: "the game ends by itself on every phone and every phone shows the same winners", steps: "Wait for the end (real beacon pace)", expected: "all phones phase=ended; identical results list; at least one winner per prize" }, async () => {
  const all = ["A", "B", "C", "D", "E", "F"]; const deadline = Date.now() + 12 * 60_000; let vs: any[] = [];
  for (;;) { vs = await Promise.all(all.map((w) => view(P[w]!.page))); if (vs.every((v) => v!.phase === "ended")) break; if (Date.now() > deadline) break; await sleep(4000); }
  expect(vs.map((v) => v!.phase), "phases").toEqual(all.map(() => "ended"));
  const r0 = JSON.stringify(vs[0]!.results); for (const v of vs) expect(JSON.stringify(v!.results)).toBe(r0);
  expect(vs[0]!.results.length).toBeGreaterThanOrEqual(4);
  const api = (await anon().get(`/api/z/${ID}/results`)).body.results; expect(api.length, "server settled results").toBeGreaterThanOrEqual(4);
  return `winners ${r0}`;
});
tcb({ id: "GM-13", role: "winner", title: "the winner confirms name and mobile on their own phone; the organizer sees it and ticks 'prize given'; both are still there after re-reading", steps: "Find a winning phone, press Confirm; organizer GET prizes; POST prizegiven; GET prizes again", expected: "confirmed:true with the name; given date persists" }, async () => {
  const all = ["A", "B", "C", "D", "E", "F"]; let winner = "";
  for (const w of all) { const v = await view(P[w]!.page); if (v!.won.length) { winner = w; break; } }
  expect(winner, "no phone reports a win").toBeTruthy();
  const pg = P[winner]!.page; await pg.waitForSelector("#cfgo", { timeout: 60_000 }); await pg.fill("#cfnm", "Winner Corrected"); await pg.click("#cfgo");
  await pg.waitForSelector("#cfedit", { timeout: 20_000 });
  const pr = await m.get(`/api/z/${ID}/prizes`); const txt = JSON.stringify(pr.body);
  expect(txt).toContain("Winner Corrected");
  const first = (pr.body.prizes ?? pr.body.winners ?? [])[0];
  const given = await m.post(`/api/z/${ID}/prizegiven`, { round: first.round ?? 1, pattern: first.pattern, ordinal: first.ordinal ?? 1, seat: first.seat, given: true });
  expect(given.status, J(given.text)).toBe(200);
  const again = await m.get(`/api/z/${ID}/prizes`); expect(JSON.stringify(again.body)).toMatch(/given/i);
  return `winner phone ${winner}; given ${J(given.body)}`;
});
tcb({ id: "GM-14", role: "organizer", title: "the report page opens from the organizer's link and offers the PDF (built in the organizer's own browser)", steps: "After the end + about 4 minutes, GET reportlink, open /report", expected: "link ready; report page shows a Save/Download PDF button and the winners", known: "" }, async ({ browser }) => {
  let url: string | null = null;
  for (let i = 0; i < 40 && !url; i++) { if (!IS_LIVE) await fetch(`http://localhost:${Number(process.env.E2E_PORT ?? 8791) + 1}/tick?now=${Date.now() + 5 * 60_000}`).catch(() => {}); const r = await m.get(`/api/z/${ID}/reportlink`); url = r.body.url ?? null; if (!url) await sleep(10_000); }
  expect(url, "report link not ready 6 minutes after the end").toBeTruthy();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } }); const pg = await ctx.newPage();
  const path = new URL(url!); await pg.goto(u(path.pathname.replace(/\.html$/, "") + path.search)); await pg.waitForTimeout(6000);
  const t = await pg.locator("body").innerText(); await ctx.close();
  expect(t).toMatch(/Save|Download|PDF/i);
  return t.replace(/\s+/g, " ").slice(0, 160);
});
