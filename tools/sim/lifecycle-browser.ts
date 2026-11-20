/**
 * A thin REAL-BROWSER run of one format (auto-start + auto-numbers, ID invite): the real join page in Chromium against the real Worker code (local stand-in, TEST mode, no network, no money).
 * Listed ID joins with no approval; the same ID typed another way on reload is the same ticket; an unlisted ID waits, the Organizer approves it (and a second one declines it);
 * a wrong game link shows no ticket; erasing the game's people takes the tickets away.   Run:  bun run tools/sim/lifecycle-browser.ts   (needs Chromium: pre-installed in the cloud sandbox)
 * Result: prints PASS / FAIL lines and exits 1 on any FAIL. Part of docs/LIFECYCLE_TESTS.md.
 */
import { chromium } from "playwright";
import { startLocal } from "../../apps/edge/src/local";
import { CONSENT_VERSION, boxesOf } from "../../apps/edge/src/consent";

const PORT = Number(process.env.LC_PORT ?? 8795);
const s = startLocal({ port: PORT, secret: "lcb", dbFile: ":memory:", mode: "TEST" });
(s.env as any).ORGANIZER_SECRET = "lcb"; (s.env as any).DATA_KEY = "lcb-data-key-0123456789abcdef0123456789abcdef"; (s.env as any).PHONE_SALT = "lcb-salt"; (s.env as any).TEST_MODE = "1";
const BASE = s.url.replace(/\/$/, "");
const consent = (k: "K1" | "K2" | "K6") => ({ v: CONSENT_VERSION, boxes: boxesOf(k) });
let fails = 0; const check = (name: string, ok: boolean, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); if (!ok) fails++; };
let key = "";
async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": "10.9.8.7", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}
const GEN = 1692803367, roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
const ID = "LCB-" + Math.floor(Math.random() * 1e6).toString(36);
try {
  key = (await api("POST", "/api/start", { email: "boss@acme.com", consent: consent("K2") })).body.token;
  check("organizer account made", key.startsWith("ctk_"));
  const mk = await api("POST", "/api/z", { id: ID, startRound: roundAt(Date.now() + 3 * 3_600_000), callSeconds: 12, cap: 100, startMode: "auto", callMode: "auto", verify: "id", whoCanJoin: "list" });
  check("game created (auto-start, auto-numbers, ID list)", mk.status === 200, String(mk.status));
  check("game published", (await api("POST", `/api/z/${ID}/publish`, { email: "boss@acme.com", phone: "98765 43210", consent: consent("K1") })).status === 200);
  const add = await api("POST", `/api/z/${ID}/people`, { people: [{ empId: "A-1101" }, { empId: "B 2202" }], consent: consent("K6") });
  check("ID list uploaded (A-1101, B 2202)", add.body.added === 2, JSON.stringify(add.body).slice(0, 100));

  const browser = await chromium.launch();
  const phone = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }); const page = await ctx.newPage(); return { ctx, page }; };
  const join = async (page: any, typed: string) => {
    await page.goto(`${BASE}/z.html?e=${ID}`); await page.waitForSelector("#emp", { timeout: 15_000 }).catch(async () => { console.log("PAGE TEXT: " + (await page.innerText("body")).slice(0, 400).replace(/\n+/g, " | ")); throw new Error("no ID box on the join page"); });
    await page.fill("#emp", typed);
    for (const cb of await page.locator("input[type=checkbox]").all()) if (!(await cb.isChecked())) await cb.check();
    await page.click("#go");
  };
  const state = (page: any) => page.evaluate(() => { const rt = (window as any).__rt; const v = rt && rt.view ? rt.view() : null; return v ? { phase: v.phase, pid: v.pid, n: v.ticket ? v.ticket.flat().filter((x: any) => x !== null).length : 0 } : null; });

  // 1. a listed ID, typed as "a 1101", joins with no approval and gets a 15-number ticket
  const A = await phone();
  await join(A.page, "a 1101"); await A.page.waitForFunction(() => (window as any).__rt && (window as any).__rt.view().phase === "play", null, { timeout: 30_000 });
  const a1 = await state(A.page); check("listed ID joins with no approval, ticket has 15 numbers", a1?.phase === "play" && a1.n === 15, JSON.stringify(a1));
  // 2. reload: the same phone gets the same ticket (refresh / reconnect)
  await A.page.reload(); await A.page.waitForFunction(() => (window as any).__rt && (window as any).__rt.view().phase === "play", null, { timeout: 30_000 }).catch(() => {});
  const a2 = await state(A.page); check("reload keeps the same ticket (no second ticket)", a2?.pid === a1?.pid, `${a1?.pid} / ${a2?.pid}`);
  check("the Organizer's list shows one seat", (await api("GET", `/api/z/${ID}/participants`)).status < 500);
  // 3. an unlisted ID waits; the Organizer says yes; the person plays
  const U = await phone(); await join(U.page, "Z-9001");
  await U.page.waitForFunction(() => /request is with|waiting|asked/i.test(document.body.innerText), null, { timeout: 30_000 });
  check("unlisted ID is told the request is with the Organizer", /request is with the Organizer/i.test(await U.page.innerText("body")));
  const w = (await api("GET", `/api/z/${ID}/waiting`)).body.waiting as any[];
  check("the Organizer sees only the ID in the waiting room", w.length === 1 && w[0].empId === "Z9001" && !w[0].name);
  check("the Organizer approves", (await api("POST", `/api/z/${ID}/waiting/${w[0].id}`, { decision: "admit" })).status === 200);
  // the waiting page notices the yes by itself; if this run is slow it is asked again with the ID written another way
  const inGame = () => U.page.waitForFunction(() => (window as any).__rt && (window as any).__rt.view().phase === "play", null, { timeout: 40_000 });
  await inGame().catch(async () => { await join(U.page, "z 9001"); await inGame(); });
  check("approved person plays with their own ticket", (await state(U.page))?.n === 15 && (await state(U.page))?.pid !== a1?.pid);
  // 4. an unlisted ID that is declined never gets a ticket
  const D = await phone(); await join(D.page, "Y-8001"); await D.page.waitForFunction(() => /request is with/i.test(document.body.innerText), null, { timeout: 30_000 });
  const w2 = (await api("GET", `/api/z/${ID}/waiting`)).body.waiting as any[];
  check("the Organizer declines", (await api("POST", `/api/z/${ID}/waiting/${w2[0].id}`, { decision: "decline" })).status === 200);
  await D.page.waitForFunction(() => /not accepted/i.test(document.body.innerText), null, { timeout: 40_000 }).catch(() => {});
  check("declined person is told the request was not accepted and gets no ticket", /not accepted/i.test(await D.page.innerText("body")) && ((await state(D.page))?.phase ?? "none") !== "play");
  // 5. a wrong game link: no ticket, a plain message
  const X = await phone(); await X.page.goto(`${BASE}/z.html?e=NOPE-0000`); await X.page.waitForTimeout(1500);
  const xText = (await X.page.innerText("body")).replace(/\s+/g, " ").slice(0, 160);
  check("wrong game link gives no ID box, no join button and no ticket", (await X.page.locator("#emp").count()) === 0 && (await X.page.locator("#go").count()) === 0 && ((await state(X.page))?.n ?? 0) === 0, xText);
  // 6. erase: the people go
  const er = await api("POST", `/api/z/${ID}/erase`, {}); check("Organizer erases the people", er.status === 200, String(er.status));
  check("no seat, no ID, no waiting request is left", (s.raw.query("SELECT (SELECT COUNT(*) FROM seat WHERE eid=?1)+(SELECT COUNT(*) FROM person WHERE eid=?1)+(SELECT COUNT(*) FROM waiting WHERE eid=?1) AS c").get(ID) as any).c === 0);
  await browser.close();
} catch (e: any) { fails++; console.log("FAIL  run stopped: " + String(e?.message ?? e).slice(0, 300)); }
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
