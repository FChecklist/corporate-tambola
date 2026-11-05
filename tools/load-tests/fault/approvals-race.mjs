// Follow-up to approvals-e2e.mjs, three focused questions on a deployed-style local server:
//  A) two approvers decide the SAME waiting request at the SAME instant (admit+decline, admit+admit, decline+decline): do the request's final state and the person's entry always agree? (many rounds)
//  B) the same decisions DURING the game (after the first number): does a Host's decline / an Organizer's admit take effect?
//  C) how long after the Organizer presses End do the phones show the end, for a small game (cap 100) and a big one (cap 1015)?
// env: BASE, RACES (requests per kind, default 60), OUT. Result: data/approvals-race-<OUT>.json
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Harness, NodePhone, TBControl, sleep, roundAt, roundMs } from "./nodephone.mjs";
const ROOT = fileURLToPath(new URL("../../../", import.meta.url)), DATA = process.env.DATA_DIR || ROOT + "data"; mkdirSync(DATA, { recursive: true });
const BASE = process.env.BASE || "http://localhost:8883", OUT = process.env.OUT || "run", RACES = Number(process.env.RACES || 80);
const H = new Harness(BASE, { ipPool: 10 }); const rr = (n) => Math.floor(Math.random() * n), pip = () => `10.${rr(250)}.${rr(250)}.${1 + rr(250)}`;
const TAG = Math.random().toString(36).slice(2, 6).toUpperCase(), email = `race.${TAG.toLowerCase()}@sample-co.in`, hostMail = `racehost.${TAG.toLowerCase()}@sample-co.in`;
const dev = (k) => (Buffer.from("d" + TAG + k).toString("hex") + "c".repeat(32)).slice(0, 32); const call = (m, p, b, key) => H.call(m, p, b, key, pip());
const out = { A: {}, B: {}, C: {}, notes: [] };
await H.call("POST", "/api/owner/test-mail", { add: email }, "local-organizer-secret", "10.250.0.1"); await H.call("POST", "/api/owner/test-mail", { add: hostMail }, "local-organizer-secret", "10.250.0.1");
const org = (await call("POST", "/api/start", { email, ...H.consent("K2") })).j.token;
const hk0 = (await call("POST", "/api/org/host", { label: "Host One", mobile: "9810000011" }, org)).j.hostKey; const hs = await call("POST", "/api/host/setup/email", { email: hostMail, ...H.consent("K5") }, hk0); const host = (await call("POST", "/api/host/setup/email/verify", { code: hs.j.devCode }, hk0)).j.token;
const rewards = [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "e" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "f" }];
const startRound = roundAt(Date.now() + 90_000), firstMs = roundMs(startRound) + 120_000;
async function mkGame(id, cap, pack) {
  await call("POST", "/api/z", { id, startRound, callSeconds: 9, cap, name: "Race " + id, tickets: 1 }, org); await call("PATCH", `/api/z/${id}/settings`, { rewards, whoCanJoin: "list", verify: "id", employeesOnly: true }, org);
  await call("POST", `/api/z/${id}/publish`, { email, phone: "9650397480", ...H.consent("K1") }, org); await call("POST", "/api/payments/test", { pack, email, name: "Org", org: "Org Co", country: "IN", eid: id, ...H.consent("K3") }, org);
  await call("POST", `/api/z/${id}/people`, { people: Array.from({ length: 6 }, (_, i) => ({ name: "Listed " + i, empId: `EMP-L${i}`, type: "employee" })), ...H.consent("K6") }, org);
}
const ID1 = `RACE-${TAG}-S`, ID2 = `RACE-${TAG}-B`; await mkGame(ID1, 240, 250); await mkGame(ID2, 1015, 1000); // ID1 (small crowd, polls often) is only for the End timing; the decisions are tested on ID2
const join = async (id, empId, k) => { const q = await fetch(`${BASE}/api/z/${id}/join`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": pip() }, body: JSON.stringify({ name: "S " + k, empId, device: dev(k), ...H.consent("K4") }) }); return { s: q.status, j: await q.json().catch(() => ({})) }; };
const me = async (id, wid) => (await (await fetch(`${BASE}/api/z/${id}/me?wid=${wid}`)).json()).state;
async function requests(id, tag, n) { const rs = []; await Promise.all(Array.from({ length: n }, async (_, i) => { const empId = `EMP-9${tag}${String(i).padStart(3, "0")}`; const q = await join(id, empId, tag + i); if (q.j.wid) rs.push({ empId, wid: q.j.wid, k: tag + i }); })); return rs; }
async function races(phase, id) {
  const R = {}; for (const [kind, a, b] of [["admit+decline", "admit", "decline"], ["admit+admit", "admit", "admit"], ["decline+decline", "decline", "decline"]]) {
    const tag = (phase[0] === "b" ? "P" : "D") + ["X", "Y", "Z"][["admit+decline", "admit+admit", "decline+decline"].indexOf(kind)] + id.slice(-1); const rs = await requests(id, tag, RACES); const bad = [], seen = {};
    await Promise.all(rs.map(async (r) => { const [x, y] = await Promise.all([call("POST", `/api/z/${id}/waiting/${r.wid}`, { decision: a }, org), call("POST", `/api/z/${id}/waiting/${r.wid}`, { decision: b }, host)]); const state = await me(id, r.wid); const j = await join(id, r.empId, r.k + "x"); const entered = j.s === 200; seen[`${state}/${entered ? "in" : "out"}`] = (seen[`${state}/${entered ? "in" : "out"}`] || 0) + 1; if ((state === "declined" && entered) || (state === "admitted" && !entered)) bad.push({ empId: r.empId, state, joinStatus: j.s, org: x.s + JSON.stringify(x.j).slice(0, 40), host: y.s + JSON.stringify(y.j).slice(0, 40) }); }));
    R[kind] = { requests: rs.length, states: seen, disagreements: bad.length, examples: bad.slice(0, 3) }; console.log(phase, kind, JSON.stringify(R[kind]).slice(0, 400));
  } return R;
}
async function sequential(phase, id) { // the plain case during the game: one approver, one decision, on its own
  const rs = await requests(id, (phase[0] === "b" ? "P" : "D") + "Q" + id.slice(-1), 20); const res = { admitByOrg: { ok: 0, bad: 0 }, declineByHost: { ok: 0, bad: 0 }, declineByOrg: { ok: 0, bad: 0 } }; const log = [];
  for (const [i, r] of rs.entries()) { const kind = i < 7 ? ["admitByOrg", "admit", org] : i < 14 ? ["declineByHost", "decline", host] : ["declineByOrg", "decline", org]; const d = await call("POST", `/api/z/${id}/waiting/${r.wid}`, { decision: kind[1] }, kind[2]); const state = await me(id, r.wid); const want = kind[1] === "admit" ? "admitted" : "declined"; if (state === want) res[kind[0]].ok++; else { res[kind[0]].bad++; log.push({ kind: kind[0], respStatus: d.s, resp: JSON.stringify(d.j).slice(0, 80), stateNow: state }); } }
  console.log(phase, "sequential", JSON.stringify(res), JSON.stringify(log.slice(0, 3))); return { res, examples: log.slice(0, 5) };
}
// ---- A: before the game ----
out.A.before = await races("before the start", ID2); out.A.beforeBig = null;
// ---- B: during the game ----
await sleep(Math.max(0, firstMs + 30_000 - Date.now())); out.notes.push("game started; decisions now happen during the game");
out.B.sequential = await sequential("during the game", ID2); out.B.races = await races("during the game", ID2);
// ---- C: how long until the phones show the end ----
async function endTime(id, cap, k) {
  const refs = []; for (let i = 0; i < 2; i++) { const ph = new NodePhone(H, id, { empId: `EMP-L${i}`, name: "Ref " + i }, { claim: "never" }); await ph.open(); ph.ok = await ph.join(); refs.push(ph); if (ph.ok) ph.go(); }
  const ctl = { token: org, base: BASE, prefix: "/api/z" }; await TBControl.ensureKey(id, ctl); await sleep(20_000);
  const t0 = Date.now(); const r = await Promise.race([TBControl.publish(id, ctl, "stop", {}), sleep(30000).then(() => ({ status: "timeout" }))]);
  const done = {}; while (Date.now() - t0 < 360_000 && refs.some((p, i) => done[i] === undefined)) { refs.forEach((p, i) => { if (done[i] === undefined && p.view().phase === "ended") done[i] = Math.round((Date.now() - t0) / 100) / 10; }); await sleep(500); }
  refs.forEach((p) => p.stop()); return { cap, stopStatus: r.status, secondsUntilPhoneShowsEnd: done };
}
const [cS, cB] = await Promise.all([endTime(ID1, 100), endTime(ID2, 1015)]); out.C = { small: cS, big: cB }; console.log("C end propagation", JSON.stringify(out.C));
writeFileSync(`${DATA}/approvals-race-${OUT}.json`, JSON.stringify(out, null, 1)); console.log("DONE"); process.exit(0);
