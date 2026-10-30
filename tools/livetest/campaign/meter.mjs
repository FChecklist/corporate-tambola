// The request meter (layer C): counts EVERY request to the real site (API calls of the driver and every request of every Chromium page) and stops the run at the daily limit.
// The Cloudflare free plan allows about 100,000 requests a day for the whole account; the campaign may use 25,000 of them (note 310). The day is the UTC day (the quota resets at 00:00 UTC).
// The count lives in a file, so a second run on the same day continues from it. Local runs are counted too (separate file) but never stop.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { DATA, isReal } from "./lib.mjs";
export const DAILY_LIMIT = 25_000;
export class MeterStop extends Error { constructor(msg) { super(msg); this.name = "MeterStop"; } }
export class RequestMeter {
  constructor(base, { limit = DAILY_LIMIT, now = () => new Date() } = {}) {
    this.base = base; this.host = new URL(base).host; this.real = isReal(base); this.limit = limit; this.now = now; this.stopped = false; this.session = 0;
    this.file = `${DATA}/meter-${this.real ? "real" : "local"}-${this.day()}.json`;
    this.state = existsSync(this.file) ? JSON.parse(readFileSync(this.file, "utf8")) : { day: this.day(), total: 0, byKind: {} };
  }
  day() { return this.now().toISOString().slice(0, 10); }
  get total() { return this.state.total; }
  remaining() { return Math.max(0, this.limit - this.state.total); }
  /** Adds n requests; on the real site throws MeterStop once the day's limit is reached (the caller stops the run and cleans up). */
  count(n = 1, kind = "other") {
    if (this.day() !== this.state.day) this.state = { day: this.day(), total: 0, byKind: {} };
    this.state.total += n; this.session += n; const k = kind.split("?")[0].replace(/[A-Za-z0-9_-]{4,40}\/(?=[a-z])/, "<id>/"); this.state.byKind[k] = (this.state.byKind[k] || 0) + n;
    if (this.session % 25 === 0 || this.state.total >= this.limit) this.save();
    if (this.real && this.state.total >= this.limit) { this.stopped = true; this.save(); throw new MeterStop(`request meter: ${this.state.total} requests today on ${this.host}, the limit is ${this.limit}`); }
  }
  save() { try { writeFileSync(this.file, JSON.stringify(this.state)); } catch { /* the count in memory still stops the run */ } }
  /** Counts every request of a Chromium context that goes to the site; after the limit the context's requests to the site are aborted. */
  async watch(context) {
    await context.route((url) => url.host === this.host, async (route) => {
      if (this.stopped) return route.abort("blockedbyclient");
      try { this.count(1, "browser " + route.request().resourceType()); } catch { return route.abort("blockedbyclient"); }
      return route.continue();
    });
    return context;
  }
}
