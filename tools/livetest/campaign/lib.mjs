// Shared pieces of the campaign driver (notes 310 and the use cases in tools/livetest/usecases-100.json).
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
export const ROOT = join(here, "../../..");
export const DATA = process.env.CAMPAIGN_DATA || "C:/ct/test-sites/data/campaign"; mkdirSync(DATA, { recursive: true }); // outside the repository: it holds organizer keys of test games
// Playwright comes from the environment first (CAMPAIGN_PLAYWRIGHT = a package.json path of a folder that has it), then from the normal module path, then from the laptop copy.
const loadPlaywright = async () => {
  if (process.env.CAMPAIGN_PLAYWRIGHT) return createRequire(process.env.CAMPAIGN_PLAYWRIGHT)("playwright");
  try { return await import("playwright"); } catch { /* fall through */ }
  return createRequire("C:/ct/ct/dpdp-app/package.json")("playwright");
};
export const { chromium } = await loadPlaywright();
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
/** The engine lets one network address open 10 new games a day (a product guard, never lifted). The local test server sees every case as one address, so each /api/start of the tool carries its own made-up address (the real site ignores nothing: layer C keeps its real address and its 10-a-day limit). */
let ipSeq = 0;
const ipOf = (path) => (path === "/api/start" ? `10.${(ipSeq >> 16) & 255}.${(ipSeq >> 8) & 255}.${(++ipSeq) & 255}` : "");
export function makeApi(base, meter) {
  return async function api(method, path, body, key, extra = {}) {
    if (meter) meter.count(1, `${method} ${path}`);
    const k = kindOf(method, path);
    if (k && body && !body.consent) body = { ...body, consent: { v: CONSENT.version, boxes: Object.keys(CONSENT[k]) } };
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}), ...(!isReal(base) && ipOf(path) ? { "cf-connecting-ip": ipOf(path) } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch { /* not JSON */ }
    return { ok: r.ok, status: r.status, body: j };
  };
}
