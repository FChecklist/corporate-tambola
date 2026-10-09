// Terms, data-processing terms, sub-processors, partner terms, organizer guide: short pages in the site style; organizer acceptance without a tick box, stored with the organizer.
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { withDevice } from "./device";
import { handle, type Env } from "../src/worker";
import { TERMS_VERSION } from "../src/brand";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env as Env, now);
const j = async (r: Response) => (await r.json()) as any;
const rd = (f: string) => readFileSync(new URL("../../web/public/" + f, import.meta.url), "utf8");
const rows = () => raw.prepare("SELECT org, version, via, at_ms FROM organizer_terms ORDER BY at_ms, via").all() as { org: string; version: string; via: string; at_ms: number }[];
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000", PUBLIC_ORIGIN: "https://tambola.test", DATA_KEY: "k", TEST_MODE: "1" }; });
const LINKS = ["/terms.html", "/dpa.html", "/subprocessors.html", "/organizer-guide.html", "/partner-terms.html"];

describe("the document pages", () => {
  const DOCS: Record<string, string[]> = {
    "terms.html": ["For organizers", "For players", "You must not charge any fee, price, donation or purchase for taking part", "You must be 18 or older", "Taking part must be voluntary", "You provide the prizes and hand them over", "You make sure the game is allowed under the law", "Players are 18 or older", "parent&rsquo;s or guardian&rsquo;s own ticket", `Version ${TERMS_VERSION}`, "/dpa.html"],
    "dpa.html": ["controller", "processor", "All player data is deleted within 24 hours", "Backups clear within 7 days", "365 days", "without undue delay", "/subprocessors.html"],
    "subprocessors.html": ["Cloudflare", "Resend", "Razorpay", "Google", "drand", "YouTube"],
    "partner-terms.html": ["independent partner", "No spam", "Tax may be deducted at source", "GST may apply", "No payment from the buyer, no commission"],
    "organizer-guide.html": ["Never ask for a fee", "Players are 18 or older", "INR 10,000", "tax deducted at source", "Check your state", "The game does not begin until it is paid for"],
  };
  for (const [f, needles] of Object.entries(DOCS)) test(`${f}: brand header and footer, title pattern, the right statements, no draft mark, no tick box, short lines`, () => {
    const h = rd(f);
    expect(h).toMatch(/<title>[^<]+ \| Corporate Tambola<\/title>/); expect(h).toContain('class="legaltop"'); expect(h).toContain('class="foot"'); expect(h).toContain('rel="icon"');
    for (const n of needles) expect(h).toContain(n);
    expect(h).not.toMatch(/DRAFT|lawyer review|type="checkbox"/i);
    expect(h).not.toMatch(/\bcompliant\b|certified by/i);
    for (const l of h.match(/<li>[\s\S]*?<\/li>/g) ?? []) expect(l.replace(/<[^>]+>/g, "").split(/\s+/).length).toBeLessThanOrEqual(36); // 36: the owner's credit sentence ("We do not give refunds. If you cancel a paid game before it starts, ... lapses at the end of day 365.") is 35 words
    for (const l of LINKS) expect(h).toContain(`href="${l}"`);
  });
  test("the home page and the legal page link every document in the footer; the build ships them with headers; the sitemap lists them", () => {
    for (const f of ["index.html", "legal.html"]) for (const l of LINKS) expect(rd(f)).toContain(`href="${l}"`);
    const b = readFileSync(new URL("../../../pages/build.mjs", import.meta.url), "utf8");
    for (const n of ["terms", "dpa", "subprocessors", "partner-terms", "organizer-guide"]) { expect(b).toContain(`"${n}.html"`); expect(b).toContain(`["/${n}", PLAINCSP`); expect(rd("sitemap.xml")).toContain(`/${n}.html`); }
  });
  test("the drafts README exists for the owner (not on the public pages)", () => {
    const t = readFileSync(new URL("../../../docs/compliance/DRAFTS_README.md", import.meta.url), "utf8"); expect(t).toMatch(/DRAFT FOR LAWYER REVIEW/); for (const f of Object.keys(DOCS)) expect(t).toContain(f);
  });
});

describe("acceptance by continuing, no tick box", () => {
  test("the create and sign-in pop-ups show one short line with links to the Terms and the Privacy & Data Policy, and no checkbox", () => {
    const s = rd("site.js"); const line = 'By continuing you accept the <a href="/terms.html" target="_blank" rel="noopener">Terms</a> and the <a href="/legal.html#privacy" target="_blank" rel="noopener">Privacy &amp; Data Policy</a>.';
    expect(s.split(line).length).toBe(3); expect(s).not.toMatch(/type="checkbox"/);
  });
  test("signing up stores the terms version with the organizer; the version equals the date on the Terms page", async () => {
    expect(rd("terms.html")).toContain(`Version ${TERMS_VERSION}`);
    const o = await j(await call("POST", "/api/start", { email: "boss@acme.com" }, { "cf-connecting-ip": "1.1.1.1" }));
    const r = rows(); expect(r.length).toBe(1); expect(r[0]).toMatchObject({ version: TERMS_VERSION, via: "start", at_ms: T });
    const org = (raw.prepare("SELECT org FROM organizer_key WHERE kind='master'").get() as any).org; expect(r[0]!.org).toBe(org);
    const start = Math.floor((T / 1000 - 1692803367) / 3) + 1200;
    await call("POST", "/api/z", { id: "TERMS-1", startRound: start, callSeconds: 6, cap: 100 }, { "x-organizer": o.token }, T + 5000);
    expect(rows().map((x) => x.via).sort()).toEqual(["start"]); // same organizer, same version: one row, kept from the first time
    await call("POST", "/api/z", { id: "TERMS-2", startRound: start, callSeconds: 6, cap: 100 }, { "x-organizer": o.token }, T + 9000);
    expect(rows().length).toBe(1);
  });
  test("a platform-made organizer has no acceptance until they continue (create engagement records it)", async () => {
    const mk = await j(await call("POST", "/api/org", {}, { "x-organizer": "plat" })); expect(rows().length).toBe(0);
    await call("POST", "/api/z", { id: "TERMS-3", startRound: Math.floor((T / 1000 - 1692803367) / 3) + 1200, callSeconds: 6, cap: 100 }, { "x-organizer": mk.organizerKey }, T + 100);
    expect(rows().map((x) => [x.via, x.at_ms])).toEqual([["engagement", T + 100]]);
  });
  test("signing in by code or by the e-mailed link records the version for that organizer", async () => {
    await call("POST", "/api/start", { email: "boss@acme.com" }, { "cf-connecting-ip": "1.1.1.1" });
    raw.prepare("DELETE FROM organizer_terms").run(); // as if an older version had been accepted before
    const a = await j(await call("POST", "/api/auth/email", { email: "boss@acme.com" }, {}, T + 1000));
    await call("POST", "/api/auth/verify", { email: "boss@acme.com", code: a.devCode }, {}, T + 2000);
    expect(rows().map((x) => x.via)).toEqual(["signin-code"]);
    raw.prepare("DELETE FROM organizer_terms").run();
    const b = await j(await call("POST", "/api/auth/email", { email: "boss@acme.com" }, {}, T + 3000));
    expect((await call("POST", "/api/auth/link", { token: b.devToken }, {}, T + 4000)).status).toBe(200);
    expect(rows().map((x) => x.via)).toEqual(["signin-link"]);
  });
});
