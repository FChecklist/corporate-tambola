// LIFECYCLE SUITE, part 5: the REAL phone code (PhoneRuntime, the same code the player page runs) plays a whole game against the real Worker in virtual time, for each of the four formats.
// Five phones join by ID, each reads the public beacon (stood in), derives the numbers itself, marks, claims, votes. Then: every phone saw the same 90 numbers, in the order the Worker's
// own schedule says, each exactly once; the prizes the phones agreed on equal the independent oracle; the Organizer's Start / Next presses reached every phone.
// FALSIFIED BY: phones-agree-numbers (change pickNumber), phones-start-ignored (drop the 'go' from the control file)
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(180_000);
import { reset, restore } from "../param-harness";
import { FORMATS, newGame, addIds, press, callLog, ticketFor, oracleIdx, randOf, row, W, call, j, count, MIN, type Game } from "./harness";
import { PhoneRuntime } from "../../../../packages/beacon/src/phone-runtime";
import { handle } from "../with-terms";
import type { Fetcher, Round } from "../../../../packages/beacon/src";
import { roundAt as beaconRoundAt } from "../../../../packages/beacon/src";

let t = 0, base = 0;
const utc = () => base + t;
const api = async (method: string, path: string, body?: unknown) => {
  const r = await handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), W.env as any, utc());
  const jj: any = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(jj.error ?? "http " + r.status), { status: r.status, body: jj });
  return jj;
};
const fetcher: Fetcher = async (url) => {
  const last = url.split("/").pop()!, nowR = beaconRoundAt(utc()), r = last === "latest" ? nowR : Number(last);
  if (r > nowR) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ round: r, randomness: randOf(r), signature: "aa" } as Round) };
};
const mkPhone = (eid: string) => {
  const mem = new Map<string, string>();
  return new PhoneRuntime(eid, { noEarlyEnd: true, api, mono: () => t, utc, store: { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v), del: (k: string) => void mem.delete(k) },
    beacon: { fetcher, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: { round: number; signature: string; randomness: string }) => x.signature === "aa" && x.randomness === randOf(x.round) } as any);
};
beforeEach(() => reset()); afterEach(restore);

for (const f of FORMATS) describe(`[${f.key}] ${f.label}: five real phones play a whole game`, () => {
  test("all phones see the same 90 numbers once each, the Start / Next presses reach them, and the prizes the phones agree on equal the oracle", async () => {
    const g = await newGame(f);
    const ids = ["PH-1", "PH-2", "PH-3", "PH-4", "PH-5"]; await addIds(g, ids);
    base = g.at - 10 * MIN; t = 0;
    const phones = ids.map(() => mkPhone(g.id));
    for (const [i, p] of phones.entries()) { await p.boot(); expect(await p.join("", undefined, undefined, ids[i])).toBe(true); expect(p.view().pid).toMatch(/^\d+x/); }
    let went = f.startMode === "auto", nexts = 0, lastNext = -1e9;
    for (let step = 0; step < 900; step++) {
      t += 3000; const now = utc();
      if (!went && now >= g.at + 60_000) { expect((await press(g, "go", now)).status).toBe(200); went = true; }
      if (f.callMode === "host" && went && nexts < 90 && now >= g.at + 150_000 && now - lastNext >= 12_000) { const r = await press(g, "next", now); if (r.status === 200) { nexts++; lastNext = now; } }
      for (const p of phones) { await p.tick(); await p.playAlong({ claim: true }); }
      if (phones.every((p) => p.view().log.length >= 90)) break;
    }
    for (let k = 0; k < 40; k++) { t += 3000; for (const p of phones) { await p.tick(); await p.playAlong({ claim: true }); } } // let the last claims and votes through
    const logs = phones.map((p) => p.view().log);
    for (const l of logs) { expect(l.length).toBe(90); expect([...l].sort((a, b) => a - b)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1)); }
    for (const l of logs.slice(1)) expect(l).toEqual(logs[0]!); // every phone, the same numbers in the same order
    const server = await callLog(g); expect(logs[0]).toEqual(server.log); // and the Worker's own schedule says the same
    if (f.callMode === "host") expect(nexts).toBe(90);
    // prizes: what the phones settled together equals the oracle
    const pids = phones.map((p) => p.view().pid!);
    expect(new Set(pids).size).toBe(5);
    for (const [i, p] of pids.entries()) expect(JSON.stringify(phones[i]!.view().ticket)).toBe(JSON.stringify(ticketFor(g.id, p)));
    const res = (await j(await call("GET", `/api/z/${g.id}/results`, undefined, {}, utc()))).results as any[];
    expect(res.length).toBe(7); // every house of the default prizes was won, claimed and settled by the phones
    for (const r of res) {
      const key = r.pattern as "early5" | "top" | "mid" | "bot" | "corners" | "full";
      if (!["early5", "top", "mid", "bot", "corners", "full"].includes(key)) continue;
      const best = Math.min(...pids.map((p) => oracleIdx(ticketFor(g.id, p), key, server.log)).filter((i) => i >= 0));
      expect([key, r.idx]).toEqual([key, best]);
    }
    void count; void row;
  });
});
