// Shared pieces of the campaign driver (notes 310 and the use cases in tools/livetest/usecases-100.json).
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
export const ROOT = join(here, "../../..");
export const DATA = process.env.CAMPAIGN_DATA || "C:/ct/test-sites/data/campaign"; mkdirSync(DATA, { recursive: true }); // outside the repository: it holds organizer keys of test games
export const { chromium } = createRequire("C:/ct/ct/dpdp-app/package.json")("playwright");
export const CONSENT = JSON.parse(readFileSync(join(ROOT, "apps/edge/src/consent-text.json"), "utf8"));
export const GENESIS = 1692803367;
export const roundAt = (ms) => Math.floor((ms / 1000 - GENESIS) / 3) + 1;
export const roundMs = (r) => (GENESIS + (r - 1) * 3) * 1000;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const isReal = (base) => !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(base);
const kindOf = (method, path) => {
  if (method !== "POST") return null;
  if (path === "/api/start") return "K2";
  if (/^\/api\/z\/[A-Za-z0-9_-]{4,40}\/publish$/.test(path)) return "K1";
  if (/^\/api\/z\/[A-Za-z0-9_-]{4,40}\/join$/.test(path)) return "K4";
  if (/^\/api\/z\/[A-Za-z0-9_-]{4,40}\/(roster|people)(\?.*)?$/.test(path)) return "K6";
  if (path === "/api/org/role/accept" || path === "/api/host/setup/email") return "K5";
  return null;
};
/** A small API client: adds the consent boxes the real pages tick, counts every request in the meter, never throws on a refusal. */
export function makeApi(base, meter) {
  return async function api(method, path, body, key, extra = {}) {
    if (meter) meter.count(1, `${method} ${path}`);
    const k = kindOf(method, path);
    if (k && body && !body.consent) body = { ...body, consent: { v: CONSENT.version, boxes: Object.keys(CONSENT[k]) } };
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch { /* not JSON */ }
    return { ok: r.ok, status: r.status, body: j };
  };
}
