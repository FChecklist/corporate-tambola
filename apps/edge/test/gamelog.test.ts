// The game log: the vital details of one game, live while it runs and saved when it ends; tickets by number only; Organizer / Host / AI read it, a Co-host sees only their part; it survives the 20-hour
// deletion of the players' details and is gone with the game after 365 days.
import { beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";
import { cfgOfRow, eraseEverything, erasePersonal } from "../src/lifecycle";
import { saveGameLog, noteReportSent } from "../src/gamelog";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400, AT = T + 2 * 3_600_000;
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const ORG = "11".repeat(32);
const kv = (): KV => ({ get: async (k) => (raw.query("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} });
const SECRET_WORDS = /Zainab|Secret|98100000|zainab@|ctk_|cth_|cta_|ctc_/;
async function game(id = "GL-1") {
  const s = await j(await call("POST", "/api/start", { email: "boss@acme.com" })); const o = { h: { "x-organizer": s.token as string }, ai: s.aiKey as string };
  expect((await call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, name: "Diwali party" }, o.h)).status).toBe(200);
  await call("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.h); raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id);
  expect((await call("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret(ORG) }, o.h)).status).toBe(200);
  for (let i = 1; i <= 3; i++) expect((await call("POST", `/api/z/${id}/join`, { phone: `981000000${i}`, name: i === 1 ? "Zainab Secret" : "P" + i })).status).toBe(200);
  return o;
}
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" } as any; });

describe("the live game log (the console's vital details)", () => {
  test("people joined, prizes won so far (prize, TICKET number, call number, time), pauses with who, setting changes with who; no name, number or key anywhere", async () => {
    const o = await game();
    raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES('GL-1',1,'early5',1,2,36,?, 'phones')").run(AT + 600_000);
    raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES('GL-1',1,'full',1,3,80,?, 'phones')").run(AT + 900_000);
    await call("PATCH", "/api/z/GL-1/settings", { callSeconds: 12 }, o.h, T + 1000);
    const f = (await readPublished(kv(), "GL-1"))!;
    const t = AT + 100_000;
    const m = signControlWithSecret(ORG, nextMessage(f, roundAt(t), { action: "pause", pauseForRounds: 100 }));
    expect((await call("POST", "/api/z/GL-1/control", { message: m }, {}, t)).status).toBe(200);
    const log = await j(await call("GET", "/api/z/GL-1/gamelog", undefined, o.h, t + 60_000));
    expect(log.people).toMatchObject({ joined: 3, waiting: 0 });
    expect(log.prizes.map((p: any) => [p.prize, p.ticket, p.callNo])).toEqual([["Early Five", 2, 37], ["Full House", 3, 81]]);
    expect(log.prizes[0].atMs).toBe(AT + 600_000);
    expect(log.pauses).toHaveLength(1); expect(log.pauses[0]).toMatchObject({ by: "The Organizer" });
    expect(log.changes.map((c: any) => c.what).join("|")).toMatch(/Speed changed/);
    expect(log.changes.every((c: any) => c.who)).toBe(true);
    expect(log.warnings.join(" ")).toMatch(/paused/);
    expect(log.saved).toBe(false);
    expect(JSON.stringify(log)).not.toMatch(SECRET_WORDS);
    expect(log.schedule).toMatchObject({ callSeconds: 12, rounds: 1, manualStart: false });
  });
  test("the Organizer, the Organizer's AI and the platform read it; a Co-host reads it too (ticket numbers only); a player and a stranger do not", async () => {
    const o = await game();
    expect((await call("GET", "/api/z/GL-1/gamelog", undefined, { "x-organizer": o.ai })).status).toBe(200);
    expect((await call("GET", "/api/z/GL-1/gamelog", undefined, { "x-organizer": "plat" })).status).toBe(200);
    const co = (await j(await call("POST", "/api/org/cohost", { label: "Ravi", phone: "9876500001", e: "GL-1" }, o.h))).cohostKey as string;
    { const cr = await call("GET", "/api/z/GL-1/gamelog", undefined, { "x-organizer": co }); expect(cr.status).toBe(200); expect(JSON.stringify(await cr.json())).not.toMatch(/9876500|Ravi|Asha/); } // a Co-host reads the live panels, never presses anything
    expect((await call("POST", "/api/z/GL-1/control", { message: {} }, { "x-organizer": co })).status).toBe(403);
    expect((await call("GET", "/api/z/GL-1/gamelog")).status).toBe(403);
  });
});

describe("claims are part of the saved log", () => {
  test("accepted, wrong and too-late claims are in the log by ticket number, and stay after the claim tables are emptied (the saved copy)", async () => {
    const o = await game("GL-CL");
    const pids = (raw.query("SELECT pid, seq FROM seat WHERE eid='GL-CL' ORDER BY seq").all() as any[]);
    const t0 = Date.UTC(2026, 9, 1, 12, 0, 0);
    raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES('GL-CL',?,?,1,4,?)").run(pids[0].pid, "early5", t0);
    raw.prepare("INSERT INTO bogey(eid,pid,pattern,round,at_ms) VALUES('GL-CL',?,?,1,?)").run(pids[1].pid, "top", t0 + 1000);
    raw.prepare("INSERT INTO kv(k,v) VALUES('claimlate/GL-CL',?)").run(JSON.stringify([{ t: pids[2].seq, p: "mid", at: t0 + 2000 }]));
    const gl = await j(await call("GET", "/api/z/GL-CL/gamelog", undefined, o.h));
    expect(gl.claims.map((c: any) => [c.ticket, c.outcome])).toEqual([[pids[0].seq, "accepted"], [pids[1].seq, "wrong"], [pids[2].seq, "too late"]]);
    expect(gl.claims[0].afterNumber).toBe(5); expect(JSON.stringify(gl.claims)).not.toMatch(/Zainab|98100/);
  });
});

describe("a claim that came after the prize was already awarded", () => {
  test("the log says 'Prize already taken' with both numbers; a winner's own claim and a claim before the award stay 'accepted'", async () => {
    const o = await game("GL-TK");
    const pids = (raw.query("SELECT pid, seq FROM seat WHERE eid='GL-TK' ORDER BY seq").all() as any[]);
    const t0 = Date.UTC(2026, 9, 1, 12, 0, 0);
    raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES('GL-TK',1,'top',1,?,9,?, 'phones')").run(pids[0].seq, t0);
    raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES('GL-TK',?,?,1,9,?)").run(pids[0].pid, "top", t0);       // the winner's own claim
    raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES('GL-TK',?,?,1,9,?)").run(pids[1].pid, "top", t0 + 500);  // the same number: shares, not late
    raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES('GL-TK',?,?,1,14,?)").run(pids[2].pid, "top", t0 + 60_000); // 5 numbers later, the prize is gone
    const gl = await j(await call("GET", "/api/z/GL-TK/gamelog", undefined, o.h));
    const by = (t: number) => gl.claims.find((c: any) => c.ticket === t);
    expect(by(pids[0].seq).outcome).toBe("accepted"); expect(by(pids[1].seq).outcome).toBe("accepted");
    expect(by(pids[2].seq).outcome).toBe("prize taken"); expect(by(pids[2].seq).afterNumber).toBe(15); expect(by(pids[2].seq).takenAtNumber).toBe(10);
  });
});

describe("saved when the game ends; survives the 20-hour deletion; gone with the game", () => {
  test("after the players' details are erased the log still has the people count, the prizes with ticket numbers and the pauses; the report line follows the e-mail; the Co-host sees how it ended", async () => {
    const o = await game();
    raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES('GL-1',1,'corners',1,2,40,?, 'phones')").run(AT + 400_000);
    const e = raw.query("SELECT * FROM engagement WHERE id='GL-1'").get() as any;
    await saveGameLog(env as any, kv(), e, cfgOfRow(e), AT + 3_000_000, { endMs: AT + 2_000_000, endReason: "All prizes were awarded after 41 numbers.", numbersCalled: 41, firstNumberMs: AT + 120_000 });
    await noteReportSent(env as any, "GL-1", AT + 2_100_000);
    await erasePersonal(env as any, "GL-1", AT + 80_000_000, "test"); // 20 hours on: the players' details go
    const log = await j(await call("GET", "/api/z/GL-1/gamelog", undefined, o.h, AT + 80_000_001));
    expect(log).toMatchObject({ saved: true, endReason: "All prizes were awarded after 41 numbers.", numbersCalled: 41, endedAtMs: AT + 2_000_000, people: { joined: 3 } });
    expect(log.prizes.map((p: any) => [p.prize, p.ticket, p.callNo])).toEqual([["Four Corners", 2, 41]]);
    expect(log.report).toEqual({ state: "sent", sentMs: AT + 2_100_000 });
    expect(JSON.stringify(log)).not.toMatch(SECRET_WORDS);
    const co = (await j(await call("POST", "/api/org/cohost", { label: "Ravi", phone: "9876500001", e: "GL-1" }, o.h))).cohostKey as string;
    void co;
    const part = await j(await call("GET", "/api/z/GL-1/cohost", undefined, o.h, AT + 80_000_001));
    expect(part.ended).toMatchObject({ reason: "All prizes were awarded after 41 numbers.", numbers: 41 }); expect(JSON.stringify(part)).not.toMatch(/"prizes"|ticket/);
    await eraseEverything(env as any, "GL-1", AT + 400 * 86_400_000); // 365 days on
    expect(raw.query("SELECT COUNT(*) AS c FROM kv WHERE k='glog/GL-1'").get()).toEqual({ c: 0 });
  });
});

describe("the lifecycle saves it when the game ends", () => {
  test("the report pass writes the log (before the players' details go), the e-mail marks it sent, and it is still there after the 20-hour deletion", async () => {
    const { lifecycleTick, endBoundMs, PURGE_AFTER_MS } = await import("../src/lifecycle");
    const { sentReports } = await import("../src/pay");
    sentReports.length = 0;
    const roundOf = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
    expect((await call("POST", "/api/z", { id: "GL-LC", startRound: roundOf(T - 2 * 3_600_000), callSeconds: 6, cap: 100 }, { "x-organizer": "plat" })).status).toBe(200);
    for (let i = 1; i <= 3; i++) await call("POST", "/api/z/GL-LC/join", { phone: "9876" + String(500000 + i), name: "Guest " + i, device: String(i).padStart(32, "0") }, {}, T - 3 * 3_600_000);
    raw.prepare("INSERT INTO kv(k,v) VALUES(?,?)").run("contact/GL-LC", JSON.stringify({ email: "boss@acme.com", phone: "9811122233" }));
    const end = await endBoundMs(env as any, raw.query("SELECT * FROM engagement WHERE id='GL-LC'").get());
    let guard = 0; while (!sentReports.length && guard++ < 20) await lifecycleTick(env as any, end + 5 * 60_000);
    expect(sentReports.length).toBe(1);
    const g = JSON.parse((raw.query("SELECT v FROM kv WHERE k='glog/GL-LC'").get() as any).v);
    expect(g).toMatchObject({ saved: true, people: { joined: 3 }, report: { state: "sent" } }); expect(g.endReason).toMatch(/numbers|prize/i); expect(JSON.stringify(g)).not.toMatch(/Guest [123]|98765000/);
    await lifecycleTick(env as any, end + PURGE_AFTER_MS + 3_600_000);
    expect(raw.query("SELECT COUNT(*) AS c FROM participant WHERE eid='GL-LC'").get()).toEqual({ c: 0 }); // the players' details are gone ...
    expect(raw.query("SELECT COUNT(*) AS c FROM kv WHERE k='glog/GL-LC'").get()).toEqual({ c: 1 }); // ... the log stays
  });
});

describe("the Lucky Draw is in the game log", () => {
  test("every lucky draw the organizer chose is listed, drawn or not, with the winning ticket numbers once drawn", async () => {
    const s = await j(await call("POST", "/api/start", { email: "boss@acme.com" })); const o = { "x-organizer": s.token as string };
    expect((await call("POST", "/api/z", { id: "GL-LK", startRound: START, callSeconds: 12, cap: 100, breaks: [{ after: 30, seconds: 60, kind: "lucky", title: "Gift hamper", winners: 3 }] }, o)).status).toBe(200);
    let log = await j(await call("GET", "/api/z/GL-LK/gamelog", undefined, o));
    expect(log.lucky).toEqual([{ title: "Gift hamper", winners: 3, drawn: false, tickets: [] }]);
    for (const seat of [4, 9, 31]) raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES('GL-LK',1,'lucky',1,?,29,?, 'phones')").run(seat, AT + 400_000);
    log = await j(await call("GET", "/api/z/GL-LK/gamelog", undefined, o));
    expect(log.lucky).toEqual([{ title: "Gift hamper", winners: 3, drawn: true, tickets: [4, 9, 31] }]);
    expect(log.prizes.filter((p: any) => /Gift hamper/.test(p.prize)).map((p: any) => p.ticket).sort((a: number, b: number) => a - b)).toEqual([4, 9, 31]);
  });
});
