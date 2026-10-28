// REHEARSALS (1.6.0): three free, sequential rehearsals per paid game; each a game of its own; the real game is never touched; the same people can use all four runs without any conflict.
import { beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(120_000);
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { AFTER_START_MSG, ALL_USED_MSG, NOT_PAID_MSG, ONE_AT_A_TIME_MSG, OVER_MSG, REHEARSAL_PEOPLE, rehearsalBlock, rehearsalSubject } from "../src/rehearsal";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400; // two hours ahead
const P = { "x-organizer": "plat" };
let env: Env; let raw: ReturnType<typeof makeD1>["raw"]; let now = T;
beforeEach(() => { const d = makeD1(); raw = d.raw; now = T; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" } as any; });
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
async function realGame(id = "REAL-1", paid = true) {
  expect((await call("POST", "/api/z", { id, startRound: START, callSeconds: 12, cap: 100 }, P)).status).toBe(200);
  if (!paid) raw.prepare("UPDATE engagement SET pack=0 WHERE id=?").run(id); // (a game made by an organizer stays at pack 0 until the payment)
  if (paid) { raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id); raw.prepare("INSERT OR IGNORE INTO kv(k,v) VALUES(?,?)").run(`pub/${id}`, String(T)); }
}
const join = async (id: string, n: number) => j(await call("POST", `/api/z/${id}/join`, { phone: "981000000" + n, name: "Guest" + n }));
const cards = async (id = "REAL-1") => j(await call("GET", `/api/z/${id}/rehearsals`, undefined, P));
const start = (id = "REAL-1", body: unknown = {}) => call("POST", `/api/z/${id}/rehearsal`, body, P);
const close = (id: string) => call("POST", `/api/z/${id}/rehearsalclose`, {}, P);
const tables = ["seat", "participant", "claim", "winner", "person", "bogey", "settled", "consent_log"];
const snapshot = (id: string) => JSON.stringify({ eng: raw.query("SELECT * FROM engagement WHERE id=?").get(id), ...Object.fromEntries(tables.map((t) => { try { return [t, raw.query(`SELECT * FROM ${t} WHERE ${t === "consent_log" ? "ref" : "eid"}=? ORDER BY 1,2`).all(id)]; } catch { return [t, null]; } })), kv: (raw.query("SELECT k, v FROM kv ORDER BY k").all() as any[]).filter((r) => r.k.endsWith("/" + id) || r.k.includes("/" + id + "/")) });

describe("the three cards", () => {
  test("before publishing and payment all three are locked with the plain sentence; after payment only the first is ready, the others wait", async () => {
    await realGame("REAL-1", false);
    let c = await cards(); expect(c.paid).toBe(false); expect(c.cards.map((x: any) => x.state)).toEqual(["locked", "locked", "locked"]); expect(c.cards[0].reason).toBe(NOT_PAID_MSG);
    const r = await start(); expect(r.status).toBe(402); expect((await j(r)).error).toBe(NOT_PAID_MSG);
    raw.prepare("UPDATE engagement SET pack=100 WHERE id='REAL-1'").run(); raw.prepare("INSERT INTO kv(k,v) VALUES('pub/REAL-1','1')").run();
    c = await cards(); expect(c.paid).toBe(true); expect(c.cards.map((x: any) => x.state)).toEqual(["ready", "locked", "locked"]); expect(c.cards[1].reason).toBe("Finish rehearsal 1 first."); expect(c.cards[2].reason).toBe("Finish rehearsal 2 first.");
    expect(JSON.stringify(c)).not.toMatch(new RegExp(String(REHEARSAL_PEOPLE))); // the number of people allowed is shown nowhere
  });
  test("a demo game (free, 10 people) is not a paid game: the cards stay locked", async () => {
    await realGame("REAL-D", true); raw.prepare("UPDATE engagement SET config=? WHERE id='REAL-D'").run(JSON.stringify({ demo: true }));
    expect((await cards("REAL-D")).paid).toBe(false); expect((await start("REAL-D")).status).toBe(402);
  });
});

describe("sequence, limits and the real start", () => {
  test("one at a time; closing counts as finished and opens the next; exactly three; none after the real start", async () => {
    await realGame();
    const r1 = await start(); expect(r1.status).toBe(200); const b1 = await j(r1); expect(b1.id).toBe("REAL-1-R1"); expect(b1.n).toBe(1);
    const again = await start(); expect(again.status).toBe(409); expect((await j(again)).error).toBe(ONE_AT_A_TIME_MSG);
    expect((await close("REAL-1-R1")).status).toBe(200);
    const c = await cards(); expect(c.cards.map((x: any) => x.state)).toEqual(["done", "ready", "locked"]);
    expect((await j(await start())).id).toBe("REAL-1-R2"); await close("REAL-1-R2");
    expect((await j(await start())).id).toBe("REAL-1-R3"); await close("REAL-1-R3");
    const fourth = await start(); expect(fourth.status).toBe(409); expect((await j(fourth)).error).toBe(ALL_USED_MSG);
    // another real game: after its start time nothing can be started
    await realGame("REAL-2"); now = T + 3 * 3_600_000;
    const late = await start("REAL-2"); expect(late.status).toBe(409); expect((await j(late)).error).toBe(AFTER_START_MSG);
    expect((await cards("REAL-2")).cards[0].reason).toBe(AFTER_START_MSG);
  });
  test("a rehearsal cannot start rehearsals; only the Organizer, a Host or the platform may start one", async () => {
    await realGame(); await start(); expect((await start("REAL-1-R1")).status).toBe(409);
    expect((await call("POST", "/api/z/REAL-1/rehearsal", {}, {})).status).toBeGreaterThanOrEqual(401);
  });
  test("a rehearsal is a game of its own: its own code, a hidden limit of people, published at once, not counted as the real game's seats", async () => {
    await realGame(); const b = await j(await start());
    const e = raw.query("SELECT * FROM engagement WHERE id=?").get(b.id) as any; expect(e.rehearsal_of).toBe("REAL-1"); expect(e.run_no).toBe(1); expect(e.cap).toBe(REHEARSAL_PEOPLE);
    expect(raw.query("SELECT 1 FROM kv WHERE k=?").get(`pub/${b.id}`)).toBeTruthy();
    const info = await j(await call("GET", `/api/z/${b.id}/info`)); expect(info.rehearsal).toMatchObject({ n: 1, realId: "REAL-1", over: false, gameId: b.id });
    expect(info.rehearsal.block).toBe(rehearsalBlock(b.id, 1)); expect(info.rehearsal.block).toContain("REHEARSAL GAME 1"); expect(info.rehearsal.block).toContain("The real game has a different link and a different game.");
    expect((await j(await call("GET", "/api/z/REAL-1/info"))).rehearsal).toBeUndefined();
  });
});

describe("the real game is never touched", () => {
  test("a whole rehearsal (people copied, joins, claims, close) leaves every row of the real game byte-identical", async () => {
    await realGame();
    for (let i = 1; i <= 3; i++) await join("REAL-1", i);
    const before = snapshot("REAL-1");
    const b = await j(await start("REAL-1", { people: "published" }));
    for (let i = 1; i <= 3; i++) { const g = await join(b.id, i); expect(g.pid).toBeTruthy(); }
    await close(b.id); await start();
    expect(snapshot("REAL-1")).toBe(before);
    const seatsReal = (raw.query("SELECT COUNT(*) c FROM seat WHERE eid='REAL-1'").get() as any).c; expect(seatsReal).toBe(3);
  });
  test("the limit is per run and never shown: the 21st person is refused kindly without the number; the real game still takes its own people", async () => {
    await realGame(); const b = await j(await start());
    for (let i = 1; i <= REHEARSAL_PEOPLE; i++) expect((await join(b.id, i)).pid).toBeTruthy();
    const over = await call("POST", `/api/z/${b.id}/join`, { phone: "9810000099", name: "One more" }); const body = await j(over);
    expect(over.status).toBeGreaterThanOrEqual(400); expect(JSON.stringify(body)).not.toMatch(new RegExp("\\b" + REHEARSAL_PEOPLE + "\\b"));
    expect((await join("REAL-1", 99)).pid).toBeTruthy();
  });
});

describe("the same people through all four runs", () => {
  test("6 people and the same phones in rehearsal 1, 2, 3 and the real game: separate tickets, seats and claims in every run, nothing inherited", async () => {
    await realGame();
    const runs = ["REAL-1-R1", "REAL-1-R2", "REAL-1-R3"];
    const pids: Record<string, string[]> = {};
    for (let k = 0; k < 3; k++) {
      const b = await j(await start("REAL-1", { people: "none" })); expect(b.id).toBe(runs[k]);
      pids[b.id] = []; for (let i = 1; i <= 6; i++) pids[b.id].push((await join(b.id, i)).pid);
      // a claim in this run is stored in this run only
      const r = await call("POST", `/api/z/${b.id}/claims`, { pid: pids[b.id][0], device: "0".repeat(32), claims: [{ pattern: "top", idx: 0 }] });
      expect([200, 409]).toContain(r.status);
      await close(b.id);
    }
    pids["REAL-1"] = []; for (let i = 1; i <= 6; i++) pids["REAL-1"].push((await join("REAL-1", i)).pid);
    for (const id of [...runs, "REAL-1"]) { expect((raw.query("SELECT COUNT(*) c FROM seat WHERE eid=?").get(id) as any).c).toBe(6); expect((raw.query("SELECT COUNT(*) c FROM participant WHERE eid=?").get(id) as any).c).toBe(6); }
    expect((raw.query("SELECT COUNT(*) c FROM claim WHERE eid='REAL-1'").get() as any).c).toBe(0); // the real game starts clean
    // each run has its own pid space (the pid carries the game code in its hash): a pid of one run is not a participant of another
    const foreign = await call("POST", "/api/z/REAL-1/claims", { pid: pids["REAL-1-R1"][0], device: "0".repeat(32), claims: [{ pattern: "top", idx: 0 }] });
    expect(foreign.status).toBe(403);
  });
  test("four guest-list shapes with the same phones: different, partly the same, identical, and the same as the real game's list", async () => {
    await realGame();
    const addPerson = (eid: string, k: number) => raw.prepare("INSERT INTO person(eid,id,ph,pii,inviter,role,status,added_ms) VALUES(?,?,?,?,?,NULL,'invited',?)").run(eid, "p" + k, "ph" + k, "pii" + k, "o", T);
    for (const k of [1, 2, 3, 4]) addPerson("REAL-1", k); // the real game's list: 4 people
    const r1 = await j(await start("REAL-1", { people: "published" })); // identical to the real list
    const n = (id: string) => (raw.query("SELECT COUNT(*) c FROM person WHERE eid=? AND role IS NULL").get(id) as any).c;
    expect(n(r1.id)).toBe(4); expect(r1.people).toBe(4);
    await close(r1.id);
    const r2 = await j(await start("REAL-1", { people: "none" })); expect(n(r2.id)).toBe(0); // a different list: new people only
    addPerson(r2.id, 3); addPerson(r2.id, 9); // partly the same: person 3 of the real list, and a new one
    await close(r2.id);
    const r3 = await j(await start("REAL-1", { people: "previous" })); expect(n(r3.id)).toBe(2); // the previous run's list
    const phones = (id: string) => (raw.query("SELECT ph FROM person WHERE eid=? ORDER BY ph").all(id) as any[]).map((x) => x.ph).join(",");
    expect(phones(r3.id)).toBe("ph3,ph9"); expect(phones("REAL-1")).toBe("ph1,ph2,ph3,ph4"); // the real game's list is unchanged
    // each copy has its OWN personal link: the tokens differ between runs
    const tok = (id: string) => (raw.query("SELECT tok_hash FROM person WHERE eid=? AND ph='ph3'").get(id) as any)?.tok_hash;
    expect(tok(r1.id)).toBeTruthy(); expect(tok(r1.id)).not.toBe(tok("REAL-1")); expect(tok(r3.id)).not.toBe(tok(r1.id));
  });
});

describe("rehearsal people and team (1.6.3)", () => {
  test("pick from the real game's list copies only the chosen people", async () => {
    await realGame();
    for (const k of [1, 2, 3, 4]) raw.prepare("INSERT INTO person(eid,id,ph,pii,inviter,role,status,added_ms) VALUES(?,?,?,?,?,NULL,'invited',?)").run("REAL-1", "p" + k, "ph" + k, "pii" + k, "o", T);
    const r = await j(await start("REAL-1", { pick: ["p2", "p4", "zzz"] }));
    expect(r.people).toBe(2);
    expect((raw.query("SELECT group_concat(ph) g FROM (SELECT ph FROM person WHERE eid=? ORDER BY ph)").get(r.id) as any).g).toBe("ph2,ph4");
  });
  test("each Co-host of the real game gets a new key for the rehearsal; the real game's keys are untouched", async () => {
    await realGame();
    raw.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms,is_test,label,eid,pii,created_by) VALUES('h1','plat-org','cohost',0,?,0,'Asha','REAL-1','sealed','o')").run(T);
    raw.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms,is_test,label,eid,pii,created_by) VALUES('h2','plat-org','cohost',1,?,0,'Gone','REAL-1','sealed','o')").run(T);
    raw.prepare("UPDATE engagement SET org='plat-org' WHERE id='REAL-1'").run();
    const r = await j(await start());
    expect(r.team.length).toBe(1); expect(r.team[0].label).toBe("Asha"); expect(r.team[0].link).toContain("/zc.html?e=REAL-1-R1#cohost=ctc_");
    const rows = raw.query("SELECT hash, eid, revoked FROM organizer_key WHERE kind='cohost' ORDER BY eid, hash").all() as any[];
    expect(rows.filter((x) => x.eid === "REAL-1").length).toBe(2); expect(rows.filter((x) => x.eid === "REAL-1-R1").length).toBe(1);
  });
});

