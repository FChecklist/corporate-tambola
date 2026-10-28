// The tiny claim signal (1.5.0): GET /api/z/<id>/cv answers a few digits that go up by one on every claim event (claimed, wrong, too late); it never changes who wins.
import { beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
setDefaultTimeout(60_000);
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { makeD1 } from "./d1-sqlite";
import { callTimeMs } from "../src/lifecycle";

const T = Date.UTC(2026, 9, 1, 10, 0, 0);
const roundAt = (ms: number) => Math.floor((ms / 1000 - 1692803367) / 3) + 1;
const START = roundAt(T) + 2400, AT = T + 2 * 3_600_000;
const P = { "x-organizer": "plat" };
let env: Env; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, now = T) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env, now);
const j = async (r: Response) => (await r.json()) as any;
const cv = async (id: string) => { const r = await call("GET", `/api/z/${id}/cv`, undefined, {}, AT); return { status: r.status, text: await r.text(), type: r.headers.get("content-type"), cache: r.headers.get("cache-control") }; };
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "http://localhost", PHONE_SALT: "salt" } as any; });

async function game(id: string) {
  expect((await call("POST", "/api/z", { id, startRound: START, callSeconds: 12, cap: 100 }, P)).status).toBe(200);
  raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(id);
  const pid = (await j(await call("POST", `/api/z/${id}/join`, { phone: "9810000001", name: "Asha" }))).pid as string;
  const e = raw.query("SELECT * FROM engagement WHERE id=?").get(id) as any;
  const at = [(await callTimeMs(env as any, e, 1, 0))!, (await callTimeMs(env as any, e, 1, 1))!, (await callTimeMs(env as any, e, 1, 2))!];
  return { pid, at };
}
const claim = (id: string, pid: string, pattern: string, idx: number, now: number) => call("POST", `/api/z/${id}/claims`, { pid, device: "0".repeat(32), claims: [{ pattern, idx }] }, {}, now);
const bogey = (id: string, pid: string, pattern: string, now: number) => call("POST", `/api/z/${id}/bogey`, { pid, device: "0".repeat(32), pattern }, {}, now);

const claimShort = (id: string, pid: string, pattern: string, idx: number, now: number, body?: string) =>
  handle(new Request(`http://x/api/z/${id}/claims`, { method: "POST", headers: { "content-type": "text/plain" }, body: body ?? `k|${pid}|${"0".repeat(32)}|${pattern}|${idx}|1` }), env, now);
describe("the short claim body (1.5.3)", () => {
  test("a claim in the short form is stored exactly like the JSON one (same answer, same signal), and the JSON form still works", async () => {
    const { pid, at } = await game("CV-S");
    const a = await claimShort("CV-S", pid, "top", 1, at[2]! - 500); const aj = await j(a); expect(a.status).toBe(200);
    expect((await cv("CV-S")).text).toBe("1");
    expect((raw.query("SELECT COUNT(*) c FROM claim WHERE eid='CV-S'").get() as any).c).toBe(1);
    const b = await claim("CV-S", pid, "top", 1, at[2]! - 400); expect(b.status).toBe(200); const bj = await j(b); expect(aj.stored).toBe(1); expect(bj.ok).toBe(true); expect(bj.stored).toBe(0); // the same claim in JSON: accepted, but already stored once
    expect((raw.query("SELECT COUNT(*) c FROM claim WHERE eid='CV-S'").get() as any).c).toBe(1);
  });
  test("damaged short bodies are refused, nothing is stored", async () => {
    const { pid, at } = await game("CV-T");
    for (const bad of ["k|", `k|${pid}|x|top|1`, `k|${pid}||top|-1|1`, `k|${pid}||TOP|1|1`, `k|${pid}||top|1|0`, `k||||||`]) expect((await claimShort("CV-T", pid, "top", 1, at[2]! - 500, bad)).status).toBe(400);
    expect((raw.query("SELECT COUNT(*) c FROM claim WHERE eid='CV-T'").get() as any).c).toBe(0);
  });
});

describe("the claim signal", () => {
  test("starts at 0, is a few digits of plain text, and may be cached for a second at the edge", async () => {
    const { } = await game("CV-A");
    const r = await cv("CV-A"); expect(r.status).toBe(200); expect(r.text).toBe("0"); expect(r.type).toMatch(/text\/plain/); expect(r.cache).toMatch(/s-maxage=1/);
  });
  test("+1 for a claim, +1 for a late claim, +1 for a wrong claim; a repeated claim adds nothing; the outcomes are the same as before", async () => {
    const { pid, at } = await game("CV-B");
    expect((await claim("CV-B", pid, "top", 1, at[2]! - 500)).status).toBe(200); expect((await cv("CV-B")).text).toBe("1");
    expect((await claim("CV-B", pid, "top", 1, at[2]! - 400)).status).toBe(200); expect((await cv("CV-B")).text).toBe("1"); // the same claim again: stored once, no new news
    expect((await claim("CV-B", pid, "mid", 1, at[2]!)).status).toBe(409); expect((await cv("CV-B")).text).toBe("2"); // too late: refused as always, and everybody may be told
    expect((await bogey("CV-B", pid, "bot", at[2]! + 1000)).status).toBe(200); expect((await cv("CV-B")).text).toBe("3");
  });
  test("a game with no claims never invents news; two games count separately", async () => {
    await game("CV-C"); const { pid, at } = await game("CV-D");
    await claim("CV-D", pid, "top", 0, at[1]! - 500);
    expect((await cv("CV-C")).text).toBe("0"); expect((await cv("CV-D")).text).toBe("1");
  });
});

describe("the seat and claim list is cached by the claim signal's number", () => {
  test("two phones that saw the same number get the same answer from the edge cache (no database read); a new number is a new address and fresh data; a request with a key is never cached", async () => {
    const store = new Map<string, { res: Response; until: number }>();
    (globalThis as any).caches = { default: { match: async (r: Request) => { const h = store.get(r.url); return h ? h.res.clone() : undefined; }, put: async (r: Request, res: Response) => { store.set(r.url, { res: res.clone(), until: 0 }); } } };
    try {
      const { pid, at } = await game("CV-S");
      let reads = 0; const base = env.DB.prepare.bind(env.DB); (env.DB as any).prepare = (sql: string) => { const st: any = base(sql); const b = st.bind.bind(st); st.bind = (...a: any[]) => { reads++; return b(...a); }; return st; };
      const get = (q: string, h: Record<string, string> = {}) => call("GET", `/api/z/CV-S/seats?${q}`, undefined, h, at[2]!);
      const r1 = await get("after=0&cafter=0&v=0"); expect(r1.status).toBe(200); const first = reads; expect(first).toBeGreaterThan(0);
      const r2 = await get("after=0&cafter=0&v=0"); expect(await r2.text()).toBe(await r1.text()); expect(reads).toBe(first); // served from the cache
      expect(r2.headers.get("cache-control")).toMatch(/s-maxage=3/);
      await claim("CV-S", pid, "top", 1, at[2]! - 300); // a claim: the number moves, so phones ask for v=1
      const r3 = await get("after=0&cafter=0&v=1"); const body3 = await r3.json() as any; expect(reads).toBeGreaterThan(first); expect((body3.claims ?? []).length).toBe(1); // new address: fresh, and it holds the claim
      const before = reads; await get("after=0&cafter=0&v=1", { "x-organizer": "plat" }); expect(reads).toBeGreaterThan(before); // a keyed request is never answered from the cache
    } finally { delete (globalThis as any).caches; }
  });
});
