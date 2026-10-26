// EMPLOYEES-ONLY, MANUAL (Host presses Next) game at the size of N people, on a local server that mimics the deployed settings. Every step of entry is checked:
// early and late entry with an employee ID, an ID that is not on the list (waiting room, approve / decline by Organizer and Host, before the game and during it), the Organizer and the Host deciding the SAME request
// (one after the other and at the same instant), the Co-host's own list and limit, the waiting-room cap, the wrong-ID limit, common mistakes, removal during the game.
// env: BASE, N_LISTED (employees on the list, default 800), N_UNKNOWN (strangers before the start, default 60), OUT. Result: data/approvals-e2e-<OUT>.json (rows: area, what, want, got, ok).
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Harness, NodePhone, TBControl, sleep, roundAt, roundMs } from "./nodephone.mjs";
const ROOT = fileURLToPath(new URL("../../../", import.meta.url)), DATA = process.env.DATA_DIR || ROOT + "data"; mkdirSync(DATA, { recursive: true });
const BASE = process.env.BASE || "http://localhost:8881", OUT = process.env.OUT || "run", NL = Number(process.env.N_LISTED || 800), NU = Number(process.env.N_UNKNOWN || 60);
const H = new Harness(BASE, { ipPool: 10 }); const rr = (n) => Math.floor(Math.random() * n), pip = () => `10.${rr(250)}.${rr(250)}.${1 + rr(250)}`;
const rows = []; const row = (area, what, want, got, ok, note = "") => { rows.push({ area, what, want, got, ok: !!ok, note }); console.log(`${ok ? "ok  " : "FAIL"} [${area}] ${what} | want ${want} | got ${got}${note ? " | " + note : ""}`); };
const st = (r) => `${r.s}${r.j && (r.j.code || r.j.error) ? " (" + (r.j.code || String(r.j.error).slice(0, 60)) + ")" : ""}`;
const TAG = Math.random().toString(36).slice(2, 6).toUpperCase(), id = `APPR-${TAG}`, email = `appr.${TAG.toLowerCase()}@sample-co.in`, hostMail = `apprhost.${TAG.toLowerCase()}@sample-co.in`;
const emp = (i) => `EMP-${String(10000 + i)}`, unk = (i) => `EMP-9${String(i).padStart(4, "0")}`, nameOf = (p, i) => `${p} ${i}`;
const dev = (k) => (Buffer.from("d" + TAG + k).toString("hex") + "c".repeat(32)).slice(0, 32);
const OFFICE = Array.from({ length: 6 }, pip); // listed employees come from 6 office addresses (about N/6 each: under the deployed 600 a minute)
const rawJoin = async (empId, name, k, ip = pip(), extra = {}) => { const r = await fetch(`${BASE}/api/z/${id}/join`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify({ name, ...(empId !== undefined ? { empId } : {}), device: dev(k), ...H.consent("K4"), ...extra }) }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
const call = (m, p, b, key) => H.call(m, p, b, key, pip());
const wait = async (key) => { const out = []; const r = await call("GET", `/api/z/${id}/waiting`, undefined, key); return r; };

// ---------- setup ----------
await H.call("POST", "/api/owner/test-mail", { add: email }, "local-organizer-secret", "10.250.0.1"); await H.call("POST", "/api/owner/test-mail", { add: hostMail }, "local-organizer-secret", "10.250.0.1");
const org = (await call("POST", "/api/start", { email, ...H.consent("K2") })).j.token;
const startRound = roundAt(Date.now() + 240_000), startMs = roundMs(startRound), firstMs = startMs + 120_000;
const rewards = [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "early5" }, { pattern: "top", scope: "ticket", ordinal: 1, text: "top" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "full" }];
const cap = NL + NU + 200;
let r = await call("POST", "/api/z", { id, startRound, callSeconds: 9, cap, name: "Approvals game", callMode: "host", tickets: 1 }, org); row("setup", "create a manual game", "200", st(r), r.ok);
r = await call("PATCH", `/api/z/${id}/settings`, { rewards, whoCanJoin: "list", verify: "id", employeesOnly: true }, org); row("setup", "employees only, employee ID needed", "200", st(r), r.ok);
r = await call("POST", `/api/z/${id}/publish`, { email, phone: "9650397480", ...H.consent("K1") }, org); row("setup", "publish", "200", st(r), r.ok);
r = await call("POST", "/api/payments/test", { pack: 1000, email, name: "Org", org: "Org Co", country: "IN", eid: id, ...H.consent("K3") }, org); row("setup", "pay", "200", st(r), r.ok);
// the Host (set up like in roles-e2e) and a Co-host
const hk0 = (await call("POST", "/api/org/host", { label: "Host One", mobile: "9810000011" }, org)).j.hostKey;
const hs = await call("POST", "/api/host/setup/email", { email: hostMail, ...H.consent("K5") }, hk0); const hv = await call("POST", "/api/host/setup/email/verify", { code: hs.j.devCode }, hk0); const host = hv.j.token; row("setup", "Host added and set up", "token", hv.ok ? "token" : st(hv), !!host);
const cok = (await call("POST", "/api/org/cohost", { label: "Cohost One", phone: "9810000022", e: id }, org)).j; const co = cok.cohostKey; await call("POST", "/api/org/role/accept", { ...H.consent("K5") }, co); row("setup", "Co-host added and accepted the role", "key", co ? "key" : "none", !!co);
// the list: NL employees by the Organizer (parts of 200), 50 more by the Co-host (their own list), 30 by the Host
let added = 0; const listed = Array.from({ length: NL }, (_, i) => ({ name: nameOf("Emp", i), empId: emp(i), type: "employee" }));
for (let k = 0; k < listed.length; k += 200) { const x = await call("POST", `/api/z/${id}/people`, { people: listed.slice(k, k + 200), ...H.consent("K6") }, org); added += x.j.added || 0; }
row("list", "Organizer adds the employee list", String(NL), String(added), added === NL);
const cl = Array.from({ length: 50 }, (_, i) => ({ name: nameOf("CoEmp", i), empId: `EMP-C${String(i).padStart(4, "0")}`, type: "employee" })); const xc = await call("POST", `/api/z/${id}/people`, { people: cl, ...H.consent("K6") }, co); row("list", "Co-host adds 50 people to their own list", "50", `${xc.s} added ${xc.j.added}`, xc.j.added === 50);
const hl = Array.from({ length: 30 }, (_, i) => ({ name: nameOf("HostEmp", i), empId: `EMP-H${String(i).padStart(4, "0")}`, type: "employee" })); const xh = await call("POST", `/api/z/${id}/people`, { people: hl, ...H.consent("K6") }, host); row("list", "Host adds 30 people", "30", `${xh.s} added ${xh.j.added}`, xh.j.added === 30);
const dup = await call("POST", `/api/z/${id}/people`, { people: [listed[0]], ...H.consent("K6") }, org); row("list", "adding an employee who is already on the list is not added twice", "added 0", `${dup.s} added ${dup.j.added}`, (dup.j.added || 0) === 0);
const big = await call("POST", `/api/z/${id}/people`, { people: Array.from({ length: 201 }, (_, i) => ({ name: "X Y", empId: `EMP-Z${i}`, type: "employee" })), ...H.consent("K6") }, org); row("list", "201 people in one request are refused (200 at most)", "413", st(big), big.s === 413);

