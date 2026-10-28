// MANUAL PLAY (a Host presses Next for each number) has NO fixed gap anywhere. The "12 seconds only" rule is for games where the game calls the numbers itself.
// The strict claim rule still holds: a claim counts only before the NEXT number is announced (the moment the Host's press takes effect), decided by the Worker's clock.
import { beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(120_000);
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { HOUSE_ORDER } from "../../../packages/beacon/src/config";
import { nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";
import { callTimeMs } from "../src/lifecycle";
import { CLAIM_LATE_MSG, describeChanges } from "../src/modes";
import { layoutReport } from "../src/report-layout";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400, AT = T + 2 * 3_600_000;
const ORG = "11".repeat(32);
const P = { "x-organizer": "plat" };
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const mk = (only12: boolean) => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt", ...(only12 ? { ONLY_12S: "1" } : {}) } as any; };
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const kv = (): KV => ({ get: async (k) => (raw.query("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} });
const sign = async (id: string, a: Parameters<typeof nextMessage>[2], now: number) => {
  const m = signControlWithSecret(ORG, nextMessage((await readPublished(kv(), id))!, roundAt(now), a));
  const r = await call("POST", `/api/z/${id}/control`, { message: m }, {}, now); expect([id, a.action, r.status]).toEqual([id, a.action, 200]);
};
const HOUSES = HOUSE_ORDER.filter((k) => k !== "unlucky");
const claim = (id: string, pid: string, pattern: string, idx: number, now: number) => call("POST", `/api/z/${id}/claims`, { pid, device: "0".repeat(32), claims: [{ pattern, idx }] }, {}, now);
const stored = (id: string, pattern: string, idx: number) => (raw.query("SELECT COUNT(*) AS c FROM claim WHERE eid=? AND pattern=? AND idx=?").get(id, pattern, idx) as any).c as number;
const st = async (r: Response) => (r.status === 200 ? 200 : r.status + " " + (await r.clone().text()).slice(0, 160));
const row = (id: string) => raw.query("SELECT * FROM engagement WHERE id=?").get(id) as any;

async function hostGame(id: string, startMode: "auto" | "manual", callSeconds = 9) {
  expect((await call("POST", "/api/z", { id, startRound: START, callSeconds, cap: 100, startMode, callMode: "host" }, P)).status).toBe(200);
  raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id);
  expect((await call("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret(ORG) }, P)).status).toBe(200);
  const pid = (await j(await call("POST", `/api/z/${id}/join`, { phone: "9810000001", name: "Asha" }))).pid as string; expect(pid).toBeTruthy();
  let t = AT;
  if (startMode === "manual") { await sign(id, { action: "go" }, t); t += 6 * 60_000; }
  return { pid, t };
}
/** the Host presses Next at irregular moments: 7 s, 41 s, 4 s, 95 s, 13 s, 29 s ... */
const IRREGULAR = [7_000, 41_000, 4_000, 95_000, 13_000, 29_000, 5_000, 63_000];
async function pressIrregular(id: string, t0: number, n: number) {
  let t = t0;
  for (let i = 0; i < n; i++) { await sign(id, { action: "next" }, t); t += IRREGULAR[i % IRREGULAR.length]!; }
  const at: number[] = []; for (let k = 0; k < n; k++) at.push((await callTimeMs(env as any, row(id), 1, k))!);
  return { at, t };
}

describe("the 12 second rule is only for games the software calls", () => {
  beforeEach(() => mk(true));
  test("with the setting ON a manual-play game keeps any speed value: a Host game made with 9 (or none given) is accepted, both start modes", async () => {
    for (const startMode of ["auto", "manual"]) {
      const r9 = await call("POST", "/api/z", { id: `H9-${startMode}`, startRound: START, callSeconds: 9, cap: 50, callMode: "host", startMode }, P); expect([r9.status, startMode]).toEqual([200, startMode]);
      expect(row(`H9-${startMode}`).call_seconds).toBe(9);
      const rn = await call("POST", "/api/z", { id: `HN-${startMode}`, startRound: START, cap: 50, callMode: "host", startMode }, P); expect([rn.status, startMode]).toEqual([200, startMode]);
    }
    expect((await call("POST", "/api/z", { id: "A9", startRound: START, callSeconds: 9, cap: 50 }, P)).status).toBe(400); // the game calls the numbers itself: still 12 only
    expect((await call("POST", "/api/z", { id: "A9M", startRound: START, callSeconds: 9, cap: 50, startMode: "manual" }, P)).status).toBe(400); // manual start, the game calls: still 12 only
  });
  test("saving a Host game with another speed value is accepted; switching a game to Host lifts the rule; switching it back puts it back", async () => {
    expect((await call("POST", "/api/z", { id: "SWITCH-1", startRound: START, callSeconds: 12, cap: 50 }, P)).status).toBe(200);
    expect((await call("PATCH", "/api/z/SWITCH-1/settings", { callMode: "host", callSeconds: 9 }, P)).status).toBe(200);
    expect(row("SWITCH-1").call_seconds).toBe(9);
    expect(await st(await call("PATCH", "/api/z/SWITCH-1/settings", { callSeconds: 15 }, P))).toBe(200); // still a Host game
    expect((await call("PATCH", "/api/z/SWITCH-1/settings", { callMode: "auto", callSeconds: 9 }, P)).status).toBe(400);
  });
  test("a copy of a Host game keeps its value; a copy of a game that calls the numbers itself gets 12", async () => {
    mk(false);
    expect(await st(await call("POST", "/api/z", { id: "CHOST-1", startRound: START, callSeconds: 9, cap: 50, callMode: "host" }, P))).toBe(200);
    expect((await call("POST", "/api/z", { id: "CAUTO-1", startRound: START, callSeconds: 9, cap: 50 }, P)).status).toBe(200);
    env = { ...env, ONLY_12S: "1" } as any;
    expect((await call("POST", "/api/z/CHOST-1/clone", {}, P)).status).toBe(200);
    expect((await call("POST", "/api/z/CAUTO-1/clone", {}, P)).status).toBe(200);
    const copies = raw.query("SELECT id, call_seconds AS c FROM engagement WHERE id LIKE 'CHOST-1-%' OR id LIKE 'CAUTO-1-%'").all() as any[];
    expect(copies.find((x) => x.id.startsWith("CHOST-1-")).c).toBe(9);
    expect(copies.find((x) => x.id.startsWith("CAUTO-1-")).c).toBe(12);
  });
});

describe("the claim rule when a Host calls the numbers at irregular moments", () => {
  beforeEach(() => mk(true));
  for (const startMode of ["auto", "manual"] as const) {
    test(`start ${startMode}: numbers come when the Host presses (no equal gaps); a claim just before the next press is in time, at the instant of it or after, refused with the friendly message`, async () => {
      const id = `MP-${startMode[0]}`.toUpperCase();
      const { pid, t } = await hostGame(id, startMode);
      const { at } = await pressIrregular(id, t, 7);
      const gaps = at.slice(1).map((x, i) => x - at[i]!); expect(new Set(gaps).size).toBeGreaterThan(3); // not one fixed gap
      for (let k = 0; k < 6; k++) {
        const next = at[k + 1]!, pattern = HOUSES[k]!;
        const ok = await claim(id, pid, pattern, k, next - 1); expect([k, ok.status]).toEqual([k, 200]); expect(stored(id, pattern, k)).toBe(1);
        const edge = await claim(id, pid, HOUSES[(k + 1) % HOUSES.length]!, k, next); expect([k, edge.status]).toEqual([k, 409]);
        const b = await j(edge); expect(b.error).toBe(CLAIM_LATE_MSG); expect(b.code).toBe("claim-late");
        expect((await claim(id, pid, HOUSES[(k + 2) % HOUSES.length]!, k, next + 60_000)).status).toBe(409);
      }
      // the Host has not pressed for the 8th number: a claim for the 7th stays open however long it takes
      expect((await claim(id, pid, HOUSES[0]!, 6, at[6]! + 20 * 60_000)).status).toBe(200);
    });
  }
  test("a pause freezes it: while the game is paused no next number is announced, so a claim for the last number is still in time; the Host's next press closes it", async () => {
    const id = "MP-PAUSE";
    const { pid, t } = await hostGame(id, "auto");
    const { t: tNext } = await pressIrregular(id, t, 3);
    await sign(id, { action: "pause", pauseForRounds: 200 }, tNext); // paused for 10 minutes
    expect((await claim(id, pid, HOUSES[0]!, 2, tNext + 5 * 60_000)).status).toBe(200); // inside the pause
    expect((await claim(id, pid, HOUSES[1]!, 2, tNext + 9 * 60_000)).status).toBe(200); // the pause is nearly over
    await sign(id, { action: "next" }, tNext + 12 * 60_000); // pause over, the Host presses
    const nextAt = (await callTimeMs(env as any, row(id), 1, 3))!; expect(nextAt).toBeGreaterThan(tNext + 12 * 60_000);
    expect((await claim(id, pid, HOUSES[2]!, 2, nextAt - 1)).status).toBe(200);
    expect((await claim(id, pid, HOUSES[3]!, 2, nextAt)).status).toBe(409);
  });
  test("the last of the 90 numbers: a claim is open 12 seconds after it is announced (the seconds do NOT come from the stored speed value 9)", async () => {
    const id = "MP-LAST";
    const { pid, t } = await hostGame(id, "auto", 9);
    const { at } = await pressIrregular(id, t, 90);
    const last = at[89]!; expect(last).toBeGreaterThan(0);
    expect((await claim(id, pid, HOUSES[0]!, 89, last + 10_000)).status).toBe(200); // 10 s: would be late if the stored 9 s were used
    expect((await claim(id, pid, HOUSES[1]!, 89, last + 12_000 - 1)).status).toBe(200);
    expect((await claim(id, pid, HOUSES[2]!, 89, last + 12_000)).status).toBe(409);
  });
});

describe("what the owner reads never promises a gap for a Host game", () => {
  const view = (cs: number, callMode?: "host") => ({ start_round: 1, call_seconds: cs, cap: 50, closed: 0, cfg: { ...(callMode ? { callMode } : {}) } }) as any;
  test("the list of changes: no 'Speed changed' line for a Host game; still there when the game calls the numbers", () => {
    expect(describeChanges(view(9, "host"), view(12, "host")).join(" ")).not.toMatch(/Speed|seconds between/);
    expect(describeChanges(view(9), view(12)).join(" ")).toMatch(/12 seconds between numbers/);
  });
  test("the report: a Host game says the host called the numbers; a game that calls itself says the seconds", () => {
    const base = { engagementId: "X", organizerEmail: "a@b.c", sentAtMs: T, scheduledMs: T, firstNumberMs: T, endMs: T + 60_000, endReason: "x", wasHeld: false, rounds: 1, callSeconds: 9, ticketsPerPerson: 1, cap: 50, inviteOnly: false, numbersCalled: 5, agg: { joined: 0, onRoster: 0, notJoined: 0, late: 0, viaInvite: 0, inviters: 0, topInviter: null, roles: 0, joinedInTime: 0, firstJoinMs: null }, people: [], prizes: [], lucky: [], timeline: [], breaks: [], personalDeleteAtMs: T, fullDeleteAtMs: T } as any;
    const text = (d: any) => new TextDecoder("latin1").decode(layoutReport(d));
    expect(text({ ...base, hostCalled: true })).toContain("The host called the numbers \\(no fixed gap\\)");
    expect(text({ ...base, hostCalled: true })).not.toContain("every 9 seconds");
    expect(text(base)).toContain("one number every 9 seconds");
  });
});

describe("the report explains 'Prize already taken'", () => {
  test("the rule text is always in the prizes section and every taken claim has its line", () => {
    const base = { engagementId: "X", organizerEmail: "a@b.c", sentAtMs: T, scheduledMs: T, firstNumberMs: T, endMs: T + 60_000, endReason: "x", wasHeld: false, rounds: 1, callSeconds: 12, ticketsPerPerson: 1, cap: 50, inviteOnly: false, numbersCalled: 5, agg: { joined: 0, onRoster: 0, notJoined: 0, late: 0, viaInvite: 0, inviters: 0, topInviter: null, roles: 0, joinedInTime: 0, firstJoinMs: null }, people: [], prizes: [], lucky: [], timeline: [], breaks: [], personalDeleteAtMs: T, fullDeleteAtMs: T } as any;
    const text = (d: any) => [...new TextDecoder("latin1").decode(layoutReport(d)).matchAll(/\((.*?)\) Tj/g)].map((m) => m[1]).join(" ").replace(/\\(?=[()])/g, "").replace(/\s+/g, " ");
    const t = text({ ...base, takenClaims: ["Ticket 3 claimed Top line. Prize already taken: this claim came at number 15, after the prize was already awarded at number 10."] });
    expect(t).toContain("everyone who claims before the next number is called wins that prize together"); expect(t).toContain("Prize already taken: this claim came at number 15, after the prize was already awarded at number 10.");
    expect(text(base)).not.toContain("Prize already taken");
  });
});
