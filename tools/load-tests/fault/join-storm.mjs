// FLASH-CROWD join test (local server only). Everybody opens the link and presses Join in the same few seconds, at the game's START TIME, as the owner expects in a real event.
// Every person is the real phone code (NodePhone: boot + join). If a phone is refused ("busy") the person presses Join again after RETRY_MIN..RETRY_MAX seconds (a human), up to GIVEUP_S.
// env: BASE, N (people), IPS (how many different public IPs they come from: 1 = one office behind one address), OFFICE_SHARE + OFFICE_IPS (a REAL mix: this share of the people sit behind OFFICE_IPS office addresses, the rest come from IPS different addresses, e.g. at home or on mobile data), PACK (paid pack, default: smallest pack >= N), JITTER_MS (burst length), RETRY_MIN/RETRY_MAX (s), GIVEUP_S, OUT (result name), INFLIGHT (calls at the same instant, default 160: set = N for a true flash)
// Result: data/join-storm-<OUT>.json. Question answered: how many people have a seat before the first number (start time + 2 minutes), how many are refused, and for how long.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Harness, NodePhone, sleep, roundAt, roundMs } from "./nodephone.mjs";
const ROOT = fileURLToPath(new URL("../../../", import.meta.url)), DATA = process.env.DATA_DIR || ROOT + "data"; mkdirSync(DATA, { recursive: true });
const BASE = process.env.BASE || "http://localhost:8821", N = Number(process.env.N || 250), IPS = Number(process.env.IPS || 5000), JIT = Number(process.env.JITTER_MS || 3000);
const RMIN = Number(process.env.RETRY_MIN || 5), RMAX = Number(process.env.RETRY_MAX || 15), GIVEUP = Number(process.env.GIVEUP_S || 600), OUT = process.env.OUT || `n${N}-ip${IPS}`;
const OSH = process.env.OFFICE_SHARE !== undefined ? Number(process.env.OFFICE_SHARE) : null, OIPS = Number(process.env.OFFICE_IPS || 1), PACKS = [100, 250, 500, 750, 1000, 2500, 5000, 10000], PACK = Number(process.env.PACK || PACKS.find((x) => x >= N) || 10000);
const H = new Harness(BASE, { ipPool: IPS }); const rr = (n) => Math.floor(Math.random() * n);
const TAG = Math.random().toString(36).slice(2, 6).toUpperCase(), email = `storm.${TAG.toLowerCase()}@sample-co.in`, ip0 = `10.${rr(250)}.${rr(250)}.${1 + rr(250)}`, id = `STORM-${TAG}-${N}`;
await H.call("POST", "/api/owner/test-mail", { add: email }, "local-organizer-secret", "10.250.0.1");
const tok = (await H.call("POST", "/api/start", { email, ...H.consent("K2") }, undefined, ip0)).j.token; if (!tok) throw new Error("no organizer token");
const startRound = roundAt(Date.now() + 70_000), startMs = roundMs(startRound), firstMs = startMs + 120_000;
let r = await H.call("POST", "/api/z", { id, startRound, callSeconds: 9, cap: N + 15, name: "Join storm " + N, tickets: 1 }, tok, ip0); if (!r.ok) throw new Error("create " + JSON.stringify(r.j));
r = await H.call("PATCH", `/api/z/${id}/settings`, { rewards: [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "x" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "y" }], whoCanJoin: "anyone" }, tok, ip0); if (!r.ok) throw new Error("settings " + JSON.stringify(r.j));
await H.call("POST", "/api/payments/test", { pack: PACK, email, name: "Storm", org: "Storm", country: "IN", eid: id, ...H.consent("K3") }, tok, ip0);
r = await H.call("POST", `/api/z/${id}/publish`, { email, phone: "9650397480", ...H.consent("K1") }, tok, ip0); if (!r.ok) throw new Error("publish " + JSON.stringify(r.j));
console.log(`game ${id} ready; start ${new Date(startMs).toISOString()} first number ${new Date(firstMs).toISOString()}; ${N} people from ${IPS} IP(s), burst ${JIT} ms at the start time`);
await sleep(Math.max(0, startMs - Date.now()));
const officeIps = Array.from({ length: OIPS }, () => `10.${rr(250)}.${rr(250)}.${1 + rr(250)}`);
const mob = (i) => `9${String(i).padStart(9, "0")}`.slice(0, 10), people = [];
const t0 = Date.now(); let lagMax = 0; { let t = Date.now(); setInterval(() => { const d = Date.now() - t - 250; t = Date.now(); lagMax = Math.max(lagMax, d); }, 250).unref(); }
await Promise.all(Array.from({ length: N }, async (_, i) => {
  await sleep(Math.random() * JIT);
  const p = { i, attempts: 0, seatedAt: null, firstTry: null }; people.push(p);
  const ph = new NodePhone(H, id, { phone: mob(i), name: `Person ${i}` }, { light: true, claim: "never" }); p.ph = ph;
  if (OSH !== null) ph.ip = i < N * OSH ? officeIps[i % OIPS] : `10.${rr(250)}.${rr(250)}.${1 + rr(250)}`;
  const arrive = Date.now();
  try { await ph.open(); } catch { /* the page still loads; join decides */ }
  while (Date.now() - arrive < GIVEUP * 1000) {
    p.attempts++; const ok = await ph.join().catch(() => false);
    if (p.firstTry === null) p.firstTry = ok; if (ok) { p.seatedAt = Date.now(); ph.ok = true; break; }
    await sleep((RMIN + Math.random() * (RMAX - RMIN)) * 1000);
  }
}));
const seatedMs = people.filter((p) => p.seatedAt).map((p) => p.seatedAt - t0).sort((a, b) => a - b);
const cnt = (ms) => seatedMs.filter((x) => x <= ms).length;
const joinCalls = (H.callLog || []).filter((c) => /POST \/api\/z\/:id\/join/.test(c[1])), st = {}; for (const c of joinCalls) st[c[2]] = (st[c[2]] || 0) + 1;
const lat = joinCalls.map((c) => c[3]).sort((a, b) => a - b), pc = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] ?? null;
const att = {}; for (const p of people) { const k = Math.min(p.attempts, 10); att[k] = (att[k] || 0) + 1; }
const inWindow = people.filter((p) => p.seatedAt && p.seatedAt <= firstMs).length;
// what the server froze as the seat list when the window closed (one stored row every phone reads)
await sleep(Math.max(0, firstMs + 2000 - Date.now())); const seatList = await (await fetch(`${BASE}/api/z/${id}/seats`)).json().catch(() => ({}));
const out = { test: "join storm: everybody joins at the start time", N, pack: PACK, ips: IPS, officeShare: OSH, officeIps: OIPS, burstMs: JIT, retryS: [RMIN, RMAX], giveUpS: GIVEUP, startMs, firstNumberMs: firstMs,
  seatedAtSecondsAfterBurst: { "5": cnt(5000), "10": cnt(10000), "30": cnt(30000), "60": cnt(60000), "90": cnt(90000), "120": cnt(120000), "300": cnt(300000), "600": cnt(600000) },
  seatedBeforeFirstNumber: inWindow, seatedEver: seatedMs.length, neverSeated: N - seatedMs.length, seatedFirstTry: people.filter((p) => p.firstTry === true).length, refusedFirstTry: people.filter((p) => p.firstTry === false).length,
  attemptsPerPerson: att, joinCallStatus: st, joinLatencyMs: { p50: pc(0.5), p95: pc(0.95), p99: pc(0.99), max: lat[lat.length - 1] ?? null }, seatListFrozenWith: Array.isArray(seatList.seats) ? seatList.seats.length : seatList, seatListReady: seatList.ready,
  failKinds: H.failKinds, testProgramLagMaxMs: Math.round(lagMax), secondsToSeatEveryone: seatedMs.length ? Math.round(seatedMs[seatedMs.length - 1] / 100) / 10 : null };
writeFileSync(`${DATA}/join-storm-${OUT}.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out));
process.exit(0);