// ---------- BEFORE the game: early entry ----------
const NE = Math.min(Math.floor(NL * 0.88), 700); let seated = 0, firstTryOk = 0; const t0 = Date.now(); const seats = new Map();
await Promise.all(Array.from({ length: NE }, async (_, i) => { await sleep(Math.random() * 4000); const idv = i % 3 === 0 ? emp(i).toLowerCase() : emp(i); const x = await rawJoin(idv, nameOf("Emp", i), "L" + i, OFFICE[i % 6]); if (x.s === 200) { seated++; seats.set("L" + i, x.j.pid); } else if (i < 3) console.log("  early join problem", i, st(x)); }));
row("early", `${NE} listed employees join with their ID (a third in lowercase), all at once`, String(NE), String(seated), seated === NE, `${Math.round((Date.now() - t0) / 100) / 10} s`);
const co1 = await rawJoin(cl[0].empId, "Co One", "C0"); row("early", "a person on the Co-host's own list joins with the ID", "200", st(co1), co1.s === 200);
const h1 = await rawJoin(hl[0].empId, "Host One", "H0"); row("early", "a person on the Host's list joins with the ID", "200", st(h1), h1.s === 200);
// mistakes
let x = await rawJoin(emp(0), "Someone Else", "DUP1"); row("mistake", "the same employee ID on a second phone", "refused with a reason", st(x), x.s >= 400 && !!x.j.error && x.s !== 403, "must not give a second ticket");
x = await rawJoin("", "No Id", "M1"); row("mistake", "no employee ID typed", "400 need-id", st(x), x.s === 400 && x.j.code === "need-id");
x = await rawJoin("EMP 10001", "Spaced Id", "M2"); row("mistake", "ID typed with a space inside (EMP 10001): the person is told what is wrong, not sent to the organizer", "400 with a reason", st(x), x.s === 400, "INFORMATION: a typo goes to the organizer's waiting list instead of telling the person to check the ID");
x = await rawJoin("emp-10001", "Lower Id", "M3"); row("mistake", "an ID already seated, typed again from the same phone (reload)", "200 (same person) or 409", st(x), [200, 409, 423].includes(x.s), "device differs here, so a refusal is expected");
const sameDev = await rawJoin(emp(5), "Emp 5", "L5"); row("mistake", "the same phone opens the link again (reload): same ticket back", "200 again", st(sameDev), sameDev.s === 200 && sameDev.j.pid === seats.get("L5"), "pid " + (sameDev.j.pid === seats.get("L5") ? "same" : "different"));
// strangers: not on the list
const unkR = []; await Promise.all(Array.from({ length: NU }, async (_, i) => { const x = await rawJoin(unk(i), nameOf("Stranger", i), "U" + i, pip()); unkR.push({ i, ...x }); }));
const ws = unkR.filter((q) => q.s === 403 && q.j.code === "waiting"); row("approval", `${NU} people whose ID is not on the list are held in the waiting room`, `${NU} x 403 waiting`, `${ws.length} x 403 waiting`, ws.length === NU);
const W0 = await wait(org); row("approval", "Organizer sees all of them waiting (name, last 4, ID), plus the one whose ID had a space typed in it", String(NU + 1), String((W0.j.waiting || []).length), (W0.j.waiting || []).length === NU + 1, JSON.stringify((W0.j.waiting || [])[0] || {}).slice(0, 120));
const WH = await wait(host); row("approval", "Host sees the same waiting list", String(NU + 1), String((WH.j.waiting || []).length), (WH.j.waiting || []).length === NU + 1);
const WC = await wait(co); row("approval", "the Co-host sees only requests that came through their own link (none here)", "0", String((WC.j.waiting || []).length), (WC.j.waiting || []).length === 0);
const widOf = new Map(); for (const q of unkR) if (q.j.wid) widOf.set(q.i, q.j.wid);
const me = async (wid) => (await fetch(`${BASE}/api/z/${id}/me?wid=${wid}`)).json();
let m0 = await me(widOf.get(0)); row("approval", "a waiting person is told who has their request", "state waiting + a name", `${m0.state}: ${String(m0.message).slice(0, 60)}`, m0.state === "waiting");
const wl = (W0.j.waiting || []).map((w) => w.id);
// decisions: 0-14 Organizer admits; 15-24 Host declines; 25-39 Host "approve all" later; races on 40-49 (admit at the same instant as decline); 50-59 sequential conflict
const byI = (lo, hi) => Array.from({ length: hi - lo }, (_, k) => lo + k).filter((i) => widOf.has(i));
for (const i of byI(0, 15)) { const d = await call("POST", `/api/z/${id}/waiting/${widOf.get(i)}`, { decision: "admit" }, org); if (i === 0) row("approval", "Organizer admits one request", "200 admitted", st(d) + " " + JSON.stringify(d.j).slice(0, 60), d.s === 200 && d.j.admitted === true); }
for (const i of byI(15, 25)) { const d = await call("POST", `/api/z/${id}/waiting/${widOf.get(i)}`, { decision: "decline" }, host); if (i === 15) row("approval", "Host declines one request", "200 declined", st(d) + " " + JSON.stringify(d.j).slice(0, 60), d.s === 200 && d.j.declined === true); }
const a0 = await me(widOf.get(0)), d0 = await me(widOf.get(15)); row("approval", "an admitted person's page is told 'admitted'", "admitted", a0.state, a0.state === "admitted"); row("approval", "a declined person's page is told 'declined'", "declined", d0.state, d0.state === "declined");
const ja = await rawJoin(unk(0), "Stranger 0", "U0"); row("approval", "after admit the person joins again (their page does this by itself) and gets a ticket", "200", st(ja), ja.s === 200);
const jd = await rawJoin(unk(15), "Stranger 15", "U15"); row("approval", "a declined person who tries again is refused (403 declined)", "403 declined", st(jd), jd.s === 403 && jd.j.code === "declined");
const jd2 = await rawJoin(unk(15), "Stranger 15", "U15b"); row("approval", "a declined person on another phone is refused too", "403 declined", st(jd2), jd2.s === 403);
// the same request decided twice, one after the other
const seqA = byI(50, 55), seqB = byI(55, 60);
for (const i of seqA) { await call("POST", `/api/z/${id}/waiting/${widOf.get(i)}`, { decision: "admit" }, org); }
const second = await call("POST", `/api/z/${id}/waiting/${widOf.get(seqA[0])}`, { decision: "decline" }, host); row("conflict", "Organizer admits, THEN the Host declines the same request", "answer says it was already admitted; stays admitted", `${st(second)} ${JSON.stringify(second.j)}`, second.j.already === "admitted");
const sa = await rawJoin(unk(seqA[0]), "S", "U" + seqA[0]); row("conflict", "…the person still gets in (first decision stands)", "200", st(sa), sa.s === 200);
for (const i of seqB) { await call("POST", `/api/z/${id}/waiting/${widOf.get(i)}`, { decision: "decline" }, host); }
const second2 = await call("POST", `/api/z/${id}/waiting/${widOf.get(seqB[0])}`, { decision: "admit" }, org); row("conflict", "Host declines, THEN the Organizer admits the same request", "answer says it was already declined; stays declined", `${st(second2)} ${JSON.stringify(second2.j)}`, second2.j.already === "declined");
const sb = await rawJoin(unk(seqB[0]), "S", "U" + seqB[0]); row("conflict", "…the person stays out (first decision stands)", "403 declined", st(sb), sb.s === 403 && sb.j.code === "declined");
// the same request decided at the SAME INSTANT by two people
const raceI = byI(40, 50), raceOut = [];
await Promise.all(raceI.map(async (i) => { const [a, b] = await Promise.all([call("POST", `/api/z/${id}/waiting/${widOf.get(i)}`, { decision: "admit" }, org), call("POST", `/api/z/${id}/waiting/${widOf.get(i)}`, { decision: "decline" }, host)]); const state = (await me(widOf.get(i))).state; const j = await rawJoin(unk(i), "S", "U" + i); raceOut.push({ i, state, join: j.s, a: JSON.stringify(a.j).slice(0, 50), b: JSON.stringify(b.j).slice(0, 50) }); }));
const incons = raceOut.filter((q) => (q.state === "declined" && q.join === 200) || (q.state === "admitted" && q.join !== 200)); row("conflict", `${raceI.length} requests admitted by the Organizer and declined by the Host at the SAME instant: the final answer and the person's entry agree`, "0 disagreements", `${incons.length} disagreements of ${raceOut.length}`, incons.length === 0, JSON.stringify(raceOut.slice(0, 3)));
// approve all for what is left
const left = (await wait(host)).j.waiting || []; const aa = await call("POST", `/api/z/${id}/waiting/all`, { decision: "admit" }, host); row("approval", `Host presses "approve all" (${left.length} still waiting)`, "all admitted", JSON.stringify(aa.j), aa.s === 200 && (aa.j.admitted || 0) === left.length);
const w2 = await wait(org); row("approval", "nobody is left waiting afterwards", "0", String((w2.j.waiting || []).length), (w2.j.waiting || []).length === 0);

