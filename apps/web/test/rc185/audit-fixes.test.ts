// rc/tambola-1.8.5 audit fixes, page side: B (guide.js has no template text; real server strings are guided), C (the employee-ID card), E (the "read as" hint under the ID box),
// F (the calm page says who plays), G (z.js uses endedAtMs), H (the "Which ID?" group only where it has an effect).
// The real pages run in a DOM against the real Worker where a page needs the server. Test addresses: demoN@demo-test.invalid only.
// Run: bun test --isolate apps/web/test/rc185/audit-fixes.test.ts
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { newWorld, openPage, type Page } from "../harness";
import { PUB } from "../storage-scan";
import { organizer, published, phone, setVal, endedView, endMs, realPid, NEW_AT, roundAt, roundMs, LOG, CALL_S, type O } from "./page";
import { lifecycleTick } from "../../../edge/src/lifecycle";
import { PRIZE_HOUSES } from "../../../../packages/beacon/src/config";

setDefaultTimeout(90_000);
const MIN = 60_000;
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });
const guidePage = async () => { const w = newWorld({ DATA_KEY: "k" }); const p = await openPage(w.world, { url: "http://localhost/pricing.html", html: "pricing.html", scripts: ["guide.js"] }); open.push(p); return p; };

// ------------------------------------------------------------------------------------------------ B
describe("B: guide.js holds the sentences the server really sends, and no template text", () => {
  test("guide.js contains no '${' at all (a template hole in a plain string never matched anything)", () => {
    const g = readFileSync(join(PUB, "guide.js"), "utf8");
    expect(g.split("${").length - 1).toBe(0);
    expect(g).not.toContain("idWord(");
  });
  test("every need-id sentence the REAL Worker sends (employee ID and Email ID games; ID only, either, both) is matched by a guide entry, with a title and steps", async () => {
    const seen = new Set<string>();
    for (const [mode, kind] of [["id", "emp"], ["id", "email"], ["either", "emp"], ["either", "email"], ["both", "emp"], ["both", "email"]] as const) {
      const o = await organizer(NEW_AT); const id = `RC-G${mode}${kind}`.toUpperCase();
      await published(o, id, { verify: mode, employeesOnly: true, ...(kind === "email" ? { idKind: "email" } : {}) });
      const r = await o.api("POST", `/api/z/${id}/join`, { name: "Asha", device: "0a" + "b".repeat(30) }); const b = await o.json(r);
      expect([mode, kind, r.status, b.code]).toEqual([mode, kind, 400, "need-id"]);
      seen.add(String(b.error));
    }
    // what the Worker really said, so the test can not drift from the product
    expect([...seen].sort()).toEqual([
      "Enter your Email ID and your mobile number.", "Enter your Email ID.", "Enter your employee ID and your mobile number.", "Enter your employee ID.",
      "Enter your mobile number or your Email ID.", "Enter your mobile number or your employee ID.",
    ]);
    const CTG = (await guidePage()).win.CTG;
    for (const msg of seen) {
      const f = CTG.find({ status: 400, message: msg }); expect([msg, f.matched]).toEqual([msg, true]);
      const g = CTG.explain({ status: 400, message: msg }); expect([msg, g.matched, g.title.length > 8, g.steps.length > 0]).toEqual([msg, true, true, true]);
      expect(JSON.stringify(g)).not.toContain("${");
    }
  });
  test("the Email ID sentences get the Email ID card; the employee ID sentences get the employee ID card", async () => {
    const CTG = (await guidePage()).win.CTG;
    for (const m of ["Enter your Email ID.", "Enter your mobile number or your Email ID."]) expect([m, CTG.explain({ status: 400, message: m }).title]).toEqual([m, "Please check the email ID"]);
    for (const m of ["Enter your employee ID.", "Enter your mobile number or your employee ID."]) expect([m, CTG.explain({ status: 400, message: m }).title]).toEqual([m, "Your employee ID is needed"]);
  });
  test("an unrelated 'Enter your ...' sentence is NOT swallowed by the ID cards (the old template text normalised to 'enter your' and matched them all)", async () => {
    const CTG = (await guidePage()).win.CTG;
    const f = CTG.find({ status: 400, message: "Enter your favourite colour." });
    expect([f.matched, f.entry.t === "Please check the email ID" || f.entry.t === "Your employee ID is needed"]).toEqual([false, false]);
  });
});

