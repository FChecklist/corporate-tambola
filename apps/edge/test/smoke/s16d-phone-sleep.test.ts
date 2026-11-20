// SMOKE 20 NOV, owner step 16: a phone that goes to sleep (screen off, app in the background) for 1, 5 and 30 minutes in the middle of the game, then wakes: same numbers, none missing, none twice, the same ticket,
// its late claims do not count, the awake phones are not disturbed. The REAL phone code (PhoneRuntime) in virtual time, each of the four start formats.
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore, installProvider, FORMATS, newGame, addIds, press, callLog, ticketFor, randOf, W, MIN, type Game } from "./h";
import { PhoneRuntime } from "../../../../packages/beacon/src/phone-runtime";
import { handle } from "../with-terms";
import type { Fetcher, Round } from "../../../../packages/beacon/src";
import { roundAt as beaconRoundAt } from "../../../../packages/beacon/src";
setDefaultTimeout(300_000);
let t = 0, base = 0; const utc = () => base + t;
const api = async (method: string, path: string, body?: unknown) => {
  const r = await handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), W.env as any, utc());
  const jj: any = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(jj.error ?? "http " + r.status), { status: r.status, body: jj }); return jj;
};
const fetcher: Fetcher = async (url) => { const last = url.split("/").pop()!, nowR = beaconRoundAt(utc()), r = last === "latest" ? nowR : Number(last); if (r > nowR) return { ok: false, status: 404, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ round: r, randomness: randOf(r), signature: "aa" } as Round) }; };
const mkPhone = (eid: string) => { const mem = new Map<string, string>(); return new PhoneRuntime(eid, { noEarlyEnd: true, api, mono: () => t, utc, store: { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v), del: (k: string) => void mem.delete(k) }, beacon: { fetcher, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: { round: number; signature: string; randomness: string }) => x.signature === "aa" && x.randomness === randOf(x.round) } as any); };
beforeEach(() => { reset(); installProvider(); }); afterEach(restore);

for (const f of FORMATS) for (const sleepMin of [1, 5, 30]) describe(`[${f.key}] phone asleep ${sleepMin} min`, () => {
  test(`S16-C4 the sleeper wakes with the same numbers and ticket as the phone that stayed awake`, async () => {
    const g = await newGame(f); const ids = ["SL-1", "SL-2", "SL-3", "SL-4"]; await addIds(g, ids);
    base = g.at - 10 * MIN; t = 0;
    const phones = ids.map(() => mkPhone(g.id));
    for (const [i, p] of phones.entries()) { await p.boot(); expect(await p.join("", undefined, undefined, ids[i])).toBe(true); }
    const sleeper = phones[0]!, awake = phones.slice(1);
    let went = f.startMode === "auto", nexts = 0, lastNext = -1e9, asleepFrom = -1;
    for (let step = 0; step < 1500; step++) {
      t += 3000; const now = utc();
      if (!went && now >= g.at + 60_000) { expect((await press(g, "go", now)).status).toBe(200); went = true; }
      if (f.callMode === "host" && went && nexts < 90 && now >= g.at + 150_000 && now - lastNext >= 12_000) { const r = await press(g, "next", now); if (r.status === 200) { nexts++; lastNext = now; } }
      const n = awake[0]!.view().log.length;
      if (asleepFrom < 0 && n >= 30) asleepFrom = t;
      const asleep = asleepFrom >= 0 && t < asleepFrom + sleepMin * MIN;
      for (const p of awake) { await p.tick(); await p.playAlong({ claim: true }); }
      if (!asleep) { await sleeper.tick(); await sleeper.playAlong({ claim: true }); }
      if (phones.every((p) => p.view().log.length >= 90)) break;
    }
    for (let k = 0; k < 40; k++) { t += 3000; for (const p of phones) { await p.tick(); await p.playAlong({ claim: true }); } }
    const logs = phones.map((p) => p.view().log);
    for (const l of logs) { expect(l.length).toBe(90); expect([...l].sort((a, b) => a - b)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1)); }
    expect(logs[0]).toEqual(logs[1]!); expect(logs[0]).toEqual((await callLog(g)).log);
    expect(JSON.stringify(sleeper.view().ticket)).toBe(JSON.stringify(ticketFor(g.id, sleeper.view().pid!)));
    expect(asleepFrom).toBeGreaterThan(0); // the sleeper really did miss part of the game
  });
});
