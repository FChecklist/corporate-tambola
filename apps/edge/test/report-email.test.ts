// The branded customer e-mail (1.6.1): logos and colour, summary tiles equal to the database, prizes table, the complete claim and event log, the all-games block, subject and plain-text part, rehearsal header, the logo picture route.
import { beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(60_000);
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { buildGameLog } from "../src/gamelog";
import { REPORT_CLAIM_ROWS, brandedReportMail, tilesOf } from "../src/report-email";
import { MORE_GAMES } from "../../../packages/beacon/src/more-games";
import { cfgOfRow } from "../src/lifecycle";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400;
const P = { "x-organizer": "plat" };
import { deflateSync } from "node:zlib";
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t: string, d: Uint8Array) => { const o = new Uint8Array(12 + d.length), v = new DataView(o.buffer); v.setUint32(0, d.length); o.set(new TextEncoder().encode(t), 4); o.set(d, 8); v.setUint32(8 + d.length, crc(o.subarray(4, 8 + d.length))); return o; };
const makePng = (w: number, h: number) => { const ih = new Uint8Array(13), v = new DataView(ih.buffer); v.setUint32(0, w); v.setUint32(4, h); ih[8] = 8; ih[9] = 2; const row = new Uint8Array(1 + w * 3).fill(200); row[0] = 0; const raw = new Uint8Array(row.length * h); for (let y = 0; y < h; y++) raw.set(row, y * row.length); const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array(0))]; const all = new Uint8Array(parts.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of parts) { all.set(x, o); o += x.length; } return "data:image/png;base64," + btoa(String.fromCharCode(...all)); };
const PNG = makePng(64, 64);
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt" } as any; });
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, T);
const j = async (r: Response) => (await r.json()) as any;