// ------------------------------------------------------------------------------------------------ C
describe("C: the guide card for 'This looks like an Email ID. This game asks for an employee ID...'", () => {
  const MSG = "This looks like an Email ID. This game asks for an employee ID: letters and numbers only.";
  test("it is its own card: it tells the person to type their employee ID (letters and numbers), not an email, and points at the employee ID box", async () => {
    const CTG = (await guidePage()).win.CTG; const g = CTG.explain({ status: 400, message: MSG });
    expect([g.matched, g.title]).toEqual([true, "This game asks for an employee ID, not an email"]);
    const steps = g.steps.join(" ").toLowerCase();
    expect(steps).toContain("type your employee id"); expect(steps).toContain("letters and numbers"); expect(steps).toContain("do not type your email");
    expect(g.steps.some((x: string) => /^type your (email|e-mail)/i.test(x))).toBe(false); expect(steps).not.toContain("check the email id");
    expect(g.go.field).toBe("#emp");
  });
  test("the Email ID card (a game that asks for an Email ID) no longer claims this sentence, and still guides 'Please check your Email ID. It looks incomplete.'", async () => {
    const CTG = (await guidePage()).win.CTG;
    expect(CTG.explain({ status: 400, message: MSG }).title).not.toBe("Please check the email ID");
    expect(CTG.explain({ status: 400, message: "Please check your Email ID. It looks incomplete." }).title).toBe("Please check the email ID");
  });
  test("the sentence the real Worker sends for an email typed in an employee-ID game is the one the card matches", async () => {
    const o = await organizer(NEW_AT); await published(o, "RC-GC1", { verify: "id", employeesOnly: true });
    const r = await o.api("POST", "/api/z/RC-GC1/join", { name: "Asha", empId: "demo1@demo-test.invalid", device: "0a" + "b".repeat(30) }); const b = await o.json(r);
    expect([r.status, b.code]).toEqual([400, "bad-id"]);
    const g = (await guidePage()).win.CTG.explain({ status: 400, message: b.error }); expect([g.matched, g.title]).toEqual([true, "This game asks for an employee ID, not an email"]);
  });
});

