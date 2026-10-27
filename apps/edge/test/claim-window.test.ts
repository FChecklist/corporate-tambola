// THE CLAIM RULE: a prize completed on number N can be claimed only until number N+1 is announced. The Worker's clock decides; a claim at the very instant of the next number is late; a late claim is refused with a
// friendly message and nothing is recorded. It holds in all four modes and for every prize.
import { beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { HOUSE_ORDER } from "../../../packages/beacon/src/config";
import { nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";
import { callTimeMs } from "../src/lifecycle";
import { CLAIM_LATE_MSG } from "../src/modes";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400, AT = T + 2 * 3_600_000;
const ORG = "11".repeat(32);
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const P = { "x-organizer": "plat" };
const kv = (): KV => ({ get: async (k) => (raw.query("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} });
const HOUSES = HOUSE_ORDER.filter((k) => k !== "unlucky");
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" } as any; });

const press = async (id: string, action: "go" | "next", now: number) => {
  const m = signControlWithSecret(ORG, nextMessage((await readPublished(kv(), id))!, roundAt(now), { action }));
  const r = await call("POST", `/api/z/${id}/control`, { message: m }, {}, now); expect([id, action, r.status]).toEqual([id, action, 200]);
};
/** a running game of the given mode with a player; returns the player's id and when each of the first four numbers was announced */
async function running(id: string, startMode: "auto" | "manual", callMode: "auto" | "host") {
  expect((await call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, startMode, callMode }, P)).status).toBe(200);
  raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id);
  if (startMode === "manual" || callMode === "host") expect((await call("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret(ORG) }, P)).status).toBe(200);
  const jn = await j(await call("POST", `/api/z/${id}/join`, { phone: "9810000001", name: "Asha" })); expect(jn.pid).toBeTruthy();
  const jn2 = await j(await call("POST", `/api/z/${id}/join`, { phone: "9810000002", name: "Ravi" })); expect(jn2.pid).toBeTruthy(); // (a player claims a prize once, so the two calls below use two players)
  let t = AT + 10_000;
  if (startMode === "manual") { await press(id, "go", t); t += 6 * 60_000; } // Start, then past its countdown
  if (callMode === "host") for (let i = 0; i < 4; i++) { await press(id, "next", t); t += 15_000; }
  const e = raw.query("SELECT * FROM engagement WHERE id=?").get(id) as any;
  const at: number[] = []; for (let k = 0; k < 4; k++) { const ms = await callTimeMs(env as any, e, 1, k); expect(ms).not.toBeNull(); at.push(ms!); }
  return { pid: jn.pid as string, pid2: jn2.pid as string, at };
}
const claim = (id: string, pid: string, pattern: string, idx: number, now: number) => call("POST", `/api/z/${id}/claims`, { pid, device: "0".repeat(32), claims: [{ pattern, idx }] }, {}, now);
const stored = (id: string, pattern: string, idx: number) => (raw.query("SELECT COUNT(*) AS c FROM claim WHERE eid=? AND pattern=? AND idx=?").get(id, pattern, idx) as any).c as number;

for (const [startMode, callMode] of [["auto", "auto"], ["auto", "host"], ["manual", "auto"], ["manual", "host"]] as const) {
  describe(`the claim rule, start ${startMode} / calls ${callMode}`, () => {
    test("before the next number: accepted. After it: refused with the friendly message and nothing recorded. The same instant as the next number: refused (the Worker's clock decides). All prizes.", async () => {
      const id = `CW-${startMode[0]}${callMode[0]}`.toUpperCase();
      const { pid, pid2, at } = await running(id, startMode, callMode);
      const next = at[2]!; // a prize completed on call number index 1 (the 2nd number) can be claimed until number index 2 is announced
      for (const pattern of HOUSES) {
        const ok = await claim(id, pid, pattern, 1, next - 1000); expect([pattern, ok.status]).toEqual([pattern, 200]); expect((await j(ok)).stored).toBe(1); expect(stored(id, pattern, 1)).toBe(1);
        const edge = await claim(id, pid, pattern, 1, next); // the very instant the next number is announced: late (the same claim, sent again, is refused, and the earlier one stays)
        expect([pattern, edge.status]).toEqual([pattern, 409]); expect(stored(id, pattern, 1)).toBe(1);
        const late = await claim(id, pid2, pattern, 0, at[1]!); // a different claim, idx 0, at the instant number idx 1 is announced
        expect([pattern, late.status]).toEqual([pattern, 409]); const lb = await j(late); expect(lb.error).toBe(CLAIM_LATE_MSG); expect(lb.code).toBe("claim-late"); expect(stored(id, pattern, 0)).toBe(0);
        const later = await claim(id, pid2, pattern, 0, at[1]! + 30_000); expect([pattern, later.status]).toEqual([pattern, 409]); expect(stored(id, pattern, 0)).toBe(0);
        const justBefore = await claim(id, pid2, pattern, 0, at[1]! - 1); expect([pattern, justBefore.status]).toEqual([pattern, 200]); expect(stored(id, pattern, 0)).toBe(1);
      }
    });
    test("it is the server's clock and nothing else: the same claim is accepted at one second before and refused at the instant, whatever the phone says", async () => {
      const id = `CX-${startMode[0]}${callMode[0]}`.toUpperCase();
      const { pid, at } = await running(id, startMode, callMode);
      expect((await claim(id, pid, "top", 0, at[1]! - 1)).status).toBe(200);
      expect((await claim(id, pid, "mid", 0, at[1]!)).status).toBe(409); // deterministic: now >= the next number's moment
    });
  });
}

describe("no next number to wait for", () => {
  test("a claim for the last number of a game is never late; a Host who has not pressed yet does not make a claim late", async () => {
    const id = "CW-LAST";
    const { pid } = await running(id, "auto", "auto");
    expect((await claim(id, pid, "full", 89, AT + 10 * 3_600_000)).status).toBe(200);
    const id2 = "CW-HOST";
    const r = await running(id2, "auto", "host"); // four numbers were pressed; the fifth has not been
    expect((await claim(id2, r.pid, "full", 3, r.at[3]! + 600_000)).status).toBe(200);
  });
});
