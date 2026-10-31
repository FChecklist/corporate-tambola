// Organizer funnel (funnel.ts, owner order 31 Oct 2026): the steps, once per visit, the off switch, test accounts, day / week / total with drop-off, CSV, owner only.
import { beforeEach, describe, expect, test } from "bun:test";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import { FUN_STEPS, funnelCsv, funnelReport, funnelRows, recordFun, weekOf } from "../src/funnel";
import { resetRate } from "../src/visits";
import { setMode } from "../src/mode";
import { makeD1 } from "./d1-sqlite";

const DAY = 86_400_000;
const T = Date.UTC(2026, 9, 5, 10, 0, 0); // a Monday
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
let env: Env & Record<string, any>; let raw: ReturnType<typeof makeD1>["raw"];
beforeEach(() => { const d = makeD1(); raw = d.raw; resetRate(); env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000", PUBLIC_ORIGIN: "https://tambola.test", DATA_KEY: "data-key", TEST_MODE: "1" }; });
const beacon = (sid: string, vid: string, e: unknown[], now = T) => {
  const r = new Request("https://tambola.test/api/v/b", { method: "POST", headers: { origin: "https://tambola.test", "content-type": "text/plain", "cf-connecting-ip": "203.0.113.5", "user-agent": UA }, body: JSON.stringify({ s: sid, d: vid, lp: "/", r: "www.google.com", dv: "mobile", l: "en-IN", e }) });
  (r as any).cf = { country: "IN" };
  return handle(r, env as Env, now);
};
const sid = (n: number) => n.toString(16).padStart(24, "0"), vid = (n: number) => n.toString(16).padStart(32, "0");
const owner = (path: string, key = "plat", now = T + DAY) => handle(new Request("https://tambola.test" + path, { headers: key ? { "x-organizer": key } : {} }), env as Env, now);
const live = () => { env.TEST_MODE = ""; };
const q = (sql: string, ...a: any[]) => raw.prepare(sql).all(...a) as any[];

describe("the rows of one funnel", () => {
  test("every named step is there, in order, and the percentages follow the chain (pay_failed is a side branch)", () => {
    expect(FUN_STEPS.map((s) => s[0])).toEqual(["viewed", "size_chosen", "signup_started", "game_created", "game_published", "pay_page_reached", "pay_page_opened", "pay_link_copied", "pay_started", "pay_succeeded", "pay_failed", "game_started", "game_completed"]);
    const rows = funnelRows({ viewed: 200, size_chosen: 100, signup_started: 50, game_created: 25, pay_failed: 5, game_published: 10 });
    const by = Object.fromEntries(rows.map((r) => [r.step, r]));
    expect(by.size_chosen!.ofPrevious).toBe(50); expect(by.signup_started!.ofPrevious).toBe(50); expect(by.game_published!.ofPrevious).toBe(40); expect(by.game_published!.ofFirst).toBe(5);
    expect(by.pay_failed!.ofPrevious).toBeNull(); expect(by.viewed!.ofPrevious).toBeNull();
    expect(funnelRows({}).every((r) => r.count === 0 && r.ofFirst === null)).toBe(true);
  });
  test("a week starts on Monday", () => { expect(weekOf(T)).toBe("2026-10-05"); expect(weekOf(T + 6 * DAY)).toBe("2026-10-05"); expect(weekOf(T + 7 * DAY)).toBe("2026-10-12"); });
});

describe("recording a server step", () => {
  const link = async (n: number, org: string) => { expect((await beacon(sid(n), vid(n), [{ k: "pv", p: "/" }])).status).toBe(204); raw.prepare("UPDATE visit_session SET org=? WHERE sid=?").run(org, sid(n)); };
  test("a step is kept once per organizer visit, against the first visit; a second call changes nothing", async () => {
    live(); await link(1, "org1");
    await recordFun(env as any, "org1", "game_created", T); await recordFun(env as any, "org1", "game_created", T + 1000); await recordFun(env as any, "org1", "game_published", T + 2000);
    expect(q("SELECT name FROM visit_event WHERE kind='fn' ORDER BY id").map((r) => r.name)).toEqual(["game_created", "game_published"]);
  });
  test("FUNNEL_EVENTS=off writes nothing; a step the server does not own is refused; no organizer writes nothing", async () => {
    live(); await link(1, "org1");
    await recordFun({ ...env, FUNNEL_EVENTS: "off" } as any, "org1", "game_created", T); await recordFun(env as any, "org1", "size_chosen" as any, T); await recordFun(env as any, null, "game_created", T);
    expect(q("SELECT * FROM visit_event WHERE kind='fn'").length).toBe(0);
  });
  test("an organizer with no visit on record only raises an anonymous counter (no id, no address)", async () => {
    live(); await beacon(sid(9), vid(9), [{ k: "pv", p: "/" }]); // makes the tables
    await recordFun(env as any, "ghost", "pay_succeeded", T);
    const a = q("SELECT * FROM visit_agg WHERE dim='gpc_fun'"); expect(a.length).toBe(1); expect(a[0].k).toBe("pay_succeeded"); expect(a[0].n).toBe(1);
  });
  test("a test account is never counted", async () => {
    live(); await link(1, "org1");
    raw.prepare("INSERT INTO organizer_key(hash,org,kind,is_test,created_ms) VALUES('h','org1','master',1,1)").run();
    await recordFun(env as any, "org1", "game_created", T);
    expect(q("SELECT * FROM visit_event WHERE kind='fn'").length).toBe(0);
  });
});

describe("the report: day, week, total, drop-off, CSV, owner only", () => {
  const seed = async () => {
    live();
    // visitor 1: Monday, chose a size, started sign-up, created, published; visitor 2: Monday, only looked; visitor 3: next Monday, chose a size and opened the payment page
    await beacon(sid(1), vid(1), [{ k: "pv", p: "/" }, { k: "act", p: "/", n: "pack", num: 50 }, { k: "act", p: "/", n: "start_open" }]);
    await beacon(sid(2), vid(2), [{ k: "pv", p: "/" }]);
    await beacon(sid(3), vid(3), [{ k: "pv", p: "/" }, { k: "act", p: "/", n: "pack", num: 100 }, { k: "pv", p: "/pay" }], T + 7 * DAY);
    raw.prepare("UPDATE visit_session SET org='org1' WHERE sid=?").run(sid(1));
    await recordFun(env as any, "org1", "game_created", T); await recordFun(env as any, "org1", "game_published", T);
  };
  test("counts per step for the total, each day and each week, with the drop-off and where visitors came from", async () => {
    await seed();
    const r = await funnelReport(env as any, T - DAY, T + 10 * DAY);
    const t = Object.fromEntries(r.total.map((x) => [x.step, x]));
    expect(t.viewed!.count).toBe(3); expect(t.size_chosen!.count).toBe(2); expect(t.signup_started!.count).toBe(1); expect(t.game_created!.count).toBe(1); expect(t.game_published!.count).toBe(1); expect(t.pay_page_opened!.count).toBe(1);
    expect(t.size_chosen!.ofPrevious).toBe(66.7); expect(t.signup_started!.ofPrevious).toBe(50);
    expect(r.days.map((d) => d.period)).toEqual(["2026-10-05", "2026-10-12"]); expect(r.weeks.map((w) => w.period)).toEqual(["2026-10-05", "2026-10-12"]);
    expect(r.days[0]!.rows.find((x) => x.step === "viewed")!.count).toBe(2); expect(r.weeks[1]!.rows.find((x) => x.step === "size_chosen")!.count).toBe(1);
    expect(r.sources[0]!.k).toBeTruthy(); expect(r.countries[0]).toMatchObject({ k: "IN", viewed: 3 }); expect(r.devices[0]!.k).toBe("mobile");
    expect(JSON.stringify(r)).not.toMatch(/203\.0\.113|org1/);
  });
  test("the CSV has one line per scope, period and step", async () => {
    await seed(); const csv = funnelCsv(await funnelReport(env as any, T - DAY, T + 10 * DAY)).trim().split("\n");
    expect(csv[0]).toBe("scope,period,step,label,count,percent_of_previous,percent_of_first");
    expect(csv.length).toBe(1 + FUN_STEPS.length * (1 + 2 + 2)); expect(csv).toContain("total,all,viewed,Page viewed,3,,100");
  });
  test("the route is owner only (404 for anyone else), JSON or CSV, and a test-mode visit never shows in live numbers", async () => {
    await seed();
    expect((await owner("/api/owner/funnel", "")).status).toBe(404); expect((await owner("/api/owner/funnel", "wrong")).status).toBe(404);
    const j = (await (await owner("/api/owner/funnel?from=2026-10-01&to=2026-10-31")).json()) as any; expect(j.total[0].count).toBe(3);
    const c = await owner("/api/owner/funnel?from=2026-10-01&to=2026-10-31&format=csv"); expect(c.headers.get("content-type")).toContain("text/csv"); expect((await c.text()).startsWith("scope,period,step")).toBe(true);
    await setMode(env as any, "TEST", "test", T); await beacon(sid(7), vid(7), [{ k: "pv", p: "/" }]);
    const j2 = (await (await owner("/api/owner/funnel?from=2026-10-01&to=2026-10-31")).json()) as any; expect(j2.total[0].count).toBe(3);
  });
});
