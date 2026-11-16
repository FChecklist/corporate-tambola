// NEGATIVE CONTROL copy of sigma-http.mjs with two deliberately WRONG expectations: proves the checker flags a wrong answer. Not part of the 1,000,000 count.
// Step test against the real (local) server: who is let in. Six kinds of game (the audiences of the campaign); every attempt has an expected answer worked out here, not by the server.
// run: node tools/sigma-http.mjs [attempts] [conc]   (writes data/sigma-http.json)  server must be on http://localhost:8801
import { writeFileSync } from "node:fs";
import { Harness, sleep, roundAt } from "./nodephone.mjs";
import { fileURLToPath as __f2p } from "node:url"; const ROOT = __f2p(new URL("../../", import.meta.url)), DATA = process.env.DATA_DIR || ROOT + "data"; // CLOUD PORT: paths relative to the checkout; DB_FILE chooses the server database
import { mkdirSync } from "node:fs"; mkdirSync(DATA, { recursive: true });
const ATT = Number(process.argv[2] || 100000), CONC = Number(process.argv[3] || 24);
const BASE = process.env.BASE || "http://localhost:8801", H = new Harness(BASE, { ipPool: 2000 });
const rr = (n) => Math.floor(Math.random() * n);
const ip = () => `10.${rr(250)}.${rr(250)}.${1 + rr(250)}`;
const TAGS = Math.random().toString(36).slice(2, 6).toUpperCase();
const email = `sig.${TAGS.toLowerCase()}@sample-co.in`;
await H.call("POST", "/api/owner/test-mail", { add: email }, "local-organizer-secret", "10.250.0.1");
const tok = (await H.call("POST", "/api/start", { email, ...H.consent("K2") }, undefined, ip())).j.token;
const N = 300; // listed people per game
const mob = (g, i) => `9${String(g).padStart(2, "0")}${String(i).padStart(7, "0")}`.slice(0, 10), emp = (g, i) => `EMP-${g}${String(1000 + i).padStart(5, "0")}`;
const KINDS = ["open", "list-mobile", "emp-id", "emp-both", "everyone-id", "everyone-both"];
const games = [];
for (let g = 0; g < KINDS.length; g++) {
  const aud = KINDS[g], id = `SIG-${TAGS}-${g}`, startRound = roundAt(Date.now() + 3600_000);
  let r = await H.call("POST", "/api/z", { id, startRound, callSeconds: 9, cap: 5000, name: "Sigma " + aud }, tok, ip()); if (!r.ok) throw new Error("create " + JSON.stringify(r.j));
  const verify = aud === "emp-id" || aud === "everyone-id" ? "id" : aud === "emp-both" || aud === "everyone-both" ? "both" : "mobile", employeesOnly = aud === "emp-id" || aud === "emp-both";
  r = await H.call("PATCH", `/api/z/${id}/settings`, { rewards: [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "x" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "y" }], whoCanJoin: aud === "list-mobile" || employeesOnly ? "list" : "anyone", ...(verify !== "mobile" ? { verify } : {}), ...(employeesOnly ? { employeesOnly: true } : {}) }, tok, ip()); if (!r.ok) throw new Error("settings " + JSON.stringify(r.j));
  await H.call("POST", "/api/payments/test", { pack: 1000, email, name: "Sigma", org: "Sigma", country: "IN", eid: id, ...H.consent("K3") }, tok, ip());
  r = await H.call("POST", `/api/z/${id}/publish`, { email, phone: "9650397480", ...H.consent("K1") }, tok, ip());
  const listed = []; for (let i = 0; i < N; i++) {
    const p = { name: "Person " + i, type: "employee" }; if (aud === "list-mobile" || aud === "emp-both" || aud === "everyone-both") p.phone = mob(g, i); if (aud === "emp-id" || aud === "emp-both" || aud === "everyone-id" || aud === "everyone-both") p.empId = emp(g, i); listed.push(p);
  }
  if (aud !== "open") for (let k = 0; k < N; k += 200) { const part = listed.slice(k, k + 200); r = await H.call("POST", `/api/z/${id}/people`, { people: part, ...H.consent("K6") }, tok, ip()); if (!r.ok || r.j.added !== part.length) throw new Error("people " + JSON.stringify(r.j).slice(0, 200)); }
  games.push({ aud, id, g });
}
console.log("games ready", games.map((x) => x.id).join(" "));
// expected answer for one attempt: [status, code|null]
const EXP = {
  "open": { good: [200], bad: null },
};
const attempt = (G) => {
  const { aud, g } = G, i = rr(150), ib = 150 + rr(150), dev = ((rr(2 ** 40) + 2 ** 40).toString(16) + (rr(2 ** 40) + 2 ** 40).toString(16) + "c".repeat(32)).slice(0, 32), name = "Person " + i;
  const devOf = (k) => (Buffer.from(String(k).toUpperCase() + "|" + g).toString("hex") + "c".repeat(32)).slice(0, 32).replace(/[^0-9a-f]/g, "c");
  const mk = (b, want) => ({ body: { name, device: devOf(b.phone || b.empId), ...b, ...H.consent("K4") }, want, tag: aud });
  const wrongEmp = emp(g, 0).replace("EMP-", "EMP-9"), wrongMob = `9${String(g).padStart(2, "0")}9${String(rr(400)).padStart(6, "0")}`.slice(0, 10); // 400 different strangers per game: the waiting room of a game holds at most 500, then the answer is "waiting room full" (429), which is correct and tested elsewhere
  const roll = rr(100);
  switch (aud) {
    case "open": return mk({ phone: mob(g, 600000 + rr(2500)) }, { s: 200 });
    case "list-mobile": return roll < 50 ? mk({ phone: mob(g, i) }, { s: 200 }) : mk({ phone: wrongMob }, { s: 200 });
    case "emp-id": return roll < 40 ? mk({ empId: emp(g, i) }, { s: 200 }) : roll < 55 ? mk({ empId: emp(g, i).toLowerCase() }, { s: 200 }) : roll < 80 ? mk({ empId: wrongEmp }, { s: 403, code: "waiting" }) : mk({ phone: mob(g, ib) }, { s: 200 });
    case "emp-both": return roll < 50 ? mk({ phone: mob(g, i), empId: emp(g, i) }, { s: 200 }) : roll < 75 ? mk({ phone: mob(g, ib), empId: wrongEmp }, { s: 403, code: "waiting" }) : mk({ phone: mob(g, ib) }, { s: 400, code: "need-id" });
    case "everyone-id": return roll < 35 ? mk({ empId: emp(g, i) }, { s: 200 }) : roll < 70 ? mk({ phone: mob(g, 500000 + rr(1200)) }, { s: 200 }) : mk({ empId: wrongEmp }, { s: 403, code: "waiting" });
    case "everyone-both": return roll < 35 ? mk({ phone: mob(g, i), empId: emp(g, i) }, { s: 200 }) : roll < 70 ? mk({ phone: mob(g, 500000 + rr(1200)) }, { s: 200 }) : mk({ phone: mob(g, ib), empId: wrongEmp }, { s: 403, code: "waiting" });
  }
};
let trials = 0, defects = 0; const bad = {}, byKind = {}; let left = ATT; const t0 = Date.now();
const worker = async () => {
  while (left-- > 0) {
    const G = games[rr(games.length)], a = attempt(G); let s = 0, j = {};
    try { const x = await fetch(BASE + `/api/z/${G.id}/join`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip() }, body: JSON.stringify(a.body), signal: AbortSignal.timeout(20000) }); s = x.status; j = await x.json().catch(() => ({})); } catch { s = 0; }
    trials++; byKind[a.tag] = (byKind[a.tag] || 0) + 1;
    const code = j.code ?? j.reason ?? null; const okS = s === a.want.s && (!a.want.code || code === a.want.code) && (s !== 200 || (j.pid || j.token));
    if (!okS) { defects++; const k = `${a.tag} want ${a.want.s}/${a.want.code || "-"} got ${s}/${code}`; bad[k] = (bad[k] || 0) + 1; }
    if (trials % 5000 === 0) console.log(`${trials} attempts, ${defects} wrong, ${Math.round(trials / ((Date.now() - t0) / 1000))}/s`, JSON.stringify(bad).slice(0, 600));
  }
};
await Promise.all(Array.from({ length: CONC }, worker));
const out = { step: "S10 who is let in (6 kinds of game)", trials, defects, dpmo: Math.round(defects / trials * 1e6 * 100) / 100, upper95PerMillion: Math.round((defects === 0 ? 3 : defects + 3) / trials * 1e6 * 100) / 100, byKind, wrongKinds: bad, seconds: Math.round((Date.now() - t0) / 1000) };
writeFileSync(`${DATA}/sigma-http-NEGCONTROL${process.env.OUT ? "-" + process.env.OUT : ""}.json`, JSON.stringify(out, null, 1)); console.log("DONE", JSON.stringify(out));
process.exit(0);
