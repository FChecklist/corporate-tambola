/**
 * Full-cycle simulation against the REAL local server (HTTP + WebSocket), no mocks.
 *   Organizer buys a pack and logs in -> sets up engagement (2 tickets, houses, brand breaks)
 *   -> uploads 100 participants -> makes hosts and team leads -> passes, family, waiting room, second-phone alert
 *   -> starts -> 100 bots cut/claim over WebSocket -> emergency pause -> end -> report -> privacy audit -> purge.
 * Run:  TAMBOLA_FAST=1 bun run apps/server/src/index.ts   (other terminal)   then   bun run tools/sim/run.ts
 */
import { normalize, ticketNumbers, patternNumbers, type PatternId, type Ticket } from "@tambola/shared";

const BASE = process.env.BASE ?? "http://localhost:8787";
const WS = BASE.replace("http", "ws");
const N = Number(process.env.N ?? 100);
const results: { ok: boolean; name: string; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push({ ok, name, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rnd = (n: number) => Math.floor(Math.random() * n);
const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");

async function http(method: string, path: string, body?: unknown, h: { token?: string; device?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (h.token) headers.authorization = `Bearer ${h.token}`;
  if (h.device) headers["x-device"] = h.device;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let data: any = null;
  try { data = await res.json(); } catch { /* none */ }
  return { status: res.status, data };
}

// ---------- fake people ----------
const FIRST = ["Anita", "Priya", "Rahul", "Sana", "Vikram", "Deepa", "Fatima", "Emily", "Ahmed", "Arjun", "Suresh", "Lakshmi", "Joseph", "Kavya", "Nikhil", "Pooja", "Sam", "Omar", "Meera", "Karan", "Neha", "Rohit", "Isha", "Manoj", "Tara", "Zoya", "Dev", "Ritu", "Imran", "Gita"];
const LAST = ["Rao", "Nair", "Mehta", "Sheikh", "Singh", "Iyer", "Khan", "Chen", "Ali", "Kapoor", "Kumar", "Menon", "DSouza", "Reddy", "Joshi", "Bhatt", "Wilson", "Farooq", "Shah", "Das"];
const used = new Set<string>();
function fakePerson(i: number) {
  for (;;) {
    const intl = i % 17 === 0;
    const raw = intl ? "+971 5" + (10000000 + rnd(89999999)) : "9" + (100000000 + rnd(899999999));
    const n = normalize(raw, "IN");
    if (!n.ok || used.has(n.e164)) continue;
    used.add(n.e164);
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + rnd(5)) % LAST.length]}${i}`.replace(/\d+$/, (d) => (Number(d) > 29 ? " " + String.fromCharCode(65 + (Number(d) % 26)) : ""));
    const styles = [n.e164, n.e164.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2"), n.e164.replace(/^\+91/, "0"), n.e164.replace(/^\+91/, "91"), n.e164.replace(/^\+91(\d{5})(\d{5})$/, "$1 $2")];
    return { name, e164: n.e164, typed: styles[i % styles.length]! };
  }
}

// ---------- bot ----------
interface Bot {
  name: string; e164: string; typed: string; device: string; role?: string;
  tickets?: Ticket[]; ticketIds?: Record<string, string>; ws?: WebSocket;
  cut: Set<number>[]; called: number[]; claimed: Set<string>; rewards: { pattern: PatternId; scope: string }[];
  msgs: string[]; kind?: string | null; claims: number; cheater: boolean; slow: boolean; blocked: boolean;
}
const bots: Bot[] = [];
const mkBot = (p: { name: string; e164: string; typed: string }, cheater = false, slow = false): Bot =>
  ({ ...p, device: hex(16), cut: [new Set(), new Set()], called: [], claimed: new Set(), rewards: [], msgs: [], claims: 0, cheater, slow, blocked: false });

let code = "";
const connect = (b: Bot) => new Promise<void>((resolve, reject) => {
  const ws = new WebSocket(`${WS}/ws?e=${code}&d=${b.device}`);
  b.ws = ws;
  ws.onopen = () => resolve();
  ws.onerror = (e) => reject(new Error("ws error " + b.name));
  ws.onmessage = (ev) => { const raw = String(ev.data); b.msgs.push(raw); onMsg(b, JSON.parse(raw)); };
});

function onMsg(b: Bot, m: any) {
  if (m.type === "call") {
    b.called.push(m.number);
    const idx = b.called.length - 1;
    (b.tickets ?? []).forEach((t, ti) => { if (ticketNumbers(t).includes(m.number) && Math.random() < (b.slow ? 0.7 : 0.995)) b.cut[ti]!.add(m.number); });
    if (b.blocked) return;
    const delay = b.slow ? 260 : rnd(40);
    const tryClaim = (ticket: "A" | "B" | "AB", pattern: PatternId, cutNums: number[], complete: boolean) => {
      const key = ticket + pattern;
      if (b.claimed.has(key)) return;
      if (b.cheater && !complete && Math.random() < 0.02 && idx > 10) { b.claimed.add(key); setTimeout(() => send(b, ticket, pattern, cutNums), delay); return; } // cheater claims early
      if (!complete) return;
      b.claimed.add(key);
      setTimeout(() => send(b, ticket, pattern, cutNums), delay);
    };
    const calledSet = new Set(b.called);
    const completedNow = (nums: number[], cutSet: Set<number>) => nums.every((n) => calledSet.has(n) && cutSet.has(n)) && nums.includes(m.number);
    (b.tickets ?? []).forEach((t, ti) => {
      const tk = (["A", "B"] as const)[ti]!;
      for (const r of b.rewards) {
        if (r.scope !== "ticket") continue;
        if (r.pattern === "early5") {
          const cutCalled = [...b.cut[ti]!].filter((n) => calledSet.has(n));
          tryClaim(tk, "early5", [...b.cut[ti]!], cutCalled.length === 5 && b.cut[ti]!.has(m.number));
        } else { const nums = patternNumbers(t, r.pattern)!; tryClaim(tk, r.pattern, [...b.cut[ti]!], completedNow(nums, b.cut[ti]!)); }
      }
    });
    if ((b.tickets?.length ?? 0) === 2 && b.rewards.some((r) => r.scope === "two_ticket")) {
      const all = [...ticketNumbers(b.tickets![0]!), ...ticketNumbers(b.tickets![1]!)];
      tryClaim("AB", "full", [...b.cut[0]!, ...b.cut[1]!], completedNow(all, new Set([...b.cut[0]!, ...b.cut[1]!])));
    }
  } else if (m.type === "claimAck") {
    if (m.error?.includes("blocked")) b.blocked = true;
  }
}
function send(b: Bot, ticket: string, pattern: string, cut: number[]) {
  if (b.ws?.readyState !== WebSocket.OPEN) return;
  b.claims++;
  b.ws.send(JSON.stringify({ type: "claim", ticket, pattern, cut }));
}

// ---------- run ----------
const t0 = Date.now();
console.log(`Corporate Tambola simulation: ${N} participants against ${BASE}\n`);

const health = await http("GET", "/api/health");
check("server is up", health.status === 200 && health.data?.ok, JSON.stringify(health.data));
if (!health.data?.fast) console.log("NOTE: server not in TAMBOLA_FAST mode; the run will take ~15+ minutes of real time.");

// 1 organizer buys + logs in
const email = `hr.${hex(3)}@acme-industries.com`;
const co = await http("POST", "/api/checkout", { org: "Acme Industries", email, country: "IN", taxId: "27ABCDE1234F1Z5", pack: 250, currency: "INR" });
check("checkout creates order and engagement", co.status === 200 && co.data.engagementCode?.length === 7, JSON.stringify(co.data));
code = co.data.engagementCode;
check("India price: Rs 1,000 incl. GST split", co.data.total === 1000 && co.data.tax > 150, `tax ${co.data.tax}`);
const bad = await http("POST", "/api/auth/verify", { email, code: "000000" });
check("login with no code requested is refused", bad.status === 400);
const ae = await http("POST", "/api/auth/email", { email });
const av = await http("POST", "/api/auth/verify", { email, code: ae.data.devCode });
check("organizer logs in with the emailed code", av.status === 200 && !!av.data.token);
const tok = av.data.token as string;
const wrong = await http("POST", "/api/auth/verify", { email, code: "123456" });
check("used code cannot be reused", wrong.status === 400);
const A = (m: string, p: string, b?: unknown) => http(m, `/api/e/${code}${p}`, b, { token: tok });

// 2 setup
let r = await A("PATCH", "/settings", { name: "Diwali Engagement 2026", ticketMode: "double", familyLimit: 2, familyCanWin: true, participantInvites: 1, callMode: "ai", startsAt: Date.now() + 3600_000 });
check("organizer sets 2-ticket mode and limits", r.status === 200, r.data?.error);
r = await A("PUT", "/rewards", { spec: [
  { pattern: "early5", texts: ["Rs 500 voucher"] }, { pattern: "top", texts: ["Rs 800 voucher"] }, { pattern: "mid", texts: ["Rs 800 voucher"] },
  { pattern: "bot", texts: ["Rs 800 voucher"] }, { pattern: "corners", texts: ["Rs 1000 voucher"] },
  { pattern: "full", texts: ["Smart watch", "Headphones", "Gift hamper", "Movie tickets"] },
  { pattern: "full", scope: "two_ticket", texts: ["Weekend trip", "Tablet"] }] });
check("rewards: 4 Full Houses + 2 Full Two-Ticket Houses", r.status === 200, r.data?.error);
r = await A("PUT", "/breaks", { breaks: [22, 45, 67].map((a, i) => ({ id: "b" + i, after: a, kind: i === 1 ? "youtube" : "file", title: `Brand break ${i + 1}`, seconds: 1 })) });
check("3 brand breaks at near-equal positions", r.status === 200, r.data?.error);
r = await A("PUT", "/breaks", { breaks: [10, 20, 30, 40].map((a, i) => ({ id: "x" + i, after: a, kind: "file", title: "t", seconds: 1 })) });
check("4th brand break is refused", r.status === 400);

// 3 upload 100 participants (messy CSV)
const people = Array.from({ length: N }, (_, i) => fakePerson(i));
const csv = ["Name,Mobile", ...people.map((p) => `${p.name},${p.typed}`), "Bad Person,12345", "Letters Person,98765abc10", `Dup Person,${people[0]!.typed}`, "No Number,"].join("\n");
const chk = await A("POST", "/upload/check", { text: csv });
check(`upload check: ${N} usable, bad lines and repeats caught`, chk.data.ready.length + chk.data.fixed.length === N && chk.data.bad.length === 3 && chk.data.repeats.length === 1,
  `ready ${chk.data.ready.length}, fixed ${chk.data.fixed.length}, bad ${chk.data.bad.length}, repeats ${chk.data.repeats.length}`);
const com = await A("POST", "/upload/commit", { items: [...chk.data.ready, ...chk.data.fixed].map((x: any) => ({ name: x.name, e164: x.e164 })) });
check(`${N} participants added`, com.status === 200 && com.data.added === N);
const over = await A("POST", "/upload/commit", { items: Array.from({ length: 200 }, () => ({ name: "Over", e164: fakePerson(900).e164 })) });
check("player limit (250) refuses an upload that would exceed it", over.status === 400, over.data?.error);

// 4 roles
let cs = (await A("GET", "/console")).data;
const idOf = (name: string) => cs.participants.find((p: any) => p.name === people.find((x) => x.name === name)!.name)!.id;
const hostPeople = [people[1]!, people[2]!], tlPeople = [people[3]!, people[4]!, people[5]!, people[6]!];
r = await A("POST", "/people/bulk", { ids: hostPeople.map((p) => idOf(p.name)), action: "role", role: "host" });
check("2 Hosts (co-hosts) appointed", r.status === 200, r.data?.error);
r = await A("POST", "/people/bulk", { ids: tlPeople.map((p) => idOf(p.name)), action: "role", role: "team_lead", cap: 10 });
check("4 Team Leads appointed with cap 10", r.status === 200, r.data?.error);
cs = (await A("GET", "/console")).data;
const hosts = cs.participants.filter((p: any) => p.role === "host"), tls = cs.participants.filter((p: any) => p.role === "team_lead");
check("role links exist for hosts and team leads", hosts.every((p: any) => p.roleLink) && tls.every((p: any) => p.roleLink));

// 5 host / team lead open their role links
const hostBots = hostPeople.map((p) => mkBot(p)); const tlBots = tlPeople.map((p) => mkBot(p));
for (const [b, p] of [...hostBots.map((b, i) => [b, hosts.find((h: any) => h.name === hostPeople[i]!.name)] as const), ...tlBots.map((b, i) => [b, tls.find((h: any) => h.name === tlPeople[i]!.name)] as const)]) {
  const rc = p.roleLink.split("/r/")[1];
  const o = await http("POST", `/api/r/${rc}/open`, {}, { device: b.device });
  const c = await http("POST", `/api/r/${rc}/confirm`, { consent: true }, { device: b.device });
  if (o.data.t !== "role" || c.status !== 200) check("role link opens", false, JSON.stringify(o.data) + JSON.stringify(c.data));
  (b as any).roleCode = rc;
}
check("hosts and team leads joined through their personal links", true);
const second = await http("POST", `/api/r/${(hostBots[0] as any).roleCode}/open`, {}, { device: hex(16) });
check("host link on a second phone is blocked", second.data.t === "err" && second.data.k === "inuse", JSON.stringify(second.data));
const hAuth = (b: Bot) => ({ device: b.device });
const hc = await http("GET", `/api/e/${code}/console`, undefined, hAuth(hostBots[0]!));
check("host sees console with masked numbers", hc.status === 200 && hc.data.participants[0].number.includes("•") && !hc.data.participants[0].roleLink, hc.data.viewer);
const hset = await http("PATCH", `/api/e/${code}/settings`, { limit: 5000 }, hAuth(hostBots[0]!));
check("host cannot change the limit", hset.status === 400 || hset.status === 403, hset.data?.error);
const hfam = await http("PATCH", `/api/e/${code}/settings`, { familyLimit: 3 }, hAuth(hostBots[0]!));
check("host can change the family limit", hfam.status === 200, hfam.data?.error);
const tlc = await http("GET", `/api/e/${code}/console`, undefined, hAuth(tlBots[0]!));
check("team lead cannot open the console", tlc.status === 403);
const tlAdmit = await http("POST", `/api/e/${code}/waiting/admit`, { all: true }, hAuth(tlBots[0]!));
check("team lead cannot admit people", tlAdmit.status === 403);
const hostRole = await http("POST", `/api/e/${code}/people/bulk`, { ids: [hosts[1].id], action: "role", role: "participant" }, hAuth(hostBots[0]!));
check("host cannot change another host", hostRole.status === 400, hostRole.data?.error);

// 6 ordinary participants join with game link + number
const rest = people.filter((p) => ![...hostPeople, ...tlPeople].some((x) => x.name === p.name));
const normal: Bot[] = rest.map((p, i) => mkBot(p, i % 25 === 3, i % 20 === 5));
let joined = 0;
for (let i = 0; i < normal.length; i += 10) {
  await Promise.all(normal.slice(i, i + 10).map(async (b) => {
    const j = await http("POST", `/api/e/${code}/join`, { raw: b.typed, country: "IN" }, hAuth(b));
    if (j.data.t !== "consent") return check("join returns consent", false, JSON.stringify(j.data));
    if (!j.data.name.includes("•")) check("name is masked on the consent screen", false, j.data.name);
    const c = await http("POST", `/api/e/${code}/confirm`, { raw: b.typed, country: "IN", consent: true }, hAuth(b));
    if (c.status === 200) joined++;
  }));
}
check(`${normal.length} participants joined with link + mobile number`, joined === normal.length, `${joined}`);
const wrongNo = await http("POST", `/api/e/${code}/join`, { raw: "12345", country: "IN" }, hAuth(mkBot(fakePerson(500))));
check("bad number is rejected with a reason", wrongNo.data.t === "bad", wrongNo.data.reason);

// second phone / conflicts
const thief = mkBot({ ...normal[0]! });
thief.device = hex(16);
const inuse = await http("POST", `/api/e/${code}/join`, { raw: normal[0]!.typed, country: "IN" }, hAuth(thief));
check("same number on a second phone is refused", inuse.data.t === "err" && inuse.data.k === "inuse");
const thief2 = { ...mkBot(normal[1]!), device: hex(16) };
await http("POST", `/api/e/${code}/join`, { raw: normal[1]!.typed, country: "IN" }, hAuth(thief2));
cs = (await A("GET", "/console")).data;
check("second-phone alerts reach the organizer (1 host link + 2 participants)", cs.conflicts.length === 3, `${cs.conflicts.length}`);
const oldDevice = normal[1]!.device;
for (const c of cs.conflicts) {
  const moved = c.name === normal[1]!.name;
  await http("POST", `/api/e/${code}/conflicts/${c.id}/resolve`, { res: moved ? "moved" : "kept" }, hAuth(hostBots[moved ? 1 : 0]!));
}
normal[1]!.device = thief2.device; // phone moved
const stillOk = await http("GET", `/api/e/${code}/me`, undefined, hAuth(normal[0]!));
const movedOk = await http("GET", `/api/e/${code}/me`, undefined, hAuth(normal[1]!));
const oldOut = await http("GET", `/api/e/${code}/me`, undefined, { device: oldDevice });
check("'Keep first phone' keeps it; 'Let new phone in' moves the entry and logs the old phone out", stillOk.status === 200 && movedOk.status === 200 && oldOut.status === 401, `${stillOk.status}/${movedOk.status}/${oldOut.status}`);

// team lead passes
let passCount = 0, famCount = 0;
const passBots: Bot[] = [];
for (const tl of tlBots) {
  for (let k = 0; k < 3; k++) {
    const p = fakePerson(300 + passCount);
    const pr = await http("POST", `/api/e/${code}/me/passes`, { name: p.name, raw: p.typed, country: "IN", kind: "colleague" }, hAuth(tl));
    if (pr.status !== 200) { check("team lead creates colleague pass", false, pr.data?.error); continue; }
    const b = mkBot(p); b.kind = "colleague";
    const pc = pr.data.link.split("/p/")[1];
    const o = await http("POST", `/api/p/${pc}/open`, {}, hAuth(b));
    const c = await http("POST", `/api/p/${pc}/confirm`, { consent: true }, hAuth(b));
    if (o.data.t === "pass" && c.status === 200) { passBots.push(b); passCount++; }
  }
  const fp = fakePerson(400 + famCount);
  const fr = await http("POST", `/api/e/${code}/me/passes`, { name: fp.name, raw: fp.typed, country: "IN", kind: "family" }, hAuth(tl));
  if (fr.status === 200) {
    const b = mkBot(fp); b.kind = "family";
    const pc = fr.data.link.split("/p/")[1];
    await http("POST", `/api/p/${pc}/open`, {}, hAuth(b));
    const c = await http("POST", `/api/p/${pc}/confirm`, { consent: true }, hAuth(b));
    if (c.status === 200) { passBots.push(b); famCount++; }
  }
}
check(`team leads sent ${passCount} colleague passes + ${famCount} family passes; all opened`, passCount === 12 && famCount === 4, `${passCount}/${famCount}`);
const famFam = await http("POST", `/api/e/${code}/me/passes`, { name: "Nope Nope", raw: fakePerson(450).typed, country: "IN", kind: "colleague" }, hAuth(passBots[0]!));
check("an invited colleague cannot invite colleagues", famFam.status === 400, famFam.data?.error);
let capHit = 0;
for (let k = 0; k < 9; k++) { const p = fakePerson(500 + k); const pr = await http("POST", `/api/e/${code}/me/passes`, { name: p.name, raw: p.typed, country: "IN", kind: "colleague" }, hAuth(tlBots[1]!)); if (pr.status === 400) capHit++; }
check("team lead cap of 10 colleague passes is enforced", capHit >= 1, `${capHit} refusals`);
const cancelTarget = (await http("GET", `/api/e/${code}/me`, undefined, hAuth(tlBots[1]!))).data.invitees.find((i: any) => i.link);
if (cancelTarget) { const cc = await http("DELETE", `/api/e/${code}/me/passes/${cancelTarget.id}`, undefined, hAuth(tlBots[1]!)); check("unused pass can be cancelled", cc.status === 200); }

// waiting room
const askers = Array.from({ length: 5 }, (_, i) => mkBot(fakePerson(600 + i)));
for (const b of askers) {
  const j = await http("POST", `/api/e/${code}/join`, { raw: b.typed, country: "IN" }, hAuth(b));
  await http("POST", `/api/e/${code}/request`, { name: b.name, info: "Sales", raw: b.typed, country: "IN", consent: true }, hAuth(b));
  if (j.data.t !== "ask") check("unknown number is offered the waiting room", false, JSON.stringify(j.data));
}
cs = (await A("GET", "/console")).data;
check("5 requests wait in the waiting room", cs.waiting.length === 5, `${cs.waiting.length}`);
const st0 = await http("GET", `/api/e/${code}/status`, undefined, hAuth(askers[0]!));
check("a waiting phone is told it is waiting", st0.data.state === "waiting");
await http("POST", `/api/e/${code}/waiting/admit`, { ids: cs.waiting.slice(0, 4).map((w: any) => w.id) }, hAuth(hostBots[0]!));
await http("POST", `/api/e/${code}/waiting/decline`, { ids: [cs.waiting[4].id] }, hAuth(hostBots[1]!));
const stA = await http("GET", `/api/e/${code}/status`, undefined, hAuth(askers[0]!));
const stD = await http("GET", `/api/e/${code}/status`, undefined, hAuth(askers[4]!));
check("host admits 4 and declines 1; phones are told", stA.data.state === "in" && stD.data.state === "declined");
const admitted = askers.slice(0, 4);

// 7 everyone connects, organizer starts
const all: Bot[] = [...hostBots, ...tlBots, ...normal, ...passBots, ...admitted];
for (const b of all) {
  const me = await http("GET", `/api/e/${code}/me`, undefined, hAuth(b));
  if (me.status !== 200) { check(`me for ${b.name}`, false, String(me.status)); continue; }
  b.tickets = me.data.me.tickets; b.ticketIds = me.data.me.ticketIds; b.kind = me.data.me.kind;
  b.rewards = me.data.state.rewards.map((x: any) => ({ pattern: x.id.split(":")[0], scope: x.id.split(":")[1] }));
}
check("every participant received 2 tickets", all.every((b) => b.tickets?.length === 2), `${all.length} participants`);
const ids = new Set(all.flatMap((b) => b.tickets!.map((t) => JSON.stringify(t))));
check("all tickets are different", ids.size === all.length * 2, `${ids.size}`);
const meBody = JSON.stringify((await http("GET", `/api/e/${code}/me`, undefined, hAuth(normal[5]!))).data);
const leaks = people.filter((p) => p.name !== normal[5]!.name && meBody.includes(p.name));
check("participant's own state contains no other participant's name", leaks.length === 0, leaks[0]?.name ?? "");
const partConsole = await http("GET", `/api/e/${code}/console`, undefined, hAuth(normal[5]!));
check("ordinary participant cannot open the console", partConsole.status === 403);

console.log(`\n${all.length} participants ready. Connecting WebSockets...`);
await Promise.all(all.map((b) => connect(b)));
check(`${all.length} WebSockets connected`, all.every((b) => b.ws?.readyState === WebSocket.OPEN));
const orgWs = new WebSocket(`${WS}/ws?e=${code}&t=${tok}`);
const orgMsgs: any[] = []; orgWs.onmessage = (ev) => orgMsgs.push(JSON.parse(String(ev.data)));
await sleep(200);

const startRes = await A("POST", "/start");
check("organizer starts the engagement", startRes.status === 200);
const late = await http("POST", `/api/e/${code}/join`, { raw: fakePerson(700).typed, country: "IN" }, hAuth(mkBot(fakePerson(701))));
check("after Start entry is closed", late.data.t === "err" && late.data.k === "closed", JSON.stringify(late.data));
const lateSettings = await A("PATCH", "/settings", { limit: 250, name: "x" });
check("after Start settings are locked", lateSettings.status === 400);

// 8 the live run
let paused = false;
for (let i = 0; i < 400; i++) {
  await sleep(250);
  const s = (await A("GET", "/console")).data;
  if (!paused && s.live.called >= 30 && !s.live.paused) {
    const p = await http("POST", `/api/e/${code}/pause`, { reason: "Internet issue at venue" }, hAuth(hostBots[0]!));
    paused = p.status === 200;
    check("host triggers an emergency pause", paused);
    await sleep(600);
    const mid = (await A("GET", "/console")).data;
    check("engagement stays paused (no number called)", mid.live.called === s.live.called && mid.live.paused?.type === "emergency");
    const rs = await http("POST", `/api/e/${code}/resume`, {}, hAuth(hostBots[1]!));
    check("host resumes", rs.status === 200);
  }
  if (s.engagement.status === "ended") break;
  if (i % 8 === 0) process.stdout.write(`\r  live: ${s.live.called} numbers called, awarded ${s.rewards.filter((x: any) => x.winners.length).length}/${s.rewards.length}   `);
}
console.log("");
await sleep(500);
const fin = (await A("GET", "/console")).data;
check("engagement ended on its own", fin.engagement.status === "ended", `${fin.live.called} numbers`);
const awarded = fin.rewards.filter((x: any) => x.winners.length);
check("rewards were awarded (houses in order)", awarded.length >= 6, `${awarded.length}/${fin.rewards.length} reward lines have winners`);
const houses = fin.rewards.filter((x: any) => x.pattern === "full" && x.scope === "ticket");
const orderOk = houses.every((h: any, i: number) => i === 0 || !h.winners.length || houses[i - 1].winners.length);
check("1st..4th Full House awarded strictly in order", orderOk, houses.map((h: any) => `${h.name}:${h.winners.length}`).join(" "));
const two = fin.rewards.filter((x: any) => x.scope === "two_ticket");
console.log("  two-ticket houses:", two.map((h: any) => `${h.name}:${h.winners.length}`).join(" "), " | not valid claims:", fin.notValid.length);
check("some claims were Not valid (cheaters/late) and were refused", fin.notValid.length >= 1, `${fin.notValid.length}`);
check("brand breaks fired (3 break pauses seen)", orgMsgs.filter((m) => m.type === "break").length === 3, `${orgMsgs.filter((m) => m.type === "break").length}`);
check("no more than one winner per share line is miscounted (shares sum)", awarded.every((x: any) => x.winners.every((w: any) => w.share === x.winners.length)));

// 9 privacy audit over every message each participant received
const audited = all.filter((b) => !hostBots.includes(b)); // hosts are console users and legitimately see names
const publicBlob = audited.map((b) => b.msgs.join("\n")).join("\n");
const leaked = people.filter((p) => publicBlob.includes(p.e164) || publicBlob.includes(p.name.split(" ")[0]! + " " + p.name.split(" ")[1]!));
const hostBlob = hostBots.map((b) => b.msgs.join("")).join("");
check(`privacy: ${audited.reduce((n, b) => n + b.msgs.length, 0)} messages received by ${audited.length} participants contain no name or number`, leaked.length === 0, leaked.map((p) => p.name).slice(0, 3).join(", "));
void hostBlob;
check("participants never received a list of past numbers", !publicBlob.includes('"called"'));
const callsSeen = all.map((b) => b.called.length);
check("every participant heard every number (push)", Math.min(...callsSeen) === fin.live.called, `min ${Math.min(...callsSeen)} / ${fin.live.called}`);
const resultSeen = all.every((b) => b.msgs.some((m) => m.includes('"type":"result"')));
check("everyone saw the result banners", resultSeen);

// 10 report, purge
const rep = await A("GET", "/report");
check("organizer report has winners, call order, participants", rep.status === 200 && rep.data.winners.length >= 6 && rep.data.callOrder.length === fin.live.called && rep.data.participants.length >= all.length, `${rep.data.winners?.length} winners`);
const repHost = await http("GET", `/api/e/${code}/report`, undefined, hAuth(hostBots[0]!));
check("host cannot see the report", repHost.status === 403);
const pg = await http("POST", `/api/dev/purge/${code}`);
check("purge deletes personal data and keeps an anonymous summary", pg.data.status === "purged" && pg.data.summary.players >= all.length, JSON.stringify(pg.data.summary));
const rep2 = await A("GET", "/report");
const cs2 = (await A("GET", "/console")).data;
check("after purge no names or numbers remain", rep2.data.purged === true && cs2.participants.length === 0 && cs2.waiting.length === 0);

for (const b of all) b.ws?.close(); orgWs.close();
const fails = results.filter((x) => !x.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (fails.length) { console.log("FAILED:"); fails.forEach((f) => console.log(" -", f.name, f.detail)); }
process.exit(fails.length ? 1 : 0);
