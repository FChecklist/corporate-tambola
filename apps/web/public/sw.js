/*
 * Corporate Tambola service worker = the "download once, stay cached" thin client.
 *
 * - The first visit downloads the whole participant app (a few hundred KB: screens, fonts, voice player) into the
 *   phone's Cache Storage. Later visits open from the phone itself, even with weak signal.
 * - Only files whose hash changed on the server are downloaded again (/api/app-manifest lists the hashes).
 * - API calls and the WebSocket are never cached or intercepted: during an engagement the only traffic is
 *   the tiny pushed messages and the participant's own claims.
 */
const CACHE = "tb-app-v3";
const CONCURRENCY = 4;

async function manifest() {
  const r = await fetch("/api/app-manifest", { cache: "no-store" });
  if (!r.ok) throw new Error("manifest");
  return r.json();
}

async function isFresh(cache, a) {
  const hit = await cache.match(a.url);
  return !!hit && hit.headers.get("x-tb-hash") === a.hash;
}

// Downloads every file in the groups that is missing or changed. Reports progress to the page that asked.
async function ensure(groups, client) {
  const m = await manifest();
  const cache = await caches.open(CACHE);
  const want = [];
  for (const g of groups) for (const a of m.groups[g] || []) if (!want.find((x) => x.url === a.url)) want.push(a);
  const stale = [];
  for (const a of want) if (!(await isFresh(cache, a))) stale.push(a);
  const total = stale.reduce((n, a) => n + a.size, 0);
  let done = 0, i = 0;
  const post = (extra) => client && client.postMessage({ type: "tb-sw", version: m.version, groups, bytesTotal: total, bytesDone: done, filesTotal: stale.length, ...extra });
  post({ state: stale.length ? "downloading" : "ready" });
  async function worker() {
    while (i < stale.length) {
      const a = stale[i++];
      const res = await fetch(a.url + "?v=" + a.hash, { cache: "reload" });
      if (!res.ok) throw new Error("download " + a.url);
      const body = await res.blob();
      await cache.put(a.url, new Response(body, { status: 200, headers: { "content-type": res.headers.get("content-type") || "application/octet-stream", "x-tb-hash": a.hash } }));
      done += a.size;
      post({ state: "downloading" });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  post({ state: "ready", bytesDone: total });
  return { version: m.version, downloaded: stale.length, bytes: total };
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "ensure") {
    const client = e.source;
    e.waitUntil(ensure(d.groups || ["core"], client).catch((err) => client && client.postMessage({ type: "tb-sw", state: "error", message: String(err && err.message || err) })));
  }
});

function shellFor(url) {
  if (/^\/(e|p)\/[^/]+$/.test(url.pathname)) return "/play.html";
  if (/^\/r\/[^/]+$/.test(url.pathname) || url.pathname === "/console") return "/console.html";
  return null;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/ws" || url.pathname === "/sw.js") return; // always live
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // screens: the pages are single shells that read the code from the URL, so one cached file serves every link
    const shell = req.mode === "navigate" ? shellFor(url) : null;
    if (shell) { const hit = await cache.match(shell); if (hit) return hit; }
    // assets: from the phone first
    const hit = await cache.match(url.pathname);
    if (hit) return hit;
    return fetch(req);
  })());
});
