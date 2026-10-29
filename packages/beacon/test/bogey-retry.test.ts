// WP-03 A15 (phone side): a Bogey whose answer is lost is sent again with the SAME number, so the store can keep it once. The Worker's half is apps/edge/test/bogey-once.test.ts.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PhoneRuntime } from "../src/phone-runtime";

describe("A15: Bogey retry carries the same number", () => {
  test("the first POST is stored but its answer is lost; the retry sends the same n; once answered the Bogey is not sent again", async () => {
    const calls: any[] = []; let lose = true;
    const mem = new Map<string, string>();
    const rt = new PhoneRuntime("BG-RT", { api: async (m, path, body) => { calls.push({ m, path, body }); if (lose) { lose = false; throw new Error("timeout"); } return { ok: true, atMs: 5000, stored: 0 }; }, beacon: {}, mono: () => 0, store: { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) } });
    const r = rt as any; r.pid = "1x000000000001"; r.trackClaims = true;
    r.bogeyUnsent.push({ pattern: "top", round: 1, n: 1 });
    await r.sendBogeys(); // the first call: lost
    expect(r.bogeyUnsent.length).toBe(1); // kept for the next tick
    await r.sendBogeys(); // the next tick: sent again
    expect(calls.map((c) => c.path)).toEqual(["/api/z/BG-RT/bogey", "/api/z/BG-RT/bogey"]);
    expect(calls[0].body.n).toBe(1); expect(calls[1].body.n).toBe(1); // the same Bogey, the same number
    expect(r.bogeyUnsent.length).toBe(0);
  });
  test("claim() numbers each Bogey by how many the player already has on that house; the shipped bundle has it", () => {
    const src = readFileSync(new URL("../src/phone-runtime.ts", import.meta.url), "utf8");
    expect(src).toContain("this.bogeyUnsent.push({ pattern: key, round: this.cur, n })");
    expect(src).toMatch(/const n = this\.bogeysOn\(key\) \+ 1; this\.bogeys\.set\(id, n\)/);
    expect(readFileSync(new URL("../../../apps/web/public/zgame.js", import.meta.url), "utf8")).toMatch(/pattern:[\w$]+\.pattern,n:[\w$]+\.n/);
  });
});