// ---------- the game: the Host presses Next ----------
const ctl = (k) => ({ token: k, base: BASE, prefix: "/api/z" }); const pub = (key, ...a) => Promise.race([TBControl.publish(id, ctl(key), ...a), sleep(30000).then(() => { throw new Error("control timeout"); })]);
const refs = []; for (let i = 0; i < 3; i++) { const ph = new NodePhone(H, id, { empId: cl[1 + i].empId, name: nameOf("CoEmp", 1 + i) }, { claim: "always" }); await ph.open(); ph.ok = await ph.join(); refs.push(ph); if (ph.ok) ph.go(); }
row("game", "three reference phones joined with their employee ID", "3", String(refs.filter((p) => p.ok).length), refs.every((p) => p.ok));
const k1 = await TBControl.ensureKey(id, ctl(host)); row("game", "Host registers the game-day key", "ok", JSON.stringify(k1).slice(0, 40), !!(k1 && k1.ok));
await sleep(Math.max(0, firstMs - 15_000 - Date.now()));
let presses = 0; const press = async () => { try { const q = await pub(host, "next"); if (q.status === 200) presses++; return q.status; } catch (e) { return String(e.message); } };
for (let k = 0; k < 8; k++) { const s = await press(); if (k === 0) row("game", "Host presses Next", "200", String(s), s === 200); await sleep(8500); }

