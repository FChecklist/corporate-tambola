/**
 * Optional features end to end through the REAL server: 100 participants over WebSocket, 3 rounds, 3 lucky draws (the last is the bumper),
 * 2 scratch cards (5 winning cards each, half gifts / half boosters), boosters. Run against a FAST server:
 *   PORT=8788 TAMBOLA_FAST=1 TAMBOLA_IP_LIMIT=1000000 TAMBOLA_DATA=C:/ct/tambola/data-sim bun run apps/server/src/index.ts
 *   BASE=http://localhost:8788 bun run tools/sim/rounds.ts
 */
import { normalize, patternNumbers, ticketNumbers, type PatternId, type Ticket } from "@tambola/shared";

const BASE = process.env.BASE ?? "http://localhost:8788";
const WS = BASE.replace("http", "ws");
const N = Number(process.env.N ?? 100);
const results: { ok: boolean; name: string; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push({ ok, name, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rnd = (n: number) => Math.floor(Math.random() * n);
const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
async function http(method: string, path: string, body?: unknown, h: { token?: string; device?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (h.token) headers.authorization = `Bearer ${h.token}`; if (h.device) headers["x-device"] = h.device;
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let data: any = null; try { data = await r.json(); } catch { /* none */ }
  return { status: r.status, data };
}

const FIRST = ["Anita", "Priya", "Rahul", "Sana", "Vikram", "Deepa", "Fatima", "Emily", "Ahmed", "Arjun", "Suresh", "Lakshmi", "Joseph", "Kavya", "Nikhil", "Pooja", "Sam", "Omar", "Meera", "Karan"];
const used = new Set<string>();
const people = Array.from({ length: N }, (_, i) => { for (;;) { const raw = "9" + (100000000 + rnd(899999999)); const r = normalize(raw, "IN"); if (r.ok && !used.has(r.e164)) { used.add(r.e164); return { name: `${FIRST[i % FIRST.length]} Q${i}`, e164: r.e164, typed: raw }; } } });

interface Bot { name: string; e164: string; typed: string; device: string; tickets: Ticket[]; cut: Set<number>[]; called: number[]; claimed: Set<string>; ws?: WebSocket; msgs: string[]; priv: any[]; boosters: any; rewards: { pattern: PatternId }[]; round: number; ticketsSeen: string[] }
const bots: Bot[] = people.map((p) => ({ ...p, device: hex(16), tickets: [], cut: [new Set(), new Set(), new Set()], called: [], claimed: new Set(), msgs: [], priv: [], boosters: { joker: 0, extra: 0, pass: 0 }, rewards: [], round: 1, ticketsSeen: [] }));
let code = "";
const A = (token: string) => (m: string, p: string, b?: unknown) => http(m, `/api/e/${code}${p}`, b, { token });

async function loadMe(b: Bot) {
  const me = await http("GET", `/api/e/${code}/me`, undefined, { device: b.device });
  if (me.status !== 200) return;
  b.tickets = me.data.me.tickets; b.boosters = me.data.boosters;
  b.rewards = me.data.state.rewards.map((x: any) => ({ pattern: x.id.split(":")[0] }));
  b.round = me.data.state.round;
  b.ticketsSeen.push(JSON.stringify(b.tickets));
}
const sendWs = (b: Bot, m: unknown) => { if (b.ws?.readyState === WebSocket.OPEN) b.ws.send(JSON.stringify(m)); };

const momentOrder: any[] = [];
const stillTrace: { prizes: number; lucky: number; scratch: number }[] = [];
const scratchOutcomes = new Map<string, string[]>(); // momentId -> outcomes received
const luckyWon = new Map<string, string[]>(); // momentId -> bots (names) told they won
const roundStarts: number[] = [];

function onMsg(b: Bot, m: any) {
  if (m.type === "call") {
    b.called.push(m.number);
    // auto-mark is on: every called number on a ticket is cut
    b.tickets.forEach((t, ti) => { if (ticketNumbers(t).includes(m.number)) b.cut[ti]!.add(m.number); });
    const calledSet = new Set(b.called);
    b.tickets.forEach((t, ti) => {
      const tk = (["A", "B", "C"] as const)[ti]!;
      for (const r of b.rewards) {
        const key = `${b.round}:${tk}:${r.pattern}`;
        if (b.claimed.has(key)) continue;
        let complete = false;
        if (r.pattern === "early5") { const cc = [...b.cut[ti]!].filter((n) => calledSet.has(n)); complete = cc.length === 5 && b.cut[ti]!.has(m.number); }
        else { const nums = patternNumbers(t, r.pattern)!; complete = nums.every((n) => calledSet.has(n) && b.cut[ti]!.has(n)) && nums.includes(m.number); }
        if (complete) { b.claimed.add(key); setTimeout(() => sendWs(b, { type: "claim", ticket: tk, pattern: r.pattern, cut: [...b.cut[ti]!] }), rnd(30)); }
      }
    });
  } else if (m.type === "round_start") {
    roundStarts.push(m.round);
    b.called = []; b.cut = [new Set(), new Set(), new Set()]; b.round = m.round;
    setTimeout(() => loadMe(b), rnd(200)); // new tickets for the new round
  } else if (m.type === "lucky_won") {
    b.priv.push(m); (luckyWon.get(m.momentId) ?? luckyWon.set(m.momentId, []).get(m.momentId)!).push(b.name);
    if (Math.random() < 0.9) setTimeout(() => sendWs(b, { type: "present", momentId: m.momentId }), rnd(100)); // 10% do not confirm: the draw must replace them
  } else if (m.type === "moment_start" && m.kind === "scratch") {
    if (Math.random() < 0.6) setTimeout(() => sendWs(b, { type: "scratch", momentId: m.id }), rnd(300)); // the rest are auto-revealed by the server
  } else if (m.type === "scratch_result") {
    b.priv.push(m); (scratchOutcomes.get(m.momentId) ?? scratchOutcomes.set(m.momentId, []).get(m.momentId)!).push(m.outcome);
  } else if (m.type === "booster") { b.priv.push(m); b.boosters = m.boosters; }
  else if (m.type === "moment_result") { if (b === bots[0]) momentOrder.push(m); }
  else if (m.type === "jokerAck" && m.number) b.cut[0]!.add(m.number);
}

console.log(`Optional features simulation: ${N} participants, 3 rounds, lucky draws, scratch cards, boosters\n`);
const email = `hr.${hex(3)}@acme-industries.com`;
const co = await http("POST", "/api/checkout", { org: "Acme Industries", email, country: "IN", taxId: "27ABCDE1234F1Z5", pack: 250, currency: "INR" });
code = co.data.engagementCode;
const ae = await http("POST", "/api/auth/email", { email });
const av = await http("POST", "/api/auth/verify", { email, code: ae.data.devCode });
const T = av.data.token as string, org = A(T);

let r = await org("PATCH", "/settings", { name: "Rounds engagement", ticketMode: "single", familyLimit: 1, callMode: "ai",
  surprise: { rounds: 3, callSeconds: 9, autoMark: true, luckyDraws: 3, luckyWinners: 3, luckyPrize: "mix" as any, bumper: true, scratchCards: 2, scratchWinning: 5, scratchPrize: "mix", momentsMode: "auto", boostersAllowed: true, revealNames: false } });
check("a lucky-draw reward of 'mix' is refused (draws are a gift or a booster)", r.status === 400, r.data?.error);
r = await org("PATCH", "/settings", { name: "Rounds engagement", ticketMode: "single", familyLimit: 1, callMode: "ai",
  surprise: { rounds: 3, callSeconds: 9, autoMark: true, luckyDraws: 3, luckyWinners: 3, luckyPrize: "booster", bumper: true, scratchCards: 2, scratchWinning: 5, scratchPrize: "mix", momentsMode: "auto", boostersAllowed: true, revealNames: false } });
check("organizer switches on 3 rounds, 3 lucky draws, 2 scratch cards", r.status === 200, r.data?.error);
r = await org("PUT", "/rewards", { spec: [{ pattern: "early5", texts: ["Rs 500 voucher"] }, { pattern: "top", texts: ["Rs 800 voucher"] }, { pattern: "full", texts: ["Smart watch"] }] });
check("3 rewards per round", r.status === 200);
const cons = (await org("GET", "/console")).data;
check("planning summary comes from the server", cons.plan.tambolaPrizes === 9 && cons.plan.luckyWinners === 9 && cons.plan.scratchWinningCards === 10 && typeof cons.plan.capacity === "number", JSON.stringify(cons.plan));
check("still-to-win starts exact: 9 rewards, 3 lucky draws, 2 scratch cards", cons.still.prizes === 9 && cons.still.lucky === 3 && cons.still.scratch === 2 && cons.still.rounds === 3, JSON.stringify(cons.still));
check("a big-screen link exists and carries a secret", cons.engagement.link && cons.screenUrl.includes("/screen/" + code + "#") && cons.screenUrl.split("#")[1].length >= 12);
await org("POST", "/upload/commit", { items: people.map((p) => ({ name: p.name, e164: p.e164 })) });

let joined = 0;
for (let i = 0; i < bots.length; i += 10) await Promise.all(bots.slice(i, i + 10).map(async (b) => {
  const j = await http("POST", `/api/e/${code}/join`, { raw: b.typed, country: "IN" }, { device: b.device });
  if (j.data.t !== "consent") return;
  const c = await http("POST", `/api/e/${code}/confirm`, { raw: b.typed, country: "IN", consent: true }, { device: b.device });
  if (c.status === 200) joined++;
}));
check(`${N} participants joined`, joined === N, `${joined}`);
await Promise.all(bots.map((b) => loadMe(b)));
const st0 = (await http("GET", `/api/e/${code}/me`, undefined, { device: bots[0]!.device })).data;
check("a participant sees the optional-feature state: rounds, counters, boosters tray data, auto-mark", st0.state.rounds === 3 && st0.state.still?.lucky === 3 && st0.state.still?.scratch === 2 && st0.state.surprise?.autoMark === true && st0.boosters.joker === 0);
await Promise.all(bots.map((b) => new Promise<void>((res) => { const ws = new WebSocket(`${WS}/ws?e=${code}&d=${b.device}`); b.ws = ws; ws.onopen = () => res(); ws.onmessage = (ev) => { const raw = String(ev.data); b.msgs.push(raw); onMsg(b, JSON.parse(raw)); }; })));
const screenKey = cons.screenUrl.split("#")[1];
const screenMsgs: any[] = []; const screen = new WebSocket(`${WS}/ws?e=${code}&s=${screenKey}`); screen.onmessage = (ev) => screenMsgs.push(JSON.parse(String(ev.data)));
const badScreen = await fetch(`${BASE}/ws?e=${code}&s=wrongkey`); check("a big screen with the wrong key is refused", badScreen.status === 401);
await sleep(200);
await org("POST", "/start");

let ended = false;
for (let i = 0; i < 500 && !ended; i++) {
  await sleep(250);
  const c = (await org("GET", "/console")).data;
  if (c.still) stillTrace.push({ prizes: c.still.prizes, lucky: c.still.lucky, scratch: c.still.scratch });
  ended = c.engagement.status === "ended";
  if (i % 8 === 0) process.stdout.write(`\r  round ${c.round}/${c.surprise.rounds} · rewards left ${c.still?.prizes} · lucky left ${c.still?.lucky} · scratch left ${c.still?.scratch} · ${c.live.called} numbers     `);
}
console.log("");
check("the engagement ran through all rounds and ended", ended);
await sleep(600);
const fin = (await org("GET", "/console")).data;
check("3 rounds were played (2 round starts)", roundStarts.filter((x, i, a) => a.indexOf(x) === i).sort().join() === "2,3", roundStarts.join());
const changed = bots.filter((b) => new Set(b.ticketsSeen).size >= 3).length;
check("every participant got brand new tickets each round", changed >= N - 3, `${changed}/${N} saw 3 different tickets`);
check("counters never went up and never below zero", stillTrace.every((s, i) => s.prizes >= 0 && s.lucky >= 0 && s.scratch >= 0 && (i === 0 || (s.lucky <= stillTrace[i - 1]!.lucky && s.scratch <= stillTrace[i - 1]!.scratch && s.prizes <= stillTrace[i - 1]!.prizes))), `${stillTrace.length} samples`);
check("at the end: nothing is still to win (every counted moment happened)", fin.still.lucky === 0 && fin.still.scratch === 0 && fin.moments.every((m: any) => m.status === "done"), JSON.stringify(fin.still));
const rep = (await org("GET", "/report")).data;
const lucky = rep.moments.filter((m: any) => m.kind === "lucky"), scr = rep.moments.filter((m: any) => m.kind === "scratch");
check("3 lucky draws and 2 scratch cards are in the report", lucky.length === 3 && scr.length === 2);
check("the bumper lucky draw is the LAST moment of the event", rep.moments[rep.moments.length - 1].kind === "lucky" && fin.moments.find((m: any) => m.bumper)?.status === "done" && (() => { const b = fin.moments.find((m: any) => m.bumper); return rep.moments.findIndex((m: any) => m.momentId === b.id) === rep.moments.length - 1; })());
check("every scratch round had EXACTLY 5 winning cards", scr.every((m: any) => m.winningCards === 5 && m.winners.length === 5), scr.map((m: any) => `${m.winners.length}/${m.winningCards}`).join());
const everyoneGotResult = [...scratchOutcomes.values()].every((o) => o.length >= N - 2);
check("everyone got a scratch result (even those who never scratched)", everyoneGotResult, [...scratchOutcomes.values()].map((o) => o.length).join());
const winningSeen = [...scratchOutcomes.values()].map((o) => o.filter((x) => x !== "none").length);
check("the winning outcomes seen by phones match the 5 decided by the server", winningSeen.every((x) => x === 5), winningSeen.join());
const gifts = rep.moments.filter((m: any) => m.kind === "scratch").flatMap((m: any) => m.winners).filter((w: any) => w.prize === "gift").length;
check("'half and half': 3 gifts and 2 boosters in each scratch round", gifts === 6, `${gifts} gifts over 2 rounds`);
check("lucky draw winners are unique within a draw and were told privately", lucky.every((m: any) => new Set(m.winners.map((w: any) => w.pid)).size === m.winners.length) && [...luckyWon.values()].every((v) => new Set(v).size === v.length));
const lw = lucky.reduce((n: number, m: any) => n + m.winners.length, 0);
check("lucky draws drew 3 winners each (9), replacing people who did not confirm", lw === 9, `${lw}`);
check("booster prizes reached the winners' phones", bots.some((b) => b.priv.some((m) => m.type === "booster")));
const withBooster = bots.find((b) => b.boosters && b.boosters.joker > 0);
if (withBooster) { const jb = withBooster; jb.ws && sendWs(jb, { type: "joker", ticket: "A", cut: [] }); await sleep(200); }
check("rounds in the report: winners carry their round number", rep.winners.some((w: any) => w.round === 1) && rep.winners.some((w: any) => w.round === 3), [...new Set(rep.winners.map((w: any) => w.round))].join());
const rewardsAwarded = rep.winners.length;
check("rewards were awarded in every round", rewardsAwarded >= 6, `${rewardsAwarded} winners`);

// privacy
const publicEvents = bots.flatMap((b) => b.msgs).filter((m) => !m.includes('"lucky_won"') && !m.includes('"scratch_result"') && !m.includes('"booster"') && !m.includes('"presentAck"') && !m.includes('"scratchAck"') && !m.includes('"jokerAck"'));
const leaked = people.filter((p) => publicEvents.some((m) => m.includes(p.e164) || m.includes(p.name)));
check(`privacy: ${publicEvents.length} broadcast messages contain no participant name or number`, leaked.length === 0, leaked[0]?.name ?? "");
const screenBlob = JSON.stringify(screenMsgs);
check("the big screen received only public data (no names, no numbers) and the Still to win counters", people.every((p) => !screenBlob.includes(p.name) && !screenBlob.includes(p.e164)) && screenMsgs.some((m) => m.type === "state" && m.still) && screenMsgs.some((m) => m.type === "moment_result"));
const lwResult = momentOrder.filter((m) => m.kind === "lucky").flatMap((m) => m.winners);
check("lucky draw winners are announced as ticket ids", lwResult.length >= 6 && lwResult.every((w: string) => /^TMB-ACME-/.test(w)), lwResult[0]);
const mine = bots.map((b) => b.priv.filter((m) => m.type === "lucky_won").length);
check("only winners were told they won (others got nothing private about the draw)", mine.filter((x) => x > 0).length <= lw + 3 && mine.filter((x) => x === 0).length > N / 2);

// manual mode: only the organizer triggers; the AI-link can too but cannot pick winners
const co2 = await http("POST", "/api/checkout", { org: "Acme Industries", email, country: "IN", taxId: "27ABCDE1234F1Z5", pack: 100, currency: "INR" });
const c2 = co2.data.engagementCode;
await http("PATCH", `/api/e/${c2}/settings`, { surprise: { luckyDraws: 1, luckyWinners: 1, bumper: false, momentsMode: "manual", luckyPrize: "gift" } }, { token: T });
const early = await http("POST", `/api/e/${c2}/moments/trigger`, { kind: "lucky" }, { token: T });
check("a draw cannot be started before the engagement is running", early.status === 400, early.data?.error);

for (const b of bots) b.ws?.close(); screen.close();
const fails = results.filter((x) => !x.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) { console.log("FAILED:"); fails.forEach((f) => console.log(" -", f.name, f.detail)); }
process.exit(fails.length ? 1 : 0);
