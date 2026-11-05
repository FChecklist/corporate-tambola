import { describe, expect, test } from "bun:test";
import { domainRedirect } from "../src/domain-redirect";

const ORIGIN = "https://corporatetambola.com";
const req = (url: string, method = "GET") => new Request(url, { method });

describe("the pages.dev address redirects to the real address", () => {
  test("a GET page request on pages.dev answers 301 to the same path and query", () => {
    const r = domainRedirect(req("https://corporate-tambola.pages.dev/pricing.html?x=1"), ORIGIN)!;
    expect(r.status).toBe(301); expect(r.headers.get("location")).toBe(ORIGIN + "/pricing.html?x=1");
    expect(domainRedirect(req("https://corporate-tambola.pages.dev/"), ORIGIN)!.headers.get("location")).toBe(ORIGIN + "/");
    expect(domainRedirect(req("https://abc123.corporate-tambola.pages.dev/", "HEAD"), ORIGIN)!.status).toBe(301);
  });
  test("/api/ keeps working: a POST, and even a GET, is not redirected; so are /ai/, /version.json and /.well-known/", () => {
    expect(domainRedirect(req("https://corporate-tambola.pages.dev/api/pay/webhook", "POST"), ORIGIN)).toBeNull();
    expect(domainRedirect(req("https://corporate-tambola.pages.dev/api/health"), ORIGIN)).toBeNull();
    for (const p of ["/ai/key/x", "/version.json", "/.well-known/x", "/__probe"]) expect(domainRedirect(req("https://corporate-tambola.pages.dev" + p), ORIGIN)).toBeNull();
  });
  test("a POST to a page is not redirected, and the real address is never redirected", () => {
    expect(domainRedirect(req("https://corporate-tambola.pages.dev/terms", "POST"), ORIGIN)).toBeNull();
    expect(domainRedirect(req(ORIGIN + "/terms"), ORIGIN)).toBeNull();
  });
  test("www goes to the real address", () => {
    const r = domainRedirect(req("https://www.corporatetambola.com/terms?a=b"), ORIGIN)!; expect(r.status).toBe(301); expect(r.headers.get("location")).toBe(ORIGIN + "/terms?a=b");
  });
});

describe("the game's own address is housie., the main domain keeps serving old links (1.6.4)", () => {
  const H = "https://housie.corporatetambola.com";
  test("an old link on the main domain is served as it is (no redirect, GET or POST); www goes to housie.; pages.dev goes to housie.", () => {
    expect(domainRedirect(req("https://corporatetambola.com/z.html?e=ABC"), H)).toBeNull();
    expect(domainRedirect(req("https://corporatetambola.com/api/z/ABC/cv"), H)).toBeNull();
    expect(domainRedirect(req("https://corporatetambola.com/zc.html?e=ABC", "POST"), H)).toBeNull();
    expect(domainRedirect(req(H + "/z.html"), H)).toBeNull();
    expect(domainRedirect(req("https://corporate-tambola.pages.dev/terms"), H)!.headers.get("location")).toBe(H + "/terms");
  });
});