async function game(id: string, brand?: unknown) {
  expect((await call("POST", "/api/z", { id, startRound: START, callSeconds: 12, cap: 100 }, P)).status).toBe(200);
  raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id);
  if (brand) raw.prepare("UPDATE engagement SET config=? WHERE id=?").run(JSON.stringify({ brand }), id); // (the picture check of the console wants 48 px; the stored value is what the e-mail reads)
  const seats: { pid: string; seq: number }[] = [];
  for (let i = 1; i <= 5; i++) { const g = await j(await call("POST", `/api/z/${id}/join`, { phone: "981000000" + i, name: "Secret Name " + i })); seats.push({ pid: g.pid, seq: Number(String(g.pid).split("x")[0]) }); }
  return seats;
}
const logOf = async (id: string) => { const e = raw.query("SELECT * FROM engagement WHERE id=?").get(id) as any; return buildGameLog(env as any, { get: async (k: string) => (raw.query("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} } as any, e, cfgOfRow(e), T + 7_200_000, { endMs: T + 7_200_000, endReason: "All 90 numbers were called.", numbersCalled: 90, firstNumberMs: T + 3_600_000 }); };

describe("the branded e-mail", () => {
  test("header with both logos and the customer's colour; tiles equal the database; prizes, every claim, the rule, the events, the all-games block; subject proper; a plain-text part with the same facts; no names or numbers", async () => {
    const s = await game("RPT-1", { name: "Acme Ltd", color: "#0B3D91", logo: PNG });
    const t0 = T + 3_700_000;
    raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES('RPT-1',1,'top',1,?,9,?, 'phones')").run(s[0]!.seq, t0);
    raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES('RPT-1',?,'top',1,9,?)").run(s[0]!.pid, t0 - 2000);
    raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES('RPT-1',?,'top',1,14,?)").run(s[1]!.pid, t0 + 60_000); // after the prize was awarded
    raw.prepare("INSERT INTO bogey(eid,pid,pattern,round,at_ms) VALUES('RPT-1',?,'mid',1,?)").run(s[2]!.pid, t0 + 5000);
    raw.prepare("INSERT INTO kv(k,v) VALUES('claimlate/RPT-1',?)").run(JSON.stringify([{ t: s[3]!.seq, p: "bot", at: t0 + 9000 }]));
    const log = await logOf("RPT-1");
    const m = brandedReportMail({ log, gameName: "Acme party", brand: { name: "Acme Ltd", color: "#0B3D91", logo: PNG }, origin: "https://tambola.test", link: "https://tambola.test/report?x=1", keptUntilMs: T + 30 * 86_400_000, deleteAtMs: T + 86_400_000, organizerEmail: "boss@acme.com" });
    expect(m.subject).toMatch(/^Your game report is ready: Acme party \(RPT-1\), \d\d \w{3} 2026$/);
    expect(m.html).toContain("https://tambola.test/logo-512.png"); expect(m.html).toContain("https://tambola.test/api/z/RPT-1/logo"); expect(m.html).toContain("#0B3D91"); expect(m.html).toContain("Acme Ltd");
    // the tiles are the database
    const tiles = Object.fromEntries(tilesOf(log)); expect(tiles["Players"]).toBe(String((raw.query("SELECT COUNT(*) c FROM participant WHERE eid='RPT-1'").get() as any).c));
    const nClaims = (raw.query("SELECT COUNT(*) c FROM claim WHERE eid='RPT-1'").get() as any).c + (raw.query("SELECT COUNT(*) c FROM bogey WHERE eid='RPT-1'").get() as any).c + 1;
    expect(tiles["Claims"]).toStartWith(String(nClaims) + " ("); expect(tiles["Prizes awarded"]).toBe(String((raw.query("SELECT COUNT(*) c FROM winner WHERE eid='RPT-1'").get() as any).c)); expect(tiles["Numbers called"]).toBe("90");
    for (const k of ["Game started", "Completed", "Players", "Numbers called", "Prizes awarded", "Claims"]) { expect(m.html).toContain(k); expect(m.text).toContain(k + ":"); }
    // prizes table, claim log, events, rule, all games
    expect(m.html.toLowerCase()).toContain("top line"); expect(m.text).toMatch(/top line.*Ticket \d+, after number 10/i);
    expect(m.text).toContain("Prize already taken: this claim came at number 15, after the prize was already awarded at number 10."); expect(m.html).toContain("Prize already taken: this claim came at number 15");
    expect(m.text).toContain("wrong (a Bogey)"); expect(m.text).toContain("too late, refused");
    expect(m.text).toContain("Rule: everyone who claims before the next number is called wins that prize together.");
    for (const g of MORE_GAMES) { expect(m.html).toContain(g.name.replace("&", "&amp;")); expect(m.html).toContain(g.url); expect(m.text).toContain(g.url); }
    expect(MORE_GAMES.length).toBe(6);
    expect(m.text).toContain("hello@corporatetambola.com"); expect(m.text).toContain("365 days"); expect(m.html).toContain("365 days");
    // ticket numbers only
    expect(m.html + m.text).not.toMatch(/Secret Name|981000000/);
  });
  test("without a brand it falls back to our colour and our name; with many claims the e-mail shows the first rows and says how many more are in the full report; a rehearsal carries its red header", async () => {
    const s = await game("RPT-2");
    for (let i = 0; i < REPORT_CLAIM_ROWS + 15; i++) raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES('RPT-2',?,?,?,?,?)").run(s[i % 5]!.pid, ["early5", "top", "mid", "bot", "corners", "star", "full"][i % 7]!, 1 + Math.floor(i / 35), i % 90, T + 3_700_000 + i);
    const log = await logOf("RPT-2");
    const m = brandedReportMail({ log, gameName: "Plain party", brand: null, origin: "https://tambola.test", link: "https://tambola.test/r", keptUntilMs: T, deleteAtMs: T, organizerEmail: "a@b.c", rehearsal: 2 });
    expect(m.html).toContain("#0B3D91"); expect(m.html).not.toContain("/api/z/RPT-2/logo"); expect(m.html).toContain("REHEARSAL GAME 2"); expect(m.html).toContain("... and 15 more in the full report.");
    expect(m.text).toContain("... and 15 more in the full report"); expect((m.html.match(/<tr><td style="padding:10px 12px;border:1px solid #D9E1F0;vertical-align:top">\d\d:\d\d:\d\d<\/td>/g) ?? []).length).toBeGreaterThanOrEqual(REPORT_CLAIM_ROWS);
  });
});

describe("the logo picture", () => {
  test("a raster logo is served as a picture that cannot run anything; a game without a logo, or with a picture type we do not accept, answers 404", async () => {
    await game("RPT-3", { name: "Acme Ltd", color: "#0B3D91", logo: PNG });
    const r = await call("GET", "/api/z/RPT-3/logo"); expect(r.status).toBe(200); expect(r.headers.get("content-type")).toBe("image/png"); expect(r.headers.get("x-content-type-options")).toBe("nosniff"); expect(r.headers.get("content-security-policy")).toBe("default-src 'none'");
    const bytes = new Uint8Array(await r.arrayBuffer()); expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    await game("RPT-4"); expect((await call("GET", "/api/z/RPT-4/logo")).status).toBe(404);
    raw.prepare("UPDATE engagement SET config=? WHERE id='RPT-4'").run(JSON.stringify({ brand: { name: "X", color: "#0B3D91", logo: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" } }));
    expect((await call("GET", "/api/z/RPT-4/logo")).status).toBe(404);
  });
});

describe("the PDF", () => {
  test("the PDF carries the customer's colour, the at-a-glance table, the prizes, EVERY claim with the 'Prize already taken' line, the events and the all-games block; it holds all claims (not capped)", async () => {
    const { layoutReport } = await import("../src/report-layout");
    const s = await game("RPT-5", { name: "Acme Ltd", color: "#0B3D91" });
    const t0 = T + 3_700_000;
    raw.prepare("INSERT INTO winner(eid,round,pattern,ordinal,seat,idx,at_ms,src) VALUES('RPT-5',1,'top',1,?,9,?, 'phones')").run(s[0]!.seq, t0);
    raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES('RPT-5',?,'top',1,9,?)").run(s[0]!.pid, t0 - 2000);
    raw.prepare("INSERT INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES('RPT-5',?,'top',1,14,?)").run(s[1]!.pid, t0 + 60_000);
    for (let i = 0; i < REPORT_CLAIM_ROWS + 15; i++) raw.prepare("INSERT OR IGNORE INTO claim(eid,pid,pattern,round,idx,at_ms) VALUES('RPT-5',?,?,?,?,?)").run(s[i % 5]!.pid, ["early5", "mid", "bot", "corners", "star", "full"][i % 6]!, 1 + Math.floor(i / 30), i % 90, t0 + 100_000 + i);
    const log = await logOf("RPT-5");
    const base = { engagementId: "RPT-5", organizerEmail: "a@b.c", sentAtMs: T, scheduledMs: T, firstNumberMs: T, endMs: T + 60_000, endReason: "x", wasHeld: false, rounds: 1, callSeconds: 12, ticketsPerPerson: 1, cap: 50, inviteOnly: false, numbersCalled: 90, agg: { joined: 5, onRoster: 0, notJoined: 0, late: 0, viaInvite: 0, inviters: 0, topInviter: null, roles: 0, joinedInTime: 5, firstJoinMs: null }, people: [], prizes: [], lucky: [], timeline: [], breaks: [], personalDeleteAtMs: T, fullDeleteAtMs: T, brand: { name: "Acme Ltd", color: "#B3261E" } } as any;
    const pdf = new TextDecoder("latin1").decode(layoutReport({ ...base, log }));
    const text = [...pdf.matchAll(/\((.*?)\) Tj/g)].map((m) => m[1]).join(" ").replace(/\\(?=[()])/g, "").replace(/\s+/g, " ");
    expect(pdf).toContain("0.7 0.15 0.12 rg 0 749.89 595.28 92 re f"); // the title band is the customer's colour (#B3261E)
    expect(text).toContain("At a glance, every claim, and what happened"); expect(text).toContain("Game started"); expect(text).toContain(`Every claim (${log.claims.length})`); expect(log.claims.length).toBeGreaterThan(REPORT_CLAIM_ROWS);
    expect((text.match(/Ticket|accepted|too late|Bogey|Prize already taken/g) ?? []).length).toBeGreaterThan(0);
    expect(text).toContain("Prize already taken"); expect(text).toMatch(/came at number 15/);
    for (const g of MORE_GAMES) expect(text).toContain(g.name); expect(text).toContain("More games from Corporate Tambola");
    const without = new TextDecoder("latin1").decode(layoutReport(base)); expect(without).not.toContain("Every claim");
  });
});

describe("TA19: the rule line follows the game's real tie setting (e-mail, game log, config text)", () => {
  test("a game where ties take the next prizes says so; a game where ties share says that; an old log says only what is always true", async () => {
    const { claimRuleText } = await import("../../../packages/beacon/src/config");
    await game("RPT-N"); await game("RPT-S");
    raw.prepare("UPDATE engagement SET config=? WHERE id=?").run(JSON.stringify({ ties: "next" }), "RPT-N");
    raw.prepare("UPDATE engagement SET config=? WHERE id=?").run(JSON.stringify({ ties: "share" }), "RPT-S");
    const mailOf = async (id: string, strip = false) => { const log: any = await logOf(id); if (strip) delete log.ties; return brandedReportMail({ log, gameName: "G", origin: "https://tambola.test", link: "https://tambola.test/r", keptUntilMs: T + 86_400_000, deleteAtMs: T + 86_400_000, organizerEmail: "boss@acme.com" }); };
    const n = await mailOf("RPT-N"), s = await mailOf("RPT-S"), old = await mailOf("RPT-S", true);
    expect(n.text).toContain(claimRuleText("next")); expect(n.html).toContain("they take the next prizes one after the other"); expect(n.text).not.toContain("wins that prize together");
    expect(s.text).toContain(claimRuleText("share")); expect(s.html).toContain("wins that prize together");
    expect(old.text).toContain(claimRuleText(undefined)); expect(old.text).not.toContain("wins that prize together"); expect(old.text).not.toContain("one after the other");
  });
});