// ------------------------------------------------------------------------------------------------ E
describe("E: the hint p#empread sits directly under the ID box in every verify mode, as one aria-live region", () => {
  const landing = async (o: O, id: string) => { const p = await phone(o, `/z?e=${id}`); open.push(p); await p.waitFor((t) => /Join the game|Join/.test(t) && !!p.$("#go"), 30_000); return p; };
  for (const [mode, kind] of [["id", "emp"], ["either", "emp"], ["both", "emp"], ["id", "email"], ["either", "email"], ["both", "email"]] as const) {
    test(`verify '${mode}', ${kind} game: #empread is the element right after #emp, one aria-live="polite" region, the box points at it, and typing updates it`, async () => {
      const o = await organizer(NEW_AT); const id = `RC-E${mode}${kind}`.toUpperCase(); await published(o, id, { verify: mode, employeesOnly: mode !== "either", ...(kind === "email" ? { idKind: "email" } : {}) });
      const p = await landing(o, id); const doc = p.win.document;
      const emp = p.$("#emp") as any, read = p.$("#empread") as any;
      expect(emp).toBeTruthy(); expect(read).toBeTruthy();
      expect(emp.nextElementSibling?.id ?? null).toBe("empread"); expect(emp.nextElementSibling === read).toBe(true); // ids and booleans only: a failed DOM comparison would print the whole page
      expect(doc.querySelectorAll("#empread").length).toBe(1); expect(doc.querySelectorAll("[id='empread']").length).toBe(1);
      expect(read.getAttribute("aria-live")).toBe("polite"); expect(emp.getAttribute("aria-describedby")).toBe("empread");
      expect(doc.querySelectorAll('[aria-live="polite"]#empread').length).toBe(1);
      expect(read.textContent).toBe("");
      if (kind === "emp") { setVal(p, "#emp", "1b-678"); expect(read.textContent).toBe("The system will read this as 1B678"); }
      else { setVal(p, "#emp", " DEMO1 @Demo-Test.invalid "); expect(read.textContent).toBe("The system will read this as demo1@demo-test.invalid"); }
      expect(p.$("#empread") === read).toBe(true); // the same node was updated: one live region, not a new one per key
      expect((p.$(".zphone") as any).querySelector("#empread") === null).toBe(true); expect((p.$(".zphone") as any).nextElementSibling?.id).not.toBe("empread"); // the mobile number box has no hint of its own
    });
  }
  test("a mobile-number game has no ID box and no hint (nothing is left behind under the phone box)", async () => {
    const o = await organizer(NEW_AT); await published(o, "RC-EMOB"); const p = await landing(o, "RC-EMOB");
    expect(p.$("#emp") === null).toBe(true); expect(p.$("#empread") === null).toBe(true);
  });
  test("employee-ID game: an email in the box gets no 'read as' hint at all (never an email turned into letters)", async () => {
    const o = await organizer(NEW_AT); await published(o, "RC-EMAIL1", { verify: "id", employeesOnly: true }); const p = await landing(o, "RC-EMAIL1");
    for (const typed of ["demo1@demo-test.invalid", "demo1＠demo-test.invalid", "x@y"]) { setVal(p, "#emp", typed); expect([typed, (p.$("#empread") as any).textContent]).toEqual([typed, ""]); }
  });
});

// ------------------------------------------------------------------------------------------------ F and G (z.js, the calm page)
describe("F: the calm 'Game completed' page says the true thing about who plays", () => {
  const eid = "RC-FDONE";
  // 30 Oct 2026, 06:00 UTC: after the 1.8.0 rules (so a game with no list is OPEN) and after the check-in date (the calm page is drawn before the check-in)
  const AT = Date.UTC(2026, 9, 30, 6, 0, 0);
  async function calm(over: Record<string, unknown>, list: boolean) {
    const o = await organizer(AT); await published(o, eid, {}, over);
    if (list) await o.api("POST", `/api/z/${eid}/people`, { people: [{ name: "Asha", phone: "9812345678" }] }, o.token);
    // someone who opens the shared link after the game and never joined (a phone that joined but never checked in is held at the check-in screen, so it never reaches this page)
    const info = await o.json(await o.api("GET", `/api/z/${eid}/info`));
    const sched = roundAt(AT) + 1200;
    o.world.now = roundMs(sched) + LOG.length * CALL_S * 1000 + 45 * MIN; // 45 minutes after the end the page works out
    const p = await phone(o, `/z?e=${eid}`, { patch: endedView({ pid: null, scheduledRound: sched }) }); open.push(p);
    await p.waitFor((t) => /Game completed/.test(t), 30_000);
    return { p, info };
  }
  test("an OPEN game (anyone with the organizer's link can join): 'played in groups, with a link from the organizer: company teams and their families'", async () => {
    const { p, info } = await calm({}, false); expect(info.open).toBe(true);
    const t = (p.$("#zshare") as any).textContent;
    expect(t).toContain("Corporate Tambola is played in groups, with a link from the organizer: company teams and their families. Enjoyed it? Recommend it to others.");
    expect(t).not.toContain("by invitation only"); expect(t).not.toContain("close groups");
  });
  test("an INVITATION game (a list): 'played in close groups, by invitation only: company teams and their families'", async () => {
    const { p, info } = await calm({ whoCanJoin: "list" }, true); expect(info.open).toBe(false);
    const t = (p.$("#zshare") as any).textContent;
    expect(t).toContain("Corporate Tambola is played in close groups, by invitation only: company teams and their families. Enjoyed it? Recommend it to others.");
    expect(t).not.toContain("with a link from the organizer");
  });
});

