// WP-06 TA15 (gap plan 2026-10-29, finance reader): "Forwarded Pay now says 'Please sign in first'; the link ran out."
//  - the payment-pending reminder tells the organizer how to give finance a link that needs no sign-in
//  - that payment link stays good until the game starts (at least the old 7 days), so it cannot run out before the game
//  - the page a finance person lands on without a sign-in says where the no-sign-in link comes from
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withDevice } from "./device";
import { type Env, remindUnpaid } from "../src/worker";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import * as PL from "../src/paylink";
const PAYLINK_MIN_MS = (PL as any).PAYLINK_MIN_MS, payLinkExpiry = (PL as any).payLinkExpiry as (now: number, startMs: number) => number;

const T = Date.UTC(2026, 9, 8, 10, 0, 0), H = 3_600_000, DAY = 24 * H;
const PUB = join(import.meta.dir, "..", "..", "web", "public");
const rd = (f: string) => readFileSync(join(PUB, f), "utf8");
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"];
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": "1.1.1.1", ...headers }, body: withDevice(method, path, body) }), env as Env, now);
beforeEach(() => {
  const d = makeD1(); raw = d.raw;
  env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000", PUBLIC_ORIGIN: "https://tambola.test" } as PayEnv;
});
async function organizer() { const j = await (await call("POST", "/api/start", { email: "boss@acme.com" })).json() as any; return { "x-organizer": j.token as string }; }
/** An unpaid, published game that starts `startH` hours after T, published 3 hours before T. */
async function unpaid(h: Record<string, string>, id: string, startH: number) {
  expect((await call("POST", "/api/z", { id, startRound: roundAt(T + startH * H), callSeconds: 6, cap: 100, name: "Diwali Tambola" }, h, T - 3 * H)).status).toBe(200);
  expect((await call("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, h, T - 3 * H)).status).toBe(200);
}

describe("TA15: the payment-pending reminder", () => {
  test("it tells the organizer how to send finance a link that needs no sign-in, and how long it works", async () => {
    const h = await organizer(); await unpaid(h, "FIN-1", 30);
    await remindUnpaid(env as Env, T);
    const m = raw.prepare("SELECT subject, body FROM outbox WHERE to_addr='boss@acme.com' AND subject LIKE '%Payment pending for your game%'").all() as { subject: string; body: string }[];
    expect(m.length).toBe(1);
    expect(m[0]!.body).toContain("Copy payment link"); // the real button name in the console
    expect(m[0]!.body).toMatch(/finance/i);
    expect(m[0]!.body).toMatch(/no (account|sign-in)/i);
    expect(m[0]!.body).toMatch(/until the game starts/);
    expect(m[0]!.body).toContain("/pay.html?e=FIN-1"); // the organizer's own pay page is still there
    expect(m[0]!.body).not.toMatch(/\bprivate\b/i);
  });
});

describe("TA15: the payment link lasts until the game starts", () => {
  test("payLinkExpiry: the later of 7 days from now and the game's start", () => {
    expect(PAYLINK_MIN_MS).toBe(7 * DAY);
    expect(payLinkExpiry(T, T + 3 * H)).toBe(T + 7 * DAY); // a game soon: the old 7 days
    expect(payLinkExpiry(T, T + 20 * DAY)).toBe(T + 20 * DAY); // a game far off: until it starts
    expect(payLinkExpiry(T, T - DAY)).toBe(T + 7 * DAY); // a game whose start has passed (late payment): 7 days
  });
  test("a link made for a game 20 days away is still open at 19 days and runs out at the start", async () => {
    const h = await organizer();
    const startMs = T + 20 * DAY;
    expect((await call("POST", "/api/z", { id: "FIN-2", startRound: roundAt(T + 10 * DAY), callSeconds: 6, cap: 100, name: "Far game" }, h, T)).status).toBe(200);
    raw.prepare("UPDATE engagement SET start_round=? WHERE id='FIN-2'").run(roundAt(startMs)); // the game is moved to day 20 (a later move is allowed by the app for a paid game; set directly here)
    const r = await call("POST", "/api/z/FIN-2/paylink", {}, h, T); const b = await r.json() as any; expect(r.status).toBe(200);
    const sr = (raw.prepare("SELECT start_round FROM engagement WHERE id='FIN-2'").get() as any).start_round as number;
    const realStart = (1692803367 + (sr - 1) * 3) * 1000;
    expect(b.expiresMs).toBe(payLinkExpiry(T, realStart)); expect(b.expiresMs).toBeGreaterThanOrEqual(realStart);
    const tok = new URL(b.url).searchParams.get("t")!;
    const view = async (now: number) => (await (await call("GET", `/api/paylink/${tok}`, undefined, {}, now)).json() as any).status;
    expect(await view(T + 8 * DAY)).toBe("open"); // the old 7 days would have ended by now
    expect(await view(realStart - 1000)).toBe("open");
    expect(await view(realStart + 1000)).toBe("expired");
  });
});

describe("TA15: the words on screen match", () => {
  test("the console note, the expired page and the sign-in page say the same thing", () => {
    expect(rd("zc.js")).toContain("It works until the game is paid. It lasts 7 days, or until the game starts if that is later.");
    expect(rd("zc.js")).not.toContain("It works until the game is paid or for 7 days.");
    expect(rd("paylink.js")).toContain("until the game starts");
    expect(rd("paylink.js")).not.toContain("A payment link works for 7 days,");
    const sign = rd("pay.js").match(/Please sign in first[\s\S]{0,700}/)![0];
    expect(sign).toMatch(/payment link/i); expect(sign).toMatch(/no sign-in/i); // a finance person who landed here is told what to ask for
  });
});
