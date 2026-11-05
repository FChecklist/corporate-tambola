// Terms, Legal position, data-processing terms, sub-processors, partner terms, organizer guide: pages in the site style. Acceptance is by the tick box only (consent.test.ts);
// the version on the Terms page is the one constant in brand.ts.
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { withDevice } from "./device";
import { handle, type Env } from "../src/worker";
import { consentFor } from "./with-terms";
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
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "100000", PUBLIC_ORIGIN: "https://tambola.test", DATA_KEY: "k", TEST_MODE: "1" }; });
const LINKS = ["/terms.html", "/legal-position.html", "/dpa.html", "/subprocessors.html", "/organizer-guide.html"]; // the uniform footer (games-ops/footer/ufooter.py) links these documents; the partner terms are linked from the Refer and earn page
const LEGAL_PAGES = ["terms.html", "legal.html", "refund-policy.html", "about.html", "contact.html", "pricing.html", "partner-terms.html", "subprocessors.html", "dpa.html", "legal-position.html"];

describe("the document pages", () => {
  const DOCS: Record<string, string[]> = {
    "terms.html": ["Terms, Policies and Game Rules", "IT Services by Rajat Agarwal", `Version ${TERMS_VERSION}`, "Players pay nothing", "deleted within 24 hours after the game", "Credit instead of a refund", "Grievance Officer", "Digital Personal Data Protection Act, 2023"],
    "legal-position.html": ["Acceptable use and Legal Disclaimer", 'href="/terms.html#acceptable-use"'], // only points to the one document
    "dpa.html": ["Companies that help run the service", 'href="/terms.html#processors"'],
    "subprocessors.html": ["Companies that help run the service", 'href="/terms.html#processors"'],
    "partner-terms.html": ["independent partner", "No spam", "Tax may be deducted at source", "You are responsible for your own taxes", "No payment from the buyer, no commission"],
    "organizer-guide.html": ["Never ask for a fee", "Players are 18 or older", "INR 10,000", "tax deducted at source", "Check your state", "The game does not begin until it is paid for"],
  };
  for (const [f, needles] of Object.entries(DOCS)) test(`${f}: brand header and footer, title pattern, the right statements, no tick box on the page itself`, () => {
    const h = rd(f);
    expect(h).toMatch(/<title>[^<]+ \| Corporate Tambola<\/title>/); expect(h).toContain('class="ct-nav"'); expect(h).toContain('<footer class="uf"'); expect(h).toContain('rel="icon"');
    for (const n of needles) expect(h).toContain(n);
    expect(h).not.toMatch(/type="checkbox"/i);
    expect(h).not.toMatch(/\bcompliant\b|certified by/i);
    if (f !== "terms.html" && f !== "legal-position.html") for (const l of h.match(/<li>[\s\S]*?<\/li>/g) ?? []) expect(l.replace(/<[^>]+>/g, "").split(/\s+/).length).toBeLessThanOrEqual(36);
    for (const l of LINKS) expect(h).toContain(`href="${l}"`);
  });
  test("the Terms page shows the one version constant, and the agreed consent-box wording is on file", () => {
    const h = rd("terms.html"), agreed = JSON.parse(readFileSync(new URL("../src/consent-text.json", import.meta.url), "utf8"));
    expect(agreed.version).toBe(TERMS_VERSION);
    expect(h.match(/Version (\d{4}-\d{2}-\d{2})/g)!.every((x) => x === `Version ${TERMS_VERSION}`)).toBe(true);
    const esc = (s: string) => s.replace(/&/g, "&amp;");
    for (const k of ["K1", "K2", "K3", "K4", "K5", "K6"]) for (const t of Object.values(agreed[k]) as string[]) expect([k, t.length > 0]).toEqual([k, true]);
  });
  test("the pages are named in the footer of every page that has a legal footer, in the sitemap, and in the build", () => {
    for (const f of LEGAL_PAGES) expect([f, rd(f).includes('<a href="/legal-position.html">Legal position</a>')]).toEqual([f, true]);
    for (const f of ["index.html", "legal.html"]) for (const l of LINKS) expect(rd(f)).toContain(`href="${l}"`);
    expect(rd("partner.html")).toContain('href="/partner-terms.html"');
    const b = readFileSync(new URL("../../../pages/build.mjs", import.meta.url), "utf8");
    // the three pages that only point to the one document (legal-position, dpa, subprocessors) are not listed in the sitemap
    for (const n of ["terms", "legal-position", "dpa", "subprocessors", "partner-terms", "organizer-guide"]) { expect(b).toContain(`"${n}.html"`); expect(b).toContain(`["/${n}", PLAINCSP`); if (!["legal-position", "dpa", "subprocessors"].includes(n)) expect(rd("sitemap.xml")).toContain(`/${n}.html`); }
    expect(b).toContain('"consent.js"');
  });
  test("the software-only line is on the key pages", () => {
    expect(rd("terms.html")).toMatch(/IT Services does not collect, hold or give any money or prize/);
  });
  test("the legal pages carry no draft or review language", () => {
    for (const f of LEGAL_PAGES) expect([f, /\bdraft\b/i.test(rd(f))]).toEqual([f, false]);
  });
  test("one set of retention facts: the one document says them (24 hours; 365 days), and legal.html only points to it", () => {
    const t = rd("terms.html").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(t).toMatch(/deleted within 24 hours after the game/);
    expect(t).toMatch(/Details a winner confirms to receive a prize[^.]*365 days/);
    expect(t).toMatch(/Within 24 hours after it was meant to end/); expect(rd("legal.html")).toContain('href="/terms.html#terms"');
  });
});

