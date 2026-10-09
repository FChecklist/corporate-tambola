// PUB-*: the public website in real Chrome: every page, price card for every size and currency, sticky bar, FAQ and privacy lines, sign-in sheet, sitemap/robots, mobile layouts, PWA offline reopen.
import { BASE, IS_LIVE, u, anon, expect, J, requireTestMode, tc, tcb, test } from "./lib/harness";
import type { Page } from "@playwright/test";

test.beforeAll(async () => { if (IS_LIVE) await requireTestMode(); });

const PUBLIC = ["/", "/legal", "/terms", "/dpa", "/subprocessors", "/partner", "/partner-terms", "/organizer-guide", "/signin", "/pay", "/z", "/big", "/report", "/zc", "/ai-link"];
async function watch(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/favicon|Failed to load resource.*(40[134]|net::ERR_BLOCKED)/i.test(t)) errs.push("console: " + t.slice(0, 160)); } });
  page.on("requestfailed", (r) => { if (!/rum|beacon|drand|v\/b|telemetry/i.test(r.url())) errs.push("requestfailed: " + r.url().slice(0, 100)); });
  return errs;
}

tcb({ id: "PUB-01", role: "anonymous visitor", title: "every public page loads (200), has a title and raises no script or console error", steps: "Open each of 15 pages in Chrome at phone size", expected: "HTTP 200, non-empty <title>, zero page errors" }, async ({ page }) => {
  const bad: string[] = [];
  for (const p of PUBLIC) {
    const errs = await watch(page);
    const r = await page.goto(u(p), { waitUntil: "load" });
    const title = await page.title();
    if (!r || r.status() !== 200) bad.push(`${p} -> ${r?.status()}`);
    else if (!title.trim()) bad.push(`${p} has no title`);
    await page.waitForTimeout(250);
    if (errs.length) bad.push(`${p}: ${errs.slice(0, 2).join(" | ")}`);
    page.removeAllListeners();
  }
  expect(bad).toEqual([]);
  return `${PUBLIC.length} pages ok`;
});
tcb({ id: "PUB-02", role: "anonymous visitor", title: "unknown and odd addresses show the friendly 404 page, never a stack trace", steps: "Open /nope, /%00, /..%2f..%2f, /a/b/c, //evil.example, /api/nope", expected: "404 with the site's own page (or JSON 404 for /api), no server internals" }, async ({ page }) => {
  const out: string[] = [];
  for (const p of ["/nope-page", "/%00", "/..%2f..%2fetc%2fpasswd", "/a/b/c/d", "/api/nope", "/z.html.bak", "/.env", "/config/live-secrets.txt", "/wrangler.toml", "/package.json"]) {
    const r = await page.goto(u(p)); const body = await page.content(); out.push(`${p}:${r?.status()}`);
    expect(r?.status(), `${p}`).toBeGreaterThanOrEqual(400);
    expect(body).not.toMatch(/at .*\(.*:\d+:\d+\)|ORGANIZER_SECRET|DATA_KEY|PHONE_SALT|STRICT_KEYS/);
  }
  return out.join(" ");
});
tc({ id: "PUB-03", role: "search engine", title: "sitemap lists only real public pages; robots keeps private pages out and points to the sitemap", steps: "Fetch /sitemap.xml and /robots.txt; open every sitemap URL", expected: "every URL 200; no zc/pay/report/ai/owner in sitemap; robots has Sitemap: and disallows private paths" }, async () => {
  const sm = await fetch(BASE + "/sitemap.xml"), xml = await sm.text(), rb = await (await fetch(BASE + "/robots.txt")).text();
  expect(sm.status).toBe(200);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  expect(urls.length).toBeGreaterThan(3);
  const bad: string[] = [];
  for (const loc of urls) { const path = new URL(loc).pathname; const r = await fetch(u(path)); if (r.status !== 200) bad.push(`${loc} -> ${r.status}`); if (/\/(zc|pay|report|ai|owner|big|z)(\/|\.html|$)/.test(path)) bad.push(`private page in sitemap: ${loc}`); }
  expect(bad).toEqual([]);
  expect(rb).toMatch(/Sitemap:/i); expect(rb).toMatch(/Disallow:\s*\/(zc|api|report|pay|ai)/i);
  return `${urls.length} urls; robots ${rb.split("\n").length} lines`;
});
tcb({ id: "PUB-04", role: "prospective organizer", title: "price card: every size and both currencies show the same price the server charges", steps: "For each pack in the manifest select it (INR then USD) and read the card", expected: "INR shown = base price (total / 1.18, +GST noted); USD shown = total; no NaN / undefined / blank" }, async ({ page }) => {
  const man = (await anon().get("/api/z/ai-manifest")).body.packs as { upTo: number; inr_including_gst: number; usd: number }[];
  expect(man.length).toBeGreaterThan(5);
  await page.goto(BASE + "/"); await page.waitForSelector("#pack2");
  const bad: string[] = []; const seen: string[] = [];
  const num = (s: string) => Number(s.replace(/[^0-9.]/g, ""));
  for (const cur of ["INR", "USD"]) {
    await page.locator(`[data-c="${cur}"]`).first().click();
    for (const p of man) {
      await page.selectOption("#pack2", String(p.upTo));
      const tot = (await page.locator(".pcard .tot").innerText()).trim(), was = (await page.locator(".pcard .was").innerText()).trim();
      const shown = num(tot.replace(/Festive price/i, ""));
      const want = cur === "INR" ? p.inr : p.usd;
      if (!(Math.abs(shown - want) <= (cur === "INR" ? 1 : 0.01))) bad.push(`${cur} ${p.upTo}: page ${shown} vs server ${want}`);
      if (/NaN|undefined|null/.test(tot + was)) bad.push(`${cur} ${p.upTo}: junk "${tot}"`);
      if (p.upTo === man[0]!.upTo || p.upTo === man.at(-1)!.upTo) seen.push(`${cur}/${p.upTo}=${tot.replace(/\s+/g, " ")}`);
    }
  }
  expect(bad).toEqual([]);
  return `${man.length} sizes x 2 currencies checked; e.g. ${seen.join(" ; ")}`;
});
tcb({ id: "PUB-05", role: "prospective organizer", title: "price drop-down is keyboard and screen-reader usable and survives a currency switch", steps: "Focus the select, change with the keyboard, switch currency, read aria", expected: "label 'How many participants?', same pack kept after switching currency" }, async ({ page }) => {
  await page.goto(BASE + "/"); await page.waitForSelector("#pack2");
  await page.focus("#pack2"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
  const v = await page.inputValue("#pack2");
  await page.locator('[data-c="USD"]').first().click();
  expect(await page.inputValue("#pack2")).toBe(v);
  expect(await page.locator('label[for="pack2"]').innerText()).toMatch(/How many participants/i);
  return `kept ${v} across currency switch`;
});
tcb({ id: "PUB-06", role: "prospective organizer", title: "sticky bar: hidden at the top, appears after scrolling, 'Create your game' jumps to pricing, brand returns to top", steps: "Scroll 800px; click the bar's button; click brand", expected: "bar hidden then visible; pricing in view after click; scrollY≈0 after brand click" }, async ({ page }) => {
  await page.goto(BASE + "/"); await page.waitForSelector("#pricing", { state: "attached" });
  const bar = page.locator("#topbar");
  expect(await bar.isHidden()).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 900)); await page.waitForTimeout(400);
  await expect(bar).toBeVisible();
  const buy = page.locator("#tbBuy"); await buy.click(); await page.waitForTimeout(900);
  const inView = await page.evaluate(() => { const r = document.getElementById("pricing")!.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
  expect(inView, "pricing in view after click").toBe(true);
  await page.locator("#tbTop").click(); await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(40);
  // the bar must not cover the price heading or the card's own button (sticky overlap)
  await page.evaluate(() => window.scrollTo(0, 900)); await page.locator("#tbBuy").click(); await page.waitForTimeout(900);
  const overlap = await page.evaluate(() => { const b = document.getElementById("topbar")!.getBoundingClientRect(), h = (document.querySelector("#pricing h2") ?? document.getElementById("pricing")!).getBoundingClientRect(); return h.top < b.bottom && h.bottom > b.top; });
  expect(overlap, "sticky bar covers the pricing heading").toBe(false);
  return "ok";
});
tcb({ id: "PUB-07", role: "prospective organizer", title: "FAQ and privacy lines say what the code does (24 hours, 365 days, 7 days, free to build, pay before start)", steps: "Read home and /legal text", expected: "each promise present exactly as the lifecycle code implements it; no 'free forever' or contradictory number" }, async ({ page }) => {
  await page.goto(BASE + "/"); const home = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  await page.goto(u("/legal")); const legal = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const need: [string, RegExp, string][] = [["home", /within 24 hours/i, "24-hour deletion"], ["home", /365 days/i, "365-day winners record"], ["home", /backups within 7 days/i, "backups 7 days"], ["home", /free/i, "free to build"], ["home", /not paid by the start time, it will not begin/i, "unpaid does not begin"],
    ["legal", /within 24 hours after the game ends/i, "privacy 24 h"], ["legal", /365 days/i, "privacy 365"], ["legal", /Backups clear within 7 days/i, "backups"]];
  const bad = need.filter(([w, re]) => !re.test(w === "home" ? home : legal)).map(([, , n]) => n);
  expect(bad, "missing promise text").toEqual([]);
  return "8 promises present";
});
tcb({ id: "PUB-08", role: "prospective organizer", title: "sign-in sheet: bad e-mail is explained, an unknown address gets the same neutral answer as a real one", steps: "#login: empty, 'abc', then an address with no account", expected: "inline error for the first two; the third shows 'Check your email' (no 'no such account')" }, async ({ page }) => {
  await page.goto(u("/") + "#login"); await page.waitForSelector("#lMail");
  await page.click("#lgGo"); await expect(page.locator("#fErr")).toContainText(/valid work email/i);
  await page.fill("#lMail", "abc"); await page.click("#lgGo"); await expect(page.locator("#fErr")).toContainText(/valid work email/i);
  await page.fill("#lMail", `nobody+e2e${Date.now()}@example.com`); await page.click("#lgGo");
  await expect(page.locator("#cdTitle")).toContainText(/Check your email/i);
  expect(await page.locator("body").innerText()).not.toMatch(/no account|not registered|unknown/i);
  return "neutral";
});
tcb({ id: "PUB-09", role: "organizer (new)", title: "create-engagement sheet: bad e-mail is refused in the sheet; a good alias creates the account and opens the console at once", steps: "Click 'Create your game', enter bad then good alias e-mail", expected: "inline error, then /zc opens signed in; TEST banner visible in console only (TEST mode)" }, async ({ page, context }) => {
  await page.goto(BASE + "/"); await page.locator("[data-buy]").first().click({ force: true }); await page.waitForSelector("#fMail");
  await page.fill("#fMail", "x@y"); await page.click("#frGo"); await expect(page.locator("#fErr")).toContainText(/valid work email/i);
  const [mu, md] = (process.env.E2E_OWNER_MAIL ?? "rajatsiroffice@gmail.com").split("@");
  await page.fill("#fMail", `${mu}+tbui${Date.now().toString(36)}@${md}`);
  await Promise.all([page.waitForURL(/\/zc(\.html)?$/, { timeout: 30_000 }), page.click("#frGo")]);
  await page.waitForLoadState("networkidle");
  const txt = await page.locator("body").innerText();
  expect(txt.length).toBeGreaterThan(50);
  const mode = (await anon().get("/api/mode")).body.mode;
  const banner = /TEST MODE/i.test(txt);
  expect(banner, `TEST banner in console while site mode is ${mode}`).toBe(mode === "TEST");
  // never on the public home page or the pay page
  for (const p of ["/", "/pay", "/z", "/big"]) { await page.goto(u(p)); expect(await page.locator("body").innerText(), `banner leaked on ${p}`).not.toMatch(/TEST MODE/i); }
  return `console banner=${banner}`;
});
const SIZES: [string, number, number][] = [["phone-small", 320, 640], ["phone", 390, 844], ["phone-large", 430, 932], ["tablet", 768, 1024], ["laptop", 1280, 800]];
tcb({ id: "PUB-10", role: "anonymous visitor", title: "mobile and desktop layouts: no sideways scroll and nothing wider than the screen on 6 pages x 5 screen sizes", steps: "Resize to 320/390/430/768/1280 and open each page", expected: "document width <= window width; no element's right edge beyond the screen by >2px" }, async ({ page }) => {
  const bad: string[] = [];
  for (const [name, w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    for (const p of ["/", "/legal", "/terms", "/partner", "/pay", "/z?e=NOPE1234"]) {
      await page.goto(u(p)); await page.waitForTimeout(300);
      const r = await page.evaluate(() => { const W = document.documentElement.clientWidth; const wide: string[] = []; document.querySelectorAll("body *").forEach((el) => { const b = (el as HTMLElement).getBoundingClientRect(); const cs = getComputedStyle(el as HTMLElement); if (b.width > 0 && b.right > W + 2 && cs.position !== "fixed" && cs.visibility !== "hidden" && !(el as HTMLElement).closest("[hidden],svg")) { let anc: HTMLElement | null = el.parentElement, clipped = false; while (anc) { const o = getComputedStyle(anc).overflowX; if (o === "hidden" || o === "auto" || o === "scroll") { clipped = true; break; } anc = anc.parentElement; } if (!clipped && wide.length < 3) wide.push(el.tagName.toLowerCase() + "." + String((el as HTMLElement).className).slice(0, 30)); } }); return { sw: document.documentElement.scrollWidth, W, wide }; });
      if (r.sw > r.W + 1) bad.push(`${name} ${p}: scrollWidth ${r.sw} > ${r.W}`);
      else if (r.wide.length) bad.push(`${name} ${p}: wide elements ${r.wide.join(",")}`);
    }
  }
  expect(bad).toEqual([]);
  return "30 layouts ok";
});
tcb({ id: "PUB-11", role: "anonymous visitor", title: "tap targets: primary buttons are at least 40px tall on a phone", steps: "390px viewport; measure visible buttons and links with role button on home", expected: "no visible button under 36px tall (soft: warn under 44)" }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(BASE + "/"); await page.waitForSelector("#pack2");
  const small = await page.evaluate(() => [...document.querySelectorAll("button, .btn, a.btn")].filter((e) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 36 && getComputedStyle(e as HTMLElement).visibility !== "hidden"; }).map((e) => ((e as HTMLElement).innerText || e.getAttribute("aria-label") || e.id || e.className).trim().slice(0, 30) + ":" + Math.round((e as HTMLElement).getBoundingClientRect().height)));
  expect(small, "buttons shorter than 36px").toEqual([]);
  return "ok";
});
tcb({ id: "PUB-12", role: "participant", title: "PWA: the phone page installs a service worker and reopens offline from cache", steps: "Open /z?e=X, wait for the service worker, go offline, reload", expected: "the shell loads offline (app root present), no browser error page" }, async ({ page, context }) => {
  await page.goto(u("/z?e=NOPE1234")); await page.waitForTimeout(500);
  const reg = await page.evaluate(async () => { if (!("serviceWorker" in navigator)) return "unsupported"; try { const r = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("no service worker registered in 10 s")), 10_000))]); return r.active ? "active" : "waiting"; } catch (e) { return "error " + e; } });
  expect(reg).toBe("active");
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  const body = await page.locator("body").innerText();
  await context.setOffline(false);
  expect(await page.title()).not.toMatch(/ERR_|offline|No internet/i);
  expect(body.length).toBeGreaterThan(5);
  return `sw ${reg}; offline body ${body.length} chars`;
});
tc({ id: "PUB-13", role: "anonymous visitor", title: "web app manifest and icons are valid and reachable", steps: "Fetch manifest.webmanifest and every icon", expected: "JSON with name, start_url, icons all 200 image/*" }, async () => {
  const m = await (await fetch(BASE + "/manifest.webmanifest")).json() as any;
  expect(m.name).toBeTruthy(); expect(m.start_url).toBeTruthy();
  const bad: string[] = [];
  for (const i of m.icons ?? []) { const r = await fetch(new URL(i.src, BASE + "/").toString()); if (r.status !== 200 || !(r.headers.get("content-type") ?? "").startsWith("image/")) bad.push(`${i.src} ${r.status}`); }
  expect(bad).toEqual([]);
  return `${(m.icons ?? []).length} icons ok`;
});