describe("an ended rehearsal", () => {
  test("its pages say it is over and offer the real game; nobody can join it any more; a rehearsal link never opens the real game", async () => {
    await realGame(); const b = await j(await start()); await close(b.id);
    const info = await j(await call("GET", `/api/z/${b.id}/info`)); expect(info.rehearsal.over).toBe(true); expect(info.rehearsal.realId).toBe("REAL-1");
    const jn = await call("POST", `/api/z/${b.id}/join`, { phone: "9810000001", name: "A" }); expect(jn.status).toBe(410); const body = await j(jn); expect(body.error).toBe(OVER_MSG); expect(body.realId).toBe("REAL-1");
    expect(b.id).not.toBe("REAL-1"); expect((await j(await call("GET", "/api/z/REAL-1/info"))).rehearsal).toBeUndefined();
  });
});

describe("the words", () => {
  test("the e-mail subject starts 'REHEARSAL GAME n (practice only): ' and the block carries the game id", () => {
    expect(rehearsalSubject(2, "Your link for Diwali party")).toBe("REHEARSAL GAME 2 (practice only): Your link for Diwali party");
    expect(rehearsalBlock("REAL-1-R2", 2).split("\n")).toEqual(["Game ID: REAL-1-R2", "REHEARSAL GAME 2", "This link and this game are for rehearsal only. The real game has a different link and a different game."]);
  });
});

