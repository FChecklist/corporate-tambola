// Game alerts, the player page (1.13.0): the "Yes, notify me when this game begins" button, DARK until one setting is filled in. Tests use a fake push service and a fake browser; nothing real is called.
// FALSIFIED BY (each one was put in by hand, the test went red, then it was taken out again): an address set in push-boot.js (the dark tests, 16 red), a changed byte in a client file,
// zsw.js without stopImmediatePropagation (a news click opened a second window), z.js without the game-over signal, the player page's connect-src naming the service while dark.
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { pushApiFromSource, realPushAddress, withPushConnect } from "../../../pages/push-config.mjs";

const ROOT = join(import.meta.dir, "../../..");
const PUB = join(ROOT, "apps/web/public");
const bytes = (f: string) => readFileSync(join(PUB, f));
const text = (f: string) => bytes(f).toString("utf8");
const gitBlob = (b: Buffer) => createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest("hex");
const GAME = "ABC123xyz";
const BOOT = text("push-boot.js");
const LIVE = BOOT.replace('var PUSH_API = "";', 'var PUSH_API = "https://push.test";');
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0)); };

function page(src: string, o: { search?: string; over?: boolean; demo?: boolean } = {}) {
  const win: any = new Window({ url: "https://tambola.test/z.html" + (o.search ?? "?e=" + GAME), settings: { disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true, disableCSSFileLoading: true } });
  const d = win.document;
  d.body.innerHTML = '<main id="app"></main><aside class="mkown">own game</aside>';
  if (o.over) d.documentElement.setAttribute("data-game-over", "1");
  if (o.demo) win.__CT_DEMO = { eid: "x" };
  new Function("window", "document", "location", "CustomEvent", src)(win, d, win.location, win.CustomEvent);
  return win;
}