describe("G: z.js takes the end time from the server's endedAtMs, and falls back to its own estimate without it", () => {
  const eid = "RC-GEND";
  /** A game whose phone page is opened `mins` minutes after the ESTIMATED end (start + numbers called x seconds). `life` is the server's real end, relative to that estimate (minutes), or null for none.
   *  With `life` null the Worker must really have no end to give (R-end: a scheduled end is returned only once now >= the recomputed bound), so the clock stays BEFORE the bound and the page's estimate is moved (scheduledRound) to lie `mins` before that clock. */
  async function opened(mins: number, life: number | null) {
    const o = await organizer(); await published(o, eid); const pid = await realPid(o, eid);
    let patch: Record<string, unknown> = {};
    if (life !== null) { o.world.raw.prepare("INSERT INTO life(eid,end_ms,end_src) VALUES(?,?,'phones')").run(eid, endMs() + life * MIN); o.world.now = endMs() + mins * MIN; }
    else {
      const bound = (await o.json(await o.api("GET", `/api/z/${eid}/info`, undefined, undefined, endMs() + 48 * 3600_000))).endedAtMs as number;
      o.world.now = bound - 5 * MIN; // one fixed fake clock for the Worker and the page: before the real bound
      patch = { scheduledRound: roundAt(o.world.now - mins * MIN - LOG.length * CALL_S * 1000) }; // estimate end = now - mins
    }
    const info = await o.json(await o.api("GET", `/api/z/${eid}/info`, undefined, undefined, o.world.now));
    const p = await phone(o, `/z?e=${eid}`, { patch: endedView({ pid, ...patch }) }); open.push(p);
    await p.waitFor((t) => /Game completed|Thank you for playing|This game is now over/.test(t), 30_000);
    return { p, info };
  }
  test("no endedAtMs from the server: the estimate decides (40 minutes after the estimate: calm page; 10 minutes: results)", async () => {
    const a = await opened(40, null); expect(a.info).not.toHaveProperty("endedAtMs"); expect(a.p.$("#gamedone")).toBeTruthy(); expect(!!a.p.$("#finalresults")).toBe(false);
    const b = await opened(10, null); expect(!!b.p.$("#gamedone")).toBe(false); expect(b.p.$("#finalresults")).toBeTruthy();
  });
  test("endedAtMs later than the estimate (a longer game): opened 40 minutes after the estimate but only 20 after the true end -> the results are still shown", async () => {
    const a = await opened(40, 20); expect(a.info.endedAtMs).toBe(endMs() + 20 * MIN);
    expect(!!a.p.$("#gamedone")).toBe(false); expect(a.p.$("#finalresults")).toBeTruthy();
  });
  test("endedAtMs earlier than the estimate: opened 10 minutes after the estimate but 70 after the true end -> the calm page", async () => {
    const a = await opened(10, -60); expect(a.info.endedAtMs).toBe(endMs() - 60 * MIN);
    expect(a.p.$("#gamedone")).toBeTruthy(); expect(!!a.p.$("#finalresults")).toBe(false);
  });
  test("the 30-minute edge follows endedAtMs, not the estimate: 29 minutes after the true end shows results, 31 the calm page", async () => {
    const a = await opened(100, 71); expect(!!a.p.$("#gamedone")).toBe(false); expect(a.p.$("#finalresults")).toBeTruthy();
    const b = await opened(100, 69); expect(b.p.$("#gamedone")).toBeTruthy();
  });
  test("z.js source: endMsOf returns INFO.endedAtMs when it is a positive number, and the INFO value is kept once", () => {
    const z = readFileSync(join(PUB, "z.js"), "utf8");
    expect(z).toContain("const endMsOf = (v) => INFO.endedAtMs > 0 ? INFO.endedAtMs :");
    expect(z).toContain("if (Number(r.endedAtMs) > 0 && !INFO.endedAtMs) INFO.endedAtMs = Number(r.endedAtMs);");
  });
});