describe("every e-mail of a rehearsal says so", () => {
  test("the subject starts 'REHEARSAL GAME n (practice only): ', the body starts with the Game ID block; mails of a real game (even one whose name ends in -R1) are unchanged; the report mail too", async () => {
    const { sendMail, sentReports, sendReportMail } = await import("../src/pay");
    await realGame(); const b = await j(await start()); const e2 = { ...env, RESEND_API_KEY: undefined } as any;
    await sendMail(e2, env.DB, "org@example.com", `Your link for ${b.id}`, `Open https://corporatetambola.com/z.html?e=${b.id}`, T);
    await sendMail(e2, env.DB, "org@example.com", "Your link for REAL-1", "Open https://corporatetambola.com/z.html?e=REAL-1", T);
    await sendMail(e2, env.DB, "org@example.com", "A game that ends in -R1", "Game ZZZZ-R1 has no record", T);
    const rows = raw.query("SELECT subject, body FROM outbox ORDER BY rowid").all() as any[];
    expect(rows[0].subject).toContain("REHEARSAL GAME 1 (practice only): "); expect(rows[0].subject).toContain(`Your link for ${b.id}`);
    expect(rows[0].body.startsWith(rehearsalBlock(b.id, 1))).toBe(true);
    expect(rows[1].subject).not.toContain("REHEARSAL"); expect(rows[1].body).not.toContain("REHEARSAL");
    expect(rows[2].subject).not.toContain("REHEARSAL");
    await sendReportMail(e2, "org@example.com", `Report for ${b.id}`, `The report of ${b.id}`, [{ filename: "r.pdf", content: new Uint8Array([1]) }]);
    const rep = sentReports.at(-1)!; expect(rep.subject).toContain("REHEARSAL GAME 1 (practice only): "); expect(rep.text.startsWith(rehearsalBlock(b.id, 1))).toBe(true);
  });
});

