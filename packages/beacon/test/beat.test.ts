// The ask rhythm (1.5.2): slots by ticket number, a longer period for big games, spread follow-up reads, the pre-installed messages.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { beatOffsetMs, beatPeriodMs, beatSlots, followUpSpreadMs, msToNextBeat, reconnectAfterMs, ticketOf } from "../src/beat";
import { MSG, MSG_VERSION, say } from "../src/messages";

const peak = (tickets: number, cap: number, bucketMs = 100) => { const p = beatPeriodMs(cap), b = new Map<number, number>(); for (let t = 1; t <= tickets; t++) { const k = Math.floor(beatOffsetMs(t, cap) / bucketMs); b.set(k, (b.get(k) ?? 0) + 1); } return { max: Math.max(...b.values()), min: Math.min(...[...Array(Math.ceil(p / bucketMs)).keys()].map((k) => b.get(k) ?? 0)), buckets: Math.ceil(p / bucketMs) }; };

describe("slots", () => {
  test("8 slots up to 1,200 players, more as the game grows, at most 64; the period is 2 s, 3 s above 2,000 players, 4 s above 5,000", () => {
    expect([100, 1200, 1500, 3000, 9600, 100000].map(beatSlots)).toEqual([8, 8, 10, 20, 64, 64]);
    expect([100, 2000, 2001, 5000, 5001, 100000].map(beatPeriodMs)).toEqual([2000, 2000, 3000, 3000, 4000, 4000]);
    expect(ticketOf("7x4f2a")).toBe(7); expect(ticketOf(null)).toBe(0); expect(ticketOf("zz")).toBe(0);
  });
  test("every ask moment is inside the period, and asking at msToNextBeat lands exactly on the ticket's moment", () => {
    for (const cap of [100, 2500, 10000]) for (const tk of [1, 2, 7, 8, 63, 64, 999]) { const p = beatPeriodMs(cap), off = beatOffsetMs(tk, cap); expect(off).toBeGreaterThanOrEqual(0); expect(off).toBeLessThan(p); for (const now of [0, 123, 1999, 5000.5, 12345]) { const d = msToNextBeat(now, tk, cap); expect(d).toBeGreaterThanOrEqual(0); expect(d).toBeLessThan(p); expect((now + d - off) % p).toBeCloseTo(0, 5); } }
  });
  test("LOAD SHAPE: 2,000 phones and 10,000 phones ask in a flat stream (requests per 100 ms), where one-second ticks would have asked in two spikes", () => {
    const a = peak(2000, 2000), b = peak(10000, 10000);
    console.log("SLOT_SHAPE " + JSON.stringify({ phones2000: { requestsPer100msPeak: a.max, buckets: a.buckets, min: a.min, before1sTicksPeak: 2000 / 2 }, phones10000: { periodMs: beatPeriodMs(10000), slots: beatSlots(10000), requestsPer100msPeak: b.max, buckets: b.buckets, min: b.min, before1sTicksPeak: 10000 / 2 } }));
    expect(a.max).toBeLessThanOrEqual(Math.ceil(2000 / a.buckets) * 1.3); expect(a.min).toBeGreaterThanOrEqual(Math.floor(2000 / a.buckets) * 0.7);
    expect(b.max).toBeLessThanOrEqual(Math.ceil(10000 / b.buckets) * 1.3); expect(b.min).toBeGreaterThanOrEqual(Math.floor(10000 / b.buckets) * 0.7);
  });
  test("the follow-up read after a claim is spread over one second, evenly, and never negative", () => {
    const h = new Array(10).fill(0); for (let t = 1; t <= 10000; t++) { const d = followUpSpreadMs(t, 10000); expect(d).toBeGreaterThanOrEqual(0); expect(d).toBeLessThan(1000); h[Math.floor(d / 100)]++; }
    expect(Math.max(...h)).toBeLessThanOrEqual(1300); expect(Math.min(...h)).toBeGreaterThanOrEqual(700);
  });
  test("in a small game the follow-up spread is at most half a second", () => { for (let t = 1; t <= 500; t++) expect(followUpSpreadMs(t, 500)).toBeLessThan(500); });
  test("a phone shows Reconnecting after one and a half periods plus a second without an answer", () => { expect(reconnectAfterMs(100)).toBe(4000); expect(reconnectAfterMs(10000)).toBe(7000); });
});

describe("the pre-installed messages", () => {
  test("every message code the pages use exists in the dictionary; an unknown code gives the safe generic line; the version is a number", () => {
    const dir = new URL("../../../apps/web/public/", import.meta.url); const used = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => /^(z|zc|board|big)\.js$/.test(x))) for (const m of readFileSync(new URL(f, dir), "utf8").matchAll(/ZG\.say\(\s*(?:[^"'`()]*\?\s*)?["']([a-z0-9.]+)["'](?:\s*:\s*["']([a-z0-9.]+)["'])?/g)) { used.add(m[1]!); if (m[2]) used.add(m[2]); }
    expect(used.size).toBeGreaterThan(3); for (const c of used) expect([c, c in MSG]).toEqual([c, true]);
    expect(say("no.such.code")).toBe(MSG["generic"]!); expect(MSG_VERSION).toBeGreaterThan(0);
    expect(say("claim.k", { t: 7, p: "Top line" })).toBe("Ticket 7 has claimed Top line. Checking now…");
  });
});

import { LANGS, TABLES, getLang, setLang } from "../src/messages";
describe("languages", () => {
  test("English is the only language now; an unknown language is ignored; a second language is just another table with the same codes, and a missing code falls back to English", () => {
    expect(Object.keys(LANGS)).toEqual(["en"]); expect(setLang("xx")).toBe("en"); expect(getLang()).toBe("en");
    TABLES["zz"] = { "claim.k": "[zz] Ticket {t} {p}" }; LANGS["zz"] = "Test"; try {
      expect(setLang("zz")).toBe("zz"); expect(say("claim.k", { t: 4, p: "Top line" })).toBe("[zz] Ticket 4 Top line"); expect(say("net.reconnecting")).toBe(MSG["net.reconnecting"]!); // missing in zz: English
    } finally { setLang("en"); delete TABLES["zz"]; delete LANGS["zz"]; }
    expect(say("claim.k", { t: 4, p: "Top line" })).toBe("Ticket 4 has claimed Top line. Checking now…");
  });
});