describe("G2: the Worker's endedAtMs in /info: a phone-confirmed end always, a scheduled end only once it has passed, and a returned value never moves", () => {
  const eid = "RC-GLIFE";
  const lifeRow = (o: O) => o.world.raw.prepare("SELECT end_ms, end_src FROM life WHERE eid=?").get(eid) as { end_ms: number; end_src: string };
  const infoAt = async (o: O, at: number) => o.json(await o.api("GET", `/api/z/${eid}/info`, undefined, undefined, at));
  /** A paid game with one joined person, on the fixed clock NEW_AT. Returns the organizer, its key and the real start time. */
  async function game() {
    const o = await organizer(NEW_AT); await published(o, eid); o.world.raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run(eid);
    await realPid(o, eid);
    const start = roundMs((o.world.raw.prepare("SELECT start_round r FROM engagement WHERE id=?").get(eid) as { r: number }).r);
    return { o, start };
  }
  test("a scheduled end that has not passed: no endedAtMs, at the start, in the middle and one second before it, even after the minute-by-minute tick wrote it down", async () => {
    const { o, start } = await game();
    await lifecycleTick(o.world.env as any, NEW_AT + 1000);
    const r = lifeRow(o); expect(r.end_src).toBe("schedule"); expect(r.end_ms).toBeGreaterThan(start);
    for (const at of [NEW_AT + 2000, start, start + 10 * MIN, r.end_ms - 1000]) expect(await infoAt(o, at)).not.toHaveProperty("endedAtMs");
  });
  test("a scheduled end that has passed: endedAtMs is exactly the stored end, and it never changes (later looks, later ticks)", async () => {
    const { o, start } = await game();
    await lifecycleTick(o.world.env as any, NEW_AT + 1000); const r = lifeRow(o);
    const a = (await infoAt(o, r.end_ms)).endedAtMs; expect(a).toBe(r.end_ms); // the very moment it has passed
    for (const at of [r.end_ms + 1000, r.end_ms + 5 * MIN, start + 5 * 3_600_000]) { await lifecycleTick(o.world.env as any, at); expect((await infoAt(o, at)).endedAtMs).toBe(a); }
    expect(lifeRow(o).end_ms).toBe(a);
  });
  test("a break added later does not make a returned value move, and does not create one before the end", async () => {
    const { o, start } = await game();
    await lifecycleTick(o.world.env as any, NEW_AT + 1000); const first = lifeRow(o).end_ms;
    const brk = { breaks: [{ kind: "speech", title: "Short talk", text: "hello", after: 3, seconds: 60 }] };
    expect((await o.api("PATCH", `/api/z/${eid}/settings`, brk, o.token, NEW_AT + 3000)).status).toBe(200); // before the game: the scheduled end may move, and nothing is shown
    await lifecycleTick(o.world.env as any, NEW_AT + 4000);
    expect(await infoAt(o, NEW_AT + 5000)).not.toHaveProperty("endedAtMs");
    const moved = lifeRow(o).end_ms; expect(moved).toBeGreaterThanOrEqual(first);
    const late = moved + 10 * MIN; const a = (await infoAt(o, late)).endedAtMs; expect(a).toBe(moved);
    const again = await o.api("PATCH", `/api/z/${eid}/settings`, { breaks: [{ kind: "speech", title: "Another", text: "hi", after: 5, seconds: 600 }] }, o.token, late + 1000); // after the end: refused or ignored, either way the value stays
    await lifecycleTick(o.world.env as any, late + 2000);
    expect([again.status, (await infoAt(o, late + 3000)).endedAtMs, lifeRow(o).end_ms]).toEqual([again.status, a, a]);
    expect(start).toBeLessThan(a);
  });
  test("a phone-confirmed end is shown at once, even before the scheduled time, and the later schedule or tick never changes it", async () => {
    const { o, start } = await game();
    await lifecycleTick(o.world.env as any, NEW_AT + 1000); const sched = lifeRow(o).end_ms;
    const voted = start + 8 * MIN; expect(voted).toBeLessThan(sched);
    o.world.raw.prepare("UPDATE life SET end_ms=?, end_src='phones' WHERE eid=?").run(voted, eid);
    for (const at of [voted - 5 * MIN, voted, voted + 1000, sched - 1000]) expect((await infoAt(o, at)).endedAtMs).toBe(voted); // whatever the clock says
    await lifecycleTick(o.world.env as any, sched + MIN); await lifecycleTick(o.world.env as any, sched + 3_600_000);
    expect((await infoAt(o, sched + 3_700_000)).endedAtMs).toBe(voted); expect(lifeRow(o)).toEqual({ end_ms: voted, end_src: "phones" });
  });
  test("a cancelled game never carries endedAtMs", async () => {
    const { o, start } = await game();
    const c = await o.api("POST", `/api/z/${eid}/cancel`, { confirmations: 3 }, o.token, NEW_AT + 1000); expect(c.status).toBe(200); // a real cancel before the start (R-end: 'cancel' is not an end)
    await lifecycleTick(o.world.env as any, NEW_AT + 60_000);
    expect(await infoAt(o, start + 5 * 3_600_000)).not.toHaveProperty("endedAtMs");
  });
});

