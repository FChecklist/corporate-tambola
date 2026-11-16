// The organizer's signed control messages (Pause, Resume, Next number, End) without a browser: the REAL browser bundle apps/web/public/control.js
// runs in this process on top of a tiny in-memory IndexedDB, exactly as tools/load-tests/nodephone.mjs does for the load tests. The signing key is kept per game here.
// usage: const c = await controlFor(base); await c.key(eid, token); const r = await c.send(eid, token, "pause"|"resume"|"next"|"stop");   r = { status, data }
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { clock } from "../../lib/clock.mjs";
import { roundAt } from "../../lib/beacon.mjs";

let TB = null;
function load() {
  if (TB) return TB;
  const store0 = new Map();
  globalThis.window ??= globalThis; globalThis.self ??= globalThis;
  globalThis.localStorage ??= { getItem: (k) => store0.get(k) ?? null, setItem: (k, v) => store0.set(k, String(v)), removeItem: (k) => store0.delete(k) };
  const stores = new Map(); const later = (r, v) => { setTimeout(() => { r.result = v; r.onsuccess && r.onsuccess(); }, 0); return r; };
  const db = { createObjectStore: (n) => { if (!stores.has(n)) stores.set(n, new Map()); }, transaction: (n) => ({ objectStore: () => ({ get: (k) => later({}, stores.get(n)?.get(k)), put: (v, k) => { stores.get(n).set(k, v); const r = {}; setTimeout(() => { r.result = undefined; r.onsuccess && r.onsuccess(); }, 0); return r; } }) }) };
  let created = false; globalThis.indexedDB = { open: () => { const r = { result: db }; setTimeout(() => { if (!created) { created = true; r.onupgradeneeded && r.onupgradeneeded(); } r.onsuccess && r.onsuccess(); }, 0); return r; } };
  vm.runInThisContext(readFileSync(fileURLToPath(new URL("../../../../apps/web/public/control.js", import.meta.url)), "utf8"), { filename: "control.js" });
  TB = globalThis.TBControl; return TB;
}
/** The helper bound to one sim server. Relative URLs and location.origin point at `base`; the real fetch is wrapped only while a call runs. */
export async function controlFor(base) {
  const tb = load();
  const run = async (fn) => {
    const orig = globalThis.fetch; const prevLoc = globalThis.location; globalThis.location = new URL(base);
    // the stamp on a signed message is the beacon's latest round: answer it from the SIMULATED clock (the real drand is out of reach in the sim, and the real clock is days away from the simulated one)
    globalThis.fetch = async (u, i) => { if (typeof u === "string" && /\/public\/latest$/.test(u)) return new Response(JSON.stringify({ round: roundAt(await clock.now()) }), { status: 200, headers: { "content-type": "application/json" } }); return orig(typeof u === "string" && u.startsWith("/") ? base + u : u, i); };
    try { return await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("control call timed out")), 25_000))]); } finally { globalThis.fetch = orig; globalThis.location = prevLoc; }
  };
  return {
    key: (eid, token) => run(() => tb.ensureKey(eid, { token, base, prefix: "/api/z" })),
    send: (eid, token, action, o) => run(() => tb.publish(eid, { token, base, prefix: "/api/z" }, action, o)),
  };
}