describe("share texts and the size", () => {
  test("a personal WhatsApp text for a rehearsal starts with the block; the same person in the real game gets the normal text; the rehearsal's size shown is the real game's, and saving settings cannot raise the hidden limit", async () => {
    await realGame();
    expect((await call("POST", "/api/z/REAL-1/people", { people: [{ name: "Asha", phone: "9876543210" }] }, P)).status).toBe(200);
    const realList = await j(await call("GET", "/api/z/REAL-1/people", undefined, P)); const realWa = decodeURIComponent(realList.people[0].waLink);
    expect(realWa).not.toContain("REHEARSAL");
    const b = await j(await start("REAL-1", { people: "published" })); expect(b.people).toBe(1);
    const reList = await j(await call("GET", `/api/z/${b.id}/people`, undefined, P)); const wa = decodeURIComponent(reList.people[0].waLink);
    expect(wa).toContain(`Game ID: ${b.id}`); expect(wa).toContain("REHEARSAL GAME 1"); expect(wa).toContain("This link and this game are for rehearsal only. The real game has a different link and a different game.");
    expect(wa.indexOf("Game ID:")).toBeLessThan(wa.indexOf("invited")); // the block comes first
    expect(reList.people[0].link).not.toBe(realList.people[0].link); // a new personal link for this run
    const info = await j(await call("GET", `/api/z/${b.id}/info`)); expect(info.rehearsal.shownCap).toBe(100);
    const patch = await call("PATCH", `/api/z/${b.id}/settings`, { cap: 5000 }, P); expect(patch.status).toBe(200);
    expect((raw.query("SELECT cap FROM engagement WHERE id=?").get(b.id) as any).cap).toBe(REHEARSAL_PEOPLE);
  });
});