// ------------------------------------------------------------------------------------------------ H
describe("H: the 'Which ID?' radio group (new organizer console, Step 2) shows only where an ID is asked at the door", () => {
  const src = ["zc-flow-game.js", "pack/zc-flow.js", "zc-flow-tambola.js"].map((f) => readFileSync(join(PUB, f), "utf8")).join("\n");
  const COPY = "The ID your people type to join. An Email ID is read in lower case. Older games keep the way they always read an employee ID.";
  const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
  /** Step 2 of the new console with a saved game whose GET /summary says `summary` (null = the call fails). */
  async function step2(summary: Record<string, unknown> | null, eid = "EABCDEF", hold = false, draws = 3) {
    let release: () => void = () => {}; const gate = hold ? new Promise<void>((r) => { release = r; }) : null; // hold: the summary answers only when the test lets it
    const calls: { url: string; method: string; body: any }[] = [];
    const win: any = new Window({ url: `http://localhost/zc.html?flow=new${eid ? "&e=" + eid : ""}` });
    win.document.body.innerHTML = '<main id="app"></main>';
    win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000), PRIZE_HOUSES };
    const fakeFetch = async (url: string, o: any = {}) => {
      calls.push({ url, method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null });
      if (/\/summary$/.test(url) && (o.method || "GET") === "GET") { if (gate) await gate; if (!summary) throw new Error("offline"); return { ok: true, json: async () => summary }; }
      return { ok: true, json: async () => (url.includes("ai-manifest") ? { packs: [{ upTo: 100, inr: 2399 }, { upTo: 250, inr: 3499 }] } : { ok: true }) };
    };
    new Function("window", "document", "location", "fetch", "MutationObserver", src)(win, win.document, win.location, fakeFetch, win.MutationObserver);
    const s = win.ZFLOW.state; if (eid) s.eid = eid; s.done[1] = true; s.open = 2; for (let i = 0; i < draws; i++) { win.ZFLOW.draw(); await tick(); }
    return { win, d: win.document, calls, release };
  }
  for (const verify of ["id", "either", "both"]) {
    test(`a game that asks for an ID (verify '${verify}'): the group is there, with Employee ID (default) and Email ID, and the true copy`, async () => {
      const { win, d, calls } = await step2({ verify });
      const g = d.getElementById("zt-idkind"); expect(g).toBeTruthy(); expect(g.getAttribute("role")).toBe("radiogroup"); expect(g.getAttribute("aria-label")).toBe("Which ID?");
      expect([...g.querySelectorAll("input[type=radio]")].map((r: any) => r.value)).toEqual(["emp", "email"]);
      expect(g.querySelector("input[value=emp]").hasAttribute("checked")).toBe(true);
      expect(g.querySelector("p").textContent).toBe(COPY);
      expect(g.textContent).not.toContain("one plain form");
      expect(d.querySelectorAll("#zt-idkind").length).toBe(1);
      const reads = () => calls.filter((c) => /\/summary$/.test(c.url) && c.method === "GET").length, n = reads();
      win.ZFLOW.draw(); await tick(); win.ZFLOW.draw(); await tick(); expect(reads()).toBe(n); // drawing again never reads the game again (read once)
      expect(d.querySelectorAll("#zt-idkind").length).toBe(1);
    });
  }
  test("the saved game is asked ONCE even when the page draws again before the answer has come (1 draw and 6 draws, call still open: the same number of reads)", async () => {
    const reads = (calls: { url: string; method: string }[]) => calls.filter((c) => /\/summary$/.test(c.url) && c.method === "GET").length;
    const one = await step2({ verify: "id" }, "EABCDEF", true, 1), many = await step2({ verify: "id" }, "EABCDEF", true, 6);
    expect(reads(many.calls)).toBe(reads(one.calls));
    expect(many.d.getElementById("zt-idkind") === null).toBe(true); // not answered yet: no group yet
    many.release(); one.release(); await tick(); many.win.ZFLOW.draw(); await tick();
    expect(many.d.getElementById("zt-idkind") === null).toBe(false);
  });
  test("a mobile-number game (verify 'mobile'): no group at all, and the game is not read again at every draw", async () => {
    const { win, d, calls } = await step2({ verify: "mobile" });
    const reads = () => calls.filter((c) => /\/summary$/.test(c.url) && c.method === "GET").length, n = reads();
    win.ZFLOW.draw(); await tick(); win.ZFLOW.draw(); await tick(); expect(reads()).toBe(n); expect(d.getElementById("zt-idkind") === null).toBe(true); expect(d.querySelector('input[name="zt-idkind"]') === null).toBe(true); expect(d.getElementById("app").textContent).not.toContain("Which ID?");
  });
  test("an older game whose summary has no verify at all: no group", async () => {
    const { d } = await step2({ ok: true }); expect(d.getElementById("zt-idkind") === null).toBe(true);
  });
  test("the summary cannot be read (offline): no group, and the page still works", async () => {
    const { d } = await step2(null); expect(d.getElementById("zt-idkind") === null).toBe(true); expect(d.getElementById("app").textContent.length).toBeGreaterThan(100);
  });
  test("no saved game yet (no game ID): nothing is asked of the server and there is no group", async () => {
    const { d, calls } = await step2({ verify: "id" }, ""); expect(d.getElementById("zt-idkind") === null).toBe(true); expect(calls.filter((c) => /\/summary$/.test(c.url)).length).toBe(0);
  });
  test("choosing Email ID sends one PATCH {idKind:'email'} to the game's settings; choosing nothing sends no idKind", async () => {
    const { win, d, calls } = await step2({ verify: "id" });
    expect(calls.filter((c) => c.method === "PATCH" && c.body && "idKind" in c.body).length).toBe(0);
    const r = d.querySelector('input[name="zt-idkind"][value="email"]'); r.checked = true; r.dispatchEvent(new win.Event("change")); await tick();
    const sent = calls.filter((c) => c.method === "PATCH" && c.body && "idKind" in c.body);
    expect(sent.length).toBe(1); expect(sent[0]!.url).toBe("/api/z/EABCDEF/settings"); expect(sent[0]!.body.idKind).toBe("email");
    expect(win.ZTAMBOLA.RUN.idKind).toBe("email"); expect(win.ZTAMBOLA.RUN.idTouched).toBe(true);
  });
});