describe("acceptance is by the tick box only", () => {
  test("the create pop-up asks with a box and says nothing like 'by continuing you accept'; the sign-in pop-up makes no such claim", () => {
    const s = rd("site.js");
    expect(s).not.toMatch(/By continuing you accept/i);
    expect(s).toContain('CBConsent.html("K2")');
    for (const f of ["site.js", "z.js", "zc.js", "pay.js", "paylink.js", "paytest.js"]) expect([f, /By continuing you accept|by continuing you agree/i.test(rd(f))]).toEqual([f, false]);
  });
  test("signing up stores the Terms version with the organizer (the continuity row) and the version equals the date on the Terms page", async () => {
    expect(rd("terms.html")).toContain(`Version ${TERMS_VERSION}`);
    const o = await j(await call("POST", "/api/start", { email: "boss@acme.com", consent: consentFor("K2") }, { "cf-connecting-ip": "1.1.1.1" }));
    const r = rows(); expect(r.length).toBe(1); expect(r[0]).toMatchObject({ version: TERMS_VERSION, via: "start", at_ms: T });
    const org = (raw.prepare("SELECT org FROM organizer_key WHERE kind='master'").get() as any).org; expect(r[0]!.org).toBe(org);
    const start = Math.floor((T / 1000 - 1692803367) / 3) + 1200;
    await call("POST", "/api/z", { id: "TERMS-1", startRound: start, callSeconds: 6, cap: 100 }, { "x-organizer": o.token }, T + 5000);
    expect(rows().length).toBe(1); // creating a game is not an acceptance: only the tick is
  });
  test("signing in does not claim that the Terms were accepted again", async () => {
    await call("POST", "/api/start", { email: "boss@acme.com", consent: consentFor("K2") }, { "cf-connecting-ip": "1.1.1.1" });
    raw.prepare("DELETE FROM organizer_terms").run();
    const a = await j(await call("POST", "/api/auth/email", { email: "boss@acme.com" }, {}, T + 1000));
    await call("POST", "/api/auth/verify", { email: "boss@acme.com", code: a.devCode }, {}, T + 2000);
    expect(rows().length).toBe(0);
  });
});
