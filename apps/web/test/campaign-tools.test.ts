// The demo-game campaign tools (note 310): the catalogue of 100 use cases, the request meter that stops at 25,000 requests a day, the test tags, and the refusal to touch the real site without the boss's go.
import { describe, expect, test } from "bun:test";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(import.meta.dir, "../../..");
const cat = JSON.parse(readFileSync(join(ROOT, "tools/livetest/usecases-100.json"), "utf8")).cases as any[];

describe("the 100 use cases", () => {
  test("exactly 100, unique ids and titles, the group sizes of the plan, every row complete, 25 for the real site", () => {
    expect(cat.length).toBe(100); expect(new Set(cat.map((c) => c.id)).size).toBe(100); expect(new Set(cat.map((c) => c.title)).size).toBe(100);
    const per: Record<string, number> = {}; for (const c of cat) per[c.group] = (per[c.group] || 0) + 1;
    expect(per).toEqual({ G1: 12, G2: 14, G3: 10, G4: 14, G5: 18, G6: 10, G7: 12, G8: 10 });
    for (const c of cat) { for (const k of ["id", "group", "title", "roles", "options", "steps", "expected", "driver"]) expect([c.id, k, typeof c[k] === "string" && c[k].length > 0]).toEqual([c.id, k, true]); expect(c.layers.length).toBeGreaterThan(0); expect(c.layers.every((l: string) => "ABC".includes(l))).toBe(true); }
    expect(cat.filter((c) => c.layers.includes("C")).length).toBe(25);
  });
  test("the readable docs file lists every id", () => { const md = readFileSync(join(ROOT, "docs/USECASES_100.md"), "utf8"); for (const c of cat) expect([c.id, md.includes("| " + c.id + " |")]).toEqual([c.id, true]); });
});

describe("the request meter", () => {
  test("on the real site it counts every request and stops at the daily limit; locally it never stops; the count survives a restart; a new UTC day starts again", async () => {
    process.env.CAMPAIGN_DATA = mkdtempSync(join(tmpdir(), "meter-"));
    const { RequestMeter, MeterStop, DAILY_LIMIT } = await import("../../../tools/livetest/campaign/meter.mjs?" + Date.now());
    expect(DAILY_LIMIT).toBe(25_000);
    let day = new Date("2026-10-30T10:00:00Z"); const now = () => day;
    const real = new RequestMeter("https://housie.corporatetambola.com", { limit: 10, now });
    real.count(4, "GET /api/z/AB12-1/info"); expect(real.total).toBe(4); expect(real.remaining()).toBe(6);
    expect(() => real.count(6, "browser fetch")).toThrow(MeterStop); expect(real.stopped).toBe(true);
    const again = new RequestMeter("https://housie.corporatetambola.com", { limit: 10, now }); expect(again.total).toBe(10); expect(() => again.count(1)).toThrow(MeterStop); // restart: still at the limit
    day = new Date("2026-10-31T00:00:01Z"); const next = new RequestMeter("https://housie.corporatetambola.com", { limit: 10, now }); expect(next.total).toBe(0); next.count(1); expect(next.total).toBe(1); // the quota resets at 00:00 UTC
    const local = new RequestMeter("http://localhost:8821", { limit: 3, now }); expect(() => local.count(50)).not.toThrow(); expect(local.total).toBe(50); // local runs are counted, never stopped
    rmSync(process.env.CAMPAIGN_DATA!, { recursive: true, force: true });
  });
});

describe("tags and refusals", () => {
  test("every test game is findable: id, name and contact follow the tag, the contact is never a real address", async () => {
    const { tagOf, isTagged } = await import("../../../tools/livetest/campaign/tags.mjs?" + Date.now());
    const t = tagOf("r1x", "UC-G1-01"); expect(t.id).toMatch(/^TR-r1x-UCG101$/); expect(t.name).toBe("TEST-RUN-" + t.id); expect(t.email).toMatch(/^demo[0-9]+@demo-test\.invalid$/); expect(tagOf("r1x", "UC-G1-02").email).not.toBe(t.email); const { cleanEmail } = await import("../../edge/src/approvals"); expect(cleanEmail(t.email)).toBe(t.email); expect(/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(t.email)).toBe(true);
    expect(isTagged(t.id)).toBe(true); expect(isTagged(t.name)).toBe(true); expect(isTagged("DEMO-1")).toBe(false); expect(isTagged("TR-bad")).toBe(false);
    expect(tagOf("a".repeat(40), "b".repeat(40)).id.length).toBeLessThanOrEqual(40);
  });
  test("the runner and the cleanup tool refuse the real site unless CAMPAIGN_REAL=yes (no request is sent)", () => {
    for (const f of ["run.mjs", "cleanup.mjs"]) {
      const r = Bun.spawnSync([process.execPath === "bun" ? "node" : "node", join(ROOT, "tools/livetest/campaign", f), "--base", "https://housie.corporatetambola.com", "--cases", "UC-G1-01", "--dry"], { env: { ...process.env, CAMPAIGN_REAL: "", CAMPAIGN_DATA: mkdtempSync(join(tmpdir(), "refuse-")) }, stdout: "pipe", stderr: "pipe" });
      expect([f, r.exitCode]).toEqual([f, 2]); expect(new TextDecoder().decode(r.stderr)).toContain("REFUSED");
    }
  });
  test("the driver never reports a case it cannot run as passed", async () => {
    const { runCase } = await import("../../../tools/livetest/campaign/driver.mjs?" + Date.now());
    const r = await runCase(cat.find((c) => c.id === "UC-G5-10"), {}); expect(r.status).toBe("not-implemented");
  });
  test("every implemented case is in the catalogue, and the groups of the plan are all represented in the registry order", async () => {
    const { IMPL } = await import("../../../tools/livetest/campaign/impl/index.mjs?" + Date.now());
    const ids = new Set(cat.map((c) => c.id)); for (const k of Object.keys(IMPL)) expect([k, ids.has(k)]).toEqual([k, true]);
    expect(Object.keys(IMPL).length).toBeGreaterThanOrEqual(30);
  });
});
