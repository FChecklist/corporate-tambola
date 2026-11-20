// 250x10 game 4: through the real Worker, a Next press that names a beacon round which is already published is refused, and an honest press (signed from the beacon's own clock) still goes through.
import { beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { NEXT_REFUSALS, nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400;
const during = T + 2 * 3_600_000 + 5 * 60_000;
const ORG = "11".repeat(32);
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const kv = (): KV => ({ get: async (k) => (raw.query("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} });
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", RUNNER_KEY: "test-runner-key-test-runner-key-test0000", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" } as any; });
async function live(id: string) {
  const s = await j(await call("POST", "/api/start", { email: "boss@acme.com" })); const h = { "x-organizer": s.token as string };
  await call("POST", "/api/z", { id, startRound: START, callSeconds: 6, cap: 100, callMode: "host" }, h);
  await call("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, h); raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id);
  expect((await call("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret(ORG) }, h)).status).toBe(200);
}
const sign = async (id: string, at: number, signedAt: number, action: any = "next") => signControlWithSecret(ORG, { engagementId: id, seq: ((await readPublished(kv(), id))!).messages.length + 1, action, atBeaconRound: at, signedAtRound: signedAt });
const post = async (id: string, msg: unknown, now: number) => { const r = await call("POST", `/api/z/${id}/control`, { message: msg }, {}, now); return { status: r.status, body: await j(r) }; };

describe("the Worker accepts a press only for a round that has not begun", () => {
  test("honest press: accepted; a press dated 10 rounds back (its randomness is public): refused with the Host's plain words and not stored", async () => {
    await live("FR-1");
    const honest = await post("FR-1", signControlWithSecret(ORG, nextMessage((await readPublished(kv(), "FR-1"))!, roundAt(during), { action: "next" })), during);
    expect(honest.status).toBe(200);
    const later = during + 90_000, nowR = roundAt(later);
    const back = await post("FR-1", await sign("FR-1", nowR - 10, nowR - 12), later);
    expect(back.status).toBe(422); expect(back.body.error).toBe(NEXT_REFUSALS.lead);
    expect((await readPublished(kv(), "FR-1"))!.messages).toHaveLength(1);
    const fine = await post("FR-1", signControlWithSecret(ORG, nextMessage((await readPublished(kv(), "FR-1"))!, nowR, { action: "next" })), later);
    expect(fine.status).toBe(200);
  });
  test("a press that reaches the store one round late (slow phone line) is refused kindly and works when pressed again", async () => {
    await live("FR-2");
    const nowR = roundAt(during);
    const slow = await post("FR-2", signControlWithSecret(ORG, nextMessage((await readPublished(kv(), "FR-2"))!, nowR, { action: "next" })), during + 6_000); // signed at round n, reaches the store at round n+2: names n+2, which has begun
    expect(slow.status).toBe(422); expect(slow.body.error).toBe(NEXT_REFUSALS.lead);
    const again = await post("FR-2", signControlWithSecret(ORG, nextMessage((await readPublished(kv(), "FR-2"))!, roundAt(during + 6_000), { action: "next" })), during + 6_000);
    expect(again.status).toBe(200);
  });
});