/** The real client file (push-optin.js) in a fake browser with a fake push service. Nothing leaves the process. */
function client(win: any) {
  const log: { path: string; body: any }[] = [], seen = { prompts: 0 };
  class FakeNotification { static permission = "default"; static requestPermission = async () => { seen.prompts++; return "granted"; }; }
  win.Notification = FakeNotification; win.PushManager = function () {};
  let current: any = null;
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", options: { applicationServerKey: new Uint8Array([1, 2, 3]) }, toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "P256", auth: "AUTH" } }; }, unsubscribe: async () => { current = null; return true; } };
  const reg = { pushManager: { getSubscription: async () => current, subscribe: async () => (current = sub) } };
  const navigator = { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120", platform: "Linux armv8l", maxTouchPoints: 5, serviceWorker: { getRegistration: async () => reg, ready: Promise.resolve(reg), register: async () => reg } };
  const fetchFake = async (url: string, init: any = {}) => { const u = new URL(url); log.push({ path: u.pathname, body: init.body ? JSON.parse(init.body) : null }); return { ok: true, json: async () => (u.pathname === "/vapid-public" ? { key: "BAUDBA" } : { ok: true }) }; };
  new Function("window", "document", "navigator", "Notification", "fetch", text("push-optin.js"))(win, win.document, navigator, FakeNotification, fetchFake);
  for (const n of win.document.querySelectorAll("[data-push-optin]")) win.CorporatePush.mount(n); // the client mounts itself on load; asking again is harmless (a block is mounted once) and keeps the test independent of the fake page's ready state
  return { log, seen };
}

describe("the three client files are the service's own, byte for byte (spec pinned at corporate-push f1e93f59)", () => {
  const PINNED: Record<string, string> = { "push-optin.js": "44cdc9b9431dedf3a6530a71645ada930f6237e8", "push-optin.css": "452e3d8dbeae5f9d4f707cb60aad94924e8a9840", "sw-push-snippet.js": "bbfe9843dff83325877a96336c7a77980044b185" };
  for (const [f, sha] of Object.entries(PINNED)) test(f + " has the git blob hash of the pinned original", () => { expect(gitBlob(bytes(f))).toBe(sha); });
});

describe("dark: PUSH_API is empty today, so nothing is drawn, loaded or requested", () => {
  test("the shipped setting is empty", () => { expect(BOOT).toContain('var PUSH_API = "";'); expect(pushApiFromSource(BOOT)).toBe(""); });
  test("with a game link and the setting empty: no block, no style file, no script file, no marker", () => {
    const win = page(BOOT); const d = win.document;
    expect(d.getElementById("ct-push")).toBe(null);
    expect(d.querySelectorAll("script, link").length).toBe(0);
    expect(win.__ctPush).toBeUndefined();
  });
  for (const bad of ["", " ", "https://", "http://push.test", "https://push", "https://push.test/send", "https://push.test/a b", "https://REPLACE-WITH-PUSH-SERVICE-ADDRESS", "javascript:alert(1)", "//push.test", "https://push.test?x=1"]) {
    test(`a setting that is not a real https address (${JSON.stringify(bad)}) stays dark`, () => {
      const win = page(BOOT.replace('var PUSH_API = "";', `var PUSH_API = ${JSON.stringify(bad)};`));
      expect(win.document.getElementById("ct-push")).toBe(null); expect(win.document.querySelectorAll("script, link").length).toBe(0);
      expect(realPushAddress(bad)).toBe("");
    });
  }
});

describe("switched on (a fake address): one block under the game, files loaded as they are, privacy link and the real service worker named", () => {
  test("the block carries the game id from the link and the settings the client needs", () => {
    expect(LIVE).not.toBe(BOOT);
    const win = page(LIVE); const d = win.document; const box = d.getElementById("ct-push");
    expect(box).not.toBe(null);
    const a = (n: string) => box.getAttribute(n);
    expect([a("data-push-site"), a("data-push-game-id"), a("data-push-api"), a("data-push-privacy"), a("data-push-sw"), a("data-push-ended")]).toEqual(["game", GAME, "https://push.test", "/privacy.html", "/zsw.js", "false"]);
    expect(box.hasAttribute("data-push-optin")).toBe(true);
    expect(box.nextElementSibling?.className).toBe("mkown"); // under the game, above the "create your own game" strip
    expect(d.querySelector('link[rel="stylesheet"]')?.getAttribute("href")).toBe("/push-optin.css");
    expect(d.querySelector("script")?.getAttribute("src")).toBe("/push-optin.js");
  });
  test("a trailing slash in the setting is dropped", () => { expect(page(BOOT.replace('var PUSH_API = "";', 'var PUSH_API = "https://push.test/";')).document.getElementById("ct-push")?.getAttribute("data-push-api")).toBe("https://push.test"); });
  test("no game id in the link (or an odd one), or the free demo: no block", () => {
    for (const s of ["", "?x=1", "?e=", "?e=a%20b", "?e=%3Cb%3E", "?e=" + "a".repeat(129)]) expect([s, page(LIVE, { search: s }).document.getElementById("ct-push")]).toEqual([s, null]);
    expect(page(LIVE, { demo: true }).document.getElementById("ct-push")).toBe(null);
  });
  test("a game already over when the page opens: the block starts as ended", () => { expect(page(LIVE, { over: true }).document.getElementById("ct-push")?.getAttribute("data-push-ended")).toBe("true"); });
  test("the game ends while the page is open: the block is told, and the attribute follows", () => {
    const win = page(LIVE); const box = win.document.getElementById("ct-push"); let told = 0;
    box.addEventListener("corporatepush:game-ended", () => told++);
    win.document.dispatchEvent(new win.CustomEvent("ct:game-over"));
    expect([told, box.getAttribute("data-push-ended")]).toEqual([1, "true"]);
  });
});

describe("with the real client file: no prompt and no request on page load, Stop always visible, the tap does the rest", () => {
  test("on load: the button and Stop are there, the privacy link is next to them, and nothing was asked or sent", async () => {
    const win = page(LIVE); const svc = client(win); await settle();
    const box = win.document.getElementById("ct-push");
    expect(box.querySelector(".cp-optin__btn")?.textContent).toBe("Yes, notify me when this game begins");
    const stop = box.querySelector(".cp-optin__stop"); expect(stop?.textContent).toBe("Stop notifications"); expect(stop.hidden).toBe(false);
    expect(box.querySelector(".cp-optin__privacy a")?.getAttribute("href")).toBe("/privacy.html");
    expect(svc.seen.prompts).toBe(0); expect(svc.log).toEqual([]);
  });
  test("a tap asks the browser once, then saves only the browser address and keys for THIS game's scope; Stop stays visible", async () => {
    const win = page(LIVE); const svc = client(win); await settle();
    const box = win.document.getElementById("ct-push");
    box.querySelector(".cp-optin__btn").click(); await settle();
    expect(svc.seen.prompts).toBe(1);
    expect(svc.log.map((l) => l.path)).toEqual(["/vapid-public", "/subscribe"]);
    expect(svc.log[1]!.body).toEqual({ subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "P256", auth: "AUTH" } }, scope: "game:" + GAME });
    expect(win.localStorage.getItem("corporatePush.v1.game:" + GAME)).toBe("1");
    expect(box.querySelector(".cp-optin__stop").hidden).toBe(false);
    expect(box.querySelector(".cp-optin__keep").hidden).toBe(true); // the game is not over
  });
  test("after the game: 'Keep notifying me about new games' appears, and one tap moves the browser to the new-games list and drops the game row", async () => {
    const win = page(LIVE); const svc = client(win); await settle();
    const box = win.document.getElementById("ct-push");
    box.querySelector(".cp-optin__btn").click(); await settle();
    win.document.dispatchEvent(new win.CustomEvent("ct:game-over")); await settle();
    const keep = box.querySelector(".cp-optin__keep"); expect(keep.hidden).toBe(false); expect(keep.textContent).toBe("Keep notifying me about new games");
    keep.click(); await settle();
    const posts = svc.log.slice(2);
    expect(posts.map((l) => [l.path, l.body.scope])).toEqual([["/subscribe", "home"], ["/unsubscribe", "game:" + GAME]]);
  });
  test("Stop removes the saved address from the service and clears what the page remembered", async () => {
    const win = page(LIVE); const svc = client(win); await settle();
    const box = win.document.getElementById("ct-push");
    box.querySelector(".cp-optin__btn").click(); await settle();
    box.querySelector(".cp-optin__stop").click(); await settle();
    expect(svc.log.at(-1)).toEqual({ path: "/unsubscribe", body: { endpoint: "https://fcm.googleapis.com/fcm/send/abc" } });
    expect(win.localStorage.getItem("corporatePush.v1.game:" + GAME)).toBe(null);
  });
});