// ---------- DURING the game: late entry and approvals ----------
const NLATE = Math.min(NL - NE - 1, 80); let lateOk = 0; const lateIds = [];
for (let i = 0; i < NLATE; i++) { const k = NE + i; const x = await rawJoin(emp(k), nameOf("Emp", k), "L" + k, OFFICE[k % 6]); if (x.s === 200) { lateOk++; lateIds.push(x.j.pid); } }
row("late", `${NLATE} listed employees join AFTER the first number`, String(NLATE), String(lateOk), lateOk === NLATE);
const lp = new NodePhone(H, id, { empId: emp(NE + NLATE), name: "Late Phone" }, { claim: "always" }); await lp.open(); lp.ok = await lp.join(); if (lp.ok) lp.go(); await sleep(6000);
const ln = lp.view().log.filter((q) => q > 0).length, rn = refs[0].view().log.filter((q) => q > 0).length; row("late", "a late joiner is told so and sees only the numbers called after joining", "late flag, fewer numbers than a phone that was there from the start", `late=${!!lp.view().late} ${ln} vs ${rn} numbers`, !!lp.view().late && ln < rn);
const NLU = 40, lu = []; await Promise.all(Array.from({ length: NLU }, async (_, i) => { const x = await rawJoin(unk(100 + i), nameOf("LateStranger", i), "LU" + i); lu.push({ i, ...x }); }));
row("late", `${NLU} strangers (ID not on the list) ask to come in during the game`, `${NLU} x 403 waiting`, `${lu.filter((q) => q.s === 403 && q.j.code === "waiting").length} x 403 waiting`, lu.every((q) => q.s === 403 && q.j.code === "waiting"));
const wm = (await wait(org)).j.waiting || []; row("late", "the Organizer sees them in the waiting list during the game", String(NLU), String(wm.length), wm.length === NLU);
const adm = []; for (const q of lu.slice(0, 20)) adm.push((await call("POST", `/api/z/${id}/waiting/${q.j.wid}`, { decision: "admit" }, org)).s); const dec = []; for (const q of lu.slice(20, 30)) dec.push(await call("POST", `/api/z/${id}/waiting/${q.j.wid}`, { decision: "decline" }, host));
row("late", "during the game: 20 admits by the Organizer and 10 declines by the Host are all answered 200", "30 x 200", `admits ${adm.filter((x) => x === 200).length}/20, declines ${dec.filter((x) => x.s === 200).length}/10`, adm.every((x) => x === 200) && dec.every((x) => x.s === 200), JSON.stringify(dec.slice(0, 2).map((x) => [x.s, x.j])));
const mm = []; for (const q of lu.slice(20, 30)) mm.push(await me(q.j.wid)); row("late", "…and each declined stranger's page now says 'declined'", "10 x declined", `${mm.filter((x) => x.state === "declined").length} x declined (${[...new Set(mm.map((x) => x.state))].join(",")})`, mm.every((x) => x.state === "declined"));
const lj = await rawJoin(unk(100), "LateStranger 0", "LU0"); row("late", "an admitted stranger joins during the game as a late joiner", "200", st(lj), lj.s === 200);
const ld = await rawJoin(unk(125), "LateStranger 25", "LU25"); row("late", "a declined stranger is refused during the game", "403 declined", st(ld), ld.s === 403 && ld.j.code === "declined");
// removals during the game
const ppl = []; for (let off = 0; off < 2000; off += 500) { const g = await call("GET", `/api/z/${id}/people?limit=500&offset=${off}`, undefined, org); const part = g.j.people || []; ppl.push(...part); if (part.length < 500) break; }
const joined = ppl.filter((p) => p.status === "joined"); row("track", "the Organizer's list shows who joined, who was invited, who was let in by whom", "statuses joined/invited, with 'let in by' for approved", `${ppl.length} rows; joined ${joined.length}; keys ${Object.keys(ppl[0] || {}).join(",")}`.slice(0, 200), joined.length > 0 && ppl.some((p) => p.approvedBy || p.letInBy || p.approved_by));
const victim = joined[5]; if (victim) { const rm = await call("POST", `/api/z/${id}/people/${victim.id}/remove`, {}, org); row("remove", "Organizer removes a seated person during the game", "200", st(rm), rm.s === 200); }
const coRm = victim ? await call("POST", `/api/z/${id}/people/${joined[6].id}/remove`, {}, co) : null; if (coRm) row("remove", "the Co-host may NOT remove someone who is not on their own list", "403 or 404", st(coRm), [403, 404].includes(coRm.s));
const hostRm = joined[7] ? await call("POST", `/api/z/${id}/people/${joined[7].id}/remove`, {}, host) : null; if (hostRm) row("remove", "the Host removes a seated person during the game", "200", st(hostRm), hostRm.s === 200);
// the Host ends the game
for (let k = 0; k < 3; k++) { await press(); await sleep(8500); }
const en = await pub(org, "stop", {}).catch((e) => ({ status: String(e.message) })); row("game", "Organizer ends the game", "200", String(en.status), en.status === 200);
const tEnd = Date.now(); while (Date.now() - tEnd < 300000 && refs.some((p) => p.view().phase !== "ended")) await sleep(2000);
row("game", "the reference phones reach the end", "3", String(refs.filter((p) => p.view().phase === "ended").length), refs.every((p) => p.view().phase === "ended"), `${Math.round((Date.now() - tEnd) / 1000)} s`);
const same = new Set(refs.map((p) => JSON.stringify(p.view().log.filter((q) => q > 0)))); row("game", "the three phones show the same numbers", "1 distinct", String(same.size), same.size === 1);

