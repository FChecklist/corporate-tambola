// A whole engagement in real Chrome with the real public randomness beacon: two phones join in time, a third joins mid-game.
// Checks the countdown, the 2-minute setup message, numbers, the late joiner's rules, and that every phone works out the same winners and ends the game itself.
// Usage: node tools/sim/browser-e2e.mjs   (takes about 8 to 11 minutes: the numbers come at the real pace)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
const require = createRequire("C:/ct/ct/package.json");
const { chromium } = require("playwright-core");
const BUN = "C:/Users/Dell/AppData/Roaming/npm/node_modules/bun/node_modules/@oven/bun-windows-x64-baseline/bin/bun.exe";
const PORT = 8791, BASE = `http://localhost:${PORT}`, G = 1692803367;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const checks = []; const check = (name, ok, extra = "") => { checks.push(ok); log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); };

const srv = spawn(BUN, ["run", "tools/sim/local-e2e-server.ts"], { cwd: "C:/ct/tambola", env: { ...process.env, PORT: String(PORT) } });
await new Promise((res, rej) => { srv.stdout.on("data", (d) => String(d).includes("READY") && res()); srv.on("exit", () => rej(new Error("server exited"))); setTimeout(() => rej(new Error("server did not start")), 30000); });
const api = async (method, path, body, headers = {}) => { const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

const nowRound = () => Math.floor((Date.now() / 1000 - G) / 3) + 1;
const id = "E2E" + Math.floor(Math.random() * 1e6);
const created = await api("POST", "/api/z", { id, startRound: nowRound() + 20, callSeconds: 6, cap: 30 }, { "x-organizer": "e2e" }); // the time given is ~60 s away; the first number comes 2 minutes after that
check("engagement created and published", created.status === 200, JSON.stringify(created.body).slice(0, 80));
await api("PATCH", `/api/z/${id}/settings`, { rewards: [{ pattern: "early5", ordinal: 1, text: "Gift hamper" }, { pattern: "top", ordinal: 1, text: "Movie tickets" }, { pattern: "full", ordinal: 1, text: "Voucher" }] }, { "x-organizer": "e2e" });
await api("POST", `/api/z/${id}/publish`, { email: "x@example.com", phone: "9811122233" }, { "x-organizer": "e2e" });

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const mk = async (phone, name) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`${BASE}/z.html?e=${id}`); await page.waitForSelector("#ph"); await page.fill("#ph", phone); await page.fill("#nm", name); await page.click("#go");
  await page.waitForFunction(() => window.__rt && window.__rt.phase === "play", null, { timeout: 20000 });
  return { page, errs, name };
};
const view = (p) => p.page.evaluate(() => { const v = window.__rt.view(); return { phase: v.phase, log: v.log.length, late: v.late, results: v.results.map((x) => `${x.pattern}:${x.ordinal}:${x.idx}:${x.count}`).sort(), won: v.won.map((w) => `${w.pattern}:${w.ordinal}`).sort(), endedByPrizes: v.endedByPrizes, local: v.localWinners, mode: v.mode }; });
const text = (p) => p.page.evaluate(() => document.getElementById("app").innerText.replace(/\s+/g, " "));

const a = await mk("9810000001", "Asha"), b = await mk("9810000002", "Bala");
for (let i = 0; i < 30 && !/Starting in\s*\d\d:/i.test(await text(a)); i++) await sleep(1000); // the clock syncs a moment after joining
const t0 = await text(a);
check("countdown shows hours:minutes:seconds before the time given", /Starting in\s*\d\d:\d\d:\d\d/i.test(t0), (/Starting in\s*[\d:]+/i.exec(t0) || [""])[0] + " | " + t0.slice(0, 200));
for (let i = 0; i < 60 && !/Your game is setting up/i.test(await text(a)); i++) await sleep(2000);
const t1 = await text(a);
check("at the time given: 'Your game is setting up, waiting 2 minutes more for everyone to join'", /Your game is setting up/i.test(t1) && /waiting 2 minutes more for everyone to join/i.test(t1), (/\d\d:\d\d:\d\d/.exec(t1) || [""])[0]);
log("waiting for the first number (about 2 minutes)...");
for (let i = 0; i < 90 && (await view(a)).log < 1; i++) await sleep(2000);
check("the first number arrives after the 2-minute window", (await view(a)).log >= 1);
for (let i = 0; i < 60 && (await view(a)).log < 8; i++) await sleep(2000);
log("a third phone joins mid-game");
const c = await mk("9810000003", "Chandra");
for (let i = 0; i < 10 && !/You joined after the game began/i.test(await text(c)); i++) await sleep(1000);
const vc = await view(c), tc = await text(c);
check("the late joiner sees no old numbers and is told so", vc.log === 0 && vc.late !== null && /You joined after the game began/i.test(tc) && /Numbers called before you joined are gone/i.test(tc), `countdown ${(/\d\d:\d\d:\d\d/.exec(tc) || [""])[0]} | ${tc.slice(0, 260)}`);
if (process.env.E2E_QUICK) { await browser.close(); srv.kill(); process.exit(checks.every(Boolean) ? 0 : 1); }
const all = [a, b, c];
const t_end = Date.now() + 12 * 60_000;
for (;;) { const vs = await Promise.all(all.map(view)); if (vs.every((v) => v.phase === "ended")) break; if (Date.now() > t_end) { log("timed out waiting for the end", JSON.stringify(vs.map((v) => [v.log, v.phase]))); break; } await sleep(4000); }
const vs = await Promise.all(all.map(view)), ts = await Promise.all(all.map(text));
check("every phone ended the game by itself on the last prize", vs.every((v) => v.phase === "ended" && v.endedByPrizes), JSON.stringify(vs.map((v) => [v.log, v.phase])));
check("every phone worked the winners out locally", vs.every((v) => v.local));
check("all three phones show the same winners", JSON.stringify(vs[0].results) === JSON.stringify(vs[1].results) && JSON.stringify(vs[1].results) === JSON.stringify(vs[2].results), JSON.stringify(vs[0].results));
check("thank-you and share on every phone", ts.every((x) => /extended family of Corporate Tambola/i.test(x) && /Share with friends and colleagues/i.test(x)));
check("the late joiner saw only numbers from its own start", vs[2].late && vs[2].log < vs[0].log && vs[2].late.hidden > 0, `late saw ${vs[2].log}, early saw ${vs[0].log}, hidden ${vs[2].late && vs[2].late.hidden}`);
const shares = vs[0].results.reduce((n, r) => n + Number(r.split(":")[3]), 0); // a tie at the same call shares the prize
check("each phone lists exactly the prizes it won (every prize line has a winner; ties share)", vs.reduce((n, v) => n + v.won.length, 0) === shares, JSON.stringify(vs.map((v) => v.won)) + " shares " + shares);
check("no script errors on any page", [a, b, c].every((p) => p.errs.length === 0), [a, b, c].flatMap((p) => p.errs).join(" | ").slice(0, 300));
await browser.close(); srv.kill();
process.exit(checks.every(Boolean) ? 0 : 1);