describe("z.js tells the page when the game is over (the only change to z.js)", () => {
  const z = text("z.js");
  test("the signal is sent for an ended game, a game that did not start and a cancelled game, once, and the page never depends on it", () => {
    expect(z).toContain('if (v.phase === "ended" || INFO.dns || INFO.cancelled) overMark();');
    const line = z.split("\n").find((l) => l.includes("const overMark"))!; expect(line).toBeTruthy();
    const win: any = new Window({ url: "https://tambola.test/z.html?e=" + GAME }); let n = 0;
    win.document.addEventListener("ct:game-over", () => n++);
    const overMark = new Function("document", "CustomEvent", line.trim() + "\nreturn overMark;")(win.document, win.CustomEvent);
    overMark(); overMark(); overMark();
    expect(n).toBe(1); expect(win.document.documentElement.getAttribute("data-game-over")).toBe("1");
  });
  test("the page that loads it includes the (dark) button script, deferred, and no inline script", () => {
    const h = text("z.html"); expect(h).toContain('<script src="/push-boot.js" defer></script>'); expect(h).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
  });
});

describe("the service worker: the service's push and click handlers are in, the news handler is kept, one click opens one window", () => {
  function sw(importOk = true) {
    const listeners: Record<string, Function[]> = {}; const shown: any[] = [], opened: string[] = [], navigated: string[] = []; let closed = 0, focused = 0;
    const clientsList: any[] = [{ url: "https://tambola.test/z.html?e=old", navigate: async (u: string) => { navigated.push(u); }, focus: async () => { focused++; } }];
    const self: any = { addEventListener: (t: string, f: Function) => (listeners[t] ??= []).push(f), location: { origin: "https://tambola.test" }, registration: { showNotification: async (title: string, o: any) => { shown.push({ title, o }); } }, skipWaiting: () => {}, clients: { claim: async () => {}, matchAll: async () => clientsList, openWindow: async (u: string) => { opened.push(u); } } };
    const importScripts = (f: string) => { if (!importOk) throw new Error("NetworkError"); new Function("self", "importScripts", text(f.replace(/^\//, "")))(self, importScripts); };
    new Function("self", "importScripts", "caches", "fetch", "location", "Notification", text("zsw.js"))(self, importScripts, { open: async () => ({}), keys: async () => [] }, async () => new Response("{}"), self.location, { permission: "denied" });
    const fire = async (type: string, ev: any) => { const pend: Promise<unknown>[] = []; ev.waitUntil = (p: Promise<unknown>) => pend.push(p); ev.stopImmediatePropagation = () => { ev.__stop = true; }; for (const f of listeners[type] ?? []) { f(ev); if (ev.__stop) break; } await Promise.all(pend); };
    const click = (url: unknown) => fire("notificationclick", { notification: { data: { url }, close: () => { closed++; } } });
    return { listeners, shown, opened, navigated, click, fire, state: () => ({ closed, focused }) };
  }
  test("a push message shows a notification with its title, text and game link", async () => {
    const s = sw(); await s.fire("push", { data: { json: () => ({ title: "The game is starting", body: "Tap to join now.", url: "https://tambola.test/z.html?e=" + GAME }) } });
    expect(s.shown).toEqual([{ title: "The game is starting", o: { body: "Tap to join now.", tag: undefined, data: { url: "https://tambola.test/z.html?e=" + GAME } } }]);
  });
  test("a click on a game alert opens the game link once: one window, the notification closed once, no second handler", async () => {
    const s = sw(); const link = "https://tambola.test/z.html?e=" + GAME;
    expect(s.listeners["notificationclick"]!.length).toBe(2); // the news handler first, the service's handler second
    await s.click(link);
    expect(s.opened).toEqual([link]); expect(s.navigated).toEqual([]); expect(s.state().closed).toBe(1);
  });
  test("a click on one of our own news notifications keeps its old behaviour: the open window goes to the page, no new window", async () => {
    const s = sw(); await s.click("/news");
    expect(s.navigated).toEqual(["/news"]); expect(s.opened).toEqual([]); expect(s.state().closed).toBe(1); expect(s.state().focused).toBe(1);
  });
  test("a click on an alert that points to another site opens the home page, not that site (the service's own rule)", async () => {
    const s = sw(); await s.click("https://evil.example/x"); expect(s.opened).toEqual(["https://tambola.test/"]);
  });
  test("if the service's file cannot be loaded the worker still starts: the game and the news work, only alerts are missing", async () => {
    const s = sw(false);
    for (const t of ["install", "activate", "message", "fetch", "periodicsync", "notificationclick"]) expect([t, (s.listeners[t] ?? []).length > 0]).toEqual([t, true]);
    expect(s.listeners["push"]).toBeUndefined();
    await s.click("/news"); expect(s.navigated).toEqual(["/news"]);
  });
  test("the saved copy's name moved on, and the snippet is imported after the news handler (the order the click rule needs)", () => {
    const z = text("zsw.js"); expect(Number(/const CACHE = "ct-game-v(\d+)"/.exec(z)![1])).toBeGreaterThanOrEqual(49);
    expect(z.indexOf('self.addEventListener("notificationclick"')).toBeLessThan(z.indexOf('importScripts("/sw-push-snippet.js")'));
    expect(z).toContain("e.stopImmediatePropagation()");
  });
});

describe("the build: the files ship, and the page's connection rule names the service only when it is switched on", () => {
  const CSP = "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://api.drand.sh; frame-ancestors 'none'";
  test("withPushConnect: no address = unchanged; an address is added to connect-src only; script-src is never touched", () => {
    expect(withPushConnect(CSP, "")).toBe(CSP); expect(withPushConnect(CSP, "http://push.test")).toBe(CSP); expect(withPushConnect(CSP, "https://push")).toBe(CSP);
    const on = withPushConnect(CSP, "https://push.test/");
    expect(on).toContain("connect-src 'self' https://push.test https://api.drand.sh"); expect(on).toContain("script-src 'self' https://static.cloudflareinsights.com;");
    expect(on.replace(" https://push.test", "")).toBe(CSP);
  });
  test("pushApiFromSource reads the one setting from push-boot.js (empty today)", () => { expect(pushApiFromSource(LIVE)).toBe("https://push.test"); expect(pushApiFromSource(BOOT)).toBe(""); expect(pushApiFromSource("nothing")).toBe(""); });
  test("build: the four files are shipped, z.html loads push-boot.js, and the live /z rule is the plain game rule while dark (no service address, script-src as before)", () => {
    const b = Bun.spawnSync(["bun", "run", join(ROOT, "pages/build.mjs")], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    expect(b.exitCode, new TextDecoder().decode(b.stderr)).toBe(0);
    const OUT = join(ROOT, "pages/public");
    for (const f of ["push-boot.js", "push-optin.js", "push-optin.css", "sw-push-snippet.js"]) expect([f, existsSync(join(OUT, f))]).toEqual([f, true]);
    expect(readFileSync(join(OUT, "z.html"), "utf8")).toMatch(/<script src="\/push-boot\.js\?v=[0-9a-f]+" defer>/);
    expect(readFileSync(join(OUT, "push-boot.js"), "utf8")).toMatch(/var PUSH_API\s*=\s*""/);
    const headers = readFileSync(join(OUT, "_headers"), "utf8").replace(/\r/g, "");
    const rule = (path: string) => headers.split(/\n(?=\S)/).find((blk) => blk.startsWith(path + "\n"))!;
    const z = rule("/z"), preview = rule("/preview");
    expect(z).toContain("script-src 'self' https://static.cloudflareinsights.com;"); expect(z).not.toContain("push");
    expect(z.match(/Content-Security-Policy: (.*)/)![1]).toBe(preview.match(/Content-Security-Policy: (.*)/)![1]); // dark: the player page's rule is the game rule it always was
  });
});

describe("the privacy words say what is true about the alert", () => {
  const plain = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&rsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/\s+/g, " ");
  for (const [label, file] of [["the privacy page", join(PUB, "privacy.html")], ["the privacy page's source fragment (tools/legal)", join(ROOT, "tools/legal/privacy.frag.html")]] as const) {
    test(`${label}: a browser address and not the name, e-mail or phone; deleted with the game within 24 hours; never 'not personal data'`, () => {
      const t = plain(readFileSync(file, "utf8"));
      expect(t).toContain("a browser address, not your name, e-mail or phone");
      expect(t).toContain("deleted with the game, within 24 hours");
      expect(t).toContain("Yes, notify me when this game begins");
      expect(t).toContain("Stop");
      expect(t.toLowerCase()).not.toContain("not personal data");
    });
  }
  test("the privacy page still sends the visitor on to the one document (the words above are added, nothing is taken away)", () => {
    const h = text("privacy.html");
    expect(h).toContain('http-equiv="refresh" content="0; url=/terms.html#privacy"');
    expect(h).toContain('href="/terms.html#privacy"');
  });
});