// ---------- limits on a second game ----------
const id2 = id + "-B"; await call("POST", "/api/z", { id: id2, startRound: roundAt(Date.now() + 7200e3), callSeconds: 9, cap: 900, name: "Waiting cap", tickets: 1 }, org);
await call("PATCH", `/api/z/${id2}/settings`, { rewards, whoCanJoin: "list", verify: "id", employeesOnly: true }, org); await call("POST", `/api/z/${id2}/publish`, { email, phone: "9650397480", ...H.consent("K1") }, org); await call("POST", "/api/payments/test", { pack: 1000, email, name: "Org", org: "Org Co", country: "IN", eid: id2, ...H.consent("K3") }, org);
const j2 = async (empId, k, ip) => { const q = await fetch(`${BASE}/api/z/${id2}/join`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify({ name: "Wait " + k, empId, device: dev("B" + k), ...H.consent("K4") }) }); return { s: q.status, j: await q.json().catch(() => ({})) }; };
const capOut = []; for (let b = 0; b < 12; b++) await Promise.all(Array.from({ length: 50 }, async (_, k) => { const n = b * 50 + k; capOut.push(await j2(`EMP-8${String(n).padStart(4, "0")}`, n, pip())); }));
const nWait = capOut.filter((q) => q.s === 403 && q.j.code === "waiting").length, nFull = capOut.filter((q) => q.s === 429 && q.j.code === "waiting-full").length; row("limits", "the waiting room holds at most 500 requests; the next ones are told it is full (600 strangers, each from their own address)", "500 waiting + 100 waiting-full", `${nWait} waiting + ${nFull} waiting-full (other: ${600 - nWait - nFull})`, nWait === 500 && nFull === 100);
// the wrong-ID limit on its own fresh game (a small list; the waiting room is empty)
const id3 = id + "-C"; await call("POST", "/api/z", { id: id3, startRound: roundAt(Date.now() + 7200e3), callSeconds: 9, cap: 300, name: "ID typos", tickets: 1 }, org);
await call("PATCH", `/api/z/${id3}/settings`, { rewards, whoCanJoin: "list", verify: "id", employeesOnly: true }, org); await call("POST", `/api/z/${id3}/publish`, { email, phone: "9650397480", ...H.consent("K1") }, org); await call("POST", "/api/payments/test", { pack: 500, email, name: "Org", org: "Org Co", country: "IN", eid: id3, ...H.consent("K3") }, org);
await call("POST", `/api/z/${id3}/people`, { people: Array.from({ length: 5 }, (_, i) => ({ name: "Listed " + i, empId: `EMP-L${i}`, type: "employee" })), ...H.consent("K6") }, org);
const j3 = async (empId, k, ip) => { const q = await fetch(`${BASE}/api/z/${id3}/join`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify({ name: "T " + k, empId, device: dev("C" + k), ...H.consent("K4") }) }); return { s: q.status, j: await q.json().catch(() => ({})) }; };
const oneIp = pip(); const idm = []; for (let n = 0; n < 40; n++) idm.push(await j3(`EMP-7${String(n).padStart(4, "0")}`, n, oneIp));
const first429 = idm.findIndex((q) => q.s === 429), m429 = idm.find((q) => q.s === 429)?.j;
row("limits", "40 wrong employee IDs typed from ONE office address within minutes (an office of 1000 makes typos): nobody is locked out", "none locked out", first429 < 0 ? "none locked" : `locked from try ${first429 + 1}: ${m429?.code} "${String(m429?.error).slice(0, 80)}"`, first429 < 0, "KNOWN RISK ID_MISS_PER_10MIN = 30");
const okAfter = await j3("EMP-L0", 900, oneIp); row("limits", "…a listed employee with a CORRECT ID, from the same office address, is still let in", "200", st(okAfter), okAfter.s === 200);
const okOther = await j3("EMP-L1", 901, pip()); row("limits", "…a listed employee from another address is let in", "200", st(okOther), okOther.s === 200);
for (const p of [...refs, lp]) p.stop();
const bad = rows.filter((q) => !q.ok); const out = { test: "employees-only manual game: approvals", at: new Date().toISOString(), base: BASE, N_LISTED: NL, N_UNKNOWN: NU, total: rows.length, ok: rows.length - bad.length, notOk: bad.length, rows };
writeFileSync(`${DATA}/approvals-e2e-${OUT}.json`, JSON.stringify(out, null, 1)); console.log(`DONE ${out.ok} of ${out.total} as expected; not as expected: ${bad.map((b) => b.what).join(" ; ") || "none"}`); process.exit(0);
