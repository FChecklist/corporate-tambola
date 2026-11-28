// (1.13.0 claimWindow option, the server's clock) Same scaffolding as claim-window.test.ts. THE CLAIM RULE: a prize completed on number N can be claimed only until number N+1 is announced. The Worker's clock decides; a claim at the very instant of the next number is late; a late claim is refused with a
// friendly message and nothing is recorded. It holds in all four modes and for every prize.
import { beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(60_000);
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { HOUSE_ORDER } from "../../../packages/beacon/src/config";
import { nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";
import { callTimeMs } from "../src/lifecycle";
import { CLAIM_LATE_MSG } from "../src/modes";
import { claimLateText } from "../../../packages/beacon/src/config";

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
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" } as any; });

const press = async (id: string, action: "go" | "next", now: number) => {
  const m = signControlWithSecret(ORG, nextMessage((await readPublished(kv(), id))!, roundAt(now), { action }));
  const r = await call("POST", `/api/z/${id}/control`, { message: m }, {}, now); expect([id, action, r.status]).toEqual([id, action, 200]);
};
/** a running game of the given mode with a player; returns the player's id and when each of the first four numbers was announced */
async function running(id: string, startMode: "auto" | "manual", callMode: "auto" | "host", claimWindow?: number) {
  expect((await call("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, startMode, callMode, ...(claimWindow ? { claimWindow } : {}) }, P)).status).toBe(200);
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

describe("claim time (claimWindow) on the server's clock", () => {
  test("default game: refused at the next number (unchanged). Window 3: accepted until call idx+3 starts, refused from that instant, with the window's own words", async () => {
    const a = await running("CWO-1", "auto", "auto");
    expect((await claim("CWO-1", a.pid, "top", 0, a.at[1]! - 1)).status).toBe(200);
    expect((await claim("CWO-1", a.pid2, "top", 0, a.at[1]!)).status).toBe(409); // today
    const b = await running("CWO-3", "auto", "auto", 3);
    for (const pattern of HOUSES.slice(0, 3)) {
      const ok = await claim("CWO-3", b.pid, pattern, 0, b.at[3]! - 1); expect([pattern, ok.status]).toEqual([pattern, 200]); expect(stored("CWO-3", pattern, 0)).toBe(1);
      const mid = await claim("CWO-3", b.pid2, pattern, 0, b.at[2]! + 1000); expect([pattern, mid.status]).toEqual([pattern, 200]); // two calls late: fine with window 3
      const edge = await claim("CWO-3", b.pid2, pattern === "top" ? "mid" : "top", 0, b.at[3]!); expect(edge.status).toBe(409);
      const lb = await j(edge); expect(lb.code).toBe("claim-late"); expect(lb.error).toBe(claimLateText(3)); expect(lb.error).not.toBe(CLAIM_LATE_MSG);
    }
  });
  test("a bad claimWindow is refused when the game is made", async () => {
    for (const bad of [0, 11, 2.5]) expect((await call("POST", "/api/z", { id: "CWO-BAD" + String(bad).replace(".", ""), startRound: START, callSeconds: 9, cap: 100, claimWindow: bad }, P)).status).toBe(400);
  });
});