describe("not a game of its own in the numbers", () => {
  test("a rehearsal is left out of the owner's game counts and the permanent settings record, and costs nothing (no payment, no invoice)", async () => {
    const { keepGameRecord } = await import("../src/gamerecord"); const { ownerStats } = await import("../src/owner-stats") as any;
    await realGame(); const b = await j(await start());
    await keepGameRecord(env.DB as any, raw.query("SELECT * FROM engagement WHERE id='REAL-1'").get(), T);
    await keepGameRecord(env.DB as any, raw.query("SELECT * FROM engagement WHERE id=?").get(b.id), T);
    expect((raw.query("SELECT COUNT(*) c FROM game_record").get() as any).c).toBe(1); // only the real game
    expect((raw.query("SELECT COUNT(*) c FROM payment").get() as any).c).toBe(0); expect((raw.query("SELECT COUNT(*) c FROM invoice").get() as any).c).toBe(0);
    if (typeof ownerStats === "function") { const st = await ownerStats(env as any, T) as any; expect(st.games.kept).toBe(1); }
  });
});

describe("a database without the new columns", () => {
  test("the first rehearsal request adds them by itself (no manual migration step); the owner numbers and normal pages keep working before and after", async () => {
    const { resetRehearsalColumnsFlag } = await import("../src/rehearsal"); const { ownerStats } = await import("../src/owner-stats") as any;
    await realGame();
    raw.run("DROP INDEX IF EXISTS engagement_rehearsal"); for (const c of ["rehearsal_of", "run_no", "rehearsal_closed_ms"]) raw.run(`ALTER TABLE engagement DROP COLUMN ${c}`);
    resetRehearsalColumnsFlag();
    expect((await call("GET", "/api/z/REAL-1/info")).status).toBe(200); // a real game's pages never need the columns
    const st = await ownerStats(env as any, T) as any; expect(st.games.kept).toBe(1); // the numbers add the columns when they need them
    resetRehearsalColumnsFlag(); raw.run("DROP INDEX IF EXISTS engagement_rehearsal"); for (const c of ["rehearsal_of", "run_no", "rehearsal_closed_ms"]) raw.run(`ALTER TABLE engagement DROP COLUMN ${c}`);
    const c = await cards(); expect(c.cards[0].state).toBe("ready"); // the cards add them
    const b = await j(await start()); expect(b.id).toBe("REAL-1-R1");
    expect((raw.query("SELECT rehearsal_of FROM engagement WHERE id='REAL-1-R1'").get() as any).rehearsal_of).toBe("REAL-1");
  });
});
